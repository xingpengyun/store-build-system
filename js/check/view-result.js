/* ==========================================================
   view-result.js — 核对结果
   ----------------------------------------------------------
   三条底线：
   1. 每一行都能点开看到 A/B 两侧的原始行（含原始行号）
   2. 人工处理只写 manual / overrides，绝不改动原始金额
   3. 改完匹配关系后重跑的是「装配」，不重新解析 Excel
   ========================================================== */
(function () {
  'use strict';

  var U = window.CKUtil;
  var UI = window.CKUI;
  var DB = window.CKDB;
  var App = window.CKApp;

  var SIZES = [50, 100, 200];

  function st() { return App.state; }
  function active() { return App.getActiveResult(); }

  /* 当前展示的结果是哪种模式。历史记录里没写 mode 的一律按对账模式看（老数据） */
  function modeOf() {
    var a = active();
    var m = a && a.meta && a.meta.mode;
    if (m === 'threshold') return 'threshold';
    if (m === 'shipping') return 'shipping';
    return 'recon';
  }
  function isThreshold() { return modeOf() === 'threshold'; }
  function isShipping() { return modeOf() === 'shipping'; }

  /* ---------------- 筛选 / 排序 ---------------- */

  /* 去掉重复门店：每家店只保留一条 —— 按状态优先级挑「最需要处理」的那条
     （待确认 > 未找到 > 未达标 > 达标），同分的保留先出现的。
     详情抽屉里仍能看到这家店的全部订货与登记，不影响核对。 */
  function dedupByStore(rows) {
    var RANK = { confirm: 0, 'unmatched-a': 1, 'unmatched-b': 1, diff: 2, fail: 2, ok: 3, pass: 3 };
    var byStore = Object.create(null);
    var order = [];
    rows.forEach(function (r) {
      var k = r.aKey || r.storeKey || r.storeName;
      var prev = byStore[k];
      if (!prev) { byStore[k] = r; order.push(k); return; }
      var pa = RANK[prev.status] === undefined ? 9 : RANK[prev.status];
      var pb = RANK[r.status] === undefined ? 9 : RANK[r.status];
      if (pb < pa) byStore[k] = r;
    });
    return order.map(function (k) { return byStore[k]; });
  }

  /* 状态筛选 + 搜索（计数和表格共用这一条管线，保证标签数量 = 表格行数）
     门槛模式的口径（z240）：只有三个筛选 —— 全部 / 达标 / 异常。
     达标 = 干净达标（订够门槛 且 B 表也登记上）；
     异常 = 其余全部（未达标 / 仓库未对应 / 清单外 / 待确认 …），三者恒满足 全部 = 达标 + 异常。 */
  function baseRows(rows, keepAllStatuses) {
    var out = st().resultDedup ? dedupByStore(rows) : rows;
    var f = st().resultFilter;
    /* 门槛模式只剩 all/pass/abnormal 三档，旧值（fail/unmatched-b…）一律回 all */
    if (isThreshold() && f !== 'all' && f !== 'pass' && f !== 'abnormal') f = 'all';
    var q = (st().resultSearch || '').trim().toLowerCase();

    if (!keepAllStatuses) {
      out = out.filter(function (r) {
        if (f === 'all') return true;
        if (f === 'abnormal') return !(r.status === 'pass' && !r.notInB);
        if (isThreshold() && f === 'pass') return r.status === 'pass' && !r.notInB;
        if (f === 'unmatched') return r.status === 'unmatched-a' || r.status === 'unmatched-b' || r.notInB;
        if (f === 'unmatched-a') return r.status === 'unmatched-a' || (r.status === 'pass' && r.notInB);
        if (f === 'unmatched-b') return r.status === 'unmatched-b';
        if (f === 'dup') return !!r.isDup;
        if (f === 'manual') return !!(r.manual && (r.manual.confirmed || r.manual.label));
        return r.status === f;
      });
    }

    if (q) {
      out = out.filter(function (r) {
        return (r.storeName || '').toLowerCase().indexOf(q) >= 0 ||
          (r.aRawName || '').toLowerCase().indexOf(q) >= 0 ||
          (r.bRawName || '').toLowerCase().indexOf(q) >= 0 ||
          (r.sheet || '').toLowerCase().indexOf(q) >= 0;
      });
    }

    return out;
  }

  function filterRows(rows) {
    var out = baseRows(rows);

    var sort = st().resultSort;
    if (sort === 'diffDesc') {
      out = out.slice().sort(function (a, b) { return Math.abs(b.diff || 0) - Math.abs(a.diff || 0); });
    } else if (sort === 'diffAsc') {
      out = out.slice().sort(function (a, b) { return Math.abs(a.diff || 0) - Math.abs(b.diff || 0); });
    } else if (sort === 'gapDesc') {
      /* 门槛欠得最多的排前面 */
      out = out.slice().sort(function (a, b) { return (a.gap === null || a.gap === undefined ? Infinity : a.gap) - (b.gap === null || b.gap === undefined ? Infinity : b.gap); });
    } else if (sort === 'name') {
      out = out.slice().sort(function (a, b) { return String(a.storeName).localeCompare(String(b.storeName), 'zh'); });
    } else if (sort === 'aAmount') {
      out = out.slice().sort(function (a, b) { return (b.aAmount || 0) - (a.aAmount || 0); });
    } else if (sort === 'bAmount') {
      out = out.slice().sort(function (a, b) { return (b.bAmount || 0) - (a.bAmount || 0); });
    }

    /* 需要处理的永远置顶，避免被埋在正常行下面 */
    if (sort !== 'name' && sort !== 'diffAsc') {
      var prio = isThreshold()
        ? { confirm: 0, 'unmatched-b': 1, fail: 2, pass: 3 }
        : { confirm: 0, 'unmatched-a': 1, 'unmatched-b': 1, diff: 2, ok: 3 };
      out = out.slice().sort(function (a, b) {
        var pa = prio[a.status] === undefined ? 9 : prio[a.status];
        var pb = prio[b.status] === undefined ? 9 : prio[b.status];
        if (pa !== pb) return pa - pb;
        return 0;
      });
    }

    return out;
  }

  function counts(rows) {
    var c = { all: rows.length, ok: 0, diff: 0, pass: 0, passClean: 0, abnormal: 0, fail: 0, confirm: 0, unmatched: 0, unmatchedA: 0, unmatchedB: 0, dup: 0, manual: 0 };
    rows.forEach(function (r) {
      if (r.status === 'ok') c.ok++;
      else if (r.status === 'diff') c.diff++;
      else if (r.status === 'pass') { c.pass++; if (r.notInB) { c.unmatched++; c.unmatchedA++; } }
      else if (r.status === 'fail') c.fail++;
      else if (r.status === 'confirm') c.confirm++;
      else if (r.status === 'unmatched-a') { c.unmatched++; c.unmatchedA++; }
      else if (r.status === 'unmatched-b') { c.unmatched++; c.unmatchedB++; }
      if (r.isDup) c.dup++;
      if (r.manual && (r.manual.confirmed || r.manual.label)) c.manual++;
    });
    /* 三档口径：达标 = 干净达标（订够且 B 表也登记上），异常 = 全部 − 达标，恒等 */
    c.passClean = rows.filter(function (r) { return r.status === 'pass' && !r.notInB; }).length;
    c.abnormal = c.all - c.passClean;
    return c;
  }

  /* ---------------- 表格 ---------------- */

  function rowNumText(nums) {
    if (!nums || !nums.length) return '—';
    var s = nums.slice(0, 3).join(',');
    if (nums.length > 3) s += ' +' + (nums.length - 3);
    return s;
  }

  /* 发货日期列：B 表这条记录的发货日期 → 判定用的 A 订货日期。
     窗口内没找到订货记录时给黄标提示，这条就是「没对应上」 */
  function dateCell(r) {
    var bd = r.bDate || (r.bDates && r.bDates[0]) || '';
    var ad = r.selectedDate || '';
    var flag = (r.dateMatched === false)
      ? ' <span class="ck-pill" style="background:var(--wait-l);color:var(--wait)" title="B 表发货日期（应比登记晚 1 天）容差内没找到这家店的订货记录，这一条没对应上">日期未对上</span>'
      : '';
    if (!bd && !ad) return '<span class="ck-muted">—</span>' + flag;
    var main = bd ? U.esc(bd) : '<span class="ck-muted">无日期</span>';
    var sub = ad ? ' <span class="ck-muted">↔ ' + U.esc(ad) + '</span>' : '';
    return main + sub + flag;
  }

  /* 与门槛的差：+ 是超出门槛多少（达标余量），− 是还差多少 */
  function gapCell(n, muted) {
    if (n === null || n === undefined) return '<span class="ck-diff-zero">—</span>';
    if (Math.abs(n) < 0.005) return '<span class="ck-diff-zero">0.00</span>';
    /* muted：门店还没认准（待确认 / 未找到）时不给颜色 —— 绿一下红一下会让人
       以为已经有结论了，先中性显示，确认完再着色 */
    if (muted) return '<span class="ck-diff-zero">' + (n > 0 ? '+' : '-') + U.fmtMoney(Math.abs(n)) + '</span>';
    /* 门槛模式下 gap = 订货金额 − 门槛：正数是余量、负数是欠口 —— 好坏与对账**相反**
       （对账里「外部比内部多」本身就是异常，门槛里「超出门槛」是好事）。
       所以这里不复用 ck-diff-pos / ck-diff-neg，单独用 gap 的两个类，免得后人对不上。 */
    if (isThreshold()) {
      return '<span class="' + (n > 0 ? 'ck-gap-ok' : 'ck-gap-short') + '">' +
        (n > 0 ? '+' : '-') + U.fmtMoney(Math.abs(n)) + '</span>';
    }
    var cls = n > 0 ? 'ck-diff-pos' : 'ck-diff-neg';
    return '<span class="' + cls + '">' + (n > 0 ? '+' : '-') + U.fmtMoney(Math.abs(n)) + '</span>';
  }

  function tableHtml(rows) {
    var page = st().resultPage;
    var size = st().resultPageSize;
    var total = rows.length;
    var pages = Math.max(1, Math.ceil(total / size));
    if (page > pages) page = pages;
    var slice = rows.slice((page - 1) * size, page * size);

    if (!total) {
      return '<div class="ck-card" style="margin-top:16px"><div class="ck-card-body">' +
        UI.empty({
          title: st().resultSearch ? '没有匹配的记录' : '这一类里没有数据',
          text: st().resultSearch ? '换个关键词试试，或者切到「全部数据」。' : '换一个筛选条件看看。'
        }) + '</div></div>';
    }

    var thr = isThreshold();

    /* 门槛是整页统一的一个数，算一次就好；整数不拖 .00，看着干净 */
    var thrLabel = '';
    if (thr) {
      var tv = null;
      for (var ti = 0; ti < slice.length; ti++) {
        if (typeof slice[ti].threshold === 'number') { tv = slice[ti].threshold; break; }
      }
      if (tv === null) {
        var ao = active();
        tv = (ao && ao.meta && typeof ao.meta.threshold === 'number') ? ao.meta.threshold : 0;
      }
      thrLabel = U.fmtThreshold(tv);
    }

    var h = '<div class="ck-card" style="margin-top:16px"><div class="ck-table-wrap"><table class="ck-table" style="table-layout:fixed">' +
      '<thead><tr>';

    /* table-layout:fixed + 弹性列：文本列按百分比伸缩吃掉剩余宽度，
       金额/日期/状态/操作等固定列永远完整可见，任何窗口宽度都铺满、不横向溢出 */
    if (thr) {
      h +=         '<th style="width:17%">门店</th>' +
        '<th style="width:15%">内部表原始名称</th>' +
        '<th style="width:15%">外部表原始名称</th>' +
        '<th class="ck-cell-num" style="width:104px" title="判定用的那一笔订货金额（单笔，不是多笔合计）。以内部表为主：一家店一行，金额绝不相加">订货金额（单笔）</th>' +
        '<th style="width:136px" title="B 表发货日期（比登记晚 1 天）↔ 按容差对上的内部表登记日期">发货日期 → 登记日期</th>' +
        '<th class="ck-cell-num" style="width:80px">门槛</th>' +
        '<th class="ck-cell-num" style="width:96px">与门槛差</th>' +
        '<th style="width:84px">状态</th>' +
        '<th style="width:100px">所属 Sheet</th>' +
        '<th style="width:84px">原始行号</th>' +
        '<th style="width:78px">操作</th>';
    } else {
      h += '<th style="width:19%">门店标准名称</th>' +
        '<th style="width:16%">内部表原始名称</th>' +
        '<th style="width:16%">外部表原始名称</th>' +
        '<th class="ck-cell-num" style="width:108px">内部表金额</th>' +
        '<th class="ck-cell-num" style="width:108px">外部表金额</th>' +
        '<th class="ck-cell-num" style="width:100px">差额</th>' +
        '<th style="width:84px">状态</th>' +
        '<th style="width:104px">所属 Sheet</th>' +
        '<th style="width:84px">原始行号</th>' +
        '<th style="width:78px">操作</th>';
    }

    h += '</tr></thead><tbody>';

    slice.forEach(function (r) {
      var needAct = r.status === 'confirm' || r.status === 'unmatched-a' ||
        r.status === 'unmatched-b' || r.status === 'fail';

      h += '<tr class="is-clickable" data-row="' + U.esc(r.id) + '">' +
        '<td class="ck-cell-strong ck-cell-store">' +
          '<span class="ck-store-name" title="' + U.esc(r.storeName) + '">' + U.esc(r.storeName) + '</span>' +
          '<span class="ck-store-tags">' +
            ((r.matchMethod === 'fuzzy' || r.matchMethod === 'contains')
              ? '<span class="ck-pill" style="background:var(--warn-l);color:var(--warn)" title="门店名是「文字相近」匹配上的，不是完全一致，点开确认是不是同一家">相似</span>' : '') +
            (r.multiSheet ? '<span class="ck-pill" title="这条记录的原始行分布在多张工作表里">多表</span>' : '') +
            (r.isDup ? '<span class="ck-pill" style="background:var(--dup-l);color:var(--dup)" title="B 表同店同日重复登记：算同一次发货，只核对一次，重复明细点开看">重复</span>' : '') +
            (r.multiOrder ? '<span class="ck-pill" style="background:var(--wait-l);color:var(--wait)" title="这家店共有 ' + r.orderCount + ' 笔订货，本条判定用窗口内的那一笔，点开看每一笔">' + r.orderCount + ' 笔</span>' : '') +
            (r.manual && r.manual.confirmed ? '<span class="ck-pill" style="background:var(--ok-l);color:#0a8a5f">已处理</span>' : '') +
          '</span>' +
        '</td>' +
        '<td class="ck-cell-muted ck-cell-clip" title="' + U.esc(r.aRawName) + '">' + U.esc(r.aRawName || '—') + '</td>' +
        '<td class="ck-cell-muted ck-cell-clip" title="' + U.esc(r.bRawName) + '">' + U.esc(r.bRawName || '—') + '</td>';

      if (thr) {
        h += '<td class="ck-cell-num ck-num">' + (typeof r.aAmount === 'number' ? U.fmtMoney(r.aAmount) : '<span class="ck-muted">—</span>') + '</td>' +
          '<td class="ck-cell-muted ck-num" style="font-size:12px">' + dateCell(r) + '</td>' +
          '<td class="ck-cell-num ck-num ck-cell-muted">' + thrLabel + '</td>' +
          '<td class="ck-cell-num">' + gapCell(r.gap, r.status === 'confirm' || r.status === 'unmatched-b') + '</td>';
      } else {
        h += '<td class="ck-cell-num ck-num">' + (typeof r.aAmount === 'number' ? U.fmtMoney(r.aAmount) : '<span class="ck-muted">—</span>') + '</td>' +
          '<td class="ck-cell-num ck-num">' + (typeof r.bAmount === 'number' ? U.fmtMoney(r.bAmount) : '<span class="ck-muted">—</span>') + '</td>' +
          '<td class="ck-cell-num">' + UI.diffCell(r.diff) + '</td>';
      }

      h += '<td>' + (r.notInB ? UI.statusTag('unmatched-a') : UI.statusTag(r.status)) + '</td>' +
        '<td class="ck-cell-muted">' + U.esc(r.sheet) + '</td>' +
        '<td class="ck-cell-muted ck-num" style="font-size:12px">' +
          U.esc(rowNumText(r.bRowNums && r.bRowNums.length ? r.bRowNums : r.aRowNums)) + '</td>' +
        '<td>' + (needAct
          ? '<button class="ck-btn is-xs is-soft" data-act-row="' + U.esc(r.id) + '">处理</button>'
          : '<button class="ck-btn is-xs is-ghost" data-act-row="' + U.esc(r.id) + '">查看</button>') + '</td>' +
      '</tr>';
    });

    h += '</tbody></table></div>';

    /* 分页 */
    h += '<div class="ck-row" style="padding:10px 18px;border-top:1px solid var(--line-s);background:#fff">' +
      '<span class="ck-small ck-muted">共 ' + U.fmtInt(total) + ' 条，第 ' + ((page - 1) * size + 1) + '–' + Math.min(total, page * size) + ' 条</span>' +
      '<span class="ck-spacer"></span>' +
      '<select class="ck-select" data-pgsize style="width:auto;height:30px;font-size:12.5px">' +
        SIZES.map(function (n) { return '<option value="' + n + '"' + (n === size ? ' selected' : '') + '>每页 ' + n + ' 条</option>'; }).join('') +
      '</select>' +
      '<button class="ck-btn is-sm" data-pg="' + (page - 1) + '"' + (page <= 1 ? ' disabled' : '') + '>上一页</button>' +
      '<span class="ck-small ck-num" style="padding:0 4px">' + page + ' / ' + pages + '</span>' +
      '<button class="ck-btn is-sm" data-pg="' + (page + 1) + '"' + (page >= pages ? ' disabled' : '') + '>下一页</button>' +
    '</div>';

    return h + '</div>';
  }

  /* ---------------- 主体 ---------------- */

  function bodyHtml() {
    var a = active();
    if (!a) {
      return '<div class="ck-card"><div class="ck-card-body">' + UI.empty({
        title: '还没有核对结果',
        text: '先去「新建核对」上传两个文件跑一次，结果会出现在这里。',
        action: '<button class="ck-btn is-primary" data-act="goNew">' + UI.icon('plus') + '新建核对</button>'
      }) + '</div></div>';
    }
    return tableHtml(filterRows(a.rows));
  }

  /* ================= shipping 包邮发货核查：双视图渲染 ================= */
  function renderShipping(a) {
    var s = a.stats || {};
    var rowsB = a.rowsB || [];
    var rowsA = a.rowsA || [];
    var sheetStats = a.sheetStats || [];
    var threshold = typeof a.meta.threshold === 'number' ? a.meta.threshold : 16000;
    if (!st().shipView) st().shipView = 'b';
    if (!st().shipFilter) st().shipFilter = 'all';
    var view = st().shipView;
    var h = '';

    /* 历史提示 */
    if (a.isHistory) {
      h += '<div class="ck-inline-note is-warn" style="margin-bottom:16px">' + UI.icon('history') +
        '<span style="flex:1"><b>正在看历史记录</b>（' + U.fmtDateTime(a.meta.at) + '）。' +
        '历史只保存统计与异常明细，原始行内容不保留；要重新核对请回「新建核对」。</span>' +
        '<button class="ck-btn is-xs" data-act="backToLatest">回到当前结果</button></div>';
    }

    /* KPI：四大类 + Sheet */
    h += '<div class="ck-kpis">' +
      UI.kpi({ label: '包邮正确', value: U.fmtInt(s.correct || 0), tone: 'ok', sub: '应包邮且已发货' }) +
      UI.kpi({ label: '包邮错误', value: U.fmtInt(s.wrong || 0), tone: 'diff', sub: '不该包邮却发了' }) +
      UI.kpi({ label: '匹配异常', value: U.fmtInt(s.exception || 0), tone: 'wait', sub: '单号/门店/日期/重复' }) +
      UI.kpi({ label: '应包邮·未找到', value: U.fmtInt(s.aMissing || 0), tone: 'miss', sub: 'A≥' + U.fmtThreshold(threshold) + ' 但 B 无记录' }) +
      UI.kpi({ label: '物流 Sheet', value: U.fmtInt(s.sheetCount || 0), sub: (s.sheetsOk || 0) + ' 张无未处理' }) +
    '</div>';

    /* 视图切换 */
    h += '<div class="ck-card" style="margin-top:16px">' +
      '<div class="ck-card-head"><h2>' + U.esc(a.meta.title || '包邮发货核查') + '</h2>' +
        '<span class="ck-hint">' + U.esc(a.meta.aFileName || '') + ' × ' + U.esc(a.meta.bFileName || '') + ' · 门槛 ≥ ' + U.fmtThreshold(threshold) + '</span>' +
        '<div class="ck-head-right">' +
          '<div class="ck-seg" id="shipSeg">' +
            '<button class="ck-seg-btn ' + (view === 'b' ? 'is-on' : '') + '" data-ship-view="b">视图一 · B 发货核查</button>' +
            '<button class="ck-seg-btn ' + (view === 'a' ? 'is-on' : '') + '" data-ship-view="a">视图二 · A 应包邮</button>' +
            '<button class="ck-seg-btn ' + (view === 'sheet' ? 'is-on' : '') + '" data-ship-view="sheet">Sheet 完整性</button>' +
          '</div>' +
        '</div></div>';

    if (view === 'sheet') {
      h += renderSheetMonitor(sheetStats);
    } else if (view === 'a') {
      h += renderShipViewA(rowsA, threshold);
    } else {
      h += renderShipViewB(rowsB, threshold);
    }
    h += '</div>';
    return h;
  }

  function shipCatLabel(cat) {
    return { correct: '包邮正确', wrong: '包邮错误', exception: '匹配异常' }[cat] || cat;
  }
  function shipCatTone(cat) {
    return { correct: 'ok', wrong: 'diff', exception: 'wait' }[cat] || '';
  }

  function renderShipViewB(rowsB, threshold) {
    var s = active().stats || {};
    var filter = st().shipFilter;
    var filtered = filterShipB(rowsB, filter);

    /* 筛选标签 */
    var chips = [
      ['all', '全部', rowsB.length],
      ['correct', '包邮正确', s.correct || 0],
      ['wrong', '包邮错误', s.wrong || 0],
      ['orderMissedButBackup', '降级匹配', s.orderMissedButBackup || 0],
      ['orderNotFound', '单号不存在', s.orderNotFound || 0],
      ['storeConflict', '门店冲突', s.storeConflict || 0],
      ['dateAbnormal', '日期异常', (s.dateAbnormal || 0) + (s.dateDelay || 0)],
      ['suspectDup', '疑似重复', s.suspectDup || 0],
      ['multiCandidate', '无法匹配/待确认', (s.multiCandidate || 0) + (s.noMatch || 0) + (s.needConfirm || 0)]
    ];
    var chipsHtml = '<div class="ck-seg">' + chips.map(function (c) {
      return '<button class="ck-seg-item ' + (filter === c[0] ? 'is-on' : '') + '" data-ship-filter="' + c[0] + '">' +
        U.esc(c[1]) + ' <span class="ck-seg-count">' + c[2] + '</span></button>';
    }).join('') + '</div>';

    var body = '';
    if (!filtered.length) {
      body = '<div class="ck-card-body">' + UI.empty({ title: '没有符合筛选的记录', text: '换个筛选条件看看。' }) + '</div>';
    } else {
      body = '<div class="ck-table-wrap"><table class="ck-table ck-table-sm">' +
        '<thead><tr>' +
          '<th>#</th><th>物流</th><th>B 门店</th><th>A 门店</th><th>B 单号</th><th>A 单号</th>' +
          '<th class="n">A 金额</th><th>核查结果</th><th>异常类型</th><th>匹配方式</th><th>日期</th><th>重复</th>' +
        '</tr></thead><tbody>';
      filtered.forEach(function (r) {
        var catTone = shipCatTone(r.category);
        body += '<tr class="is-clickable" data-ship-row="' + U.esc(r.id) + '">' +
          '<td class="ck-muted">' + (r.seq || '') + '</td>' +
          '<td>' + U.esc(r.logisticsCompany || r.bSheet || '') + '</td>' +
          '<td>' + U.esc(r.bStoreName || '') + '</td>' +
          '<td>' + U.esc(r.aStoreName || '—') + '</td>' +
          '<td>' + U.esc(r.bOrderNo || '—') + '</td>' +
          '<td>' + U.esc(r.aOrderNo || '—') + '</td>' +
          '<td class="n">' + (r.aAmount === null || r.aAmount === undefined ? '—' : U.fmtMoney(r.aAmount)) + '</td>' +
          '<td><span class="ck-tag is-' + catTone + '">' + shipCatLabel(r.category) + '</span></td>' +
          '<td class="ck-small ck-muted">' + (r.orderMissedButBackup ? '<span class="ck-tag is-soft" title="B表单号在A表未找到，按门店+日期降级匹配">降级</span>' : (U.esc(shipExceptionLabel(r)) || '—')) + '</td>' +
          '<td class="ck-small ck-muted">' + (r.orderMissedButBackup ? '降级匹配' : U.esc(shipMethodLabel(r.matchMethod))) + '</td>' +
          '<td class="ck-small">' + shipDateCell(r) + '</td>' +
          '<td>' + (r.suspectDup ? '<span class="ck-tag is-diff" title="' + U.esc((r.dupSheets || []).join('、')) + '">疑似重复</span>' : '') + '</td>' +
        '</tr>';
      });
      body += '</tbody></table></div>';
    }

    return '<div class="ck-card-body" style="border-top:1px solid var(--line)">' +
      chipsHtml +
      '<div class="ck-small ck-muted" style="margin:10px 0">以 B 表发货记录为主线，逐条核对仓库登记的包邮是否正确。共 ' + rowsB.length + ' 条，当前显示 ' + filtered.length + ' 条。</div>' +
      body +
    '</div>';
  }

  function shipExceptionLabel(r) {
    if (r.category !== 'exception') return '';
    /* 单号在A表没找到但降级匹配到了候选（异常状态的，如多候选/日期无交集） —— 单独标识 */
    if (r.orderMissedButBackup) return '降级·待确认';
    var map = {
      storeConflict: '门店冲突',
      orderNotFound: '单号不存在',
      multiCandidate: '多候选·待确认',
      noMatch: '无法匹配',
      needConfirm: '待人工确认'
    };
    return map[r.exceptionType] || r.exceptionType || '';
  }

  function shipDateCell(r) {
    if (!r.dateTier || r.dateTier === 'unknown') return '<span class="ck-muted">—</span>';
    var tone = r.dateTier === 'normal' ? 'ok' : (r.dateTier === 'delay' ? 'wait' : 'diff');
    return '<span class="ck-tag is-' + tone + '" title="' + U.esc(r.dateLabel || '') + '">' +
      (r.dateLag === null || r.dateLag === undefined ? '?' : (r.dateLag >= 0 ? '+' + r.dateLag : r.dateLag)) + '天</span>';
  }

  function filterShipB(rowsB, filter) {
    if (filter === 'all') return rowsB;
    return rowsB.filter(function (r) {
      switch (filter) {
        case 'correct': return r.category === 'correct';
        case 'wrong': return r.category === 'wrong';
        case 'orderMissedButBackup': return !!r.orderMissedButBackup;
        case 'orderNotFound': return r.exceptionType === 'orderNotFound';
        case 'storeConflict': return r.exceptionType === 'storeConflict';
        case 'dateAbnormal': return r.dateTier === 'abnormal' || r.dateTier === 'delay';
        case 'suspectDup': return !!r.suspectDup;
        case 'multiCandidate': return r.exceptionType === 'multiCandidate' || r.exceptionType === 'noMatch' || r.exceptionType === 'needConfirm';
      }
      return true;
    });
  }

  function renderShipViewA(rowsA, threshold) {
    var body = '';
    if (!rowsA.length) {
      body = '<div class="ck-card-body">' + UI.empty({ title: '没有应包邮订单', text: 'A 表没有金额 ≥ ' + U.fmtThreshold(threshold) + ' 的订单。' }) + '</div>';
    } else {
      body = '<div class="ck-table-wrap"><table class="ck-table ck-table-sm">' +
        '<thead><tr><th>#</th><th>A 门店</th><th>订单单号</th><th>下单日期</th><th class="n">金额</th><th>B 是否找到</th><th>物流</th><th>状态</th></tr></thead><tbody>';
      rowsA.forEach(function (r) {
        var found = r.bFound || r.status === 'found';
        body += '<tr class="is-clickable" data-ship-row="' + U.esc(r.id) + '">' +
          '<td class="ck-muted">' + (r.seq || '') + '</td>' +
          '<td>' + U.esc(r.storeName || '') + '</td>' +
          '<td>' + U.esc(r.orderNo || '—') + '</td>' +
          '<td>' + U.esc(r.orderDate || '—') + '</td>' +
          '<td class="n">' + (r.amount === null || r.amount === undefined ? '—' : U.fmtMoney(r.amount)) + '</td>' +
          '<td>' + (found ? '<span class="ck-tag is-ok">已找到</span>' : '<span class="ck-tag is-miss">未找到</span>') + '</td>' +
          '<td class="ck-small ck-muted">' + U.esc(r.bLogistics || '—') + '</td>' +
          '<td><span class="ck-tag is-' + (found ? 'ok' : 'wait') + '">' + (found ? '已发货' : '待核实') + '</span></td>' +
        '</tr>';
      });
      body += '</tbody></table></div>';
    }
    return '<div class="ck-card-body" style="border-top:1px solid var(--line)">' +
      '<div class="ck-small ck-muted" style="margin-bottom:8px">检查 A 表所有金额 ≥ ' + U.fmtThreshold(threshold) + ' 的订单，是否在 B 表全部 Sheet 找到对应发货记录。' +
      '找不到不直接认定为漏发（可能未发货或跨月发货），标「待核实」。共 ' + rowsA.length + ' 条应包邮订单。</div>' +
      body +
    '</div>';
  }

  function renderSheetMonitor(sheetStats) {
    if (!sheetStats.length) {
      return '<div class="ck-card-body">' + UI.empty({ title: '没有 Sheet 数据' }) + '</div>';
    }
    var body = '<div class="ck-table-wrap"><table class="ck-table ck-table-sm">' +
      '<thead><tr><th>Sheet</th><th>物流公司</th><th>单号字段</th><th class="n">原始</th><th class="n">已读</th><th class="n">已核查</th><th class="n">已匹配</th><th class="n">待确认</th><th class="n">异常</th><th class="n">未处理</th></tr></thead><tbody>';
    sheetStats.forEach(function (x) {
      var unprocTone = x.unprocessed > 0 ? 'diff' : 'ok';
      body += '<tr>' +
        '<td>' + U.esc(x.sheetName) + '</td>' +
        '<td class="ck-small ck-muted">' + U.esc(x.logisticsCompany) + '</td>' +
        '<td>' + (x.hasOrderField ? '<span class="ck-tag is-ok">有</span>' : '<span class="ck-tag is-wait">无</span>') + '</td>' +
        '<td class="n">' + x.rawRows + '</td>' +
        '<td class="n">' + x.readRows + '</td>' +
        '<td class="n">' + x.checkedRows + '</td>' +
        '<td class="n">' + x.matchedRows + '</td>' +
        '<td class="n">' + x.needConfirm + '</td>' +
        '<td class="n">' + x.exceptionRows + '</td>' +
        '<td class="n"><span class="ck-tag is-' + unprocTone + '">' + x.unprocessed + '</span></td>' +
      '</tr>';
    });
    body += '</tbody></table></div>';
    return '<div class="ck-card-body" style="border-top:1px solid var(--line)">' +
      '<div class="ck-small ck-muted" style="margin-bottom:8px">每个 B 表 Sheet 的核查进度。只有所有有效 Sheet 都读取成功、每条记录都有明确处理状态，才视为「本次核查完成」。</div>' +
      body +
    '</div>';
  }

  function render() {
    var a = active();
    if (!a) {
      return '<div class="ck-card"><div class="ck-card-body">' + UI.empty({
        title: '还没有核对结果',
        text: '先去「新建核对」上传两个文件跑一次，结果会出现在这里。',
        action: '<button class="ck-btn is-primary" data-act="goNew">' + UI.icon('plus') + '新建核对</button>'
      }) + '</div></div>';
    }

    var s = a.stats || {};
    /* shipping 包邮发货核查：独立的双视图渲染，不走下面的门槛/对账分支 */
    if (isShipping()) return renderShipping(a);
    var c = counts(baseRows(a.rows, true));
    var thr = isThreshold();
    var threshold = typeof a.meta.threshold === 'number' ? a.meta.threshold : 16000;
    var h = '';

    /* 排序项跟着模式走。否则从对账结果切到门槛结果时，
       带着 diffDesc 过来会「看起来完全没排序」，用户以为坏了。 */
    if (thr && (st().resultSort === 'diffDesc' || st().resultSort === 'diffAsc')) st().resultSort = 'gapDesc';
    if (!thr && st().resultSort === 'gapDesc') st().resultSort = 'diffDesc';

    /* 历史提示 */
    if (a.isHistory) {
      h += '<div class="ck-inline-note is-warn" style="margin-bottom:16px">' + UI.icon('history') +
        '<span style="flex:1"><b>正在看历史记录</b>（' + U.fmtDateTime(a.meta.at) + '）。' +
        '历史只保存统计和非一致明细，原始 Excel 行内容不保留；要重新核对请回「新建核对」。</span>' +
        '<button class="ck-btn is-xs" data-act="backToLatest">回到当前结果</button></div>';
    }

    /* KPI */
    if (thr) {
      /* 只给三个自洽的数：参与核验 = 达标 + 异常。
         具体异常原因（未达标 / 仓库未对应 / 清单外 / 待确认 …）看「核验分布」条
         和异常列表里每行的状态列。 */
      h += '<div class="ck-kpis">' +
        UI.kpi({ label: '参与核验', value: U.fmtInt(s.total || 0), sub: '内部表原始行数' }) +
        UI.kpi({ label: '达标', value: U.fmtInt(s.pass || 0), tone: 'ok', sub: '订够门槛' }) +
        UI.kpi({ label: '异常', value: U.fmtInt(Math.max(0, (s.total || 0) - (s.pass || 0))), tone: 'diff', sub: '未达标 / 未对应 / 待确认等' }) +
      '</div>';
    } else {
      h += '<div class="ck-kpis">' +
        UI.kpi({ label: '总门店数', value: U.fmtInt(s.stores || 0), sub: '去重后' }) +
        UI.kpi({ label: '已匹配', value: U.fmtInt(s.matched || 0), tone: 'ok', sub: '两边都找到' }) +
        UI.kpi({ label: '金额一致', value: U.fmtInt(s.amountOk || 0), tone: 'ok', sub: '误差 ±' + U.fmtMoney(a.meta.tolerance || 0) }) +
        UI.kpi({ label: '金额差异', value: U.fmtInt(s.amountDiff || 0), tone: 'diff', sub: '合计差额 ' + U.fmtDiff(s.diffSum) }) +
        UI.kpi({ label: '未匹配', value: U.fmtInt(s.unmatched || 0), tone: 'miss', sub: '内部 ' + (s.unmatchedA || 0) + ' / 外部 ' + (s.unmatchedB || 0) }) +
        UI.kpi({ label: '待确认', value: U.fmtInt(s.needConfirm || 0), tone: 'wait', sub: '门店没认准' }) +
      '</div>';
    }

    /* 分布 */
    h += '<div class="ck-card" style="margin-top:16px">' +
      '<div class="ck-card-head"><h2>' + (thr ? '核验分布' : '结果分布') + '</h2>' +
        '<span class="ck-hint">' + U.esc(a.meta.aFileName || '') + ' × ' + U.esc(a.meta.bFileName || '') + '</span>' +
        '<div class="ck-head-right">' +
          (a.isHistory || thr ? '' :
            '<label class="ck-switch" title="同一门店出现在多张工作表时，是否累加后再与内部表比">' +
              '<input type="checkbox" data-merge ' + (a.meta.mergeSheets ? 'checked' : '') + ' />' +
              '<span class="ck-switch-ui"></span>' +
              '<span class="ck-switch-text">跨表累加</span>' +
            '</label>') +
        '</div>' +
      '</div>' +
      '<div class="ck-card-body">' +
        (thr
          ? UI.diffBar({
              total: (s.pass || 0) + (s.fail || 0) + (s.needConfirm || 0) + (s.unmatched || 0),
              ok: s.pass, diff: s.fail, confirm: s.needConfirm, miss: s.unmatched,
              labels: { ok: '达标', diff: '未达标', confirm: '待确认', miss: '未找到' }
            })
          : UI.diffBar({
              total: (s.amountOk || 0) + (s.amountDiff || 0) + (s.needConfirm || 0) + (s.unmatched || 0),
              ok: s.amountOk, diff: s.amountDiff, confirm: s.needConfirm, miss: s.unmatched
            })) +
        '<div class="ck-row wrap" style="gap:22px;margin-top:16px">' +
          (thr
            ? '<div><div class="ck-small ck-muted">达标订货金额</div>' +
                '<div class="ck-num" style="font-size:17px;font-weight:650;color:var(--ok)">' + U.fmtMoney(s.passAmount) + '</div></div>' +
              '<div><div class="ck-small ck-muted">未达标金额</div>' +
                '<div class="ck-num" style="font-size:17px;font-weight:650;color:var(--bad)">' + U.fmtMoney(s.failAmount) + '</div></div>' +
              '<div><div class="ck-small ck-muted">距门槛合计还差</div>' +
                '<div class="ck-num" style="font-size:17px;font-weight:650">' + U.fmtMoney(s.shortSum) + '</div></div>' +
              '<div><div class="ck-small ck-muted">清单外（A 订够、B 没有）</div>' +
                '<div class="ck-num" style="font-size:17px;font-weight:650;color:var(--t2)">' + U.fmtInt(s.aOnly || 0) +
                  '<span class="ck-small ck-muted" style="font-weight:400"> 笔 · ' + U.fmtMoney(s.aOnlyAmount) + '</span></div></div>' +
              '<div><div class="ck-small ck-muted">B 表覆盖（已涉及 / 共）</div>' +
                '<div class="ck-num" style="font-size:17px;font-weight:650;color:' + ((s.bUncovered || 0) ? 'var(--bad)' : 'var(--ok)') + '">' +
                  U.fmtInt(s.bMatched || 0) + ' / ' + U.fmtInt(s.bStores || 0) +
                  '<span class="ck-small ck-muted" style="font-weight:400"> 家' +
                  ((s.bUncovered || 0) ? ' · 未涉及 ' + U.fmtInt(s.bUncovered) + ' 家' : ' · 全部涉及') + '</span></div></div>'
            : '<div><div class="ck-small ck-muted">内部表金额合计</div>' +
                '<div class="ck-num" style="font-size:17px;font-weight:650">' + U.fmtMoney(s.aTotal) + '</div></div>' +
              '<div><div class="ck-small ck-muted">外部表金额合计</div>' +
                '<div class="ck-num" style="font-size:17px;font-weight:650">' + U.fmtMoney(s.bTotal) + '</div></div>' +
              '<div><div class="ck-small ck-muted">差额合计</div>' +
                '<div class="ck-num" style="font-size:17px;font-weight:650;color:' + ((s.diffSum || 0) > 0 ? 'var(--bad)' : (s.diffSum || 0) < 0 ? 'var(--ok)' : 'var(--t1)') + '">' +
                  U.fmtDiff(s.diffSum) + '</div></div>' +
              '<div><div class="ck-small ck-muted">重复记录</div>' +
                '<div class="ck-num" style="font-size:17px;font-weight:650;color:var(--dup)">' + U.fmtInt(s.dup || 0) + '</div></div>') +
        '</div>' +
      '</div>' +
    '</div>';

    /* 工具栏 */
    var tabs = thr
      ? [
          ['all', '全部', c.all],
          ['pass', '达标', c.passClean],
          ['abnormal', '异常', c.abnormal]
        ]
      : [
          ['all', '全部', c.all],
          ['ok', '金额一致', c.ok],
          ['diff', '金额差异', c.diff],
          ['unmatched', '未匹配', c.unmatched],
          ['confirm', '待确认', c.confirm],
          ['dup', '重复数据', c.dup],
          ['manual', '已处理', c.manual]
        ];

    var sortOpts = thr
      ? [['gapDesc', '差距从大到小（先看欠得最多的）'],
         ['aAmount', '订货金额从大到小'],
         ['name', '按门店名']]
      : [['diffDesc', '差额从大到小'],
         ['diffAsc', '差额从小到大'],
         ['name', '按门店名'],
         ['bAmount', '按外部表金额']];

    h += '<div class="ck-card" style="margin-top:16px">' +
      '<div class="ck-toolbar">' +
        '<div class="ck-seg">' + tabs.map(function (t) {
          var tip = '';
          if (thr && t[0] === 'all') {
            tip = '参与核验的全部门店：A 表' +
              (s.aRawRows ? ' ' + U.fmtInt(s.aRawRows) + ' 行数据' : '') +
              '按门店合并后的结果，一家店一行；B 表只用来核对，不决定条数';
          } else if (thr && t[0] === 'pass') {
            tip = '符合的：这一笔订货金额达到门槛，且 B 表（外部）也登记上了';
          } else if (thr && t[0] === 'abnormal') {
            tip = '不对的：未达标 / 仓库未对应 / 清单外 / 待确认等全部问题行，每行的「状态」列写明具体原因';
          }
          return '<button class="ck-seg-item ' + (st().resultFilter === t[0] ? 'is-on' : '') + '" data-filter="' + t[0] + '"' +
            (tip ? ' title="' + U.esc(tip) + '"' : '') + '>' +
            t[1] + ' <span class="ck-seg-count">' + t[2] + '</span></button>';
        }).join('') + '</div>' +
        '<div class="ck-toolbar-right">' +
          (thr ? '<label class="ck-switch" title="开启后每家门店只显示一条（保留最需要处理的那条），点开详情仍能看这家店的全部订货与登记">' +
            '<input type="checkbox" data-dedup ' + (st().resultDedup ? 'checked' : '') + ' />' +
            '<span class="ck-switch-ui"></span>' +
            '<span class="ck-switch-text">去掉重复门店</span>' +
          '</label>' : '') +
          '<div class="ck-search" style="width:220px">' + UI.icon('search') +
            '<input class="ck-input" type="text" placeholder="搜索门店 / Sheet" data-search value="' + U.esc(st().resultSearch) + '" /></div>' +
          '<select class="ck-select" data-sort style="width:auto">' +
            sortOpts.map(function (o) {
              return '<option value="' + o[0] + '"' + (st().resultSort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
            }).join('') +
          '</select>' +
        '</div>' +
      '</div>' +
      '<div id="ckResBody">' + bodyHtml() + '</div>' +
    '</div>';

    return h;
  }

  /* ---------------- 抽屉：详情与人工处理 ---------------- */

  function headersOf(side, sheetName) {
    var s = st();
    var f = side === 'a' ? s.aFile : s.bFile;
    if (!f) return [];
    var sh = f.sheets.filter(function (x) { return x.name === sheetName; })[0];
    return sh ? sh.headers : [];
  }

  function rawRowsTable(rows, side, sheetName) {
    if (!rows || !rows.length) {
      return '<div class="ck-small ck-muted">' + (side === 'a' ? 'A' : 'B') + ' 表这一侧没有记录</div>';
    }
    var heads = headersOf(side, sheetName);
    var h = '<div class="ck-table-wrap" style="border:1px solid var(--line);border-radius:10px;max-height:260px">' +
      '<table class="ck-table" style="font-size:12px"><thead><tr><th>行号</th>';
    if (heads.length) {
      heads.slice(0, 12).forEach(function (x) { h += '<th>' + U.esc(x) + '</th>'; });
    } else {
      h += '<th>原始内容（历史记录不保存列名）</th>';
    }
    h += '</tr></thead><tbody>';

    rows.slice(0, 60).forEach(function (r) {
      h += '<tr><td class="ck-mono ck-cell-muted">' + (r.rowNum || '—') + '</td>';
      if (heads.length) {
        for (var i = 0; i < Math.min(heads.length, 12); i++) {
          var v = r.raw ? r.raw[i] : '';
          var text = v instanceof Date ? U.parseDate(v) : v;
          h += '<td class="ck-cell-clip" title="' + U.esc(text) + '">' + U.esc(text) + '</td>';
        }
      } else {
        h += '<td class="ck-cell-muted">金额 ' + (r.amount === undefined || r.amount === null ? '—' : U.fmtMoney(r.amount)) + '</td>';
      }
      h += '</tr>';
    });
    h += '</tbody></table></div>';
    if (rows.length > 60) {
      h += '<div class="ck-small ck-muted" style="margin-top:6px">只显示前 60 行，共 ' + rows.length + ' 行</div>';
    }
    return h;
  }

  function findRow(id) {
    var a = active();
    if (!a) return null;
    for (var i = 0; i < a.rows.length; i++) if (a.rows[i].id === id) return a.rows[i];
    return null;
  }

  function candidateListHtml(r) {
    var cands = r.candidates || [];
    var h = '';
    if (!cands.length) {
      h += '<div class="ck-small ck-muted" style="margin-bottom:8px">没有相近的候选，需要你手动指定（在下面搜索 内部表门店）。</div>';
    } else {
      h += '<div class="ck-small ck-muted" style="margin-bottom:8px">系统找到这些相近的门店，请确认哪一个是同一家（确认只对这一条登记生效；同一家店其他写法的登记要分别确认，或点「存入匹配库」以后自动认）：</div>';
      h += '<div style="border:1px solid var(--line);border-radius:10px;overflow:hidden">';
      cands.forEach(function (c, i) {
        h += '<div class="ck-recent-item" style="padding:10px 14px' + (i ? '' : '') + '">' +
          '<div class="ck-recent-main">' +
            '<div class="ck-recent-title">' + U.esc(c.aName) + '</div>' +
            '<div class="ck-recent-sub">相似度 ' + Math.round((c.score || 0) * 100) + '% · ' +
              (c.method === 'alias' ? '门店匹配库' : c.method === 'exact' ? '完全一致' : c.method === 'contains' ? '包含关系' : '文字相近') + '</div>' +
          '</div>' +
          '<button class="ck-btn is-xs is-soft" data-pick-cand="' + U.esc(c.aKey) + '">就是它</button>' +
        '</div>';
      });
      h += '</div>';
    }
    return h;
  }

  function aStoreSearchHtml(r) {
    var a = active();
    var list = (a && a.aGroups) ? a.aGroups : [];
    if (!list.length) {
      return '<div class="ck-small ck-muted">（历史记录不保存 内部表门店清单，无法在这里重新指定）</div>';
    }
    var h = '<div class="ck-search" style="margin-bottom:8px">' + UI.icon('search') +
      '<input class="ck-input" type="text" placeholder="搜索 内部表门店名…" data-astore-search /></div>' +
      '<div id="ckAStoreList" style="max-height:200px;overflow:auto;border:1px solid var(--line);border-radius:10px">';
    list.slice(0, 40).forEach(function (g) {
      h += '<div class="ck-recent-item" style="padding:8px 12px" data-astore="' + U.esc(g.key) + '" data-name="' + U.esc(g.rawName) + '">' +
        '<div class="ck-recent-main"><div class="ck-recent-title">' + U.esc(g.rawName) + '</div>' +
        '<div class="ck-recent-sub">' + g.rowCount + ' 行 · 合计 ' + U.fmtMoney(g.amount) + '</div></div>' +
        '<button class="ck-btn is-xs" data-pick-cand="' + U.esc(g.key) + '">指定</button></div>';
    });
    h += '</div>';
    return h;
  }

  function openDrawer(rowId) {
    var a = active();
    var r = findRow(rowId);
    if (!r) return;

    var canEdit = !a.isHistory && !!(st().aFile && st().bFile);
    var thr = isThreshold();
    var body = '';

    /* 概要 */
    body += '<div class="ck-card"><div class="ck-card-body">' +
      '<dl class="ck-kv">' +
        '<dt>门店</dt><dd><b>' + U.esc(r.storeName) + '</b></dd>' +
        '<dt>内部表原始名</dt><dd>' + U.esc(r.aRawName || '—') + '</dd>' +
        '<dt>外部表原始名</dt><dd>' + U.esc(r.bRawName || '—') + '</dd>' +
        '<dt>' + (thr ? '判定金额（单笔）' : '内部表订货金额') + '</dt><dd class="ck-num">' +
          (typeof r.aAmount === 'number' ? U.fmtMoney(r.aAmount) : '—') + '</dd>' +
        (thr && r.orderCount ? '<dt>订货笔数</dt><dd class="ck-num">' + r.orderCount + ' 笔' +
          (r.passOrderCount ? '（' + r.passOrderCount + ' 笔达标）' : '') + '</dd>' : '') +
        (thr ? '<dt>订货日期</dt><dd class="ck-num">' + U.esc(r.selectedDate || (r.aDates || []).join('、') || '—') + '</dd>' : '') +
        (thr ? '<dt>外部表发货日期</dt><dd class="ck-num">' + U.esc((r.bDates || []).join('、') || '—') + '</dd>' : '') +
        (thr
          ? '<dt>门槛</dt><dd class="ck-num">' + U.fmtThreshold(r.threshold) + '</dd>' +
            '<dt>与门槛差</dt><dd>' + gapCell(r.gap, r.status === 'confirm' || r.status === 'unmatched-b') + '</dd>'
          : '<dt>外部表金额</dt><dd class="ck-num">' +
              (typeof r.bAmount === 'number' ? U.fmtMoney(r.bAmount) : '—') + '</dd>' +
            '<dt>差额 (外部−内部)</dt><dd>' + UI.diffCell(r.diff) + '</dd>') +
        '<dt>状态</dt><dd>' + UI.statusTag(r.status) + '</dd>' +
        '<dt>所属 Sheet</dt><dd>' + U.esc(r.sheet) + '</dd>' +
        '<dt>内部表行号</dt><dd class="ck-mono">' + U.esc((r.aRowNums || []).join(',') || '—') + '</dd>' +
        '<dt>外部表行号</dt><dd class="ck-mono">' + U.esc((r.bRowNums || []).join(',') || '—') + '</dd>' +
        '<dt>对应关系</dt><dd>' + U.esc(r.pairType || '—') + '</dd>' +
      '</dl>' +
      (r.note ? '<div class="ck-inline-note is-warn" style="margin-top:12px">' + UI.icon('alert') +
        '<span>' + U.esc(r.note) + '</span></div>' : '') +
    '</div></div>';

    /* 订货明细：一笔一行，每笔单独对门槛，金额绝不相加 */
    if (thr && r.orders && r.orders.length) {
      body += '<div class="ck-card" style="margin-top:12px">' +
        '<div class="ck-card-head"><h2>订货明细</h2>' +
          '<span class="ck-hint">每笔单独对门槛，金额不相加' +
            (r.dateTolerance ? ' · 发货比登记晚 1 天，容差 ±' + r.dateTolerance + ' 天' : '') + '</span></div>' +
        '<div class="ck-card-body" style="padding:0">' +
        '<div class="ck-table-wrap" style="border:0;border-radius:0;max-height:300px">' +
        '<table class="ck-table" style="font-size:12.5px"><thead><tr>' +
          '<th style="min-width:118px">订货日期</th>' +
          '<th class="ck-cell-num" style="min-width:110px">金额</th>' +
          '<th class="ck-cell-num" style="min-width:96px">门槛</th>' +
          '<th class="ck-cell-num" style="min-width:100px">与门槛差</th>' +
          '<th style="min-width:92px">结果</th>' +
          '<th style="min-width:72px">行数</th>' +
          '<th style="min-width:120px">Sheet</th>' +
          '<th style="min-width:80px">行号</th>' +
        '</tr></thead><tbody>';

      r.orders.forEach(function (o) {
        var inWin = o.inWindow !== false;
        var outWin = !inWin;
        body += '<tr style="' + (inWin ? 'background:var(--sunk);' : '') + (outWin ? 'opacity:.6;' : '') + '">' +
          '<td class="ck-num">' + U.esc(o.date || '—') +
            (inWin ? ' <span class="ck-pill" title="在发货日期（比登记晚 1 天）容差窗口内，参与本条判定">判定用</span>' : '') +
            (outWin ? ' <span class="ck-pill" title="不在「发货比登记晚 1 天」的容差窗口内">窗口外</span>' : '') + '</td>' +
          '<td class="ck-cell-num ck-num">' + (typeof o.amount === 'number' ? U.fmtMoney(o.amount) : '—') + '</td>' +
          '<td class="ck-cell-num ck-num ck-cell-muted">' + U.fmtThreshold(r.threshold) + '</td>' +
          '<td class="ck-cell-num">' + gapCell(o.gap, false) + '</td>' +
          '<td>' + UI.statusTag(o.pass ? 'pass' : 'fail') + '</td>' +
          '<td class="ck-cell-muted ck-num">' + o.rows + '</td>' +
          '<td class="ck-cell-muted ck-cell-clip">' + U.esc((o.sheets || []).join(' / ')) + '</td>' +
          '<td class="ck-cell-muted ck-num">' + U.esc((o.rowNums || []).join(',')) + '</td>' +
        '</tr>';
      });
      body += '</tbody></table></div></div></div>';
    }

    /* 门店匹配 */
    if (r.status === 'confirm' || r.status === 'unmatched-b' || r.status === 'unmatched-a') {
      body += '<div class="ck-card" style="margin-top:12px">' +
        '<div class="ck-card-head"><h2>门店匹配</h2>' +
          '<span class="ck-hint">拿不准的一律由你确认，程序不猜</span></div>' +
        '<div class="ck-card-body">' +
          (r.status === 'confirm' ? candidateListHtml(r) : '') +
          (canEdit ? '<div class="ck-divider"></div>' + aStoreSearchHtml(r) : '') +
          (canEdit ? '<div class="ck-row" style="margin-top:12px;gap:8px">' +
            '<button class="ck-btn is-sm is-danger" data-not-same>确认不是同一家</button>' +
            '<button class="ck-btn is-sm" data-add-alias>' + UI.icon('link') + '存入匹配库</button>' +
          '</div>' : '') +
        '</div>' +
      '</div>';
    }

    /* 重复 */
    if (r.isDup && r.dupInfo) {
      body += '<div class="ck-card" style="margin-top:12px">' +
        '<div class="ck-card-head"><h2>重复记录</h2><span class="ck-hint">同一 Sheet 内</span></div>' +
        '<div class="ck-card-body">';
      (r.dupInfo.exact || []).forEach(function (grp) {
        /* 外部清单往往没配金额列 —— 那就别硬报「金额都是 —」 */
        var hasAmt = typeof (grp[0] || {}).amount === 'number';
        body += '<div class="ck-inline-note is-bad" style="margin-bottom:8px">' + UI.icon('alert') +
          '<span><b>完全相同的行</b>：第 ' + grp.map(function (x) { return x.rowNum; }).join('、') + ' 行，' +
          (hasAmt ? '金额都是 ' + U.fmtMoney(grp[0].amount) + '，' : '门店与日期等字段完全一样，') +
          '共 ' + grp.length + ' 条。高度疑似重复录入。</span></div>';
      });
      (r.dupInfo.sameAmount || []).forEach(function (grp) {
        var dupOfExact = (r.dupInfo.exact || []).some(function (g) {
          return g[0] && grp[0] && g[0].rowNum === grp[0].rowNum;
        });
        if (dupOfExact) return;
        body += '<div class="ck-inline-note is-warn" style="margin-bottom:8px">' + UI.icon('info') +
          '<span><b>金额相同的行</b>：第 ' + grp.map(function (x) { return x.rowNum; }).join('、') + ' 行都是 ' +
          U.fmtMoney(grp[0].amount) + '，其它字段有差异。可能是两笔正常业务。</span></div>';
      });
      body += '<div class="ck-row" style="gap:8px;margin-top:6px">' +
        '<button class="ck-btn is-sm" data-mark-dup>确认为重复（记录一下）</button></div>';
      body += '</div></div>';
    }

    /* 原始行 */
    body += '<div class="ck-card" style="margin-top:12px">' +
      '<div class="ck-card-head"><h2>内部表原始行</h2>' +
        '<span class="ck-hint">' + (r.aRows && r.aRows.length ? r.aRows.length + ' 行' : '') + '</span></div>' +
      '<div class="ck-card-body">' + rawRowsTable(r.aRows, 'a', (r.aRows && r.aRows[0] ? r.aRows[0].sheet : '')) + '</div>' +
    '</div>';

    body += '<div class="ck-card" style="margin-top:12px">' +
      '<div class="ck-card-head"><h2>外部表原始行</h2>' +
        '<span class="ck-hint">' + U.esc(r.sheet) + (r.bRows && r.bRows.length ? ' · ' + r.bRows.length + ' 行' : '') + '</span></div>' +
      '<div class="ck-card-body">' + rawRowsTable(r.bRows, 'b', (r.bRows && r.bRows[0] ? r.bRows[0].sheet : r.sheet)) + '</div>' +
    '</div>';

    /* 处理记录 */
    body += '<div class="ck-card" style="margin-top:12px">' +
      '<div class="ck-card-head"><h2>处理记录</h2><span class="ck-hint">原始数据不会被改动</span></div>' +
      '<div class="ck-card-body">' +
        (r.manual && (r.manual.label || r.manual.note || r.manual.confirmed)
          ? '<dl class="ck-kv"><dt>处理结果</dt><dd>' + U.esc(r.manual.confirmed ? '已标记处理' : '已记录') + '</dd>' +
            '<dt>原因说明</dt><dd>' + U.esc(r.manual.label || r.manual.note || '—') + '</dd>' +
            '<dt>处理时间</dt><dd>' + U.esc(U.fmtDateTime(r.manual.at)) + '</dd></dl>'
          : '<div class="ck-small ck-muted">还没有人工处理记录。</div>') +
        '<div class="ck-row" style="gap:8px;margin-top:12px">' +
          '<button class="ck-btn is-sm" data-mark-reason>' + UI.icon('edit') + '标记差异原因</button>' +
          '<button class="ck-btn is-sm ' + (r.manual && r.manual.confirmed ? '' : 'is-soft') + '" data-mark-done>' +
            UI.icon('check') + (r.manual && r.manual.confirmed ? '取消已处理' : '标记已处理') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';

    var d = UI.drawer({
      title: r.storeName,
      sub: '<span style="font-size:12px">' + U.esc(r.sheet) + ' · ' + (UI.statusTag(r.status)) + '</span>',
      body: body
    });

    bindDrawer(d, r, canEdit);
  }

  function bindDrawer(d, r, canEdit) {
    var el = d.el;

    /* 选候选 */
    el.querySelectorAll('[data-pick-cand]').forEach(function (b) {
      b.onclick = function () {
        var aKey = b.getAttribute('data-pick-cand');
        var act = active();
        setOverride(r.bKey, aKey, r);
        d.close();
        if (act && act.isHistory) applyHistoryOverride(r, aKey);
        else rerun();
      };
    });

    /* 不是同一家 */
    var notSame = el.querySelector('[data-not-same]');
    if (notSame) {
      notSame.onclick = function () {
        var act = active();
        setOverride(r.bKey, '__none__', r);
        d.close();
        if (act && act.isHistory) applyHistoryOverride(r, '__none__');
        else rerun();
      };
    }

    /* 存入匹配库 */
    var addAlias = el.querySelector('[data-add-alias]');
    if (addAlias) {
      addAlias.onclick = function () {
        var aName = r.aRawName ? r.aRawName.split(' / ')[0] : '';
        if (!aName) { UI.toast('这一行还没有确定对应的 内部表门店，先选一个', 'warn'); return; }
        var variant = r.bRawName ? r.bRawName.split(' / ')[0] : '';
        if (!variant) { UI.toast('没有 外部表名称可以存', 'warn'); return; }
        DB.upsertAlias(variant, aName, { source: 'manual', note: '核对结果页确认' });
        UI.toast('已存入匹配库：' + variant + ' → ' + aName, 'ok', 3000);
        App.refreshBadges();
      };
    }

    /* 搜索 A 门店 */
    var search = el.querySelector('[data-astore-search]');
    if (search) {
      search.oninput = function () {
        var q = search.value.trim().toLowerCase();
        el.querySelectorAll('[data-astore]').forEach(function (rowEl) {
          var name = (rowEl.getAttribute('data-name') || '').toLowerCase();
          rowEl.style.display = (!q || name.indexOf(q) >= 0) ? '' : 'none';
        });
      };
    }

    /* 标记重复 */
    var markDup = el.querySelector('[data-mark-dup]');
    if (markDup) {
      markDup.onclick = function () {
        setManual(r, { label: '确认为重复记录', confirmed: true });
        d.close();
        App.render();
        App.refreshBadges();
      };
    }

    /* 标记原因 */
    var markReason = el.querySelector('[data-mark-reason]');
    if (markReason) {
      markReason.onclick = function () {
        UI.prompt({
          title: '标记差异原因',
          desc: '只是记录说明，不会改动任何金额。',
          label: '原因',
          value: (r.manual && r.manual.label) || '',
          placeholder: '例如：客户少付 200，已确认为扣款'
        }).then(function (v) {
          if (v === null) return;
          setManual(r, { label: v });
          UI.toast('已记录', 'ok');
          d.close();
          App.render();
        });
      };
    }

    /* 标记已处理 */
    var markDone = el.querySelector('[data-mark-done]');
    if (markDone) {
      markDone.onclick = function () {
        var cur = r.manual && r.manual.confirmed;
        setManual(r, { confirmed: !cur });
        UI.toast(cur ? '已取消处理标记' : '已标记处理', 'ok');
        d.close();
        App.render();
        App.refreshBadges();
      };
    }
  }

  /* ================= shipping 复核抽屉 =================
     需求七：人工复核模块。对不能自动确定的 B 发货记录，
     展示 B 原始记录 + A 候选订单 + 匹配理由，支持确认/改关联/备注/别名。 */

  function findShipRow(id) {
    var a = active();
    if (!a) return null;
    var arr = (id && id.indexOf('ra_') === 0) ? (a.rowsA || []) : (a.rowsB || []);
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    /* 跨视图找一遍 */
    var all = (a.rowsB || []).concat(a.rowsA || []);
    for (var j = 0; j < all.length; j++) if (all[j].id === id) return all[j];
    return null;
  }

  function openShipDrawer(rowId) {
    var a = active();
    var r = findShipRow(rowId);
    if (!r) return;
    var isA = rowId.indexOf('ra_') === 0;
    var canEdit = !a.isHistory && !!(st().aFile && st().bFile);
    var threshold = typeof a.meta.threshold === 'number' ? a.meta.threshold : 16000;
    var body = '';

    /* ---- 概要 ---- */
    if (isA) {
      /* 视图二：A 应包邮订单 */
      var found = r.bFound || r.status === 'found';
      body += '<div class="ck-card"><div class="ck-card-body">' +
        '<dl class="ck-kv">' +
          '<dt>门店</dt><dd><b>' + U.esc(r.storeName) + '</b></dd>' +
          '<dt>订单单号</dt><dd class="ck-mono">' + U.esc(r.orderNo || '—') + '</dd>' +
          '<dt>下单日期</dt><dd class="ck-num">' + U.esc(r.orderDate || '—') + '</dd>' +
          '<dt>订单金额</dt><dd class="ck-num">' + (typeof r.amount === 'number' ? U.fmtMoney(r.amount) : '—') + '</dd>' +
          '<dt>门槛</dt><dd class="ck-num">' + U.fmtThreshold(threshold) + '</dd>' +
          '<dt>距门槛</dt><dd>' + (typeof r.gap === 'number' ? UI.diffCell(r.gap) : '—') + '</dd>' +
          '<dt>B 表发货</dt><dd>' + (found ? '<span class="ck-tag is-ok">已找到</span>' : '<span class="ck-tag is-miss">未找到</span>') + '</dd>' +
          (found ? '<dt>对应物流</dt><dd>' + U.esc(r.bLogistics || '—') + '</dd>' +
                   '<dt>对应 Sheet</dt><dd>' + U.esc((r.bSheets || []).join('、') || '—') + '</dd>' +
                   '<dt>B 单号</dt><dd class="ck-mono">' + U.esc(r.bOrderNo || '—') + '</dd>' : '') +
          '<dt>A 行号</dt><dd class="ck-mono">' + U.esc((r.aRowNums || []).join(',') || '—') + '</dd>' +
        '</dl>' +
        (r.note ? '<div class="ck-inline-note is-warn" style="margin-top:12px">' + UI.icon('info') +
          '<span>' + U.esc(r.note) + '</span></div>' : '') +
        '<div class="ck-small ck-muted" style="margin-top:10px">找不到 B 记录不一定代表漏发，可能是未发货或跨月发货，标「待核实」即可。</div>' +
      '</div></div>';
    } else {
      /* 视图一：B 发货记录 */
      body += '<div class="ck-card"><div class="ck-card-body">' +
        '<dl class="ck-kv">' +
          '<dt>B 门店</dt><dd><b>' + U.esc(r.bStoreName || '—') + '</b></dd>' +
          '<dt>A 门店</dt><dd>' + U.esc(r.aStoreName || '—') + '</dd>' +
          '<dt>B 物流单号</dt><dd class="ck-mono">' + U.esc(r.bOrderNo || '—') + '</dd>' +
          '<dt>A 订单单号</dt><dd class="ck-mono">' + U.esc(r.aOrderNo || '—') + '</dd>' +
          '<dt>B 发货日期</dt><dd class="ck-num">' + U.esc(r.bShipDate || '—') + '</dd>' +
          '<dt>A 下单日期</dt><dd class="ck-num">' + U.esc(r.aOrderDate || '—') + '</dd>' +
          '<dt>A 订单金额</dt><dd class="ck-num">' + (typeof r.aAmount === 'number' ? U.fmtMoney(r.aAmount) : '—') + '</dd>' +
          '<dt>门槛</dt><dd class="ck-num">' + U.fmtThreshold(threshold) + '</dd>' +
          '<dt>日期分层</dt><dd>' + shipDateCell(r) + ' <span class="ck-small ck-muted">' + U.esc(r.dateLabel || '') + '</span></dd>' +
          '<dt>核查结果</dt><dd><span class="ck-tag is-' + shipCatTone(r.category) + '">' + shipCatLabel(r.category) + '</span>' +
            (r.exceptionType ? ' <span class="ck-small ck-muted">' + U.esc(shipExceptionLabel(r)) + '</span>' : '') + '</dd>' +
          '<dt>匹配方式</dt><dd class="ck-small">' + U.esc(shipMethodLabel(r.matchMethod)) + '</dd>' +
          '<dt>物流公司</dt><dd>' + U.esc(r.logisticsCompany || r.bSheet || '—') + '</dd>' +
          '<dt>来源 Sheet</dt><dd>' + U.esc(r.bSheet || '—') + '</dd>' +
          '<dt>B 行号</dt><dd class="ck-mono">' + U.esc(r.bRowNum || '—') + '</dd>' +
          (r.suspectDup ? '<dt>疑似重复</dt><dd><span class="ck-tag is-diff">跨 Sheet 重复：' + U.esc((r.dupSheets || []).join('、')) + '</span></dd>' : '') +
        '</dl>' +
        (r.orderMissedButBackup ? '<div class="ck-inline-note is-info" style="margin-top:12px">' + UI.icon('info') +
          '<span><b>降级匹配</b>：B 表物流单号在 A 表中找不到，系统按门店+日期降级匹配到该候选订单并自动判定包邮。' +
          '可能是 A 表单号按品类分列（如常温/冻品）未覆盖该品类。如发现关联有误，可在下方改关联。</span></div>' : '') +
        (r.note && !r.orderMissedButBackup ? '<div class="ck-inline-note is-warn" style="margin-top:12px">' + UI.icon('alert') +
          '<span>' + U.esc(r.note) + '</span></div>' : '') +
      '</div></div>';

      /* ---- 候选 A 订单（异常时） ---- */
      if ((r.category === 'exception' || r.storeConflict) && (r.candidates || []).length) {
        body += '<div class="ck-card" style="margin-top:12px">' +
          '<div class="ck-card-head"><h2>A 表候选订单</h2>' +
            '<span class="ck-hint">系统找到这些可能对应的订单，请确认哪一笔是同一笔</span></div>' +
          '<div class="ck-card-body" style="padding:0">' +
          '<div class="ck-table-wrap" style="border:0;border-radius:0;max-height:280px">' +
          '<table class="ck-table" style="font-size:12.5px"><thead><tr>' +
            '<th>A 门店</th><th>订单单号</th><th>下单日期</th><th class="n">金额</th><th>相似度</th><th>方式</th><th></th>' +
          '</tr></thead><tbody>';
        (r.candidates || []).forEach(function (c) {
          body += '<tr>' +
            '<td>' + U.esc(c.aName || '—') + '</td>' +
            '<td class="ck-mono">' + U.esc(c.orderNo || '—') + '</td>' +
            '<td class="ck-small">' + U.esc(c.date || '—') + '</td>' +
            '<td class="n">' + (typeof c.amount === 'number' ? U.fmtMoney(c.amount) : '—') + '</td>' +
            '<td class="ck-small ck-muted">' + (c.score ? Math.round(c.score * 100) + '%' : '—') + '</td>' +
            '<td class="ck-small ck-muted">' + U.esc(shipMethodLabel(c.method)) + '</td>' +
            '<td>' + (canEdit ? '<button class="ck-btn is-xs is-soft" data-ship-pick="' + U.esc(c.aKey) + '"' +
              (c.orderNo ? ' data-ship-pick-no="' + U.esc(c.orderNo) + '"' : '') +
              '>确认这笔</button>' : '') + '</td>' +
          '</tr>';
        });
        body += '</tbody></table></div></div></div>';
      }

      /* ---- 操作按钮 ---- */
      if (canEdit && r.category === 'exception') {
        body += '<div class="ck-card" style="margin-top:12px"><div class="ck-card-body">' +
          '<div class="ck-row wrap" style="gap:8px">' +
            '<button class="ck-btn is-sm is-danger" data-ship-nomatch>标记无法匹配</button>' +
            (r.bStoreName ? '<button class="ck-btn is-sm" data-ship-alias>' + UI.icon('link') + '存入门店别名库</button>' : '') +
          '</div>' +
          '<div class="ck-small ck-muted" style="margin-top:6px">「确认这笔」=选定对应 A 订单后重算包邮结论；「无法匹配」=这条 B 记录在 A 表没有对应订单。</div>' +
        '</div></div>';
      }
    }

    /* ---- 处理记录 ---- */
    body += '<div class="ck-card" style="margin-top:12px">' +
      '<div class="ck-card-head"><h2>处理记录</h2><span class="ck-hint">原始数据不会被改动</span></div>' +
      '<div class="ck-card-body">' +
        (r.manual && (r.manual.label || r.manual.note || r.manual.confirmed)
          ? '<dl class="ck-kv"><dt>处理结果</dt><dd>' + U.esc(r.manual.confirmed ? '已标记处理' : '已记录') + '</dd>' +
            '<dt>原因说明</dt><dd>' + U.esc(r.manual.label || r.manual.note || '—') + '</dd>' +
            '<dt>处理时间</dt><dd>' + U.esc(U.fmtDateTime(r.manual.at)) + '</dd></dl>'
          : '<div class="ck-small ck-muted">还没有人工处理记录。</div>') +
        '<div class="ck-row" style="gap:8px;margin-top:12px">' +
          '<button class="ck-btn is-sm" data-ship-reason>' + UI.icon('edit') + '添加备注</button>' +
          '<button class="ck-btn is-sm ' + (r.manual && r.manual.confirmed ? '' : 'is-soft') + '" data-ship-done>' +
            UI.icon('check') + (r.manual && r.manual.confirmed ? '取消已处理' : '标记已处理') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';

    var title = isA ? (r.storeName || 'A 订单') : (r.bStoreName || r.bSheet || 'B 记录');
    var sub = '<span style="font-size:12px">' + U.esc(r.bSheet || (r.aSheets || []).join('、') || '') +
      ' · <span class="ck-tag is-' + shipCatTone(r.category) + '">' + shipCatLabel(r.category) + '</span></span>';
    var d = UI.drawer({ title: title, sub: sub, body: body });
    bindShipDrawer(d, r, canEdit);
  }

  function shipMethodLabel(m) {
    return m === 'order' ? '单号匹配'
      : m === 'backup' ? '门店+日期备用'
      : m === 'manual' ? '人工确认'
      : m === 'alias' ? '门店别名库'
      : m === 'exact' ? '精确'
      : m === 'contains' ? '包含'
      : m === 'fuzzy' ? '相似'
      : m === 'none' ? '未匹配'
      : (m || '—');
  }

  function bindShipDrawer(d, r, canEdit) {
    var el = d.el;

    /* 确认候选订单 */
    el.querySelectorAll('[data-ship-pick]').forEach(function (b) {
      b.onclick = function () {
        var aKey = b.getAttribute('data-ship-pick');
        var orderNo = b.getAttribute('data-ship-pick-no') || '';
        applyShipConfirm(r, aKey, orderNo);
        d.close();
      };
    });

    /* 标记无法匹配 */
    var noMatch = el.querySelector('[data-ship-nomatch]');
    if (noMatch) {
      noMatch.onclick = function () {
        applyShipNoMatch(r);
        d.close();
      };
    }

    /* 存入门店别名库 */
    var addAlias = el.querySelector('[data-ship-alias]');
    if (addAlias) {
      addAlias.onclick = function () {
        var aName = r.aStoreName || '';
        if (!aName) { UI.toast('这一行还没有确定对应的 A 门店，先确认一笔订单', 'warn'); return; }
        var variant = r.bStoreName || '';
        if (!variant) { UI.toast('没有 B 门店名可以存', 'warn'); return; }
        DB.upsertAlias(variant, aName, { source: 'manual', note: '包邮发货核查确认' });
        UI.toast('已存入匹配库：' + variant + ' → ' + aName, 'ok', 3000);
        App.refreshBadges();
      };
    }

    /* 添加备注 */
    var reason = el.querySelector('[data-ship-reason]');
    if (reason) {
      reason.onclick = function () {
        UI.prompt({
          title: '添加备注',
          desc: '只记录说明，不改动任何原始数据与匹配结果。',
          label: '备注',
          value: (r.manual && r.manual.label) || '',
          placeholder: '例如：客户改址，已与仓库电话确认'
        }).then(function (v) {
          if (v === null) return;
          setShipManual(r, { label: v });
          UI.toast('已记录', 'ok');
          d.close();
          App.render();
        });
      };
    }

    /* 标记已处理 */
    var done = el.querySelector('[data-ship-done]');
    if (done) {
      done.onclick = function () {
        var cur = r.manual && r.manual.confirmed;
        setShipManual(r, { confirmed: !cur });
        UI.toast(cur ? '已取消处理标记' : '已标记处理', 'ok');
        d.close();
        App.render();
        App.refreshBadges();
      };
    }
  }

  /* 确认某条 B 记录对应某笔 A 订单 → 就地重算该行 + 统计 */
  function applyShipConfirm(row, aKey, orderNo) {
    var a = active();
    var threshold = typeof a.meta.threshold === 'number' ? a.meta.threshold : 16000;
    /* 在 rowsB 同店的候选里找到这笔订单的金额/日期 */
    var cand = null;
    (row.candidates || []).forEach(function (c) {
      if (c.aKey === aKey && (!orderNo || c.orderNo === orderNo)) cand = c;
    });
    if (!cand) { UI.toast('找不到这笔候选订单的明细', 'warn'); return; }

    row.aStoreName = cand.aName || row.aStoreName;
    row.aOrderNo = cand.orderNo || '';
    row.aOrderDate = cand.date || null;
    row.aAmount = (typeof cand.amount === 'number') ? cand.amount : null;
    row.matchMethod = 'manual';
    row.note = '人工确认：对应 A 订单 ' + (cand.orderNo || cand.aName);

    /* 重算 category：金额达门槛=correct，否则=wrong */
    if (typeof row.aAmount === 'number') {
      if (row.aAmount + 1e-9 >= threshold) {
        row.category = 'correct';
        row.exceptionType = '';
      } else {
        row.category = 'wrong';
        row.exceptionType = '';
      }
    } else {
      row.category = 'exception';
      row.exceptionType = 'needConfirm';
      row.note = '人工确认了对应关系，但 A 订单金额无法解析，请核查原始行';
    }

    recalcShipStats(a);
    persistShipResult(a);
    UI.toast('已确认对应关系，包邮结论已重算', 'ok', 2600);
    App.render();
    App.refreshBadges();
  }

  /* 标记无法匹配 */
  function applyShipNoMatch(row) {
    var a = active();
    row.category = 'exception';
    row.exceptionType = 'noMatch';
    row.aStoreName = '';
    row.aOrderNo = '';
    row.aOrderDate = null;
    row.aAmount = null;
    row.matchMethod = 'none';
    row.note = '人工确认：A 表中没有对应订单';
    recalcShipStats(a);
    persistShipResult(a);
    UI.toast('已标记无法匹配', 'ok');
    App.render();
    App.refreshBadges();
  }

  /* 重算 shipping 统计（rowsB + rowsA + sheetStats 派生字段） */
  function recalcShipStats(a) {
    var rowsB = a.rowsB || [];
    var rowsA = a.rowsA || [];
    var sheetStats = a.sheetStats || [];
    /* sheetStats 的派生字段从 rowsB 重数；rawRows/readRows/logistics/hasOrder 保留 */
    sheetStats.forEach(function (ss) {
      var sheetRows = rowsB.filter(function (r) { return r.bSheet === ss.sheetName; });
      ss.checkedRows = sheetRows.length;
      ss.matchedRows = sheetRows.filter(function (r) { return r.category === 'correct' || r.category === 'wrong'; }).length;
      ss.needConfirm = sheetRows.filter(function (r) { return r.category === 'exception' && r.exceptionType === 'needConfirm'; }).length;
      ss.exceptionRows = sheetRows.filter(function (r) { return r.category === 'exception'; }).length;
      ss.unprocessed = sheetRows.filter(function (r) { return r.category === 'exception' && (r.exceptionType === 'noMatch' || r.exceptionType === 'orderNotFound'); }).length;
    });
    a.stats = window.CKRecon.calcShippingStats(rowsB, rowsA, sheetStats, null);
  }

  /* 持久化 shipping 结果到历史 + 当前 */
  function persistShipResult(a) {
    if (a.isHistory && a.history) {
      DB.updateHistory(a.history.id, { stats: a.stats, rowsB: a.rowsB, rowsA: a.rowsA, sheetStats: a.sheetStats });
    } else if (st().resultMeta && st().resultMeta.historyId) {
      var h = DB.getHistory(st().resultMeta.historyId);
      if (h) DB.updateHistory(h.id, { stats: a.stats, rowsB: a.rowsB, rowsA: a.rowsA, sheetStats: a.sheetStats });
    }
    DB.persist(true);
  }

  function setShipManual(r, patch) {
    r.manual = Object.assign({}, r.manual || {}, patch, { at: Date.now() });
    var a = active();
    if (a && a.isHistory && a.history) {
      syncShipManual(a.history, r);
      DB.persist(true);
    } else if (st().resultMeta && st().resultMeta.historyId) {
      var h = DB.getHistory(st().resultMeta.historyId);
      if (h) { syncShipManual(h, r); DB.persist(true); }
    }
  }

  function syncShipManual(hist, r) {
    (hist.rowsB || []).forEach(function (hr) { if (hr.id === r.id) hr.manual = r.manual; });
    (hist.rowsA || []).forEach(function (hr) { if (hr.id === r.id) hr.manual = r.manual; });
  }

  /* ---------------- 人工处理的数据写入 ---------------- */

  function setOverride(bKey, aKey, row) {
    var s = st();
    s.overrides = s.overrides || {};
    s.overrides[bKey] = aKey;
    DB.setPref('lastOverride.' + bKey, aKey);
    UI.toast(aKey === '__none__' ? '已标记为「不是同一家」' : '已确认对应关系，正在重新计算', 'ok', 2400);
  }

  /* 历史记录里没有原始文件，不能整单重算 —— 但这一行判定需要的
     orders / threshold / 容差都存在历史快照里，就地重算这一行 + 统计即可。
     之前这里直接 return，弹了「已确认」的提示却什么都不做 = 用户看到的「没反应」。 */
  function dayIndexOf(dateStr) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ''));
    if (!m) return null;
    return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000);
  }

  function applyHistoryOverride(row, target) {
    var a = active();
    if (!a || !a.isHistory) return;
    var thr = typeof row.threshold === 'number' ? row.threshold : 16000;
    var tol = typeof row.dateTolerance === 'number' ? row.dateTolerance : 1;
    var isAStore = row.id && row.id.indexOf('r_a_') === 0;

    if (target === '__none__') {
      if (isAStore) {
        /* A 驱动的行：这家内部店失去了这个 B 对应，退回「清单外」（A 订够了、B 清单没有） */
        row.bKey = null;
        row.bRawName = '';
        row.bRows = [];
        row.bRowNums = [];
        row.status = 'pass';
        row.notInB = true;
        row.note = '你已确认：B 表这家店不是这家内部店';
      } else {
        row.aKey = null;
        row.status = 'unmatched-b';
        row.note = '你已确认：内部表中没有对应门店';
      }
    } else if (isAStore && target !== row.aKey) {
      /* 用户选了另一家内部店：历史里没法把 B 对应搬去另一行，退回清单外并提示重跑 */
      row.bKey = null;
      row.bRawName = '';
      row.bRows = [];
      row.bRowNums = [];
      row.status = 'pass';
      row.notInB = true;
      row.note = '你已确认：B 表这家店是另一家内部店，请回「新建核对」重跑以落到正确门店';
    } else {
      row.aKey = target;
      row.matchStatus = 'manual';
      row.matchMethod = 'manual';
      row.matchScore = 1;

      var orders = row.orders || [];
      var bDate0 = row.bDate || (row.bDates && row.bDates[0]) || null;
      var aHasDates = orders.some(function (o) { return !!o.date; });
      var usable = !!bDate0 && aHasDates;
      var win = orders;
      if (usable) {
        var bi = dayIndexOf(bDate0);
        win = bi === null ? [] : orders.filter(function (o) {
          var x = dayIndexOf(o.date);
          if (x === null) return false;
          var lag = bi - x;   /* 发货 − 登记，正常应 ≈ 1 天 */
          return lag >= 0 && Math.abs(lag - 1) <= tol;
        });
      }
      /* 同步窗口标记，抽屉里的「判定用 / 窗口外」跟着重算走 */
      orders.forEach(function (o) { o.inWindow = usable ? win.indexOf(o) >= 0 : true; });

      var best = null;
      win.forEach(function (o) {
        if (typeof o.amount !== 'number') return;
        if (!best || o.amount > best.amount) best = o;
      });

      if (usable && !win.length) {
        row.status = 'fail';
        row.aAmount = null; row.gap = null; row.selectedDate = null;
        row.note = 'B 表发货日期 ' + bDate0 + '（应比登记晚 1 天）±' + tol + ' 天容差内，没找到这家店的订货记录';
      } else if (!best) {
        row.status = 'confirm';
        row.note = '内部表这家门店的订货金额没能解析出来，请打开原始行确认';
      } else if (best.amount + 1e-9 >= thr) {
        row.status = 'pass';
        row.aAmount = best.amount; row.gap = window.CKRecon.round2(best.amount - thr); row.selectedDate = best.date;
        row.note = '';
      } else {
        row.status = 'fail';
        row.aAmount = best.amount; row.gap = window.CKRecon.round2(best.amount - thr); row.selectedDate = best.date;
        row.note = '距门槛还差 ' + U.fmtMoney(thr - best.amount);
      }
      row.orderCount = orders.length;
      row.multiOrder = orders.length > 1;
      row.passOrderCount = orders.filter(function (o) { return o.pass; }).length;
    }

    /* 统计就地重算：以 A 表为主的新口径下，aOnly 等直接从行里数出来 */
    var old = a.stats || {};
    var ns = window.CKRecon.calcThresholdStats(a.rows, thr, null, null, old.bRawRows || 0, old.aRawRows || 0);
    a.stats = ns;

    if (a.history) {
      DB.updateHistory(a.history.id, { stats: ns, rows: a.rows, overrides: st().overrides });
    }
    DB.persist(true);
    App.render();
    App.refreshBadges();
  }

  function setManual(r, patch) {
    r.manual = Object.assign({}, r.manual || {}, patch, { at: Date.now() });
    /* 同步到历史记录（同一个 id） */
    var a = active();
    if (a && a.isHistory && a.history) {
      (a.history.rows || []).forEach(function (hr) {
        if (hr.id === r.id) hr.manual = r.manual;
      });
      DB.persist(true);
    } else if (st().resultMeta && st().resultMeta.historyId) {
      var h = DB.getHistory(st().resultMeta.historyId);
      if (h) {
        (h.rows || []).forEach(function (hr) {
          if (hr.id === r.id) hr.manual = r.manual;
        });
        DB.persist(true);
      }
    }
  }

  /* 用人工覆盖重新装配结果（不重新解析 Excel） */
  function rerun() {
    var s = st();
    if (s.historyView) { App.render(); return; }
    if (!s.aFile || !s.bFile || !s.aMap) {
      UI.toast('原始文件已不在内存，无法重算；请重新上传后再核对', 'warn', 4000);
      App.render();
      return;
    }
    try {
      var input = {
        aFile: s.aFile,
        bFile: s.bFile,
        aSheets: s.aSheets,
        aMap: s.aMap,
        bSheets: s.bFile.sheets.filter(function (x) { return s.bSelected.indexOf(x.name) >= 0; })
          .map(function (sh) { return { sheetName: sh.name, map: s.bMaps[sh.name] }; }),
        aliases: DB.listAliases(),
        overrides: s.overrides,
        /* 重算必须沿用这份结果自己的门槛 ——
           否则门槛改过之后再点「确认对应关系」，达标结论会按新门槛重判 */
        mode: (s.resultMeta && s.resultMeta.mode) || 'threshold',
        threshold: s.resultMeta && typeof s.resultMeta.threshold === 'number'
          ? s.resultMeta.threshold : s.threshold,
        dateTolerance: s.resultMeta && typeof s.resultMeta.dateTolerance === 'number'
          ? s.resultMeta.dateTolerance
          : (Number(DB.getRules().dateTolerance) >= 0 ? Number(DB.getRules().dateTolerance) : 1),
        autoThreshold: DB.getRules().autoThreshold,
        softThreshold: DB.getRules().softThreshold
      };
      var result = window.CKRecon.run(input);
      /* 保留已处理的标记 */
      var prevManual = {};
      (s.result ? s.result.rows : []).forEach(function (r) { if (r.manual) prevManual[r.id] = r.manual; });
      result.rows.forEach(function (r) { if (prevManual[r.id] && !r.manual) r.manual = prevManual[r.id]; });

      s.result = result;
      if (s.resultMeta) s.resultMeta.mergeSheets = !!s.mergeSheets;

      /* 历史快照整份跟着更新：统计和行必须一起换，只换一半会让两处数字互相矛盾 */
      if (s.resultMeta && s.resultMeta.historyId) {
        DB.updateHistory(s.resultMeta.historyId, {
          stats: result.stats,
          rows: result.rows,
          overrides: s.overrides,
          elapsed: result.elapsed
        });
      }

      App.render();
      App.refreshBadges();
    } catch (e) {
      console.error('[rerun]', e);
      UI.toast('重算失败：' + (e && e.message || '未知错误'), 'bad');
    }
  }

  /* ---------------- 页面 ---------------- */

  function bind(el) {
    var goNew = el.querySelector('[data-act="goNew"]');
    if (goNew) goNew.onclick = function () { App.go('new'); };

    var back = el.querySelector('[data-act="backToLatest"]');
    if (back) back.onclick = function () {
      st().historyView = null;
      App.render();
    };

    /* shipping 视图切换 */
    el.querySelectorAll('[data-ship-view]').forEach(function (b) {
      b.onclick = function () {
        st().shipView = b.getAttribute('data-ship-view');
        st().shipFilter = 'all';
        App.render();
      };
    });
    /* shipping 视图一筛选 */
    el.querySelectorAll('[data-ship-filter]').forEach(function (b) {
      b.onclick = function () {
        st().shipFilter = b.getAttribute('data-ship-filter');
        App.render();
      };
    });

    bindBody(el);

    var merge = el.querySelector('[data-merge]');
    if (merge) {
      merge.onchange = function () {
        st().mergeSheets = merge.checked;
        if (st().resultMeta) st().resultMeta.mergeSheets = merge.checked;
        UI.toast(merge.checked ? '已按你的确认合并跨表金额重算' : '已恢复各表独立比对', 'ok');
        rerun();
      };
    }
  }

  function bindBody(el) {
    /* 筛选 */
    el.querySelectorAll('[data-filter]').forEach(function (b) {
      b.onclick = function () {
        st().resultFilter = b.getAttribute('data-filter');
        st().resultPage = 1;
        App.render();
      };
    });

    /* 搜索 */
    var search = el.querySelector('[data-search]');
    if (search) {
      var t = null;
      search.oninput = function () {
        if (t) clearTimeout(t);
        var v = search.value;
        t = setTimeout(function () {
          st().resultSearch = v;
          st().resultPage = 1;
          repaint();
        }, 220);
      };
      /* 重绘后把光标放回输入框末尾 */
      if (st().resultSearch) {
        search.focus();
        search.setSelectionRange(search.value.length, search.value.length);
      }
    }

    /* 排序 */
    var sort = el.querySelector('[data-sort]');
    if (sort) {
      sort.onchange = function () {
        st().resultSort = sort.value;
        st().resultPage = 1;
        repaint();
      };
    }

    /* 去掉重复门店：计数和表格一起变，必须整页重绘 */
    var dedup = el.querySelector('[data-dedup]');
    if (dedup) {
      dedup.onchange = function () {
        st().resultDedup = dedup.checked;
        st().resultPage = 1;
        App.render();
      };
    }

    /* 每页条数 */
    var pgsize = el.querySelector('[data-pgsize]');
    if (pgsize) {
      pgsize.onchange = function () {
        st().resultPageSize = Number(pgsize.value) || 50;
        st().resultPage = 1;
        repaint();
      };
    }

    /* 翻页 */
    el.querySelectorAll('[data-pg]').forEach(function (b) {
      b.onclick = function () {
        st().resultPage = Number(b.getAttribute('data-pg'));
        repaint();
      };
    });

    /* 行操作 */
    el.querySelectorAll('[data-act-row]').forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        openDrawer(b.getAttribute('data-act-row'));
      };
    });
    el.querySelectorAll('tr[data-row]').forEach(function (tr) {
      tr.onclick = function () { openDrawer(tr.getAttribute('data-row')); };
    });

    /* shipping 模式：行点击打开复核抽屉 */
    el.querySelectorAll('tr[data-ship-row]').forEach(function (tr) {
      tr.onclick = function () { openShipDrawer(tr.getAttribute('data-ship-row')); };
    });
  }

  function repaint() {
    var host = document.getElementById('ckResBody');
    if (!host) { App.render(); return; }
    host.innerHTML = bodyHtml();
    bindBody(document.getElementById('ckView'));
  }

  window.CKPages.result = {
    title: function () {
      var a = active();
      return a && a.isHistory ? '核对结果（历史）' : '核对结果';
    },
    subtitle: function () {
      var a = active();
      if (!a) return '还没有进行过核对';
      var s = a.stats || {};
      if (a.meta.mode === 'threshold') {
        var todo = (s.fail || 0) + (s.needConfirm || 0) + (s.unmatched || 0);
        return todo
          ? (todo + ' 条核对需要你跟进：未达标 ' + (s.fail || 0) + ' · 未找到 ' + (s.unmatchedB || 0) + ' · 待确认 ' + (s.needConfirm || 0))
          : ('B 表 ' + (s.total || 0) + ' 条记录全部对应上');
      }
      var bad = (s.amountDiff || 0) + (s.needConfirm || 0) + (s.unmatched || 0);
      return bad ? (bad + ' 项需要你跟进') : '全部核对完成，没有需要跟进的项目';
    },
    topActions: function () {
      var a = active();
      if (!a) return '';
      var isFs = !!(document.fullscreenElement);
      return '<button class="ck-btn" data-top="fullscreen" title="全屏查看结果，退出按 Esc">' +
          UI.icon(isFs ? 'shrink' : 'expand') + (isFs ? '退出全屏' : '全屏') + '</button>' +
        '<button class="ck-btn" data-top="export">' + UI.icon('download') + '导出 Excel</button>' +
        (a.isHistory ? '' : '<button class="ck-btn is-soft" data-top="new">' + UI.icon('plus') + '再核对一次</button>');
    },
    render: render,
    mount: function (el) {
      bind(el);

      var ex = document.querySelector('[data-top="export"]');
      if (ex) {
        ex.onclick = function () {
          var a = active();
          if (!a) return;
          try {
            var name = window.CKExport.download(a, a.meta);
            UI.toast('已导出：' + name, 'ok', 3200);
          } catch (e) {
            console.error(e);
            UI.toast('导出失败：' + (e && e.message || '未知错误'), 'bad');
          }
        };
      }
      var nn = document.querySelector('[data-top="new"]');
      if (nn) nn.onclick = function () { App.go('new'); };

      /* 全屏：把主内容区（不含侧栏）推入浏览器全屏，让 11 列表格铺满整屏。
         退出全屏会触发 fullscreenchange 重渲染，按钮文案跟着变回「全屏」。 */
      var fsBtn = document.querySelector('[data-top="fullscreen"]');
      if (fsBtn) {
        fsBtn.onclick = function () {
          if (document.fullscreenElement) {
            if (document.exitFullscreen) document.exitFullscreen();
          } else {
            var main = document.querySelector('.ck-main');
            if (main && main.requestFullscreen) {
              main.requestFullscreen().catch(function () {
                UI.toast('浏览器不允许全屏，试试点击页面后重试', 'warn');
              });
            } else {
              UI.toast('当前浏览器不支持全屏', 'warn');
            }
          }
        };
      }
    }
  };
})();

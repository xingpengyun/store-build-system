/* ==========================================================
   page-ship.js — 发货看板
   2026-10-24：用户确认「不安排发货，我们通知就行了」——
   计划发货日整套去掉（不排期、不看谁该发、没有逾期未发）。
   2026-10-25：撤掉的只是「实发日期」那个输入框，不是「一件发出」本身。
   现在一颗胶囊管整家店：点成「已发出」= 这家店所有物料一起记为已通知供应商、
   行沉到表格底部；再点一次 = 全部退回「待通知」。
   ========================================================== */
window.Pages = window.Pages || {};

window.Pages.ship = (function () {
  'use strict';

  var U = window.Utils;
  var S = window.Store;
  var C = window.CONST;

  var state = { tab: 'all', q: '', view: 'store', dtab: 'all' };

  /* 顶部这排既能看数，也能点进去只看这一类 */
  var TABS = [
    { key: 'all', label: '全部', tip: '所有门店' },
    { key: 'notify', label: '该通知供应商', tip: '有物料 7 天内到、还没通知供应商；已经有过了到货日的算进「漏通知」，不重复算' },
    { key: 'arrlate', label: '漏通知', tip: '有物料已经过了到货日还没通知供应商，最急' }
  ];

  /* 「按到货日」视图的分类：一条物料一条记录，日期各店不同也能一眼看完 */
  var DTABS = [
    { key: 'all', label: '全部' },
    { key: 'pending', label: '待通知' },
    { key: 'late', label: '漏通知' },
    { key: 'today', label: '今天到' },
    { key: 'soon', label: '7 天内到' },
    { key: 'noeta', label: '没填日期' },
    { key: 'notified', label: '已通知' }
  ];

  function hitD(r, key) {
    if (!key || key === 'all') return true;
    if (key === 'pending') return !r.notified;
    if (key === 'late') return r.late;
    if (key === 'today') return r.today;
    if (key === 'soon') return r.soon;
    if (key === 'noeta') return !r.hasEta && !r.notified;
    if (key === 'notified') return r.notified;
    return true;
  }

  function dStats(rows) {
    var s = { all: rows.length, late: 0, today: 0, soon: 0, noeta: 0, notified: 0, pending: 0, stores: {}, pendingStores: {} };
    rows.forEach(function (r) {
      s.stores[r.storeId] = 1;
      if (r.notified) { s.notified += 1; return; }
      s.pending += 1;
      s.pendingStores[r.storeId] = 1;
      if (r.late) s.late += 1;
      if (r.today) s.today += 1;
      if (r.soon) s.soon += 1;
      if (!r.hasEta) s.noeta += 1;
    });
    s.storeCount = Object.keys(s.stores).length;
    s.pendingCount = Object.keys(s.pendingStores).length;
    return s;
  }

  function filteredDates(rows) {
    var q = String(state.q || '').trim().toLowerCase();
    return rows.filter(function (r) {
      if (!hitD(r, state.dtab)) return false;
      if (!q) return true;
      return (r.storeName + ' ' + r.province + ' ' + r.item + ' ' + r.owner)
        .toLowerCase().indexOf(q) >= 0;
    });
  }

  function hitTab(r, key) {
    if (!key || key === 'all') return true;
    if (key === 'notify') return r.needNotify;
    if (key === 'arrlate') return r.arrLate;
    return true;
  }

  function filtered(rows) {
    var q = String(state.q || '').trim().toLowerCase();
    return rows.filter(function (r) {
      if (!hitTab(r, state.tab)) return false;
      if (!q) return true;
      return (r.name + ' ' + r.province + ' ' + r.owner).toLowerCase().indexOf(q) >= 0;
    });
  }

  /* ---------------- 一行 ---------------- */

  /* 2026-10-24 起没有「计划发货日」；2026-10-25 起「实发日期」输入框也撤了。
     「一件发出」这颗胶囊保留：整家店一键，点一下 = 全店物料都通知过供应商了。 */

  /* 「一件发出」这一列：只有一颗胶囊，什么小字都不加（2026-10-25 用户要求
     依次撤掉了「最早 11.3 到」和「N 天后开业」——这一列只留一个动作/状态）。
     未发出时胶囊写动作「一键发出」，点了整店物料一起记为已通知；已发出写「已发出」。 */
  function sentHtml(r) {
    var list = C.SHIP_STATUS || [];
    var key = r.shipped ? 'sent' : 'todo';
    var st = null;
    for (var i = 0; i < list.length; i++) if (list[i].key === key) st = list[i];
    var label = r.shipped ? (st ? st.label : '已发出') : '一键发出';

    return '<button type="button" class="ship-st ' + (r.shipped ? 'is-sent' : 'is-todo') + '" data-sent' +
        ' title="' + (r.shipped
          ? '点一下取消：全店 ' + (r.total || 0) + ' 项物料一起退回「待通知」'
          : '点一下：整店记为已发出，' + (r.pending || 0) + ' 项未通知的物料一起记为已通知') + '">' +
        '<i></i>' + label +
      '</button>';
  }

  var MAT_MAX = 8;   /* 物料列宽，多铺几条 */

  /* 一家店还要催的物料 + 登记的到货时间，全部铺在这一行里 ——
     不用点进门店也知道这家哪天到货、哪条漏通知了。
     2026-10-24 用户要求：已通知的不在此处显示，只留未通知的，并且要看得清楚。 */
  function matsHtml(r) {
    var all = r.mats || [];
    var pend = all.filter(function (m) { return !m.notified; });

    if (!pend.length) {
      if (all.length) {
        return '<span class="sm-none is-ok">物料都通知过了 · 共 ' + all.length + ' 项</span>';
      }
      return '<span class="sm-none">还没录物料 · 点门店名进去录</span>';
    }

    var watch = Number(C.ARR_WATCH_DAYS || 7);
    var html = pend.slice(0, MAT_MAX).map(function (m) {
      var cls = m.d == null ? 'is-nodate'
        : m.d < 0 ? 'is-late'
          : m.d <= watch ? 'is-soon' : '';

      var when = m.eta ? U.dateDot(m.eta) : '没日期';
      var tail = '';
      if (m.d != null) {
        tail = m.d < 0 ? '过' + (-m.d) + '天'
          : m.d === 0 ? '今天'
            : m.d + '天后';
      }

      var tip = m.item + (m.qty ? ' ×' + m.qty : '') +
        '：' + (m.eta ? m.eta.slice(5) + ' 到货' : '还没填到货时间') +
        '（待通知供应商）';

      return '<span class="sm-chip ' + cls + '" title="' + U.esc(tip) + '">' +
        '<b class="sm-when mono">' + when + '</b>' +
        '<span class="sm-item">' + U.esc(m.item) + (m.qty ? '<i>×' + m.qty + '</i>' : '') + '</span>' +
        (tail ? '<span class="sm-tail">' + tail + '</span>' : '') +
      '</span>';
    }).join('');

    if (pend.length > MAT_MAX) {
      html += '<span class="sm-more" data-open title="还有 ' + (pend.length - MAT_MAX) + ' 条没通知，点开门店看全部">' +
        '+' + (pend.length - MAT_MAX) + ' 条</span>';
    }
    return html;
  }

  function rowHtml(r, idx) {
    var cls = [];
    if (r.arrLate) cls.push('is-arrlate');   /* 物料过了到货日还没通知 → 整行淡红底 */
    if (r.pin) cls.push('is-pin');
    if (r.shipped) cls.push('is-sent');      /* 已发出 → 整行淡一档（样式早就有，只是那阵子没挂上） */

    var openTxt = r.openLeft == null
      ? '开业日未定'
      : (r.openLeft < 0 ? '开业已过 ' + (-r.openLeft) + ' 天' : '距开业 ' + r.openLeft + ' 天');

    return '<tr data-ship="' + U.esc(r.id) + '" class="' + cls.join(' ') + '">' +
      '<td class="ship-idx-cell">' +
        '<span class="ship-idx">' + (idx + 1) + '</span>' +
        '<button type="button" class="ship-flag' + (r.pin ? ' is-on' : '') + '" data-pin' +
          ' title="' + (r.pin ? '取消先发' : '标记为先发，永远排最前') + '">' +
          '<span class="ship-flag-ico">★</span>' +
        '</button>' +
      '</td>' +

      '<td class="ship-store">' +
        '<div class="ship-name" data-open>' + U.esc(r.name) +
          (r.pin ? '<span class="ship-pin-tag">先发</span>' : '') + '</div>' +
        '<div class="ship-meta">' +
          (r.province ? U.esc(r.province) + ' · ' : '') +
          (r.owner ? U.esc(r.owner) + ' · ' : '') +
          '<span class="' + (r.openLeft != null && r.openLeft <= 14 ? 'text-red' : '') + '">' +
            U.esc(openTxt) + '</span>' +
        '</div>' +
      '</td>' +

      /* 这一列把这家店所有物料的到货时间铺开 */
      '<td class="ship-mats">' + matsHtml(r) + '</td>' +

      /* 一件发出：整店一键，不登记日期 */
      '<td class="ship-sent">' + sentHtml(r) + '</td>' +

      '<td class="ship-note-cell">' +
        '<input class="ship-note" data-note value="' + U.esc(r.note) + '"' +
          ' placeholder="点这里加备注" title="' + U.esc(r.note || '例如：等门店确认收货人') + '" />' +
      '</td>' +

      '<td class="ship-move">' +
        '<button type="button" class="ship-mv" data-move="-1" title="往上挪一位">' + UI.icon('arrow') + '</button>' +
        '<button type="button" class="ship-mv ship-mv-dn" data-move="1" title="往下挪一位">' + UI.icon('arrow') + '</button>' +
      '</td>' +
    '</tr>';
  }

  function tableHtml(rows) {
    if (!rows.length) {
      if (!S.getState().stores.length) {
        return UI.empty('还没有门店', '先在「门店管理」里建一家门店，发货看板会自动跟出来');
      }
      return UI.empty('这个筛选下没有门店', '换个分类或清空搜索看看');
    }

    return '<div class="table-wrap"><table class="tbl ship-tbl">' +
      '<thead><tr>' +
        '<th style="width:50px">顺序</th>' +
        '<th style="width:168px">门店 / 开业</th>' +
        '<th>物料 · 登记的到货时间（只列未通知）' +
          '<span class="th-legend"><i class="is-late"></i>过了到货日<i class="is-soon"></i>7 天内到<i class="is-nodate"></i>没填日期</span>' +
        '</th>' +
        '<th style="width:112px">一件发出</th>' +
        '<th style="width:138px">备注</th>' +
        '<th style="width:44px"></th>' +
      '</tr></thead><tbody>' +
      rows.map(function (r, i) { return rowHtml(r, i); }).join('') +
      '</tbody></table></div>';
  }

  /* ---------------- 顶部 ---------------- */

  /* 横幅「最急」那句话的理由：现在只有到货漏通知一种 */
  function reasonText(r) {
    if (r.arrLate) return r.lateArr + ' 项物料过了到货日还没通知供应商';
    return '';
  }

  function bannerHtml(rows, s) {
    var arrLate = rows.filter(function (r) { return r.arrLate; });
    var notify = rows.filter(function (r) { return r.needNotify; });

    if (!arrLate.length) {
      return '<div class="ship-banner is-ok">' +
        '<span class="sb-ico">' + UI.icon('check') + '</span>' +
        '<div class="sb-body"><b>没有漏通知的物料</b>' +
          '<span>' + (notify.length
            ? notify.length + ' 家物料 7 天内到，今天该通知供应商发货'
            : '每家店的到货时间都铺在下面表格里，到点前通知供应商就行') +
          '</span></div>' +
      '</div>';
    }

    var first = arrLate[0];

    return '<div class="ship-banner is-alert">' +
      '<span class="sb-ico">' + UI.icon('alert') + '</span>' +
      '<div class="sb-body">' +
        '<b><b>' + arrLate.length + '</b> 家物料过了到货日还没通知供应商</b>' +
        '<span>最急：' + U.esc(first.name) + '（' + U.esc(reasonText(first)) + '）　·　先去处理这几家</span>' +
      '</div>' +
      '<button type="button" class="btn btn-sm" data-act="focus">只看这几家</button>' +
    '</div>';
  }

  function kpiHtml(rows, s) {
    var items = [
      { k: 'notify', label: '该通知供应商', v: s.notify, foot: '7 天内到，可以先通知', color: '#7a5af8', soft: '#f2eefe', icon: 'bell',
        tip: '有物料 7 天内到（含今天）、还没通知供应商。已经过了到货日的不算在这里，算进「漏通知」' },
      { k: 'arrlate', label: '漏通知', v: s.arrLate, foot: '过了到货日还没通知', color: '#d92d20', soft: '#fdedeb', icon: 'box',
        tip: '有物料已经过了到货日还没通知供应商 —— 最急，先去处理这几家' }
    ];

    return '<section class="kpi-grid fade-up" style="grid-template-columns:repeat(2,minmax(0,1fr));animation-delay:.04s">' +
      items.map(function (i) {
        return '<div class="kpi ship-kpi' + (state.tab === i.k ? ' is-on' : '') + '" data-kpi="' + i.k + '" title="' + U.esc(i.tip) + '">' +
          '<span class="kpi-icon" style="background:' + i.soft + ';color:' + i.color + '">' + UI.icon(i.icon) + '</span>' +
          '<div class="kpi-body">' +
            '<div class="kpi-label">' + i.label + '</div>' +
            '<div class="kpi-value">' + i.v + '</div>' +
            '<div class="kpi-foot">' + i.foot + '</div>' +
          '</div>' +
        '</div>';
      }).join('') +
    '</section>';
  }

  function tabsHtml(rows, s) {
    var n = {
      all: rows.length,
      notify: s.notify, arrlate: s.arrLate
    };
    return TABS.map(function (t) {
      return '<div class="tab' + (state.tab === t.key ? ' active' : '') + '" data-tab="' + t.key + '"' +
          ' title="' + U.esc(t.tip + '（' + (n[t.key] || 0) + ' 家）') + '">' +
        t.label + '<span class="cnt">' + (n[t.key] || 0) + '</span></div>';
    }).join('');
  }

  /* ---------------- 「按到货日」视图：一条物料一行 ---------------- */

  /* 这一天的状态：只要还有没通知的过期物料才算「红」，全通知过的只是历史记录 */
  function dayState(list) {
    var late = false, today = false, pend = 0;
    list.forEach(function (r) {
      if (r.notified) return;
      pend += 1;
      if (r.late) late = true;
      if (r.today) today = true;
    });
    return { late: late, today: today, pend: pend };
  }

  function dayHead(key, list) {
    if (key === '__none__') {
      return '<span class="sd-date">没填到货时间</span>' +
        '<span class="sd-sub">这些没法提醒，点门店名进去补一个日期</span>' +
        '<span class="sd-cnt">' + list.length + ' 条</span>';
    }
    var d = list[0].d;
    var st = dayState(list);
    var cls = st.late ? 'is-late' : (d === 0 && st.pend) ? 'is-today' : '';
    var left = d < 0 ? '过了 ' + (-d) + ' 天' : d === 0 ? '今天' : '还有 ' + d + ' 天';
    var stores = {};
    list.forEach(function (r) { stores[r.storeId] = 1; });

    return '<span class="sd-date mono">' + U.dateDot(key) + '</span>' +
      '<span class="sd-week">' + U.weekdayCn(key) + '</span>' +
      '<span class="sd-left ' + cls + '">' + left + '</span>' +
      '<span class="sd-cnt">' + list.length + ' 条 · ' + Object.keys(stores).length + ' 家店' +
        (st.pend && d < 0 ? ' · <b class="text-red">' + st.pend + ' 条没通知</b>' : '') + '</span>';
  }

  function dateRowHtml(r) {
    var openTxt = r.openLeft == null
      ? '开业日未定'
      : (r.openLeft < 0 ? '已开业 ' + (-r.openLeft) + ' 天' : '距开业 ' + r.openLeft + ' 天');

    return '<tr data-arrown="' + U.esc(r.id) + '" data-sid="' + U.esc(r.storeId) + '"' +
        ' class="' + (r.notified ? 'is-notified' : r.late ? 'is-late' : r.soon ? 'is-soon' : '') + '">' +
      '<td class="sd-store-cell">' +
        '<span class="sd-store" data-open>' + U.esc(r.storeName) + '</span>' +
        '<span class="sd-province">' + U.esc(r.province) + '</span>' +
      '</td>' +
      '<td class="sd-item-cell">' + U.esc(r.item) +
        (r.qty ? '<span class="sd-qty">×' + r.qty + '</span>' : '') + '</td>' +
      '<td class="sd-open-cell">' + U.esc(openTxt) + '</td>' +
      '<td class="sd-act-cell">' +
        '<button type="button" class="sd-st' + (r.notified ? ' is-on' : '') + '" data-arrtoggle' +
          ' title="' + (r.notified ? '点一下改回「待通知」' : '已经通知供应商发货了？点一下记下来') + '">' +
          (r.notified ? '✓ 已通知' : '待通知') + '</button>' +
      '</td>' +
    '</tr>';
  }

  /* 按日期分组：过去的在最上面，今天、明天… 没填日期的收在最后 */
  function groupByDate(rows) {
    var map = {}, keys = [];
    rows.forEach(function (r) {
      var k = r.hasEta ? r.eta : '__none__';
      if (!map[k]) { map[k] = []; keys.push(k); }
      map[k].push(r);
    });

    /* 排序：过期还没通知的排最前（最急），然后今天 → 未来 → 没填日期 → 早已通知完的历史 */
    function rank(k) {
      if (k === '__none__') return 3;
      var d = U.diffDays(U.today(), k);
      if (d < 0) return dayState(map[k]).pend ? 0 : 4;
      if (d === 0) return 1;
      return 2;
    }

    var dated = keys.sort(function (a, b) {
      var ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;
      if (a === '__none__') return 0;
      return ra === 4 ? (a < b ? 1 : -1) : (a < b ? -1 : 1);
    });

    return dated.map(function (k) {
      var list = map[k].slice().sort(function (a, b) {
        if (a.notified !== b.notified) return a.notified ? 1 : -1;
        return String(a.storeName).localeCompare(String(b.storeName), 'zh');
      });
      return { key: k, rows: list };
    });
  }

  function dateTableHtml(list) {
    if (!list.length) {
      if (!S.getState().arrivals.length) {
        return UI.empty('还没有物料到货记录', '在「门店管理」里点门店名进去，把供应商给的到货时间录进来');
      }
      return UI.empty('这个筛选下没有物料', '换个分类或清空搜索看看');
    }

    var groups = groupByDate(list);

    return '<div class="table-wrap"><table class="tbl sd-tbl">' +
      '<thead><tr>' +
        '<th style="width:196px">门店</th>' +
        '<th>物料</th>' +
        '<th style="width:118px">开业</th>' +
        '<th style="width:104px">通知</th>' +
      '</tr></thead><tbody>' +
      groups.map(function (g) {
        var gs = g.key === '__none__' ? { late: false, today: false } : dayState(g.rows);
        var cls = g.key === '__none__' ? 'is-none'
          : gs.late ? 'is-late'
            : gs.today ? 'is-today' : '';
        return '<tr class="sd-day ' + cls + '"><td colspan="4">' +
          '<div class="sd-daybar">' + dayHead(g.key, g.rows) + '</div></td></tr>' +
          g.rows.map(dateRowHtml).join('');
      }).join('') +
      '</tbody></table></div>';
  }

  function dateKpiHtml(s) {
    var items = [
      { k: 'pending', label: '待通知', v: s.pending, foot: '分布在 ' + s.pendingCount + ' 家店', color: '#3f6bf5', soft: '#edf2fe', icon: 'box' },
      { k: 'late', label: '漏通知', v: s.late, foot: '过了到货日还没通知', color: '#d92d20', soft: '#fdedeb', icon: 'alert' },
      { k: 'today', label: '今天到', v: s.today, foot: '今天该到的', color: '#f79009', soft: '#fef4e6', icon: 'clock' },
      { k: 'soon', label: '7 天内到', v: s.soon, foot: '该通知供应商发货', color: '#7a5af8', soft: '#f2eefe', icon: 'bell' },
      { k: 'notified', label: '已通知', v: s.notified, foot: '不用再催了', color: '#17b26a', soft: '#e6f8ef', icon: 'check' }
    ];

    return '<section class="kpi-grid fade-up" style="grid-template-columns:repeat(5,minmax(0,1fr));animation-delay:.04s">' +
      items.map(function (i) {
        return '<div class="kpi ship-kpi' + (state.dtab === i.k ? ' is-on' : '') + '" data-dkpi="' + i.k + '">' +
          '<span class="kpi-icon" style="background:' + i.soft + ';color:' + i.color + '">' + UI.icon(i.icon) + '</span>' +
          '<div class="kpi-body">' +
            '<div class="kpi-label">' + i.label + '</div>' +
            '<div class="kpi-value">' + i.v + '</div>' +
            '<div class="kpi-foot">' + i.foot + '</div>' +
          '</div>' +
        '</div>';
      }).join('') +
    '</section>';
  }

  function dateTabsHtml(s) {
    var n = { all: s.all, pending: s.pending, late: s.late, today: s.today, soon: s.soon, noeta: s.noeta, notified: s.notified };
    return DTABS.map(function (t) {
      return '<div class="tab' + (state.dtab === t.key ? ' active' : '') + '" data-dtab="' + t.key + '">' +
        t.label + '<span class="cnt">' + (n[t.key] || 0) + '</span></div>';
    }).join('');
  }

  function dateBannerHtml(s) {
    if (!s.late && !s.today) {
      return '<div class="ship-banner is-ok">' +
        '<span class="sb-ico">' + UI.icon('check') + '</span>' +
        '<div class="sb-body"><b>所有登记的到货时间都还没到点</b>' +
          '<span>' + s.all + ' 条物料分布在 ' + s.storeCount + ' 家门店' +
          (s.soon ? '，其中 ' + s.soon + ' 条 7 天内到，记得提前通知供应商发货' : '') +
          '</span></div>' +
      '</div>';
    }

    var txt = [];
    if (s.late) txt.push('<b>' + s.late + '</b> 条物料过了登记的到货日还没通知供应商');
    if (s.today) txt.push('<b>' + s.today + '</b> 条今天就到');

    return '<div class="ship-banner is-alert">' +
      '<span class="sb-ico">' + UI.icon('alert') + '</span>' +
      '<div class="sb-body"><b>' + txt.join('，') + '</b>' +
        '<span>往下就是按日期排的整条时间线：' + s.all + ' 条物料 · ' + s.storeCount + ' 家门店</span>' +
      '</div>' +
      '<button type="button" class="btn btn-sm" data-dtab="late">只看漏通知</button>' +
    '</div>';
  }

  /* ---------------- 「门店物料」：选一家店，直接看它的物料 ----------------
     以前这个按钮是直接跳到「门店管理」列表页，名字叫门店物料、点进去却是一张
     全部门店的清单，很莫名其妙。现在改成：先选门店 → 直接打开那家店的详情，
     并滚到「物料到货」那一段，一步到位。

     门店一多这个弹窗就变成一长条：所以加了顶部搜索（中文 / 拼音首字母 / 省份拼音）、
     「只看有待通知」开关，列表超高自己滚，待通知多的排在前面。 */
  function pickStoreMaterials() {
    var s = S.getState();
    var all = s.stores.map(function (st) {
      var arr = s.arrivals.filter(function (a) { return a.storeId === st.id; });
      var pending = arr.filter(function (a) { return !S.arrNotified(a); }).length;
      return {
        store: st,
        total: arr.length,
        pending: pending,
        py: U.pinyinInit(st.name),
        provincePy: (C.PROVINCE_PINYIN || {})[st.province] || ''
      };
    });

    if (!all.length) {
      UI.toast('还没有门店，先去「门店管理」建一家', 'info');
      return;
    }

    var q = '';
    var onlyPending = false;

    function sorted() {
      var list = all.filter(function (r) {
        if (onlyPending && !r.pending) return false;
        if (!q) return true;
        /* 中文名 / 拼音首字母 / 省份全拼，任一命中就算 */
        if (U.matchPinyin(r.store.name, q)) return true;
        if (r.py && r.py.indexOf(q) >= 0) return true;
        if (r.provincePy && r.provincePy.indexOf(q) >= 0) return true;
        return false;
      });
      /* 待通知多的先排，然后按开业日 */
      list.sort(function (a, b) {
        if (b.pending !== a.pending) return b.pending - a.pending;
        return (a.store.openDate || '9999-99-99') < (b.store.openDate || '9999-99-99') ? -1 : 1;
      });
      return list;
    }

    function rowHtml(r) {
      return '<button type="button" class="pick-row' + (r.pending ? ' is-alert' : '') + '" ' +
        'data-pick-store="' + U.esc(r.store.id) + '">' +
        '<span class="pick-name">' + U.esc(r.store.name) + '</span>' +
        '<span class="pick-meta">' + U.esc(r.store.province || '未填省份') +
          (r.store.openDate ? ' · ' + U.monthDay(r.store.openDate) + ' 开业' : '') + '</span>' +
        '<span class="pick-count">' + (r.total ? r.total + ' 项物料' : '暂无物料') +
          (r.pending ? ' · <b>' + r.pending + ' 项待通知</b>' : '') + '</span>' +
      '</button>';
    }

    function paint(box) {
      var list = sorted();
      var wrap = box.querySelector('#pickList');
      var cnt = box.querySelector('#pickCount');
      if (cnt) cnt.textContent = q || onlyPending
        ? '匹配 ' + list.length + ' / ' + all.length + ' 家'
        : '共 ' + all.length + ' 家门店';
      if (!list.length) {
        wrap.innerHTML = '<div class="pick-empty">没找到匹配的门店' +
          (q ? '（' + U.esc(q) + '）' : '') + '，换个词试试</div>';
        return;
      }
      wrap.innerHTML = list.map(rowHtml).join('');
      box.querySelectorAll('[data-pick-store]').forEach(function (el) {
        el.addEventListener('click', function () {
          closeBox();
          var id = el.getAttribute('data-pick-store');
          Pages.stores.openDetail(id);
          setTimeout(function () {
            var t = document.getElementById('sdArrTitle');
            if (t) {
              /* 物料到货分组是折叠的，先展开再定位，否则定位到一个收起的小标题 */
              var head = t.closest('.sec-fold-head');
              if (head && !head.classList.contains('is-open')) head.click();
            }
            if (t && t.scrollIntoView) t.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }, 320);
        });
      });
    }

    var body =
      '<div class="pick-bar">' +
        '<div class="mini-search pick-search">' + UI.icon('search') +
          '<input id="pickQ" placeholder="搜门店名 / 拼音首字母（如 hzwd）/ 省份" autocomplete="off" />' +
        '</div>' +
        '<button type="button" class="pick-toggle" id="pickPending">' +
          '<i></i>只看有待通知</button>' +
        '<span class="pick-count-hint" id="pickCount"></span>' +
      '</div>' +
      '<div class="pick-list" id="pickList"></div>';

    var closeBox = function () {};
    UI.modal({
      size: 'lg',
      title: '门店物料',
      sub: '选一家店，直接看它的物料到货',
      body: body,
      footer: '<button class="btn" data-pick-close type="button">关闭</button>',
      onMount: function (box, close) {
        closeBox = close;
        paint(box);

        var input = box.querySelector('#pickQ');
        input.addEventListener('input', U.debounce(function () {
          q = String(input.value || '').trim().toLowerCase().replace(/\s+/g, '');
          paint(box);
        }, 140));

        var tg = box.querySelector('#pickPending');
        tg.addEventListener('click', function () {
          onlyPending = !onlyPending;
          tg.classList.toggle('is-on', onlyPending);
          paint(box);
        });

        var btn = box.querySelector('[data-pick-close]');
        if (btn) btn.addEventListener('click', close);
      }
    });
  }

  /* ---------------- 页面 ---------------- */

  function viewSwitchHtml() {
    return '<div class="ship-views">' +
      '<button type="button" class="ship-view' + (state.view === 'store' ? ' is-on' : '') + '" data-view="store">按门店</button>' +
      '<button type="button" class="ship-view' + (state.view === 'date' ? ' is-on' : '') + '" data-view="date">按到货日</button>' +
    '</div>';
  }

  function render() {
    var today = U.today();

    /* ============ 按到货日：所有门店的物料摊在一条时间线上 ============ */
    if (state.view === 'date') {
      var all = S.arrivalRows();
      var ds = dStats(all);
      var dlist = filteredDates(all);

      return '' +
      '<div class="page-head fade-up">' +
        '<div>' +
          '<h1>发货看板</h1>' +
          '<p>' + U.cnDate(today) + ' · 共 <b>' + ds.storeCount + '</b> 家门店 · <b>' + ds.all + '</b> 条物料记录，按登记到货日排在下面' +
            (ds.late ? '，<b class="text-red">' + ds.late + ' 条漏通知</b>' : '') +
            (ds.today ? '，' + ds.today + ' 条今天就到' : '') + '</p>' +
        '</div>' +
        '<div style="display:flex;gap:8px;align-items:center">' +
          viewSwitchHtml() +
          '<button class="btn btn-primary" data-act="pickStore">' + UI.icon('box') + '门店物料</button>' +
        '</div>' +
      '</div>' +

      dateBannerHtml(ds) +
      dateKpiHtml(ds) +

      '<div class="card ship-card fade-up" style="animation-delay:.08s">' +
        '<div class="ship-bar">' +
          '<div class="tabs" id="shipTabs">' + dateTabsHtml(ds) + '</div>' +
          '<div class="ship-tools">' +
            '<div class="mini-search">' + UI.icon('search') +
              '<input id="shipQ" placeholder="搜门店 / 物料 / 负责人" value="' + U.esc(state.q) + '" />' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div id="shipTable">' + dateTableHtml(dlist) + '</div>' +
        '<div class="ship-foot">' +
          '<span>按登记的到货日排序：过去的在最上面 → 今天 → 之后；已通知的沉在每天末尾</span>' +
          '<span>一家店几条物料不同日期都会分开列出来，漏哪条都看得见</span>' +
        '</div>' +
      '</div>';
    }

    /* ============ 按门店：一家店一行，看谁该发 ============ */
    var rows = S.shipRows();
    var s = S.shipStats(rows);
    var list = filtered(rows);

    return '' +
    '<div class="page-head fade-up">' +
      '<div>' +
        '<h1>发货看板</h1>' +
        '<p>' + U.cnDate(today) + ' · 共 ' + rows.length + ' 家门店：<b>' + s.todo + '</b> 家待发出' +
          (s.sent ? '、<b>' + s.sent + '</b> 家已发出' : '') +
          (s.notify ? '；<b>' + s.notify + '</b> 家该通知供应商' : '') +
          (s.arrLate ? '；<b class="text-red">' + s.arrLate + '</b> 家漏通知' : '') + '</p>' +
      '</div>' +
      '<div style="display:flex;gap:8px;align-items:center">' +
        viewSwitchHtml() +
        '<button class="btn btn-primary" data-act="pickStore">' + UI.icon('box') + '门店物料</button>' +
      '</div>' +
    '</div>' +

    bannerHtml(rows, s) +
    kpiHtml(rows, s) +

    '<div class="card ship-card fade-up" style="animation-delay:.08s">' +
      '<div class="ship-bar">' +
        '<div class="tabs" id="shipTabs">' + tabsHtml(rows, s) + '</div>' +
        '<div class="ship-tools">' +
          '<div class="mini-search">' + UI.icon('search') +
            '<input id="shipQ" placeholder="搜门店 / 省份 / 负责人" value="' + U.esc(state.q) + '" />' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div id="shipTable">' + tableHtml(list) + '</div>' +
      '<div class="ship-foot">' +
        '<span>每行只铺还没通知供应商的物料，通知过的不再占地方；历史记录去「按到货日」视图的「已通知」</span>' +
        '<span>「一件发出」点一下 = 整店物料都通知过供应商了，行沉到底；再点一下全部退回待通知</span>' +
      '</div>' +
    '</div>';
  }

  /* ---------------- 交互 ---------------- */

  function findRow(id) {
    var rows = S.shipRows();
    for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return { row: rows[i], idx: i };
    return null;
  }

  function updateList(root) {
    var wrap = root.querySelector('#shipTable');
    var tabs = root.querySelector('#shipTabs');

    if (state.view === 'date') {
      var all = S.arrivalRows();
      var ds = dStats(all);
      if (wrap) wrap.innerHTML = dateTableHtml(filteredDates(all));
      if (tabs) tabs.innerHTML = dateTabsHtml(ds);
      return;
    }

    if (wrap) wrap.innerHTML = tableHtml(filtered(S.shipRows()));
    if (tabs) {
      var rows = S.shipRows();
      tabs.innerHTML = tabsHtml(rows, S.shipStats(rows));
    }
  }

  function mount(root) {
    /* 搜索（防抖：跟门店/任务页一致，输入时别每个字符都整表重算） */
    var q = root.querySelector('#shipQ');
    if (q) {
      q.addEventListener('input', U.debounce(function () {
        state.q = q.value;
        updateList(root);   /* 只换表体，输入框不重建，焦点不丢 */
      }, 240));
    }

    root.addEventListener('click', function (e) {
      /* 两个视图切换：这里要回到页首看标题，所以 keep 之后自己补一次 scrollTo */
      var vw = e.target.closest('[data-view]');
      if (vw && root.contains(vw)) {
        var nextView = vw.getAttribute('data-view');
        if (nextView !== state.view) {
          state.view = nextView;
          state.q = '';
          state.tab = 'all';
          state.dtab = 'all';
          App.refresh({ keep: true });
          window.scrollTo(0, 0);
        }
        return;
      }

      /* ★ 下面这些筛选一律用 App.refresh({ keep: true })：
         普通 refresh 会跑 onEnter，而 onEnter 是「刚进这一页」的初始化，
         会把 tab / dtab / q 全部复位成「全部」—— 结果就是点哪个分类都弹回全部，
         看着像筛选坏了（2026-10-25 修）。keep 只重画，不动这页的筛选状态。 */

      /* 「按到货日」的分类 / KPI */
      var dtab = e.target.closest('[data-dtab]');
      if (dtab && root.contains(dtab)) {
        state.dtab = dtab.getAttribute('data-dtab');
        App.refresh({ keep: true });
        return;
      }

      var dkpi = e.target.closest('[data-dkpi]');
      if (dkpi && root.contains(dkpi)) {
        var dk = dkpi.getAttribute('data-dkpi');
        state.dtab = (state.dtab === dk) ? 'all' : dk;
        App.refresh({ keep: true });
        return;
      }

      var tab = e.target.closest('[data-tab]');
      if (tab && root.contains(tab)) {
        state.tab = tab.getAttribute('data-tab');
        App.refresh({ keep: true });
        return;
      }

      var kpi = e.target.closest('[data-kpi]');
      if (kpi && root.contains(kpi)) {
        var k = kpi.getAttribute('data-kpi');
        state.tab = (state.tab === k) ? 'all' : k;
        App.refresh({ keep: true });
        return;
      }

      var actEl = e.target.closest('[data-act]');
      if (actEl && root.contains(actEl)) {
        var act = actEl.getAttribute('data-act');
        if (act === 'pickStore') { pickStoreMaterials(); return; }
        if (act === 'focus') {
          state.tab = 'arrlate';
          App.refresh({ keep: true });
          /* 重画后 root 已被换掉，从文档里重新取表格，滚到眼前 */
          var tbl = document.querySelector('#shipTable');
          if (tbl && tbl.scrollIntoView) tbl.scrollIntoView({ block: 'start', behavior: 'smooth' });
          return;
        }
      }

      /* 按到货日视图的物料行：点门店名进详情，点「待通知」直接翻转 */
      var dtr = e.target.closest('tr[data-arrown]');
      if (dtr && root.contains(dtr)) {
        var arrId = dtr.getAttribute('data-arrown');
        if (e.target.closest('[data-open]')) {
          Pages.stores.openDetail(dtr.getAttribute('data-sid'));
          return;
        }
        if (e.target.closest('[data-arrtoggle]')) {
          var rec = null;
          S.getState().arrivals.forEach(function (x) { if (x.id === arrId) rec = x; });
          if (!rec) return;
          var was = S.arrNotified(rec);
          S.updateArrival(arrId, { status: was ? 'pending' : 'notified' });
          UI.toast(was
            ? '已改回「待通知」，这条重新进提醒'
            : (rec.item || '该物料') + ' 已记为通知过供应商', 'success');
          /* 整页原地重画：分类数字、KPI、横幅都跟着这条一起变 */
          App.refresh({ keep: true });
          return;
        }
        return;
      }

      var tr = e.target.closest('tr[data-ship]');
      if (!tr) return;
      var id = tr.getAttribute('data-ship');
      var hit = findRow(id);
      if (!hit) return;

      /* ★ 一件发出：整店翻转 —— 物料通知状态跟着一起走，行沉底 / 回位 */
      if (e.target.closest('[data-sent]')) {
        var res = S.toggleShipSent(id);
        if (!res) return;
        if (res.status === 'sent') {
          UI.toast(res.changed
            ? '已记「已发出」，' + res.changed + ' 项物料同时记为已通知供应商'
            : '已记「已发出」（这家店没有待通知的物料）', 'success');
        } else {
          UI.toast(res.changed
            ? '已取消一件发出，' + res.changed + ' 项物料回到「待通知」'
            : '已改回「未发出」（这家店没有已通知的物料）', 'info');
        }
        App.refresh({ keep: true });
        return;
      }

      /* ★ 先发 */
      if (e.target.closest('[data-pin]')) {
        var on = S.toggleShipPin(id);
        UI.toast(on ? '已标记为先发，排到最前面' : '已取消先发', on ? 'success' : 'info');
        App.refresh({ keep: true });
        return;
      }

      /* ↑↓ 手动顺序 */
      var mv = e.target.closest('[data-move]');
      if (mv) {
        var ok = S.moveShip(id, Number(mv.getAttribute('data-move')));
        if (!ok) UI.toast('已经在最前 / 最后了', 'info');
        else App.refresh({ keep: true });
        return;
      }

      /* 点门店名 → 门店详情（到货时间都在那儿录） */
      if (e.target.closest('[data-open]')) {
        Pages.stores.openDetail(id);
        return;
      }
    });

    /* 备注（2026-10-25：登记实发日期的输入框已撤掉，这一列只剩备注） */
    root.addEventListener('change', function (e) {
      var n = e.target.closest('[data-note]');
      if (n && root.contains(n)) {
        var tr2 = n.closest('tr[data-ship]');
        if (!tr2) return;
        S.setShip(tr2.getAttribute('data-ship'), { note: n.value });
      }
    });
  }

  function onEnter() { state.tab = 'all'; state.dtab = 'all'; state.q = ''; }

  return { title: '发货看板', render: render, mount: mount, onEnter: onEnter };
})();

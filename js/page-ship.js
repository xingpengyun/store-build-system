/* ==========================================================
   page-ship.js — 发货看板
   几十家门店待发货，每天早上打开这一页：
   谁今天就该发、谁已经逾期、谁排在最前面要发，一眼看完。

   只看两件事：
   1) 发了没发（一次点击翻过来，在途 / 到店不记）
   2) 物料登记的到货时间（到货日 − 7 天就该通知供应商，通知完点「已通知」）
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
    { key: 'all', label: '全部' },
    { key: 'todo', label: '未发出' },
    { key: 'late', label: '逾期未发' },
    { key: 'today', label: '今天该发' },
    { key: 'notify', label: '该通知供应商' },
    { key: 'arrlate', label: '漏通知' },
    { key: 'sent', label: '已发出' }
  ];

  /* 「按到货日」视图的分类：一条物料一条记录，日期各店不同也能一眼看完 */
  var DTABS = [
    { key: 'all', label: '全部' },
    { key: 'late', label: '漏通知' },
    { key: 'today', label: '今天到' },
    { key: 'soon', label: '7 天内到' },
    { key: 'noeta', label: '没填日期' },
    { key: 'notified', label: '已通知' }
  ];

  function hitD(r, key) {
    if (!key || key === 'all') return true;
    if (key === 'late') return r.late;
    if (key === 'today') return r.today;
    if (key === 'soon') return r.soon;
    if (key === 'noeta') return !r.hasEta && !r.notified;
    if (key === 'notified') return r.notified;
    return true;
  }

  function dStats(rows) {
    var s = { all: rows.length, late: 0, today: 0, soon: 0, noeta: 0, notified: 0, stores: {} };
    rows.forEach(function (r) {
      s.stores[r.storeId] = 1;
      if (r.notified) { s.notified += 1; return; }
      if (r.late) s.late += 1;
      if (r.today) s.today += 1;
      if (r.soon) s.soon += 1;
      if (!r.hasEta) s.noeta += 1;
    });
    s.storeCount = Object.keys(s.stores).length;
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
    if (key === 'todo') return !r.shipped;
    if (key === 'late') return r.late;
    if (key === 'today') return r.dueToday;
    if (key === 'notify') return r.needNotify;
    if (key === 'arrlate') return r.arrLate;
    if (key === 'sent') return r.shipped;
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

  function leftText(r) {
    if (r.shipped) {
      if (r.sentAgo == null) return '已发出';
      return r.sentAgo <= 0 ? '今天发出' : '已发 ' + r.sentAgo + ' 天';
    }
    if (r.left == null) return '还没排发货日';
    if (r.left < 0) return '逾期 ' + Math.abs(r.left) + ' 天';
    if (r.left === 0) return '今天必须发';
    return '还有 ' + r.left + ' 天';
  }

  var MAT_MAX = 5;

  /* 一家店的所有物料 + 登记的到货时间，全部铺在这一行里 ——
     不用点进门店也知道这家哪天到货、哪条漏通知了。 */
  function matsHtml(r) {
    if (!r.mats || !r.mats.length) {
      return '<span class="sm-none">还没录物料 · 点门店名进去录</span>';
    }

    var watch = Number(C.ARR_WATCH_DAYS || 7);
    var html = r.mats.slice(0, MAT_MAX).map(function (m) {
      var cls = m.notified ? 'is-done'
        : m.d == null ? 'is-nodate'
          : m.d < 0 ? 'is-late'
            : m.d <= watch ? 'is-soon' : '';

      var when = m.eta ? U.dateDot(m.eta) : '没日期';
      var tail = '';
      if (!m.notified && m.d != null) {
        tail = m.d < 0 ? '过' + (-m.d) + '天'
          : m.d === 0 ? '今天'
            : m.d + '天后';
      }

      var tip = m.item + (m.qty ? ' ×' + m.qty : '') +
        '：' + (m.eta ? m.eta.slice(5) + ' 到货' : '还没填到货时间') +
        (m.notified ? '（已通知供应商）' : '（待通知供应商）');

      return '<span class="sm-chip ' + cls + '" title="' + U.esc(tip) + '">' +
        '<b class="sm-when mono">' + when + '</b>' +
        '<span class="sm-item">' + U.esc(m.item) + (m.qty ? '<i>×' + m.qty + '</i>' : '') + '</span>' +
        (tail ? '<span class="sm-tail">' + tail + '</span>' : '') +
      '</span>';
    }).join('');

    if (r.mats.length > MAT_MAX) {
      html += '<span class="sm-more" data-open title="还有 ' + (r.mats.length - MAT_MAX) + ' 条，点开门店看全部">' +
        '+' + (r.mats.length - MAT_MAX) + ' 条</span>';
    }
    return html;
  }

  /* 发出之后：这一环过了，下一环是什么 —— 看板要能顺着时间往下走 */
  function nextText(r) {
    if (!r.shipped) return '';
    if (r.pending > 0) {
      return r.eta ? '物料 ' + U.dateDot(r.eta) + ' 到' : '补物料时间';
    }
    if (r.openLeft == null) return '等定开业日';
    if (r.openLeft > 0) return r.openLeft + ' 天后开业';
    return '已开业';
  }

  /* 悬停时把「下一步」说全 */
  function nextTip(r) {
    if (!r.shipped) return '';
    if (r.pending > 0) {
      return r.eta
        ? '这家已发出，下一步等物料 ' + U.monthDay(r.eta) + ' 到货（还有 ' + r.pending + ' 项没到）'
        : '这家已发出，但还有 ' + r.pending + ' 项物料没登记到货时间';
    }
    if (r.openLeft == null) return '物料都到齐了，等门店定开业日';
    if (r.openLeft > 0) return '物料都到齐了，' + r.openLeft + ' 天后开业';
    return '门店已经开业了';
  }

  function rowHtml(r, idx) {
    var cls = [];
    if (r.late) cls.push('is-late');
    else if (r.dueToday) cls.push('is-today');
    if (r.shipped) cls.push('is-sent');
    if (r.pin) cls.push('is-pin');

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

      /* 这一列把这家店所有物料的到货时间铺开 —— 原来是空的，现在填满 */
      '<td class="ship-mats">' + matsHtml(r) + '</td>' +

      '<td class="ship-plan">' +
        '<div class="ship-plan-row">' +
          '<input class="ship-date mono' + (r.date ? '' : ' is-empty') + '" type="date" data-date value="' +
            U.esc(r.date) + '" title="' + (r.date ? '点一下可以改发货日' : '还没排发货日，点这里选一个') + '" />' +
        '</div>' +
        '<div class="ship-left ' + (r.late ? 'is-late' : r.dueToday ? 'is-today' : '') + '">' +
          U.esc(leftText(r)) + '</div>' +
      '</td>' +

      '<td class="ship-sent">' +
        '<button type="button" class="ship-st is-' + r.status + '" data-sent' +
          ' title="' + (r.shipped ? '点一下改回「未发出」' : '发出去以后点这里，这家就不用再跟了') + '">' +
          '<i></i>' + (r.shipped ? '已发出' : '未发出') +
        '</button>' +
        (r.shipped
          ? '<input class="ship-sent-date mono" type="date" data-sentdate value="' + U.esc(r.sentAt || '') +
              '" title="登记的发货时间，点一下可以改" />' +
            '<div class="ship-next" title="' + U.esc(nextTip(r)) + '">' + U.esc(nextText(r)) + '</div>'
          : '') +
      '</td>' +

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
        '<th>物料 · 登记的到货时间' +
          '<span class="th-legend"><i class="is-late"></i>过了到货日<i class="is-soon"></i>7 天内到<i class="is-done"></i>已通知</span>' +
        '</th>' +
        '<th style="width:112px">计划发货</th>' +
        '<th style="width:132px">发出 / 下一步</th>' +
        '<th style="width:138px">备注</th>' +
        '<th style="width:44px"></th>' +
      '</tr></thead><tbody>' +
      rows.map(function (r, i) { return rowHtml(r, i); }).join('') +
      '</tbody></table></div>';
  }

  /* ---------------- 顶部 ---------------- */

  function reasonText(r) {
    if (r.late) return leftText(r) + '，计划 ' + U.dateDot(r.date) + ' 发';
    if (r.arrLate) return r.lateArr + ' 项物料过了到货日还没通知供应商';
    if (r.dueToday) return '计划今天发出';
    return '';
  }

  function bannerHtml(rows, s) {
    /* 全部发完：这一环结束了，给个明确的下一步 —— 不然一发完这页就没话说了 */
    if (!s.todo && s.all) {
      var waiting = rows.filter(function (r) { return r.pending > 0; });
      var nextEta = '';
      waiting.forEach(function (r) {
        if (r.eta && (!nextEta || r.eta < nextEta)) nextEta = r.eta;
      });
      return '<div class="ship-banner is-done">' +
        '<span class="sb-ico">' + UI.icon('check') + '</span>' +
        '<div class="sb-body">' +
          '<b>' + s.all + ' 家全部发出去了，发货这一环结束</b>' +
          '<span>下一个流程：盯物料到货' +
            (waiting.length
              ? '（' + waiting.length + ' 家还有物料没到' + (nextEta ? '，最近 ' + U.monthDay(nextEta) + ' 到' : '') + '）'
              : '（物料都通知过了）') +
            '；每条物料的日期都铺在下面表格里，也可以顺着「按到货日」的时间线看</span>' +
        '</div>' +
        '<button type="button" class="btn btn-sm" data-view="date">按到货日跟进 →</button>' +
      '</div>';
    }

    var late = rows.filter(function (r) { return r.late; });
    var arrLate = rows.filter(function (r) { return r.arrLate; });
    var today = rows.filter(function (r) { return r.dueToday; });
    var notify = rows.filter(function (r) { return r.needNotify; });

    if (!late.length && !arrLate.length && !today.length) {
      return '<div class="ship-banner is-ok">' +
        '<span class="sb-ico">' + UI.icon('check') + '</span>' +
        '<div class="sb-body"><b>今天没有该发没发的门店</b>' +
          '<span>' + (s.active ? '还没发出的 ' + s.active + ' 家都在排期里' : '所有门店都已发出') +
          (notify.length ? '；' + notify.length + ' 家物料 7 天内到，今天该通知供应商发货' : '') +
          '</span></div>' +
      '</div>';
    }

    var first = late[0] || arrLate[0] || today[0];
    var txt = [];
    if (late.length) txt.push('<b>' + late.length + '</b> 家过了计划发货日还没发');
    if (arrLate.length) txt.push('<b>' + arrLate.length + '</b> 家物料过了到货日还没通知供应商');
    if (today.length) txt.push('<b>' + today.length + '</b> 家今天就该发');

    return '<div class="ship-banner is-alert">' +
      '<span class="sb-ico">' + UI.icon('alert') + '</span>' +
      '<div class="sb-body">' +
        '<b>' + txt.join('，') + '</b>' +
        '<span>最急：' + U.esc(first.name) + '（' + U.esc(reasonText(first)) + '）　·　先去处理这几家</span>' +
      '</div>' +
      '<button type="button" class="btn btn-sm" data-act="focus">只看这几家</button>' +
    '</div>';
  }

  function kpiHtml(rows, s) {
    var items = [
      { k: 'todo', label: '未发出', v: s.todo, foot: '要跟的门店', color: '#3f6bf5', soft: '#edf2fe', icon: 'truck' },
      { k: 'late', label: '逾期未发', v: s.late, foot: '已经过了发货日', color: '#f04438', soft: '#feeceb', icon: 'alert' },
      { k: 'today', label: '今天该发', v: s.today, foot: '今天必须发出去', color: '#f79009', soft: '#fef4e6', icon: 'clock' },
      { k: 'notify', label: '该通知供应商', v: s.notify, foot: '到货日在 7 天内', color: '#7a5af8', soft: '#f2eefe', icon: 'bell' },
      { k: 'arrlate', label: '漏通知', v: s.arrLate, foot: '过了到货日还没通知', color: '#d92d20', soft: '#fdedeb', icon: 'box' }
    ];

    return '<section class="kpi-grid fade-up" style="grid-template-columns:repeat(5,minmax(0,1fr));animation-delay:.04s">' +
      items.map(function (i) {
        return '<div class="kpi ship-kpi' + (state.tab === i.k ? ' is-on' : '') + '" data-kpi="' + i.k + '">' +
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
      all: rows.length, todo: s.todo, late: s.late, today: s.today,
      notify: s.notify, arrlate: s.arrLate, sent: s.sent
    };
    return TABS.map(function (t) {
      return '<div class="tab' + (state.tab === t.key ? ' active' : '') + '" data-tab="' + t.key + '">' +
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
      { k: 'all', label: '待通知', v: s.all - s.notified, foot: '共 ' + s.storeCount + ' 家店', color: '#3f6bf5', soft: '#edf2fe', icon: 'box' },
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
    var n = { all: s.all, late: s.late, today: s.today, soon: s.soon, noeta: s.noeta, notified: s.notified };
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
          '<button class="btn btn-primary" data-act="toStores">' + UI.icon('box') + '门店物料</button>' +
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
        '<p>' + U.cnDate(today) + ' · 共 ' + rows.length + ' 家门店要跟' +
          (s.late ? '，<b class="text-red">' + s.late + ' 家逾期未发</b>' : '') +
          (s.arrLate ? '，<b class="text-red">' + s.arrLate + ' 家漏通知供应商</b>' : '') +
          (s.today ? '，' + s.today + ' 家今天就该发' : '') + '</p>' +
      '</div>' +
      '<div style="display:flex;gap:8px;align-items:center">' +
        viewSwitchHtml() +
        '<button class="btn" data-act="autoOrder" title="清掉手动顺序，回到按计划发货日自动排">' + UI.icon('refresh') + '按发货日重排</button>' +
        '<button class="btn btn-primary" data-act="toStores">' + UI.icon('box') + '门店物料</button>' +
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
        '<span>每行都铺开了这家店全部物料的到货时间；发出后填「实发」日期，右边自动提示下一个流程</span>' +
        '<span>' + (s.noPlan ? '<b class="text-red">' + s.noPlan + ' 家还没填发货日</b>　·　' : '') +
          '到货时间以门店 / 供应商登记的为准，改日期就是新承诺</span>' +
      '</div>' +
    '</div>';
  }

  /* ---------------- 交互 ---------------- */

  function findRow(id) {
    var rows = S.shipRows();
    for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return { row: rows[i], idx: i };
    return null;
  }

  /* 只重画这一行：改日期时不重排，免得行跳走找不到 */
  function repaintRow(tr, id) {
    var hit = findRow(id);
    if (!hit) return;
    var tmp = document.createElement('tbody');
    tmp.innerHTML = rowHtml(hit.row, hit.idx);
    var fresh = tmp.firstChild;
    if (fresh) tr.parentNode.replaceChild(fresh, tr);
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
    /* 搜索 */
    var q = root.querySelector('#shipQ');
    if (q) {
      q.addEventListener('input', function () {
        state.q = q.value;
        updateList(root);   /* 只换表体，输入框不重建，焦点不丢 */
      });
    }

    root.addEventListener('click', function (e) {
      /* 两个视图切换 */
      var vw = e.target.closest('[data-view]');
      if (vw && root.contains(vw)) {
        var nextView = vw.getAttribute('data-view');
        if (nextView !== state.view) {
          state.view = nextView;
          state.q = '';
          state.tab = 'all';
          state.dtab = 'all';
          App.refresh();
        }
        return;
      }

      /* 「按到货日」的分类 / KPI */
      var dtab = e.target.closest('[data-dtab]');
      if (dtab && root.contains(dtab)) {
        state.dtab = dtab.getAttribute('data-dtab');
        App.refresh();
        return;
      }

      var dkpi = e.target.closest('[data-dkpi]');
      if (dkpi && root.contains(dkpi)) {
        var dk = dkpi.getAttribute('data-dkpi');
        state.dtab = (state.dtab === dk) ? 'all' : dk;
        App.refresh();
        return;
      }

      var tab = e.target.closest('[data-tab]');
      if (tab && root.contains(tab)) {
        state.tab = tab.getAttribute('data-tab');
        App.refresh();
        return;
      }

      var kpi = e.target.closest('[data-kpi]');
      if (kpi && root.contains(kpi)) {
        var k = kpi.getAttribute('data-kpi');
        state.tab = (state.tab === k) ? 'all' : k;
        App.refresh();
        return;
      }

      var actEl = e.target.closest('[data-act]');
      if (actEl && root.contains(actEl)) {
        var act = actEl.getAttribute('data-act');
        if (act === 'autoOrder') {
          S.clearShipSeq();
          UI.toast('已按计划发货日重新排好', 'success');
          App.refresh();
          return;
        }
        if (act === 'toStores') { App.go('stores'); return; }
        if (act === 'focus') {
          state.tab = 'late';
          App.refresh();
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
          updateList(root);
          return;
        }
        return;
      }

      var tr = e.target.closest('tr[data-ship]');
      if (!tr) return;
      var id = tr.getAttribute('data-ship');
      var hit = findRow(id);
      if (!hit) return;

      /* ★ 先发 */
      if (e.target.closest('[data-pin]')) {
        var on = S.toggleShipPin(id);
        UI.toast(on ? '已标记为先发，排到最前面' : '已取消先发', on ? 'success' : 'info');
        App.refresh();
        return;
      }

      /* ↑↓ 手动顺序 */
      var mv = e.target.closest('[data-move]');
      if (mv) {
        var ok = S.moveShip(id, Number(mv.getAttribute('data-move')));
        if (!ok) UI.toast('已经在最前 / 最后了', 'info');
        else App.refresh();
        return;
      }

      /* 发了没发：一次点击翻过来，点错了再点一下就回来 */
      if (e.target.closest('[data-sent]')) {
        var next = S.toggleShipSent(id);
        UI.toast(next === 'sent'
          ? hit.row.name + ' 已标记发出，沉到列表最后'
          : hit.row.name + ' 改回「未发出」，重新回到要跟的队列',
          next === 'sent' ? 'success' : 'info');
        App.refresh();
        return;
      }

      /* 点门店名 → 门店详情（到货时间都在那儿录） */
      if (e.target.closest('[data-open]')) {
        Pages.stores.openDetail(id);
        return;
      }
    });

    /* 计划发货日 / 备注 */
    root.addEventListener('change', function (e) {
      var d = e.target.closest('[data-date]');
      if (d && root.contains(d)) {
        var tr = d.closest('tr[data-ship]');
        var rid = tr && tr.getAttribute('data-ship');
        if (!rid) return;
        S.setShip(rid, { date: d.value });
        repaintRow(tr, rid);
        return;
      }

      /* 登记的发货时间：发出去以后可以改（当天忘了点，第二天补也不会错） */
      var sd = e.target.closest('[data-sentdate]');
      if (sd && root.contains(sd)) {
        var tr3 = sd.closest('tr[data-ship]');
        if (!tr3) return;
        S.setShip(tr3.getAttribute('data-ship'), { sentAt: sd.value });
        UI.toast(sd.value ? '实发日期已登记为 ' + U.monthDay(sd.value) : '已清掉实发日期', 'success');
        App.refresh();
        return;
      }

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

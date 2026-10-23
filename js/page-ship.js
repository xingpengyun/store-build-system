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

  var state = { tab: 'all', q: '' };

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
    if (r.shipped) return '已发出';
    if (r.left == null) return '还没排发货日';
    if (r.left < 0) return '逾期 ' + Math.abs(r.left) + ' 天';
    if (r.left === 0) return '今天必须发';
    return '还有 ' + r.left + ' 天';
  }

  /* 登记到货时间：日期 + 倒计时，这就是我们要盯的唯一东西 */
  function etaMain(r) {
    if (!r.total) return '<span class="se-none">还没录物料</span>';
    if (!r.eta) {
      if (!r.pending) return '<span class="se-ok">全部已通知</span>';
      return '<span class="se-none">还没填到货时间</span>';
    }

    var d = U.diffDays(U.today(), r.eta);
    var tag;
    if (d < 0) tag = '<span class="se-tag late">过 ' + (-d) + ' 天</span>';
    else if (d === 0) tag = '<span class="se-tag today">今天到</span>';
    else if (d <= Number(C.ARR_WATCH_DAYS || 7)) tag = '<span class="se-tag soon">还有 ' + d + ' 天</span>';
    else tag = '<span class="se-tag">还有 ' + d + ' 天</span>';

    return '<b class="se-date mono">' + U.dateDot(r.eta) + '</b>' + tag;
  }

  function etaSub(r) {
    if (!r.total) return '';
    if (!r.pending) return '';   /* 全部已通知，主行已经说了 */
    var parts = [];
    if (r.lateArr) parts.push('<span class="se-hot">' + r.lateArr + ' 项过了到货日没通知</span>');
    if (r.notify) parts.push('<span class="se-soon">' + r.notify + ' 项该通知供应商</span>');
    if (r.notified) parts.push(r.notified + ' 项已通知');
    if (r.noEta) parts.push(r.noEta + ' 项没填时间');
    return parts.join(' · ');
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

      '<td class="ship-plan">' +
        '<div class="ship-plan-row">' +
          '<input class="ship-date mono' + (r.date ? '' : ' is-empty') + '" type="date" data-date value="' +
            U.esc(r.date) + '" title="' + (r.date ? '点一下可以改发货日' : '还没排发货日，点这里选一个') + '" />' +
        '</div>' +
        '<div class="ship-left ' + (r.late ? 'is-late' : r.dueToday ? 'is-today' : '') + '">' +
          U.esc(leftText(r)) + '</div>' +
      '</td>' +

      '<td class="ship-eta">' +
        '<div class="ship-eta-main' + (r.arrLate ? ' is-late' : '') + '">' + etaMain(r) + '</div>' +
        '<div class="ship-eta-sub">' + etaSub(r) + '</div>' +
      '</td>' +

      '<td>' +
        '<button type="button" class="ship-st is-' + r.status + '" data-sent' +
          ' title="' + (r.shipped ? '点一下改回「未发出」' : '发出去以后点这里，这家就不用再跟了') + '">' +
          '<i></i>' + (r.shipped ? '已发出' : '未发出') +
        '</button>' +
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
        '<th style="width:56px">顺序</th>' +
        '<th>门店 / 开业</th>' +
        '<th style="width:126px">计划发货</th>' +
        '<th style="width:180px">登记到货（最早）</th>' +
        '<th style="width:84px">发出</th>' +
        '<th style="width:170px">备注</th>' +
        '<th style="width:58px"></th>' +
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

  /* ---------------- 页面 ---------------- */

  function render() {
    var rows = S.shipRows();
    var s = S.shipStats(rows);
    var list = filtered(rows);
    var today = U.today();

    return '' +
    '<div class="page-head fade-up">' +
      '<div>' +
        '<h1>发货看板</h1>' +
        '<p>' + U.cnDate(today) + ' · 共 ' + rows.length + ' 家门店要跟' +
          (s.late ? '，<b class="text-red">' + s.late + ' 家逾期未发</b>' : '') +
          (s.arrLate ? '，<b class="text-red">' + s.arrLate + ' 家漏通知供应商</b>' : '') +
          (s.today ? '，' + s.today + ' 家今天就该发' : '') + '</p>' +
      '</div>' +
      '<div style="display:flex;gap:8px">' +
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
        '<span>顺序：未发出的在前 → ★先发 → 手动排的 → 计划发货日近的在前 → 已发出沉底</span>' +
        '<span>' + (s.noPlan ? '<b class="text-red">' + s.noPlan + ' 家还没填发货日</b>　·　' : '') +
          '到货时间以门店 / 供应商登记的为准，改日期就是新承诺；通知完在门店详情点「已通知」</span>' +
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
    if (wrap) wrap.innerHTML = tableHtml(filtered(S.shipRows()));
    var tabs = root.querySelector('#shipTabs');
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

      var n = e.target.closest('[data-note]');
      if (n && root.contains(n)) {
        var tr2 = n.closest('tr[data-ship]');
        if (!tr2) return;
        S.setShip(tr2.getAttribute('data-ship'), { note: n.value });
      }
    });
  }

  function onEnter() { state.tab = 'all'; state.q = ''; }

  return { title: '发货看板', render: render, mount: mount, onEnter: onEnter };
})();

/* ==========================================================
   page-ship.js — 发货看板
   几十家门店待发货，每天早上打开这一页：
   谁今天就该发、谁已经逾期、谁排在最前面要发，一眼看完。
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
    { key: 'active', label: '还没发出' },
    { key: 'late', label: '逾期' },
    { key: 'today', label: '今天' },
    { key: 'sent', label: '在途' },
    { key: 'done', label: '已到店' },
    { key: 'noplan', label: '没排期' }
  ];

  function statusMeta(key) {
    var list = C.SHIP_STATUS || [];
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
    return list[0] || { key: 'todo', label: '待备货', color: '#8b97ab', soft: '#eef1f6' };
  }

  function hitTab(r, key) {
    if (!key || key === 'all') return true;
    if (key === 'active') return r.status !== 'done';
    if (key === 'late') return r.late;
    if (key === 'today') return r.dueToday;
    if (key === 'sent') return r.status === 'sent';
    if (key === 'done') return r.status === 'done';
    if (key === 'noplan') return r.noPlan;
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
    if (r.status === 'done') return '已到店';
    if (r.left == null) return '还没排发货日';
    if (r.left < 0) return '逾期 ' + Math.abs(r.left) + ' 天';
    if (r.left === 0) return '今天必须发';
    return '还有 ' + r.left + ' 天';
  }

  function matSub(r) {
    if (!r.total) return '未录入';
    if (r.status === 'done') return r.pending
      ? '<span class="text-red">还有 ' + r.pending + ' 项没到</span>'
      : '全部到齐';
    if (r.lateArr) return '<span class="text-red">' + r.lateArr + ' 项过了到货日</span>';
    if (r.eta) return '最早 ' + U.dateDot(r.eta) + ' 到';
    return '没填到货时间';
  }

  function rowHtml(r, idx) {
    var st = statusMeta(r.status);
    var cls = [];
    if (r.late) cls.push('is-late');
    else if (r.dueToday) cls.push('is-today');
    if (r.status === 'done') cls.push('is-done');
    if (r.pin) cls.push('is-pin');

    var openTxt = r.openLeft == null
      ? '开业日未定'
      : (r.openLeft < 0 ? '开业已过 ' + (-r.openLeft) + ' 天' : '距开业 ' + r.openLeft + ' 天');

    var etatxt = r.total
      ? '物料 ' + r.total + ' 项 · 已到 ' + r.arrived
      : '还没录物料';

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

      '<td class="ship-mat">' +
        '<div class="ship-mat-main">' + U.esc(etatxt) + '</div>' +
        '<div class="ship-mat-sub">' + matSub(r) + '</div>' +
      '</td>' +

      '<td>' +
        '<button type="button" class="ship-st" data-st' +
          ' style="color:' + st.color + ';background:' + st.soft + '">' +
          '<i style="background:' + st.color + '"></i>' + st.label +
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
        '<th style="width:132px">计划发货</th>' +
        '<th style="width:150px">物料</th>' +
        '<th style="width:92px">状态</th>' +
        '<th style="width:190px">备注</th>' +
        '<th style="width:58px"></th>' +
      '</tr></thead><tbody>' +
      rows.map(function (r, i) { return rowHtml(r, i); }).join('') +
      '</tbody></table></div>';
  }

  /* ---------------- 顶部 ---------------- */

  function bannerHtml(rows, s) {
    var late = rows.filter(function (r) { return r.late; });
    var today = rows.filter(function (r) { return r.dueToday; });

    if (!late.length && !today.length) {
      return '<div class="ship-banner is-ok">' +
        '<span class="sb-ico">' + UI.icon('check') + '</span>' +
        '<div class="sb-body"><b>今天没有该发没发的门店</b>' +
          '<span>还没发出的 ' + s.active + ' 家都在排期里，盯着下面的顺序就行</span></div>' +
      '</div>';
    }

    var first = late[0] || today[0];
    var txt = [];
    if (late.length) txt.push('<b>' + late.length + '</b> 家已经过了计划发货日还没发');
    if (today.length) txt.push('<b>' + today.length + '</b> 家今天就该发');

    return '<div class="ship-banner is-alert">' +
      '<span class="sb-ico">' + UI.icon('alert') + '</span>' +
      '<div class="sb-body">' +
        '<b>' + txt.join('，') + '</b>' +
        '<span>最急：' + U.esc(first.name) + '（' + U.esc(leftText(first)) + '）　·　先去处理这几家</span>' +
      '</div>' +
      '<button type="button" class="btn btn-sm" data-act="focus">只看这几家</button>' +
    '</div>';
  }

  function kpiHtml(rows, s) {
    var items = [
      { k: 'active', label: '还没发出', v: s.active, foot: '要跟的门店', color: '#3f6bf5', soft: '#edf2fe', icon: 'truck' },
      { k: 'late', label: '逾期未发', v: s.late, foot: '已经过了发货日', color: '#f04438', soft: '#feeceb', icon: 'alert' },
      { k: 'today', label: '今天该发', v: s.today, foot: '今天必须发出去', color: '#f79009', soft: '#fef4e6', icon: 'clock' },
      { k: 'sent', label: '在途', v: s.sent, foot: '已发出，等到店', color: '#dba005', soft: '#fdf6e3', icon: 'truck' },
      { k: 'done', label: '已到店', v: s.done, foot: '这家店发完了', color: '#17b26a', soft: '#e6f8ef', icon: 'check' }
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
      all: rows.length, active: s.active, late: s.late, today: s.today,
      sent: s.sent, done: s.done, noplan: s.noPlan
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
        '<span>顺序：★先发 → 手动排的 → 计划发货日近的在前 → 已到店沉底</span>' +
        '<span>' + (s.noPlan ? '<b class="text-red">' + s.noPlan + ' 家还没填发货日</b>　·　' : '') +
          '发货日一改，全组人打开都是新的（云端同步）</span>' +
      '</div>' +
    '</div>';
  }

  /* ---------------- 交互 ---------------- */

  var menuEl = null;

  function closeMenu() {
    if (menuEl && menuEl.parentNode) menuEl.parentNode.removeChild(menuEl);
    menuEl = null;
  }

  function openStMenu(anchor, row) {
    closeMenu();
    var wrap = document.createElement('div');
    wrap.className = 'ship-menu';
    wrap.innerHTML = (C.SHIP_STATUS || []).map(function (s) {
      return '<button type="button" class="ship-menu-i' + (s.key === row.status ? ' is-on' : '') + '"' +
        ' data-pick="' + s.key + '">' +
        '<i style="background:' + s.color + '"></i>' + s.label +
        (s.key === row.status ? '<em>✓</em>' : '') +
      '</button>';
    }).join('');
    document.body.appendChild(wrap);

    var rect = anchor.getBoundingClientRect();
    var w = 132, h = wrap.offsetHeight || 160;
    wrap.style.left = Math.min(rect.left, window.innerWidth - w - 12) + 'px';
    wrap.style.top = (rect.bottom + 6 + h > window.innerHeight ? rect.top - 6 - h : rect.bottom + 6) + 'px';

    wrap.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pick]');
      if (!b) return;
      var key = b.getAttribute('data-pick');
      S.setShip(row.id, { status: key });
      closeMenu();
      UI.toast(row.name + ' 改成「' + statusMeta(key).label + '」', 'success');
      App.refresh();
    });

    menuEl = wrap;
  }

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

      /* 状态 */
      if (e.target.closest('[data-st]')) {
        openStMenu(e.target.closest('[data-st]'), hit.row);
        return;
      }

      /* 点门店名 → 门店详情（物料都在那儿录） */
      if (e.target.closest('[data-open]')) {
        Pages.stores.openDetail(id);
        return;
      }
    });

    /* 计划发货日 */
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

    /* 点别处关掉状态菜单 */
    document.addEventListener('click', function (e) {
      if (menuEl && !menuEl.contains(e.target) && !e.target.closest('[data-st]')) closeMenu();
    });
    window.addEventListener('scroll', closeMenu, true);
  }

  function onEnter() { state.tab = 'all'; state.q = ''; }

  return { title: '发货看板', render: render, mount: mount, onEnter: onEnter };
})();

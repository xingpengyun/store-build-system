/* ==========================================================
   page-alerts.js — 预警中心
   ========================================================== */
window.Pages = window.Pages || {};

window.Pages.alerts = (function () {
  'use strict';

  var U = window.Utils;
  var S = window.Store;

  var state = { tab: 'all' };

  var LEVELS = {
    danger: { color: '#f04438', soft: '#feeceb', icon: 'alert', label: '严重' },
    high:   { color: '#f79009', soft: '#fef4e6', icon: 'alert', label: '高危' },
    warn:   { color: '#dba005', soft: '#fdf6e3', icon: 'clock', label: '提醒' }
  };

  function all() { return S.alerts(); }

  function filtered() {
    var list = all();
    if (state.tab === 'unread') return list.filter(function (a) { return !a.read; });
    if (state.tab === 'high') return list.filter(function (a) { return a.level === 'high' || a.level === 'danger'; });
    if (state.tab === 'warn') return list.filter(function (a) { return a.level === 'warn'; });
    return list;
  }

  function listHtml() {
    var rows = filtered();
    if (!rows.length) {
      return UI.empty('这个分类下没有预警', '一切正常，继续保持');
    }

    return rows.map(function (a) {
      var lv = LEVELS[a.level] || LEVELS.warn;
      return '<div class="alert-item' + (a.read ? ' is-read' : '') + '"' +
          ' data-alert="' + a.id + '" data-store="' + (a.storeId || '') + '"' +
          ' data-task="' + (a.taskId || '') + '">' +
        '<span class="ai-ico" style="background:' + lv.soft + ';color:' + lv.color + '">' + UI.icon(lv.icon) + '</span>' +
        '<div class="ai-body">' +
          '<div class="ai-top">' +
            '<span class="ai-title">' + U.esc(a.title) + '</span>' +
            '<span class="badge" style="color:' + lv.color + ';background:' + lv.soft + '">' + U.esc(a.type) + '</span>' +
          '</div>' +
          '<div class="ai-desc">' + U.esc(a.desc) + '</div>' +
        '</div>' +
        '<div class="ai-right">' +
          '<span class="ai-owner">' + U.esc(a.owner) + '</span>' +
          (a.read ? '' : '<span class="unread-dot"></span>') +
        '</div>' +
      '</div>';
    }).join('');
  }

  function render() {
    var list = all();
    var unread = list.filter(function (a) { return !a.read; }).length;
    var danger = list.filter(function (a) { return a.level === 'danger'; }).length;
    var high = list.filter(function (a) { return a.level === 'high' || a.level === 'danger'; }).length;
    var warn = list.filter(function (a) { return a.level === 'warn'; }).length;

    var tabs = [
      { key: 'all', label: '全部', n: list.length },
      { key: 'unread', label: '未读', n: unread },
      { key: 'high', label: '高危', n: high },
      { key: 'warn', label: '提醒', n: warn }
    ].map(function (t) {
      return '<div class="tab' + (state.tab === t.key ? ' active' : '') + '" data-tab="' + t.key + '">' +
        t.label + '<span class="cnt">' + t.n + '</span></div>';
    }).join('');

    return '' +
    '<div class="page-head fade-up">' +
      '<div>' +
        '<h1>预警中心</h1>' +
        '<p>' + unread + ' 条未读预警' + (danger ? '，其中 ' + danger + ' 条为开业延期' : '') + '</p>' +
      '</div>' +
      '<div style="display:flex;gap:8px">' +
        '<button class="btn" data-act="markAll">' + UI.icon('check') + '全部标记已读</button>' +
        '<button class="btn btn-primary" data-act="toTasks">去处理任务</button>' +
      '</div>' +
    '</div>' +

    '<section class="kpi-grid fade-up" style="grid-template-columns:repeat(4,minmax(0,1fr));animation-delay:.04s">' +
      '<div class="kpi"><span class="kpi-icon" style="background:#feeceb;color:#f04438">' + UI.icon('alert') + '</span>' +
        '<div class="kpi-body"><div class="kpi-label">全部预警</div><div class="kpi-value">' + list.length + '</div>' +
        '<div class="kpi-foot">实时生成</div></div></div>' +
      '<div class="kpi"><span class="kpi-icon" style="background:#edf2fe;color:#3f6bf5">' + UI.icon('bell') + '</span>' +
        '<div class="kpi-body"><div class="kpi-label">未读</div><div class="kpi-value">' + unread + '</div>' +
        '<div class="kpi-foot">待查看</div></div></div>' +
      '<div class="kpi"><span class="kpi-icon" style="background:#fef4e6;color:#f79009">' + UI.icon('alert') + '</span>' +
        '<div class="kpi-body"><div class="kpi-label">高危 / 严重</div><div class="kpi-value">' + high + '</div>' +
        '<div class="kpi-foot">需要立即处理</div></div></div>' +
      '<div class="kpi"><span class="kpi-icon" style="background:#fdf6e3;color:#dba005">' + UI.icon('clock') + '</span>' +
        '<div class="kpi-body"><div class="kpi-label">即将到期</div><div class="kpi-value">' + warn + '</div>' +
        '<div class="kpi-foot">' + (S.getState().settings.warnDays || 3) + ' 天内到期</div></div></div>' +
    '</section>' +

    '<div class="card fade-up" style="animation-delay:.08s">' +
      '<div class="card-head" style="margin-bottom:12px">' +
        '<div class="tabs" id="alertTabs">' + tabs + '</div>' +
      '</div>' +
      '<div id="alertListWrap">' + listHtml() + '</div>' +
    '</div>';
  }

  function update(root) {
    var wrap = root.querySelector('#alertListWrap');
    if (wrap) wrap.innerHTML = listHtml();
    root.querySelectorAll('#alertTabs .tab').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-tab') === state.tab);
    });
  }

  function mount(root) {
    root.addEventListener('click', function (e) {
      var tab = e.target.closest('[data-tab]');
      if (tab && root.contains(tab)) {
        state.tab = tab.getAttribute('data-tab');
        update(root);
        return;
      }

      var actEl = e.target.closest('[data-act]');
      if (actEl && root.contains(actEl)) {
        var act = actEl.getAttribute('data-act');
        if (act === 'markAll') {
          S.markAllAlertsRead();
          UI.toast('已全部标记为已读', 'success');
          App.refresh();
          return;
        }
        if (act === 'toTasks') {
          App.go('tasks', { tab: 'overdue' });
          return;
        }
      }

      var item = e.target.closest('.alert-item');
      if (!item) return;

      S.markAlertRead(item.getAttribute('data-alert'));
      var storeId = item.getAttribute('data-store');
      var taskId = item.getAttribute('data-task');

      if (storeId) {
        App.go('stores');
        setTimeout(function () { Pages.stores.openDetail(storeId); }, 80);
      } else if (taskId) {
        App.go('tasks', { task: taskId });
      }
    });
  }

  return { title: '预警中心', render: render, mount: mount };
})();

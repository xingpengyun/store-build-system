/* ==========================================================
   app.js — 路由 / 全局交互 / 初始化
   ========================================================== */
window.App = (function () {
  'use strict';

  var S = window.Store;
  var U = window.Utils;

  var ROUTES = ['home', 'stores', 'tasks', 'team', 'alerts', 'reports', 'settings'];
  var params = {};

  /* ---------------- 路由 ---------------- */
  function currentRoute() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    var name = h.split('/')[0].split('?')[0];
    return ROUTES.indexOf(name) >= 0 ? name : 'home';
  }

  function go(route, p) {
    params = p || {};
    if (location.hash === '#/' + route) {
      render();
    } else {
      location.hash = '#/' + route;
    }
  }

  function render() {
    var route = currentRoute();
    var page = window.Pages[route] || window.Pages.home;
    var view = document.getElementById('view');
    if (!view) return;

    if (page.onEnter) page.onEnter(params);
    params = {};

    view.innerHTML = page.render();
    if (page.mount) page.mount(view);

    document.querySelectorAll('.nav-item').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-route') === route);
    });

    var brand = S.getState().settings.brand || '门店筹建管理系统';
    document.title = (page.title || '首页') + ' · ' + brand;

    updateChrome();
    window.scrollTo(0, 0);
  }

  function refresh() { render(); }

  /* ---------------- 顶栏 / 侧栏状态 ---------------- */
  function updateChrome() {
    var set = S.getState().settings;

    var bn = document.querySelector('.brand-name');
    if (bn) bn.textContent = set.brand || '门店筹建管理系统';
    var bs = document.querySelector('.brand-slogan');
    if (bs) bs.textContent = set.slogan || '';

    var n = S.unreadAlertCount();
    var dot = document.getElementById('bellDot');
    var nb = document.getElementById('navAlertBadge');
    if (dot) {
      dot.hidden = n === 0;
      dot.textContent = n > 99 ? '99+' : n;
    }
    if (nb) {
      nb.hidden = n === 0;
      nb.textContent = n > 99 ? '99+' : n;
    }

    var bytes = S.storageBytes();
    var sizeEl = document.getElementById('storageSize');
    var barEl = document.getElementById('storageBar');
    if (sizeEl) sizeEl.textContent = U.bytes(bytes);
    if (barEl) barEl.style.width = Math.min(100, bytes / (5 * 1024 * 1024) * 100).toFixed(1) + '%';
  }

  /* ---------------- 全局搜索 ---------------- */
  function searchResults(q) {
    var s = S.getState();
    var out = [];
    var lower = q.toLowerCase();

    s.stores.forEach(function (x) {
      if (out.length >= 8) return;
      var hay = (x.name + ' ' + (x.province || '')).toLowerCase();
      if (hay.indexOf(lower) >= 0) {
        out.push({ kind: 'store', id: x.id, label: x.name, sub: (x.province || '—') + ' · ' + x.stage, type: '门店' });
      }
    });

    s.tasks.forEach(function (t) {
      if (out.length >= 8) return;
      if (t.title.toLowerCase().indexOf(lower) >= 0) {
        var st = S.storeById(t.storeId);
        out.push({
          kind: 'task', id: t.id, label: t.title,
          sub: (st ? st.name : '—') + ' · ' + t.dueDate, type: '任务'
        });
      }
    });

    s.members.forEach(function (m) {
      if (out.length >= 8) return;
      if (m.name.toLowerCase().indexOf(lower) >= 0 || m.role.toLowerCase().indexOf(lower) >= 0) {
        out.push({ kind: 'member', id: m.id, label: m.name, sub: m.role, type: '成员' });
      }
    });

    return out;
  }

  function renderSearch(q) {
    var pop = document.getElementById('searchPop');
    if (!pop) return;
    var rows = searchResults(q);

    if (!rows.length) {
      pop.innerHTML = '<div class="sp-empty">没有找到和「' + U.esc(q) + '」相关的内容</div>';
      pop.classList.add('show');
      return;
    }

    pop.innerHTML = rows.map(function (r) {
      return '<div class="sp-item" data-kind="' + r.kind + '" data-id="' + r.id + '">' +
        '<span class="badge" style="color:var(--primary);background:var(--primary-soft)">' + r.type + '</span>' +
        '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + U.esc(r.label) + '</span>' +
        '<span class="sp-type">' + U.esc(r.sub) + '</span>' +
      '</div>';
    }).join('');
    pop.classList.add('show');
  }

  function bindSearch() {
    var input = document.getElementById('globalSearch');
    var pop = document.getElementById('searchPop');
    if (!input || !pop) return;

    var run = U.debounce(function () {
      var q = input.value.trim();
      if (!q) {
        pop.classList.remove('show');
        pop.innerHTML = '';
        return;
      }
      renderSearch(q);
    }, 180);

    input.addEventListener('input', run);
    input.addEventListener('focus', function () {
      if (input.value.trim()) run();
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var q = input.value.trim();
        pop.classList.remove('show');
        if (q) go('stores', { q: q });
      } else if (e.key === 'Escape') {
        pop.classList.remove('show');
      }
    });

    pop.addEventListener('click', function (e) {
      var item = e.target.closest('.sp-item');
      if (!item) return;
      var kind = item.getAttribute('data-kind');
      var id = item.getAttribute('data-id');
      pop.classList.remove('show');
      input.value = '';

      if (kind === 'store') {
        go('stores');
        setTimeout(function () { window.Pages.stores.openDetail(id); }, 70);
      } else if (kind === 'task') {
        go('tasks', { task: id });
      } else if (kind === 'member') {
        go('team', { member: id });
      }
    });

    document.addEventListener('click', function (e) {
      if (!e.target.closest('.search-box')) pop.classList.remove('show');
    });
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    S.load();

    document.querySelectorAll('.nav-item').forEach(function (el) {
      el.addEventListener('click', function () {
        go(el.getAttribute('data-route'));
      });
    });

    var bell = document.getElementById('bellBtn');
    if (bell) bell.addEventListener('click', function () { go('alerts'); });

    var topUser = document.querySelector('.topbar-user');
    if (topUser) {
      topUser.addEventListener('click', function () { go('settings'); });
    }

    bindSearch();
    window.addEventListener('hashchange', render);

    if (!location.hash) {
      location.hash = '#/home';
    } else {
      render();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { go: go, refresh: refresh, render: render, init: init };
})();

/* ==========================================================
   app.js — 路由 / 全局交互 / 登录门 / 初始化
   ========================================================== */
window.App = (function () {
  'use strict';

  var S = window.Store;
  var U = window.Utils;

  var ROUTES = ['home', 'stores', 'tasks', 'ship', 'team', 'alerts', 'reports', 'settings'];
  var params = {};
  var currentUser = null;
  var syncTip = null;

  /* ---------------- 路由 ---------------- */
  function currentRoute() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    var name = h.split('/')[0].split('?')[0];
    return ROUTES.indexOf(name) >= 0 ? name : 'home';
  }

  /* 我是谁：登录页填的姓名（手机模式下用 user.name / phone） */
  function myName() {
    if (!currentUser) return '';
    return String(currentUser.name || currentUser.phone || currentUser.email || '').trim();
  }

  function go(route, p) {
    params = p || {};
    if (location.hash === '#/' + route) {
      render();
    } else {
      location.hash = '#/' + route;
    }
  }

  /* ---------------- 重画时的「锚点」：不让它跳 ----------------
     数据一变整页重画，行的位置会因为排序 / 增删而挪动，
     滚动条不动就会看到内容整体跳一下。这里在重画前挑一个
     视口里最靠上的、带 data-* / id 的元素当锚点，重画后
     把它挪回原来在屏幕上的位置（跟任务页展开门店用的是一套思路）。 */
  var ANCHOR_ATTRS = ['data-srow', 'data-id', 'data-store', 'id'];

  function pickAnchor(view) {
    if (!view) return null;
    var vh = window.innerHeight || 800;
    var best = null;
    var nodes = view.querySelectorAll('[data-srow],[data-id],[data-store],[id]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var r = el.getBoundingClientRect();
      if (!r.height || r.bottom < 60 || r.top > vh) continue;   /* 不在视口里 */
      var key = null;
      for (var j = 0; j < ANCHOR_ATTRS.length; j++) {
        var v = el.getAttribute(ANCHOR_ATTRS[j]);
        if (v) { key = ANCHOR_ATTRS[j] + '="' + v + '"'; break; }
      }
      if (!key) continue;
      var score = Math.abs(r.top - 110);
      if (!best || score < best.score) best = { key: key, top: r.top, score: score };
    }
    return best;
  }

  /* opts.keep = 原地重画：不跑 onEnter（那是「刚进这一页」的初始化），也不滚回顶部。
     数据变了要重画时用这个 —— 否则在任务页连点几条「完成」，
     每点一次门店就收起、页面弹回顶部，根本没法连着干。 */
  function render(opts) {
    var keep = !!(opts && opts.keep);
    var route = currentRoute();

    /* 系统设置是管理员的：没权限的人直接送回首页（导航里也看不到那一项） */
    if (route === 'settings' && !S.canSettings(myName())) {
      var own = S.accessOf().owner;
      window.UI.toast('「系统设置」只有管理员能进，需要开权限请找 ' + own, 'error', 2800);
      if (location.hash !== '#/home') { location.hash = '#/home'; return; }
      route = 'home';
    }

    var page = window.Pages[route] || window.Pages.home;
    var host = document.getElementById('view');
    if (!host) return;

    var prevScroll = window.pageYOffset || document.documentElement.scrollTop || 0;
    var anchor = keep ? pickAnchor(host) : null;

    /* 用一个新的空容器替换掉旧的 #view：
       各页面都是在 #view 上挂事件监听的，如果一直复用同一个节点，
       来回切页面会让监听越挂越多（点一次「新建门店」会连着触发上一次「新增任务」的处理，
       于是弹出一堆「请先创建门店」）。换节点后旧监听随旧节点一起丢掉。 */
    var view = host.cloneNode(false);
    host.parentNode.replaceChild(view, host);

    /* 原地重画时别再播一遍入场动画：.fade-up 是「向上挪 8px + 淡入」，
       每次数据变动整个页面都重新飘一遍，看起来就是抖。
       切页面（非 keep）要清掉这个类 —— 新容器是从旧容器 clone 来的，会带着。 */
    if (keep) view.classList.add('re-quiet');
    else view.classList.remove('re-quiet');

    if (!keep && page.onEnter) page.onEnter(params);
    params = {};

    view.innerHTML = page.render();
    if (page.mount) page.mount(view);

    document.querySelectorAll('.nav-item').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-route') === route);
    });

    var brand = S.getState().settings.brand || '门店筹建管理系统';
    document.title = (page.title || '首页') + ' · ' + brand;

    updateChrome();

    if (!keep) { window.scrollTo(0, 0); return; }

    /* 锚点还在（比如那家门店没被删）→ 按差值补滚动；不在了 → 退回原滚动值 */
    var after = anchor ? view.querySelector('[' + anchor.key + ']') : null;
    if (after) {
      var delta = after.getBoundingClientRect().top - anchor.top;
      if (Math.abs(delta) > 0.5) window.scrollBy(0, delta);
      else window.scrollTo(0, prevScroll);
    } else {
      window.scrollTo(0, prevScroll);
    }
  }

  function refresh(opts) { render(opts); }

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
    if (dot) { dot.hidden = n === 0; dot.textContent = n > 99 ? '99+' : n; }
    if (nb) { nb.hidden = n === 0; nb.textContent = n > 99 ? '99+' : n; }

    var bytes = S.storageBytes();
    var sizeEl = document.getElementById('storageSize');
    var barEl = document.getElementById('storageBar');
    if (sizeEl) sizeEl.textContent = U.bytes(bytes);
    if (barEl) barEl.style.width = Math.min(100, bytes / (5 * 1024 * 1024) * 100).toFixed(1) + '%';

    var userEl = document.querySelector('.topbar-user .avatar');
    var uname = (currentUser && (currentUser.name || currentUser.phone)) || '我';
    if (userEl) {
      userEl.textContent = String(uname).slice(-2);
      userEl.title = uname + ' · 点击去设置';
    }
    var nameEl = document.getElementById('topbarUserName');
    if (nameEl) nameEl.textContent = uname;

    /* 待发送角标：断网时改的东西进了队列，顶栏挂个数字，别让用户以为已经存上去了 */
    var pend = S.pendingCount();
    var obtn = document.getElementById('outboxBtn');
    var odot = document.getElementById('outboxDot');
    if (obtn) {
      obtn.hidden = pend === 0;
      obtn.classList.toggle('is-outbox', pend > 0);
      obtn.title = pend
        ? '还有 ' + pend + ' 条改动没发到云端，联网后会自动补发（点击手动补发）'
        : '待发送数据';
    }
    if (odot) odot.textContent = pend > 99 ? '99+' : pend;

    /* 没权限的人：导航里干脆不放「系统设置」，少一个点进去被弹回来的坑 */
    var setItem = document.querySelector('.nav-item[data-route="settings"]');
    if (setItem) setItem.classList.toggle('hidden', !S.canSettings(myName()));

    showSyncTip(!S.isOnline());
  }

  function showSyncTip(offline) {
    if (!offline) {
      if (syncTip) { syncTip.remove(); syncTip = null; }
      return;
    }
    if (syncTip) return;
    syncTip = document.createElement('div');
    syncTip.className = 'sync-tip offline';
    syncTip.innerHTML = '<i></i><span>离线模式：改动先存在本地，联网后自动补传</span>';
    document.body.appendChild(syncTip);
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
        var dueTxt = S.suggestDateOf(t);
        out.push({ kind: 'task', id: t.id, label: t.title,
          sub: (st ? st.name : '—') + ' · ' + (dueTxt ? '建议 ' + U.monthDay(dueTxt) : '未设开业日 · 开业前 ' + S.taskBeforeOf(t) + ' 天'),
          type: '任务' });
      }
    });

    s.members.forEach(function (m) {
      if (out.length >= 8) return;
      if (m.name.toLowerCase().indexOf(lower) >= 0 || (m.role || '').toLowerCase().indexOf(lower) >= 0) {
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

  /* ---------------- 自动同步时别打断正在输入的人 ----------------
     同事同时在用时，每 45 秒会把云端最新数据拉回来重画。
     如果这时候你正在某个输入框里打字（到货备注、门店名、表单…），
     重画会把你打的字冲掉、光标也丢了。所以：
     ① 正在输入就先不重画，记下来；
     ② 等输入框失焦了再补上这次重画。 */
  var pendingRerender = false;

  function isEditing() {
    var ae = document.activeElement;
    if (!ae) return false;
    if (ae.isContentEditable) return true;
    var tag = ae.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  /* ---------------- 骨架事件 ---------------- */
  function bindShell() {
    document.querySelectorAll('.nav-item').forEach(function (el) {
      el.addEventListener('click', function () {
        if (!S.getState()) return;
        go(el.getAttribute('data-route'));
      });
    });

    var bell = document.getElementById('bellBtn');
    if (bell) bell.addEventListener('click', function () { go('alerts'); });

    /* 待发送按钮：平时隐藏，有排队数据时才出来；点一下立刻补发 */
    var obtn = document.getElementById('outboxBtn');
    if (obtn) obtn.addEventListener('click', function () {
      var n = S.pendingCount();
      if (!n) return;
      window.UI.toast('正在补发 ' + n + ' 条待发送数据…');
      S.flushOutbox().then(function (sent) {
        window.UI.toast(sent ? '补发完成：' + sent + ' 条' : '云端还是连不上，稍后再试', sent ? 'success' : 'error');
        updateChrome();
      });
    });

    var topUser = document.querySelector('.topbar-user');
    if (topUser) {
      topUser.addEventListener('click', function () { go('settings'); });
    }

    bindSearch();
    window.addEventListener('hashchange', render);

    /* 刚才因为在打字而推迟的重画，现在补上（他已经不编辑了） */
    document.addEventListener('focusout', function () {
      if (!pendingRerender) return;
      setTimeout(function () {
        if (!pendingRerender) return;
        if (isEditing()) return;          /* 焦点只是挪到另一个输入框，继续等 */
        pendingRerender = false;
        render({ keep: true });
        window.UI.toast('已同步团队其他人的更新', 'info');
      }, 260);
    });
  }

  /* ---------------- 启动流程 ---------------- */
  function startApp() {
    /* 登录没完成前整个外壳是藏着的（body.booting），
       否则刷新时会先闪一下主界面，再退回登录页 */
    document.body.classList.remove('booting');
    window.UI.loading('正在从云端加载数据…');

    S.load(function (done, total) {
      var label = document.querySelector('#loadingLayer p');
      if (label && total) {
        label.textContent = '首次同步：正在上传 ' + done + ' / ' + total + ' 条…';
      }
    }).then(function (r) {
      window.UI.hideLoading();

      if (r && r.imported) {
        window.UI.toast('已把本地 ' + r.imported + ' 家门店同步到云端', 'success');
      }

      if (r && r.empty) {
        window.UI.toast('还没有数据，去「门店管理」添加第一家门店', 'info');
      }

      if (!location.hash) location.hash = '#/home';
      bindShell();
      render();

      if (r && r.offline) {
        window.UI.toast('云端连接失败，当前使用本地缓存', 'error');
      }

      S.startAutoSync(45000, function () {
        /* 别人改了数据：重画但不打断当前操作。
           正在输入框里打字时先别重画 —— 重画会把光标里的字冲掉、
           焦点也丢了。等他输入框失焦了再画（见 bindShell 里的 focusout）。 */
        if (isEditing()) { pendingRerender = true; return; }
        render({ keep: true });
        window.UI.toast('检测到团队其他人的更新，已刷新', 'info');
      });
    }).catch(function (e) {
      window.UI.hideLoading();
      window.UI.toast('数据加载失败：' + (e.message || e), 'error');
      var view = document.getElementById('view');
      if (view) {
        view.innerHTML = '<div class="card" style="margin-top:40px;text-align:center;padding:50px 20px">' +
          '<h3 style="margin-bottom:10px">数据加载失败</h3>' +
          '<p style="color:var(--text-2);font-size:13px;margin-bottom:18px">' + U.esc(e.message || String(e)) + '</p>' +
          '<button class="btn btn-primary" onclick="location.reload()">重新加载</button></div>';
      }
    });
  }

  function logout() {
    window.UI.confirm({
      title: '退出登录',
      text: '退出后需要重新填写姓名和账号密码。',
      okText: '退出',
      onOk: function () {
        S.stopAutoSync();
        try { window.Cloud.simpleLogout(); } catch (e) {}
        window.Cloud.logout().catch(function () {}).then(function () {
          location.hash = '';
          location.reload();
        });
      }
    });
  }

  function init() {
    if (!window.Cloud) {
      window.UI.toast('云服务组件未加载，请检查 js/vendor/cloud-sdk.js', 'error');
      return;
    }

    /* ---------- 简单账号密码模式 ---------- */
    if (window.Cloud.authMode !== 'phone') {
      var saved = window.Cloud.simpleUser ? window.Cloud.simpleUser() : null;

      /* 有登录态、也留下了姓名 → 直接进；只剩老登录态没姓名的，补填一次姓名
         （姓名现在是要显示的，缺了就不知道"当前是谁"） */
      if (window.Cloud.isSimpleAuthed() && saved && saved.name) {
        currentUser = { name: saved.name, account: saved.account || 'admin' };
        startApp();
        return;
      }
      window.Login.show(function (user) {
        currentUser = user || { name: 'admin' };
        startApp();
      });
      return;
    }

    /* ---------- 手机验证码模式 ---------- */
    window.Cloud.currentSession().then(function (session) {
      if (!session) {
        window.Login.show(function (user) {
          currentUser = user || {};
          startApp();
        });
        return;
      }
      currentUser = session.user || {};
      startApp();
    }).catch(function (e) {
      window.UI.toast('登录检查失败：' + (e.message || e), 'error');
      window.Login.show(function (user) {
        currentUser = user || {};
        startApp();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    go: go,
    refresh: refresh,
    render: render,
    init: init,
    logout: logout,
    refreshChrome: updateChrome,
    get user() { return currentUser; }
  };
})();

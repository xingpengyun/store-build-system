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
  var syncTipKind = '';

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

  /* 顶栏右上角那颗头像。
     2026-10-25 z106：以前这里硬写「名字后两字」，团队页把成员头像换成小动物后，
     右上角永远还是那两个字 —— 用户说的「其他显示头像的地方没有换」就是这个。
     现在跟其他页面走同一套：成员配了动物就画动物，没配还是名字后两字。
     只在「动物 key 变了」时重建节点：每次同步都重插一遍 SVG 会闪。 */
  function paintUserAvatar(uname) {
    var el = document.querySelector('.topbar-user .avatar');
    if (!el) return;

    var list = (S.getState() || {}).members || [];
    var nm = String(uname || '').trim();
    var me = null;
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].name || '').trim() === nm) { me = list[i]; break; }
    }

    var art = (me && me.animal && UI.ANIMALS[me.animal]) ? me.animal : '';
    var color = (me && me.color) || '#3f6bf5';

    var sig = art + '|' + nm;
    if (el.getAttribute('data-sig') !== sig) {
      el.setAttribute('data-sig', sig);
      el.className = 'avatar avatar-md' + (art ? ' avatar-art' : '');
      el.style.background = art ? (UI.ANIMALS[art].bg || color) : color;
      el.innerHTML = art ? UI.animalSvg(art) : U.esc(String(uname).slice(-2));
    }
    el.title = uname + ' · 点开有账号菜单';
  }

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

    var uname = (currentUser && (currentUser.name || currentUser.phone)) || '我';
    paintUserAvatar(uname);
    var nameEl = document.getElementById('topbarUserName');
    if (nameEl) nameEl.textContent = uname;

    /* 头像的悬浮提示：管理员才能「点击去设置」，别人就只写当前登录人 */
    var topUserEl = document.querySelector('.topbar-user');
    if (topUserEl) {
      topUserEl.title = S.canSettings(myName()) ? '当前登录人 · 点开可去设置或退出' : '当前登录人 · 点开可退出';
    }

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

    showSyncTip(!S.isOnline() ? 'offline' : (syncing ? 'syncing' : ''));
  }

  /* 底部那一条小提示：
       'offline' —— 离线模式（红）
       'syncing' —— 先显示本地缓存、后台正在对齐云端（深色）
       ''        —— 收起来 */
  function showSyncTip(kind) {
    if (!kind) {
      if (syncTip) { syncTip.remove(); syncTip = null; }
      syncTipKind = '';
      return;
    }
    if (syncTip && syncTipKind === kind) return;
    if (syncTip) { syncTip.remove(); syncTip = null; }
    syncTipKind = kind;
    syncTip = document.createElement('div');
    syncTip.className = 'sync-tip' + (kind === 'offline' ? ' offline' : '');
    syncTip.innerHTML = '<i></i><span>' +
      (kind === 'offline' ? '离线模式：改动先存在本地，联网后自动补传' : '正在同步最新数据…') +
      '</span>';
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
     同事同时在用时，会定时把云端最新数据拉回来重画（间隔按数据量自适应，4~15 秒）。
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
      topUser.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleUserMenu();
      });
      /* 点别处 / 按 Esc 收起来；不然菜单会一直挂在那儿挡视线 */
      document.addEventListener('click', function () { closeUserMenu(); });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeUserMenu();
      });
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

  var booted = false;       /* 外壳（导航 / 搜索 / hashchange）只挂一次 */
  var syncing = false;      /* 正在后台对齐云端：底部提示用 */
  var welcomed = false;
  var kicked = false;

  function bootShell() {
    if (booted) return;
    booted = true;
    if (!location.hash) location.hash = '#/home';
    bindShell();
  }

  /* 登录之后还要再校验一次（2026-10-25 z105）
     ------------------------------------------------------------
     登录时只校验过一次，人被移出团队之后，那台还开着的页面照样能看能改。
     现在：数据刚从云端拉下来时、以及每轮同步之后，都拿最新名单再问一遍，
     不在名单里就清掉登录态、请回登录页。 */
  function checkMe() {
    if (!currentUser || !currentUser.name) return;
    var r = S.meAllowed(currentUser.name);
    if (r && r.ok === false) kickOut(r.msg || '你已不在团队成员名单里');
  }

  function kickOut(msg) {
    if (kicked) return;
    kicked = true;
    S.stopAutoSync();
    try { window.Cloud.simpleLogout(); } catch (e) {}
    try { window.Cloud.logout().catch(function () {}); } catch (e2) {}

    function goLogin() { location.hash = ''; location.reload(); }

    window.UI.modal({
      title: '登录已失效',
      body: '<p style="font-size:13px;line-height:1.8;color:var(--text-2)">' +
        U.esc(msg) + '</p>' +
        '<p style="margin-top:8px;font-size:12px;line-height:1.8;color:var(--text-3)">' +
        '你的账号已被移出团队（或管理员收回了授权）。需要继续使用，请联系管理员重新开通后再登录。</p>',
      footer: '<button class="btn btn-primary" data-act="ok">重新登录</button>',
      onMount: function (rootEl) {
        rootEl.querySelector('[data-act="ok"]').onclick = goLogin;
        /* 光弹个框不够：点 × / 点遮罩 / 按 Esc 都能关掉它，关掉之后
           页面还在，照样能看能改。所以这三种关法也一律回登录页。 */
        var mask = rootEl.closest('.modal-mask');
        document.addEventListener('click', function (e) {
          if (e.target === mask || (e.target.closest && e.target.closest('.modal-close'))) goLogin();
        }, true);
        document.addEventListener('keydown', function (e) {
          if (e.key === 'Escape') goLogin();
        }, true);
      }
    });
  }

  /* 双击 index.html（Origin 是 null）或在本机起服务预览时，云端一定会拒：
     它按「来源域名」校验凭据，域名对不上就当跨域处理。
     这不是代码坏了，得把话说明白，而不是甩一句 Failed to fetch。 */
  function isLocalOpen() {
    return location.protocol === 'file:' ||
      /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i.test(location.hostname || '');
  }

  function onlineUrl() {
    try {
      var c = window.Cloud && (window.Cloud.config || window.Cloud.CFG);
      return (c && c.siteUrl) || '';
    } catch (e) { return ''; }
  }

  function showLocalHint(cached) {
    var url = onlineUrl();
    var link = url ? '<a class="btn btn-primary" href="' + U.esc(url) + '">打开线上地址</a>' : '';

    /* 有缓存：界面已经画出来了，别用整块卡片盖掉，只在底部挂一条提示 */
    if (cached) {
      if (document.querySelector('.sync-tip.local')) return;
      var tip = document.createElement('div');
      tip.className = 'sync-tip local';
      tip.innerHTML = '<i></i><span>本地预览：显示的是本机缓存，真实数据请看线上地址</span>' +
        (url ? '<a href="' + U.esc(url) + '">打开</a>' : '');
      document.body.appendChild(tip);
      return;
    }

    var view = document.getElementById('view');
    if (!view) return;
    view.innerHTML = '<div class="card" style="margin-top:40px;max-width:560px;margin-left:auto;margin-right:auto;text-align:center;padding:50px 24px">' +
      '<h3 style="margin-bottom:10px">这是本地文件，连不上云端数据</h3>' +
      '<p style="color:var(--text-2);font-size:13px;line-height:1.9">' +
        '云端只接受从线上地址发来的请求（来源校验），所以直接双击打开这个文件读不到门店和任务。</p>' +
      '<p style="color:var(--text-3);font-size:12px;line-height:1.9;margin:6px 0 20px">' +
        '要查看或录入真实数据，请用线上地址；本地文件只用来改代码。</p>' +
      '<div style="display:flex;gap:10px;justify-content:center">' + link +
        '<button class="btn" onclick="location.reload()">重新加载</button></div></div>';
  }

  function startApp() {
    /* 登录没完成前整个外壳是藏着的（body.booting），
       否则刷新时会先闪一下主界面，再退回登录页 */
    document.body.classList.remove('booting');

    var painted = false;    /* 是否已经用本地缓存先把界面画出来了 */

    window.UI.loading('正在从云端加载数据…');

    var loading = S.load(function (done, total) {
      var label = document.querySelector('#loadingLayer p');
      if (label && total) {
        label.textContent = '首次同步：正在上传 ' + done + ' / ' + total + ' 条…';
      }
    }, function onCached() {
      /* 本地有上一轮的完整快照 → 立刻上屏（几十毫秒），云端那份回来后再替换。
         几千条数据时，这一下就把「打开要等好几秒」变成了「打开就有」。 */
      painted = true;
      window.UI.hideLoading();
      bootShell();
      render();
      syncing = true;
      updateChrome();
    });

    loading.then(function (r) {
      syncing = false;
      window.UI.hideLoading();
      bootShell();

      if (painted) render({ keep: true });     /* 缓存 → 云端那份对齐了 */
      else render();

      if (!welcomed) { welcomed = true; maybeWelcome(); }

      if (r && r.imported) {
        window.UI.toast('已把本地 ' + r.imported + ' 家门店同步到云端', 'success');
      }

      if (r && r.empty) {
        window.UI.toast('还没有数据，去「门店管理」添加第一家门店', 'info');
      }

      if (r && r.offline) {
        window.UI.toast('云端连接失败，当前使用本地缓存', 'error');
      } else {
        checkMe();      /* 名单刚更新过：确认当前登录人还在团队里 */
      }

      /* 传 0 = 让数据层按体量自适应间隔（小数据 4 秒 / 中等 8 秒 / 大数据 15 秒）。
         每轮先问一次变更票据，没人改过就整轮跳过，一个字节都不下。 */
      S.startAutoSync(0, function () {
        /* 别人改了数据：实时重画但不打断当前操作。
           正在输入框里打字时先别重画 —— 重画会把光标里的字冲掉、
           焦点也丢了。等他输入框失焦了再画（见 bindShell 里的 focusout）。 */
        checkMe();                  /* 别人可能刚把我移出团队 */
        if (kicked) return;
        if (isEditing()) { pendingRerender = true; return; }
        render({ keep: true });
      });
    }).catch(function (e) {
      syncing = false;
      window.UI.hideLoading();

      /* 本地打开时云端必然拒绝（来源校验），这不是故障，单独说明 */
      if (isLocalOpen()) { showLocalHint(painted); return; }

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

  /* ---------------- 首次登录欢迎 ----------------
     每个姓名第一次在本机登录时，弹一次「欢迎加入」；
     记在 localStorage（按姓名），下次再登就不弹了。 */
  var WELCOME_KEY = 'shopbuild.welcome.seen.v1';

  function welcomedList() {
    try {
      var arr = JSON.parse(localStorage.getItem(WELCOME_KEY) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function hasWelcomed(name) {
    return welcomedList().indexOf(name) >= 0;
  }

  function markWelcomed(name) {
    try {
      var arr = welcomedList();
      if (arr.indexOf(name) < 0) arr.push(name);
      localStorage.setItem(WELCOME_KEY, JSON.stringify(arr));
    } catch (e) {}
  }

  function maybeWelcome() {
    var name = myName();
    if (!name || hasWelcomed(name)) return;
    markWelcomed(name);
    /* 等主界面先露出来再弹，别盖在加载遮罩上 */
    setTimeout(function () {
      window.UI.welcome({ name: name, admin: S.canSettings(name) });
    }, 500);
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

  /* ---------------- 顶栏账号菜单 ----------------
     以前点头像是「管理员去设置 / 其他人弹一句没权限」—— 普通成员连退出的地方都没有，
     因为「退出登录」只写在系统设置页，而那一页只有管理员能进。
     现在点开是一个小菜单：谁都能看到「退出登录」，管理员多一项「系统设置」。 */
  var userMenuEl = null;

  function closeUserMenu() {
    if (userMenuEl && userMenuEl.parentNode) userMenuEl.parentNode.removeChild(userMenuEl);
    userMenuEl = null;
    var host = document.querySelector('.topbar-user');
    if (host) host.classList.remove('is-open');
  }

  function memberOf(uname) {
    var list = (S.getState() || {}).members || [];
    var nm = String(uname || '').trim();
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].name || '').trim() === nm) return list[i];
    }
    return null;
  }

  /* 头像 HTML：跟顶栏那颗走同一套规则（配了动物画动物，没配就名字后两字） */
  function avatarHtml(uname, size) {
    var me = memberOf(uname);
    var art = (me && me.animal && UI.ANIMALS[me.animal]) ? me.animal : '';
    var color = (me && me.color) || '#3f6bf5';
    var bg = art ? (UI.ANIMALS[art].bg || color) : color;
    return '<span class="avatar ' + (size || 'avatar-md') + (art ? ' avatar-art' : '') +
      '" style="background:' + U.esc(bg) + '">' +
      (art ? UI.animalSvg(art) : U.esc(String(uname || '我').slice(-2))) + '</span>';
  }

  function toggleUserMenu() {
    if (userMenuEl) { closeUserMenu(); return; }
    var host = document.querySelector('.topbar-user');
    if (!host) return;

    var uname = myName() || '我';
    var admin = S.canSettings(uname);

    var el = document.createElement('div');
    el.className = 'user-menu';
    el.setAttribute('role', 'menu');
    el.innerHTML =
      '<div class="um-head">' + avatarHtml(uname, 'avatar-md') +
        '<div class="um-who"><b>' + U.esc(uname) + '</b><i>' + (admin ? '管理员' : '团队成员') + '</i></div>' +
      '</div>' +
      (admin
        ? '<button class="um-item" type="button" role="menuitem" data-um="settings">' +
            UI.icon('gear') + '系统设置</button>'
        : '') +
      '<div class="um-sep"></div>' +
      '<button class="um-item um-danger" type="button" role="menuitem" data-um="logout">' +
        UI.icon('exit') + '退出登录</button>';

    el.addEventListener('click', function (e) {
      e.stopPropagation();
      var item = e.target.closest ? e.target.closest('[data-um]') : null;
      if (!item) return;
      var act = item.getAttribute('data-um');
      closeUserMenu();
      if (act === 'settings') go('settings');
      else if (act === 'logout') logout();
    });

    host.appendChild(el);
    userMenuEl = el;
    host.classList.add('is-open');
    /* 焦点故意留在触发它的头像按钮上，不往菜单里挪：
       - 普通成员只有「退出登录」一项，焦点进去就把它顶成红色高亮，看着像已被按下；
       - 面板本身不可点，给它套焦点环也是多余的。
       菜单是接在头像后面的，键盘按 Tab 照样进得到菜单项；Esc 由 document 统一接。 */
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

/* ==========================================================
   app.js — 路由、全局状态、启动
   ----------------------------------------------------------
   状态全部在内存：大文件解析结果（可到几十万单元格）不落盘，
   刷新页面就得重新上传 —— 这是刻意的，localStorage 存不下也没必要。
   真正的「记忆」是门店匹配库、核对方案、历史统计，这些在 db.js 里。
   ========================================================== */
window.CKApp = (function () {
  'use strict';

  var U = window.CKUtil;
  var UI = window.CKUI;
  var DB = window.CKDB;

  var ROUTES = {
    home: { title: '核对首页', sub: '内部表 × 外部表' },
    new: { title: '新建核对', sub: '上传两个文件，选择参与核对的工作表和字段' },
    result: { title: '核对结果', sub: '逐行核对结果、异常处理与报告导出' },
    alias: { title: '门店匹配库', sub: '人工确认过的门店对应关系，下次自动沿用' },
    history: { title: '核对历史', sub: '每次核对的记录与结果' },
    rules: { title: '规则配置', sub: '门槛金额、匹配阈值与数据管理' }
  };

  var state = {
    /* 只剩一种核对逻辑：门槛核验 —— 外部表里的门店，在内部表的订货金额是否达到门槛。
       原来的「金额对账」（差额 + 误差）已下线，mode 只为兼容旧历史记录而保留。 */
    mode: 'threshold',
    threshold: 16000,
    /* 日期容差：B 表是「比登记晚一天」的发货表，容差 = 允许偏离「晚一天」多少天（默认 1） */
    dateTolerance: 1,

    /* 上传与配置（内存） */
    aFile: null,
    bFile: null,
    aSheets: [],
    bSelected: [],        /* 外部表勾选参与核对的工作表名 */
    bMaps: {},            /* { [sheetName]: { nameField, amountField, dateField, extraFields } } */
    aMap: null,
    tolerance: 0.01,
    mergeSheets: false,
    overrides: {},
    schemeId: null,
    schemeName: '',
    schemeApplied: false, /* 本次文件对上是否已自动套用过方案（防止反复套用） */
    activeBIdx: 0,        /* 字段映射当前停留的 Sheet 下标 */
    stepOverride: null,   /* 「上一步」时压过自动步骤推断 */

    /* 结果 */
    result: null,         /* 当前内存里的核对结果 */
    resultMeta: null,
    historyView: null,    /* 打开的历史记录（只读） */
    resultFilter: 'all',
    resultSearch: '',
    resultSort: 'diffDesc',
    resultPage: 1,
    resultPageSize: 50,
    resultDedup: false,   /* 去掉重复门店：开启后每家店只显示一条 */

    step: 1
  };

  function currentRoute() {
    var h = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
    return ROUTES[h] ? h : 'home';
  }

  function go(route) {
    if (location.hash === '#/' + route) render();
    else location.hash = '#/' + route;
  }

  /* 上一次真正渲染的路由。用来区分「换页」和「原地重渲染」：
     勾选工作表、改筛选条件都是原地重渲染，页面不该跳回顶部 ——
     用户每取消一张表就被弹回页首，得重新往下滚，这是实打实的恼人。
     换页才回到顶部。 */
  var lastRoute = null;

  function scrollY() {
    return window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
  }

  function render(opt) {
    opt = opt || {};
    var route = currentRoute();
    var page = window.CKPages && window.CKPages[route];
    if (!page) { go('home'); return; }

    var routeChanged = lastRoute !== null && lastRoute !== route;
    var keepTop = routeChanged ? 0 : scrollY();
    lastRoute = route;

    var view = document.getElementById('ckView');
    var titleEl = document.getElementById('ckTitle');
    var subEl = document.getElementById('ckSubtitle');
    var actsEl = document.getElementById('ckTopActions');

    var meta = ROUTES[route];
    titleEl.textContent = (page.title && page.title()) || meta.title;
    subEl.textContent = (page.subtitle && page.subtitle()) || meta.sub;
    actsEl.innerHTML = page.topActions ? page.topActions() : '';

    try {
      view.innerHTML = page.render();
    } catch (e) {
      view.innerHTML = '<div class="ck-card"><div class="ck-card-body">' +
        UI.empty({ title: '这个页面渲染出错了', text: (e && e.message) || String(e), mood: 'sad' }) + '</div></div>';
      console.error('[check] render error', e);
    }

    if (page.mount) {
      try { page.mount(view); } catch (e2) { console.error('[check] mount error', e2); }
    }

    /* 导航高亮 */
    U.$$('#ckNav .ck-nav-item').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-route') === route);
    });

    document.title = titleEl.textContent + ' · 包邮核对';

    /* 换页 / 明确要求回顶 → 0；否则恢复原来的滚动位置。
       用 rAF 再滚一次，防止内容刚插进 DOM、高度还没算完就被浏览器截断。 */
    if (routeChanged || opt.toTop) {
      window.scrollTo(0, 0);
    } else if (keepTop > 0) {
      window.scrollTo(0, keepTop);
      requestAnimationFrame(function () { window.scrollTo(0, keepTop); });
    }

    refreshBadges();
  }

  function refreshBadges() {
    var aliasBadge = document.getElementById('navAliasBadge');
    if (aliasBadge) {
      var n = DB.listAliases().length;
      aliasBadge.textContent = n > 99 ? '99+' : String(n);
      aliasBadge.hidden = n === 0;
    }
    var diffBadge = document.getElementById('navDiffBadge');
    if (diffBadge) {
      var r = getActiveResult();
      var c = 0;
      if (r && r.stats) {
        /* 门槛核验看「未达标 + 待确认 + 仓库未对应 + 清单外」，对账模式看「差异 + 待确认 + 未匹配」 */
        if (r.meta && r.meta.mode === 'threshold') {
          c = (r.stats.fail || 0) + (r.stats.needConfirm || 0) + (r.stats.unmatchedB || 0) + (r.stats.unmatchedA || 0);
        } else {
          c = (r.stats.amountDiff || 0) + (r.stats.needConfirm || 0) + (r.stats.unmatched || 0);
        }
      }
      diffBadge.textContent = c > 99 ? '99+' : String(c);
      diffBadge.hidden = c === 0;
      diffBadge.classList.toggle('is-soft', c === 0);
      if (c > 0) diffBadge.style.background = 'var(--warn)';
      else diffBadge.style.background = '';
    }
  }

  /* 结果页展示哪一个：优先历史，其次当前 */
  function getActiveResult() {
    if (state.historyView) {
      return {
        rows: state.historyView.rows || [],
        rowsB: state.historyView.rowsB || null,
        rowsA: state.historyView.rowsA || null,
        sheetStats: state.historyView.sheetStats || null,
        stats: state.historyView.stats || {},
        meta: {
          title: state.historyView.title,
          mode: state.historyView.mode || 'recon',
          threshold: state.historyView.threshold,
          dateTolerance: state.historyView.dateTolerance,
          aFileName: state.historyView.aFileName,
          bFileName: state.historyView.bFileName,
          aSheets: state.historyView.aSheets,
          bSheets: state.historyView.bSheets,
          aMap: state.historyView.aMap,
          tolerance: state.historyView.tolerance,
          mergeSheets: state.historyView.mergeSheets,
          at: state.historyView.at
        },
        isHistory: true,
        history: state.historyView
      };
    }
    if (!state.result) return null;
    return {
      rows: state.result.rows,
      rowsB: state.result.rowsB || null,
      rowsA: state.result.rowsA || null,
      sheetStats: state.result.sheetStats || null,
      stats: state.result.stats,
      meta: state.resultMeta || {},
      isHistory: false
    };
  }

  function setResult(result, meta, keepView) {
    state.result = result;
    state.resultMeta = meta;
    state.historyView = null;
    if (!keepView) {
      /* 门槛核验默认看「全部」—— 全部 = 达标 + 异常，一眼对总数；
         具体哪里有问题点「异常」看，每行状态列写明原因 */
      state.resultFilter = 'all';
      state.resultSearch = '';
      state.resultPage = 1;
      state.resultDedup = false;
    }
  }

  function openHistory(hid) {
    var h = DB.getHistory(hid);
    if (!h) { UI.toast('这条历史记录已不存在', 'bad'); return; }
    state.historyView = h;
    state.resultFilter = 'all';
    state.resultSearch = '';
    state.resultPage = 1;
    go('result');
  }

  /* 重置上传流程（新建核对时用） */
  function resetNew() {
    state.aFile = null;
    state.bFile = null;
    state.aSheets = [];
    state.bSelected = [];
    state.bMaps = {};
    state.aMap = null;
    state.overrides = {};
    /* 记住的「当前方案」不跟着清空 —— 那是偏好，下次上传还会自动套用 */
    state.schemeApplied = false;
    state.activeBIdx = 0;
    state.step = 1;
    state.stepOverride = null;
  }

  function boot() {
    DB.load();

    /* 读一次规则默认值 */
    var rules = DB.getRules();
    state.tolerance = rules.tolerance;
    state.mergeSheets = !!rules.mergeSheets;
    /* 门槛是「上一次用在哪儿、下次还从那儿开始」的偏好；模式固定门槛核验 */
    state.mode = 'threshold';
    state.threshold = Number(rules.threshold) >= 0 ? Number(rules.threshold) : 16000;
    state.dateTolerance = Number(rules.dateTolerance) >= 0 ? Number(rules.dateTolerance) : 1;

    /* 记住上次套用的方案：刷新 / 下次打开自动沿用，别让用户每次重新选。
       方案被删了或不存在就静默忽略，回退到「还没套用」。 */
    var lastSchemeId = DB.getPref('lastSchemeId', null);
    if (lastSchemeId) {
      var sc = DB.getScheme(lastSchemeId);
      if (sc) { state.schemeId = sc.id; state.schemeName = sc.name; }
    }

    /* 导航点击 */
    var nav = document.getElementById('ckNav');
    nav.addEventListener('click', function (e) {
      var item = e.target.closest('.ck-nav-item');
      if (!item) return;
      var route = item.getAttribute('data-route');
      if (route === 'new' && state.resultMeta && !state.aFile) {
        /* 从结果页点「新建」保持上次配置，不重置 */
      }
      if (route === 'result' && state.historyView) state.historyView = null;
      go(route);
    });

    /* 顶栏右上角显示当前登录人。
       核对页和主站同 origin，主站登录后会把 {name, account, at} 写进 sbs.user，
       这里只读不写 —— 没登录信息就整块不显示，不硬占位。 */
    (function paintUser() {
      var box = document.getElementById('ckTopUser');
      if (!box) return;
      var u = null;
      try { u = JSON.parse(localStorage.getItem('sbs.user') || 'null'); } catch (e) { u = null; }
      var name = u && u.name ? String(u.name).trim() : '';
      if (!name) return;
      var nm = document.getElementById('ckUserName');
      if (nm) nm.textContent = name;
      box.hidden = false;
    })();

    var backBtn = document.getElementById('ckBack');
    if (backBtn) {
      backBtn.addEventListener('click', function (e) {
        e.preventDefault();
        location.href = 'index.html#/home';
      });
    }

    window.addEventListener('hashchange', render);

    /* 全屏状态变化（进/出全屏）时重渲染顶栏按钮文案（全屏 ↔ 退出全屏） */
    document.addEventListener('fullscreenchange', function () { render(); });
    document.addEventListener('webkitfullscreenchange', function () { render(); });

    if (!location.hash) location.hash = '#/home';
    render();

    window.addEventListener('beforeunload', function (e) {
      if (state.result && state.result.stats && state.result.stats.total > 0 && !state.resultSaved) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  return {
    state: state,
    boot: boot,
    go: go,
    render: render,
    refreshBadges: refreshBadges,
    getActiveResult: getActiveResult,
    setResult: setResult,
    openHistory: openHistory,
    resetNew: resetNew,
    currentRoute: currentRoute
  };
})();

/* 页面注册表：各 view-*.js 往这里塞 */
window.CKPages = window.CKPages || {};

document.addEventListener('DOMContentLoaded', function () {
  window.CKApp.boot();
});

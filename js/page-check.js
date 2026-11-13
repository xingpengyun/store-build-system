/* ==========================================================
   page-check.js — 双表核对（主站内嵌模块的宿主页）
   ----------------------------------------------------------
   把 check 子应用装进主站的 .content 区，复用主站的 sidebar / topbar，
   不再开独立 check.html。这里只做「壳」：一页头 + 一排子导航 tab + 内容 + 抽屉。
   真正的渲染交给 window.CKApp（js/check/app.js）。
   主站每次切页都会 cloneNode 重建内容节点，所以 mount 里要重新 CKApp.attach。 */
(function () {
  'use strict';

  var ICON = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">';

  /* 子导航：与旧 check.html 侧栏同一套 6 项，但改成水平 tab。
     [route, 文案, 图标 path, 是否带徽标] */
  var TABS = [
    ['home', '核对首页', '<path d="M3 8.4L10 3l7 5.4V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.4z"/><path d="M7.6 17v-4.6h4.8V17"/>', false],
    ['new', '新建核对', '<path d="M10 4.5v11M4.5 10h11"/>', false],
    ['result', '核对结果', '<rect x="3" y="4" width="14" height="12" rx="1.6"/><path d="M3 8.2h14M7.6 8.2V16"/>', true],
    ['alias', '门店匹配库', '<path d="M8.2 11.8a3 3 0 0 1 0-4.2l2-2a3 3 0 0 1 4.2 4.2l-1 1"/><path d="M11.8 8.2a3 3 0 0 1 0 4.2l-2 2a3 3 0 0 1-4.2-4.2l1-1"/>', true],
    ['history', '核对历史', '<path d="M10 5.5a4.5 4.5 0 1 1-4.2 6.1"/><path d="M3.2 8.2 5 5.9l2.3 1.7"/><path d="M10 8.1v2.5l1.9 1.1"/>', false],
    ['rules', '规则配置', '<circle cx="10" cy="10" r="2.4"/><path d="M10 3.2v1.6M10 15.2v1.6M16.8 10h-1.6M4.8 10H3.2M14.8 5.2l-1.1 1.1M6.3 13.7l-1.1 1.1M14.8 14.8l-1.1-1.1M6.3 6.3 5.2 5.2"/>', false]
  ];

  function render() {
    var h = '<div class="ck-host">';

    /* 页头：复用主站 .page-head 的版式，标题/副标题/操作按钮的 id 供 CKApp 写入 */
    h += '<div class="page-head">' +
      '<div><h1 id="ckTitle">核对首页</h1><p id="ckSubtitle">内部表 × 外部表</p></div>' +
      '<div class="ck-host-acts" id="ckTopActions"></div>' +
    '</div>';

    /* 子导航 tab */
    h += '<nav class="ck-subnav" id="ckNav">';
    TABS.forEach(function (t) {
      var badge = t[3]
        ? '<span class="ck-nav-badge" id="' + (t[0] === 'result' ? 'navDiffBadge' : 'navAliasBadge') + '" hidden>0</span>'
        : '';
      h += '<a class="ck-nav-item" data-route="' + t[0] + '">' +
        ICON + t[2] + '</svg><span>' + t[1] + '</span>' + badge + '</a>';
    });
    h += '</nav>';

    /* 内容区 */
    h += '<div class="ck-host-body" id="ckView"></div>';

    /* 抽屉挂载点（js/check/ui.js 的 drawer() 依赖这两个全局 id） */
    h += '<div class="ck-drawer-mask" id="ckDrawerMask"></div>' +
      '<div class="ck-drawer" id="ckDrawer"></div>';

    h += '</div>';
    return h;
  }

  function mount(host) {
    window.CKApp.attach(host);
  }

  window.Pages.check = {
    title: '双表核对',
    render: render,
    mount: mount
  };
})();

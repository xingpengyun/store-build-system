/* input-clear · 全站输入框一键清除（z257）
   任何文本类输入框只要有内容，右侧就出现一个 × 按钮，点一下清空并触发页面的
   input/change 监听（搜索、过滤、表单回填都已监听这两个事件，无需逐处改）。
   · 事件委托 + MutationObserver：静态/动态生成的输入框都覆盖，无需改各页面模板
   · 排除：非文本类型、只读/禁用、已有专属清除的任务搜索、combo 下拉、带 data-no-clear
   · 保持焦点，不清空阶段/负责人等其他筛选（只清当前输入框自身） */
(function () {
  'use strict';
  var ATTR = 'data-ic';           // 已绑定标记
  var CLS = 'ic-btn';            // 清除按钮 class
  var WRAP = 'ic-wrap';          // 包裹容器 class（保证按钮定位在输入框右端）

  /* 排除的输入类型：这些有原生控件/不是"输入字"，不该加清除 */
  var SKIP_TYPE = /^(file|checkbox|radio|hidden|submit|button|reset|image|range|color|date|datetime-local|month|week|time|number|password)$/i;

  function target(el) {
    if (!el || el.tagName !== 'INPUT' || el.getAttribute(ATTR) === '1') return false;
    if (el.type && SKIP_TYPE.test(el.type)) return false;
    if (el.readOnly || el.disabled) return false;
    /* 已有专属清除按钮的任务搜索框（z238），别重复 */
    if (el.id === 'tkSearch' || el.nextElementSibling && el.nextElementSibling.classList.contains('mini-search-clear')) return false;
    /* combo 下拉自带 caret，右端没位置，排除 */
    if (el.classList.contains('combo-input')) return false;
    /* 显式声明不要清除的 */
    if (el.hasAttribute('data-no-clear') || el.closest('[data-no-clear]')) return false;
    return true;
  }

  function makeBtn() {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = CLS;
    b.setAttribute('aria-label', '清空输入');
    b.title = '清空输入';
    b.textContent = '×';
    return b;
  }

  function bind(el) {
    if (!target(el)) return;
    var parent = el.parentNode;
    if (!parent) return;
    el.setAttribute(ATTR, '1');

    /* .mini-search / .search-box / .ck-search 是 flex 容器，按钮作为兄弟 flex item
       放在 input 右端即可；其他独立输入框用 absolute 定位到右端内侧。 */
    var box = el.closest('.mini-search, .search-box, .ck-search');
    var btn = makeBtn();
    if (box) {
      /* 插到 input 后面，作为 flex 兄弟；样式里 flex:0 0 auto */
      parent.insertBefore(btn, el.nextSibling);
      btn.classList.add('ic-inline');
    } else {
      /* 独立输入框：包一层 relative 容器，按钮 absolute 到右端 */
      var wrap = document.createElement('span');
      wrap.className = WRAP;
      parent.insertBefore(wrap, el);
      wrap.appendChild(el);
      wrap.appendChild(btn);
      btn.classList.add('ic-abs');
    }
    sync(el);
  }

  function btnOf(el) {
    if (el.nextElementSibling && el.nextElementSibling.classList.contains(CLS)) return el.nextElementSibling;
    var w = el.parentElement;
    if (w && w.classList.contains(WRAP)) {
      var b = w.querySelector('.' + CLS);
      if (b) return b;
    }
    return null;
  }

  function sync(el) {
    var b = btnOf(el);
    if (!b) return;
    var has = !!(el.value && String(el.value).length);
    b.classList.toggle('is-on', has);
  }

  function bindAll(root) {
    var list = (root || document).querySelectorAll('input');
    for (var i = 0; i < list.length; i++) bind(list[i]);
  }

  /* input 变化 → 同步按钮显隐（委托，动态节点也覆盖） */
  document.addEventListener('input', function (e) {
    if (e.target && e.target.tagName === 'INPUT') {
      if (target(e.target)) bind(e.target);   // 首次输入时才绑定，避免给空表单全插按钮
      sync(e.target);
    }
  }, true);
  document.addEventListener('change', function (e) {
    if (e.target && e.target.tagName === 'INPUT') sync(e.target);
  }, true);
  /* 已有默认值的输入框（切页回填）：拿到焦点时补绑 */
  document.addEventListener('focusin', function (e) {
    if (e.target && e.target.tagName === 'INPUT') {
      if (target(e.target)) bind(e.target);
      sync(e.target);
    }
  }, true);

  /* 点清除：置空 + 派发 input/change，让页面已有的监听自动刷新 */
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('.' + CLS);
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    var el = null;
    if (b.parentElement && b.parentElement.classList.contains(WRAP)) el = b.parentElement.querySelector('input');
    else if (b.previousElementSibling && b.previousElementSibling.tagName === 'INPUT') el = b.previousElementSibling;
    if (!el) return;
    el.value = '';
    sync(el);
    try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (x) {}
    try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (x) {}
    try { el.focus(); } catch (x) {}
  }, true);

  /* 动态生成的输入框：不做全页 MutationObserver 轮询（它会在展开动画期间反复
     扫描 DOM 插按钮、制造长帧）。改用低频定时兜底 + 输入/focus 时按需绑定：
     · 用户输入/聚焦目标框时会实时 bind（上面的委托）
     · 切页/弹窗回填值的框，focusin 或下面的低频扫描补绑 */
  var tick = setInterval(function () {
    if (document.hidden) return;
    var list = document.querySelectorAll('input[value]:not([' + ATTR + '])');
    for (var i = 0; i < list.length; i++) if (list[i].value) bind(list[i]);
  }, 1200);

  /* 初始：只给已有值的输入框绑定（空的不插按钮，减少 DOM 噪音） */
  bindInitial();
  function bindInitial() {
    var list = document.querySelectorAll('input');
    for (var i = 0; i < list.length; i++) {
      if (list[i].value && String(list[i].value).length) bind(list[i]);
    }
  }
  window.InputClear = { bindAll: bindAll, sync: sync };
})();

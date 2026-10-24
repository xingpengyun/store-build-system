/* ==========================================================
   ui.js — 通用组件：图标 / 徽章 / 弹窗 / 提示 / 分页
   ========================================================== */
window.UI = (function () {
  'use strict';

  var U = window.Utils;
  var C = window.CONST;

  /* ---------------- 图标 ---------------- */
  var PATHS = {
    plus: '<path d="M10 4.5v11M4.5 10h11"/>',
    search: '<circle cx="9" cy="9" r="5.2"/><path d="M13 13l3.5 3.5"/>',
    check: '<path d="M4.5 10.5l3.6 3.6L15.5 6.6"/>',
    clock: '<circle cx="10" cy="10" r="6.6"/><path d="M10 6.4V10l2.6 1.6"/>',
    alert: '<path d="M10 3.6l7 12.2H3z"/><path d="M10 8.4v3.2M10 13.7v.1"/>',
    info: '<circle cx="10" cy="10" r="6.6"/><path d="M10 9v4.4M10 6.6v.1"/>',
    trash: '<path d="M4 6h12M8 6V4.4h4V6M6.4 6l.7 10.2h5.8L13.6 6"/>',
    edit: '<path d="M12.4 4l3.6 3.6-7.8 7.8H4.6v-3.6L12.4 4z"/>',
    close: '<path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/>',
    download: '<path d="M10 3.5v8.6M6.4 8.8l3.6 3.5 3.6-3.5M4 15.6h12"/>',
    upload: '<path d="M10 14.4V5.8M6.4 9.4L10 5.8l3.6 3.6M4 15.6h12"/>',
    refresh: '<path d="M15.6 10a5.6 5.6 0 1 1-1.7-4"/><path d="M15.8 4.1v3.7h-3.6"/>',
    arrow: '<path d="M7.6 4.8l5.2 5.2-5.2 5.2"/>',
    box: '<path d="M10 2.6l6.2 3.4v8L10 17.4 3.8 14V6z"/><path d="M3.8 6L10 9.4 16.2 6M10 9.4v8"/>',
    calendar: '<rect x="3.4" y="4.6" width="13.2" height="12" rx="1.6"/><path d="M3.4 8.4h13.2M7 3v3M13 3v3"/>',
    truck: '<path d="M2.8 6.4h7.4v7.4H2.8z"/><path d="M10.2 9h3.1l2.9 2.9v1.9h-6"/>',
    money: '<rect x="2.8" y="5.6" width="14.4" height="8.8" rx="1.6"/><circle cx="10" cy="10" r="2.1"/>',
    users: '<circle cx="8" cy="6.8" r="2.6"/><path d="M3.3 16.4c0-2.5 2.1-4.2 4.7-4.2s4.7 1.7 4.7 4.2"/><path d="M13.6 5.9a2 2 0 1 1 .1 4"/><path d="M14.4 12.4c1.5.4 2.4 1.7 2.4 3.3"/>',
    list: '<rect x="4" y="3" width="12" height="14" rx="1.6"/><path d="M7.4 7h5.2M7.4 10h5.2M7.4 13h3.4"/>',
    chart: '<path d="M3.4 16.4h13.2"/><path d="M6 16V9.4M10 16V4.6M14 16v-4.2"/>',
    target: '<circle cx="10" cy="10" r="6.6"/><circle cx="10" cy="10" r="3"/><circle cx="10" cy="10" r=".6"/>',
    flag: '<path d="M5.4 16.6V4.2M5.4 4.6h8.4l-1.4 3 1.4 3H5.4"/>',
    inbox: '<path d="M3 11.4l2.2-6.2h9.6l2.2 6.2v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4z"/><path d="M3 11.4h4l.9 1.8h4.2l.9-1.8h4"/>',
    file: '<path d="M5.2 3h6l3.6 3.6v10.4H5.2z"/><path d="M11 3v4h3.8"/>',
    bell: '<path d="M10 3.2a4.4 4.4 0 0 0-4.4 4.4c0 3.9-1.5 4.9-1.5 4.9h11.8s-1.5-1-1.5-4.9A4.4 4.4 0 0 0 10 3.2z"/><path d="M8.6 15.4a1.7 1.7 0 0 0 2.8 0"/>',
    refreshDot: '<circle cx="10" cy="10" r="6.6"/><path d="M10 6.6v3.6l2.4 1.4"/>',
    grip: '<circle cx="7.6" cy="5.4" r="1.15"/><circle cx="7.6" cy="10" r="1.15"/><circle cx="7.6" cy="14.6" r="1.15"/>' +
          '<circle cx="12.4" cy="5.4" r="1.15"/><circle cx="12.4" cy="10" r="1.15"/><circle cx="12.4" cy="14.6" r="1.15"/>',
    send: '<path d="M3.2 10L16.6 4.2l-4.3 11.8-3.3-4.6-5.8-1.4z"/><path d="M9 11.4l7.6-7.2"/>',
    board: '<rect x="3.4" y="3.6" width="13.2" height="9.6" rx="1.8"/><path d="M6.2 16.4l2.6-3.2"/><path d="M6.8 7h6.4M6.8 9.8h4"/>'
  };

  function icon(name, cls) {
    var p = PATHS[name] || '';
    return '<svg class="' + (cls || '') + '" viewBox="0 0 20 20" fill="none" stroke="currentColor"' +
      ' stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
  }

  /* ---------------- 徽章 ---------------- */
  function riskBadge(key) {
    var r = C.RISKS[key] || C.RISKS.normal;
    return '<span class="badge" style="color:' + r.color + ';background:' + r.soft + '">' +
      '<i class="bdot"></i>' + r.label + '</span>';
  }

  /* 阶段徽章：支持一级 + 二级（"施工/装修 / 水电" → 施工/装修 · 水电，配色跟一级） */
  /* sub 可选：门店自己推到了二级时（已出图 · 已做首批）跟在阶段后面显示 */
  function stageBadge(key, sub) {
    var p = C.stageSplit(key);
    var s = C.stageDef(key);
    var label = C.stageLabel(key);
    var html;
    if (!s) html = '<span class="badge">' + U.esc(label || key) + '</span>';
    else html = '<span class="badge" title="' + U.esc(label) + '" style="color:' + s.color + ';background:' + s.soft + '">' +
      U.esc(label) + '</span>';
    if (sub) html += '<span class="badge badge-sub">' + U.esc(sub) + '</span>';
    return html;
  }

  function statusBadge(key) {
    var s = C.TASK_STATUS[key] || C.TASK_STATUS.pending;
    return '<span class="badge" style="color:' + s.color + ';background:' + s.soft + '">' + s.label + '</span>';
  }

  /* ---------------- 头像 ---------------- */
  function avatar(name, color, size) {
    var ch = (name || '?').slice(0, 1);
    return '<span class="avatar avatar-' + (size || 'md') + '" style="background:' + (color || '#3f6bf5') + '">' +
      U.esc(ch) + '</span>';
  }

  /* ---------------- 进度条 ----------------
     title 可选：鼠标悬停解释这个百分比是怎么来的（门店进度=已完成任务/任务总计）
     value 传 null：这条没有可算的分母（比如门店还没派任务），轨道留空、数字显示「—」 */
  function progress(value, color, title) {
    var tip = title ? ' title="' + U.esc(title) + '"' : '';
    if (value === null || value === undefined || value === '') {
      return '<div class="mini-progress"' + tip + '>' +
        '<span class="mini-track"><i style="width:0"></i></span>' +
        '<span class="mini-num dim">—</span>' +
      '</div>';
    }
    var v = U.clamp(Number(value) || 0, 0, 100);
    var col = color || (v >= 100 ? '#17b26a' : v >= 66 ? '#3f6bf5' : v >= 33 ? '#f79009' : '#f04438');
    return '<div class="mini-progress"' + tip + '>' +
      '<span class="mini-track"><i style="width:' + v + '%;background:' + col + '"></i></span>' +
      '<span class="mini-num">' + v + '%</span>' +
    '</div>';
  }

  /* ---------------- 空状态 ---------------- */
  function empty(text, sub) {
    return '<div class="empty">' + icon('inbox') +
      '<p>' + U.esc(text || '暂无数据') + '</p>' +
      (sub ? '<p class="empty-sub">' + U.esc(sub) + '</p>' : '') +
    '</div>';
  }

  /* ---------------- Toast ----------------
     opts.action = { label, onClick } → 右侧多一个按钮（比如「完成」之后的「撤销」）。
     带按钮的默认停 6 秒：要够看清、也够点到；不带按钮还是 2.2 秒。 */
  function toast(msg, type, opts) {
    var root = document.getElementById('toastRoot');
    if (!root) return;
    opts = opts || {};
    var el = document.createElement('div');
    el.className = 'toast toast-' + (type || 'info');
    var ico = type === 'success' ? '<path d="M4.5 10.5l3.6 3.6L15.5 6.6"/>'
      : type === 'error' ? '<circle cx="10" cy="10" r="6.6"/><path d="M7.8 7.8l4.4 4.4M12.2 7.8l-4.4 4.4"/>'
      : '<circle cx="10" cy="10" r="6.6"/><path d="M10 9v4M10 6.6v.1"/>';
    el.innerHTML = '<svg class="ti" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.9"' +
      ' stroke-linecap="round" stroke-linejoin="round">' + ico + '</svg><span>' + U.esc(msg) + '</span>' +
      (opts.action
        ? '<button class="toast-act" type="button">' + U.esc(opts.action.label) + '</button>'
        : '');
    root.appendChild(el);

    var dismissed = false;
    function dismiss() {
      if (dismissed) return;
      dismissed = true;
      el.classList.add('out');
      setTimeout(function () { el.remove(); }, 220);
    }

    if (opts.action) {
      el.querySelector('.toast-act').addEventListener('click', function () {
        dismiss();
        if (typeof opts.action.onClick === 'function') opts.action.onClick();
      });
    }

    setTimeout(dismiss, opts.duration || (opts.action ? 6000 : 2200));
  }

  /* ---------------- 右下角小卡片：门店阶段往前走了 ----------------
     跳阶段的时候右下角弹一张卡，写明「该门店已转入下一阶段的名称」。
     跟顶部 toast 分工：toast 是操作回执（谁做了什么），这张是结果播报，
     停 6.5 秒、可以手动关，最多同时叠 3 张（再来就把最老的推掉）。

     opts: { store: '广州天河', from: '建档资料', to: '发货阶段', note: '…' } */
  function stagePop(opts) {
    opts = opts || {};

    var root = document.getElementById('stagePopRoot');
    if (!root) {
      root = document.createElement('div');
      root.id = 'stagePopRoot';
      root.className = 'spop-root';
      document.body.appendChild(root);
    }

    var def = C.stageDef(opts.to) || {};
    var color = def.color || opts.color || '#0aa564';
    var soft = def.soft || '#dcf7ea';

    var el = document.createElement('div');
    el.className = 'spop';
    el.setAttribute('role', 'status');
    el.innerHTML =
      '<div class="spop-head">' +
        '<span class="spop-ico" style="color:' + color + '">' + icon('check') + '</span>' +
        '<span class="spop-title">门店已转入下一阶段</span>' +
        '<button class="spop-x" type="button" aria-label="关闭">' + icon('close') + '</button>' +
      '</div>' +
      '<div class="spop-store">' + U.esc(opts.store || '') + '</div>' +
      '<div class="spop-flow">' +
        '<span class="spop-from">' + U.esc(opts.from || '—') + '</span>' +
        '<span class="spop-arw">' + icon('arrow') + '</span>' +
        '<span class="spop-to" style="color:' + color + ';background:' + soft + '">' +
          U.esc(opts.to || '') + '</span>' +
      '</div>' +
      (opts.note ? '<div class="spop-note">' + U.esc(opts.note) + '</div>' : '');

    root.appendChild(el);
    while (root.children.length > 3) root.removeChild(root.firstChild);

    var closed = false;
    function dismiss() {
      if (closed) return;
      closed = true;
      el.classList.add('out');
      setTimeout(function () { el.remove(); }, 240);
    }
    el.querySelector('.spop-x').addEventListener('click', dismiss);
    setTimeout(dismiss, opts.duration || 6500);
    return el;
  }

  /* ---------------- 加载遮罩 ---------------- */
  function loading(text) {
    hideLoading();
    var el = document.createElement('div');
    el.className = 'loading-layer';
    el.id = 'loadingLayer';
    el.innerHTML = '<div class="loading-box"><span class="spinner"></span><p>' +
      U.esc(text || '加载中…') + '</p></div>';
    document.body.appendChild(el);
  }

  function hideLoading() {
    var el = document.getElementById('loadingLayer');
    if (el) el.remove();
  }

  /* ---------------- 弹窗 ---------------- */
  var openModal = null;

  function modal(opts) {
    closeModal();
    var root = document.getElementById('modalRoot');
    var mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML =
      '<div class="modal' + (opts.size === 'lg' ? ' modal-lg' : '') + '" role="dialog">' +
        '<div class="modal-head">' +
          '<h3>' + U.esc(opts.title || '') + '</h3>' +
          (opts.sub ? '<span class="modal-sub">' + U.esc(opts.sub) + '</span>' : '') +
          '<button class="modal-close" type="button" aria-label="关闭">' + icon('close') + '</button>' +
        '</div>' +
        '<div class="modal-body">' + (opts.body || '') + '</div>' +
        (opts.footer ? '<div class="modal-foot">' + opts.footer + '</div>' : '') +
      '</div>';

    root.appendChild(mask);
    openModal = mask;

    function close() {
      mask.remove();
      if (openModal === mask) openModal = null;
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    mask.querySelector('.modal-close').addEventListener('click', close);
    mask.addEventListener('mousedown', function (e) {
      if (e.target === mask) close();
    });
    document.addEventListener('keydown', onKey);

    if (opts.onMount) {
      opts.onMount(mask.querySelector('.modal'), close);
    }
    return close;
  }

  function closeModal() {
    if (openModal) {
      openModal.remove();
      openModal = null;
    }
  }

  /* 二次确认 */
  function confirm(opts) {
    modal({
      title: opts.title || '确认操作',
      body: '<p style="font-size:13px;line-height:1.75;color:var(--text-2)">' +
        (opts.text || '确定要执行这个操作吗？') + '</p>' +
        (opts.warn ? '<p style="margin-top:10px;font-size:12px;color:var(--red);background:var(--red-soft);padding:8px 10px;border-radius:8px">' + U.esc(opts.warn) + '</p>' : ''),
      footer:
        '<button class="btn" data-act="cancel">取消</button>' +
        '<button class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" data-act="ok">' +
          U.esc(opts.okText || '确定') + '</button>',
      onMount: function (rootEl, close) {
        rootEl.querySelector('[data-act="cancel"]').onclick = close;
        rootEl.querySelector('[data-act="ok"]').onclick = function () {
          close();
          if (opts.onOk) opts.onOk();
        };
      }
    });
  }

  /* ---------------- 分页 ---------------- */
  function pager(page, totalPages, totalItems) {
    if (totalPages <= 1) {
      return '<div class="pager"><span class="pg-info">共 ' + totalItems + ' 条</span></div>';
    }
    var html = '<div class="pager"><span class="pg-info">共 ' + totalItems + ' 条 · 第 ' + page + ' / ' + totalPages + ' 页</span>';
    html += '<button data-page="' + (page - 1) + '"' + (page <= 1 ? ' disabled' : '') + '>上一页</button>';

    var start = Math.max(1, page - 2);
    var end = Math.min(totalPages, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);

    for (var i = start; i <= end; i++) {
      html += '<button data-page="' + i + '" class="' + (i === page ? 'active' : '') + '">' + i + '</button>';
    }
    html += '<button data-page="' + (page + 1) + '"' + (page >= totalPages ? ' disabled' : '') + '>下一页</button>';
    html += '</div>';
    return html;
  }

  /* ---------------- 表单取值 ---------------- */
  function formValue(rootEl, name) {
    var el = rootEl.querySelector('[name="' + name + '"]');
    return el ? el.value.trim() : '';
  }

  /* 生成 <option> */
  function options(items, selected, valueKey, labelKey) {
    return items.map(function (it) {
      var v = valueKey ? it[valueKey] : it;
      var l = labelKey ? it[labelKey] : it;
      return '<option value="' + U.esc(v) + '"' + (String(v) === String(selected) ? ' selected' : '') + '>' +
        U.esc(l) + '</option>';
    }).join('');
  }

  /* ---------------- 阶段下拉（一级分组 + 二级选项） ----------------
     subs = { '施工/装修': ['水电', '木作'], ... }  来自设置
     有二级的阶段用 <optgroup> 包起来，没有二级的直接一个 option。
     selected 是个不在清单里的旧值（比如二级被删了）也照样保留，不会悄悄改掉数据。
  ------------------------------------------------------------------ */
  function stageOptions(selected, subs, opts) {
    subs = subs || {};
    opts = opts || {};
    var sel = String(selected == null ? '' : selected);
    var hit = false;
    var html = '';

    C.STAGES.forEach(function (st) {
      var list = (subs[st.key] || []).filter(function (x) { return String(x || '').trim(); });
      if (!list.length) {
        if (sel === st.key) hit = true;
        html += '<option value="' + U.esc(st.key) + '"' + (sel === st.key ? ' selected' : '') + '>' +
          U.esc(st.key) + '</option>';
        return;
      }
      var inner = '<option value="' + U.esc(st.key) + '"' + (sel === st.key ? ' selected' : '') + '>' +
        U.esc(st.key) + ' · 全部</option>';
      if (sel === st.key) hit = true;
      list.forEach(function (sub) {
        var v = C.stageValue(st.key, sub);
        if (sel === v) hit = true;
        inner += '<option value="' + U.esc(v) + '"' + (sel === v ? ' selected' : '') + '>' +
          '　└ ' + U.esc(sub) + '</option>';
      });
      html += '<optgroup label="' + U.esc(st.key) + '">' + inner + '</optgroup>';
    });

    /* 旧数据兜底：值不在清单里也让它显示出来 */
    if (sel && !hit) {
      html += '<option value="' + U.esc(sel) + '" selected>' + U.esc(C.stageLabel(sel)) + '</option>';
    }
    if (!sel && opts.placeholder) {
      html = '<option value="">' + U.esc(opts.placeholder) + '</option>' + html;
    }
    return html;
  }

  /* ---------------- 可搜索下拉（省份这类长列表） ----------------
     用法：html 里放 UI.comboHtml({ name, id, value, items, allLabel, py, placeholder })
           插入 DOM 后调用 UI.initCombos(容器)，自动接管输入/键盘/选中
     items 可以是字符串数组，或 [{ v, l }]；py 是 { 名称: 拼音 } 映射，
     支持输入拼音首段（如 gd → 广东）
  ------------------------------------------------------------------ */
  function comboHtml(opts) {
    var items = (opts.items || []).map(function (it) {
      return typeof it === 'string'
        ? { v: it, l: it, py: (opts.py || {})[it] || '' }
        : { v: it.v, l: it.l || it.v, py: it.py || (opts.py || {})[it.l || it.v] || '' };
    });

    var cur = opts.value == null ? '' : String(opts.value);
    var curLabel = '';
    items.forEach(function (it) { if (it.v === cur) curLabel = it.l; });

    var lis = '';
    if (opts.allLabel) lis += '<li class="combo-item" data-v="">' + U.esc(opts.allLabel) + '</li>';
    items.forEach(function (it) {
      lis += '<li class="combo-item" data-v="' + U.esc(it.v) + '"' +
        (it.py ? ' data-py="' + U.esc(it.py) + '"' : '') + '>' + U.esc(it.l) + '</li>';
    });

    return '<div class="combo' + (opts.size === 'sm' ? ' combo-sm' : '') + '">' +
      '<input class="input combo-input" type="text" autocomplete="off" spellcheck="false"' +
        ' placeholder="' + U.esc(opts.placeholder || '输入关键字筛选') + '"' +
        ' value="' + U.esc(curLabel) + '" data-combo-text />' +
      '<span class="combo-caret" data-combo-caret>' + icon('arrow') + '</span>' +
      '<input type="hidden"' + (opts.id ? ' id="' + U.esc(opts.id) + '"' : '') +
        (opts.name ? ' name="' + U.esc(opts.name) + '"' : '') + ' value="' + U.esc(cur) + '" />' +
      '<div class="combo-pop" hidden>' +
        '<ul class="combo-list">' + lis + '</ul>' +
        '<div class="combo-none" hidden>没有匹配的选项</div>' +
      '</div>' +
    '</div>';
  }

  function bindCombo(wrap) {
    var input = wrap.querySelector('[data-combo-text]');
    var hidden = wrap.querySelector('input[type="hidden"]');
    var pop = wrap.querySelector('.combo-pop');
    var list = wrap.querySelector('.combo-list');
    var none = wrap.querySelector('.combo-none');
    var caret = wrap.querySelector('[data-combo-caret]');
    var items = [].slice.call(list.querySelectorAll('.combo-item'));
    var active = -1;

    function labelOf(v) {
      for (var i = 0; i < items.length; i++) {
        if (items[i].getAttribute('data-v') === v) return items[i].textContent.trim();
      }
      return '';
    }
    function visible() { return items.filter(function (li) { return !li.hidden; }); }
    function open() { pop.hidden = false; wrap.classList.add('open'); }
    function close() { pop.hidden = true; wrap.classList.remove('open'); active = -1; paint(); }
    function paint() {
      items.forEach(function (li, i) { li.classList.toggle('on', i === active); });
      var on = items[active];
      if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
    }
    function isSub(key, str) {
      /* 字母按顺序出现即可：gd → guangdong，gx → guangxi */
      var i = 0;
      for (var j = 0; j < str.length && i < key.length; j++) {
        if (str.charAt(j) === key.charAt(i)) i++;
      }
      return i === key.length;
    }
    function filter(q) {
      var key = String(q || '').toLowerCase().replace(/\s+/g, '');
      var n = 0;
      items.forEach(function (li) {
        var t = li.textContent.trim();
        var py = (li.getAttribute('data-py') || '').toLowerCase();
        var hit = !key || t.indexOf(key) >= 0 ||
          (py && (py.indexOf(key) === 0 || (key.length > 1 && isSub(key, py))));
        li.hidden = !hit;
        if (hit) n++;
      });
      none.hidden = n > 0;
      var vis = visible();
      active = vis.length ? items.indexOf(vis[0]) : -1;
      paint();
    }
    function pick(li) {
      if (!li) return;
      var v = li.getAttribute('data-v') || '';
      hidden.value = v;
      input.value = v ? li.textContent.trim() : '';
      close();
      /* 让外面既能监听隐藏域 change，也能直接用 id 取值 */
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
    }

    input.addEventListener('focus', function () {
      open();
      filter('');
      input.select();
    });
    input.addEventListener('input', function () { open(); filter(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (pop.hidden) { open(); filter(''); return; }
        var vis = visible();
        if (!vis.length) return;
        var cur = vis.indexOf(items[active]);
        var next;
        if (cur < 0) next = e.key === 'ArrowDown' ? 0 : vis.length - 1;
        else next = e.key === 'ArrowDown' ? Math.min(vis.length - 1, cur + 1) : Math.max(0, cur - 1);
        active = items.indexOf(vis[next]);
        paint();
      } else if (e.key === 'Enter') {
        if (!pop.hidden) { e.preventDefault(); pick(items[active]); }
      } else if (e.key === 'Escape') {
        /* 只收起下拉，不要顺手把弹窗关掉 */
        if (!pop.hidden) { e.preventDefault(); e.stopPropagation(); close(); }
      } else if (e.key === 'Tab') {
        close();
      }
    });
    input.addEventListener('blur', function () {
      setTimeout(function () {
        if (wrap.contains(document.activeElement)) return;
        close();
        input.value = hidden.value ? labelOf(hidden.value) : '';
      }, 130);
    });

    list.addEventListener('mousedown', function (e) { e.preventDefault(); });
    list.addEventListener('mousemove', function (e) {
      var li = e.target.closest('.combo-item');
      if (!li || li.hidden) return;
      active = items.indexOf(li);
      paint();
    });
    list.addEventListener('click', function (e) {
      var li = e.target.closest('.combo-item');
      if (!li) return;
      pick(li);
      input.blur();
    });
    caret.addEventListener('mousedown', function (e) {
      e.preventDefault();
      if (pop.hidden) { input.focus(); open(); filter(''); }
      else { close(); }
    });
    caret.addEventListener('click', function (e) { e.preventDefault(); });
  }

  function initCombos(rootEl) {
    if (!rootEl) return;
    [].slice.call(rootEl.querySelectorAll('.combo')).forEach(function (w) {
      if (w.getAttribute('data-ready')) return;
      w.setAttribute('data-ready', '1');
      bindCombo(w);
    });
  }

  /* ---------------- 阶段菜单（浮层） ----------------
     在一个按钮下面弹出「一级 + 二级」的菜单，挂到 body 上（不会被弹窗滚动裁掉）。
       canEdit = true  → 每个阶段右边有 ＋（新建二级），每个二级有 ✎ 改名 / ✕ 删除
       onlySubs = true → 不列「整个阶段」，只让你挑一个二级

     组件只管界面，数据由调用方改（写 settings、改清单草稿），改完调 UI.refreshStageMenu()。
     opts = {
       anchor, canEdit, onlySubs,
       emptyTip, footTip,          （onlySubs 时的空态 / 脚注文案，可省略）
       getValue() → 当前值, getSubs() → { '施工/装修': ['水电'] },
       onPick(v), onAdd(base, name), onRename(base, from, to), onRemove(base, name)
     }
     回调返回 false 表示没改动（菜单不重绘）。
  ------------------------------------------------------------------ */
  var stageMenu = null;   /* { el, opts } */

  function closeStageMenu() {
    if (!stageMenu) return;
    stageMenu.el.remove();
    stageMenu = null;
    document.removeEventListener('mousedown', stageDocDown, true);
    document.removeEventListener('keydown', stageDocKey, true);
    window.removeEventListener('scroll', stageDocScroll, true);
    window.removeEventListener('resize', closeStageMenu);
  }

  /* 页面 / 弹窗滚动 → 收起来；但**菜单自己内部滚动不算**，
     否则滚轮一动菜单就消失了（2026-10-23 用户反馈「上下滚动有问题」就是这个） */
  function stageDocScroll(e) {
    if (!stageMenu) return;
    var t = e.target;
    if (t && t.nodeType === 1 && stageMenu.el.contains(t)) return;
    closeStageMenu();
  }

  function stageDocDown(e) {
    if (!stageMenu) return;
    if (stageMenu.el.contains(e.target)) return;
    var a = stageMenu.opts.anchor;
    if (a && a.contains(e.target)) return;
    closeStageMenu();
  }

  function stageDocKey(e) {
    if (e.key !== 'Escape') return;
    /* 菜单里正在输入（新建 / 改名）→ 交给输入框自己处理，别把菜单关了 */
    if (stageMenu && stageMenu.el.contains(document.activeElement) &&
        document.activeElement.tagName === 'INPUT') return;
    if (!stageMenu) return;
    e.preventDefault();
    e.stopPropagation();      /* 别顺手把外面的弹窗也关掉 */
    closeStageMenu();
  }

  function stageMenuBody(o) {
    var cur = String(o.getValue() || '');
    var subs = o.getSubs() || {};
    var total = 0;
    var html = '<div class="sp-groups">';

    C.STAGES.forEach(function (st) {
      var list = subs[st.key] || [];
      total += list.length;

      /* 只挑二级、又不能在里面新建时：没有二级的阶段整组不出现，免得一排空组头 */
      if (o.onlySubs && !o.canEdit && !list.length) return;

      html += '<div class="sp-group" data-base="' + U.esc(st.key) + '">' +
        '<div class="sp-ghead">' +
          '<i class="sp-gdot" style="background:' + st.color + '"></i>' +
          '<span>' + U.esc(st.key) + '</span>' +
          (o.canEdit
            ? '<button type="button" class="sp-gadd" data-sp-add="' + U.esc(st.key) + '"' +
              ' title="在「' + U.esc(st.key) + '」下面新建一个二级">' + icon('plus') + '</button>'
            : '') +
        '</div>';

      if (!o.onlySubs) {
        html += '<div class="sp-item sp-item-all' + (cur === st.key ? ' on' : '') + '"' +
            ' data-sp-pick="' + U.esc(st.key) + '">' +
          '<span class="sp-t">整个阶段</span>' +
          (cur === st.key ? '<i class="sp-ok">' + icon('check') + '</i>' : '') +
        '</div>';
      }

      list.forEach(function (sub) {
        var v = C.stageValue(st.key, sub);
        var on = cur === v;
        html += '<div class="sp-item' + (on ? ' on' : '') + '" data-sp-pick="' + U.esc(v) + '"' +
            ' data-sp-base="' + U.esc(st.key) + '" data-sp-sub="' + U.esc(sub) + '">' +
          '<span class="sp-t">' + U.esc(sub) + '</span>' +
          (on ? '<i class="sp-ok">' + icon('check') + '</i>' : '') +
          (o.canEdit
            ? '<i class="sp-i" data-sp-rn="' + U.esc(sub) + '" title="改名">' + icon('edit') + '</i>' +
              '<i class="sp-i danger" data-sp-rm="' + U.esc(sub) + '" title="删除">' + icon('close') + '</i>'
            : '') +
        '</div>';
      });

      html += '</div>';
    });

    html += '</div>';

    if (o.onlySubs && !total) {
      html = '<div class="sp-groups"><p class="sp-empty">' +
        (o.emptyTip || '阶段时间线上还没有二级。<br />在「所属阶段」里点阶段右边的 ＋ 加一个。') +
        '</p></div>';
    } else if (o.canEdit) {
      html += '<div class="sp-foot">二级的增删改，会同步到「阶段时间线」</div>';
    } else {
      html += '<div class="sp-foot">' + (o.footTip || '选一个二级，任务名和所属阶段一起填好') + '</div>';
    }

    return html;
  }

  /* 重新摆一下位置（内容高度变了要重新夹进视口） */
  function placeStageMenu(el, anchor) {
    var r = anchor.getBoundingClientRect();
    var w = el.offsetWidth;
    var h = el.offsetHeight;
    var left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - w - 8));
    var top = r.bottom + 5;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 5);
    el.style.left = left + 'px';
    el.style.top = top + 'px';
  }

  function refreshStageMenu() {
    if (!stageMenu) return;
    var scrollEl = stageMenu.el.querySelector('.sp-groups');
    var keep = scrollEl ? scrollEl.scrollTop : 0;
    stageMenu.el.innerHTML = stageMenuBody(stageMenu.opts);
    var again = stageMenu.el.querySelector('.sp-groups');
    if (again) again.scrollTop = keep;
    placeStageMenu(stageMenu.el, stageMenu.opts.anchor);
  }

  /* 行内输入框（新建 / 改名公用），返回 input */
  function spInput(value, placeholder, onDone) {
    var box = document.createElement('div');
    box.className = 'sp-edit';
    box.innerHTML = '<input class="sp-input" type="text" autocomplete="off" spellcheck="false"' +
      ' value="' + U.esc(value || '') + '" placeholder="' + U.esc(placeholder || '') + '" />';
    var inp = box.querySelector('input');

    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onDone(String(inp.value || '').trim().replace(/\s+/g, ' '));
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (box.parentNode) box.parentNode.removeChild(box);
      }
    });

    return box;
  }

  function openStageMenu(opts) {
    closeStageMenu();

    var el = document.createElement('div');
    el.className = 'sp-pop';
    el.innerHTML = stageMenuBody(opts);
    el.style.visibility = 'hidden';
    document.body.appendChild(el);
    stageMenu = { el: el, opts: opts };
    placeStageMenu(el, opts.anchor);
    el.style.visibility = '';

    /* 当前值可能在滚动区外，滚到看得见的位置 */
    var onItem = el.querySelector('.sp-item.on');
    if (onItem && onItem.scrollIntoView) onItem.scrollIntoView({ block: 'nearest' });

    document.addEventListener('mousedown', stageDocDown, true);
    document.addEventListener('keydown', stageDocKey, true);
    window.addEventListener('scroll', stageDocScroll, true);
    window.addEventListener('resize', closeStageMenu);

    el.addEventListener('click', function (e) {
      var o = stageMenu ? stageMenu.opts : opts;

      /* 新建二级：在该阶段头部下面插一个输入框 */
      var add = e.target.closest('[data-sp-add]');
      if (add) {
        var group = add.closest('.sp-group');
        var base = group.getAttribute('data-base');
        if (group.querySelector('.sp-edit')) { group.querySelector('.sp-edit input').focus(); return; }
        var box = spInput('', '新二级名称，回车确认', function (name) {
          if (!name) return;
          if (name.indexOf('/') >= 0) { toast('二级名称里不要带斜杠（斜杠是阶段名专用）', 'error'); return; }
          if (o.onAdd && o.onAdd(base, name) !== false) refreshStageMenu();
        });
        group.appendChild(box);
        var inp = box.querySelector('input');
        inp.focus();
        placeStageMenu(el, o.anchor);
        return;
      }

      /* 改名 */
      var rn = e.target.closest('[data-sp-rn]');
      if (rn) {
        var item = rn.closest('.sp-item');
        var rBase = item.getAttribute('data-sp-base');
        var from = item.getAttribute('data-sp-sub');
        var ebox = spInput(from, '新的二级名称', function (to) {
          if (!to || to === from) { refreshStageMenu(); return; }
          if (to.indexOf('/') >= 0) { toast('二级名称里不要带斜杠', 'error'); return; }
          if (o.onRename && o.onRename(rBase, from, to) !== false) refreshStageMenu();
        });
        item.parentNode.replaceChild(ebox, item);
        var einp = ebox.querySelector('input');
        einp.focus();
        einp.select();
        return;
      }

      /* 删除 */
      var rm = e.target.closest('[data-sp-rm]');
      if (rm) {
        var it2 = rm.closest('.sp-item');
        if (o.onRemove) o.onRemove(it2.getAttribute('data-sp-base'), it2.getAttribute('data-sp-sub'));
        return;
      }

      /* 选中 */
      var pick = e.target.closest('[data-sp-pick]');
      if (!pick) return;
      var v = pick.getAttribute('data-sp-pick');
      if (o.onPick) o.onPick(v);
      closeStageMenu();
    });
  }

  return {
    icon: icon,
    riskBadge: riskBadge,
    stageBadge: stageBadge,
    stageOptions: stageOptions,
    statusBadge: statusBadge,
    avatar: avatar,
    progress: progress,
    empty: empty,
    toast: toast,
    stagePop: stagePop,
    loading: loading,
    hideLoading: hideLoading,
    modal: modal,
    closeModal: closeModal,
    confirm: confirm,
    pager: pager,
    formValue: formValue,
    options: options,
    comboHtml: comboHtml,
    initCombos: initCombos,
    openStageMenu: openStageMenu,
    closeStageMenu: closeStageMenu,
    refreshStageMenu: refreshStageMenu
  };
})();

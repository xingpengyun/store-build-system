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
    refreshDot: '<circle cx="10" cy="10" r="6.6"/><path d="M10 6.6v3.6l2.4 1.4"/>'
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

  function stageBadge(key) {
    var s = null;
    C.STAGES.forEach(function (x) { if (x.key === key) s = x; });
    if (!s) return '<span class="badge">' + U.esc(key) + '</span>';
    return '<span class="badge" style="color:' + s.color + ';background:' + s.soft + '">' + s.key + '</span>';
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

  /* ---------------- 进度条 ---------------- */
  function progress(value, color) {
    var v = U.clamp(Number(value) || 0, 0, 100);
    var col = color || (v >= 100 ? '#17b26a' : v >= 66 ? '#3f6bf5' : v >= 33 ? '#f79009' : '#f04438');
    return '<div class="mini-progress">' +
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

  /* ---------------- Toast ---------------- */
  function toast(msg, type) {
    var root = document.getElementById('toastRoot');
    if (!root) return;
    var el = document.createElement('div');
    el.className = 'toast toast-' + (type || 'info');
    var ico = type === 'success' ? '<path d="M4.5 10.5l3.6 3.6L15.5 6.6"/>'
      : type === 'error' ? '<circle cx="10" cy="10" r="6.6"/><path d="M7.8 7.8l4.4 4.4M12.2 7.8l-4.4 4.4"/>'
      : '<circle cx="10" cy="10" r="6.6"/><path d="M10 9v4M10 6.6v.1"/>';
    el.innerHTML = '<svg class="ti" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.9"' +
      ' stroke-linecap="round" stroke-linejoin="round">' + ico + '</svg><span>' + U.esc(msg) + '</span>';
    root.appendChild(el);
    setTimeout(function () {
      el.classList.add('out');
      setTimeout(function () { el.remove(); }, 220);
    }, 2200);
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

  return {
    icon: icon,
    riskBadge: riskBadge,
    stageBadge: stageBadge,
    statusBadge: statusBadge,
    avatar: avatar,
    progress: progress,
    empty: empty,
    toast: toast,
    loading: loading,
    hideLoading: hideLoading,
    modal: modal,
    closeModal: closeModal,
    confirm: confirm,
    pager: pager,
    formValue: formValue,
    options: options
  };
})();

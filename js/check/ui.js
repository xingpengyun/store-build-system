/* ==========================================================
   ui.js — 共享 UI 组件
   ----------------------------------------------------------
   所有插值一律走 U.esc()：门店名 / Sheet 名 / 文件名都来自用户上传的文件，
   里面完全可能有 <script>，这一步不能省。
   ========================================================== */
window.CKUI = (function () {
  'use strict';

  var U = window.CKUtil;
  var esc = U.esc;

  /* ---------------- 图标 ---------------- */
  var P = {
    home: '<path d="M3 8.4L10 3l7 5.4V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.4z"/><path d="M7.6 17v-4.6h4.8V17"/>',
    plus: '<path d="M10 4.5v11M4.5 10h11"/>',
    table: '<rect x="3" y="4" width="14" height="12" rx="1.6"/><path d="M3 8.2h14M7.6 8.2V16"/>',
    link: '<path d="M8.2 11.8a3 3 0 0 1 0-4.2l2-2a3 3 0 0 1 4.2 4.2l-1 1"/><path d="M11.8 8.2a3 3 0 0 1 0 4.2l-2 2a3 3 0 0 1-4.2-4.2l1-1"/>',
    history: '<path d="M10 5.5a4.5 4.5 0 1 1-4.2 6.1"/><path d="M3.2 8.2 5 5.9l2.3 1.7"/><path d="M10 8.1v2.5l1.9 1.1"/>',
    settings: '<circle cx="10" cy="10" r="2.4"/><path d="M10 3.2v1.6M10 15.2v1.6M16.8 10h-1.6M4.8 10H3.2M14.8 5.2l-1.1 1.1M6.3 13.7l-1.1 1.1M14.8 14.8l-1.1-1.1M6.3 6.3 5.2 5.2"/>',
    upload: '<path d="M10 13.5V4.2"/><path d="M6.4 7.6 10 4l3.6 3.6"/><path d="M3.8 12.6v2.2a1.4 1.4 0 0 0 1.4 1.4h9.6a1.4 1.4 0 0 0 1.4-1.4v-2.2"/>',
    file: '<path d="M5.4 3.2h5.2L15 7.4v9.4a1 1 0 0 1-1 1H5.4a1 1 0 0 1-1-1V4.2a1 1 0 0 1 1-1z"/><path d="M10.4 3.4v4.2h4.3"/>',
    check: '<path d="M4.4 10.4 8 14l7.6-8"/>',
    checkCircle: '<circle cx="10" cy="10" r="7.2"/><path d="M6.8 10.2 9 12.4l4.2-4.6"/>',
    alert: '<path d="M10 3.4 17 16H3L10 3.4z"/><path d="M10 8.2v3.4M10 13.9v.1"/>',
    xCircle: '<circle cx="10" cy="10" r="7.2"/><path d="M7.4 7.4l5.2 5.2M12.6 7.4l-5.2 5.2"/>',
    info: '<circle cx="10" cy="10" r="7.2"/><path d="M10 9v4.2M10 6.6v.1"/>',
    download: '<path d="M10 4.2v9.3"/><path d="M6.4 10.2 10 13.8l3.6-3.6"/><path d="M4 16.2h12"/>',
    search: '<circle cx="9" cy="9" r="5.2"/><path d="M13 13l3.5 3.5"/>',
    close: '<path d="M5 5l10 10M15 5 5 15"/>',
    back: '<path d="M11.5 4.5 6 10l5.5 5.5"/>',
    trash: '<path d="M4.4 6.2h11.2M8 6.2V4.4h4v1.8M6.2 6.2v9.4a1 1 0 0 0 1 1h5.6a1 1 0 0 0 1-1V6.2"/>',
    edit: '<path d="M13.2 3.6 16.4 6.8 7.6 15.6H4.4v-3.2z"/>',
    eye: '<path d="M2.4 10S5 5.4 10 5.4 17.6 10 17.6 10 15 14.6 10 14.6 2.4 10 2.4 10z"/><circle cx="10" cy="10" r="2.2"/>',
    refresh: '<path d="M16 10a6 6 0 1 1-1.8-4.3"/><path d="M16.4 3.6v3.6h-3.6"/>',
    save: '<path d="M4.4 3.6h8.2L15.6 6.6v9.8a1 1 0 0 1-1 1H4.4a1 1 0 0 1-1-1V4.6a1 1 0 0 1 1-1z"/><path d="M6.8 3.8v4.2h5.6V3.8M6.8 16.2v-4.4h6.4v4.4"/>',
    wand: '<path d="M4 16 14.4 5.6"/><path d="M12.4 3.2l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7zM5.6 4.4l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3L3.8 6.2l1.3-.5z"/>',
    layers: '<path d="M10 3 17 6.6 10 10.2 3 6.6z"/><path d="M3 10.4 10 14l7-3.6M3 13.8 10 17.4l7-3.6"/>',
    money: '<circle cx="10" cy="10" r="7.2"/><path d="M12 7.4a2.6 2.6 0 0 0-4 1.2c0 2.2 4 1.4 4 3.6a2.4 2.4 0 0 1-4.2 1"/><path d="M10 5.6v8.8"/>',
    copy: '<rect x="7" y="7" width="9" height="9" rx="1.4"/><path d="M13 7V5.4a1.4 1.4 0 0 0-1.4-1.4H5.4A1.4 1.4 0 0 0 4 5.4v6.2A1.4 1.4 0 0 0 5.4 13H7"/>',
    filter: '<path d="M3.4 5.2h13.2l-5.1 6v4.4l-3-1.6v-2.8z"/>',
    books: '<path d="M4 4.6h3.4v11H4zM8.6 4.6H12v11H8.6z"/><path d="M13.4 4.8l2.4 10.4"/>',
    spark: '<path d="M10 3.2l1.5 4.2 4.2 1.5-4.2 1.5L10 14.6l-1.5-4.2L4.3 8.9l4.2-1.5z"/>',
    arrowRight: '<path d="M4.5 10h11M11 5.5 15.5 10 11 14.5"/>',
    clock: '<circle cx="10" cy="10" r="7.2"/><path d="M10 6.2V10l2.6 1.5"/>',
    expand: '<path d="M4 8V4h4M12 4h4v4M16 12v4h-4M8 16H4v-4"/>',
    shrink: '<path d="M8 4v4H4M16 8V4h-4M12 16v-4h4M4 12v4h4"/>'
  };

  function icon(name, cls) {
    var p = P[name] || P.info;
    return '<svg class="' + (cls || '') + '" viewBox="0 0 20 20" fill="none" stroke="currentColor" ' +
      'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  }

  /* ---------------- 吉祥物「核核」（圣诞版 z213） ----------------
     纯 SVG：蓝紫团子身体 + 红白圣诞帽（软帽尖 + 白绒球 + 冬青叶红果）+
     举起挥手的短手臂 + 腮红 + 金星/雪花点缀。
     造型还是原来那只团子，只把节日装换上 —— 别页里认得出是同一个角色。
     mood: happy（默认，微笑）/ think（眼睛弯成线 + 平嘴）/ sad（嘴角向下） */
  var mascotSeq = 0;
  function mascot(opts) {
    opts = opts || {};
    var size = opts.size || 120;
    var mood = opts.mood || 'happy';
    var n = ++mascotSeq;
    var bodyId = 'ckBot' + n;
    var hatId = 'ckHat' + n;

    /* 嘴：sad 向下弯 / think 平线 / happy 上扬小笑 */
    var mouth = mood === 'sad'
      ? '<path d="M72 107q8-7 16 0" stroke="#3a4066" stroke-width="3.4" stroke-linecap="round" fill="none"/>'
      : (mood === 'think'
        ? '<path d="M72 103h16" stroke="#3a4066" stroke-width="3.4" stroke-linecap="round"/>'
        : '<path d="M71 100q9 9.5 18 0" stroke="#3a4066" stroke-width="3.6" stroke-linecap="round" fill="none"/>');

    /* 眼：think 眯成两道弯，其余是圆点 */
    var eyes = mood === 'think'
      ? '<path d="M57 89q6.5-5.5 13 0" stroke="#3a4066" stroke-width="3.6" stroke-linecap="round" fill="none"/>' +
        '<path d="M90 89q6.5-5.5 13 0" stroke="#3a4066" stroke-width="3.6" stroke-linecap="round" fill="none"/>'
      : '<circle cx="63.5" cy="89" r="4.7" fill="#3a4066"/>' +
        '<circle cx="96.5" cy="89" r="4.7" fill="#3a4066"/>';

    /* 四角星星（参考图周围的 ✦ 点缀） */
    function star(x, y, s, color, op) {
      return '<path transform="translate(' + x + ' ' + y + ') scale(' + s + ')" ' +
        'd="M0 -5 L1.3 -1.3 L5 0 L1.3 1.3 L0 5 L-1.3 1.3 L-5 0 L-1.3 -1.3 Z" ' +
        'fill="' + color + '" opacity="' + (op || .9) + '"/>';
    }

    /* 六角雪花：三条交叉线 + 中心一点，圣诞版用来替掉两颗星 */
    function snow(x, y, s, op) {
      return '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')" opacity="' + (op || .85) + '">' +
        '<path d="M0 -7V7M-6 -3.5 6 3.5M-6 3.5 6 -3.5" stroke="#fff" stroke-width="1.7" ' +
          'stroke-linecap="round" fill="none"/>' +
        '<circle r="1.5" fill="#fff"/>' +
      '</g>';
    }

    return '' +
      '<svg class="ck-mascot" viewBox="0 0 160 160" width="' + size + '" height="' + size + '" aria-hidden="true">' +
        '<defs>' +
          /* 身体：蓝紫团子，左上受光 */
          '<radialGradient id="' + bodyId + '" cx="34%" cy="26%" r="85%">' +
            '<stop offset="0" stop-color="#aab6ff"/>' +
            '<stop offset="45%" stop-color="#7f8df6"/>' +
            '<stop offset="80%" stop-color="#6271ee"/>' +
            '<stop offset="100%" stop-color="#4d5ade"/>' +
          '</radialGradient>' +
          /* 圣诞帽：圣诞红（亮面 → 深红），和主站雪夜场景同一套红 */
          '<linearGradient id="' + hatId + '" x1="0" y1="0" x2="1" y2="1">' +
            '<stop offset="0" stop-color="#f4554e"/>' +
            '<stop offset="48%" stop-color="#d92b34"/>' +
            '<stop offset="100%" stop-color="#9c1b2b"/>' +
          '</linearGradient>' +
        '</defs>' +
        /* 地面阴影 */
        '<ellipse cx="80" cy="147" rx="37" ry="7" fill="#2b2f6e" opacity=".16"/>' +
        /* 金星 + 雪花点缀（四角都留一点，圣诞版把右上/右下换成雪花） */
        star(24, 36, 1.05, '#ffd76b') +
        snow(135, 24, 0.9, .95) +
        star(22, 100, 0.7, '#ffd76b', .75) +
        snow(141, 100, 0.8, .9) +
        /* 右手臂（画面左）：举起来打招呼 */
        '<ellipse cx="25" cy="72" rx="10" ry="14.5" fill="#6f7ef2" transform="rotate(-32 25 72)"/>' +
        /* 左手臂（画面右）：自然下垂 */
        '<ellipse cx="136" cy="112" rx="9.5" ry="13" fill="#5b69e8" transform="rotate(24 136 112)"/>' +
        /* 身体：胖团子 */
        '<ellipse cx="80" cy="95" rx="48" ry="45" fill="url(#' + bodyId + ')"/>' +
        /* 身体高光 + 底部反光 */
        '<ellipse cx="60" cy="64" rx="17" ry="10" fill="#fff" opacity=".28" transform="rotate(-24 60 64)"/>' +
        '<path d="M44 118a46 40 0 0 0 72 0" stroke="#4653d8" stroke-width="3" fill="none" opacity=".3"/>' +
        /* 红白圣诞帽：软帽身（帽尖往右上甩）+ 白绒球 */
        '<path d="M43 59 C40 33 58 17 82 19 C104 21 118 34 122 46 ' +
          'C127 57 137 60 146 52 C150 49 152 44 152 39 ' +
          'C157 52 152 67 140 70 C129 73 117 65 109 58 ' +
          'C99 52 90 51 80 51 C64 51 51 55 43 59 Z" fill="url(#' + hatId + ')"/>' +
        '<circle cx="150" cy="40" r="9" fill="#f4f7ff"/>' +
        '<circle cx="147" cy="37" r="3.4" fill="#ffffff" opacity=".9"/>' +
        /* 帽檐：下层阴影 + 上层柔白绒边（别用纯白，深底上会像白盘子） */
        '<ellipse cx="80" cy="59.5" rx="39" ry="7.4" fill="#d3ddf2"/>' +
        '<ellipse cx="80" cy="58.2" rx="39" ry="5.8" fill="#f7faff"/>' +
        /* 冬青叶 + 三颗红果，别在帽子右侧 */
        '<path d="M108 47 q6 -12 16 -13 q-2 11 -16 13 Z" fill="#146b4a"/>' +
        '<path d="M108 47 q-2 -13 6 -18 q6 9 -6 18 Z" fill="#2a9a6a"/>' +
        '<circle cx="112" cy="46" r="3.1" fill="#e23b3f"/>' +
        '<circle cx="119" cy="44" r="2.9" fill="#c62828"/>' +
        '<circle cx="115" cy="51" r="2.7" fill="#f0524f"/>' +
        /* 帽檐在脸上的投影 */
        '<path d="M50 66a33 30 0 0 1 60 0" stroke="#4d5ade" stroke-width="3" fill="none" opacity=".16"/>' +
        /* 脸：眼睛 + 腮红 + 嘴 */
        eyes +
        '<ellipse cx="46" cy="99" rx="7" ry="4.6" fill="#ff9fb2" opacity=".6"/>' +
        '<ellipse cx="114" cy="99" rx="7" ry="4.6" fill="#ff9fb2" opacity=".6"/>' +
        mouth +
      '</svg>';
  }

  /* ---------------- Toast ---------------- */
  function toastHost() {
    var h = document.getElementById('ckToasts');
    if (!h) {
      h = document.createElement('div');
      h.id = 'ckToasts';
      h.className = 'ck-toasts';
      document.body.appendChild(h);
    }
    return h;
  }

  function toast(msg, type, ms, key) {
    var host = toastHost();

    /* 同一个 key 只保留一条。
       典型场景：上传一个文件会先弹「正在解析…」再弹「已读取」，
       两条叠在页面顶部正好糊住步骤条和卡片标题 —— 这是实打实的显示异常。
       带 key 的提示互相替换，同一时刻最多一条。 */
    if (key) {
      var olds = host.querySelectorAll('[data-toast-key="' + key + '"]');
      for (var k = 0; k < olds.length; k++) {
        if (olds[k].parentNode) olds[k].parentNode.removeChild(olds[k]);
      }
    }

    var el = document.createElement('div');
    el.className = 'ck-toast' + (type ? ' is-' + type : '');
    if (key) el.setAttribute('data-toast-key', key);
    var ic = type === 'ok' ? 'checkCircle' : type === 'bad' ? 'xCircle' : type === 'warn' ? 'alert' : 'info';
    el.innerHTML = (type === 'loading' ? '<span class="ck-spin" style="width:14px;height:14px"></span>' : icon(ic)) +
      '<span>' + esc(msg) + '</span>';
    host.appendChild(el);

    /* 最多同时 3 条：再多就不是提示而是糊墙了 */
    var live = host.querySelectorAll('.ck-toast');
    for (var i = 0; i < live.length - 3; i++) {
      if (live[i].parentNode) live[i].parentNode.removeChild(live[i]);
    }

    function remove() {
      el.style.transition = 'opacity .2s, transform .2s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(-8px)';
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
    }

    /* ms === 0 表示「常驻，直到被同 key 的提示替换」，
       用于「正在解析」这类需要精确结束点的进度提示 */
    if (ms !== 0) setTimeout(remove, ms || 2600);
  }

  /* ---------------- Modal ---------------- */
  function modal(html, opts) {
    opts = opts || {};
    var mask = document.getElementById('ckModalMask');
    if (!mask) {
      mask = document.createElement('div');
      mask.id = 'ckModalMask';
      mask.className = 'ck-modal-mask';
      document.body.appendChild(mask);
    }
    mask.innerHTML = '<div class="ck-modal" role="dialog" aria-modal="true">' + html + '</div>';
    mask.classList.add('is-open');
    var modalEl = mask.firstChild;

    function close() {
      mask.classList.remove('is-open');
      mask.innerHTML = '';
      document.removeEventListener('keydown', onKey);
      if (opts.onClose) opts.onClose();
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);
    mask.addEventListener('mousedown', function (e) {
      if (e.target === mask) close();
    });
    /* 点带 data-close 的按钮关闭 */
    modalEl.addEventListener('click', function (e) {
      var b = e.target.closest('[data-close]');
      if (b) close();
    });
    var focusable = mask.querySelector('input, select, textarea, button.is-primary');
    if (focusable) setTimeout(function () { focusable.focus(); }, 60);

    return { el: modalEl, close: close };
  }

  function confirmBox(o) {
    return new Promise(function (resolve) {
      var m = modal(
        '<div class="ck-modal-head">' +
          '<div style="width:34px;height:34px;border-radius:10px;display:grid;place-items:center;flex:0 0 auto;background:' +
            (o.danger ? 'var(--bad-l);color:var(--bad)' : 'var(--brand-l);color:var(--brand)') + '">' +
            icon(o.danger ? 'alert' : 'info') + '</div>' +
          '<div><h3>' + esc(o.title || '确认操作') + '</h3>' +
          (o.desc ? '<p>' + esc(o.desc) + '</p>' : '') + '</div>' +
        '</div>' +
        (o.body ? '<div class="ck-modal-body">' + o.body + '</div>' : '') +
        '<div class="ck-modal-foot">' +
          '<button class="ck-btn" data-no>取消</button>' +
          '<button class="ck-btn ' + (o.danger ? 'is-danger' : 'is-primary') + '" data-yes>' + esc(o.okText || '确定') + '</button>' +
        '</div>'
      );
      m.el.querySelector('[data-no]').onclick = function () { m.close(); resolve(false); };
      m.el.querySelector('[data-yes]').onclick = function () { m.close(); resolve(true); };
    });
  }

  function promptBox(o) {
    return new Promise(function (resolve) {
      var m = modal(
        '<div class="ck-modal-head">' +
          '<div style="width:34px;height:34px;border-radius:10px;display:grid;place-items:center;flex:0 0 auto;background:var(--brand-l);color:var(--brand)">' +
            icon('edit') + '</div>' +
          '<div><h3>' + esc(o.title || '输入') + '</h3>' + (o.desc ? '<p>' + esc(o.desc) + '</p>' : '') + '</div>' +
        '</div>' +
        '<div class="ck-modal-body">' +
          '<div class="ck-field"><label class="ck-label">' + esc(o.label || '') + '</label>' +
          '<input class="ck-input" id="ckPromptInput" value="' + esc(o.value || '') + '" placeholder="' + esc(o.placeholder || '') + '" /></div>' +
          (o.hint ? '<div class="ck-small ck-muted" style="margin-top:8px">' + esc(o.hint) + '</div>' : '') +
        '</div>' +
        '<div class="ck-modal-foot">' +
          '<button class="ck-btn" data-no>取消</button>' +
          '<button class="ck-btn is-primary" data-yes>' + esc(o.okText || '保存') + '</button>' +
        '</div>'
      );
      var inp = m.el.querySelector('#ckPromptInput');
      var done = false;
      function ok() {
        if (done) return;
        done = true;
        var v = inp.value.trim();
        m.close();
        resolve(v || null);
      }
      m.el.querySelector('[data-no]').onclick = function () { done = true; m.close(); resolve(null); };
      m.el.querySelector('[data-yes]').onclick = ok;
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') ok(); });
    });
  }

  /* ---------------- Drawer ---------------- */
  function drawer(o) {
    var mask = document.getElementById('ckDrawerMask');
    var panel = document.getElementById('ckDrawer');
    if (!mask || !panel) return { close: function () { }, setBody: function () { } };

    panel.innerHTML =
      '<div class="ck-drawer-head">' +
        '<div style="flex:1;min-width:0"><h3 style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(o.title || '') + '</h3>' +
        (o.sub ? '<div class="ck-small ck-muted">' + o.sub + '</div>' : '') + '</div>' +
        '<button class="ck-btn is-ghost is-sm" data-dclose aria-label="关闭">' + icon('close') + '</button>' +
      '</div>' +
      '<div class="ck-drawer-body" id="ckDrawerBody">' + (o.body || '') + '</div>' +
      (o.foot ? '<div class="ck-drawer-foot">' + o.foot + '</div>' : '');

    mask.classList.add('is-open');
    panel.classList.add('is-open');

    function close() {
      mask.classList.remove('is-open');
      panel.classList.remove('is-open');
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    mask.onclick = close;
    panel.querySelector('[data-dclose]').onclick = close;

    return {
      el: panel,
      close: close,
      setBody: function (html) {
        var b = panel.querySelector('#ckDrawerBody');
        if (b) b.innerHTML = html;
      }
    };
  }

  /* ---------------- 小组件 ---------------- */
  function statusTag(status) {
    var map = {
      /* 门槛核验 */
      pass: ['is-ok', '达标'],
      fail: ['is-diff', '未达标'],
      /* 金额对账 */
      ok: ['is-ok', '金额一致'],
      diff: ['is-diff', '金额差异'],
      confirm: ['is-wait', '待确认'],
      'unmatched-a': ['is-miss', '清单外'],
      'unmatched-b': ['is-miss', '仓库未对应'],
      dup: ['is-dup', '重复']
    };
    var m = map[status] || ['', status];
    return '<span class="ck-tag ' + m[0] + '"><i></i>' + esc(m[1]) + '</span>';
  }

  function diffCell(n) {
    if (n === null || n === undefined) return '<span class="ck-diff-zero">—</span>';
    if (Math.abs(n) < 0.005) return '<span class="ck-diff-zero">0.00</span>';
    var cls = n > 0 ? 'ck-diff-pos' : 'ck-diff-neg';
    return '<span class="' + cls + '">' + U.fmtDiff(n) + '</span>';
  }

  /* KPI 卡：结构与主站主页的 .kpi 一致 —— 左侧圆角图标块 + 右侧「标签 / 数值 / 说明」。
     原来这里是「一个小圆点 + 竖排大字 + 彩色数字」，和主站并排看就是两套东西。
     语义色只上在图标块上，数字统一走正文色（主站也是这么做的）。 */
  var KPI_ICO = {
    '': ['layers', 'var(--brand-l)', 'var(--brand)'],
    brand: ['layers', 'var(--brand-l)', 'var(--brand)'],
    ok: ['checkCircle', 'var(--ok-l)', 'var(--ok)'],
    diff: ['alert', 'var(--warn-l)', 'var(--warn)'],
    miss: ['xCircle', 'var(--bad-l)', 'var(--bad)'],
    wait: ['info', 'var(--wait-l)', 'var(--wait)'],
    dup: ['copy', 'var(--dup-l)', 'var(--dup)']
  };

  function kpi(o) {
    var tone = o.tone || '';
    var conf = KPI_ICO[tone] || KPI_ICO[''];
    return '<div class="ck-kpi' + (tone ? ' is-' + tone : '') + '">' +
      '<span class="ck-kpi-ico" style="background:' + conf[1] + ';color:' + conf[2] + '">' +
        icon(o.icon || conf[0]) +
      '</span>' +
      '<div class="ck-kpi-body">' +
        '<div class="ck-kpi-label">' + esc(o.label) + '</div>' +
        '<div class="ck-kpi-val">' + (o.html || esc(o.value)) +
          (o.unit ? '<span class="ck-kpi-unit">' + esc(o.unit) + '</span>' : '') +
        '</div>' +
        (o.sub ? '<div class="ck-kpi-sub">' + esc(o.sub) + '</div>' : '') +
      '</div>' +
    '</div>';
  }

  function emptyBox(o) {
    o = o || {};
    return '<div class="ck-empty">' +
      (o.art === false ? '' : '<div class="ck-empty-art">' + mascot({ size: 108, mood: o.mood || 'happy' }) + '</div>') +
      '<div class="ck-empty-title">' + esc(o.title || '还没有数据') + '</div>' +
      (o.text ? '<div class="ck-empty-text">' + esc(o.text) + '</div>' : '') +
      (o.action || '') +
    '</div>';
  }

  function pager(total, page, size, onChange) {
    var pages = Math.max(1, Math.ceil(total / size));
    var p = Math.min(Math.max(1, page), pages);
    var from = total === 0 ? 0 : (p - 1) * size + 1;
    var to = Math.min(total, p * size);
    return '<div class="ck-row" style="padding:10px 18px;border-top:1px solid var(--line-s);background:#fff">' +
      '<span class="ck-small ck-muted">共 ' + U.fmtInt(total) + ' 条，第 ' + from + '–' + to + ' 条</span>' +
      '<span class="ck-spacer"></span>' +
      '<button class="ck-btn is-sm" data-pg="' + (p - 1) + '"' + (p <= 1 ? ' disabled' : '') + '>上一页</button>' +
      '<span class="ck-small ck-muted ck-num" style="padding:0 4px">' + p + ' / ' + pages + '</span>' +
      '<button class="ck-btn is-sm" data-pg="' + (p + 1) + '"' + (p >= pages ? ' disabled' : '') + '>下一页</button>' +
    '</div>';
  }

  function diffBar(o) {
    var total = o.total || 0;
    var L = o.labels || {};
    var items = [
      { n: L.ok || '一致', v: o.ok || 0, c: 'var(--ok)' },
      { n: L.diff || '差异', v: o.diff || 0, c: 'var(--warn)' },
      { n: L.confirm || '待确认', v: o.confirm || 0, c: 'var(--wait)' },
      { n: L.miss || '未匹配', v: o.miss || 0, c: 'var(--bad)' }
    ];
    if (!total) return '<div class="ck-small ck-muted">暂无数据</div>';
    var html = '<div style="display:flex;height:9px;border-radius:999px;overflow:hidden;background:var(--sunk);gap:2px">';
    items.forEach(function (it) {
      if (!it.v) return;
      html += '<div style="width:' + (it.v / total * 100).toFixed(2) + '%;background:' + it.c + '"></div>';
    });
    html += '</div><div class="ck-row wrap" style="gap:14px;margin-top:10px">';
    items.forEach(function (it) {
      html += '<span class="ck-small ck-muted" style="display:inline-flex;align-items:center;gap:5px">' +
        '<i style="width:7px;height:7px;border-radius:2px;background:' + it.c + ';display:inline-block"></i>' +
        esc(it.n) + ' <b style="color:var(--t1);font-variant-numeric:tabular-nums">' + U.fmtInt(it.v) + '</b></span>';
    });
    return html + '</div>';
  }

  return {
    icon: icon,
    mascot: mascot,
    toast: toast,
    modal: modal,
    confirm: confirmBox,
    prompt: promptBox,
    drawer: drawer,
    statusTag: statusTag,
    diffCell: diffCell,
    kpi: kpi,
    empty: emptyBox,
    pager: pager,
    diffBar: diffBar
  };
})();

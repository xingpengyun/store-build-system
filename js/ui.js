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
    gear: '<circle cx="10" cy="10" r="2.4"/><path d="M10 2.9v1.8M10 15.3v1.8M2.9 10h1.8M15.3 10h1.8M4.95 4.95l1.3 1.3M13.75 13.75l1.3 1.3M15.05 4.95l-1.3 1.3M6.25 13.75l-1.3 1.3"/>',
    exit: '<path d="M8.6 3.4H5a1.2 1.2 0 0 0-1.2 1.2v10.8A1.2 1.2 0 0 0 5 16.6h3.6"/><path d="M12.4 6.6L15.8 10l-3.4 3.4"/><path d="M8 10h7.6"/>',
    board: '<rect x="3.4" y="3.6" width="13.2" height="9.6" rx="1.8"/><path d="M6.2 16.4l2.6-3.2"/><path d="M6.8 7h6.4M6.8 9.8h4"/>'
  };

  function icon(name, cls) {
    var p = PATHS[name] || '';
    return '<svg class="' + (cls || '') + '" viewBox="0 0 20 20" fill="none" stroke="currentColor"' +
      ' stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
  }

  /* ---------------- 吉祥物（小蛮） ----------------
     门店筹建的小角色：戴着黄色安全帽的蓝色团子，右臂挥手、会眨眼。
     纯 SVG + CSS 动画，登录页和欢迎弹窗共用这一只。
     各部件动画类：.mascot-glow 背景柔光 / .mascot-shadow 影子 /
     .mascot-eye 眼睛（眨眼）/ .mascot-arm 右臂（挥手）/ .mascot-spark 星星。
     cls 打在 <svg> 上（login-mascot-svg 或 welcome-mascot），CSS 按它取尺寸。 */
  function mascot(cls) {
    return '<svg class="' + (cls || '') + '" viewBox="0 0 200 220" aria-hidden="true" focusable="false">' +
      '<defs><linearGradient id="mcBody" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#8aa2ff"/><stop offset="1" stop-color="#5b7cff"/>' +
      '</linearGradient></defs>' +
      '<ellipse class="mascot-glow" cx="100" cy="120" rx="72" ry="64" fill="#cfe0ff" opacity=".45"/>' +
      '<ellipse class="mascot-shadow" cx="100" cy="206" rx="46" ry="9" fill="#1f3d5a" opacity=".10"/>' +
      '<ellipse cx="46" cy="160" rx="13" ry="24" fill="#5b7cff" transform="rotate(20 46 160)"/>' +
      '<ellipse cx="100" cy="150" rx="56" ry="54" fill="url(#mcBody)"/>' +
      '<ellipse cx="100" cy="174" rx="30" ry="20" fill="#ffffff" opacity=".14"/>' +
      '<ellipse class="mascot-eye l" cx="82" cy="128" rx="6" ry="7.5" fill="#2b2f4a"/>' +
      '<ellipse class="mascot-eye r" cx="118" cy="128" rx="6" ry="7.5" fill="#2b2f4a"/>' +
      '<circle cx="84" cy="125.5" r="1.8" fill="#ffffff"/>' +
      '<circle cx="120" cy="125.5" r="1.8" fill="#ffffff"/>' +
      '<ellipse cx="68" cy="144" rx="9" ry="5" fill="#ff9db0" opacity=".5"/>' +
      '<ellipse cx="132" cy="144" rx="9" ry="5" fill="#ff9db0" opacity=".5"/>' +
      '<path d="M91 134 Q100 145 109 134" stroke="#2b2f4a" stroke-width="4" fill="none" stroke-linecap="round"/>' +
      '<g class="mascot-arm"><ellipse cx="158" cy="138" rx="12" ry="23" fill="#5b7cff" transform="rotate(30 158 138)"/></g>' +
      '<path d="M60 92 a40 30 0 0 1 80 0 z" fill="#ffd23f"/>' +
      '<ellipse cx="100" cy="95" rx="48" ry="9" fill="#f0b429"/>' +
      '<path d="M72 80 a28 18 0 0 1 56 0" stroke="#ffffff" stroke-width="3" fill="none" opacity=".5" stroke-linecap="round"/>' +
      '<g transform="translate(30,52)"><path class="mascot-spark s1" d="M0 -6.5 L1.7 -1.7 L6.5 0 L1.7 1.7 L0 6.5 L-1.7 1.7 L-6.5 0 L-1.7 -1.7 Z" fill="#ffd23f"/></g>' +
      '<g transform="translate(176,64)"><path class="mascot-spark s2" d="M0 -5 L1.3 -1.3 L5 0 L1.3 1.3 L0 5 L-1.3 1.3 L-5 0 L-1.3 -1.3 Z" fill="#7c9cff"/></g>' +
      '<g transform="translate(24,116)"><path class="mascot-spark s3" d="M0 -4 L1 -1 L4 0 L1 1 L0 4 L-1 1 L-4 0 L-1 -1 Z" fill="#34c78b"/></g>' +
      '<g transform="translate(182,126)"><path class="mascot-spark s4" d="M0 -4.5 L1.2 -1.2 L4.5 0 L1.2 1.2 L0 4.5 L-1.2 1.2 L-4.5 0 L-1.2 -1.2 Z" fill="#ff9db0"/></g>' +
    '</svg>';
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

  /* ---------------- 头像 ----------------
     全部头像都是 3D 图片（assets/avatars3d/*.webp，256px，单张 3~11KB），
     靠 key 前缀分类：d_u_ 人物 / d_a_ 动物 / d_h_ 万圣节。
     老 key（cat / dog / pumpkin …）只是历史数据的兼容层，由 ART_ALIAS 反向生成。 */
  var ART = {};
  /* 3D 头像（z166 起，z168 补齐到 22 张）：软胶质感的 AI 渲染图，key 带 d_ 前缀。
     走 ART 总表而不是单开一张，是为了让所有老调用点（UI.ANIMALS[key].bg、
     UI.animalSvg(key)、store 里的合法性校验）不用改。 */
  var ART_3D = {
    d_glasses:  { name: '眼镜男生', file: 'a3d_u_glasses.webp',  bg: '#EEF3FF' },
    d_longhair: { name: '长发女生', file: 'a3d_u_longhair.webp', bg: '#FFF0F6' },
    d_ponytail: { name: '马尾女生', file: 'a3d_u_ponytail.webp', bg: '#EFFAF3' },
    d_beard:    { name: '胡渣大叔', file: 'a3d_u_beard.webp',    bg: '#F1EFFF' },
    d_cat:      { name: '3D 橘猫',  file: 'a3d_a_cat.webp',      bg: '#FFF3E4' },
    d_panda:    { name: '3D 熊猫',  file: 'a3d_a_panda.webp',    bg: '#F3F6FB' },
    d_shiba:    { name: '3D 柴犬',  file: 'a3d_a_shiba.webp',    bg: '#FFF5EC' },
    d_fox:      { name: '3D 狐狸',  file: 'a3d_a_fox.webp',      bg: '#FFF1E7' },
    d_rabbit:   { name: '3D 小兔',  file: 'a3d_a_rabbit.webp',   bg: '#FFF1F6' },
    d_bear:     { name: '3D 小熊',  file: 'a3d_a_bear.webp',     bg: '#FFF6EA' },
    d_pig:      { name: '3D 小猪',  file: 'a3d_a_pig.webp',      bg: '#FFF0F5' },
    d_frog:     { name: '3D 青蛙',  file: 'a3d_a_frog.webp',     bg: '#EFFAEF' },
    d_chick:    { name: '3D 小鸡',  file: 'a3d_a_chick.webp',    bg: '#FFFAE3' },
    d_koala:    { name: '3D 考拉',  file: 'a3d_a_koala.webp',    bg: '#F2F5FA' },
    d_tiger:    { name: '3D 小虎',  file: 'a3d_a_tiger.webp',    bg: '#FFF4DE' },
    d_penguin:  { name: '3D 企鹅',  file: 'a3d_a_penguin.webp',  bg: '#EEF4FF' },
    d_pumpkin:  { name: '3D 南瓜灯', file: 'a3d_h_pumpkin.webp',  bg: '#3A2A55' },
    d_ghost:    { name: '3D 幽灵',  file: 'a3d_h_ghost.webp',    bg: '#2B2440' },
    d_witch:    { name: '3D 女巫',  file: 'a3d_h_witch.webp',    bg: '#1F3A24' },
    d_blackcat: { name: '3D 黑猫',  file: 'a3d_h_blackcat.webp', bg: '#3A2A55' },
    d_bat:      { name: '3D 蝙蝠',  file: 'a3d_h_bat.webp',      bg: '#F2EEFF' },
    d_skull:    { name: '3D 骷髅',  file: 'a3d_h_skull.webp',    bg: '#F7F4EE' }
  };
  Object.keys(ART_3D).forEach(function (k) {
    ART[k] = { name: ART_3D[k].name, bg: ART_3D[k].bg, img: ART_3D[k].file };
  });

  /* 老头像升级（2026-10-30 z168）：原来那 12 只扁平 SVG 小动物 + 6 个 SVG 万圣节角色
     全部换成上面这套 3D。已经选过 cat / dog 这类老 key 的成员**不用重选**——
     显示时先过一道别名，自动换成对应的 3D 图；老 key 仍留在 ART 里做兜底，
     只是不再出现在选择器（选择器只铺 ART_GROUPS 里列的 key）。 */
  var ART_ALIAS = {
    cat: 'd_cat', dog: 'd_shiba', rabbit: 'd_rabbit', bear: 'd_bear',
    panda: 'd_panda', fox: 'd_fox', pig: 'd_pig', frog: 'd_frog',
    chick: 'd_chick', koala: 'd_koala', tiger: 'd_tiger', penguin: 'd_penguin',
    pumpkin: 'd_pumpkin', ghost: 'd_ghost', bat: 'd_bat', skull: 'd_skull',
    blackcat: 'd_blackcat', witch: 'd_witch'
  };
  /* 老 key 也要留在表里：store.js 的 setMemberArt 会拿 UI.ANIMALS[key] 做合法性校验，
     表里没有就会被当成「不用头像」，直接把成员头像清掉。名字 / 底色沿用对应的 3D 头像。 */
  Object.keys(ART_ALIAS).forEach(function (k) {
    var d = ART[ART_ALIAS[k]];
    ART[k] = { name: d.name, bg: d.bg, legacy: 1 };
  });
  function normArt(k) { return ART_ALIAS[k] || k || ''; }
  /* 把「可能来自历史数据的头像值」整理成一个真能画出来的 key：
     合法（有图）就返回它，老 key 顺手换成 3D 版，其余一律当没有头像。
     各页面要读 UI.ANIMALS[key].bg 之前都过这一道，省得各自 if 一遍还容易漏。 */
  function artKey(v) {
    var k = normArt(v);
    return (k && ART[k] && ART[k].img) ? k : '';
  }

  /* 选择器的分组与顺序：全部是 3D 图，按人物 / 动物 / 万圣节排，
     组内顺序是手调的（先放最常用的），不跟 ART 的声明顺序走 */
  var ART_GROUPS = [
    { title: '人物', keys: ['d_glasses', 'd_longhair', 'd_ponytail', 'd_beard'] },
    { title: '动物', keys: ['d_cat', 'd_panda', 'd_shiba', 'd_fox', 'd_rabbit', 'd_bear',
                            'd_pig', 'd_frog', 'd_chick', 'd_koala', 'd_tiger', 'd_penguin'] },
    { title: '万圣节', keys: ['d_pumpkin', 'd_ghost', 'd_witch', 'd_blackcat', 'd_bat', 'd_skull'] }
  ];

  var ART_KEYS = Object.keys(ART);

  /* 换头像图片时改这个版本号，img 的 ?v= 跟着变，浏览器才会重新拉图 */
  var ART_VER = '20261030z168';

  /* 头像内容：3D 图铺满整颗圆（圆是父级裁的，img 不用自己裁）。
     __ASSET_BASE 只在本地预览页（.workbuddy/harness.html，位于子目录）里设成 '../'，
     正式站没有这个变量，路径就是普通的 assets/…。
     ?v= 是必须的：图片名不带 hash，浏览器会强缓存，换图后不加参数用户看到的还是旧图。 */
  function animalSvg(key) {
    var d = ART[normArt(key)];
    if (!d || !d.img) return '';       /* 只有老 key 的兼容项没有图，那里显示「颜色 + 首字」 */
    var base = (typeof window !== 'undefined' && window.__ASSET_BASE) || '';
    return '<img class="art-img" src="' + base + 'assets/avatars3d/' + d.img + '?v=' + ART_VER + '" alt="' +
      U.esc(d.name) + '" draggable="false" />';
  }

  /* 头像：传了动物 key 就画小动物，没传还是原来那颗「颜色 + 姓氏首字」 */
  function avatar(name, color, size, animal) {
    animal = normArt(animal);           /* 老 key（cat / dog …）自动换成 3D 版 */
    var d = animal && ART[animal];
    if (d && d.img) {                   /* 有一点图才画圆头像，否则退回「颜色 + 姓氏首字」 */
      return '<span class="avatar avatar-' + (size || 'md') + ' avatar-art" style="background:' + d.bg +
        '" title="' + U.esc(d.name) + '">' + animalSvg(animal) + '</span>';
    }
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

  /* ---------------- 页面正中小卡片：门店阶段往前走了 ----------------
     跳阶段的时候页面中间弹一张卡，写明「该门店已转入下一阶段的名称」。
     跟顶部 toast 分工：toast 是操作回执（谁做了什么），这张是结果播报。
     2026-10-25：位置从右下角改到屏幕正中，停留 6.5 秒 → 2 秒（用户要求），
     仍可手动点 × 提前关；最多同时叠 3 张（再来就把最老的推掉）。

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
    setTimeout(dismiss, opts.duration || 2000);
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
  /* 弹窗可以叠（opts.stack = true）：门店详情点「详细信息」会再叠一层大的上去，
     下面那层不关。Esc / 关全部都只认栈。 */
  var modalStack = [];

  function modal(opts) {
    if (!opts.stack) closeModal();
    var root = document.getElementById('modalRoot');
    var mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML =
      '<div class="modal' + (opts.size === 'lg' ? ' modal-lg' : opts.size === 'xl' ? ' modal-xl' : '') + '" role="dialog">' +
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
    mask.__close = close;          /* 让 closeModal() 逐层走正规关闭，别直接删 DOM */
    modalStack.push(mask);

    function close() {
      mask.remove();
      modalStack = modalStack.filter(function (m) { return m !== mask; });
      openModal = modalStack.length ? modalStack[modalStack.length - 1] : null;
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) {
      if (e.key !== 'Escape') return;
      /* 叠了多层时只有最上面那层吃 Esc，不然一次全关 */
      if (modalStack[modalStack.length - 1] === mask) close();
    }

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
    /* 逐层调各自的 close()：它会解绑那一层的 Esc 监听。
       以前是直接 remove DOM，Esc 的 keydown 监听会一直挂在 document 上，
       弹窗开关几十次就积几十个回调（每次按 Esc 都白跑一遍）。 */
    modalStack.slice().reverse().forEach(function (m) {
      if (m && m.__close) m.__close();
      else if (m && m.parentNode) m.remove();
    });
    modalStack = [];
    openModal = null;
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

  /* ---------------- 首次登录欢迎 ----------------
     首次登录（按姓名、本机）弹一次「欢迎加入」。
     opts: { name, admin } —— admin 决定提示管理员还是找管理员开权限。 */
  function welcome(opts) {
    opts = opts || {};
    var name = String(opts.name || '').trim() || '新伙伴';
    var admin = !!opts.admin;
    var owner = '';
    try { owner = (window.Store && window.Store.accessOf) ? window.Store.accessOf().owner : ''; } catch (e) {}

    var confetti = '';
    var cfColors = ['#ffd23f', '#7c9cff', '#34c78b', '#ff9db0', '#8aa2ff'];
    for (var i = 0; i < 7; i++) {
      confetti += '<i class="wc" style="left:' + (8 + i * 13) + '%;' +
        'background:' + cfColors[i % cfColors.length] + ';' +
        'animation-delay:' + (i * 0.14).toFixed(2) + 's"></i>';
    }

    var mask = document.createElement('div');
    mask.className = 'welcome-mask';
    mask.innerHTML =
      '<div class="welcome-card" role="dialog" aria-modal="true">' +
        '<button class="welcome-x" type="button" aria-label="关闭">' + icon('close') + '</button>' +
        '<div class="welcome-confetti">' + confetti + '</div>' +
        mascot('welcome-mascot') +
        '<h2>欢迎加入阿蛮团队</h2>' +
        '<p class="welcome-name">Hi，' + U.esc(name) + '</p>' +
        '<p class="welcome-text">你已加入门店筹建管理系统，大家共享同一份云端数据，改完自动同步、换电脑也不丢。</p>' +
        (admin
          ? '<p class="welcome-role">你是 <b>管理员</b>，可进「系统设置」管理品牌、成员与授权。</p>'
          : '<p class="welcome-role">需要改系统设置时，请联系管理员 <b>' + U.esc(owner || '—') + '</b>。</p>') +
        '<button class="btn btn-primary btn-block welcome-btn" type="button">开始使用</button>' +
      '</div>';
    document.body.appendChild(mask);

    function close() {
      mask.classList.add('out');
      setTimeout(function () { mask.remove(); }, 260);
    }
    function onKey(e) {
      if (e.key !== 'Escape') return;
      document.removeEventListener('keydown', onKey);
      close();
    }
    mask.querySelector('.welcome-x').onclick = close;
    mask.querySelector('.welcome-btn').onclick = close;
    mask.addEventListener('mousedown', function (e) { if (e.target === mask) close(); });
    document.addEventListener('keydown', onKey);
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
    mascot: mascot,
    riskBadge: riskBadge,
    stageBadge: stageBadge,
    stageOptions: stageOptions,
    statusBadge: statusBadge,
    avatar: avatar,
    animalSvg: animalSvg,
    ANIMALS: ART,          /* { key: { name, bg, file … } }，所有头像的总表 */
    ANIMAL_KEYS: ART_KEYS,
    ART_GROUPS: ART_GROUPS, /* 选择器用：按组 + 手调顺序铺，全是 3D 图 */
    normArt: normArt,       /* 老头像 key → 对应 3D key */
    artKey: artKey,         /* 历史值 → 真能画出来的 key（不合法就返回 ''） */
    progress: progress,
    empty: empty,
    toast: toast,
    stagePop: stagePop,
    loading: loading,
    hideLoading: hideLoading,
    modal: modal,
    closeModal: closeModal,
    confirm: confirm,
    welcome: welcome,
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

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

  /* ---------------- 头像 ---------------- */
  /* ---------------- 可爱动物头像 ----------------
     一套统一画法的圆脸小动物：同一个 viewBox（40×40）、同一种「圆头 + 点眼 + 腮红 +
     小鼻子」的造型语言，只靠**耳朵形状 / 花色**区分——所以 12 只放在一起是同一个风格。
     纯内联 SVG：不引外部图片、不走 CDN，file:// 双击也能显示。
     配色走奶油马卡龙色系，跟系统里那套淡色卡片是一个调子。 */
  var ART = {
    cat:     { name: '小猫', bg: '#FFF3E4', fur: '#F8B26A', line: '#8A5A2B', blush: '#FFC7A6', ear: 'cat', whisker: 1 },
    dog:     { name: '小狗', bg: '#FFF5EC', fur: '#DDA56E', line: '#7A4A22', blush: '#F7C6A0', ear: 'dog', tongue: 1 },
    rabbit:  { name: '小兔', bg: '#FFF1F6', fur: '#FFD6E4', line: '#B0607E', blush: '#FFB3C9', ear: 'rabbit' },
    bear:    { name: '小熊', bg: '#FFF6EA', fur: '#CD9F71', line: '#7A4A22', blush: '#F2BD95', ear: 'bear' },
    panda:   { name: '熊猫', bg: '#F3F6FB', fur: '#FFFFFF', line: '#2B3246', blush: '#FFC4CE', ear: 'panda' },
    fox:     { name: '狐狸', bg: '#FFF1E7', fur: '#FFA56E', line: '#8A4B2A', blush: '#FFC3A3', ear: 'fox', whisker: 1 },
    pig:     { name: '小猪', bg: '#FFF0F5', fur: '#FFB7CC', line: '#A8546B', blush: '#FF9DBB', ear: 'pig', snout: 1 },
    frog:    { name: '青蛙', bg: '#EFFAEF', fur: '#A9E3A3', line: '#3E7A46', blush: '#8FD98B', ear: 'frog' },
    chick:   { name: '小鸡', bg: '#FFFAE3', fur: '#FFE07F', line: '#8A6A1F', blush: '#FFC8A6', ear: 'chick' },
    koala:   { name: '考拉', bg: '#F2F5FA', fur: '#B9C4D4', line: '#4B5568', blush: '#F2B7C4', ear: 'koala' },
    tiger:   { name: '小虎', bg: '#FFF4DE', fur: '#FFC46B', line: '#6B4423', blush: '#FFC7A0', ear: 'bear', stripe: 1 },
    penguin: { name: '企鹅', bg: '#EEF4FF', fur: '#3E4A63', line: '#EAF0FA', blush: '#FFB3C9', ear: 'none', belly: 1 },

    /* —— 万圣节限定：可选头像里加一组节日角色（南瓜灯/幽灵/蝙蝠/骷髅/黑猫/女巫）——
       它们不是「动物戴帽子」，而是独立的新头像，造型走 halloweenSvg() 单独画。 */
    pumpkin:  { name: '南瓜灯', bg: '#4A2810', fur: '#FF9D2E', line: '#3A1F04', hw: 'pumpkin' },
    ghost:    { name: '幽灵',   bg: '#2B2440', fur: '#FFFFFF', line: '#2B2440', hw: 'ghost' },
    bat:      { name: '蝙蝠',   bg: '#2B2440', fur: '#241D3A', line: '#3A2F4D', hw: 'bat' },
    skull:    { name: '骷髅',   bg: '#232A38', fur: '#F2F4F8', line: '#1F2430', hw: 'skull' },
    blackcat: { name: '黑猫',   bg: '#3A2A55', fur: '#2A2342', line: '#1F1B2E', hw: 'blackcat' },
    witch:    { name: '女巫',   bg: '#1F3A24', fur: '#8FD98B', line: '#1F3A24', hw: 'witch' }
  };
  var ART_KEYS = Object.keys(ART);

  /* 耳朵：都在头圆之前画，等于压在后面。
     每片耳朵都描一道极淡的边 —— 同色的耳朵压在圆脸上才看得出形状（尤其小狗垂耳）。 */
  function artEars(kind, d) {
    var fill = d.ear === 'panda' ? d.line : d.fur;
    var O = ' stroke="rgba(20,28,48,.12)" stroke-width="1"';
    switch (kind) {
      case 'cat':
        return '<path d="M8.4 13 L11.2 3.4 L18.6 9.4 Z" fill="' + fill + '"' + O + '/>' +
               '<path d="M31.6 13 L28.8 3.4 L21.4 9.4 Z" fill="' + fill + '"' + O + '/>' +
               '<path d="M11.6 10.4 L12.7 6.6 L15.9 9.4 Z" fill="' + d.blush + '" opacity=".85"/>' +
               '<path d="M28.4 10.4 L27.3 6.6 L24.1 9.4 Z" fill="' + d.blush + '" opacity=".85"/>';
      case 'fox':
        return '<path d="M7.2 14.4 L9.4 2.8 L19.4 8.4 Z" fill="' + fill + '"' + O + '/>' +
               '<path d="M32.8 14.4 L30.6 2.8 L20.6 8.4 Z" fill="' + fill + '"' + O + '/>' +
               '<path d="M10.4 11.4 L11.6 5.8 L17.4 9.6 Z" fill="#FFFFFF" opacity=".55"/>' +
               '<path d="M29.6 11.4 L28.4 5.8 L22.6 9.6 Z" fill="#FFFFFF" opacity=".55"/>';
      case 'dog':
        return '<ellipse cx="7.4" cy="18.4" rx="4.6" ry="7.8" fill="' + fill + '"' + O + ' transform="rotate(-16 7.4 18.4)"/>' +
               '<ellipse cx="32.6" cy="18.4" rx="4.6" ry="7.8" fill="' + fill + '"' + O + ' transform="rotate(16 32.6 18.4)"/>';
      case 'rabbit':
        return '<ellipse cx="13.8" cy="7" rx="3.5" ry="8.2" fill="' + fill + '"' + O + ' transform="rotate(-9 13.8 7)"/>' +
               '<ellipse cx="26.2" cy="7" rx="3.5" ry="8.2" fill="' + fill + '"' + O + ' transform="rotate(9 26.2 7)"/>' +
               '<ellipse cx="13.8" cy="7" rx="1.5" ry="5.2" fill="' + d.blush + '" opacity=".9" transform="rotate(-9 13.8 7)"/>' +
               '<ellipse cx="26.2" cy="7" rx="1.5" ry="5.2" fill="' + d.blush + '" opacity=".9" transform="rotate(9 26.2 7)"/>';
      case 'bear':
      case 'panda':
        return '<circle cx="10.2" cy="11.8" r="5" fill="' + fill + '"' + O + '/>' +
               '<circle cx="29.8" cy="11.8" r="5" fill="' + fill + '"' + O + '/>' +
               (kind === 'panda' ? '' :
                 '<circle cx="10.2" cy="11.8" r="2.2" fill="' + d.blush + '" opacity=".8"/>' +
                 '<circle cx="29.8" cy="11.8" r="2.2" fill="' + d.blush + '" opacity=".8"/>');
      case 'pig':
        return '<path d="M9.4 12.6 L11.6 5 L17 9.8 Z" fill="' + fill + '"' + O + '/>' +
               '<path d="M30.6 12.6 L28.4 5 L23 9.8 Z" fill="' + fill + '"' + O + '/>';
      case 'koala':
        return '<ellipse cx="9.4" cy="12.6" rx="5.8" ry="6.4" fill="' + fill + '"' + O + '/>' +
               '<ellipse cx="30.6" cy="12.6" rx="5.8" ry="6.4" fill="' + fill + '"' + O + '/>' +
               '<ellipse cx="9.4" cy="12.6" rx="3" ry="3.4" fill="' + d.blush + '" opacity=".75"/>' +
               '<ellipse cx="30.6" cy="12.6" rx="3" ry="3.4" fill="' + d.blush + '" opacity=".75"/>';
      case 'frog':
        return '<circle cx="12.4" cy="10.4" r="4.8" fill="' + fill + '"' + O + '/>' +
               '<circle cx="27.6" cy="10.4" r="4.8" fill="' + fill + '"' + O + '/>' +
               '<circle cx="12.4" cy="10" r="1.8" fill="#2b3246"/>' +
               '<circle cx="27.6" cy="10" r="1.8" fill="#2b3246"/>' +
               '<circle cx="13" cy="9.3" r=".6" fill="#fff" opacity=".9"/>' +
               '<circle cx="28.2" cy="9.3" r=".6" fill="#fff" opacity=".9"/>';
      case 'chick':
        return '<path d="M18.4 9 q.4 -3.6 3.6 -4.8" fill="none" stroke="' + d.line + '" stroke-width="1.6" stroke-linecap="round"/>' +
               '<path d="M21.8 9 q1.6 -2.6 4.2 -2.6" fill="none" stroke="' + d.line + '" stroke-width="1.5" stroke-linecap="round" opacity=".7"/>';
      default:
        return '';
    }
  }

  /* 万圣节头像：6 个节日角色单独画（40×40 viewBox，深色夜色底 + 黄月亮，主题更鲜明） */
  function halloweenSvg(key) {
    var s = '<svg viewBox="0 0 40 40" class="ava-art" aria-hidden="true">';
    /* 右上角黄月亮：给暗色系角色统一挂一轮，一眼「万圣节夜晚」 */
    var moon = '<circle cx="31" cy="8" r="5.5" fill="#ffd94a"/>' +
               '<circle cx="29" cy="6.8" r="1.3" fill="#e3a400" opacity=".7"/>' +
               '<circle cx="33" cy="10" r="1" fill="#e3a400" opacity=".7"/>';
    switch (key) {
      case 'pumpkin':
        s += '<path d="M19 3 Q20 1 21 3 L21 6 L19 6 Z" fill="#9ccc3f"/>' +
             '<ellipse cx="20" cy="23" rx="15" ry="13" fill="#ff9d2e"/>' +
             '<ellipse cx="12" cy="23" rx="5.5" ry="12.5" fill="#f07b1a"/>' +
             '<ellipse cx="28" cy="23" rx="5.5" ry="12.5" fill="#f07b1a"/>' +
             '<ellipse cx="20" cy="23" rx="2.4" ry="12.5" fill="#f07b1a" opacity=".5"/>' +
             '<path d="M13 15 L18 19 L13 22 Z" fill="#3a1f04"/>' +
             '<path d="M27 15 L22 19 L27 22 Z" fill="#3a1f04"/>' +
             '<path d="M13.5 16.5 L17.5 18.5 L13.5 20.5 Z" fill="#ffe27a"/>' +
             '<path d="M26.5 16.5 L22.5 18.5 L26.5 20.5 Z" fill="#ffe27a"/>' +
             '<path d="M12 27 Q16 23 20 27 Q24 23 28 27 L28 32 L12 32 Z" fill="#3a1f04"/>';
        break;
      case 'ghost':
        s += moon +
             '<path d="M20 4 Q31 4 31 17 L31 32 Q27.5 28.5 24 32 Q20 35.5 16 32 Q12.5 28.5 9 32 L9 17 Q9 4 20 4 Z" fill="#ffffff" stroke="#cfc4ec" stroke-width="1"/>' +
             '<circle cx="16" cy="16" r="2.6" fill="#2b2440"/><circle cx="24" cy="16" r="2.6" fill="#2b2440"/>' +
             '<ellipse cx="20" cy="23" rx="3" ry="3.4" fill="#2b2440"/>';
        break;
      case 'bat':
        s += moon +
             '<path d="M20 14 Q12 7 5 8 Q2 9 4 12 Q7 15 13 14 Q17 13 20 14 Z" fill="#241d3a"/>' +
             '<path d="M20 14 Q28 7 35 8 Q38 9 36 12 Q33 15 27 14 Q23 13 20 14 Z" fill="#241d3a"/>' +
             '<path d="M13.5 13 L12 4 L18.5 9.5 Z" fill="#241d3a"/>' +
             '<path d="M26.5 13 L28 4 L21.5 9.5 Z" fill="#241d3a"/>' +
             '<circle cx="20" cy="19" r="9.5" fill="#241d3a"/>' +
             '<circle cx="17" cy="18" r="1.8" fill="#ffb82e"/><circle cx="23" cy="18" r="1.8" fill="#ffb82e"/>' +
             '<path d="M16.5 24 L17.6 26.2 L18.7 24 Z" fill="#ffffff"/>' +
             '<path d="M21.3 24 L22.4 26.2 L23.5 24 Z" fill="#ffffff"/>';
        break;
      case 'skull':
        s += '<path d="M20 3 Q31 3 31 16 Q31 26 25 31 L15 31 Q9 26 9 16 Q9 3 20 3 Z" fill="#f2f4f8" stroke="#c9d2e0" stroke-width="1"/>' +
             '<ellipse cx="15" cy="16" rx="3.6" ry="4.2" fill="#1f2430"/>' +
             '<ellipse cx="25" cy="16" rx="3.6" ry="4.2" fill="#1f2430"/>' +
             '<path d="M20 22 L18.5 25 L21.5 25 Z" fill="#1f2430"/>' +
             '<path d="M13 28 H27" stroke="#1f2430" stroke-width="1.2"/>' +
             '<path d="M15 28 V31 M18.5 28 V31 M20 28 V31 M21.5 28 V31 M25 28 V31" stroke="#1f2430" stroke-width="1" stroke-linecap="round"/>';
        break;
      case 'blackcat':
        s += moon +
             '<path d="M8.4 13 L11.2 3.4 L18.6 9.4 Z" fill="#2a2342"/>' +
             '<path d="M31.6 13 L28.8 3.4 L21.4 9.4 Z" fill="#2a2342"/>' +
             '<path d="M11.6 10.4 L12.7 6.6 L15.9 9.4 Z" fill="#7d6fb0" opacity=".7"/>' +
             '<path d="M28.4 10.4 L27.3 6.6 L24.1 9.4 Z" fill="#7d6fb0" opacity=".7"/>' +
             '<circle cx="20" cy="22.4" r="13.4" fill="#2a2342" stroke="rgba(0,0,0,.15)" stroke-width="1"/>' +
             '<circle cx="15.4" cy="21.2" r="2.4" fill="#ffc93c"/><circle cx="24.6" cy="21.2" r="2.4" fill="#ffc93c"/>' +
             '<circle cx="15.4" cy="21.2" r="1" fill="#1f1b2e"/><circle cx="24.6" cy="21.2" r="1" fill="#1f1b2e"/>' +
             '<ellipse cx="20" cy="26" rx="1.7" ry="1.3" fill="#ff9db0"/>' +
             '<path d="M17.4 28.6 q2.6 2 5.2 0" fill="none" stroke="#0f0c1c" stroke-width="1.1" stroke-linecap="round" opacity=".7"/>' +
             '<path d="M4.8 23.4 H9 M4.8 26.2 H9 M35.2 23.4 H31 M35.2 26.2 H31" stroke="#7d6fb0" stroke-width="1" stroke-linecap="round" opacity=".6"/>';
        break;
      case 'witch':
        s += moon +
             '<path d="M12 13 Q13 5 23 1.5 Q25 5 28 13 Z" fill="#241d3a"/>' +
             '<ellipse cx="20" cy="14" rx="15" ry="3.5" fill="#1b1530"/>' +
             '<path d="M6 12 Q20 16.5 34 12" stroke="#ff9d2e" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
             '<circle cx="20" cy="23" r="12.5" fill="#8fd98b" stroke="rgba(0,0,0,.15)" stroke-width="1"/>' +
             '<circle cx="15.5" cy="21" r="1.9" fill="#1f3a24"/><circle cx="24.5" cy="21" r="1.9" fill="#1f3a24"/>' +
             '<path d="M20 23 L20 28 L22 28.5" stroke="#1f3a24" stroke-width="2" fill="none" stroke-linecap="round"/>' +
             '<circle cx="22.6" cy="28.6" r="1.3" fill="#5da14a"/>' +
             '<path d="M16 30 Q20 33 24 30" fill="none" stroke="#1f3a24" stroke-width="1.3" stroke-linecap="round"/>';
        break;
    }
    return s + '</svg>';
  }

  function animalSvg(key) {
    var d = ART[key];
    if (!d) return '';
    if (d.hw) return halloweenSvg(key);
    var dark = d.ear === 'penguin' ? '#2b3246' : '#2b3246';
    var eyeFill = d.ear === 'penguin' ? '#FFFFFF' : dark;
    var s = '<svg viewBox="0 0 40 40" class="ava-art" aria-hidden="true">';
    s += artEars(d.ear, d);

    /* 头：统一一个圆，白色 / 浅色脸描一道极淡的边，不然在浅底上看不出轮廓 */
    s += '<circle cx="20" cy="22.4" r="13.4" fill="' + d.fur + '" stroke="rgba(20,28,48,.10)" stroke-width="1"/>';
    if (d.belly) s += '<ellipse cx="20" cy="24.8" rx="8.4" ry="8.6" fill="#FFFFFF"/>';

    /* 熊猫：先铺黑眼圈，再点白眼睛 */
    if (d.ear === 'panda') {
      s += '<ellipse cx="15.2" cy="21" rx="3.6" ry="4.2" fill="' + d.line + '"/>' +
           '<ellipse cx="24.8" cy="21" rx="3.6" ry="4.2" fill="' + d.line + '"/>' +
           '<circle cx="15.2" cy="21" r="1.5" fill="#FFFFFF"/>' +
           '<circle cx="24.8" cy="21" r="1.5" fill="#FFFFFF"/>';
    } else if (d.ear !== 'frog') {
      s += '<circle cx="15.4" cy="21.2" r="1.95" fill="' + eyeFill + '"/>' +
           '<circle cx="24.6" cy="21.2" r="1.95" fill="' + eyeFill + '"/>';
    }

    /* 腮红 */
    s += '<ellipse cx="11.6" cy="25.8" rx="2.7" ry="1.7" fill="' + d.blush + '" opacity=".8"/>' +
         '<ellipse cx="28.4" cy="25.8" rx="2.7" ry="1.7" fill="' + d.blush + '" opacity=".8"/>';

    /* 鼻子 / 嘴 */
    if (d.snout) {
      s += '<ellipse cx="20" cy="25.6" rx="4.3" ry="3.2" fill="' + d.blush + '"/>' +
           '<circle cx="18.5" cy="25.4" r=".7" fill="' + d.line + '"/>' +
           '<circle cx="21.5" cy="25.4" r=".7" fill="' + d.line + '"/>';
    } else if (!d.belly) {
      s += '<ellipse cx="20" cy="25.8" rx="1.8" ry="1.4" fill="' + d.line + '" opacity=".9"/>';
    }

    if (d.belly) {
      /* 企鹅：橙色小尖嘴（没有这个就是一团黑） */
      s += '<path d="M20 24.6 L17.8 26.4 L20 28.2 L22.2 26.4 Z" fill="#F5A63C"/>';
    } else if (d.ear === 'chick') {
      s += '<path d="M20 27.6 L23.4 29.2 L20 30.6 Z" fill="#F2A03D"/>';
    } else {
      s += '<path d="M17.4 28.2 q2.6 2.2 5.2 0" fill="none" stroke="' + d.line +
           '" stroke-width="1.15" stroke-linecap="round" opacity=".7"/>';
    }
    if (d.tongue) {
      s += '<path d="M18.8 29.2 q1.2 2.4 2.4 0 z" fill="#F58AA2"/>';
    }
    if (d.whisker) {
      s += '<path d="M4.8 23.4 H9 M4.8 26.2 H9 M35.2 23.4 H31 M35.2 26.2 H31" stroke="' +
           d.line + '" stroke-width="1" stroke-linecap="round" opacity=".45"/>';
    }
    if (d.stripe) {
      s += '<path d="M20 10.4 v3 M16.4 12 L18 14.6 M23.6 12 L22 14.6" stroke="' +
           d.line + '" stroke-width="1.5" stroke-linecap="round" opacity=".65"/>';
    }
    return s + '</svg>';
  }

  /* 头像：传了动物 key 就画小动物，没传还是原来那颗「颜色 + 姓氏首字」 */
  function avatar(name, color, size, animal) {
    var d = animal && ART[animal];
    if (d) {
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
    while (modalStack.length) {
      var m = modalStack.pop();
      if (m && m.parentNode) m.remove();
    }
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
    ANIMALS: ART,          /* { key: { name, bg, fur … } }，团队页头像选择器按这个铺 */
    ANIMAL_KEYS: ART_KEYS,
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

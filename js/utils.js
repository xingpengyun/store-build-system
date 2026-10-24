/* ==========================================================
   utils.js — 日期、格式化、DOM 小工具
   ========================================================== */
window.Utils = (function () {
  'use strict';

  var DAY = 86400000;

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* '2026-07-01' -> Date（本地时区，避免 UTC 偏移） */
  function parseDate(iso) {
    if (!iso) return null;
    var p = String(iso).slice(0, 10).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function dateToISO(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function today() { return dateToISO(new Date()); }

  function addDays(iso, n) {
    var d = parseDate(iso);
    if (!d) return '';
    d.setDate(d.getDate() + n);
    return dateToISO(d);
  }

  /* b - a，单位天 */
  function diffDays(a, b) {
    var da = parseDate(a), db = parseDate(b);
    if (!da || !db) return 0;
    return Math.round((db - da) / DAY);
  }

  function monthDay(iso) {
    var d = parseDate(iso);
    if (!d) return '';
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function cnDate(iso) {
    var d = parseDate(iso);
    if (!d) return '';
    return d.getFullYear() + '年' + pad2(d.getMonth() + 1) + '月' + pad2(d.getDate()) + '日';
  }

  function dateDot(iso) {
    var d = parseDate(iso);
    if (!d) return '';
    return (d.getMonth() + 1) + '.' + d.getDate();
  }

  /* ---------------- 宽松日期解析（到货时间手动输入用） ----------------
     这些写法都能认出来：
       10/25   10-25   10.25   10月25   10月25日   1025
       2026/10/25   2026-10-25   2026.10.25   20261025   26/10/25（两位年）
     不带年份 → 补当年；算出来比今天早超过半年（1 月录入 10/25 这种）
     → 自动当明年的。认不出来返回 ''，让调用方提示，绝不瞎猜。 */
  function parseDateLoose(str) {
    var s = String(str == null ? '' : str).trim();
    if (!s) return '';
    s = s.replace(/年/g, '-').replace(/月/g, '-').replace(/日|号/g, '')
         .replace(/／/g, '/').replace(/。/g, '.');

    var y = null, m = 0, d = 0, hadYear = false, mm;
    if ((mm = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/))) {
      y = +mm[1]; m = +mm[2]; d = +mm[3]; hadYear = true;
    } else if ((mm = s.match(/^(\d{2})[-\/.](\d{1,2})[-\/.](\d{1,2})$/))) {
      y = 2000 + +mm[1]; m = +mm[2]; d = +mm[3]; hadYear = true;
    } else if ((mm = s.match(/^(\d{1,2})[-\/.](\d{1,2})$/))) {
      m = +mm[1]; d = +mm[2];
    } else if ((mm = s.match(/^(\d{4})$/))) {
      m = Math.floor(+mm[1] / 100); d = +mm[1] % 100;
    } else if ((mm = s.match(/^(\d{8})$/))) {
      y = +mm[1].slice(0, 4); m = +mm[1].slice(4, 6); d = +mm[1].slice(6, 8); hadYear = true;
    } else {
      return '';
    }

    if (m < 1 || m > 12 || d < 1 || d > 31) return '';
    if (!hadYear) y = new Date().getFullYear();
    var probe = new Date(y, m - 1, d);
    if (probe.getMonth() !== m - 1 || probe.getDate() !== d) return '';   /* 2/30 这类 */

    var iso = y + '-' + pad2(m) + '-' + pad2(d);
    if (!hadYear && diffDays(today(), iso) < -180) iso = (y + 1) + '-' + pad2(m) + '-' + pad2(d);
    return iso;
  }

  var WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  function weekdayCn(iso) {
    var d = parseDate(iso);
    return d ? WEEK[d.getDay()] : '';
  }

  /* ---------------- 相对时间（留言板用） ----------------
     刚刚 / 12 分钟前 / 3 小时前 / 今天 14:20 / 昨天 18:20 / 10月20日 14:20 / 2025年… */
  function timeAgo(iso) {
    var d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return '';
    var now = new Date();
    var sec = (now.getTime() - d.getTime()) / 1000;
    if (sec < 0) sec = 0;
    if (sec < 60) return '刚刚';
    if (sec < 3600) return Math.floor(sec / 60) + ' 分钟前';
    if (sec < 21600 && d.toDateString() === now.toDateString()) return Math.floor(sec / 3600) + ' 小时前';

    var hm = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    if (d.toDateString() === now.toDateString()) return '今天 ' + hm;
    var yes = new Date(now.getTime() - 86400000);
    if (d.toDateString() === yes.toDateString()) return '昨天 ' + hm;
    if (d.getFullYear() === now.getFullYear()) return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hm;
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function greeting() {
    var h = new Date().getHours();
    if (h < 5) return '凌晨好';
    if (h < 8) return '早上好';
    if (h < 11) return '上午好';
    if (h < 13) return '中午好';
    if (h < 18) return '下午好';
    return '晚上好';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  var seq = 0;
  function uid(prefix) {
    seq += 1;
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + seq.toString(36);
  }

  function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

  function pct(part, total, digits) {
    if (!total) return '0%';
    var v = part / total * 100;
    return (digits === 0 ? Math.round(v) : Number(v.toFixed(1))) + '%';
  }

  function num(n) {
    if (n == null || isNaN(n)) return '0';
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function sum(arr, fn) {
    return arr.reduce(function (a, b) { return a + (fn ? fn(b) : b); }, 0);
  }

  function debounce(fn, wait) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, wait || 220);
    };
  }

  function sortBy(arr, fn, desc) {
    return arr.slice().sort(function (a, b) {
      var va = fn(a), vb = fn(b);
      if (va < vb) return desc ? 1 : -1;
      if (va > vb) return desc ? -1 : 1;
      return 0;
    });
  }

  function bytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }

  return {
    DAY: DAY,
    pad2: pad2,
    parseDate: parseDate,
    toISO: dateToISO,
    today: today,
    addDays: addDays,
    diffDays: diffDays,
    monthDay: monthDay,
    cnDate: cnDate,
    dateDot: dateDot,
    parseDateLoose: parseDateLoose,
    weekdayCn: weekdayCn,
    timeAgo: timeAgo,
    greeting: greeting,
    esc: esc,
    uid: uid,
    clamp: clamp,
    pct: pct,
    num: num,
    sum: sum,
    debounce: debounce,
    sortBy: sortBy,
    bytes: bytes
  };
})();

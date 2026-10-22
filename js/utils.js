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

  var WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  function weekdayCn(iso) {
    var d = parseDate(iso);
    return d ? WEEK[d.getDay()] : '';
  }

  function greeting() {
    var h = new Date().getHours();
    if (h < 6) return '凌晨好';
    if (h < 11) return '早上好';
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
    weekdayCn: weekdayCn,
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

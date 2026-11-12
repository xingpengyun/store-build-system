/* ==========================================================
   util.js — 通用工具（核对模块专用）
   ----------------------------------------------------------
   这里只放「纯函数」，不碰 DOM 结构、不碰存储。
   重点在三个解析函数，它们是整个核对的地基：
     parseMoney()  从「¥1,234.50 元」「(300)」这类文本里取出数字
     parseDate()   从 Date / Excel 序列号 / 各种中文日期写法里取出 YYYY-MM-DD
     normText()    名称规范化（去空格符号、全角转半角）
   解析不出来一律返回 null，绝不猜 —— 猜错比解析失败危险得多。
   ========================================================== */
window.CKUtil = (function () {
  'use strict';

  /* ---------- DOM ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* HTML 转义。门店名、Sheet 名、文件名全来自用户上传的文件，
     里面完全可能出现 <script> 之类的东西，所有插值必须过这里。 */
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ---------- 数字 ---------- */
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (v === null || v === undefined) return null;
    var s = String(v).trim();
    if (!s) return null;
    var n = Number(s.replace(/,/g, ''));
    return isFinite(n) ? n : null;
  }

  /* 金额解析：容忍货币符号、千分位、中文单位、括号负数、全角符号 */
  function parseMoney(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return null;

    var s = String(v);
    if (!s.trim()) return null;

    /* 全角数字 / 符号转半角 */
    s = s.replace(/[\uFF01-\uFF5E]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
    }).replace(/\u3000/g, ' ');

    var neg = false;
    /* 会计写法 (1,234.00) 表示负数 */
    if (/^\(.*\)$/.test(s.trim())) { neg = true; s = s.trim().slice(1, -1); }
    /* 尾部负号 或 前置负号 */
    if (/-\s*$/.test(s)) { neg = true; s = s.replace(/-\s*$/, ''); }

    /* 去掉货币符号、单位、千分位、空白 */
    s = s.replace(/[¥￥$€£,\s]/g, '')
         .replace(/元|人民币|RMB|CNY/gi, '');

    if (!s) return null;
    /* 只接受纯数字（允许一个小数点、允许前置负号） */
    if (!/^-?\d*\.?\d+$/.test(s)) return null;

    var n = Number(s);
    if (!isFinite(n)) return null;
    return neg ? -Math.abs(n) : n;
  }

  function fmtMoney(n, digits) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    var d = digits === undefined ? 2 : digits;
    var s = Math.abs(n).toFixed(d);
    var parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (n < 0 ? '-' : '') + parts.join('.');
  }

  /* 门槛金额：整数不拖 .00（16000 比 16,000.00 好读），有小数才保留两位 */
  function fmtThreshold(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    return fmtMoney(n, Math.abs(n % 1) < 1e-9 ? 0 : 2);
  }

  function fmtInt(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /* 带正负号的差额，0 显示 0.00 而不是 +0.00 */
  function fmtDiff(n, digits) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    if (Math.abs(n) < 0.005) return fmtMoney(0, digits);
    return (n > 0 ? '+' : '-') + fmtMoney(Math.abs(n), digits);
  }

  /* ---------- 日期 ---------- */
  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  function ymd(y, m, d) {
    if (!y || !m || !d) return null;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return y + '-' + pad2(m) + '-' + pad2(d);
  }

  /* Excel 序列号 → 日期（1900 历法，含那个著名的 1900-02-29 bug） */
  function fromSerial(n) {
    if (!isFinite(n) || n < 1 || n > 2958465) return null;
    /* 25569 = 1970-01-01 的 Excel 序列号 */
    var ms = Math.round((n - 25569) * 86400 * 1000);
    var d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }

  var NOW_YEAR = new Date().getFullYear();

  /* 统一成 YYYY-MM-DD，用于比较；识别不出返回 null */
  function parseDate(v) {
    if (v === null || v === undefined || v === '') return null;

    if (v instanceof Date) {
      if (isNaN(v.getTime())) return null;
      return ymd(v.getFullYear(), v.getMonth() + 1, v.getDate());
    }

    /* 纯数字：可能是 Excel 序列号，也可能是 20261001 这种日期数字 */
    if (typeof v === 'number') {
      if (!isFinite(v)) return null;
      if (v > 19000101 && v < 21001232) {
        var sv = String(Math.round(v));
        return ymd(+sv.slice(0, 4), +sv.slice(4, 6), +sv.slice(6, 8));
      }
      if (v >= 1 && v <= 80000) return fromSerial(v);
      return null;
    }

    var s = String(v).trim();
    if (!s || s.length > 40) return null;
    s = s.replace(/[\uFF01-\uFF5E]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
    }).replace(/\u3000/g, ' ');

    var m;
    /* 2026-10-01 / 2026/10/1 / 2026.10.1 / 2026年10月1日 */
    m = s.match(/^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?/);
    if (m) return ymd(+m[1], +m[2], +m[3]);

    /* 20261001 */
    m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) return ymd(+m[1], +m[2], +m[3]);

    /* 10月1日 / 10-01 / 10/1（无年份，按今年补） */
    m = s.match(/^(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?\s*$/);
    if (m) return ymd(NOW_YEAR, +m[1], +m[2]);

    /* 2026-10 / 2026年10月（月份级，按 1 号处理，标记为月级） */
    m = s.match(/^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*月?\s*$/);
    if (m) return ymd(+m[1], +m[2], 1);

    /* 带时间的完整写法 2026-10-01 12:30:00 已在第一条覆盖（前缀匹配） */
    return null;
  }

  /* 日期是否「月份级」（只有年月没有日），用于核对时放宽比较 */
  function isMonthOnly(v) {
    if (typeof v !== 'string') return false;
    var s = v.trim();
    return /^\d{4}\s*[-/.年]\s*\d{1,2}\s*月?$/.test(s);
  }

  function todayStr() {
    var d = new Date();
    return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  function fmtDateTime(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '—';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  /* 相对时间：今天 14:32 / 昨天 / 3 天前 */
  function fmtRelTime(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '—';
    var now = new Date();
    var sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return '今天 ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    var y = new Date(now.getTime() - 86400000);
    if (d.toDateString() === y.toDateString()) return '昨天 ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    var diff = Math.floor((now - d) / 86400000);
    if (diff > 0 && diff < 30) return diff + ' 天前';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /* ---------- 文本 ---------- */
  function normText(s) {
    if (s === null || s === undefined) return '';
    var t = String(s);
    /* 全角转半角 */
    t = t.replace(/[\uFF01-\uFF5E]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
    });
    t = t.replace(/\u3000/g, ' ');
    /* 去掉所有空白 */
    t = t.replace(/\s+/g, '');
    return t.trim();
  }

  function truncate(s, n) {
    s = String(s === null || s === undefined ? '' : s);
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  /* ---------- 杂项 ---------- */
  var idSeq = 0;
  function uid(prefix) {
    idSeq += 1;
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + idSeq.toString(36);
  }

  function debounce(fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      if (t) clearTimeout(t);
      t = setTimeout(function () { t = null; fn.apply(self, args); }, ms || 200);
    };
  }

  function clone(o) {
    if (o === null || typeof o !== 'object') return o;
    if (o instanceof Date) return new Date(o.getTime());
    return JSON.parse(JSON.stringify(o));
  }

  function bytes(n) {
    if (!n) return '0 B';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 800);
  }

  /* 深比较两个值在业务上是否「一样」（金额按时分位容差） */
  function sameMoney(a, b, tol) {
    if (a === null || a === undefined || b === null || b === undefined) return false;
    return Math.abs(a - b) <= (tol === undefined ? 0.005 : tol) + 1e-9;
  }

  return {
    $: $, $$: $$, esc: esc,
    num: num, parseMoney: parseMoney, fmtMoney: fmtMoney, fmtThreshold: fmtThreshold, fmtInt: fmtInt, fmtDiff: fmtDiff,
    sameMoney: sameMoney,
    parseDate: parseDate, isMonthOnly: isMonthOnly, todayStr: todayStr,
    fmtDateTime: fmtDateTime, fmtRelTime: fmtRelTime,
    normText: normText, truncate: truncate,
    uid: uid, debounce: debounce, clone: clone, bytes: bytes,
    downloadBlob: downloadBlob
  };
})();

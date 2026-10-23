/* ==========================================================
   charts.js — 纯 SVG / CSS 图表，不依赖任何外部库
   ========================================================== */
window.Charts = (function () {
  'use strict';

  /* ---------- 环形图 ---------- */
  function donut(items, opts) {
    opts = opts || {};
    var size = opts.size || 132;
    var cx = size / 2;
    var cy = size / 2;
    var sw = size * 0.135;
    var r = size / 2 - sw / 2 - 2;
    var circ = 2 * Math.PI * r;
    var total = 0;
    items.forEach(function (it) { total += it.value; });
    if (total <= 0) total = 1;

    var gap = items.length > 1 ? 3 : 0;
    var offset = 0;
    var segs = '';

    items.forEach(function (it) {
      if (it.value <= 0) return;
      var len = it.value / total * circ;
      var draw = Math.max(len - gap, 1);
      segs += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r.toFixed(2) + '"' +
        ' fill="none" stroke="' + it.color + '" stroke-width="' + sw.toFixed(2) + '"' +
        ' stroke-dasharray="' + draw.toFixed(2) + ' ' + (circ - draw).toFixed(2) + '"' +
        ' stroke-dashoffset="' + (-offset).toFixed(2) + '"' +
        ' transform="rotate(-90 ' + cx + ' ' + cy + ')"' +
        ' style="transition:stroke-dasharray .5s">' +
        (it.name ? '<title>' + it.name + '：' + it.value + '</title>' : '') +
        '</circle>';
      offset += len;
    });

    return '<div class="donut-box">' +
      '<svg viewBox="0 0 ' + size + ' ' + size + '">' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="' + r.toFixed(2) + '" fill="none" stroke="#f1f4fa" stroke-width="' + sw.toFixed(2) + '"/>' +
        segs +
      '</svg>' +
      '<div class="donut-center">' +
        '<small>' + (opts.centerLabel || '总计') + '</small>' +
        '<b>' + (opts.centerValue != null ? opts.centerValue : total) + '</b>' +
      '</div>' +
    '</div>';
  }

  /* ---------- 柱状图 ---------- */
  function bars(trend, opts) {
    opts = opts || {};
    var max = 1;
    trend.forEach(function (t) { if (t.count > max) max = t.count; });

    var cols = trend.map(function (t) {
      var h = Math.max(4, Math.round(t.count / max * 100));
      var peak = t.count === max && max > 1;
      return '<div class="bar-col' + (peak ? ' is-peak' : '') + '">' +
        '<span class="bar-val">' + t.count + '</span>' +
        '<i class="bar-fill" style="height:' + h + '%"></i>' +
      '</div>';
    }).join('');

    var ticks = trend.map(function (t) {
      return '<span>' + t.label + '</span>';
    }).join('');

    return '<div class="bars">' + cols + '</div><div class="bar-ticks">' + ticks + '</div>';
  }

  /* ---------- 阶段堆叠条 ---------- */
  /* opts.clickable = true 时，每段带 data-stage / data-count，可点击筛选 */
  function stackBar(items, opts) {
    opts = opts || {};
    var total = 0;
    items.forEach(function (i) { total += i.count; });
    if (total <= 0) return '<div class="stage-bar"></div>';

    var segs = items.filter(function (i) { return i.count > 0; }).map(function (i) {
      var attr = opts.clickable
        ? ' class="seg' + (opts.active === i.key ? ' on' : '') + '" data-stage="' + i.key + '"'
        : '';
      return '<i style="width:' + (i.count / total * 100).toFixed(2) + '%;background:' + i.color + '"' +
        attr +
        ' title="' + i.key + ' ' + i.count + ' 家"></i>';
    }).join('');

    return '<div class="stage-bar">' + segs + '</div>';
  }

  /* ---------- 水平进度条列表 ---------- */
  function statRows(items) {
    var max = 1;
    items.forEach(function (i) { if (i.value > max) max = i.value; });

    return items.map(function (i) {
      return '<div class="stat-row">' +
        '<span class="sr-name">' + i.name + '</span>' +
        '<span class="sr-track"><i style="width:' + (i.value / max * 100).toFixed(1) + '%;background:' + (i.color || '#3f6bf5') + '"></i></span>' +
        '<span class="sr-val">' + i.value + '</span>' +
      '</div>';
    }).join('');
  }

  return { donut: donut, bars: bars, stackBar: stackBar, statRows: statRows };
})();

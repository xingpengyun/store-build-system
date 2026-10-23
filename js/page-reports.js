/* ==========================================================
   page-reports.js — 数据报表
   ========================================================== */
window.Pages = window.Pages || {};

window.Pages.reports = (function () {
  'use strict';

  var U = window.Utils;
  var S = window.Store;
  var C = window.CONST;

  function render() {
    var st = S.stats();
    var s = S.getState();
    var tc = st.taskCounts;

    var doneRate = tc.total ? Math.round(tc.done / tc.total * 100) : 0;
    /* 平均进度：每家的百分比都来自「阶段时间线」（完成几个阶段 / 筹建阶段总数） */
    var avgProgress = s.stores.length
      ? Math.round(U.sum(s.stores, function (x) { return S.storeProgress(x).pct; }) / s.stores.length)
      : 0;

    /* 阶段分布 */
    var stageRows = Charts.statRows(st.stageCounts.map(function (x) {
      return { name: x.key, value: x.count, color: x.color };
    }));

    /* 风险分布 */
    var riskRows = Charts.statRows(Object.keys(C.RISKS).map(function (k) {
      var r = C.RISKS[k];
      return {
        name: r.label,
        value: s.stores.filter(function (x) { return x.risk === k; }).length,
        color: r.color
      };
    }));

    /* 成员负荷 */
    var teamRows = Charts.statRows(st.team.map(function (m) {
      return { name: m.name, value: m.todo, color: m.color };
    }));

    /* 开业排期（按月份） */
    var monthMap = {};
    s.stores.forEach(function (x) {
      if (x.stage === '已开业') return;
      var ym = x.openDate.slice(0, 7);
      monthMap[ym] = (monthMap[ym] || 0) + 1;
    });
    var months = Object.keys(monthMap).sort();
    var monthRows = months.length
      ? Charts.statRows(months.map(function (ym) {
          return { name: ym.replace('-', '年') + '月', value: monthMap[ym], color: '#3f6bf5' };
        }))
      : UI.empty('暂无排期');

    /* 任务状态环形 */
    var donutItems = [
      { name: '已完成', value: tc.done, color: '#17b26a' },
      { name: '进行中', value: tc.doing, color: '#3f6bf5' },
      { name: '待处理', value: tc.pending, color: '#98a2b8' },
      { name: '逾期', value: tc.overdue, color: '#f04438' },
      { name: '风险', value: tc.risk, color: '#f79009' }
    ];
    var donutLegend = donutItems.map(function (d) {
      return '<div class="dl-row"><i class="dl-dot" style="background:' + d.color + '"></i>' +
        '<span class="dl-name">' + d.name + '</span>' +
        '<span class="dl-val">' + d.value + '</span></div>';
    }).join('');

    /* 按省份分布 */
    var provMap = {};
    s.stores.forEach(function (x) {
      var p = x.province || '未填写';
      provMap[p] = (provMap[p] || 0) + 1;
    });
    var provRows = Charts.statRows(Object.keys(provMap).map(function (p) {
      return { name: p, value: provMap[p], color: '#7a5af8' };
    }).sort(function (a, b) { return b.value - a.value; }));

    return '' +
    '<div class="page-head fade-up">' +
      '<div>' +
        '<h1>数据报表</h1>' +
        '<p>数据实时计算，统计范围为本机保存的全部记录</p>' +
      '</div>' +
      '<button class="btn" data-act="export">' + UI.icon('download') + '导出数据</button>' +
    '</div>' +

    '<section class="kpi-grid fade-up" style="grid-template-columns:repeat(4,minmax(0,1fr));animation-delay:.04s">' +
      '<div class="kpi"><span class="kpi-icon" style="background:#edf2fe;color:#3f6bf5">' + UI.icon('box') + '</span>' +
        '<div class="kpi-body"><div class="kpi-label">门店总数</div><div class="kpi-value">' + st.totalStores + '</div>' +
        '<div class="kpi-foot">已开业 ' + st.opened + ' 家</div></div></div>' +
      '<div class="kpi"><span class="kpi-icon" style="background:#e6f8ef;color:#17b26a">' + UI.icon('target') + '</span>' +
        '<div class="kpi-body"><div class="kpi-label">平均进度</div><div class="kpi-value">' + avgProgress + '%</div>' +
        '<div class="kpi-foot">按阶段时间线推进计算</div></div></div>' +
      '<div class="kpi"><span class="kpi-icon" style="background:#f2effe;color:#7a5af8">' + UI.icon('list') + '</span>' +
        '<div class="kpi-body"><div class="kpi-label">任务完成率</div><div class="kpi-value">' + doneRate + '%</div>' +
        '<div class="kpi-foot">' + tc.done + ' / ' + tc.total + '</div></div></div>' +
      '<div class="kpi"><span class="kpi-icon" style="background:#feeceb;color:#f04438">' + UI.icon('alert') + '</span>' +
        '<div class="kpi-body"><div class="kpi-label">风险门店</div><div class="kpi-value">' + st.riskStores + '</div>' +
        '<div class="kpi-foot">高危 + 逾期</div></div></div>' +
    '</section>' +

    '<section class="home-grid-2 fade-up" style="animation-delay:.07s">' +
      '<div class="card">' +
        '<div class="card-head"><h3>各阶段门店分布</h3><span class="card-sub">共 ' + st.totalStores + ' 家</span></div>' +
        stageRows +
        '<div class="section-title">任务状态分布</div>' +
        '<div class="donut-wrap">' +
          Charts.donut(donutItems, { size: 132, centerLabel: '总任务', centerValue: tc.total }) +
          '<div class="donut-legend">' + donutLegend + '</div>' +
        '</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-head"><h3>近 7 天到货趋势</h3></div>' +
        Charts.bars(st.trend) +
        '<div class="section-title">风险等级分布</div>' +
        riskRows +
      '</div>' +
    '</section>' +

    '<section class="home-grid-2 fade-up" style="animation-delay:.1s">' +
      '<div class="card">' +
        '<div class="card-head"><h3>成员待办负荷</h3><span class="card-sub">未完成任务数</span></div>' +
        teamRows +
      '</div>' +
      '<div class="card">' +
        '<div class="card-head"><h3>开业排期</h3><span class="card-sub">按计划开业月份</span></div>' +
        monthRows +
        '<div class="section-title">省份分布</div>' +
        provRows +
      '</div>' +
    '</section>';
  }

  function mount(root) {
    root.addEventListener('click', function (e) {
      var el = e.target.closest('[data-act]');
      if (el && el.getAttribute('data-act') === 'export') {
        S.downloadJSON();
        UI.toast('数据已导出', 'success');
      }
    });
  }

  return { title: '数据报表', render: render, mount: mount };
})();

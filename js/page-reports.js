/* ==========================================================
   page-reports.js — 数据报表
   2026-10-24：按用户要求调整——
   · 新增「当月开店数量 + 与上月环比」
   · 「近 7 天到货量」整块去掉（用户说不需要了）
   · 省份门店分布独立成卡
   ========================================================== */
window.Pages = window.Pages || {};

window.Pages.reports = (function () {
  'use strict';

  var U = window.Utils;
  var S = window.Store;
  var C = window.CONST;

  /* 'YYYY-MM' 往前/后挪 N 个月 */
  function ymShift(ym, delta) {
    var y = Number(ym.slice(0, 4));
    var m = Number(ym.slice(5, 7)) - 1 + delta;
    var d = new Date(y, m, 1);
    return d.getFullYear() + '-' + U.pad2(d.getMonth() + 1);
  }

  function render() {
    var st = S.stats();
    var s = S.getState();
    var tc = st.taskCounts;

    var doneRate = tc.total ? Math.round(tc.done / tc.total * 100) : 0;
    /* 平均进度：每家门店自己的「已完成任务 / 任务总计」，再对这些百分比取平均。
       还没派任务的门店没有分母，不拉进来（否则一堆 0% 会把平均拉得很低）。 */
    var withTasks = s.stores.filter(function (x) { return S.taskProgress(x).total > 0; });
    var avgProgress = withTasks.length
      ? Math.round(U.sum(withTasks, function (x) { return S.taskProgress(x).pct; }) / withTasks.length)
      : 0;
    var avgFoot = withTasks.length === s.stores.length
      ? '按全部门店任务完成率平均'
      : (withTasks.length ? '按 ' + withTasks.length + '/' + s.stores.length + ' 家有任务门店平均' : '还没有任务数据');

    /* ---------- 当月开店 + 环比（按计划开业日） ---------- */
    var t0 = U.today();
    var ymNow = t0.slice(0, 7);
    var ymLast = ymShift(ymNow, -1);
    function openIn(ym) {
      return s.stores.filter(function (x) {
        return x.openDate && x.openDate.slice(0, 7) === ym;
      }).length;
    }
    var curOpen = openIn(ymNow);
    var lastOpen = openIn(ymLast);
    /* 环比：上月为 0 时不说百分比，说人话 */
    var momPct = lastOpen ? Math.round((curOpen - lastOpen) / lastOpen * 100) : 0;
    var momCls, momTxt, momFoot;
    if (!lastOpen && curOpen) {
      momCls = 'is-up';
      momTxt = '新增 ' + curOpen + ' 家';
      momFoot = '上月 0 家 · 本月新增 ' + curOpen + ' 家';
    } else if (!lastOpen && !curOpen) {
      momCls = 'is-flat';
      momTxt = '都还没安排';
      momFoot = '近两个月都没排开业';
    } else {
      momCls = momPct > 0 ? 'is-up' : (momPct < 0 ? 'is-down' : 'is-flat');
      momTxt = '环比 ' + (momPct > 0 ? '+' : '') + momPct + '%';
      momFoot = '上月 ' + lastOpen + ' 家 · 环比 ' + (momPct > 0 ? '+' : '') + momPct + '%';
    }

    /* 近 6 个月开店数（含当月），给环比一个上下文 */
    var trend6 = [];
    for (var i = 5; i >= 0; i--) {
      var ym = ymShift(ymNow, -i);
      trend6.push({ label: Number(ym.slice(5, 7)) + '月', count: openIn(ym) });
    }

    /* 阶段分布 */
    var stageRows = Charts.statRows(st.stageCounts.map(function (x) {
      return { name: x.key, value: x.count, color: x.color };
    }), { empty: '还没有门店，先去「门店管理」建一家' });

    /* 风险分布 */
    var riskRows = Charts.statRows(Object.keys(C.RISKS).map(function (k) {
      var r = C.RISKS[k];
      return {
        name: r.label,
        value: s.stores.filter(function (x) { return x.risk === k; }).length,
        color: r.color
      };
    }), { empty: '没有风险门店，状态健康' });

    /* 成员负荷 */
    var teamRows = Charts.statRows(st.team.map(function (m) {
      return { name: m.name, value: m.todo, color: m.color };
    }), { empty: '还没有成员待办' });

    /* 开业排期（按月份） */
    var monthMap = {};
    s.stores.forEach(function (x) {
      if (x.stage === '已开业') return;
      var ym2 = x.openDate.slice(0, 7);
      monthMap[ym2] = (monthMap[ym2] || 0) + 1;
    });
    var months = Object.keys(monthMap).sort();
    var monthRows = months.length
      ? Charts.statRows(months.map(function (ym2) {
          return { name: ym2.replace('-', '年') + '月', value: monthMap[ym2], color: '#3f6bf5' };
        }))
      : UI.empty('暂无排期');

    /* 按省份分布：多色调色板轮着用，不再一整片单色 */
    var PALETTE = ['#3f6bf5', '#17b26a', '#f79009', '#7a5af8', '#0ba5ec', '#e11d48', '#12b59b', '#8b5cf6'];
    var provMap = {};
    s.stores.forEach(function (x) {
      var p = x.province || '未填写';
      provMap[p] = (provMap[p] || 0) + 1;
    });
    var provRows = Charts.statRows(Object.keys(provMap).sort(function (a, b) {
      return provMap[b] - provMap[a];
    }).map(function (p, i) {
      return { name: p, value: provMap[p], color: PALETTE[i % PALETTE.length] };
    }), { empty: '还没有门店，建一家就会出现在这里' });

    return '' +
    '<div class="page-head fade-up">' +
      '<div>' +
        '<h1>数据报表</h1>' +
        '<p>数据实时统计 · 覆盖云端全部门店与任务</p>' +
      '</div>' +
      '<button class="btn" data-act="export">' + UI.icon('download') + '导出数据</button>' +
    '</div>' +

    '<section class="kpi-grid fade-up" style="grid-template-columns:repeat(5,minmax(0,1fr));animation-delay:.04s">' +
      '<div class="kpi"><span class="kpi-icon" style="background:#edf2fe;color:#3f6bf5">' + UI.icon('box') + '</span>' +
        '<div class="kpi-body"><div class="kpi-label">门店总数</div><div class="kpi-value">' + st.totalStores + '</div>' +
        '<div class="kpi-foot">已开业 ' + st.opened + ' 家</div></div></div>' +
      '<div class="kpi"><span class="kpi-icon" style="background:#e6f8ef;color:#17b26a">' + UI.icon('flag') + '</span>' +
        '<div class="kpi-body"><div class="kpi-label">当月开店</div><div class="kpi-value">' + curOpen + '</div>' +
        '<div class="kpi-foot">' + momFoot + '</div></div></div>' +
      '<div class="kpi"><span class="kpi-icon" style="background:#e6f8ef;color:#17b26a">' + UI.icon('target') + '</span>' +
        '<div class="kpi-body"><div class="kpi-label">平均进度</div><div class="kpi-value">' + avgProgress + '%</div>' +
        '<div class="kpi-foot">' + avgFoot + '</div></div></div>' +
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
        '<div class="card-overview">' +
          Charts.stackBar(st.stageCounts.map(function (x) {
            return { key: x.key, count: x.count, color: x.color };
          })) +
        '</div>' +
        stageRows +
      '</div>' +
      '<div class="card">' +
        '<div class="card-head"><h3>省份门店分布</h3><span class="card-sub">共 ' + st.totalStores + ' 家</span></div>' +
        /* 省份可能几十个：卡片里限高滚动，别把整页拉成一条长条
           （2026-10-25 用户要求「不要太长，设置滚动条」） */
        '<div class="card-scroll" tabindex="0" aria-label="省份门店分布，可上下滚动">' + provRows + '</div>' +
      '</div>' +
    '</section>' +

    '<section class="home-grid-2 fade-up" style="animation-delay:.1s">' +
      '<div class="card">' +
        '<div class="card-head"><h3>当月开店与环比</h3><span class="card-sub">按计划开业日</span></div>' +
        '<div class="open-cmp">' +
          '<div class="oc-item is-cur"><div class="oc-num">' + curOpen + '</div>' +
            '<div class="oc-lab">本月 · ' + Number(ymNow.slice(5, 7)) + '月</div></div>' +
          '<div class="oc-item"><div class="oc-num">' + lastOpen + '</div>' +
            '<div class="oc-lab">上月 · ' + Number(ymLast.slice(5, 7)) + '月</div></div>' +
          '<div class="oc-mom ' + momCls + '">环比 ' + momTxt + '</div>' +
        '</div>' +
        '<div class="section-title">近 6 个月开店数</div>' +
        Charts.bars(trend6, { empty: '近 6 个月暂无开店安排' }) +
      '</div>' +
      '<div class="card">' +
        '<div class="card-head"><h3>开业排期</h3><span class="card-sub">按计划开业月份</span></div>' +
        monthRows +
      '</div>' +
    '</section>' +

    '<section class="home-grid-2 fade-up" style="animation-delay:.13s">' +
      '<div class="card">' +
        '<div class="card-head"><h3>成员待办负荷</h3><span class="card-sub">未完成任务数</span></div>' +
        teamRows +
      '</div>' +
      '<div class="card">' +
        '<div class="card-head"><h3>风险等级分布</h3><span class="card-sub">全部门店</span></div>' +
        riskRows +
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

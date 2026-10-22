/* ==========================================================
   page-home.js — 首页
   ========================================================== */
window.Pages = window.Pages || {};

window.Pages.home = (function () {
  'use strict';

  var U = window.Utils;
  var S = window.Store;
  var C = window.CONST;

  function heroArt() {
    return '<div class="hero-art"><svg viewBox="0 0 148 78" fill="none">' +
      '<ellipse cx="74" cy="71" rx="54" ry="5" fill="#d9e2f5" opacity=".75"/>' +
      '<rect x="47" y="34" width="54" height="34" rx="3" fill="#ffffff" stroke="#cbd8ef"/>' +
      '<path d="M41 36l33-21 33 21z" fill="#7d9df0"/>' +
      '<path d="M41 36h66l-4 6H45z" fill="#5b81e8"/>' +
      '<rect x="56" y="48" width="14" height="20" rx="2" fill="#e4edfd" stroke="#c3d4f2"/>' +
      '<rect x="78" y="48" width="16" height="10" rx="2" fill="#e4edfd" stroke="#c3d4f2"/>' +
      '<rect x="66" y="26" width="16" height="6" rx="1.5" fill="#ffffff" opacity=".9"/>' +
      '<circle cx="118" cy="46" r="11" fill="#cfe3c8"/>' +
      '<rect x="116.5" y="56" width="3" height="9" rx="1.5" fill="#b7cfae"/>' +
      '<circle cx="28" cy="52" r="8" fill="#d7e3d0"/>' +
      '<rect x="26.8" y="59" width="2.4" height="7" rx="1.2" fill="#c2d4ba"/>' +
      '<path d="M96 22h6l2 4h-10z" fill="#c9d8f5"/>' +
      '</svg></div>';
  }

  function render() {
    var s = S.getState();
    var st = S.stats();
    var set = s.settings;
    var t0 = U.today();

    var doingStores = st.totalStores - st.opened - st.riskStores;

    /* ---- KPI ---- */
    var kpis = [
      {
        label: '筹建门店', value: st.totalStores, foot: '总门店数',
        color: '#3f6bf5', soft: '#edf2fe', icon: 'box'
      },
      {
        label: '已开业', value: st.opened, foot: U.pct(st.opened, st.totalStores),
        color: '#17b26a', soft: '#e6f8ef', icon: 'check'
      },
      {
        label: '进行中', value: doingStores, foot: U.pct(doingStores, st.totalStores),
        color: '#5b81f7', soft: '#edf2fe', icon: 'chart'
      },
      {
        label: '风险门店', value: st.riskStores, foot: U.pct(st.riskStores, st.totalStores),
        color: '#f79009', soft: '#fef4e6', icon: 'alert'
      },
      {
        label: '逾期任务', value: st.taskCounts.overdue, foot: U.pct(st.taskCounts.overdue, st.taskCounts.total),
        color: '#f04438', soft: '#feeceb', icon: 'clock'
      },
      {
        label: '7天内待到货', value: st.arrivals7, foot: U.pct(st.arrivals7, st.totalStores),
        color: '#7a5af8', soft: '#f2effe', icon: 'truck'
      }
    ];

    var kpiHtml = kpis.map(function (k) {
      return '<div class="kpi">' +
        '<span class="kpi-icon" style="background:' + k.soft + ';color:' + k.color + '">' + UI.icon(k.icon) + '</span>' +
        '<div class="kpi-body">' +
          '<div class="kpi-label">' + k.label + '</div>' +
          '<div class="kpi-value">' + k.value + '</div>' +
          '<div class="kpi-foot">' + k.foot + '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    /* ---- 门店表格（首页只放 8 条，在筹的在前，已开业的排后面） ---- */
    var activeStores = U.sortBy(
      s.stores.filter(function (x) { return x.stage !== '已开业'; }),
      function (a) { return a.openDate; }
    );
    var openedStores = s.stores.filter(function (x) { return x.stage === '已开业'; });
    var rows = activeStores.concat(openedStores).slice(0, 8);

    var tableRows = rows.map(function (store) {
      var owner = S.memberById(store.ownerId);
      var stageObj = null;
      C.STAGES.forEach(function (x) { if (x.key === store.stage) stageObj = x; });
      return '<tr data-store="' + store.id + '">' +
        '<td><div class="store-cell">' +
          '<i class="store-dot" style="background:' + (stageObj ? stageObj.color : '#98a2b8') + '"></i>' +
          '<span class="store-name">' + U.esc(store.name) + '</span>' +
        '</div></td>' +
        '<td class="muted">' + U.esc(store.province) + '</td>' +
        '<td class="muted mono">' + store.openDate + '</td>' +
        '<td>' + UI.progress(store.progress) + '</td>' +
        '<td>' + UI.stageBadge(store.stage) + '</td>' +
        '<td>' + UI.riskBadge(store.risk) + '</td>' +
        '<td>' + (owner ? '<div class="store-cell">' + UI.avatar(owner.name, owner.color, 'sm') +
          '<span>' + U.esc(owner.name) + '</span></div>' : '<span class="dim">未指派</span>') + '</td>' +
        '<td><span class="tlink" data-store-view="' + store.id + '">查看</span></td>' +
      '</tr>';
    }).join('');

    /* ---- 阶段图例 ---- */
    var legend = st.stageCounts.map(function (sc) {
      return '<div class="sl-item" data-stage="' + sc.key + '">' +
        '<i class="sl-dot" style="background:' + sc.color + '"></i>' +
        '<span class="sl-name">' + sc.key + '</span>' +
        '<span class="sl-num" style="color:' + sc.color + '">' + sc.count + '</span>' +
        '<span class="sl-unit">家</span>' +
      '</div>';
    }).join('');

    /* ---- 团队 ---- */
    var teamHtml = st.team.map(function (m, i) {
      return '<div class="team-row" data-member="' + m.id + '">' +
        UI.avatar(m.name, m.color, 'md') +
        '<div class="team-info">' +
          '<div class="team-name-line">' + U.esc(m.name) +
            '<span class="team-role">' + U.esc(m.role) + '</span>' +
          '</div>' +
          '<div class="team-meta">' +
            '<span>待办 <b>' + m.todo + '</b></span>' +
            '<span class="' + (m.late > 0 ? 'late' : '') + '">逾期 <b style="' + (m.late > 0 ? 'color:var(--red)' : '') + '">' + m.late + '</b></span>' +
          '</div>' +
        '</div>' +
        '<div class="team-right">' +
          '<div class="mini-progress"><span class="mini-track"><i style="width:' + m.percent + '%;background:' +
            (m.percent >= 80 ? '#17b26a' : m.percent >= 60 ? '#3f6bf5' : '#f79009') + '"></i></span>' +
            '<span class="mini-num">' + m.percent + '%</span></div>' +
          '<span class="team-rank' + (i < 3 ? ' top' : '') + '">' + (i + 1) + '</span>' +
        '</div>' +
      '</div>';
    }).join('');

    /* ---- 今日关注 ---- */
    var focusHtml = st.focus.length ? st.focus.map(function (f) {
      var late = f.late;
      return '<div class="focus-item" data-task="' + f.task.id + '">' +
        '<span class="focus-ico" style="background:' + (late ? '#feeceb' : '#fef4e6') + ';color:' +
          (late ? '#f04438' : '#f79009') + '">' + UI.icon(late ? 'alert' : 'clock') + '</span>' +
        '<div class="focus-body">' +
          '<div class="focus-title">' + U.esc(f.store ? f.store.name : '') + ' · ' + U.esc(f.task.title) + '</div>' +
          '<div class="focus-desc">预计到 ' + U.monthDay(f.task.dueDate) +
            (late ? '（已逾期 ' + Math.abs(f.days) + ' 天）' : '（还剩 ' + f.days + ' 天）') + '</div>' +
        '</div>' +
        '<span class="focus-owner">' + U.esc(f.owner ? f.owner.name : '未指派') + '</span>' +
      '</div>';
    }).join('') : UI.empty('今天没有需要特别盯的任务', '所有任务都在计划内');

    /* ---- 任务状态环形图 ---- */
    var tc = st.taskCounts;
    var donutItems = [
      { name: '已完成', value: tc.done, color: '#17b26a' },
      { name: '进行中', value: tc.doing, color: '#3f6bf5' },
      { name: '待处理', value: tc.pending, color: '#98a2b8' },
      { name: '逾期', value: tc.overdue, color: '#f04438' },
      { name: '风险', value: tc.risk, color: '#f79009' }
    ];
    var donutLegend = donutItems.map(function (d) {
      return '<div class="dl-row">' +
        '<i class="dl-dot" style="background:' + d.color + '"></i>' +
        '<span class="dl-name">' + d.name + '</span>' +
        '<span class="dl-val">' + d.value + '</span>' +
      '</div>';
    }).join('');

    var upcomingStores = 0;
    (function () {
      var seen = {};
      s.arrivals.forEach(function (a) {
        var d = U.diffDays(t0, a.etaDate);
        if (a.status === 'pending' && d >= 0 && d <= 7 && !seen[a.storeId]) {
          seen[a.storeId] = 1;
          upcomingStores += 1;
        }
      });
    })();

    return '' +
    /* Hero */
    '<section class="hero fade-up">' +
      '<div class="hero-icon">🏪</div>' +
      '<div class="hero-main">' +
        '<h2>' + U.greeting() + '，' + U.esc(set.teamName || '团队') + '！</h2>' +
        '<p>今天有 <b>' + st.todayTasks + '</b> 项任务需要处理，' +
           '<b class="warn">' + st.riskStores + '</b> 家门店存在风险，本周共 ' +
           '<b>' + st.weekTasks + '</b> 项待推进。</p>' +
      '</div>' +
      heroArt() +
      '<div class="hero-date">' +
        '<div class="hd-day">' + U.cnDate(t0) + '</div>' +
        '<div class="hd-week">' + U.weekdayCn(t0) + '</div>' +
        '<div class="hd-weather"><span>☁️</span><b>' + (set.weatherTemp || 26) + '°C</b>' +
          '<span>' + U.esc(set.weatherText || '多云') + '</span></div>' +
      '</div>' +
    '</section>' +

    /* KPI */
    '<section class="kpi-grid fade-up" style="animation-delay:.04s">' + kpiHtml + '</section>' +

    /* 进度总览 + 团队 */
    '<section class="home-grid-2 fade-up" style="animation-delay:.08s">' +
      '<div class="card">' +
        '<div class="card-head">' +
          '<h3>门店筹建进度总览</h3>' +
          '<span class="card-sub">点击门店查看详情，或使用筛选条件快速定位</span>' +
          '<div class="card-tools">' +
            '<select class="select" id="homeStageFilter" style="width:auto;height:30px;font-size:12px">' +
              '<option value="">全部阶段</option>' +
              UI.options(C.STAGES.map(function (x) { return x.key; }), '') +
            '</select>' +
            '<span class="link-more" data-go="stores">全部门店 →</span>' +
          '</div>' +
        '</div>' +
        Charts.stackBar(st.stageCounts) +
        '<div class="stage-legend">' + legend + '</div>' +
        '<div class="table-wrap"><table class="tbl">' +
          '<thead><tr>' +
            '<th>门店名称</th><th>省份</th><th>开业日期</th><th>整体进度</th>' +
            '<th>当前阶段</th><th>风险等级</th><th>负责人</th><th>操作</th>' +
          '</tr></thead>' +
          '<tbody>' + (tableRows || '<tr><td colspan="8">' + UI.empty('还没有门店') + '</td></tr>') + '</tbody>' +
        '</table></div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-head">' +
          '<h3>团队工作台</h3><span class="card-sub">（' + st.team.length + '人）</span>' +
          '<div class="card-tools"><span class="link-more" data-go="team">全部成员 →</span></div>' +
        '</div>' +
        '<div class="team-list">' + (teamHtml || UI.empty('还没有成员')) + '</div>' +
      '</div>' +
    '</section>' +

    /* 三小卡 */
    '<section class="home-grid-3 fade-up" style="animation-delay:.12s">' +
      '<div class="card">' +
        '<div class="card-head">' +
          '<h3>今日重点关注</h3>' +
          '<span class="badge" style="color:var(--red);background:var(--red-soft)">' + st.focus.length + '</span>' +
          '<div class="card-tools"><span class="link-more" data-go="alerts">查看全部 →</span></div>' +
        '</div>' +
        '<div class="focus-list">' + focusHtml + '</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-head"><h3>任务状态分布</h3></div>' +
        '<div class="donut-wrap">' +
          Charts.donut(donutItems, { size: 132, centerLabel: '总任务', centerValue: tc.total }) +
          '<div class="donut-legend">' + donutLegend + '</div>' +
        '</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-head">' +
          '<h3>近 7 天到货趋势</h3>' +
          '<div class="card-tools"><span class="link-more" data-go="reports">明细 →</span></div>' +
        '</div>' +
        Charts.bars(st.trend) +
        '<div class="arrival-foot">' +
          '<span>即将到货（7 天内）</span>' +
          '<span><b>' + upcomingStores + '</b> <span class="dim" style="font-size:12px">家</span></span>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  function mount(root) {
    /* 门店行 / 查看 */
    root.querySelectorAll('[data-store-view], tr[data-store]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        var id = el.getAttribute('data-store-view') || el.getAttribute('data-store');
        e.stopPropagation();
        if (window.Pages.stores && window.Pages.stores.openDetail) {
          window.Pages.stores.openDetail(id);
        }
      });
    });

    root.querySelectorAll('[data-go]').forEach(function (el) {
      el.addEventListener('click', function () {
        App.go(el.getAttribute('data-go'));
      });
    });

    root.querySelectorAll('[data-stage]').forEach(function (el) {
      el.addEventListener('click', function () {
        App.go('stores', { stage: el.getAttribute('data-stage') });
      });
    });

    root.querySelectorAll('[data-member]').forEach(function (el) {
      el.addEventListener('click', function () {
        App.go('team', { member: el.getAttribute('data-member') });
      });
    });

    root.querySelectorAll('[data-task]').forEach(function (el) {
      el.addEventListener('click', function () {
        App.go('tasks', { task: el.getAttribute('data-task') });
      });
    });

    var sf = root.querySelector('#homeStageFilter');
    if (sf) {
      sf.addEventListener('change', function () {
        if (sf.value) App.go('stores', { stage: sf.value });
      });
    }
  }

  return { title: '首页', render: render, mount: mount };
})();

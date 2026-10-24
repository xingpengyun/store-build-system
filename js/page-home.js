/* ==========================================================
   page-home.js — 首页
   ========================================================== */
window.Pages = window.Pages || {};

window.Pages.home = (function () {
  'use strict';

  var U = window.Utils;
  var S = window.Store;
  var C = window.CONST;

  /* 当前阶段筛选（空 = 全部）。存在模块里，刷新数据后不会被重置 */
  var filterStage = '';
  var ROW_LIMIT = 8;        /* 未筛选时首页只放 8 条 */
  var ROW_LIMIT_ON = 15;    /* 筛了阶段最多放 15 条 */

  function stageObjOf(key) {
    for (var i = 0; i < C.STAGES.length; i++) {
      if (C.STAGES[i].key === key) return C.STAGES[i];
    }
    return null;
  }

  /* 按当前筛选取门店，在筹的在前、已开业的排后面 */
  function pickedStores(s) {
    var list = s.stores.filter(function (x) {
      return !filterStage || x.stage === filterStage;
    });
    var active = U.sortBy(list.filter(function (x) { return x.stage !== '已开业'; }),
      function (a) { return a.openDate; });
    var opened = list.filter(function (x) { return x.stage === '已开业'; });
    return active.concat(opened);
  }

  function limitNow() { return filterStage ? ROW_LIMIT_ON : ROW_LIMIT; }

  function subHtml(s) {
    if (!filterStage) return '点击上方色块或图例，可直接筛出该阶段的门店';
    var n = pickedStores(s).length;
    return '已筛选 <b style="color:var(--primary)">' + U.esc(filterStage) + '</b>' +
      ' · 共 <b>' + n + '</b> 家' + (n === 0 ? '（该阶段暂无门店）' : '');
  }

  function footHtml(s) {
    var rest = pickedStores(s).length - limitNow();
    if (rest <= 0) return '';
    return '下面还有 <b>' + rest + '</b> 家未显示' +
      '<span class="stage-foot-link" data-go="stores">去门店管理查看全部 →</span>';
  }

  function rowsHtml(s) {
    var list = pickedStores(s);
    var shown = list.slice(0, limitNow());

    if (!shown.length) {
      return '<tr><td colspan="8">' + UI.empty(
        filterStage ? '「' + filterStage + '」暂无门店' : '还没有门店',
        filterStage ? '换个阶段看看，或点右上角「清除」' : '去门店管理添加第一家门店'
      ) + '</td></tr>';
    }

    return shown.map(function (store) {
      var owner = S.memberById(store.ownerId);
      var stageObj = stageObjOf(store.stage);
      return '<tr data-store="' + store.id + '">' +
        '<td><div class="store-cell">' +
          '<i class="store-dot" style="background:' + (stageObj ? stageObj.color : '#98a2b8') + '"></i>' +
          '<span class="store-name">' + U.esc(store.name) + '</span>' +
        '</div></td>' +
        '<td class="muted">' + U.esc(store.province) + '</td>' +
        '<td class="muted mono">' + store.openDate + '</td>' +
        '<td>' + UI.progress(S.storeProgress(store).pct, null, S.progressTip(store)) + '</td>' +
        '<td>' + UI.stageBadge(store.stage, S.storeSub(store)) + '</td>' +
        '<td>' + UI.riskBadge(store.risk) + '</td>' +
        '<td>' + (owner ? '<div class="store-cell">' + UI.avatar(owner.name, owner.color, 'sm') +
          '<span>' + U.esc(owner.name) + '</span></div>' : '<span class="dim">未指派</span>') + '</td>' +
        '<td><span class="tlink" data-store-view="' + store.id + '">查看</span></td>' +
      '</tr>';
    }).join('');
  }

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

  /* 首页顶部那条「今日发货」：几十家店的发货状态，一进来就能看到 */
  function shipBarHtml() {
    if (!S.shipRows) return '';
    var rows = S.shipRows();
    if (!rows.length) return '';

    var s = S.shipStats(rows);
    var cls = s.late ? 'is-alert' : (s.today ? 'is-warn' : 'is-ok');

    var head = s.late
      ? '<b class="text-red">' + s.late + '</b> 家已经过了计划发货日还没发'
      : (s.arrLate
        ? '<b class="text-red">' + s.arrLate + '</b> 家物料过了到货日还没通知供应商'
        : (s.today
          ? '<b class="sb-num">' + s.today + '</b> 家今天该发货'
          : '今天没有该发没发的门店'));

    var chips = [
      s.late ? { k: '逾期未发', v: s.late, cls: 'late' } : null,
      s.arrLate ? { k: '漏通知', v: s.arrLate, cls: 'late' } : null,
      s.today ? { k: '今天该发', v: s.today, cls: 'today' } : null,
      s.notify ? { k: '该通知供应商', v: s.notify, cls: 'today' } : null,
      { k: '还没发出', v: s.active, cls: '' },
      { k: '已发出', v: s.sent, cls: 'ok' }
    ].filter(Boolean).map(function (c) {
      return '<span class="hs-chip ' + c.cls + '">' + c.k + ' <b>' + c.v + '</b></span>';
    }).join('');

    return '<section class="home-ship ' + cls + ' fade-up" style="animation-delay:.02s">' +
      '<span class="hs-ico">' + UI.icon('truck') + '</span>' +
      '<div class="hs-body">' +
        '<div class="hs-title">发货：' + head + '</div>' +
        '<div class="hs-chips">' + chips + '</div>' +
      '</div>' +
      '<span class="link-more" data-go="ship">发货看板 →</span>' +
    '</section>';
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
        color: '#f79009', soft: '#fef4e6', icon: 'alert',
        help: '门店档案里「风险等级」标为<b>高危</b>或<b>逾期</b>的门店（占比 = 风险门店数 ÷ 门店总数）。' +
              '「关注」不算风险；等级在门店详情里手动维护。'
      },
      {
        label: '逾期任务', value: st.taskCounts.overdue, foot: U.pct(st.taskCounts.overdue, st.taskCounts.total),
        color: '#f04438', soft: '#feeceb', icon: 'clock',
        help: '还没做的任务里，今天已经过了<b>建议完成日</b>的：' +
              '建议完成日 = 门店计划开业日 − 该任务的开业前天数（可为单条任务延后）。' +
              '门店没填开业日的不判逾期；占比 = 逾期数 ÷ 全部任务数。'
      },
      {
        label: '7天内该通知', value: st.arrivals7, foot: U.pct(st.arrivals7, st.totalStores),
        color: '#7a5af8', soft: '#f2effe', icon: 'truck'
      }
    ];

    var kpiHtml = kpis.map(function (k) {
      /* 有 help 的卡片：标签旁加 ⓘ，hover / 键盘聚焦 / 点击都能看判断逻辑 */
      var helpHtml = k.help
        ? '<span class="kpi-help" tabindex="0" role="button" aria-label="查看「' + k.label + '」的判断逻辑"' +
            ' style="color:' + k.color + '">' +
            UI.icon('info') +
            '<span class="kpi-help-pop">' + k.help + '</span>' +
          '</span>'
        : '';
      return '<div class="kpi">' +
        '<span class="kpi-icon" style="background:' + k.soft + ';color:' + k.color + '">' + UI.icon(k.icon) + '</span>' +
        '<div class="kpi-body">' +
          '<div class="kpi-label">' + k.label + helpHtml + '</div>' +
          '<div class="kpi-value">' + k.value + '</div>' +
          '<div class="kpi-foot">' + k.foot + '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    /* ---- 门店表格（受阶段筛选控制） ---- */
    var tableRows = rowsHtml(s);

    /* ---- 阶段图例 ---- */
    var legend = st.stageCounts.map(function (sc) {
      return '<div class="sl-item' + (filterStage === sc.key ? ' on' : '') + '" data-stage="' + sc.key + '"' +
        ' title="只看「' + sc.key + '」的门店">' +
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
          '<div class="focus-desc">' + (f.due
            ? '建议 ' + U.monthDay(f.due) + ' 前完成' +
              (late ? '（已逾期 ' + Math.abs(f.days) + ' 天）' : '（还剩 ' + f.days + ' 天）')
            : '未设开业日期 · 开业前 ' + f.lead + ' 天') +
            (f.left != null ? '　·　距开业 ' + f.left + ' 天，开业前 ' + f.lead + ' 天' : '') +
            (f.snooze ? '　·　已延后 ' + f.snooze + ' 天' : '') + '</div>' +
        '</div>' +
        '<span class="focus-owner">' + U.esc(f.owner ? f.owner.name : '未指派') + '</span>' +
      '</div>';
    }).join('') : UI.empty('今天没有需要特别盯的任务', '所有任务都在计划内');

    /* ---- 任务状态环形图 ---- */
    var tc = st.taskCounts;
    var donutItems = [
      { name: '已完成', value: tc.done, color: '#17b26a' },
      { name: '未完成', value: tc.pending, color: '#98a2b8' },
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
        '<h2>' + U.greeting() + '，' + U.esc(set.teamName || '阿蛮团队') + '！</h2>' +
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

    /* 今日发货：每天早上先看这一条（谁该发、谁逾期、谁该通知供应商） */
    shipBarHtml() +

    /* KPI */
    '<section class="kpi-grid fade-up" style="animation-delay:.04s">' + kpiHtml + '</section>' +

    /* 进度总览 + 团队 */
    '<section class="home-grid-2 fade-up" style="animation-delay:.08s">' +
      '<div class="card">' +
        '<div class="card-head">' +
          '<h3>门店筹建进度总览</h3>' +
          '<span class="card-sub" data-role="stageSub">' + subHtml(s) + '</span>' +
          '<div class="card-tools">' +
            '<select class="select" id="homeStageFilter" style="width:auto;height:30px;font-size:12px">' +
              '<option value="">全部阶段</option>' +
              UI.options(C.STAGES.map(function (x) { return x.key; }), filterStage) +
            '</select>' +
            '<span class="link-more hidden" data-clear>清除</span>' +
            '<span class="link-more" data-go="stores">全部门店 →</span>' +
          '</div>' +
        '</div>' +
        Charts.stackBar(st.stageCounts, { clickable: true, active: filterStage }) +
        '<div class="stage-legend">' + legend + '</div>' +
        '<div class="table-wrap"><table class="tbl">' +
          '<thead><tr>' +
            '<th>门店名称</th><th>省份</th><th>开业日期</th><th>整体进度</th>' +
            '<th>当前阶段</th><th>风险等级</th><th>负责人</th><th>操作</th>' +
          '</tr></thead>' +
          '<tbody data-role="stageBody">' + tableRows + '</tbody>' +
        '</table></div>' +
        '<div class="stage-foot" data-role="stageFoot">' + footHtml(s) + '</div>' +
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
          '<h3>近 7 天到货量</h3>' +
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

  /* 只换表格和文案，不整页重绘（保留滚动位置、不触发入场动画） */
  function paint(root) {
    var s = S.getState();

    var sub = root.querySelector('[data-role="stageSub"]');
    if (sub) sub.innerHTML = subHtml(s);

    var body = root.querySelector('[data-role="stageBody"]');
    if (body) body.innerHTML = rowsHtml(s);

    var foot = root.querySelector('[data-role="stageFoot"]');
    if (foot) foot.innerHTML = footHtml(s);

    var sel = root.querySelector('#homeStageFilter');
    if (sel) sel.value = filterStage;

    var clear = root.querySelector('[data-clear]');
    if (clear) clear.classList.toggle('hidden', !filterStage);

    /* 图例 + 色条：同一个 data-stage，一起点亮 */
    root.querySelectorAll('[data-stage]').forEach(function (el) {
      el.classList.toggle('on', !!filterStage && el.getAttribute('data-stage') === filterStage);
    });
    root.querySelectorAll('.stage-bar i').forEach(function (el) {
      el.classList.toggle('dim', !!filterStage && el.getAttribute('data-stage') !== filterStage);
    });
  }

  function setFilter(key, root) {
    filterStage = (key && key !== filterStage) ? key : '';
    paint(root);
  }

  function mount(root) {
    /* 首次进首页引导一次：ⓘ 在哪、怎么用（之后不再打扰） */
    try {
      if (!localStorage.getItem('sbs.kpiHelpTip')) {
        localStorage.setItem('sbs.kpiHelpTip', '1');
        setTimeout(function () {
          UI.toast('提示：KPI 标签旁的 ⓘ 点一下（或鼠标放上去）能查看判断逻辑', 'info');
        }, 900);
      }
    } catch (e) {}

    /* 统一用事件委托：表格行会被重新渲染，直接绑在行上会失效 */
    root.addEventListener('click', function (e) {
      var t = e.target;

      /* ⓘ 判断逻辑：点一下固定展开 / 收起（触屏和懒得 hover 时用） */
      var help = t.closest('.kpi-help');
      if (help) {
        if (t.closest('.kpi-help-pop')) return;   /* 点在浮层内容上：不关，方便选中文字 */
        var wasOpen = help.classList.contains('is-open');
        root.querySelectorAll('.kpi-help.is-open').forEach(function (el) { el.classList.remove('is-open'); });
        if (!wasOpen) help.classList.add('is-open');
        return;
      }

      /* 点到别处 → 收起展开的浮层 */
      var openOnes = root.querySelectorAll('.kpi-help.is-open');
      if (openOnes.length) {
        openOnes.forEach(function (el) { el.classList.remove('is-open'); });
      }

      var view = t.closest('[data-store-view]');
      if (view) { openStore(view.getAttribute('data-store-view')); return; }

      var row = t.closest('tr[data-store]');
      if (row) { openStore(row.getAttribute('data-store')); return; }

      /* 阶段色块 / 图例 → 就地筛选下方门店，不跳页 */
      var stageEl = t.closest('[data-stage]');
      if (stageEl) { setFilter(stageEl.getAttribute('data-stage'), root); return; }

      if (t.closest('[data-clear]')) { setFilter('', root); return; }

      var goEl = t.closest('[data-go]');
      if (goEl) {
        var route = goEl.getAttribute('data-go');
        if (route === 'stores' && filterStage) App.go('stores', { stage: filterStage });
        else App.go(route);
        return;
      }

      var memberEl = t.closest('[data-member]');
      if (memberEl) { App.go('team', { member: memberEl.getAttribute('data-member') }); return; }

      var taskEl = t.closest('[data-task]');
      if (taskEl) { App.go('tasks', { task: taskEl.getAttribute('data-task') }); }
    });

    var sf = root.querySelector('#homeStageFilter');
    if (sf) {
      sf.addEventListener('change', function () { setFilter(sf.value, root); });
    }
  }

  function openStore(id) {
    if (window.Pages.stores && window.Pages.stores.openDetail) {
      window.Pages.stores.openDetail(id);
    }
  }

  return { title: '首页', render: render, mount: mount };
})();

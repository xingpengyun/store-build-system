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
  /* 进度总览表格：z131 起不再截断，改卡内滚动显示全部门店 */

  function stageObjOf(key) {
    for (var i = 0; i < C.STAGES.length; i++) {
      if (C.STAGES[i].key === key) return C.STAGES[i];
    }
    return null;
  }

  function riskOf(store) {
    return store.risk === 'high' || store.risk === 'overdue';
  }

  /* 6 张 KPI 卡片 → 点开的小窗文案。
     口径必须跟卡片上的数字一模一样（同一份 stats 字段），否则「写 3 家，点开 4 家」 */
  var KPI_META = {
    all: {
      title: '筹建门店', sub: '全部在册门店（含已开业）',
      empty: '还没有门店', emptySub: '去门店管理添加第一家门店'
    },
    opened: {
      title: '已开业', sub: '阶段停在「已开业」的门店',
      empty: '还没有门店开业', emptySub: '门店推进到「已开业」后会自动出现在这里'
    },
    doing: {
      title: '进行中', sub: '还没开业、也没标高危/逾期的门店',
      empty: '没有正在筹建的门店', emptySub: ''
    },
    risk: {
      title: '风险门店', sub: '风险等级标为「高危」或「逾期」的门店',
      empty: '暂无风险门店', emptySub: '风险等级在门店档案里手动维护，「关注」不算风险'
    },
    overdue: {
      title: '逾期任务', sub: '已过建议完成日、还没完成的任务，按门店汇总',
      empty: '没有逾期任务', emptySub: '所有待办任务都还在建议完成日之内'
    },
    notify: {
      title: '7天内该通知', sub: '7 天内要到货、还没通知供应商的物料，按门店汇总',
      empty: '近期没有要到货的物料', emptySub: '物料登记了到货日之后才会出现在这里'
    }
  };

  /* 把一类 KPI 展开成「门店 + 摘要」的列表。
     返回 { title, sub, rows }，rows = [{ store, items: [{ text, late }] }] */
  function kpiDetail(key) {
    var s = S.getState();
    var t0 = U.today();
    var meta = KPI_META[key] || KPI_META.all;
    var rows = [];
    var unit = '';

    if (key === 'overdue' || key === 'notify') {
      /* 这两类是任务 / 物料，按门店归堆：一条一条平铺看不出是哪家店的 */
      var bag = {};
      if (key === 'overdue') {
        unit = '条任务';
        s.tasks.forEach(function (t) {
          if (S.classify(t) !== 'overdue') return;
          var due = S.suggestDateOf(t);
          var text;
          if (due) {
            text = t.title + ' · 建议 ' + U.monthDay(due) + ' 完成，已过 ' + (-U.diffDays(t0, due)) + ' 天';
          } else {
            text = t.title + ' · 开业前 ' + S.taskBeforeOf(t) + ' 天该做';
          }
          (bag[t.storeId] = bag[t.storeId] || []).push({ text: text, late: true });
        });
      } else {
        unit = '项物料';
        var watch = Number(C.ARR_WATCH_DAYS || 7);
        s.arrivals.forEach(function (a) {
          if (S.arrNotified(a) || !a.etaDate) return;
          var d = U.diffDays(t0, a.etaDate);
          if (d < 0 || d > watch) return;
          var when = d === 0 ? '今天到' : (d + ' 天后到');
          (bag[a.storeId] = bag[a.storeId] || []).push({
            text: (a.item || '未填物料名') + ' · ' + U.monthDay(a.etaDate) + '（' + when + '）'
          });
        });
      }
      Object.keys(bag).forEach(function (id) {
        var store = S.storeById(id);
        if (store) rows.push({ store: store, items: bag[id] });
      });
    } else {
      s.stores.forEach(function (store) {
        if (key === 'opened' && store.stage !== '已开业') return;
        if (key === 'doing' && (store.stage === '已开业' || riskOf(store))) return;
        if (key === 'risk' && !riskOf(store)) return;
        rows.push({ store: store, items: [] });
      });
    }

    /* 排序：在筹的按开业日早的在前，已开业的沉到后面（跟下面表格一个顺序）。
       任务 / 物料类在这基础上再按件数多的排前面（sort 是稳定的，件数相同仍按开业日） */
    rows = U.sortBy(rows, function (r) {
      return (r.store.stage === '已开业' ? '2' : '1') + (r.store.openDate || '9999-99-99');
    });
    if (unit) rows = U.sortBy(rows, function (r) { return 999 - r.items.length; });

    var total = 0;
    rows.forEach(function (r) { total += r.items.length; });

    var sub = '共 ' + rows.length + ' 家';
    if (key === 'overdue') sub += ' · ' + total + ' 条任务';
    else if (key === 'notify') sub += ' · ' + total + ' 项物料';
    else if (key !== 'all') sub += ' · ' + meta.sub;   /* all 的「全部在册门店」跟标题重复，不写 */

    return { title: meta.title, sub: sub, meta: meta, rows: rows, unit: unit };
  }

  function kpiDetailHtml(d) {
    if (!d.rows.length) {
      return UI.empty(d.meta.empty, d.meta.emptySub);
    }

    return '<div class="kdl">' + d.rows.map(function (r) {
      var store = r.store;
      var stageObj = stageObjOf(store.stage);
      var shown = r.items.slice(0, 3);
      var notes = shown.map(function (i) {
        return '<div class="kdl-note' + (i.late ? ' is-late' : '') + '">' + U.esc(i.text) + '</div>';
      }).join('');
      var rest = r.items.length - shown.length;
      if (rest > 0) notes += '<div class="kdl-more">还有 ' + rest + ' 条，点门店看全部</div>';

      return '<div class="kdl-row" data-kdl-store="' + store.id + '" role="button" tabindex="0"' +
          ' title="打开「' + U.esc(store.name) + '」的门店详情">' +
        '<i class="store-dot" style="background:' + (stageObj ? stageObj.color : '#98a2b8') + '"></i>' +
        '<div class="kdl-main">' +
          '<div class="kdl-top">' +
            '<span class="kdl-name">' + U.esc(store.name) + '</span>' +
            '<span class="kdl-meta">' + U.esc(store.province || '未填省份') + ' · ' +
              (store.openDate ? U.monthDay(store.openDate) + ' 开业' : '开业日未定') + '</span>' +
          '</div>' + notes +
        '</div>' +
        '<div class="kdl-right">' +
          (r.items.length ? '<span class="kdl-cnt">' + r.items.length + ' ' + d.unit + '</span>' : '') +
          (d.meta.title === '风险门店' ? UI.riskBadge(store.risk) : UI.stageBadge(store.stage, S.storeSub(store))) +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function showKpiStores(key) {
    var d = kpiDetail(key);
    UI.modal({
      size: 'lg',
      title: d.title,
      sub: d.sub,
      body: kpiDetailHtml(d),
      footer: '<button class="btn" data-kdl-close type="button">关闭</button>',
      onMount: function (box, close) {
        box.querySelectorAll('[data-kdl-store]').forEach(function (el) {
          el.addEventListener('click', function () {
            close();
            openStore(el.getAttribute('data-kdl-store'));
          });
        });
        var btn = box.querySelector('[data-kdl-close]');
        if (btn) btn.addEventListener('click', close);
      }
    });
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

  function subHtml(s) {
    if (!filterStage) return '点击上方色块或图例，可直接筛出该阶段的门店';
    var n = pickedStores(s).length;
    return '已筛选 <b style="color:var(--primary)">' + U.esc(filterStage) + '</b>' +
      ' · 共 <b>' + n + '</b> 家' + (n === 0 ? '（该阶段暂无门店）' : '');
  }

  function footHtml(s) {
    var n = pickedStores(s).length;
    if (!n) return '';
    return '共 <b>' + n + '</b> 家 · 表格内上下滚动查看全部' +
      '<span class="stage-foot-link" data-go="stores">去门店管理查看全部 →</span>';
  }

  function rowsHtml(s) {
    var list = pickedStores(s);

    if (!list.length) {
      return '<tr><td colspan="8">' + UI.empty(
        filterStage ? '「' + filterStage + '」暂无门店' : '还没有门店',
        filterStage ? '换个阶段看看，或点右上角「清除」' : '去门店管理添加第一家门店'
      ) + '</td></tr>';
    }

    return list.map(function (store) {
      var owner = S.memberById(store.ownerId);
      var stageObj = stageObjOf(store.stage);
      return '<tr data-store="' + store.id + '">' +
        '<td><div class="store-cell">' +
          '<i class="store-dot" style="background:' + (stageObj ? stageObj.color : '#98a2b8') + '"></i>' +
          '<span class="store-name">' + U.esc(store.name) + '</span>' +
        '</div></td>' +
        '<td class="muted">' + U.esc(store.province) + '</td>' +
        '<td class="muted mono">' + store.openDate + '</td>' +
        '<td>' + UI.progress(S.progressValue(store), null, S.progressTip(store)) + '</td>' +
        '<td>' + UI.stageBadge(store.stage, S.storeSub(store)) + '</td>' +
        '<td>' + UI.riskBadge(store.risk) + '</td>' +
        '<td>' + (owner ? '<div class="store-cell">' + UI.avatar(owner.name, owner.color, 'sm', owner.animal) +
          '<span>' + U.esc(owner.name) + '</span></div>' : '<span class="dim">未指派</span>') + '</td>' +
        '<td><span class="tlink" data-store-view="' + store.id + '">查看</span></td>' +
      '</tr>';
    }).join('');
  }

  /* ================= 圣诞冬夜场景（z205） =================
     z171 那套是万圣夜：橙月 + 墓碑 + 蝙蝠 + 幽灵 + 蜘蛛 + 南瓜灯。
     z205/z206 是月夜圣诞（冷月 + 冷蓝雪夜），用户觉得圣诞味不够。
     z207 改成经典红绿圣诞：远（金色星光 / 薄云 / 暖雪雾）→ 中（居中圣诞花环 /
     放大版圣诞树 / 雪丘 / 松树 / 雪人 / 礼物 / 坐着圣诞老人的驯鹿雪橇）→
     近（雪堆边沿 + 落雪 + 顶边灯串 / 冬青 / 金铃铛 / 红蝴蝶结）。
     依旧是三层叠 + 光晕拉纵深，纯 SVG + CSS，无外部图片、无 JS 动画。 */
  function xmScene() {
    /* 落雪：12 片，位置 / 速度 / 相位全在 CSS 里（.xm-snow.f1~f12） */
    var snow = '';
    for (var i = 1; i <= 12; i++) snow += '<i class="xm-snow f' + i + '"></i>';

    /* 顶边灯串：十颗彩灯泡，交替闪烁由 .xm-bulb 的 xmTwinkle 负责 */
    /* z206：红灯从 2 颗加到 4 颗并提亮，红成为灯串的主节奏 */
    var bulbs = [
      [30, 8, '#ff4f45', '-.2s'], [95, 13, '#ffd46a', '-1.1s'],
      [160, 14, '#ff4f45', '-2.0s'], [225, 11, '#6fd6a2', '-.7s'],
      [272, 7, '#ff4f45', '-1.7s'], [355, 6, '#ffd46a', '-2.5s'],
      [420, 10, '#ff4f45', '-.4s'], [485, 15, '#8fd0ff', '-1.9s'],
      [545, 9, '#ffd46a', '-3.1s'], [580, 12, '#ff4f45', '-2.3s']
    ];
    var lights = '<svg class="xm-lights" viewBox="0 0 600 26" preserveAspectRatio="none" aria-hidden="true">' +
      '<path class="xm-wire" d="M0 3C90 19 150 19 240 11S390 3 480 13 560 20 600 12" fill="none" stroke-width="1.2"/>' +
      bulbs.map(function (b) {
        return '<circle class="xm-bulb" cx="' + b[0] + '" cy="' + b[1] + '" r="6.6" fill="' + b[2] +
          '" opacity=".40" style="animation-delay:' + b[3] + '"/>' +
          '<circle class="xm-bulb" cx="' + b[0] + '" cy="' + b[1] + '" r="3.1" fill="' + b[2] +
          '" style="animation-delay:' + b[3] + '"/>';
      }).join('') +
      '</svg>';

    /* z206：顶边冬青红果枝（4 组）+ 中央红丝带蝴蝶结。
       红色沿整条横幅铺开，而不是只在底部礼物上点两下。 */
    var hollySvg = '<svg viewBox="0 0 36 28" fill="none" aria-hidden="true">' +
      '<path d="M1 4q12 10 34 6" stroke="#1b6a4b" stroke-width="1.7" stroke-linecap="round"/>' +
      '<path d="M8 8q-7-7-1-8 7 2 5 9z" fill="#2d8a5e"/>' +
      '<path d="M16 11q-7-8 0-9 7 3 4 10z" fill="#247a53"/>' +
      '<path d="M25 12q-6-8 1-9 7 3 3 10z" fill="#2d8a5e"/>' +
      '<circle cx="12" cy="15" r="3.4" fill="#e5393e"/>' +
      '<circle cx="19" cy="16" r="3" fill="#b52f36"/>' +
      '<circle cx="25" cy="15" r="2.8" fill="#f2604f"/>' +
      '<circle cx="11" cy="14" r=".9" fill="#ffb8a8" opacity=".85"/>' +
      '</svg>';
    var holly = '';
    for (var h = 1; h <= 4; h++) holly += '<i class="xm-holly h' + h + '">' + hollySvg + '</i>';
    var bow = '<i class="xm-bow"><svg viewBox="0 0 40 26" fill="none" aria-hidden="true">' +
      '<path d="M20 12C10 2 2 4 2 11c0 6 8 8 18 2z" fill="#c92f38"/>' +
      '<path d="M20 12C30 2 38 4 38 11c0 6-8 8-18 2z" fill="#e44943"/>' +
      '<path d="M17 13l-4 11 6-3 5 3-3-11z" fill="#a92b33"/>' +
      '<circle cx="20" cy="12" r="3.4" fill="#ffd46a"/>' +
      '</svg></i>';

    /* 红白糖果拐杖：白色棒身 + 红色斜向节奏，插在礼物堆右侧的雪里 */
    var cane = '<svg class="xm-cane" viewBox="0 0 20 40" fill="none" aria-hidden="true">' +
      '<path d="M6 38V16a8 8 0 0 1 12-6" stroke="#fff6ee" stroke-width="5.2" stroke-linecap="round"/>' +
      '<path d="M6 38V16a8 8 0 0 1 12-6" stroke="#e23b3f" stroke-width="5.2" stroke-linecap="round" stroke-dasharray="4.5 5"/>' +
      '<path d="M6 38V16a8 8 0 0 1 12-6" stroke="#ffffff" stroke-opacity=".5" stroke-width="1" stroke-linecap="round"/>' +
      '</svg>';

    /* z207：天空里的金色五角星（顶掉原来那颗大冷月的视觉重心） */
    var starSvg = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M12 1.5l3 7.2 7.8.6-5.9 5.1 1.8 7.6L12 18l-6.7 4 1.8-7.6-5.9-5.1 7.8-.6z" fill="#ffd76a"/>' +
      '</svg>';
    var stars = '';
    for (var s = 1; s <= 4; s++) stars += '<i class="xm-sky-star s' + s + '">' + starSvg + '</i>';

    /* z207：顶边三枚金铃铛，和冬青红果、红蝴蝶结一起把顶边铺满 */
    var bellSvg = '<svg viewBox="0 0 20 24" fill="none" aria-hidden="true">' +
      '<path d="M10 1v3" stroke="#ffd46a" stroke-width="1.3" stroke-linecap="round"/>' +
      '<path d="M3.5 17c0-6 1.4-11 6.5-11s6.5 5 6.5 11z" fill="#e0a637"/>' +
      '<path d="M6 9q4-2 8 0" stroke="#fff0c0" stroke-opacity=".55" stroke-width="1.2" stroke-linecap="round"/>' +
      '<rect x="2.5" y="16.5" width="15" height="2.8" rx="1.4" fill="#ffd46a"/>' +
      '<circle cx="10" cy="21" r="1.8" fill="#c98b2a"/>' +
      '</svg>';
    var bells = '';
    for (var k = 1; k <= 3; k++) bells += '<i class="xm-bell b' + k + '">' + bellSvg + '</i>';

    /* z207：居中大圣诞花环 —— 松枝环 / 冬青叶 / 九颗红果 / 两枚金铃铛 /
       中心金星 / 底部红蝴蝶结。它占据了原来冷月的位置，但一眼就是圣诞。 */
    var berries = [[60,18],[86,28],[101,50],[100,78],[82,98],
                   [40,98],[20,78],[19,50],[34,28]];
    var berryDots = berries.map(function (b) {
      return '<circle cx="' + b[0] + '" cy="' + b[1] + '" r="3.4" fill="#e23b3f"/>';
    }).join('');
    var wreath = '<svg class="xm-wreath" viewBox="0 0 120 120" fill="none" aria-hidden="true">' +
      '<defs><radialGradient id="xwHalo">' +
        '<stop offset="0" stop-color="#ffd98a" stop-opacity=".34"/>' +
        '<stop offset="1" stop-color="#ffd98a" stop-opacity="0"/>' +
      '</radialGradient></defs>' +
      '<circle cx="60" cy="60" r="58" fill="url(#xwHalo)"/>' +
      /* 三层虚线圆环 = 蓬松的松针 */
      '<circle cx="60" cy="60" r="42" stroke="#0b3f30" stroke-width="20"/>' +
      '<circle cx="60" cy="60" r="42" stroke="#186b49" stroke-width="15" stroke-dasharray="8 5"/>' +
      '<circle cx="60" cy="60" r="42" stroke="#2f9463" stroke-width="8" stroke-dasharray="3 6" stroke-dashoffset="3"/>' +
      /* 四片冬青叶 */
      '<g fill="#2b8a58">' +
        '<path d="M22 34q-10-6-3-12 9 1 8 12zM98 34q10-6 3-12-9 1-8 12z"/>' +
        '<path d="M18 80q-11 3-8 11 10 2 13-8zM102 80q11 3 8 11-10 2-13-8z"/>' +
      '</g>' +
      '<g>' + berryDots + '</g>' +
      '<g fill="#ff9d86" opacity=".75">' +
        '<circle cx="59" cy="16.5" r="1"/><circle cx="84.5" cy="27" r="1"/><circle cx="19" cy="48.5" r="1"/>' +
      '</g>' +
      /* 左右金铃铛 */
      '<g>' +
        '<path d="M20 62c0-5 1-8 4-8s4 3 4 8z" fill="#e8ad3c"/>' +
        '<rect x="19" y="62" width="9" height="2.4" rx="1" fill="#ffd46a"/>' +
        '<circle cx="24" cy="66" r="1.6" fill="#c98b2a"/>' +
        '<path d="M92 62c0-5 1-8 4-8s4 3 4 8z" fill="#e8ad3c"/>' +
        '<rect x="91" y="62" width="9" height="2.4" rx="1" fill="#ffd46a"/>' +
        '<circle cx="96" cy="66" r="1.6" fill="#c98b2a"/>' +
      '</g>' +
      /* 环心金色大星 */
      '<path class="xm-wreath-star" d="M60 34l5.4 12.6 13.7 1.1-10.4 9 3.1 13.4L60 63.2l-11.8 6.9 3.1-13.4-10.4-9 13.7-1.1z" fill="#ffd76a"/>' +
      /* 底部红丝带蝴蝶结 */
      '<path d="M60 96C45 84 32 87 32 97c0 9 12 12 28 3z" fill="#c92f38"/>' +
      '<path d="M60 96c15-12 28-9 28 1 0 9-12 12-28 3z" fill="#e44943"/>' +
      '<path d="M55 97l-6 18 9-4 8 4-3-18z" fill="#a92b33"/>' +
      '<circle cx="60" cy="97" r="5" fill="#ffd46a"/>' +
      '</svg>';

    /* z208：不再堆小插画 —— 一枚动态倒数金章 + 大色块纸艺树 + 斜切色纸。
       天数是按真实日期算到 12/25 的，过了圣诞自动翻到明年，不是写死的数字。 */
    var nowD = new Date(), yr = nowD.getFullYear();
    var todayD = new Date(yr, nowD.getMonth(), nowD.getDate());
    var xmasD = new Date(yr, 11, 25);
    if (todayD > xmasD) xmasD = new Date(yr + 1, 11, 25);
    var daysLeft = Math.round((xmasD - todayD) / 86400000);
    var paper = '<i class="xm-paper-band"></i>' +
      '<i class="xm-paper-tree"></i>' +
      '<i class="xm-paper-star"></i>' +
      '<i class="xm-countdown"><b>' + daysLeft + '</b><small>天后圣诞</small></i>';

    return '<div class="hero-fx" aria-hidden="true">' +
      /* 底子：三团柔光 + 流动点阵 + 星光（负责"空气感"） */
      '<i class="hf-blob hf-b1"></i><i class="hf-blob hf-b2"></i><i class="hf-blob hf-b3"></i>' +
      '<i class="hf-blob hf-b4"></i>' +
      '<i class="hf-spark hf-s1"></i><i class="hf-spark hf-s2"></i><i class="hf-spark hf-s3"></i>' +
      '<i class="hf-spark hf-s4"></i>' +
      snow +
      lights + holly + bow + bells + paper +

      /* ---------- 远景 1：花环背后的暖金光晕 ---------- */
      '<i class="xm-glow"></i>' +

      /* ---------- 远景 2：金色天空星 ---------- */
      stars +

      /* ---------- 远景 3：居中圣诞花环（z207 顶掉冷月） ---------- */
      wreath +

      /* ---------- 远景 3：薄云 + 两层雪雾 ---------- */
      '<i class="xm-cloud a"></i><i class="xm-cloud b"></i>' +
      '<i class="xm-mist a"></i><i class="xm-mist b"></i>' +

      /* ---------- 远景 4：驯鹿雪橇，缓缓飞过夜空（红鼻子是鲁道夫） ---------- */
      '<svg class="xm-sleigh" viewBox="0 0 96 44" fill="none" aria-hidden="true">' +
        '<g fill="#f6dfb8" opacity=".9">' +
          /* 鹿身 + 头 + 四条腿 */
          '<ellipse cx="34" cy="24" rx="16" ry="6.4"/>' +
          '<path d="M47 20c3-4 5-7 7-10l5 2-3 7 3 3-6 3z"/>' +
          '<path d="M22 28l-3 11h3l4-9M31 29l-1 10h3l2-9M40 29l2 9h3l-1-10M46 27l4 10h3l-3-11" stroke="#f6dfb8" stroke-width="2.2" stroke-linecap="round"/>' +
          /* 鹿角 */
          '<path d="M56 10l-1-7m1 4 4-5m-4 2-4-4" stroke="#f6dfb8" stroke-width="1.6" stroke-linecap="round"/>' +
        '</g>' +
        /* z206：雪橇换成经典红金款，礼物也一红一金 */
        '<g>' +
          '<path d="M62 30h24l-3 7H66c-4 0-6-2-6-4 0-2 1-3 2-3z" fill="#c62f37"/>' +
          '<path d="M62 30h24l-1.2 2.4H62z" fill="#ef4a44"/>' +
          '<path d="M64 37c3 4 20 4 24 0" stroke="#ffd46a" stroke-width="2" stroke-linecap="round"/>' +
          '<rect x="70" y="24" width="7" height="6" rx="1" fill="#e54a45"/>' +
          '<rect x="78" y="22" width="6" height="8" rx="1" fill="#ffd46a"/>' +
        '</g>' +
        /* z207：雪橇上坐一位红帽白胡子的圣诞老人，一眼就是圣诞 */
        '<g>' +
          '<path d="M76 31V23c0-5 3.2-8 7-8s7 3 7 8v8z" fill="#cf3038"/>' +
          '<circle cx="83" cy="14" r="5.6" fill="#f7ddc2"/>' +
          '<path d="M77 12c0-8 3-11 7-9 2.5 1.2 4.5 4 5.5 7z" fill="#cf3038"/>' +
          '<path d="M76.5 11h13v2.8h-13z" fill="#fff8ee"/>' +
          '<circle cx="89" cy="3.5" r="2.6" fill="#fff8ee"/>' +
          '<path d="M78.4 16.5q4.6 6 9.2 0-1 5.5-4.6 5.5t-4.6-5.5z" fill="#fff8ee"/>' +
          '<circle cx="81" cy="13.4" r=".8" fill="#2b3a44"/>' +
          '<circle cx="85" cy="13.4" r=".8" fill="#2b3a44"/>' +
          '<circle cx="83" cy="16" r="1" fill="#e8847a"/>' +
        '</g>' +
        /* 鲁道夫的红鼻子：加一圈光晕，夜里才看得见 */
        '<circle cx="60" cy="13" r="6" fill="#ff4f45" opacity=".30"/>' +
        '<circle cx="60" cy="13" r="2.8" fill="#ff4f45"/>' +
        '<path d="M86 30l4-7" stroke="#f6dfb8" stroke-width="1.2" stroke-linecap="round"/>' +
      '</svg>' +

      /* ---------- 中景：连绵雪丘（月亮从雪脊后面升起） ---------- */
      '<svg class="xm-hill" viewBox="0 0 600 34" preserveAspectRatio="none" aria-hidden="true">' +
        '<path d="M0 20Q60 8 120 18T240 14T360 20T480 12T600 18L600 34H0Z" fill="#f0d9cf" opacity=".55"/>' +
        '<path d="M0 26Q70 18 140 26T280 22T420 27T600 23L600 34H0Z" fill="#fff6ec" opacity=".92"/>' +
      '</svg>' +

      /* ---------- 中景：三棵雪顶松树（大小差 = 远近） ---------- */
      pine('p1') + pine('p2') + pine('p3') +

      /* ---------- 中景：挂彩灯、顶着星星的圣诞树 ---------- */
      '<svg class="xm-tree" viewBox="0 0 80 100" aria-hidden="true">' +
        '<defs><radialGradient id="xmTreeGlow">' +
          '<stop offset="0" stop-color="#ffcf78" stop-opacity=".42"/>' +
          '<stop offset="1" stop-color="#ffcf78" stop-opacity="0"/>' +
        '</radialGradient></defs>' +
        '<ellipse cx="40" cy="62" rx="40" ry="36" fill="url(#xmTreeGlow)"/>' +
        '<rect x="35" y="84" width="10" height="10" rx="2" fill="#6b412a"/>' +
        '<path d="M40 14 20 44h9L14 70h11L9 86h62l-16-16h11L50 44h9z" fill="#0f5a45"/>' +
        '<path d="M40 14 31 38h18z" fill="#18805c" opacity=".7"/>' +
        '<path d="M40 14 20 44h9L14 70h11L9 86h62l-16-16h11L50 44h9z" fill="none" stroke="#e9f7ff" stroke-opacity=".28" stroke-width="1.2"/>' +
        '<path class="xm-star" d="M40 3l2.4 5.8 6.3.5-4.8 4.1 1.5 6.2L40 16.4l-5.4 3.2 1.5-6.2-4.8-4.1 6.3-.5z" fill="#ffd76a"/>' +
        '<path d="M17 50q14 9 24 3t23-1" stroke="#e23b3f" stroke-width="2.3" fill="none" opacity=".92"/>' +
        '<path d="M13 72q14 9 27 3t27-2" stroke="#c62f37" stroke-width="2.3" fill="none" opacity=".88"/>' +
        '<g>' +
          '<circle class="xm-bauble" cx="30" cy="45" r="3.3" fill="#ff4f45" style="animation-delay:-.4s"/>' +
          '<circle class="xm-bauble" cx="52" cy="50" r="3" fill="#ffd46a" style="animation-delay:-1.2s"/>' +
          '<circle class="xm-bauble" cx="24" cy="68" r="3.3" fill="#ff4f45" style="animation-delay:-2.1s"/>' +
          '<circle class="xm-bauble" cx="56" cy="72" r="3.3" fill="#ff4f45" style="animation-delay:-1.7s"/>' +
          '<circle class="xm-bauble" cx="40" cy="60" r="3" fill="#e23b3f" style="animation-delay:-.9s"/>' +
          '<circle class="xm-bauble" cx="36" cy="79" r="2.8" fill="#ffd46a" style="animation-delay:-2.5s"/>' +
          '<circle class="xm-bauble" cx="62" cy="61" r="2.6" fill="#ff4f45" style="animation-delay:-3.0s"/>' +
        '</g>' +
        '<path d="M14 68q26 8 52 0" stroke="#ffe6a8" stroke-opacity=".45" stroke-width="1.2" fill="none"/>' +
        '<rect x="8" y="86" width="13" height="10" rx="1.6" fill="#cf3038"/>' +
        '<path d="M14.5 86v10M8 90h13" stroke="#ffd46a" stroke-width="1.8"/>' +
        '<rect x="59" y="87" width="11" height="9" rx="1.6" fill="#e23b3f"/>' +
        '<path d="M64.5 87v9" stroke="#fff0c9" stroke-width="1.6"/>' +
      '</svg>' +

      /* ---------- 中景：雪人（红围巾 + 胡萝卜鼻，慢慢晃） ---------- */
      '<svg class="xm-snowman" viewBox="0 0 40 48" aria-hidden="true">' +
        '<ellipse cx="20" cy="45" rx="15" ry="2.6" fill="#dceeff" opacity=".5"/>' +
        '<circle cx="20" cy="33" r="12" fill="#f5fbff"/>' +
        '<circle cx="20" cy="17" r="9" fill="#ffffff"/>' +
        '<rect x="10" y="8" width="20" height="3.4" rx="1.2" fill="#cf3038"/>' +
        '<path d="M13 8V2.5c0-1.2 1-2 2.2-2h9.6c1.2 0 2.2.8 2.2 2V8z" fill="#cf3038"/>' +
        '<path d="M12 24q8 5 16 0l-1 4q-7 3-14 0z" fill="#ef4a44"/>' +
        '<path d="M27 26l6 1.5-4.5 4.5z" fill="#cf3038"/>' +
        '<circle cx="16.4" cy="15" r="1.4" fill="#2b3a44"/>' +
        '<circle cx="23.6" cy="15" r="1.4" fill="#2b3a44"/>' +
        '<path d="M20 18l6 2.2-6 1.6z" fill="#f59a3c"/>' +
        '<circle cx="20" cy="31" r="1.5" fill="#2b3a44"/>' +
        '<circle cx="20" cy="37" r="1.5" fill="#2b3a44"/>' +
      '</svg>' +

      /* ---------- 近景：两只礼物盒 ---------- */
      '<svg class="xm-gift" viewBox="0 0 60 30" aria-hidden="true">' +
        '<rect x="2" y="12" width="20" height="16" rx="2" fill="#cf3038"/>' +
        '<rect x="2" y="9" width="20" height="5" rx="1.6" fill="#d6403f"/>' +
        '<path d="M11 9v19M2 17h20" stroke="#ffd46a" stroke-width="3"/>' +
        '<path d="M12 9c-5-6-9-1-4 0 3 .6 4-1 4-0zM12 9c5-6 9-1 4 0-3 .6-4-1-4-0z" fill="#ffd46a"/>' +
        '<rect x="24" y="15" width="17" height="13" rx="2" fill="#176b52"/>' +
        '<rect x="24" y="12" width="17" height="5" rx="1.6" fill="#1d8a68"/>' +
        '<path d="M32 12v16M24 20h17" stroke="#fff0c9" stroke-width="2.6"/>' +
        '<rect x="43" y="10" width="15" height="18" rx="2" fill="#e23b3f"/>' +
        '<rect x="43" y="7" width="15" height="5" rx="1.6" fill="#f2604f"/>' +
        '<path d="M50.5 7v21" stroke="#ffd46a" stroke-width="2.2"/>' +
        '<path d="M50.5 7c-5-6-9-1-4 0 3 .6 4-1 4 0zM50.5 7c5-6 9-1 4 0-3 .6-4-1-4 0z" fill="#ffd46a"/>' +
      '</svg>' + cane +

      /* ---------- 近景：雪堆边沿（把地平线打毛，不再是一条直线） ---------- */
      '<svg class="xm-snowbank" viewBox="0 0 600 12" preserveAspectRatio="none" aria-hidden="true">' +
        '<path d="M0 8Q30 3 60 7T120 6T180 9T240 5T300 8T360 5T420 9T480 6T540 8T600 5L600 12H0Z" fill="#f2f9ff"/>' +
      '</svg>' +
    '</div>';
  }

  /* ==================================================================
     z209 参考图版横幅场景：深蓝雪夜 + 暖月 + 雪松暖光小屋 + 一对大主角。
     旧 xmScene()（花环 / 纸艺树 / 倒数金章）保留但不再调用，方便回滚。
     ================================================================== */
  function xmRefScene() {
    var flakes = '';
    for (var i = 1; i <= 10; i++) flakes += '<i class="xr-flake f' + i + '"></i>';

    /* 右侧雪夜小屋：雪松林 + 积雪木屋 + 暖窗 + 屋前挂彩灯的圣诞树 */
    var village = '<svg class="xr-village" viewBox="0 0 260 140" preserveAspectRatio="xMaxYMax meet" fill="none" aria-hidden="true">' +
      '<defs>' +
        '<radialGradient id="xrWin"><stop offset="0" stop-color="#ffe9ae" stop-opacity=".95"/><stop offset="1" stop-color="#ffb85c" stop-opacity="0"/></radialGradient>' +
        '<linearGradient id="xrWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8c5a3c"/><stop offset="1" stop-color="#5b3a28"/></linearGradient>' +
      '</defs>' +
      /* 远处雪松 */
      '<g opacity=".92">' +
        '<path d="M14 96 2 120h6l-6 10h24l-6-10h6z" fill="#12473f"/>' +
        '<path d="M14 96 9 106h10z" fill="#eaf6ff"/>' +
        '<path d="M42 88 30 114h6l-6 10h26l-7-10h6z" fill="#17564a"/>' +
        '<path d="M42 88 36 100h12z" fill="#eaf6ff"/>' +
        '<path d="M236 90 224 116h6l-6 10h26l-7-10h6z" fill="#17564a"/>' +
        '<path d="M236 90 230 102h12z" fill="#eaf6ff"/>' +
      '</g>' +
      /* 木屋主体 */
      '<ellipse cx="146" cy="112" rx="72" ry="34" fill="url(#xrWin)" opacity=".45"/>' +
      '<path d="M100 74h92v56h-92z" fill="url(#xrWall)"/>' +
      '<path d="M100 74h92v4h-92z" fill="#a97148" opacity=".7"/>' +
      /* 积雪屋顶（两片斜坡 + 厚雪檐） */
      '<path d="M88 76 146 34l58 42-8 6-50-36-50 36z" fill="#f2f9ff"/>' +
      '<path d="M92 74 146 32l54 42q-12-2-22 4-16-10-32 0-18-8-32 0-10-6-22-4z" fill="#ffffff"/>' +
      '<path d="M146 32 204 74q-10-1-16 3l-42-32-42 32q-7-4-16-3z" fill="#dcecff" opacity=".8"/>' +
      /* 烟囱 + 一缕暖烟 */
      '<rect x="176" y="40" width="13" height="20" rx="2" fill="#7a4a34"/>' +
      '<path d="M176 40h13v4h-13z" fill="#f2f9ff"/>' +
      '<path d="M183 36q-5-6 1-10t-1-8" stroke="#dbe9ff" stroke-opacity=".45" stroke-width="3" stroke-linecap="round"/>' +
      /* 暖窗（带光晕）+ 红门 */
      '<g fill="#ffd887">' +
        '<rect x="112" y="88" width="20" height="18" rx="2"/>' +
        '<rect x="160" y="88" width="20" height="18" rx="2"/>' +
        '<rect x="140" y="112" width="14" height="18" rx="1.5"/>' +
      '</g>' +
      '<g stroke="#8a5a38" stroke-width="1.6">' +
        '<path d="M122 88v18M112 97h20M170 88v18M160 97h20"/>' +
      '</g>' +
      '<path d="M138 112h18v18h-18z" fill="#c8323c"/>' +
      '<circle cx="152" cy="121" r="1.4" fill="#ffd76a"/>' +
      '<path d="M138 112h18v3h-18z" fill="#e44a48"/>' +
      /* 屋前挂彩灯的小圣诞树 */
      '<path d="M56 128 44 128l-8-12h5l-7-11h5l-7-11h28l-7 11h5l-7 11h5z" fill="#0f5a45"/>' +
      '<path d="M38 84q14 5 28 0l-4-4q-10 4-20 0z" fill="#eaf6ff" opacity=".9"/>' +
      '<path d="M34 106q14 5 36 0l-5-4q-13 4-26 0z" fill="#eaf6ff" opacity=".8"/>' +
      '<path d="M30 124q16 5 44 0l-5-4q-17 4-34 0z" fill="#eaf6ff" opacity=".75"/>' +
      '<g><circle cx="40" cy="100" r="2.2" fill="#ff4f45"/><circle cx="56" cy="98" r="2" fill="#ffd46a"/>' +
      '<circle cx="48" cy="112" r="2.2" fill="#8fd0ff"/><circle cx="62" cy="116" r="2" fill="#ff4f45"/>' +
      '<circle cx="36" cy="118" r="2" fill="#ffd46a"/></g>' +
      '<path d="M52 128v6h8v-6" fill="#6b412a"/>' +
      /* 门前雪地 */
      '<path d="M0 128Q50 120 100 128T200 126T260 130V140H0Z" fill="#f4fbff"/>' +
    '</svg>';

    /* 主角左边的一堆礼物：红 / 松绿 / 金，尺寸错开 */
    var gifts = '<svg class="xr-gifts" viewBox="0 0 110 60" fill="none" aria-hidden="true">' +
      '<rect x="2" y="28" width="30" height="30" rx="3" fill="#c9303a"/>' +
      '<rect x="2" y="24" width="30" height="7" rx="2" fill="#e04a48"/>' +
      '<path d="M17 24v34M2 40h30" stroke="#ffd46a" stroke-width="4"/>' +
      '<path d="M17 24c-8-10-14-2-6 0 4 1 6-2 6 0zM17 24c8-10 14-2 6 0-4 1-6-2-6 0z" fill="#ffd46a"/>' +
      '<rect x="36" y="34" width="26" height="24" rx="3" fill="#1c7a58"/>' +
      '<rect x="36" y="30" width="26" height="6" rx="2" fill="#2a9469"/>' +
      '<path d="M49 30v28M36 44h26" stroke="#fff0c9" stroke-width="3.4"/>' +
      '<path d="M49 30c-7-9-12-2-5 0 3 1 5-2 5 0zM49 30c7-9 12-2 5 0-3 1-5-2-5 0z" fill="#fff0c9"/>' +
      '<rect x="68" y="22" width="34" height="36" rx="3" fill="#e8b74e"/>' +
      '<rect x="68" y="18" width="34" height="7" rx="2" fill="#ffd674"/>' +
      '<path d="M85 18v40M68 38h34" stroke="#c9303a" stroke-width="4"/>' +
      '<path d="M85 18c-9-11-15-2-6 0 4 1 6-2 6 0zM85 18c9-11 15-2 6 0-4 1-6-2-6 0z" fill="#c9303a"/>' +
    '</svg>';

    /* 两朵软云 + 六角雪花（CSS 定位） */
    var clouds = '<svg class="xr-cloud c1" viewBox="0 0 80 34" aria-hidden="true"><path d="M12 26q-10 0-10-8 0-7 9-8 2-9 13-9 9 0 12 7 4-4 10-2 8 2 8 10 0 10-12 10z" fill="#dceaff" opacity=".72"/></svg>' +
      '<svg class="xr-cloud c2" viewBox="0 0 80 34" aria-hidden="true"><path d="M12 26q-10 0-10-8 0-7 9-8 2-9 13-9 9 0 12 7 4-4 10-2 8 2 8 10 0 10-12 10z" fill="#dceaff" opacity=".55"/></svg>';

    /* 底部雪丘：压在两个主角脚上，做出「从雪里探出来」的效果 */
    var snowbank = '<svg class="xr-snowbank" viewBox="0 0 600 30" preserveAspectRatio="none" aria-hidden="true">' +
      '<path d="M0 16Q50 6 100 15T200 12T300 18T400 10T500 17T600 12V30H0Z" fill="#e8f4ff" opacity=".85"/>' +
      '<path d="M0 22Q60 14 120 22T240 19T360 24T480 18T600 23V30H0Z" fill="#ffffff"/>' +
    '</svg>';

    return '<div class="hero-fx" aria-hidden="true">' +
      '<i class="xr-moon"></i>' +
      clouds + flakes +
      village + gifts +
      '<img class="xr-baby" src="assets/xmas/xmas-baby.png?v=20261112z210" alt="" />' +
      '<img class="xr-deer" src="assets/xmas/xmas-deer.png?v=20261112z210" alt="" />' +
      snowbank +
    '</div>';
  }

  /* 问候左侧的礼物盒图标，替掉原来的像素小店招牌 */
  function heroGift() {
    return '<div class="hero-icon" aria-hidden="true">' +
      '<svg viewBox="0 0 48 48" fill="none">' +
        '<rect x="7" y="19" width="34" height="23" rx="3" fill="#d8313c"/>' +
        '<rect x="7" y="19" width="34" height="23" rx="3" stroke="#ff8a7a" stroke-opacity=".55" stroke-width="1.2"/>' +
        '<rect x="5" y="15" width="38" height="7" rx="2.5" fill="#ee4b46"/>' +
        '<path d="M24 15v27M7 27h34" stroke="#ffd46a" stroke-width="4.2"/>' +
        '<path d="M24 15C15 4 8 12 17 15c3 .8 7-1 7 0z" fill="#ffd46a"/>' +
        '<path d="M24 15c9-11 16-3 7 0-3 .8-7-1-7 0z" fill="#ffdc84"/>' +
        '<circle cx="24" cy="15" r="3.2" fill="#ffe9a8"/>' +
      '</svg>' +
    '</div>';
  }

  /* 雪顶松树：一叠三角 + 枝头积雪，重复三次摆出远近。 */
  function pine(cls) {
    return '<svg class="xm-pine ' + cls + '" viewBox="0 0 40 56" aria-hidden="true">' +
      '<rect x="18" y="48" width="4" height="7" fill="#5b3a2a"/>' +
      '<path d="M20 2 7 23h6L4 41h8L6 50h28l-6-9h8L27 23h6z" fill="#0d3a34"/>' +
      '<path d="M20 2 13 14h14z" fill="#eaf6ff" opacity=".92"/>' +
      '<path d="M13 23q7 4 14 0l-3-3H16z" fill="#eaf6ff" opacity=".72"/>' +
      '<path d="M12 41q8 4 16 0l-3-3H15z" fill="#eaf6ff" opacity=".62"/>' +
      '</svg>';
  }

  /* 横幅左侧的图标：像素风街边小饭馆（z200 起替换掉 z195 的 CBD 夜景）。
     26×26 网格，1 格 = 2px 放大到 52px，shape-rendering:crispEdges 保证方块边不糊：
     红白条纹遮阳棚 + 暖光橱窗（窗里一碗热汤坐着、上面一缕热气）+ 透出暖光的门。
     z205：顶行改成一层积雪，红白棚子顺势成了圣诞配色，冬夜小店照样讲得通。
     图形别手改 —— 生成脚本在 .workbuddy/gen-rest.py，改完参数跑它再跑 sync-rest.py。 */
  function heroGlyph() {
    return '<div class="hero-icon" aria-hidden="true">' +
      '<svg class="px-svg" viewBox="0 0 26 26" shape-rendering="crispEdges" fill="none">' +
      '<rect x="1" y="0" width="24" height="1" fill="#eaf6ff"/>' +
      '<rect x="1" y="1" width="2" height="1" fill="#e8503a"/>' +
      '<rect x="3" y="1" width="2" height="1" fill="#ffe6c2"/>' +
      '<rect x="5" y="1" width="2" height="1" fill="#e8503a"/>' +
      '<rect x="7" y="1" width="2" height="1" fill="#ffe6c2"/>' +
      '<rect x="9" y="1" width="2" height="1" fill="#e8503a"/>' +
      '<rect x="11" y="1" width="2" height="1" fill="#ffe6c2"/>' +
      '<rect x="13" y="1" width="2" height="1" fill="#e8503a"/>' +
      '<rect x="15" y="1" width="2" height="1" fill="#ffe6c2"/>' +
      '<rect x="17" y="1" width="2" height="1" fill="#e8503a"/>' +
      '<rect x="19" y="1" width="2" height="1" fill="#ffe6c2"/>' +
      '<rect x="21" y="1" width="2" height="1" fill="#e8503a"/>' +
      '<rect x="23" y="1" width="2" height="1" fill="#ffe6c2"/>' +
      '<rect x="1" y="2" width="2" height="1" fill="#e8503a"/>' +
      '<rect x="3" y="2" width="2" height="1" fill="#ffe6c2"/>' +
      '<rect x="5" y="2" width="2" height="1" fill="#e8503a"/>' +
      '<rect x="7" y="2" width="2" height="1" fill="#ffe6c2"/>' +
      '<rect x="9" y="2" width="2" height="1" fill="#e8503a"/>' +
      '<rect x="11" y="2" width="2" height="1" fill="#ffe6c2"/>' +
      '<rect x="13" y="2" width="2" height="1" fill="#e8503a"/>' +
      '<rect x="15" y="2" width="2" height="1" fill="#ffe6c2"/>' +
      '<rect x="17" y="2" width="2" height="1" fill="#e8503a"/>' +
      '<rect x="19" y="2" width="2" height="1" fill="#ffe6c2"/>' +
      '<rect x="21" y="2" width="2" height="1" fill="#e8503a"/>' +
      '<rect x="23" y="2" width="2" height="1" fill="#ffe6c2"/>' +
      '<rect x="1" y="3" width="2" height="1" fill="#e8503a"/>' +
      '<rect x="3" y="3" width="2" height="1" fill="#ffe6c2"/>' +
      '<rect x="5" y="3" width="2" height="1" fill="#e8503a"/>' +
      '<rect x="7" y="3" width="2" height="1" fill="#ffe6c2"/>' +
      '<rect x="9" y="3" width="2" height="1" fill="#e8503a"/>' +
      '<rect x="11" y="3" width="2" height="1" fill="#ffe6c2"/>' +
      '<rect x="13" y="3" width="2" height="1" fill="#e8503a"/>' +
      '<rect x="15" y="3" width="2" height="1" fill="#ffe6c2"/>' +
      '<rect x="17" y="3" width="2" height="1" fill="#e8503a"/>' +
      '<rect x="19" y="3" width="2" height="1" fill="#ffe6c2"/>' +
      '<rect x="21" y="3" width="2" height="1" fill="#e8503a"/>' +
      '<rect x="23" y="3" width="2" height="1" fill="#ffe6c2"/>' +
      '<rect x="1" y="4" width="2" height="1" fill="#e8503a"/>' +
      '<rect x="5" y="4" width="2" height="1" fill="#e8503a"/>' +
      '<rect x="9" y="4" width="2" height="1" fill="#e8503a"/>' +
      '<rect x="13" y="4" width="2" height="1" fill="#e8503a"/>' +
      '<rect x="17" y="4" width="2" height="1" fill="#e8503a"/>' +
      '<rect x="21" y="4" width="2" height="1" fill="#e8503a"/>' +
      '<rect x="1" y="5" width="1" height="1" fill="#2b1b3f"/>' +
      '<rect x="2" y="5" width="13" height="1" fill="#170f28"/>' +
      '<rect x="15" y="5" width="3" height="1" fill="#2b1b3f"/>' +
      '<rect x="18" y="5" width="6" height="1" fill="#170f28"/>' +
      '<rect x="24" y="5" width="1" height="1" fill="#2b1b3f"/>' +
      '<rect x="1" y="6" width="1" height="1" fill="#3d2854"/>' +
      '<rect x="2" y="6" width="1" height="1" fill="#170f28"/>' +
      '<rect x="3" y="6" width="11" height="1" fill="#2b1b3f"/>' +
      '<rect x="14" y="6" width="1" height="1" fill="#170f28"/>' +
      '<rect x="15" y="6" width="3" height="1" fill="#3d2854"/>' +
      '<rect x="18" y="6" width="1" height="1" fill="#170f28"/>' +
      '<rect x="19" y="6" width="4" height="1" fill="#1d1132"/>' +
      '<rect x="23" y="6" width="1" height="1" fill="#170f28"/>' +
      '<rect x="24" y="6" width="1" height="1" fill="#3d2854"/>' +
      '<rect x="1" y="7" width="1" height="1" fill="#3d2854"/>' +
      '<rect x="2" y="7" width="1" height="1" fill="#170f28"/>' +
      '<rect x="3" y="7" width="11" height="1" fill="#2b1b3f"/>' +
      '<rect x="14" y="7" width="1" height="1" fill="#170f28"/>' +
      '<rect x="15" y="7" width="3" height="1" fill="#3d2854"/>' +
      '<rect x="18" y="7" width="1" height="1" fill="#170f28"/>' +
      '<rect x="19" y="7" width="1" height="1" fill="#1d1132"/>' +
      '<rect class="px-door" x="20" y="7" width="1" height="1" fill="#ffc87e"/>' +
      '<rect x="21" y="7" width="2" height="1" fill="#1d1132"/>' +
      '<rect x="23" y="7" width="1" height="1" fill="#170f28"/>' +
      '<rect x="24" y="7" width="1" height="1" fill="#3d2854"/>' +
      '<rect x="1" y="8" width="1" height="1" fill="#3d2854"/>' +
      '<rect x="2" y="8" width="1" height="1" fill="#170f28"/>' +
      '<rect x="3" y="8" width="5" height="1" fill="#ffb457"/>' +
      '<rect x="8" y="8" width="1" height="1" fill="#2b1b3f"/>' +
      '<rect x="9" y="8" width="5" height="1" fill="#ffb457"/>' +
      '<rect x="14" y="8" width="1" height="1" fill="#170f28"/>' +
      '<rect x="15" y="8" width="3" height="1" fill="#3d2854"/>' +
      '<rect x="18" y="8" width="1" height="1" fill="#170f28"/>' +
      '<rect x="19" y="8" width="1" height="1" fill="#1d1132"/>' +
      '<rect class="px-door" x="20" y="8" width="1" height="1" fill="#ffc87e"/>' +
      '<rect x="21" y="8" width="2" height="1" fill="#1d1132"/>' +
      '<rect x="23" y="8" width="1" height="1" fill="#170f28"/>' +
      '<rect x="24" y="8" width="1" height="1" fill="#3d2854"/>' +
      '<rect x="1" y="9" width="1" height="1" fill="#3d2854"/>' +
      '<rect x="2" y="9" width="1" height="1" fill="#170f28"/>' +
      '<rect x="3" y="9" width="1" height="1" fill="#ffdfae"/>' +
      '<rect x="4" y="9" width="3" height="1" fill="#ffb457"/>' +
      '<rect x="7" y="9" width="3" height="1" fill="#fff6e4"/>' +
      '<rect x="10" y="9" width="4" height="1" fill="#ffb457"/>' +
      '<rect x="14" y="9" width="1" height="1" fill="#170f28"/>' +
      '<rect x="15" y="9" width="3" height="1" fill="#3d2854"/>' +
      '<rect x="18" y="9" width="1" height="1" fill="#170f28"/>' +
      '<rect x="19" y="9" width="1" height="1" fill="#1d1132"/>' +
      '<rect class="px-door" x="20" y="9" width="1" height="1" fill="#ffc87e"/>' +
      '<rect x="21" y="9" width="2" height="1" fill="#1d1132"/>' +
      '<rect x="23" y="9" width="1" height="1" fill="#170f28"/>' +
      '<rect x="24" y="9" width="1" height="1" fill="#3d2854"/>' +
      '<rect x="1" y="10" width="1" height="1" fill="#3d2854"/>' +
      '<rect x="2" y="10" width="1" height="1" fill="#170f28"/>' +
      '<rect x="3" y="10" width="1" height="1" fill="#ffb457"/>' +
      '<rect x="4" y="10" width="1" height="1" fill="#ffdfae"/>' +
      '<rect x="5" y="10" width="2" height="1" fill="#ffb457"/>' +
      '<rect x="7" y="10" width="3" height="1" fill="#ffdfae"/>' +
      '<rect x="10" y="10" width="4" height="1" fill="#ffb457"/>' +
      '<rect x="14" y="10" width="1" height="1" fill="#170f28"/>' +
      '<rect x="15" y="10" width="3" height="1" fill="#3d2854"/>' +
      '<rect x="18" y="10" width="1" height="1" fill="#170f28"/>' +
      '<rect x="19" y="10" width="1" height="1" fill="#1d1132"/>' +
      '<rect class="px-door" x="20" y="10" width="1" height="1" fill="#ffc87e"/>' +
      '<rect x="21" y="10" width="2" height="1" fill="#1d1132"/>' +
      '<rect x="23" y="10" width="1" height="1" fill="#170f28"/>' +
      '<rect x="24" y="10" width="1" height="1" fill="#3d2854"/>' +
      '<rect x="1" y="11" width="1" height="1" fill="#3d2854"/>' +
      '<rect x="2" y="11" width="1" height="1" fill="#170f28"/>' +
      '<rect x="3" y="11" width="11" height="1" fill="#ffb457"/>' +
      '<rect x="14" y="11" width="1" height="1" fill="#170f28"/>' +
      '<rect x="15" y="11" width="3" height="1" fill="#3d2854"/>' +
      '<rect x="18" y="11" width="1" height="1" fill="#170f28"/>' +
      '<rect x="19" y="11" width="1" height="1" fill="#1d1132"/>' +
      '<rect class="px-door" x="20" y="11" width="1" height="1" fill="#ffc87e"/>' +
      '<rect x="21" y="11" width="2" height="1" fill="#1d1132"/>' +
      '<rect x="23" y="11" width="1" height="1" fill="#170f28"/>' +
      '<rect x="24" y="11" width="1" height="1" fill="#3d2854"/>' +
      '<rect x="1" y="12" width="1" height="1" fill="#3d2854"/>' +
      '<rect x="2" y="12" width="1" height="1" fill="#170f28"/>' +
      '<rect x="3" y="12" width="5" height="1" fill="#ffb457"/>' +
      '<rect class="px-steam s1" x="8" y="12" width="1" height="1" fill="#fff6e4"/>' +
      '<rect x="9" y="12" width="5" height="1" fill="#ffb457"/>' +
      '<rect x="14" y="12" width="1" height="1" fill="#170f28"/>' +
      '<rect x="15" y="12" width="3" height="1" fill="#3d2854"/>' +
      '<rect x="18" y="12" width="1" height="1" fill="#170f28"/>' +
      '<rect x="19" y="12" width="1" height="1" fill="#1d1132"/>' +
      '<rect class="px-door" x="20" y="12" width="1" height="1" fill="#ffc87e"/>' +
      '<rect x="21" y="12" width="2" height="1" fill="#1d1132"/>' +
      '<rect x="23" y="12" width="1" height="1" fill="#170f28"/>' +
      '<rect x="24" y="12" width="1" height="1" fill="#3d2854"/>' +
      '<rect x="1" y="13" width="1" height="1" fill="#3d2854"/>' +
      '<rect x="2" y="13" width="1" height="1" fill="#170f28"/>' +
      '<rect x="3" y="13" width="6" height="1" fill="#ffb457"/>' +
      '<rect class="px-steam s2" x="9" y="13" width="1" height="1" fill="#fff6e4"/>' +
      '<rect x="10" y="13" width="4" height="1" fill="#ffb457"/>' +
      '<rect x="14" y="13" width="1" height="1" fill="#170f28"/>' +
      '<rect x="15" y="13" width="3" height="1" fill="#3d2854"/>' +
      '<rect x="18" y="13" width="1" height="1" fill="#170f28"/>' +
      '<rect x="19" y="13" width="1" height="1" fill="#1d1132"/>' +
      '<rect class="px-door" x="20" y="13" width="1" height="1" fill="#ffc87e"/>' +
      '<rect x="21" y="13" width="2" height="1" fill="#1d1132"/>' +
      '<rect x="23" y="13" width="1" height="1" fill="#170f28"/>' +
      '<rect x="24" y="13" width="1" height="1" fill="#3d2854"/>' +
      '<rect x="1" y="14" width="1" height="1" fill="#3d2854"/>' +
      '<rect x="2" y="14" width="1" height="1" fill="#170f28"/>' +
      '<rect x="3" y="14" width="5" height="1" fill="#ffb457"/>' +
      '<rect class="px-steam s3" x="8" y="14" width="1" height="1" fill="#fff6e4"/>' +
      '<rect x="9" y="14" width="5" height="1" fill="#ffb457"/>' +
      '<rect x="14" y="14" width="1" height="1" fill="#170f28"/>' +
      '<rect x="15" y="14" width="3" height="1" fill="#3d2854"/>' +
      '<rect x="18" y="14" width="1" height="1" fill="#170f28"/>' +
      '<rect x="19" y="14" width="1" height="1" fill="#1d1132"/>' +
      '<rect class="px-door" x="20" y="14" width="1" height="1" fill="#ffc87e"/>' +
      '<rect x="21" y="14" width="2" height="1" fill="#1d1132"/>' +
      '<rect x="23" y="14" width="1" height="1" fill="#170f28"/>' +
      '<rect x="24" y="14" width="1" height="1" fill="#3d2854"/>' +
      '<rect x="1" y="15" width="1" height="1" fill="#3d2854"/>' +
      '<rect x="2" y="15" width="1" height="1" fill="#170f28"/>' +
      '<rect x="3" y="15" width="11" height="1" fill="#ffb457"/>' +
      '<rect x="14" y="15" width="1" height="1" fill="#170f28"/>' +
      '<rect x="15" y="15" width="3" height="1" fill="#3d2854"/>' +
      '<rect x="18" y="15" width="1" height="1" fill="#170f28"/>' +
      '<rect x="19" y="15" width="4" height="1" fill="#1d1132"/>' +
      '<rect x="23" y="15" width="1" height="1" fill="#170f28"/>' +
      '<rect x="24" y="15" width="1" height="1" fill="#3d2854"/>' +
      '<rect x="1" y="16" width="1" height="1" fill="#3d2854"/>' +
      '<rect x="2" y="16" width="1" height="1" fill="#170f28"/>' +
      '<rect x="3" y="16" width="1" height="1" fill="#ffb457"/>' +
      '<rect x="4" y="16" width="9" height="1" fill="#fff6e4"/>' +
      '<rect x="13" y="16" width="1" height="1" fill="#ffb457"/>' +
      '<rect x="14" y="16" width="1" height="1" fill="#170f28"/>' +
      '<rect x="15" y="16" width="3" height="1" fill="#3d2854"/>' +
      '<rect x="18" y="16" width="1" height="1" fill="#170f28"/>' +
      '<rect x="19" y="16" width="3" height="1" fill="#1d1132"/>' +
      '<rect x="22" y="16" width="1" height="1" fill="#ffdfae"/>' +
      '<rect x="23" y="16" width="1" height="1" fill="#170f28"/>' +
      '<rect x="24" y="16" width="1" height="1" fill="#3d2854"/>' +
      '<rect x="1" y="17" width="1" height="1" fill="#3d2854"/>' +
      '<rect x="2" y="17" width="1" height="1" fill="#170f28"/>' +
      '<rect x="3" y="17" width="1" height="1" fill="#ffb457"/>' +
      '<rect x="4" y="17" width="1" height="1" fill="#fff6e4"/>' +
      '<rect x="5" y="17" width="7" height="1" fill="#ffb457"/>' +
      '<rect x="12" y="17" width="1" height="1" fill="#fff6e4"/>' +
      '<rect x="13" y="17" width="1" height="1" fill="#ffb457"/>' +
      '<rect x="14" y="17" width="1" height="1" fill="#170f28"/>' +
      '<rect x="15" y="17" width="3" height="1" fill="#3d2854"/>' +
      '<rect x="18" y="17" width="1" height="1" fill="#170f28"/>' +
      '<rect x="19" y="17" width="4" height="1" fill="#1d1132"/>' +
      '<rect x="23" y="17" width="1" height="1" fill="#170f28"/>' +
      '<rect x="24" y="17" width="1" height="1" fill="#3d2854"/>' +
      '<rect x="1" y="18" width="1" height="1" fill="#3d2854"/>' +
      '<rect x="2" y="18" width="1" height="1" fill="#170f28"/>' +
      '<rect x="3" y="18" width="2" height="1" fill="#ffb457"/>' +
      '<rect x="5" y="18" width="1" height="1" fill="#fff6e4"/>' +
      '<rect x="6" y="18" width="5" height="1" fill="#ffb457"/>' +
      '<rect x="11" y="18" width="1" height="1" fill="#fff6e4"/>' +
      '<rect x="12" y="18" width="2" height="1" fill="#ffb457"/>' +
      '<rect x="14" y="18" width="1" height="1" fill="#170f28"/>' +
      '<rect x="15" y="18" width="3" height="1" fill="#3d2854"/>' +
      '<rect x="18" y="18" width="1" height="1" fill="#170f28"/>' +
      '<rect x="19" y="18" width="4" height="1" fill="#1d1132"/>' +
      '<rect x="23" y="18" width="1" height="1" fill="#170f28"/>' +
      '<rect x="24" y="18" width="1" height="1" fill="#3d2854"/>' +
      '<rect x="1" y="19" width="1" height="1" fill="#3d2854"/>' +
      '<rect x="2" y="19" width="1" height="1" fill="#170f28"/>' +
      '<rect x="3" y="19" width="3" height="1" fill="#ffb457"/>' +
      '<rect x="6" y="19" width="5" height="1" fill="#fff6e4"/>' +
      '<rect x="11" y="19" width="3" height="1" fill="#ffb457"/>' +
      '<rect x="14" y="19" width="1" height="1" fill="#170f28"/>' +
      '<rect x="15" y="19" width="3" height="1" fill="#3d2854"/>' +
      '<rect x="18" y="19" width="1" height="1" fill="#170f28"/>' +
      '<rect x="19" y="19" width="4" height="1" fill="#1d1132"/>' +
      '<rect x="23" y="19" width="1" height="1" fill="#170f28"/>' +
      '<rect x="24" y="19" width="1" height="1" fill="#3d2854"/>' +
      '<rect x="1" y="20" width="1" height="1" fill="#3d2854"/>' +
      '<rect x="2" y="20" width="1" height="1" fill="#170f28"/>' +
      '<rect x="3" y="20" width="11" height="1" fill="#2b1b3f"/>' +
      '<rect x="14" y="20" width="1" height="1" fill="#170f28"/>' +
      '<rect x="15" y="20" width="3" height="1" fill="#3d2854"/>' +
      '<rect x="18" y="20" width="1" height="1" fill="#170f28"/>' +
      '<rect x="19" y="20" width="4" height="1" fill="#1d1132"/>' +
      '<rect x="23" y="20" width="1" height="1" fill="#170f28"/>' +
      '<rect x="24" y="20" width="1" height="1" fill="#3d2854"/>' +
      '<rect x="1" y="21" width="1" height="1" fill="#3d2854"/>' +
      '<rect x="2" y="21" width="1" height="1" fill="#170f28"/>' +
      '<rect x="3" y="21" width="11" height="1" fill="#2b1b3f"/>' +
      '<rect x="14" y="21" width="1" height="1" fill="#170f28"/>' +
      '<rect x="15" y="21" width="3" height="1" fill="#3d2854"/>' +
      '<rect x="18" y="21" width="1" height="1" fill="#170f28"/>' +
      '<rect x="19" y="21" width="4" height="1" fill="#1d1132"/>' +
      '<rect x="23" y="21" width="1" height="1" fill="#170f28"/>' +
      '<rect x="24" y="21" width="1" height="1" fill="#3d2854"/>' +
      '<rect x="1" y="22" width="1" height="1" fill="#3d2854"/>' +
      '<rect x="2" y="22" width="1" height="1" fill="#170f28"/>' +
      '<rect x="3" y="22" width="11" height="1" fill="#2b1b3f"/>' +
      '<rect x="14" y="22" width="1" height="1" fill="#170f28"/>' +
      '<rect x="15" y="22" width="3" height="1" fill="#3d2854"/>' +
      '<rect x="18" y="22" width="1" height="1" fill="#170f28"/>' +
      '<rect x="19" y="22" width="4" height="1" fill="#1d1132"/>' +
      '<rect x="23" y="22" width="1" height="1" fill="#170f28"/>' +
      '<rect x="24" y="22" width="1" height="1" fill="#3d2854"/>' +
      '<rect x="1" y="23" width="1" height="1" fill="#3d2854"/>' +
      '<rect x="2" y="23" width="13" height="1" fill="#170f28"/>' +
      '<rect x="15" y="23" width="3" height="1" fill="#3d2854"/>' +
      '<rect x="18" y="23" width="6" height="1" fill="#170f28"/>' +
      '<rect x="24" y="23" width="1" height="1" fill="#3d2854"/>' +
      '<rect x="1" y="24" width="24" height="1" fill="#170f28"/>' +
      '</svg>' +
    '</div>';
  }

  /* 横幅右侧的小屋：z205 从「万圣夜枯树 + 南瓜」改成「雪夜暖灯小屋」。
     保留 150×80 的 viewBox 和窗户暖光的光晕（.hero-art 的 translateY 仍对齐雪地线），
     换掉的是：枯树 → 雪顶松树、深色屋顶 → 积雪屋顶、南瓜 → 门上的冬青花环与礼物。 */
  function heroArt() {
    return '<div class="hero-art"><svg viewBox="0 0 150 80" fill="none">' +
      '<defs>' +
        '<radialGradient id="xmWin" cx=".5" cy=".45" r=".65">' +
          '<stop offset="0" stop-color="#fff0c4"/><stop offset="1" stop-color="#ffbe5c"/>' +
        '</radialGradient>' +
        '<radialGradient id="xmWinHalo">' +
          '<stop offset="0" stop-color="#ffd28a" stop-opacity=".55"/>' +
          '<stop offset="1" stop-color="#ffd28a" stop-opacity="0"/>' +
        '</radialGradient>' +
      '</defs>' +
      /* 窗光洒在雪地上 */
      '<ellipse cx="86" cy="70" rx="34" ry="14" fill="url(#xmWinHalo)"/>' +
      /* 左侧雪顶松树（替掉原来的枯枝） */
      '<g>' +
        '<rect x="24" y="68" width="3" height="8" fill="#4a3526"/>' +
        '<path d="M25.5 42 14 60h5l-7 10h27l-7-10h5z" fill="#124a3d"/>' +
        '<path d="M25.5 42 20 51h11z" fill="#fff6ec" opacity=".92"/>' +
        '<path d="M19 60q7 3 13 0l-2-2H21z" fill="#eaf6ff" opacity=".7"/>' +
      '</g>' +
      /* 右侧一棵小一点的 */
      '<g>' +
        '<rect x="127" y="70" width="2.6" height="6" fill="#4a3526"/>' +
        '<path d="M128.3 50 119 63h4l-5 9h21l-5-9h4z" fill="#0f4238"/>' +
        '<path d="M128.3 50 124 57h9z" fill="#eaf6ff" opacity=".85"/>' +
      '</g>' +
      /* 房身（深松绿剪影） */
      '<path d="M52 76V45h46v31z" fill="#123c39"/>' +
      /* 屋顶 + 一层厚雪 */
      '<path d="M45 46 75 25l30 21z" fill="#2b5b4c"/>' +
      '<path d="M45 46 75 25l30 21-3 2-27-19-27 19z" fill="#f2f9ff"/>' +
      '<path d="M45 46h60l-3.5 5H48.5z" fill="#1c4a41"/>' +
      /* 屋檐灯串：六颗，红占三颗 */
      '<g>' +
        '<circle cx="54" cy="48" r="2.1" fill="#ff4f45"/>' +
        '<circle cx="64" cy="48" r="2.1" fill="#ffd46a"/>' +
        '<circle cx="74" cy="48" r="2.1" fill="#ff4f45"/>' +
        '<circle cx="84" cy="48" r="2.1" fill="#6fd6a2"/>' +
        '<circle cx="94" cy="48" r="2.1" fill="#ff4f45"/>' +
        '<circle cx="102" cy="48" r="2.1" fill="#ffd46a"/>' +
      '</g>' +
      /* 烟囱 + 一撮雪 + 炊烟 */
      '<rect x="88" y="27" width="8" height="13" rx="1.6" fill="#1d4a41"/>' +
      '<rect x="87" y="26" width="10" height="2.6" rx="1.2" fill="#f2f9ff"/>' +
      '<circle cx="92" cy="21" r="3.2" fill="#dcecff" opacity=".18"/>' +
      '<circle cx="96" cy="15" r="4" fill="#dcecff" opacity=".12"/>' +
      /* 门 + 冬青花环：z206 门改经典圣诞红，红果加大 */
      '<rect x="60" y="55" width="14" height="21" rx="2" fill="#a52f38"/>' +
      '<path d="M60 55h14M60 55v21M74 55v21" stroke="#e26455" stroke-opacity=".55" stroke-width="1"/>' +
      '<circle cx="67" cy="61" r="4.6" fill="none" stroke="#1c6b4b" stroke-width="2.4"/>' +
      '<circle cx="65.4" cy="59.4" r="1.6" fill="#ef4a44"/>' +
      '<circle cx="69" cy="59.2" r="1.6" fill="#cf3038"/>' +
      '<circle cx="68.4" cy="63.2" r="1.3" fill="#f2604f"/>' +
      '<circle cx="67" cy="69" r="1.1" fill="#ffd46a"/>' +
      /* 窗（暖光 + 十字窗棂 + 光晕） */
      '<rect x="80" y="53" width="15" height="12" rx="1.6" fill="url(#xmWin)"/>' +
      '<path d="M87.5 53v12M80 59h15" stroke="#123c39" stroke-width="1.5"/>' +
      '<rect x="80" y="53" width="15" height="12" rx="1.6" stroke="#ffe0a4" stroke-opacity=".85"/>' +
      /* 阁楼小窗 */
      '<circle cx="75" cy="37" r="3.4" fill="#ffd489" opacity=".92"/>' +
      '<circle cx="75" cy="37" r="6" fill="url(#xmWinHalo)"/>' +
      /* 门口平台 + 围栏积雪 */
      '<rect x="55" y="72" width="42" height="3" rx="1" fill="#1d4a41"/>' +
      '<rect x="55" y="71" width="42" height="1.6" rx=".8" fill="#fff6ec" opacity=".92"/>' +
      /* 门前礼物盒（替掉两颗南瓜） */
      '<rect x="98" y="68" width="9" height="8" rx="1" fill="#cf3038"/>' +
      '<path d="M102.5 68v8M98 71.5h9" stroke="#ffd46a" stroke-width="1.6"/>' +
      '<rect x="108" y="71" width="6" height="5" rx="1" fill="#e23b3f"/>' +
      '<path d="M111 71v5" stroke="#fff0c9" stroke-width="1.1"/>' +
      '<rect x="52" y="71" width="6" height="5" rx="1" fill="#176b52"/>' +
      '<path d="M55 71v5" stroke="#fff0c9" stroke-width="1.3"/>' +
      '</svg></div>';
  }

  /* ================= 天气：真实数据 + 按天气动起来 =================
     数据源 Open-Meteo（不用 key，响应头带 access-control-allow-origin:*，
     所以 file:// 双击打开也取得到）。城市取「系统设置 → 天气城市」，默认上海。
     取不到就退回设置里手填的温度/描述，绝不让横幅上空一块。
     缓存 20 分钟：open-meteo 的 current 每 15 分钟更新一次，没必要每次进首页都打。 */

  var WX_KEY = 'sbs.weather.v1';
  var WX_TTL = 20 * 60 * 1000;

  /* WMO weather code → [中文文案, 动效类型] */
  var WX_CODES = {
    0: ['晴', 'clear'],
    1: ['晴间多云', 'partly'],
    2: ['多云', 'cloudy'],
    3: ['阴', 'overcast'],
    45: ['有雾', 'fog'],
    48: ['雾凇', 'fog'],
    51: ['小毛毛雨', 'drizzle'],
    53: ['毛毛雨', 'drizzle'],
    55: ['浓毛毛雨', 'drizzle'],
    56: ['冻毛毛雨', 'drizzle'],
    57: ['冻毛毛雨', 'drizzle'],
    61: ['小雨', 'rain'],
    63: ['中雨', 'rain'],
    65: ['大雨', 'heavy'],
    66: ['冻雨', 'rain'],
    67: ['强冻雨', 'heavy'],
    71: ['小雪', 'snow'],
    73: ['中雪', 'snow'],
    75: ['大雪', 'snow'],
    77: ['米雪', 'snow'],
    80: ['阵雨', 'rain'],
    81: ['强阵雨', 'rain'],
    82: ['暴雨', 'heavy'],
    85: ['阵雪', 'snow'],
    86: ['强阵雪', 'snow'],
    95: ['雷阵雨', 'thunder'],
    96: ['雷阵雨伴冰雹', 'thunder'],
    99: ['雷暴伴冰雹', 'thunder']
  };

  /* 常用城市的坐标（省一次地理编码请求）；表里没有的城市走 geocoding 接口 */
  var CITY_COORDS = {
    上海: [31.23, 121.47], 北京: [39.90, 116.41], 广州: [23.13, 113.26], 深圳: [22.54, 114.06],
    杭州: [30.27, 120.15], 南京: [32.06, 118.80], 苏州: [31.30, 120.58], 无锡: [31.49, 120.31],
    宁波: [29.87, 121.55], 合肥: [31.82, 117.23], 成都: [30.57, 104.07], 重庆: [29.56, 106.55],
    武汉: [30.59, 114.31], 长沙: [28.23, 112.94], 西安: [34.34, 108.94], 郑州: [34.75, 113.63],
    济南: [36.65, 117.12], 青岛: [36.07, 120.38], 天津: [39.08, 117.20], 沈阳: [41.81, 123.43],
    大连: [38.91, 121.61], 福州: [26.07, 119.30], 厦门: [24.48, 118.09], 昆明: [25.04, 102.72],
    东莞: [23.02, 113.75], 佛山: [23.02, 113.12], 南昌: [28.68, 115.86], 贵阳: [26.65, 106.63],
    南宁: [22.82, 108.32], 海口: [20.04, 110.32], 石家庄: [38.04, 114.51], 太原: [37.87, 112.55],
    兰州: [36.06, 103.83], 哈尔滨: [45.80, 126.53], 长春: [43.82, 125.32], 乌鲁木齐: [43.83, 87.62],
    呼和浩特: [40.84, 111.75], 温州: [28.00, 120.67], 常州: [31.81, 119.97], 徐州: [34.26, 117.19]
  };

  function wxCacheGet() {
    try {
      var o = JSON.parse(localStorage.getItem(WX_KEY) || 'null');
      if (o && o.city && (Date.now() - o.at) < WX_TTL) return o;
    } catch (e) {}
    return null;
  }

  function wxCacheSet(o) {
    try { localStorage.setItem(WX_KEY, JSON.stringify(o)); } catch (e) {}
  }

  function wxCityName() {
    var set = (S.getState() && S.getState().settings) || {};
    return String(set.weatherCity || '上海').trim() || '上海';
  }

  function wxCoordsOf(city) {
    var hit = CITY_COORDS[city];
    if (hit) return Promise.resolve({ lat: hit[0], lon: hit[1], name: city });
    var url = 'https://geocoding-api.open-meteo.com/v1/search?count=1&language=zh&format=json&name=' +
      encodeURIComponent(city);
    return fetch(url, { mode: 'cors' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var it = j && j.results && j.results[0];
        if (!it) throw new Error('找不到这个城市');
        return { lat: it.latitude, lon: it.longitude, name: it.name || city };
      });
  }

  function wxFetch() {
    var city = wxCityName();
    return wxCoordsOf(city).then(function (pos) {
      var url = 'https://api.open-meteo.com/v1/forecast' +
        '?latitude=' + pos.lat + '&longitude=' + pos.lon +
        '&current=temperature_2m,weather_code,is_day' +
        '&timezone=Asia%2FShanghai&_=' + Date.now();
      return fetch(url, { mode: 'cors' })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          var cur = j && j.current;
          if (!cur || cur.temperature_2m == null) throw new Error('天气接口没返回数据');
          var o = {
            at: Date.now(),
            city: pos.name,
            temp: Math.round(cur.temperature_2m),
            code: Number(cur.weather_code) || 0,
            isDay: cur.is_day == null ? 1 : Number(cur.is_day)
          };
          wxCacheSet(o);
          return o;
        });
    });
  }

  /* 一个 26×26 的小图标，元素带 .wx-* 类，动画全交给 CSS */
  function wxIcon(kind, isDay) {
    var sun = '<g class="wx-sun">' +
      '<circle cx="13" cy="13" r="4.3" fill="#ffb02e"/>' +
      '<g stroke="#ffb02e" stroke-width="1.5" stroke-linecap="round">' +
        '<path d="M13 3.6v2.1M13 20.3v2.1M3.6 13h2.1M20.3 13h2.1' +
              'M6.4 6.4l1.5 1.5M18.1 18.1l1.5 1.5M19.6 6.4l-1.5 1.5M7.9 18.1l-1.5 1.5"/>' +
      '</g></g>';

    var moon = '<g class="wx-moon">' +
      '<path d="M17 16.2a5.7 5.7 0 0 1-7.2-7.4 6.7 6.7 0 1 0 7.2 7.4z" fill="#8492d6"/>' +
      '<circle cx="18.4" cy="7.6" r=".8" fill="#c3cbf2"/>' +
      '<circle cx="20.6" cy="11.2" r=".6" fill="#c3cbf2"/></g>';

    var cloud = '<g class="wx-cloud">' +
      '<path d="M7 18.6h10.6a3.3 3.3 0 0 0 .2-6.6 4.9 4.9 0 0 0-9.3-1.1A3.7 3.7 0 0 0 7 18.6z" ' +
        'fill="#eaf0fb" stroke="#b3c2dd" stroke-width="1.1"/></g>';

    var cloud2 = '<g class="wx-cloud wx-cloud-2">' +
      '<path d="M4.4 15.2h7.4a2.6 2.6 0 0 0 .1-5.2 3.9 3.9 0 0 0-7.4-.9 2.9 2.9 0 0 0-.1 6.1z" ' +
        'fill="#f4f7fe" stroke="#c3cfe6" stroke-width="1"/></g>';

    function drops(n, cls, big) {
      var out = '';
      for (var i = 0; i < n; i++) {
        var x = 8.6 + i * 2.9;
        out += '<line class="wx-drop' + (big ? ' wx-drop-big' : '') + '" x1="' + x + '" y1="19.4" ' +
          'x2="' + (x - 0.6) + '" y2="22.6" stroke="#3f8ae8" stroke-width="1.7" stroke-linecap="round" ' +
          'style="animation-delay:' + (i * 0.28).toFixed(2) + 's"/>';
      }
      return out;
    }

    function flakes(n) {
      var out = '';
      for (var i = 0; i < n; i++) {
        var x = 8.8 + i * 3.1;
        out += '<circle class="wx-flake" cx="' + x + '" cy="21" r="1.25" fill="#8fbce9" ' +
          'style="animation-delay:' + (i * 0.55).toFixed(2) + 's"/>';
      }
      return out;
    }

    var bolt = '<path class="wx-bolt" d="M14 16.8l-3 4.4h2.1l-1.2 3.6 4-5.2h-2.3l1.4-2.8z" ' +
      'fill="#ffc53d" stroke="#f0a300" stroke-width=".6"/>';

    var fogLines = '<g class="wx-fog" stroke="#b7c4dd" stroke-width="1.4" stroke-linecap="round">' +
      '<path d="M5.2 19.6h13.6"/><path d="M7.4 22.4h9.4" style="animation-delay:-1.6s"/></g>';

    var body;
    if (kind === 'clear') body = isDay ? sun : moon;
    else if (kind === 'partly') body = (isDay ? sun.replace('cx="13" cy="13" r="4.3"',
      'cx="9.6" cy="9.6" r="3.6"') : moon) + cloud;
    else if (kind === 'cloudy') body = cloud2 + cloud;
    else if (kind === 'overcast') body = cloud.replace('fill="#eaf0fb"', 'fill="#dde5f4"') + cloud2;
    else if (kind === 'fog') body = cloud + fogLines;
    else if (kind === 'drizzle') body = cloud + drops(2, 'drizzle', false);
    else if (kind === 'rain') body = cloud + drops(3, 'rain', false);
    else if (kind === 'heavy') body = cloud + drops(4, 'heavy', true);
    else if (kind === 'snow') body = cloud + flakes(3);
    else if (kind === 'thunder') body = cloud + drops(2, 'thunder', false) + bolt;
    else body = cloud;

    return '<svg class="wx-svg" viewBox="0 0 26 26" fill="none" aria-hidden="true">' + body + '</svg>';
  }

  function wxHtml(w) {
    var set = (S.getState() && S.getState().settings) || {};
    if (!w) {
      /* 还没取到：先显示手填的兜底值，取到会被原地替换 */
      return '<span class="wx wx-loading"><svg class="wx-svg" viewBox="0 0 26 26" fill="none">' +
          '<path d="M7 18.6h10.6a3.3 3.3 0 0 0 .2-6.6 4.9 4.9 0 0 0-9.3-1.1A3.7 3.7 0 0 0 7 18.6z" ' +
          'fill="#eaf0fb" stroke="#b3c2dd" stroke-width="1.1"/></svg></span>' +
        '<span class="wx-main"><b>' + (set.weatherTemp || 26) + '°C</b>' +
          '<span>' + U.esc(set.weatherText || '多云') + '</span></span>' +
        '<span class="wx-sub">' + U.esc(wxCityName()) + ' · 手动设置</span>';
    }
    var d = WX_CODES[w.code] || ['天气', 'cloudy'];
    var hm = new Date(w.at);
    var clock = U.pad2(hm.getHours()) + ':' + U.pad2(hm.getMinutes());
    var tip = '数据来源 Open-Meteo · ' + clock + ' 更新';
    return '<span class="wx wx-' + d[1] + '" title="' + tip + '">' + wxIcon(d[1], w.isDay) + '</span>' +
      '<span class="wx-main"><b>' + w.temp + '°C</b>' +
        '<span>' + U.esc(d[0]) + '</span></span>' +
      '<span class="wx-sub">' + U.esc(w.city) + ' · ' + clock + '</span>';
  }

  /* 只换天气那一块，不整页重画（否则筛选、展开状态全没了） */
  function paintWeather(root, w) {
    var box = root && root.querySelector('.hd-weather');
    if (!box) return;
    box.innerHTML = wxHtml(w);
  }

  function loadWeather(root) {
    var cached = wxCacheGet();
    paintWeather(root, cached);

    /* 没有 fetch（老浏览器 / 测试环境）：缓存或手填兜底已经画上去了，到此为止 */
    if (typeof fetch !== 'function') return;

    var p;
    try { p = wxFetch(); } catch (e) { return; }

    p.then(function (w) {
      paintWeather(root, w);
    }).catch(function (e) {
      /* 取不到：有缓存就继续用缓存（比手填值新），没有才退回手填值 */
      if (cached) return;
      var box = root && root.querySelector('.hd-weather');
      if (box) {
        box.innerHTML = wxHtml(null);
        box.setAttribute('title', '实时天气获取失败（' + ((e && e.message) || '网络不可用') +
          '），现在显示的是系统设置里手填的温度和天气');
      }
    });
  }

  function render() {
    var s = S.getState();
    var st = S.stats();
    var set = s.settings;
    var t0 = U.today();

    var doingStores = s.stores.filter(function (x) {
      return x.stage !== '已开业' && !riskOf(x);
    }).length;   /* 跟「进行中」小窗同一口径：没开业、也没标风险 */

    /* ---- KPI ---- */
    var kpis = [
      {
        key: 'all', label: '筹建门店', value: st.totalStores, foot: '总门店数',
        color: '#2f56f0', soft: '#e3eaff', icon: 'box',
        tip: '点击查看这 ' + st.totalStores + ' 家门店'
      },
      {
        key: 'opened', label: '已开业', value: st.opened, foot: U.pct(st.opened, st.totalStores),
        color: '#0aa564', soft: '#dcf7ea', icon: 'check',
        tip: '点击查看已开业的 ' + st.opened + ' 家门店'
      },
      {
        key: 'doing', label: '进行中', value: doingStores, foot: U.pct(doingStores, st.totalStores),
        color: '#0190bf', soft: '#d9f3fd', icon: 'chart',
        tip: '点击查看正在筹建的 ' + doingStores + ' 家门店',
        help: '还没开业、也没把风险等级标成<b>高危 / 逾期</b>的门店 —— ' +
              '风险门店单独统计，不会在这张卡里重复算一次。'
      },
      {
        key: 'risk', label: '风险门店', value: st.riskStores, foot: U.pct(st.riskStores, st.totalStores),
        color: '#e97a06', soft: '#fdecdb', icon: 'alert',
        tip: '点击查看 ' + st.riskStores + ' 家风险门店',
        help: '门店档案里「风险等级」标为<b>高危</b>或<b>逾期</b>的门店（占比 = 风险门店数 ÷ 门店总数）。' +
              '「关注」不算风险；等级在门店详情里手动维护。'
      },
      {
        key: 'overdue', label: '逾期任务', value: st.taskCounts.overdue, foot: U.pct(st.taskCounts.overdue, st.taskCounts.total),
        color: '#e83a2f', soft: '#ffe6e3', icon: 'clock',
        tip: '点击查看 ' + st.taskCounts.overdue + ' 条逾期任务在哪些门店',
        help: '还没做的任务里，今天已经过了<b>建议完成日</b>的：' +
              '建议完成日 = 门店计划开业日 − 该任务的开业前天数（可为单条任务延后）。' +
              '门店没填开业日的不判逾期；占比 = 逾期数 ÷ 全部任务数。'
      },
      {
        key: 'notify', label: '7天内该通知', value: st.arrivals7, foot: U.pct(st.arrivals7, st.totalStores),
        color: '#6d3fe8', soft: '#ece5ff', icon: 'truck',
        tip: '点击查看 ' + st.arrivals7 + ' 项该通知供应商的物料',
        help: '登记了到货日、<b>7 天内</b>要到的物料，且还没标「已通知供应商」的。' +
              '没填到货日的不会算进来（没法判断哪天到）。'
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
      return '<div class="kpi is-clickable" data-kpi="' + k.key + '" role="button" tabindex="0"' +
          ' title="' + U.esc(k.tip) + '">' +
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
      return '<div class="sl-item' + (filterStage === sc.key ? ' on' : '') + '" data-stage="' + U.esc(sc.key) + '"' +
        ' title="只看「' + U.esc(sc.key) + '」的门店">' +
        '<i class="sl-dot" style="background:' + sc.color + '"></i>' +
        '<span class="sl-name">' + U.esc(sc.key) + '</span>' +
        '<span class="sl-num" style="color:' + sc.color + '">' + sc.count + '</span>' +
        '<span class="sl-unit">家</span>' +
      '</div>';
    }).join('');

    /* ---- 团队 ---- */
    var teamHtml = st.team.map(function (m, i) {
      return '<div class="team-row" data-member="' + m.id + '">' +
        UI.avatar(m.name, m.color, 'md', m.animal) +
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

    /* 团队卡底部概览：全队待办 / 逾期汇总，把卡片垫到和左侧进度总览持平 */
    var teamTodo = 0, teamLate = 0;
    st.team.forEach(function (m) { teamTodo += (m.todo || 0); teamLate += (m.late || 0); });
    var teamFootHtml = '<div class="team-foot">' +
      '<div class="team-foot-stats">' +
        '<div class="tf-stat"><b>' + teamTodo + '</b><span>全队待办</span></div>' +
        '<div class="tf-stat"><b style="color:' + (teamLate > 0 ? 'var(--red)' : 'var(--text)') + '">' + teamLate + '</b><span>逾期</span></div>' +
        '<div class="tf-stat"><b>' + st.team.length + '</b><span>成员</span></div>' +
      '</div>' +
      '<button class="btn btn-ghost btn-block" data-go="team">查看全部成员</button>' +
    '</div>';

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

    /* 近 7 天到货量卡底部统计：7 天总到货、今日到货 */
    var trendSum = 0, trendToday = 0;
    st.trend.forEach(function (t, i) {
      trendSum += t.count;
      if (i === st.trend.length - 1) trendToday = t.count;
    });

    return '' +
    /* Hero */
    '<section class="hero fade-up">' +
      /* 装饰层：一块「经典红绿圣诞窗景」——远（金色星光 + 暖雪雾 + 载着圣诞老人的
         驯鹿雪橇）、中（居中圣诞花环 + 雪丘 + 松树 + 圣诞树 + 雪人 + 礼物）、
         近（落雪 + 雪堆 + 灯串 + 冬青 + 金铃铛）。纯 CSS 动画，不挡任何内容。 */
      xmRefScene() +
      heroGift() +
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
        '<div class="hd-weather">' + wxHtml(wxCacheGet()) + '</div>' +
      '</div>' +
    '</section>' +


    /* KPI */
    '<section class="kpi-grid fade-up" style="animation-delay:.04s">' + kpiHtml + '</section>' +

    /* 进度总览 + 团队 */
    '<section class="home-grid-2 fade-up" style="animation-delay:.08s">' +
      '<div class="card accent-blue">' +
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
        '<div class="table-wrap stage-scroll"><table class="tbl">' +
          '<thead><tr>' +
            '<th>门店名称</th><th>省份</th><th>开业日期</th><th title="已完成任务 / 任务总计">整体进度</th>' +
            '<th>当前阶段</th><th>风险等级</th><th>负责人</th><th>操作</th>' +
          '</tr></thead>' +
          '<tbody data-role="stageBody">' + tableRows + '</tbody>' +
        '</table></div>' +
        '<div class="stage-foot" data-role="stageFoot">' + footHtml(s) + '</div>' +
      '</div>' +

      '<div class="card accent-green">' +
        '<div class="card-head">' +
          '<h3>团队工作台</h3><span class="card-sub">（' + st.team.length + '人）</span>' +
          '<div class="card-tools"><span class="link-more" data-go="team">全部成员 →</span></div>' +
        '</div>' +
        '<div class="team-list team-list-scroll">' + (teamHtml || UI.empty('还没有成员')) + '</div>' +
        (st.team.length ? teamFootHtml : '') +
      '</div>' +
    '</section>' +

    /* 三小卡 */
    '<section class="home-grid-3 fade-up" style="animation-delay:.12s">' +
      '<div class="card accent-red">' +
        '<div class="card-head">' +
          '<h3>今日重点关注</h3>' +
          '<span class="badge" style="color:var(--red);background:var(--red-soft)">' + st.focus.length + '</span>' +
          '<div class="card-tools"><span class="link-more" data-go="alerts">查看全部 →</span></div>' +
        '</div>' +
        '<div class="focus-list">' + focusHtml + '</div>' +
      '</div>' +

      '<div class="card accent-violet">' +
        '<div class="card-head"><h3>任务状态分布</h3></div>' +
        '<div class="donut-wrap">' +
          Charts.donut(donutItems, { size: 150, centerLabel: '总任务', centerValue: tc.total }) +
          '<div class="donut-legend">' + donutLegend + '</div>' +
        '</div>' +
        '<div class="donut-foot">' +
          '<div class="tf-stat"><b>' + U.pct(tc.done, tc.total) + '</b><span>完成率</span></div>' +
          '<div class="tf-stat"><b>' + st.todayTasks + '</b><span>今日待办</span></div>' +
          '<div class="tf-stat"><b>' + st.weekTasks + '</b><span>本周待推进</span></div>' +
        '</div>' +
      '</div>' +

      '<div class="card accent-teal">' +
        '<div class="card-head">' +
          '<h3>近 7 天到货量</h3>' +
          '<div class="card-tools"><span class="link-more" data-go="reports">明细 →</span></div>' +
        '</div>' +
        Charts.bars(st.trend) +
        '<div class="arrival-foot">' +
          '<span>即将到货（7 天内）</span>' +
          '<span><b>' + upcomingStores + '</b> <span class="dim" style="font-size:12px">家</span></span>' +
        '</div>' +
        '<div class="arrival-stats">' +
          '<div class="tf-stat"><b>' + trendSum + '</b><span>7 天到货</span></div>' +
          '<div class="tf-stat"><b>' + trendToday + '</b><span>今日到货</span></div>' +
          '<div class="tf-stat"><b>' + st.arrivals7 + '</b><span>待通知</span></div>' +
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

  /* 判断逻辑气泡：默认从 ⓘ 往右下展开。
     卡片靠右（或窄屏）时 254px 会顶出屏幕 → 加 is-right 翻到左边对齐。
     hover 和点击都走一遍，触屏只有点击。 */
  function placeTip(help) {
    var pop = help.querySelector('.kpi-help-pop');
    if (!pop) return;
    pop.classList.remove('is-right');
    var r = pop.getBoundingClientRect();
    var vw = document.documentElement.clientWidth || window.innerWidth || 0;
    if (r.right > vw - 12) pop.classList.add('is-right');
  }

  /* 收起所有展开的判断逻辑气泡，顺手清掉卡片的抬层级 class */
  function closeTips(root) {
    var list = root.querySelectorAll('.kpi-help.is-open');
    for (var i = 0; i < list.length; i++) {
      list[i].classList.remove('is-open');
      var card = list[i].closest('.kpi');
      if (card) card.classList.remove('is-tip-open');
    }
  }

  function mount(root) {
    /* 天气：先用手上的缓存/兜底值画出来，再异步换真实数据 */
    loadWeather(root);


    /* 先按当前宽度把每个判断逻辑气泡定好位（2026-10-25 z105）。
       气泡宽 254px，默认从 ⓘ 往右展开；最右边那张卡的气泡即使没展开
       （visibility:hidden 仍参与布局），也会把整页撑出一条横向滚动条。
       提前跑一遍 placeTip，该翻到左边的先翻过去。 */
    try {
      root.querySelectorAll('.kpi-help').forEach(placeTip);
    } catch (e) { /* 老浏览器没有 forEach 就算了，不影响功能 */ }

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
        closeTips(root);
        if (!wasOpen) {
          help.classList.add('is-open');
          var card = help.closest('.kpi');
          if (card) card.classList.add('is-tip-open');   /* 卡片抬层级，气泡才不会被右边的卡压住 */
          placeTip(help);
        }
        return;
      }

      /* 点到别处 → 收起展开的浮层 */
      closeTips(root);

      /* KPI 卡片 → 弹出「这几家是谁」（ⓘ 在上面已 return，不会误触） */
      var kpiEl = t.closest('.kpi[data-kpi]');
      if (kpiEl) { showKpiStores(kpiEl.getAttribute('data-kpi')); return; }

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

    /* 键盘：卡片上 Enter / 空格 = 点一下；ⓘ 上则是展开判断逻辑 */
    root.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
      var t = e.target;
      if (!t || !t.closest) return;

      var helpEl = t.closest('.kpi-help');
      if (helpEl) {
        e.preventDefault();
        var willOpen = !helpEl.classList.contains('is-open');
        closeTips(root);
        if (willOpen) {
          helpEl.classList.add('is-open');
          var card = helpEl.closest('.kpi');
          if (card) card.classList.add('is-tip-open');
          placeTip(helpEl);
        }
        return;
      }

      var kpiEl = t.closest('.kpi[data-kpi]');
      if (kpiEl) {
        e.preventDefault();
        closeTips(root);
        showKpiStores(kpiEl.getAttribute('data-kpi'));
      }
    });

    /* hover 展开的也做一次边界判断（不用等点击） */
    root.addEventListener('mouseover', function (e) {
      var help = e.target && e.target.closest ? e.target.closest('.kpi-help') : null;
      if (help) placeTip(help);
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

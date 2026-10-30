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

  /* ================= 万圣夜场景（z171） =================
     参考了 CodePen / GitHub 上几个评价不错的万圣节横幅（CSS Fog Animation、
     Haunted Loop、Halloween-page 那几个），共同做法都是同一套：
       · 分远 / 中 / 近三层，越靠前越暗越大，靠层叠和雾拉开空间，而不是堆形状
       · 月亮给「晕」，不是给一个硬边圆
       · 蝙蝠一律剪影（不是画圆脸），靠抖动 + 大小差表现远近
       · 雾用几层模糊的径向渐变横着慢慢飘
     这里照着这四条重排，替换掉原来那套平涂贴纸（骷髅 / 圆脸蝙蝠 / 棒棒糖小树）。
     纯 SVG + CSS，无外部图片、无 JS 动画。 */
  function hwScene() {
    return '<div class="hero-fx" aria-hidden="true">' +
      /* 底子：三团柔光 + 流动点阵 + 星光（沿用原来的，负责"空气感"） */
      '<i class="hf-blob hf-b1"></i><i class="hf-blob hf-b2"></i><i class="hf-blob hf-b3"></i>' +
      '<i class="hf-spark hf-s1"></i><i class="hf-spark hf-s2"></i><i class="hf-spark hf-s3"></i>' +
      '<i class="hf-spark hf-s4"></i>' +

      /* ---------- 前景框：从顶边垂下来的枯枝（摄影构图里的"压角"，一下就有纵深） ---------- */
      '<svg class="hw-branch" viewBox="0 0 220 44" fill="none" stroke="#0e0918" stroke-linecap="round" aria-hidden="true">' +
        '<path d="M0 9C34 4 66 12 100 6S160 9 218 3" stroke-width="4.4"/>' +
        '<path d="M46 8c2.6 6 3.6 11 3 17" stroke-width="2.4"/>' +
        '<path d="M100 6c-1 4.4-.6 7.4 1.6 10" stroke-width="1.3"/>' +
        '<path d="M80 9c-2 5.4-2.6 9.6-1.4 14.4" stroke-width="1.6"/>' +
        '<path d="M126 6c2.4 5 4.4 9 7.6 12.6" stroke-width="2"/>' +
        '<path d="M170 6c-1.6 4.6-3.4 8-2.4 11.6" stroke-width="1.4"/>' +
        '<path d="M49 24c3 2 5.2 4.4 6.4 7.4" stroke-width="1.1"/>' +
        '<path d="M79 22c-2.2 3-4 5.2-7 6.6" stroke-width="1.1"/>' +
        '<path d="M134 18c1.6 2.6 2.4 4.8 2.2 7.2" stroke-width="1"/>' +
      '</svg>' +

      /* ---------- 远景 1：月晕（大范围暖光，月亮才有"发光"的感觉） ---------- */
      '<i class="hw-glow"></i>' +

      /* ---------- 远景 2：月亮（渐变 + 柔坑 + 一圈月牙高光） ---------- */
      '<svg class="hw-moon" viewBox="0 0 240 120" aria-hidden="true">' +
        '<defs>' +
          '<linearGradient id="hwMoonG" x1="0" y1="0" x2="0.2" y2="1">' +
            '<stop offset="0" stop-color="#ffc978"/><stop offset=".34" stop-color="#ff9f36"/>' +
            '<stop offset=".78" stop-color="#ea7f1e"/><stop offset="1" stop-color="#c25c0d"/>' +
          '</linearGradient>' +
          '<clipPath id="hwMoonClip"><path d="M0 120A120 120 0 0 1 240 120Z"/></clipPath>' +
          '<radialGradient id="hwCrt">' +
            '<stop offset="0" stop-color="#9c4d0c" stop-opacity=".5"/>' +
            '<stop offset=".62" stop-color="#9c4d0c" stop-opacity=".26"/>' +
            '<stop offset="1" stop-color="#a8560f" stop-opacity="0"/>' +
          '</radialGradient>' +
        '</defs>' +
        '<path d="M0 120A120 120 0 0 1 240 120Z" fill="url(#hwMoonG)"/>' +
        /* 坑：小、实、每档都不同大小，比一堆大渐变印子像月面 */
        '<g fill="url(#hwCrt)">' +
          '<ellipse cx="78" cy="92" rx="15" ry="10"/><ellipse cx="128" cy="66" rx="11" ry="7.5"/>' +
          '<ellipse cx="176" cy="96" rx="12" ry="8"/><ellipse cx="212" cy="76" rx="7" ry="5"/>' +
          '<ellipse cx="48" cy="114" rx="9" ry="6"/><ellipse cx="152" cy="86" rx="6" ry="4.5"/>' +
          '<ellipse cx="104" cy="112" rx="5" ry="3.5"/><ellipse cx="196" cy="54" rx="4" ry="3"/>' +
        '</g>' +
        /* 底部压暗：月亮"落地"处不该和地面一样亮 */
        '<g clip-path="url(#hwMoonClip)">' +
          '<ellipse cx="120" cy="134" rx="120" ry="20" fill="#8a3f0c" opacity=".16"/>' +
        '</g>' +
        '<path d="M0 120A120 120 0 0 1 240 120" fill="none" stroke="#fff0d2" stroke-opacity=".3" stroke-width="1.4"/>' +
      '</svg>' +

      /* ---------- 远景 3：薄云（横向拉长的模糊亮带，只负责"天有层次"） ---------- */
      '<i class="hw-cloud hw-cloud-a"></i><i class="hw-cloud hw-cloud-b"></i>' +

      /* ---------- 远景 4：夜雾（两层模糊渐变，方向相反慢慢飘） ---------- */
      '<i class="hw-fog hw-fog-a"></i><i class="hw-fog hw-fog-b"></i>' +

      /* ---------- 中景：连绵山影（横贯整幅，月亮从山后面升起；
           原来是中间一小坨，左边没地面，接缝看着像一条多余色块） ---------- */
      '<svg class="hw-hill" viewBox="0 0 600 30" preserveAspectRatio="none" aria-hidden="true">' +
        '<path d="M0.0 16.2C2.9 16.4 11.8 16.9 17.6 17.0C23.5 17.1 29.4 16.9 35.3 16.7C41.2 16.5 47.1 16.1 52.9 15.8C58.8 15.5 64.7 15.0 70.6 14.8C76.5 14.5 82.4 14.3 88.2 14.2C94.1 14.1 100.0 14.1 105.9 14.2C111.8 14.3 117.6 14.5 123.5 14.7C129.4 14.8 135.3 15.0 141.2 15.1C147.1 15.2 152.9 15.2 158.8 15.1C164.7 14.9 170.6 14.7 176.5 14.3C182.4 13.9 188.2 13.4 194.1 12.9C200.0 12.4 205.9 11.8 211.8 11.3C217.6 10.7 223.5 10.1 229.4 9.6C235.3 9.1 241.2 8.6 247.1 8.2C252.9 7.8 258.8 7.4 264.7 7.0C270.6 6.6 276.5 6.3 282.4 6.0C288.2 5.7 294.1 5.4 300.0 5.3C305.9 5.1 311.8 5.0 317.6 5.0C323.5 5.0 329.4 5.2 335.3 5.5C341.2 5.9 347.1 6.4 352.9 7.1C358.8 7.7 364.7 8.6 370.6 9.4C376.5 10.3 382.4 11.3 388.2 12.2C394.1 13.0 400.0 13.9 405.9 14.6C411.8 15.3 417.6 15.8 423.5 16.2C429.4 16.5 435.3 16.6 441.2 16.6C447.1 16.6 452.9 16.4 458.8 16.2C464.7 16.0 470.6 15.6 476.5 15.4C482.4 15.2 488.2 14.9 494.1 14.8C500.0 14.7 505.9 14.6 511.8 14.7C517.6 14.7 523.5 14.8 529.4 14.9C535.3 15.0 541.2 15.1 547.1 15.1C552.9 15.2 558.8 15.2 564.7 15.1C570.6 15.1 576.5 14.9 582.4 14.7C588.2 14.5 597.1 14.0 600.0 13.8L600 30H0Z" fill="#241640" opacity=".72"/>' +
        '<path d="M0.0 22.0C2.9 21.9 11.8 21.6 17.6 21.3C23.5 20.9 29.4 20.4 35.3 19.9C41.2 19.4 47.1 18.9 52.9 18.3C58.8 17.7 64.7 17.1 70.6 16.4C76.5 15.7 82.4 14.9 88.2 14.2C94.1 13.5 100.0 12.7 105.9 12.1C111.8 11.6 117.6 11.1 123.5 11.0C129.4 10.9 135.3 11.1 141.2 11.6C147.1 12.0 152.9 12.9 158.8 13.7C164.7 14.5 170.6 15.6 176.5 16.3C182.4 17.1 188.2 17.8 194.1 18.2C200.0 18.6 205.9 18.7 211.8 18.8C217.6 18.8 223.5 18.6 229.4 18.5C235.3 18.5 241.2 18.4 247.1 18.5C252.9 18.6 258.8 18.9 264.7 19.2C270.6 19.5 276.5 20.1 282.4 20.4C288.2 20.8 294.1 21.2 300.0 21.5C305.9 21.7 311.8 21.8 317.6 21.9C323.5 21.9 329.4 21.8 335.3 21.7C341.2 21.6 347.1 21.4 352.9 21.2C358.8 20.9 364.7 20.6 370.6 20.2C376.5 19.7 382.4 19.1 388.2 18.3C394.1 17.6 400.0 16.6 405.9 15.7C411.8 14.8 417.6 13.6 423.5 12.9C429.4 12.1 435.3 11.4 441.2 11.1C447.1 10.9 452.9 11.0 458.8 11.3C464.7 11.6 470.6 12.4 476.5 13.1C482.4 13.7 488.2 14.7 494.1 15.3C500.0 16.0 505.9 16.5 511.8 16.9C517.6 17.2 523.5 17.3 529.4 17.4C535.3 17.5 541.2 17.4 547.1 17.5C552.9 17.6 558.8 17.7 564.7 17.9C570.6 18.1 576.5 18.5 582.4 18.8C588.2 19.1 597.1 19.7 600.0 19.9L600 30H0Z" fill="#0f0a1c" opacity=".95"/>' +
      '</svg>' +

      /* ---------- 中景：一小片墓园（三块碑 + 一个十字架，坐在近脊的坡上） ---------- */
      '<svg class="hw-grave g1" viewBox="0 0 26 28" aria-hidden="true">' +
        '<path d="M13 1.6c6.6 0 12 4.4 12 9.9V27H1V11.5C1 6 6.4 1.6 13 1.6z" fill="#0b0716"/>' +
        '<path d="M13 8v9M8.4 12.4h9.2" stroke="#3a2b56" stroke-width="1.8" stroke-linecap="round"/>' +
      '</svg>' +
      '<svg class="hw-grave g2" viewBox="0 0 20 20" aria-hidden="true">' +
        '<path d="M10 1.4c4.4 0 8 3.1 8 7V19H2V8.4c0-3.9 3.6-7 8-7z" fill="#0b0716"/>' +
      '</svg>' +
      '<svg class="hw-grave g3" viewBox="0 0 14 26" aria-hidden="true">' +
        '<path d="M5.2 1h3.6v5.9h5.2v3.6H8.8V25H5.2V10.5H0V6.9h5.2z" fill="#0b0716"/>' +
      '</svg>' +
      '<svg class="hw-grave g4" viewBox="0 0 24 16" aria-hidden="true">' +
        '<path d="M12 1.2c5.6 0 10.4 2.6 10.4 6.4V15H1.6V7.6C1.6 3.8 6.4 1.2 12 1.2z" fill="#0b0716" transform="rotate(-8 12 8)"/>' +
      '</svg>' +

      /* ---------- 中景：蝙蝠（三只，剪影 + 大小差 = 远近；翅膀分开抖） ---------- */
      bat('b1', 54) + bat('b2', 40) + bat('b3', 26) +

      /* ---------- 中景：幽灵（半透明、边缘柔、带光晕，不画牙不吓人） ---------- */
      '<svg class="hw-ghost" viewBox="0 0 44 54" aria-hidden="true">' +
        '<path d="M22 4c9.6 0 15.6 6.6 15.6 15.6V41c0 2.2-2.2 3.2-3.6 1.8l-3.6-3.4-3.8 3.6-4.6 3.8-4.6-3.8-3.8-3.6-3.6 3.4C8.6 44.2 6.4 43.2 6.4 41V19.6C6.4 10.6 12.4 4 22 4z" ' +
          'fill="#f2ecff" opacity=".82"/>' +
        '<g fill="#2b2040"><ellipse cx="16.4" cy="22" rx="2.6" ry="3.3"/><ellipse cx="27.6" cy="22" rx="2.6" ry="3.3"/></g>' +
        '<g fill="#ffa89a" opacity=".45"><ellipse cx="12.4" cy="28" rx="2.8" ry="1.7"/><ellipse cx="31.6" cy="28" rx="2.8" ry="1.7"/></g>' +
        '<path d="M18.6 30.4c1.8 1.7 5 1.7 6.8 0" stroke="#2b2040" stroke-width="1.5" fill="none" stroke-linecap="round"/>' +
      '</svg>' +

      /* ---------- 近景：蜘蛛（从顶边垂丝下来，慢慢晃） ---------- */
      '<div class="hw-spider"><i class="hw-silk"></i>' +
        '<svg viewBox="0 0 26 22" aria-hidden="true">' +
          '<g stroke="#1a1128" stroke-width="1.3" fill="none" stroke-linecap="round">' +
            '<path d="M10.6 10.4C7.6 8.6 5.4 9.4 3.6 11.6M10.6 12.4c-3.4.4-5.2 2-6 4.6M11.6 14.6c-2.6 1.8-3.4 3.6-3.4 5.8"/>' +
            '<path d="M15.4 10.4c3-1.8 5.2-1 7 1.2M15.4 12.4c3.4.4 5.2 2 6 4.6M14.4 14.6c2.6 1.8 3.4 3.6 3.4 5.8"/>' +
          '</g>' +
          '<ellipse cx="13" cy="12.4" rx="3.2" ry="3.8" fill="#241a38"/>' +
          '<circle cx="13" cy="8.6" r="2.4" fill="#2b2040"/>' +
          '<circle cx="12.4" cy="8.2" r=".55" fill="#ffd9a0" opacity=".75"/>' +
          '<circle cx="13.6" cy="8.2" r=".55" fill="#ffd9a0" opacity=".75"/>' +
        '</svg>' +
      '</div>' +

      /* ---------- 近景：底边草丛（最前面一层，把地平线"打毛"，不再是一条直线） ---------- */
      '<svg class="hw-grass" viewBox="0 0 600 26" preserveAspectRatio="none" aria-hidden="true">' +
        '<path d="M0.0 26C-0.2 21.0 -0.7 18.2 -1.2 16.8M7.0 26C7.1 17.8 7.2 13.3 7.3 11.1M14.8 26C14.9 22.2 15.2 20.2 15.5 19.2M40.9 26C40.3 20.0 39.2 16.8 38.0 15.1M47.8 26C47.5 22.0 46.8 19.8 46.2 18.7M50.2 26C50.7 17.8 51.6 13.3 52.6 11.0M83.9 26C84.1 18.0 84.4 13.6 84.7 11.4M90.5 26C91.3 19.7 92.9 16.2 94.5 14.5M93.1 26C92.5 19.2 91.4 15.5 90.3 13.6M104.7 26C104.3 23.1 103.4 21.6 102.5 20.8M110.7 26C110.2 21.0 109.3 18.3 108.4 17.0M121.9 26C122.4 22.0 123.5 19.8 124.6 18.7M127.0 26C127.7 17.9 129.2 13.5 130.7 11.3M135.4 26C135.6 19.1 136.1 15.3 136.6 13.4M142.0 26C142.0 22.6 142.1 20.7 142.3 19.8M163.7 26C163.9 22.4 164.2 20.5 164.5 19.5M169.1 26C169.2 18.0 169.4 13.6 169.6 11.5M174.6 26C174.4 20.6 173.8 17.6 173.3 16.2M205.8 26C205.8 17.8 206.0 13.3 206.2 11.1M211.7 26C212.2 20.2 213.2 17.1 214.2 15.5M216.1 26C216.3 19.9 216.7 16.6 217.0 14.9M242.7 26C243.3 19.8 244.6 16.4 245.9 14.7M248.2 26C249.0 19.1 250.6 15.3 252.1 13.4M253.2 26C253.9 22.3 255.5 20.3 257.1 19.3M268.9 26C269.3 19.5 270.0 15.9 270.8 14.2M276.1 26C276.0 18.0 275.9 13.6 275.8 11.4M283.8 26C284.1 18.0 284.5 13.6 285.0 11.4M290.3 26C290.2 20.5 290.0 17.6 289.8 16.1M296.8 26C297.4 22.9 298.6 21.2 299.7 20.3M303.6 26C304.3 20.6 305.5 17.6 306.8 16.2M306.1 26C305.9 21.8 305.4 19.6 304.9 18.4M328.9 26C329.2 18.5 329.9 14.4 330.5 12.3M333.8 26C334.3 22.4 335.2 20.5 336.1 19.5M338.2 26C338.5 22.5 339.2 20.6 339.9 19.6M372.7 26C373.4 22.1 374.7 19.9 376.0 18.9M379.6 26C379.9 18.4 380.4 14.3 380.9 12.2M384.3 26C385.0 20.1 386.3 16.8 387.6 15.2M389.0 26C388.8 20.3 388.2 17.2 387.7 15.7M413.2 26C413.6 22.6 414.5 20.7 415.4 19.7M418.5 26C418.2 21.5 417.6 19.0 417.0 17.7M427.9 26C428.3 20.9 429.1 18.2 429.9 16.8M453.2 26C452.7 22.7 451.6 20.9 450.5 20.1M457.8 26C457.3 20.8 456.4 18.0 455.4 16.5M467.4 26C466.9 19.6 465.9 16.2 464.9 14.4M488.2 26C488.4 18.4 489.0 14.2 489.6 12.1M493.2 26C492.8 18.5 492.1 14.5 491.3 12.4M501.6 26C501.9 19.1 502.4 15.3 503.0 13.4M506.2 26C505.6 19.1 504.4 15.4 503.2 13.5M532.5 26C533.0 22.9 534.0 21.2 535.1 20.4M537.5 26C537.2 19.3 536.6 15.7 536.0 13.9M545.6 26C545.0 21.5 543.7 19.1 542.5 17.9M549.5 26C550.2 21.5 551.7 19.1 553.2 17.9M561.5 26C561.8 20.6 562.2 17.6 562.6 16.1M567.7 26C567.9 22.9 568.4 21.2 568.9 20.4M572.5 26C572.2 20.4 571.8 17.4 571.3 15.8M580.7 26C580.3 19.1 579.5 15.3 578.7 13.4M586.9 26C586.6 21.5 585.8 19.0 585.0 17.7M585.1 26C584.5 22.7 583.4 20.8 582.2 19.9M589.8 26C590.3 18.8 591.4 14.8 592.4 12.9M596.8 26C596.1 19.8 594.8 16.5 593.4 14.8M604.4 26C604.5 20.8 604.8 18.0 605.0 16.6M607.8 26C607.4 21.0 606.8 18.3 606.1 17.0" stroke="#0b0715" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
      '</svg>' +

      /* ---------- 近景：南瓜灯（底部地面，暖光往外溢） ---------- */
      '<svg class="hw-jack" viewBox="0 0 40 34" aria-hidden="true">' +
        '<path d="M20 1.4c1 0 1.7.9 1.7 2v1.4h-3.4V3.4c0-1.1.7-2 1.7-2z" fill="#5b3a12"/>' +
        '<ellipse cx="20" cy="20" rx="15" ry="12.4" fill="#ef8c1c"/>' +
        '<ellipse cx="20" cy="20" rx="8" ry="12" fill="#ffa63a" opacity=".5"/>' +
        '<path d="M11.4 15.4l4.6 3.2-4.2 2.4zM28.6 15.4L24 18.6l4.2 2.4z" fill="#3a2410"/>' +
        '<path d="M12.6 24.6q3.4-2.6 7.4 0 4-2.6 7.4 0v3.4H12.6z" fill="#3a2410"/>' +
      '</svg>' +
    '</div>';
  }

  /* 蝙蝠剪影：半个翅膀画一次，右边用 scale(-1,1) 镜像 —— 保证左右完全对称。 */
  function bat(cls, size) {
    /* 半个翅膀：肩 (32,12.6) → 前缘甩到翼尖 (4.6,4.8) → 下缘折回来，中间两个深缺口。
       缺口（Q 的控制点在两个"指头"上方）是蝙蝠和鳐鱼的分界：原来那段平滑弧线下缘，
       在 1x 下就是一条肥边，看着像鳐鱼。 */
    var half = 'M32 12.6C25.4 6 15 3 4.6 4.8L9.4 14.2Q12.4 8.6 15.4 12L19.2 16.4Q22.4 9.8 25.6 13.2' +
      'L28.6 16.2Q30.6 11.6 32 12.6z';
    return '<svg class="hw-bat ' + cls + '" viewBox="0 0 64 30" aria-hidden="true" style="width:' + size + 'px">' +
      '<g fill="#1a1029">' +
        /* 左右翅膀各自包一层，CSS 绕身体中心摆 —— 整只一起抖会像一片贴纸在晃 */
        '<g class="hw-wl"><path d="' + half + '"/></g>' +
        '<g class="hw-wr"><path d="' + half + '" transform="translate(64,0) scale(-1,1)"/></g>' +
        '<ellipse cx="32" cy="16" rx="4.2" ry="5.6"/>' +
        /* 头 + 两只尖耳朵（耳朵太小会看不出来，这里故意做长一点） */
        '<circle cx="32" cy="9.4" r="4"/>' +
        '<path d="M28.6 7.6 27 2.6l4.4 3zM35.4 7.6 37 2.6l-4.4 3z"/>' +
      '</g></svg>';
  }

  function heroArt() {
    return '<div class="hero-art"><svg viewBox="0 0 150 80" fill="none">' +
      '<defs>' +
        '<radialGradient id="hwWin" cx=".5" cy=".45" r=".65">' +
          '<stop offset="0" stop-color="#ffe6a8"/><stop offset="1" stop-color="#ffb347"/>' +
        '</radialGradient>' +
        '<radialGradient id="hwWinHalo">' +
          '<stop offset="0" stop-color="#ffbe63" stop-opacity=".55"/>' +
          '<stop offset="1" stop-color="#ffbe63" stop-opacity="0"/>' +
        '</radialGradient>' +
      '</defs>' +
      /* 不再画自家那块深色地面：整幅已经有地平线，两个地面会打架；
         只留窗户洒下来的一点暖光 */
      '<ellipse cx="86" cy="70" rx="30" ry="14" fill="url(#hwWinHalo)"/>' +
      /* 枯树（左） */
      '<g stroke="#0f0a1b" stroke-linecap="round" fill="none">' +
        '<path d="M26 76V50" stroke-width="2.6"/>' +
        '<path d="M26 58c-2.4-3.2-5-5.4-8.4-7" stroke-width="2"/>' +
        '<path d="M26 54c2.8-3 5.6-4.8 9.4-6" stroke-width="2"/>' +
        '<path d="M26 50c-1.4-2.8-3.2-4.8-5.8-6.6" stroke-width="1.8"/>' +
        '<path d="M17.6 51c-1.2-1.6-2-3-2.4-4.8" stroke-width="1.2"/>' +
        '<path d="M35.4 48c1.4-1.4 2.4-2.8 3-4.6" stroke-width="1.2"/>' +
        '<path d="M26 50l-2.6-3" stroke-width="1.2"/>' +
      '</g>' +
      /* 房身（剪影） */
      '<path d="M52 76V45h46v31z" fill="#2a1c3e"/>' +
      /* 屋顶 */
      '<path d="M45 46 75 25l30 21z" fill="#3a2752"/>' +
      '<path d="M45 46h60l-3.5 5H48.5z" fill="#241736"/>' +
      /* 烟囱 + 烟 */
      '<rect x="88" y="27" width="8" height="13" rx="1.6" fill="#33234a"/>' +
      '<circle cx="92" cy="21" r="3.2" fill="#c9b8e0" opacity=".16"/>' +
      '<circle cx="96" cy="15" r="4" fill="#c9b8e0" opacity=".12"/>' +
      /* 门 */
      '<rect x="60" y="55" width="14" height="21" rx="2" fill="#1a1229"/>' +
      '<circle cx="71" cy="66" r="1.1" fill="#ffc978" opacity=".9"/>' +
      /* 窗（暖光 + 十字窗棂 + 光晕） */
      '<rect x="80" y="53" width="15" height="12" rx="1.6" fill="url(#hwWin)"/>' +
      '<path d="M87.5 53v12M80 59h15" stroke="#2a1c3e" stroke-width="1.5"/>' +
      '<rect x="80" y="53" width="15" height="12" rx="1.6" stroke="#ffcd85" stroke-opacity=".8"/>' +
      /* 阁楼小窗 */
      '<circle cx="75" cy="37" r="3.4" fill="#ffd489" opacity=".92"/>' +
      '<circle cx="75" cy="37" r="6" fill="url(#hwWinHalo)"/>' +
      /* 门口平台 + 围栏 */
      '<rect x="55" y="72" width="42" height="3" rx="1" fill="#1d1330"/>' +
      '<g fill="#1d1330">' +
        '<path d="M103 76V67l1.8-2.6L106.6 67v9z"/>' +
        '<path d="M109 76V67l1.8-2.6L112.6 67v9z"/>' +
        '<path d="M115 76V67l1.8-2.6L118.6 67v9z"/>' +
        '<rect x="101.6" y="69.4" width="18.4" height="1.4" rx=".7"/>' +
      '</g>' +
      /* 两个南瓜 */
      '<ellipse cx="57" cy="72" rx="4.6" ry="4" fill="#e8821c"/>' +
      '<ellipse cx="100" cy="73" rx="3.4" ry="3" fill="#c96b14"/>' +
      '<path d="M57 68v-2M100 70v-1.6" stroke="#5b3a12" stroke-width="1.2" stroke-linecap="round"/>' +
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
      /* 装饰层：一块「万圣夜室内窗景」——远（月 + 云/雾 + 山影）、中（枯枝 + 蝙蝠 + 幽灵）、
         近（南瓜灯 + 蜘蛛）。纯 CSS 动画，pointer-events:none，不挡任何内容。 */
      hwScene() +
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

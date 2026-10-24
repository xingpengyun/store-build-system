/* ==========================================================
   page-tasks.js — 任务管理
   ========================================================== */
window.Pages = window.Pages || {};

window.Pages.tasks = (function () {
  'use strict';

  var U = window.Utils;
  var S = window.Store;
  var C = window.CONST;

  /* stage = 左侧时间线选中的「门店当前阶段」；sub = 再细一层的二级阶段
     open = 右侧当前展开任务明细的那一家门店 id（'' = 全部收起）
            只允许开一家：默认全收着，点开一家自动把别家收回去，页面不会被撑得很长 */
  var state = {
    tab: 'all', q: '', owner: '', stage: '', sub: '',
    page: 1, per: 12, open: ''
  };


  /* 这排是「按门店里任务的状态筛门店」，计数是门店数。
     流程固定 → 只有「逾期 / 已完成」有意义：待办、进行中不再单独列。 */
  var TABS = [
    { key: 'all', label: '全部' },
    { key: 'overdue', label: '逾期' },
    { key: 'risk', label: '风险' },
    { key: 'done', label: '已完成' }
  ];

  /* ---------------- 门店 / 任务 基础数据 ---------------- */

  function tasksOf(storeId) {
    return S.getState().tasks.filter(function (t) { return t.storeId === storeId; });
  }

  function statOfTasks(list) {
    var open = 0, late = 0, done = 0;
    list.forEach(function (t) {
      if (t.status === 'done') { done++; return; }
      open++;
      if (S.classify(t) === 'overdue') late++;
    });
    return { open: open, late: late, done: done, total: list.length };
  }

  /* 门店是否命中某个状态筛选项（按它自己的任务算） */
  function storeHitTab(store, key) {
    if (!key || key === 'all') return true;
    var list = tasksOf(store.id);
    if (key === 'done') {
      return list.length > 0 && list.every(function (t) { return t.status === 'done'; });
    }
    return list.some(function (t) { return S.classify(t) === key; });
  }

  /* 只受「搜索 / 负责人」影响的门店集合（不含状态筛选），用来算各状态的数字 */
  function baseStores() {
    var q = String(state.q || '').toLowerCase();
    return S.getState().stores.filter(function (st) {
      if (state.stage && st.stage !== state.stage) return false;
      if (state.sub) {
        /* 二级有两个来源：门店自己推到了这一支（推送时选的），
           或者这家店有任务挂在这个二级下。两个都算命中。 */
        var hitSub = S.storeSub(st) === state.sub ||
          tasksOf(st.id).some(function (t) { return C.stageSplit(t.stage).sub === state.sub; });
        if (!hitSub) return false;
      }
      if (state.owner) {
        var hitOwner = tasksOf(st.id).some(function (t) { return t.assigneeId === state.owner; });
        if (!hitOwner) return false;
      }
      if (q) {
        var hay = (st.name + ' ' + (st.province || '') + ' ' + (st.stage || '')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  /* 排序：先按阶段顺序，再「越急的越靠上」（逾期多、待办多） */
  function sortedStores(list) {
    var order = {};
    C.STAGES.forEach(function (s, i) { order[s.key] = i; });

    return list.slice().sort(function (a, b) {
      var oa = order[a.stage] == null ? 99 : order[a.stage];
      var ob = order[b.stage] == null ? 99 : order[b.stage];
      if (oa !== ob) return oa - ob;

      var ma = statOfTasks(tasksOf(a.id));
      var mb = statOfTasks(tasksOf(b.id));
      if (ma.late !== mb.late) return mb.late - ma.late;
      if (ma.open !== mb.open) return mb.open - ma.open;
      return String(a.name).localeCompare(String(b.name), 'zh');
    });
  }

  function storeList() {
    return sortedStores(baseStores().filter(function (st) { return storeHitTab(st, state.tab); }));
  }

  function tabCount(key) {
    return baseStores().filter(function (st) { return storeHitTab(st, key); }).length;
  }

  /* ---------------- 左侧：阶段时间线 ---------------- */

  function idsOf(list) {
    var ids = {};
    list.forEach(function (x) { ids[x.id] = 1; });
    return ids;
  }

  /* 一组门店的未完成任务数 / 逾期数 */
  function statOfIds(ids) {
    var open = 0, late = 0;
    S.getState().tasks.forEach(function (t) {
      if (!ids[t.storeId] || t.status === 'done') return;
      open++;
      if (S.classify(t) === 'overdue') late++;
    });
    return { open: open, late: late };
  }

  /* 某个二级阶段（在这些门店范围内）的任务情况 */
  function statOfSub(ids, base, sub) {
    var open = 0, late = 0;
    S.getState().tasks.forEach(function (t) {
      if (!ids[t.storeId] || t.status === 'done') return;
      var p = C.stageSplit(t.stage);
      if (p.base !== base || p.sub !== sub) return;
      open++;
      if (S.classify(t) === 'overdue') late++;
    });
    return { open: open, late: late };
  }

  function railHtml() {
    var stores = S.getState().stores;
    var subs = S.stageSubsWithUsed();

    var nodes = C.STAGES.map(function (st) {
      var list = stores.filter(function (x) { return x.stage === st.key; });
      var ids = idsOf(list);
      var n = statOfIds(ids);
      var on = state.stage === st.key;
      var subList = subs[st.key] || [];

      var meta = list.length
        ? (n.open
            ? '未完成 ' + n.open + (n.late ? ' · <b>逾期 ' + n.late + '</b>' : '')
            : '全部已完成')
        : '暂无门店';

      var html = '<div class="tl-node' + (on ? ' on' : '') + (list.length ? '' : ' is-empty') +
          '" data-stage="' + U.esc(st.key) + '" title="只看「' + U.esc(st.key) + '」阶段的门店">' +
          '<i class="tl-dot" style="background:' + st.color + '"></i>' +
          '<div class="tl-body">' +
            '<div class="tl-line">' +
              '<span class="tl-name">' + U.esc(st.key) + '</span>' +
              (subList.length ? '<span class="tl-caret' + (on ? ' open' : '') + '"></span>' : '') +
              '<span class="tl-num">' + list.length + ' 家</span>' +
            '</div>' +
            '<div class="tl-meta">' + meta + '</div>' +
          '</div>' +
        '</div>';

      /* 展开：只列二级阶段（门店已经在右边列表里了） */
      if (!on) return html;
      if (subList.length) {
        html += '<div class="tl-subs">' + subList.map(function (sub) {
          var m = statOfSub(ids, st.key, sub);
          var subOn = state.sub === sub;
          /* 门店自己推到了这一支的，也算这个二级下的门店 */
          var subStores = list.filter(function (x) { return S.storeSub(x) === sub; }).length;

          var bits = [];
          if (subStores) bits.push(subStores + ' 家');
          if (m.open) bits.push('未完成 ' + m.open + (m.late ? ' · <b>逾期' + m.late + '</b>' : ''));
          var right = bits.length ? bits.join(' · ') : '—';

          return '<div class="tl-sub' + (subOn ? ' on' : '') + '" data-sub="' + U.esc(sub) +
              '" data-base="' + U.esc(st.key) + '"' +
              ' title="只看「' + U.esc(st.key) + ' · ' + U.esc(sub) + '」的门店与任务">' +
            '<i class="tl-sub-dot" style="background:' + st.color + '"></i>' +
            '<span class="tl-sub-name">' + U.esc(sub) + '</span>' +
            '<span class="tl-num">' + right + '</span>' +
          '</div>';
        }).join('') +
        '</div>';
      }

      return html;
    }).join('');

    return '<div class="card-head">' +
        '<h3>阶段时间线</h3>' +
      '</div>' +
      '<div class="tl-all' + (!state.stage ? ' on' : '') + '" data-stage-all>' +
        '<span>全部阶段</span><span class="tl-num">' + stores.length + ' 家</span>' +
      '</div>' +
      '<div class="tl-nodes">' + nodes + '</div>' +
      '<p class="tl-hint">点阶段看门店，点门店展开清单；再点一次取消筛选。' +
        '<br />阶段与二级阶段在这里只做筛选，增删改在「系统设置 → 阶段与子阶段」里维护。</p>';
  }

  /* ---------------- 当前筛选条件条 ---------------- */
  function filterBarHtml() {
    if (!state.stage && !state.sub && !state.owner && !state.q) return '';
    var mem = state.owner ? S.memberById(state.owner) : null;

    return '<div class="tk-filters">' +
      (state.stage
        ? '<span class="tk-chip">阶段：<b>' + U.esc(state.stage) + '</b><i data-clear="stage" title="取消阶段筛选">✕</i></span>'
        : '') +
      (state.sub
        ? '<span class="tk-chip">二级：<b>' + U.esc(state.sub) + '</b><i data-clear="sub" title="取消二级筛选">✕</i></span>'
        : '') +
      (mem
        ? '<span class="tk-chip">负责人：<b>' + U.esc(mem.name) + '</b><i data-clear="owner" title="取消负责人筛选">✕</i></span>'
        : '') +
      (state.q
        ? '<span class="tk-chip">搜索：<b>' + U.esc(state.q) + '</b><i data-clear="q" title="清空搜索">✕</i></span>'
        : '') +
      '<span class="tk-clear" data-clear="all">清除全部</span>' +
    '</div>';
  }

  /* 一行只有一个动作：没做完 → 「完成」（= 这件事做完了，门店自动进到这条任务
     挂的那个阶段）；做完了 → 「重开」。「开始 / 进行中」这套状态流转取消。
     （原先叫「推送」，一线反馈不好理解，2026-10-25 改成「完成」） */
  function actionHtml(t) {
    if (t.status === 'done') {
      return '<span class="tlink" data-act="reopen" data-id="' + t.id + '">重开</span>';
    }
    var tip = C.stageSplit(t.stage || '').base
      ? '这条做完了，门店自动进到「' + C.stageLabel(t.stage) + '」'
      : '这条做完了';
    var push = '<span class="tlink tlink-push" data-act="push" data-id="' + t.id + '"' +
      ' title="' + U.esc(tip) + '">完成</span>';
    var sn = S.snoozeDaysOf(t);

    /* 逾期才给「+3天」：不是我们的原因 / 老板不着急，
       先往后放 3 天，3 天后再提醒（可以重复点，一次加 3 天） */
    if (S.classify(t) === 'overdue') {
      return '<span class="tlink tlink-snooze" data-act="snooze" data-id="' + t.id + '"' +
        ' title="不是我们的原因 / 老板不着急：往后放 3 天，3 天后再提醒">+3天</span>' + push;
    }

    /* 延后过、现在还没到期：留个撤销口子，别一按就找不回来 */
    if (sn > 0) {
      return '<span class="tlink tlink-snoozed" data-act="unsnooze" data-id="' + t.id + '"' +
        ' title="已往后放 ' + sn + ' 天，点一下撤销">延后 ' + sn + ' 天</span>' + push;
    }
    return push;
  }

  /* ================= 完成：这条做完了，门店自动进到这条任务的落点 =================

     每条任务在筹建任务清单里挂一个落点（清单那列就叫「完成后进到」）。
     点「完成」只做两件事：这条标记完成 + 门店阶段推到落点。规则就三条：

       ① 落点比门店当前阶段靠后（营业执照 → 建档资料，门店还在未出图）
          → 直接推过去。并行推进没问题，门店阶段永远是「最远那一格」。

       ② 落点就是门店当前阶段（图纸 → 未出图 而门店就在未出图）
          → 只标记完成，阶段不动。这一格还没干完，别急着往前走。

       ③ 落点比门店当前阶段靠前（门店已到广告物料，才回头补做图纸）
          → 只标记完成，绝不往回退。

     相比原来「每次弹窗让你从一堆阶段里挑」：
       默认一下点完，只有落点带二级（「已出图」下的 已做首批 / 未做首批）
       才问一句是哪一支，点一下就落定。推错了顶部提示条里有「撤销」。
     ================================================================ */

  function stageIndex(key) {
    var idx = -1;
    C.STAGES.forEach(function (st, i) { if (st.key === key) idx = i; });
    return idx;
  }

  function subsOfStage(base) {
    var map = S.stageSubsWithUsed();
    var list = map && map[base];
    return Array.isArray(list) ? list : [];
  }

  function completeTask(task) {
    var store = S.storeById(task.storeId);

    /* 门店被删了：别把这条卡死，标记完成就行 */
    if (!store) {
      S.updateTask(task.id, { status: 'done' });
      UI.toast('「' + task.title + '」已完成', 'success');
      App.refresh({ keep: true });
      return;
    }

    var prev = { status: task.status, stage: store.stage, sub: S.storeSub(store) };
    var p = C.stageSplit(task.stage || '');
    var tIdx = stageIndex(p.base);
    var curBase = C.stageSplit(store.stage).base;
    var curIdx = stageIndex(curBase);
    var curSub = S.storeSub(store);
    var forward = tIdx >= 0 && tIdx > curIdx;         /* 只有往前才动阶段 */
    var subs = forward ? subsOfStage(p.base) : [];    /* 只有真的往前才需要选二级 */
    var sub = p.sub || (forward ? '' : curSub);       /* 任务自己带二级就不用问 */

    function undo() {
      S.updateTask(task.id, { status: prev.status || 'pending' });
      S.setStoreStage(store.id, prev.stage, prev.sub);
      UI.toast('已撤销，门店回到「' + C.stageLabel(C.stageValue(prev.stage, prev.sub)) + '」', 'info');
      App.refresh({ keep: true });
    }

    function commit(branch) {
      S.updateTask(task.id, { status: 'done' });

      var moved = '';
      if (forward) {
        S.setStoreStage(store.id, p.base, branch || '');
        moved = C.stageLabel(C.stageValue(p.base, branch || ''));
      }

      var msg;
      if (moved) {
        msg = '已完成：「' + task.title + '」→ 门店进到「' + moved + '」';
      } else if (p.base && p.base === curBase) {
        msg = '「' + task.title + '」已完成（这条的落点就是「' + C.stageLabel(p.base) + '」，阶段不动）';
      } else if (p.base) {
        msg = '「' + task.title + '」已完成（门店已经在「' + C.stageLabel(store.stage) + '」，阶段不动）';
      } else {
        msg = '「' + task.title + '」已完成';
      }

      /* 门店往前走了，可左侧还筛着老阶段 —— 不放开筛选的话，
         刚点完的那家会当场从列表里消失，看着像被删了 */
      if (moved && state.stage && store.stage !== state.stage) {
        state.stage = '';
        state.sub = '';
      }

      UI.toast(msg, 'success', { action: { label: '撤销', onClick: undo } });
      App.refresh({ keep: true });
    }

    /* 不往前推 / 落点没有二级 / 任务自己已经带二级 → 一下点完，不弹窗 */
    if (!forward || !subs.length || sub) { commit(forward ? sub : ''); return; }

    /* 落点带二级：只问这一句，点哪个就落哪，点完就完事 */
    UI.modal({
      title: '「' + task.title + '」已完成',
      sub: store.name + ' 往前一步',
      body:
        '<div class="cm-flow">' +
          '<span class="cm-chip">' + U.esc(C.stageLabel(C.stageValue(store.stage, curSub))) + '</span>' +
          UI.icon('arrow') +
          '<span class="cm-chip cm-to">' + U.esc(C.stageLabel(p.base)) + '</span>' +
        '</div>' +
        '<div class="push-sec">「' + U.esc(C.stageLabel(p.base)) + '」还分两支，选一个</div>' +
        '<div class="push-chips">' + subs.map(function (s) {
          return '<button type="button" class="push-chip" data-cm-sub="' + U.esc(s) + '">' +
            U.esc(s) + '</button>';
        }).join('') + '</div>' +
        '<p class="push-hint">点一下就落定；选错了，顶部提示条里有「撤销」。</p>',
      footer: '<button class="btn" data-cm-cancel>取消</button>',
      onMount: function (rootEl, close) {
        rootEl.querySelector('[data-cm-cancel]').onclick = close;
        rootEl.addEventListener('click', function (e) {
          var chip = e.target && e.target.closest ? e.target.closest('[data-cm-sub]') : null;
          if (!chip) return;
          close();
          commit(chip.getAttribute('data-cm-sub'));
        });
      }
    });
  }

  /* ---------------- 右侧：门店列表（点开看任务） ---------------- */

  /* 这家店要展开的任务：受二级 / 负责人筛选影响，未完成的排前面
     门店本身就是靠「自己推到了这一支」命中二级时，就不再按任务的二级过滤，
     否则点了「未做首批」这家店展开会显示 0 条任务，看着像空的。 */
  function tasksForRow(storeId) {
    var store = S.storeById(storeId);
    var byStoreSub = !!(store && state.sub && S.storeSub(store) === state.sub);
    return tasksOf(storeId).filter(function (t) {
      if (state.sub && !byStoreSub && C.stageSplit(t.stage).sub !== state.sub) return false;
      if (state.owner && t.assigneeId !== state.owner) return false;
      return true;
    }).sort(function (a, b) {
      var da = a.status === 'done' ? 1 : 0;
      var db = b.status === 'done' ? 1 : 0;
      if (da !== db) return da - db;
      var sa = S.suggestDateOf(a) || '9999-12-31';
      var sb = S.suggestDateOf(b) || '9999-12-31';
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    });
  }

  /* 建议完成 = 门店开业日 − 这条任务自己的「开业前 N 天」（清单里填的那个数）
     全国统一口径：没开业日期就不算日期，如实显示「未设开业日」 */
  function taskTableHtml(list) {
    var body = list.map(function (t) {
      var cls = S.classify(t);
      var late = cls === 'overdue';
      var due = S.suggestDateOf(t);
      var days = due ? U.diffDays(U.today(), due) : null;   /* 距建议完成日 */
      var lead = S.taskBeforeOf(t);
      var left = S.daysLeftOf(t);              /* 距开业 */
      var mem = S.memberById(t.assigneeId);
      var stt = S.storeById(t.storeId);
      var sn = S.snoozeDaysOf(t);              /* 已往后放了几天 */
      var dueTip = (stt && stt.openDate)
        ? '倒推：开业 ' + U.monthDay(stt.openDate) + ' − 开业前 ' + lead + ' 天' +
          (sn ? ' + 已延后 ' + sn + ' 天' : '') + ' = ' + U.monthDay(due) + ' 前完成'
        : '这家门店还没填开业日期，填了才会自动倒推';

      var sub;
      if (cls === 'done') {
        sub = '已完成';
      } else if (!due) {
        sub = '填了开业日就自动倒推';
      } else {
        if (late) sub = '逾期 ' + Math.abs(days) + ' 天';
        else if (days === 0) sub = '今天到期';
        else sub = days + ' 天后';
        if (sn) sub += '（延后 ' + sn + ' 天）';
        if (left != null) sub += ' · 距开业 ' + left + ' 天';
      }

      var dueCell = due
        ? '<span class="mono ' + (late ? 'text-red' : 'muted') + '">' + U.monthDay(due) + '</span>'
        : '<span class="dim">未设开业日</span>';

      return '<tr>' +
        '<td><div class="sk-task-title">' + U.esc(t.title) + '</div>' +
          (t.priority === 'high' ? '<div class="sk-prio">高优先级</div>' : '') + '</td>' +
        '<td>' + UI.stageBadge(t.stage) + '</td>' +
        '<td>' + (mem
          ? '<div class="store-cell">' + UI.avatar(mem.name, mem.color, 'sm') + '<span>' + U.esc(mem.name) + '</span></div>'
          : '<span class="dim">未指派</span>') + '</td>' +
        '<td class="nowrap" title="' + U.esc(dueTip) + '">' +
          dueCell +
          '<span class="dim" style="font-size:10.5px;margin-left:5px">' +
            '开业前 ' + lead + ' 天 · ' + sub +
          '</span></td>' +
        '<td>' + UI.statusBadge(cls) + '</td>' +
        '<td class="nowrap" style="text-align:right">' + actionHtml(t) +
          '<span class="tlink" data-act="edit" data-id="' + t.id + '">编辑</span>' +
          '<span class="tlink danger" data-act="del" data-id="' + t.id + '">删除</span>' +
        '</td>' +
      '</tr>';
    }).join('');

    return '<table class="sk-tbl">' +
      '<thead><tr><th>任务</th><th style="width:118px" title="这条做完，门店自动进到哪个阶段">完成后进到</th>' +
        '<th style="width:100px">负责人</th>' +
        '<th style="width:190px">建议完成</th><th style="width:84px">状态</th><th style="width:182px;text-align:right">操作</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table>';
  }

  function storeRowHtml(st) {
    var m = statOfTasks(tasksOf(st.id));
    var def = C.stageDef(st.stage) || {};
    var owner = S.memberById(st.ownerId);
    var open = state.open === st.id;
    var days = st.openDate ? U.diffDays(U.today(), st.openDate) : null;
    var sub = S.storeSub(st);
    var stageTxt = U.esc(st.stage || '—') + (sub ? ' · ' + U.esc(sub) : '');

    var head = '<div class="sk-head" data-srow="' + st.id + '" title="' + (open ? '收起' : '展开') + '这家门店的任务">' +
      '<div class="sk-store">' +
        '<i class="sk-dot" style="background:' + (def.color || '#98a2b8') + '"></i>' +
        '<div class="sk-name-box">' +
          '<div class="sk-name">' + U.esc(st.name) + '</div>' +
          '<div class="sk-meta">' + U.esc(st.province || '—') + ' · ' + stageTxt + '</div>' +
        '</div>' +
        /* 备注（同一份 store.remark，门店编辑里改了这里跟着变）：
           不展开也能看到——重要事情写在备注里，扫一眼行首就能看到。
           行头单行省略，鼠标放上去看全文（展开区不再重复显示） */
        (st.remark
          ? '<span class="sk-remark-inline" title="备注（在「门店管理 → 编辑门店」里修改）：\n' + U.esc(st.remark) + '">' +
              UI.icon('flag') + U.esc(st.remark) +
            '</span>'
          : '') +
      '</div>' +
      '<div class="sk-prog">' + UI.progress(S.progressValue(st), def.color, S.progressTip(st)) + '</div>' +
      '<div class="sk-tasks">' + (m.total
        ? '<span class="sk-open">未完成 ' + m.open + '</span>' +
          (m.late ? '<span class="sk-late">逾期 ' + m.late + '</span>' : '<span class="sk-ok">无逾期</span>')
        : '<span class="sk-none">没有任务</span>') + '</div>' +
      '<div class="sk-date">' + (st.openDate
        ? '<span class="mono">' + U.monthDay(st.openDate) + '</span>' +
          '<span class="sk-days' + (st.stage === '已开业' ? '' : days != null && days < 0 ? ' late' : '') + '">' +
            (st.stage === '已开业' ? '已开业'
              : days == null ? '' : days < 0 ? '已超 ' + Math.abs(days) + ' 天' : days + ' 天后') + '</span>'
        : '<span class="dim">未定</span>') + '</div>' +
      '<div class="sk-owner">' + (owner
        ? UI.avatar(owner.name, owner.color, 'sm') + '<span>' + U.esc(owner.name) + '</span>'
        : '<span class="dim">—</span>') + '</div>' +
      '<span class="sk-arrow">' + UI.icon('arrow') + '</span>' +
    '</div>';

    if (!open) return '<div class="sk-row">' + head + '</div>';

    var list = tasksForRow(st.id);
    var body = list.length
      ? taskTableHtml(list)
      : '<div class="sk-body-empty">这家门店在「' + U.esc(state.sub || state.stage || '当前条件') + '」下没有任务，' +
        '点右上「新增任务」给它添一条。</div>';

    return '<div class="sk-row open">' + head + '<div class="sk-body">' + body + '</div></div>';
  }

  /* 展开 / 收起一家门店：一次只开一家（点开 A，原来开着的 B 自动收回去）。
     收起的那家如果在上面，列表会整体缩上去、刚点的这行会「跳」，所以先记下它的
     屏幕位置，重绘后按差值把滚动条补回来，点哪儿就停在哪儿。 */
  function toggleStoreRow(root, sid) {
    var headBefore = root.querySelector('[data-srow="' + sid + '"]');
    var topBefore = headBefore ? headBefore.getBoundingClientRect().top : null;

    state.open = (state.open === sid) ? '' : sid;
    updateList(root);

    if (topBefore == null) return;
    var headAfter = root.querySelector('[data-srow="' + sid + '"]');
    if (!headAfter) return;
    var delta = headAfter.getBoundingClientRect().top - topBefore;
    if (delta) window.scrollBy(0, delta);
  }

  function pagerHtml(total, pages) {
    if (pages <= 1) {
      return '<div class="pager"><span class="pg-info">共 ' + total + ' 家门店</span></div>';
    }
    var h = '<div class="pager"><span class="pg-info">共 ' + total + ' 家门店 · 第 ' + state.page + ' / ' + pages + ' 页</span>';
    h += '<button data-page="' + (state.page - 1) + '"' + (state.page <= 1 ? ' disabled' : '') + '>上一页</button>';

    var start = Math.max(1, state.page - 2);
    var end = Math.min(pages, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);
    for (var i = start; i <= end; i++) {
      h += '<button data-page="' + i + '" class="' + (i === state.page ? ' active' : '') + '">' + i + '</button>';
    }
    h += '<button data-page="' + (state.page + 1) + '"' + (state.page >= pages ? ' disabled' : '') + '>下一页</button>';
    return h + '</div>';
  }

  function storeRowsHtml() {
    var all = storeList();
    var totalPages = Math.max(1, Math.ceil(all.length / state.per));
    if (state.page > totalPages) state.page = totalPages;
    var start = (state.page - 1) * state.per;
    var rows = all.slice(start, start + state.per);

    if (!rows.length) {
      if (state.stage) {
        return UI.empty('「' + state.stage + '」这个阶段没有门店', '点左上「全部阶段」看全部门店，或者换一个阶段');
      }
      if (state.q || state.owner) {
        return UI.empty('没有符合条件的门店', '清掉搜索或负责人筛选再看');
      }
      return UI.empty('还没有门店', '去「门店管理」建好门店，这里会自动出现');
    }

    return '<div class="sk-list">' + rows.map(storeRowHtml).join('') + '</div>' +
      pagerHtml(all.length, totalPages);
  }

  /* 新建任务 / 新增清单行时默认用左侧选中的阶段（含二级） */
  function defaultStage() {
    if (state.stage) return C.stageValue(state.stage, state.sub);
    return (C.STAGES[0] || {}).key || '';
  }

  /* 表单里的「建议完成」提示：把倒推过程写出来，别让人猜
     = 门店计划开业日 − 这条任务的「开业前 N 天」 */
  function dueHintHtml(t) {
    var stage = t.stage || defaultStage();
    var storeId = t.storeId || ((S.getState().stores[0] || {}).id || '');
    var before = (t.before != null && t.before !== '' && !isNaN(Number(t.before)))
      ? Number(t.before)
      : (S.beforeFromTemplates(t.title) != null ? S.beforeFromTemplates(t.title) : S.leadDaysOf({ stage: stage }));
    var due = S.suggestFor(storeId, stage, before);
    var sn = (t.id && S.snoozeDaysOf(t)) || 0;      /* 逾期时点过「+3天」要算进去 */
    if (due && sn) due = U.addDays(due, sn);
    var st = S.storeById(storeId);

    if (!st || !st.openDate) {
      return '这家门店还没填<b>计划开业日</b>，所以先不显示日期，只记「开业前 ' + before + ' 天」。' +
        '<br /><span style="font-size:11px">去门店资料里把开业日期填上，这里立刻按日期倒推。</span>';
    }
    return '倒推：<b>' + U.esc(st.name) + '</b> 计划 <b>' + U.monthDay(st.openDate) + '</b> 开业' +
      ' − 开业前 <b>' + before + '</b> 天' + (sn ? ' + 已延后 <b>' + sn + '</b> 天' : '') +
      ' = 建议 <b>' + U.monthDay(due) + '</b> 前完成' +
      '<br /><span style="font-size:11px">过了 ' + U.monthDay(due) + ' 还没做完就自动标逾期；' +
      '开业日或这个天数一改，这里跟着变。</span>';
  }

  function formHtml(task) {
    var isNew = !task;
    var t = task || {};
    var stores = S.getState().stores;
    /* 「开业前 N 天」的初值：任务自己调过的 → 清单里同名的 → 兜底 30 天 */
    var beforeVal = S.taskBeforeOf({
      id: t.id, title: t.title, stage: t.stage || defaultStage(), before: t.before
    });
    /* 备注框填的是「门店备注」（store.remark），和门店管理里那份是同一个字段。
       新增任务时门店还没选，先按表单实际选中的那家（第一项）带出来 */
    var initStoreId = t.storeId || (stores[0] || {}).id || '';
    var initStore = S.storeById(initStoreId);

    return '<form autocomplete="off">' +
      '<div class="field"><label>任务名称 <span class="req">*</span></label>' +
        '<input class="input" name="title" value="' + U.esc(t.title || '') + '" placeholder="例如：门店招牌安装验收" />' +
      '</div>' +
      '<div class="field-row">' +
        '<div class="field"><label>所属门店 <span class="req">*</span></label>' +
          '<select class="select" name="storeId">' + UI.options(stores, t.storeId || '', 'id', 'name') + '</select>' +
        '</div>' +
        '<div class="field"><label>完成后门店进到 <span class="dim">（点「完成」时自动推到这里）</span></label>' +
          '<select class="select" name="stage">' + UI.stageOptions(t.stage || defaultStage(), S.stageSubsWithUsed()) + '</select>' +
        '</div>' +
      '</div>' +
      '<div class="field-row">' +
        '<div class="field"><label>负责人</label>' +
          '<select class="select" name="assigneeId">' + UI.options(S.getState().members, t.assigneeId || '', 'id', 'name') + '</select>' +
        '</div>' +
        '<div class="field"><label>开业前（天） <span class="dim">（清单里那列的默认值）</span></label>' +
          '<input class="input" type="number" min="0" max="365" step="1" name="before" value="' + beforeVal + '" />' +
        '</div>' +
      '</div>' +
      '<div class="field"><label>建议完成 <span class="dim">（开业日 − 上面的天数，自动算）</span></label>' +
        '<div class="push-none-tip" data-due-hint>' + dueHintHtml(t) + '</div>' +
      '</div>' +
      '<div class="field-row">' +
        '<div class="field"><label>状态</label>' +
          '<select class="select" name="status">' +
            '<option value="pending"' + (t.status === 'done' ? '' : ' selected') + '>未完成</option>' +
            '<option value="done"' + (t.status === 'done' ? ' selected' : '') + '>已完成</option>' +
          '</select>' +
        '</div>' +
        '<div class="field"><label>优先级</label>' +
          '<select class="select" name="priority">' +
            '<option value="normal"' + (t.priority !== 'high' ? ' selected' : '') + '>普通</option>' +
            '<option value="high"' + (t.priority === 'high' ? ' selected' : '') + '>高</option>' +
          '</select>' +
        '</div>' +
      '</div>' +
      '<div class="field"><label>门店备注 <span class="dim">（和「门店管理 → 编辑门店」里的备注是同一份，改哪边都一样）</span></label>' +
        '<textarea class="textarea" name="remark" placeholder="选填。比较重要的事情写这里：任务列表的门店行头不展开也能看到">' +
          U.esc((initStore && initStore.remark) || '') + '</textarea>' +
      '</div>' +
    '</form>';
  }

  function openForm(task) {
    var isNew = !task;
    if (isNew && !S.getState().stores.length) {
      UI.toast('请先创建门店', 'error');
      return;
    }

    UI.modal({
      title: isNew ? '新增任务' : '编辑任务',
      sub: isNew ? '' : (task.title || ''),
      body: formHtml(task),
      footer:
        '<button class="btn" data-act="cancel">取消</button>' +
        '<button class="btn btn-primary" data-act="save">保存</button>',
      onMount: function (rootEl, close) {
        rootEl.querySelector('[data-act="cancel"]').onclick = close;

        /* 备注框跟门店走：换个门店就把那家的备注带出来（不然会把 A 家的备注存到 B 家） */
        var storeSel = rootEl.querySelector('[name="storeId"]');
        var remarkEl = rootEl.querySelector('[name="remark"]');
        if (storeSel && remarkEl) {
          storeSel.addEventListener('change', function () {
            var st = S.storeById(storeSel.value);
            remarkEl.value = (st && st.remark) || '';
          });
        }

        /* 改门店 / 阶段 / 开业前天数，建议完成日即时重算 */
        var hint = rootEl.querySelector('[data-due-hint]');
        function repaintHint() {
          var bv = UI.formValue(rootEl, 'before');
          hint.innerHTML = dueHintHtml({
            id: task ? task.id : '',
            stage: UI.formValue(rootEl, 'stage'),
            storeId: UI.formValue(rootEl, 'storeId'),
            title: UI.formValue(rootEl, 'title'),
            before: bv === '' ? null : bv
          });
        }
        ['storeId', 'stage', 'before', 'title'].forEach(function (name) {
          var el = rootEl.querySelector('[name="' + name + '"]');
          if (el) {
            el.addEventListener('change', repaintHint);
            el.addEventListener('input', repaintHint);
          }
        });

        rootEl.querySelector('[data-act="save"]').onclick = function () {
          var title = UI.formValue(rootEl, 'title');
          if (!title) {
            UI.toast('任务名称不能为空', 'error');
            return;
          }
          var sid = UI.formValue(rootEl, 'storeId');
          var payload = {
            title: title,
            storeId: sid,
            stage: UI.formValue(rootEl, 'stage'),
            assigneeId: UI.formValue(rootEl, 'assigneeId'),
            before: Math.max(0, Number(UI.formValue(rootEl, 'before')) || 0),
            status: UI.formValue(rootEl, 'status'),
            priority: UI.formValue(rootEl, 'priority')
            /* 备注不写 task.remark：这里填的是「门店备注」，落到 store.remark（下面单独写） */
          };

          /* 门店备注：和门店管理同一份，值变了才写，避免无意义的同步 */
          if (sid) {
            var st = S.storeById(sid);
            var rm = UI.formValue(rootEl, 'remark');
            if (st && String(st.remark || '') !== String(rm || '')) {
              S.updateStore(sid, { remark: rm });
            }
          }

          if (isNew) {
            S.addTask(payload);
            UI.toast('任务已创建', 'success');
          } else {
            S.updateTask(task.id, payload);
            UI.toast('任务已更新', 'success');
          }
          close();
          App.refresh({ keep: true });
        };
      }
    });
  }

  /* ================= 筹建任务清单（模板库） ================= */

  var TPL_ROLES = ['售前', '售后', '接单'];

  /* 当前「一级 + 二级」的全量快照，用来对比保存前后时间线多了哪些二级 */
  function subsSnapshot() {
    var m = S.stageSubsWithUsed();
    var flat = [];
    Object.keys(m).forEach(function (base) {
      m[base].forEach(function (sub) { flat.push(C.stageValue(base, sub)); });
    });
    return flat;
  }

  function tplRowHtml(t) {
    t = t || {};
    var stage = t.stage || defaultStage();
    var role = t.role || TPL_ROLES[0];

    return '<div class="tpl-row">' +
      '<span class="tpl-grip" title="按住上下拖动，调整任务顺序">' + UI.icon('grip') + '</span>' +
      '<div class="tpl-name">' +
        '<input class="input" data-k="title" value="' + U.esc(t.title || '') + '" placeholder="例如：办理营业执照" />' +
        '<button type="button" class="tpl-from" data-title-pick' +
          ' title="列出当前「所属阶段」下面的二级，挑一个当任务名，所属阶段会一起换成它">' +
          UI.icon('list') + '</button>' +
      '</div>' +
      '<button type="button" class="sp-trigger" data-stage-pick data-v="' + U.esc(stage) + '"' +
        ' title="选阶段；二级可以在这里直接新建 / 改名 / 删除，改完同步到左侧时间线">' +
        '<span class="sp-tl">' + U.esc(C.stageLabel(stage, ' · ')) + '</span>' + UI.icon('arrow') +
      '</button>' +
      '<input class="input" type="number" min="0" max="365" data-k="before" value="' +
        (t.before == null ? 20 : t.before) + '" />' +
      '<select class="select" data-k="role">' + UI.options(TPL_ROLES, role) + '</select>' +
      '<button class="tpl-del" type="button" title="删掉这条">' + UI.icon('close') + '</button>' +
    '</div>';
  }

  function openTemplates() {
    var list = S.templates();

    UI.modal({
      title: '筹建任务清单',
      sub: list.length ? '共 ' + list.length + ' 条任务' : '还没有任务',
      size: 'lg',
      body:
        '<p class="tpl-tip">这份清单<b>完全由你自己维护</b>，系统不带任何内置任务。' +
          '新建门店时如果勾选「一并派发筹建任务」，就按这里生成；截止日期 = 门店开业日往前推你填的天数。' +
          '<b>按住左侧 ⠿ 可以上下拖动调整顺序</b>（派任务时按这个顺序生成）。' +
          '<b>改动只影响之后新建的门店，已有门店的任务不会被改。</b><br />' +
          '<b>「完成后进到」= 这条做完，门店自动推到这个阶段</b>：' +
          '比如「图纸」完成后进到「已出图」，「营业执照」完成后进到「建档资料」。' +
          '门店阶段只往前推、不往回退，所以几件事同时推进也不会打架。<br />' +
          '<b>这一列用的就是左侧那条阶段时间线</b>：点开只能选一级或二级，' +
          '二级要加 / 改名 / 删除，请去左侧「阶段时间线」里做，那边改完这里立刻同步。<br />' +
          '<b>「任务名称」右边的小按钮只列这个阶段的二级</b>：完成后进到是「已出图」，就只给' +
          '「已做首批 / 未做首批」这类选项，挑一个，任务名和落点一起填好。' +
          (state.stage
            ? '<b>当前时间线选的是「' + U.esc(C.stageLabel(C.stageValue(state.stage, state.sub))) +
              '」，点「新增一条」会自动带上它。</b>'
            : '') +
        '</p>' +
        '<div class="tpl-head" id="tplHead"' + (list.length ? '' : ' hidden') + '>' +
          '<span></span><span>任务名称</span><span>完成后进到</span><span>开业前(天)</span><span>默认模块</span><span></span>' +
        '</div>' +
        '<div class="tpl-rows" id="tplRows">' + list.map(tplRowHtml).join('') + '</div>' +
        '<div class="tpl-empty" id="tplEmpty"' + (list.length ? ' hidden' : '') + '>' +
          '清单还是空的，点下面「新增一条」自己写；<br />' +
          '也可以点「载入常用任务」先填一份草稿，改完再保存。' +
        '</div>' +
        '<div class="tpl-foot">' +
          '<button class="btn btn-sm" type="button" data-tpl="add">' + UI.icon('plus') + '新增一条</button>' +
          '<span class="link-more" data-tpl="fill">载入常用任务</span>' +
        '</div>',
      footer:
        '<button class="btn" data-tpl="cancel">取消</button>' +
        '<button class="btn btn-primary" data-tpl="save">保存清单</button>',
      onMount: function (rootEl, close) {
        var rowsBox = rootEl.querySelector('#tplRows');
        var emptyBox = rootEl.querySelector('#tplEmpty');
        var headBox = rootEl.querySelector('#tplHead');
        var subBox = rootEl.querySelector('.modal-sub') || document.querySelector('.modal-sub');
        var savedLen = list.length;

        /* 行数变化时同步：空态、列头、标题条数 */
        function syncEmpty() {
          var n = rowsBox.querySelectorAll('.tpl-row').length;
          if (emptyBox) emptyBox.hidden = n > 0;
          if (headBox) headBox.hidden = n === 0;
          if (subBox) {
            subBox.textContent = n === 0
              ? '还没有任务'
              : n + ' 条任务' + (n === savedLen ? '' : '（未保存）');
          }
        }

        function readRows() {
          var out = [];
          rowsBox.querySelectorAll('.tpl-row').forEach(function (r) {
            out.push({
              title: r.querySelector('[data-k="title"]').value,
              stage: r.querySelector('[data-stage-pick]').getAttribute('data-v'),
              before: r.querySelector('[data-k="before"]').value,
              role: r.querySelector('[data-k="role"]').value
            });
          });
          return out.filter(function (x) { return String(x.title || '').trim(); });
        }

        /* ---- 所属阶段：只负责选，二级的增删改统一在左侧「阶段时间线」里做 ---- */
        function paintStageBtn(btn) {
          var t = btn.querySelector('.sp-tl');
          if (t) t.textContent = C.stageLabel(btn.getAttribute('data-v'), ' · ');
        }

        function openStagePick(btn) {
          UI.openStageMenu({
            anchor: btn,
            canEdit: false,
            footTip: '二级在左侧「阶段时间线」里加 / 改名 / 删除，这里只负责选',
            getValue: function () { return btn.getAttribute('data-v'); },
            getSubs: function () { return S.stageSubsWithUsed(); },
            onPick: function (v) {
              btn.setAttribute('data-v', v);
              paintStageBtn(btn);
            }
          });
        }

        /* ---- 任务名称：只挑当前所属阶段下面的二级（「未出图」→ 已做首批 / 未做首批） ---- */
        function openNamePick(btn) {
          var row = btn.closest('.tpl-row');
          var stageBtn = row.querySelector('[data-stage-pick]');
          var titleInp = row.querySelector('[data-k="title"]');
          var base = C.stageSplit(stageBtn.getAttribute('data-v')).base;
          if (!C.isStage(base)) base = C.stageSplit(defaultStage()).base;

          UI.openStageMenu({
            anchor: btn,
            canEdit: false,
            onlySubs: true,
            getValue: function () { return stageBtn.getAttribute('data-v'); },
            /* 只给这个阶段自己的二级，别的阶段的不混进来 */
            getSubs: function () {
              var all = S.stageSubsWithUsed();
              var one = {};
              if (all[base] && all[base].length) one[base] = all[base];
              return one;
            },
            emptyTip: '「' + U.esc(base) + '」下面还没有二级。<br />' +
              '点这行的「所属阶段」，在该阶段右边点 ＋ 新建一个（比如「已做首批」），' +
              '回来这里就能选了。',
            footTip: '只列「' + U.esc(base) + '」下面的二级',
            onPick: function (v) {
              var p = C.stageSplit(v);
              if (!p.sub) return;
              titleInp.value = p.sub;
              stageBtn.setAttribute('data-v', v);
              paintStageBtn(stageBtn);
              UI.toast('已用二级「' + p.sub + '」当任务名，所属阶段一起定到「' + C.stageLabel(v) + '」',
                'success', 2800);
              titleInp.focus();
            }
          });
        }

        /* ---- 按住左侧 ⠿ 上下拖动排序（只认手柄，不影响输入框选文字） ---- */
        var dragRow = null;

        function endDrag() {
          document.removeEventListener('pointerup', endDrag, true);
          document.removeEventListener('pointercancel', endDrag, true);
          document.body.classList.remove('tpl-drag');
          if (!dragRow) return;
          dragRow.classList.remove('dragging');
          dragRow = null;
        }

        rowsBox.addEventListener('pointerdown', function (e) {
          var grip = e.target.closest('.tpl-grip');
          if (!grip) return;
          var row = grip.closest('.tpl-row');
          if (!row) return;
          e.preventDefault();
          dragRow = row;
          row.classList.add('dragging');
          document.body.classList.add('tpl-drag');
          /* 松手可能发生在弹窗外面，所以挂在 document 上（capture，保证一定收到） */
          document.addEventListener('pointerup', endDrag, true);
          document.addEventListener('pointercancel', endDrag, true);
          try { grip.setPointerCapture(e.pointerId); } catch (err) {}
        });

        rowsBox.addEventListener('pointermove', function (e) {
          if (!dragRow) return;
          e.preventDefault();
          var rows = [].slice.call(rowsBox.querySelectorAll('.tpl-row'));
          var target = null;
          for (var i = 0; i < rows.length; i++) {
            if (rows[i] === dragRow) continue;
            var box = rows[i].getBoundingClientRect();
            if (e.clientY < box.top + box.height / 2) { target = rows[i]; break; }
          }
          if (target) rowsBox.insertBefore(dragRow, target);
          else rowsBox.appendChild(dragRow);
        });

        rootEl.addEventListener('click', function (e) {
          /* 所属阶段：弹出可增删改二级的菜单 */
          var stageBtn = e.target.closest('[data-stage-pick]');
          if (stageBtn) { openStagePick(stageBtn); return; }

          /* 任务名称：从时间线的二级里挑 */
          var nameBtn = e.target.closest('[data-title-pick]');
          if (nameBtn) { openNamePick(nameBtn); return; }

          /* 新增一条 */
          if (e.target.closest('[data-tpl="add"]')) {
            rowsBox.insertAdjacentHTML('beforeend', tplRowHtml({}));
            syncEmpty();
            var last = rowsBox.lastElementChild;
            var inp = last && last.querySelector('input');
            if (inp) inp.focus();
            return;
          }

          /* 载入常用任务：只是把草稿填进表格，不点保存就不会生效 */
          if (e.target.closest('[data-tpl="fill"]')) {
            rowsBox.innerHTML = C.TASK_TEMPLATES.map(tplRowHtml).join('');
            syncEmpty();
            UI.toast('已填入 ' + C.TASK_TEMPLATES.length + ' 条草稿，改完点「保存清单」', 'info', 2400);
            return;
          }

          /* 删掉一条 */
          if (e.target.closest('.tpl-del')) {
            var row = e.target.closest('.tpl-row');
            if (row) row.remove();
            syncEmpty();
            return;
          }

          if (e.target.closest('[data-tpl="cancel"]')) { close(); return; }

          if (e.target.closest('[data-tpl="save"]')) {
            var clean = readRows();
            var before = subsSnapshot();

            /* 存盘 + 提示时间线同步情况（新增了哪些二级，让人确认两边真的连上了） */
            var commit = function (list, tip) {
              S.saveTemplates(list);
              var added = subsSnapshot().filter(function (v) { return before.indexOf(v) < 0; });
              close();
              App.refresh();
              UI.toast(tip, 'success');
              if (added.length) {
                UI.toast('阶段时间线已同步，新增二级：' +
                  added.map(function (v) { return '「' + C.stageLabel(v) + '」'; }).join('、'),
                  'info', 3600);
              }
            };

            if (!clean.length) {
              UI.confirm({
                title: '保存空清单？',
                text: '保存后这份清单就是 0 条，新建门店不会再自动派发筹建任务。',
                okText: '保存空清单',
                onOk: function () {
                  commit([], '清单已清空，新建门店不再自动派任务');
                }
              });
              return;
            }

            commit(clean, '筹建任务清单已保存（' + clean.length + ' 条）');
          }
        });
      }
    });
  }

  function render() {
    var tabs = TABS.map(function (tb) {
      return '<div class="tab' + (state.tab === tb.key ? ' active' : '') + '" data-tab="' + tb.key + '" ' +
        'title="按门店里任务的状态筛选门店">' +
        tb.label + '<span class="cnt">' + tabCount(tb.key) + '</span></div>';
    }).join('');

    var st = S.stats();
    var stores = S.getState().stores;
    var lateStores = stores.filter(function (x) { return statOfTasks(tasksOf(x.id)).late > 0; }).length;

    return '' +
    '<div class="page-head fade-up">' +
      '<div>' +
        '<h1>任务管理</h1>' +
        '<p>共 ' + stores.length + ' 家门店 · ' + st.taskCounts.total + ' 条筹建任务，其中 ' +
          st.taskCounts.overdue + ' 条已逾期' +
          (lateStores ? '（' + lateStores + ' 家门店有逾期）' : '') + '</p>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px">' +
        '<button class="btn" data-act="tpl">' + UI.icon('list') + '筹建任务清单</button>' +
        '<button class="btn btn-primary" data-act="add">' + UI.icon('plus') + '新增任务</button>' +
      '</div>' +
    '</div>' +

    '<div class="tk-layout fade-up" style="animation-delay:.05s">' +
      '<aside class="card tk-rail fade-up" id="tkRail">' + railHtml() + '</aside>' +

      '<section class="card tk-main">' +
        '<div class="tk-toolbar">' +
          '<div class="tabs tabs-sm" id="taskTabs">' + tabs + '</div>' +
          '<span class="spacer" style="margin-left:auto"></span>' +
          '<label class="mini-search">' + UI.icon('search') +
            '<input id="tkSearch" placeholder="搜索门店 / 省份" value="' + U.esc(state.q) + '" />' +
          '</label>' +
          '<select class="select" id="tkOwner" style="width:auto;height:31px;font-size:12px">' +
            '<option value="">全部负责人</option>' + UI.options(S.getState().members, state.owner, 'id', 'name') +
          '</select>' +
        '</div>' +
        '<div id="tkFilterBar">' + filterBarHtml() + '</div>' +
        '<div id="storeListWrap">' + storeRowsHtml() + '</div>' +
      '</section>' +
    '</div>';
  }

  function updateList(root) {
    var rail = root.querySelector('#tkRail');
    if (rail) rail.innerHTML = railHtml();

    var bar = root.querySelector('#tkFilterBar');
    if (bar) bar.innerHTML = filterBarHtml();

    var wrap = root.querySelector('#storeListWrap');
    if (wrap) wrap.innerHTML = storeRowsHtml();

    root.querySelectorAll('#taskTabs .tab').forEach(function (el) {
      var key = el.getAttribute('data-tab');
      el.classList.toggle('active', key === state.tab);
      var cnt = el.querySelector('.cnt');
      if (cnt) cnt.textContent = tabCount(key);
    });

    var ow = root.querySelector('#tkOwner');
    if (ow) ow.value = state.owner;
  }

  var debouncedSearch = U.debounce(function (root, val) {
    state.q = val;
    state.page = 1;
    updateList(root);
  }, 240);

  function mount(root) {
    root.addEventListener('click', function (e) {
      /* ---- 左侧时间线：二级阶段 / 阶段 ---- */
      var subEl = e.target.closest('[data-sub]');
      if (subEl && root.contains(subEl)) {
        var subName = subEl.getAttribute('data-sub');
        state.sub = (state.sub === subName) ? '' : subName;
        state.page = 1;
        updateList(root);
        return;
      }

      var stageEl = e.target.closest('[data-stage]');
      if (stageEl && root.contains(stageEl)) {
        var skey = stageEl.getAttribute('data-stage');
        state.stage = (state.stage === skey) ? '' : skey;   /* 再点一次 = 取消 */
        state.sub = '';
        state.page = 1;
        updateList(root);
        return;
      }

      if (e.target.closest('[data-stage-all]')) {
        state.stage = '';
        state.sub = '';
        state.page = 1;
        updateList(root);
        return;
      }

      /* ---- 右侧门店行：点一下展开这家店的任务，别家自动收起（默认全部收起） ---- */
      var rowEl = e.target.closest('[data-srow]');
      if (rowEl && root.contains(rowEl)) {
        toggleStoreRow(root, rowEl.getAttribute('data-srow'));
        return;
      }

      var clearEl = e.target.closest('[data-clear]');
      if (clearEl) {
        var what = clearEl.getAttribute('data-clear');
        if (what === 'stage' || what === 'all') state.stage = '';
        if (what === 'sub' || what === 'all') state.sub = '';
        if (what === 'owner' || what === 'all') state.owner = '';
        if (what === 'q' || what === 'all') {
          state.q = '';
          var si = root.querySelector('#tkSearch');
          if (si) si.value = '';
        }
        state.page = 1;
        updateList(root);
        return;
      }

      var tab = e.target.closest('[data-tab]');
      if (tab && root.contains(tab)) {
        state.tab = tab.getAttribute('data-tab');
        state.page = 1;
        updateList(root);
        return;
      }

      var el = e.target.closest('[data-act], [data-page]');
      if (!el || !root.contains(el)) return;

      if (el.hasAttribute('data-page')) {
        state.page = Number(el.getAttribute('data-page'));
        updateList(root);
        return;
      }

      var act = el.getAttribute('data-act');
      var id = el.getAttribute('data-id');
      var task = id ? S.taskById(id) : null;

      if (act === 'add') openForm(null);
      else if (act === 'tpl') openTemplates();
      else if (act === 'edit' && task) openForm(task);
      else if (act === 'push' && task) {
        completeTask(task);
      } else if (act === 'snooze' && task) {
        var snDays = S.snoozeTask(task.id, 3);
        var snDue = S.suggestDateOf(task);
        UI.toast('已往后放 3 天（累计 ' + snDays + ' 天）' +
          (snDue ? '，' + U.monthDay(snDue) + ' 再提醒' : ''), 'success');
        App.refresh({ keep: true });
      } else if (act === 'unsnooze' && task) {
        S.unsnoozeTask(task.id);
        UI.toast('已撤销延后，回到原定日期', 'info');
        App.refresh({ keep: true });
      } else if (act === 'reopen' && task) {
        S.updateTask(task.id, { status: 'pending' });
        UI.toast('任务已重新打开', 'info');
        App.refresh({ keep: true });
      } else if (act === 'del' && task) {
        UI.confirm({
          title: '删除任务',
          text: '确定删除任务 <b>' + U.esc(task.title) + '</b> 吗？',
          danger: true,
          okText: '删除',
          onOk: function () {
            S.removeTask(task.id);
            UI.toast('任务已删除', 'success');
            App.refresh({ keep: true });
          }
        });
      }
    });

    root.addEventListener('input', function (e) {
      if (e.target.id === 'tkSearch') debouncedSearch(root, e.target.value.trim());
    });

    root.addEventListener('change', function (e) {
      if (e.target.id === 'tkOwner') {
        state.owner = e.target.value;
        state.page = 1;
        updateList(root);
      }
    });
  }

  function onEnter(params) {
    state.open = '';        /* 每次进来都是全部收起，想看哪家点哪家 */
    if (params && params.task) {
      var t = S.taskById(params.task);
      if (t) {
        state.tab = 'all';
        state.page = 1;
        /* 从搜索点进来的任务：切到它所属门店的阶段并展开这家店，一眼能看到 */
        var owner = S.storeById(t.storeId);
        if (owner) {
          state.stage = owner.stage;
          state.sub = '';
          state.open = owner.id;
        }
        setTimeout(function () { openForm(t); }, 60);
      }
    }
    if (params && params.member) {
      state.owner = params.member;
    }
    if (params && params.store) {
      var st = S.storeById(params.store);
      if (st) {
        state.stage = st.stage;
        state.sub = '';
        state.open = st.id;
        state.page = 1;
      }
    }
  }

  return { title: '任务管理', render: render, mount: mount, onEnter: onEnter };
})();

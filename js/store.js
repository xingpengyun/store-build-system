/* ==========================================================
   store.js — 数据层
   云端为准：启动时从云端拉取，增删改后异步推送
   本地 localStorage 只作为离线缓存 / 首次导入的来源
   ========================================================== */
window.Store = (function () {
  'use strict';

  var C = window.CONST;
  var U = window.Utils;
  var KEY = C.STORAGE_KEY;

  var state = null;
  var listeners = [];
  var online = true;
  var syncTimer = null;
  var lastError = '';

  /* ================= 本地缓存 ================= */

  function cacheLocal() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('[Store] 本地缓存写入失败', e);
    }
  }

  function readLocal() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var d = JSON.parse(raw);
      if (d && d.stores && d.tasks && d.members) return d;
    } catch (e) { /* ignore */ }
    return null;
  }

  function hasLocalData() {
    var d = readLocal();
    return !!(d && d.stores && d.stores.length);
  }

  /* ================= 一级阶段（可自定义） =================
     settings.stages = [{ key, color, soft }, ...]，存的是「完整列表」（含出厂那几个）。
     - 没存过 → 用 CONST.STAGE_BUILTIN（出厂 6 个）
     - 存过 → 以它为准，顺序也以它为准
     合并结果直接写回 CONST.STAGES，这样首页 / 门店 / 报表 / 时间线都自动跟同一份，
     不需要改几十处调用点。原始出厂值在 CONST.STAGE_BUILTIN，不会丢。
     ========================================================= */

  function resolveStages(settings) {
    var saved = settings && settings.stages;
    if (Array.isArray(saved) && saved.length) {
      var out = [];
      var seen = {};
      saved.forEach(function (x) {
        var key = String((x && x.key) == null ? '' : x.key).trim();
        if (!key || seen[key]) return;
        if (key.indexOf('/') >= 0) return;
        seen[key] = 1;
        var d = null;
        C.STAGE_BUILTIN.forEach(function (b) { if (b.key === key) d = b; });
        out.push({
          key: key,
          color: (x && x.color) || (d && d.color) || '#8b95aa',
          soft: (x && x.soft) || (d && d.soft) || '#f0f2f6'
        });
      });
      if (out.length) return out;
    }
    return C.STAGE_BUILTIN.map(function (x) {
      return { key: x.key, color: x.color, soft: x.soft };
    });
  }

  function applyStages(list) {
    C.STAGES.length = 0;
    (list || []).forEach(function (x) { C.STAGES.push(x); });
    return C.STAGES;
  }

  /* 当前生效的一级阶段（就是 CONST.STAGES，包一层方便页面读） */
  function stages() {
    return C.STAGES;
  }

  function stageUsage(name) {
    var stores = 0, tasks = 0, tpls = 0;
    state.stores.forEach(function (s) { if (s.stage === name) stores++; });
    state.tasks.forEach(function (t) {
      if (C.stageSplit(t.stage).base === name) tasks++;
    });
    templates().forEach(function (t) {
      if (C.stageSplit(t.stage).base === name) tpls++;
    });
    return { stores: stores, tasks: tasks, templates: tpls };
  }

  function stageByName(name) {
    var hit = null;
    C.STAGES.forEach(function (x) { if (x.key === name) hit = x; });
    return hit;
  }

  function pickStageColor() {
    var used = {};
    C.STAGES.forEach(function (x) { used[x.color] = 1; });
    var pick = null;
    C.STAGE_PALETTE.forEach(function (p) { if (!pick && !used[p.color]) pick = p; });
    return pick || C.STAGE_PALETTE[C.STAGES.length % C.STAGE_PALETTE.length];
  }

  /* 新增一级阶段，插在 after（某个阶段名）后面；不传就加在末尾。
     返回值：{ ok, error, stage } —— 页面按 ok 决定提示什么 */
  function addStage(name, after) {
    name = String(name == null ? '' : name).trim().replace(/\s+/g, ' ');
    if (!name) return { ok: false, error: '名字不能为空' };
    if (name.indexOf('/') >= 0) return { ok: false, error: '阶段名里不要带斜杠（斜杠是「一级 / 二级」的分隔符）' };
    if (stageByName(name)) return { ok: false, error: '「' + name + '」已经存在' };

    var list = C.STAGES.map(function (x) { return { key: x.key, color: x.color, soft: x.soft }; });
    var p = pickStageColor();
    var item = { key: name, color: p.color, soft: p.soft };

    var at = list.length;
    if (after) {
      var i = -1;
      list.forEach(function (x, idx) { if (x.key === after) i = idx; });
      if (i >= 0) at = i + 1;
    }
    list.splice(at, 0, item);

    setSetting('stages', list);
    applyStages(list);
    return { ok: true, stage: item };
  }

  /* 一级阶段改名：门店、任务、二级、筹建任务清单四处一起改 */
  function renameStage(from, to) {
    from = String(from == null ? '' : from).trim();
    to = String(to == null ? '' : to).trim().replace(/\s+/g, ' ');
    if (!from || !to || from === to) return { ok: false, error: '名字没变' };
    if (to.indexOf('/') >= 0) return { ok: false, error: '阶段名里不要带斜杠' };
    if (!stageByName(from)) return { ok: false, error: '找不到阶段「' + from + '」' };
    if (stageByName(to)) return { ok: false, error: '「' + to + '」已经存在' };

    var hit = 0;

    /* 1) 阶段列表（原地换名，位置不变） */
    var list = C.STAGES.map(function (x) {
      return x.key === from
        ? { key: to, color: x.color, soft: x.soft }
        : { key: x.key, color: x.color, soft: x.soft };
    });
    setSetting('stages', list);
    applyStages(list);

    /* 2) 二级 map 的 key */
    var subs = stageSubs();
    if (subs[from]) {
      var next = {};
      Object.keys(subs).forEach(function (k) {
        next[k === from ? to : k] = subs[k];
      });
      saveStageSubs(next);
    }

    /* 3) 筹建任务清单 */
    var tpls = templates();
    var tplDirty = false;
    tpls.forEach(function (t) {
      var p = C.stageSplit(t.stage);
      if (p.base !== from) return;
      t.stage = C.stageValue(to, p.sub);
      tplDirty = true;
      hit++;
    });
    if (tplDirty) saveTemplates(tpls);

    /* 4) 门店 + 任务 */
    var sChanged = [];
    state.stores.forEach(function (s) {
      if (s.stage !== from) return;
      s.stage = to;
      sChanged.push(s);
      hit++;
    });
    var tChanged = [];
    state.tasks.forEach(function (t) {
      var p = C.stageSplit(t.stage);
      if (p.base !== from) return;
      t.stage = C.stageValue(to, p.sub);
      tChanged.push(t);
      hit++;
    });
    if (sChanged.length) pushMany('stores', sChanged);
    if (tChanged.length) pushMany('tasks', tChanged);
    if (sChanged.length || tChanged.length) cacheLocal();

    return { ok: true, hit: hit };
  }

  /* 删除一级阶段：
     - 还有门店在这个阶段 → 不许删（先让门店换阶段，否则门店会变成「找不到阶段」）
     - 没有门店 → 挂在上面的任务 / 清单挪到第一个阶段，二级定义一起删掉 */
  function removeStage(name) {
    name = String(name == null ? '' : name).trim();
    var use = stageUsage(name);
    if (!stageByName(name)) return { ok: false, error: '找不到阶段「' + name + '」' };
    if (C.STAGES.length <= 1) return { ok: false, error: '至少要留一个阶段' };
    if (use.stores) {
      return {
        ok: false,
        error: '「' + name + '」下还有 ' + use.stores + ' 家门店，先把它们改到别的阶段再删'
      };
    }

    var rest = C.STAGES.filter(function (x) { return x.key !== name; })
      .map(function (x) { return { key: x.key, color: x.color, soft: x.soft }; });
    var fallback = rest[0].key;

    setSetting('stages', rest);
    applyStages(rest);

    /* 二级定义 */
    var subs = stageSubs();
    if (subs[name]) {
      delete subs[name];
      saveStageSubs(subs);
    }

    /* 任务 / 清单退回第一个阶段（不是删掉它们） */
    var tpls = templates();
    var tplDirty = false;
    tpls.forEach(function (t) {
      if (C.stageSplit(t.stage).base !== name) return;
      t.stage = fallback;
      tplDirty = true;
    });
    if (tplDirty) saveTemplates(tpls);

    var changed = [];
    state.tasks.forEach(function (t) {
      if (C.stageSplit(t.stage).base !== name) return;
      t.stage = fallback;
      changed.push(t);
    });
    if (changed.length) {
      pushMany('tasks', changed);
      cacheLocal();
    }

    return { ok: true, moved: use.tasks + use.templates, to: fallback };
  }

  /* 拖完顺序：keys 是完整的新顺序（可以只给一部分，剩下的按原顺序接在后面） */
  function saveStageOrder(keys) {
    var map = {};
    C.STAGES.forEach(function (x) { map[x.key] = x; });

    var list = [];
    var seen = {};
    (keys || []).forEach(function (k) {
      if (!map[k] || seen[k]) return;
      seen[k] = 1;
      list.push({ key: k, color: map[k].color, soft: map[k].soft });
    });
    C.STAGES.forEach(function (x) {
      if (seen[x.key]) return;
      list.push({ key: x.key, color: x.color, soft: x.soft });
    });

    if (list.length !== C.STAGES.length) return C.STAGES;
    setSetting('stages', list);
    return applyStages(list);
  }

  /* ================= 兼容旧数据 ================= */

  function normalized(data) {
    data = data || {};
    data.settings = data.settings || {};
    data.stores = data.stores || [];
    data.tasks = data.tasks || [];
    data.members = data.members || [];
    data.arrivals = data.arrivals || [];
    data.alertsRead = data.alertsRead || [];

    if (!data.settings.brand) data.settings.brand = '门店筹建管理系统';
    if (!data.settings.slogan) data.settings.slogan = '让每一家门店，按时开业！';
    if (data.settings.warnDays == null) data.settings.warnDays = 3;
    if (!data.settings.teamName) data.settings.teamName = '阿蛮团队';

    data.meta = data.meta || {};
    if ((data.meta.version || 1) < 2) {
      if (data.settings.teamName === '团队') data.settings.teamName = '阿蛮团队';
      data.meta.version = 2;
    }

    /* 一级阶段：有自定义就用自定义的，否则出厂 6 个；
       结果写回 CONST.STAGES，全站（首页 / 门店 / 报表 / 时间线）自动跟着变 */
    applyStages(resolveStages(data.settings));

    /* 「已出图」的二级补种一次：
       之前已经保存过 stageSubs 的老数据，也要能拿到「已做首批 / 未做首批」。
       打过 stageSeed 标记就不再补，你之后主动删掉它们不会被塞回来。 */
    if (data.settings.stageSeed !== 1) {
      var subs = data.settings.stageSubs;
      if (!subs || typeof subs !== 'object') subs = data.settings.stageSubs = {};
      var seed = (C.DEFAULT_STAGE_SUBS && C.DEFAULT_STAGE_SUBS['已出图']) || [];
      if (seed.length) {
        var cur = Array.isArray(subs['已出图']) ? subs['已出图'].slice() : [];
        seed.forEach(function (x) { if (cur.indexOf(x) < 0) cur.push(x); });
        if (cur.length) subs['已出图'] = cur;
      }
      data.settings.stageSeed = 1;
    }

    return data;
  }

  /* ================= 云端推送（异步，不阻塞界面） ================= */

  function push(table, obj) {
    if (!window.Cloud) return;
    window.Cloud.upsert(table, obj).then(function () {
      if (!online) {
        online = true;
        if (window.UI) UI.toast('已恢复云端连接', 'success');
      }
    }).catch(function (e) {
      online = false;
      lastError = e.message || String(e);
      console.error('[cloud] 保存失败', table, e);
      if (window.UI) UI.toast('云端保存失败：' + lastError, 'error');
    });
  }

  function pushMany(table, list) {
    if (!window.Cloud || !list || !list.length) return;
    list.forEach(function (item) { push(table, item); });
  }

  function drop(table, id) {
    if (!window.Cloud) return;
    window.Cloud.remove(table, id).catch(function (e) {
      console.error('[cloud] 删除失败', table, id, e);
      if (window.UI) UI.toast('云端删除失败：' + (e.message || e), 'error');
    });
  }

  function pushSettings() {
    if (!window.Cloud) return;
    window.Cloud.saveSettings(state.settings, state.alertsRead).catch(function (e) {
      console.error('[cloud] 设置保存失败', e);
    });
  }

  /* 标记「这套系统已经初始化过」，清空后不会再自动塞演示数据 */
  function markInitialized() {
    if (!state) return;
    state.settings = state.settings || {};
    state.settings.initialized = true;
    if (window.Cloud) {
      window.Cloud.saveSettings(state.settings, state.alertsRead).catch(function () {});
    }
  }

  /* ================= 加载 ================= */

  function load(onProgress) {
    return window.Cloud.pullAll().then(function (data) {
      online = true;
      var remoteEmpty = !data.stores.length && !data.tasks.length && !data.members.length;

      if (remoteEmpty) {
        /* 之前用过（主动清空过）→ 就是空系统，不要把本地缓存又搬回来 */
        if (data.settings && data.settings.initialized) {
          state = normalized({
            stores: [], tasks: [], members: [], arrivals: [],
            settings: data.settings, alertsRead: data.alertsRead
          });
          cacheLocal();
          return { imported: 0, seeded: false, empty: true };
        }

        var local = readLocal();
        var hasLocal = !!(local && local.stores && local.stores.length);

        /* 本地有数据 → 首次上云迁移 */
        if (hasLocal) {
          return window.Cloud.importAll(local, onProgress).then(function () {
            state = normalized(JSON.parse(JSON.stringify(local)));
            markInitialized();
            cacheLocal();
            return { imported: local.stores.length, seeded: false };
          });
        }

        /* 全新空系统 */
        state = normalized({ stores: [], tasks: [], members: [], arrivals: [], settings: null });
        markInitialized();
        cacheLocal();
        return { imported: 0, seeded: false, empty: true };
      }

      state = normalized(data);
      cacheLocal();
      return { imported: 0, seeded: false };
    }).catch(function (e) {
      /* 网络失败 → 退回本地缓存，离线可用 */
      online = false;
      lastError = e.message || String(e);
      var local = readLocal();
      if (local) {
        state = normalized(local);
        return { imported: 0, seeded: false, offline: true };
      }
      throw e;
    });
  }

  /* ================= 自动同步（拉取别人的改动） ================= */

  function startAutoSync(intervalMs, onChange) {
    stopAutoSync();
    var lastStamp = stamp();
    syncTimer = setInterval(function () {
      if (document.hidden) return;
      if (document.querySelector('.modal-mask')) return;   /* 有弹窗时别打断 */

      window.Cloud.pullAll().then(function (data) {
        var next = normalized(data);
        var nextStamp = stampOf(next);
        if (nextStamp === lastStamp) return;
        lastStamp = nextStamp;
        state = next;
        cacheLocal();
        if (onChange) onChange();
      }).catch(function () { /* 静默失败，下个周期再试 */ });
    }, intervalMs || 45000);
  }

  function stopAutoSync() {
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = null;
  }

  function stampOf(s) {
    return [s.stores.length, s.tasks.length, s.members.length, s.arrivals.length].join('/');
  }

  function stamp() {
    return state ? stampOf(state) : '';
  }

  /* ================= 查询辅助 ================= */

  function getState() { return state; }
  function isOnline() { return online; }
  function getLastError() { return lastError; }

  function storeById(id) {
    for (var i = 0; i < state.stores.length; i++) {
      if (state.stores[i].id === id) return state.stores[i];
    }
    return null;
  }

  function memberById(id) {
    for (var i = 0; i < state.members.length; i++) {
      if (state.members[i].id === id) return state.members[i];
    }
    return null;
  }

  function taskById(id) {
    for (var i = 0; i < state.tasks.length; i++) {
      if (state.tasks[i].id === id) return state.tasks[i];
    }
    return null;
  }

  function classify(task) {
    var t0 = U.today();
    if (task.status === 'done') return 'done';
    if (task.dueDate && task.dueDate < t0) return 'overdue';

    var s = storeById(task.storeId);
    if (s && (s.risk === 'high' || s.risk === 'overdue')) return 'risk';
    return task.status === 'doing' ? 'doing' : 'pending';
  }

  function isLate(task) { return classify(task) === 'overdue'; }

  /* ================= 统计（口径不变） ================= */

  function stats() {
    var t0 = U.today();
    var st = state;

    var taskCounts = { done: 0, doing: 0, pending: 0, overdue: 0, risk: 0, total: st.tasks.length };
    st.tasks.forEach(function (t) {
      var c = classify(t);
      taskCounts[c] = (taskCounts[c] || 0) + 1;
    });

    var stageIdxMap = {};
    var stageCounts = C.STAGES.map(function (s, i) {
      stageIdxMap[s.key] = i;
      return { key: s.key, color: s.color, soft: s.soft, count: 0 };
    });
    st.stores.forEach(function (s) {
      var i = stageIdxMap[s.stage];
      if (i != null) stageCounts[i].count += 1;
    });

    var opened = st.stores.filter(function (s) { return s.stage === '已开业'; }).length;
    var riskStores = st.stores.filter(function (s) {
      return s.risk === 'high' || s.risk === 'overdue';
    }).length;
    var attentionStores = st.stores.filter(function (s) { return s.risk === 'attention'; }).length;

    var todayTasks = st.tasks.filter(function (t) {
      if (t.status === 'done') return false;
      return t.dueDate <= t0;
    }).length;

    var weekTasks = st.tasks.filter(function (t) {
      if (t.status === 'done') return false;
      return U.diffDays(t0, t.dueDate) <= 7;
    }).length;

    var arrivals7 = st.arrivals.filter(function (a) {
      var d = U.diffDays(t0, a.etaDate);
      return a.status === 'pending' && d >= 0 && d <= 7;
    }).length;

    var team = st.members.map(function (m) {
      var mine = st.tasks.filter(function (t) { return t.assigneeId === m.id; });
      var done = 0, late = 0;
      mine.forEach(function (t) {
        var c = classify(t);
        if (c === 'done') done += 1;
        else if (c === 'overdue') late += 1;
      });
      return {
        id: m.id, name: m.name, role: m.role, color: m.color,
        total: mine.length, done: done, todo: mine.length - done, late: late,
        percent: mine.length ? Math.round(done / mine.length * 100) : 0
      };
    });
    team.sort(function (a, b) { return b.percent - a.percent || b.done - a.done; });

    var trend = [];
    for (var i = 6; i >= 0; i--) {
      var d = U.addDays(t0, -i);
      var cnt = st.arrivals.filter(function (a) {
        return a.status === 'arrived' && a.etaDate === d;
      }).length;
      trend.push({ date: d, label: U.dateDot(d), count: cnt });
    }

    var focus = [];
    st.tasks.forEach(function (t) {
      var c = classify(t);
      if (c !== 'overdue' && c !== 'risk') return;
      var s = storeById(t.storeId);
      focus.push({
        task: t, store: s, late: c === 'overdue',
        owner: memberById(t.assigneeId), days: U.diffDays(t0, t.dueDate)
      });
    });
    focus.sort(function (a, b) {
      if (a.late !== b.late) return a.late ? -1 : 1;
      return a.days - b.days;
    });
    focus = focus.slice(0, 5);

    return {
      totalStores: st.stores.length,
      opened: opened,
      building: st.stores.length - opened,
      riskStores: riskStores,
      attentionStores: attentionStores,
      taskCounts: taskCounts,
      stageCounts: stageCounts,
      todayTasks: todayTasks,
      weekTasks: weekTasks,
      arrivals7: arrivals7,
      team: team,
      trend: trend,
      focus: focus
    };
  }

  /* ================= 预警 ================= */

  function alerts() {
    var t0 = U.today();
    var warnDays = state.settings.warnDays || 3;
    var list = [];
    var seen = {};

    function addAlert(a) {
      if (seen[a.id]) return;
      seen[a.id] = true;
      a.read = state.alertsRead.indexOf(a.id) >= 0;
      list.push(a);
    }

    state.tasks.forEach(function (t) {
      if (t.status === 'done') return;
      var s = storeById(t.storeId);
      var storeName = s ? s.name : '未知门店';
      var owner = memberById(t.assigneeId);
      var c = classify(t);
      var d = U.diffDays(t0, t.dueDate);

      if (c === 'overdue') {
        addAlert({
          id: 'late-' + t.id, level: 'high', type: '任务逾期',
          title: storeName + ' · ' + t.title,
          desc: '已逾期 ' + Math.abs(d) + ' 天，原定 ' + U.monthDay(t.dueDate) + ' 完成',
          owner: owner ? owner.name : '未指派', storeId: t.storeId, taskId: t.id
        });
      } else if (d >= 0 && d <= warnDays) {
        addAlert({
          id: 'soon-' + t.id, level: 'warn', type: '即将到期',
          title: storeName + ' · ' + t.title,
          desc: '还有 ' + d + ' 天到期（' + U.monthDay(t.dueDate) + '）',
          owner: owner ? owner.name : '未指派', storeId: t.storeId, taskId: t.id
        });
      }
    });

    state.stores.forEach(function (s) {
      var pr = storeProgress(s);
      var pctTxt = '已完成 ' + pr.done + '/' + pr.total + ' 个阶段（' + pr.pct + '%）';

      if (s.risk === 'high' || s.risk === 'overdue') {
        addAlert({
          id: 'risk-' + s.id, level: 'high', type: '门店风险',
          title: s.name,
          desc: '风险等级：' + C.RISKS[s.risk].label + '，' + pctTxt + '，开业日 ' + U.monthDay(s.openDate),
          owner: (memberById(s.ownerId) || {}).name || '未指派', storeId: s.id
        });
      } else if (s.risk === 'attention') {
        addAlert({
          id: 'watch-' + s.id, level: 'warn', type: '门店关注',
          title: s.name,
          desc: pctTxt + '，距离计划开业 ' + U.diffDays(t0, s.openDate) + ' 天',
          owner: (memberById(s.ownerId) || {}).name || '未指派', storeId: s.id
        });
      }

      if (s.stage !== '已开业' && s.openDate < t0) {
        addAlert({
          id: 'miss-' + s.id, level: 'danger', type: '开业延期',
          title: s.name,
          desc: '计划开业日已过 ' + U.diffDays(s.openDate, t0) + ' 天，仍未开业',
          owner: (memberById(s.ownerId) || {}).name || '未指派', storeId: s.id
        });
      }
    });

    var order = { danger: 0, high: 1, warn: 2 };
    list.sort(function (a, b) {
      if (a.read !== b.read) return a.read ? 1 : -1;
      return (order[a.level] || 9) - (order[b.level] || 9);
    });
    return list;
  }

  function unreadAlertCount() {
    var n = 0;
    alerts().forEach(function (a) { if (!a.read) n += 1; });
    return n;
  }

  /* ================= 门店 CRUD ================= */

  function addStore(data) {
    var t0 = U.today();
    var store = {
      id: U.uid('store'),
      name: (data.name || '未命名门店').trim(),
      province: data.province || '',
      stage: data.stage || ((C.STAGES[0] || {}).key || '未出图'),
      risk: data.risk || 'normal',
      /* 云端 stores.progress 这一列还在（不做表结构迁移），但界面不再读它：
         显示用的百分比统一由 storeProgress() 按「阶段时间线」现算 */
      progress: U.clamp(Number(data.progress) || 0, 0, 100),
      ownerId: data.ownerId || (state.members[0] || {}).id,
      openDate: data.openDate || U.addDays(t0, 30),
      address: data.address || '',
      remark: data.remark || '',
      createdAt: t0
    };
    state.stores.unshift(store);
    push('stores', store);

    var tpls = templates();
    if (data.autoTasks !== false && tpls.length) {
      var roleToId = {};
      state.members.forEach(function (m) { roleToId[m.role] = m.id; });
      var created = [];
      tpls.forEach(function (tpl, i) {
        /* 截止日 = 开业日往前推 tpl.before 天；推出去了就顺延到近期 */
        var due = U.addDays(store.openDate, -(Number(tpl.before) || (i + 1) * 7));
        if (!due || due < t0) due = U.addDays(t0, 2 + i * 3);

        var t = {
          id: U.uid('task'),
          storeId: store.id,
          title: tpl.title,
          stage: tpl.stage,
          assigneeId: roleToId[tpl.role] || store.ownerId,
          dueDate: due,
          status: 'pending',
          priority: 'normal',
          remark: '',
          createdAt: t0
        };
        state.tasks.push(t);
        created.push(t);
      });
      pushMany('tasks', created);
    }

    cacheLocal();
    return store;
  }

  function updateStore(id, patch) {
    var s = storeById(id);
    if (!s) return null;
    Object.keys(patch).forEach(function (k) { s[k] = patch[k]; });
    if (patch.progress != null) s.progress = U.clamp(Number(patch.progress) || 0, 0, 100);
    push('stores', s);
    cacheLocal();
    return s;
  }

  function removeStore(id) {
    var taskIds = state.tasks.filter(function (t) { return t.storeId === id; })
      .map(function (t) { return t.id; });
    var arrIds = state.arrivals.filter(function (a) { return a.storeId === id; })
      .map(function (a) { return a.id; });

    state.stores = state.stores.filter(function (s) { return s.id !== id; });
    state.tasks = state.tasks.filter(function (t) { return t.storeId !== id; });
    state.arrivals = state.arrivals.filter(function (a) { return a.storeId !== id; });

    drop('stores', id);
    taskIds.forEach(function (tid) { drop('tasks', tid); });
    arrIds.forEach(function (aid) { drop('arrivals', aid); });

    /* 门店自己的二级跟着一起清掉，不然 settings 会越积越脏 */
    var subs = storeSubs();
    if (Object.prototype.hasOwnProperty.call(subs, id)) {
      delete subs[id];
      state.settings.storeSubs = subs;
      pushSettings();
    }

    cacheLocal();
  }

  /* ================= 任务 CRUD ================= */

  function addTask(data) {
    var t = {
      id: U.uid('task'),
      storeId: data.storeId,
      title: (data.title || '未命名任务').trim(),
      stage: data.stage || ((C.STAGES[0] || {}).key || '未出图'),
      assigneeId: data.assigneeId || (state.members[0] || {}).id,
      dueDate: data.dueDate || U.addDays(U.today(), 7),
      status: data.status || 'pending',
      priority: data.priority || 'normal',
      remark: data.remark || '',
      createdAt: U.today()
    };
    state.tasks.unshift(t);
    push('tasks', t);
    cacheLocal();
    return t;
  }

  function updateTask(id, patch) {
    var t = taskById(id);
    if (!t) return null;
    Object.keys(patch).forEach(function (k) { t[k] = patch[k]; });
    push('tasks', t);
    cacheLocal();
    return t;
  }

  /* 注：门店进度已改为按「阶段时间线」现算（storeProgress），
     不再由任务完成率回写 stores.progress。云端那一列保留不动，只是不再参与显示。 */

  function removeTask(id) {
    state.tasks = state.tasks.filter(function (t) { return t.id !== id; });
    drop('tasks', id);
    cacheLocal();
  }

  /* ================= 成员 CRUD ================= */

  function addMember(data) {
    var m = {
      id: U.uid('user'),
      name: (data.name || '新成员').trim(),
      role: data.role || '门店统筹',
      color: data.color || '#3f6bf5'
    };
    state.members.push(m);
    push('members', m);
    cacheLocal();
    return m;
  }

  function updateMember(id, patch) {
    var m = memberById(id);
    if (!m) return null;
    Object.keys(patch).forEach(function (k) { m[k] = patch[k]; });
    push('members', m);
    cacheLocal();
    return m;
  }

  /* 返回 Promise：云端删成功后才从本地移除，避免被自动同步拉回来 */
  function removeMember(id) {
    return window.Cloud.remove('members', id).then(function () {
      state.members = state.members.filter(function (m) { return m.id !== id; });

      /* 顺手把该成员名下的任务改成未指派 */
      state.tasks.forEach(function (t) {
        if (t.assigneeId === id) {
          t.assigneeId = '';
          push('tasks', t);
        }
      });

      cacheLocal();
      return true;
    });
  }

  function memberTaskCount(id) {
    return state.tasks.filter(function (t) { return t.assigneeId === id; }).length;
  }

  /* ================= 到货 CRUD ================= */

  function addArrival(data) {
    var q = data.qty;
    var a = {
      id: U.uid('arr'),
      storeId: data.storeId,
      item: data.item || '物料',
      qty: (q === '' || q === null || q === undefined) ? 0 : Math.max(0, Number(q) || 0),
      etaDate: data.etaDate || U.addDays(U.today(), 3),
      status: data.status || 'pending'
    };
    state.arrivals.push(a);
    push('arrivals', a);
    cacheLocal();
    return a;
  }

  function updateArrival(id, patch) {
    for (var i = 0; i < state.arrivals.length; i++) {
      if (state.arrivals[i].id === id) {
        var target = state.arrivals[i];
        Object.keys(patch).forEach(function (k) { target[k] = patch[k]; });
        push('arrivals', target);
        cacheLocal();
        return target;
      }
    }
    return null;
  }

  function removeArrival(id) {
    state.arrivals = state.arrivals.filter(function (a) { return a.id !== id; });
    drop('arrivals', id);
    cacheLocal();
  }

  /* ================= 设置 / 导入导出 ================= */

  function setSetting(key, value) {
    state.settings[key] = value;
    pushSettings();
    cacheLocal();
  }

  /* ================= 筹建任务清单（完全自定义） =================
     一切以你自己编辑的清单为准：
     - 没有任何内置清单，也不会自动回退到系统默认
     - 你清空成 0 条，就是 0 条，系统不会偷偷塞回来
     - 存在 settings 里，跟着云端同步，7 个人看到的是同一份
     -------------------------------------------------------------- */

  function templates() {
    var list = state.settings && state.settings.taskTemplates;
    return Array.isArray(list) ? list : [];
  }

  function saveTemplates(list) {
    var clean = (list || []).map(function (t) {
      return {
        title: String(t.title || '').trim(),
        stage: t.stage || '',
        before: Math.max(0, Number(t.before) || 0),
        role: t.role || ''
      };
    }).filter(function (t) { return !!t.title; });

    /* 空数组也照存：这是"我就是要空清单"的明确意图，不是"没设置过" */
    setSetting('taskTemplates', clean);
    return templates();
  }

  /* ---------------- 到货物料清单（设置里可改） ----------------
     - 门店详情「物料到货」里的快捷按钮 = 这份清单
     - 没设置过 → 用 constants 里那一份做初始值（第一次保存后就以你改的为准）
     - 存成空数组 → 门店里就不显示快捷按钮，只能手动加
     ---------------------------------------------------------- */

  function items() {
    var list = state.settings && state.settings.arrivalItems;
    return Array.isArray(list) ? list : C.ITEMS.slice();
  }

  function saveItems(list) {
    var seen = {};
    var clean = (list || []).map(function (x) {
      return String(x == null ? '' : x).trim();
    }).filter(function (x) {
      if (!x || seen[x]) return false;
      seen[x] = true;
      return true;
    });
    setSetting('arrivalItems', clean);
    return items();
  }

  /* ---------------- 阶段二级（子阶段） ----------------
     settings.stageSubs = { '施工/装修': ['水电', '木作'], ... }
     - 只影响任务 / 筹建任务清单的分级，门店仍用 6 个一级阶段
     - 任务的 stage 存成 "一级 / 二级"，所以云端不用加字段
     ---------------------------------------------------------- */

  function stageSubs() {
    var map = state.settings && state.settings.stageSubs;
    var out = {};
    /* 从没保存过二级 → 用出厂那几组（已出图 下有「已做首批 / 未做首批」）；
       保存过（哪怕是空对象）就以你保存的为准，不会把默认值又塞回来 */
    if (!map || typeof map !== 'object') map = C.DEFAULT_STAGE_SUBS || {};
    if (!map || typeof map !== 'object') return out;
    C.STAGES.forEach(function (st) {
      var list = map[st.key];
      if (!Array.isArray(list) || !list.length) return;
      var seen = {};
      var clean = [];
      list.forEach(function (x) {
        var v = String(x == null ? '' : x).trim();
        if (!v || seen[v]) return;
        seen[v] = true;
        clean.push(v);
      });
      if (clean.length) out[st.key] = clean;
    });
    return out;
  }

  function saveStageSubs(map) {
    var clean = {};
    C.STAGES.forEach(function (st) {
      var list = (map && map[st.key]) || [];
      var seen = {};
      var keep = [];
      list.forEach(function (x) {
        var v = String(x == null ? '' : x).trim();
        if (!v || seen[v]) return;
        seen[v] = true;
        keep.push(v);
      });
      if (keep.length) clean[st.key] = keep;
    });
    setSetting('stageSubs', clean);
    return stageSubs();
  }

  /* 时间线 / 阶段下拉统一用的「一级 + 二级」结构，三个来源并集：
       1) 设置里手填的  → 顺序排最前（你显式定义的优先）
       2) 筹建任务清单里用到的 → 清单就是标准流程，时间线跟着它走
       3) 已有任务里用到的  → 二级被删了历史数据也不至于筛不到
     这样「筹建任务清单」和「阶段时间线」永远是同一套结构：清单里加了二级，
     时间线立刻出现；清单里删光了，且设置里也没手填、没有历史任务，才会消失。 */
  function stageSubsWithUsed() {
    var map = stageSubs();

    function add(v) {
      var p = C.stageSplit(v);
      if (!p.sub || !C.isStage(p.base)) return;
      var list = map[p.base] || (map[p.base] = []);
      if (list.indexOf(p.sub) < 0) list.push(p.sub);
    }

    templates().forEach(function (t) { add(t.stage); });
    state.tasks.forEach(function (t) { add(t.stage); });
    return map;
  }

  /* 筹建任务清单按阶段的数量分布，用来和时间线对照：
       { byStage: { '施工/装修 / 水电': 2 }, byBase: { '施工/装修': 3 }, total: 7 } */
  function templateStageStat() {
    var byStage = {};
    var byBase = {};
    var total = 0;

    templates().forEach(function (t) {
      var v = String(t.stage || '');
      if (!C.isStage(v)) return;
      total++;
      byStage[v] = (byStage[v] || 0) + 1;
      var b = C.stageSplit(v).base;
      byBase[b] = (byBase[b] || 0) + 1;
    });

    return { byStage: byStage, byBase: byBase, total: total };
  }

  /* ---------------- 门店自己的二级（当前阶段的细分） ----------------
     settings.storeSubs = { storeId: '已做首批' }
     - stores 表没有这一列，所以落在 settings 里，跟着云端一起同步，不用改表结构
     - 只在门店阶段本身带二级时才有意义（就是「推送」时选的那一支）
     ------------------------------------------------------------------ */

  function storeSubs() {
    var map = state.settings && state.settings.storeSubs;
    if (!map || typeof map !== 'object' || Array.isArray(map)) return {};
    return map;
  }

  function storeSub(store) {
    if (!store) return '';
    var v = storeSubs()[store.id];
    return typeof v === 'string' ? v : '';
  }

  /* 推送用：门店阶段 + 二级一起改（sub 传空就清掉旧的那一支） */
  function setStoreStage(id, base, sub) {
    var s = storeById(id);
    if (!s) return null;

    var map = storeSubs();
    var name = String(sub == null ? '' : sub).trim();

    if (base && s.stage !== base) {
      updateStore(id, { stage: base });   /* 里头上云 + 写本地缓存 */
    }

    if (name) map[id] = name; else delete map[id];
    state.settings = state.settings || {};
    state.settings.storeSubs = map;
    pushSettings();
    cacheLocal();

    return s;
  }

  /* ---------------- 门店进度：跟着「阶段时间线」走 ----------------
     走完全部筹建阶段 = 100%。「已开业」不算筹建阶段，它是终点，到了直接 100%。
     假设时间线是 未出图 / 已出图 / 资料/建档 / 施工/装修 / 物料/到货 / 开业准备 / 已开业，
     那 6 个筹建阶段各占 1/6 ≈ 16.7%，门店每往后推一个阶段，进度就跳一格：
       未出图 0%  已出图 17%  资料/建档 33%  ……  开业准备 83%  已开业 100%
     阶段是用户自己加 / 改名 / 删 / 排序的，所以分母一律按当前 C.STAGES 现算，
     不写死 6：时间线里多一个阶段，每格就自动变小。
     ------------------------------------------------------------------ */

  /* 终点阶段（默认「已开业」）和筹建阶段序列 */
  function stageFlow() {
    var list = C.STAGES || [];
    var endKey = '';
    for (var i = 0; i < list.length; i++) {
      if (list[i].key === '已开业') { endKey = '已开业'; break; }
    }
    /* 「已开业」被改名了：退回最后一个阶段当终点，至少不会算错分母 */
    if (!endKey && list.length) endKey = list[list.length - 1].key;
    var flow = list.filter(function (x) { return x.key !== endKey; });
    return { endKey: endKey, flow: flow };
  }

  /* { pct, done, total, at, ended }  done = 已完成阶段数，total = 筹建阶段总数 */
  function storeProgress(store) {
    var f = stageFlow();
    var total = f.flow.length || 1;
    var at = store ? String(store.stage || '') : '';

    if (at && at === f.endKey) {
      return { pct: 100, done: total, total: total, at: at, ended: true };
    }

    var done = 0;
    for (var i = 0; i < f.flow.length; i++) {
      if (f.flow[i].key === at) { done = i; break; }
    }
    /* 阶段被删 / 改名后门店还挂着旧值：按起点算，不让它变成 100% */
    return { pct: Math.round(done / total * 100), done: done, total: total, at: at, ended: false };
  }

  /* 鼠标悬停的说明文字，各页面共用，避免同一个数字三种说法 */
  function progressTip(store) {
    var p = storeProgress(store);
    if (p.ended) return '已完成全部 ' + p.total + ' 个筹建阶段，门店已开业';
    if (!p.at) return '还没设置阶段';
    return '已完成 ' + p.done + ' / ' + p.total + ' 个阶段（当前：' + p.at + '）';
  }

  /* ---------------- 二级的改名 / 删除（三处一起同步） ----------------
     只改 settings.stageSubs 是不够的：清单和已有任务里还挂着旧名，
     时间线会把旧名当成「历史值」又显示出来，变成新旧两个并存。
     所以改名 / 删除都同时处理 stageSubs + 筹建任务清单 + 已有任务。
     页面先用 stageSubUsage() 算影响面，弹确认给用户看清楚再动手。
     ------------------------------------------------------------------ */

  function stageSubUsage(base, name) {
    var v = C.stageValue(base, name);
    var tpl = 0;
    var task = 0;
    templates().forEach(function (t) { if (t.stage === v) tpl++; });
    state.tasks.forEach(function (t) { if (t.stage === v) task++; });
    return { templates: tpl, tasks: task };
  }

  function renameStageSub(base, from, to) {
    from = String(from == null ? '' : from).trim();
    to = String(to == null ? '' : to).trim().replace(/\s+/g, ' ');
    if (!from || !to || from === to) return 0;

    var oldV = C.stageValue(base, from);
    var newV = C.stageValue(base, to);
    var hit = 0;

    /* 1) 阶段定义：原地替换，二级顺序不变 */
    var map = stageSubs();
    var list = (map[base] || []).slice();
    if (list.indexOf(from) >= 0) {
      var i = list.indexOf(from);
      if (list.indexOf(to) >= 0) list.splice(i, 1);   /* 新名字已经存在，去掉旧的 */
      else list[i] = to;
    } else if (list.indexOf(to) < 0) {
      list.push(to);
    }
    if (list.length) map[base] = list; else delete map[base];
    saveStageSubs(map);

    /* 2) 筹建任务清单 */
    var tpls = templates();
    var tplDirty = false;
    tpls.forEach(function (t) {
      if (t.stage !== oldV) return;
      t.stage = newV;
      tplDirty = true;
      hit++;
    });
    if (tplDirty) saveTemplates(tpls);

    /* 3) 已有任务（按门店查的时候还要靠它） */
    var changed = [];
    state.tasks.forEach(function (t) {
      if (t.stage !== oldV) return;
      t.stage = newV;
      changed.push(t);
      hit++;
    });
    if (changed.length) {
      pushMany('tasks', changed);
      cacheLocal();
    }

    /* 4) 门店自己记着的那一支：跟着改名，不然会留个查不到的旧名字 */
    var sMap = storeSubs();
    var sDirty = false;
    Object.keys(sMap).forEach(function (sid) {
      if (sMap[sid] !== from) return;
      var st = storeById(sid);
      if (st && C.stageSplit(st.stage).base !== base) return;
      sMap[sid] = to;
      sDirty = true;
      hit++;
    });
    if (sDirty) setSetting('storeSubs', sMap);

    return hit;
  }

  function removeStageSub(base, name) {
    name = String(name == null ? '' : name).trim();
    if (!name) return 0;

    var oldV = C.stageValue(base, name);
    var hit = 0;

    var map = stageSubs();
    if (map[base]) {
      var list = map[base].filter(function (x) { return x !== name; });
      if (list.length) map[base] = list; else delete map[base];
      saveStageSubs(map);
    }

    /* 挂在它上面的任务退回一级，否则它会因为「还有任务在用」又出现在时间线里 */
    var tpls = templates();
    var tplDirty = false;
    tpls.forEach(function (t) {
      if (t.stage !== oldV) return;
      t.stage = base;
      tplDirty = true;
      hit++;
    });
    if (tplDirty) saveTemplates(tpls);

    var changed = [];
    state.tasks.forEach(function (t) {
      if (t.stage !== oldV) return;
      t.stage = base;
      changed.push(t);
      hit++;
    });
    if (changed.length) {
      pushMany('tasks', changed);
      cacheLocal();
    }

    /* 门店自己记着的这一支被删掉了 → 一起清掉，别留个不存在的二级 */
    var sMap = storeSubs();
    var sDirty = false;
    Object.keys(sMap).forEach(function (sid) {
      if (sMap[sid] !== name) return;
      var st = storeById(sid);
      if (st && C.stageSplit(st.stage).base !== base) return;
      delete sMap[sid];
      sDirty = true;
      hit++;
    });
    if (sDirty) setSetting('storeSubs', sMap);

    return hit;
  }

  /* 给单个门店补派清单任务（同名的自动跳过，不会重复） */
  function dispatchTemplates(storeId) {
    var store = storeById(storeId);
    if (!store) return 0;
    var tpls = templates();
    if (!tpls.length) return 0;

    var t0 = U.today();
    var exist = {};
    state.tasks.forEach(function (t) {
      if (t.storeId === storeId) exist[t.title] = true;
    });

    var roleToId = {};
    state.members.forEach(function (m) { roleToId[m.role] = m.id; });

    var created = [];
    tpls.forEach(function (tpl, i) {
      if (exist[tpl.title]) return;
      var due = U.addDays(store.openDate, -(Number(tpl.before) || (i + 1) * 7));
      if (!due || due < t0) due = U.addDays(t0, 2 + i * 3);
      created.push({
        id: U.uid('task'),
        storeId: storeId,
        title: tpl.title,
        stage: tpl.stage,
        assigneeId: roleToId[tpl.role] || store.ownerId,
        dueDate: due,
        status: 'pending',
        priority: 'normal',
        remark: '',
        createdAt: t0
      });
    });

    if (!created.length) return 0;
    created.forEach(function (t) { state.tasks.push(t); });
    pushMany('tasks', created);
    cacheLocal();
    return created.length;
  }

  function saveAll() {
    pushSettings();
    cacheLocal();
  }

  function markAlertRead(id) {
    if (state.alertsRead.indexOf(id) < 0) state.alertsRead.push(id);
    pushSettings();
  }

  function markAllAlertsRead() {
    alerts().forEach(function (a) {
      if (state.alertsRead.indexOf(a.id) < 0) state.alertsRead.push(a.id);
    });
    pushSettings();
  }

  function exportJSON() {
    return JSON.stringify(state, null, 2);
  }

  function downloadJSON() {
    var blob = new Blob([exportJSON()], { type: 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '门店筹建数据_' + U.today() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  /* 旧字段名 → 新字段名（导入老备份时自动转换） */
  var STAGE_RENAME = { '筹备中': '未出图' };
  var ROLE_RENAME = {
    '门店统筹': '售前',
    '广告/物料': '售前',
    '采购/供应商': '售后',
    '培训/人员': '售后',
    '建店/系统': '接单',
    '财务/行政': '接单',
    '进度审核': '接单'
  };

  function importJSON(text) {
    var data = JSON.parse(text);
    if (!data || !data.stores || !data.tasks) {
      throw new Error('文件格式不对，缺少 stores / tasks 字段');
    }

    /* 兼容旧备份：阶段名、成员模块改名 */
    (data.stores || []).forEach(function (s) {
      if (STAGE_RENAME[s.stage]) s.stage = STAGE_RENAME[s.stage];
    });
    (data.tasks || []).forEach(function (t) {
      if (STAGE_RENAME[t.stage]) t.stage = STAGE_RENAME[t.stage];
    });
    (data.members || []).forEach(function (m) {
      if (ROLE_RENAME[m.role]) m.role = ROLE_RENAME[m.role];
    });

    state = normalized(data);
    cacheLocal();
    return window.Cloud.importAll(state).then(function () {
      listeners.forEach(function (fn) { fn(state); });
      return state;
    });
  }

  function storageBytes() {
    try {
      return new Blob([localStorage.getItem(KEY) || '']).size;
    } catch (e) { return 0; }
  }

  function onChange(fn) { listeners.push(fn); }

  return {
    load: load,
    onChange: onChange,
    getState: getState,
    isOnline: isOnline,
    getLastError: getLastError,
    hasLocalData: hasLocalData,
    startAutoSync: startAutoSync,
    stopAutoSync: stopAutoSync,
    storeById: storeById,
    memberById: memberById,
    taskById: taskById,
    classify: classify,
    isLate: isLate,
    stats: stats,
    alerts: alerts,
    unreadAlertCount: unreadAlertCount,
    addStore: addStore,
    updateStore: updateStore,
    removeStore: removeStore,
    addTask: addTask,
    updateTask: updateTask,
    removeTask: removeTask,
    addMember: addMember,
    updateMember: updateMember,
    removeMember: removeMember,
    memberTaskCount: memberTaskCount,
    addArrival: addArrival,
    updateArrival: updateArrival,
    removeArrival: removeArrival,
    setSetting: setSetting,
    templates: templates,
    saveTemplates: saveTemplates,
    items: items,
    saveItems: saveItems,
    stageSubs: stageSubs,
    saveStageSubs: saveStageSubs,
    stages: stages,
    addStage: addStage,
    renameStage: renameStage,
    removeStage: removeStage,
    saveStageOrder: saveStageOrder,
    stageUsage: stageUsage,
    stageByName: stageByName,
    stageSubsWithUsed: stageSubsWithUsed,
    storeSubs: storeSubs,
    storeSub: storeSub,
    setStoreStage: setStoreStage,
    templateStageStat: templateStageStat,
    stageFlow: stageFlow,
    storeProgress: storeProgress,
    progressTip: progressTip,
    stageSubUsage: stageSubUsage,
    renameStageSub: renameStageSub,
    removeStageSub: removeStageSub,
    dispatchTemplates: dispatchTemplates,
    saveAll: saveAll,
    markAlertRead: markAlertRead,
    markAllAlertsRead: markAllAlertsRead,
    exportJSON: exportJSON,
    downloadJSON: downloadJSON,
    importJSON: importJSON,
    storageBytes: storageBytes
  };
})();

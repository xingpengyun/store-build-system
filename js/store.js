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
        /* 只挡「一级 / 二级」那种带分隔符的值（分隔符是两边带空格的 ' / '）。
           注意别用 indexOf('/') 一刀切：出厂阶段本来就有「资料/建档」「施工/装修」
           「物料/到货」，一刀切会把它们悄悄丢掉 —— 时间线就只剩 4 个阶段了。 */
        if (key.indexOf(C.STAGE_SEP) >= 0) return;
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
    /* 只挡「 / 」（两边带空格）这种分隔符；「资料/建档」这种紧贴的斜杠是正常阶段名 */
    if (name.indexOf(C.STAGE_SEP) >= 0) return { ok: false, error: '阶段名里不要带「 / 」（斜杠两边带空格是「一级 / 二级」的分隔符）' };
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
    if (to.indexOf(C.STAGE_SEP) >= 0) return { ok: false, error: '阶段名里不要带「 / 」' };
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
      snapshotSettings('load');   /* 每次进系统都留一份配置快照，误删可找回 */
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

  /* ---------------- 建议完成日：门店开业日 − 这条任务自己的「开业前 N 天」 ----------------
     天数从哪来（优先级从高到低）：
       1) 任务自己带的 before —— 就是「筹建任务清单」里那一列「开业前(天)」，
          派发 / 新建任务时写进任务，之后单独调也不影响别人
       2) 任务没带（老数据）：按标题去筹建任务清单里找同名项，用清单里的 before
       3) 都对不上（手建的任务、标题改过）：LEAD_DAYS_DEFAULT（30 天）兜底
     2026-10-24：设置页「逾期倒推口径」（按阶段配默认天数）整块删掉了 —— 天数只认清单，
     同一条任务在哪家店都是同一个「开业前 N 天」，不用再按阶段记一份。
     门店没填开业日 → 没有建议完成日（返回 ''），也不判逾期，
     界面上如实显示「未设置开业日期 · 开业前 N 天」，绝不自己编一个日期。
     ------------------------------------------------------------------ */

  /* 兜底天数：清单里没有同名项、任务也没单独设过时才用。
     不再按阶段配置（那块设置已删除），统一 LEAD_DAYS_DEFAULT。
     保留参数是为了让既有调用点（leadDaysOf({stage})）不用改。 */
  function leadDaysOf() {
    return Number(C.LEAD_DAYS_DEFAULT || 30);
  }

  /* 单条任务的「开业前 N 天」单独调过就记这儿。
     tasks 表没这一列，放 settings 里既能跟云端同步，又不用改表结构。 */
  function taskBeforeMap() {
    return (state && state.settings && state.settings.taskBefore) || {};
  }

  function setTaskBefore(taskId, days) {
    if (!taskId) return 0;
    var n = Math.max(0, Math.round(Number(days) || 0));
    setTaskBeforeMany([{ id: taskId, before: n }]);
    return n;
  }

  /* 批量记（新开门店一次派几十条任务时用，避免每条都写一次设置） */
  function setTaskBeforeMany(pairs) {
    if (!pairs || !pairs.length) return;
    state.settings = state.settings || {};
    var map = taskBeforeMap();
    pairs.forEach(function (p) {
      if (!p || !p.id) return;
      map[p.id] = Math.max(0, Math.round(Number(p.before) || 0));
    });
    state.settings.taskBefore = map;
    pushSettings();
    cacheLocal();
  }

  /* 按任务标题去筹建任务清单里找「开业前 N 天」 */
  function beforeFromTemplates(title) {
    if (!title) return null;
    var tpls = templates();
    for (var i = 0; i < tpls.length; i++) {
      if (tpls[i].title === title && tpls[i].before != null) return Number(tpls[i].before);
    }
    return null;
  }

  /* 这条任务的天数是不是「自己定死的」（单独调过 / 清单里有同名项）
     是的话改阶段时不碰它的天数，否则可以跟着兜底值走 */
  function taskHasOwnBefore(task) {
    if (!task) return false;
    var map = taskBeforeMap();
    if (map[task.id] != null && map[task.id] !== '') return true;
    if (task.before != null && task.before !== '' && !isNaN(Number(task.before))) return true;
    return beforeFromTemplates(task.title) != null;
  }

  /* 这条任务「开业前多少天」做完 —— 全系统只有这一个口径
     1) 这条任务单独调过的（settings.taskBefore[任务id]）
        新建任务时表单里填的「开业前（天）」就存这儿
     2) 任务对象上带的 before（老数据 / 内存里）
     3) 筹建任务清单里同名的「开业前(天)」
     4) 都对不上 → LEAD_DAYS_DEFAULT（30 天）兜底
     （2026-10-24 之前这里还有一层「按阶段配的默认天数」，设置页那块已整块删除） */
  function taskBeforeOf(task) {
    if (!task) return 0;

    var map = taskBeforeMap();
    if (map[task.id] != null && map[task.id] !== '' && !isNaN(Number(map[task.id]))) {
      return Number(map[task.id]);
    }
    /* before 允许是 0（开业当天），所以不能用真值判断 */
    if (task.before != null && task.before !== '' && !isNaN(Number(task.before))) {
      return Number(task.before);
    }
    var fromTpl = beforeFromTemplates(task.title);
    if (fromTpl != null) return fromTpl;
    return leadDaysOf(task);
  }

  /* ---------------- 逾期「往后放 3 天」 ----------------

     逾期只有两种处理：
       是我们的原因 → 点「推送」把它做掉；
       不是我们的 / 老板不着急 → 点「+3天」，整条往后挪 3 天，3 天后再提醒。

     实现上不删日期、不改开业前天数，只记「这条任务已经往后挪了几天」，
     建议完成日 = 开业日 − 开业前天数 + 已挪天数。挪完还没到期就不算逾期，
     过了新的日期又自动变回逾期（也就是 3 天后再提醒一次）。
     记在 settings.taskSnooze = { 任务id: 累计天数 }，不占 tasks 表的新列。 */

  function snoozeMap() {
    return (state && state.settings && state.settings.taskSnooze) || {};
  }

  function snoozeDaysOf(task) {
    if (!task || !task.id) return 0;
    var n = Number(snoozeMap()[task.id]);
    return (!n || isNaN(n) || n <= 0) ? 0 : Math.round(n);
  }

  /* 往后挪 N 天（默认 3），可重复点累加；返回累计天数 */
  function snoozeTask(taskId, days) {
    var t = taskById(taskId);
    if (!t) return 0;
    var step = Math.round(Number(days));
    if (isNaN(step) || step <= 0) step = 3;

    state.settings = state.settings || {};
    var map = snoozeMap();
    map[taskId] = snoozeDaysOf(t) + step;
    state.settings.taskSnooze = map;
    pushSettings();

    /* 建议完成日跟着挪，due_date 同步一份（排序、云同步都靠它） */
    var due = suggestDateOf(t);
    if (due !== t.dueDate) { t.dueDate = due; push('tasks', t); }
    cacheLocal();
    return map[taskId];
  }

  /* 撤销延后，回到原定日期 */
  function unsnoozeTask(taskId) {
    var t = taskById(taskId);
    var map = snoozeMap();
    if (!t || map[taskId] == null) return 0;

    delete map[taskId];
    state.settings = state.settings || {};
    state.settings.taskSnooze = map;
    pushSettings();

    var due = suggestDateOf(t);
    if (due !== t.dueDate) { t.dueDate = due; push('tasks', t); }
    cacheLocal();
    return 0;
  }

  /* 2026-10-24：原来的 saveLeadDays / setLeadDays 跟着设置页那块一起删了 ——
     天数不再按阶段记录，settings.leadDays 停用（云端里已存的旧值不再读取，也不迁移）。 */

  function storeOpenDate(task) {
    var s = storeById(task && task.storeId);
    return (s && s.openDate) || '';
  }

  /* 建议完成日 = 门店开业日 − 任务的开业前 N 天 + 已延后天数
     门店没填开业日 → ''（不猜） */
  function suggestDateOf(task) {
    if (!task) return '';
    var od = storeOpenDate(task);
    if (!od) return '';
    return U.addDays(od, -taskBeforeOf(task) + snoozeDaysOf(task));
  }

  /* 距开业天数：正数=还没到，负数=已经过了；门店没开业日返回 null */
  function daysLeftOf(task) {
    var od = storeOpenDate(task);
    if (!od) return null;
    return U.diffDays(U.today(), od);
  }

  /* 给新建 / 改阶段的任务算建议完成日并回写 due_date（方便排序和云同步）
     before 传了就用它，没传用兜底 30 天；门店没开业日 → '' */
  function suggestFor(storeId, stage, before) {
    var s = storeById(storeId);
    if (!s || !s.openDate) return '';
    var n = (before != null && before !== '' && !isNaN(Number(before)))
      ? Number(before)
      : leadDaysOf({ stage: stage });
    return U.addDays(s.openDate, -n);
  }

  /* 任务状态只有两类：done（已完成）/ 其他（未完成）。
     逾期 = 今天已过「开业日 − 开业前 N 天 + 已延后天数」且没完成。
     门店没填开业日 → 无从倒推，一律按未完成算，不硬判逾期。 */
  function classify(task) {
    if (task.status === 'done') return 'done';

    var due = suggestDateOf(task);
    if (due) {
      /* 今天已经过了建议完成日（含「+3天」挪过的）→ 逾期 */
      if (U.diffDays(U.today(), due) < 0) return 'overdue';
      var s2 = storeById(task.storeId);
      if (s2 && (s2.risk === 'high' || s2.risk === 'overdue')) return 'risk';
      return 'pending';
    }

    /* 门店没填开业日：没有倒推基准，不硬判逾期 */
    var s = storeById(task.storeId);
    if (s && (s.risk === 'high' || s.risk === 'overdue')) return 'risk';
    return 'pending';
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
      var d = suggestDateOf(t);
      return !!d && d <= t0;
    }).length;

    var weekTasks = st.tasks.filter(function (t) {
      if (t.status === 'done') return false;
      var d = suggestDateOf(t);
      return !!d && U.diffDays(t0, d) <= 7;
    }).length;

    /* 7 天内该到的（还没通知供应商的）—— 这批是这两周要打电话的。
       没登记到货日的不算：diffDays 对空日期返回 0，会把「还没给时间」误算成「今天到」 */
    var arrivals7 = st.arrivals.filter(function (a) {
      if (arrNotified(a)) return false;
      if (!a.etaDate) return false;
      var d = U.diffDays(t0, a.etaDate);
      return d >= 0 && d <= Number(C.ARR_WATCH_DAYS || 7);
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

    /* 近 7 天到货量：只按登记的到货日统计，跟通没通知无关 */
    var trend = [];
    for (var i = 6; i >= 0; i--) {
      var d = U.addDays(t0, -i);
      var cnt = st.arrivals.filter(function (a) { return a.etaDate === d; }).length;
      trend.push({ date: d, label: U.dateDot(d), count: cnt });
    }

    var focus = [];
    st.tasks.forEach(function (t) {
      var c = classify(t);
      if (c !== 'overdue' && c !== 'risk') return;
      var s = storeById(t.storeId);
      focus.push({
        task: t, store: s, late: c === 'overdue',
        owner: memberById(t.assigneeId),
        due: suggestDateOf(t),        /* 建议完成日（没开业日时为空） */
        days: U.diffDays(t0, suggestDateOf(t)),  /* 距建议完成日 */
        left: daysLeftOf(t),          /* 距开业天数 */
        lead: taskBeforeOf(t),        /* 这条任务的开业前天数 */
        snooze: snoozeDaysOf(t)       /* 已往后放了几天（没放 = 0） */
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
      var due = suggestDateOf(t);
      var lead = taskBeforeOf(t);
      var left = daysLeftOf(t);
      var sn = snoozeDaysOf(t);      /* 已经点过几次「+3天」 */

      /* 没有建议完成日（门店没填开业日）就不发到期提醒，别编日期吓人 */
      if (!due) return;
      var d = U.diffDays(t0, due);

      if (c === 'overdue') {
        addAlert({
          id: 'late-' + t.id, level: 'high', type: '任务逾期',
          title: storeName + ' · ' + t.title,
          desc: '距开业只剩 ' + left + ' 天，建议开业前 ' + lead + ' 天做完' +
            (sn ? '（已延后 ' + sn + ' 天）' : '') + '，已逾期 ' +
            Math.abs(d) + ' 天（建议 ' + U.monthDay(due) + ' 前做完）',
          owner: owner ? owner.name : '未指派', storeId: t.storeId, taskId: t.id
        });
      } else if (d >= 0 && d <= warnDays) {
        addAlert({
          id: 'soon-' + t.id, level: 'warn', type: '即将到期',
          title: storeName + ' · ' + t.title,
          desc: '还有 ' + d + ' 天就到建议完成日（' + U.monthDay(due) + '，开业前 ' + lead + ' 天' +
            (sn ? '，已延后 ' + sn + ' 天' : '') + '）',
          owner: owner ? owner.name : '未指派', storeId: t.storeId, taskId: t.id
        });
      }
    });

    state.stores.forEach(function (s) {
      var pr = storeProgress(s);
      var pctTxt = pr.idx
        ? '进度 ' + pr.pct + '%（第 ' + pr.idx + '/' + pr.total + ' 个筹建阶段）'
        : '进度 ' + pr.pct + '%';

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

    /* ---------------- 物料到货：提前 7 天就该通知供应商 ----------------
       门店说 11-10 到货，11-03 就要打电话让对方安排发货。
       所以不是等到货当天才提醒，而是「到货日 − ARR_WATCH_DAYS」就开始进提醒；
       过了到货日还没到 → 升成高危（对方没发 / 卡在路上，去要个新的到货时间）。 */
    var watchDays = Number(C.ARR_WATCH_DAYS || 7);
    state.arrivals.forEach(function (a) {
      if (arrNotified(a) || !a.etaDate) return;
      var d = U.diffDays(t0, a.etaDate);
      if (isNaN(d) || d > watchDays) return;

      var s = storeById(a.storeId);
      var storeName = s ? s.name : '未知门店';
      var name = (a.item || '').trim() || '未命名物料';
      var man = s ? memberById(s.ownerId) : null;

      if (d < 0) {
        addAlert({
          id: 'arrlate-' + a.id, level: 'danger', type: '漏通知',
          title: storeName + ' · ' + name,
          desc: '登记的是 ' + U.monthDay(a.etaDate) + ' 到货，已经过了 ' + (-d) +
            ' 天还没通知供应商，赶紧让对方发，顺便确认一个新的到货时间',
          owner: man ? man.name : '未指派', storeId: a.storeId, arrivalId: a.id
        });
      } else {
        addAlert({
          id: 'arrsoon-' + a.id, level: d <= 3 ? 'high' : 'warn', type: '该通知供应商',
          title: storeName + ' · ' + name,
          desc: (d === 0 ? '今天就该到货' : '还有 ' + d + ' 天到货（' + U.monthDay(a.etaDate) + '）') +
            '，现在就告诉供应商安排发货，别等到那天才问',
          owner: man ? man.name : '未指派', storeId: a.storeId, arrivalId: a.id
        });
      }
    });

    /* ---------------- 发货：按计划发货日盯着 ----------------
       计划今天发 → 提醒；已经过了还没发出 → 高危；
       3 天内要发 → 提醒；快开业了还没排发货日 → 也提醒（这种最容易漏）。
       发出去了就不再管（在途 / 到店不记）。 */
    var shipWatch = Number(C.SHIP_WATCH_DAYS || 3);
    shipRows().forEach(function (r) {
      if (r.shipped) return;
      var man = r.owner || '未指派';

      if (r.late) {
        addAlert({
          id: 'shiplate-' + r.id, level: 'danger', type: '发货逾期',
          title: r.name + ' · 计划 ' + U.monthDay(r.date) + ' 发货',
          desc: '已经过了 ' + Math.abs(r.left) + ' 天还没发出，' +
            (r.lateArr ? '还有 ' + r.lateArr + ' 项物料过了到货日还没通知供应商，' : '') + '先确认仓库备货和车辆',
          owner: man, storeId: r.id
        });
      } else if (r.dueToday) {
        addAlert({
          id: 'shiptoday-' + r.id, level: 'high', type: '今天该发货',
          title: r.name + ' · 计划今天发出',
          desc: '发完记得在「发货看板」点一下「已发出」，不然明天就变逾期',
          owner: man, storeId: r.id
        });
      } else if (r.left != null && r.left > 0 && r.left <= shipWatch) {
        addAlert({
          id: 'shipsoon-' + r.id, level: 'warn', type: '即将发货',
          title: r.name + ' · 还有 ' + r.left + ' 天到发货日',
          desc: '计划 ' + U.monthDay(r.date) + ' 发出，先备好货、定好车' +
            (r.lateArr ? '（还有 ' + r.lateArr + ' 项物料过了到货日还没通知）' : ''),
          owner: man, storeId: r.id
        });
      } else if (r.noPlan && r.openLeft != null && r.openLeft >= 0 && r.openLeft <= 21) {
        addAlert({
          id: 'shipnone-' + r.id, level: 'warn', type: '还没排发货',
          title: r.name + ' · 距开业 ' + r.openLeft + ' 天',
          desc: '这家店还没填计划发货日，去「发货看板」补一下，不然容易漏',
          owner: man, storeId: r.id
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
      /* 开业日允许空：没定就先不填，任务只显示「开业前 N 天」，不硬算日期 */
      openDate: data.openDate || '',
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
      var beforePairs = [];
      tpls.forEach(function (tpl) {
        /* 截止日 = 开业日 − 清单里填的「开业前 N 天」；没开业日就留空（不编日期，也不顺延） */
        var before = Number(tpl.before) || 0;
        var due = store.openDate ? U.addDays(store.openDate, -before) : '';

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
        beforePairs.push({ id: t.id, before: before });
      });
      setTaskBeforeMany(beforePairs);
      pushMany('tasks', created);
    }

    cacheLocal();
    return store;
  }

  function updateStore(id, patch) {
    var s = storeById(id);
    if (!s) return null;
    var oldOpen = s.openDate;
    Object.keys(patch).forEach(function (k) { s[k] = patch[k]; });
    if (patch.progress != null) s.progress = U.clamp(Number(patch.progress) || 0, 0, 100);
    push('stores', s);
    cacheLocal();

    /* 开业日变了（含清空）：这家店的任务建议完成日全部重算 */
    if (patch.openDate != null && patch.openDate !== oldOpen) resyncTaskDates(id);
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

    /* 发货记录也一起清掉（不然看板里会留着已删门店的空行） */
    var ship = shipMap();
    if (Object.prototype.hasOwnProperty.call(ship, id)) {
      delete ship[id];
      state.settings.ship = ship;
      pushSettings();
    }

    cacheLocal();
  }

  /* ================= 任务 CRUD ================= */

  function addTask(data) {
    /* 开业前 N 天：优先用传进来的，没传就按标题去清单里找，再不行用兜底 30 天 */
    var before = (data.before != null && data.before !== '' && !isNaN(Number(data.before)))
      ? Number(data.before)
      : (beforeFromTemplates((data.title || '').trim()) != null
        ? beforeFromTemplates((data.title || '').trim())
        : leadDaysOf({ stage: data.stage }));

    var t = {
      id: U.uid('task'),
      storeId: data.storeId,
      title: (data.title || '未命名任务').trim(),
      stage: data.stage || ((C.STAGES[0] || {}).key || '未出图'),
      assigneeId: data.assigneeId || (state.members[0] || {}).id,
      dueDate: data.dueDate || suggestFor(data.storeId, data.stage, before),
      status: data.status === 'doing' ? 'pending' : (data.status || 'pending'),
      priority: data.priority || 'normal',
      remark: data.remark || '',
      createdAt: U.today()
    };
    state.tasks.unshift(t);
    push('tasks', t);
    /* 「开业前 N 天」记在 settings 里（云端 tasks 表没这一列，不用改表） */
    setTaskBefore(t.id, before);
    cacheLocal();
    return t;
  }

  function updateTask(id, patch) {
    var t = taskById(id);
    if (!t) return null;

    /* 「进行中」这套状态取消：一律按未处理算 */
    if (patch.status === 'doing') patch.status = 'pending';

    var curBefore = taskBeforeOf(t);
    var ownsBefore = taskHasOwnBefore(t);
    var stageChanged = patch.stage != null && patch.stage !== t.stage;
    var storeChanged = patch.storeId != null && patch.storeId !== t.storeId;
    var beforeChanged = patch.before != null && Number(patch.before) !== curBefore;

    /* 天数：显式传了就用传的；原本自己定死的（清单里有 / 单独调过），改阶段也不动它；
       都没有的，退回兜底 30 天 */
    var nextBefore;
    if (patch.before != null) {
      nextBefore = Math.max(0, Math.round(Number(patch.before) || 0));
    } else if (!ownsBefore && patch.stage != null) {
      nextBefore = leadDaysOf({ stage: patch.stage });
    } else {
      nextBefore = curBefore;
    }

    /* before 不进任务对象，单独存起来 */
    var rest = {};
    Object.keys(patch).forEach(function (k) { if (k !== 'before') rest[k] = patch[k]; });
    Object.keys(rest).forEach(function (k) { t[k] = rest[k]; });
    if (patch.before != null) setTaskBefore(t.id, nextBefore);

    /* 阶段 / 门店 / 开业前天数变了，截止日按新口径重算（延后过的天数一并保留） */
    if (stageChanged || storeChanged || beforeChanged) {
      t.dueDate = suggestDateOf(t);
    }

    push('tasks', t);
    cacheLocal();
    return t;
  }

  /* 门店开业日改了：这家店所有任务的截止日跟着挪（开业日 − 清单里这条任务的开业前天数）
     storeId 传空 = 全量重算 */
  function resyncTaskDates(storeId) {
    var changed = [];
    state.tasks.forEach(function (t) {
      if (storeId && t.storeId !== storeId) return;
      /* 用 suggestDateOf：把「已延后 N 天」也算进去，不然一改开业日延后就丢了 */
      var due = suggestDateOf(t);
      if (t.dueDate !== due) { t.dueDate = due; changed.push(t); }
    });
    if (changed.length) {
      pushMany('tasks', changed);
      cacheLocal();
    }
    return changed.length;
  }

  /* 注：门店进度已改为按「阶段时间线」现算（storeProgress），
     不再由任务完成率回写 stores.progress。云端那一列保留不动，只是不再参与显示。 */

  function removeTask(id) {
    state.tasks = state.tasks.filter(function (t) { return t.id !== id; });

    /* 顺手清掉这条任务在设置里留下的「开业前天数 / 延后天数」，
       不然任务删了、设置里的键还留着，越积越多 */
    var s = state.settings || {};
    var touched = false;
    ['taskBefore', 'taskSnooze'].forEach(function (key) {
      if (s[key] && s[key][id] != null) { delete s[key][id]; touched = true; }
    });
    if (touched) pushSettings();

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

  /* ================= 到货 CRUD =================
     物料这块只有两件事：记下登记的到货时间 → 到货日往前 7 天通知供应商发货。
     所以 status 只有两个值：
       pending  待通知
       notified 已通知（历史数据存的是 'arrived'，旧版叫「已到货」，语义按「已通知」处理）
     不记在途 / 到店，那些物流环节不管。
     --------------------------------------------------------- */

  function arrNotified(a) {
    return !!a && (a.status === 'notified' || a.status === 'arrived');
  }

  function addArrival(data) {
    var q = data.qty;
    var a = {
      id: U.uid('arr'),
      storeId: data.storeId,
      /* 允许先空着：新增行第一格是手填的，填好失焦才锁定 */
      item: data.item || '',
      qty: (q === '' || q === null || q === undefined) ? 0 : Math.max(0, Number(q) || 0),
      /* 到货时间只认登记的那个日期：没填就留空，绝不替门店编一个（编了就会误报 / 漏报） */
      etaDate: data.etaDate || '',
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
    /* 备注是挂在 settings 里的，顺手清掉，别留孤儿 */
    if (state.settings && state.settings.arrRemarks) {
      delete state.settings.arrRemarks[id];
      pushSettings();
    }
    drop('arrivals', id);
    cacheLocal();
  }

  /* ================= 到货物料的备注 =================
     一行一句备注，比如「等门店确认收货人」「先发招牌，货架后发」。
     arrivals 表没有这一列，所以跟 taskBefore / taskSnooze 一样挂在 settings 里：
     既跟着云端同步，又不用改表结构。
     打字时只更新内存和本地缓存，停下 500ms 才推云端 —— 别一个字母发一次请求。
     --------------------------------------------------------- */

  function arrRemarkMap() {
    return (state.settings && state.settings.arrRemarks) || {};
  }

  function arrRemarkOf(id) {
    return arrRemarkMap()[id] || '';
  }

  var remarkTimer = null;
  var remarkDirty = false;

  function setArrRemark(id, v) {
    if (!id) return;
    state.settings = state.settings || {};
    var map = state.settings.arrRemarks || (state.settings.arrRemarks = {});
    map[id] = String(v == null ? '' : v).slice(0, 200);
    remarkDirty = true;
    cacheLocal();
    if (remarkTimer) clearTimeout(remarkTimer);
    remarkTimer = setTimeout(function () {
      remarkTimer = null;
      if (remarkDirty) { remarkDirty = false; pushSettings(); }
    }, 500);
  }

  /* 立刻把攒着的备注推上去（关弹窗 / 切页前调） */
  function flushArrRemarks() {
    if (remarkTimer) { clearTimeout(remarkTimer); remarkTimer = null; }
    if (remarkDirty) { remarkDirty = false; pushSettings(); }
  }

  /* ================= 发货看板 =================
     一家店一条发货记录：计划发货日 + 「发了没发」+ 「先发」标记 + 备注。
     在途 / 到店这些物流环节不记 —— 发出去就算完事，之后只看物料登记的到货时间。
     存 settings.ship = { 门店id: {status, date, pin, seq, note, sentAt} }，
     跟着 app_settings 整包上云，几十家门店共用一份 —— 同事打开看到的是同一屏。
     不写进 stores 表，是为了不改数据库结构。
     --------------------------------------------------------- */

  function shipMap() {
    var m = state && state.settings && state.settings.ship;
    return (m && typeof m === 'object') ? m : {};
  }

  /* 老数据的 ready / done 并到新两态上：已经发过的（含已到店）都算「已发出」 */
  function normShipStatus(s) {
    if (s === 'sent' || s === 'done') return 'sent';
    return 'todo';
  }

  /* 单家店的发货设置（没设过就给一份默认值，别返回 null） */
  function shipOf(storeId) {
    var raw = shipMap()[storeId] || {};
    return {
      status: normShipStatus(raw.status),
      date: raw.date || '',
      pin: !!raw.pin,
      seq: (raw.seq == null || raw.seq === '') ? null : Number(raw.seq),
      note: raw.note || '',
      sentAt: raw.sentAt || ''      /* 哪天点的「已发出」，只做留痕，不参与计算 */
    };
  }

  function setShip(storeId, patch) {
    if (!storeId) return null;
    state.settings = state.settings || {};
    var map = shipMap();
    var cur = map[storeId] || {};
    Object.keys(patch || {}).forEach(function (k) { cur[k] = patch[k]; });

    /* 切到「已发出」记一笔日期，切回来就清掉 */
    if (patch && patch.status === 'sent') cur.sentAt = U.today();
    if (patch && patch.status && patch.status !== 'sent') cur.sentAt = '';

    map[storeId] = cur;
    state.settings.ship = map;
    pushSettings();
    cacheLocal();
    return shipOf(storeId);
  }

  /* 把一串门店 id 按顺序写成 seq（手动排序后一次性落库，只存一次） */
  function writeShipSeq(ids) {
    state.settings = state.settings || {};
    var map = shipMap();
    ids.forEach(function (id, i) {
      var row = map[id] || {};
      row.seq = i + 1;
      map[id] = row;
    });
    state.settings.ship = map;
    pushSettings();
    cacheLocal();
  }

  /* 看板的一行：门店 + 发了没发 + 物料登记的到货时间，全是实时算的。
     到货时间只认门店 / 供应商登记的那个日期 —— 没有「在途」「到店」，
     日期过了还没通知就是「漏通知」，赶紧让对方发、顺便要个新日期。 */
  function shipRows() {
    var t0 = U.today();
    var watchDays = Number(C.ARR_WATCH_DAYS || 7);

    var rows = state.stores.map(function (s) {
      var info = shipOf(s.id);
      var list = state.arrivals.filter(function (a) { return a.storeId === s.id; });
      var pend = list.filter(function (a) { return !arrNotified(a); });

      /* 还没到的物料里最早的那个到货日 —— 门店给的时间，不改它、只用来提示 */
      var etas = pend.map(function (a) { return a.etaDate; }).filter(Boolean).sort();
      var earliest = etas[0] || '';

      var lateArr = 0, notify = 0, noEta = 0;
      pend.forEach(function (a) {
        if (!a.etaDate) { noEta += 1; return; }
        var d = U.diffDays(t0, a.etaDate);
        if (isNaN(d)) { noEta += 1; return; }
        if (d < 0) lateArr += 1;
        else if (d <= watchDays) notify += 1;   /* 7 天内到 → 今天该通知供应商发货 */
      });

      var owner = memberById(s.ownerId);
      var left = info.date ? U.diffDays(t0, info.date) : null;   /* 距计划发货日 */
      var openLeft = s.openDate ? U.diffDays(t0, s.openDate) : null;
      var shipped = info.status === 'sent';

      /* 这家店每条物料的登记到货时间 —— 看板上一行全铺开，不用点进门店看
         排序：还没通知的在前（日期近的在上）→ 已通知的沉后 */
      var mats = list.map(function (a) {
        var noted = arrNotified(a);
        var dd = a.etaDate ? U.diffDays(t0, a.etaDate) : null;
        return {
          id: a.id,
          item: (a.item || '').trim() || '未命名物料',
          qty: a.qty || 0,
          eta: a.etaDate || '',
          d: dd,
          notified: noted
        };
      }).sort(function (x, y) {
        if (x.notified !== y.notified) return x.notified ? 1 : -1;
        if (x.eta && y.eta && x.eta !== y.eta) return x.eta < y.eta ? -1 : 1;
        if (!!x.eta !== !!y.eta) return x.eta ? -1 : 1;
        return String(x.item).localeCompare(String(y.item), 'zh');
      });

      return {
        id: s.id,
        name: s.name,
        province: s.province || '',
        owner: owner ? owner.name : '',
        status: info.status,
        shipped: shipped,
        date: info.date,
        pin: info.pin,
        seq: info.seq,
        note: info.note,
        sentAt: info.sentAt,
        /* 实发那天到今天过了几天（登记的发货时间的倒推） */
        sentAgo: info.sentAt ? U.diffDays(info.sentAt, t0) : null,
        mats: mats,
        total: list.length,
        notified: list.length - pend.length,
        pending: pend.length,
        eta: earliest,
        lateArr: lateArr,
        notify: notify,
        noEta: noEta,
        left: left,
        openLeft: openLeft,
        openDate: s.openDate || '',
        /* 发货这块只有三件事：逾期未发 / 今天必须发 / 还没排期 */
        late: !shipped && left != null && left < 0,
        dueToday: !shipped && left === 0,
        noPlan: !shipped && !info.date,
        /* 到货这块也只有两件事：漏通知（过了到货日还没通知）/ 7 天内到该通知供应商 */
        arrLate: lateArr > 0,
        needNotify: notify > 0
      };
    });

    /* 排序：还没发出的在前 → 先发置顶 → 手动顺序 → 计划发货日 → 名字 */
    rows.sort(function (a, b) {
      if (a.shipped !== b.shipped) return a.shipped ? 1 : -1;
      if (a.pin !== b.pin) return a.pin ? -1 : 1;
      if (a.seq != null && b.seq != null && a.seq !== b.seq) return a.seq - b.seq;
      if ((a.seq != null) !== (b.seq != null)) return a.seq != null ? -1 : 1;
      if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (!!a.date !== !!b.date) return a.date ? -1 : 1;
      return String(a.name).localeCompare(String(b.name), 'zh');
    });

    return rows;
  }

  function shipStats(rows) {
    rows = rows || shipRows();
    var s = {
      all: rows.length, todo: 0, sent: 0, late: 0, today: 0, soon: 0,
      noPlan: 0, arrLate: 0, notify: 0
    };
    rows.forEach(function (r) {
      if (r.shipped) s.sent += 1;
      else {
        s.todo += 1;
        if (r.late) s.late += 1;
        else if (r.dueToday) s.today += 1;
        else if (r.left != null && r.left > 0 && r.left <= (C.SHIP_WATCH_DAYS || 3)) s.soon += 1;
        if (r.noPlan) s.noPlan += 1;
      }
      /* 到货这两项不管发没发都要盯：货没到，发出去了也没用 */
      if (r.arrLate) s.arrLate += 1;
      if (r.needNotify) s.notify += 1;
    });
    s.active = s.todo;   /* 「还没发出」= 要跟的店 */
    return s;
  }

  /* ================= 按到货日看：所有门店的物料摊平 =================
     一家店的物料日期不一样，门店一多就看不全。
     这里把「所有门店 × 所有物料」拍成一条条，按登记到货日排序，
     发货看板的「按到货日」视图就是用它 —— 谁哪天到、哪几条漏通知，全在一条时间线上。
     --------------------------------------------------------- */
  function arrivalRows() {
    var t0 = U.today();
    var watch = Number(C.ARR_WATCH_DAYS || 7);

    var rows = [];
    state.arrivals.forEach(function (a) {
      var s = storeById(a.storeId);
      if (!s) return;                       /* 门店删了，这条也不显示 */
      var man = memberById(s.ownerId);
      var notified = arrNotified(a);
      var hasEta = !!a.etaDate;
      var d = hasEta ? U.diffDays(t0, a.etaDate) : null;

      rows.push({
        id: a.id,
        storeId: s.id,
        storeName: s.name,
        province: s.province || '',
        owner: man ? man.name : '',
        openDate: s.openDate || '',
        openLeft: s.openDate ? U.diffDays(t0, s.openDate) : null,
        item: (a.item || '').trim() || '未命名物料',
        qty: Number(a.qty) || 0,
        eta: a.etaDate || '',
        hasEta: hasEta,
        d: d,
        notified: notified,
        /* 三个口径：漏通知（过了到货日还没通知）/ 该通知（7 天内到）/ 还早 */
        late: !notified && d != null && d < 0,
        soon: !notified && d != null && d >= 0 && d <= watch,
        today: !notified && d === 0
      });
    });

    /* 没通知的排前面（按到货日升序，过期的自然浮到最上面）→ 没填日期的 → 已通知的沉底 */
    rows.sort(function (a, b) {
      if (a.notified !== b.notified) return a.notified ? 1 : -1;
      if (a.hasEta !== b.hasEta) return a.hasEta ? -1 : 1;
      if (a.eta && b.eta && a.eta !== b.eta) return a.eta < b.eta ? -1 : 1;
      return String(a.storeName).localeCompare(String(b.storeName), 'zh');
    });

    return rows;
  }

  /* 上移 / 下移一位：把当前看到的顺序整体固化成 seq，之后就一直按这个顺序 */
  function moveShip(storeId, dir) {
    var rows = shipRows();
    var i = -1;
    for (var k = 0; k < rows.length; k++) if (rows[k].id === storeId) { i = k; break; }
    if (i < 0) return false;
    var j = i + (dir < 0 ? -1 : 1);
    if (j < 0 || j >= rows.length) return false;

    var tmp = rows[i];
    rows[i] = rows[j];
    rows[j] = tmp;
    writeShipSeq(rows.map(function (r) { return r.id; }));
    return true;
  }

  /* 「先发」标记：点了永远排最前面 */
  function toggleShipPin(storeId) {
    var cur = shipOf(storeId);
    setShip(storeId, { pin: !cur.pin });
    return !cur.pin;
  }

  /* 发了没发：一次点击就翻过来，不做「在途 / 到店」那些中间态 */
  function toggleShipSent(storeId) {
    var cur = shipOf(storeId);
    var next = cur.status === 'sent' ? 'todo' : 'sent';
    setShip(storeId, { status: next });
    return next;
  }

  /* 清掉手动顺序，回到「按计划发货日自动排」 */
  function clearShipSeq() {
    state.settings = state.settings || {};
    var map = shipMap();
    Object.keys(map).forEach(function (k) {
      if (map[k] && typeof map[k] === 'object') delete map[k].seq;
    });
    state.settings.ship = map;
    pushSettings();
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

  /* ---------------- 门店进度：一个阶段一格，最后一格就是 100% ----------------
     口径：只看门店「现在停在哪个阶段」，不看清单做了几条，也不管二级。
     进度 = 停在第几个筹建阶段 ÷ 筹建阶段总数：
       6 个筹建阶段 → 每个 16.7%，最后一个（准备开业）就是 100%
       设计阶段 16.7%  已出图 33.3%  建档资料 50%  发货阶段 66.7%
       广告物料 83.3%  准备开业 100%
     结束类阶段（已开业 / 闭店 …，见 CONST.PROGRESS_END_STAGES）不进分母，
     否则「准备开业」会被摊成 6/8 = 75%，看不出已经可以开业了。
     新店不用做前面的事：直接推到「广告物料」就是 5/6 ≈ 83.3%。
     阶段是用户自己加 / 改名 / 删 / 排序的，分母一律按当前 C.STAGES 现算。
     阶段被删 / 改名后门店还挂着旧值：找不到就按 0% 算，不会错乱成 100%。
     ------------------------------------------------------------------ */

  /* 结束类阶段？（按一级阶段名精确匹配，二级不影响） */
  function isEndStage(key) {
    var names = C.PROGRESS_END_STAGES || [];
    var base = C.stageSplit(key).base;
    for (var i = 0; i < names.length; i++) {
      if (names[i] === base) return true;
    }
    return false;
  }

  /* 进度怎么分格：返回 { flow: 参与进度的筹建阶段, endKeys: 不计入的阶段 }
     两条规则叠加，改名了也不容易算错：
       1) 名字命中 CONST.PROGRESS_END_STAGES（已开业 / 闭店 …）
       2) 排在「开业」那一格后面的阶段 —— 门店已经开始营业了，后面都是收尾记录，
          不该再挤掉「准备开业」的 100%（否则 6 个筹建 + 已开业 + 闭店 = 6/8 = 75%） */
  function progressPlan() {
    var list = (C.STAGES || []).slice();
    var names = C.PROGRESS_END_STAGES || [];

    function byName(k) {
      for (var i = 0; i < names.length; i++) if (names[i] === k) return true;
      return false;
    }

    /* 「开业」那一格：最后一个名字里带「开业」、且不属于结束名单的阶段（准备开业 / 开业准备） */
    var openIdx = -1;
    for (var i = 0; i < list.length; i++) {
      if (byName(list[i].key)) continue;
      if (String(list[i].key).indexOf('开业') >= 0) openIdx = i;
    }

    var flow = [], endKeys = {};
    for (var j = 0; j < list.length; j++) {
      var k = list[j].key;
      if (byName(k) || (openIdx >= 0 && j > openIdx)) endKeys[k] = 1;
      else flow.push(list[j]);
    }

    /* 全被排除掉（阶段表只剩已开业 / 闭店）：退回全部，至少还能算 */
    if (!flow.length) return { flow: list.slice(), endKeys: {} };
    return { flow: flow, endKeys: endKeys };
  }

  /* 参与进度的阶段序列 */
  function progressStages() {
    return progressPlan().flow;
  }

  /* { pct, idx, total, at, ended, isEnd, label }
     idx = 停在第几个筹建阶段（从 1 开始），total = 筹建阶段总数 */
  function storeProgress(store) {
    var plan = progressPlan();
    var flow = plan.flow;
    var total = flow.length || 1;
    var at = store ? C.stageSplit(store.stage).base : '';

    var pos = -1;
    for (var i = 0; i < flow.length; i++) {
      if (flow[i].key === at) { pos = i; break; }
    }

    var isEnd = !!at && plan.endKeys[at] === 1;
    /* 停在结束类阶段（已开业 / 闭店）：筹建部分已经走完，100% */
    var idx = isEnd ? total : (pos < 0 ? 0 : pos + 1);
    var pct = Math.round(idx / total * 100);

    return {
      pct: Math.max(0, Math.min(100, pct)),
      idx: idx, total: total,
      at: at,
      ended: isEnd || (pos >= 0 && pos === flow.length - 1),
      isEnd: isEnd,
      label: pos < 0
        ? (isEnd ? at : '阶段未设置')
        : '第 ' + idx + ' / ' + total + ' 个筹建阶段'
    };
  }

  /* 鼠标悬停的说明文字，各页面共用，避免同一个数字三种说法 */
  function progressTip(store) {
    var p = storeProgress(store);
    if (!p.at) return '还没设置阶段';

    var per = Math.round(100 / p.total * 10) / 10;
    var tail = '（' + p.total + ' 个筹建阶段各占 ' + per + '%，推到最后一个就是 100%）';

    if (p.isEnd) return '门店在「' + p.at + '」，' + p.total + ' 个筹建阶段已全部走完，进度 100%';
    if (p.ended) return '门店在「' + p.at + '」，' + p.label + '，进度 100% —— 走到这一步就代表可以开业了';
    return '门店在「' + p.at + '」，' + p.label + '，进度 ' + p.pct + '%' + tail;
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
    var beforePairs = [];
    tpls.forEach(function (tpl) {
      if (exist[tpl.title]) return;
      var before = Number(tpl.before) || 0;
      var due = store.openDate ? U.addDays(store.openDate, -before) : '';
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
      beforePairs.push({ id: created[created.length - 1].id, before: before });
    });

    if (!created.length) return 0;
    created.forEach(function (t) { state.tasks.push(t); });
    setTaskBeforeMany(beforePairs);
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

    snapshotSettings('before-import');
    var prevSettings = (state && state.settings) || null;

    state = normalized(data);

    /* 备份文件里没带配置（老备份 / 只导出门店数据）时，保留现在这份配置，
       别又像 2026-10-24 那次一样把阶段 / 清单 / 物料一起清掉。
       只有文件里「明确没这个键」才保留；文件里写着空数组代表你就是想清空。 */
    if (prevSettings && state.settings) {
      ['stages', 'stageSubs', 'taskTemplates', 'arrivalItems', 'leadDays'].forEach(function (k) {
        if (state.settings[k] === undefined && prevSettings[k] !== undefined) {
          state.settings[k] = prevSettings[k];
        }
      });
      applyStages(resolveStages(state.settings));
    }

    cacheLocal();
    return window.Cloud.importAll(state).then(function () {
      listeners.forEach(function (fn) { fn(state); });
      return state;
    });
  }

  /* ==================================================================
     配置快照（只备份 settings：阶段 / 二级 / 筹建清单 / 物料清单 / 提前天数）
     —— 2026-10-24 加的：之前「清空云端」把 app_settings 整张删了，
        用户的真实工作流（阶段时间线、筹建任务清单、物料清单）跟着一起没了。
        从此每次加载、每次危险操作前都留一份快照，最多 5 份，可一键找回。
     ================================================================== */

  var SNAP_KEY = KEY + '.setting-snap';

  function readSnaps() {
    try {
      var raw = localStorage.getItem(SNAP_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  function configWeight(settings) {
    if (!settings) return 0;
    var w = 0;
    if (Array.isArray(settings.stages)) w += settings.stages.length * 10;
    if (settings.stageSubs) {
      Object.keys(settings.stageSubs).forEach(function (k) {
        w += Array.isArray(settings.stageSubs[k]) ? settings.stageSubs[k].length * 5 : 0;
      });
    }
    if (Array.isArray(settings.taskTemplates)) w += settings.taskTemplates.length * 3;
    if (Array.isArray(settings.arrivalItems)) w += settings.arrivalItems.length;
    return w;
  }

  /* 存一份快照；内容跟上一份一样就不重复存 */
  function snapshotSettings(reason) {
    try {
      if (!state || !state.settings) return;
      var list = readSnaps();
      var json = JSON.stringify(state.settings);
      if (list[0] && list[0].json === json) return;
      list.unshift({
        at: new Date().toISOString(),
        reason: reason || 'auto',
        weight: configWeight(state.settings),
        json: json
      });
      localStorage.setItem(SNAP_KEY, JSON.stringify(list.slice(0, 5)));
    } catch (e) { /* 超配额就算了，不影响主流程 */ }
  }

  /* 给设置页用：最近一份「配置比现在更全」的快照（被清空后能找回的那份） */
  function settingsSnapshot() {
    var list = readSnaps();
    var now = configWeight(state && state.settings);
    var hit = null;
    list.forEach(function (x) {
      if (hit) return;
      if (x.weight > now) hit = x;
    });
    if (!hit && list[0]) hit = list[0];
    if (!hit) return null;

    var set = null;
    try { set = JSON.parse(hit.json); } catch (e) { set = null; }
    if (!set) return null;

    return {
      at: hit.at,
      reason: hit.reason,
      richer: hit.weight > now,
      /* 快照里没存 stages 时，按出厂的 7 个算（别显示成 0 阶段） */
      stages: (Array.isArray(set.stages) && set.stages.length ? set.stages : C.STAGE_BUILTIN).length,
      templates: (set.taskTemplates || []).length,
      items: (set.arrivalItems || []).length,
      settings: set
    };
  }

  /* 把快照里的配置恢复回来（只恢复配置，门店 / 任务不动） */
  function restoreSettingsSnapshot() {
    var snap = settingsSnapshot();
    if (!snap) return { ok: false, error: '没有可恢复的快照' };
    var set = snap.settings;

    snapshotSettings('before-restore');   /* 先把现在这份也留一份，别把退路也堵了 */

    var next = state.settings;
    if (Array.isArray(set.stages) && set.stages.length) next.stages = set.stages;
    if (set.stageSubs && typeof set.stageSubs === 'object') next.stageSubs = set.stageSubs;
    if (Array.isArray(set.taskTemplates)) next.taskTemplates = set.taskTemplates;
    if (Array.isArray(set.arrivalItems)) next.arrivalItems = set.arrivalItems;
    if (set.leadDays && typeof set.leadDays === 'object') next.leadDays = set.leadDays;
    if (set.arrRemarks && typeof set.arrRemarks === 'object') next.arrRemarks = set.arrRemarks;

    applyStages(resolveStages(next));
    pushSettings();
    cacheLocal();
    listeners.forEach(function (fn) { fn(state); });

    return {
      ok: true,
      at: snap.at,
      stages: (next.stages || []).length,
      templates: (next.taskTemplates || []).length,
      items: (next.arrivalItems || []).length
    };
  }

  /* ==================================================================
     演示门店：只往业务表里加，配置一个字都不改
     ================================================================== */

  function addDemoStores(bundle) {
    if (!bundle || !bundle.stores || !bundle.stores.length) {
      return Promise.reject(new Error('没有生成门店'));
    }
    snapshotSettings('before-add-demo');

    state.stores = state.stores.concat(bundle.stores);
    state.tasks = state.tasks.concat(bundle.tasks || []);
    state.arrivals = (state.arrivals || []).concat(bundle.arrivals || []);

    /* 发货计划并进 settings.ship（这是门店级数据，属于业务），别的设置键不碰 */
    if (bundle.ship) {
      state.settings.ship = state.settings.ship || {};
      Object.keys(bundle.ship).forEach(function (k) {
        state.settings.ship[k] = bundle.ship[k];
      });
    }

    cacheLocal();
    listeners.forEach(function (fn) { fn(state); });

    return window.Cloud.importBusiness({
      stores: bundle.stores,
      tasks: bundle.tasks || [],
      arrivals: bundle.arrivals || []
    }).then(function () {
      return window.Cloud.saveSettings(state.settings, state.alertsRead);
    }).then(function () {
      return {
        ok: true,
        stores: bundle.stores.length,
        tasks: (bundle.tasks || []).length,
        arrivals: (bundle.arrivals || []).length
      };
    });
  }

  /* 只清门店 / 任务 / 到货，配置和成员都留着 */
  function clearBusiness() {
    snapshotSettings('before-clear-business');
    state.stores = [];
    state.tasks = [];
    state.arrivals = [];
    state.settings.ship = {};     /* 门店没了，发货计划跟着去掉 */
    cacheLocal();
    listeners.forEach(function (fn) { fn(state); });

    return window.Cloud.wipeBusiness().then(function () {
      return window.Cloud.saveSettings(state.settings, state.alertsRead);
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
    arrNotified: arrNotified,
    addArrival: addArrival,
    updateArrival: updateArrival,
    removeArrival: removeArrival,
    arrRemarkOf: arrRemarkOf,
    setArrRemark: setArrRemark,
    flushArrRemarks: flushArrRemarks,
    shipOf: shipOf,
    setShip: setShip,
    shipRows: shipRows,
    shipStats: shipStats,
    arrivalRows: arrivalRows,
    moveShip: moveShip,
    toggleShipPin: toggleShipPin,
    toggleShipSent: toggleShipSent,
    clearShipSeq: clearShipSeq,
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
    progressStages: progressStages,
    progressPlan: progressPlan,
    leadDaysOf: leadDaysOf,
    taskBeforeOf: taskBeforeOf,
    setTaskBefore: setTaskBefore,
    beforeFromTemplates: beforeFromTemplates,
    suggestDateOf: suggestDateOf,
    daysLeftOf: daysLeftOf,
    snoozeDaysOf: snoozeDaysOf,
    snoozeTask: snoozeTask,
    unsnoozeTask: unsnoozeTask,
    snoozeMap: snoozeMap,
    suggestFor: suggestFor,
    resyncTaskDates: resyncTaskDates,
    isEndStage: isEndStage,
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
    addDemoStores: addDemoStores,
    clearBusiness: clearBusiness,
    snapshotSettings: snapshotSettings,
    settingsSnapshot: settingsSnapshot,
    restoreSettingsSnapshot: restoreSettingsSnapshot,
    storageBytes: storageBytes
  };
})();

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
      if (s.risk === 'high' || s.risk === 'overdue') {
        addAlert({
          id: 'risk-' + s.id, level: 'high', type: '门店风险',
          title: s.name,
          desc: '风险等级：' + C.RISKS[s.risk].label + '，进度 ' + s.progress + '%，开业日 ' + U.monthDay(s.openDate),
          owner: (memberById(s.ownerId) || {}).name || '未指派', storeId: s.id
        });
      } else if (s.risk === 'attention') {
        addAlert({
          id: 'watch-' + s.id, level: 'warn', type: '门店关注',
          title: s.name,
          desc: '进度 ' + s.progress + '%，距离计划开业 ' + U.diffDays(t0, s.openDate) + ' 天',
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
      stage: data.stage || '未出图',
      risk: data.risk || 'normal',
      progress: U.clamp(Number(data.progress) || 0, 0, 100),
      ownerId: data.ownerId || (state.members[0] || {}).id,
      openDate: data.openDate || U.addDays(t0, 30),
      address: data.address || '',
      remark: data.remark || '',
      createdAt: t0
    };
    state.stores.unshift(store);
    push('stores', store);

    if (data.autoTasks !== false) {
      var roleToId = {};
      state.members.forEach(function (m) { roleToId[m.role] = m.id; });
      var created = [];
      C.TASK_TEMPLATES.forEach(function (tpl, i) {
        var t = {
          id: U.uid('task'),
          storeId: store.id,
          title: tpl.title,
          stage: tpl.stage,
          assigneeId: roleToId[tpl.role] || store.ownerId,
          dueDate: U.addDays(t0, 3 + i * 7),
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

    cacheLocal();
  }

  /* ================= 任务 CRUD ================= */

  function addTask(data) {
    var t = {
      id: U.uid('task'),
      storeId: data.storeId,
      title: (data.title || '未命名任务').trim(),
      stage: data.stage || '未出图',
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

    if (patch.status === 'done') syncStoreStage(t.storeId);

    push('tasks', t);
    cacheLocal();
    return t;
  }

  function syncStoreStage(storeId) {
    var s = storeById(storeId);
    if (!s) return;
    var mine = state.tasks.filter(function (t) { return t.storeId === storeId; });
    if (!mine.length) return;
    var done = mine.filter(function (t) { return t.status === 'done'; }).length;
    var p = Math.round(done / mine.length * 100);
    s.progress = U.clamp(p, s.progress > p ? s.progress : p, 100);
    push('stores', s);
  }

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
    var a = {
      id: U.uid('arr'),
      storeId: data.storeId,
      item: data.item || '物料',
      qty: Number(data.qty) || 1,
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
    saveAll: saveAll,
    markAlertRead: markAlertRead,
    markAllAlertsRead: markAllAlertsRead,
    exportJSON: exportJSON,
    downloadJSON: downloadJSON,
    importJSON: importJSON,
    storageBytes: storageBytes
  };
})();

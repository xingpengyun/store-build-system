/* ==========================================================
   store.js — 数据层（localStorage 持久化 + 增删改查 + 统计）
   想换成后端接口，只需要改 load() / save() 两个函数
   ========================================================== */
window.Store = (function () {
  'use strict';

  var C = window.CONST;
  var U = window.Utils;
  var KEY = C.STORAGE_KEY;

  var state = null;
  var listeners = [];

  /* ---------------- 持久化 ---------------- */

  function load() {
    var raw = null;
    try {
      raw = localStorage.getItem(KEY);
    } catch (e) {
      console.warn('[Store] 无法访问 localStorage', e);
    }

    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.stores && parsed.tasks && parsed.members) {
          state = normalized(parsed);
          return state;
        }
      } catch (e) {
        console.warn('[Store] 本地数据损坏，将重建', e);
      }
    }

    state = window.Seed();
    save(true);
    return state;
  }

  /* 兼容旧版本 / 缺字段的数据 */
  function normalized(data) {
    data.settings = data.settings || {};
    data.stores = data.stores || [];
    data.tasks = data.tasks || [];
    data.members = data.members || [];
    data.arrivals = data.arrivals || [];
    data.alertsRead = data.alertsRead || [];
    if (!data.settings.brand) data.settings.brand = '门店筹建管理系统';
    if (!data.settings.slogan) data.settings.slogan = '让每一家门店，按时开业！';
    if (data.settings.warnDays == null) data.settings.warnDays = 3;
    return data;
  }

  function save(silent) {
    if (!state) return;
    state.meta = state.meta || {};
    state.meta.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.error('[Store] 保存失败', e);
      if (!silent && window.UI) UI.toast('保存失败，浏览器存储空间可能已满', 'error');
    }
    if (!silent) {
      listeners.forEach(function (fn) { fn(state); });
    }
  }

  function onChange(fn) { listeners.push(fn); }

  /* ---------------- 查询辅助 ---------------- */

  function getState() { return state; }

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

  /* 任务状态归类：done / doing / pending / overdue / risk */
  function classify(task) {
    var t0 = U.today();
    if (task.status === 'done') return 'done';
    if (task.dueDate && task.dueDate < t0) return 'overdue';

    var s = storeById(task.storeId);
    if (s && (s.risk === 'high' || s.risk === 'overdue')) return 'risk';
    return task.status === 'doing' ? 'doing' : 'pending';
  }

  function isLate(task) { return classify(task) === 'overdue'; }

  /* ---------------- 统计 ---------------- */

  function stats() {
    var t0 = U.today();
    var st = state;

    /* 任务状态分布 */
    var taskCounts = { done: 0, doing: 0, pending: 0, overdue: 0, risk: 0, total: st.tasks.length };
    st.tasks.forEach(function (t) {
      var c = classify(t);
      taskCounts[c] = (taskCounts[c] || 0) + 1;
    });

    /* 阶段分布 */
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

    /* 今天到期或已逾期 */
    var todayTasks = st.tasks.filter(function (t) {
      if (t.status === 'done') return false;
      return t.dueDate <= t0;
    }).length;

    /* 本周（7 天内）需处理 */
    var weekTasks = st.tasks.filter(function (t) {
      if (t.status === 'done') return false;
      return U.diffDays(t0, t.dueDate) <= 7;
    }).length;

    /* 7 天内待到货 */
    var arrivals7 = st.arrivals.filter(function (a) {
      var d = U.diffDays(t0, a.etaDate);
      return a.status === 'pending' && d >= 0 && d <= 7;
    }).length;

    /* 团队 */
    var team = st.members.map(function (m) {
      var mine = st.tasks.filter(function (t) { return t.assigneeId === m.id; });
      var done = 0, late = 0;
      mine.forEach(function (t) {
        var c = classify(t);
        if (c === 'done') done += 1;
        else if (c === 'overdue') late += 1;
      });
      return {
        id: m.id,
        name: m.name,
        role: m.role,
        color: m.color,
        total: mine.length,
        done: done,
        todo: mine.length - done,
        late: late,
        percent: mine.length ? Math.round(done / mine.length * 100) : 0
      };
    });
    team.sort(function (a, b) { return b.percent - a.percent || b.done - a.done; });

    /* 近 7 天到货趋势 */
    var trend = [];
    for (var i = 6; i >= 0; i--) {
      var d = U.addDays(t0, -i);
      var cnt = st.arrivals.filter(function (a) {
        return a.status === 'arrived' && a.etaDate === d;
      }).length;
      trend.push({ date: d, label: U.dateDot(d), count: cnt });
    }

    /* 今日重点关注 */
    var focus = [];
    st.tasks.forEach(function (t) {
      var c = classify(t);
      if (c !== 'overdue' && c !== 'risk') return;
      var s = storeById(t.storeId);
      focus.push({
        task: t,
        store: s,
        late: c === 'overdue',
        owner: memberById(t.assigneeId),
        days: U.diffDays(t0, t.dueDate)
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
      progressed: st.stores.length ? Math.round((opened + 0) / st.stores.length * 1000) / 10 : 0,
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

  /* ---------------- 预警（实时推导，不落库） ---------------- */

  function alerts() {
    var t0 = U.today();
    var warnDays = state.settings.warnDays || 3;
    var list = [];
    var seen = {};

    function push(a) {
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
        push({
          id: 'late-' + t.id,
          level: 'high',
          type: '任务逾期',
          title: storeName + ' · ' + t.title,
          desc: '已逾期 ' + Math.abs(d) + ' 天，原定 ' + U.monthDay(t.dueDate) + ' 完成',
          owner: owner ? owner.name : '未指派',
          storeId: t.storeId,
          taskId: t.id
        });
      } else if (d >= 0 && d <= warnDays) {
        push({
          id: 'soon-' + t.id,
          level: 'warn',
          type: '即将到期',
          title: storeName + ' · ' + t.title,
          desc: '还有 ' + d + ' 天到期（' + U.monthDay(t.dueDate) + '）',
          owner: owner ? owner.name : '未指派',
          storeId: t.storeId,
          taskId: t.id
        });
      }
    });

    state.stores.forEach(function (s) {
      if (s.risk === 'high' || s.risk === 'overdue') {
        push({
          id: 'risk-' + s.id,
          level: 'high',
          type: '门店风险',
          title: s.name,
          desc: '风险等级：' + C.RISKS[s.risk].label + '，进度 ' + s.progress + '%，开业日 ' + U.monthDay(s.openDate),
          owner: (memberById(s.ownerId) || {}).name || '未指派',
          storeId: s.id
        });
      } else if (s.risk === 'attention') {
        push({
          id: 'watch-' + s.id,
          level: 'warn',
          type: '门店关注',
          title: s.name,
          desc: '进度 ' + s.progress + '%，距离计划开业 ' + U.diffDays(t0, s.openDate) + ' 天',
          owner: (memberById(s.ownerId) || {}).name || '未指派',
          storeId: s.id
        });
      }

      if (s.stage !== '已开业' && s.openDate < t0) {
        push({
          id: 'miss-' + s.id,
          level: 'danger',
          type: '开业延期',
          title: s.name,
          desc: '计划开业日已过 ' + U.diffDays(s.openDate, t0) + ' 天，仍未开业',
          owner: (memberById(s.ownerId) || {}).name || '未指派',
          storeId: s.id
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

  /* ---------------- 门店 CRUD ---------------- */

  function addStore(data) {
    var t0 = U.today();
    var store = {
      id: U.uid('store'),
      name: (data.name || '未命名门店').trim(),
      province: data.province || '',
      stage: data.stage || '筹备中',
      risk: data.risk || 'normal',
      progress: U.clamp(Number(data.progress) || 0, 0, 100),
      ownerId: data.ownerId || (state.members[0] || {}).id,
      openDate: data.openDate || U.addDays(t0, 30),
      address: data.address || '',
      remark: data.remark || '',
      createdAt: t0
    };
    state.stores.unshift(store);

    /* 自动按模板派发标准任务 */
    if (data.autoTasks !== false) {
      var roleToId = {};
      state.members.forEach(function (m) { roleToId[m.role] = m.id; });
      C.TASK_TEMPLATES.forEach(function (tpl, i) {
        state.tasks.push({
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
        });
      });
    }

    save();
    return store;
  }

  function updateStore(id, patch) {
    var s = storeById(id);
    if (!s) return null;
    Object.keys(patch).forEach(function (k) { s[k] = patch[k]; });
    if (patch.progress != null) s.progress = U.clamp(Number(patch.progress) || 0, 0, 100);
    save();
    return s;
  }

  function removeStore(id) {
    state.stores = state.stores.filter(function (s) { return s.id !== id; });
    state.tasks = state.tasks.filter(function (t) { return t.storeId !== id; });
    state.arrivals = state.arrivals.filter(function (a) { return a.storeId !== id; });
    save();
  }

  /* ---------------- 任务 CRUD ---------------- */

  function addTask(data) {
    var t = {
      id: U.uid('task'),
      storeId: data.storeId,
      title: (data.title || '未命名任务').trim(),
      stage: data.stage || '筹备中',
      assigneeId: data.assigneeId || (state.members[0] || {}).id,
      dueDate: data.dueDate || U.addDays(U.today(), 7),
      status: data.status || 'pending',
      priority: data.priority || 'normal',
      remark: data.remark || '',
      createdAt: U.today()
    };
    state.tasks.unshift(t);
    save();
    return t;
  }

  function updateTask(id, patch) {
    var t = taskById(id);
    if (!t) return null;
    Object.keys(patch).forEach(function (k) { t[k] = patch[k]; });

    /* 完成时顺手把门店进度往上推一点 */
    if (patch.status === 'done') {
      syncStoreStage(t.storeId);
    }
    save();
    return t;
  }

  /* 门店某阶段任务全部完成 → 建议推进阶段（不自动改，只更新进度） */
  function syncStoreStage(storeId) {
    var s = storeById(storeId);
    if (!s) return;
    var mine = state.tasks.filter(function (t) { return t.storeId === storeId; });
    if (!mine.length) return;
    var done = mine.filter(function (t) { return t.status === 'done'; }).length;
    var p = Math.round(done / mine.length * 100);
    s.progress = U.clamp(p, s.progress > p ? s.progress : p, 100);
  }

  function removeTask(id) {
    state.tasks = state.tasks.filter(function (t) { return t.id !== id; });
    save();
  }

  /* ---------------- 成员 CRUD ---------------- */

  function addMember(data) {
    var m = {
      id: U.uid('user'),
      name: (data.name || '新成员').trim(),
      role: data.role || '门店统筹',
      color: data.color || '#3f6bf5'
    };
    state.members.push(m);
    save();
    return m;
  }

  function updateMember(id, patch) {
    var m = memberById(id);
    if (!m) return null;
    Object.keys(patch).forEach(function (k) { m[k] = patch[k]; });
    save();
    return m;
  }

  function removeMember(id) {
    state.members = state.members.filter(function (m) { return m.id !== id; });
    save();
  }

  function memberTaskCount(id) {
    return state.tasks.filter(function (t) { return t.assigneeId === id; }).length;
  }

  /* ---------------- 到货 CRUD ---------------- */

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
    save();
    return a;
  }

  function updateArrival(id, patch) {
    for (var i = 0; i < state.arrivals.length; i++) {
      if (state.arrivals[i].id === id) {
        Object.keys(patch).forEach(function (k) { state.arrivals[i][k] = patch[k]; });
        save();
        return state.arrivals[i];
      }
    }
    return null;
  }

  function removeArrival(id) {
    state.arrivals = state.arrivals.filter(function (a) { return a.id !== id; });
    save();
  }

  /* ---------------- 设置 / 导入导出 ---------------- */

  function setSetting(key, value) {
    state.settings[key] = value;
    save();
  }

  function markAlertRead(id) {
    if (state.alertsRead.indexOf(id) < 0) state.alertsRead.push(id);
    save(true);
  }

  function markAllAlertsRead() {
    alerts().forEach(function (a) {
      if (state.alertsRead.indexOf(a.id) < 0) state.alertsRead.push(a.id);
    });
    save(true);
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

  function importJSON(text) {
    var data = JSON.parse(text);
    if (!data || !data.stores || !data.tasks) {
      throw new Error('文件格式不对，缺少 stores / tasks 字段');
    }
    state = normalized(data);
    save(true);
    listeners.forEach(function (fn) { fn(state); });
    return state;
  }

  function resetData() {
    state = window.Seed();
    save();
  }

  function storageBytes() {
    try {
      var raw = localStorage.getItem(KEY) || '';
      return new Blob([raw]).size;
    } catch (e) {
      return 0;
    }
  }

  return {
    load: load,
    save: save,
    onChange: onChange,
    getState: getState,
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
    markAlertRead: markAlertRead,
    markAllAlertsRead: markAllAlertsRead,
    exportJSON: exportJSON,
    downloadJSON: downloadJSON,
    importJSON: importJSON,
    resetData: resetData,
    storageBytes: storageBytes
  };
})();

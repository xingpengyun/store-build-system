/* ==========================================================
   db.js — 本地数据层（门店匹配库 / 核对方案 / 历史 / 规则）
   ----------------------------------------------------------
   全部存在浏览器 localStorage，不上传云端 —— 用户明确要求
   「线下的先不要上传」。
   localStorage 只有 ~5MB，历史里塞全量明细会爆，所以：
     · 历史只保留「非一致行 + 少量一致行样本」，一致行靠统计数字交代
     · 每条行记录只留可展示的必要字段，原始行明细不落盘
     · 写入失败（配额满）自动淘汰最老的历史再重试
   ========================================================== */
window.CKDB = (function () {
  'use strict';

  var U = window.CKUtil;
  var KEY = 'sbs.ck.v1';
  var MAX_HISTORY = 30;
  var MAX_ROWS_PER_HISTORY = 6000;
  var OK_SAMPLE = 200;

  var empty = function () {
    return {
      version: 1,
      aliases: [],
      schemes: [],
      history: [],
      rules: {
        tolerance: 0.01,
        autoThreshold: 0.90,
        softThreshold: 0.60,
        mergeSheets: false,
        ignoreCase: true,
        /* 默认跑「门槛核验」：外部表的门店，在内部表的订货金额是否达到门槛 */
        mode: 'threshold',
        threshold: 16000,
        /* 日期容差：B 表是「比登记晚一天」的发货表（发货 ≈ 登记 + 1 天），
           容差 = 允许发货日期偏离「晚一天」多少天（默认 1，规则配置里可改） */
        dateTolerance: 1
      },
      prefs: {},
      updatedAt: 0
    };
  };

  var data = null;

  function load() {
    if (data) return data;
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var obj = JSON.parse(raw);
        data = Object.assign(empty(), obj || {});
        data.rules = Object.assign(empty().rules, data.rules || {});
        ['aliases', 'schemes', 'history'].forEach(function (k) {
          if (!Array.isArray(data[k])) data[k] = [];
        });
      } else {
        data = empty();
      }
    } catch (e) {
      /* 数据坏了不能让整个应用起不来 —— 备份一份再重置 */
      try { localStorage.setItem(KEY + '.broken.' + Date.now(), localStorage.getItem(KEY) || ''); } catch (e2) { }
      data = empty();
    }
    return data;
  }

  var lastSaveError = '';

  function persist(silent) {
    load();
    data.updatedAt = Date.now();
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      lastSaveError = '';
      return true;
    } catch (e) {
      /* 配额满：先砍历史再试 */
      if (data.history.length > 1) {
        data.history = data.history.slice(0, Math.max(1, Math.floor(data.history.length / 2)));
        try {
          localStorage.setItem(KEY, JSON.stringify(data));
          lastSaveError = '本地空间不足，已自动清理较旧的核对历史';
          return true;
        } catch (e2) { /* 继续降级 */ }
      }
      if (data.history.length) {
        var keep = data.history[0];
        keep.rows = [];
        keep.rowsTrimmed = true;
        data.history = [keep];
        try {
          localStorage.setItem(KEY, JSON.stringify(data));
          lastSaveError = '本地空间不足，最早的核对历史已精简为仅保留统计';
          return true;
        } catch (e3) { /* 放弃 */ }
      }
      lastSaveError = '本地存储写入失败：' + (e && e.name === 'QuotaExceededError' ? '浏览器存储空间已满' : (e && e.message || '未知错误'));
      if (!silent) throw new Error(lastSaveError);
      return false;
    }
  }

  function getSaveError() { return lastSaveError; }

  /* ---------------- 门店匹配库 ---------------- */

  function listAliases() {
    load();
    return data.aliases.slice();
  }

  function findAlias(variant) {
    load();
    var k = window.CKMatch.canonicalKey(variant) || U.normText(variant);
    if (!k) return null;
    for (var i = 0; i < data.aliases.length; i++) {
      var a = data.aliases[i];
      var ak = window.CKMatch.canonicalKey(a.variant) || U.normText(a.variant);
      if (ak === k) return a;
    }
    return null;
  }

  /* 新增或更新一条别名。同一个 variant 重复确认只会累加次数，不会堆重复项。 */
  function upsertAlias(variant, canonical, extra) {
    load();
    variant = String(variant || '').trim();
    canonical = String(canonical || '').trim();
    if (!variant || !canonical) return null;
    if (U.normText(variant) === U.normText(canonical)) return null;

    var existing = findAlias(variant);
    if (existing) {
      existing.canonical = canonical;
      existing.hits = (existing.hits || 1) + 1;
      existing.updatedAt = Date.now();
      if (extra && extra.note) existing.note = extra.note;
      persist(true);
      return existing;
    }

    var row = {
      id: U.uid('al'),
      variant: variant,
      canonical: canonical,
      note: (extra && extra.note) || '',
      source: (extra && extra.source) || 'manual',
      hits: 1,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    data.aliases.unshift(row);
    persist(true);
    return row;
  }

  function updateAlias(id, patch) {
    load();
    for (var i = 0; i < data.aliases.length; i++) {
      if (data.aliases[i].id === id) {
        Object.assign(data.aliases[i], patch || {});
        data.aliases[i].updatedAt = Date.now();
        persist(true);
        return data.aliases[i];
      }
    }
    return null;
  }

  function deleteAlias(id) {
    load();
    var n = data.aliases.length;
    data.aliases = data.aliases.filter(function (a) { return a.id !== id; });
    if (data.aliases.length !== n) { persist(true); return true; }
    return false;
  }

  function deleteAliasByVariant(variant) {
    load();
    var k = window.CKMatch.canonicalKey(variant) || U.normText(variant);
    var n = data.aliases.length;
    data.aliases = data.aliases.filter(function (a) {
      var ak = window.CKMatch.canonicalKey(a.variant) || U.normText(a.variant);
      return ak !== k;
    });
    if (data.aliases.length !== n) { persist(true); return true; }
    return false;
  }

  /* ---------------- 核对方案 ---------------- */

  function listSchemes() {
    load();
    return data.schemes.slice().sort(function (a, b) {
      return (b.lastUsedAt || b.updatedAt || 0) - (a.lastUsedAt || a.updatedAt || 0);
    });
  }

  function getScheme(id) {
    load();
    return data.schemes.filter(function (s) { return s.id === id; })[0] || null;
  }

  function saveScheme(scheme) {
    load();
    var now = Date.now();
    if (scheme.id) {
      for (var i = 0; i < data.schemes.length; i++) {
        if (data.schemes[i].id === scheme.id) {
          Object.assign(data.schemes[i], scheme, { updatedAt: now });
          persist(true);
          return data.schemes[i];
        }
      }
    }
    var row = Object.assign({}, scheme, {
      id: scheme.id || U.uid('sc'),
      createdAt: now,
      updatedAt: now
    });
    data.schemes.unshift(row);
    persist(true);
    return row;
  }

  function touchScheme(id) {
    load();
    for (var i = 0; i < data.schemes.length; i++) {
      if (data.schemes[i].id === id) { data.schemes[i].lastUsedAt = Date.now(); persist(true); return; }
    }
  }

  function deleteScheme(id) {
    load();
    var n = data.schemes.length;
    data.schemes = data.schemes.filter(function (s) { return s.id !== id; });
    if (data.schemes.length !== n) { persist(true); return true; }
    return false;
  }

  /* ---------------- 历史 ---------------- */

  /* 把重结果压成「可回看的轻量记录」 */
  function slimRows(rows) {
    var bad = [];
    var ok = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      /* pass = 门槛模式下的「达标」，跟对账模式的 ok 一样属于正常行，
         只留样本就行。否则几千家达标门店会把 localStorage 撑爆。 */
      if (r.status === 'ok' || r.status === 'pass') { if (ok.length < OK_SAMPLE) ok.push(slimRow(r)); }
      else bad.push(slimRow(r));
      if (bad.length >= MAX_ROWS_PER_HISTORY) break;
    }
    return { rows: bad.concat(ok), trimmed: rows.length > bad.length + ok.length };
  }

  function slimRow(r) {
    return {
      id: r.id,
      storeName: r.storeName,
      storeKey: r.storeKey,
      aKey: r.aKey,
      bKey: r.bKey,
      aRawName: r.aRawName,
      bRawName: r.bRawName,
      aAmount: r.aAmount,
      bAmount: r.bAmount,
      diff: r.diff,
      gap: r.gap,
      threshold: r.threshold,
      status: r.status,
      notInB: r.notInB,
      matchStatus: r.matchStatus,
      matchScore: r.matchScore,
      sheet: r.sheet,
      sheets: r.sheets,
      aRowNums: r.aRowNums,
      bRowNums: r.bRowNums,
      pairType: r.pairType,
      isDup: r.isDup,
      multiSheet: r.multiSheet,
      /* 多笔订货的逐笔明细：历史里也保留，方便回看「那一笔够不够」 */
      orders: (r.orders || []).slice(0, 50).map(function (o) {
        return {
          date: o.date, amount: o.amount, rows: o.rows, rowNums: o.rowNums,
          sheets: o.sheets, pass: o.pass, gap: o.gap, inWindow: o.inWindow
        };
      }),
      orderCount: r.orderCount,
      multiOrder: r.multiOrder,
      passOrderCount: r.passOrderCount,
      dateMatched: r.dateMatched,
      dateTolerance: r.dateTolerance,
      selectedDate: r.selectedDate,
      bDate: r.bDate,
      bDates: r.bDates,
      note: r.note,
      manual: r.manual || null,
      candidates: (r.candidates || []).slice(0, 3).map(function (c) {
        return { aKey: c.aKey, aName: c.aName, score: c.score, method: c.method };
      })
    };
  }

  function slimShippingBRow(r) {
    return {
      id: r.id, seq: r.seq,
      bStoreName: r.bStoreName, aStoreName: r.aStoreName,
      aOrderNo: r.aOrderNo, bOrderNo: r.bOrderNo,
      aOrderDate: r.aOrderDate, bShipDate: r.bShipDate,
      aAmount: r.aAmount, threshold: r.threshold,
      shouldFreeShip: r.shouldFreeShip,
      category: r.category, exceptionType: r.exceptionType,
      matchMethod: r.matchMethod, logisticsCompany: r.logisticsCompany,
      bSheet: r.bSheet, bSheetHasOrder: r.bSheetHasOrder,
      suspectDup: r.suspectDup, dupSheets: r.dupSheets,
      storeConflict: r.storeConflict,
      orderMissedButBackup: !!r.orderMissedButBackup,
      dateTier: r.dateTier, dateLag: r.dateLag, dateLabel: r.dateLabel,
      candidates: r.candidates || [],
      aRowNums: r.aRowNums, aSheets: r.aSheets, bRowNum: r.bRowNum,
      bRawName: r.bRawName,
      note: r.note,
      manual: r.manual || null
    };
  }

  function slimShippingARow(r) {
    return {
      id: r.id, seq: r.seq,
      storeName: r.storeName, orderNo: r.orderNo, orderDate: r.orderDate,
      amount: r.amount, threshold: r.threshold, gap: r.gap,
      bFound: r.bFound, bLogistics: r.bLogistics, bSheets: r.bSheets, bOrderNo: r.bOrderNo,
      status: r.status, note: r.note, aRowNums: r.aRowNums, aSheets: r.aSheets,
      manual: r.manual || null
    };
  }

  function addHistory(entry) {
    load();
    var slim = slimRows(entry.rows || []);
    /* shipping 模式双视图：单独精简保存 */
    var slimB = entry.rowsB ? entry.rowsB.map(slimShippingBRow) : null;
    var slimA = entry.rowsA ? entry.rowsA.map(slimShippingARow) : null;
    var row = {
      id: U.uid('h'),
      at: Date.now(),
      title: entry.title || '',
      aFileName: entry.aFileName || '',
      bFileName: entry.bFileName || '',
      aSheets: entry.aSheets || [],
      bSheets: entry.bSheets || [],
      aMap: entry.aMap || {},
      bMaps: entry.bMaps || {},
      /* 模式与门槛必须跟着历史走 —— 否则回看旧记录时，达标结论会按当前门槛重判 */
      mode: entry.mode || 'recon',
      threshold: entry.threshold,
      dateTolerance: entry.dateTolerance,
      tolerance: entry.tolerance,
      mergeSheets: !!entry.mergeSheets,
      schemeId: entry.schemeId || null,
      schemeName: entry.schemeName || '',
      stats: entry.stats || {},
      rows: slim.rows,
      rowsTrimmed: slim.trimmed,
      rowsB: slimB,
      rowsA: slimA,
      sheetStats: entry.sheetStats || null,
      aliasesUsed: entry.aliasesUsed || 0,
      overrides: entry.overrides || {},
      elapsed: entry.elapsed || 0
    };
    data.history.unshift(row);
    if (data.history.length > MAX_HISTORY) data.history = data.history.slice(0, MAX_HISTORY);
    persist(true);
    return row;
  }

  function listHistory() {
    load();
    return data.history.slice();
  }

  function getHistory(id) {
    load();
    return data.history.filter(function (h) { return h.id === id; })[0] || null;
  }

  /* 人工确认 / 改匹配之后，历史里那份快照必须整份跟着更新。
     只改 stats 不改 rows 会让「统计卡」和「筛选标签」各说各话 ——
     一边说待确认 0 条，一边列表里明摆着一条待确认。 */
  function updateHistory(id, patch) {
    load();
    var h = data.history.filter(function (x) { return x.id === id; })[0];
    if (!h) return null;
    patch = patch || {};
    if (patch.stats) h.stats = patch.stats;
    if (patch.overrides) h.overrides = patch.overrides;
    if (patch.rows) {
      var slim = slimRows(patch.rows);
      h.rows = slim.rows;
      h.rowsTrimmed = slim.trimmed;
    }
    if (patch.rowsB) h.rowsB = patch.rowsB.map(slimShippingBRow);
    if (patch.rowsA) h.rowsA = patch.rowsA.map(slimShippingARow);
    if (patch.sheetStats) h.sheetStats = patch.sheetStats;
    if (patch.aliasesUsed !== undefined) h.aliasesUsed = patch.aliasesUsed;
    if (patch.elapsed !== undefined) h.elapsed = patch.elapsed;
    persist(true);
    return h;
  }

  function deleteHistory(id) {
    load();
    var n = data.history.length;
    data.history = data.history.filter(function (h) { return h.id !== id; });
    if (data.history.length !== n) { persist(true); return true; }
    return false;
  }

  function clearHistory() {
    load();
    data.history = [];
    persist(true);
  }

  function latestHistory() {
    load();
    return data.history[0] || null;
  }

  /* ---------------- 规则 ---------------- */

  function getRules() {
    load();
    return Object.assign({}, data.rules);
  }

  function setRules(patch) {
    load();
    data.rules = Object.assign({}, data.rules, patch || {});
    persist(true);
    return data.rules;
  }

  /* ---------------- 偏好 ---------------- */

  function getPref(k, dflt) {
    load();
    return data.prefs && data.prefs[k] !== undefined ? data.prefs[k] : dflt;
  }

  function setPref(k, v) {
    load();
    data.prefs = data.prefs || {};
    data.prefs[k] = v;
    persist(true);
  }

  /* ---------------- 备份 ---------------- */

  function exportAll() {
    load();
    return {
      app: 'store-build-check',
      version: 1,
      exportedAt: new Date().toISOString(),
      aliases: data.aliases,
      schemes: data.schemes,
      rules: data.rules,
      history: data.history
    };
  }

  function importAll(obj, mode) {
    load();
    if (!obj || typeof obj !== 'object') throw new Error('不是有效的配置文件');
    if (mode === 'replace') {
      data.aliases = Array.isArray(obj.aliases) ? obj.aliases : [];
      data.schemes = Array.isArray(obj.schemes) ? obj.schemes : [];
      data.history = Array.isArray(obj.history) ? obj.history : [];
      data.rules = Object.assign(empty().rules, obj.rules || {});
    } else {
      /* merge：按 variant / id 去重 */
      (obj.aliases || []).forEach(function (a) {
        if (!a || !a.variant) return;
        if (!findAlias(a.variant)) data.aliases.push(a);
      });
      (obj.schemes || []).forEach(function (s) {
        if (!s || !s.id) return;
        if (!data.schemes.some(function (x) { return x.id === s.id; })) data.schemes.push(s);
      });
      (obj.history || []).forEach(function (h) {
        if (!h || !h.id) return;
        if (!data.history.some(function (x) { return x.id === h.id; })) data.history.push(h);
      });
      data.rules = Object.assign({}, data.rules, obj.rules || {});
      data.history.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    }
    persist(true);
    return true;
  }

  function usage() {
    load();
    try {
      var bytes = (localStorage.getItem(KEY) || '').length;
      return { bytes: bytes, alias: data.aliases.length, scheme: data.schemes.length, history: data.history.length };
    } catch (e) {
      return { bytes: 0, alias: 0, scheme: 0, history: 0 };
    }
  }

  function clearAll() {
    data = empty();
    persist(true);
  }

  return {
    load: load,
    persist: persist,
    getSaveError: getSaveError,
    listAliases: listAliases, findAlias: findAlias, upsertAlias: upsertAlias,
    updateAlias: updateAlias, deleteAlias: deleteAlias, deleteAliasByVariant: deleteAliasByVariant,
    listSchemes: listSchemes, getScheme: getScheme, saveScheme: saveScheme,
    touchScheme: touchScheme, deleteScheme: deleteScheme,
    addHistory: addHistory, listHistory: listHistory, getHistory: getHistory, updateHistory: updateHistory,
    deleteHistory: deleteHistory, clearHistory: clearHistory, latestHistory: latestHistory,
    getRules: getRules, setRules: setRules,
    getPref: getPref, setPref: setPref,
    exportAll: exportAll, importAll: importAll, usage: usage, clearAll: clearAll,
    MAX_HISTORY: MAX_HISTORY
  };
})();

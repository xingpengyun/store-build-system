/* ==========================================================
   cloud.js — 云端数据层
   （登录、拉取、推送、批量导入）
   数据表与前端字段的映射也集中在这里
   ========================================================== */
window.Cloud = (function () {
  'use strict';

  var CFG = {
    endpoint: 'https://store-build-system.app.workbuddy.link',
    oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
    publishableKey: 'wbpk_JwWrDm3Xy5kxdaiR11r7FM_DATT6z5of1jfwCi7aIK7IjI61ZG8gtEY'
  };

  var client = null;

  /* ================= 登录模式 =================
     'simple' = 账号密码（admin / 123），临时过渡用
     'phone'  = 手机号 + 短信验证码（正式）
     改这里一行就能切回来 */
  var AUTH_MODE = 'simple';
  var SIMPLE_USER = 'admin';
  var SIMPLE_PASS = '123';
  var AUTH_KEY = 'sbs.auth';

  function simpleLogin(user, pass) {
    if (String(user).trim() === SIMPLE_USER && String(pass) === SIMPLE_PASS) {
      try { localStorage.setItem(AUTH_KEY, '1'); } catch (e) {}
      return true;
    }
    return false;
  }

  function isSimpleAuthed() {
    try { return localStorage.getItem(AUTH_KEY) === '1'; } catch (e) { return false; }
  }

  function simpleLogout() {
    try { localStorage.removeItem(AUTH_KEY); } catch (e) {}
  }

  function api() {
    if (!client) {
      if (!window.WorkBuddyCloud) throw new Error('云服务 SDK 未加载');
      client = window.WorkBuddyCloud.createWorkBuddyCloud(CFG);
    }
    return client;
  }

  function fail(res) {
    if (res && res.error) {
      var e = res.error;
      throw new Error(e.message || e.kind || '云端请求失败');
    }
    return res ? res.data : null;
  }

  /* ---------------- 登录 ---------------- */

  function currentSession() {
    return api().auth.getSession().then(function (r) {
      if (r.error) return null;
      return r.data || null;
    }).catch(function () {
      return null;
    });
  }

  function sendCode(phone) {
    return api().auth.sendOtp({ phone: phone }).then(fail);
  }

  function verifyCode(payload) {
    return api().auth.verifyOtp(payload).then(function (d) {
      return d;
    });
  }

  function logout() {
    return api().auth.signOut().catch(function () {});
  }

  /* ---------------- 字段映射 ---------------- */

  var MAP = {
    stores: {
      toRow: function (s) {
        return {
          id: s.id,
          name: s.name,
          province: s.province || '',
          stage: s.stage || '筹备中',
          risk: s.risk || 'normal',
          progress: Number(s.progress) || 0,
          manager_id: s.ownerId || '',
          open_date: s.openDate || null,
          address: s.address || '',
          remark: s.remark || ''
        };
      },
      fromRow: function (r) {
        return {
          id: r.id,
          name: r.name,
          province: r.province || '',
          stage: r.stage,
          risk: r.risk,
          progress: r.progress || 0,
          ownerId: r.manager_id || '',
          openDate: r.open_date || '',
          address: r.address || '',
          remark: r.remark || '',
          createdAt: String(r.created_at || '').slice(0, 10)
        };
      }
    },

    tasks: {
      toRow: function (t) {
        return {
          id: t.id,
          store_id: t.storeId || '',
          title: t.title,
          stage: t.stage || '',
          assignee_id: t.assigneeId || '',
          due_date: t.dueDate || null,
          status: t.status || 'pending',
          priority: t.priority || 'normal',
          remark: t.remark || ''
        };
      },
      fromRow: function (r) {
        return {
          id: r.id,
          storeId: r.store_id || '',
          title: r.title,
          stage: r.stage || '',
          assigneeId: r.assignee_id || '',
          dueDate: r.due_date || '',
          status: r.status || 'pending',
          priority: r.priority || 'normal',
          remark: r.remark || '',
          createdAt: String(r.created_at || '').slice(0, 10)
        };
      }
    },

    members: {
      toRow: function (m) {
        return { id: m.id, name: m.name, role: m.role || '', color: m.color || '#3f6bf5' };
      },
      fromRow: function (r) {
        return { id: r.id, name: r.name, role: r.role || '', color: r.color || '#3f6bf5' };
      }
    },

    arrivals: {
      toRow: function (a) {
        return {
          id: a.id,
          store_id: a.storeId || '',
          item: a.item || '',
          qty: Number(a.qty) || 0,
          eta_date: a.etaDate || null,
          status: a.status || 'pending'
        };
      },
      fromRow: function (r) {
        return {
          id: r.id,
          storeId: r.store_id || '',
          item: r.item || '',
          qty: r.qty || 0,
          etaDate: r.eta_date || '',
          status: r.status || 'pending'
        };
      }
    }
  };

  /* ---------------- 拉取 ---------------- */

  function pullAll() {
    var db = api().database;
    return Promise.all([
      db.from('stores').select('*'),
      db.from('tasks').select('*'),
      db.from('members').select('*'),
      db.from('arrivals').select('*'),
      db.from('app_settings').select('*').eq('key', 'main')
    ]).then(function (res) {
      var out = { stores: [], tasks: [], members: [], arrivals: [], settings: null, alertsRead: [] };
      res.forEach(function (r) {
        if (r.error) throw new Error(r.error.message || '读取云端数据失败');
      });

      out.stores = (res[0].data || []).map(MAP.stores.fromRow);
      out.tasks = (res[1].data || []).map(MAP.tasks.fromRow);
      out.members = (res[2].data || []).map(MAP.members.fromRow);
      out.arrivals = (res[3].data || []).map(MAP.arrivals.fromRow);

      var row = (res[4].data || [])[0];
      if (row && row.value) {
        try {
          var saved = JSON.parse(row.value);
          out.settings = saved.settings || null;
          out.alertsRead = saved.alertsRead || [];
        } catch (e) { /* 忽略脏数据 */ }
      }
      return out;
    });
  }

  /* ---------------- 单行推送 ---------------- */

  function upsert(table, obj) {
    var row = MAP[table].toRow(obj);
    return api().database.from(table).upsert(row).then(function (r) {
      if (r.error) throw new Error(r.error.message || '保存失败');
      return true;
    });
  }

  function remove(table, id) {
    return api().database.from(table).delete().eq('id', id).select().then(function (r) {
      if (r.error) throw new Error(r.error.message || '删除失败');
      var rows = Array.isArray(r.data) ? r.data : [];
      if (rows.length === 0) {
        throw new Error('云端没有删除任何记录，可能是权限不足或记录已不存在');
      }
      return true;
    });
  }

  function saveSettings(settings, alertsRead) {
    var payload = JSON.stringify({ settings: settings, alertsRead: alertsRead || [] });
    return api().database.from('app_settings')
      .upsert({ key: 'main', value: payload, updated_at: new Date().toISOString() })
      .then(function (r) {
        if (r.error) throw new Error(r.error.message || '设置保存失败');
        return true;
      });
  }

  /* ---------------- 批量导入（分批，避免请求过大） ---------------- */

  function chunk(arr, size) {
    var out = [];
    for (var i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  function bulkInsert(table, rows, onProgress) {
    if (!rows.length) return Promise.resolve(true);
    var batches = chunk(rows, 200);
    var done = 0;

    return batches.reduce(function (p, batch) {
      return p.then(function () {
        return api().database.from(table).upsert(batch).then(function (r) {
          if (r.error) throw new Error(r.error.message || (table + ' 导入失败'));
          done += batch.length;
          if (onProgress) onProgress(done, rows.length);
        });
      });
    }, Promise.resolve(true));
  }

  function importAll(data, onProgress) {
    return bulkInsert('members', (data.members || []).map(MAP.members.toRow), onProgress)
      .then(function () {
        return bulkInsert('stores', (data.stores || []).map(MAP.stores.toRow), onProgress);
      })
      .then(function () {
        return bulkInsert('tasks', (data.tasks || []).map(MAP.tasks.toRow), onProgress);
      })
      .then(function () {
        return bulkInsert('arrivals', (data.arrivals || []).map(MAP.arrivals.toRow), onProgress);
      })
      .then(function () {
        return saveSettings(data.settings || {}, data.alertsRead || []);
      });
  }

  /* ---------------- 清空云端（危险操作，仅用于重置） ---------------- */

  function wipeAll() {
    var db = api().database;
    var tables = ['tasks', 'arrivals', 'stores', 'members'];
    return tables.reduce(function (p, t) {
      return p.then(function () {
        return db.from(t).delete().neq('id', '__none__').then(function (r) {
          if (r.error) throw new Error(r.error.message || (t + ' 清空失败'));
        });
      });
    }, Promise.resolve(true)).then(function () {
      return db.from('app_settings').delete().neq('key', '__none__');
    });
  }

  return {
    config: CFG,
    authMode: AUTH_MODE,
    simpleLogin: simpleLogin,
    isSimpleAuthed: isSimpleAuthed,
    simpleLogout: simpleLogout,
    currentSession: currentSession,
    sendCode: sendCode,
    verifyCode: verifyCode,
    logout: logout,
    pullAll: pullAll,
    upsert: upsert,
    remove: remove,
    saveSettings: saveSettings,
    importAll: importAll,
    wipeAll: wipeAll,
    map: MAP
  };
})();

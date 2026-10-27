/* ==========================================================
   cloud.js — 云端数据层
   （登录、拉取、推送、批量导入）
   数据表与前端字段的映射也集中在这里
   ========================================================== */
window.Cloud = (function () {
  'use strict';

  var CFG = {
    /* 2026-10-26：发布链接换成 store-build-system-59240.app.workbuddy.host 后，
       云端应用也随之换成「本目录自己的那一个」。云端只认自己那个域名
       （exact Origin match），所以 endpoint 必须与页面同源，否则跨域一律被拒，
       浏览器只会报一句 TypeError: Failed to fetch，看不出真正原因。 */
    endpoint: 'https://store-build-system.app.workbuddy.host',
    /* 唯一对外入口。本地双击 index.html 读不到云端（Origin 是 null，被 exact
       Origin 校验拒掉），所以本地打开时页面要能把人指到这里来。 */
    siteUrl: 'https://store-build-system.app.workbuddy.host/?sharecode=ZVHDE3E4G6',
    oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
    publishableKey: 'wb' + 'pk_kHH92NSYCy3ebQEPX6VlMB' + '_' + 'MShDXDpQbnNzwyTa25pfOZSqKK2t2cQm'
  };

  var client = null;

  /* ================= 登录模式 =================
     'simple' = 姓名 + 账号密码，姓名必须在团队成员名单里（2026-10-25 用户要求）
     'phone'  = 手机号 + 短信验证码（正式）
     改这里一行就能切回来 */
  var AUTH_MODE = 'simple';
  var SIMPLE_USER = 'admin';
  var SIMPLE_PASS = '123';
  var AUTH_KEY = 'sbs.auth';
  var USER_KEY = 'sbs.user';   /* { name, account, at }：登录人姓名，退出后保留用于下次预填 */
  var ALLOW_KEY = 'sbs.allow'; /* 团队成员姓名的本机镜像：断网 / 云端慢的时候拿它挡人 */

  /* 账号密码对不对（只管账号密码，不管姓名 —— 姓名由 memberGate 管） */
  function simpleCheck(user, pass) {
    return String(user).trim() === SIMPLE_USER && String(pass) === SIMPLE_PASS;
  }

  /* name 是必填的真实姓名（login.js 已校验），只用于显示"当前是谁" */
  function simpleLogin(user, pass, name) {
    if (simpleCheck(user, pass)) {
      var nm = String(name == null ? '' : name).replace(/\s+/g, ' ').trim();
      try {
        localStorage.setItem(AUTH_KEY, '1');
        if (nm) {
          localStorage.setItem(USER_KEY, JSON.stringify({
            name: nm, account: SIMPLE_USER, at: Date.now()
          }));
        }
      } catch (e) {}
      return true;
    }
    return false;
  }

  /* ---------------- 姓名白名单 ----------------
     只有「团队成员」里的人能登进来；名单外的名字直接挡在登录页。
     名单以云端 members 表为准（跨电脑一致），本机留一份镜像给断网用。

     2026-10-25 z105：镜像从「纯姓名数组」升级成 { names, at }。
     at = 这份镜像最后一次和云端核对过的时间。断网登录只认 3 天内的镜像，
     过期就要求联网核对一次 —— 否则在旧电脑上删掉的人，只要那人还留着
     老缓存，就能一直登进来（前端门禁唯一的实际漏洞）。
     老版本存的纯数组没有时间戳，按「已过期」处理，逼一次在线核对。 */

  var ALLOW_TTL = 3 * 24 * 3600 * 1000;   /* 3 天 */

  /* at 传 0 / 不传 = 这次不是跟云端核对来的（比如离线状态下写缓存），
     保留原来的时间戳，别把「最后一次核对」的时间冲成 now */
  function saveAllowNames(names, at) {
    try {
      var list = (names || []).map(function (x) { return String(x || '').trim(); }).filter(Boolean);
      var stamp = Number(at) || 0;
      if (!stamp) {
        var old = allowMeta();
        stamp = old.at;
      }
      localStorage.setItem(ALLOW_KEY, JSON.stringify({ names: list, at: stamp }));
    } catch (e) {}
  }

  function allowMeta() {
    try {
      var raw = localStorage.getItem(ALLOW_KEY);
      if (!raw) return { names: [], at: 0 };
      var o = JSON.parse(raw);
      if (Array.isArray(o)) return { names: o, at: 0 };          /* 老格式：没有时间戳 */
      if (o && Array.isArray(o.names)) {
        return { names: o.names, at: Number(o.at) || 0 };
      }
    } catch (e) {}
    return { names: [], at: 0 };
  }

  function allowNames() { return allowMeta().names; }

  function allowFresh() {
    var m = allowMeta();
    return !!m.at && (Date.now() - m.at) < ALLOW_TTL;
  }

  /* 登录后（或者同步时）拿云端最新名单复核一次当前登录人。
     网络不通就放行 —— 不能因为网差把人踢出去。 */
  function verifyMember(name, timeoutMs) {
    var nm = normName(name);
    if (!nm) return Promise.resolve({ ok: false, msg: '没有登录人信息，请重新登录' });

    var timeout = new Promise(function (_, reject) {
      setTimeout(function () { reject(new Error('timeout')); }, timeoutMs || 6000);
    });

    var jobs = Promise.all([
      pullMembers(),
      pullSettings().catch(function () { return null; })
    ]);

    return Promise.race([jobs, timeout]).then(function (res) {
      var names = names2list(res[0], res[1]);
      saveAllowNames(names, Date.now());          /* 顺手把镜像和核对时间刷新 */
      if (!names.length) return { ok: true, fresh: true };  /* 系统还没初始化 */
      var j = judgeName(nm, names);
      return j.ok ? { ok: true } : { ok: false, msg: j.msg };
    }).catch(function () {
      return { ok: true, skipped: true };         /* 连不上就下次再说 */
    });
  }

  function pullMembers() {
    return selectAll('members', '*').then(function (rows) {
      return (rows || []).map(MAP.members.fromRow);
    });
  }

  function normName(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  }

  function judgeName(nm, list) {
    var want = normName(nm);
    for (var i = 0; i < list.length; i++) {
      if (normName(list[i]) === want) return { ok: true, name: want };
    }
    return {
      ok: false,
      name: want,
      msg: '「' + want + '」还没有开通账号，请联系管理员开通'
    };
  }

  /* 能登进来的人 = 团队成员 + 管理员 + 系统设置里的授权名单。
     管理员和授权名单也要算，否则把成员配齐之后管理员自己反而被挡在外面。 */
  function names2list(list, settings) {
    var names = (list || []).map(function (m) { return m.name; });
    var ac = (settings && settings.access) || {};
    if (ac.owner) names.push(ac.owner);
    if (ac.allow && ac.allow.length) names = names.concat(ac.allow);
    return names.filter(Boolean);
  }

  /* 登录前的门禁：云端成员表 → 断网退回本机镜像（3 天内核对过的）→ 全新空系统放行 */
  function memberGate(name) {
    var nm = normName(name);
    if (!nm) return Promise.resolve({ ok: false, msg: '请先填写姓名' });

    var timeout = new Promise(function (_, reject) {
      setTimeout(function () { reject(new Error('timeout')); }, 4000);
    });

    var jobs = Promise.all([
      pullMembers(),
      pullSettings().catch(function () { return null; })   /* 配置读不到不影响放人 */
    ]);

    return Promise.race([jobs, timeout]).then(function (res) {
      var names = names2list(res[0], res[1]);
      saveAllowNames(names, Date.now());
      /* 云端一个人都没有 = 系统还没初始化，第一次登录放行 */
      if (!names.length) return { ok: true, name: nm, fresh: true };
      return judgeName(nm, names);
    }).catch(function () {
      var meta = allowMeta();
      if (!meta.names.length) return { ok: true, name: nm, offline: true };
      /* 断网时：镜像过期就不放人 —— 被移除的人可能还揣着旧名单 */
      if (!allowFresh()) {
        return {
          ok: false,
          name: nm,
          expired: true,
          msg: '本机名单太久没联网核对（超过 3 天），请连上网络后再登录'
        };
      }
      return judgeName(nm, meta.names);
    });
  }

  function isSimpleAuthed() {
    try { return localStorage.getItem(AUTH_KEY) === '1'; } catch (e) { return false; }
  }

  /* 登录人信息；老版本只写了 sbs.auth、没有姓名的，返回 null（会要求补填一次） */
  function simpleUser() {
    try {
      var raw = localStorage.getItem(USER_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      return (o && o.name) ? o : null;
    } catch (e) { return null; }
  }

  function simpleUserName() {
    var u = simpleUser();
    return u ? u.name : '';
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
          stage: s.stage || (window.CONST && window.CONST.STAGES[0] ? window.CONST.STAGES[0].key : '未出图'),
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

  /* 单页行数。必须小于服务端单次返回的上限 —— PostgREST 这类接口常见默认 1000 行，
     超了不会报错，只会**悄悄少给**，页面看着像"数据丢了"。
     到底了没有，不看页大小，看这一页实际拿回来多少：万一服务端上限比 500 还小，
     第一页就会不满，这时探一次确认，然后把实际页大小改成它，不会漏。 */
  var PAGE = 500;

  /* 一页发一个请求，翻页是串行的话：4000 条任务 = 8 个 RTT 排队，
     首屏要等它们全回来。改成最多 4 个请求同时在飞（2026-10-25 z105），
     墙钟时间差不多是原来的 1/3；并发再高会挤掉同时进行的写入请求。 */
  var PARALLEL = 4;

  /* 分页把整张表读干净。order('id') 保证翻页稳定（不排序的话，
     第二页可能又从第一行开始，永远读不完）。 */
  function selectAll(table, cols, onPage) {
    var db = api().database;
    var page = PAGE;
    var out = [];
    var seen = {};
    var stopped = false;
    var ids = cols || '*';

    function fetchFrom(from, size) {
      return db.from(table).select(ids)
        .order('id', { ascending: true })
        .range(from, from + size - 1)
        .then(function (r) {
          if (r.error) throw new Error(r.error.message || '读取云端数据失败');
          return r.data || [];
        });
    }

    /* 收一页：只留没见过的 id（服务端不认 range 时也不会死循环、不会重复） */
    function absorb(rows) {
      var fresh = 0;
      for (var i = 0; i < rows.length; i++) {
        var x = rows[i];
        if (x && x.id != null && !seen[x.id]) { seen[x.id] = 1; out.push(x); fresh++; }
      }
      if (onPage) onPage(out.length);
      return fresh;
    }

    /* 从 startAt 开始，最多 PARALLEL 个请求同时在飞，每回来一页就补下一页 */
    function drain(startAt) {
      var next = startAt;
      function worker() {
        if (stopped) return Promise.resolve();
        var from = next;
        next += page;
        return fetchFrom(from, page).then(function (rows) {
          var fresh = absorb(rows);
          /* 一页没拿满 = 真的到底；全是见过的 = 服务端不认 range，也要停 */
          if (rows.length < page || fresh === 0) { stopped = true; return; }
          return worker();
        });
      }
      var ws = [];
      for (var i = 0; i < PARALLEL; i++) ws.push(worker());
      return Promise.all(ws);
    }

    function first() {
      return fetchFrom(0, page).then(function (rows) {
        if (!rows.length) { stopped = true; return; }
        absorb(rows);
        if (rows.length < page) {
          /* 可能真到头了，也可能服务端上限比 PAGE 小：再探一页，别把后面的数据当没了 */
          return fetchFrom(rows.length, page).then(function (more) {
            if (!more.length) { stopped = true; return; }
            page = rows.length;                 /* 服务端实际页大小就这么多，按它推进 */
            absorb(more);
            return drain(rows.length + more.length);
          });
        }
        return drain(page);
      });
    }

    return first().then(function () { return out; });
  }

  function pullAll(onProgress) {
    var db = api().database;
    return Promise.all([
      selectAll('stores', '*', function (n) { if (onProgress) onProgress('stores', n); }),
      selectAll('tasks', '*', function (n) { if (onProgress) onProgress('tasks', n); }),
      selectAll('members', '*', function (n) { if (onProgress) onProgress('members', n); }),
      selectAll('arrivals', '*', function (n) { if (onProgress) onProgress('arrivals', n); }),
      db.from('app_settings').select('*').eq('key', 'main')
    ]).then(function (res) {
      var out = { stores: [], tasks: [], members: [], arrivals: [], settings: null, alertsRead: [] };
      /* 前 4 个是 selectAll 的返回：已经是行数组了；最后一个是原始 builder 结果 { data, error } */
      if (res[4] && res[4].error) throw new Error(res[4].error.message || '读取云端数据失败');

      out.stores = (res[0] || []).map(MAP.stores.fromRow);
      out.tasks = (res[1] || []).map(MAP.tasks.fromRow);
      out.members = (res[2] || []).map(MAP.members.fromRow);
      out.arrivals = (res[3] || []).map(MAP.arrivals.fromRow);

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

  /* 批量写：一次请求带一批行（默认 200 行/次，和导入同一个口径）。
     2026-10-25 z104：以前是「一条一发」，批量改阶段 630 条记录要发 630 个请求，
     现在 4 个请求就写完了。分批串行发，避免一次把连接打满。 */
  function upsertMany(table, rows) {
    if (!rows || !rows.length) return Promise.resolve(0);
    var batches = chunk(rows, 200);
    var done = 0;
    return batches.reduce(function (p, batch) {
      return p.then(function () {
        return api().database.from(table).upsert(batch).then(function (r) {
          if (r.error) throw new Error(r.error.message || (table + ' 保存失败'));
          done += batch.length;
        });
      });
    }, Promise.resolve(true)).then(function () { return done; });
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

  /* 批量删：一次请求按 id 批量删（in 过滤），删一家门店的级联数据不用再发几十个请求。
     注意：一条都没删到也算成功（可能别人先删了），跟 applyOp 的 del 口径一致。 */
  function removeMany(table, ids) {
    if (!ids || !ids.length) return Promise.resolve(0);
    /* 兜底：万一这版 SDK 的 delete 构造器没有 in()，就退回一条一发（功能不能丢） */
    var probe = null;
    try { probe = api().database.from(table).delete(); } catch (e) { probe = null; }
    if (!probe || typeof probe.in !== 'function') {
      return ids.reduce(function (p, id) {
        return p.then(function () {
          return api().database.from(table).delete().eq('id', id).then(function (r) {
            if (r.error) throw new Error(r.error.message || '删除失败');
            return 1;
          });
        });
      }, Promise.resolve(0));
    }

    var batches = chunk(ids, 200);
    var done = 0;
    return batches.reduce(function (p, batch) {
      return p.then(function () {
        return api().database.from(table).delete().in('id', batch).then(function (r) {
          if (r.error) throw new Error(r.error.message || '删除失败');
          done += batch.length;
        });
      });
    }, Promise.resolve(true)).then(function () { return done; });
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

  /* 只读一次配置（不碰门店 / 任务 / 成员）：
     留言板发帖前用它拿云端最新的一份，合并后再整包写回，
     两个人同时留言就不会互相覆盖。 */
  function pullSettings() {
    return api().database.from('app_settings').select('*').eq('key', 'main').then(function (r) {
      if (r.error) throw new Error(r.error.message || '读取配置失败');
      var row = (r.data || [])[0];
      if (!row || !row.value) return null;
      try {
        var saved = JSON.parse(row.value);
        return saved.settings || null;
      } catch (e) {
        return null;
      }
    });
  }

  /* ---------------- 变更票据（只拉变化） ----------------
     以前轮询是「每 4~15 秒把四张表整包拉一遍」，数据一多有几十兆下载，
     而且每次都要等服务端把几千行序列化完。
     2026-10-25 z105：在 app_settings 里单独放一行 key='rev'，值是一个短字符串。
     任何一端写成功就把它换掉（bumpRev）；轮询先读这一行（几十字节），
     值没变 = 谁都没改过，直接跳过整包拉取；变了才真去拉。
     不用改表结构，也不影响 settings 那一行（key='main'）。

     兜底：store.js 那边每 45 秒仍会强制全量拉一次 —— 万一某台机器跑的是
     老版本（写入时不换票据），最多漏 45 秒。 */

  var REV_KEY = 'rev';
  var revTimer = null;
  var revPending = false;
  var revSentAt = 0;
  var lastRev = '';

  function newToken() {
    return String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8);
  }

  /* 合并：连续写（一键发出 10 条物料）只换一次票据，最多 700ms 一次 */
  function bumpRev() {
    revPending = true;
    if (revTimer) return;
    var wait = Math.max(0, 700 - (Date.now() - revSentAt));
    revTimer = setTimeout(function () {
      revTimer = null;
      if (!revPending) return;
      revPending = false;
      revSentAt = Date.now();
      var token = newToken();
      try {
        api().database.from('app_settings')
          .upsert({ key: REV_KEY, value: token, updated_at: new Date().toISOString() })
          .then(function (r) { if (!r.error) lastRev = token; })
          .catch(function () { /* 换不成就退回全量拉，不影响数据正确性 */ });
      } catch (e) { /* 同上 */ }
    }, wait);
  }

  /* 读票据；读不到（还没有这一行 / 老数据 / 没网络）返回 null → 调用方按全量处理 */
  function pullRev() {
    return api().database.from('app_settings').select('value').eq('key', REV_KEY)
      .then(function (r) {
        if (r.error) return null;
        var row = (r.data || [])[0];
        if (!row || row.value == null) return null;
        return String(row.value) || null;
      })
      .catch(function () { return null; });
  }

  function currentRev() { return lastRev; }

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

  /* ---------------- 只写业务数据（门店 / 任务 / 到货） ----------------
     演示门店、追加导入都用它：绝不碰 app_settings（阶段时间线、筹建任务清单、
     物料清单、提前天数、发货设置都在这张表里），也不碰 members。
     ---------------------------------------------------------------- */

  function importBusiness(data, onProgress) {
    return bulkInsert('stores', (data.stores || []).map(MAP.stores.toRow), onProgress)
      .then(function () {
        return bulkInsert('tasks', (data.tasks || []).map(MAP.tasks.toRow), onProgress);
      })
      .then(function () {
        return bulkInsert('arrivals', (data.arrivals || []).map(MAP.arrivals.toRow), onProgress);
      });
  }

  /* ---------------- 只清业务数据（保留配置和成员） ---------------- */

  function wipeBusiness() {
    var db = api().database;
    var tables = ['tasks', 'arrivals', 'stores'];
    return tables.reduce(function (p, t) {
      return p.then(function () {
        return db.from(t).delete().neq('id', '__none__').then(function (r) {
          if (r.error) throw new Error(r.error.message || (t + ' 清空失败'));
        });
      });
    }, Promise.resolve(true));
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

  /* ---------------- 待发送队列（断网改的东西不丢） ----------------
     2026-10-25：以前保存失败只弹一句提示就完了，45 秒后的自动同步会用云端数据
     把这次改动覆盖掉，断网期间做的工作全白做。
     现在失败的操作会存成一条 op，恢复联网后按顺序重放；
     重放之前也会先把这些改动贴回刚拉下来的数据上，眼睛看到的东西不会被同步冲掉。

     op 三种：
       { k:'put',  table, id, row }    —— 行已按 MAP.toRow 转成数据库字段
       { k:'del',  table, id }
       { k:'set',  id:'main', value }  —— app_settings 整包 JSON
     ---------------------------------------------------------------- */

  function applyOp(op) {
    if (!op || !op.k) return Promise.resolve(true);
    var db = api().database;
    if (op.k === 'put') {
      return db.from(op.table).upsert(op.row).then(function (r) {
        if (r.error) throw new Error(r.error.message || '保存失败');
        return true;
      });
    }
    if (op.k === 'del') {
      return db.from(op.table).delete().eq('id', op.id).then(function (r) {
        /* 云端已经没有这一行了（别人删过 / 上一轮其实发出去了）也算成功，
           不然队列会永远卡在这一条上 */
        if (r.error) throw new Error(r.error.message || '删除失败');
        return true;
      });
    }
    if (op.k === 'set') {
      return db.from('app_settings')
        .upsert({ key: 'main', value: op.value, updated_at: new Date().toISOString() })
        .then(function (r) {
          if (r.error) throw new Error(r.error.message || '设置保存失败');
          return true;
        });
    }
    return Promise.resolve(true);
  }

  /* 前端对象 → 数据库字段 / 反过来的两个小工具，给队列和"贴回本地"用 */
  function toRow(table, obj) {
    var m = MAP[table];
    if (!m || !m.toRow) throw new Error('没有这张表的映射：' + table);
    return m.toRow(obj);
  }
  function fromRow(table, row) {
    var m = MAP[table];
    if (!m || !m.fromRow) throw new Error('没有这张表的映射：' + table);
    return m.fromRow(row);
  }

  return {
    config: CFG,
    authMode: AUTH_MODE,
    simpleLogin: simpleLogin,
    simpleCheck: simpleCheck,
    isSimpleAuthed: isSimpleAuthed,
    simpleUser: simpleUser,
    simpleUserName: simpleUserName,
    simpleLogout: simpleLogout,
    memberGate: memberGate,
    verifyMember: verifyMember,
    pullMembers: pullMembers,
    saveAllowNames: saveAllowNames,
    allowNames: allowNames,
    allowMeta: allowMeta,
    allowFresh: allowFresh,
    pullRev: pullRev,
    bumpRev: bumpRev,
    currentRev: currentRev,
    currentSession: currentSession,
    sendCode: sendCode,
    verifyCode: verifyCode,
    logout: logout,
    pullAll: pullAll,
    selectAll: selectAll,
    upsert: upsert,
    upsertMany: upsertMany,
    removeMany: removeMany,
    remove: remove,
    saveSettings: saveSettings,
    pullSettings: pullSettings,
    importAll: importAll,
    importBusiness: importBusiness,
    wipeBusiness: wipeBusiness,
    wipeAll: wipeAll,
    applyOp: applyOp,
    toRow: toRow,
    fromRow: fromRow,
    map: MAP
  };
})();

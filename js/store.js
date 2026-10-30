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

  /* 出厂管理员：系统设置只给这一个姓名 + 他授权的人进（2026-10-25 用户要求）
     存在 settings.access = { owner, allow: [] }，跟着云端同步；
     名字是在登录页填的那个「姓名」，不是账号（账号大家统一 admin）。 */
  var SETTINGS_OWNER = '邢鹏昀';

  /* ================= 本地缓存 ================= */

  /* 写盘合并（2026-10-25 z84）：以前每改一条数据就把整份 state
     JSON.stringify 一次再写进 localStorage —— 连续操作（连点完成、
     批量导入、逐字改备注）时主线程一格一格地卡。内存里的 state 和索引
     是立刻生效的，只有「落盘」推迟 260ms，连续的改动最后只写一次。 */
  var cacheTimer = null;
  var cachedBytes = 0;

  /* 数据版本号：任何一次改动 +1。给「算一次很贵、但输入没变就该复用」的
     派生结果当缓存键（目前是 alerts()：4000 条任务算一遍要 5ms 以上，
     而顶栏每次刷新都会问一次未读数）。 */
  var dataRev = 0;

  function writeCacheNow() {
    if (cacheTimer) { clearTimeout(cacheTimer); cacheTimer = null; }
    try {
      var s = JSON.stringify(state);
      localStorage.setItem(KEY, s);
      /* 体积用「字符数 × 2」估：localStorage 按 UTF-16 算配额，
         这样既贴近 5MB 的真实口径，又不用为了量体积再分配一个 Blob */
      cachedBytes = s.length * 2;
    } catch (e) {
      console.warn('[Store] 本地缓存写入失败', e);
    }
    /* 顺手把「能登进来的人」镜像一份给登录页用（登录发生在数据加载之前，
       那时还读不到 state，只能读这个镜像；见 cloud.js memberGate）。
       名单 = 团队成员 + 管理员 + 系统设置授权名单 —— 后两个也加进来，
       否则把成员配齐之后管理员自己反而登不进去了。
       第二个参数是「这份名单是什么时候跟云端核对过的」：在线时才更新，
       离线写盘不能刷新时间戳，否则名单过期机制就形同虚设。 */
    try {
      if (window.Cloud && window.Cloud.saveAllowNames && state && state.members) {
        var names = state.members.map(function (m) { return m.name; });
        var ac = state.settings && state.settings.access;
        if (ac && ac.owner) names.push(ac.owner);
        if (ac && ac.allow && ac.allow.length) names = names.concat(ac.allow);
        window.Cloud.saveAllowNames(names, online ? Date.now() : 0);
      }
    } catch (e2) { /* 镜像失败不影响主流程 */ }
  }

  function cacheLocal() {
    invalidateIdx();                 /* 索引必须立刻失效，内存结构马上一致 */
    if (cacheTimer) return;          /* 已有排队的写盘，这次改动一并带过去 */
    cacheTimer = setTimeout(writeCacheNow, 260);
  }

  /* 关页面 / 切走之前一定把排队的写盘落下去，顺手把还没发的改动推出去 */
  if (typeof window !== 'undefined' && window.addEventListener) {
    var flushAllOnExit = function () {
      try { flushWrites(); } catch (e) {}
      try { flushSettings(); } catch (e2) {}
      writeCacheNow();
    };
    window.addEventListener('pagehide', flushAllOnExit);
    window.addEventListener('beforeunload', flushAllOnExit);
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
    writeCacheNow();        /* 先把排队的写盘落下去，别拿旧数据做判断 */
    var d = readLocal();
    return !!(d && d.stores && d.stores.length);
  }

  /* ================= 待发送队列（2026-10-25，断网改的东西不丢） =================     以前保存失败只弹一句提示：45 秒后自动同步一拉，这次改动就被云端覆盖了。
     现在失败的操作进 localStorage 队列，恢复联网后按顺序补发；
     补发之前先把队列里的改动贴回刚拉下来的数据上，界面上的东西不会被同步冲掉。
     ---------------------------------------------------------------- */

  var OUTBOX_KEY = KEY + '.outbox';
  var OUTBOX_MAX = 500;          /* 存满就丢最旧的：队列本身不是备份，别把 localStorage 撑爆 */

  function readOutbox() {
    try {
      var raw = localStorage.getItem(OUTBOX_KEY);
      var a = raw ? JSON.parse(raw) : [];
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }

  function writeOutbox(list) {
    try {
      localStorage.setItem(OUTBOX_KEY, JSON.stringify(list));
    } catch (e) { /* 配额满就算了，别影响主流程 */ }
    outboxCount = (list || []).length;
    if (window.App && window.App.refreshChrome) window.App.refreshChrome();
  }

  function opKey(op) {
    return op.k + ':' + op.table + ':' + (op.id || 'main');
  }

  /* 同一条记录只留最后一次操作（后写的赢），不然改 10 次会存 10 条。
     2026-10-25 z104：批量失败时（一次 500 条）以前是「每条都读一遍 outbox → 改 → 写回」，
     读写各 500 次、还要反复 JSON.parse 越来越大的数组。现在整批一次读写。 */
  function enqueueMany(ops) {
    if (!ops || !ops.length) return;
    var list = readOutbox();
    var at = {};
    list.forEach(function (x, i) { at[opKey(x)] = i; });

    ops.forEach(function (op) {
      var k = opKey(op);
      if (at[k] != null) list[at[k]] = op;
      else { list.push(op); at[k] = list.length - 1; }
    });

    if (list.length > OUTBOX_MAX) list = list.slice(list.length - OUTBOX_MAX);
    writeOutbox(list);
    console.warn('[cloud] 保存失败，进入待发送队列，共 ' + list.length + ' 条');
  }

  function enqueue(op) { enqueueMany([op]); }

  /* 顶栏每次刷新都会问「还有几条没发出去」，readOutbox 要 JSON.parse 一遍。
     条数记在内存里，写入时同步更新（别的地方改了 outbox 会走 writeOutbox）。 */
  var outboxCount = -1;

  function pendingCount() {
    if (outboxCount < 0) outboxCount = readOutbox().length;   /* 上次会话留下的队列 */
    return outboxCount;
  }

  /* 浏览器一报"网络回来了"，立刻补发，不用等下一次自动同步 */
  var onlineBound = false;
  function bindOnline() {
    if (onlineBound) return;
    onlineBound = true;
    try {
      window.addEventListener('online', function () { flushOutbox(); });
    } catch (e) {}
  }

  var flushing = false;

  /* 从队首开始发，发到某条卡住就停：剩下的留下次，避免顺序错乱 */
  function flushOutbox() {
    if (flushing) return Promise.resolve(false);
    var list = readOutbox();
    if (!list.length) return Promise.resolve(false);
    flushing = true;

    function run(i) {
      if (i >= list.length) {
        flushing = false;
        writeOutbox([]);
        online = true;
        if (list.length) bumpRev();
        if (window.UI) UI.toast('已恢复云端连接，补发了 ' + list.length + ' 条待发送数据', 'success');
        return Promise.resolve(list.length);
      }
      /* applyOp 不在（比如离线演示页换了假的 Cloud）就当成发失败，别把异常抛到页面外 */
      var send = (window.Cloud && window.Cloud.applyOp)
        ? window.Cloud.applyOp(list[i])
        : Promise.reject(new Error('云服务未加载'));
      return send.then(function () {
        return run(i + 1);
      }, function (e) {
        flushing = false;
        online = false;
        lastError = e.message || String(e);
        writeOutbox(list.slice(i));      /* 这条没发出去，连同后面的都留下 */
        console.error('[cloud] 补发中断', e);
        return Promise.resolve(i);
      });
    }
    return run(0).catch(function () { return 0; });
  }

  /* 把队列里的改动贴到刚拉下来的数据上（拉下来 → 贴 → 才显示）。
     这样断网期间的改动在界面上不会"闪回去"，等补发成功后云端也就有了。 */
  function applyPending(data) {
    var list = readOutbox();
    if (!list.length) return data;

    /* 三趟走完，每张表只扫一遍（2026-10-25 z104）：
       以前是「每个 op 都去数组里线性找一遍」—— 队列里 500 条 × 8000 行 = 400 万次比较，
       刷新 / 自动同步时才贴一次就能卡出一顿。现在先收集删除、过滤一次，
       再按 id 字典贴 put。 */
    var puts = [];
    var delsByTable = {};

    list.forEach(function (op) {
      if (op.k === 'put') { puts.push(op); return; }
      if (op.k === 'del') {
        (delsByTable[op.table] = delsByTable[op.table] || {})[op.id] = 1;
        return;
      }
      if (op.k === 'set') {
        try {
          var s = JSON.parse(op.value);
          if (s && s.settings) data.settings = s.settings;
          if (s && s.alertsRead) data.alertsRead = s.alertsRead;
        } catch (e) { /* 脏数据就跳过 */ }
      }
    });

    Object.keys(delsByTable).forEach(function (table) {
      var arr = data[table];
      if (!Array.isArray(arr)) return;
      var dead = delsByTable[table];
      data[table] = arr.filter(function (x) { return !dead[x.id]; });
    });

    var posOf = {};
    function posFor(table) {
      if (posOf[table]) return posOf[table];
      var m = {};
      var arr = data[table];
      if (Array.isArray(arr)) arr.forEach(function (x, i) { m[x.id] = i; });
      posOf[table] = m;
      return m;
    }

    puts.forEach(function (op) {
      var arr = data[op.table];
      if (!Array.isArray(arr)) return;
      var mapped = window.Cloud.fromRow(op.table, op.row);
      var pos = posFor(op.table);
      var i = pos[mapped.id];
      if (i == null) {
        arr.push(mapped);
        pos[mapped.id] = arr.length - 1;
      } else {
        Object.keys(mapped).forEach(function (k) { arr[i][k] = mapped[k]; });
      }
    });

    return data;
  }

  /* ================= 查询索引（门店多了不能每次遍历全表） =================
     400 家门店 ≈ 8000 条任务，按门店取任务原来是"整表 filter 一遍"，
     一次渲染下来就是几千万次比较。这里建一次 id / 按门店的字典，改动后重建。
     重建触发点：cacheLocal()（每次改动都会走）+ 数组引用变了 + 条数变了，
     双保险，防止某条路径忘了刷新索引。 */

  var idx = null;
  var idxRef = null;

  function buildIdx() {
    idx = { stores: {}, members: {}, tasks: {}, byStore: {} };
    idxRef = { stores: state.stores, tasks: state.tasks, members: state.members };
    state.stores.forEach(function (s) { idx.stores[s.id] = s; });
    state.members.forEach(function (m) { idx.members[m.id] = m; });
    state.tasks.forEach(function (t) {
      idx.tasks[t.id] = t;
      var k = t.storeId || '';
      if (!idx.byStore[k]) idx.byStore[k] = [];
      idx.byStore[k].push(t);
    });
  }

  function invalidateIdx() { idx = null; dataRev += 1; }

  function index() {
    if (!state) return null;
    var stale = !idx ||
      idxRef.stores !== state.stores ||
      idxRef.tasks !== state.tasks ||
      idxRef.members !== state.members;
    if (stale) buildIdx();
    return idx;
  }

  function tasksOf(storeId) {
    var i = index();
    if (!i) return [];
    var l = i.byStore[storeId];
    /* 返回副本：调用方经常 sort()，不能让他们把索引里的数组改了 */
    return l ? l.slice() : [];
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
        /* 出厂阶段一律用内置配色：主题调色（2026-10-24 加深一档）能直接生效，
           不用等用户把旧配色从 settings 里手工换掉；自定义阶段保留自己存的颜色 */
        out.push({
          key: key,
          color: (d && d.color) || (x && x.color) || '#6d7893',
          soft: (d && d.soft) || (x && x.soft) || '#e8ecf6'
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

    /* 二级 map 的 key 要赶在 applyStages 之前取：stageSubs() 按当前 C.STAGES 过滤，
       旧名一换掉就取不到这个 key，二级会被孤立成看不见的旧名 */
    var oldSubs = stageSubs();
    var reSubs = null;
    if (oldSubs[from]) {
      reSubs = {};
      Object.keys(oldSubs).forEach(function (k) {
        reSubs[k === from ? to : k] = oldSubs[k];
      });
    }

    /* 1) 阶段列表（原地换名，位置不变） */
    var list = C.STAGES.map(function (x) {
      return x.key === from
        ? { key: to, color: x.color, soft: x.soft }
        : { key: x.key, color: x.color, soft: x.soft };
    });
    setSetting('stages', list);
    applyStages(list);

    /* 2) 二级 map 的 key（saveStageSubs 的清洗按 C.STAGES 过滤，必须等新名生效后再存） */
    if (reSubs) saveStageSubs(reSubs);

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

    /* 二级定义也要赶在 applyStages 之前取，理由同 renameStage：
       stageSubs() 按 C.STAGES 过滤，阶段一删旧 key 就取不到了 */
    var oldSubs = stageSubs();

    var rest = C.STAGES.filter(function (x) { return x.key !== name; })
      .map(function (x) { return { key: x.key, color: x.color, soft: x.soft }; });
    var fallback = rest[0].key;

    setSetting('stages', rest);
    applyStages(rest);

    /* 二级定义：连 key 一起删掉 */
    if (oldSubs[name]) {
      delete oldSubs[name];
      saveStageSubs(oldSubs);
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
    if (!Array.isArray(data.settings.board)) data.settings.board = [];
    /* 完成 / 重开的回退点：{ 任务id: { from, to, at } }，见 reopenPointOf */
    var rl = data.settings.reopenLog;
    if (!rl || typeof rl !== 'object' || Array.isArray(rl)) data.settings.reopenLog = {};

    /* 完成任务时选的落点二级：{ 任务id: '阶段 / 二级' }，见 gateOfTask */
    var gs = data.settings.taskGateSub;
    if (!gs || typeof gs !== 'object' || Array.isArray(gs)) data.settings.taskGateSub = {};

    /* 自愈：早期版本删任务不清这两个包，云端留下指向已删任务的死键。
       载入时把不存在的任务 id 对应的键丢掉（顺带省流量）。 */
    var taskIds = {};
    data.tasks.forEach(function (t) { taskIds[t.id] = 1; });
    Object.keys(data.settings.reopenLog).forEach(function (k) {
      if (!taskIds[k]) delete data.settings.reopenLog[k];
    });
    Object.keys(data.settings.taskGateSub).forEach(function (k) {
      if (!taskIds[k]) delete data.settings.taskGateSub[k];
    });

    if (!data.settings.brand) data.settings.brand = '门店筹建管理系统';
    if (!data.settings.slogan) data.settings.slogan = '让每一家门店，按时开业！';
    if (data.settings.warnDays == null) data.settings.warnDays = 3;
    if (!data.settings.teamName) data.settings.teamName = '阿蛮团队';

    /* 系统设置的权限：没有就落一份默认（只有 SETTINGS_OWNER 能进） */
    var ac = data.settings.access;
    if (!ac || typeof ac !== 'object' || Array.isArray(ac) || !ac.owner) {
      data.settings.access = {
        owner: SETTINGS_OWNER,
        allow: (ac && Array.isArray(ac.allow)) ? ac.allow.filter(Boolean) : []
      };
    } else if (!Array.isArray(ac.allow)) {
      ac.allow = [];
    }

    /* 天气城市：没设过就先按上海（可在系统设置里改） */
    if (!data.settings.weatherCity) data.settings.weatherCity = '上海';

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

    /* 成员头像（可爱小动物）：存在 settings.memberArt = { 成员id: 'cat' }。
       members 表没有这个字段，也不打算为它加一列 —— settings 本来就是整包上云的
       JSON（留言板 settings.board 也这么存），换台电脑登录一样能看到。
       顺手做两件事：① 清掉指向已删成员的死键；② 把值挂到成员对象上（m.animal），
       各页面直接 UI.avatar(m.name, m.color, size, m.animal) 就行。 */
    var art = data.settings.memberArt;
    if (!art || typeof art !== 'object' || Array.isArray(art)) art = data.settings.memberArt = {};
    var memberIds = {};
    data.members.forEach(function (m) { memberIds[m.id] = 1; });
    Object.keys(art).forEach(function (k) { if (!memberIds[k]) delete art[k]; });
    /* 云端可能被别的版本写进一个不存在的动物 key：一起清掉，别让它传到页面上 */
    var known = (window.UI && UI.ANIMALS) || null;
    data.members.forEach(function (m) {
      var k = art[m.id];
      if (k && known && !known[k]) { delete art[m.id]; k = ''; }
      m.animal = k || '';
    });

    return data;
  }

  /* ================= 云端推送（合并后异步发，不阻塞界面） =================
     2026-10-25 z104：以前「改一条 = 发一次 HTTP」。
       「一键发出」一店 10 条物料 = 10 个请求；批量改阶段 630 条记录 = 630 个请求。
       这么多并发请求既拖慢这次操作的回执，也把后面的拉取挤在队尾。
     现在：改动先进一个 90ms 的合并窗口（同一条记录只留最后一次，后写赢），
     到点按表分组、每 200 行一次 bulk upsert —— 630 条记录从 630 个请求降到 4 个。
     内存里的 state 是立刻改好的，界面不等网络。 */

  var wq = {};              /* key: table|id → { table, id, row } */
  var wqTimer = null;
  var wqSending = 0;        /* 正在飞的批次数：自动同步看到它就先让一让 */
  var WQ_WAIT = 90;

  function wqSize() { return Object.keys(wq).length; }

  /* 有改动还没发出去 —— 自动同步据此避让，别一边上传一边拉回来打架 */
  function wqBusy() { return wqSending > 0 || wqTimer !== null || wqSize() > 0; }

  function scheduleWrites() {
    if (wqTimer) return;
    wqTimer = setTimeout(function () { wqTimer = null; flushWrites(); }, WQ_WAIT);
  }

  function push(table, obj) {
    if (!window.Cloud || !obj || !obj.id) return;
    var row = null;
    try { row = window.Cloud.toRow(table, obj); } catch (e) { row = null; }
    /* 记账的是 id + 行快照：同一个 id 改几次只留最后一版 */
    wq[table + '|' + obj.id] = { k: 'put', table: table, id: obj.id, row: row };
    scheduleWrites();
  }

  function pushMany(table, list) {
    if (!window.Cloud || !list || !list.length) return;
    list.forEach(function (item) { push(table, item); });
  }

  /* 删除也走同一个合并窗口：删一家门店原来要发 1 + 任务数 + 物料数 个 DELETE，
     现在是「按表一批 in(id)」，30 多条记录的级联删除缩成 3 个请求。 */
  function drop(table, id) {
    if (!window.Cloud || !id) return;
    wq[table + '|' + id] = { k: 'del', table: table, id: id };
    scheduleWrites();
  }

  /* 数据写成功了 → 换掉云端票据（app_settings 里 key='rev' 那一行），
     别人的轮询读到新票据就知道该拉了。合并 700ms，连写只换一次。 */
  function bumpRev() {
    try {
      if (window.Cloud && window.Cloud.bumpRev) window.Cloud.bumpRev();
    } catch (e) { /* 换不成只是退回全量拉，不影响数据 */ }
  }

  /* 把合并好的改动按表分组发出去；失败的行照旧进待发送队列。
     返回 Promise<succeededRows>，返回前就可以继续改下一条。 */
  function flushWrites() {
    if (wqTimer) { clearTimeout(wqTimer); wqTimer = null; }
    var items = [];
    Object.keys(wq).forEach(function (k) { items.push(wq[k]); });
    wq = {};
    if (!items.length) return Promise.resolve(0);

    var putsByTable = {};
    var delsByTable = {};
    var bad = 0;
    items.forEach(function (it) {
      if (it.k === 'del') {
        (delsByTable[it.table] = delsByTable[it.table] || []).push(it.id);
        return;
      }
      if (!it.row) { bad += 1; return; }      /* toRow 炸了：这条发不了，别假装发过 */
      (putsByTable[it.table] = putsByTable[it.table] || []).push(it);
    });
    if (bad && window.UI) UI.toast('有 ' + bad + ' 条改动格式不对，没能保存', 'error');

    var jobs = [];

    Object.keys(putsByTable).forEach(function (table) {
      var list = putsByTable[table];
      var rows = list.map(function (x) { return x.row; });
      jobs.push(sendJob(table, list, function () {
        return window.Cloud.upsertMany
          ? window.Cloud.upsertMany(table, rows)
          : Promise.all(list.map(function (x) { return window.Cloud.upsert(table, x.row); }));
      }));
    });

    Object.keys(delsByTable).forEach(function (table) {
      var ids = delsByTable[table];
      jobs.push(sendJob(table, ids.map(function (id) { return { id: id }; }), function () {
        return window.Cloud.removeMany
          ? window.Cloud.removeMany(table, ids)
          : Promise.all(ids.map(function (id) { return window.Cloud.remove(table, id); }));
      }, 'del', ids));
    });

    if (!jobs.length) return Promise.resolve(0);
    return Promise.all(jobs).then(function (rs) {
      return rs.reduce(function (a, b) { return a + b; }, 0);
    });
  }

  /* 一批的发送 / 失败兜底：成功报一次联网，失败逐条进待发送队列 */
  function sendJob(table, list, send, kind, ids) {
    wqSending += 1;
    return Promise.resolve().then(send).then(function () {
      bumpRev();                  /* 数据变了 → 换票据，别人的轮询才会来拉 */
      if (!online) {
        online = true;
        if (window.UI) UI.toast('已恢复云端连接', 'success');
        writeOutbox(readOutbox());   /* 刷一下顶栏的待发送角标 */
      }
      return list.length;
    }).catch(function (e) {
      online = false;
      lastError = e.message || String(e);
      console.error('[cloud] 保存失败', table, list.length, e);
      if (kind === 'del') {
        enqueueMany((ids || list.map(function (x) { return x.id; })).map(function (id) {
          return { k: 'del', table: table, id: id };
        }));
      } else {
        enqueueMany(list.map(function (x) {
          return { k: 'put', table: table, id: x.id, row: x.row };
        }));
      }
      /* 2026-10-27：正式投用后不再弹红色「云端连不上」错误条吓同事 —— 改动静默
         进待发送队列，状态由顶栏「离线模式」横幅 + 待发送角标承担，恢复后自动补发。 */
      return 0;
    }).then(function (n) {
      wqSending -= 1;
      return n;
    });
  }

  /* 设置是整包 JSON（阶段、清单、权限、留言板…都在里面），一次写就是整份。
     以前改 3 个键就整包发 3 次；现在 160ms 内合并成一次，内容没变就不发。 */
  var settingsTimer = null;
  var settingsSent = '';

  function settingsPayload() {
    return JSON.stringify({ settings: state.settings, alertsRead: state.alertsRead || [] });
  }

  function pushSettings() {
    if (!window.Cloud || !state) return;
    if (settingsTimer) clearTimeout(settingsTimer);
    settingsTimer = setTimeout(function () { settingsTimer = null; flushSettings(); }, 160);
  }

  function flushSettings() {
    if (settingsTimer) { clearTimeout(settingsTimer); settingsTimer = null; }
    if (!window.Cloud || !state) return Promise.resolve(false);

    var value = settingsPayload();
    if (value === settingsSent) return Promise.resolve(false);   /* 内容没变，省一次整包写 */

    return window.Cloud.saveSettings(state.settings, state.alertsRead).then(function () {
      settingsSent = value;
      bumpRev();                  /* 配置也是数据，同样换票据 */
      if (!online) {
        online = true;
        if (window.UI) UI.toast('已恢复云端连接', 'success');
      }
      return true;
    }).catch(function (e) {
      online = false;
      console.error('[cloud] 设置保存失败', e);
      enqueue({ k: 'set', table: 'app_settings', id: 'main', value: value });
      /* 同上：设置保存失败也静默进队列，不再弹红色错误条 */
      return false;
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

  /* ================= 加载 =================
     onProgress(done, total) 上传进度（首次迁移上云时用）
     onCached() 本地有上一轮的完整快照时，先把它交给页面画出来 —— 见下面 */

  function load(onProgress, onCached) {
    /* 缓存优先（2026-10-25 z105）
       ------------------------------------------------------------
       以前每次打开都是「等云端把四张表全拉完才画」，几千条数据时要盯着
       加载遮罩好几秒。现在：本机有上一轮的快照就先画出来（几十毫秒），
       云端那份拉回来之后再静默替换 —— 眼睛先看到东西，数据随后对齐。
       代价是极短时间可能看到上一轮的数据（比如别人刚改的那一条），
       所以 app.js 那边会在同步完成后重画一次。 */
    var local0 = readLocal();
    if (local0 && local0.stores && local0.tasks && local0.members && onCached) {
      try {
        state = normalized(JSON.parse(JSON.stringify(local0)));
        alignTaskOwners(false);    /* 缓存里可能是旧版按角色派的活，先对齐再画 */
        onCached();
      } catch (e) {
        state = null;      /* 缓存坏了就当没有，老老实实等云端 */
      }
    }

    /* 顺手把云端当前的变更票据读下来（一个几十字节的请求）：
       全量拉完之后把它记成基线，下一轮轮询才能一眼看出"有没有人改过"。
       先读票据、再拉数据 —— 万一这中间有人写了，票据对不上只是多拉一次，
       不会漏（反过来先拉后读，就可能把这次改动当成"我这轮已经拉过了"）。 */
    var revP = null;
    try {
      revP = window.Cloud.pullRev ? window.Cloud.pullRev() : null;
    } catch (e) { revP = null; }
    if (!revP || !revP.then) revP = Promise.resolve(null);

    return Promise.all([window.Cloud.pullAll(onProgress), revP.catch(function () { return null; })])
      .then(function (both) {
      var data = both[0];
      var revAtStart = both[1];
      online = true;
      bindOnline();
      /* 先把待发送队列里的改动贴回云端数据上，再判断"是不是空系统"：
         否则断网时新建的门店，会因为云端还没收到而被当成空系统处理掉。 */
      applyPending(data);
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
            alignTaskOwners();      /* 搬上来的老数据也按门店负责人收敛一次 */
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
      lastFullAt = Date.now();     /* 这一轮刚全量拉过，增量同步从这一刻算起 */
      syncRev = revAtStart || '';  /* 基线票据：这轮拉的就是「这个票据」对应的数据 */
      /* 任务负责人一律跟门店负责人：老数据是按「售前 / 售后 / 接单」派出去的，
         同一个人的名字下会挂着好几家别人负责的店，进系统先对齐一次。
         对齐后第二次就是 0 条，不会反复写云端。 */
      alignTaskOwners();
      cacheLocal();
      snapshotSettings('load');   /* 每次进系统都留一份配置快照，误删可找回 */
      /* 刚才贴回来的改动，趁现在把队列补发掉 */
      flushOutbox();
      return { imported: 0, seeded: false };
    }).catch(function (e) {
      /* 网络失败 → 退回本地缓存，离线可用 */
      online = false;
      lastError = e.message || String(e);
      var local = readLocal();
      if (local) {
        state = normalized(local);
        alignTaskOwners(false);   /* 离线只纠正内存，不往队列里灌东西 */
        return { imported: 0, seeded: false, offline: true };
      }
      throw e;
    });
  }

  /* ================= 自动同步（实时拉取别人的改动） ================= */

  /* 同步的共享状态：startAutoSync 启动后，轮询和「切回标签/获得焦点」共用一个 once */
  var syncOnChange = null;
  var syncLastStamp = '';
  var syncBusy = false;
  var syncBound = false;

  /* 增量同步（2026-10-25 z105）
     ------------------------------------------------------------
     以前每一轮都把四张表整包拉一遍；现在先问一次「变更票据」（app_settings
     里 key='rev' 的一行，几十字节）：
       · 票据没变 → 谁都没改过 → 这一轮直接跳过，一个字节的业务数据都不下
       · 票据变了 / 读不到 → 真去拉一次全量
     票据由写成功的那一端换掉（bumpRev），所以多人协作也是准的。
     兜底：距上一次全量超过 FULL_EVERY 就强制拉一次 —— 万一有台机器跑的是
     老版本（写数据不换票据），最多漏这么久。 */
  var syncRev = '';
  var lastFullAt = 0;
  var FULL_EVERY = 45000;
  var syncSkipped = 0;      /* 跳过次数：给「省了多少次请求」留个可观测的数 */

  /* 云端答得上话了：把「离线」标记翻回来、补发队列、重画一次摘掉横幅。
     2026-10-27 修复：以前一次保存失败把 online 翻成 false 后，只有
     「浏览器报网络恢复」或「下一次保存成功」才会翻回来 —— 网络抖一下
     （代理 / DNS 瞬断，浏览器不报 online 事件），红横幅就一直挂着。 */
  function markCloudUp() {
    if (online) return;
    online = true;
    flushOutbox();                      /* 断网期间攒的改动，现在就补发 */
    if (syncOnChange) syncOnChange();   /* 重画，离线横幅消失 */
  }

  /* 这次要不要真拉：返回 Promise<boolean> */
  function needPull() {
    if (!lastFullAt || Date.now() - lastFullAt > FULL_EVERY) return Promise.resolve(true);
    if (!window.Cloud || !window.Cloud.pullRev) return Promise.resolve(true);

    var p;
    try { p = window.Cloud.pullRev(); } catch (e) { return Promise.resolve(true); }
    return p.then(function (rev) {
      markCloudUp();                                     /* 票据都读得到 = 云端通 */
      if (!rev) return true;                             /* 读不到票据：保守全量 */
      if (rev === syncRev) return false;                 /* 票据没变：谁都没改过 */
      /* 票据变了，但正是我们自己刚才写出去那份（写完换的）→ 本地已经有了，不用拉 */
      var mine = '';
      try { mine = (window.Cloud.currentRev && window.Cloud.currentRev()) || ''; } catch (e) { mine = ''; }
      if (mine && rev === mine) { syncRev = rev; return false; }
      syncRev = rev;
      return true;
    }).catch(function () { return true; });
  }

  function syncOnce() {
    if (syncBusy) return;                                   /* 上一轮还没回来，别叠着发 */
    if (document.hidden) return;                            /* 后台标签省电 */
    if (document.querySelector('.modal-mask')) return;      /* 有弹窗时别打断 */
    /* 本地还有改动没发出去：先让它发完，别一边上传一边把旧数据拉回来
       （拉回来会让刚点的操作闪一下，还白占一条带宽） */
    if (wqBusy()) return;
    syncBusy = true;

    needPull().then(function (yes) {
      if (!yes) { syncSkipped += 1; return null; }          /* 票据没变：这一轮不拉 */
      var p;
      try { p = window.Cloud.pullAll(); }
      catch (e) { return null; }                            /* 发起就抛错：别卡死 */
      if (!p || !p.then) return null;
      return p.then(function (data) {
        lastFullAt = Date.now();
        markCloudUp();               /* 全量拉成功 = 云端通，顺手摘离线横幅 */
        applyPending(data);          /* 待发送的改动先贴回去，别被同步冲掉 */
        var next = normalized(data);
        var nextStamp = fingerprintOf(next);
        if (nextStamp === syncLastStamp) return;
        syncLastStamp = nextStamp;
        state = next;
        alignTaskOwners();           /* 别人还用旧版按角色派活时，拉回来也对齐一次 */
        cacheLocal();
        if (syncOnChange) syncOnChange();
      });
    }).catch(function () { /* 静默失败，下个周期再试 */ })
      .then(function () { syncBusy = false; });
  }

  /* 轮询间隔按数据量自适应（2026-10-25 z104）
     ------------------------------------------------------------
     以前是固定 3 秒把四张表整包拉一遍。数据一多（400 家店 / 8000 条任务），
     每分钟几十兆下载，每个操作都排在自己的同步请求后面，越用越卡。
     现在：小数据 4 秒、中等 8 秒、大数据 15 秒，再加 ±10% 抖动，
     免得几个同事的标签页同时打点。切回标签 / 重新聚焦仍会立刻拉一次。 */
  function pickInterval() {
    var s = state || {};
    /* 用行数估体量就行，别为了估算去 JSON.stringify 整包 */
    var n = (s.tasks || []).length + (s.stores || []).length * 6 + (s.arrivals || []).length * 2;
    var base = n < 1200 ? 4000 : (n < 8000 ? 8000 : 15000);
    return Math.round(base * (0.9 + Math.random() * 0.2));
  }

  var syncInterval = 0;
  var syncTick = null;

  function nextSyncTick() {
    if (syncTick) { clearTimeout(syncTick); syncTick = null; }
    if (!syncOnChange) return;                    /* 已经被 stopAutoSync 停掉了 */
    syncTick = setTimeout(function () {
      syncOnce();
      nextSyncTick();
    }, syncInterval || pickInterval());
  }

  function startAutoSync(intervalMs, onChange) {
    stopAutoSync();
    syncOnChange = onChange || null;
    syncInterval = intervalMs || 0;               /* 0 / 不传 = 按数据量自适应 */
    syncLastStamp = fingerprintOf(state);

    /* 切回这个标签 / 重新获得焦点，立刻拉一次 —— 不用等下一个轮询周期 */
    if (!syncBound) {
      syncBound = true;
      var onWake = function () { if (!document.hidden) syncOnce(); };
      document.addEventListener('visibilitychange', onWake);
      window.addEventListener('focus', onWake);
    }

    nextSyncTick();
    syncOnce();   /* 启动后先立刻拉一次 */
  }

  function stopAutoSync() {
    if (syncTick) { clearTimeout(syncTick); syncTick = null; }
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = null;
    syncOnChange = null;
  }

  /* 内容指纹：把四张业务表 + 配置整包算个 hash，任何一处改动（改备注、改状态、
     改物料到货时间、加成员……）都会变，不像以前只数条数、改内容就漏了。
     每张表按 id 排序再序列化，保证顺序不同也算成同一个。 */
  function fingerprintOf(s) {
    s = s || {};
    var tables = ['stores', 'tasks', 'members', 'arrivals'];
    var parts = [];
    tables.forEach(function (t) {
      var list = (s[t] || []).slice().sort(function (a, b) {
        var x = String(a.id), y = String(b.id);
        return x < y ? -1 : x > y ? 1 : 0;
      });
      parts.push(t + ':' + JSON.stringify(list));
    });
    parts.push('settings:' + JSON.stringify(s.settings || {}));
    parts.push('alertsRead:' + JSON.stringify(s.alertsRead || []));

    var str = parts.join('|');
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return h;
  }

  /* ================= 查询辅助 ================= */

  function getState() { return state; }
  function isOnline() { return online; }
  function getLastError() { return lastError; }

  function storeById(id) {
    var i = index();
    if (!i) return null;
    return i.stores[id] || null;
  }

  function memberById(id) {
    var i = index();
    if (!i) return null;
    return i.members[id] || null;
  }

  function taskById(id) {
    var i = index();
    if (!i) return null;
    return i.tasks[id] || null;
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
       是我们的原因 → 点「完成」把它做掉；
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
    /* z137：不再截断成 5 条，全部返回；首页卡片里固定显示 5 条、超出滚动 */
    focus = focus.slice(0, 30);

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

  /* 提醒清单的缓存（2026-10-25 z104）
     ------------------------------------------------------------
     顶栏每次刷新都会问「有几条未读」，答案是 alerts() 里现算的：
     要把全部任务过一遍 classify / suggestDateOf / daysLeftOf，再把全部门店
     算一遍进度 —— 4000 条任务就是 5ms 起步，点一下按钮、改一个字都要付一次。
     现在按「数据版本号 + 今天」缓存：数据没变、日期没变，直接给上次那份。
     任何改动都会走 cacheLocal() → invalidateIdx() → dataRev + 1，
     所以不会吃到旧结果；跨天（今天的口径变了）自动作废。 */
  var alertsCache = null;

  function alerts() {
    var t0 = U.today();
    if (alertsCache && alertsCache.rev === dataRev && alertsCache.day === t0) {
      return alertsCache.list;
    }
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
      var pctTxt = pr.taskTotal
        ? '进度 ' + pr.pct + '%（任务已完成 ' + pr.done + '/' + pr.taskTotal + ' 条）'
        : '进度 0%（还没有筹建任务）';

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

    var order = { danger: 0, high: 1, warn: 2 };
    list.sort(function (a, b) {
      if (a.read !== b.read) return a.read ? 1 : -1;
      return (order[a.level] || 9) - (order[b.level] || 9);
    });
    alertsCache = { rev: dataRev, day: t0, list: list };
    return list;
  }

  /* 已读 / 未读是挂在 settings.alertsRead 上的，不走 cacheLocal，
     所以这两处要手动把版本号推进一格，否则顶栏角标不会变。 */
  function bumpAlerts() { dataRev += 1; alertsCache = null; }

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
         显示用的百分比统一由 storeProgress() 按「已完成任务 / 任务总计」现算 */
      progress: U.clamp(Number(data.progress) || 0, 0, 100),
      ownerId: data.ownerId || (state.members[0] || {}).id,
      /* 开业日允许空：没定就先不填，任务只显示「开业前 N 天」，不硬算日期 */
      openDate: data.openDate || '',
      /* 建档提交时间：这条门店记录进系统的时间，选填，和开业日分开 */
      buildDate: data.buildDate || '',
      address: data.address || '',
      remark: data.remark || '',
      createdAt: t0
    };
    state.stores.unshift(store);
    push('stores', store);

    var tpls = templates();
    if (data.autoTasks !== false && tpls.length) {
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
          /* 一律派给门店负责人：售前 / 售后 / 接单只是人事称谓，不参与派单
             （2026-10-27 口径变更，原来按 tpl.role 找人，会出现「别人负责的店，
             活却挂在我名下」） */
          assigneeId: store.ownerId,
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
    var oldOwner = s.ownerId;
    Object.keys(patch).forEach(function (k) { s[k] = patch[k]; });
    if (patch.progress != null) s.progress = U.clamp(Number(patch.progress) || 0, 0, 100);
    push('stores', s);
    cacheLocal();

    /* 换负责人：这家店的任务全部跟着转过去（含已完成的记录）。
       2026-10-27 口径变更：任务的负责人只有一个来源 —— 门店负责人。
       谁负责这家店，这店的活就全在谁名下；否则换了人，活还挂着原来的名字，
       团队页的待办数就成了假的。 */
    if (patch.ownerId != null && patch.ownerId !== oldOwner) {
      reassignStoreTasks(id, patch.ownerId);
    }

    /* 开业日变了（含清空）：这家店的任务建议完成日全部重算 */
    if (patch.openDate != null && patch.openDate !== oldOpen) resyncTaskDates(id);
    return s;
  }

  /* 这家店有几条任务要跟着负责人走（换人前用它说清楚会转几条）。
     exceptOwnerId：已经在这个人名下的不算，避免重复计数、提示数字虚高 */
  function taskCountOfStore(storeId, exceptOwnerId) {
    return state.tasks.filter(function (t) {
      return t.storeId === storeId &&
        (!exceptOwnerId || t.assigneeId !== exceptOwnerId);
    }).length;
  }

  /* 把一家店的任务全部转给新负责人，返回实际转了几条。
     含已完成的：口径是「这店的活归这店的人」，不按历史归属分裂，
     否则团队页会同时出现「新负责人的待办」和「旧负责人名下的这家店」。 */
  function reassignStoreTasks(storeId, newOwnerId) {
    if (!storeId || !newOwnerId) return 0;
    var hit = state.tasks.filter(function (t) {
      return t.storeId === storeId && t.assigneeId !== newOwnerId;
    });
    if (!hit.length) return 0;
    hit.forEach(function (t) { t.assigneeId = newOwnerId; });
    pushMany('tasks', hit);
    cacheLocal();
    return hit.length;
  }

  /* 任务负责人和门店负责人对齐（一次性收敛历史数据）。
     以前按「售前 / 售后 / 接单」角色派活，同一个人的名下会挂着好几家别人负责的店。
     口径改成「任务一律跟门店负责人」之后，加载完对齐一遍，界面上立刻自洽；
     对齐后第二次就是 0 条，不会反复写云端。
     persist=false：只改内存不写云端（离线兜底路径用，别在断网时往队列里灌东西） */
  function alignTaskOwners(persist) {
    if (!state) return 0;
    var owner = {};
    state.stores.forEach(function (s) { owner[s.id] = s.ownerId || ''; });
    var hit = [];
    state.tasks.forEach(function (t) {
      var want = owner[t.storeId];
      if (want && t.assigneeId !== want) { t.assigneeId = want; hit.push(t); }
    });
    if (!hit.length) return 0;
    if (persist !== false) pushMany('tasks', hit);
    if (persist !== false) cacheLocal();
    return hit.length;
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

    /* 这家店的任务在 settings 里留下的键也一起清：
       reopenLog（回退点）/ taskGateSub（落点二级）/ taskBefore（开业前天数）/ taskSnooze（延后天数）。
       不清的话删完门店 settings 里会挂一堆指向不存在任务的死键（2026-10-25 发现）。 */
    var s2 = state.settings || {};
    var dirty = false;
    taskIds.forEach(function (tid) {
      ['reopenLog', 'taskGateSub', 'taskBefore', 'taskSnooze'].forEach(function (k) {
        if (s2[k] && Object.prototype.hasOwnProperty.call(s2[k], tid)) {
          delete s2[k][tid];
          dirty = true;
        }
      });
    });
    if (dirty) pushSettings();

    cacheLocal();
  }

  /* ================= 任务 CRUD ================= */

  /* 这家店的负责人是谁（任务负责人的唯一来源） */
  function ownerOfStoreId(storeId) {
    var s = storeById(storeId);
    return s ? (s.ownerId || '') : '';
  }

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
      assigneeId: ownerOfStoreId(data.storeId) || data.assigneeId || (state.members[0] || {}).id,
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

    /* 负责人不单独指派：一律跟着所属门店的负责人走。
       任务挪到别的门店 → 负责人跟着换成那家店的负责人。 */
    patch.assigneeId = ownerOfStoreId(patch.storeId != null ? patch.storeId : t.storeId) ||
      patch.assigneeId || t.assigneeId;

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

  /* 注：门店进度条的口径是「已完成任务 / 任务总计」，由 storeProgress() 现算，
     不写回 stores.progress。云端那一列保留不动，只是不参与显示。 */

  function removeTask(id) {
    state.tasks = state.tasks.filter(function (t) { return t.id !== id; });

    /* 顺手清掉这条任务在设置里留下的「开业前天数 / 延后天数」，
       不然任务删了、设置里的键还留着，越积越多 */
    var s = state.settings || {};
    var touched = false;
    ['taskBefore', 'taskSnooze'].forEach(function (key) {
      if (s[key] && s[key][id] != null) { delete s[key][id]; touched = true; }
    });
    if (s.reopenLog && s.reopenLog[id]) { delete s.reopenLog[id]; touched = true; }
    if (s.taskGateSub && s.taskGateSub[id]) { delete s.taskGateSub[id]; touched = true; }
    if (touched) pushSettings();

    drop('tasks', id);
    cacheLocal();
  }

  /* ================= 成员 CRUD ================= */

  /* 成员头像（动物 key）：存在 settings.memberArt，不动 members 表 */
  function artMap() {
    state.settings = state.settings || {};
    var m = state.settings.memberArt;
    if (!m || typeof m !== 'object' || Array.isArray(m)) m = state.settings.memberArt = {};
    return m;
  }

  function memberArt(id) {
    return (id && artMap()[id]) || '';
  }

  function setMemberArt(id, key) {
    if (!id) return '';
    /* 只收 UI 里真有的那 12 只：别的版本写进来的怪 key 一律当「不用动物」，
       免得各页面各 fallback 一套，最后同一个人的头像在四处长得不一样 */
    if (key && !(window.UI && UI.ANIMALS && UI.ANIMALS[key])) key = '';
    var map = artMap();
    if (key) map[id] = key; else delete map[id];
    state.settings.memberArt = map;
    pushSettings();
    cacheLocal();
    var m = memberById(id);
    if (m) m.animal = key || '';
    /* 顶栏那颗头像跟着一起换：它在页面外壳里，不参与页面重绘，
       不主动通知就得等下一次整页刷新才更新（用户看到的就是「换了没生效」）。 */
    if (window.App && window.App.refreshChrome) window.App.refreshChrome();
    return key || '';
  }

  function addMember(data) {
    var m = {
      id: U.uid('user'),
      name: (data.name || '新成员').trim(),
      role: data.role || '门店统筹',
      color: data.color || '#3f6bf5',
      animal: data.animal || ''      /* 只是内存里的展示值，真正存的是 settings.memberArt */
    };
    state.members.push(m);
    push('members', m);
    if (m.animal) setMemberArt(m.id, m.animal);
    cacheLocal();
    return m;
  }

  function updateMember(id, patch) {
    var m = memberById(id);
    if (!m) return null;
    var animal = patch && Object.prototype.hasOwnProperty.call(patch, 'animal') ? patch.animal : null;
    var rest = {};
    Object.keys(patch || {}).forEach(function (k) { if (k !== 'animal') rest[k] = patch[k]; });
    Object.keys(rest).forEach(function (k) { m[k] = rest[k]; });
    if (Object.keys(rest).length) push('members', m);
    if (animal !== null) setMemberArt(id, animal);
    cacheLocal();
    return m;
  }

  /* 返回 Promise：云端删成功后才从本地移除，避免被自动同步拉回来 */
  function removeMember(id) {
    return window.Cloud.remove('members', id).then(function () {
      state.members = state.members.filter(function (m) { return m.id !== id; });

      /* 头像顺手一起清掉，别在配置里留孤儿键 */
      if (artMap()[id]) {
        delete artMap()[id];
        pushSettings();
      }

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

  /* ================= 留言板 =================
     存在 settings.board，跟 app_settings 整包上云（不动表结构）。
     每条：{ id, text, authorId, authorName, color, at }
     authorName / color 存的是当时的快照 —— 成员被删了，历史留言照样显示得出来。

     并发：发帖 / 删帖前先只读一次 app_settings，把别人这段时间留的言并进来
     再整包写回，两个人同时留言不会互相覆盖。
     --------------------------------------------------------- */

  var BOARD_MAX = 500;   /* 最多留 500 条，超了从最老的开始丢，防止配置包无限变大 */

  function boardNotes() {
    var list = state && state.settings && state.settings.board;
    if (!Array.isArray(list)) return [];
    return list.slice().sort(function (a, b) {
      var ta = String((a && a.at) || ''), tb = String((b && b.at) || '');
      if (ta === tb) return 0;
      return ta < tb ? 1 : -1;
    });
  }

  /* 把云端那一份并回本地（按 id 去重，本地已有的以本地为准） */
  function mergeBoardNotes(remote) {
    if (!remote || !Array.isArray(remote.board)) return;
    if (!Array.isArray(state.settings.board)) state.settings.board = [];
    var seen = {};
    state.settings.board.forEach(function (n) { if (n && n.id) seen[n.id] = 1; });
    remote.board.forEach(function (n) {
      if (n && n.id && !seen[n.id]) { state.settings.board.push(n); seen[n.id] = 1; }
    });
    cacheLocal();
  }

  /* 留言列表在云端那份里取最新（autoSync 靠 stamp 里的条数 + 最后时间发现新留言） */
  function addBoardNote(data) {
    var note = {
      id: U.uid('note'),
      text: String((data && data.text) || '').replace(/\s+$/, '').slice(0, 800),
      authorId: (data && data.authorId) || '',
      authorName: String((data && data.authorName) || '').trim().slice(0, 20) || '匿名',
      color: (data && data.color) || '#3f6bf5',
      at: new Date().toISOString()
    };
    if (!note.text.trim()) return { ok: false, error: '写点什么再发吧' };

    if (!Array.isArray(state.settings.board)) state.settings.board = [];
    state.settings.board.push(note);
    if (state.settings.board.length > BOARD_MAX) {
      state.settings.board = boardNotes().slice(0, BOARD_MAX);
    }
    cacheLocal();

    if (window.Cloud && window.Cloud.pullSettings) {
      window.Cloud.pullSettings().then(function (remote) {
        mergeBoardNotes(remote);
        pushSettings();
      }).catch(function () { pushSettings(); });
    } else {
      pushSettings();
    }
    return { ok: true, note: note };
  }

  function removeBoardNote(id) {
    var target = boardNotes().filter(function (n) { return n.id === id; })[0];
    if (!target) return Promise.resolve(false);

    state.settings.board = (state.settings.board || []).filter(function (n) { return n.id !== id; });
    cacheLocal();

    if (window.Cloud && window.Cloud.pullSettings) {
      return window.Cloud.pullSettings().then(function (remote) {
        if (remote && Array.isArray(remote.board)) {
          mergeBoardNotes({ board: remote.board.filter(function (n) { return n.id !== id; }) });
        }
        pushSettings();
        return true;
      }).catch(function () { pushSettings(); return true; });
    }
    pushSettings();
    return Promise.resolve(true);
  }

  /* ================= 完成 / 重开：记下完成前的阶段 =================
     点「完成」有可能把门店往前推一格，之后点「重开」得能退回原来那一格。
     任务表没有多余的列可以放这个，所以存在 settings.reopenLog：

       { 任务id: { from: '阶段 / 二级', to: '阶段 / 二级', at: '2026-10-25T…' } }

     from = 完成之前门店停在哪，to = 这条任务把门店推到了哪。
     重开时只有当门店还停在 to 时才回退（说明这期间没人再往前推），
     否则阶段原地不动 —— 免得把别人后来推进的进度一起抹掉。
     ---------------------------------------------------------------- */

  var REOPEN_MAX = 300;

  function reopenLog() {
    var map = state && state.settings && state.settings.reopenLog;
    if (!map || typeof map !== 'object' || Array.isArray(map)) return {};
    return map;
  }

  function reopenPointOf(taskId) {
    var p = reopenLog()[taskId];
    return (p && typeof p === 'object' && (p.from || p.to)) ? p : null;
  }

  function setReopenPoint(taskId, from, to) {
    if (!state.settings) state.settings = {};
    var map = reopenLog();
    map[taskId] = { from: from || '', to: to || '', at: new Date().toISOString() };

    /* 配置包别无限长大：超过 300 条从最老的开始丢 */
    var keys = Object.keys(map);
    if (keys.length > REOPEN_MAX) {
      keys.sort(function (a, b) { return String(map[a] && map[a].at) < String(map[b] && map[b].at) ? -1 : 1; });
      keys.slice(0, keys.length - REOPEN_MAX).forEach(function (k) { delete map[k]; });
    }

    state.settings.reopenLog = map;
    pushSettings();
    cacheLocal();
  }

  function clearReopenPoint(taskId) {
    var map = reopenLog();
    if (!map[taskId]) return;
    delete map[taskId];
    state.settings.reopenLog = map;
    pushSettings();
    cacheLocal();
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
     一家店一条发货记录：「发了没发」+ 「先发」标记 + 备注。
     2026-10-24 用户要求「不安排发货，通知就行了」：date（计划发货日）整套退役，
     入口全删、旧值不读不迁移（字段还留在 settings.ship 里，无入口即无新值）。
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
      var openLeft = s.openDate ? U.diffDays(t0, s.openDate) : null;

      /* ★ 发没发，以**物料本身**为准，不认 settings 里那个老标记：
           只要这家店还有一条物料没通知，就还是「一键发出」（待发出）；
           物料全部通知过了才算「已发出」。
         2026-10-25 用户报的问题：物料列明明还有一堆没通知，右边却显示「已发出」——
         因为标记是当初点按钮时写死的，后来新加了物料 / 有人把某条改回待通知，
         标记没跟着退回，两边就打架了。现在改成实时算，两边永远一致。
         零物料的店没东西可算，仍按标记走（允许手动标一下）。 */
      var shipped = list.length ? pend.length === 0 : info.status === 'sent';

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
        openLeft: openLeft,
        openDate: s.openDate || '',
        /* 到货这块只有两件事：漏通知（过了到货日还没通知）/ 7 天内到该通知供应商。
           两者按门店互斥：只要这家有过期没通知的物料，就整家算「漏通知」，
           不再重复算进「该通知」—— 否则同一家会同时出现在两个分类里，
           两个数一加比实际要通知的门店还多，看着就是错的（2026-10-25 修）。 */
        arrLate: lateArr > 0,
        needNotify: lateArr === 0 && notify > 0
      };
    });

    /* 排序：待发出在前 → 已发出沉到底 → 先发置顶（同一组内）→ 手动顺序 → 名字
       2026-10-25 用户确认：点「一件发出」后这家店沉到表格底部，
       取消后回到待发出那一组，位置按先发 / 手动顺序重新排。 */
    rows.sort(function (a, b) {
      if (a.shipped !== b.shipped) return a.shipped ? 1 : -1;
      if (a.pin !== b.pin) return a.pin ? -1 : 1;
      if (a.seq != null && b.seq != null && a.seq !== b.seq) return a.seq - b.seq;
      if ((a.seq != null) !== (b.seq != null)) return a.seq != null ? -1 : 1;
      return String(a.name).localeCompare(String(b.name), 'zh');
    });

    return rows;
  }

  function shipStats(rows) {
    rows = rows || shipRows();
    var s = {
      all: rows.length, todo: 0, sent: 0, arrLate: 0, notify: 0
    };
    rows.forEach(function (r) {
      if (r.shipped) s.sent += 1;
      else {
        s.todo += 1;
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

  /* 「一件发出」：整店一键 —— 不做「在途 / 到店」那些中间态，也不登记任何日期。
     2026-10-25 用户口径：
       点成「已发出」= 这家店所有物料都算通知过供应商了（一次性办完，行沉到底）；
       再点一次取消   = 这家店所有物料全部退回「待通知」。
     物料通知状态本来就是 arrivals.status（pending / notified），这里改的是同一条记录，
     不新增字段、不动表结构；sentAt 仍由 setShip 记个日期，只留痕、不展示、不参与计算。

     2026-10-25 修：翻转方向以**当前显示的状态**为准（= 还有没有未通知的物料），
     不再看 settings 里那个老标记 —— 否则会出现「物料还有一堆没通知，按一下却被当成取消」。
     顺带把老标记同步成新状态，数据自己就修正回来了。 */
  function toggleShipSent(storeId) {
    if (!storeId) return null;

    var list = state.arrivals.filter(function (a) { return a.storeId === storeId; });
    var pend = list.filter(function (a) { return !arrNotified(a); });
    var isSent = list.length ? pend.length === 0 : shipOf(storeId).status === 'sent';

    var next = isSent ? 'todo' : 'sent';
    var want = next === 'sent' ? 'notified' : 'pending';
    var changed = 0;

    state.arrivals.forEach(function (a) {
      if (a.storeId !== storeId) return;
      if (a.status === want) return;
      a.status = want;
      push('arrivals', a);
      changed += 1;
    });

    if (changed) cacheLocal();
    setShip(storeId, { status: next });
    return { status: next, changed: changed };
  }

  /* ================= 设置 / 导入导出 ================= */

  function setSetting(key, value) {
    state.settings[key] = value;
    pushSettings();
    cacheLocal();
  }

  /* ================= 系统设置权限 =================
     谁看得到「系统设置」：管理员 + 授权名单。
     身份认的是登录页填的姓名（账号统一 admin，区分不了人）。 */

  function accessOf() {
    var a = (state && state.settings) ? state.settings.access : null;
    if (!a || typeof a !== 'object' || Array.isArray(a)) a = {};
    return {
      owner: String(a.owner || SETTINGS_OWNER).trim(),
      allow: Array.isArray(a.allow) ? a.allow.map(function (x) { return String(x).trim(); }).filter(Boolean) : []
    };
  }

  function canSettings(name) {
    var nm = String(name || '').trim();
    if (!nm) return false;
    var a = accessOf();
    return nm === a.owner || a.allow.indexOf(nm) >= 0;
  }

  function isSettingsOwner(name) {
    return String(name || '').trim() === accessOf().owner;
  }

  /* 当前登录人还在不在名单里（2026-10-25 z105）
     ------------------------------------------------------------
     登录时校验过一次就完事的话，人被移出团队之后，那台还开着的页面
     照样能看能改（数据层没有任何身份概念）。这里给 app.js 一个复核入口：
     数据刚从云端拉下来之后、以及每轮同步之后，用它再问一遍。
     返回 { ok:false, msg } 就该把人请回登录页。 */
  function meAllowed(name) {
    var nm = String(name == null ? '' : name).replace(/\s+/g, ' ').trim();
    if (!nm) return { ok: false, msg: '登录信息丢了，请重新登录' };
    if (!state) return { ok: true, skipped: true };      /* 还没数据：别误伤 */
    /* 团队一个人都没有 = 系统还没初始化，这时候无从判断，也不该把人踢出去
       （和登录页「空系统先放行」是同一个口径） */
    if (!(state.members || []).length) return { ok: true, skipped: true };

    var names = (state.members || []).map(function (m) { return m.name; });
    var ac = accessOf();
    names.push(ac.owner);
    names = names.concat(ac.allow);
    for (var i = 0; i < names.length; i++) {
      var x = String(names[i] == null ? '' : names[i]).replace(/\s+/g, ' ').trim();
      if (x === nm) return { ok: true };
    }
    return { ok: false, msg: '「' + nm + '」已不在团队成员名单里' };
  }

  /* 加 / 减授权名单；管理员换人也能改（owner 默认为出厂值） */
  function grantSettings(name) {
    var nm = String(name || '').trim();
    if (!nm) return false;
    var a = accessOf();
    if (nm === a.owner || a.allow.indexOf(nm) >= 0) return false;
    a.allow.push(nm);
    setSetting('access', a);
    return true;
  }

  function revokeSettings(name) {
    var nm = String(name || '').trim();
    var a = accessOf();
    var i = a.allow.indexOf(nm);
    if (i < 0) return false;
    a.allow.splice(i, 1);
    setSetting('access', a);
    return true;
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
        /* id 是给「改完清单同步到已建门店」用的：靠它认出「这一条被改名了」，
           而不是当成「删一条 + 新加一条」。老清单没有 id，第一次保存时补上 */
        id: t.id || U.uid('tpl'),
        title: String(t.title || '').trim(),
        stage: t.stage || '',
        before: Math.max(0, Number(t.before) || 0),
        /* role 留着只为兼容老数据，不参与派单（任务一律派给门店负责人） */
        role: t.role || ''
      };
    }).filter(function (t) { return !!t.title; });

    /* 空数组也照存：这是"我就是要空清单"的明确意图，不是"没设置过" */
    setSetting('taskTemplates', clean);
    return templates();
  }

  /* 筹建任务清单改了 → 把差异同步到「已经建好的门店」（2026-10-27 用户要求）。
     以前改清单只对以后新建的门店生效，老门店还挂着旧任务，两头对不上。
     三类差异这样处理：
       · 新加一条      → 每家店补派一条（同名已存在就跳过，不会重复）
       · 改名 / 改阶段 / 改「开业前 N 天」
                       → 该店同名任务跟着改；日期只重算未完成的（已完成的历史日期不动）
       · 从清单里删一条 → 已有门店的任务不删（删了会连已完成的记录一起没），只是以后不再派
     返回 { stores, added, renamed, restaged, redated }，数字给界面报账用 */
  function syncTemplatesToStores(oldList, newList) {
    var out = { stores: 0, added: 0, renamed: 0, restaged: 0, redated: 0 };
    if (!state.stores.length) return out;

    /* 老清单 → 新清单配对：先认 id，老数据没 id 就退回标题 */
    var olds = (oldList || []).slice();
    var used = {};
    function pairOf(nt) {
      var i;
      for (i = 0; i < olds.length; i++) {
        if (!used[i] && nt.id && olds[i].id === nt.id) { used[i] = true; return olds[i]; }
      }
      for (i = 0; i < olds.length; i++) {
        if (!used[i] && String(olds[i].title || '').trim() === String(nt.title || '').trim()) {
          used[i] = true;
          return olds[i];
        }
      }
      return null;
    }
    var pairs = (newList || []).map(function (nt) {
      return { old: pairOf(nt), now: nt };
    });

    var createdTasks = [];
    var changedTasks = [];
    var beforePairs = [];     /* 天数写回 settings（云端 tasks 表没这一列） */
    var redateTargets = [];   /* 写完天数之后再算日期，否则 suggestDateOf 拿到的还是旧值 */
    var storesHit = {};

    state.stores.forEach(function (store) {
      var exist = {};
      state.tasks.forEach(function (t) { if (t.storeId === store.id) exist[t.title] = true; });

      pairs.forEach(function (p) {
        var nt = p.now;
        var ot = p.old;
        var title = String(nt.title || '').trim();
        if (!title) return;

        /* ① 清单里新加的：这家店没有同名任务就补一条 */
        if (!ot) {
          if (exist[title]) return;
          var bNew = Math.max(0, Number(nt.before) || 0);
          var fresh = {
            id: U.uid('task'),
            storeId: store.id,
            title: title,
            stage: nt.stage || '',
            assigneeId: store.ownerId || '',
            dueDate: store.openDate ? U.addDays(store.openDate, -bNew) : '',
            status: 'pending',
            priority: 'normal',
            remark: '',
            createdAt: U.today()
          };
          state.tasks.push(fresh);
          createdTasks.push(fresh);
          beforePairs.push({ id: fresh.id, before: bNew });
          exist[title] = true;
          out.added++;
          storesHit[store.id] = true;
          return;
        }

        /* ② 已有的一条：改名 / 改阶段 / 改天数 */
        var oldTitle = String(ot.title || '').trim();
        var bOld = Math.max(0, Number(ot.before) || 0);
        var bNow = Math.max(0, Number(nt.before) || 0);
        var renamed = oldTitle !== title;
        var restaged = (ot.stage || '') !== (nt.stage || '');
        var redate = bOld !== bNow;
        if (!renamed && !restaged && !redate) return;

        state.tasks.forEach(function (t) {
          if (t.storeId !== store.id || t.title !== oldTitle) return;
          if (renamed) { t.title = title; out.renamed++; }
          if (restaged) { t.stage = nt.stage || ''; out.restaged++; }
          if (redate) {
            beforePairs.push({ id: t.id, before: bNow });
            redateTargets.push(t);
          }
          changedTasks.push(t);
          storesHit[store.id] = true;
        });
        exist[title] = true;
      });
    });

    if (beforePairs.length) setTaskBeforeMany(beforePairs);

    /* 日期重算放在天数落盘之后，走 suggestDateOf 保留「手动延后过的天数」 */
    redateTargets.forEach(function (t) {
      if (t.status === 'done') return;    /* 已完成的历史日期不动 */
      var due = suggestDateOf(t);
      if (t.dueDate !== due) { t.dueDate = due; out.redated++; }
    });

    if (changedTasks.length) pushMany('tasks', changedTasks);
    if (createdTasks.length) pushMany('tasks', createdTasks);
    if (changedTasks.length || createdTasks.length) cacheLocal();

    out.stores = Object.keys(storesHit).length;
    return out;
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

  /* ---------------- 门店「更多」：自定义档案字段 + 几线价格（z161） ----------------
     用户在「系统设置 → 门店档案字段」里自己维护，不用改代码：
       settings.storeFields    = [{ id, name, type, options: [], show: true }]
       settings.storeFieldVals = { storeId: { fieldId: value } }
       settings.priceCfg       = { tiers: ['一线','二线','三线'], versions: ['V1'…'V6'] }
       settings.storePrices    = { storeId: [ ['', '', ''], … ] }   // 行 = 版本，列 = 线级
     - stores 表没有这些列，和 storeSubs 一个路子：全放 settings 里跟着云端同步，不用改表
     - 金额按原样字符串存：门店报价常带小数、或者按「万」口头说，转 number 会把 0 和小数吃掉
     ------------------------------------------------------------------------------- */

  var FIELD_TYPES = [
    { key: 'text',     label: '文本' },
    { key: 'money',    label: '金额' },
    { key: 'select',   label: '下拉选择' },
    { key: 'date',     label: '日期' },
    { key: 'tier3',    label: '三档金额' },
    { key: 'textarea', label: '多行文本' }
  ];

  var DEFAULT_FIELDS = [
    { id: 'f_city',   name: '城市等级',   type: 'select', options: ['一线', '二线', '三线'] },
    { id: 'f_franch', name: '加盟商姓名', type: 'text' },
    { id: 'f_phone',  name: '电话',       type: 'text' },
    { id: 'f_rm',     name: '区域经理',   type: 'text' },
    { id: 'f_style',  name: '设计风格',   type: 'select', options: ['现代简约', '新中式', '工业风', '北欧', '侘寂'] },
    { id: 'f_join',   name: '加盟费',     type: 'tier3' },
    { id: 'f_mgmt',   name: '管理费',     type: 'tier3' }
  ];

  var DEFAULT_PRICE_CFG = {
    tiers: ['一线', '二线', '三线'],
    versions: ['V1', 'V2', 'V3', 'V4', 'V5', 'V6']
  };

  function fieldTypeOk(t) {
    return FIELD_TYPES.some(function (x) { return x.key === t; });
  }

  function normalizeField(f) {
    return {
      id: String((f && f.id) || U.uid('f')),
      name: String((f && f.name) || '').trim() || '未命名字段',
      type: fieldTypeOk(f && f.type) ? f.type : 'text',
      options: (f && Array.isArray(f.options) ? f.options : []).map(function (o) {
        return String(o == null ? '' : o).trim();
      }).filter(Boolean),
      show: !(f && f.show === false)
    };
  }

  /* 没配过就返回出厂默认（不写回：等用户真改了才落库，免得平白多一次整包写） */
  function storeFields() {
    var list = state.settings && state.settings.storeFields;
    if (!Array.isArray(list) || !list.length) {
      return DEFAULT_FIELDS.map(function (f) {
        return normalizeField({ id: f.id, name: f.name, type: f.type, options: f.options, show: true });
      });
    }
    return list.filter(function (f) { return f && f.name; }).map(normalizeField);
  }

  function saveStoreFields(list) {
    state.settings = state.settings || {};
    state.settings.storeFields = (Array.isArray(list) ? list : []).map(normalizeField);
    pushSettings();
    cacheLocal();
    return storeFields();
  }

  function fieldTypes() {
    return FIELD_TYPES.map(function (t) { return { key: t.key, label: t.label }; });
  }

  function storeFieldVals(store) {
    var all = (state.settings && state.settings.storeFieldVals) || {};
    var rec = store ? all[store.id] : null;
    var out = {};
    if (!rec || typeof rec !== 'object') return out;
    Object.keys(rec).forEach(function (k) {
      var v = rec[k];
      out[k] = (v == null ? '' : v);
    });
    return out;
  }

  function setStoreFieldVal(storeId, fieldId, value) {
    if (!storeId || !fieldId) return;
    var all = (state.settings && state.settings.storeFieldVals) || {};
    var rec = (all[storeId] && typeof all[storeId] === 'object') ? all[storeId] : {};

    var shuang = value;
    var empty = shuang == null || shuang === '' ||
      (typeof shuang === 'object' && !Array.isArray(shuang) && !Object.keys(shuang).length);
    if (empty) delete rec[fieldId]; else rec[fieldId] = shuang;

    if (!Object.keys(rec).length) delete all[storeId]; else all[storeId] = rec;

    state.settings = state.settings || {};
    state.settings.storeFieldVals = all;
    pushSettings();
    cacheLocal();
  }

  /* ---------------- 几线价格：版本 × 线级 的矩阵 ---------------- */

  function priceCfg() {
    var c = state.settings && state.settings.priceCfg;
    var tiers = (c && Array.isArray(c.tiers) && c.tiers.length)
      ? c.tiers.map(function (x) { return String(x == null ? '' : x).trim() || '未命名'; })
      : DEFAULT_PRICE_CFG.tiers.slice();
    var versions = (c && Array.isArray(c.versions) && c.versions.length)
      ? c.versions.map(function (x) { return String(x == null ? '' : x).trim() || '未命名'; })
      : DEFAULT_PRICE_CFG.versions.slice();
    return { tiers: tiers, versions: versions };
  }

  function savePriceCfg(cfg) {
    var next = {
      tiers: ((cfg && cfg.tiers) || []).map(function (x) {
        return String(x == null ? '' : x).trim();
      }).filter(Boolean),
      versions: ((cfg && cfg.versions) || []).map(function (x) {
        return String(x == null ? '' : x).trim();
      }).filter(Boolean)
    };
    if (!next.tiers.length) next.tiers = DEFAULT_PRICE_CFG.tiers.slice();
    if (!next.versions.length) next.versions = DEFAULT_PRICE_CFG.versions.slice();

    state.settings = state.settings || {};
    state.settings.priceCfg = next;
    pushSettings();
    cacheLocal();
    return priceCfg();
  }

  function storePriceMatrix(store) {
    var cfg = priceCfg();
    var all = (state.settings && state.settings.storePrices) || {};
    var rec = store ? all[store.id] : null;

    var rows = [];
    for (var r = 0; r < cfg.versions.length; r++) {
      var row = [];
      for (var c = 0; c < cfg.tiers.length; c++) {
        var v = (rec && Array.isArray(rec[r])) ? rec[r][c] : '';
        row.push(v == null ? '' : String(v));
      }
      rows.push(row);
    }
    return { tiers: cfg.tiers, versions: cfg.versions, rows: rows };
  }

  function setStorePriceCell(storeId, r, c, value) {
    if (!storeId) return null;
    var cfg = priceCfg();
    var all = (state.settings && state.settings.storePrices) || {};
    var rec = (all[storeId] && Array.isArray(all[storeId])) ? all[storeId] : [];

    /* 先按当前配置把矩阵拉齐，再改那一格 —— 增删版本/线级后不会错位 */
    var rows = [];
    for (var i = 0; i < cfg.versions.length; i++) {
      var row = [];
      for (var j = 0; j < cfg.tiers.length; j++) {
        var v = (Array.isArray(rec[i]) && rec[i][j] != null) ? String(rec[i][j]) : '';
        row.push(v);
      }
      rows.push(row);
    }
    if (rows[r]) rows[r][c] = (value == null ? '' : String(value));

    var any = rows.some(function (row) {
      return row.some(function (v) { return !!v; });
    });
    if (any) all[storeId] = rows; else delete all[storeId];

    state.settings = state.settings || {};
    state.settings.storePrices = all;
    pushSettings();
    cacheLocal();
    return storePriceMatrix(storeById(storeId));
  }

  /* ================= 完成任务只是「记账」，阶段照样按门店实际进度走 =================

     用户口径（2026-10-25 二次调整）：
       「即使我点了营业执照完成，他也不会直接跳转到下一阶段，而是继续按照时间先走；
         如果走到了建档资料阶段，因为已完成了才跳过去往下一阶段。」

     所以点「完成」只做一件事：这条任务标记完成。门店阶段一动不动 ——
     阶段反映的是门店实际到了哪一步，不该被一条任务一夜之间拽到最前面。

     任务落点（「完成后进到」）= 这条做完就算「完成」的那个阶段。做完了，那一格
     就等于是「活已经干完」，等门店实际推进到那一格时（门店表单把阶段往前改），
     advanceStore() 把这一格（以及后面连续几格已经做完的）一起跳过，落到第一格还没
     做完的阶段 —— 这就是用户说的「走到了建档资料、因为已完成了才跳过去往下一阶段」。

     越过时给每条被越过的任务写一条 reopenLog，之后对那条任务点「重开」能退回那一格。

     gateOfTask / gatesOf / gateOf / doneLodges 都是现算的（没有任何新表），
     唯一要存的是「落点带二级时选的那一支」→ settings.taskGateSub。
     ------------------------------------------------------------------ */

  /* 阶段在一级序列里的位置（二级不影响）；不在序列里 = -1 */
  function stageOrder(key) {
    var base = C.stageSplit(key).base;
    var idx = -1;
    (C.STAGES || []).forEach(function (s, i) { if (s.key === base) idx = i; });
    return idx;
  }

  function gateSubMap() {
    var map = state && state.settings && state.settings.taskGateSub;
    if (!map || typeof map !== 'object' || Array.isArray(map)) return {};
    return map;
  }

  function gateSubOf(taskId) {
    var v = gateSubMap()[taskId];
    return typeof v === 'string' ? v : '';
  }

  function setGateSub(taskId, value) {
    if (!state.settings) state.settings = {};
    var map = gateSubMap();
    if (value) map[taskId] = String(value);
    else delete map[taskId];
    state.settings.taskGateSub = map;
    pushSettings();
    cacheLocal();
  }

  function clearGateSub(taskId) { setGateSub(taskId, ''); }

  /* 这条已完成任务要落到哪一格（一级 + 二级）；落点不是有效阶段 → null */
  function gateOfTask(task) {
    if (!task || task.status !== 'done') return null;
    var p = C.stageSplit(task.stage || '');
    if (stageOrder(p.base) < 0) return null;
    var pick = C.stageSplit(gateSubOf(task.id)).sub;
    var sub = p.sub || pick || '';
    return {
      taskId: task.id, title: task.title,
      base: p.base, sub: sub, value: C.stageValue(p.base, sub)
    };
  }

  /* 这家店「已完成、落点比现在更靠后」的格子，从近到远（供「待越过」小标 / 行头提示用） */
  function gatesOf(storeId) {
    var store = storeById(storeId);
    if (!store) return [];
    var cur = stageOrder(store.stage);
    var out = [];
    state.tasks.forEach(function (t) {
      if (t.storeId !== storeId) return;
      var g = gateOfTask(t);
      if (!g || stageOrder(g.base) <= cur) return;
      out.push(g);
    });
    out.sort(function (a, b) { return stageOrder(a.base) - stageOrder(b.base); });
    return out;
  }

  /* 最远那一格 —— 门店推进时可能走到的最远位置（行头「→ X」提示用） */
  function gateOf(storeId) {
    var list = gatesOf(storeId);
    return list.length ? list[list.length - 1] : null;
  }

  /* 这家店所有「已完成」任务的落点，按一级阶段归类：
     { 阶段名: { taskId, title, base, sub, value } }
     advanceStore 用它判断「这一格是不是已经做完了」。 */
  function doneLodges(storeId) {
    var out = {};
    state.tasks.forEach(function (t) {
      if (t.storeId !== storeId) return;
      var g = gateOfTask(t);
      if (g && !out[g.base]) out[g.base] = g;
    });
    return out;
  }

  /* 门店阶段往前挪：沿「已完成任务」的落点链，连续前进到最远。
     任务落点 = 这条做完、门店就「到达」的那个阶段；所以 done 任务的落点
     连在一起，等于一串「已经走到」的格子。推进时从门店当前格出发，只要
     下一格有已完成的落点就继续走，停在最后一个「下一格还没完成」的格。

     举例（用户真实数据）：
       首批已做→建档资料（done）、建档资料→到货时间（done）、到货时间给到→发货阶段（done）
       门店在「首批阶段」→ 推进后直接落到「发货阶段」，中间「建档、到货」被连跳。

     返回 { from, to, skipped:[中间跨过的格], gate, store } / null（原地不动）。
     回退点不在这里记 —— 由完成任务（completeTask）记。 */
  function advanceStore(storeId) {
    var store = storeById(storeId);
    if (!store) return null;

    var cur = stageOrder(store.stage);
    if (cur < 0) return null;
    var from = C.stageValue(store.stage, storeSub(store));
    var lodges = doneLodges(storeId);

    var end = cur;
    while (end + 1 < C.STAGES.length && lodges[C.STAGES[end + 1].key]) end++;
    if (end === cur) return null;

    var skipped = [];
    for (var i = cur + 1; i < end; i++) skipped.push(C.STAGES[i].key);

    var toKey = C.STAGES[end].key;
    var toVal = C.stageValue(toKey, '');
    setStoreStage(store.id, toKey, '');

    return {
      from: from, to: toVal, skipped: skipped,
      gate: lodges[toKey] || null, store: storeById(storeId)
    };
  }

  /* ---------------- 门店进度 ----------------
     两个口径分开，别混着用：

       stageProgress() —— 阶段口径：门店停在第几个筹建阶段
         6 个筹建阶段 → 每个 16.7%，最后一个（准备开业）= 100%
         设计 16.7%  已出图 33.3%  建档资料 50%  发货 66.7%  广告物料 83.3%  准备开业 100%
         结束类阶段（已开业 / 闭店 …，见 CONST.PROGRESS_END_STAGES）不进分母。
         只用于门店表单里那格「阶段进度」的即时预览 —— 改阶段就跟着变。

       storeProgress() —— 任务口径：这家店「已完成任务 / 任务总计」
         页面上所有进度条（首页 / 门店列表 / 任务页 / 报表平均进度）统一走它，
         跟任务页里看到的「未完成 N / 逾期 N」是同一份数据，不会两处对不上。
         同时还带出阶段位置（idx / total / at），文案里想提一句也能用。

     阶段是用户自己加 / 改名 / 删 / 排序的，分母一律按当前 C.STAGES 现算。
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

  /* 阶段口径：{ pct, idx, total, at, ended, isEnd, label }
     idx = 停在第几个筹建阶段（从 1 开始），total = 筹建阶段总数
     只给「门店表单 → 阶段进度」预览用；页面上的进度条请用 storeProgress() */
  function stageProgress(store) {
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

  /* 任务口径：这家店的任务「已完成 / 总计」
     { done, total, pct }；还没派任务时 total = 0、pct = 0（页面显示「—」） */
  function taskProgress(store) {
    var id = store && store.id;
    var total = 0, done = 0;
    if (id) {
      for (var i = 0; i < state.tasks.length; i++) {
        var t = state.tasks[i];
        if (t.storeId !== id) continue;
        total++;
        if (t.status === 'done') done++;
      }
    }
    return { done: done, total: total, pct: total ? Math.round(done / total * 100) : 0 };
  }

  /* 页面统一用的门店进度：pct = 已完成任务 / 任务总计
     另外把阶段位置一并带出来（idx / total / at / isEnd / label），文案里想提就用。 */
  function storeProgress(store) {
    var sp = stageProgress(store);
    var tp = taskProgress(store);
    return {
      pct: store && store.id ? tp.pct : sp.pct,   /* 没有 id 的伪对象（表单预览）退回阶段口径 */
      done: tp.done,
      taskTotal: tp.total,
      stagePct: sp.pct,
      idx: sp.idx, total: sp.total,
      at: sp.at, ended: sp.ended, isEnd: sp.isEnd, label: sp.label
    };
  }

  /* 页面直接丢给 UI.progress() 的值：没派任务就返回 null（进度条显示「—」，不假装 0%） */
  function progressValue(store) {
    var p = storeProgress(store);
    if (!store || !store.id) return p.stagePct;   /* 表单预览走阶段口径 */
    return p.taskTotal ? p.pct : null;
  }

  /* 鼠标悬停的说明文字，各页面共用，避免同一个数字三种说法 */
  function progressTip(store) {
    var p = storeProgress(store);
    var at = p.at
      ? '门店在「' + p.at + '」' + (p.idx ? '（第 ' + p.idx + ' / ' + p.total + ' 个筹建阶段）' : '')
      : '还没设置阶段';

    if (!p.taskTotal) {
      return '进度 = 已完成任务 / 任务总计；这家店还没有任务，所以显示「—」。' + at;
    }
    return '进度 = 已完成任务 / 任务总计：' + p.done + ' / ' + p.taskTotal +
      ' 条已完成 → ' + p.pct + '%。' + at;
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
        /* 一律派给门店负责人，同 addStore（售前 / 售后 只是称谓） */
        assigneeId: store.ownerId,
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
    bumpAlerts();
    pushSettings();
  }

  function markAllAlertsRead() {
    alerts().forEach(function (a) {
      if (state.alertsRead.indexOf(a.id) < 0) state.alertsRead.push(a.id);
    });
    bumpAlerts();
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

  /* 顶栏每次重画都要显示占用：以前是「把整份缓存读出来再建个 Blob 量一遍」，
     重画一次就全量读一次。现在写盘时顺便记下，平时直接返回。 */
  function storageBytes() {
    if (!cachedBytes) {
      try {
        cachedBytes = (localStorage.getItem(KEY) || '').length * 2;   /* UTF-16，跟配额同口径 */
      } catch (e) { cachedBytes = 0; }
    }
    return cachedBytes;
  }

  function onChange(fn) { listeners.push(fn); }

  return {
    load: load,
    onChange: onChange,
    getState: getState,
    /* 数据版本号：给页面侧做「同一版本内不重复算」的缓存键（见 page-tasks 的 statOf） */
    rev: function () { return dataRev; },
    isOnline: isOnline,
    getLastError: getLastError,
    hasLocalData: hasLocalData,
    startAutoSync: startAutoSync,
    stopAutoSync: stopAutoSync,
    storeById: storeById,
    memberById: memberById,
    memberArt: memberArt,
    setMemberArt: setMemberArt,
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
    boardNotes: boardNotes,
    addBoardNote: addBoardNote,
    removeBoardNote: removeBoardNote,
    reopenPointOf: reopenPointOf,
    setReopenPoint: setReopenPoint,
    clearReopenPoint: clearReopenPoint,
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
    setSetting: setSetting,
    accessOf: accessOf,
    canSettings: canSettings,
    isSettingsOwner: isSettingsOwner,
    meAllowed: meAllowed,
    syncSkipped: function () { return syncSkipped; },
    grantSettings: grantSettings,
    revokeSettings: revokeSettings,
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
    storeFields: storeFields,
    saveStoreFields: saveStoreFields,
    fieldTypes: fieldTypes,
    storeFieldVals: storeFieldVals,
    setStoreFieldVal: setStoreFieldVal,
    priceCfg: priceCfg,
    savePriceCfg: savePriceCfg,
    storePriceMatrix: storePriceMatrix,
    setStorePriceCell: setStorePriceCell,
    setStoreStage: setStoreStage,
    stageOrder: stageOrder,
    gateSubOf: gateSubOf,
    setGateSub: setGateSub,
    clearGateSub: clearGateSub,
    gateOfTask: gateOfTask,
    gatesOf: gatesOf,
    gateOf: gateOf,
    doneLodges: doneLodges,
    advanceStore: advanceStore,
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
    reassignStoreTasks: reassignStoreTasks,
    taskCountOfStore: taskCountOfStore,
    alignTaskOwners: alignTaskOwners,
    ownerOfStoreId: ownerOfStoreId,
    syncTemplatesToStores: syncTemplatesToStores,
    isEndStage: isEndStage,
    stageProgress: stageProgress,
    taskProgress: taskProgress,
    storeProgress: storeProgress,
    progressValue: progressValue,
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
    tasksOf: tasksOf,
    pendingCount: pendingCount,
    flushOutbox: flushOutbox,
    /* 还没发出去的改动：切页 / 关页面 / 探针里用它把队列推干净 */
    flushWrites: flushWrites,
    flushSettings: flushSettings,
    writesPending: wqBusy,
    storageBytes: storageBytes,
    flushCache: writeCacheNow
  };
})();

/* ==========================================================
   seed.js — 演示门店生成器（只造业务数据，绝不动你的配置）

   ⚠️ 口径（2026-10-24 修正）：
   用户要的是「加 50 家门店」，不是「把系统重置成演示状态」。
   所以这里生成的全是业务数据 —— 门店 / 任务 / 物料到货 / 发货计划，
   而「阶段时间线、二级阶段、筹建任务清单、到货物料清单、团队成员」一律不碰，
   全部沿用当前系统里正在用的那一份：
     - 阶段    → Store.stages()（含你自己加 / 改名 / 排序后的结果）
     - 任务    → Store.templates()（你的筹建任务清单；空清单才退回出厂 7 条兜底）
     - 物料    → Store.items()（你的物料清单）
     - 成员    → Store 里现有成员派活（一个人都没有才用演示成员）
   日期全部相对「今天」动态计算，固定种子，同一套数据刷新不变。

   用法：
     Seed()                       → 按当前配置生成 50 家
     Seed({ count: 20 })          → 只加 20 家
     Seed({ stages, templates, items, members })  → 显式指定（测试用）
   ========================================================== */
window.Seed = function (opts) {
  opts = opts || {};

  var U = window.Utils;
  var C = window.CONST;
  var S = window.Store;
  var t0 = U.today();

  var TOTAL = Math.max(1, Math.min(200, Number(opts.count) || 50));

  /* ---------------- 团队成员（只有系统里一个人都没有时才用） ---------------- */
  var DEMO_MEMBERS = [
    { id: 'u1', name: '张三', role: '售前', color: '#3f6bf5' },
    { id: 'u2', name: '李四', role: '售后', color: '#7a5af8' },
    { id: 'u3', name: '王五', role: '接单', color: '#f79009' }
  ];

  /* ---------------- 当前生效的配置（只读，绝不回写） ----------------
     Store 还没 load（或干脆没加载 store.js，比如单测）时一律退回 constants，
     绝不让「取配置」这一步把整个生成器搞挂。 */
  function safeGet(fn, fallback) {
    try {
      var v = fn();
      return (v === undefined || v === null) ? fallback : v;
    } catch (e) { return fallback; }
  }

  function curSettings() {
    return safeGet(function () {
      return S && S.getState && S.getState() && S.getState().settings;
    }, null);
  }

  function stagesNow() {
    var list = opts.stages;
    if (!Array.isArray(list) || !list.length) {
      var set = curSettings();
      list = (set && Array.isArray(set.stages) && set.stages.length)
        ? set.stages
        : safeGet(function () { return S && S.stages && S.stages(); }, C.STAGES);
    }
    return (list || C.STAGES).slice();
  }

  function templatesNow() {
    var list = opts.templates;
    if (!Array.isArray(list) || !list.length) {
      list = safeGet(function () { return S && S.templates && S.templates(); }, []);
    }
    /* 清单是空的时候不能生成「没有任务的门店」，退回出厂 7 条兜底（只影响演示数据，不写回配置） */
    if (!list || !list.length) list = C.TASK_TEMPLATES;
    return list.slice();
  }

  function itemsNow() {
    var list = opts.items;
    if (!Array.isArray(list) || !list.length) {
      list = safeGet(function () { return S && S.items && S.items(); }, []);
    }
    if (!list || !list.length) list = C.ITEMS;
    return list.slice();
  }

  function membersNow() {
    var list = opts.members;
    if (!Array.isArray(list) || !list.length) {
      list = safeGet(function () {
        return S && S.getState && S.getState() && S.getState().members;
      }, []);
    }
    if (!list || !list.length) list = DEMO_MEMBERS;
    return list.slice();
  }

  var STAGES = stagesNow();
  var TPLS = templatesNow();
  var ITEMS = itemsNow();
  var MEMBERS = membersNow();
  var N = STAGES.length;

  var STAGE_INDEX = {};
  STAGES.forEach(function (s, i) { STAGE_INDEX[s.key] = i; });

  /* 任务的所属阶段可能是「一级 / 二级」，按一级定位它算哪个阶段 */
  function baseIndexOf(stageValue) {
    var base = C.stageSplit(stageValue).base;
    if (STAGE_INDEX[base] != null) return STAGE_INDEX[base];
    if (STAGE_INDEX[stageValue] != null) return STAGE_INDEX[stageValue];
    return -1;
  }

  /* ---------- 固定种子伪随机：同一套演示数据，刷新不变 ---------- */
  var _s = 20261024;
  function rnd() {
    _s = (_s * 1103515245 + 12345) % 2147483648;
    return _s / 2147483648;
  }
  function ri(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }

  /* ---------------- 门店名称 / 省份 ---------------- */
  var PLACES = [
    ['广州天河店', '广东'], ['广州番禺店', '广东'], ['广州越秀店', '广东'],
    ['深圳南山店', '广东'], ['深圳福田店', '广东'], ['深圳龙华店', '广东'],
    ['东莞南城店', '广东'], ['佛山祖庙店', '广东'], ['珠海香洲店', '广东'],
    ['惠州惠城店', '广东'],
    ['杭州西湖店', '浙江'], ['杭州滨江店', '浙江'], ['杭州钱塘店', '浙江'],
    ['宁波鄞州店', '浙江'], ['温州鹿城店', '浙江'],
    ['南京新街口店', '江苏'], ['南京江宁店', '江苏'], ['苏州工业园店', '江苏'],
    ['无锡崇安店', '江苏'], ['常州天宁店', '江苏'],
    ['上海徐汇店', '上海'], ['上海静安店', '上海'], ['上海浦东店', '上海'],
    ['北京朝阳店', '北京'], ['北京海淀店', '北京'],
    ['天津和平店', '天津'], ['重庆江北店', '重庆'],
    ['成都春熙店', '四川'], ['成都高新店', '四川'], ['成都锦江店', '四川'],
    ['武汉光谷店', '湖北'], ['武汉汉口店', '湖北'],
    ['长沙五一店', '湖南'], ['郑州二七店', '河南'], ['西安高新店', '陕西'],
    ['合肥蜀山店', '安徽'], ['青岛崂山店', '山东'], ['济南历下店', '山东'],
    ['福州鼓楼店', '福建'], ['厦门中山店', '福建'], ['昆明五华店', '云南'],
    ['南宁青秀店', '广西'], ['沈阳中街店', '辽宁'], ['石家庄长安店', '河北'],
    ['太原迎泽店', '山西'], ['南昌红谷滩店', '江西'], ['贵阳观山湖店', '贵州'],
    ['海口龙华店', '海南'], ['哈尔滨南岗店', '黑龙江'], ['长春朝阳店', '吉林']
  ];

  /* ---------------- 阶段分布：按当前有几个阶段动态摊 ----------------
     中间阶段多、两头少（现实里大部分门店都在施工 / 物料这种中段）。
     你加了阶段 → 新阶段自动也分到门店，不会像以前写死 7 个而漏掉 / 越界。 */
  function weightAt(t) { return 0.55 + 0.85 * Math.sin(Math.PI * t); }

  var counts = [];
  if (N === 1) {
    counts = [TOTAL];
  } else {
    var wSum = 0;
    for (var i = 0; i < N; i++) wSum += weightAt(i / (N - 1));
    for (var j = 0; j < N; j++) {
      counts[j] = Math.max(1, Math.round(TOTAL * weightAt(j / (N - 1)) / wSum));
    }
    /* 把四舍五入多出来 / 少掉的补到中间那个阶段上 */
    var diff = TOTAL - counts.reduce(function (a, b) { return a + b; }, 0);
    var mid = Math.floor(N / 2);
    while (diff !== 0) {
      if (diff > 0) { counts[mid]++; diff--; }
      else if (counts[mid] > 1) { counts[mid]--; diff++; }
      else break;
    }
  }

  var stagePlan = [];
  counts.forEach(function (cnt, idx) {
    for (var k = 0; k < cnt; k++) stagePlan.push(idx);
  });
  for (var m = stagePlan.length - 1; m > 0; m--) {
    var r = Math.floor(rnd() * (m + 1));
    var tmp = stagePlan[m]; stagePlan[m] = stagePlan[r]; stagePlan[r] = tmp;
  }

  /* 每个阶段在时间轴上的位置：0 = 最前（刚筹备），1 = 最后（已开业） */
  function posOf(idx) { return N === 1 ? 0 : idx / (N - 1); }

  /* 收藏阶段是否有「结束类」（已开业 / 闭店…），有就让它落在过去 */
  var endIdx = -1;
  STAGES.forEach(function (s, i) { if (C.PROGRESS_END_STAGES.indexOf(s.key) >= 0) endIdx = i; });

  /* ---------------- 门店 ---------------- */
  var stamp = String(Date.now()).slice(-6);
  var stores = [];
  stagePlan.slice(0, TOTAL).forEach(function (si, i) {
    var stage = STAGES[si].key;
    var p = posOf(si);

    /* 距开业天数：越靠前越远，最后一个阶段落在刚开业前后 */
    var center = Math.round(88 - p * 108);
    var openLeft;
    if (si === endIdx) openLeft = ri(-28, -2);
    else openLeft = U.clamp(center + ri(-7, 7), 2, 95);

    var progress = U.clamp(Math.round(8 + p * 92) + ri(-6, 6), 3, 100);
    if (si === endIdx) progress = 100;
    if (si === 0) progress = Math.min(progress, 15);

    /* 风险 = 进度和「离开业还有几天」对不对得上 */
    var risk = 'normal';
    if (si !== endIdx) {
      var expect = U.clamp(100 - openLeft * 1.55, 0, 100);
      var gap = expect - progress;
      if (gap >= 26) risk = 'overdue';
      else if (gap >= 13) risk = 'high';
      else if (gap >= 4) risk = 'attention';
    }

    var owner = MEMBERS[ri(0, MEMBERS.length - 1)];
    var place = PLACES[i % PLACES.length];

    stores.push({
      id: 'store_demo' + stamp + '_' + U.pad2(i + 1),
      name: place[0] + (i >= PLACES.length ? '·' + (Math.floor(i / PLACES.length) + 1) : ''),
      province: place[1],
      stage: stage,
      risk: risk,
      progress: progress,
      ownerId: owner.id,
      openDate: U.addDays(t0, openLeft),
      address: '',
      remark: '',
      createdAt: U.addDays(t0, -ri(20, 150))
    });
  });

  /* ---------------- 任务：按你的筹建任务清单派活 ----------------
     状态由「任务所属阶段」和「门店当前阶段」比出来：
     前面阶段的算做完、当前阶段的算在手、后面阶段的还没开始。 */
  var roleToId = {};
  MEMBERS.forEach(function (mm) { if (roleToId[mm.role] == null) roleToId[mm.role] = mm.id; });

  var tasks = [];
  stores.forEach(function (store, si) {
    var stageIdx = STAGE_INDEX[store.stage];
    if (stageIdx == null) stageIdx = 0;

    TPLS.forEach(function (tpl, ti) {
      var idx = baseIndexOf(tpl.stage);
      if (idx < 0) idx = stageIdx;

      var status;
      if (stageIdx >= endIdx && endIdx >= 0) status = 'done';
      else if (idx < stageIdx) status = 'done';
      else if (idx === stageIdx) status = 'doing';
      else status = 'pending';

      /* 建议完成日 = 开业日 − 这条任务自己的「开业前 N 天」（跟系统口径一致） */
      var before = Number(tpl.before);
      if (!isFinite(before)) before = C.LEAD_DAYS_DEFAULT;
      var suggest = U.addDays(store.openDate, -before);

      /* 已完成的任务统一落在过去，方便看「这条早就该做完了」 */
      var dueDate = status === 'done' ? U.addDays(suggest, -ri(1, 5)) : suggest;

      tasks.push({
        id: 'task_demo' + stamp + '_' + (si + 1) + '_' + ti,
        storeId: store.id,
        title: tpl.title,
        stage: tpl.stage || store.stage,
        assigneeId: roleToId[tpl.role] || store.ownerId,
        dueDate: dueDate,
        status: status,
        priority: (store.risk === 'high' || store.risk === 'overdue') ? 'high' : 'normal',
        remark: '',
        createdAt: U.addDays(store.createdAt, ti + 1)
      });
    });
  });

  /* ---------------- 物料到货：只认登记的到货时间 ----------------
     每家 0~6 条，到货日 = 开业日往前推，所以各店自然错开；
     过去的日子绝大多数早已通知过供应商，留少数「漏通知」演示提醒。 */
  var arrivals = [];
  stores.forEach(function (store, si) {
    var stageIdx = STAGE_INDEX[store.stage];
    if (stageIdx == null) stageIdx = 0;
    var p = posOf(stageIdx);

    /* 还没出图的门店物料还没下单，就不编到货时间 */
    var count;
    if (stageIdx >= endIdx && endIdx >= 0) count = 0;   /* 已开业的店物料早就到了，单独补几条已通知 */
    else if (p < 0.15) count = 0;
    else count = Math.max(1, Math.round(p * 6 + ri(-1, 1)));
    count = U.clamp(count, 0, 6);

    var spanStart = Math.round(-32 + p * 12);
    var spanEnd = Math.round(-24 + p * 21);

    for (var k = 0; k < count; k++) {
      var off = spanStart + Math.round((spanEnd - spanStart) * (count === 1 ? 0 : k / (count - 1)));
      off += ri(-2, 2);

      var eta = U.addDays(store.openDate, off);
      var d = U.diffDays(t0, eta);

      var status;
      if (d < 0) status = rnd() < 0.86 ? 'notified' : 'pending';
      else if (d <= 2) status = rnd() < 0.45 ? 'notified' : 'pending';
      else status = rnd() < 0.12 ? 'notified' : 'pending';
      if (stageIdx >= endIdx && endIdx >= 0) status = 'notified';

      arrivals.push({
        id: 'arr_demo' + stamp + '_' + (si + 1) + '_' + k,
        storeId: store.id,
        item: ITEMS[(si * 3 + k) % ITEMS.length],
        qty: 3 + ri(1, 11) * 3,
        etaDate: eta,
        status: status
      });
    }
  });

  /* 已开业的店补 3 条「早就到货、已通知」的记录，免得物料页看着是空的 */
  if (endIdx >= 0) {
    stores.forEach(function (store, si) {
      if (store.stage !== STAGES[endIdx].key) return;
      for (var k = 0; k < 3; k++) {
        arrivals.push({
          id: 'arr_demo' + stamp + '_' + (si + 1) + '_h' + k,
          storeId: store.id,
          item: ITEMS[(si + k) % ITEMS.length],
          qty: 6 + ri(0, 8) * 3,
          etaDate: U.addDays(store.openDate, -(18 - k * 5)),
          status: 'notified'
        });
      }
    });
  }

  /* 少数门店留一条「没填到货时间」的，演示这种情况不会误报 */
  [2, 9, 23, 38].forEach(function (idx) {
    if (!stores[idx]) return;
    arrivals.push({
      id: 'arr_demo' + stamp + '_' + (idx + 1) + '_noeta',
      storeId: stores[idx].id,
      item: ITEMS[idx % ITEMS.length],
      qty: 12,
      etaDate: '',
      status: 'pending'
    });
  });

  /* ---------------- 发货计划：开业前 10 天左右 ---------------- */
  var ship = {};
  stores.forEach(function (store) {
    var stageIdx = STAGE_INDEX[store.stage];
    if (stageIdx == null) stageIdx = 0;
    var planDate = U.addDays(store.openDate, -10 + ri(-2, 2));
    var planLeft = U.diffDays(t0, planDate);

    var status;
    var isEnd = endIdx >= 0 && stageIdx >= endIdx;
    if (isEnd) status = 'sent';
    else if (planLeft < 0) status = rnd() < 0.4 ? 'sent' : 'todo';
    else if (planLeft <= 3) status = rnd() < 0.2 ? 'sent' : 'todo';
    else status = rnd() < 0.08 ? 'sent' : 'todo';

    ship[store.id] = {
      status: status,
      date: planDate,
      pin: false,
      seq: null,
      note: '',
      sentAt: status === 'sent' ? U.addDays(planDate, -1) : ''
    };
  });

  /* 留两家「今天就该发 / 明天该发」的，演示当天怎么用 */
  var demoToday = stores.filter(function (s) {
    var left = U.diffDays(t0, s.openDate);
    return ship[s.id].status === 'todo' && left >= 8 && left <= 24;
  }).slice(0, 2);
  demoToday.forEach(function (s, i) {
    ship[s.id].date = U.addDays(t0, i === 0 ? 0 : 1);
  });

  /* 挑 3 家最近要发、还没发的标成「先发」，让看板一打开就有重点 */
  var near = stores.filter(function (s) {
    return ship[s.id].status === 'todo' && U.diffDays(t0, s.openDate) <= 16;
  }).slice(0, 3);
  near.forEach(function (s) { ship[s.id].pin = true; });

  if (stores[3]) ship[stores[3].id].note = '等门店确认收货人';
  if (stores[17]) ship[stores[17].id].note = '先发招牌，货架后发';

  /* 只返回业务数据 —— 没有 settings.brand / members，
     调用方（Store.addDemoStores）只把这些写进业务表，配置一个字都不改。 */
  return {
    meta: { version: 4, createdAt: new Date().toISOString(), stages: N, templates: TPLS.length },
    stores: stores,
    tasks: tasks,
    arrivals: arrivals,
    ship: ship
  };
};

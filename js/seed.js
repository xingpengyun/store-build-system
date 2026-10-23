/* ==========================================================
   seed.js — 演示数据：50 家门店 / 各自不同的阶段、进度、到货日期
   日期全部相对「今天」动态计算，所以任何时候打开都不会过期。
   用固定种子的伪随机，保证每次生成的是同一套数据（刷新不会变）。
   ========================================================== */
window.Seed = function () {

  var U = window.Utils;
  var C = window.CONST;
  var t0 = U.today();

  var STAGE_INDEX = {};
  C.STAGES.forEach(function (s, i) { STAGE_INDEX[s.key] = i; });

  /* ---------- 固定种子伪随机：同一套演示数据，刷新不变 ---------- */
  var _s = 20261024;
  function rnd() {
    _s = (_s * 1103515245 + 12345) % 2147483648;
    return _s / 2147483648;
  }
  function ri(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }

  /* ---------------- 团队成员 ---------------- */
  var members = [
    { id: 'u1', name: '张三', role: '门店统筹',   color: '#3f6bf5' },
    { id: 'u2', name: '李四', role: '采购/供应商', color: '#7a5af8' },
    { id: 'u3', name: '王五', role: '广告/物料',   color: '#f79009' },
    { id: 'u4', name: '赵六', role: '培训/人员',   color: '#17b26a' },
    { id: 'u5', name: '孙七', role: '建店/系统',   color: '#06aed4' },
    { id: 'u6', name: '周八', role: '财务/行政',   color: '#f04438' },
    { id: 'u7', name: '吴九', role: '进度审核',    color: '#ef7cab' }
  ];
  var byName = {};
  members.forEach(function (m) { byName[m.name] = m; });

  /* ---------------- 50 家门店（名称 / 省份） ---------------- */
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

  /* 阶段分配：每种阶段都有若干家，凑满 50 家后打散，避免「一片全是一个阶段」 */
  var stagePlan = [];
  [6, 7, 7, 10, 9, 6, 5].forEach(function (cnt, idx) {
    for (var i = 0; i < cnt; i++) stagePlan.push(idx);
  });
  for (var i = stagePlan.length - 1; i > 0; i--) {
    var j = Math.floor(rnd() * (i + 1));
    var tmp = stagePlan[i]; stagePlan[i] = stagePlan[j]; stagePlan[j] = tmp;
  }

  /* 阶段 → 距开业天数区间（负数 = 已经开业） */
  var OPEN_RANGE = [
    [46, 92],   /* 未出图 */
    [36, 62],   /* 已出图 */
    [26, 48],   /* 资料/建档 */
    [14, 35],   /* 施工/装修 */
    [6, 19],    /* 物料/到货 */
    [1, 8],     /* 开业准备 */
    [-30, -2]   /* 已开业 */
  ];
  /* 阶段 → 进度基准（再叠一点抖动） */
  var PROG_BASE = [8, 24, 38, 60, 78, 92, 100];

  /* ---------------- 门店 ---------------- */
  var stores = PLACES.map(function (p, i) {
    var si = stagePlan[i];
    var stage = C.STAGES[si].key;

    var openLeft = ri(OPEN_RANGE[si][0], OPEN_RANGE[si][1]);
    var progress = U.clamp(PROG_BASE[si] + ri(-8, 7), 3, 100);

    /* 风险 = 进度和「离开业还有几天」对不对得上：落后太多就是高危 / 逾期 */
    var risk = 'normal';
    if (si < 6) {
      var expect = U.clamp(100 - openLeft * 1.55, 0, 100);
      var gap = expect - progress;
      if (gap >= 26) risk = 'overdue';
      else if (gap >= 13) risk = 'high';
      else if (gap >= 4) risk = 'attention';
    }

    var owner = members[ri(0, members.length - 1)];

    return {
      id: 'store_' + U.pad2(i + 1),
      name: p[0],
      province: p[1],
      stage: stage,
      risk: risk,
      progress: progress,
      ownerId: owner.id,
      openDate: U.addDays(t0, openLeft),
      address: '',
      remark: '',
      createdAt: U.addDays(t0, -ri(20, 150))
    };
  });

  /* ---------------- 任务：按标准模板为每家门店派活 ---------------- */
  var roleToId = {};
  members.forEach(function (m) { roleToId[m.role] = m.id; });

  var tasks = [];
  stores.forEach(function (store, si) {
    var stageIdx = STAGE_INDEX[store.stage];

    C.TASK_TEMPLATES.forEach(function (tpl, ti) {
      var idx = STAGE_INDEX[tpl.stage];
      var status;

      if (store.stage === '已开业') status = 'done';
      else if (idx < stageIdx) status = 'done';
      else if (idx === stageIdx) status = 'doing';
      else status = 'pending';

      /* 已完成的任务落在过去；在手的任务按阶段往后排 */
      var dueDate;
      if (status === 'done') {
        dueDate = U.addDays(t0, -((stageIdx - idx) * 8 + 2 + (si % 3)));
      } else {
        dueDate = U.addDays(t0, (idx - stageIdx) * 8 + (si % 4));
      }

      /* 高危 / 逾期门店：当前在手任务已经拖期（只拖当前阶段，别把后面的也判死） */
      if (status !== 'done' && idx === stageIdx && (store.risk === 'high' || store.risk === 'overdue')) {
        dueDate = U.addDays(t0, -(3 + (ti % 4)));
      }

      tasks.push({
        id: 'task_' + (si + 1) + '_' + ti,
        storeId: store.id,
        title: tpl.title,
        stage: tpl.stage,
        assigneeId: roleToId[tpl.role] || store.ownerId,
        dueDate: dueDate,
        status: status,
        priority: (store.risk === 'high' || store.risk === 'overdue') ? 'high' : 'normal',
        remark: '',
        createdAt: U.addDays(store.createdAt, ti + 1)
      });
    });
  });

  /* ---------------- 物料到货：每家店 2~6 条，日期各不相同 ----------------
     口径：只认登记的到货时间（etaDate），status 只有 pending（待通知）/ notified（已通知）。
     到货日按「开业日往前推」生成，所以各店自然错开。 */
  var arrivals = [];
  var ai = 0;

  stores.forEach(function (store, si) {
    var stageIdx = STAGE_INDEX[store.stage];
    var openLeft = U.diffDays(t0, store.openDate);

    /* 阶段越靠后，物料条目越多、到货日越贴近开业日 */
    /* 还没有出图 / 刚出图的店，物料还没下单，就不编到货时间了 */
    var count;
    if (stageIdx >= 6) count = ri(3, 5);
    else if (stageIdx === 5) count = ri(4, 6);
    else if (stageIdx === 4) count = ri(3, 6);
    else if (stageIdx === 3) count = ri(1, 3);
    else if (stageIdx === 2) count = ri(1, 2);
    else count = 0;

    /* 到货日 = 开业日往前推，所以每家店的日期天然错开 */
    var spanStart, spanEnd;
    if (stageIdx >= 5) { spanStart = -24; spanEnd = -3; }
    else if (stageIdx === 4) { spanStart = -22; spanEnd = -6; }
    else if (stageIdx === 3) { spanStart = -18; spanEnd = -6; }
    else { spanStart = -32; spanEnd = -24; }

    for (var k = 0; k < count; k++) {
      ai += 1;
      var off = spanStart + Math.round((spanEnd - spanStart) * (count === 1 ? 0 : k / (count - 1)));
      off += ri(-2, 2);

      var eta = U.addDays(store.openDate, off);
      var d = U.diffDays(t0, eta);

      /* 已经过了到货日的，绝大多数早就通知过供应商了，剩少数是漏的 */
      var status;
      if (d < 0) status = rnd() < 0.86 ? 'notified' : 'pending';
      else if (d <= 2) status = rnd() < 0.45 ? 'notified' : 'pending';
      else status = rnd() < 0.12 ? 'notified' : 'pending';

      /* 已开业的店不该还有没通知的物料，统一按已通知 */
      if (store.stage === '已开业') status = 'notified';

      arrivals.push({
        id: 'arr_' + U.pad2(ai),
        storeId: store.id,
        item: C.ITEMS[(si * 3 + k) % C.ITEMS.length],
        qty: 4 + ri(0, 11) * 3,
        etaDate: eta,
        status: status
      });
    }
  });

  /* 少数门店故意留一条「没填到货时间」的，用来演示这种情况不会误报 */
  [2, 9, 23, 38].forEach(function (idx) {
    if (!stores[idx]) return;
    ai += 1;
    arrivals.push({
      id: 'arr_' + U.pad2(ai),
      storeId: stores[idx].id,
      item: C.ITEMS[idx % C.ITEMS.length],
      qty: 12,
      etaDate: '',
      status: 'pending'
    });
  });

  /* ---------------- 发货：每家一条，计划发货日 = 开业前 10 天左右 ---------------- */
  var ship = {};
  stores.forEach(function (store, si) {
    var stageIdx = STAGE_INDEX[store.stage];
    var planDate = U.addDays(store.openDate, -10 + ri(-2, 2));
    var planLeft = U.diffDays(t0, planDate);

    var status;
    if (stageIdx >= 6) status = 'sent';                    /* 已开业 = 早发完了 */
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

  /* 留两家「今天就该发」「明天该发」的，演示当天要怎么用 */
  var demoToday = stores.filter(function (s) {
    var left = U.diffDays(t0, s.openDate);
    return ship[s.id].status === 'todo' && left >= 8 && left <= 24;
  }).slice(0, 2);
  demoToday.forEach(function (s, i) {
    ship[s.id].date = U.addDays(t0, i === 0 ? 0 : 1);
  });

  /* 挑 3 家最近要发、还没发的标成「先发」，让看板一打开就有重点 */
  var near = stores.filter(function (s, i) {
    return ship[s.id].status === 'todo' && U.diffDays(t0, s.openDate) <= 16;
  }).slice(0, 3);
  near.forEach(function (s) { ship[s.id].pin = true; });

  /* 备注示例 */
  if (stores[3]) ship[stores[3].id].note = '等门店确认收货人';
  if (stores[17]) ship[stores[17].id].note = '先发招牌，货架后发';

  /* ---------------- 系统设置 ---------------- */
  var settings = {
    brand: '门店筹建管理系统',
    slogan: '让每一家门店，按时开业！',
    teamName: '阿蛮团队',
    weatherTemp: 26,
    weatherText: '多云',
    warnDays: 3,            /* 距到期 N 天内算「即将到期」 */
    ship: ship
  };

  return {
    meta: { version: 3, createdAt: new Date().toISOString() },
    settings: settings,
    members: members,
    stores: stores,
    tasks: tasks,
    arrivals: arrivals,
    alertsRead: []
  };
};

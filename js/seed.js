/* ==========================================================
   seed.js — 首次打开时生成的演示数据
   日期全部相对「今天」动态计算，所以任何时候打开都不会过期
   ========================================================== */
window.Seed = function () {

  var U = window.Utils;
  var C = window.CONST;
  var t0 = U.today();

  var STAGE_INDEX = {};
  C.STAGES.forEach(function (s, i) { STAGE_INDEX[s.key] = i; });

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

  /* ---------------- 门店（名称 / 省份 / 阶段 / 风险 / 进度 / 负责人） ---------------- */
  var RAW = [
    ['广州天河店',   '广东', '开业准备',  'normal',    85, '张三'],
    ['深圳南山店',   '广东', '施工/装修', 'attention', 68, '李四'],
    ['上海徐汇店',   '上海', '资料/建档', 'high',      42, '王五'],
    ['杭州西湖店',   '浙江', '施工/装修', 'normal',    76, '赵六'],
    ['北京朝阳店',   '北京', '筹备中',    'high',      23, '孙七'],
    ['成都春熙店',   '四川', '物料/到货', 'normal',    58, '李四'],
    ['武汉光谷店',   '湖北', '施工/装修', 'overdue',   37, '王五'],
    ['西安高新店',   '陕西', '开业准备',  'normal',    90, '张三'],
    ['重庆江北店',   '重庆', '筹备中',    'normal',    15, '赵六'],
    ['南京新街口店', '江苏', '资料/建档', 'attention', 60, '孙七'],
    ['苏州工业园店', '江苏', '已开业',    'normal',   100, '张三'],
    ['天津和平店',   '天津', '物料/到货', 'normal',    64, '周八'],
    ['青岛崂山店',   '山东', '筹备中',    'attention', 18, '吴九'],
    ['长沙五一店',   '湖南', '施工/装修', 'normal',    71, '周八'],
    ['郑州二七店',   '河南', '资料/建档', 'normal',    45, '吴九'],
    ['合肥蜀山店',   '安徽', '筹备中',    'normal',    12, '李四'],
    ['福州鼓楼店',   '福建', '物料/到货', 'normal',    55, '王五'],
    ['厦门中山店',   '福建', '施工/装修', 'attention', 73, '赵六'],
    ['昆明五华店',   '云南', '筹备中',    'normal',    20, '孙七'],
    ['南宁青秀店',   '广西', '资料/建档', 'attention', 35, '张三'],
    ['沈阳中街店',   '辽宁', '施工/装修', 'normal',    66, '李四'],
    ['石家庄长安店', '河北', '物料/到货', 'normal',    52, '周八'],
    ['佛山祖庙店',   '广东', '开业准备',  'normal',    88, '吴九']
  ];

  var stores = RAW.map(function (r, i) {
    var progress = r[4];
    var offset = r[2] === '已开业'
      ? -25
      : Math.round((100 - progress) * 0.55) - 5;

    return {
      id: 'store_' + U.pad2(i + 1),
      name: r[0],
      province: r[1],
      stage: r[2],
      risk: r[3],
      progress: progress,
      ownerId: byName[r[5]] ? byName[r[5]].id : 'u1',
      openDate: U.addDays(t0, offset),
      address: '',
      remark: '',
      createdAt: U.addDays(t0, -Math.round((100 - progress) * 0.8) - 10)
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
        dueDate = U.addDays(t0, (idx - stageIdx) * 8 + (si % 3));
      }

      /* 高危 / 逾期门店：当前在手任务已经拖期（只拖当前阶段，别把后面的任务也判死） */
      if (status !== 'done' && idx === stageIdx && (store.risk === 'high' || store.risk === 'overdue')) {
        dueDate = U.addDays(t0, -(3 + (ti % 3)));
      }

      tasks.push({
        id: 'task_' + (si + 1) + '_' + ti,
        storeId: store.id,
        title: tpl.title,
        stage: tpl.stage,
        assigneeId: roleToId[tpl.role] || store.ownerId,
        dueDate: dueDate,
        status: status,
        priority: store.risk === 'high' || store.risk === 'overdue' ? 'high' : 'normal',
        remark: '',
        createdAt: U.addDays(store.createdAt, ti + 1)
      });
    });
  });

  /* 再补一条历史逾期（合肥蜀山店的资料建档一直没交） */
  var extra = tasks.find(function (t) {
    return t.storeId === 'store_16' && t.status === 'pending';
  });
  if (extra) {
    extra.dueDate = U.addDays(t0, -2);
    extra.status = 'doing';
  }

  /* ---------------- 物料到货记录 ---------------- */
  var arrivals = [];
  var ai = 0;

  /* 过去 7 天已到货（用于到货趋势图） */
  var pastCounts = [4, 6, 9, 8, 11, 7, 14];
  pastCounts.forEach(function (cnt, di) {
    for (var k = 0; k < cnt; k++) {
      ai += 1;
      arrivals.push({
        id: 'arr_' + ai,
        storeId: stores[(ai * 3) % stores.length].id,
        item: C.ITEMS[ai % C.ITEMS.length],
        qty: 10 + (ai * 7) % 40,
        etaDate: U.addDays(t0, -(6 - di)),
        status: 'arrived'
      });
    }
  });

  /* 未来 7 天待到货 */
  var futureCounts = [1, 2, 1, 0, 2, 1, 1];
  futureCounts.forEach(function (cnt, di) {
    for (var k = 0; k < cnt; k++) {
      ai += 1;
      arrivals.push({
        id: 'arr_' + ai,
        storeId: stores[(ai * 5) % stores.length].id,
        item: C.ITEMS[ai % C.ITEMS.length],
        qty: 8 + (ai * 5) % 30,
        etaDate: U.addDays(t0, di + 1),
        status: 'pending'
      });
    }
  });

  /* ---------------- 系统设置 ---------------- */
  var settings = {
    brand: '门店筹建管理系统',
    slogan: '让每一家门店，按时开业！',
    teamName: '阿蛮团队',
    weatherTemp: 26,
    weatherText: '多云',
    warnDays: 3            /* 距到期 N 天内算「即将到期」 */
  };

  return {
    meta: { version: 2, createdAt: new Date().toISOString() },
    settings: settings,
    members: members,
    stores: stores,
    tasks: tasks,
    arrivals: arrivals,
    alertsRead: []
  };
};

/* ==========================================================
   constants.js — 业务常量（阶段、风险、任务模板）
   ！！！这里改门店阶段 / 风险等级 / 任务模板最方便 ！！！
   ========================================================== */
window.CONST = {

  STORAGE_KEY: 'shopbuild.v1',

  /* ---- 门店筹建阶段（顺序即推进顺序，不要随意调换） ----
     这是「出厂默认」，运行时会由 Store 用 settings.stages 覆盖 C.STAGES：
     用户在「任务管理 → 阶段时间线」里加 / 改名 / 删除 / 排序后，C.STAGES 就是当前生效的那份，
     原始出厂值留在 STAGE_BUILTIN（下面会拷贝一份），用来兜底和取内置配色。
     二级（子阶段）在时间线或筹建任务清单里加，存 settings.stageSubs，
     任务的 stage 存成 "一级 / 二级" */
  STAGES: [
    { key: '未出图',    color: '#98a2b8', soft: '#eef1f6' },
    { key: '已出图',    color: '#6b7cf0', soft: '#eef1fe' },
    { key: '资料/建档', color: '#7a5af8', soft: '#f2effe' },
    { key: '施工/装修', color: '#f79009', soft: '#fef4e6' },
    { key: '物料/到货', color: '#3f6bf5', soft: '#edf2fe' },
    { key: '开业准备',  color: '#06aed4', soft: '#e4f8fd' },
    { key: '已开业',    color: '#17b26a', soft: '#e6f8ef' }
  ],

  /* 出厂就带好的二级（只有从没保存过二级时才会用它；
     你在时间线 / 清单里改过之后，一切以 settings.stageSubs 为准） */
  DEFAULT_STAGE_SUBS: {
    '已出图': ['已做首批', '未做首批']
  },

  /* 一级与二级之间的分隔符（阶段名里本身带 /，所以两边留空格来区分） */
  STAGE_SEP: ' / ',

  /* ---- 每个阶段的「建议提前天数」：开业前多少天就该做完 ----
     例：广告物料建议提前 10 天，门店 11-30 开业 → 11-20 前必须发出去；
         今天 11-21（距开业只剩 9 天 < 10）这条任务就算逾期。
     逾期不靠手填截止日期，全部按「门店计划开业日 - 提前天数」实时算，
     门店开业日一改，所有任务的建议完成日自动跟着挪。
     阶段名改了 / 新加了阶段，在这里补一行即可；没配的按 LEAD_DAYS_DEFAULT 算。 */
  LEAD_DAYS: {
    '未出图': 62, '设计阶段': 62, '设计': 62,
    '已出图': 45, '图纸': 45,
    '资料/建档': 50, '建档资料': 50, '资料建档': 50,
    '施工/装修': 32, '装修施工': 32, '施工': 32,
    '物料/到货': 12, '发货阶段': 12, '发货': 12,
    '广告物料': 10, '物料': 10,
    '开业准备': 4, '准备开业': 4,
    '已开业': 0, '闭店': 0
  },
  /* 阶段名被改过（比如「图纸设计」「量房出图」）时，按关键词兜底，别掉到默认 30 天。
     从上往下匹配、命中第一个就用它的提前天数 —— 所以长词、具体的词必须排在前面，
     否则「广告物料」会被「物料」抢走，提前天数就小了。 */
  LEAD_KEYWORDS: [
    ['广告物料', 10], ['开业准备', 4], ['准备开业', 4], ['已开业', 0],
    ['闭店', 0], ['撤店', 0], ['关店', 0], ['停业', 0],
    ['资料', 50], ['建档', 50], ['备案', 50],
    ['出图', 45], ['图纸', 45],
    ['设计', 62], ['量房', 62], ['勘察', 62],
    ['施工', 32], ['装修', 32], ['进场', 32],
    ['物料', 12], ['到货', 12], ['发货', 12]
  ],

  LEAD_DAYS_DEFAULT: 30,

  /* ---- 结束类阶段：不参与「筹建进度」的分母 ----
     进度只算筹建阶段：6 个筹建阶段 → 每个 16.7%，「准备开业」= 100%。
     排在「准备开业」后面的「已开业 / 闭店」属于收尾状态，多少家都不影响百分比，
     否则准备开业会被摊成 6/8 = 75%。
     改名了就把新名字补进来（按一级阶段名精确匹配）。 */
  PROGRESS_END_STAGES: ['已开业', '闭店', '撤店', '关店', '停业', '已闭店'],

  /* ---- 风险等级 ---- */
  RISKS: {
    normal:    { key: 'normal',    label: '正常', color: '#17b26a', soft: '#e6f8ef' },
    attention: { key: 'attention', label: '关注', color: '#dba005', soft: '#fdf6e3' },
    high:      { key: 'high',      label: '高危', color: '#f79009', soft: '#fef4e6' },
    overdue:   { key: 'overdue',   label: '逾期', color: '#f04438', soft: '#feeceb' }
  },

  /* ---- 任务状态 ---- */
  TASK_STATUS: {
    pending: { key: 'pending', label: '未完成', color: '#98a2b8', soft: '#eef1f6' },
    doing:   { key: 'doing',   label: '未完成', color: '#3f6bf5', soft: '#edf2fe' },  /* 已废弃：流程里只有做完 / 没做完 */
    done:    { key: 'done',    label: '已完成', color: '#17b26a', soft: '#e6f8ef' },
    overdue: { key: 'overdue', label: '已逾期', color: '#f04438', soft: '#feeceb' },
    risk:    { key: 'risk',    label: '风险任务', color: '#f79009', soft: '#fef4e6' }
  },

  /* ---- 标准任务模板：每开一家店自动派这几件事 ----
     before = 距离开业日期提前多少天到期 */
  TASK_TEMPLATES: [
    { title: '门店选址与商圈评估确认', stage: '未出图',    before: 62, role: '售前' },
    { title: '工商执照办理与资料建档', stage: '资料/建档', before: 50, role: '接单' },
    { title: '装修施工与消防验收',     stage: '施工/装修', before: 32, role: '接单' },
    { title: '门头招牌与灯箱制作',     stage: '施工/装修', before: 24, role: '售前' },
    { title: '首批物料到店清点',       stage: '物料/到货', before: 12, role: '售后' },
    { title: '开业活动与人员到岗',     stage: '开业准备', before: 4,  role: '售后' },
    { title: '开业前整体巡检与验收',   stage: '开业准备', before: 2,  role: '接单' }
  ],

  /* ---- 到货物料清单 ---- */
  ITEMS: [
    '货架与展柜', '门头招牌', '收银设备', '首批货品',
    '陈列道具', '监控安防', '包装物料', '照明灯具'
  ],

  /* 省级行政区（常用省份靠前，下拉里先看到） */
  PROVINCES: [
    '广东', '浙江', '江苏', '上海', '北京', '天津', '重庆', '四川',
    '湖北', '陕西', '山东', '湖南', '河南', '安徽', '福建', '云南',
    '广西', '辽宁', '河北', '山西', '吉林', '黑龙江', '江西', '贵州',
    '海南', '内蒙古', '新疆', '甘肃', '宁夏', '青海', '西藏',
    '香港', '澳门', '台湾'
  ],

  /* 省份拼音，用于下拉里输入拼音首字母也能找（shanxi 山西 / shaanxi 陕西 不会混） */
  PROVINCE_PINYIN: {
    '广东': 'guangdong', '浙江': 'zhejiang', '江苏': 'jiangsu', '上海': 'shanghai',
    '北京': 'beijing', '天津': 'tianjin', '重庆': 'chongqing', '四川': 'sichuan',
    '湖北': 'hubei', '陕西': 'shaanxi', '山东': 'shandong', '湖南': 'hunan',
    '河南': 'henan', '安徽': 'anhui', '福建': 'fujian', '云南': 'yunnan',
    '广西': 'guangxi', '辽宁': 'liaoning', '河北': 'hebei', '山西': 'shanxi',
    '吉林': 'jilin', '黑龙江': 'heilongjiang', '江西': 'jiangxi', '贵州': 'guizhou',
    '海南': 'hainan', '内蒙古': 'neimenggu', '新疆': 'xinjiang', '甘肃': 'gansu',
    '宁夏': 'ningxia', '青海': 'qinghai', '西藏': 'xizang',
    '香港': 'xianggang', '澳门': 'aomen', '台湾': 'taiwan'
  }
};

/* ==========================================================
   阶段的分级工具：任务/清单里的 stage 可能是
     "施工/装修"            → 只挂一级
     "施工/装修 / 水电"     → 挂到二级
   ========================================================== */
(function (C) {
  /* 出厂阶段的副本：C.STAGES 运行时可被替换，这份永远不动，用来兜底 */
  C.STAGE_BUILTIN = C.STAGES.map(function (x) {
    return { key: x.key, color: x.color, soft: x.soft };
  });

  /* 新建一级阶段时按顺序取色（先用没被占的） */
  C.STAGE_PALETTE = [
    { color: '#7a5af8', soft: '#f2effe' },
    { color: '#f79009', soft: '#fef4e6' },
    { color: '#3f6bf5', soft: '#edf2fe' },
    { color: '#06aed4', soft: '#e4f8fd' },
    { color: '#17b26a', soft: '#e6f8ef' },
    { color: '#ef7cab', soft: '#fdeef4' },
    { color: '#dba005', soft: '#fdf6e3' },
    { color: '#0ea5a5', soft: '#e6f7f7' },
    { color: '#8e5bd0', soft: '#f4eefc' },
    { color: '#98a2b8', soft: '#eef1f6' }
  ];

  /* 拆成 { base, sub } */
  C.stageSplit = function (v) {
    var s = String(v == null ? '' : v);
    var i = s.indexOf(C.STAGE_SEP);
    if (i < 0) return { base: s, sub: '' };
    return { base: s.slice(0, i), sub: s.slice(i + C.STAGE_SEP.length) };
  };

  /* 一级 + 二级 → 存库用的字符串 */
  C.stageValue = function (base, sub) {
    return sub ? String(base) + C.STAGE_SEP + String(sub) : String(base || '');
  };

  /* 显示用："施工/装修 · 水电" */
  C.stageLabel = function (v, sep) {
    var p = C.stageSplit(v);
    return p.sub ? p.base + (sep || ' · ') + p.sub : p.base;
  };

  /* 取一级的配色定义 */
  C.stageDef = function (v) {
    var base = C.stageSplit(v).base;
    var hit = null;
    C.STAGES.forEach(function (x) { if (x.key === base) hit = x; });
    return hit;
  };

  /* 是不是一级阶段名（用于校验） */
  C.isStage = function (v) {
    return !!C.stageDef(v);
  };
})(window.CONST);

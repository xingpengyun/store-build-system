/* ==========================================================
   constants.js — 业务常量（阶段、风险、任务模板）
   ！！！这里改门店阶段 / 风险等级 / 任务模板最方便 ！！！
   ========================================================== */
window.CONST = {

  STORAGE_KEY: 'shopbuild.v1',

  /* ---- 门店筹建阶段（顺序即推进顺序，不要随意调换） ---- */
  STAGES: [
    { key: '筹备中',    color: '#98a2b8', soft: '#eef1f6' },
    { key: '资料/建档', color: '#7a5af8', soft: '#f2effe' },
    { key: '施工/装修', color: '#f79009', soft: '#fef4e6' },
    { key: '物料/到货', color: '#3f6bf5', soft: '#edf2fe' },
    { key: '开业准备',  color: '#06aed4', soft: '#e4f8fd' },
    { key: '已开业',    color: '#17b26a', soft: '#e6f8ef' }
  ],

  /* ---- 风险等级 ---- */
  RISKS: {
    normal:    { key: 'normal',    label: '正常', color: '#17b26a', soft: '#e6f8ef' },
    attention: { key: 'attention', label: '关注', color: '#dba005', soft: '#fdf6e3' },
    high:      { key: 'high',      label: '高危', color: '#f79009', soft: '#fef4e6' },
    overdue:   { key: 'overdue',   label: '逾期', color: '#f04438', soft: '#feeceb' }
  },

  /* ---- 任务状态 ---- */
  TASK_STATUS: {
    pending: { key: 'pending', label: '待处理', color: '#98a2b8', soft: '#eef1f6' },
    doing:   { key: 'doing',   label: '进行中', color: '#3f6bf5', soft: '#edf2fe' },
    done:    { key: 'done',    label: '已完成', color: '#17b26a', soft: '#e6f8ef' },
    overdue: { key: 'overdue', label: '已逾期', color: '#f04438', soft: '#feeceb' },
    risk:    { key: 'risk',    label: '风险任务', color: '#f79009', soft: '#fef4e6' }
  },

  /* ---- 标准任务模板：每开一家店自动派这几件事 ----
     before = 距离开业日期提前多少天到期 */
  TASK_TEMPLATES: [
    { title: '门店选址与商圈评估确认', stage: '筹备中',    before: 62, role: '门店统筹' },
    { title: '工商执照办理与资料建档', stage: '资料/建档', before: 50, role: '财务/行政' },
    { title: '装修施工与消防验收',     stage: '施工/装修', before: 32, role: '建店/系统' },
    { title: '门头招牌与灯箱制作',     stage: '施工/装修', before: 24, role: '广告/物料' },
    { title: '首批物料到店清点',       stage: '物料/到货', before: 12, role: '采购/供应商' },
    { title: '开业活动与人员到岗',     stage: '开业准备', before: 4,  role: '培训/人员' },
    { title: '开业前整体巡检与验收',   stage: '开业准备', before: 2,  role: '进度审核' }
  ],

  /* ---- 到货物料清单 ---- */
  ITEMS: [
    '货架与展柜', '门头招牌', '收银设备', '首批货品',
    '陈列道具', '监控安防', '包装物料', '照明灯具'
  ],

  PROVINCES: [
    '广东', '浙江', '江苏', '上海', '北京', '天津', '重庆', '四川',
    '湖北', '陕西', '山东', '湖南', '河南', '安徽', '福建', '云南',
    '广西', '辽宁', '河北'
  ]
};

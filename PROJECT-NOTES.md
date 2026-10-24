# 门店筹建管理系统 · 项目长期笔记

## ⚠️ 2026-10-22 架构变更：已升级为云端多人协作版

- 数据不再存 localStorage，改为**云端 PostgreSQL**（WorkBuddy 云服务）
- `applicationId`：`wbapp_JwWrDm3Xy5kxdaiR11r7FM`
- 线上地址：`https://store-build-system.app.workbuddy.link/?sharecode=ZVHDE3E4G6`
- 5 张表：`stores` / `tasks` / `members` / `arrivals` / `app_settings`
- 新增文件：`js/cloud.js`（云端层）、`js/login.js` + `css/login.css`（登录）、`js/vendor/cloud-sdk.js`（本地化的云 SDK，不走 CDN）
- `js/store.js` 已重写：**云端优先**，localStorage 降级为离线缓存 + 首次迁移来源
- 登录开关：`js/cloud.js` 顶部 `AUTH_MODE`，`'simple'`（admin/123）或 `'phone'`（短信验证码）
- 权限模型：5 张表都是「团队共享」，策略 `FOR ALL TO authenticated, anon USING (true)`

> 下方「硬约束」第 3 条（数据只能落 localStorage）**已作废**，其余条目仍然适用。
> 「数据模型要点」仍然有效，只是存储位置换成了云端表。

## 定位
纯前端单页管理工具，仿用户提供的截图（深色侧边栏 + 浅色卡片式仪表盘）。
用户会持续迭代改，改动要小步、可回滚、保持文件职责清晰。

## 硬约束（改代码时必须遵守）
1. **不用 ES Module / import export**。全站用普通 `<script>` + 全局命名空间（`window.Utils` / `window.Store` / `window.UI` / `window.Charts` / `window.Pages`）。
   原因：要能双击 `index.html` 以 `file://` 打开，ESM 在 file:// 下会因 CORS 直接失败。
2. **不引任何 CDN / 第三方库**。图表是手写 SVG + CSS（`js/charts.js`），图标是内联 SVG path（`js/ui.js` 的 `PATHS`）。公司内网可能无外网。
3. **数据只能落在 localStorage**，key = `shopbuild.v1`，读写集中在 `js/store.js` 的 `load()` / `save()`。接后端时只改这两个函数。
4. **页面模块统一接口**：`{ title, render(), mount(root), onEnter(params) }`，注册到 `window.Pages.<路由名>`，路由名必须同时出现在 `js/app.js` 的 `ROUTES` 数组里。
5. 脚本加载顺序写在 `index.html` 底部：utils → constants → seed → store → charts → ui → page-* → app。顺序不能乱。

## 2026-10-23 交互变更：清单动作从「开始 / 完成」改成「推送」

- 筹建清单每行只剩一个动作：未完成 → **推送**，已完成 → **重开**（「开始 / 进行中」那套流转取消，点推送就等于完成）
- 点推送 = 这条任务置 `done` + 把门店阶段往前推，弹窗里选目标阶段：
  - 目标阶段列出**门店当前阶段之后的全部阶段**（默认选中下一个），允许**跳阶段**
    —— 现实里常见「门店先给了建档资料、图纸还没设计好」
  - 目标阶段带二级时（如 已出图 → 已做首批 / 未做首批）**必须再选一支**，没选不允许提交
  - 还有一项「只标记完成，阶段不动」，给同一阶段挂了好几条清单时用
- 门店自己的二级存 `settings.storeSubs = { storeId: '已做首批' }`。
  `stores` 表没有这一列，放 settings 里就能跟着云端同步，不用改表结构
- 入口函数：`js/page-tasks.js` → `actionHtml()` / `openPush()`；`js/store.js` → `storeSub()` / `setStoreStage()`
- **口径**：门店阶段只表示「最新进展到哪儿」，不代表前面每件事都做完了；
  没做完的事仍然靠那条任务继续挂待办 / 逾期，不会因为跳阶段被抹掉

## 2026-10-23 进度口径：一个筹建阶段一格，最后一格 100%

- 进度 = 门店停在第几个**筹建阶段** ÷ 筹建阶段总数，只看位置，不看清单完成度、不管二级
- 6 个筹建阶段 → 每格 16.7%：设计阶段 17% / 已出图 33% / 建档资料 50% / 发货阶段 67% / 广告物料 83% / 准备开业 **100%**
- **结束类阶段不计入分母**（`CONST.PROGRESS_END_STAGES`：已开业 / 闭店 / 撤店 / 关店 / 停业 / 已闭店）
  - 否则「准备开业」会被摊成 6/8 = 75%
  - 门店停在结束类阶段 → 直接算 100%（筹建部分已走完）
- 新店不用做前面的事：直接推到「广告物料」就是 83%
- 阶段增删 / 改名 / 排序后分母自动重算；旧值（已删阶段）→ 0%
- 带二级的阶段值（`已出图 / 未做首批`）按一级阶段算
- 入口：`js/store.js` → `storeProgress()`（`pct / idx / total / at / ended / isEnd / label`）、`progressTip()`、`progressStages()`、`isEndStage()`

## 2026-10-23 逾期口径：开业日 − 这条任务的「开业前 N 天」（以筹建任务清单为准）

- **建议完成日 = 门店计划开业日 − 这条任务的开业前 N 天**；**今天 > 建议完成日 且没完成 → 逾期**
  - 例：aaa 店 11-15 开业，清单里「设计是否出图」填 30 天 → **10-16 前要出图**；今天 10-23 已过 10-16，没做完就是逾期
  - 例：同一家店「已发送广告物料」填 7 天 → 11-08 前；今天还没到，不算逾期
- **N 的来源（`taskBeforeOf()`，全系统唯一口径）**：
  1. `settings.taskBefore[任务id]` —— 这条任务单独调过（任务表单里的「开业前（天）」）
  2. 任务对象上的 `before`（老数据）
  3. 按标题去筹建任务清单 `settings.taskTemplates` 里找同名项的 `before`
  4. 都对不上（手建的任务、标题改过）→ `CONST.LEAD_DAYS_DEFAULT`（30 天）兜底

### 2026-10-24 删掉「逾期倒推口径」那张卡：天数只认清单

- 设置页原来那张「逾期倒推口径」（按每个阶段配一个默认提前天数）**整块删了** ——
  清单里每条任务本来就有自己的「开业前(天)」，再按阶段记一份是重复的，改了还容易打架
- 连带删掉的：`CONST.LEAD_DAYS`（阶段默认天数表）、`CONST.LEAD_KEYWORDS`（阶段名关键词兜底）、
  `Store.saveLeadDays()` / `Store.setLeadDays()`、`settings.leadDays`
  —— 云端 `app_settings` 里已存的旧 `leadDays` 值**不再读取，也不做迁移**（零表结构改动）
- 现在的口径一句话：**建议完成日 = 门店计划开业日 − 清单里这条任务填的开业前天数**
  - 例：门店 11-15 开业、清单填 30 天 → 10-16 前必须完成，**10-17 起**才算逾期
- `leadDaysOf()` 保留，但它现在只负责返回兜底的 30 天（参数留着是为了调用点不用改）
- **门店没填开业日期 → 不编日期、不判逾期**：`suggestDateOf()` 返回空，`dueDate` 也留空，
  任务表显示「未设开业日 / 开业前 30 天 · 填了开业日就自动倒推」；补上开业日立刻按日期倒推
- 门店开业日一改（含清空）→ 这家店所有任务日期重算（`resyncTaskDates`）；改阶段默认天数 → 全量重算
- 派发任务时把清单里的 `before` 写进 `settings.taskBefore`（云端 tasks 表没这一列，不改表结构）；
  之后改清单只影响新派发的任务，已有任务的天数不会被动
- 改阶段时：任务自己的天数是「自己定死的」就不动，原本跟着阶段默认走的才按新阶段重算
- 任务状态只有两类：未完成 / 已完成（「进行中」废弃，历史值读成未完成）
- 筹建清单的筛选只剩 全部 / 逾期 / 风险 / 已完成；任务表列名改为「建议完成」，显示「建议日期 + 开业前 N 天 · 距开业 X 天」
- 入口：`js/store.js` → `taskBeforeOf / suggestDateOf / daysLeftOf / suggestFor / classify / setTaskBefore / leadDaysOf`

### 逾期后怎么办：「+3天」（往后放，3 天后再提醒）

- 逾期只有两种处理：是我们的原因 → 点「推送」做掉；**不是我们的原因 / 老板不着急 → 点「+3天」**
- 实现：`settings.taskSnooze = { 任务id: 已延后天数 }`，**不删日期、不改开业前天数**
  - `建议完成日 = 开业日 − 开业前 N 天 + 已延后天数`，逾期判断改看日期：`今天 > 建议完成日`
  - 点一次 +3 天，可重复点累加；挪完还没到期就不再算逾期（逾期 tab、统计、首页重点都同步消失）
  - 过了新日期又自动变回逾期 —— 这就是「3 天后再提醒」
- 按钮：`actionHtml()` 里**只有逾期行**出现橙色「+3天」；已延后且还没到期的行显示灰色「延后 N 天」，点一下撤销
- 撤销（`unsnoozeTask`）回到原定日期；删除任务时顺手清掉 `taskSnooze / taskBefore` 里的残留
- 改开业日 / 改开业前天数时延后天数不会被抹掉（`resyncTaskDates` 用 `suggestDateOf`，不是 `suggestFor`）
- 入口：`js/store.js` → `snoozeMap / snoozeDaysOf / snoozeTask / unsnoozeTask`；`js/page-tasks.js` → `actionHtml`


## 2026-10-23 物料到货：只认登记的到货时间，提前 7 天通知供应商

> 口径（用户定死）：**在途 / 到店都不管、不记，到货也不确认**。整个物料环节只有两件事：
> 记下对方给的到货时间 → 到货日往前 7 天通知供应商发货，通知完点「已通知」。

- 一条物料只有一个时间字段 `etaDate`（**登记的到货时间**），没有任何「在途 / 已到店」过程状态
  - 改日期 = 对方给了新承诺（延期就这么改），不是新建一条
  - `addArrival` **不再兜底 today+N**：没填就留空，绝不替门店编一个日期（编了就会误报 / 漏报）
- 口径：**到货日 − `CONST.ARR_WATCH_DAYS`（默认 7 天）就该通知供应商发货**
  - 门店说 11-10 到货 → **11-03** 就要打电话让对方安排发货
  - 过了到货日还没通知 → 「漏通知」高危，赶紧让对方发、顺便要个新的到货时间
- 「关注」在三个地方同时可见：
  1. **清单行**：7 天内的行标橙（左侧橙条 + 浅橙底），已过期的标红；日期后面直接跟倒计时「还有 4 天 / 过 2 天 / 今天到」
  2. **清单顶部小结**：`共 9 项 · 漏通知 1 · 该通知 3（7 天内到）· 还早 3 · 已通知 2`
  3. **提醒中心**：`arrsoon-<id>`（「该通知供应商」，3 天内升 high）、`arrlate-<id>`（「漏通知」，danger）
- 唯一的「结案」动作：列头「通知」下的按钮 **「通知供应商」→「✓ 已通知」**（`status: pending / notified`）
  —— 它记的是「我已经打过电话让对方发货了」，**不是「已到货」**；点错了再点一下改回待通知
  - 历史数据 `status='arrived'`（旧版「已到货」）用 `Store.arrNotified()` 统一按「已通知」处理，不需要迁移
  - 已通知的条目不再进「漏通知 / 该通知供应商」统计，也不占用看板「登记到货（最早）」
- 排序：未到的在前（按到货日升序，过期和快到的自然浮上来）→ 没填日期的 → 已到的沉底
- **第一列「物料 / 供应商」定好就不能改，也没有下拉**（2026-10-24，用户要求「不要求能选择固定的」）
  - `<select>` 也去掉了，换成普通文本框：**填好失焦后就地锁上**（`readOnly` + 去掉 `is-new`，不整表重绘，Tab 去备注栏的光标不会被打掉）
  - 只有「+ 添加物料」产生的新行第一格能打字，聚焦落在上面；老行 / 一键添加 / 快捷 chip 进来的行生来就是只读
  - 想换物料 = 删掉这行重新加；要维护常用词条去「系统设置 → 到货物料清单」
  - `addArrival` 的 item 兜底是 `''`（空物料名 = 还没填的新行），别把没填的也存成"物料"
- **列顺序：物料 → 备注 → 数量 → 登记的到货时间 → 通知 → 删**（2026-10-24 用户要求「备注在物料后面，然后数量--到货日期」）
  - 中间那列「备注」就在物料后面
  - 存 `settings.arrRemarks = { 到货id: '文本' }`，跟 taskBefore / taskSnooze 一个路子：
    跟着 app_settings 整包上云，**不改表结构**
  - 打字只更新内存和本地缓存，停 500ms 才推云端（`Store.setArrRemark`）；关弹窗时 `flushArrRemarks()` 兜一次
  - 删除物料行时顺手清掉它的备注，不留孤儿
- **到货时间直接打字，不再用日期选择器**（2026-10-24）
  - 输入框从 `type="date"` 换成普通文本框，`10/25`、`10-25`、`10.25`、`10月25`、`1025`、
    `2026/10/25`、`20261025`、`26/10/25` 都能认（`Utils.parseDateLoose()`）
  - 不带年份 → 补当年；算出来比今天早超过半年（1 月录入 10/25）→ 自动当明年的
  - 失焦 / 回车才解析落库，打到一半的「10/」不会写进数据；认不出来弹提示并恢复原值
  - 显示：当年的只显示「10-25」，跨年的带年份「2027-01-05」；底层永远存完整 `YYYY-MM-DD`
- 排版：一行 30px（输入框 26px、表头 11px、按钮 24px），日期 + 倒计时同一行（`.arr-eta`）
- 入口：`js/constants.js` → `ARR_WATCH_DAYS`；`js/page-stores.js` → `arrList / arrDays / arrWatch / arrBody`；
  `js/store.js` → `arrNotified / addArrival / alerts()` 里的 `arrlate / arrsoon`；`css/components.css` → `.arr-tbl / .arr-tag / .arr-sum`
- 首页 / 报表的「近 7 天到货趋势」改成「近 7 天到货量」：按登记的到货日统计所有物料，跟通没通知无关

## 2026-10-23 发货看板：几十家店谁先发、谁漏了，一屏看完

> 背景：门店一多（几十家待发货），「谁今天该发、谁已经逾期、这批先发哪家」靠人记必然漏。
> 每天早上只要打开「发货看板」这一页，顺序就是当天该干的顺序。

- **状态只有两态**（`CONST.SHIP_STATUS`，存 `settings.ship[门店id].status`）：`todo 未发出` / `sent 已发出`
  - 点胶囊**一次翻转**，没有「待备货 / 待发货 / 在途 / 已到店」这些中间和后续环节
  - 老数据兼容：`normShipStatus()` 把 `ready → todo`、`done → sent` 并过来
  - 切到「已发出」时只留痕记 `sentAt`（不参与任何计算，在途几天我们不关心）
- **两列并排看，都是「有没有到点」**：
  - `计划发货`（`settings.ship[门店id].date`）：逾期未发 / 今天该发 / 3 天内即将发 / 没排期
  - `登记到货（最早）`：取**还没通知**的物料里最早的 `etaDate` + 倒计时，副行写「N 项漏通知 / N 项该通知 / 已通知 N」
    —— 这一列才是要每天盯的，`漏通知` 和 `该通知供应商` 都从这里算；全部通知完就显示「全部已通知」
- **都不编日期**：没填发货日 → 只标「没排期」不判逾期；没填到货时间 → 不显示倒计时、不提醒
- **排序 = 未发出的在前 → 先发标记 → 手动顺序 → 计划发货日 → 名字**，已发出的沉到底
  - ★ `pin`：点一下排到最前（「这几家必须今早先发」）
  - ↑↓：交换相邻两位，然后把当前整表顺序固化成 `seq`（`writeShipSeq`）
  - 「按发货日重排」= `clearShipSeq()` 清掉 seq，回到自动排
- **防漏五层**：
  1. 行左侧色条（红=逾期、橙=今天）+ 日期下方「逾期 2 天 / 今天必须发」
  2. 到货列：红「过 2 天」+ 副行「N 项过了到货日」
  3. 顶部横幅「N 家过了计划发货日还没发，M 家物料过了登记的到货日…」+「只看这几家」
  4. 提醒中心 `shiplate-` / `shiptoday-` / `shipsoon-` / `shipnone-` + 物料侧 `arrlate- / arrsoon-`
  5. 首页 hero 下面那条「发货：…」+ chip（逾期未发 / 漏通知 / 今天该发 / 该通知供应商 / 还没发出 / 已发出）
- 5 个 KPI 可点：未发出 / 逾期未发 / 今天该发 / 该通知供应商 / 漏通知；7 个 tab 同口径
- 排版：一行 45px、表头 sticky、表体 `max-height: calc(100vh - 356px)` 自己滚，
  1440×900 一屏 10 家店不用滚页面
- 数据放 `settings.ship`（走 app_settings 整包上云），**不改 stores 表结构**，同事打开看到同一份
- 入口：`js/constants.js` → `SHIP_STATUS / SHIP_WATCH_DAYS`；`js/store.js` → `normShipStatus / shipOf / setShip / toggleShipSent / shipRows / shipStats / moveShip / toggleShipPin / clearShipSeq`；
  `js/page-ship.js`（整页）；`js/page-home.js` → `shipBarHtml()`；`css/components.css` → `.ship-* / .se-* / .home-ship`
- 路由：`js/app.js` 的 `ROUTES` 必须包含 `'ship'`，否则 `App.go('ship')` 会掉回首页

## 2026-10-24 「按到货日」视图：一家店几个日期，也一条不漏

> 背景：一家店的物料到货时间是**各不相同**的（货架 10-20、灯箱 10-28、首批货品 11-02），
> 「按门店」一屏只能看到每家的**最早**那条，其余日期的物料看不见，几十家店就更容易漏。
> 解决：发货看板顶部加了视图切换 `按门店 / 按到货日`。

- `按到货日` 把**所有门店 × 所有物料**拍平成一条条，按登记的 `etaDate` 分组：
  - 分组顺序 = **过了到货日还没通知的（最急，最旧的在上）→ 今天 → 未来（升序）→ 没填日期 → 过去已通知完的历史（倒序）**
  - 每个日期头：`10.24 星期六 · 当天 · 7 条 · 5 家店 · 1 条没通知`
  - 每条：门店（点进去看详情）· 物料 × 数量 · 距开业 N 天 · `待通知 / ✓ 已通知` 按钮（点一下翻转）
  - 过去的整组只有「还有没通知的」才标红；全通知过的只是灰色历史，不制造噪音
- 顶部 5 个 KPI / 6 个 tab 同口径：待通知 / 漏通知 / 今天到 / 7 天内到 / 没填日期 / 已通知
- 搜索同时匹配门店、省份、物料名、负责人
- 视图状态在 `state.view`（模块内，不落库）；切页不重置，回到发货看板还是上次那个视图
- 入口：`js/store.js` → `arrivalRows()`（拍平 + 排序）；`js/page-ship.js` → `dStats / filteredDates / groupByDate / dateTableHtml / dateRowHtml / dayState`；
  `css/components.css` → `.ship-views / .ship-view / .sd-*`

## 2026-10-24 演示数据换成 50 家门店（随机但固定种子）

- `js/seed.js` 整个重写：**50 家门店**，阶段按 `6/7/7/10/9/6/5` 分配到 7 个阶段后打散
  - 开业日按阶段落在 `−30 ~ +92 天`；进度 = 阶段基准 + 抖动
  - 风险不再随机：拿「进度」和「离开业还有几天该有的进度」比，落后越多越高危（`normal → attention → high → overdue`）
  - 物料：按阶段生成 0~6 条/店（未出图不生成），到货日 = 开业日往前推 18~24 天，所以**每家店的日期天然错开**（约 50 个不同日期、125 条记录、38 家店有物料）
  - 已过到货日的 86% 已是 `notified`，留少数做「漏通知」；4 家故意留一条**没填到货时间**的
  - 发货：计划发货日 = 开业日 − 10 天（±2）；已开业 / 过往计划大部分已发；固定留 2 家「今天 / 明天该发」、3 家打 ★先发
  - 伪随机用固定种子（`_s = 20261024`），**每次生成的数据完全一样**，刷新不会跳
- 生成入口：`系统设置 → 数据 → 清空云端并生成 50 家演示门店`（会先 `Cloud.wipeAll()` 再 `importAll(Seed())`，同事看到的是同一份）
- 门店管理仍按 10 家/页分页；50 家时用搜索 / 阶段 / 省份筛选更快

## 2026-10-24 看板一行铺开「所有物料到货时间」+ 发出后接下一个流程

> 用户反馈：门店那列右边一大片空白，50 家店要一家家点进去才知道哪天到货；
> 而且全部发完之后这页就没话说了，不知道该干什么。

- **补满空白列**：`物料 · 登记的到货时间` 这一列把**这家店所有物料**（不是只取最早那条）铺成小胶囊：
  - 胶囊格式 `10.28 货架 ×15 4天后`（日期加粗 → 物料名 × 数量 → 倒计时）
  - 颜色：红=过了到货日还没通知 / 橙=7 天内到该通知供应商 / 灰=已通知 / 虚线=没填日期
  - 一行最多 5 个，多的折成 `+N 条`（点它进门店详情看全部）；表头带图例
  - 这样 50 家店在「按门店」视图里就能看到每家每条的到货日，不用点开
  - 数据来自 `shipRows()` 新增的 `mats[]`（已按「未通知在前 + 日期升序」排好）
- **登记的发货时间**：发出后，`发出 / 下一步` 列多一个**可改的日期框**（`settings.ship[门店id].sentAt`）
  - 当天忘了点「已发出」、第二天补点也不会记错日期，直接改这个框
  - 左边计划发货列同步显示「已发 N 天 / 今天发出」
- **发完自动接下一环**：已发出的行在日期框下面写 `物料 11.6 到` / `补物料时间` / `N 天后开业` / `已开业`
  - 全部发完时顶部横幅换成绿色 `N 家全部发出去了，发货这一环结束 → 下一个流程：盯物料到货`
    + 按钮「按到货日跟进 →」直接切到时间线视图
- 表结构：`顺序 / 门店·开业 / 物料·登记的到货时间 / 计划发货 / 发出·下一步 / 备注 / ↑↓`
  （原来的「登记到货（最早）」列并进物料列，`.ship-eta / .se-*` 样式随之删除）
- 行高不再固定 45px（胶囊会换 2 行），已发出的行透明度从 .58 提到 .82，信息还看得清
- 入口：`js/store.js` → `shipRows().mats / sentAgo`；`js/page-ship.js` → `matsHtml / nextText / nextTip / leftText`；
  `css/components.css` → `.ship-mats / .sm-chip / .th-legend / .ship-sent-date / .ship-next / .ship-banner.is-done`

## 2026-10-24 任务管理页：门店行默认收起，点一家自动收起别家

> 用户反馈：门店卡片一进来就展开，两家一开页面被撑得很长，几十家翻不动。

- 门店明细改成**手风琴（一次只开一家）**：`Pages.tasks` 的 `state.open` 从「对象表」改成**单个门店 id**（`''` = 全收起）
  - `state.open = st.id` 对齐 `storeRowHtml()` 里的 `open` 判断
  - 点行首 → `toggleStoreRow(root, sid)`：同一家 → 收起；别家 → 换它展开
  - 每次 `onEnter()` 都重置成 `''`，从别的页面跳进来也是全部收起；带 `{store}` / `{task}` 参数除外（只开那一家）
- 换开会带走滚动位置：收起的那家如果在上面，列表整体缩上去、刚点的行会「跳」。
  `toggleStoreRow()` 先记下被点这行的 `getBoundingClientRect().top`，重绘后再按差值 `window.scrollBy(0, delta)` 补回来，点哪儿就停在哪儿
- 回到列表页顶不用找：展开的那家整行会有 `.sk-row.open` 的边框 + 阴影，箭头随之翻转
- **点中的那家要「深一档」**：抬头（`.sk-row.open .sk-head`）铺 `#dfe9fd` 蓝底 + 上面两个圆角，
  整行底色 `#fafcff`，左边加 3px 主色竖条（`.sk-row.open::before`，绝对定位，不吃布局宽度）
  - 竖条不能用 `box-shadow: inset`：会画在父级背景层，被子元素（抬头/明细）的背景盖住，看不见
  - 未展开的行只做 `#f7faff` 的 hover 淡底，不抢眼
- 入口：`js/page-tasks.js` → `state.open / toggleStoreRow() / storeRowHtml() / onEnter()`；
  `css/components.css` → `.sk-row.open / .sk-row.open::before / .sk-row.open .sk-head`

## 2026-10-24 事故与修正：「演示门店」把真实工作流一起删了

> 用户反馈：我只是想添加门店数据，为什么阶段时间线、筹建任务清单、物料供应商都没了？

**原因（两个 bug 叠加）**

1. 设置页那个「清空云端并生成 50 家演示门店」调的是 `Cloud.wipeAll()`，
   它把 `app_settings` 整张表删掉 —— 而**阶段时间线（`settings.stages` / `stageSubs`）、
   筹建任务清单（`settings.taskTemplates`）、到货物料清单（`settings.arrivalItems`）、
   各阶段提前天数（`settings.leadDays`）全都存在这张表的那一条 JSON 里**，一并没了。
   随后 `Seed()` 再塞数据，等于用演示配置把真实配置顶掉。
2. `Store.resolveStages()` 用 `key.indexOf('/')` 过滤阶段名，而「资料/建档」「施工/装修」
   「物料/到货」本身就带斜杠 → 只要 `settings.stages` 保存过一次，下次加载就只剩 4 个阶段。
   分隔符其实两边带空格（`C.STAGE_SEP = ' / '`），校验必须用它，不能用裸 `/`。

**现在的规则（改代码时别破坏）**

- **配置与业务数据彻底分开**：门店 / 任务 / 到货 / 发货计划算业务；阶段、二级、筹建清单、
  物料清单、提前天数、系统设置算配置。任何「加数据 / 清数据」的操作只能碰业务。
- 设置页按钮拆成两个，都不碰配置：
  - `addDemo` → `Seed({count:50})` + `S.addDemoStores(bundle)` → 只 upsert stores/tasks/arrivals
  - `clearStores` → `S.clearBusiness()` → `Cloud.wipeBusiness()`（只删三张业务表）
  - 原来的 `reset`（wipeAll + importAll）**已从界面移除**，注释留在 `page-settings.js` 里
- `Seed()` 变成「按当前配置生成」：阶段读 `settings.stages`、任务读 `Store.templates()`、
  物料读 `Store.items()`、负责人用现有成员（系统里一个人都没有才用演示成员），
  **不再返回 members / settings.brand**，只返回 `{stores,tasks,arrivals,ship}`。
  阶段数量也是动态摊（权重曲线），加了阶段不会再越界或漏掉。
- `templates()` 是「0 条就是 0 条」语义（不自动兜底），所以 `Seed()` 内部单独兜底出厂 7 条，
  只影响演示数据，不回写配置。
- **配置快照**：`Store.snapshotSettings(reason)` 把 settings 存 localStorage
  （`shopbuild.v1.setting-snap`，最多 5 份，内容相同不重复存）。加载时、加演示门店前、
  清空业务前、整库导入前各存一次。`settingsSnapshot()` 会挑「比现在更全」的那一份，
  `restoreSettingsSnapshot()` 只回写配置，不动门店任务。
- 整库导入（`importJSON`）也补了保护：备份文件里**没有**某个配置键时，保留现在这份，
  不会再把阶段 / 清单 / 物料清空；文件里明确写了空数组才算「我就是要空」。
- 设置页新增「我的工作流配置」卡片：阶段 / 清单 / 物料 / 成员 四个数字 + 一键
  「恢复标准工作流」（`Store.restoreWorkflow()`：7 阶段 + 已出图二级 + 7 条任务 + 8 项物料）
  + 「恢复 xx 的配置快照」。
- 回归测试：`chk-config-safety.js`（45 项，含「wipeAll 一次都没调」「加了演示数据后
  配置字符串不变」「带斜杠阶段名不丢」）。

## 数据模型要点
- 门店 `stage` 只能取 `CONST.STAGES` 的 key；`risk` 只能取 `CONST.RISKS` 的 key
- 任务 `status` 只有 `pending` / `doing` / `done` 三种
- **「已逾期」是派生状态**（门店有开业日时：`今天 > 开业日 − 任务的开业前 N 天 + 已延后天数`；没开业日不判逾期），不落库，由 `Store.classify()` 算
- `classify()` 返回五种：`done` / `doing` / `pending` / `overdue` / `risk`
- 「风险」= 所属门店 risk 为 high/overdue，且任务未完成

## 常见改动入口
| 需求 | 文件 |
|---|---|
| 阶段名/顺序/颜色、风险等级、任务模板、物料清单 | `js/constants.js` |
| 统计口径（首页和报表的数字怎么来的） | `js/store.js` → `stats()` |
| 预警规则 | `js/store.js` → `alerts()` |
| 演示数据 | `js/seed.js`（日期相对 today 动态算） |
| 配色/间距/圆角 | `css/base.css` 顶部变量 |

## 验证方法（改完必跑）
1. 语法：`for f in js/*.js; do node --check "$f"; done`
2. 视觉：Edge 无头截图，比装 agent-browser 轻量得多
   ```
   msedge.exe --headless=new --disable-gpu --hide-scrollbars --no-sandbox \
     --user-data-dir=<临时目录> --window-size=1600,1120 \
     --virtual-time-budget=4000 --screenshot=<out.png> "http://127.0.0.1:8765/#/<路由>"
   ```
   Edge 路径：`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`
3. 预览服务：`python -m http.server 8765`
4. DOM 层回归：jsdom 装在 `C:\Users\Hp\.workbuddy\binaries\node\workspace`，
   注意 jsdom 的 `hashchange` 是异步的，切路由要手动 `dispatchEvent(new Event('hashchange'))`。

## 当前已知待优化
- 团队工作台右侧进度条偏窄（卡片约 285px），百分比数字已隐藏，靠颜色+长度表达
- 预警中心 40 条左右未做分页，滚动偏长
- 任务标题按模板批量生成，同质化明显，后续可加自定义任务库

## 交付形式
用户会跨电脑（家里 / 公司）继续改，文件必须能整包拷走。`README.md` 里有完整结构与改动指引。

## 2026-10-24 发货看板只留未通知 + 设置页卡片可点 + 报表页改版（?v=20261024z34）

**① 发货看板（按门店视图）：已通知的不再占位，只列未通知并高亮**（用户：「已通知的不用在此处显示，只显示未通知，且高亮提示一下吧，现在灰灰的看不清楚」）
- `matsHtml()` 先 `filter(!m.notified)` 再渲染；`+N 条` 也只数未通知的
- 全部通知完的门店显示绿色「物料都通知过了 · 共 N 项」，不再显示误导的「还没录物料」
- 高亮：默认 chip 从灰底（`--card-2` + 半透明）改成**白底深字加粗边框**；`is-late` 红 / `is-soon` 琥珀 / `is-nodate` 紫色虚线（原来没日期是灰的，现在看得见）
- 表头图例「已通知」换成「没填日期」；物料过了到货日还没通知的行整行淡红底 + 左侧红条（`tr.is-arrlate`）
- 「按到货日」视图**不变**（那边有独立的「已通知」tab / KPI，是历史查阅入口）；页脚文案说明去哪看历史

**② 设置页「我的工作流配置」4 张卡全部可点**（用户问：工作流数据不能随便删，点卡片能不能直接去调整）
- `data-cfg="stages|tpl|items|members"`，hover 变主题色，脚注带「去调整 →」
- 阶段时间线 → 跳任务管理（左侧就是时间线，toast 提示怎么改名/加二级/拖排序）
- 筹建任务清单 → 跳任务管理后 420ms 自动点 `[data-act="tpl"]` 弹出清单弹窗
- 团队成员 → 跳团队工作台；到货物料清单 → 本页内 `scrollIntoView` + `.cfg-flash` 呼吸光圈
- CSS：`.cfg-go / .cfg-arrow / .cfg-flash`（`@keyframes cfgFlash`）

**③ 报表页改版**（用户：当月开店数量 + 和上月环比 + 省份门店分布 + 各阶段门店分布和任务分布；近 7 天到货量不需要了）
- 新增 KPI「当月开店」（第 5 张，`repeat(5,…)`）：当月按计划开业日的家数，脚注「上月 N 家 · 环比 ±X%」
- 新增卡「当月开店与环比」：本月/上月两个大数字 + 环比徽章（涨红跌绿，上月为 0 时说「新增 N 家」不说百分比）+ 近 6 个月开店数柱图
- 「近 7 天到货量」整块删除（`st.trend` 报表页不再用，首页还在用所以 store.js 里保留）
- 省份门店分布独立成卡；保留 各阶段门店分布 + 任务状态分布 / 开业排期 / 成员待办负荷 / 风险等级分布
- 口径：当月 = `openDate.slice(0,7) === 今天所在月`；`ymShift()` 做月份平移（跨年正确）

## 2026-10-24 报表页去掉「任务状态分布」（?v=20261024z35）
用户看截图后：「这个也取消吧」（和「近 7 天到货量」一样取消）。

- 「各阶段门店分布」卡片下半截的「任务状态分布」环形图整块删除（donutItems / donutLegend 计算 + 渲染 + dl-row 图例）
- 版面微调：省份门店分布上移到第一行，和各阶段门店分布作伴；当月开店与环比 → 第二行和开业排期作伴（每行两卡内容量更接近，不留半张空卡）
- 首页的同名环形图**不动**（用户只针对报表页）；`Charts.donut` 和 `.donut-*` CSS 都保留给首页用
- 报表页现有内容：5 个 KPI（门店总数/当月开店/平均进度/任务完成率/风险门店）+ 当月开店与环比 + 近 6 个月柱图 + 各阶段门店分布 + 省份门店分布 + 开业排期 + 成员待办负荷 + 风险等级分布

## 2026-10-24 设置页去掉「恢复标准工作流」（?v=20261024z36）
用户看设置页截图：「我这个就是默认工作流，不用恢复默认工作流」。

- `data-act="restoreWorkflow"` 按钮 + 底部 lead-foot 里的说明文案整块删除
- `store.js` 的 `restoreWorkflow()` 函数和导出一起删（无其他调用点）；`C.STAGE_BUILTIN` / `C.DEFAULT_STAGE_SUBS` 常量保留（Seed 和 normalized 还在用）
- 「筹建任务清单为空」的黄色警告块保留，但文案改为引导「点上面『筹建任务清单』卡牌进去添加」，不再指向恢复按钮
- 「恢复 xx 的配置快照」按钮**保留**（有快照才出现，是误删配置的退路，用户没要求删）；lead-foot 改成整体条件渲染，没快照时连操作条都不显示
- CSS `.cfg-warn` / `.lead-foot` 保留（快照按钮和警告块还在用），只改了注释

## 2026-10-24 设置页提示行「不贴框 + 颜色淡」（?v=20261024z37）
用户截图标注两处：「UI上也该一下，不要和框挨着，颜色也淡一些」。

- **间距**：`.item-hint`（长按删除提示）`margin: 9px 0 0` → `10px 0 8px`，上下都留空；
  `.lead-foot`（快照恢复条）`margin-top: 12px` → `margin: 16px 0 6px`，不再贴卡牌区和卡片下边框
- **颜色**：新增 `--text-4: #bcc5d6`（比 `--text-3 #9aa5bd` 更淡，只给这类辅助提示用，不动全局），
  两处提示文字都换成它；恢复条里的按钮也淡一格（透明底 + `--text-3` 淡字，hover 才显主题色）
- ⚠️ **修了一个 z34 引入的 CSS 结构损坏**：`.lead-foot {` 选择器行在 f26e86b 里就被误删了
  （只剩孤立声明块），导致该规则完全失效、Chrome 错误恢复还连带吞掉了 `.lead-foot-tip` 的颜色。
  已补回选择器；并加了全文件括号深度扫描确认无其他孤儿声明

## 2026-10-24 首页 KPI 标注「风险门店 / 逾期任务」判断逻辑（?v=20261024z38）
用户截图问：主页上的风险门店和逾期任务，帮忙标注一下判断逻辑。

- 「风险门店」「逾期任务」两个 KPI 的标签旁加 ⓘ 图标（`UI.icon('info')`，PATHS 新增 info），
  hover / 键盘聚焦（tabindex=0 + :focus）弹出判断逻辑浮层 `.kpi-help-pop`（白底阴影 + 小箭头，254px）
- **风险门店口径**：门店档案里「风险等级」为「高危」或「逾期」的门店；占比 = 风险门店数 ÷ 门店总数；「关注」不算；等级在门店详情手动维护
- **逾期任务口径**（对齐 `Store.classify()` 返回 overdue）：没做的任务里今天已过「建议完成日」；
  建议完成日 = 门店计划开业日 − 该任务的开业前天数（`taskBeforeOf`：settings.taskBefore → 任务.before → 清单同名项 → 兜底 30 天，可单条「+3天」延后）；
  门店没填开业日不硬判逾期；占比 = 逾期数 ÷ 全部任务数（含已完成）
- 其余 4 个 KPI 不加图标，避免视觉噪音
- ⚠️ `.kpi-label` 去掉了 `overflow:hidden + text-overflow:ellipsis`——否则会裁掉 absolute 定位的浮层
  （标签最长 6 字，卡片宽度足够，不影响）
- 验证：Node 断言 CSS 规则 9 项 + 真 Chromium 探针 14 项，全 PASS / 0 报错
  （hover 态在 headless 下无法合成，改用 Node 读 CSS 源文件断言 hover/focus 规则）

## 2026-10-24 KPI ⓘ 更显眼 + 可点击（?v=20261024z39）
用户反馈截图红箭头：「标注到哪里了呀」——ⓘ 太小太淡，还得刚好 hover。

- ⓘ 颜色从淡灰 `--text-3` 改为**各自 KPI 的主题色**（风险门店橙 / 逾期任务红，内联 style 传入），12→13px，hover/展开时加浅底色圆晕
- **支持点击**：点 ⓘ 固定展开、再点收起；两个之间互斥；点浮层内容不关（方便选中文字）；点页面别处自动收起
- **一次性引导**：首次进首页 toast「提示：KPI 标签旁的 ⓘ 点一下（或鼠标放上去）能查看判断逻辑」，`localStorage['sbs.kpiHelpTip']` 记住，之后不打扰
- CSS `.kpi-help` 改 `cursor: pointer`、新增 `.kpi-help.is-open .kpi-help-pop` 显示规则组
- 验证 14 项 PASS / 0 报错（点击展开/互斥/点内容不关/点别处收起/主题色/pointer）

## 2026-10-24 删掉任务页时间线的「清单 N 条」标签（?v=20261024z40）
用户确认解释后：「这个不需要帮我删掉吧」。

- `page-tasks.js` `railHtml()` 删两处渲染：一级阶段 meta 里的 `tl-tpl`（截图红箭头那处）+ 二级阶段行的 `tl-tpl`；随之删掉 `tpl` / `tplBase` / `tplN` 三个变量
- `store.js` 的 `templateStageStat()` + 导出一并删（全站确认无其他调用点）
- CSS `.tl-tpl` / `.tl-num .tl-tpl` 删除
- 二级阶段行若既无门店也无未完成任务，右侧显示「—」（原来的兜底）
- 验证 12 项 PASS / 0 报错（tl-tpl 元素 0 个、无「清单 N 条」文字、7 个阶段节点正常、Store.templateStageStat 已移除、展开二级不崩、首页/设置页无回归）

## 2026-10-24 发货看板删「计划发货」列 + 维护入口搬门店详情（?v=20261024z41）
用户：图1「计划发货」列不需要了（点开门店已有每项物品的发货/到货时间），让图2「物料·登记的到货时间」列显示更多。

- `page-ship.js`：按门店视图删「计划发货」列（th + ship-plan td + data-date 事件 + repaintRow 死函数 + `.ship-plan/.ship-date/.ship-left` CSS）；`MAT_MAX` 5 → 8（物料列从 ~500px 涨到 745px，一行铺更多 chip）
- **配套**：`page-stores.js` 门店详情物料区（arr-sum 上方）新增「计划发货日」行（`.arr-ship-row`）：date 输入 + 状态提示（已过 N 天/今天该发/还有 N 天/还没排/已发出），写同一份 `settings.ship[storeId].date`（`S.setShip`），看板排序/逾期预警/「按发货日重排」全部照旧
- 页脚「N 家还没填发货日」补了「（发货日在门店详情的物料区改）」的指引
- 验证 21 项 PASS / 0 报错（6 列对齐、物料列宽 745>168、无 ship-plan/data-date、详情弹窗回填+改期落库+提示更新、看板/预警无回归）

## 2026-10-24 阶段编辑功能搬到设置页（?v=20261024z42）
用户：「这个帮我改到设置里面吧， 在这看着太乱了， 都挡住多少家的显示了」
（指任务管理页左侧阶段时间线 hover 出的 ✎ 改名 / ✕ 删除 / ＋ 加二级 工具条和按住行的拖排序把手。
 图2 空白，用户说重新发图——「任务列表也加备注」的需求还等着，未实现。）

- `page-tasks.js`：时间线变成纯展示 + 点击筛选。删掉 `state.editing`/`editingStage`、
  `subAddRowHtml()`/`stageAddRowHtml()`、一级/二级的全部编辑 UI（`tl-tools`/`tl-op`/`tl-add-top`）、
  6 个管理函数（`commitStage`/`renameStageDlg`/`removeStageDlg`/`commitSub`/`renameSub`/`removeSub`）、
  `bindStageDrag()` 拖排序、mount 里对应的 9 个 click 分支和 keydown/focusout 两个监听器。
  `tl-hint` 改为「点阶段看门店…要加 / 改 / 删阶段，去系统设置 → 阶段与子阶段」。
- `page-settings.js`：新增「阶段与子阶段」管理卡（`stageCard()`，位于「我的工作流配置」和「到货物料清单」之间）：
  - 一级阶段行：`.sm-grip` 拖手柄 + 阶段色点 + 名称 + 用量（几家门店/几条任务/几条清单）+ hover 工具条 `.sm-tools`（✎ ✕ ＋）
  - 二级缩进在 `.sm-subs` 里，hover 出 ✎/✕；二级列表用 `Store.stageSubsWithUsed()`（和任务页时间线同一套三源并集）
  - 底部「添加一级阶段」；行内新建用 `smState.addStage`/`addSub` 两个开关，回车存、Esc 收起、失焦有值自动存
  - 改名/删除弹窗、指针拖排序逻辑从任务页原样搬来（`S.saveStageOrder` 落库）
  - 「我的工作流配置」卡里的「阶段时间线」卡牌改为滚动到本卡 + 高亮闪烁（不再跳任务页）
- `components.css`：删 `.tl-tools`/`.tl-add`/`.tl-op`/`.tl-sub-add`/`.tl-sub-inp`/`.tl-sub-ok`/`.tl-add-top`/`.tl-top-add`/`.tl-dragging`/`body.tl-sorting` 全套；新增 `.sm-*` 一节
- `store.js` **修了一个既有 bug**：`renameStage()` 迁移二级 key 时，`stageSubs()` 是按当前 `C.STAGES` 过滤的，
  而 `applyStages()` 已经先把旧名换掉了 → 旧 key 读不到 → 该阶段下的二级被孤立成看不见的旧名（改名后二级从时间线上消失）。
  改成「applyStages 之前读、之后存」（`saveStageSubs` 的清洗同样按 `C.STAGES` 过滤，新 key 必须等生效后再落盘）。
  `removeStage()` 删二级定义的同一处时序问题一并修掉。
- 验证 41 项 PASS / 0 页面报错（任务页无任何编辑按钮/输入框且筛选照旧；设置页加一级/加二级/一级改名带二级同步/二级改名/删二级两条路径/删一级/拖排序；其余 6 个页面无回归）

## 2026-10-24 阶段编辑搬回任务页时间线（?v=20261024z51）

用户拉取公司电脑那 18 个提交后第一句话：「怎么少东西了」——选的是「时间线的编辑按钮」。
上一版（z42）把 ✎ / ✕ / ＋ 和新建输入行整体搬去设置页，任务页只留筛选；实际用起来离开阶段本身太远。

- `page-tasks.js`
  - `state` 加 `addStage`（加一级阶段输入行开着没）、`addSub`（给哪个一级阶段加二级，存阶段名）
  - 恢复 `stageAddRowHtml()` / `subAddRowHtml()`，「全部阶段」右边常显一个 `data-stage-row` 的 ＋
  - 一级行末尾恢复 `.tl-tools`（✎ 改名 / ✕ 删除 / ＋ 加二级，hover 出）；二级行恢复 `.tl-op`（✎ / ✕）
  - 新增 `focusIn / commitStageInput / commitSubInput / nameDlg / renameStageDlg / removeStageDlg / renameSubDlg / removeSubDlg`
    —— 全部调 Store 现成接口（`addStage` / `renameStage` / `removeStage` / `saveStageSubs` / `renameStageSub` / `removeStageSub`），
    和设置页那张「阶段与子阶段」卡是同一套，两处改动互相同步
  - **click 分支顺序是重点**：`[data-stage-edit]/[data-stage-del]/[data-sub-add]/…` 必须排在 `[data-sub]`、`[data-stage]` 之前，
    否则点工具按钮会顺手把阶段筛选也切掉
  - 输入行回车存、Esc 收起（`keydown` 监听只认 `data-stage-inp` / `data-sub-inp`，不干扰顶部搜索框）
  - 加二级时自动把该阶段选中（`state.stage = base`），否则二级区不展开、输入框没地方显示
- `components.css`
  - 恢复 `.tl-tools` / `.tl-add` / `.tl-op` / `.tl-top-add` / `.tl-sub-add` / `.tl-sub-inp` / `.tl-sub-ok` 一套
  - `.tl-all .tl-add-top` 用 **`.tl-all` 前缀**提高权重：否则被后面的 `.tl-add{opacity:.55}` 盖掉，符号淡到看不见
  - `.tl-add-top` 改为常显（淡蓝底 `#dfe9fd`），不再只 hover 才出来 —— 之前等于没有入口
  - 窄屏（≤1180 单列）给 `.tk-rail` 加 `order:-1`：时间线排到门店列表**上面**，
    之前跟在列表后面，一屏看不到就以为「时间线没了」
- 验证 `chk-tl-edit.js` 20 项全过（7 个阶段都有 ✎/✕/＋；加一级；加二级并自动选中；二级改名；一级改名带门店同步；
  删二级；删一级；点阶段名仍是筛选不误触）；`chk-accordion` / `smoke` / `chk-config-safety` 无回归
  （后者的 `restoreWorkflow` 断言按新版删除该入口跳过，快照断言改成实际的 3 条清单 / 2 项物料）

> **⚠️ 已被 z54 撤销**：用户认为编辑只该在设置页，任务页时间线恢复为纯筛选（见文末「时间线回归纯筛选」）。

## 2026-10-24 导航对调 + 「活泼一档」主题层（?v=20261024z53）

用户原话：「任务管理和发货看板对调一下；整体风格我希望更活泼一些，现在颜色都有点淡，交互逻辑也提升一下吧」

### 一、导航对调
- `index.html` 侧边栏：任务管理挪到发货看板前面，顺序变成
  首页 → 门店管理 → **任务管理** → **发货看板** → 团队 → 预警 → 报表 → 设置
- `js/app.js` 的 `ROUTES` 同步改成同一顺序（它只做白名单，但保持一致，省得以后翻代码误判）

### 二、新增 `css/theme.css`（最后一个加载，整层可一键回滚）
设计取舍：**只盖颜色 / 圆角 / 阴影 / 反馈动效，不动任何布局**（grid、flex、断点一律不碰），
所以出问题只需要删掉 `index.html` 里 `<link ... theme.css>` 这一行，立刻回到老配色。

1. **色板整体加深一档**（`base.css` 的变量在这里重定义）
   - 底色 `#f2f5fa → #e8edf9`，并叠三团彩色光晕（蓝 / 紫 / 薄荷，`background-attachment: fixed`）
   - 主色 `#3f6bf5 → #2f56f0`，配 `--primary-grad`（蓝→紫）给按钮 / 选中项 / 竖条共用
   - 语义色统一提到饱和度更高的一档：绿 `#0aa564`、橙 `#e97a06`、红 `#e83a2f`、紫 `#6d3fe8`、青 `#0190bf`
   - 文字 `--text #0e1830`、`--text-2 #55627d`、`--text-3 #828da6`（原来的 3 级灰太淡，看不清）
2. **"活泼"的具体手段**
   - 侧边栏：深靛蓝渐变 + 顶部径向高光；选中项蓝紫渐变 + 同色投影
   - 每张卡标题前一道 3px 渐变竖条（`.card-head h3::before`），页头 `h1` 前一道 5px 的
   - KPI 图标用 `currentColor` 做同色投影（`box-shadow: 0 10px 18px -12px currentColor`），
     不用改 JS 也能让六个图标各自发光
   - 横幅（`.ship-banner`）由淡底改成实色图标 + 同色描边；阶段图例选中态改渐变胶囊
   - 标签页选中态改蓝紫渐变 + 白字（计数徽章跟着变半透明白）
3. **交互反馈**
   - 按钮 hover 上浮 1px + 投影、`:active` 回弹 `.985`；主按钮渐变加了外发光
   - 表格行 hover `#f4f8ff`、表头底色 `#eef3fd`；发货看板表头钉住时改用不透明底
   - 表单 hover 边框加深、focus 走 `--ring` 统一光圈
   - 全局细滚动条；`:focus-visible` 只在链接 / 按钮 / `[tabindex]` 上出现（**不要给输入框套**，会和它自己的高亮叠成双层框 —— 登录页踩过）
   - 导航选中时 `navPop` 轻弹一下；`prefers-reduced-motion` 下全部动效关掉
   - 侧边栏收到图标条（861–1180px）时，hover 用 `data-tip` 浮出文字：以前这段宽度只有 8 个图标，新同事猜不到哪个是发货看板
4. **常量配色同步**（`js/constants.js`）
   - `STAGES` / `STAGE_PALETTE` / `RISKS` / `TASK_STATUS` / `SHIP_STATUS` 全部换成新色板；
     `page-home.js` 的 6 个 KPI、`page-alerts.js` 的三档也一起换
   - **`store.js` 的 `resolveStages` 改成「内置颜色优先」**：
     `color: (d && d.color) || (x && x.color)` —— 否则老用户 `settings.stages` 里存着的旧淡色会一直盖住新主题，
     改了常量等于没改。自定义阶段的颜色仍然以自己存的为准。

### 三、验证
- 新增 `chk-theme.js` 16 项全过：导航顺序 / 每项有 data-tip / theme.css 最后加载 / ROUTES 一致 /
  常量已换新色 / 旧 settings 的淡色被新配色覆盖 / 自定义阶段颜色保留
- `smoke.js` 八个页面全部渲染、`chk-accordion.js`、`chk-tl-edit.js`、`chk-config-safety.js` 无回归
- 真实浏览器截图：首页改前改后对比、发货看板、任务管理、门店、报表、窄屏（1040 图标条）、登录页

---

## 2026-10-24（续）「无法访问此网页」——启动方式改成零依赖

### 一、现场诊断（真实浏览器，不是静态检查）
用 Edge headless + CDP 逐页跑：`home / stores / tasks / ship / team / alerts / reports / settings` **8 页全部 PASS**，
控制台零报错；任务页 `.sk-row` 1 行默认收起、`.tl-tools` 8 个编辑入口都在。
直接双击 `index.html`（`file://`）也能进首页，admin / 123 进去后正常渲染 —— **代码本身没问题**。

问题出在启动方式：

| 现象 | 原因 |
|---|---|
| 浏览器报「无法访问此网页 / 拒绝连接」 | `start-server.bat` 里 `where python` 失败 → 窗口一闪而过 → 服务根本没起来 |
| 这台机器的真实 PATH | 只有 `C:\Windows\system32` 等系统目录加一个 WindowsApps，**python 和 node 都不在** |
| 旧版兜底 | `start "" index.html` 打开的是 `file://`，地址栏不是 `127.0.0.1:8765`，再按 F5 就是拒绝连接 |

### 二、改法：四级兜底，一级比一级更不依赖环境
`start-server.bat` 重写（纯 ASCII，避免代码页把中文路径搞乱）：
1. `python -m http.server` —— 有 python 就用
2. `py -m http.server` —— 有 py launcher 就用
3. `node -e "...单行 http 服务..."` —— 有 node 就用
4. **`serve.ps1`（新增）** —— 三样都没有时，用 Windows 自带的 PowerShell `HttpListener` 起静态服务

`serve.ps1` 的关键点：
- 端口被占自动往后顺延 20 个（8765 → 8766 → …）；**服务起成功之后**才开浏览器，不再有「浏览器先开、服务还没好」的竞态
- 正确 MIME（css / js / svg / woff2 …）+ `Cache-Control: no-store`，改完刷新就能看到新样式
- 路径穿越防护：`GetFullPath` 之后必须仍在项目目录内，否则 403
- 监听失败 `exit 2`，bat 接住后打印提示并打开 `index.html` 兜底；正常退出才 `pause`
- 支持 `start-server.bat nobrowser`：只起服务、不开窗口（自测用）

### 三、顺手修掉
- `index.html` 加了内联 SVG favicon（`rel="icon"` 用 data URI），控制台最后那条 favicon 404 消失

### 四、验证
- `serve.ps1` 在 8766、8767（8765/8766 被占时自动顺延）均返回 200，MIME 正确，不存在的路径返回 404
- 在 `serve.ps1` 起的服务上把 8 个页面重跑一遍，全部 PASS
- 干净 PATH（`C:\Windows\system32;C:\Windows`）下确认 python / py / node 三者全部 NOT FOUND，即必然走第 4 级

### 五、仍未完成
- GitHub 推送：`git ls-remote origin main` 仍是 `CONNECT tunnel failed, response 502`（代理挡了 github.com:443）。
  本地已领先 3 个提交，网络恢复后执行：
  `git fetch origin && git rebase --onto origin/main c8444c7 && git push origin main`

---

## 2026-10-24 时间线回归纯筛选（?v=20261024z54）

用户原话：「阶段时间线里面的添加和二级添加怎么还在呢，不是已经转移到设置里面了吗」。
即：阶段维护的**唯一入口**是「系统设置 → 阶段与子阶段」，任务页时间线只做筛选，不留任何编辑痕迹。

### 一、任务页删掉的（`js/page-tasks.js`）
- `state.addStage` / `state.addSub` 两个状态位
- `stageAddRowHtml()` / `subAddRowHtml()` 两段输入行
- 一级行 `.tl-tools`（✎ 改名 / ✕ 删除 / ＋ 加二级）、二级行 `.tl-op`（✎ / ✕）
- 「全部阶段」右边的常显 ＋（`data-stage-row`）
- `focusIn / commitStageInput / commitSubInput / nameDlg / renameStageDlg / removeStageDlg / renameSubDlg / removeSubDlg`
  整块函数（约 180 行）
- `mount()` 里 `[data-stage-row] / [data-stage-ok] / [data-stage-edit|del] / [data-sub-add|ok|edit|del]` 七个 click 分支
- 整段 `keydown` 监听（只为那两个输入行的回车 / Esc 存在）
- 提示文案改为「阶段与二级阶段在这里只做筛选，增删改在「系统设置 → 阶段与子阶段」里维护」

### 二、CSS 同步清理（`css/components.css`）
- 删掉 `.tl-tools` / `.tl-add` / `.tl-add-top` / `.tl-op` / `.tl-top-add` / `.tl-sub-add` / `.tl-sub-inp` / `.tl-sub-ok`
  一整段（约 155 行），以及只为绝对定位服务的 `.tl-line{position:relative}`、`.tl-sub{position:relative}`
- 保留 `.tl-line` 的 flex 基础样式（时间线的排版还靠它）

### 三、验证（新增 `chk-tl-readonly.js`，真实浏览器里点）
26 项全过：11 项确认编辑入口已消失（`[data-stage-row]`/`[data-sub-add]`/`[data-stage-edit]`/`[data-stage-del]`/
`[data-sub-edit]`/`[data-sub-del]`/`.tl-add`/`.tl-tools`/`.tl-op`/输入行 全为 0）、提示文案指向设置页、
点阶段筛选与再点取消、二级展开与二级筛选、门店手风琴默认收起与点开、
设置页仍有 8 个阶段行 + 「添加一级阶段」+ 改名 / 删除 / 加二级。
`smoke.js` 8 页、`chk-accordion.js`、`chk-config-safety.js`、`chk-theme.js` 无回归。
旧的 `chk-tl-edit.js` 断言的是 z51 的行为，已改名为 `chk-tl-edit.retired.js` 退役，不再跑。

### 四、注意
设置页那张卡默认是**展开**的（`smState.collapsed` 默认 false），用户进去直接就能加，不用先点开。

---

## 2026-10-24 时间线圆点重叠 + 去掉「给他派任务」（?v=20261024z55）

### 一、圆点重叠：不是文字压文字，是白圈把选中态戳了个洞
用户截图指着两处：圆点压住「未完成 5」、圆点啃掉选中行左边那条主色竖条。实测盒模型（Edge CDP 取 `getBoundingClientRect`）：

| 元素 | 修前 | 说明 |
|---|---|---|
| `.tl-node` | `padding-left: 1px`，grid `14px 1fr`，gap 10 | 行内左侧只有 1px 余量 |
| `.tl-dot` | 12×12，`margin-top:4px`，`box-shadow: 0 0 0 3px var(--card)` | 白圈向外扩 3px |
| 结果 | 圆点 x=246，行左沿 x=244 | **光圈 3px 伸到行外**，盖住 `.tl-node.on` 的 `inset 3px` 主色竖条 |
| 叠加 | `theme.css` 给 `.on` 上的是浅蓝渐变底（`#e7edff`） | 白圈压在浅蓝底上 = 一圈白洞 |

修法（只改数值，不动结构）：
- `.tl-node { padding: 12px 9px 13px 7px; grid-template-columns: 16px minmax(0,1fr); gap: 9px; }`
- `.tl-dot` 缩到 11×11、光圈 2.5px，正好塞进 16px 那一列
- **光圈跟着行底色走**：默认白 `var(--card)`、hover `#f5f8fd`、选中 `#e7edff`（`theme.css` 渐变的起始色）。
  这条是关键 —— 以前一个白圈打天下，压到任何有底色（hover / 选中）的行上都会出现「洞」
- `.tl-nodes::before`（竖线）`left: 8px → 14px`，对齐新圆点中心（7 + 16/2 = 15，线宽 2px 取 14）

### 二、团队工作台的「给他派任务」去掉
用户原话：「状态一目了然就行，大家都在跟不需要派发」。
`page-team.js` 里点成员弹出的任务清单，底部原来两个按钮（关闭 / 给他派任务），
而 `data-act="assign"` 那个按钮**点了只是 `App.go('tasks')`**，没有任何实质动作 —— 删掉最干净，只留「关闭」。
（要给人加任务仍然走任务页的「新增任务 → 负责人」，能力没丢。）

### 三、验证：新增 `chk-tl-fix-team.js`，11 项全过
盒模型级别断言，不是看截图猜：
- 圆点在行内（`dot.x >= node.x`）、光圈不出左边界、圆点右沿不压文字、与文字间隔 ≥8px、
  圆点底边在第二行文字上方、光圈色值确实变成 `rgb(231,237,255)`、左侧留白 7px
- 团队弹窗：能打开、文本里没有「给他派任务」、`[data-act="assign"]` 为 0、仍有「关闭」
- `smoke` 8 页 / `chk-tl-readonly` / `chk-theme` / `chk-accordion` 无回归


---

## 2026-10-24（续）团队工作台新增留言板

### 一、需求
团队工作台加一个留言板，**其他人也能留言**，大家进来看得到同一份。

### 二、落地方式：存在云端配置里，不动表结构
沿用本项目既有做法（`leadDays`、`ship`、`stages` 都是这么存的）：

```
settings.board = [ { id, text, authorId, authorName, color, at } ]
```

- 跟着 `app_settings` 整包上云 → 换台电脑登录就是同一块板，**零表结构改动、零 SQL**
- `authorName` / `color` 存的是发言当时的**快照**：成员被删了，历史留言照样显示得出来
- 上限 500 条（`BOARD_MAX`），超了从最老的开始丢，防止配置包无限变大
- `normalized()` 里补 `settings.board` 默认 `[]`，老数据进来不会报错

### 三、并发：发帖前先读一次再合并，避免两个人同时留言互相覆盖
整包写 `app_settings` 天然有覆盖风险，所以：

1. `Cloud.pullSettings()`（新增，只读 `app_settings` 一行，不碰门店/任务/成员）
2. 把云端那份里本地没有的留言按 id 并进来（`mergeBoardNotes`）
3. 再 `pushSettings()` 整包写回

删帖同理：先在远端那份里剔掉这条 id，再合并写回 —— 否则远端那份会把删掉的又推回来。

### 四、别人发的新留言多久能看到
`stampOf()` 原来只算「门店/任务/成员/到货」条数，配置变了不触发刷新。
现在把 **留言条数 + 最后一条时间** 也算进 stamp，自动同步（45s）一到就会重绘出来。

### 五、界面（`page-team.js`，卡片放在「成员概览」下面）
- 输入区：发言人下拉（取成员名册，选中的人记在 `localStorage.sbs.boardWho`，下次进来还是你）
  - 名册为空时自动换成「你的名字」输入框（记在 `sbs.boardGuest`）
- 输入框 800 字、支持换行，**Ctrl / Cmd + Enter 直接发**，发送后光标留在框里方便连着补一句
- 列表：头像 + 名字 + 相对时间（`U.timeAgo` 新增）+ 内容，自己留的那条文字颜色更深一点
- 鼠标移到某条上右侧才出现 ✕，点了先确认（会把这条的开头摘出来做提示）再删
- 超过 5 条折叠，底部「展开全部 N 条 / 收起」
- **只重画这块卡片**（`repaintBoard`），不走 `App.refresh()` —— 后者会 `scrollTo(0,0)`，留言板在页面最底部，一发就跳回顶部没法用
- 草稿存 `bs.draft`：自动同步触发整页重绘时，正在写的内容不会丢

### 六、验证（`chk-board.js`，25 项全过，真浏览器）
结构 4 项 / 发帖 6 项（条数、内容、DOM、输入框清空、作者 + 相对时间、**云端确实写进去了**）/
空内容不发 2 项 / Ctrl+Enter 1 项 / 重绘后草稿还在 1 项 / 折叠展开 4 项 / 删除 2 项 /
收尾清理 2 项（本地 + 云端都清干净）/ 无异常无 console.error 2 项。
测试期间发的留言结束时全部删掉，不污染真实留言板。
`smoke` 8 页 / `chk-tl-readonly` / `chk-theme` / `chk-accordion` / `chk-tl-fix-team` / `chk-config-safety` 无回归。

### 七、踩坑
CDP 测试脚本里 `Runtime.evaluate` 是**裸表达式**，写 `var n=...; return n.text` 会
`SyntaxError: Illegal return statement`，而且异常是静默的（只在 `exceptionDetails` 里），
断言看着像「功能坏了」。凡是以 `var` 开头的都包一层 `(function(){...})()`。
另外页面里的 `S` / `C` 是模块内的局部别名，测试里必须写 `window.Store` / `window.CONST`。

---

## 2026-10-25 清单动作「推送」改叫「完成」

### 一、原因
一线反馈「推送」这个词不好理解 —— 它实质就是「这条做完了」，动作名应该直接说结果。
2026-10-23 那轮是从「开始 / 完成」改成「推送」的，这次改回来，**只动文案，不动逻辑**。

### 二、改了哪些字（`page-tasks.js`）
| 位置 | 原来 | 现在 |
|---|---|---|
| 清单每行的动作 | 推送 | **完成**（加 `title`：这条做完了，门店阶段跟着往前走一步） |
| 弹窗标题 | 推送这条清单 | **完成这条清单** |
| 弹窗副标题 | 完成 + 把门店往前推一步 | **标记完成 + 让门店往前走一步** |
| 弹窗分节 | 推送到哪一步 | **完成后门店进到哪一步** |
| 弹窗主按钮 | 推送 | **完成** |
| 成功提示 | 已推送：门店 → 阶段 | **已完成：**门店 → 阶段 |

`data-act="push"` / `.push-*` 这些内部名字没动 —— 只是给人看的文案变了，改属性名只会平白增加回归面。
`store.js` 里那句注释也顺手同步成「点『完成』」。

### 三、验证（`chk-done-label.js`，11 项全过）
- 展开门店后 5 行动作全部是「完成」，整页文本里 **没有「推送」二字**
- 弹窗标题 / 主按钮 / 正文都没有「推送」
- **真的走了一遍**：点完成 → 目标阶段带二级时强制选一支 → 任务变 `done`、门店阶段变「已出图 · 已做首批」、
  提示「已完成：香港迪士尼店 → 已出图 · 已做首批」
- 走完把任务状态和门店阶段**按原值还原**，不留测试痕迹

`smoke` 8 页 / `chk-tl-readonly` / `chk-config-safety` / `chk-accordion` / `chk-theme` 无回归。
版本 `?v=20261025z57`。

---

## 2026-10-25 点「完成」不再问阶段：按任务落点自动推进

### 一、需求
- 一线实况：门店的活是并行的 —— 图纸还没出，营业执照可能已经办下来了。
- 旧做法点「完成」弹一个大窗，把当前阶段之后的阶段全列出来让人挑，每点一条都要挑一次。
- 要求：**点完成就完事**，门店自动往前走；只有「已出图」这种带二级的才问一句哪一支。

### 二、规则（`page-tasks.js → completeTask`）
每条任务在筹建任务清单里挂一个落点（那列现在叫「完成后进到」）。点「完成」= 标记完成 + 门店阶段按三条走：

| 情况 | 处理 |
|---|---|
| 落点比门店当前阶段靠后（营业执照 → 建档资料，门店还在未出图） | 直接推到落点 |
| 落点就是当前阶段（图纸 → 未出图 而门店在未出图） | 只标记完成，阶段不动 |
| 落点比当前阶段靠前（门店已到广告物料才回头补做图纸） | 只标记完成，绝不倒退 |

- 落点带二级（「已出图」下的 已做首批 / 未做首批）→ 弹一个小窗，**只有两个分支按钮**，
  点一下直接落定，不再有「取消 / 确定」两步。任务自己带二级（`已出图 / 已做首批`）就不问。
- 每次完成都带一条「撤销」提示条（6 秒），撤销会把任务状态 + 门店阶段 + 二级一起还原。

### 三、数据修正（一次性）
筹建任务清单里「图纸」原来填的落点是**未出图**——那是旧口径（这条属于哪个阶段）。
现在这列的含义是「完成后进到」，图纸做完就是「已出图」，已在云端改成 `图纸 → 已出图`：
- `settings.taskTemplates` 里这一行改了；
- 已有门店里同名、同为「未出图」的那条任务也改了（开业前 30 天原样保留）。
- 其余几条本来就是对的结果口径（营业执照→建档资料、到货时间、广告物料、准备开业），没动。

### 四、列头与文案
- 任务清单「阶段」列 → **「完成后进到」**（列头 title 也写清了）
- 新建/编辑任务表单「所属阶段」→ **「完成后门店进到（点完成时自动推到这里）」**
- 筹建任务清单表头与说明同步改写，并加了一句「只往前推、不往回退，几件事同时推进也不会打架」

### 五、顺手修掉的老毛病：点一下就被弹回顶部
`App.render()` 之前每次重画都会跑 `onEnter` + `scrollTo(0,0)`，所以在任务页点一条「完成」，
门店收起、页面回顶部，根本没法连着点几条。
- `App.refresh({ keep: true })`：不跑 `onEnter`（那是「刚进这一页」的初始化）、不滚回顶部
- 任务页所有行内动作都改成 `keep`：完成 / 撤销 / 重开 / 延后 / 撤销延后 / 删除 / 保存任务
- 45 秒自动同步也改用 `keep`，别人改数据时不会再打断你正在看的门店
- 门店往前走了而左侧还筛着老阶段时，自动放开阶段筛选 —— 否则刚点完的那家会当场消失

### 六、验证（`chk-complete.js`，33 项全过，真浏览器）
列头 1 项；规则①带二级 8 项（弹窗 / 只有分支按钮 / 落定后门店+二级对）；撤销 4 项；
规则①无二级 5 项（不弹窗、一下点完）；规则② 4 项（只完成、阶段不动、提示说清落点）；
规则③ 3 项（后面补做不倒退）；还原 2 项（任务 + 门店）；无异常 2 项。
测试用的就是真实门店（深圳大悦城店），跑完把 6 条任务状态与门店阶段全部还原，云端已核对一致。
`smoke` 8 页 / `chk-tl-readonly` / `chk-theme` / `chk-accordion` / `chk-tl-fix-team` / `chk-config-safety` / `chk-board` 全部无回归。

### 七、踩坑
- 测试脚本输出被 `| head -n` 截断 → node 收到 SIGPIPE 提前退出 → 结尾的「还原数据」没跑到，
  真实数据被留成「门店在开业准备、任务已完成」。以后跑会改数据的测试不要用 head 截断，重定向到文件再 tail。
- 旧的 `chk-done-label.js` 断言的正是被删掉的大弹窗，已改名 `.retired.js`。

## 2026-10-25 进度条口径改成任务：已完成 / 总计

用户原话：「进度条是 任务里面的 = 已完成 / 总计」。之前按「停在第几个筹建阶段」算（截图里 17%），
跟任务页看到的「0 / 6 条未完成」对不上，同一条街的两种说法，容易吵起来。

### 一、口径
- 页面上所有门店进度条统一 = **该门店已完成任务 ÷ 该门店任务总计**
  - 首页「门店筹建进度总览」表格、门店管理列表、任务页门店行、门店详情、报表「平均进度」
- 跟任务页门店行右侧的「未完成 N / 逾期 N / 没有任务」是同一份数据（`state.tasks` 按 `storeId` 过滤）
- 一条没做但派了任务 → **0%**；没派过任务 → 进度条显示 **「—」**（没有分母，不假装 0%）

### 二、四个函数分工（`js/store.js`）
| 函数 | 用途 |
|---|---|
| `stageProgress(store)` | 老口径：停在第几个筹建阶段（每格 16.7%，收尾阶段不进分母）。只给门店表单「阶段进度」预览用 —— 表单里还没保存、任务也没派，按任务算永远是「—」 |
| `taskProgress(store)` | 单纯数任务：`{ done, total, pct }` |
| `storeProgress(store)` | 页面口径：`pct` = 任务完成率，同时带出阶段位置 `idx / total / at / isEnd / label`、`done / taskTotal / stagePct` |
| `progressValue(store)` | 直接喂 `UI.progress()`：有任务给 `pct`，没任务给 `null` |

- `UI.progress(null)` 支持空值 → 轨道留空 + 数字显示「—」（`js/ui.js`）
- 悬停文案：`进度 = 已完成任务 / 任务总计：1 / 6 条已完成 → 17%。门店在「未出图」（第 1 / 6 个筹建阶段）`
- 提醒卡片里的进度描述同步改成「任务已完成 x/y 条」；报表「平均进度」= 各门店完成率的平均，
  只算已经有任务的门店（foot 里注明 有几家有任务），避免一堆 0% 把平均拉死
- 门店详情「阶段进度」那格 → **「任务进度」**，右边写「已完成 0 / 6 条」
- 列头「整体进度」加 `title="已完成任务 / 任务总计"`

### 三、验证
- `progress-test.js` 重写：阶段口径 18 项 + 任务口径 15 项，全过（含 6 条完成 1 条 = 17%、全完成 100%、
  没任务 → `null` 且 UI 显示「—」、只算本店任务、二级任务也计入、文案断言）
- 真浏览器截图核对：首页 / 门店列表 / 任务页三处都是 `0%`，悬停都写「0 / 6 条已完成」；
  门店详情「任务进度 0% 已完成 0 / 6 条」；报表平均进度 0%
- 回归：`smoke` 8 页、`chk-complete` 33 项、`chk-board` 25 项、`chk-tl-readonly`、`chk-theme`、
  `chk-accordion`、`chk-config-safety` 全绿；真实浏览器控制台 0 错误 0 警告
- 版本号 `?v=20261025z60`

## 2026-10-25 修 KPI 判断逻辑气泡被盖住（ⓘ）

用户截图：点开「风险门店」旁的 ⓘ，气泡只露出左边一条，右边被「逾期任务」卡片压着。

### 一、两个叠加的原因（都是层叠上下文惹的）
1. `.fade-up` 用的是 `animation: fadeUp .34s ... both`，结束帧 `transform: translateY(0)` 会
   **一直挂在 section 上**（浏览器甚至会把 `none` 也留成 identity matrix）。带 transform 的
   section 因此变成层叠上下文，气泡的 `z-index: 60` 只在 section 内部有效，后面的
   `.home-grid-2`（DOM 在后）自然压上来。
2. 卡片 `:hover { transform: translateY(-1px) }` —— 鼠标放在 ⓘ 上时整张卡就有了 transform，
   气泡又被锁进卡片内部，右边那张卡（DOM 在后）直接盖住。

### 二、修法
- `css/base.css`：`.fade-up` 改 `animation ... backwards`，结束帧写 `transform: none`。
  动画结束后元素回到自身样式（无 transform），不再创建层叠上下文。
  这一处同时解决了所有「section 里伸出去的浮层被下一个 section 盖住」的隐患。
- `css/components.css`：`.kpi { position: relative }`；
  `.kpi:hover, .kpi:focus-within, .kpi.is-tip-open { z-index: 20 }`。
- `js/page-home.js`：点开时给宿主卡片加 `.is-tip-open`（触屏点开、指针移走后仍保持抬层级），
  收起点空白时统一由 `closeTips()` 清掉。

### 三、顺手做的两件小事
- 气泡 `max-width: calc(100vw - 32px)`，窄屏不再顶出视口。
- `placeTip(help)`：右侧空间不足（`right > 视口 − 12`）时给气泡加 `.is-right` 翻到 ⓘ 左边，
  箭头挪到右端；hover 与点击都会走一遍。
  实测 820px 两列布局下，第二个 ⓘ 的气泡 `left=119 / right=373`（视口 820），已翻边。

### 四、验证（`verify-kpi-tip.js`，7 项全过）
hover 展开在最上层 1 项；点击展开可见 / 5 个点全部命中气泡本身（顶边、两边、底边都不被切）/
不出视口 3 项；点空白收起 1 项；右侧卡不溢出 1 项；窄屏 820px 两个气泡都在视口内 1 项；
无异常 1 项。`smoke` 8 页无回归。

### 五、踩坑
- 共用 Edge profile 会命中磁盘缓存，读到改之前的 CSS，测试结果假阴性。
  CDP 里要先 `Network.setCacheDisabled({cacheDisabled:true})`；给用户的版本号也一起 bump。

## 2026-10-25 发货看板撤掉「实发日期」输入框

用户截图圈了「已发出」下面那个 `2026/10/25` 的 date 框，说「这个取消」。

- `js/page-ship.js`：`rowHtml` 里已发出的行不再渲染 `input[data-sentdate]`，
  「发出 / 下一步」这列只剩 状态胶囊 + 下一步文字（`31 天后开业` / `物料 11-05 到`）；
  `change` 监听里对应的 `[data-sentdate]` 分支一起删掉（现在只剩备注）；
  顺手删掉从未被调用的死函数 `leftText()`。
- `css/components.css`：删 `.ship-sent-date` / `:hover` / `:focus` 三条样式，`.ship-next` 上边距 2px → 4px。
- 数据层不动：`settings.ship[id].sentAt` 仍会在「点已发出」时自动记今天（`store.js`），
  只做留痕、不参与计算、界面上不展示；老数据里的 sentAt 保留，不迁移、不清洗。
- 验证：`chk-ship2.js` 打印「实发日期框(应为 false): false / 下一步: 10 天后开业」；
  真实浏览器截图（1552px 宽）「已发出 + 31 天后开业」两行，列高 55px，0 报错；
  `smoke.js` 8 页全 OK。版本 `?v=20261025z62`。

## 2026-10-25 「重开」= 把这次完成退回去（任务回未完成 + 门店回原阶段）

用户问「重开还需要吗」，并说清了期望：**点重开要回到之前的阶段，状态改回未完成**。
原来只改任务状态、门店阶段不动 —— 阶段被推进去了就退不回来。

### 一、怎么记住「之前的阶段」
任务表列固定（id / store_id / title / stage / assignee_id / due_date / status / priority / remark），
没有地方放回退点。所以存 `settings.reopenLog`（跟留言板一样走 app_settings 整包，零表结构改动）：

```js
settings.reopenLog = {
  'task_xxx': { from: '未出图', to: '已出图 / 已做首批', at: '2026-10-25T…' }
}
```

- `from` = 完成之前门店停在哪一格，`to` = 这条任务把门店推到了哪一格。
- 只在这条任务**真的推动阶段**时记；落点=当前阶段 / 落点在前（规则 ② ③）一律清掉旧记录。
- 上限 300 条，超了按 `at` 从最老的丢，配置包不会无限长。
- `removeTask` 时顺手删掉这条任务的回退点；`undo`（提示条撤销）也删。

### 二、重开的两步（`reopenTask`）
1. 任务状态改回 `pending`；
2. **只有门店还停在 `to` 时才退回 `from`** —— 说明这期间没人再往前推。
   门店已经被别的任务推得更远、或被人手动改过阶段，就只改状态、阶段原地不动，
   提示里写明「门店现在在「物料/到货」，阶段没动」。否则点一下重开会把别人几天的推进一起抹掉。
   `from` 那个阶段要是被删了（`stageIndex < 0`），也不往回设。

### 三、验证（`chk-reopen.js`，26 项全过）
① 带二级完成 → 记 from/to → 重开：pending + 回「未出图」+ 回退点清空 + 提示带「退回「未出图」」；
② 落点=当前阶段完成（没推进）→ 不记回退点 → 重开只改状态；
③ 完成后别人推到「物料/到货」→ 重开阶段保持不动，提示「阶段没动」；
④ 提示条「撤销」→ 任务/阶段还原 + 回退点清掉；
⑤ 删任务 → 回退点一起清；⑥ 老数据没 reopenLog 不炸、写入自愈。
`smoke` 8 页 OK；真实浏览器 `boot-cdp` 0 报错。版本 `?v=20261025z63`。

### 四、踩坑
jsdom 测试里连续 `mount` 同一个节点会让 click 监听叠加（点一次触发两次），
必须像 `App.render` 那样每次 `cloneNode` 换新 `#view` 再挂 —— 真实页面一直是这么做的，
只有测试里容易踩。

## 2026-10-25 报表「省份门店分布」限高 + 卡片内滚动

用户截图：25 个省份 25 行，把整页拉得很长，要求「不要太长，设置滚动条」。

- `js/page-reports.js`：省份行包进 `<div class="card-scroll" tabindex="0">`，其余榜单不动。
- `css/components.css` 新增 `.card-scroll`：
  ```css
  max-height: 240px;            /* ≈ 6.7 行，第 7 行露一半，一眼看出还能滚 */
  overflow-y: auto;
  overscroll-behavior: contain; /* 滚到头别把整页带着滚 */
  ```
  滚动条本身不加自定义样式，跟随 theme.css 里全局的 `*::-webkit-scrollbar`（细、灰蓝），
  卡片内外观一致。`.card-scroll:focus-visible` 给键盘 Tab 一个焦点框。
- 为什么是 240：左边「各阶段门店分布」自然高度 ≈ 308，右卡 240 + 卡头 + 内边距 ≈ 318，
  两张卡基本齐平，不会出现大片空白。试过 290/342，左卡底部会空 100px 以上。
- 效果：报表页整页高度 1700+ → 1135；省份区 clientHeight 240 / scrollHeight 893，
  滚到底最后一行「吉林」完整可见；其他卡片高度不变。
- `smoke` 8 页 OK、`chk-theme` 全过。版本 `?v=20261025z64`。

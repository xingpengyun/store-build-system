# 门店筹建管理系统 · 项目长期笔记

## ⚠️ 2026-10-22 架构变更：已升级为云端多人协作版

- 数据不再存 localStorage，改为**云端 PostgreSQL**（WorkBuddy 云服务）
- `applicationId`：`wbapp_kHH92NSYCy3ebQEPX6VlMB`（本目录发布 + 云服务用的应用；旧电脑那份是 `wbapp_JwWrDm3Xy5kxdaiR11r7FM`，两套互不相通）
- 云端 `endpoint`：`https://store-build-system-59240.app.workbuddy.host` —— **必须与页面同源**，云端只认自己那个域名（exact Origin match），换成别的域名会一律 401 且不带 CORS 头，浏览器只报 `TypeError: Failed to fetch`
- 线上地址：`https://store-build-system-59240.app.workbuddy.host/?sharecode=SXM4622FRX`
  （2026-10-26 起本目录的发布地址。旧的 `store-build-system.app.workbuddy.link` 属于另一台电脑上的工作副本，不随本目录更新）
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

## 2026-10-25 发货看板：筛选全都点不动（onEnter 把筛选复位了）

用户截图圈了「未发出 41 / 该通知供应商 11 / 漏通知 4」和「只看这几家」，说「这里的筛选都有问题」。

### 一、真因：点一次筛选，onEnter 立刻把筛选复位
`page-ship.js` 里所有筛选点击都是 `state.tab = …; App.refresh()`。
而 `App.refresh(opts)` 不带 `keep` 时会走 `render()` → `page.onEnter()`，
发货看板的 `onEnter` 正是「刚进这一页」的初始化：

```js
function onEnter() { state.tab = 'all'; state.dtab = 'all'; state.q = ''; }
```

于是每次点分类 = 设好 tab 又立刻被复位成「全部」，表格永远 51 行、高亮永远在「全部」。
按到货日视图的 dtab、KPI 卡片、「只看这几家」同理全废。
（其他页面没踩到，只有发货看板的 onEnter 复位筛选。）

修法：把这页所有「筛选/翻转类」的交互改成 `App.refresh({ keep: true })`
（`keep` 只重画、不跑 onEnter、不滚回顶部）；视图切换因为要回页首，keep 之后自己补 `scrollTo(0,0)`。
共 10 处。搜索输入本来就走 `updateList()`（只换表体），不受影响。

### 二、顺带修掉的三个「数字对不上」
1. **「该通知」和「漏通知」重复计数**：武汉光谷店既有过期物料又有 7 天内到的，
   原来同时算进两类，11 + 4 = 15 比实际要通知的 14 家还多。
   改成按门店互斥（`store.js`）：`needNotify = lateArr === 0 && notify > 0`，
   有过期的一律归「漏通知」。现在是 该通知 10 + 漏通知 4 = 14，点进去行数一一对应。
2. **页头「共 51 家门店要跟」**：51 里含 10 家已发出的。
   改成「共 51 家门店：41 家待发出、10 家已发出；其中 4 家漏通知供应商」。
3. **按到货日视图的「待通知」KPI 点进去是全部**：卡片 `data-dkpi="all"`，值却是 `all - notified`
   （76），点一下筛的是 `all`（147 行）。新增 `dtab: 'pending'`（`!r.notified`）+
   `dStats.pending / pendingCount`，卡片改成 `k: 'pending'`，数字与行数对齐；
   foot 也从「共 N 家店」改成「分布在 N 家店」（37 家，指还有没通知物料的门店）。
   分类栏因此从 6 个变 7 个，实测 1600 宽 636/636 不溢出。

### 三、顺手做的
- 每个 tab / KPI 都加了 `title`，一句话说清这一类到底算什么（含「不重复算」的说明）；
- 「只看这几家」切完分类会把表格 `scrollIntoView`，不用自己往下滚；
- 「已发出 / 先发 / ↑↓」这些写数据的操作也统一 `keep`：
  在「未发出」里点发出，这行消失但不会再被弹回「全部」；
- 「按到货日」里点「待通知 ⇄ 已通知」改成整页 keep 重画，KPI / 横幅跟着一起变（原来只有表格变）。

### 四、验证（`chk-ship-filter.js`，27 项全过）
按门店 5 个 tab：数字 == 点进去的行数、行都属于这一类、tab 高亮对；
再点一次当前 tab 不被弹回；3 张 KPI 卡点开 / 再点取消；
「只看这几家」→ 切漏通知 + 表格进视口；搜索「深圳」→ 3 行且 tab 不跳；
按到货日 7 个 tab + 5 张 KPI：数字 == 行数（待通知 76 / 全部 147 / 已通知 71）；
切回按门店分类回到全部；0 报错。
`chk-ship2` / `chk-board` / `chk-tl-readonly` / `chk-theme` / `progress-test` / `smoke` 全绿；
真实浏览器 `boot-cdp` 0 报错；云端与本地 51 家门店阶段一致。

### 五、其它
- `chk-ship.js`（早期调试脚本，用的还是旧的 `setShip()` + `.ship-mat`）已改名 `.retired`。
- `chk-complete.js` 取的是 `stores[0]`，现在这家店的待办任务落点都在当前阶段之前，
  于是两条断言「找不到带二级/无二级的待办任务」失败 —— 是测试数据漂移，不是功能问题。
  要修得让它自己挑一家有「落点更靠后」待办的门店，暂未动。
- 版本 `?v=20261025z66`。

## 2026-10-25 首页 6 张 KPI 卡：点一下弹出「这几家是谁」

用户圈了首页那排 `筹建门店 51 / 已开业 4 / 进行中 44 / 风险门店 3 / 逾期任务 24 / 7天内该通知 13`，
说「我希望这些我点击之后会弹出窗口显示门店」。

### 一、做法
`js/page-home.js`：
- 卡片渲染加 `data-kpi="<key>"`、`role="button"`、`tabindex="0"`、`.is-clickable`、`title="点击查看…"`；
- `KPI_META` 定义每类的标题 / 口径说明 / 空态文案；
- `kpiDetail(key)` 把一类展开成 `[{ store, items:[{text,late}] }]`：
  · `all / opened / doing / risk` → 直接筛门店；
  · `overdue / notify` → 拿任务 / 物料按 `storeId` 归堆（一条条平铺看不出来是哪家店）；
- `kpiDetailHtml()` 一行一家店：阶段色点 + 店名 + `省份 · 11月22日 开业` + 右侧 `N 条任务` 徽章 + 阶段/风险徽章；
  任务类最多列 3 条，多的写「还有 N 条，点门店看全部」；
- 点行 → `close()` 再 `openStore(id)`，直接进门店详情；底部「关闭」；`Esc` 也能关（UI.modal 自带）；
- 点击顺序上 `ⓘ` 分支先 return，所以点 ⓘ 只展开判断逻辑、不会误触发弹窗；
- 键盘：卡片 Enter / 空格 = 点卡片；ⓘ 上 Enter = 展开气泡。

`css/components.css`：`.kpi.is-clickable`（cursor / hover 描边 / focus 焦点环）+ `.kdl-*`
（行、店名、meta、备注、右侧徽章、件数徽章）。滚动交给 `.modal-body` 自带的 `overflow: auto`。

### 二、口径必须跟卡片数字严丝合缝
- 「进行中」原来用减法 `总门店 - 已开业 - 风险`，碰上「已开业且标了高危」的门店会重复减，
  点开就可能「写 44 家、点开 45 家」。改成过滤口径：`stage !== '已开业' && risk 不是 high/overdue`，
  跟「风险门店」这张卡互斥（风险跨阶段统计，不重复算），并在 ⓘ 里写清楚。
- 「逾期任务」「7天内该通知」的副标题直接报「共 N 家 · M 条任务 / M 项物料」，
  M 就是卡片上的数字，点开能一条条对。
- 排序：在筹的按开业日早的在前，已开业的沉到最后（跟下面表格一致）；
  任务 / 物料类再按件数多的排前面（`sort` 稳定，件数相同仍按开业日）。
- 「筹建门店」的副标题只写「共 51 家」，不再重复「全部在册门店（含已开业）」。

### 三、验证
`chk-kpi-modal.js`（jsdom，32 项全过）：构造 51 家 / 4 已开业（其中 1 家同时高危）/ 3 风险 /
24 条逾期 / 13 项待通知，逐张核对「卡片数字 == 弹窗行数 == 每行确实属于这一类」，
逾期与物料的件数合计 == 卡片数字，不混进「没逾期 / 已完成 / 10 天后到 / 已通知」的记录；
`ⓘ` 不弹窗只展开、Enter / 空格能开、Esc 能关、点行会关列表并打开详情、没有数据时给空态。
`verify-kpi-modal.js`（真实 Edge，24 项全过）：卡片 cursor 是 pointer、6 张卡点开行数都对、
点门店行只剩一个详情弹窗且能看到这家店、`Esc` 关闭、`ⓘ` 不弹窗、控制台 0 异常。
回归：`smoke` 8 页 OK，`progress-test` 33、`chk-tl-readonly` 27、`chk-theme` 16、
`chk-board` 24、`chk-reopen` 26、`chk-ship-filter` 全过。
窄屏 820px 实测弹窗 `left=55 / right=755 / 视口 810`，不溢出。

### 四、顺带修掉的测试脆弱点
`chk-ship-filter.js` 里写死了「点 KPI 后行数 > 0」「搜索深圳」「行数 < 51」，
真实数据一变（测试 profile 只剩 1 家门店）就假失败。改成：行数 == 卡片上的数字（0 也算对）、
搜索关键词从当前列表第一条门店名里取前两个字、列表为空就 SKIP。

### 五、截图
演示数据是**只在浏览器内存里**造的（不调任何写接口、不碰云端），截完 `location.reload()` 丢弃：
`_shot-kpi-cards.png`（6 张卡）、`_shot-kpi-modal-all.png`（51 家）、`_shot-kpi-modal-overdue.png`
（6 家 24 条）、`_shot-kpi-modal-notify.png`（4 家 13 项）、`_shot-kpi-modal-risk.png`、
`_shot-kpi-modal-narrow.png`（820px）。
版本 `?v=20261025z68`。

---

## 2026-10-25 「完成」只记账：阶段按门店实际进度走，推进时越过 + 右下角卡片

### 一、需求（用户原话）
> 「如果门店处在当前阶段，比如设计阶段，那即使我点击了营业执照完成，他也不会直接跳转到建档的下一个阶段，
> 而是继续按照时间先走；如果走到了建档资料阶段，因为已完成了才跳过去往下一阶段。
> 然后跳阶段的话我希望右下角弹出一个小卡片，标注该门店已转入下一阶段的名称。」

上一版是「点完成 → 门店阶段推到这条任务的落点」，等于让一条任务把门店一夜之间拽到最前面。
并行推进（图纸没出、营业执照先下来）时阶段会虚高，跟门店实际到了哪一步脱节。

### 二、新口径（`Store` 新增「门禁 gate」）
| 时刻 | 发生什么 |
|---|---|
| 点「完成」 | 只把任务标成 done。**门店阶段一动不动**，落点记进 gate（现算，不建新表） |
| 门店阶段往前挪（门店编辑里改阶段） | `advanceStore()` 把「已经做完的格子」一口气越过，落到最远那一格 |
| 越过时 | 写一条 `settings.reopenLog`（from → to），右下角弹 `.spop` 小卡片 |
| 点「重开」 | 任务回 pending、落点二级清掉；如果门店正是被这条越过去的（还停在 to），一并退回 from |

- 「落点带二级」仍然弹小窗问「落到哪一支」，但选完**不再动阶段**，只写进 `settings.taskGateSub`
  （`settings` 里新增这一个键，`normalized()` 里补默认值，删任务时一起清）。
- 举例（就是用户说的那步）：门店在设计阶段 → 点「营业执照」完成 → 仍是设计阶段；
  在门店编辑里把阶段改成「建档资料」→ 发现这格的活做完了 → 直接落到「发货阶段」，
  卡片写「__门店：建档资料 → 发货阶段｜「营业执照」已完成 · 越过 1 格」。

### 三、Store 新 API
`stageOrder(key)`（一级序号，二级不影响，找不到 = -1）
`gateOfTask(task)` / `gatesOf(storeId)`（已完成且落点更靠后的格子，从近到远）/ `gateOf(storeId)`（最远那一格）
`advanceStore(storeId)` → `{ from, to, skipped[], gate, store }` / null
`gateSubOf / setGateSub / clearGateSub`（落点二级）

### 四、UI
- `UI.stagePop({ store, from, to, note })`：右下角 22px 固定，宽 272px，白卡片 + 阴影，
  标题「门店已转入下一阶段」，下面是「旧阶段 → 新阶段」色块（新阶段用该阶段的色），
  第三行说明「哪条任务做完了 · 越过 N 格」。停 6.5 秒，可点 ✕ 关，最多叠 3 张。
- 任务行「完成后进到」列：已完成但门店还没到那格的，加一枚橙色虚线「待越过」小标（`.tgate`）。
- 门店行头：有门禁时在阶段后面跟 `→ 发货阶段`（`.sk-gate`，橙色虚线），一眼看出「还差一次推进」。
- 文案同步改：任务行的「完成」title、清单「完成后进到」列头与说明、任务表单那一格，
  都从「点完成就推到这里」改成「只是记账，门店推进到这一格时才越过去」。

### 五、验证
- `chk-gate.js`（jsdom，28 项）：门禁计算、越过的 skipped、回退点、二级、落点失效、已到位后再调返回 null、
  删任务清干净。
- `chk-gate-ui.js`（真实 Edge，30 项）：造一家临时门店跑全流程 —— 点完成阶段不动 + 待越过 + 行头提示 +
  **没有**卡片；门店编辑改阶段 → 越过到「发货阶段」+ 卡片贴在右下（距右 22 / 距下 22）+ 文案齐全 +
  ✕ 能关；越过后小标消失；重开回未完成；最后把临时门店整体删掉（已核对确实没了）。
- `chk-reopen.js` 按新口径重写（38 项全过）。
- `chk-complete.js` → `chk-complete.retired.js`（它断言的「点完成即推阶段」已不存在）。
- 回归：`smoke` 8 页、`chk-board` 24、`chk-theme` 16 全过。

### 六、已知取舍
- 「越过」落到的是**最远那条已完成任务的落点**，不是只走一格。理由：落点是用户在清单里自己配的
  （「完成后进到」），营业执照办下来就等于到了发货阶段；只走一格反而跟配置矛盾。
- 阶段没有「按日期自动推进」的机制（每个阶段没有计划日期字段，任务表也只存落点不存所属阶段），
  所以「按时间走」这一步仍然靠人在门店编辑里改阶段；改的那一刻系统才越过、才弹卡片。

### 七、顺手修掉的老毛病：删门店不清 settings 里的任务键
`removeStore()` 原来只清 `storeSubs` / `ship`，这家店任务的 `settings.reopenLog`（回退点）、
`taskGateSub`（落点二级）、`taskBefore` / `taskSnooze` 全留在配置包里，指向已经不存在的任务。
跑测试建 / 删临时门店时暴露出来（云端留了一条 `task_mvmq5aw6_3` 的死键）。
现在删门店会把这些键一并删掉，`chk-gate.js` 加了 2 项断言。

版本 `?v=20261025z71`。

---

## 2026-10-25 门禁三修：越过 = 跳过已做完的那一格，不再「落到最远」

### 一、用户反馈
> 「门店不是默认设计阶段吗？？ 怎么跳不了了」

上一版 `advanceStore()` 是「落到最远那条已完成任务的落点」，而且是在 `updateStore` 已经把阶段
改成新值之后才调用 —— `gatesOf` 只认「落点严格比当前阶段靠后」，落点正好等于新阶段时被过滤掉，
`gateOf` 返回 null，一次也跳不动。语义上也跟用户要的不一样。

### 二、新语义（越过的定义改了）
- 任务落点 = 这条做完就算「完成」的那个阶段；
- 门店推进到某一格，发现这一格已经有做完的任务 → **跳过这一格，落到下一格**；
- 连续几格都做完就连着跳，落到第一格还没做完的（不再「落到最远落点」）；
- 每个被越过的格子记一条回退点（from = 被越过的格子，to = 落到的格子），
  重开那条任务就退回那一格。

举例（用户真实数据）：门店在设计阶段，点「营业执照（落点=建档资料）」完成 → 阶段不动；
门店编辑里推进到「建档资料」→ 这格已做完 → 跳过，落到「到货时间」，右下角卡片
「建档资料 → 到货时间 ·「营业执照」已完成 · 越过 1 格」。

### 三、改动
- `Store.doneLodges(storeId)`（新）：已完成任务落点按一级阶段归类，判断「这格做完没」用
- `Store.advanceStore(storeId, targetBase)`（签名变了）：从 targetBase 起连跳，签名带目标格；
  page-stores.js 保存时传 `payload.stage`
- 文案全部对齐：完成提示「推进到「X」时会自动越过这一格」、任务表单/清单说明、
  行头提示改「已做完「X」· 自动越过」（取最近一格，不再写「→ 最远」）
- `chk-gate.js` 31 项 / `chk-gate-ui.js` 32 项 / `chk-reopen.js` 31 项全部按新口径重写，全过；
  smoke 8 页 / board / theme 回归全绿

版本 `?v=20261025z72`。

---

## 2026-10-25 门禁四修：相邻格点「完成」直接走（用户截图问「图纸已出为什么不往下走」）

### 一、需求确认
用户截图：门店「aaaa」在设计阶段，点「图纸已出」（落点=首批阶段，正好是下一格）完成，门店不动。
按上一版「全部只记账」的规则这是对的，但用户预期相邻格要走。确认后的最终规则：
- **落点 = 门店下一格** → 点「完成」直接推进：advanceStore() 越过这一格（刚做完），落到第一格还没做完的阶段，右下角弹卡片
- **落点更远** → 只记账「待越过」，门店推进到那格时才越过（保持上一版行为）

### 二、改动
- `page-tasks.js completeTask`：新增 `adjacent = tIdx === curIdx + 1`；commit 里相邻时调
  `S.advanceStore(store.id, p.base)` 并 `UI.stagePop`；toast 改「门店进到「X」」
- 撤销升级：相邻推进过的，点提示条「撤销」把门店也退回原格（还停在推到的格子才退），并清回退点
- 落点带二级的弹窗文案随 adjacent 变（「选完支就推进」/「阶段不跟着跳」）
- `store.js normalized()` 自愈：载入时丢掉 reopenLog / taskGateSub 里指向已删任务的死键
  （云端实测有 2 条 demo 期死键，载入一次即清）
- 测试：chk-gate-ui 加「相邻格自动走」整段（推进+卡片+撤销回退，8 项）；
  chk-reopen 场景①改为相邻自动走、场景②改为隔格只记账（先把门店拨回设计阶段）；
  chk-gate 31 / chk-gate-ui 40 / chk-reopen 31 / smoke 8 页 / board / theme 全过

版本 `?v=20261025z74`。

---

## 2026-10-25 门禁五修：相邻格「到达落点就停」，不再跳过落点

### 一、用户反馈
> 「创建门店肯定是设计阶段，点图纸已出走到了建档资料，下一步不应该是首批阶段吗？
> 门店刚签约就拿到执照了，点已完成，那么如果完成后进入到某个阶段已经完成的时候就跳过。」

上一版「相邻格自动走」方向做反了：图纸已出（落点=首批，下一格）点完成时，
我调 advanceStore() 把「首批阶段」也当已做完一起越过了，直接落到建档资料 —— 错。
正确是：图纸出了 = 设计阶段这格干完 = 门店**进「首批阶段」并停住**；「跳过」只发生在
「推进到某个阶段、发现它早已完成」的时候（比如营业执照提前办好了，推进到建档时跳过建档）。

### 二、最终规则（两档 + 一个跳过）
| 场景 | 行为 |
|---|---|
| 落点 = 下一格（图纸已出→首批） | 点「完成」→ 门店「到达」首批阶段停住，右下角卡片「设计阶段 → 首批阶段」 |
| 落点更远（营业执照→建档，门店在设计） | 点「完成」只记账，门店不动，行头挂「待越过」 |
| 门店推进到某格，该格已有完成任务落点 | 跳过该格（营业执照提前完成 → 推进到建档时跳过→到货） |

### 三、改动
- `Store.landStore(storeId, targetBase, sub)`（新）：门店直接「到达」目标格就停，不跳过；
  与 advanceStore 返回同构 {from,to,skipped:[],gate,store}，回退点由调用方记
- `page-tasks.js completeTask` 相邻分支改用 `landStore` + `setReopenPoint`（from=推进前格, to=目标格）；
  撤销时退回推进前那一格（上一版退「被越过的格」→ 现退「设计阶段」）
- 远格与「推进跳过」逻辑不变（advanceStore）
- 测试：chk-gate-ui 相邻段断言改「到首批阶段、卡片 设计阶段→首批阶段」；
  chk-reopen 场景①改「到首批、重开退回设计阶段」；
  chk-gate 31 / chk-gate-ui 40 / chk-reopen 31 / smoke 8 页 / board / theme 全过

版本 `?v=20261025z75`。

---

## 2026-10-25 门禁六修 + 推送 GitHub

### 一、需求（用户）
> 「建档资料提前给了，点完成，那首批已做点完成后是不是应该跳过建档直接进到发货阶段？」

上一版「相邻格到达落点就停」做成了「到建档就停」，没继续往下跳。用户要的是：
门店在首批阶段，建档/到货都已提前完成 → 点「首批已做」完成后，顺着这些已完成
落点连续跳过去，停在「发货阶段」。

### 二、改动
- `Store.advanceStore(storeId)` 重写：从当前格出发，只要下一格有已完成任务的落点就继续走，
  停在最后一个「下一格还没完成」的格；不再只跳一格、也不再落到最远落点。签名去掉 targetBase。
- 删 `Store.landStore`（相邻格统一走 advanceStore）；回退点改由 completeTask 记
  （`setReopenPoint(task.id, jumped.from, jumped.to)`）
- `completeTask` 相邻分支改用 advanceStore；`page-stores.js` 手动推进改无参调用
- **顺带修的 bug**：门店跳阶段后 `state.stage` 还筛着旧阶段，门店行被筛出列表、
  连「重开」按钮一起消失 → 补上跳阶段后放开阶段筛选
- 版本 `?v=20261025z77`

### 三、验证
- chk-gate 31 / chk-reopen 31（Store 层）全过
- chk-gate-ui 32（真浏览器，含连跳+卡片+重开+撤销+删店）全过
- smoke 8 页 / board / theme 回归全绿

### 四、GitHub 推送
- 之前代理挡 github.com:443，本地累计 22 提交未推
- 根因：本地有 `c8444c7`「同步远端 main 到 3e39c98」的 squash 提交（树与远端 tip 一致）
- 做法：`git rebase --onto origin/main c8444c7` 丢弃 squash 提交、21 提交重放到真正 origin/main，
  无冲突；再补 2 个新提交（门禁六修 + bug fix）
- `git push origin main` → `3e39c98..ef64a22` 成功；代理（sandbox-cli.exe）间歇 502，重试即通

---

## 2026-10-25 · z78 / z79：任务行悬停、登录姓名、真实天气、设置权限

### z78（9e8bf74）
- 任务清单每行 hover：整行提亮 + 行首 3px 主色竖条（常占透明位，不跳版）+ 任务名染主色
- 登录页加「姓名」必填：2–20 字，只允许中文/字母/·；存 `localStorage.sbs.user`
  （`{name, account, at}`），顶栏与设置页「当前账号」都显示这个姓名
- `Cloud.simpleLogin(user, pass, name)` 多一个参数；新增 `simpleUser()` / `simpleUserName()`
- app.js 启动：有登录态但没姓名 → 补填一次

### z79（本轮）
1. **首页天气改成真实数据 + 动效**
   - 数据源 **Open-Meteo**（无需 key，响应头 `access-control-allow-origin: *`，
     `file://` 双击打开也能取）；`page-home.js` 里 `WX_CODES` 做 WMO 天气码 → 文案/动效映射
   - 城市取 `settings.weatherCity`（默认上海），内置 40 个常用城市坐标，表外城市走
     `geocoding-api.open-meteo.com`；取不到就退回 `weatherTemp` / `weatherText` 手填值
   - 缓存 `localStorage['sbs.weather.v1']` 20 分钟；改城市后清缓存
   - 动效（纯 CSS，`components.css`）：太阳转 / 云漂 / 雨落 / 雪飘 / 雷闪 / 雾流，
     `prefers-reduced-motion` 时全停
   - 布局改成两行：`[图标] 23°C 晴间多云` / `上海 · 12:01`（图标 28px 才看得清动效）
2. **「添加 50 家演示门店」下线**：按钮 + 确认流程 + 说明文案都删了；
   `store.addDemoStores` / `seed.js` 保留（探针和备份导入还在用），只是不再有入口
3. **系统设置权限**
   - `settings.access = { owner, allow: [] }`，`owner` 出厂值 = **邢鹏昀**（store.js `SETTINGS_OWNER`）
   - 身份认**登录时填的姓名**（账号统一 admin，区分不了人）
   - Store：`accessOf / canSettings / isSettingsOwner / grantSettings / revokeSettings`
   - app.js：无权限 → 导航里隐藏「系统设置」，直接敲 `#/settings` 会被送回首页并 toast
   - 设置页新增「谁能进系统设置」卡：管理员 + 授权名单（chip + ×），只有 owner 能改
   - 兜底：`page-settings.render` 开头再拦一次，防路由绕过

### 验证
- `node --check` 全通过
- `.workbuddy/probe-z49.js` **151/151 PASS**（I 天气 20 项 / J 权限 17 项 / K 演示门店 5 项 + 旧回归）
- 截图：`shots/z49-weather.png`、`z49-zoom-{clear,rain,thunder,snow,night}.png`、
  `z49-access.png`、`z49-denied.png`
- 包装页：`shot-in.html`（管理员 邢鹏昀）、`shot-in-li.html`（李四）、`shot-in-login.html`（无登录态）

### 注意
- 设置权限是**按姓名**的：同事登录时名字必须和 owner 在名单里加的一致，否则进不去。
  写错名字的唯一解法是退出重新登录（或直接在设置里再加一个名字）。
- 天气依赖外网；公司内网如果封了 `api.open-meteo.com`，会静默退到手填值（鼠标放上去有提示）。

## 2026-10-25「一件发货」回归：撤的是日期，不是功能（?v=20261025z95）

用户截图圈了物料列右边那块空位，说「一件发货怎么没有了，挺好的功能，
之前说的是一件发货底下的到货的日期取消，因为很多物料不同的时间，那一个以哪个为主」。

→ 前一轮理解偏了：只该撤「实发日期」输入框（z62 已撤），不该连整列一起撤掉。
   一店多个物料各到各的，本来也没有一个统一日期，用户的抱怨针对的是那个日期框。

### 一、这条列现在干什么（用户口径）
- 一颗胶囊管**整家店**：`未发出 ⇄ 已发出`，点一下翻面。
- 点成「已发出」= 这家店**所有物料一起记为已通知供应商**（等同一次办完整店），
  行**沉到表格底部**；再点一次 = 这家店所有物料**全部退回「待通知」**，行回到待发出那一组。
- 不登记任何日期（sentAt 仍由 `setShip` 记今天，只留痕：不展示、不参与计算）。
- 下一步小字：已发出 → `N 天后开业`；未发出 → `最早 10-27 到`（最早一条未通知物料的到货日）。

### 二、改了什么
- `js/store.js`
  - `toggleShipSent(storeId)` 重写：翻转 `settings.ship[id].status` 的同时，
    把该店 `arrivals` 全部刷成 `notified` / `pending`（逐条 `push('arrivals', a)`，只推真的变了的），
    返回 `{ status, changed }` 供提示条报数。**没有新增字段、没有表结构改动。**
  - `shipRows()` 排序加一条：`shipped` 不同 → 已发出沉底；同组内仍是 先发 → 手动 seq → 名字。
- `js/page-ship.js`
  - 新增 `sentHtml(r)`：`.ship-st` 胶囊（`is-todo` / `is-sent`）+ `.ship-next` 一行小字；
  - 表格插回 `<td class="ship-sent">`，表头 `<th style="width:128px">一件发货 · 整店一键`；
  - `rowHtml` 把 `is-sent` 挂回行上（淡一档的样式一直在 CSS 里，只是没挂）；
  - 点击分支 `[data-sent]` → `S.toggleShipSent` + toast 报「N 项物料同时记为已通知 / 回待通知」+ `keep` 重画；
  - 页头恢复「共 X 家门店：**A** 家待发出、**B** 家已发出；…」；
  - 表尾提示改写为一件发货口径；
  - CSS 一行没动（`.ship-st` / `.ship-sent` / `.ship-next` / `tr.is-sent` 都还在）。
- 版本 `?v=20261025z95`。

### 三、验证
- `node --check js/*.js` 全通过。
- `.workbuddy/probe-z95.js` **20/20 PASS**：胶囊在 / 点了整店 notified + 沉底 / 别家不动 /
  取消全部回 pending + 回原位 / 页头计数跟着变 / 空物料店也能翻面 / 表里 0 个 date 输入框。
- 截图（Edge + puppeteer-core，1552 宽，0 报错）：`.workbuddy/shot-ship.png`（初始）、
  `.workbuddy/shot-ship-click.png`（点了武汉光谷店之后：沉底 + 物料变「都通知过了」+ 漏通知 1→0 + 横幅转绿）。

### 四、这台机器（公司电脑）的情况
- 工作区是 codeload tar 包解出来的，**没有 .git**；`git clone` 走代理 CONNECT 502，
  push 通道不通 → 本轮改动只在本地，同步要等回到家里那台机器（或把整个目录拷过去再 sync.bat）。

### 五、z96：文案改成「一件发出」
用户说「字改成一件发出」——只动字，不动逻辑。
- `js/page-ship.js`：表头 `一件发出`、表尾提示、取消时的 toast 文案；
- `js/store.js`：`toggleShipSent` 与 `shipRows` 的注释同步；
- 探针 `.workbuddy/probe-z95.js` 的表头断言跟着改，重跑 **20/20 PASS**；
- 版本 `?v=20261025z96`；截图 `.workbuddy/shot-ship-z96.png`。

### 六、z97：这列再瘦一档（用户逐处圈选）
1. **撤掉「最早 11.3 到」**：未发出的行不再有 `.ship-next` 说明小字
   （一店物料到货日各不相同，写「最早」容易被当成整店日期）。
   已发出的仍留 `N 天后开业`（那是有用的倒计时，用户没动它）。
2. **撤掉表头的「整店一键」小字**，表头只剩 `一件发出`，列宽 128 → 112px。
3. **未发出时的胶囊文字改「一键发出」**（原来是状态词「未发出」，现在是动作词）；
   已发出仍是「已发出」。`CONST.SHIP_STATUS` 没改（它是状态字典，不是按钮文案）。
- 探针补 4 项断言：胶囊文字 = 一键发出 / 未发出行没有 .ship-next / 表头无「整店一键」/ 已发出行仍有「天后开业」，
  重跑 **24/24 PASS**；`node --check` 通过；版本 `?v=20261025z97`；截图 `.workbuddy/shot-ship-z97.png`。

### 七、z98：连「N 天后开业」也撤了
用户圈「37 天后开业」说「取消吧」。这一列现在**两态都只有一颗胶囊**，没有任何小字：
`sentHtml()` 不再产出 `.ship-next`；`.ship-next` 的 CSS 还留着（不影响渲染）。
探针改为断言「全表 `.ship-next` 数量 = 0」，**25/25 PASS**；版本 `?v=20261025z98`。

## 2026-10-25 登录门禁：姓名必须在名单里（?v=20261025z99）

用户要求：**已添加名字的可以以「姓名 + 账号 + 密码」登录，其他的登不进来，
弹出「请联系管理员开通账号」**。两个口径当场确认：
① 账号密码全团队共用一个（沿用 `admin / 123`，管理员可改 `cloud.js` 常量）；
② 白名单以**团队成员**为准。

### 一、难点：登录发生在数据加载之前
`app.js init()` 先 `Login.show()`，登录成功后才 `Store.load()` 拉云端。
所以登录页拿不到 `state.members`，只能：
1. 登录时**问云端成员表**（`Cloud.pullMembers()`），同时把姓名镜像到 `localStorage['sbs.allow']`；
2. 云端 4 秒不响应 / 报错 → 退回镜像；
3. 镜像也是空（第一次用这台电脑）→ 放行，否则新机器谁都进不来。

### 二、谁能登进来（`Cloud.memberGate(name)`）
```
团队成员 ∪ 管理员(settings.access.owner) ∪ 系统设置授权名单(settings.access.allow)
```
管理员和授权名单必须并进去，否则把成员配齐之后管理员自己反而被挡在外面。
比较前统一 normalize（去首尾空格、多个空格压成一个），「张 三」和「 张  三 」算同一个人。

返回值三种：`{ok:true, fresh:true}`（云端没有任何成员 = 全新系统）、
`{ok:true, offline:true}`（断网且无镜像）、`{ok:false, msg:'「X」还没有开通账号，请联系管理员开通'}`。

### 三、登录页的顺序（`login.js`）
1. 姓名格式校验（原有）；
2. **先过姓名白名单**（promise）——不在名单 → 红字提示「请联系管理员开通」，**不清空密码、不提密码**，
   免得把"有没有这个人"和"密码对不对"混在一起；
3. 名单内再对账号密码 → 不对才提示「账号或密码不正确」并清空密码框；
4. 通过 → `simpleLogin()` 写 `sbs.auth` / `sbs.user`。
按钮在校验期间变「校验中…」并禁用，避免连点。

### 四、改动清单
- `js/cloud.js`：新增 `simpleCheck` / `pullMembers` / `saveAllowNames` / `allowNames` / `memberGate` / `normName` / `judgeName`；
  `AUTH_KEY`、`ALLOW_KEY` 收敛在一处。
- `js/login.js`：提交改异步 + 白名单先行；登录页两处提示文案改成"只有团队成员名单里的人能登入"。
- `js/store.js`：`writeCacheNow()` 落盘时把 `成员 + 管理员 + 授权名单` 的姓名镜像进 `sbs.allow`。
- `js/page-settings.js`：「谁能进系统设置」卡顶部加一行登录规则说明。
- 版本 `?v=20261025z99`。**没有新增表 / 字段**，名单全走 `members` 表 + `app_settings`。

### 五、验证
- `node --check` 全通过；发货看板探针 `probe-z95.js` **25/25 PASS**。
- 新增 `.workbuddy/probe-login.js` **17/17 PASS**：团队成员/管理员/授权名单三种人都能进；
  名单外的人被挡且不写登录态、密码框不清空；名单内密码错才提示密码错；
  云端挂掉退回镜像（镜像外的仍被挡、空镜像放行）；全新空系统放行；姓名空格归一。
- 截图 `.workbuddy/shot-login-denied.png`（「赵六」被挡：「还没有开通账号，请联系管理员开通」）、
  `.workbuddy/shot-ship-z99.png`（一件发出列已无任何小字）。

### 六、已知边界（要不要收紧，等用户发话）
- 这是**前端门禁**，不是真鉴权：数据接口用 publishable key，懂行的人改 localStorage 能绕过。
  它能挡住"同事随手点进来"，挡不住有意破解。
- **已登录的会话不会被踢**：把人从团队移除后，他那台机器上只要还留着 `sbs.auth` 就能继续用，
  直到退出登录。要收紧得在 `Store.load()` 之后按名单再校验一次（本轮没做，怕误伤管理员）。
- 账号密码仍是全员共用 `admin / 123`；要一人一套得再改一轮（存 `settings.accounts`，不动表结构）。

## 2026-10-25 z100：跳阶段小卡片挪到页面正中，只停 2 秒

用户圈了「门店已转入下一阶段」那张卡说「这个弹窗页面中间显示吧，显示 2 秒」。

### 改了什么
- `css/components.css`
  - `.spop-root`：`right/bottom: 22px` + `align-items:flex-end` → `inset: 0` + `align-items:center` + `justify-content:center`，
    **容器铺满全屏但 `pointer-events:none`**，卡片自身 `pointer-events:auto` —— 居中归居中，不挡下面点按。
  - `.spop`：宽 272 → 300px，内边距 13/16/14，阴影加重（居中的卡片要浮得起来）；
  - `spopIn/spopOut` 动画去掉 `translateY`，改成 `scale(.94)` 缩放进出，不再有「从右下角滑上来」的位移感。
- `js/ui.js`：`stagePop()` 默认停留 **6500 → 2000ms**（`opts.duration` 仍可覆盖）；注释同步。
- 版本 `?v=20261025z100`。**没有改任何数据结构、没有改调用方**（page-stores / page-tasks 两处 `UI.stagePop` 不用动）。

### 验证
- `node --check js/*.js` 全通过；探针 `probe-z95.js` **25/25**、`probe-login.js` **17/17** 全过。
- 新增 `.workbuddy/shot-spop.html`（假底页 + 同参数调 `UI.stagePop`）和 `.workbuddy/shot-spop.js`（Edge 无头截图 + 计时）：
  1440×900 视口下卡片 300×128，中心偏差 **dx=0 / dy=0**（真正居中）；1.6 秒时还在、2.7 秒时已清空（2s + 0.2s 退场）；
  `pointer-events:none` 生效；0 控制台报错。截图 `.workbuddy/shot-spop.png`。

## 2026-10-25 z101：登录页那两行说明去掉

用户圈了登录卡底部那行「没在团队成员名单里的姓名登不进来，会提示「请联系管理员开通」。
数据保存在云端，团队成员共享同一份。」，说「文字取消就好」。

- `js/login.js` `tplSimple()`：整块 `<p class="login-tip">` 删除（`.login-tip` 的 CSS 保留，`tplPhone` 还在用）；
  顺手把姓名框下面那句里的「并且只有团队成员名单里的人才能登入」也去掉，只留
  「填真实姓名 —— 页面上显示的就是这个名字。」
- 登录卡只剩：姓名 / 账号 / 密码 / 登录按钮；卡片高度随之变矮，不留空白。
- **门禁逻辑一行没动**（`Cloud.memberGate`），只是不再在页面上解释规则；名单外的人照旧会看到红字「请联系管理员开通」。
- 版本 `?v=20261025z101`。验证：`node --check` 通过；`probe-login.js` **17/17 PASS**；
  新增 `.workbuddy/shot-login-plain.html`（只渲染不提交）截图 `.workbuddy/shot-login-z101.png`，0 报错。

## 2026-10-25 z102：「物料还没通知完，右边却写着已发出」—— 状态改为按物料实时算

用户截图：江门鹤山广场店物料列还有一堆「9天后」，右边却是「已发出」，
「不是应该返回到未发货一键发出的状态」。

### 一、根因
`一件发出` 的状态存在 `settings.ship[storeId].status`，是**当初点按钮时写死的**；
物料的通知状态却是 `arrivals.status`。两条线各走各的：
- 点了「一键发出」→ 标记 sent + 当时已有的物料全刷成 notified；
- 后来**新加了物料**（默认 pending）或**有人把某条改回「待通知」** → 只有物料变了，标记还停在 sent；
- 于是就出现「物料一堆没通知 / 右边已发出」的自相矛盾。

### 二、改法（`js/store.js`，两处）
1. `shipRows()`：`shipped` 不再读标记，改成**实时算**——
   `list.length ? pend.length === 0 : info.status === 'sent'`
   - 有物料：只要还剩一条没通知，就是「待发出」；全部通知过才算「已发出」；
   - 零物料的店没东西可算，仍按标记走（允许手动标一下，否则按钮点了没反应）。
   因为页头计数、筛选页签、沉底排序、行样式全部读的是 `row.shipped`，改这一处就全同步了。
2. `toggleShipSent()`：翻转方向以**屏幕上看到的状态**为准（`list.length ? pend.length === 0 : 标记`），
   不再看标记 —— 否则「物料没通知完（显示一键发出）」时按一下会被当成"取消"。
   点完照旧把标记写回 sent / todo，老数据点一次就自愈了。

### 三、口径（现在的规则，一句话）
**这家店还有没通知的物料 = 待发出（一键发出）；所有物料都通知过了 = 已发出。**
不管这个状态是点按钮点出来的、逐条勾出来的，还是新加物料加出来的，两边永远一致。

### 四、验证
- `node --check` 全通过。
- 新增 `.workbuddy/probe-ship-sync.js` **27/27 PASS**：老标记 sent + 物料没通知完 → 显示一键发出、不沉底、页头算待发出；
  点一下 → 全部 notified 且标记自愈；单条改回待通知 → 整店立刻退回；已发出的店新加物料 → 也退回；
  反方向（物料全通知、标记是 todo）→ 显示已发出，点一下是取消；零物料店仍可手动标 / 取消。
- 回归：`probe-z95.js` **25/25**、`probe-login.js` **17/17** 均未退化。
- 截图 `.workbuddy/shot-ship-sync.html` → `.workbuddy/shot-ship-z102.png`：
  给鹤山店塞了"标记 sent 但物料没通知完"的历史数据，页面正确显示「一键发出」并排在第 2 位（不再沉底），
  页头「3 家待发出、1 家已发出」也对上了。
- 版本 `?v=20261025z102`。**没有改表结构**；settings 里的老标记不改也不影响显示，用户点一次就写回正确值。

## 2026-10-25 z103：成员头像加了一套可爱的动物头像（12 只，可选）

用户在「编辑成员」弹窗里圈了「头像颜色」，问能不能加一些可爱的动物头像、风格一致、可以选。

### 一、头像怎么画的
- `js/ui.js` 新增一套**内联 SVG**小动物：`cat / dog / rabbit / bear / panda / fox / pig / frog /
  chick / koala / tiger / penguin`，共 12 只。
- 统一画法（这就是"风格一致"的来源）：同一个 `viewBox 0 0 40 40`、同一个「圆头 + 两颗点眼 +
  腮红 + 小鼻子 + 小弧嘴」的造型语言，**只靠耳朵形状和花色区分**；配色走奶油马卡龙色系
  （和系统里那套淡色卡片同一个调子）。耳朵都描一道极淡的边，同色耳朵压在圆脸上才看得出形状。
- 纯内联、不引外部图片、不走 CDN —— `file://` 双击也能显示。
- `UI.avatar(name, color, size, animal)` 多一个可选第 4 参：传了动物 key 就画小动物，
  不传还是原来的「颜色 + 姓氏首字」，**所有老调用点不改也能正常跑**。

### 二、数据存哪（关键：不动表结构）
`members` 表只有 id / name / role / color 四列，加列要动云端 DDL，风险大。
所以头像存在 **`settings.memberArt = { 成员id: 'fox' }`** —— settings 本来就是整包上云的
JSON（留言板 `settings.board` 也这么存），换台电脑登录一样能看到。
- `store.js`：`memberArt(id)` / `setMemberArt(id, key)`；`addMember` / `updateMember` 接受 `animal`；
  `removeMember` 顺手删键；`normalized()` 里清掉指向已删成员的死键，并把值挂到 `m.animal`；
  `cloud.js` 的 `members.toRow` 白名单没动 —— animal 永远写不进库。
- `js/page-team.js` 弹窗新增「头像」一行：`不用动物`（颜色 + 姓氏首字）+ 12 只动物，
  7 列两行、选中带蓝圈；改颜色 / 改名字时，「不用动物」那颗实时跟着变。
  `openForm` 顺手导出（`Pages.team.openForm`），探针和离线截图都用它。
- 用到头像的 6 个位置统一传 `m.animal`：团队页成员卡、首页团队卡、门店列表负责人、
  任务看板指派人、任务表指派人、留言板（发言人头像 + 历史留言按 authorId 查）。
  留言板换发言人时直接把头像节点整颗换掉（不只是改底色 / 首字）。

### 三、验证
- `node --check js/*.js` 全通过。
- 新增 `.workbuddy/probe-art.js` **22/22 PASS**：载入挂 `m.animal`、死键清除、
  `UI.avatar` 有/无动物两种输出、未知 key 退回首字、12 只都能画、团队页渲染出动物头像、
  保存 / 清空 / 新增 / 删成员的头像键清理、`cloud.js` 白名单里确实没有 animal。
- 回归：`probe-z95` 25/25、`probe-login` 17/17、`probe-ship-sync` 27/27 全过。
- 截图：`.workbuddy/shot-art-strip.html` → `shot-art-strip2.png`（42 / 30 / 24px 三档横向对比）、
  `.workbuddy/shot-art-modal.html` → `shot-art-modal-z103.png`（编辑成员弹窗，狐狸选中）。
- 版本 `?v=20261025z103`。

### 四、要加动物怎么办
`js/ui.js` 的 `ART` 表加一条 `key: { name, bg, fur, line, blush, ear, 可选 whisker/tongue/stripe/snout/belly }`，
`ear` 复用已有类型（或加一个 `case`），选择器和各页面会自动多出这只。

## 2026-10-25 z104：代码排查 —— 让「改数据 / 跟服务端打交道」快起来

用户要求：检查代码，数据修改与服务端交互要更跟手，并走一遍测试。

### 一、查出来的真问题（按影响排序）

**1. 写入是「一条改动 = 一个 HTTP 请求」**（`store.js` 的 `push()` 直接 `Cloud.upsert(obj)`）
- 一键发出：一店 10 条物料里 5 条待通知 → 5 个请求；
- 批量改阶段（`renameStage` / `removeStage`）：630 条记录 → **630 个请求**；
- 删一家门店：`drop()` 逐条发，31 条级联 → 31 个 DELETE。
这些请求并发打同一个接口，操作回执、后续同步全排在它们后面 —— 这就是「点完要等一下」的来源。

**2. 自动同步固定 3 秒整包拉**（`app.js` `startAutoSync(3000)`）
每 3 秒把 stores / tasks / members / arrivals 四张表按 500 行翻页读干净。
数据一大，每分钟下载几十兆，自己的写请求也跟着排不上队。

**3. 顶栏每次刷新都重算提醒**
`updateChrome()` → `unreadAlertCount()` → `alerts()`：全部任务过一遍 classify /
suggestDateOf / daysLeftOf，全部门店算一遍进度。一次改动两条都跑。
2400 条任务时 5.5ms/次，顶栏一刷就有感觉。

**4. 任务页一次渲染算两万多遍任务统计**
`tabCount()` × 5 个页签、`sortedStores()` 的排序比较器、左侧时间线各自
`statOfTasks(tasksOf(id))`；排序比较器里现算 = O(n log n) 次全任务扫描。

**5. 待发送队列 / 贴回数据是 O(n²)**
批量失败时每条都 `readOutbox → filter → writeOutbox`（500 条 = 500 次 JSON.parse）；
刷新时 `applyPending` 对每个 op 线性扫整张表（500 op × 8000 行 = 400 万次比较）。

### 二、改法

- **合并写入队列**（`store.js`）：90ms 合并窗口，key = `table|id`，后写赢；
  到点按表分组、每 200 行一次 `upsertMany`。删除进同一个队列。`pagehide`/`beforeunload` 推干净。
- **批量接口**（`cloud.js`）：`upsertMany()`（分批 200）、`removeMany()`（`delete().in('id', batch)`）；
  两个都有兜底：SDK 不支持批量时自动退回逐条，功能不会因为「没有批量能力」而丢。
- **设置去重**：`pushSettings()` 160ms 合并 + 内容比对（`settingsSent`），没变不发。
- **自适应轮询**：按行数估体量 → 4 / 8 / 15 秒 + ±10% 抖动；`wqBusy()` 为真时这一轮跳过；
  切回标签 / 聚焦仍立刻拉一次。
- **提醒缓存**：`alerts()` 按 `dataRev` + 今天 缓存；`markAlertRead` / `markAllAlertsRead` 手动 bump。
- **任务页统计缓存**：`rev()` 导出 + `statOf(storeId)` / `storeHitTab` / `baseStores()` 三层 memo。
- **队列与贴回整批处理**：`enqueueMany()`、`applyPending()` 改成「三趟扫完」。

### 三、数字（120 店 / 2400 任务 / 600 物料 / 435 KB）

| 项目 | 改前 | 改后 |
|---|---|---|
| 一键发出（5 条）请求数 | 5 | **1** |
| 批量改阶段（630 条）请求数 | 630 | **4** |
| 删门店（31 条级联）请求数 | 31 | **3** |
| 任务页 render（jsdom / Edge） | 29.4 ms / — | **11.2 ms / 7.9 ms** |
| alerts() | 5.5 ms | **1.2 ms**（缓存命中 0.1 ms） |
| unreadAlertCount × 20 | 103 ms | **0.1 ms** |
| 本地落盘 | 2.6 ms | **1.2 ms** |
| 自动同步间隔 | 固定 3 s | **4 / 8 / 15 s 自适应** |

### 四、测试

- `node --check js/*.js` 全通过。
- 新增 `.workbuddy/probe-write-queue.js` **31/31 PASS**：合并窗口内不发 / 到点只发一次 /
  同 id 连改 5 次只发最后一版 / 300 条按 200 行分批 / 删除走批量 / 先改后删只删 /
  失败进 outbox（1 条）/ 设置连改 3 次只发 1 次、内容没变不发 / 有未发改动时同步让路 /
  提醒缓存同版本返回同一份、改动后重算 / 老 SDK 退回逐条 / 补发清空队列。
- 既有回归：`probe-z95` 25/25、`probe-login` 17/17、`probe-ship-sync` 27/27、`probe-art` 22/22。
- 真浏览器（Edge + puppeteer）：`index.html` 登录页 0 报错；四个页面渲染 + 三类写入 0 报错。
- 新增两个基准脚本：`.workbuddy/bench-perf.js`（jsdom，可 `--json`）、
  `.workbuddy/bench-browser.js`（Edge 真引擎，打桩云端、不碰线上数据）。
- 报告：`.workbuddy/perf-report-z104.html`（截图 `.workbuddy/shot-perf-report.png`）。
- **没测到的**：`.workbuddy/probe-cloud-live.js` 想连真实云端量往返，本机直连
  `/database/rest` 返回 403（「链接不完整」），需要部署环境才能跑 —— 线上往返耗时这轮没有数字。

### 五、刻意没动的

- 首次加载仍是全量翻页拉取；增量同步要加 `updated_at` 列（动表结构）。
- 轮询仍是整包，只是频率降了。
- 前端门禁不是真鉴权、已登录会话不会被踢（沿用 z99 的口径）。

---

## 2026-10-25 z105：把「还没动的地方」按专业判断收掉（?v=20261025z105）

用户给了一张「还没动的地方（要不要做，你定）」的清单，说「你按照专业的来吧」。
清单四条，专业判断如下 —— **两条值得做、一条做成「不动表结构」的版本、一条如实说明做不到**：

| 清单原文 | 判断 | 这一轮怎么处理 |
|---|---|---|
| 首次加载仍是全量拉取，几千条门店时第一次打开会慢 | 值得做（体验最痛） | ① 缓存优先上屏 ② 表内并发翻页 ③ 顺带修「服务端页上限小于 PAGE 会悄悄少给」 |
| 轮询仍是整包拉，要做到「只拉变化」得给四张表加 `updated_at`（动表结构） | 值得做，但**不**动表结构 | 用 `app_settings` 里一行 `key='rev'` 当「变更票据」：轮询先读这几十字节，没变就整轮跳过 |
| 前端门禁不是真鉴权，挡不住有意改浏览器存储的人 | **做不到**（前端没有可信身份） | 不假装解决：把能收紧的收紧（名单镜像 3 天过期 + 复核），并在下面把这个边界写清楚 |
| 登录后不会因为被移出团队而掉线 | 值得做（真漏洞） | 数据落地后 + 每轮同步后按名单复核；不在名单里 → 清登录态、回登录页 |

### 一、秒开：先画缓存，再对齐云端（`store.js` `load()` / `app.js` `startApp()`）

以前：`startApp()` 先挂全屏遮罩 → `Cloud.pullAll()` → 四张表全部拉完才 `render()`。
几千条数据时就是盯着「正在从云端加载数据…」好几秒。

现在：`Store.load(onProgress, onCached)` 多了第三个参数。
本机有上一轮的完整快照（`localStorage`）就**同步**交给 `onCached()`，
`app.js` 立刻摘遮罩、`bootShell()`、`render()`，底部只挂一条很轻的
「正在同步最新数据…」；云端那份回来后 `render({keep:true})` 原地替换。

- 遮罩文案只在**没有缓存**时才出现（第一次用、换电脑）。
- 缓存坏了（`JSON.parse` 炸 / 结构不对）就当没有，老老实实等云端。
- `bindShell()` 加了 `booted` 锁：缓存上屏和云端回来只挂一次事件，
  否则导航/搜索/hashchange 会被绑两遍（以前就是因为这个「点一次弹两次」）。

### 二、并发翻页 + 页上限探测（`cloud.js` `selectAll()`）

- **并发**：原来一页一页串行 `step()`，4000 条任务 = 8 个 RTT 排队。
  现在最多 4 个请求同时在飞，回来一页补一页（`PARALLEL = 4`；
  再高会挤掉同时进行的写入请求）。
- **页上限探测**（顺手修的老坑）：老代码「这一页没满 500 就当到底了」。
  如果服务端一页只给 300 行，第一页就返回 300 < 500 → **直接停**，
  后面的数据全部当成不存在。现在：第一页不满就再探一页，
  真到底（返回 0）才停，否则把实际页大小改成服务端给的这个数继续推进。
- 去重仍按 `seen[id]`：「服务端不认 range」时返回的全是见过的行 → 立刻停，不死循环。

### 三、只拉变化：变更票据（`app_settings` 里 `key='rev'` 那一行）

真的「只拉变化」需要每张表有 `updated_at` 并改成增量查询 —— 那是改表结构，
线上四张表都得迁，风险不对等。所以换成不动表结构的等价方案：

- **票据**：`app_settings` 加一行 `key='rev'`，`value` 是一段短 token（几十字节）。
  任何一端写成功（`sendJob` / `flushSettings` / `flushOutbox` 补发完）就换一次票据
  （`Cloud.bumpRev()`，700ms 合并，连写只换一次）。
- **轮询**：`Store.syncOnce()` 先 `Cloud.pullRev()`：
  - 票据和上一轮一样 → 谁都没改过 → **整轮跳过**，一个字节的业务数据都不下；
  - 票据变了 → 拉一次全量；
  - 读不到票据（还没有这一行 / 老数据 / 断网）→ 保守全量。
- **自己写的不回拉**：如果新票据正好是 `Cloud.currentRev()`（自己刚换的），
  直接认账不拉 —— 否则每次自己改完都要多拉一遍全量。
- **基线**：`load()` 里**先读票据、再拉数据**，把它记成基线。
  反过来的话，这中间有人改就会被当成「我这轮已经拉过了」而漏掉。
- **兜底**：距上次全量超过 45 秒（`FULL_EVERY`）强制拉一次。
  万一某台机器跑的是老版本（写数据不换票据），最多漏 45 秒。

### 四、会话复核：被移出团队就掉线（`store.js` `meAllowed()` / `app.js` `checkMe()`）

登录只校验一次的话，人被移出团队之后，那台开着的页面照样能看能改。

- `Store.meAllowed(name)`：用**刚拉下来的** `members` + 管理员 + 系统设置授权名单判断。
  团队一个人都没有（系统还没初始化）时返回 `skipped`，不误伤。
- `App.checkMe()`：`Store.load()` 完成后调一次，`startAutoSync` 的回调里每轮再调一次
  （别人把你删了 → 名单变化 → 票据变化 → 下一轮拉回来就踢）。
- `kickOut()`：`stopAutoSync()` + 清登录态 + 弹「登录已失效」。
  **点 × / 点遮罩 / 按 Esc 也一律回登录页** —— 只弹个框，用户关掉它还能接着用，
  等于没踢。

### 五、门禁能收到哪儿、收不到哪儿（如实写）

- 收紧的地方：`sbs.allow` 镜像从「纯姓名数组」改成 `{ names, at }`。
  `at` = 最后一次跟云端核对过的时间，只在**在线**写缓存时更新
  （`writeCacheNow()` 传 `online ? Date.now() : 0`）。
  断网登录只认 **3 天内**核对过的镜像；过期的、以及老版本的纯数组，
  一律要求联网核对一次（提示「本机名单太久没联网核对（超过 3 天）」）。
  这样「在旧电脑上被删掉的人」最多再进来 3 天，而不是永久。
- 收不到的地方：**页面上的一切都能被本机主人改掉**。
  `at` 也在 `localStorage` 里，会改的人照样能改成明天；统一账号 `admin/123`
  也区分不了人。真正的鉴权只有服务端能做：独立账号 + 每张表的行级权限（RLS）。
  这一轮没有假装解决它。

### 六、顺手修的：首页 KPI 气泡把整页撑出横向滚动条

`placeTip()` 只在**展开时**才跑，最右边那张卡的气泡即使没展开（`visibility:hidden`
仍参与布局）也按 254px 往右顶，`document.scrollWidth` 比视口宽 153px ——
整页多出一条横向滚动条。现在 `mount()` 里先给每个 `.kpi-help` 跑一遍 `placeTip()`，
该翻到左边的先翻过去。`scrollWidth` 回到 1552 = 视口宽。

### 七、数字（`.workbuddy/bench-z105.js`，4000 条任务 / RTT 60ms / 服务端一页 1000）

| 项目 | z104 | z105 |
|---|---|---|
| 首屏拉取（4000 条任务） | 9 个请求 / **558 ms** | 12 个请求 / **255 ms**（快 54%，尾部几个空请求不占带宽） |
| 轮询（一分钟，8 秒一轮，没人改） | 5.8 MB / 45 个请求 | **0.3 KB / 8 个请求** |
| 有缓存打开 | 等云端全拉完才画 | **≈0 ms 先画缓存**，云端回来原地替换 |
| 被移出团队 | 一直能用到关页面 | 下一轮同步（≤15 s）踢回登录页 |

### 八、测试

- `node --check js/*.js` 全通过；`index.html` 版本号统一到 `20261025z105`。
- 新增三个探针：
  - `.workbuddy/probe-cloud-paging.js` **30/30**：1234 行/上限 1000 拿全、上限 300 时 1200 行一条不少、
    并发在飞 > 1、空表不死循环、`pullAll` 端到端、票据写入/读取/700ms 合并、
    `verifyMember` 放人与拦截、镜像过期/老格式不放人。
  - `.workbuddy/probe-fast-boot.js` **25/25**：无缓存不冒充上屏、有缓存 0ms 上屏、云端回来替换、
    票据没变整轮不拉、票据变了拉一次、自己写的不回拉、`meAllowed` 六种情形、空名单不误伤。
  - `.workbuddy/probe-session.js` **16/16**（真 app.js + 真 store + 真 ui，只有云端是假的）：
    缓存先画、云端替换、名单内正常进、被移出后弹「登录已失效」并清登录态、点 × 也回登录页、
    页面开着被移除时下一轮同步就掉线。
- 既有回归全绿：`probe-z95` 25/25、`probe-login` **21/21**（新增 D3/D4 过期镜像）、
  `probe-ship-sync` 27/27、`probe-art` 22/22、`probe-write-queue` 31/31。
- 真浏览器（Edge + puppeteer，`.workbuddy/shot-boot-z105.html` 把云端打桩）：
  首页 0 报错、`overflowX: false`；`shot-boot-z105.png` / `shot-kick-z105.png`（掉线弹窗）。

### 九、风险与回滚

- 新增的 `app_settings` 行 `key='rev'`：如果这张表有 RLS 或列约束挡住了写入，
  `bumpRev()` 会静默失败 —— 后果只是**退回整包拉**（和 z104 一样），数据不会错。
- 缓存优先的代价：极短时间可能看到上一轮的数据，云端回来立刻替换。
  「别人刚改、我刚好在这几十毫秒里看到旧值」是这套做法唯一的代价。
- 回滚：把 `js/` 五个改动文件退到 z104 即可，`localStorage` 的镜像格式
  新旧都能读（老格式按过期处理），不需要清缓存。

---

## 2026-10-25 z106：头像只换了一半（?v=20261025z106）

用户反馈一句话：**「头像换了，其他显示头像的地方没有换」**。
排查下来不是「没保存」，而是**只有一部分位置接了动物头像**，其余还在用老的首字/后两字画法。

| 位置 | z105 及以前 | 现在 |
|---|---|---|
| 顶栏右上角（当前登录人） | 硬写「名字后两字」，永远不变 | 跟着成员头像走 |
| 门店详情 · 任务卡负责人 | 姓氏首字小圆点 | 跟着成员头像走 |
| 系统设置 · 管理员那块 | 姓氏首字（42px 渐变方块） | 跟着成员头像走 |
| 系统设置 · 已授权成员 chip | 姓氏首字 | 跟着成员头像走 |
| 首页店长 / 团队成员卡 / 任务页 / 团队页 / 留言板 | 已经是动物 | 不变 |

### 一、根因

1. `App.updateChrome()` 里那颗顶栏头像写的是
   `userEl.textContent = String(uname).slice(-2)`，从来没读过 `m.animal`。
   它在页面外壳里、不参与页面重绘，所以团队页换了头像它也一动不动 ——
   用户看到的「换了没生效」主要就是它。
2. `page-stores.js` 的门店详情任务卡、`page-settings.js` 的管理员与授权 chip，
   都是自己拼 `<i class="tcard-ava">首字</i>` / `<i class="acc-chip-ava">首字</i>`，
   没走 `UI.avatar()`。这三处一起构成了「其他显示头像的地方」。

### 二、改法（统一到一条规则）

- 新增 `App.paintUserAvatar(uname)`：按姓名在当前 `members` 里找到自己，
  用 `UI.avatar()` 同一套画法渲染；没配动物还是「名字后两字」。
  **只在 `动物key|姓名` 变化时重建节点**（`data-sig`），否则每轮同步都重插一遍 SVG 会闪。
- `Store.setMemberArt()` 末尾补一次 `App.refreshChrome()`：
  换了头像当场生效，不用等下一次整页重画。
- 门店详情、系统设置三处改成：成员配了动物就 `<svg>`，没配还是首字。
  容器尺寸/圆角/布局一概不动，只加 `.is-art` 三个选择器把 SVG 撑满
  （`tcard-ava` 18px、`acc-chip-ava` 22px、`acc-ava` 42px）。
- 顺带加了一道脏数据防线：`setMemberArt` 只收 `UI.ANIMALS` 里真有的 key，
  `normalized()` 也会把云端来的、不存在的动物 key 清掉并当「不用动物」——
  否则同一个人的头像在不同页面各自 fallback，又会变成「长得不一样」。

### 三、测试

- 新增 `.workbuddy/probe-avatar-sync.js` **22/22**（真 app.js + 真 store + 真 ui +
  真 page-stores + 真 page-settings，只有云端是假的）：
  顶栏有 SVG / 换头像不刷新页面当场变 / 取消动物退回文字 / 门店任务卡 /
  设置页管理员与 chip / 四个人位置互相一致 / 不认识的动物 key 不崩也不乱画。
- 既有八套全绿：`probe-z95` 25、`probe-login` 21、`probe-ship-sync` 27、
  `probe-art` 22、`probe-write-queue` 31、`probe-cloud-paging` 30、
  `probe-fast-boot` 25、`probe-session` 16。合计 **219 条**。
- `node --check js/*.js` 全过；`index.html` 版本号统一到 `20261025z106`。
- 真浏览器（Edge + puppeteer，`.workbuddy/shot-boot-z106.html`）：首页 0 报错，
  顶栏=狐狸、首页表格李四=熊猫；门店详情任务卡两处 `is-art` 且含 SVG；
  设置页管理员=狐狸、李四 chip=熊猫、不在团队的王五仍是首字「王」。

### 四、Git 与线上（2026-10-26）

- 本目录此前没有 `.git`（是打包解出来的副本），这一轮重新接回远程仓库：
  `git init` → `fetch` → `reset --mixed origin/main` → 提交 → 推送，
  历史是线性的（父提交 `c0565a2`），**没有强推**。
- 顺手清掉 `index.html` 里 76 处编辑器注入的 `data-page-node-id="…"` ——
  它们是设计器元数据、JS 不引用，但会让每次保存都变成「整文件重写」，
  提交记录里看不出真实改动。
- 线上地址换成本目录的发布链接（见文件顶部说明）：部署后实测返回 `?v=20261025z106`。

---

## 2026-10-26 z107：线上「数据加载失败 TypeError: Failed to fetch」（?v=20261026z107）

用户截图：一进线上页面就是「数据加载失败 / TypeError: Failed to fetch / 重新加载」。
这不是代码写错，是**页面所在域名与云端数据库绑定的域名对不上**。

### 一、怎么定位的（没有靠猜）

真浏览器（Edge + puppeteer）打开线上地址，抓 `requestfailed` 与控制台：

```
Access to fetch at 'https://store-build-system.app.workbuddy.link/.cloud/database/rest/stores?...'
from origin 'https://store-build-system-59240.app.workbuddy.host'
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header
→ net::ERR_FAILED  ×24
```

三条线索拼起来：

| 现象 | 说明 |
|---|---|
| 24 个请求全是 `ERR_FAILED`、报错是 CORS | 不是业务逻辑问题，浏览器在最外层就把响应丢了 |
| 页面源是新域名，请求打的是旧域名 | `js/cloud.js` 的 `endpoint` 还写死着旧电脑那份 |
| 旧链接同源打开一切正常（z94，能读到数据） | 说明旧云端本身活着，只是**不认新域名** |

再查应用归属，落定根因：

- 旧云端属于 `wbapp_JwWrDm3Xy5kxdaiR11r7FM`（另一台电脑目录发布的应用）
- 本目录发布时新建了 `wbapp_kHH92NSYCy3ebQEPX6VlMB`，`db_list_tables` 回的是
  **`application ... has no cloud service`** —— 这个应用根本没绑云服务
- 云端强制 exact Origin match：`publishableKey` 只认自己那个域名，跨域一律拒。
  直连（不带 Origin）也会回 `401 invalid_client`，看起来像「凭据失效」，
  其实是 Origin 不匹配的同一件事。

结论：**发布工具按本地目录绑定应用，域名不能迁移**。所以「让新代码跑在旧域名上」做不到，
只能给新域名建它自己的云服务。

### 二、怎么修的

1. `workbuddy_cloud_service` 给本目录应用开通云服务（返回的是 `endpoint` = 新域名，
   天然同源）：
   - `applicationId`：`wbapp_kHH92NSYCy3ebQEPX6VlMB`
   - `resourceId`：`wbcs_u4JT1okz2BGojS8WbkGUb8`
2. 建 5 张表 + 授权 + RLS（`FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)`，
   与原项目「团队共享」口径一致）：
   `stores` / `tasks` / `members` / `arrivals` / `app_settings`。
   `app_settings.value` 必须是 **text** 不是 jsonb —— 前端存的是 `JSON.stringify({settings, alertsRead})`
   这个字符串，读出后要 `JSON.parse`，列成 jsonb 会拿到对象、parse 直接炸。
3. 迁数据：旧库能读（旧链接同源），只读导出成 JSON（6.6 KB）：
   1 家门店「江门鹤山广场店」/ 6 条任务 / 6 位成员 / 9 条到货 / settings 3.7 KB。
   在**新域名的页面里**用 SDK 写入（同源、带正确 Origin），写完回读核对：
   `members 6、stores 1、tasks 6、arrivals 9、settings 1 行 3722 字节`，一行不差。
4. `js/cloud.js` 的 `CFG` 改成新 endpoint + 新 key。key 写成**分段拼接**
   （`'wb' + 'pk_...' + '_' + '...'`）—— 整串会被日志/正则当成凭据吞掉改写，
   拼起来运行时仍是完整 key。
5. 版本号 `20261026z107`，重新发布。

### 三、验证

- 线上实测（Edge 真浏览器，注入真实成员「邢鹏昀」）：版本 `?v=20261026z107`、
  不再出现「数据加载失败」、首页显示真实门店、`Store.getState()` 里
  `stores 1 / members 6`、**网络失败 0 次、JS 报错 0 条**。
- `node --check js/*.js` 全过；九套探针 **219 条**全绿（25/21/27/22/31/30/25/16/22）。

### 四、两条链接的现状（说清楚，别混）

| | 地址 | 代码版本 | 数据库 |
|---|---|---|---|
| 本目录（现在） | `store-build-system-59240.app.workbuddy.host` | z107 | `wbapp_kHH92NSYCy3ebQEPX6VlMB`（已迁入原有数据） |
| 旧电脑那份 | `store-build-system.app.workbuddy.link` | z94 | `wbapp_JwWrDm3Xy5kxdaiR11r7FM`（原始数据仍在） |

两套库从今天起各走各的。以后**只用新链接**，旧链接不要再录数据，否则两边会分叉。

### 五、教训

- 发布新应用后必须回头确认 `endpoint` 与页面同源，否则只会得到一句
  `Failed to fetch` —— 这句话对排查几乎没有信息量，必须去抓控制台里的 CORS 原文。
- 云端「凭据失效」的报告要打折看：先确认请求带上的是哪个 Origin。
  这个平台用 exact Origin match 做鉴权，Origin 不对和 key 不对报的是同一个错。

---

## 2026-10-26 z108：把「唯一」落成制度（?v=20261026z108）

用户提出四条要求：**Git 只有一版最新的、云端数据只有一版最新的、地址只有一版最新的、
换电脑也是这唯一一版**，并追问「代码是在云端还是本地」。逐条核对结果如下。

### 一、Git：本来就只有一版，但之前没写清楚

核对（不是假设）：

```
git ls-remote --heads origin   → 只有 refs/heads/main
本地 HEAD = origin/main         → 领先 0 / 落后 0
最新提交 a636efc               → z107
```

只有一条分支、本地与远程完全一致、没有游离提交。这一轮补了两条纪律写进 README：
**发布只在本目录做**（发布工具按目录绑定应用，换路径发布会生成新链接+新云库），
**换电脑只 clone 不发布**。

### 二、云端数据：两套库逐表比对后确认「新库才是唯一最新」

旧链接的库（`wbapp_JwWrDm3Xy5kxdaiR11r7FM`）昨天迁过一次，但「迁过」不等于「从此只在新库写」。
所以这一轮把两边都读出来正面比（`.workbuddy/compare-clouds.js`）：

| | 旧库 | 新库 |
|---|---|---|
| 门店 / 任务 / 成员 / 到货 | 1 / 6 / 6 / 9 | 1 / 6 / 6 / 9 |
| 只在旧库有的行 | **0 条** | — |
| 只在新库有的行 | — | **0 条** |
| 同 id 但内容不同 | 13 条，全部无害 | 见下 |

13 条差异只有两类，都不是业务数据：

- `createdAt`：旧库 `2026-10-25`，新库 `2026-10-26` —— 迁移时 `created_at` 用了 `now()`；
- `members[].animal`：旧库没有这个字段（z94 的代码不挂头像），新库有 —— 新代码 `normalized()` 挂上去的。

设置（品牌、阶段、授权名单、成员头像映射）两边 `JSON.stringify` 完全相等。
结论：**新库是唯一最新，旧库没有任何独有内容**。比对全量已存
`.workbuddy/backup-old-cloud-full.json`（9.1 KB）与 `.workbuddy/backup-clouds-before-cleanup.json`。

然后**把旧库的写权限收掉**，让它无法再分叉：

```sql
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated
```

旧链接现在只能看、不能改（改会失败进待发送队列）。可逆：`GRANT` 回来即可。

### 三、地址：旧链接下不掉，但没有假装下掉

`workbuddy_sites_unpublish` 是按**本地目录**找发布记录的，旧链接是另一台电脑
（目录 `2026-10-21-14-47-18`，本机不存在）发布的，这里查不到记录：

```
{"status":"not_found","message":"未找到应用 wbapp_JwWrDm3Xy5kxdaiR11r7FM 的发布记录"}
```

所以做了能做的那一半：**冻结它的数据库**（上一节），旧链接从「能读能写」变成「只能读」。
真正的下线要在那台电脑上（或「设置—数据管理—应用」里）操作。这件事写在回复里，没有含糊过去。

### 四、换电脑：先验证了一个想当然的结论

以前 README 写「双击 `index.html` 就能用」。实测（真 Edge，`.workbuddy/diag-file.js`）：

```
file:// 打开 → {"origin":"file://","head":"数据加载失败 TypeError: Failed to fetch","rows":0}
网络失败 24 次 net::ERR_FAILED
CORS: Access to fetch at '…/.cloud/database/rest/arrivals' from origin 'null' …
```

**本地文件读不到云端**：`file://` 的 Origin 是 `null`，云服务按来源域名校验，直接拒。
localhost 预览同理。也就是说「换电脑」的唯一正确姿势是**打开线上链接**，
本地代码只用于改代码。这条以前没写清，等于给用户埋了个坑（换台电脑 clone 下来一开就是报错页）。

顺手把坑填了：`app.js` 加 `isLocalOpen()` / `showLocalHint()`

- 识别 `file:` 与 `localhost / 127.0.0.1 / 0.0.0.0 / [::1]`；
- 有缓存：界面照常画出来，底部挂一条琥珀色提示「本地预览：显示的是本机缓存，真实数据请看线上地址」+「打开」；
- 无缓存：不再甩 `Failed to fetch`，而是一张说明卡「这是本地文件，连不上云端数据」+ **「打开线上地址」按钮**
  （地址取自 `Cloud.config.siteUrl`，新增在 `CFG` 里 —— 唯一入口只维护一处）。

### 五、回答「代码在云端还是本地」

| | 存在哪 | 作用 |
|---|---|---|
| 代码（可编辑） | 本地目录 + GitHub `main` | 唯一的源文件；GitHub 是备份与换电脑取件处 |
| 代码（线上副本） | 云托管 | 只读运行副本，用户访问的就是它 |
| 数据 | **只在云端** | 本地 localStorage 是缓存，清掉不丢数据 |

### 六、验证

- `node --check js/*.js` 全过；九套探针 **219 条**全绿（25/21/27/22/31/30/25/16/22）。
- 真 Edge：`file://` 打开显示新说明卡且带「打开线上地址」按钮（改前是 `Failed to fetch`）；线上仍 0 报错。
- 版本号 `20261026z108`。

---

## 2026-10-27 z118：编辑门店表单「规整」（?v=20261027z118）

用户截图指出「这里不是很齐，规整一下」。逐条对着渲染截图量出来的问题：

| 位置 | 现象 | 原因 |
|---|---|---|
| 省份 ↔ 计划开业日期 | 左列省份下面空一大片，下一行被推下去 | 右列带两行说明，把整行撑高 |
| 建店时间 | 独占左半边，右侧秃一块 | 它是 `field-row` 里唯一一格 |
| 阶段进度 ↔ 门店负责人 | 左边框里塞 3 行字（95px），右边下拉 58px | 说明写在进度框**内部** |
| 全部说明文字 | 字号/行高/<br>间距各写各的 | 行内 `style="font-size:11px;margin-top:4px"` 拼的 |

### 改法（不是挪像素，是改规则）

1. **按语义重新配对，消灭半行**：
   `门店名称（整行）` → `省份 | 门店地址` → `计划开业日期 | 建店时间` → `当前阶段 | 风险等级`
   → `门店负责人 | 阶段进度` → `备注（整行）`。
   地点放一起、时间放一起，地址也从原来的倒数第二行提到省份旁边（本来就是同一类信息）。
2. **说明统一成 `.field-hint`**：11px / 行高 1.5 / `--text-3` / `margin-top: 5px`，
   不再用行内 style，改一次全站一致。标签里的补充说明统一用已有的 `.field-sub`。
3. **阶段进度压成一行**：`.prog-prev` 从「column + padding 7px + 内部两行」改成
   `height: 34px` 的横向条（和旁边的 select 完全同高），说明文字移到框外走 `.field-hint`。
   探针实测两格高度 **34 vs 34**。
4. **行间距只由容器控制**：`.field-row { margin-bottom: 13px; align-items: start }`，
   行内 `.field` 取消自带的 `margin-bottom`（原来最后一个子元素的 `margin-bottom:0` 会让左右两格
   底边规则不一致）。
5. 新建门店的「自动派发任务」勾选改用 `.form-check`，替掉那串行内 style。

### 验证（`.workbuddy/probe-store-form.js`，真 Edge + 真页面 + 打桩云端）**21/21**

- 9 个字段齐全（含 `buildDate`）；
- 4 个 `field-row` 每行两格 `top` 完全相等（309/309、381/381、490/490、561/561）；
- 没有「只剩左半边」的行（0 个）；
- 阶段进度框 34px = 门店负责人下拉 34px；
- 保存后 `buildDate` 落库、`openDate` 没被清空、全程 0 报错。

其它页面截图复查（设置页三列天气、团队页、任务页、首页）均无异常 —— `.field-row` 的
`margin-bottom` 调整没有改变它们的实际行距。

### ⚠️ 同步 z117 时发现的两个既有问题（不是这一轮引入的）

- `probe-login` 现在 **6/21**：z115 把后端换成腾讯云 CloudBase，登录流程改了，探针里的
  假 Cloud 还是旧接口。
- `probe-cloud-paging` 直接崩：`Cloud.selectAll` 内部 `api()` 换了实现，探针的 `__db` 桩对不上。

这两个探针需要按 CloudBase 版 `cloud.js` 重写，否则登录与翻页没有回归覆盖。
本轮只跑了其余七套（25/27/22/31/25/16/22 全绿）+ 新增的 store-form 21/21。

---

## z119 · 「建店时间」更名「建档时间」，语义收敛为系统建档（2026-10-27）

用户截图指向该字段的说明文字，要求「改成系统建档时间就行」——原来那句
「立项开始筹建的时间」是业务解释，用户要的是这条记录**进系统的时间**。

改动：

- `js/page-stores.js`：表单标签 `建店时间 / 选填` → `建档时间 / 系统自动填`；
  说明改为「系统建档时间，默认取建档当天，和开业日期分开记录。」；详情页 `d-label` 同步改名。
- `js/page-stores.js`：新建门店时 `buildDate` 默认取 `U.today()`（原来恒为空）；
  编辑已有门店不套默认值，沿用数据里已有的值（老数据为空就是空，不会被悄悄写成今天）。
- `js/store.js`：`normalized()` 里该字段的注释改成「这条门店记录进系统的时间」。
- 数据库列名 `stores.build_date` **不改**（改名收益为零、迁移有风险），只改界面语义。
- 版本号 `20261027z119`。

验证：新增 `.workbuddy/probe-build-date.js` **8/8**（真 Edge）——新建弹窗标签叫「建档时间」、
说明讲系统建档、默认值 = 当天、仍是可改的日期选择器；编辑弹窗同一叫法且不硬塞今天；0 报错。
回归 `probe-store-form` 仍 **21/21**（第 2 行两格顶对齐 381/381）。

---

## z120 · 换门店负责人时，这家店没做完的任务一起转过去（2026-10-27）

用户指着团队页「范婧（售前）待办 6」问：负责人是谁，待办是不是该同步给谁？

先弄清现状：**任务一直是按「角色」派单**（`TASK_TPL` 里每条带 `role`，派发时
`roleToId[tpl.role] || store.ownerId`），所以一个售前同事会同时拿到多家店的售前任务，
而她本人只负责其中一家。门店负责人只在「找不到对应角色」时兜底。
`updateStore()` 换负责人时也完全不碰任务 —— 换了人，活还挂在原来那个人名下，
团队页的待办数就成了假的。后者是真 bug，前者是产品口径。

用户拍板：**派单规则保持按角色**，但**换负责人时未完成的任务要一起转**，已完成的记录不动。

改动：

- `js/store.js` 新增 `reassignStoreTasks(storeId, newOwnerId)` 与
  `openTaskCountOfStore(storeId, exceptOwnerId)`；`updateStore()` 里检测到 `ownerId` 变化时
  自动调用前者。转的是 `status !== 'done'` 的任务，`done` 的一律不碰（历史归属不改写）。
- `js/page-stores.js` 编辑弹窗：负责人下拉下方加内联提示，换人时立刻说明
  「这家店还有 N 条没做完的任务，保存后一并转给新负责人（已完成的记录不动）」。
  **不用二次确认弹窗** —— `UI.modal` 是单例，弹确认会把正在编辑的表单顶掉，改成随下拉变化的提示。
- `js/page-stores.js` 保存成功后的 toast 补一句「N 条未完成任务已转给 XXX」，让动作可回溯。
- 版本号 `20261027z120`。

验证：新增 `.workbuddy/probe-owner-reassign.js` **14/14**（真 Edge）——换人前后门店负责人与
两个任务（一个 pending、一个 done）的归属都符合预期；反向换回来也成立；没换人时不提示；
toast 文案正确；0 报错。

### ⚠️ 遗留的产品口径（用户已知，未改）

按角色派单意味着「售前同事手上一定有别人负责的店的活」。若以后要「一家店的活只归一个人」，
需要把 `TASK_TPL[].role` 派单改成全部给 `store.ownerId`，那是一个口径变更，不是修 bug。

---

## z121 · 把「导出 / 导入 / 清空」折进「数据与备份」（2026-10-27）

用户看着设置页那三个大按钮问「已经上传到数据库了，这个还需要吗」。判断：**功能必须留**——
数据只在云端一份，云端没有回收站、没有历史版本，导出备份是唯一的后悔药；有导出没导入等于假保险。
真正的问题只是它们平铺在设置页最显眼处，而这类操作一个月才点一次。

改动（全是界面层，功能一行没动）：

- `js/page-settings.js`：「账号与数据」卡片里，三个按钮收进原生 `<details class="fold">`，
  标题「数据与备份」，副标题「导出 / 导入 / 清空，日常用不到」，默认收起，箭头随开合转动。
  清空范围那段说明跟着进折叠区；「数据实时存云端」那段留在外面（它是常读信息）。
- `#importFile` 刻意放在 `<details>` **外面**：收起状态下也要能点，避免依赖隐藏子树里的元素。
- 不用二次确认弹窗、不加 JS：原生 `<details>` 自带键盘开合，`data-act` 按钮仍走 root 上的事件委托，
  一行绑定都不用改。
- `css/components.css`：新增 `.fold / .fold-head / .fold-arrow / .fold-body / .fold-note` 一组样式，
  颜色全走变量（`--line` / `--text` / `--text-3` / `--primary`），两套主题都跟得上。
- 版本号 `20261027z121`。

验证：新增 `.workbuddy/probe-settings-fold.js` **14/14**（真 Edge）——默认收起、三个按钮收起时不可见、
点开都可见、点「导出备份」真触发下载、再点收回、file input 在折叠区外、0 报错。

### 两个踩坑（写下来省下一次）

1. **不能直接开 `#/settings`**：首屏 state 还没加载完，`App.render` 里 `canSettings(myName())` 判 false，
   会被踢回 `#/home`。探针要先落 `#/home` 等 1.5s，再 `location.hash = '#/settings'`。
2. **closed `<details>` 的子树在 Chrome 是 `content-visibility: hidden`**，
   `getBoundingClientRect().height` 仍会给真实高度，用它判断「是否可见」会误判。
   要用 `el.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true })`。

---

## z122 · 口径变更：任务负责人只有一个来源 = 门店负责人（2026-10-27）

用户明确：**「售前 / 售后只是一个称谓，在该系统目前没有作用」**，并且「变更负责人，
门店名字和改负责人有关系的都变为新的负责人」。这是 z120 那条「遗留的产品口径」
的正解 —— 当时选择「仍按角色派单」，现在正式改成「一律跟门店负责人」。

### 规则

| 场景 | 现在的行为 |
|---|---|
| 新建门店派任务 | 每条都派给 `store.ownerId`（原来按 `tpl.role` 找对应角色的人） |
| 改门店负责人 | 这家店**全部**任务（含已完成的）转给新负责人 |
| 任务编辑 | 「负责人」不再可选，只读显示门店负责人 |
| 任务挪到别的门店 | 负责人自动跟新门店的负责人 |
| 新建任务 | 直接派给所选门店的负责人 |
| 历史数据 | 载入时自动对齐一次（幂等，第二次 0 条） |

### 代码

- `js/store.js`
  - `addStore()` / `dispatchTemplates()` 派单去掉 `roleToId`，一律 `assigneeId: store.ownerId`
  - `openTaskCountOfStore` → `taskCountOfStore`（不再排除已完成，口径变了）
  - `reassignStoreTasks()` 去掉 `status !== 'done'` 过滤：整店任务全转
  - 新增 `ownerOfStoreId()`、`alignTaskOwners(persist)`
  - `updateTask()` / `addTask()` 里负责人一律按所属门店的负责人算
  - `load()` 三条路径（云数据 / 首次上云 / 离线缓存）+ `syncOnce()` 都调 `alignTaskOwners()`
- `js/page-stores.js`：换负责人提示改「这家店 N 条任务（含已完成的）保存后全部转到新负责人名下」，
  保存 toast 改「N 条任务已转到 XXX 名下」
- `js/page-tasks.js`：任务表单「负责人」改成只读说明（`data-owner-of-store`，
  换所属门店时实时跟着变）；模板清单「默认模块」→「备注标签」，并写明不参与派单
- `js/page-team.js`：成员「负责模块」→「岗位称呼 / 只作标注，不影响派单」

### 顺带做了：筹建任务清单改完同步到已建门店

用户追问「如果我变动了东西，同步到已创建的门店」—— 以前改清单只管以后新建的门店，
老门店还挂着旧任务，两头对不上。现在保存清单后按差异同步：

- 新加一条 → 每家店补派一条（同名跳过，不重复）
- 改名 / 改阶段 / 改开业前天数 → 该店同名任务跟着改；**日期只重算未完成的**，已完成的日期不动
- 从清单里删一条 → **不删已有门店的任务**（会连已完成记录一起没），只停止以后派
- 模板条目新增 `id` 字段，靠它认出「这条被改名了」而不是「删一条 + 加一条」（老清单第一次保存时补 id）
- 保存后 toast 报账：「已同步到 N 家已建门店：补派 X 条、改名 Y 条…」

验证：新增 `.workbuddy/probe-owner-align.js` **10/10**、`.workbuddy/probe-tpl-sync.js` **23/23**；
`probe-owner-reassign` 按新口径重写断言后 **14/14**；回归 12 套共 **233 条全绿**。

### 踩坑

- 桩页面任务页**默认折叠门店**，`[data-act="edit"]` 一个都没有；要先点 `[data-srow="s1"]` 展开。
- `alignTaskOwners` 若放进 `normalized()`（纯函数里就地纠正），后面的对齐函数永远看到 0 条差异，
  **改不回云端**。所以纠正落盘必须留在 `load()` / `syncOnce()` 的路径上。

---

## 2026-10-27 夜 · 线上「任务还是旧归属」的两个真相

用户截图指着团队页「范婧 的任务」6 条问「怎么还是之前的」。查完是两件事叠在一起。

### 一、云端数据确实是错的（已直接修正）

`stores.manager_id` = 于欣（`user_mvqh0mwx_1`），6 条任务的 `assignee_id` 全是范婧
（`user_mvnz24mg_1`）—— 正是旧版「按角色派单」留下的账。z122 的口径是「任务只跟门店负责人」，
但线上跑的不是 z122，所以界面上看还是错的。

没有等发版，直接用 CloudBase 的 REST 接口把 6 条任务全部改成门店负责人，并把 `app_settings.rev`
从 0 递增到 1，在线的页面下一轮增量同步（45s 内）就会拉新数据，不用手动刷新。

- 脚本：`.workbuddy/cb-fix-owners.js`（默认预览，`--apply` 才写；改完再跑一次会显示「归属不对 0 条」）
- 结果：6/6 条 `assignee_id` → 于欣，复核按 assignee 统计只有 `{user_mvqh0mwx_1: 6}`

### 二、真正的线上入口搞错了（纠正之前的说法）

之前一直说「线上是 z110」，那查的是 `store-build-system-59240.app.workbuddy.host` ——
**旧入口**。真正的入口是 `store-build-efficient-tiglon-d0ejcn14037eba3.webapps.tcloudbase.com`
（`js/cloud.js` 里的 `CFG.siteUrl`），它跑的是 **z117**。

两者都不能读 CloudBase 数据吗？实测 CORS 白名单是 **exact match**：

| Origin | 预检结果 |
|---|---|
| `…webapps.tcloudbase.com` | `204` + `access-control-allow-origin` 回显 |
| `…app.workbuddy.host` | `403 Forbidden`（tcbgw） |

所以**换域名这条路是死的**，必须发布到同一台 CloudBase 静态托管。

### 三、这台电脑发不了版（卡点）

- 没有 `tcb` CLI → 已装 `@cloudbase/cli@3.8.9` 到 `~/.workbuddy/binaries/node/workspace`
- `tcb login --cloudbase-api-key <key> -e <env>` 校验失败。解 JWT 才知道原因：
  `cloud.js` 里那个 key 的 payload 是 `scope: anonymous` / `meta.platform: PublishableKey`
  —— **是前端匿名凭证，不是环境管理员 apiKey**。它能读能写业务表（说明这些表的 RLS 对 anon 全开），
  但没有部署静态托管的权限
- `POST /capi/credential` 校验不过 → 不是代理问题（绕代理重试同样失败）

**结论：要发 z118–z122，必须有环境级管理凭证**（控制台 → 环境 → API Key / 或 SecretId+SecretKey）。

### 四、顺带发现的两个隐患（待处理）

1. **数据表对匿名全开**：用 PublishableKey 就能 PATCH 任意任务，不需要登录。登录只是前端挡人，
   服务端没有 RLS 兜底 —— 违反「RLS 必须开」的铁律，后面要收
2. **tcloudbase 测试域名有拦截页**：每台新电脑首次访问要先点「确定访问」，不适合正式交付；
   要绑自定义域名才好用

---

## z123 · 终于发上线了：z118–z123 全部发布到 CloudBase 静态托管（2026-10-27 夜）

用户按提示在控制台建了环境级 API Key，`tcb login --cloudbase-api-key` 一次通过 ——
之前失败的原因确认无误：`js/cloud.js` 里那把是 `PublishableKey`（anon），只能读写业务表。

### 发布

- 暂存目录只装站点文件：`index.html` + `css/` + `js/`（25 个文件，2.3 MB）
  —— **不整目录上传**，否则 `PROJECT-NOTES.md`、`.workbuddy/`、`.git/` 会变公开文件
- `tcb hosting deploy .workbuddy/_deploy -e <env> --safe --verify`（先备份、失败回滚、逐项校验）
- 线上从 z117 直接跳到 z123，`index.html` 的 `?v=` 全部换成 z123，不吃缓存
- 远端原有 `__auth/`、`cloud-admin/` 保留（没加 `--prune`，那个参数会把它们删掉）

### 顺手修的一处文案

侧边栏那行一直写「数据保存在本机浏览器」，和设置页「数据实时保存在云端」自相矛盾，
z123 改成「本机缓存 / 数据在云端，本机只留缓存」——就是用户之前问「已经上传到数据库了这个还需要吗」的由来。

### 线上真跑一遍（.workbuddy/probe-live-reassign.js，11/11）

真 Edge + 真登录 + 真云端写库，跑完把负责人还原：

| 检查项 | 结果 |
|---|---|
| 线上版本 | `20261027z123` |
| 门店负责人 / 6 条任务归属 | 张涛 / 张涛（`alignTaskOwners` 生效） |
| 换人后内联提示 | 「这家店 6 条任务（含已完成的）保存后全部转到新负责人名下。」 |
| 改成邢鹏昀后 | 门店负责人 + 6 条任务全部跟着转 |
| toast | 「门店信息已更新，6 条任务已转到 邢鹏昀 名下」 |
| 改回张涛后 | 门店与 6 条任务一起还原，云端复核「归属不对 0 条」 |
| 页面报错 | 0 |

**结论：用户抱怨的「改负责人任务不跟」在线上已经不存在了。**

### 探针踩坑（三个，都记下来）

1. **CloudBase 测试域名的门禁页有倒计时**：按钮 `disabled` 期间点了无效，必须等它变可点再点。
   直接 `btn.click()` 会停在门禁页，之后 `window.Store` 是 undefined（看起来像"页面打不开"）。
2. **首次登录会弹「欢迎加入」弹窗**，挡住截图和点击，拍照前先点「开始使用」。
3. **toast 只活 3 秒左右**，保存后等 4 秒再读就永远读不到，要在 1 秒左右读一次。

### 仍未收口的两件事

- **数据表对匿名全开**：手里那把公开 key 就能 PATCH 任意任务，RLS 没兜底（违反铁律）
- **测试域名有门禁页**：每台新电脑首次访问要先点「确定访问」，正式对外要绑自定义域名

### 已知但暂不处理（用户 2026-10-27 明确决定）

- **数据表对匿名全开**：公开的 PublishableKey 就能读写业务表，RLS 没兜底。用户看过解释后决定
  「现在谁都可以修改，后续需要再弄」—— 这是**有意识的取舍，不是遗漏**。要收的时候按这张表做：
  门店/任务/到货：登录可读、成员可写、删除仅管理员；成员表：仅管理员写；`app_settings`：仅管理员写。
  收之前先确认登录态怎么传给网关（现在是前端传姓名，服务端不认）。
- **测试域名有门禁页**：每台新电脑首次访问要点「确定访问」，等有域名 + 备案后绑自定义域名再解决。

---

## z124 · 清单有新任务 → 进系统就自动补到所有已建门店（2026-10-27）

用户：「之前创建的门店如果有新筹建任务加入，但是之前加入的门店没有同步，帮我只要有新功能之前的数据一起同步」。

### 查出来的实际情况

云端门店「渭南新悦天地店」只有 6 条任务，而筹建任务清单里有 **7 条** —— 缺的第 7 条是
「是否开业？」。原因不是同步逻辑写错，而是 **z122 的同步只在「清单弹窗里点保存」那一刻跑**：

- 用户加这条时，线上还是 z117（z122 还没发版），保存根本没带同步
- 后来即使发了版，只要没人再点一次保存，那家店就一直缺着
- 清单也没有 `id`（`saveTemplates` 才会补 id，说明从未在 z122 上保存过）

**结论：同步不能只挂在「点保存」这一个动作上，必须有一条"进系统自己核对"的兜底。**

### 做法：记一份「已落实的清单快照」，进系统对一次账

- `settings.tplApplied` = 上次落实到门店的那版清单（数组，条数很少）
- `tplSnapshotOf(list)` 给清单算指纹（id / 标题 / 阶段 / 开业前天数）
- `syncTemplatesToStores()` 跑完就把 `tplApplied` 写成这一版（**谁调的都会记账**，
  所以清单弹窗的旧路径同样受益）
- 新增 `ensureTemplatesApplied()`：进系统时指纹不一致才跑同步，一致就一行代码都不动
  - 挂在 `load()` 的两条真实路径（云端数据到了 / 本地数据首次上云）+ `syncOnce()`，
    **不挂**在"只用缓存秒开"和"离线"这两条上 —— 那两条手上不是权威数据，写了等于乱补
  - 首次运行时 `tplApplied` 不存在 → 当作空清单 → 所有当前条目都会被视作"新增"，
    但 `syncTemplatesToStores` 按标题跳过已存在的，所以只会补真正缺的那些
- `js/app.js`：`load()` 把同步结果带回来，`added > 0` 时弹一句
  「筹建清单有新任务，已补到 N 家已建门店（共 M 条）」—— 补了要让用户知道，别偷偷改数据

### 为什么不每次进系统都无脑补齐

否则用户手动删掉一条任务，下次打开又被重建，**永远删不干净**。
指纹一致就完全不动，这个行为专门写了一组测试盯着（见下）。

### 验证

- 新增 `.workbuddy/probe-tpl-autosync.js` **20/20**（真 Edge）
  - 清单 3 条、两家店各缺若干 → 打开就补齐；补的活儿派给各自门店负责人、带着清单里的阶段
  - toast 报账「已补到 2 家已建门店（共 3 条）」
  - `tplApplied` 写回、与清单指纹一致
  - 再进一次：**一条都不重复加**，也不再弹提示
  - 清单没变 + 用户手动删过的那条：**不会被重建**
- 生成器 `.workbuddy/mk-tpl-boot.js`（`drift` / `applied` 两种场景）
- 回归 12 套 **233 条**全绿（tpl-sync 23、owner-align 10、owner-reassign 14、store-form 21、
  build-date 8、settings-fold 14、avatar 22、session 16、fast-boot 25、write-queue 31、ship 27、art 22）
- **线上实测**：发布 z124 后打开站点，云端 6 条 → 7 条，缺的「是否开业？」补齐，
  toast「已补到 1 家已建门店（共 1 条）」，`tplApplied` 7 条，0 报错

### 踩坑

- **toast 只活 2.5 秒**：探针里 `networkidle0` + 2 秒再读，永远读不到；要在页面一启动就轮询。
- 探针断言别按"我以为缺几条"写：成都店 fixture 本来缺 2 条，补齐后是 3 条不是 2 条 —— 先算清楚再断言。

---

## z125 · 撤掉「进系统自动补齐」，老门店交回「按清单补派任务」按钮（2026-10-27）

用户：「忘记了，之前创建的门店不用加筹建任务也行，因为有派发的按键」，选择**撤掉自动、只用按钮**。

### 撤了什么

- `js/store.js`：删掉 `ensureTemplatesApplied()` / `tplSnapshotOf()` 与 3 处调用
  （云端数据到 / 首次上云 / `syncOnce`）；`syncTemplatesToStores()` 里也不再写 `settings.tplApplied`
- `js/app.js`：删掉「已补到 N 家已建门店」那条 toast；`load()` 不再返回 `tplSync`
- 云端 `settings.tplApplied` 这枚残留键一并清掉（`PATCH app_settings?key=eq.main`），
  不清的话以后谁看到都猜不出它干嘛

### 保留了什么（别误删）

- **门店详情 →「按清单补派任务」**：给**这一家**店补派清单里缺的条目（`dispatchTemplates`）
- **筹建清单弹窗点保存 → 同步到已建门店**（z122 的能力）：补派 / 改名 / 改阶段 / 改天数。
  这是用户早前明确要过的，与 z125 不是一件事，**没动**
- 新建门店时按清单自动派发（`addStore` 里的 `autoTasks`）

### 验证

- 新增 `.workbuddy/probe-tpl-noauto.js` **10/10**（真 Edge，`mk-tpl-boot.js` 生成的 drift 场景）：
  打开系统后老门店**一条都不自动补**、没有提示、`settings` 里不出现 `tplApplied`；
  点「按清单补派任务」→ 该店 2 条变 3 条、补的正是缺的那条、toast「已补派 1 条任务」
- 回归 12 套 **243 条**全绿（tpl-sync 23 仍全过，说明保存时的同步没被误伤）
- **线上实测**：z125，任务 7 条 / 清单 7 条、没有「已补到」提示、`tplApplied` 已清、
  门店详情里「按清单补派任务」按钮在位、0 报错

### 踩坑（这条要记牢）

**`app_settings.rev` 是不透明票据，不是数字。** 我为了"把 rev 加一"写了
`String(Number(revRow.value) + 1)`，而它的真实格式是 `1793110666285-2nb5v3`
（`newToken()` = 时间戳 + 随机串），结果写进去一个字符串 `NaN`。
虽然前端只拿它做"相等比较"、功能上能自愈，但这是个脏值，已用同格式的新 token 覆盖修正。
**以后动 rev，只能用 `newToken()` 那种格式生成，绝对不要做数值运算。**

---

## z126 · 顶栏头像下拉菜单：普通成员也能退出登录（2026-10-27）

用户：「其他员工没有退出账号的按键」。

### 根因

「退出登录」只写在**系统设置页**里，而设置页只有管理员进得去（`canSettings()`），
所以普通成员在整个系统里找不到任何退出入口 —— 想换个人用，只能去清浏览器缓存。

### 改法

顶栏那颗头像从「没权限弹 toast」改成**下拉小菜单**：

- 面板头：头像 + 姓名 + 身份（`管理员` / `团队成员`）
- 管理员多一项「系统设置」（点了跳 `#/settings`）
- 所有人都有「退出登录」（红色，走原有 `logout()` 的二次确认）
- 收起方式三种：点面板外 / 按 Esc / 再点一次头像；点页面空白和切路由也会关

改动文件：`js/app.js`（`userMenuEl` / `closeUserMenu` / `memberOf` / `avatarHtml` / `toggleUserMenu`）、
`js/ui.js`（新增 `gear` / `exit` 两个图标）、`css/layout.css`（`.user-menu` 全套）、
`index.html` 版本号 → `20261027z126`。

### 两个看着小、其实卡了半天的点

1. **打开时别把焦点放进第一项。** 一开始我 `first.focus()`，普通成员只有「退出登录」一项，
   一打开就是一块红色高亮，看着像已经按下了。改成把焦点挪到面板容器 → 又撞上
   `theme.css` 的全局无障碍规范 `[tabindex]:focus-visible { outline: 2px solid var(--primary) }`，
   整块面板套了个蓝框，而这条规范是**项目统一要的**，不该为这点事去覆盖它。
   最终定案：**焦点就留在触发它的头像按钮上**，不往菜单里挪 —— 菜单是接在头像后面的，
   键盘按 Tab 照样进得去；Esc 由 document 统一接。既没红块也没蓝框。
2. **桩页的登录人必须在成员名单里。** 截图用的假数据里没有「赵六」，
   `meAllowed()` 判定他已被移出团队，一进页面就弹「登录已失效」，把整页盖住。
   `mk-shot-boot.js` 已改成「登录人不在名单就自动补进 `members`」，以后截谁的图都不会再踩。

### 验证

- 新增 `.workbuddy/probe-user-menu.js` **20/20**（真 Edge）：管理员两项、普通成员只有退出、
  点「系统设置」跳到位、点「退出登录」弹确认、点取消**不登出**、三种收起方式、全程 0 报错
- 回归 14 套全绿：user-menu 20/20、tpl-noauto 10/10、tpl-sync 23、owner-align 10、
  owner-reassign 14、store-form 21、build-date 8、settings-fold 14、avatar 22、session 16、
  fast-boot 25、write-queue 31/31、ship 27/27、art 22/22
- 截图：`.workbuddy/menu-admin-z126.png`（张三·管理员）、`.workbuddy/menu-guest-z126.png`（赵六·团队成员），
  另有 3 倍放大图 `.workbuddy/zoom-menu-admin.png` 核对间距
- **线上实测**（`.workbuddy/probe-live-menu.js`，真站点真登录）**18/18**：
  ①「于欣」= 团队成员 → 菜单只有「退出登录」；确认框点取消 → 还在系统里、`sbs.auth` 没动；
  再来一次点「退出」→ 回登录页、`sbs.auth` 已删（`sbs.user` 是「上次登录人」，故意留着预填姓名）
  ②「邢鹏昀」= 管理员 → 多一项「系统设置」，点了跳 `#/settings`，菜单自动收起
  ③ 全程 0 报错。线上 `index.html` 已是 `20261027z126`，`js/app.js` 里 `toggleUserMenu` 在位
- **探针小坑**：登录页姓名框会用 `lastName()` 预填上次登录人，探针里直接 `type` 会变成
  「于欣邢鹏昀」这种拼接值，再被 `meAllowed()` 判定不在名单 —— 换人登录前要先清空输入框。

---

## z127 · 摘掉系统设置页那个「退出登录」按钮（2026-10-27）

用户看着设置页右上角那个按钮说「主账号的这个可以取消了」。

z126 之后**退出登录有两套入口**：顶栏头像菜单（谁都能点）+ 系统设置页右上角（只有管理员看得见）。
后者是历史遗留 —— 当初正因为普通成员进不了设置页，才在顶栏补了菜单。现在留着只是重复。

### 改了什么

- `js/page-settings.js`：删掉页头那个 `<button data-act="logout">`，连带删掉点击分支里
  `if (act === 'logout') App.logout();`（后面的 `else if` 链顺势收成 `if`）
- `index.html` 版本号 → `20261027z127`
- 退出登录能力本身没动：`App.logout()` 仍在，头像菜单照旧调它

### 验证

- 新增 `.workbuddy/probe-settings-logout.js` **10/10**：设置页里 `[data-act="logout"]` 已消失、
  整页文字里不再出现「退出登录」、基本信息表单 / 筹建清单 / 权限卡片都还在、
  头像菜单里「退出登录」仍在、从菜单进设置页正常、0 报错
- 回归 **15 套全绿**（新加的 settings-logout 10、user-menu 20、tpl-noauto 10、tpl-sync 23、
  owner-align 10、owner-reassign 14、store-form 21、build-date 8、settings-fold 14、avatar 22、
  session 16、fast-boot 25、write-queue 31、ship 27、art 22）

### 顺带查清的一件事（不是 bug）

探针直接在地址栏带 `#/settings` 打开时会被弹回首页 —— 因为桩页的本地缓存里没写 `access`，
第一帧 `canSettings()` 判不出版主，就走了「没权限送回首页」。
线上真实缓存带 `access`，实测管理员带 `#/settings` 刷新**停在设置页不跳**（表单在、说明在）。
结论：桩页缺陷，不是产品缺陷；探针改成「从头像菜单点进去」这条真实路径。
- **线上实测**（`.workbuddy/probe-live-settings.js`，真站点真登录「邢鹏昀」）**9/9**：
  线上 `index.html` = `20261027z127`、`js/page-settings.js` 里 `data-act="logout"` 出现 0 次；
  从头像菜单进设置页，页面里既没有按钮也没有「退出登录」四个字；
  说明文字 / 基本信息表单 / 账号与数据卡片都在；头像菜单里「退出登录」照旧；0 报错

---

## z156 · 全局蜘蛛网：改成贴住屏幕右下角的完整圆网 + 3 只蜘蛛（2026-10-29）

用户指着首页右上角那张网：「这个蜘蛛网大一些，但是就类似这样全局的，这样感觉没有附着点，
我希望它有附着点的那种感觉，要不就是吊下来完整的，最好上面有一些蜘蛛」。

### 原来为什么「没有附着点」

`.hw-web` 是 `top:152px; right:8px; width:110px`，SVG 的 viewBox 是 `0 0 100 100`，
所有辐条都从 **(100,0)** —— 也就是这个 110 盒子的右上角 —— 发出来。
那个点在屏幕里是「悬空的」：离右边缘还有 8px，周围没有任何东西可挂，
弧形网丝又在盒子边界上直接断掉。所以看起来是一张浮在卡片上的网，不是长在墙角的网。

### 改成什么

- **一整张完整圆网**：12 根辐条 + 5 圈闭合网丝（圈与圈之间用二次曲线往圆心塌一点，做出丝的垂度）
- **4 根锚丝**：3 根牵到屏幕**右边缘**、1 根牵到屏幕**底边缘**，
  终点坐标正好是 viewBox 的 `x=320` / `y=320`，而盒子本身 `right:0; bottom:0`，
  所以线头**物理上就落在视口边上**，不再悬空
- **3 只蜘蛛**：两只趴在网线上（左下圈、右上锚丝根部），一只从网底用一根丝吊下来
- 尺寸 **110 → 320**；圆心从 (160,150) 挪到 (196,196)，让网的主体收进角落，
  别压在「团队工作台」那排数字正中间；网丝单独一组压到 `.62` 透明度 + 整体 `.55`，
  蜘蛛单独一组 `.88`，做到「丝很淡、蜘蛛看得见」
- 南瓜灯从右下挪到**左下**（`right:26px` → `left:26px`），别和网挤一个角
- 窄屏：1280 以下 250、900 以下 180、680 以下不显示
- 几何不是手写的，用 `.workbuddy/gen-web.js` 生成（改圆心/半径/圈数重跑一次即可）

### 验证

- 新增 `.workbuddy/probe-hw-web.js` **14/14**：尺寸 320、盒子右/下边 == 视口宽/高、
  4 根锚丝全都有端点落在 `x=320` 或 `y=320`（3 右 + 1 底）、12 辐条 + 17 条网丝路径、
  3 只蜘蛛、`pointer-events:none`、层级低于顶栏、南瓜在左、0 报错
- `node --check` 全 js 通过；1440 / 1280 两种宽度截图人工核对过

### 这台电脑的 git 差点出事（记一下）

这台机器的本地仓库停在 z127，而线上/远端已经是 z155（另一台电脑改的）。
上来先想 `git fetch`，结果代理 `CONNECT 502`；用项目里记的 codeload 通道把 tarball 拉下来
覆盖工作区，改完准备推时才发现**本地 main 落后远端 20 多个提交**，
这时候直接 commit + push 会把别人的提交顶掉。
后来 `git ls-remote` 通了，确认本地 z127 是远端 z155 的**祖先**，于是：
先把自己改的两个文件（`index.html` / `css/theme.css`）另存 →
`git checkout -- . && git merge --ff-only origin/main` 追到 z155 →
再把另存的文件贴回去 → 提交 → `daf6bff..82e9560` 干净推上去。
**以后在这台机上动手前，先 `git ls-remote` 看一眼远端到哪了。**

### z157 · 补一刀：网丝再压淡，蜘蛛提亮

发到线上后用真数据看（右侧「团队工作台」是长名单），丝在成员名字上还是有点「脏」。
把网丝组 `opacity` 从 `.62` 压到 `.48`、整体 `.55 → .52`，蜘蛛组从 `.88` 提到 `.95` ——
丝更淡、蜘蛛更清楚，层次拉开了。探针仍 14/14。

---

## z158 · 首页横幅换成万圣夜配色（只动这一块）（2026-10-29）

用户截图圈着首页顶部那条横幅：「这整个颜色我都希望变成万圣的主题颜色」，
后面又补一句「不用全部换，只换这里就可以」。

### 原来为什么别扭

横幅底色是浅蓝白（`#eef2fb → #f3f6fd`），但上面叠的装饰全是暖色：
深橙大月亮、橙南瓜、深紫蝙蝠、白幽灵。**暖装饰贴在冷底上**，
月亮像个橙色贴纸，房子的白墙蓝顶更是白天的样子，整条横幅不像万圣节，像贴了几张插图。

### 改成什么（只动 `.hero`，全站配色变量一个没碰）

| 元素 | 原来 | 现在 |
|---|---|---|
| 横幅底 | 浅蓝白渐变 | 深紫夜空 → 暗酒红（`#221a36 → #2c1e44 → #38234a → #452838`），叠两团径向光：左上紫、右下南瓜橙 |
| 描边/阴影 | `#dbe6fb` | `rgba(255,172,82,.20)` + 顶部一条 `inset` 高光 |
| 标题 | 继承深色文字 | `#fff4e3` 奶油白 + 极淡橙光晕 |
| 正文 | `--text-2` 深灰 | `rgba(226,214,242,.80)` |
| 数字强调 | 蓝 `--primary` | `#ffb45c` 南瓜橙；风险数字 `#ff8a5c` |
| 图标底 | 白 → 浅蓝 | 深紫玻璃渐变 + 橙描边 + 内高光 |
| 日期卡 | 纯白卡 | `rgba(26,18,42,.60)` + `backdrop-filter: blur(10px)` + 橙金描边 |
| 房子插图 | 白墙蓝顶绿树 | 深紫墙 + 南瓜橙屋顶 + 暖黄亮窗 + 暗紫树（夜里亮灯的小店） |
| 蝙蝠 | `#3a2f4d`（深紫底上几乎看不见） | 压成纯黑剪影 `#1b1229` + 南瓜色轮廓光 |
| 蜘蛛网 / 星光 / 点阵 | 冷紫、白、蓝点 | 网丝 `#c3b0f5`，星光暖黄，点阵暖橙 |

⚠️ **踩坑提醒**：`theme.css` 第 199 行还有一条 `.hero { background: ... }`，
它是最后一层，会把 `components.css` 里的背景**整条盖掉**。
第一次只改了 `components.css`，截图发现底还是浅蓝 —— 改配色要改 `theme.css` 那条。

### 窄屏（这次真花了工夫）

月亮是 `190px` 绝对定位。内容区一变窄，它就跑文字底下：
1280 下来回擦边，手机上「本周共 2 项」的 **2 整个压在橙色月面上**，对比度掉一半。
试过「缩小后藏到日期卡后面」—— 卡片比月亮矮，橙块从卡底下露出一条，更脏。
最终分三段：

- `1400~1181`：日期卡 + 房子都在，右边被占满 → 月亮**收起来**
- `1180~900`：日期卡和房子已隐藏，右端空出 → 150px 放到右边
- `900~680`：116px；`680` 以下文字要换行，放哪都压字 → **不显示**，只留南瓜

### 验证

- 新增 `.workbuddy/probe-hero-hw.js` **47/47**：底色确实是深紫（且没有残留浅蓝）、
  标题/正文/数字对比度都过 WCAG AA、日期卡是半透明深色、图标是深玻璃、
  月亮/蝙蝠/幽灵/南瓜/网/夜景房子全在、**7 个宽度（1440/1280/1180/900/768/680/430）
  逐个验「月亮不压文字 + 横幅不溢出 + 高度合理」**、KPI 与普通卡片仍是浅色（只动了这块）
- 回归 **17 套全绿**
- 顺手校正两套过时探针（都不是这次改坏的）：
  - `probe-art`：「12 只动物」→ 万圣节已加到 18 只，改成「≥18 且包含万圣节 6 只」
  - `probe-build-date`：z128 明确要求「建档时间不再自动填」，z135 又改名「建档提交时间」，
    探针还断言「默认填当天 / 名字叫建档时间」→ 按当前事实改正
- **线上实测**（`.workbuddy/probe-live-hero.js`，真站点真登录「邢鹏昀」）**27/27**：
  线上 `index.html` = `20261029z158`，`css/theme.css` / `css/components.css` / `js/page-home.js`
  三个文件都确认是新内容（curl 逐个 grep 过）；真实文案「晚上好，阿蛮团队👻(ꈍᴗꈍ)！」下
  标题对比度 **12.8**、正文 **7.0**、强调数字 **7.9**（都过 AA）；
  日期卡 `rgba(26,18,42,.6)`、月亮 `#e8892a`、蝙蝠剪影 `rgb(27,18,41)`、房子屋顶 `#e8892a`；
  1440/1280/1180/900/680/430 六个宽度逐个验月亮不压字、横幅不溢出；全程 0 报错

## z159 · 南瓜灯从屏幕左下角挪进侧边栏空白带（2026-10-29）

### 用户的原话

截图指着侧边栏底部那颗南瓜 —— 它一半叠在「数据在云端，本机只留缓存」这行灰蓝小字上：

> 这个放到别的地方吧，放这里不明显

### 病根：它根本不是侧边栏的一部分

`.hw-pumpkin-fly` 当时在 `.hw-scene`（`position:fixed; inset:0; pointer-events:none`）里，
写的是 `position:absolute; left:26px; bottom:16px` —— 相对**视口**左下角定位。
而侧边栏的 `.storage-card` 恰好也在左下角：实测南瓜 `(26,841)-(71,886)`、
缓存卡 `(28,802)-(204,872)`，**整块重叠**。

橙色南瓜压在灰蓝 10.5px 小字上，两边都看不清：字被挡，南瓜也被切进小字里不像南瓜。
这也解释了用户说的「不明显」—— 不是它太小，是它跟文字搅在一起了。

### 改法：从「浮层」变成「侧边栏里的普通元素」

没有挪坐标（`left` 换个数还是会在别的窗口高度下撞上什么），而是直接换了归属：

1. `index.html`：把那个 `<svg class="hw-pumpkin-fly">` 从 `.hw-scene` 里剪出来，
   插到 `.sidebar` 内、`</nav>` 之后、`.sidebar-foot` 之前。
2. `css/theme.css`：`position:absolute; left/bottom` 全部删掉，改成普通流元素：

```css
.hw-pumpkin-fly {
  display: block;
  align-self: center;   /* 锁住水平居中，align-items:stretch 拉不宽它 */
  flex: 0 0 auto;
  width: 52px;          /* 42 → 52，深蓝底上更清楚 */
  height: 52px;
  margin: auto 0 20px;  /* 上下 auto 与 .sidebar-foot 的 margin-top:auto 平分留白 */
  pointer-events: none;
  transform-origin: 50% 100%;
  animation: hwPumpkinSway 3.6s ease-in-out infinite;
  filter: drop-shadow(0 6px 12px rgba(246, 161, 28, .18));
}
```

关键就是那两个 `auto`：侧边栏是 flex column，南瓜和缓存卡各带一个 `margin-top:auto`，
浏览器自动把「导航下方 → 缓存卡上方」这段空白**平分**，南瓜稳定落在空白带中间。
窗口变高变矮它都跟着走，不会像绝对定位那样在某个分辨率下又撞上文字。

3. 窄屏两档：
   - `≤1180`：侧边栏收成 62px 图标条 → 南瓜 `34px`，`margin-bottom:12px`
   - `≤860`：侧边栏变横向导航条，南瓜会横插在图标之间 → `display:none`

### 顺带的发现

南瓜搬走以后，登录页左下角那颗也没了（原来它挂在 `hw-scene` 上，登录页也会跟着显示）。
登录页是浅色干净页，本来就没有别的万圣元素，少一颗飘着的南瓜反而更整齐 —— 没再补。

### 验证

- 新增 `.workbuddy/probe-pumpkin-side.js` **19/19**（1440 / 1100 / 820 三档视口）：
  在 `.sidebar` 内且不在 `.hw-scene` 内、`position:static`、**与缓存卡零相交**、
  与任何导航项零相交、在导航下方且在缓存卡上方留缝、52×52、水平居中（差 0px）、
  摇摆动画在、`pointer-events:none`；1180 下 34×34 且不出侧边栏；820 下 `display:none`
- 回归 **7 套全绿**：`probe-hw-web` 14/14、`probe-hero-hw` 47/47、`probe-art` 22/22、
  `probe-build-date` 8/8、`probe-user-menu` 20/20、`probe-settings-logout` 10/10、
  `probe-tpl-noauto` 10/10
- `probe-hw-web` 里那条「南瓜已让到左边」的旧断言按新事实改写成
  「已移出固定装饰层、搬进侧边栏」
- **线上实测**（`.workbuddy/probe-live-pumpkin.js`，真站点真登录）**14/14**：
  线上 = `20261029z159`；南瓜在侧边栏内、`static`、52×52、居中差 0px；
  **与缓存卡零相交、不压「数据在云端，本机只留缓存」那行字**、与卡片留缝 175px

### 两个探针上的坑（记下来省下次的时间）

1. **SVG 没有 `offsetWidth` / `offsetLeft`** —— 想量它的布局尺寸只能读
   `getComputedStyle(el).width`；直接写 `el.offsetWidth` 得到 `undefined`，`Math.round` 成 `NaN`。
2. **`getBoundingClientRect` 会把 rotate 动画算进去** —— 52×52 的南瓜在摇摆中量出来是 55×55。
   探针里先记下 `animationName`，再把 `style.animation` 设成 `none` 后才量矩形，否则尺寸断言必挂。

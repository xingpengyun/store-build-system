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
  4. 阶段默认值（`CONST.LEAD_DAYS`，设置页「逾期倒推口径」可改 → `settings.leadDays`）
- **门店没填开业日期 → 不编日期、不判逾期**：`suggestDateOf()` 返回空，`dueDate` 也留空，
  任务表显示「未设开业日 / 开业前 30 天 · 填了开业日就自动倒推」；补上开业日立刻按日期倒推
- 门店开业日一改（含清空）→ 这家店所有任务日期重算（`resyncTaskDates`）；改阶段默认天数 → 全量重算
- 派发任务时把清单里的 `before` 写进 `settings.taskBefore`（云端 tasks 表没这一列，不改表结构）；
  之后改清单只影响新派发的任务，已有任务的天数不会被动
- 改阶段时：任务自己的天数是「自己定死的」就不动，原本跟着阶段默认走的才按新阶段重算
- 阶段名被改过（「图纸设计」「主体施工」）时按 `CONST.LEAD_KEYWORDS` 关键词兜底，避免掉到默认 30 天；
  关键词表有序，长词在前（「广告物料」先于「物料」）
- 任务状态只有两类：未完成 / 已完成（「进行中」废弃，历史值读成未完成）
- 筹建清单的筛选只剩 全部 / 逾期 / 风险 / 已完成；任务表列名改为「建议完成」，显示「建议日期 + 开业前 N 天 · 距开业 X 天」
- 入口：`js/store.js` → `taskBeforeOf / suggestDateOf / daysLeftOf / suggestFor / classify / setTaskBefore / saveLeadDays`

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

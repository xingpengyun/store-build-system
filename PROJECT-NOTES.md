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

## 2026-10-23 进度口径：六个阶段共享一条进度条

- 进度 = 每个筹建阶段「清单任务完成率」之和 ÷ 阶段数（阶段数按当前 `CONST.STAGES` 现算，不写死 6）
  - 阶段内按任务比例填充：2 条做完 1 条 → 这个阶段算半格
  - **六个阶段全做完才是 100%** = 万无一失、真能开业
  - 只把阶段指针往前推、清单没做，进度不会跳上去
  - 没配清单的阶段：门店已走过（或已开业）就算完成，没走到就是 0
  - 「已开业」是终点，不进分母；到了但前面漏做，就如实显示不满 100%
- 入口：`js/store.js` → `stageTaskStat()` / `storeProgress()` / `progressTip()`
- 返回值多了 `tasksDone` / `tasksTotal`，悬停提示和门店详情都会带上任务数

## 数据模型要点
- 门店 `stage` 只能取 `CONST.STAGES` 的 key；`risk` 只能取 `CONST.RISKS` 的 key
- 任务 `status` 只有 `pending` / `doing` / `done` 三种
- **「已逾期」是派生状态**（`dueDate < 今天`），不落库，由 `Store.classify()` 算
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

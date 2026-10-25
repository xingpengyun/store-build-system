# 门店筹建管理系统

## 当前版本：云端多人协作版

数据存在云端数据库，团队成员共享同一份，换电脑、清缓存都不会丢。

- **在线地址**：https://store-build-system-59240.app.workbuddy.host/?sharecode=SXM4622FRX
  （这是本目录当前发布的地址；旧的 `store-build-system.app.workbuddy.link` 是另一台电脑上的工作副本发布的，不会跟着本目录更新。两边的云端数据库是**各自独立**的两套，只在下面这个新地址录入数据，否则数据会分叉）
- **登录**：账号 `admin`，密码 `123`（临时方案，见下方「登录方式」）

### 架构

| 层 | 说明 |
|---|---|
| 前端 | 纯静态 HTML/CSS/JS，无构建、无 npm 依赖；云 SDK 已本地化到 `js/vendor/cloud-sdk.js` |
| 后端 | WorkBuddy 云服务，PostgreSQL + 行级权限（RLS） |
| 数据表 | `stores` / `tasks` / `members` / `arrivals` / `app_settings` |
| 数据流 | 启动拉全量到内存 → 改动先用乐观更新刷界面，再异步推云端 → 每 45 秒轮询他人改动 |

### 关键文件

- `js/cloud.js` — 云端接入（客户端初始化、登录、增删改、字段映射）。**顶部 `AUTH_MODE` 控制登录方式**
- `js/login.js` — 登录页（账号密码 / 手机验证码两套）
- `js/store.js` — 业务数据层（云端优先，localStorage 仅作离线缓存）
- `js/constants.js` — 阶段、风险、任务模板等业务常量

### 登录方式

`js/cloud.js` 第 12 行附近：

```js
var AUTH_MODE = 'simple';   // 'simple' = 账号密码 admin/123
                            // 'phone'  = 手机号 + 短信验证码
```

改成 `'phone'` 就切回手机验证码登录，两套代码都在。

> ⚠️ `simple` 模式下数据库对匿名访问开放，拿到链接的人无需密码即可读写数据，仅适合内部临时使用。

---

## 早期单机版说明（已不适用，保留备查）

以下内容描述的是数据存 localStorage 的旧版本，迁到云端后已不再是主流程。

一个纯前端的管理系统，零依赖、零构建，双击就能用。数据保存在浏览器本地（localStorage）。

> 想托管到 GitHub、在公司与家里两台电脑之间同步？看 **[DEPLOY.md](DEPLOY.md)**。

## 怎么打开（旧版）

**方式一（推荐）**：双击 `start-server.bat`
会启动一个小服务器并自动打开 http://127.0.0.1:8765/ 。这种方式数据保存最稳定。

**方式二**：直接双击 `index.html`
部分浏览器在 `file://` 协议下会限制 localStorage，导致数据存不住。存不住就改用方式一。

> 数据存在「这台电脑 + 这个浏览器」里。换电脑、换浏览器、清缓存都会丢，重要数据请在「系统设置 → 导出备份」里导出 JSON。

## 文件结构

```
index.html              页面骨架（顶栏 + 侧边栏 + 内容容器）
css/
  base.css              设计变量（颜色 / 圆角 / 阴影）、重置、基础排版
  layout.css            顶栏、侧边栏、内容区布局、响应式断点
  components.css        卡片、表格、徽章、按钮、表单、图表、弹窗等组件
js/
  utils.js              日期计算、转义、格式化小工具
  constants.js          【常改这里】阶段、风险等级、任务模板、物料清单
  seed.js               首次打开生成的演示数据（23 家门店 / 161 条任务）
  store.js              【核心】数据读写、增删改查、统计、预警计算
  charts.js             环形图 / 柱状图 / 进度条（纯 SVG + CSS，无第三方库）
  ui.js                 通用组件：图标、徽章、弹窗、Toast、分页
  page-home.js          首页
  page-stores.js        门店管理
  page-tasks.js         任务管理
  page-team.js          团队工作台
  page-alerts.js        预警中心
  page-reports.js       数据报表
  page-settings.js      系统设置
  app.js                路由、全局搜索、初始化
```

## 常见改动位置

| 想改什么 | 改哪个文件 |
|---|---|
| 阶段名称 / 顺序 / 颜色 | `js/constants.js` → `STAGES` |
| 风险等级 | `js/constants.js` → `RISKS` |
| 新开门店自动派哪些任务 | `js/constants.js` → `TASK_TEMPLATES` |
| 页面上显示的数字怎么算 | `js/store.js` → `stats()` |
| 预警规则（几条、什么条件） | `js/store.js` → `alerts()` |
| 演示数据 | `js/seed.js` |
| 配色、间距、圆角 | `css/base.css` 顶部的变量 |

## 数据结构

```js
{
  meta:     { version, createdAt, updatedAt },
  settings: { brand, slogan, teamName, weatherTemp, weatherText, warnDays },
  members:  [{ id, name, role, color }],
  stores:   [{ id, name, province, stage, risk, progress, ownerId, openDate, address, remark, createdAt }],
  tasks:    [{ id, storeId, title, stage, assigneeId, dueDate, status, priority, remark, createdAt }],
  arrivals: [{ id, storeId, item, qty, etaDate, status }],
  alertsRead: ['预警id', ...]
}
```

- 门店 `stage` 必须是 `CONST.STAGES` 里的 key
- 门店 `risk` 必须是 `CONST.RISKS` 里的 key（normal / attention / high / overdue）
- 任务 `status` 只有三种：`pending` / `doing` / `done`
- **「已逾期」不是存下来的状态**，而是根据 `dueDate < 今天` 实时算出来的
- 任务状态分布里的「风险」= 所属门店为高危/逾期，且任务还没完成

## 想接后端怎么办

只需要改 `js/store.js` 里的 `load()` 和 `save()` 两个函数，把 localStorage 换成接口请求即可，其他页面代码不用动。

## 重置数据

「系统设置 → 恢复演示数据」会用 `seed.js` 重新生成一套。重置前建议先导出备份。

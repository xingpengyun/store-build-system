# 部署到 GitHub 操作指南

> 目标：代码托管到 GitHub，公司、家里两台电脑都能同步修改；可选再开一个在线网址。

---

## 第 0 步：先想清楚仓库要不要公开

| | 私有仓库 | 公开仓库 |
|---|---|---|
| 别人能看到代码吗 | 不能 | 能 |
| 能开 GitHub Pages（在线网址）吗 | **不能**（免费账号限制，需付费 Pro） | 能 |
| 适合什么场景 | 只是两边同步代码 | 还想给别人看演示 |

本项目目前只有张三、李四这类虚构演示数据，公开没有实质风险。
**如果只想同步代码，选私有最稳。**

---

## 第 1 步：在 GitHub 上创建一个空仓库

1. 打开 https://github.com ，登录（没账号先注册，免费）
2. 右上角 `+` → **New repository**
3. 填写：
   - **Repository name**：`shop-build-system`（名字随意，建议全小写用短横线）
   - **Description**：门店筹建管理系统（可留空）
   - **Public / Private**：按上表选
   - ⚠️ **下面的 Add a README file / Add .gitignore / Choose a license 三个勾全部不要勾**
     （仓库必须是空的，否则推送会冲突）
4. 点 **Create repository**

创建完页面会显示仓库地址，形如：

```
https://github.com/你的用户名/shop-build-system.git
```

**复制这行地址**，下一步要用。

---

## 第 2 步：把本地代码推上去

1. 打开项目文件夹 `C:\Users\Hp\WorkBuddy\2026-10-21-14-47-18`
2. 双击 **`push-to-github.bat`**
3. 粘贴刚才复制的仓库地址，回车

首次推送会弹出一个 GitHub 登录窗口（Git Credential Manager）：

- 点 **Sign in with your browser** → 浏览器里点 **Authorize**
- 登录一次之后，以后推送就不用再登了

看到 `[v] Done. Your code is on GitHub now.` 就成功了。刷新 GitHub 页面能看到所有文件。

### 如果推送报错

| 报错 | 原因 | 解决 |
|---|---|---|
| `'git' 不是内部或外部命令` | 电脑没装 Git，或装了但没加进系统 PATH | 装 Git for Windows：https://git-scm.com/download/win 。项目里的 bat 已经内置了自动查找，直接双击即可 |
| `remote: Repository not found` | 地址错，或没登录 / 没权限 | 检查地址拼写；重新登录 |
| `failed to push some refs` | 建仓库时勾了 README | 在 GitHub 上删掉仓库重建（别勾任何初始化选项） |
| 弹窗一闪而过没登录 | 凭据管理器异常 | 打开「凭据管理器 → Windows 凭据」，删掉 git:https://github.com，再跑一次 |
| `Support for password authentication was removed` | 用了账号密码 | 改用弹窗授权，或生成 Personal Access Token 当密码 |

---

## 第 3 步（可选）：开在线访问地址

前提：仓库必须是 **Public**。

1. 进入仓库页面 → 顶部 **Settings**
2. 左侧菜单拉到最下面 → **Pages**
3. **Source** 选 `Deploy from a branch`
4. **Branch** 选 `main`，右边目录选 `/ (root)`，点 **Save**
5. 等 1～2 分钟刷新页面，顶部会出现网址：

```
https://你的用户名.github.io/shop-build-system/
```

手机、别的电脑打开这个链接就能用（数据各自存在各自浏览器里）。

> 私有仓库想免费拿到在线地址，可以用 Cloudflare Pages 或 Vercel 连接私有仓库，同样免费。

---

## 第 4 步：回家怎么接着改

在家的电脑上打开命令行（Win 键 → 输入 `cmd`）：

```bash
cd C:\Users\你的用户名\WorkBuddy
git clone https://github.com/xingpengyun/store-build-system.git
cd store-build-system
```

然后双击 `start-server.bat` 就能打开系统（会起 http://127.0.0.1:8765/ 并自动开浏览器）。

打开后按 **Ctrl + F5** 强刷一次，确保加载的是最新脚本（`index.html` 里脚本都带 `?v=` 版本号，正常情况下不会吃缓存）。

> **数据不用搬。** 现在数据在云端，用同一个账号登录就能看到公司那台电脑录入的门店和任务。
> 首次进系统如果停在登录页，用 `admin` / `123` 登录即可。

> **首次在家里提交前，先设置一下身份**（只需一次，把名字邮箱换成你自己的）：
> ```bash
> git config --global user.name "你的名字"
> git config --global user.email "你的GitHub邮箱"
> ```

---

## 日常怎么同步（改完代码之后）

**方式一：双击 `sync.bat`**
会依次执行：提交全部改动 → 输入一句说明 → 推送到 GitHub。三秒搞定。

**方式二：命令行**

```bash
git add -A
git commit -m "改了什么，一句话"
git push
```

**在另一台电脑上拉取最新代码：**

```bash
git pull
```

---

## 常见疑问

**Q：能在两台电脑同时改吗？**
可以，但不要同时改同一行。顺序应该是：一台改完 push → 另一台先 pull 再改 → 改完 push。

**Q：数据（门店、任务）会跟着代码一起同步吗？**
不会，但**也不需要手动搬**。现在数据存在云端数据库（WorkBuddy Cloud），代码只是一个壳：
在家里 clone 下来、打开系统、用同一个账号登录，看到的就是公司那份门店和任务，不用导备份。

- 云端拉不下来时才会退回浏览器 localStorage 缓存（离线可看，**改不动**）
- 想留一份本地快照：系统设置 → 导出备份，得到一个 JSON
- **别把导出的 JSON 提交到公开仓库**，里面有真实业务数据

**Q：.gitignore 里忽略了什么？**
只忽略了 `.workbuddy/`（AI 工作笔记）和系统临时文件。所有代码、样式、README 都会提交。

---

## 附：发布到线上（腾讯云 CloudBase 静态托管）

线上地址（**唯一入口**）：

```
https://store-build-efficient-tiglon-d0ejcn14037eba3.webapps.tcloudbase.com
```

环境 ID：`efficient-tiglon-d0ejcn14037eba3`

### 为什么不能用别的域名

CloudBase 网关的跨域白名单是**精确匹配**（实测：`webapps.tcloudbase.com` 预检 204 放行，
`app.workbuddy.host` 403）。所以页面必须发布到上面这个域名，换域名数据一定读不出来。

### 发布步骤

1. 装一次 CLI（只用装一次）：

```bash
npm install @cloudbase/cli --registry=https://registry.npmmirror.com
```

2. 登录（需要**环境管理员级的 API Key**；`js/cloud.js` 里那把是前端匿名 key，只能读写数据表，不能发版）：

```bash
tcb login --cloudbase-api-key "<管理员 API Key>" -e efficient-tiglon-d0ejcn14037eba3
```

3. 只把站点文件装进一个干净的暂存目录（**不要整目录上传**，否则 README / PROJECT-NOTES / .workbuddy 都会变成公开文件）：

```bash
mkdir -p .workbuddy/_deploy
cp index.html .workbuddy/_deploy/ && cp -r css js .workbuddy/_deploy/
```

4. 发布（`--safe` 会先备份、失败自动回滚；`--verify` 上传后逐项校验）：

```bash
tcb hosting deploy .workbuddy/_deploy -e efficient-tiglon-d0ejcn14037eba3 --safe --verify
```

5. 验证：

```bash
curl -s -H "Cache-Control: no-cache" "https://store-build-efficient-tiglon-d0ejcn14037eba3.webapps.tcloudbase.com/index.html" | grep -oE "20261027z[0-9]+"
```

版本号对上了才算发成功（`index.html` 里的 `?v=` 会跟着换，浏览器不会吃旧缓存）。

### 两个必须记住的坑

- **不要加 `--prune`**：那个参数会删掉"不属于本次发布"的远端文件，`__auth/`（登录用）和别人的
  `cloud-admin/` 都会被一起清掉。
- **不要整目录 `tcb hosting deploy .`**：项目根目录有 `PROJECT-NOTES.md`（内部笔记）、
  `.workbuddy/`（探针脚本）、`.git/`，整传等于把内部笔记全公开了。上面的「只传 index.html + css + js」是正解。

### API Key 怎么保管

- 只放在命令行参数 / 临时文件里，**不写进项目任何文件**，也不提交到 Git
- 控制台 → 环境 → API Key 里可以随时吊销重建

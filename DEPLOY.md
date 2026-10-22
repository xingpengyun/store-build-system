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
git clone https://github.com/你的用户名/shop-build-system.git
cd shop-build-system
```

然后双击 `start-server.bat` 就能打开系统。

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
不会。数据存在浏览器 localStorage 里，和代码是两回事。
需要搬迁数据时，用系统里的「系统设置 → 导出备份」，把 JSON 文件带到另一台机器导入。
**别把导出的 JSON 提交到公开仓库**，里面有真实业务数据。

**Q：.gitignore 里忽略了什么？**
只忽略了 `.workbuddy/`（AI 工作笔记）和系统临时文件。所有代码、样式、README 都会提交。

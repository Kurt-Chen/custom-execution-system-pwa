# Brute Force · 定制自己的执行系统

**Brute Force · Custom Execution System**

一款**移动端优先**的个人执行与复盘 PWA（Progressive Web App），围绕「完成记录、周计划、十二周战术、习惯打卡、训练 Forge、目标与使命」构建。全部业务逻辑集中在单文件 `index.html` 中，无需 Node 构建链即可运行。

A **mobile-first** personal execution & review PWA built around done logging, weekly planning, 12-week tactics, habits, Forge training, goals, and purpose. All application logic lives in a single `index.html` — no Node build step required.

---

## 目录 · Table of Contents

- [项目简介 · Overview](#项目简介--overview)
- [核心功能模块 · Core Modules](#核心功能模块--core-modules)
- [技术栈 · Tech Stack](#技术栈--tech-stack)
- [本地运行 · Local Development](#本地运行--local-development)
- [部署 · Deployment](#部署--deployment)
- [目录结构 · Project Structure](#目录结构--project-structure)
- [数据与同步 · Data & Sync](#数据与同步--data--sync)
- [开发约定 · Conventions](#开发约定--conventions)
- [相关文档 · Related Docs](#相关文档--related-docs)

---

## 项目简介 · Overview

| | 中文 | English |
|---|------|---------|
| **产品名** | Brute Force（浏览器/PWA 标题） | Brute Force (app / PWA title) |
| **形态** | 单页应用（SPA 式交互，Vanilla JS 实现） | Single-page app (SPA-like UX, Vanilla JS) |
| **定位** | 个人「执行系统」：记录已完成事项、约束当日最高杠杆行动、对齐 12 Week Year 与长期目标 | Personal execution OS: log wins, constrain daily leverage actions, align with 12WY & long-term goals |
| **离线** | 支持安装到主屏幕；`sw.js` 缓存应用壳 | Installable; `sw.js` caches app shell |
| **多设备** | 可选 Firebase Realtime Database 房间同步 | Optional Firebase RTDB room sync |

**架构要点 · Architecture**

- 全局 `state` 对象持有业务数据 → `saveState()` 持久化 → `render()` 命令式刷新 UI。
- 不是 React / Vue 项目；勿按组件框架假设目录结构。

---

## 核心功能模块 · Core Modules

应用通过**底部主导航**（手机全屏模式）在五大主模块间切换：

The app switches five **primary modules** via the **bottom navigation** (mobile fullscreen):

| 模块 Key | 名称 | 说明 |
|----------|------|------|
| `dynamic` | **Kinetic Execution** | 执行与计划中枢（见下表子 Tab） |
| `habit` | **Habit & Routine** | 习惯、衡量、人生进度表、Rule of 100 |
| `forge` | **Forge** | 训练打卡（Mind / Body / 今日训练 / 周计划等） |
| `goals` | **My Goals** | 年岁目标、金钱目标、嵌入项目 |
| `purpose` | **Purpose · Values · Identity** | 使命、价值观与身份 |

### Kinetic Execution（`#dynamicModule`）

一级 Tab（`kineticTabDefs`）：

| Tab | 功能 |
|-----|------|
| **My Done List** | 按日记录已完成任务；时段统计；快捷跳转使命/目标/封闭清单 |
| **12 Week Year** | 十二周年战术 **#20 / #21 / #22**（13 周任务、子任务、深度时间、愿景故事、复盘） |
| **Weekly Plan** | 按周主任务 + 微任务；生活/工作泳道；可同步到封闭清单 |
| **提醒与备忘** | 倒计时、Stop Doing、Not To Do、Haters & Doubters、备忘录等 |
| **垃圾箱** | 软删除 7 天内可恢复；与云合并按条处理 |

**Weekly Plan 内嵌 · Highest-Leverage Action（封闭清单 / Closed-List）**

- 每日最多 3 条「一件事」；支持与周计划、十二周年任务 **mirrorOf** 双向完成联动。
- 子步骤、极端截止期限、农历提示等。

### Habit & Routine（`#habitRoutineModule`）

子 Tab 示例：

| 子 Tab | 功能 |
|--------|------|
| **人生进度表** | 约 4000 周人生进度；周二可同步摘要到 My Done |
| **始终向后衡量** | 每天三赢、清空油箱（Fuel）评分、向后衡量日记 |
| **习惯** | 多类习惯打卡卡片（专注、健康、写作、学习、AI 等） |
| **Rule of 100** | 百次规则追踪 |

### Forge（`#forgeModule`）

- **今日训练**：Forge Log、每天最低标准、周最低标准  
- **Mind / Body / Red-Pill & Game / 性表现** 等分区  
- 壶铃、囚徒健身等结构化打卡与进度  

### My Goals & Purpose

- **年岁目标**：倒计时时间线  
- **金钱目标**：净值 / 被动收入等  
- **Purpose · Values**：使命陈述与价值观列表  

### 横切能力 · Cross-cutting

- **登录门**（可选本地密码 / 空闲锁定）  
- **云同步角标**（Firebase RTDB + 匿名登录）  
- **软删除 + `syncTombstones`**（防止云端合并「复活」已删记录）  
- **桌面 / 手机分轨样式**（`max-width: 767px`、`pointer: coarse` 等，见 Cursor 规则）

---

## 技术栈 · Tech Stack

| 层级 | 技术 | 版本 / 说明 |
|------|------|-------------|
| **前端** | HTML5 + CSS3 + Vanilla JavaScript | 单文件 `index.html`（约 7 万+ 行，含内联样式与脚本） |
| **框架** | 无 | ❌ 非 React / Vue / Angular |
| **包管理** | 无 `package.json` | 无 Webpack / Vite 构建 |
| **PWA** | Web App Manifest + Service Worker | `manifest.webmanifest`、`sw.js` |
| **本地存储** | **IndexedDB**（主）+ **localStorage**（配置） | 主键 `todo-app-data-v1`；IDB `exec-system-app-db` |
| **云端** | **Firebase JS SDK（compat）** | **10.12.5** — App + Auth + **Realtime Database** |
| **认证** | Firebase Anonymous Auth | 需控制台启用匿名登录 |
| **部署** | GitHub Pages | `deploy.ps1`、`publish-github-pages.ps1` |
| **编辑器集成** | VS Code / Cursor | `.vscode/tasks.json` 打开文件夹时尝试 `git pull` |

**Firebase 使用范围 · Firebase scope**

- 仅用于**多设备云同步**（`rooms/{roomId}`），不是 Firestore/Functions 全栈。
- 上传需注意 RTDB **单次写入约 256KB**；过大时走 v2 分片（`done` 等）。

---

## 本地运行 · Local Development

### 环境要求 · Requirements

- 现代浏览器（Chrome / Edge / Safari / Firefox）
- 本地 **HTTP 静态服务**（推荐；`file://` 下 Service Worker / 部分 API 可能受限）
- （可选）用于云同步：Firebase 项目配置 JSON

### 方式一：Python 内置服务器（推荐）

在项目根目录执行：

```bash
# Python 3
python -m http.server 8080
```

浏览器打开：<http://localhost:8080/> 或 <http://localhost:8080/index.html>

### 方式二：Node 一次性静态服务

若已安装 Node.js：

```bash
npx --yes serve -l 8080
```

### 方式三：VS Code / Cursor Live Server

用 Live Server 类扩展打开 `index.html`，确保以 **http://** 访问。

### 首次使用 · First run

1. 打开页面 → 若启用登录门，设置或输入本地密码。  
2. 数据默认写入 **IndexedDB**；首次可从旧版 localStorage 自动迁移。  
3. **云同步（可选）**：在应用内云同步面板粘贴 Firebase Web 配置 JSON（含 `apiKey`、`projectId`、`databaseURL`），启用匿名登录与 RTDB 规则。  
4. **安装 PWA**：浏览器菜单 →「安装应用」/「添加到主屏幕」。

### 开发时注意 · Dev notes

- 修改 `sw.js` 中 `CACHE_NAME` 后，刷新可能需关闭旧 SW 或硬刷新。  
- 改 `index.html` 后无需编译；保存并刷新即可。  
- 大陆网络访问 Firebase 可能需要代理（应用内错误提示会说明）。

---

## 部署 · Deployment

| 脚本 | 用途 |
|------|------|
| `deploy.ps1` | `git add` → `commit` → `push` 到当前分支（默认用于 GitHub Pages 更新） |
| `publish-github-pages.ps1` | 首次创建 GitHub 仓库并启用 Pages（需 `gh` CLI） |
| `push.ps1` | 带状态检查的提交推送快捷脚本 |

```powershell
# 在项目根目录
powershell -ExecutionPolicy Bypass -File .\deploy.ps1 -Message "docs: update README"
```

GitHub Pages 通常 1–3 分钟内生效。公开 URL 形如：`https://<user>.github.io/<repo>/`

---

## 目录结构 · Project Structure

```text
定制自己的执行系统/
├── index.html              # ★ 主应用（HTML + CSS + JS 全部在此）
├── sw.js                   # Service Worker（离线缓存；改 CACHE_NAME 发版）
├── manifest.webmanifest    # PWA 清单
├── icons/                  # 应用图标（PNG / SVG）
├── deploy.ps1              # 提交并推送到 GitHub
├── publish-github-pages.ps1
├── push.ps1
├── README.md               # 本文件
├── .cursorrules            # Cursor AI 项目规则摘要
├── .cursor/
│   ├── rules/              # 持久规则（Git 工作流、端别分离、数据保留等）
│   └── hooks/              # 会话结束提醒 push 等
├── .vscode/
│   ├── tasks.json          # 打开文件夹时 git pull
│   ├── settings.json
│   └── git-sync-on-open.ps1
├── _forge_*.mjs            # 维护用脚本（拆分/重构 index，非常规运行时依赖）
├── _forge_refactor_html.py
├── index - 2026.3.31.html  #  dated 备份快照，非主开发入口
├── _zip_scan/              # 历史 zip 扫描副本（勿作日常开发目录）
├── The 12 Week Year.txt    # 参考书籍文本（非代码）
└── .gitignore
```

**不应提交 · Do not commit routinely**

- `_zip_scan/`、`*_git_head_*.html`、本地 zip 包、`.vscode/`（已在 gitignore 中忽略部分）

---

## 数据与同步 · Data & Sync

| 存储 | 键 / 路径 | 内容 |
|------|-----------|------|
| IndexedDB | `todo-app-data-v1` | 主业务 `state`（done、周计划、习惯、Forge、十二周年等） |
| localStorage | `todo-app-firebase-config-v1` | Firebase 配置 |
| localStorage | 若干 `todo-app-*` | 行样式、云同步游标、登录信任设备等 |
| Firebase RTDB | `rooms/{roomId}/v2/...` | 云端房间（meta、core、分片 done） |

**合并原则 · Merge**

- 以云端 **`updatedAt`（服务器时间）** 为准，不用「本机最后保存时间」简单比较。  
- 删除走 **`syncTombstones`** + **垃圾箱 `trash`**；例行清理**不**按年龄删 My Done（见 `.cursor/rules/data-retention.mdc`）。

---

## 开发约定 · Conventions

| 项 | 约定 |
|----|------|
| **改代码** | 默认只改 `index.html`；保持 `saveState()` / `render()` 流程 |
| **端别** | 动样式前确认 Desktop / Mobile / Both（见 `.cursor/rules/platform-desktop-mobile-separation.mdc`） |
| **Git** | 协作前 `git pull`；结束会话前检查 commit & push |
| **AI 辅助** | 见根目录 `.cursorrules` 与 `.cursor/rules/*.mdc` |

---

## 相关文档 · Related Docs

| 文件 | 说明 |
|------|------|
| [`.cursorrules`](./.cursorrules) | Cursor 用：技术栈、命名、Firebase、禁止事项 |
| [`.cursor/rules/git-workflow-session.mdc`](./.cursor/rules/git-workflow-session.mdc) | Git 拉取 / 推送提醒 |
| [`.cursor/rules/platform-desktop-mobile-separation.mdc`](./.cursor/rules/platform-desktop-mobile-separation.mdc) | 电脑版 vs 手机版改动范围 |
| [`.cursor/rules/data-retention.mdc`](./.cursor/rules/data-retention.mdc) | 数据保留与清理策略 |

---

## 许可证 · License

未在仓库中单独声明开源许可证；若对外分发请自行补充 LICENSE 文件。

No separate open-source license file is included in this repository; add a `LICENSE` if you distribute publicly.

---

*README generated from repository scan — 2026-05.*

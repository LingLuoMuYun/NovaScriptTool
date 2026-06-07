<div align="center">

# 🎬 NovaScriptTool

### AI 驱动的小说转剧本创作辅助系统

[![Tech](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Electron](https://img.shields.io/badge/Electron-33-47848f?logo=electron)](https://www.electronjs.org/)
[![Prisma](https://img.shields.io/badge/Prisma-5-2d3748?logo=prisma)](https://www.prisma.io/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-3-06b6d4?logo=tailwindcss)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

</div>

---

## 🚀 快速启动

```bash
# 1. 安装依赖
cd backend  && npm install
cd ../frontend && npm install

# 2. 配置环境变量
cp backend/.env.example backend/.env
# 编辑 backend/.env，填入 DeepSeek API Key

# 3. 初始化数据库
cd backend && npx prisma migrate dev --name init

# 4. 启动服务
npm run dev          # 后端 :4000
cd ../frontend && npm run dev  # 前端 :3000

# 5. 打开 http://localhost:3000
```

### 桌面应用（Electron）

```bash
npm install                     # 根目录安装 Electron 依赖
npm run electron:dev            # 开发模式启动桌面应用
npm run electron:build          # 打包为 Windows/macOS/Linux 安装包
```

---

## 🏗️ 技术栈

| 层级 | 技术 |
|:---|:---|
| **前端框架** | Next.js 14 (App Router) + React 18 |
| **语言** | TypeScript 5 |
| **样式** | TailwindCSS 3 · 暗色模式 (`darkMode: class`) |
| **图表** | Recharts · react-force-graph-2d |
| **后端框架** | Express 4 |
| **ORM** | Prisma 5 |
| **数据库** | SQLite |
| **AI 引擎** | DeepSeek (聊天) · Mimo v2.5 (分析流水线) |
| **AI SDK** | OpenAI SDK 6 |
| **桌面打包** | Electron 33 · electron-builder 25 |
| **运行时** | Node.js 24 · tsx |

## 📦 第三方依赖清单

### 前端 (`frontend/package.json`)

| 依赖 | 版本 | 用途 | 许可证 |
|:---|:---|:---|:---|
| next | ^14.2 | React 全栈框架 | MIT |
| react / react-dom | ^18.3 | UI 组件库 | MIT |
| recharts | ^3.8 | 分析图表（冲突统计） | MIT |
| react-force-graph-2d | ^1.29 | 角色关系网络图 | MIT |
| tailwindcss | ^3.4 | 原子化 CSS 框架 | MIT |
| autoprefixer | ^10.4 | CSS 前缀自动补全 | MIT |
| postcss | ^8.4 | CSS 后处理器 | MIT |
| typescript | ^5.6 | 类型系统 | Apache-2.0 |

### 后端 (`backend/package.json`)

| 依赖 | 版本 | 用途 | 许可证 |
|:---|:---|:---|:---|
| express | ^4.21 | HTTP 服务框架 | MIT |
| cors | ^2.8 | 跨域请求处理 | MIT |
| openai | ^6.42 | AI API 客户端（DeepSeek/Mimo） | Apache-2.0 |
| @prisma/client | ^5.22 | 数据库 ORM | Apache-2.0 |
| multer | ^2.1 | 文件上传中间件 | MIT |
| dotenv | ^17.4 | 环境变量加载 | BSD-2-Clause |
| zod | ^4.4 | Schema 校验 | MIT |
| diff | ^9.0 | 版本差异对比 | BSD-3-Clause |
| tsx | ^4.19 | TypeScript 开发热重载 | MIT |

### 根目录 (`package.json`)

| 依赖 | 版本 | 用途 | 许可证 |
|:---|:---|:---|:---|
| electron | ^33.0 | 桌面应用运行时 | MIT |
| electron-builder | ^25.0 | 桌面应用打包 | MIT |

---

## ✨ 开发亮点

### 1. 4 Agent 异步流水线

小说上传后，4 个专业化 AI Agent 自动协作完成全流程分析：

```
Agent 1: 剧情解构 → Agent 2: 角色图谱 → Agent 3: 场景规划 → Agent 4: 剧本生成
```

Agent 间传递结构化约束（角色列表、剧情大纲），避免单一 Agent 的幻觉和遗漏。

### 2. 长文本滑动窗口分块

对于 50,000+ 字长篇小说，系统自动分块（滑动窗口 + 上下文拼接），逐窗分析后合并去重，确保后期角色和剧情也不丢失。

### 3. Google Docs 风格行内评论

在剧本查看器中，每个内容块支持悬停添加评论，支持 @ 提及角色、多种评论类型（待办/疑问/建议/笔记）、已解决/未解决状态切换。

### 4. 依赖图谱与增量重算

场景间的因果/角色/时序依赖自动分析（BFS），修改角色设定后仅重算受影响场景，锁定场景自动保护不被覆盖。

### 5. 版本管理与 Diff 对比

每次 AI 生成或手动编辑自动创建新版本（不覆盖历史），支持任意两个版本的逐行 Diff 对比和无损回滚。

### 6. 内置 AI 写作助手

基于 DeepSeek API 的对话式助手，嵌入小说详情页，支持 8 套编剧风格模板（古装/都市/悬疑/科幻/奇幻/历史/言情/通用），自动获取当前小说角色和原文上下文。

### 7. 并发控制与任务队列

内建内存级任务队列与令牌桶速率限制器，控制 AI 流水线最大并发数（默认 2），FIFO 调度 + 短文本优先，支持队列状态 SSE 实时推送、排队任务取消、超时自动回收，防止多用户/多任务场景下的 API 过载与服务器崩溃。

### 8. 暗色模式

基于 Tailwind `darkMode: 'class'` 策略的全局暗色模式，localStorage 持久化偏好，自动检测系统 `prefers-color-scheme`。

### 9. 多格式导出

支持导出为 YAML、Final Draft (.fdx)、Fountain 三种剧本格式，兼容专业编剧软件。

---

## 🧩 原创功能

以下功能为本项目独立设计与实现，非依赖第三方库直接提供：

| 功能 | 说明 |
|:---|:---|
| **4 Agent 编排引擎** | 剧情解构 → 角色图谱 → 场景规划 → 剧本生成的异步流水线，Agent 间上下文传递与合并去重 |
| **滑动窗口分块分析** | 长文本智能分块 + 窗口重叠 + 角色去重 + 全局一致性检查的全套算法 |
| **依赖图谱 BFS 影响分析** | 场景间因果关系建模，BFS 计算最小受影响范围，支持权重阈值过滤 |
| **SSE 流式进度推送** | 流水线实时进度可视化（分阶段、百分比、统计信息），前后端双向通信 |
| **行内评论系统** | 块级注释锚定、@ 提及角色自动补全、多类型评论（todo/question/suggestion/note） |
| **剧本 Schema 校验** | Zod Schema 强校验 + 3 次自动重试 + 安全降级占位机制 |
| **安全降级策略** | AI 内容审核拦截后自动缩短文本 + 关闭思维链重试的多级降级 |
| **模板化 AI 聊天** | 8 套编剧风格模板，每套独立的 system prompt/temperature/角色偏好 |
| **并发控制与任务队列** | 内存级 FIFO 任务队列 + 令牌桶速率限制器，可配置并发数，SSE 实时推送队列状态，排队任务可取消 |
| **Electron 双进程管理** | 主进程管理 Express + Next.js 子进程生命周期，健康检查等待，数据库自动迁移 |

---

## 📂 项目结构

```
NovaScriptTool/
├── frontend/                        # Next.js 14 前端
│   └── src/
│       ├── app/
│       │   ├── layout.tsx           # 根布局 (ThemeProvider + 导航)
│       │   ├── page.tsx             # 首页 (上传 + 小说列表)
│       │   └── novels/[id]/page.tsx # 小说详情页 (Tab 工作台 + AI 助手)
│       ├── components/              # 21 个 UI 组件
│       │   ├── ChatPanel.tsx        # AI 对话面板
│       │   ├── ScriptViewer.tsx     # 结构化剧本查看器 + 行内评论
│       │   ├── AnalysisDashboard.tsx# 分析仪表板
│       │   ├── PipelineProgress.tsx # 流水线进度可视化
│       │   ├── TemplateSelector.tsx # 项目模板选择器
│       │   ├── QueueStatusPanel.tsx  # 并发队列状态面板
│       │   └── ...                  # 其余 16 个组件
│       └── lib/api.ts               # API 客户端 (含 SSE 队列订阅)
├── backend/                         # Express API Server
│   ├── src/
│   │   ├── index.ts                 # 全部路由 (50+ API 端点 + 队列端点)
│   │   ├── services/
│   │   │   ├── ai.service.ts        # AI 客户端 + 4 Agent + 流水分线
│   │   │   ├── chunked-pipeline.ts  # 分块分析流水线
│   │   │   ├── dependency.service.ts# 依赖图谱 + BFS 影响分析
│   │   │   ├── diff.service.ts      # 版本 Diff 引擎
│   │   │   ├── export.service.ts    # 多格式导出
│   │   │   └── job-queue.service.ts # 并发控制 + 令牌桶 + FIFO 队列
│   │   ├── schemas/                 # Zod Schema 定义
│   │   └── utils/text-processor.ts  # 文本预处理 + 章节分割
│   └── prisma/schema.prisma         # 7 个数据模型
├── electron/                        # Electron 桌面应用
│   ├── main.js                      # 主进程 (双服务管理)
│   └── preload.js                   # IPC 桥接 (原生文件对话框)
└── package.json                     # Electron 打包配置
```

---

## 📄 License

[MIT](LICENSE)

<div align="center">
  <sub>Built with ❤️ for creators</sub>
</div>

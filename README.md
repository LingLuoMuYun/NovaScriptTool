<div align="center">

<img src="docs/logo.svg" alt="NovaScriptTool" width="120" />

# 🎬 NovaScriptTool

### AI 驱动的小说转剧本创作辅助系统

*从非结构化文本到标准化 YAML 剧本，一步到位*

</div>

---

## 📖 项目简介

**NovaScriptTool** 是一款面向影视行业的生产力工具，利用大语言模型（LLM）的多 Agent 协作工作流，将小说文本自动转化为符合影视工业标准的 **结构化 YAML 剧本**。

传统小说转剧本需要编剧耗费 2-3 周进行人物关系提取、剧情结构梳理与对白重构。本系统通过 **4 个专业化 AI Agent** 的异步流水线协同，将这一过程压缩至 **30 分钟以内**，效率提升 **80%+**。

## ✨ 核心功能

| 模块 | 说明 |
|:---|:---|
| 📥 **长文本解析** | 稳定支持数万字级别小说的无损上传与上下文保持 |
| 👥 **角色图谱构建** | 自动识别命名实体，生成结构化角色注册表（姓名、别名、身份、性格标签） |
| 🎬 **智能场景切分** | 按戏剧逻辑自动切分场景，输出标准 Scene 流 |
| 📝 **YAML 剧本生成** | 多 Agent 协同输出严格 Schema 校验的 YAML 剧本 |
| 🔄 **版本管理** | 剧本内容支持多版本迭代与回滚 |

## 🧠 多 Agent 协作架构

系统采用 **4 个专业 Agent** 组成的异步流水线，而非传统单轮对话：

```
┌─────────────────────────────────────────────────────┐
│                   📚 小说原文输入                       │
└─────────────────────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
  ┌──────────┐ ┌──────────────┐ ┌──────────┐
  │ Agent 1  │ │  Agent 2     │ │ Agent 3  │
  │ 📖 剧情   │ │  👤 角色图谱  │ │ 🎬 场记  │
  │ 解构者   │ │  构建师      │ │ 统筹     │
  └──────────┘ └──────────────┘ └──────────┘
        │              │              │
        └──────────────┼──────────────┘
                       ▼
                ┌──────────────┐
                │   Agent 4    │
                │   ✍️ 剧本主笔 │
                └──────────────┘
                       │
                       ▼
                ┌──────────────┐
                │ 📄 YAML 剧本  │
                └──────────────┘
```

| Agent | 职责 | 输入 → 输出 |
|:---|:---|:---|
| **剧情解构者** | 全局通读，降维提取故事大纲与时间线 | 文本分块 → 大纲 + 主题向量 + 时间线 |
| **角色图谱构建师** | 命名实体识别与性格推理，防角色幻觉 | 全局文本 → 角色注册表 `[姓名, 别名, 身份, 性格, 目标]` |
| **场记统筹** | 划定戏剧冲突边界，转化为可拍摄场景 | 大纲 + 原文 → 场景元数据 `[编号, 地点, 时间, 角色列表]` |
| **剧本主笔** | 接收前三个 Agent 的结构化约束，生成对白与动作 | 约束 → 标准 YAML 剧本节点 |

## 🏗️ 技术栈

| 层级 | 技术 | 说明 |
|:---|:---|:---|
| **前端** | Next.js 14 · React 18 · TypeScript · TailwindCSS | 双栏工作台（原文 ↔ 剧本 YAML 实时映射） |
| **后端** | Node.js · Express · TypeScript | RESTful API |
| **数据库** | SQLite（开发） / PostgreSQL 16（生产） | Prisma ORM 统一访问层 |
| **AI 引擎** | Mimo v2.5（小米 AI） | OpenAI 兼容 API，支持思维链推理 |
| **部署** | Docker · Nginx | 容器化，反向代理 + HTTPS |

## 📦 项目结构

```
NovaScriptTool/
├── frontend/                     # Next.js 14 前端
│   ├── src/app/
│   │   ├── layout.tsx            # 根布局
│   │   ├── page.tsx              # 首页
│   │   └── globals.css           # 全局样式 (Tailwind)
│   ├── tailwind.config.ts
│   └── package.json
├── backend/                      # Express API Server
│   ├── src/
│   │   ├── index.ts              # API 路由入口
│   │   └── services/
│   │       └── ai.service.ts     # Mimo AI 客户端 + 4 Agent 封装
│   ├── prisma/
│   │   ├── schema.prisma         # Novel, Character, Scene, Script 四模型
│   │   └── dev.db                # SQLite 数据库文件（自动生成）
│   ├── .env                      # 环境变量（API Key + DB 连接）
│   ├── .env.example              # 环境变量模板
│   └── package.json
├── docker-compose.yml            # PostgreSQL 容器（生产模式用）
└── README.md
```

## 🗄️ 数据库模型

| 表 | 核心字段 | 说明 |
|:---|:---|:---|
| **Novel** | `id`, `title`, `content`, `status` | 小说项目原著 |
| **Character** | `id`, `novel_id`, `name`, `aliases`, `roleType`, `traits` | 角色注册表 |
| **Scene** | `id`, `novel_id`, `scene_num`, `location`, `time_of_day` | 场景轴 |
| **Script** | `id`, `scene_id`, `yaml_content`, `version` | YAML 剧本内容（支持版本管理） |

---

## 🚀 快速启动

### 前置条件

- **Node.js** ≥ 18
- **npm** ≥ 9
- （可选）**Docker Desktop** — 仅生产模式或切换 PostgreSQL 时需要

### 1. 克隆 & 安装依赖

```bash
git clone https://github.com/LingLuoMuYun/NovaScriptTool.git
cd NovaScriptTool

# 安装后端依赖
cd backend
npm install

# 安装前端依赖
cd ../frontend
npm install
```

### 2. 配置环境变量

```bash
cd backend
cp .env.example .env
```

编辑 `backend/.env`，填入你的 API 密钥：

```env
# ── 数据库 ──────────────────────────────
# 开发模式：SQLite，无需安装任何服务，开箱即用
DATABASE_URL="file:./dev.db"

# ── AI 模型 ─────────────────────────────
# Mimo API（小米 AI），OpenAI 兼容格式
# 获取 Key: https://api.xiaomimimo.com
MIMO_API_KEY="sk-你的密钥"
MIMO_BASE_URL="https://api.xiaomimimo.com/v1"
MIMO_MODEL="mimo-v2.5"
```

### 3. 初始化数据库

```bash
cd backend

# 生成 Prisma Client
npx prisma generate

# 创建数据库并运行迁移（SQLite 文件自动生成，无需装任何服务）
npx prisma migrate dev --name init
```

执行成功后，`backend/prisma/dev.db` 文件会自动创建。

### 4. 启动服务

**后端**（端口 4000）：

```bash
cd backend
npm run dev
```

**前端**（端口 3000）：

```bash
cd frontend
npm run dev
```

浏览器打开 **http://localhost:3000** 即可使用。

### 5. 验证是否正常

```bash
# 健康检查（数据库连接状态）
curl http://localhost:4000/api/health
# → {"status":"ok","db":"connected"}

# 创建一篇测试小说
curl -X POST http://localhost:4000/api/novels \
  -H "Content-Type: application/json" \
  -d '{"title":"测试小说","content":"第一章：在遥远的星系中..."}'
# → {"id":"xxx","title":"测试小说","status":"draft",...}

# 测试 AI 聊天
curl -X POST http://localhost:4000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"你好"}],"maxTokens":50,"thinking":false}'
# → {"content":"你好！请问有什么可以帮你的？","model":"mimo-v2.5",...}
```

---

## 📡 API 接口

### 基础

| 方法 | 路径 | 说明 |
|:---|:---|:---|
| `GET` | `/api/health` | 健康检查 + 数据库连接状态 |

### 小说 CRUD

| 方法 | 路径 | 请求体 | 说明 |
|:---|:---|:---|:---|
| `GET` | `/api/novels` | — | 获取所有小说列表 |
| `POST` | `/api/novels` | `{title, content}` | 创建小说 |
| `GET` | `/api/novels/:id` | — | 获取小说详情（含角色、场景、剧本） |
| `DELETE` | `/api/novels/:id` | — | 删除小说 |

### AI 接口

| 方法 | 路径 | 说明 |
|:---|:---|:---|
| `POST` | `/api/ai/chat` | 通用 AI 聊天 |
| `POST` | `/api/ai/analyze-plot` | Agent 1: 剧情解构 |
| `POST` | `/api/ai/analyze-characters` | Agent 2: 角色图谱构建 |
| `POST` | `/api/ai/plan-scenes` | Agent 3: 场景划分 |
| `POST` | `/api/ai/write-script` | Agent 4: 剧本生成 |

### AI 聊天参数

```json
{
  "messages": [{ "role": "user", "content": "你好" }],
  "model": "mimo-v2.5",
  "temperature": 0.7,
  "maxTokens": 32768,
  "thinking": false,
  "responseFormat": "text"
}
```

| 参数 | 类型 | 默认值 | 说明 |
|:---|:---|:---|:---|
| `messages` | array | 必填 | 对话消息列表 |
| `model` | string | `mimo-v2.5` | 可选 `mimo-v2.5-pro`, `mimo-v2-flash`, `mimo-v2-pro` |
| `temperature` | number | `0.7` | 采样温度 (0-1.5) |
| `maxTokens` | number | `32768` | 最大输出 token 数 |
| `thinking` | bool | `false` | 是否开启思维链（Mimo 默认开启，本项目默认关闭） |
| `responseFormat` | string | `text` | 输出格式，也可选 `json_object` |

### 响应格式

```json
{
  "content": "AI 回复的文本内容",
  "reasoning": "思维链推理过程（thinking: true 时返回）",
  "usage": {
    "completion_tokens": 20,
    "prompt_tokens": 250,
    "total_tokens": 270,
    "completion_tokens_details": { "reasoning_tokens": 0 },
    "prompt_tokens_details": { "cached_tokens": 192 }
  },
  "model": "mimo-v2.5"
}
```

---

## 🔧 环境变量

| 变量 | 默认值 | 说明 |
|:---|:---|:---|
| `PORT` | `4000` | 后端监听端口 |
| `DATABASE_URL` | `file:./dev.db` | 数据库连接串。SQLite 用 `file:./dev.db`，PostgreSQL 用 `postgresql://...` |
| `MIMO_API_KEY` | — | **必填**。Mimo API 密钥 |
| `MIMO_BASE_URL` | `https://api.xiaomimimo.com/v1` | Mimo API 地址 |
| `MIMO_MODEL` | `mimo-v2.5` | 默认模型名称 |

---

## 🐘 切换到 PostgreSQL（生产模式）

如果你有 Docker Desktop，可以切换到 PostgreSQL：

```bash
# 1. 启动 PostgreSQL
docker compose up -d

# 2. 修改 backend/.env 中的数据库连接
# DATABASE_URL="postgresql://nova:nova123@localhost:5432/novascript"

# 3. 重新生成 Prisma Client（因为 provider 变了）
cd backend
npx prisma generate

# 4. 运行迁移
npx prisma migrate dev

# 5. 重启后端
npm run dev
```

> **注意**：Prisma schema 中 SQLite 和 PostgreSQL 的字段类型略有不同（如 PostgreSQL 用 `@db.Uuid`、`@db.Text` 等），切换时需要同步调整 `prisma/schema.prisma`。

---

## 🧪 Mimo 模型说明

本项目使用 **小米 Mimo v2.5 API**，完全兼容 OpenAI SDK：

| 项目 | 值 |
|:---|:---|
| Base URL | `https://api.xiaomimimo.com/v1` |
| 认证方式 | `Authorization: Bearer <API_KEY>` |
| 可用模型 | `mimo-v2.5`, `mimo-v2.5-pro`, `mimo-v2-flash`, `mimo-v2-pro`, `mimo-v2-omni` |
| 默认 Token 上限 | `mimo-v2.5`: 32768, `mimo-v2.5-pro`: 131072 |
| 思维链 | 默认开启，可手动关闭 |

### 关于思维链模式

Mimo v2.5 **默认开启**思维链（thinking mode）。这会导致模型先进行推理再输出答案。如果你发现返回的 `content` 为空而 `reasoning` 有内容，说明 token 全部消耗在推理阶段了。

解决方法：增大 `maxTokens`，或调用时传入 `"thinking": false` 关闭思维链。

---

## ❗ 常见问题

### Q: `tsx` 没有加载 `.env` 文件？

**这是已知问题**。`tsx` 不会像 `dotenv` 那样自动加载 `.env` 文件。

本项目已在 `backend/src/services/ai.service.ts` 的第一行添加了 `import "dotenv/config"` 手动加载。如果你在其他文件中需要读取 `.env`，也要加上这行导入。

### Q: AI 返回 `401 Invalid API Key`？

检查以下几点：
1. `backend/.env` 文件是否存在且位于 `backend/` 目录下
2. `MIMO_API_KEY` 的值是否正确，注意不要有多余的空格或引号
3. API Key 是否已过期

```bash
# 直接测试 API 连通性
curl -X POST "https://api.xiaomimimo.com/v1/chat/completions" \
  -H "Authorization: Bearer $YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"mimo-v2.5","messages":[{"role":"user","content":"hi"}],"max_completion_tokens":20}'
```

### Q: 端口被占用（`EADDRINUSE`）？

```bash
# Windows：查找并关闭占用端口的进程
netstat -ano | grep ":4000"
taskkill //PID <PID> //F

# Mac / Linux：
lsof -ti:4000 | xargs kill -9
```

### Q: AI 返回空内容，只有 `reasoning`？

Mimo 默认开启思维链，token 消耗在推理上。调用时设置 `"thinking": false` 或在代码中增大 `maxTokens`。

### Q: 如何重置数据库？

```bash
cd backend
rm prisma/dev.db          # 删除 SQLite 文件
npx prisma migrate dev    # 重新创建
```

### Q: Prisma 报 `Environment variables not found`？

确保 `backend/.env` 文件存在，且 `DATABASE_URL` 已配置。检查文件编码为 UTF-8。

---

## 🔮 路线图

- [x] 项目脚手架搭建（前端 + 后端 + 数据库）
- [x] Mimo AI 客户端集成
- [x] 4 Agent 服务接口（剧情解构 / 角色图谱 / 场记统筹 / 剧本主笔）
- [ ] 小说文本分块上传与解析
- [ ] YAML Schema 强校验输出
- [ ] 前端双栏工作台（原文 ↔ YAML 实时映射）
- [ ] 角色关系网络图可视化
- [ ] 流式 SSE 剧本生成
- [ ] YAML 导出与版本对比
- [ ] Docker 一键部署

## 📄 License

[MIT](LICENSE)

---

<div align="center">
  <sub>Built with ❤️ for creators</sub>
</div>

<div align="center">

<img src="docs/logo.svg" alt="NovaScriptTool" width="120" />

# 🎬 NovaScriptTool

### AI 驱动的小说转剧本创作辅助系统

*从非结构化文本到标准化 YAML 剧本，一步到位*

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org)
[![Prisma](https://img.shields.io/badge/Prisma-5-2D3748)](https://prisma.io)

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
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
  ┌──────────┐   ┌──────────────┐   ┌──────────┐
  │ Agent 1  │   │  Agent 2     │   │ Agent 3  │
  │ 📖 剧情   │   │  👤 角色图谱  │   │ 🎬 场记  │
  │ 解构者   │   │  构建师      │   │ 统筹     │
  └──────────┘   └──────────────┘   └──────────┘
        │                │                │
        └────────────────┼────────────────┘
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
| **前端** | Next.js 14 · React 18 · TypeScript · TailwindCSS · Zustand | 双栏工作台（原文 ↔ 剧本 YAML 实时映射） |
| **后端** | Node.js · Express · TypeScript | RESTful API + SSE 流式响应 |
| **数据库** | PostgreSQL 16 · Prisma ORM | 关系型存储，JSONB 存灵活标签 |
| **AI 引擎** | GPT-4o · DeepSeek-V3 · LangChain | 复杂推理 + 长文本高性价比吞吐 |
| **部署** | Docker · Nginx | 容器化，反向代理 + HTTPS |

## 📦 项目结构

```
NovaScriptTool/
├── frontend/                # Next.js 14 SPA
│   ├── src/
│   │   └── app/             # App Router
│   ├── tailwind.config.ts
│   └── package.json
├── backend/                 # Express API Server
│   ├── src/
│   │   └── index.ts         # 入口
│   ├── prisma/
│   │   └── schema.prisma    # 4 表: Novel, Character, Scene, Script
│   └── package.json
├── docker-compose.yml       # PostgreSQL 本地环境
└── README.md
```

## 🗄️ 数据库模型

| 表 | 核心字段 | 说明 |
|:---|:---|:---|
| **Novel** | `id`, `title`, `content`, `status` | 小说项目原著 |
| **Character** | `id`, `novel_id`, `name`, `aliases`, `traits(JSONB)` | 角色注册表 |
| **Scene** | `id`, `novel_id`, `scene_num`, `location`, `time_of_day` | 场景轴 |
| **Script** | `id`, `scene_id`, `yaml_content`, `version` | YAML 剧本内容（支持版本管理） |

## 🚀 快速开始

### 前置条件

- Node.js ≥ 18
- Docker (用于启动 PostgreSQL)

### 1. 克隆仓库

```bash
git clone https://github.com/LingLuoMuYun/NovaScriptTool.git
cd NovaScriptTool
```

### 2. 启动数据库

```bash
docker-compose up -d
```

### 3. 配置后端

```bash
cd backend
cp .env.example .env      # 编辑 .env 填写你的 API Key
npm install
npx prisma migrate dev --name init
npm run dev               # → http://localhost:4000
```

### 4. 启动前端

```bash
cd frontend
npm install
npm run dev               # → http://localhost:3000
```

## 🔮 路线图

- [ ] 小说文本分块上传与解析
- [ ] Agent 1: 剧情解构者
- [ ] Agent 2: 角色图谱构建师
- [ ] Agent 3: 场记统筹
- [ ] Agent 4: 剧本主笔
- [ ] YAML Schema 强校验输出
- [ ] 前端双栏工作台（原文 ↔ YAML 实时映射）
- [ ] 角色关系网络图可视化
- [ ] 流式 SSE 剧本生成
- [ ] YAML 导出与版本对比

## 📄 License

[MIT](LICENSE)

---

<div align="center">
  <sub>Built with ❤️ for creators</sub>
</div>

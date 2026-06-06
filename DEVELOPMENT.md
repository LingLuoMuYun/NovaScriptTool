# AI 驱动的小说转剧本创作辅助系统 — 开发文档

<div align="center">

**版本**: v1.2.0 · **最后更新**: 2026-06-07 · **状态**: 活跃开发中

</div>

---

## 目录

1. [产品概述](#1-产品概述)
2. [系统架构](#2-系统架构)
3. [多 Agent 协作引擎](#3-多-agent-协作引擎)
4. [数据库设计](#4-数据库设计)
5. [API 接口参考](#5-api-接口参考)
6. [前端组件体系](#6-前端组件体系)
7. [核心工作流](#7-核心工作流)
8. [内容安全与降级策略](#8-内容安全与降级策略)
9. [环境配置与部署](#9-环境配置与部署)
10. [项目结构全览](#10-项目结构全览)
11. [后续规划与优化清单](#11-后续规划与优化清单)

---

## 1. 产品概述

### 1.1 产品定位

**NovaScriptTool** 是一款面向影视编剧行业的生产力工具，利用大语言模型（LLM）多 Agent 协作工作流，将非结构化小说文本自动转化为符合影视工业标准的 **结构化 YAML 剧本**。

核心理念：**系统是编剧的"增强型智能副驾"，而非替代者**。AI 负责初稿生成的繁重工作，编剧保留对最终输出的完整裁决权。

### 1.2 价值指标

| 维度 | 传统模式 | NovaScriptTool | 提升幅度 |
|:---|:---|:---|:---|
| 人物关系提取 | 2-3 天 | 30 秒 | **99%+** |
| 剧情结构梳理 | 3-5 天 | 60 秒 | **99%+** |
| 场景划分与编号 | 1-2 天 | 45 秒 | **99%+** |
| 初稿剧本生成 | 2-3 周 | 2-5 分钟 | **99%+** |
| 修改后重新生成 | 1-2 天 | 30 秒（增量） | **99%+** |
| **端到端周期** | **3-4 周** | **5-10 分钟（初稿）+ 人工精修** | **95%+** |

### 1.3 技术栈

| 层级 | 技术选型 | 选型理由 |
|:---|:---|:---|
| **前端框架** | Next.js 14 (App Router) + React 18 | SSR/CSR 混合、文件系统路由、生态成熟 |
| **样式方案** | TailwindCSS 3.4 | 原子化 CSS、零运行时开销、设计约束 |
| **语言** | TypeScript 5.6 (前后端统一) | 类型安全、重构友好 |
| **后端框架** | Express.js 4.x | 轻量、中间件生态、适合 API 服务 |
| **运行时** | tsx (TypeScript Execute) | 开发热重载、无需编译步骤 |
| **ORM** | Prisma 5.22 | 类型安全查询、自动迁移、多数据库支持 |
| **数据库** | SQLite (开发) / PostgreSQL 16 (生产) | 开发零配置、生产高并发 |
| **AI 引擎** | Mimo v2.5 (小米 AI) | OpenAI 兼容 API、支持思维链推理、中文优化 |
| **AI SDK** | OpenAI Node.js SDK | 社区标准、流式支持、类型完整 |
| **Diff 引擎** | diff (npm) | 行级语义对比、YAML 友好 |

---

## 2. 系统架构

### 2.1 架构总览

```
┌──────────────────────────────────────────────────────────────────┐
│                        客户端 (Browser)                            │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │ Next.js 14   │  │ TailwindCSS  │  │ fetch + ReadableStream   │ │
│  │ App Router   │  │ 组件库       │  │ (SSE 消费)               │ │
│  └─────────────┘  └──────────────┘  └──────────────────────────┘ │
└──────────────────────────┬───────────────────────────────────────┘
                           │ HTTP REST + SSE
┌──────────────────────────┴───────────────────────────────────────┐
│                      服务层 (Express.js :4000)                     │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │ REST 路由    │  │ SSE 端点      │  │ Multer 文件上传          │ │
│  │ (26 个端点) │  │ (pipeline-   │  │ (.txt/.md/.json)        │ │
│  │             │  │  stream)     │  │                         │ │
│  └─────────────┘  └──────────────┘  └──────────────────────────┘ │
└──────────────────────────┬───────────────────────────────────────┘
                           │
┌──────────────────────────┴───────────────────────────────────────┐
│                      业务逻辑层 (Services)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────┐ │
│  │ ai.service   │  │ diff.service │  │ dependency.service      │ │
│  │ · 4 Agent    │  │ · diffYaml() │  │ · buildDependencyGraph()│ │
│  │ · 流水线编排  │  │ · 行级对比   │  │ · analyzeImpact (BFS)   │ │
│  │ · 安全降级   │  │              │  │                         │ │
│  └──────────────┘  └──────────────┘  └─────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ text-processor                                               │ │
│  │ · cleanText() · splitChapters() · chunkByChars() · stats     │ │
│  └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────┬───────────────────────────────────────┘
                           │ Prisma ORM
┌──────────────────────────┴───────────────────────────────────────┐
│                    持久层 (SQLite / PostgreSQL)                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────────┐  │
│  │ Novel    │ │ Character│ │ Scene    │ │ Script (版本化)    │  │
│  │ (项目)   │ │ (角色)   │ │ (场景)   │ │ (剧本 YAML)       │  │
│  └──────────┘ └──────────┘ └──────────┘ └────────────────────┘  │
│  ┌──────────────┐ ┌──────────────────┐                          │
│  │ Annotation   │ │ DependencyEdge   │                          │
│  │ (创作注记)   │ │ (场景依赖图)     │                          │
│  └──────────────┘ └──────────────────┘                          │
└──────────────────────────────────────────────────────────────────┘
                           │ OpenAI Compatible API
┌──────────────────────────┴───────────────────────────────────────┐
│                    AI 推理层 (Mimo v2.5)                           │
│  · 模型: mimo-v2.5 / mimo-v2.5-pro / mimo-v2-flash               │
│  · 上下文: 32K-128K tokens                                       │
│  · 推理: 支持思维链 (Thinking Mode)                               │
│  · 输出: text / json_object                                       │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
用户上传小说 (.txt)
  │
  ├─→ [文本预处理] cleanText → splitChapters → chunkByChars → stats
  │
  ├─→ [一键流水线 POST /pipeline-stream]
  │     │
  │     ├─→ Agent 1 (剧情解构) → 大纲 + 时间线 + 冲突
  │     ├─→ Agent 2 (角色提取) → 结构化角色注册表
  │     ├─→ Agent 3 (场景规划) → 场景元数据列表
  │     └─→ Agent 4 (剧本撰写) → 逐场景生成 YAML 剧本
  │
  ├─→ [存入数据库] Novel → Character[] → Scene[] → Script[]
  │
  ├─→ [人工干预层]
  │     ├─→ 场景锁定 🔒 (保护已确认内容)
  │     ├─→ 创作注记 💬 (5 种类型标记)
  │     ├─→ 版本对比 📜 (行级 Diff)
  │     └─→ 手动编辑 ✏️ (版本链追加)
  │
  └─→ [导出] YAML 格式完整剧本文件
```

### 2.3 SSE 实时推送架构

```
Browser (fetch + ReadableStream)
  │ GET /api/novels/:id/pipeline-stream
  ▼
Express (text/event-stream, flushHeaders)
  │ onProgress callback → res.write(`data: ${JSON}\n\n`)
  ▼
ai.service (runAnalysisPipeline + runScriptGenerationPipeline)
  │ 每个 Agent 阶段触发 progress event
  ▼
Browser (TextDecoder 逐行解析)
  │ setState → PipelineProgress 组件更新
  ▼
5 步进度可视化 (📖→👤→🎬→✍️→💾)
```

---

## 3. 多 Agent 协作引擎

### 3.1 Agent 矩阵

| Agent | 中文名 | 输入 | 输出 | AI 配置 | 预估耗时 |
|:---|:---|:---|:---|:---|:---|
| **Agent 1** | 剧情解构者 | 小说全文 (≤15000字) | `{outline, timeline, conflicts}` | `thinking: true`, `json_object` | 15-30s |
| **Agent 2** | 角色图谱构建师 | 小说全文 | `{characters: [{name, aliases, roleType, traits}]}` | `thinking: true`, `json_object` | 15-30s |
| **Agent 3** | 场记统筹 | 原文 + 角色摘要 | `{scenes: [{sceneNum, location, timeOfDay, summary}]}` | `thinking: true`, `json_object` | 20-40s |
| **Agent 4** | 剧本主笔 | 场景信息 + 角色档案 | `{sceneNum, script: "YAML 格式剧本"}` | `responseFormat: json_object` | 15-30s/场景 |

### 3.2 Agent 编排流水线

```typescript
// 完整流水线入口
runAnalysisPipeline(content, onProgress?)    // Agent 1 + 2
  → runScriptGenerationPipeline(content, characters, onProgress?) // Agent 3 + 4
```

**流程控制**:
- Agent 1 和 Agent 2 并行执行，共享同一原文输入
- Agent 3 依赖 Agent 1 的输出（大纲）进行场景划分
- Agent 4 逐场景串行生成（每场景 15-30 秒），避免 API 限流
- 每个阶段通过 `onProgress` 回调推送 SSE 事件到前端

### 3.3 JSON 解析容错

`parseAIJson()` 实现了 5 层回退解析策略：

1. 直接 `JSON.parse` — 标准 JSON 响应
2. 提取 ` ```json ... ``` ` 代码块 — Markdown 包裹
3. 提取第一个 `{` 到最后一个 `}` — 含推理前缀的响应
4. 提取第一个 `[` 到最后一个 `]` — 数组格式响应
5. 抛出错误（含原始内容前 200 字，便于调试）

---

## 4. 数据库设计

### 4.1 ER 图（概念模型）

```
Novel (1) ────< (N) Character
  │
  ├──< (N) Scene (1) ────< (N) Script  [版本链: parentVersionId 自引用]
  │
  ├──< (N) Annotation  [多态: targetType + targetId]
  │
  └──< (N) DependencyEdge  [有向图: sourceSceneNum → targetSceneNum]
```

### 4.2 表结构定义

#### Novel（小说项目）

| 列 | 类型 | 默认值 | 说明 |
|:---|:---|:---|:---|
| `id` | UUID (PK) | `uuid()` | 主键 |
| `title` | String | — | 小说标题 |
| `content` | String | — | 原始文本（全文存储） |
| `status` | String | `"draft"` | 生命周期: `draft → analyzing → analyzed → completed` |
| `analysis` | String? | `null` | JSON: 剧情分析结果缓存 |
| `created_at` | DateTime | `now()` | 创建时间 |
| `updated_at` | DateTime | `updatedAt` | 更新时间 |

**状态机**:
```
draft ──→ analyzing ──→ analyzed ──→ completed
  ↑                      │
  └────── 失败回退 ──────┘
```

#### Character（角色）

| 列 | 类型 | 默认值 | 说明 |
|:---|:---|:---|:---|
| `id` | UUID (PK) | `uuid()` | 主键 |
| `novel_id` | UUID (FK→Novel) | — | 所属小说 |
| `name` | String | — | 角色姓名 |
| `aliases` | String | `"[]"` | JSON 数组: 别名列表 |
| `role_type` | String | — | 主角 / 配角 / 反派 / 路人 |
| `traits` | String | `"{}"` | JSON 对象: `{identity, personality[], goal, motivation, relationships[]}` |

#### Scene（场景）

| 列 | 类型 | 默认值 | 说明 |
|:---|:---|:---|:---|
| `id` | UUID (PK) | `uuid()` | 主键 |
| `novel_id` | UUID (FK→Novel) | — | 所属小说 |
| `scene_num` | Int | — | 场景编号（可手动调整） |
| `location` | String | — | 场景地点 |
| `time_of_day` | String | — | 日 / 夜 / 黄昏 / 黎明 / 清晨 / 下午 / 深夜 |
| `is_locked` | Boolean | `false` | 🔒 锁定标志（AI 重跑跳过） |
| `locked_by` | String? | `null` | 锁定人标识 |
| `current_version_id` | UUID? (FK→Script) | `null` | 当前活跃版本 |

#### Script（剧本 YAML）

| 列 | 类型 | 默认值 | 说明 |
|:---|:---|:---|:---|
| `id` | UUID (PK) | `uuid()` | 主键 |
| `scene_id` | UUID (FK→Scene) | — | 所属场景 |
| `yaml_content` | String | — | YAML 格式剧本内容 |
| `version` | Int | `1` | 版本号（递增） |
| `created_by` | String | `"system"` | 创建者: `"system"` (AI) / `"user"` (手动) |
| `parent_version_id` | UUID? (自引用 FK) | `null` | 版本链上一节点 |
| `created_at` | DateTime | `now()` | 创建时间 |

**版本链机制**:
```
v1 (system, parent=null) ← v2 (system, parent=v1) ← v3 (user, parent=v2)
                                                      ↑ 手动编辑触发
```
- **永不覆盖**: 所有变更都是 INSERT 新记录
- **审计完整**: `parentVersionId` 形成可追溯的版本 DAG
- **回滚即追加**: 回滚操作复制目标版本为新记录，不破坏历史

#### Annotation（创作注记）

| 列 | 类型 | 默认值 | 说明 |
|:---|:---|:---|:---|
| `id` | UUID (PK) | `uuid()` | 主键 |
| `novel_id` | UUID (FK→Novel) | — | 所属小说 |
| `target_type` | String | — | 注记目标: `"scene"` / `"character"` / `"line"` |
| `target_id` | String | — | 关联对象 ID |
| `content` | String | — | 注记内容 (Markdown) |
| `type` | String | `"note"` | 类型: `todo` / `question` / `inspiration` / `warning` / `note` |
| `resolved` | Boolean | `false` | 是否已解决 |
| `created_at` | DateTime | `now()` | 创建时间 |

#### DependencyEdge（场景依赖边）

| 列 | 类型 | 默认值 | 说明 |
|:---|:---|:---|:---|
| `id` | UUID (PK) | `uuid()` | 主键 |
| `novel_id` | UUID (FK→Novel) | — | 所属小说 |
| `source_scene_num` | Int | — | 源场景编号（有向边起点） |
| `target_scene_num` | Int | — | 目标场景编号（有向边终点） |
| `dependency_type` | String | — | 依赖类型: `character_continuity` / `causal_event` / `temporal` |
| `weight` | Float | `1.0` | 依赖强度 (0.0-1.0) |

### 4.3 索引策略（推荐生产环境添加）

```sql
CREATE INDEX idx_scene_novel ON scenes(novel_id, scene_num);
CREATE INDEX idx_script_scene ON scripts(scene_id, version DESC);
CREATE INDEX idx_annotation_novel ON annotations(novel_id, target_type);
CREATE INDEX idx_dep_edge_novel ON dependency_edges(novel_id);
CREATE INDEX idx_character_novel ON characters(novel_id);
```

---

## 5. API 接口参考

### 5.1 基础

| 方法 | 路径 | 说明 | 认证 |
|:---|:---|:---|:---|
| `GET` | `/api/health` | 健康检查 + DB 连接状态 | 无 |

### 5.2 小说 CRUD

| 方法 | 路径 | 请求体 / 参数 | 响应 |
|:---|:---|:---|:---|
| `GET` | `/api/novels` | — | `Novel[]` (含 `_count`) |
| `POST` | `/api/novels` | `{title, content}` 或 `multipart/form-data (file)` | `Novel + stats` |
| `GET` | `/api/novels/:id` | — | `Novel + characters + scenes + scripts` |
| `PUT` | `/api/novels/:id` | `{title?, content?}` | `Novel` |
| `DELETE` | `/api/novels/:id` | — | `{ok: true}` |

**上传模式**: 支持 JSON body 和 `multipart/form-data` 文件上传（`.txt`, `.md`, `.json`，最大 10MB）。

### 5.3 文本预处理

| 方法 | 路径 | 说明 |
|:---|:---|:---|
| `GET` | `/api/novels/:id/stats` | 文本统计（字数、行数、预估章节数、分块） |
| `POST` | `/api/novels/:id/process` | 重新清洗 + 分章节 |

### 5.4 AI 单步接口

| 方法 | 路径 | 请求体 | 对应 Agent |
|:---|:---|:---|:---|
| `POST` | `/api/ai/chat` | `{messages, model?, temperature?, maxTokens?, thinking?}` | 通用聊天 |
| `POST` | `/api/ai/analyze-plot` | `{content}` | Agent 1: 剧情解构 |
| `POST` | `/api/ai/analyze-characters` | `{content}` | Agent 2: 角色提取 |
| `POST` | `/api/ai/plan-scenes` | `{content, characters}` | Agent 3: 场景规划 |
| `POST` | `/api/ai/write-script` | `{scene, characters}` | Agent 4: 剧本撰写 |

### 5.5 编排流水线

| 方法 | 路径 | 说明 | 模式 |
|:---|:---|:---|:---|
| `POST` | `/api/novels/:id/analyze` | Agent 1+2: 分析小说 → 存角色 | 同步 |
| `POST` | `/api/novels/:id/generate-scripts` | Agent 3+4: 生成场景剧本（锁保护） | 同步 |
| `POST` | `/api/novels/:id/pipeline` | Agent 1→2→3→4 全流程（锁保护） | 同步 |
| `GET` | `/api/novels/:id/pipeline-stream` | 全流程 + SSE 实时进度推送 | **流式** |
| `POST` | `/api/novels/:id/incremental-pipeline` | `{sceneNums}` 仅重算指定场景 | 同步 |

### 5.6 场景 CRUD（人工干预）

| 方法 | 路径 | 请求体 | 说明 |
|:---|:---|:---|:---|
| `POST` | `/api/novels/:id/scenes` | `{sceneNum, location, timeOfDay, yamlContent?}` | 手动创建场景 |
| `PUT` | `/api/scenes/:id` | `{sceneNum?, location?, timeOfDay?}` | 更新场景元数据 |
| `DELETE` | `/api/scenes/:id` | `?force=true` | 删除场景（锁保护） |
| `GET` | `/api/novels/:id/scenes` | — | 获取小说场景列表 |

**错误码**:
- `409 Conflict` — sceneNum 重复
- `423 Locked` — 场景已锁定，需先解锁或用 `force=true`

### 5.7 剧本编辑（人工干预）

| 方法 | 路径 | 请求体 | 说明 |
|:---|:---|:---|:---|
| `PUT` | `/api/scripts/:id` | `{yamlContent}` | 编辑剧本 → 创建新版本 |

编辑逻辑：获取当前最新版本号 → `version+1` → INSERT 新 Script（`createdBy="user"`, `parentVersionId=当前版本`）→ 更新 `Scene.currentVersionId`。

### 5.8 锁定管理

| 方法 | 路径 | 说明 |
|:---|:---|:---|
| `PUT` | `/api/scenes/:id/lock` | 锁定场景 |
| `PUT` | `/api/scenes/:id/unlock` | 解锁场景 |

### 5.9 注记管理

| 方法 | 路径 | 请求体 | 说明 |
|:---|:---|:---|:---|
| `GET` | `/api/novels/:id/annotations` | — | 获取小说所有注记 |
| `POST` | `/api/annotations` | `{novelId, targetType, targetId, content, type?}` | 创建注记 |
| `PUT` | `/api/annotations/:id` | `{content?, type?, resolved?}` | 更新注记 |
| `DELETE` | `/api/annotations/:id` | — | 删除注记 |

### 5.10 版本管理

| 方法 | 路径 | 参数 | 说明 |
|:---|:---|:---|:---|
| `GET` | `/api/scenes/:id/versions` | — | 获取所有版本（按 version DESC） |
| `GET` | `/api/scenes/:id/versions/:versionId` | — | 获取特定版本内容 |
| `GET` | `/api/scenes/:id/diff` | `?v1=ID&v2=ID` | 两个版本行级 Diff |
| `POST` | `/api/scenes/:id/rollback` | `{targetVersionId}` | 回滚（追加新版本） |

### 5.11 依赖图谱

| 方法 | 路径 | 请求体 | 说明 |
|:---|:---|:---|:---|
| `POST` | `/api/novels/:id/build-deps` | — | AI 分析 + 构建依赖图 |
| `POST` | `/api/novels/:id/impact-analysis` | `{changedSceneNums: number[]}` | BFS 影响域分析 |

### 5.12 导出

| 方法 | 路径 | 说明 |
|:---|:---|:---|
| `GET` | `/api/novels/:id/export` | 导出完整 YAML 剧本文件（含 Content-Disposition 下载头） |

### 5.13 AI 聊天参数详情

```typescript
interface ChatRequest {
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  model?: string;           // 默认 "mimo-v2.5"
  temperature?: number;     // 默认 0.7 (0-1.5)
  maxTokens?: number;       // 默认 32768
  thinking?: boolean;       // 默认 false（关闭思维链）
  responseFormat?: "text" | "json_object";  // 默认 "text"
}

interface ChatResponse {
  content: string;          // AI 回复文本
  reasoning?: string;       // 思维链推理（thinking: true 时）
  usage: {
    completion_tokens: number;
    prompt_tokens: number;
    total_tokens: number;
    completion_tokens_details?: { reasoning_tokens: number };
    prompt_tokens_details?: { cached_tokens: number };
  };
  model: string;
}
```

---

## 6. 前端组件体系

### 6.1 组件树

```
layout.tsx (根布局)
└── page.tsx (首页 - 上传 + 小说列表)
    ├── NovelUpload (小说上传区域)
    └── NovelList (小说卡片列表)

novels/[id]/page.tsx (详情页 - 双栏工作台)
├── PipelineProgress (SSE 进度可视化 - 5 步指示器)
├── 操作按钮栏
│   ├── 🚀 一键生成 (分析 + 剧本)
│   ├── 📖 分析按钮 (AnalyzeButton)
│   ├── 🎬 生成场景剧本
│   ├── 🔗 构建依赖图
│   ├── ⚡ 增量重算
│   └── 📥 导出 YAML
├── Tab 导航 (5 个标签页)
│   ├── 📖 原文 → 原始小说文本展示
│   ├── 📊 剧情分析 → PlotOutline (大纲 + 时间线 + 冲突)
│   ├── 👥 角色 → CharacterCard[] (角色卡片网格)
│   ├── 🎬 场景 → 双栏布局:
│   │   ├── SceneList (场景选择列表)
│   │   │   ├── + 添加场景 (手动)
│   │   │   └── 场景卡片 × N
│   │   │       ├── 🔒/🔓 锁定按钮
│   │   │       ├── ⋮ 操作菜单 (编辑/删除)
│   │   │       └── 选中指示
│   │   └── ScriptViewer (剧本内容)
│   │       ├── 只读模式 (<pre>)
│   │       ├── ✏️ 编辑模式 (<textarea> + 保存)
│   │       └── 📜 版本历史按钮
│   └── 💬 注记 → AnnotationPanel
│       ├── 类型筛选栏
│       ├── 注记卡片列表
│       └── 新增注记表单
├── VersionHistory (版本时间轴 + Diff)
│   └── DiffViewer (双栏行级对比)
├── SceneEditor (创建/编辑场景弹窗)
├── ImpactDialog (增量重算影响确认)
└── AnnotationPanel (注记面板)
```

### 6.2 组件清单

| 组件 | 文件 | 类型 | Props 数 | 说明 |
|:---|:---|:---|:---|:---|
| **NovelUpload** | `NovelUpload.tsx` | 客户端 | 2 | 文件/文本上传，含拖拽支持 |
| **NovelList** | `NovelList.tsx` | 客户端 | 2 | 小说卡片网格，显示状态和统计 |
| **AnalyzeButton** | `AnalyzeButton.tsx` | 客户端 | 2 | 分步分析按钮，含状态管理 |
| **PlotOutline** | `PlotOutline.tsx` | 客户端 | 1 | 剧情大纲/时间线/冲突可视化 |
| **CharacterCard** | `CharacterCard.tsx` | 客户端 | 1 | 角色卡片：名称、身份、性格标签 |
| **SceneList** | `SceneList.tsx` | 客户端 | 8 | 场景列表 + 锁/编辑/删除操作 |
| **ScriptViewer** | `ScriptViewer.tsx` | 客户端 | 3 | 剧本阅读 + 编辑 + 版本入口 |
| **SceneEditor** | `SceneEditor.tsx` | 客户端 | 6 | 创建/编辑场景弹窗 |
| **PipelineProgress** | `PipelineProgress.tsx` | 客户端 | 7 | SSE 进度 5 步可视化 |
| **AnnotationPanel** | `AnnotationPanel.tsx` | 客户端 | 5 | 注记面板：筛选 + 列表 + 新增 |
| **VersionHistory** | `VersionHistory.tsx` | 客户端 | 4 | 版本时间轴 + Diff 选择器 |
| **DiffViewer** | `DiffViewer.tsx` | 客户端 | 1 | 双栏行级代码对比 |
| **ImpactDialog** | `ImpactDialog.tsx` | 客户端 | 4 | 增量重算影响确认弹窗 |

### 6.3 API 客户端函数清单

| 分类 | 函数 | 方法 |
|:---|:---|:---|
| 小说 | `getNovels`, `getNovel`, `createNovel`, `deleteNovel`, `getNovelStats`, `processNovel` | 6 |
| AI | `chatCompletion`, `analyzePlot`, `analyzeCharacters` | 3 |
| 场景 CRUD | `createScene`, `updateScene`, `deleteScene` | 3 |
| 剧本 | `updateScript` | 1 |
| 锁定 | `lockScene`, `unlockScene` | 2 |
| 注记 | `getAnnotations`, `createAnnotation`, `updateAnnotation`, `deleteAnnotation` | 4 |
| 版本 | `getSceneVersions`, `getSceneVersion`, `diffSceneVersions`, `rollbackScene` | 4 |
| 依赖 | `buildDeps`, `analyzeImpact`, `runIncrementalPipeline` | 3 |

---

## 7. 核心工作流

### 7.1 初次使用：全量生成流程

```
步骤 1: 上传小说
  → POST /api/novels (file) 或页面拖拽上传
  → 文本清洗: cleanText() 统一换行、去噪
  → 统计: 字数、行数、预估章节数
  → 入库 status="draft"

步骤 2: 一键生成 (推荐)
  → 点击 "🚀 一键生成"
  → GET /api/novels/:id/pipeline-stream (SSE)
  → 前端 PipelineProgress 实时展示:
     📖 剧情解构 [0-15%] → 👤 角色提取 [16-30%]
     → 🎬 场景规划 [31-50%] → ✍️ 剧本生成 [51-95%]
     → 💾 保存 [96-100%]
  → 完成: status="completed"

步骤 2 (备选): 分步操作
  → Agent 1+2: 点击 "📖 AI 分析" → 查看剧情大纲 + 角色列表
  → Agent 3+4: 点击 "🎬 生成场景剧本" → 查看场景 + 剧本

步骤 3: 审阅与干预
  → 浏览场景列表，点击场景查看剧本内容
  → 满意的场景 → 点击 🔒 锁定
  → 不满意的场景 → 添加 💬 注记
  → 需要手动修改 → 点击 ✏️ 编辑 → 修改 YAML → 保存新版本

步骤 4: 导出
  → 点击 "📥 导出 YAML" → 下载完整剧本文件
```

### 7.2 修改迭代：增量重算流程

```
前提: 已完成全量生成，部分场景已锁定

步骤 1: 构建依赖图
  → 点击 "🔗 构建依赖图"
  → AI 分析场景间因果/角色/时序依赖
  → 存入 dependency_edges 表

步骤 2: 修改触发
  → 手动编辑某个场景剧本
  → 或修改角色信息

步骤 3: 影响分析
  → 点击 "⚡ 增量重算"
  → BFS 遍历依赖图，计算受影响场景集合
  → 自动排除锁定场景
  → 弹出 ImpactDialog 确认

步骤 4: 确认重算
  → 仅重新生成受影响场景（Agent 4）
  → 锁定场景保持原样
  → 新剧本追加为新的 Script 版本
```

### 7.3 版本管理流程

```
步骤 1: 查看版本历史
  → 选中场景 → 点击 "📜 版本历史"
  → 垂直时间轴展示所有版本
  → 区分 AI 版本 (🤖 系统) 和手动版本 (👤 手动)

步骤 2: Diff 对比
  → 选择旧版本 (基准) 和新版本 (对比)
  → 点击 "对比"
  → 双栏行级对比: 绿色=新增, 红色=删除

步骤 3: 回滚
  → 点击非当前版本的 "🔄 恢复为此版本"
  → 系统复制目标版本内容为新版本（保留审计链）
  → 更新 Scene.currentVersionId
```

---

## 8. 内容安全与降级策略

### 8.1 问题背景

Mimo API 具有内容安全审核机制，包含暴力、冲突描写的中国网文可能触发 `content_filter` 拦截。

### 8.2 三层防御体系

```
第 1 层: chatCompletion() 层
  → 检测 finish_reason: "content_filter" | "sensitive"
  → 检测 content 文本: "rejected" + "high risk"
  → 抛出中文错误信息

第 2 层: parseAIJson() 层
  → 解析前预检安全拦截关键词
  → 抛出带建议的错误信息

第 3 层: runAnalysisPipeline() 降级策略
  → 主策略失败
  → 自动缩至 5000 字 + 关闭思维链 → 重试
  → 仍失败 → 抛出带 3 条建议的详细错误
```

### 8.3 推荐的温和测试文本特性

- 校园 / 都市 / 日常题材
- 字数 3000-8000 字
- 无暴力冲突描写
- 避免涉及政治、军事、凶杀等敏感主题

---

## 9. 环境配置与部署

### 9.1 环境变量

| 变量 | 默认值 | 必须 | 说明 |
|:---|:---|:---|:---|
| `PORT` | `4000` | 否 | 后端端口 |
| `DATABASE_URL` | `file:./dev.db` | 是 | 数据库连接串 |
| `MIMO_API_KEY` | — | **是** | Mimo API 密钥 |
| `MIMO_BASE_URL` | `https://api.xiaomimimo.com/v1` | 否 | API 地址 |
| `MIMO_MODEL` | `mimo-v2.5` | 否 | 默认模型 |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | 否 | 前端 API 地址 |

### 9.2 开发启动

```bash
# 终端 1: 后端
cd backend
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run dev          # → http://localhost:4000

# 终端 2: 前端
cd frontend
npm install
npm run dev          # → http://localhost:3000
```

### 9.3 生产部署建议

```bash
# 前端
cd frontend
npm run build        # 生成 .next 静态输出
npm run start        # 生产模式启动

# 后端
cd backend
# 切换 DATABASE_URL 到 PostgreSQL
npx prisma migrate deploy
npm run build        # tsc 编译
node dist/index.js   # 生产启动

# Docker (推荐)
docker compose up -d postgres
# 配置反向代理 Nginx → :3000 (前端) + :4000 (后端)
```

---

## 10. 项目结构全览

```
NovaScriptTool/
├── DEVELOPMENT.md                   # 本文档
├── README.md                        # 用户文档
├── docker-compose.yml               # PostgreSQL 容器
│
├── backend/
│   ├── package.json                 # 依赖: express, cors, multer, dotenv,
│   │                                #   @prisma/client, openai, diff, tsx
│   ├── tsconfig.json
│   ├── .env                         # 环境变量 (gitignore)
│   ├── .env.example                 # 环境变量模板
│   ├── uploads/                     # 上传文件目录
│   ├── prisma/
│   │   ├── schema.prisma            # 6 个数据模型
│   │   ├── migrations/              # 迁移历史
│   │   └── dev.db                   # SQLite 数据库文件
│   └── src/
│       ├── index.ts                 # API 路由入口 (26 个端点)
│       ├── seed.ts                  # 数据库种子脚本
│       ├── services/
│       │   ├── ai.service.ts        # Mimo 客户端 + 4 Agent + 流水线编排
│       │   ├── diff.service.ts      # YAML 行级 Diff 引擎
│       │   └── dependency.service.ts # 场景依赖图 + BFS 影响分析
│       └── utils/
│           └── text-processor.ts    # 文本清洗、分章、分块、统计
│
├── frontend/
│   ├── package.json                 # 依赖: next@14, react@18, tailwindcss@3
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── next.config.js
│   └── src/
│       ├── app/
│       │   ├── layout.tsx           # 根布局
│       │   ├── page.tsx             # 首页 (上传 + 列表)
│       │   ├── globals.css          # Tailwind 指令 + 自定义动画
│       │   └── novels/
│       │       └── [id]/
│       │           └── page.tsx     # 详情页 (双栏工作台核心)
│       ├── lib/
│       │   └── api.ts               # API 客户端 (类型 + 26 个函数)
│       └── components/
│           ├── NovelUpload.tsx       # 小说上传
│           ├── NovelList.tsx         # 小说列表
│           ├── AnalyzeButton.tsx     # 分步分析按钮
│           ├── PlotOutline.tsx       # 剧情大纲展示
│           ├── CharacterCard.tsx     # 角色卡片
│           ├── SceneList.tsx         # 场景列表 (锁 + 编辑 + 删除)
│           ├── ScriptViewer.tsx      # 剧本查看器 (读 + 编辑模式)
│           ├── SceneEditor.tsx       # 场景创建/编辑弹窗
│           ├── PipelineProgress.tsx  # SSE 进度可视化
│           ├── AnnotationPanel.tsx   # 注记面板
│           ├── VersionHistory.tsx    # 版本时间轴
│           ├── DiffViewer.tsx        # 双栏 Diff 对比
│           └── ImpactDialog.tsx      # 增量重算确认弹窗
│
└── .gitignore
```

---

## 11. 后续规划与优化清单

### 11.1 新功能（按优先级排序）

#### P0 — 核心体验闭环

- [ ] **YAML Schema 强校验输出**: 定义标准剧本 Schema（Zod 或 JSON Schema），在 Agent 4 输出后自动校验，不合格自动重试。确保导出文件可直接导入 Final Draft / Celtx 等专业编剧软件
- [ ] **小说分块上传与长文本优化**: 当前一次性上传全文。需要支持超过 50,000 字小说的智能分块：按章节拆分 → 逐章分析 → 全局一致性检查。建议实现滑动窗口上下文拼接策略
- [ ] **导出格式扩展**: 除 YAML 外，增加 PDF（带排版）、Final Draft XML (.fdx)、Celtx JSON 等专业格式导出

#### P1 — 分析深度增强

- [ ] **角色关系网络图可视化**: 用 D3.js / Cytoscape.js 绘制交互式角色关系图谱。节点=角色（大小=重要度），边=关系（颜色=关系类型），支持拖拽、缩放、筛选
- [ ] **情感曲线分析**: Agent 分析全剧情感走向，生成情感张力曲线图（横轴=场景/章节，纵轴=情绪强度），帮助编剧检查节奏
- [ ] **冲突类型统计**: 自动分类冲突类型（人物vs人物、人物vs环境、人物vs自我），饼图 + 场景标注
- [ ] **对白密度分析**: 统计每个场景的对白/动作比例，高亮对话过密或过疏的场景
- [ ] **角色出场频率热力图**: 横轴=场景，纵轴=角色，颜色深浅=出场时长/对白量，用于检查角色分配是否均衡

#### P2 — 协作与工程化

- [ ] **多人协作模式**: 基于 WebSocket 的实时协作编辑（类似 Google Docs），支持光标同步、编辑冲突检测、操作历史
- [ ] **用户认证系统**: JWT 登录 + 项目权限管理（Owner / Editor / Viewer），支持 OAuth（GitHub / Google）
- [ ] **项目模板系统**: 预置古装、都市、悬疑等类型模板，预设 Agent 参数（temperature、角色类型偏好等）
- [ ] **评论与审阅模式**: 剧本行内评论（类似 Google Docs 建议模式），支持 @提及、解决/未解决状态
- [ ] **剧本版本分支**: 支持从任意版本创建分支进行并行编辑，后续可合并或丢弃，类似 Git 分支模型

#### P3 — 体验与分发

- [ ] **黑暗模式**: 完整深色主题支持（适合长时间写作场景），Tailwind dark mode class strategy
- [ ] **键盘快捷键体系**: 完整的快捷键映射（保存 Ctrl+S、切换场景 J/K、锁定 Ctrl+L 等），含快捷键提示面板（? 键唤起）
- [ ] **国际化 (i18n)**: 英文界面支持，next-intl 方案
- [ ] **移动端适配**: 响应式布局优化，移动端可查看剧本和场景列表
- [ ] **Electron 桌面应用**: 打包为桌面端，支持离线编辑和本地文件系统集成

### 11.2 优化点（按类别排列）

#### 性能优化

- [ ] **Script 查询 N+1 优化**: 当前 `GET /api/novels/:id` 返回所有 Script 版本，场景多时数据量过大。建议：仅返回当前活跃版本（`currentVersionId`），版本历史按需懒加载
- [ ] **AI 请求并发控制**: Agent 4 当前串行逐场景生成。可改为小批量并发（每批 2-3 个场景），配合 API 限流（429 重试 + 退避）
- [ ] **数据库连接池**: 生产环境切换到 PostgreSQL 后配置 Prisma connection pool（`connection_limit=20`）
- [ ] **前端代码分割**: `next/dynamic` 懒加载非首屏组件（DiffViewer、VersionHistory、SceneEditor 等）
- [ ] **YAML 内容虚拟滚动**: 长剧本（>500 行）用 `react-window` 虚拟列表渲染，避免 textarea 性能问题

#### 可靠性优化

- [ ] **Agent 重试机制**: 当前仅安全拦截有降级策略。需要通用的指数退避重试（网络超时、429 限流、5xx 错误），最大重试 3 次
- [ ] **事务保护**: Scene + Script 创建应包裹在 Prisma 事务中（`prisma.$transaction`），防止部分写入
- [ ] **请求超时控制**: 长流水线需设置合理的超时时间（当前默认无限等待），建议 5 分钟后端超时 + 前端心跳检测
- [ ] **数据备份**: 定期自动导出 SQLite 备份（或 PostgreSQL pg_dump），支持一键恢复
- [ ] **错误边界**: React Error Boundary 包裹各功能区块，局部错误不影响整个页面

#### 代码质量

- [ ] **后端路由拆分**: `index.ts` 当前 1167 行，应拆分为独立路由文件（`routes/novels.ts`, `routes/scenes.ts`, `routes/ai.ts` 等）
- [ ] **输入校验层**: 引入 Zod 对所有 API 请求体进行 Schema 校验，替代当前手动 `if` 检查
- [ ] **API 响应类型统一**: 定义标准响应格式 `{ success: boolean; data?: T; error?: string }`，替代当前混用格式
- [ ] **前端状态管理**: 当前详情页 20+ 个 `useState`，应抽取为 `useReducer` 或自定义 Hook（`useNovelDetail`）
- [ ] **单元测试**: 使用 Vitest + React Testing Library 覆盖核心逻辑（文本处理、JSON 解析、Diff 引擎、组件渲染）
- [ ] **E2E 测试**: Playwright 覆盖关键用户路径（上传→分析→生成→编辑→导出）

#### 安全加固

- [ ] **API 限流**: 添加 express-rate-limit，AI 接口 10 req/min，普通接口 100 req/min
- [ ] **文件上传安全**: 校验文件 MIME 类型（不仅是扩展名），限制单个 IP 上传频率，病毒扫描
- [ ] **CORS 白名单**: 生产环境限制 CORS origin 为前端域名，当前为 `*`
- [ ] **请求体大小限制**: JSON body 限制 5MB（已实现），增加字段长度校验（title 限制 200 字符等）
- [ ] **Helmet 安全头**: 生产环境添加 helmet 中间件（CSP、X-Frame-Options、HSTS 等）

#### 可观测性

- [ ] **结构化日志**: 引入 pino 或 winston，JSON 格式输出，区分 info / warn / error 级别
- [ ] **请求追踪 ID**: 每个请求生成 UUID trace-id，贯穿前后端日志，方便问题定位
- [ ] **AI 调用计量**: 统计每次 Agent 调用的 token 消耗、耗时、成功率，Dashboard 展示
- [ ] **错误监控**: 集成 Sentry 捕获前后端异常，含堆栈和上下文
- [ ] **健康检查增强**: `/api/health` 增加 AI API 连通性检测和数据库延迟指标

---

<div align="center">
  <sub>NovaScriptTool v1.2.0 · Built with ❤️ for creators</sub>
</div>

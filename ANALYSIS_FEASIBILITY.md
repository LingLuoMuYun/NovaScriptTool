# P1 分析深度增强 — 可行性分析与实施方案

> 本文档对 NovaScriptTool 路线图中 P1 "分析深度增强"的 5 个子功能进行技术可行性评估，包含数据就绪度分析、实施路径、技术选型和工时预估。供开发决策参考。

---

## 总览：数据就绪度 vs 实现收益

```
                    AI成本
                      ↑
            高  ○ 情感曲线(AI方案)

                ○ 情感曲线(规则方案)
            中
                ○ 角色热力图    ○ 角色关系图
            低  ○ 对白密度
                ○ 冲突统计(零成本!)
                ─────────────────────→ 现有数据完备度
            低      中      高
```

| # | 功能 | 现有数据完备度 | 需新增AI | 实现复杂度 | 推荐优先级 |
|:---|:---|:---|:---|:---|:---|
| 1 | 冲突类型统计 | ✅ 100% (已有) | 否 | ⭐ 极低 | 🥇 P0 |
| 2 | 对白密度分析 | ✅ 90% (需解析) | 否 | ⭐⭐ 低 | 🥈 P1 |
| 3 | 角色关系网络图 | ✅ 80% (需补充) | 可选 | ⭐⭐⭐ 中 | 🥉 P1 |
| 4 | 角色出场频率热力图 | ✅ 70% (需解析) | 否 | ⭐⭐ 低 | 4️⃣ P2 |
| 5 | 情感曲线分析 | ❌ 30% (需新建) | 是 | ⭐⭐⭐⭐ 高 | 5️⃣ P2 |

> **关键发现**：5 个功能中 3 个**无需新增 AI 调用**，可直接利用现有数据分析。冲突类型统计更是数据完全就绪，纯前端改动即可完成。

---

## 功能 1: 冲突类型统计 🥇

### 数据来源（完全就绪）

Agent 1 已提取冲突数据，存储在 `Novel.analysis` JSON 中：

```json
{
  "conflicts": [
    { "type": "人物冲突", "description": "主角与反派在学院门口对峙", "parties": ["林风", "赵雷"] },
    { "type": "环境冲突", "description": "暴雨导致代码比赛中断", "parties": ["林风"] },
    { "type": "内部冲突", "description": "林风在胜负与友谊间挣扎", "parties": ["林风"] }
  ]
}
```

PlotOutline 组件已渲染冲突卡片，但缺少：
- 按类型聚合的统计数字
- 可视化图表
- 角色冲突频次排名

### 实施方案

**纯前端实现**（零后端改动，零 AI 成本）：

1. 安装 `recharts` 图表库
2. 新建 `ConflictChart.tsx` 组件：
   - **饼图**：冲突类型分布（5 种标准分类）
   - **柱状图**：角色冲突频次排名（Top 5）
3. 扩展 `PlotOutline.tsx`，在冲突区块底部嵌入图表
4. **类型归一化映射**（Agent 输出的 type 文本不标准时使用）：

| AI 原始输出 | 归一化到 |
|:---|:---|
| `人物冲突` / `角色冲突` / `人对人` / `interpersonal` | **人物 vs 人物** |
| `环境冲突` / `外部冲突` / `人对环境` / `external` | **人物 vs 环境** |
| `内部冲突` / `心理冲突` / `人对自我` / `internal` | **人物 vs 自我** |
| `社会冲突` / `制度冲突` / `social` | **人物 vs 社会** |
| 其他 / 无法识别 | **其他** |

### 改动清单

| 文件 | 操作 | 说明 |
|:---|:---|:---|
| `frontend/package.json` | 新增依赖 | `recharts` |
| `frontend/src/components/ConflictChart.tsx` | **新建** | 冲突统计图表组件（~120行） |
| `frontend/src/components/PlotOutline.tsx` | 扩展 | 冲突区块底部嵌入 `<ConflictChart>` |

### 预估工时：2-3 小时

---

## 功能 2: 对白密度分析 🥈

### 数据来源（需解析）

每个场景的 Script 表 `yaml_content` 包含结构化剧本。AI 生成的格式如下：

```yaml
dialogue:
  - character: "林风"
    line: "我决定参加比赛。"
    emotion: "坚定"
  - character: "苏婉"
    line: "我支持你。"
    emotion: "温柔"

action:
  - "林风站起身，走向窗边，目光坚定"
  - "窗外雨声淅沥，教室灯光昏黄"
```

### 实施方案

**后端新增 1 个 API** + **前端 1 个新组件**：

#### 后端: `GET /api/novels/:id/dialogue-density`

```typescript
// 对每个场景的 yaml_content 进行正则解析:
// 1. 提取 dialogue: 块 → 统计对白行数
// 2. 提取 action: 块 → 统计动作行数
// 3. 计算 density = dialogueLines / (dialogueLines + actionLines) * 100

// 返回结构:
[{
  sceneNum: 1,
  location: "星海学院 - 教学楼大厅",
  dialogueLines: 14,
  actionLines: 6,
  density: 70  // 百分比
}]
```

**容错处理**（3 级回退）：
1. 正则 `/^dialogue:\n([\s\S]*?)(?=^action:|^[a-z]+:|\Z)/m` — 标准 YAML
2. 关键词匹配 `/character:\s*"[^"]*"\s*\n\s*line:\s*"/` — 识别对白
3. 无剧本场景 → `density: null`，前端显示"无数据"

#### 前端: `DialogueDensity.tsx`（新建）

- **柱状图**（Recharts BarChart），每场景一根柱子
- X 轴 = 场景编号 + 地点简称（hover 显示完整信息）
- Y 轴 = 对白密度 (0-100%)
- **颜色梯度自动判定**：

| 密度范围 | 含义 | 颜色 | 建议 |
|:---|:---|:---|:---|
| 0-30% | 动作主导 | 蓝色 | 适合动作戏 / 追逐 / 战斗 |
| 30-60% | 均衡 | 绿色 | ✅ 理想的对白-动作平衡 |
| 60-85% | 对话为主 | 黄色 | 适合文戏 / 情感对话 |
| 85-100% | 过于密集 | 红色 ⚠️ | 建议添加动作指示打破节奏 |

- **顶部统计卡片**：平均密度、最高密度场景、最低密度场景
- **点击柱子** → 切换到对应场景的剧本视图

### 改动清单

| 文件 | 操作 | 说明 |
|:---|:---|:---|
| `backend/src/index.ts` | 新增 1 个路由 | `GET /api/novels/:id/dialogue-density` |
| `frontend/src/lib/api.ts` | 新增类型 + 函数 | `DialogueDensityItem`, `getDialogueDensity()` |
| `frontend/src/components/DialogueDensity.tsx` | **新建** | 对白密度柱状图（~150行） |
| `frontend/src/app/novels/[id]/page.tsx` | 扩展 | 📊 分析 Tab 集成 |

### 预估工时：4-5 小时

---

## 功能 3: 角色关系网络图 🥉

### 数据来源（基本就绪，建议增强）

**现有数据**：Agent 2 在每个角色的 `traits` JSON 中提取了 `relationships` 数组：

```json
// 林风的 traits
{ "relationships": [
  { "with": "苏婉", "relation": "队友兼暗恋对象" },
  { "with": "赵雷", "relation": "竞争对手" }
]}

// 苏婉的 traits
{ "relationships": [
  { "with": "林风", "relation": "队友" }
]}
```

**数据质量问题**：
- ⚠️ 关系是单向存储的（A 记录了与 B 的关系，但 B 可能未记录与 A 的关系）
- ⚠️ Agent 2 仅在 15000 字截断文本上分析，可能遗漏后期角色关系
- ⚠️ 关系描述文本不统一（"队友兼暗恋对象" vs "队友"）

### 实施方案

#### 阶段 1 (MVP): 纯现有数据，智能合并

**后端**: `GET /api/novels/:id/relationship-graph`

```typescript
// 数据处理逻辑:
1. 获取小说所有 Character
2. 解析每个 Character 的 traits.relationships
3. 双向关系合并:
   - A→B ("队友兼暗恋对象") + B→A ("队友")
   - → 合并为单条边: relation = "队友 / 暗恋对象"（取并集）
4. 去重（同一对角色仅保留一条边）
5. 构建图数据:
   {
     nodes: [{ id, name, roleType, group, importance }],
     edges: [{ source, target, relation, weight, type }]
   }
```

**节点重要度计算**：
```typescript
importance = roleType === "主角" ? 3 : roleType === "反派" ? 2.5 : 1
// 用于决定节点大小
```

**前端**: `RelationshipGraph.tsx`（新建）

推荐 **Cytoscape.js** + `react-cytoscapejs`：

> 选择理由：Cytoscape.js 专为图可视化设计，内置 10+ 种布局算法（力导向、圆形、网格、分层等），比 D3.js 的图布局更成熟易用。

**交互设计**：
- **节点大小** = 角色重要度（主角最大，路人最小）
- **节点颜色** = 角色类型（主角=金色 `#F59E0B`、反派=红色 `#EF4444`、配角=蓝色 `#6366F1`、路人=灰色 `#9CA3AF`）
- **边标签** = 关系描述文本
- **边粗细** = 关系强度（weight: 0-1）
- **边样式** = 关系类型（实线=正向、虚线=对立、点线=未知）
- **点击节点** → 高亮该角色的所有关系 → 右侧弹出 CharacterCard 详情
- **底部工具栏**：图例说明 + 布局切换按钮（力导向 / 圆形 / 网格）
- **支持操作**：拖拽节点、滚轮缩放、框选

#### 阶段 2 (增强): Agent 2.5 AI 补充关系分析

如果 MVP 上线后发现现有关系数据不够完整，可新增轻量 AI 调用：

```typescript
// Agent 2.5: 关系图谱增强
// 输入: 所有角色的 {name, identity, personality} + 原文前 8000 字
// 输出: 完整的有向关系图:
{
  "relationships": [
    { "from": "林风", "to": "苏婉", "type": "友情/暗恋", "strength": 0.9, "evidence": "多次共同参赛" },
    { "from": "林风", "to": "赵雷", "type": "竞争", "strength": 0.7, "evidence": "比赛对决" }
  ]
}
// 成本: 1 次 LLM 调用（thinking: false, maxTokens: 4096, 约 2-3 秒）
```

**建议先做 MVP，根据实际数据质量决定是否需要阶段 2。**

### 改动清单

| 文件 | 操作 | 说明 |
|:---|:---|:---|
| `backend/src/index.ts` | 新增 1 个路由 | `GET /api/novels/:id/relationship-graph` |
| `frontend/package.json` | 新增依赖 | `cytoscape`, `react-cytoscapejs`, `@types/cytoscape` |
| `frontend/src/lib/api.ts` | 新增类型 + 函数 | `GraphData`, `getRelationshipGraph()` |
| `frontend/src/components/RelationshipGraph.tsx` | **新建** | 交互式关系网络图（~200行） |
| `frontend/src/app/novels/[id]/page.tsx` | 扩展 | 📊 分析 Tab 集成 |

### 预估工时：6-8 小时 (MVP)

---

## 功能 4: 角色出场频率热力图 4️⃣

### 数据来源（需解析）

- Script 表 `yaml_content` 中 `dialogue` 段的 `character` 字段
- Agent 3 的 `characterIds` 用于验证
- Character 表提供完整角色列表

### 实施方案

**后端**: `GET /api/novels/:id/character-heatmap`

```typescript
// 解析逻辑:
1. 获取所有 Character 和所有 Scene (含当前版本 Script)
2. 对每个场景的 yaml_content:
   a. 正则提取 dialogue 中的 character 名（去重）
   b. 统计每个角色的对白行数
   c. 统计每个角色在 action 中被提及的次数
3. 构建出场矩阵:
   rows = 角色列表（按 roleType + 总出场次数排序）
   cols = 场景列表（按 sceneNum 排序）
   values = 出场强度 (0-100)

// 出场强度计算:
intensity = min(100, dialogueMentions * 15 + actionMentions * 8)
// 每句对白 = 15 分，每次动作提及 = 8 分

// 返回:
{
  characters: [{ name, roleType, totalIntensity }],
  scenes: [{ sceneNum, location, totalIntensity }],
  matrix: number[][]  // matrix[charIndex][sceneIndex] = intensity
}
```

**前端**: `CharacterHeatmap.tsx`（新建）

推荐使用**手写 CSS Grid**（不引入额外依赖）：

```
             场景1      场景2      场景3  ...  场景N
           大厅入口   教室走廊   天台对决
林风(主角)  ████       ██        ████████
苏婉(配角)  ██         ████████  ████
赵雷(反派)             ██        ██████
...
```

**颜色映射**：
| 强度 | 背景色 | 含义 |
|:---|:---|:---|
| 0 | `bg-white` | 未出场 |
| 1-25 | `bg-green-100` → `bg-green-200` | 少量出场 |
| 26-50 | `bg-green-300` → `bg-green-400` | 中等出场 |
| 51-75 | `bg-green-500` → `bg-green-600` | 较多对白 |
| 76-100 | `bg-green-700` → `bg-green-800` | 核心角色 |

**交互**：
- Hover 单元格 → Tooltip: "林风 在场景3 天台对决: 18句对白, 5次出场 (强度: 85)"
- 点击行 → 高亮该角色所有出场场景
- 点击列 → 切换到对应场景的剧本视图
- 顶部下拉筛选：按角色类型过滤（全部 / 主角 / 配角 / 反派）

### 改动清单

| 文件 | 操作 | 说明 |
|:---|:---|:---|
| `backend/src/index.ts` | 新增 1 个路由 | `GET /api/novels/:id/character-heatmap` |
| `frontend/src/lib/api.ts` | 新增类型 + 函数 | `HeatmapData`, `getCharacterHeatmap()` |
| `frontend/src/components/CharacterHeatmap.tsx` | **新建** | 热力图网格组件（~180行） |
| `frontend/src/app/novels/[id]/page.tsx` | 扩展 | 📊 分析 Tab 集成 |

### 预估工时：4-5 小时

---

## 功能 5: 情感曲线分析 5️⃣

### 数据来源（缺口最大）

当前系统**没有情感维度的数据**。需要新增分析能力，这是唯一需要 AI 支持的功能。

### 方案对比

| | 方案 A: 规则引擎 | 方案 B: AI Agent | 方案 C: 混合（推荐） |
|:---|:---|:---|:---|
| **原理** | 中文情感词典匹配 | LLM 逐场景分析 | 规则初筛 + AI 确认关键点 |
| **准确度** | ⭐⭐ 中等 | ⭐⭐⭐⭐ 较高 | ⭐⭐⭐ 中上 |
| **AI 成本** | 0 | N 次调用 (N=场景数) | 1 次调用 |
| **实现复杂度** | ⭐⭐ 低 | ⭐⭐⭐⭐ 高 | ⭐⭐⭐ 中 |
| **新增文件** | 2 个 | 1 个 | 2 个 |
| **工时** | 3-4 小时 | 8-12 小时 | 6-8 小时 |

### 推荐路径: 方案 A (规则引擎 MVP) → 方案 C (混合增强)

#### 阶段 1 (MVP): 规则引擎

**新建** `backend/src/services/emotion.service.ts`：

```typescript
// 情感词典（后续可扩展为完整中文情感词典）
const EMOTION_LEXICON = {
  positive: ['笑', '喜', '乐', '温暖', '幸福', '希望', '坚定', '拥抱',
             '胜利', '成功', '爱', '信任', '感动', '释然', '平静'],
  negative: ['怒', '悲', '哭', '恐惧', '绝望', '痛苦', '颤抖', '失败',
             '恨', '死', '黑暗', '背叛', '孤独', '后悔', '压抑'],
  tension:  ['突然', '猛然', '危险', '紧急', '阻止', '冲突', '对抗',
             '威胁', '屏息', '紧张', '犹豫', '挣扎'],
};

// 情感强度计算（每场景独立分析）
function analyzeSceneEmotion(yamlContent: string): {
  sceneNum: number;
  positive: number;   // 正面情感强度 0-100
  negative: number;   // 负面情感强度 0-100
  tension: number;    // 紧张感强度 0-100
  dominant: 'positive' | 'negative' | 'tension' | 'neutral';
} {
  // 1. 提取 dialogue 和 action 文本
  // 2. 逐行扫描，匹配情感词典
  // 3. 加权计算（dialogue 权重 1.2 > action 权重 0.8）
  // 4. 归一化到 0-100
  // 5. 判定主导情感
}
```

**前端**: `EmotionCurve.tsx`（新建）

- **折线图**（Recharts LineChart），3 条曲线
- X 轴 = 场景编号
- Y 轴 = 情感强度 (0-100)
- 曲线颜色：
  - 🟢 正面情感 (绿色)
  - 🔴 负面情感 (红色)
  - 🟠 紧张感 (橙色)
- **情感转折点标注**：正负情感交叉的场景点用虚线标记
- **背景色带**：正面主导场景 = 浅绿背景、负面主导 = 浅红背景
- Hover 数据点 → Tooltip 显示三条线的具体数值 + 主导情感 + 关键台词

#### 阶段 2 (增强): 混合策略

```
规则引擎初筛所有场景
  → 识别情感转折点（正↔负切换的场景）
  → 仅对转折点场景（通常 3-5 个）调用 AI 确认
  → AI 输出: { 准确的情感标签, 关键转折原因 }
  → 用 AI 结果校准整条曲线
```

### 改动清单 (MVP)

| 文件 | 操作 | 说明 |
|:---|:---|:---|
| `backend/src/services/emotion.service.ts` | **新建** | 情感分析引擎（词典 + 加权算法，~120行） |
| `backend/src/index.ts` | 新增 1 个路由 | `GET /api/novels/:id/emotion-curve` |
| `frontend/src/lib/api.ts` | 新增类型 + 函数 | `EmotionPoint`, `getEmotionCurve()` |
| `frontend/src/components/EmotionCurve.tsx` | **新建** | 情感曲线折线图（~150行） |
| `frontend/src/app/novels/[id]/page.tsx` | 扩展 | 📊 分析 Tab 集成 |

### 预估工时：3-4 小时 (MVP)

---

## 整体架构建议：统一分析面板

当前 5 个分析功能各自独立，建议整合为统一的 **"📊 分析" Tab**。

### Dashboard 布局

```
┌──────────────────────────────────────────────────┐
│ 📊 分析面板                        [导出报告]    │
├──────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ 总场景数  │ │ 总角色数  │ │ 冲突类型  │         │
│  │   42     │ │   18    │ │  5 种    │         │
│  └──────────┘ └──────────┘ └──────────┘         │
│                                                  │
│  ┌──────────────────┐ ┌────────────────────┐     │
│  │ 📊 冲突类型分布   │ │ 💬 对白密度分析    │     │
│  │   (饼图)         │ │   (柱状图)         │     │
│  └──────────────────┘ └────────────────────┘     │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │ 🔗 角色关系网络图 (全宽)                  │    │
│  │   (力导向图, 可交互)                      │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  ┌──────────────────┐ ┌────────────────────┐     │
│  │ 🔥 角色出场热力图 │ │ 📈 情感曲线        │     │
│  │   (CSS Grid)    │ │   (折线图)         │     │
│  └──────────────────┘ └────────────────────┘     │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │ 📖 剧情大纲（现有 PlotOutline，折叠式）   │    │
│  └──────────────────────────────────────────┘    │
└──────────────────────────────────────────────────┘
```

### Tab 结构更新

将当前 5 个 Tab 调整为 5 个（用"📊 分析"替代独立的"📖 剧情分析"）：

```
📖 原文 | 📊 分析 Dashboard | 👥 角色 | 🎬 场景 | 💬 注记
         ↑
    整合所有分析图表
```

### 技术选型

| 需求 | 推荐库 | 包大小 | 说明 |
|:---|:---|:---|:---|
| 通用图表 | **Recharts** | ~150KB gzip | 饼图 / 柱状图 / 折线图 / 面积图 |
| 关系图 | **Cytoscape.js** | ~250KB gzip | 力导向图 / 节点交互 / 布局算法 |
| 热力图 | **手写 CSS Grid** | 0 | 无需额外依赖 |
| 图数据处理 | 后端 API 层 | 0 | 预处理后返回，前端直接渲染 |

> ⚠️ **单一图表库原则**：Recharts 覆盖 80% 图表需求，Cytoscape.js 仅用于关系图（且做 `next/dynamic` 懒加载），热力图手写 CSS。总增量 < 400KB gzip。

### 懒加载策略（不影响首屏）

```typescript
// page.tsx
const RelationshipGraph = dynamic(() => import('@/components/RelationshipGraph'), { ssr: false });
const DialogueDensity = dynamic(() => import('@/components/DialogueDensity'), { ssr: false });
const CharacterHeatmap = dynamic(() => import('@/components/CharacterHeatmap'), { ssr: false });
const EmotionCurve = dynamic(() => import('@/components/EmotionCurve'), { ssr: false });
```

---

## 推荐执行路线

### Week 1: 快速见效（总工时 12-15h）

```
Day 1-2: 冲突类型统计 [2h] + 对白密度分析 [4h]
  → 安装 Recharts
  → 新建 ConflictChart + DialogueDensity
  → 新增 1 个 API: /dialogue-density
  → 📊 分析 Tab 初见雏形

Day 3-4: 角色关系网络图 MVP [7h]
  → 安装 Cytoscape.js
  → 新增 1 个 API: /relationship-graph
  → 新建 RelationshipGraph 交互式组件
  → 📊 分析 Tab 增加全宽关系图
```

### Week 2: 深度增强（总工时 12-14h）

```
Day 1-2: 角色出场频率热力图 [4h]
  → 新增 1 个 API: /character-heatmap
  → 新建 CharacterHeatmap CSS Grid 组件

Day 3-4: 情感曲线 MVP [4h]
  → 新建 emotion.service.ts
  → 新增 1 个 API: /emotion-curve
  → 新建 EmotionCurve 折线图组件

Day 5: Dashboard 整合 [3h]
  → Tab 结构重构（📊 分析替代 📖 剧情分析）
  → 懒加载优化（next/dynamic）
  → 响应式布局适配
```

---

## 风险评估

| 风险 | 影响 | 概率 | 缓解措施 |
|:---|:---|:---|:---|
| YAML 格式不一致导致解析失败 | 对白密度/热力图数据不准 | 中 | 3 级回退解析（标准YAML→关键词匹配→默认值） |
| Agent 2 关系提取不完整 | 关系图数据稀疏、边太少 | 高 | 先 MVP 评估质量，必要时启用 Agent 2.5 补充 |
| 情感词典覆盖不足 | 情感曲线与实际偏差 | 中 | 词典设计为可扩展文件，后续可持续补充 |
| Cytoscape.js 包体积影响首屏 | Lighthouse 评分下降 | 低 | `next/dynamic` + `ssr: false`，仅"📊 分析" Tab 激活时加载 |
| 大量场景(>50)时图表渲染卡顿 | 用户体验差 | 低 | 柱状图采用数据采样；热力图使用 CSS 而非 Canvas |

---

## 验证方法

| 功能 | 验证步骤 | 预期结果 |
|:---|:---|:---|
| **冲突类型统计** | 上传测试小说 → 运行分析 → 切换到 📊 分析 Tab | 饼图正确显示冲突类型分布，柱状图显示角色冲突排名 |
| **对白密度分析** | 生成剧本 → 进入 📊 分析 Tab → 查看柱状图 | 动作场景为蓝色(低密度)，对话场景为黄/红色(高密度) |
| **角色关系图** | 切换到 📊 分析 Tab → 查看关系图 | 角色间有正确连线，可拖拽节点，点击高亮关系 |
| **角色热力图** | 滚动到热力图区域 | 网格颜色反映出场强度，主角颜色最深 |
| **情感曲线** | 滚动到情感曲线区域 | 折线图随场景有起伏，正负转折点可见 |

---

## 依赖关系图

```
                    ┌─────────────┐
                    │  Recharts   │ ← 所有图表功能的公共依赖
                    └──────┬──────┘
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌────────────┐  ┌────────────┐  ┌────────────┐
    │ 冲突统计    │  │ 对白密度    │  │ 情感曲线    │
    │ (纯前端)   │  │ (+1 API)   │  │ (+1 Service)│
    └────────────┘  └────────────┘  └────────────┘

    ┌────────────┐  ┌────────────┐
    │ 关系网络图  │  │ 角色热力图  │
    │ Cytoscape  │  │ CSS Grid   │
    │ (+1 API)   │  │ (+1 API)   │
    └────────────┘  └────────────┘
```

> **无功能间依赖**：5 个功能可完全独立开发，互不阻塞。冲突统计甚至不需要后端改动。

---

## 附录: 图表库对比

| 库 | 包大小 | React 支持 | 图类型 | 学习曲线 | 推荐场景 |
|:---|:---|:---|:---|:---|:---|
| **Recharts** ⭐ | 150KB | 一等公民 | 饼/柱/线/面/雷达 | 低 | 通用图表 |
| Chart.js | 200KB | react-chartjs-2 | 饼/柱/线/气泡 | 低 | 快速出图 |
| Nivo | 300KB+ | 一等公民 | 饼/柱/线/热力/网络 | 中 | 高级交互 |
| ECharts | 1MB | echarts-for-react | 全类型 | 中 | 中国式图表 |
| **Cytoscape.js** ⭐ | 250KB | react-cytoscapejs | 图/网络 | 中 | 关系网络 |
| D3.js | 250KB | 需手动封装 | 无限可能 | 高 | 完全自定义 |

> 推荐：Recharts（通用图表）+ Cytoscape.js（关系图），总包体积增量 < 400KB。

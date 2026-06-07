# YAML 剧本 Schema 定义与设计说明

> **版本**: 1.0  
> **最后更新**: 2026-06-07  
> **适用范围**: NovaScriptTool `GET /api/novels/:id/export?format=yaml` 导出产物  
> **目标读者**: 编剧/创作者（前半部分）+ 系统开发者/维护者（后半部分）

---

## 目录

- [一、Schema 概览](#一schema-概览)
- [二、终端用户手册](#二终端用户手册)
  - [2.1 文件整体结构](#21-文件整体结构)
  - [2.2 顶层字段](#22-顶层字段)
  - [2.3 场景对象 `scenes[]`](#23-场景对象-scenes)
  - [2.4 内容块 `content[]`](#24-内容块-content)
  - [2.5 与导出格式的对应关系](#25-与导出格式的对应关系)
  - [2.6 完整示例](#26-完整示例)
- [三、设计原因](#三设计原因)
  - [3.1 为什么采用结构化 YAML](#31-为什么采用结构化-yaml)
  - [3.2 为什么是三种内容块](#32-为什么是三种内容块)
  - [3.3 为什么使用 `type` 判别联合](#33-为什么使用-type-判别联合)
  - [3.4 为什么强制 transition 结尾](#34-为什么强制-transition-结尾)
  - [3.5 为什么分离 `charactersInScene` 与 `content`](#35-为什么分离-charactersinscene-与-content)
  - [3.6 其他字段设计决策](#36-其他字段设计决策)
- [四、开发者参考](#四开发者参考)
  - [4.1 内部 JSON 存储 vs YAML 导出](#41-内部-json-存储-vs-yaml-导出)
  - [4.2 Zod Schema 定义](#42-zod-schema-定义)
  - [4.3 字段映射表](#43-字段映射表)
  - [4.4 校验体系](#44-校验体系)
  - [4.5 导出管道](#45-导出管道)
  - [4.6 旧格式兼容](#46-旧格式兼容)

---

## 一、Schema 概览

NovaScriptTool 生成的剧本遵循一套**严格的结构化 Schema**。这套 Schema 定义了剧本数据的字段名称、类型、取值范围和嵌套关系，是整个系统数据流的“契约”——AI 生成时必须遵守，导出时据此转换，校验时以此为基准。

一个合法的剧本文件在逻辑上由三层组成：

```
剧本 (Script)
 ├── 元数据: 标题、生成时间
 └── 场景数组 (scenes[])
      ├── 场景元数据: 编号、地点、时间、室内/外、出场角色
      └── 内容块数组 (content[])
           ├── ActionBlock   → 动作/画面描述
           ├── DialogueBlock → 角色对白
           └── TransitionBlock → 转场指令
```

---

## 二、终端用户手册

### 2.1 文件整体结构

导出的 YAML 文件具有以下宏观结构：

```yaml
# ==========================================
# 剧本: 《小说标题》
# 生成时间: 2026-06-07T12:00:00.000Z
# 场景总数: 12
# ==========================================

title: 小说标题
scenes:
  - number: 1
    location: ...
    ...
  - number: 2
    ...
```

- 文件以**注释头**开头（4 行 `#`），包含标题、生成时间和场景总数，方便人工浏览
- `title` 为小说/剧本名称
- `scenes` 是场景对象的 YAML 数组，按场景编号升序排列

### 2.2 顶层字段

| 字段 | 类型 | 必需 | 说明 |
|:---|:---|:---|:---|
| `title` | `string` | 是 | 剧本标题，对应小说的标题 |
| `scenes` | `Scene[]` | 是 | 场景数组，至少包含 1 个场景 |

### 2.3 场景对象 `scenes[]`

每个场景是一个 YAML 映射（mapping），包含以下字段：

| 字段 | 类型 | 必需 | 说明 |
|:---|:---|:---|:---|
| `number` | `integer` | 是 | 场景编号，从 1 开始的正整数，唯一 |
| `location` | `string` | 是 | 场景发生地点，如“张家客厅”“城门外” |
| `time_of_day` | `enum` | 是 | 场景时间。可选值：`日` `夜` `黄昏` `黎明` `清晨` `下午` `深夜` |
| `indoor` | `boolean` | 是 | `true` = 室内景，`false` = 室外景 |
| `characters` | `string[]` | 是 | 本场景出场的角色名列表，至少 1 个 |
| `content` | `Block[]` | 是 | 内容块数组，按剧本时间顺序排列，至少 1 个 |

**`time_of_day` 枚举值说明**：

| 值 | 含义 | 典型使用场景 |
|:---|:---|:---|
| `日` | 白天（泛指） | 默认值、室外日景 |
| `夜` | 夜晚（泛指） | 夜景、室内夜戏 |
| `黄昏` | 日落时分 | 氛围场景、转折点 |
| `黎明` | 日出时分 | 起始场景、新开端 |
| `清晨` | 早晨 | 起床、出发场景 |
| `下午` | 午后 | 日常对话场景 |
| `深夜` | 午夜前后 | 悬疑、高潮场景 |

### 2.4 内容块 `content[]`

`content` 数组是剧本的核心——它按时间顺序记录场景中发生的每一个戏剧动作。数组中的每个元素必须是以下三种类型之一，通过 `type` 字段区分：

#### 2.4.1 ActionBlock — 动作描述

描述场景中发生的动作、画面、环境变化等。

```yaml
- type: action
  text: 张三推开门，环顾空旷的客厅。茶几上摆着一杯已经凉透的茶。
```

| 字段 | 类型 | 必需 | 说明 |
|:---|:---|:---|:---|
| `type` | `"action"` | 是 | 固定值 |
| `text` | `string` | 是 | 动作描述文本，至少 1 个字符 |

#### 2.4.2 DialogueBlock — 角色对白

记录一个角色的台词及其情绪状态。

```yaml
- type: dialogue
  character: 张三
  emotion: 焦急
  line: 你已经在这里等了多久？
```

| 字段 | 类型 | 必需 | 说明 |
|:---|:---|:---|:---|
| `type` | `"dialogue"` | 是 | 固定值 |
| `character` | `string` | 是 | 说话的角色名，**必须在 `characters` 列表中声明** |
| `emotion` | `string` | 否 | 台词情绪/语气（如 愤怒/悲伤/平静/焦急/兴奋/冷漠）。不填时为空 |
| `line` | `string` | 是 | 对白内容，至少 1 个字符 |

#### 2.4.3 TransitionBlock — 转场指令

标记场景结束的转场方式。**必须是 `content` 数组的最后一个元素。**

```yaml
- type: transition
  text: CUT TO:
```

| 字段 | 类型 | 必需 | 说明 |
|:---|:---|:---|:---|
| `type` | `"transition"` | 是 | 固定值 |
| `text` | `string` | 是 | 转场指令文本。常见值：`CUT TO:` `FADE OUT.` `DISSOLVE TO:` `SMASH CUT:` |

### 2.5 与导出格式的对应关系

Schema 中的内容块在不同导出格式中的呈现方式：

| Schema 类型 | YAML 导出 | Final Draft (.fdx) | Fountain |
|:---|:---|:---|:---|
| `action` | YAML mapping | `<Paragraph Type="Action">` | 纯文本段落 |
| `dialogue` | YAML mapping (含 character + emotion + line) | `<Paragraph Type="Character">` + `<Paragraph Type="Dialogue">` + 可选 Parenthetical | `CHARACTER` 大写行 + 对白行 |
| `transition` | YAML mapping | `<Paragraph Type="Transition">` | `>` 前缀行 |

> **注意**: Final Draft 和 Fountain 导出时，`emotion` 字段映射为 Parenthetical（括弧说明），即 `(焦急)` 的形式。

### 2.6 完整示例

以下是一个包含两个场景的完整 YAML 剧本示例：

```yaml
# ==========================================
# 剧本: 长安十二时辰（节选）
# 生成时间: 2026-06-07T12:00:00.000Z
# 场景总数: 2
# ==========================================

title: 长安十二时辰（节选）
scenes:
  - number: 1
    location: 西市街口
    time_of_day: 黄昏
    indoor: false
    characters:
      - 张小敬
      - 李必
    content:
      - type: action
        text: 夕阳将西市的木楼染成金色。街上行人渐稀，商贩开始收摊。
      - type: dialogue
        character: 李必
        emotion: 冷峻
        line: 张都尉，你可知道今日是什么日子？
      - type: action
        text: 张小敬没有回头，仍旧望着街角。
      - type: dialogue
        character: 张小敬
        emotion: 淡漠
        line: 上元节。长安最热闹的日子。
      - type: transition
        text: CUT TO:

  - number: 2
    location: 靖安司内
    time_of_day: 夜
    indoor: true
    characters:
      - 李必
      - 檀棋
    content:
      - type: action
        text: 烛火摇曳，巨大的长安城沙盘占据了整个厅堂。李必俯身审视，手指轻敲桌面。
      - type: dialogue
        character: 檀棋
        emotion: 担忧
        line: 公子，已经三天了。突厥狼卫还没有踪迹。
      - type: dialogue
        character: 李必
        emotion: 坚定
        line: 他们一定还在城内。传令下去，所有坊门提前关闭。
      - type: transition
        text: FADE OUT.
```

---

## 三、设计原因

### 3.1 为什么采用结构化 YAML

**问题背景**: 传统的 AI 剧本生成产出的往往是自然语言文本——“张三说：你好。他走进房间。”这种自由文本虽然可读，但**无法被下游系统精确解析**。谁在说话？哪句是动作描述？场景的边界在哪里？这些问题都需要复杂的 NLP 后处理，且容易出错。

**设计决策**:

| 考量维度 | 决策 | 原因 |
|:---|:---|:---|
| 序列化格式 | YAML（导出） | 人工可读可编辑；影视行业对 YAML 接受度高（Final Draft 虽为 XML，但 YAML 是编剧工具的通用交换格式）；与 JSON 无损互转 |
| 结构粒度 | 块级（block-level） | 每个动作、每句对白、每个转场都是独立的数据对象，支持精确索引和操作 |
| 语义标注 | 元数据 + 内容分离 | `charactersInScene` 等元数据服务于制片调度；`content` 服务于创作阅读。两者用途不同，分离更清晰 |

**为什么会这样设计？**

- **可被二次解析**：结构化数据可以直接被分镜脚本生成、AI 视频合成（Text-to-Video）、配音调度等下游工具消费。这是整个系统的核心价值主张。
- **支持精确编辑**：ScriptBlockEditor 可以逐个块操作（移动、删除、修改），而不是在文本编辑器里靠正则匹配。
- **支持版本对比**：块级 Diff 比文本行 Diff 更有语义——能区分“这句对白改了”和“这句对白被删除后新增了一句”。

### 3.2 为什么是三种内容块

**问题背景**: 剧本内容可以有很多种分类——动作、对白、转场、内心独白、旁白、蒙太奇、闪回……为什么 Schema 只定义了三种？

**设计决策**: 遵循**最小完备原则**——用最少的类型覆盖最大的语义空间，避免过早膨胀。

| 块类型 | 覆盖的语义 | 为什么不可合并 |
|:---|:---|:---|
| `action` | 动作、画面、环境、内心独白、旁白、镜头提示 | 是所有非语言表达的“剩余类别”。内心独白和旁白暂时归入 action，未来可通过 `text` 内容约定或新增 `subtype` 扩展 |
| `dialogue` | 角色对白 + 情绪标注 | 必须独立，因为对白有 `character` 归属和 `emotion` 情绪标注——这是下游配音、字幕、角色分析的基础数据 |
| `transition` | 场景结束标记 | 必须独立，因为它是场景的边界哨兵——校验系统依赖它判断场景是否完整，导出系统依赖它生成正确的格式分隔 |

**为什么不加“内心独白”块？**  
内心独白（V.O. / O.S.）在语义上是一个 dialogue 的特殊 case。与其新增类型，不如在 dialogue 上扩展 `mode` 字段（如 `"voiceover"` / `"offscreen"`）。这遵循 **“用字段区分变体，用类型区分种类”** 的原则。当前的 Schema 为这个扩展预留了空间。

### 3.3 为什么使用 `type` 判别联合

**问题背景**: 如何在数组中混合存放不同类型的元素，同时保证类型安全？

**备选方案**:

| 方案 | 示例 | 评价 |
|:---|:---|:---|
| 分离数组 | `actions: []`, `dialogues: []`, `transitions: []` | ❌ 丢失了时序信息——无法还原“动作→对白→动作→对白”的交替节奏 |
| Map 结构 | `{ 0: action, 1: dialogue }` | ❌ 冗余的 key，YAML 可读性差 |
| `type` 判别 | `[{type:"action",...}, {type:"dialogue",...}]` | ✅ 保留时序 + YAML 可读 + 类型安全 |

**设计决策**: 采用 `type` 字段做判别联合（discriminated union）。这是 OpenAPI/JSON Schema 社区的最佳实践，也是 Zod 原生支持的模式。

```typescript
// TypeScript 侧的类型定义（Zod 推导）
type ContentBlock =
  | { type: "action";     text: string }
  | { type: "dialogue";   character: string; emotion?: string; line: string }
  | { type: "transition"; text: string }
```

### 3.4 为什么强制 transition 结尾

**问题背景**: 在早期的 AI 生成测试中，约 30% 的场景缺少明确的结束标记。剧本阅读者（或下游工具）无法判断一个场景在哪里结束、下一个场景在哪里开始。

**设计决策**: **强制要求 `content` 数组最后一个元素必须是 `transition` 类型**。这是 Schema 中唯一涉及元素顺序的硬性约束。

**理由**:

1. **场景边界明确**: transition 是场景之间的“标点符号”。没有它，两个连续场景的动作描述会直接拼接，造成阅读混淆。
2. **导出格式需要**: Final Draft (.fdx) 和 Fountain 格式都依赖明确的场景分隔。`CUT TO:` / `FADE OUT.` 在导出时成为场景之间的分隔符。
3. **校验可自动化**: 规则 R001（转场结尾）可以在不依赖 AI 的情况下精确检测此类错误，并提供自动修复建议。
4. **行业惯例**: 影视剧本中，每个场景结尾都有转场指令，这是标准格式的一部分。

### 3.5 为什么分离 `charactersInScene` 与 `content`

**问题背景**: 出场角色信息可以从 `content` 中的 `dialogue` 块推导出来——那为什么还要在场景元数据中冗余声明？

**设计决策**: **显式声明优先于隐式推导**。

| 场景 | 仅有 content 推导 | 有 charactersInScene |
|:---|:---|:---|
| 角色在场但不说话 | ❌ 无法检测 | ✅ 显式声明 |
| 角色仅出现在 action 描述中 | ❌ 需要 NLP 解析 | ✅ 显式声明 |
| 制片调度（casting） | ❌ 需要遍历所有块 | ✅ O(1) 直接读取 |
| 缺失角色告警 | ❌ 无基准 | ✅ R002 校验：对白角色必须在此列表中 |

`charactersInScene` 是**制片视角**的字段——它回答“这个场景需要哪些演员到场”。而 `content` 是**创作视角**——它描述“在这个场景中，每个人做了什么、说了什么”。两者的用途不同，合并会损失信息的清晰度。

### 3.6 其他字段设计决策

**`timeOfDay` 为什么是枚举而非自由文本？**

自由文本（如“下午三点四十五分”）对制片没有意义。枚举值映射到剧组排期的标准时段（日戏/夜戏/晨戏），直接影响拍摄计划。七个枚举值覆盖了影视制作中所有标准拍摄时段。

**`indoor` 为什么是布尔值？**

室内/室外是摄影指导（DP）做布光决策的第一个问题。它是一个二分选择，不需要第三态。

**`emotion` 为什么是可选的？**

并非每句对白都需要情绪标注。平静的陈述性对白（如“是的。”“好。”）加上 `平静` 反而冗余。默认为空的 `emotion` 表示“由演员/导演自行把握”。

---

## 四、开发者参考

### 4.1 内部 JSON 存储 vs YAML 导出

系统中剧本数据以 **JSON 字符串** 形式存储在 SQLite 的 `Script.yamlContent` 字段中。YAML 仅用于导出（`GET /api/novels/:id/export?format=yaml`）。

**两者的关键差异**：

| 差异点 | 内部 JSON 存储 | YAML 导出 |
|:---|:---|:---|
| 字段命名 | camelCase (`sceneNum`, `timeOfDay`) | snake_case (`number`, `time_of_day`) |
| 场景编号字段 | `sceneNum` | `number` |
| 角色列表字段 | `charactersInScene` | `characters` |
| 顶层包装 | 每个场景独立存储为一个 JSON 对象 | 统一包装为 `{title, scenes[]}` |
| 时间戳 | 无 | 文件头注释中 |

**为什么内部用 JSON 而导出用 YAML？**

- JSON 是 LLM API 的标准输出格式（`response_format: "json_object"`），AI 生成直接产出 JSON，无转换损耗
- JSON 校验由 Zod 原生支持，`safeParse()` 直接消费 JavaScript 对象
- YAML 是 JSON 的超集，转换是**单向无损**的（JSON → YAML），且更符合人工阅读习惯

### 4.2 Zod Schema 定义

```typescript
// 文件: backend/src/schemas/script.schema.ts

import { z } from "zod";

// ─── 内容块 ───

const ActionBlock = z.object({
  type: z.literal("action"),
  text: z.string().min(1, "动作描述不能为空"),
});

const DialogueBlock = z.object({
  type: z.literal("dialogue"),
  character: z.string().min(1, "说话角色名不能为空"),
  emotion: z.string().optional().default(""),
  line: z.string().min(1, "对白内容不能为空"),
});

const TransitionBlock = z.object({
  type: z.literal("transition"),
  text: z.string().min(1, "转场指令不能为空"),
});

const ContentBlock = z.discriminatedUnion("type", [
  ActionBlock,
  DialogueBlock,
  TransitionBlock,
]);

// ─── 完整场景 ───

const ScriptSchema = z.object({
  sceneNum: z.number().int().positive("场景编号必须为正整数"),
  location: z.string().min(1, "场景地点不能为空"),
  timeOfDay: z.enum(["日", "夜", "黄昏", "黎明", "清晨", "下午", "深夜"]),
  indoor: z.boolean(),
  charactersInScene: z.array(z.string()).min(1, "至少需要一个出场角色"),
  content: z.array(ContentBlock).min(1, "剧本内容不能为空"),
});

type ScriptOutput = z.infer<typeof ScriptSchema>;
```

### 4.3 字段映射表

内部 JSON → YAML 导出的字段映射关系（实现于 `backend/src/services/export.service.ts` → `toYaml()`）：

| 内部 JSON (camelCase) | YAML 导出 (snake_case) | 说明 |
|:---|:---|:---|
| `novel.title` | `title` | 顶层标题 |
| `scene.sceneNum` | `number` | 场景编号 |
| `scene.location` | `location` | 地点 |
| `scene.timeOfDay` | `time_of_day` | 时间枚举 |
| `script.indoor` | `indoor` | 室内/外 |
| `script.charactersInScene[]` | `characters[]` | 出场角色列表 |
| `block.type` | `type` | 块类型（不变） |
| `block.text` | `text` | Action/Transition 文本 |
| `block.character` | `character` | 对白角色 |
| `block.emotion` | `emotion` | 对白情绪 |
| `block.line` | `line` | 对白内容 |

### 4.4 校验体系

校验分三层，从结构性到语义性逐层深入：

#### Layer 1: 结构校验 (Zod)

由 `validateScript()` 执行，利用 Zod 的 `safeParse()` 检查：
- 所有必需字段是否存在
- 字段类型是否正确（number / string / boolean / enum）
- `type` 是否为三个合法值之一
- 数组非空约束

#### Layer 2: 语义校验 (7 条业务规则)

由 `validateSemantics()` 执行，在结构校验通过后检查内容的“合理性”：

| 规则 | 严重度 | 检查内容 |
|:---|:---|:---|
| **R001** 转场结尾 | 🔴 error | `content` 最后一个元素必须是 `transition` |
| **R002** 对白角色在场 | 🔴 error | `dialogue.character` 必须在 `charactersInScene` 中声明 |
| **R003** 内容丰满度 | 🟡 warning | `action.text` ≥ 5 字符，`dialogue.line` ≥ 2 字符 |
| **R004** 块交替 | 🟡 warning | 连续 ≥3 个同类型非 transition 块产生警告 |
| **R005** 角色出场无对白 | 🟡 warning | `charactersInScene` 中的角色在 `content` 中无对应 dialogue |
| **R006** 空场景 | 🟡 warning | `content` 仅含 transition，缺少动作和对白 |
| **R007** 未知角色 | 🟡 warning | 场景中的角色不在小说已提取的角色列表中 |

**设计原则**:  
- R001 和 R002 是 **硬错误**（error）——它们破坏了下游工具的数据契约
- R003-R007 是 **软警告**（warning）——它们标识质量欠佳但不阻塞导出的情况
- 每条 issue 附带 `path`（JSONPath 式定位）和 `fix`（可操作修复建议）

#### Layer 3: 跨场景校验

由 `/validate` 端点执行：

| 规则 | 严重度 | 检查内容 |
|:---|:---|:---|
| **C001** 地点频繁跳跃 | 🟡 warning | ≥3 个连续场景的地点各不相同，可能影响叙事连贯性 |

### 4.5 导出管道

```
SQLite Script.yamlContent (JSON string)
    │
    ├── JSON.parse() → ScriptOutput (Zod validated)
    │
    ├── toYaml()       → .yaml  文件  (YAML 格式)
    ├── toFdx()        → .fdx   文件  (Final Draft XML)
    └── toFountain()   → .fountain 文件 (Fountain 标记)
```

旧格式（非 JSON 自由文本）在导出时通过 `parseLegacyScript()` 做尽力而为的降级解析，解析失败则作为纯文本 action 块嵌入。

### 4.6 旧格式兼容

早期版本中，剧本以**自由文本**形式存储（非结构化 YAML）。系统通过 `parseLegacyScript()` 提供向后兼容：

1. 尝试作为 JSON 解析 → 成功则校验
2. 失败则按正则模式提取角色名和对话结构：
   - `角色名：...` 行识别为角色声明
   - `[Action]` / `Action:` 前缀识别为动作描述
   - `[Dialogue]` / `Dialogue:` 前缀识别为对白（支持 `角色(情绪): 台词` 和 `角色: 台词` 两种子格式）
3. 其他行合并到当前动作块

**降级行为**:
- 旧格式场景标记为 `legacy_parsed`（成功提取）或 `legacy_unparseable`（完全无法解析）
- 旧格式可导出但不会触发语义校验
- 用户可通过 ScriptBlockEditor 将旧格式升级为新格式

---

## 附录 A: Schema 版本历史

| 版本 | 日期 | 变更 |
|:---|:---|:---|
| 1.0 | 2026-06 | 初始版本。三种内容块（action/dialogue/transition）、7 个 `timeOfDay` 枚举值、三层校验体系 |
| 0.x | 2025 | 前身：自由文本存储，无严格 Schema。`parseLegacyScript()` 兼容 |

## 附录 B: 相关文档

- [小说转剧本创作辅助系统 开发文档 v3](小说转剧本创作辅助系统%20开发文档v3.md) — 系统架构、API 接口、组件体系
- [人物分析功能开发文档](人物分析功能开发文档.md) — 角色关系网络、冲突分析
- `backend/src/schemas/script.schema.ts` — Zod Schema 定义与校验逻辑源码
- `backend/src/services/export.service.ts` — YAML/FDX/Fountain 导出实现源码

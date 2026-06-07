import "dotenv/config";
import OpenAI from "openai";

// Mimo API 客户端 (OpenAI 兼容) — 分析流水线用
export const mimoClient = new OpenAI({
  apiKey: process.env.MIMO_API_KEY!,
  baseURL: process.env.MIMO_BASE_URL!,
});

// DeepSeek API 客户端 — AI 聊天用
export const deepseekClient = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: process.env.DEEPSEEK_BASE_URL!,
});

const DEFAULT_MODEL = process.env.MIMO_MODEL || "mimo-v2.5";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

// --- 类型定义 ---

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  responseFormat?: "text" | "json_object";
  thinking?: boolean;
}

// --- 通用聊天补全 ---

export async function chatCompletion(
  messages: ChatMessage[],
  options: ChatOptions = {}
) {
  const {
    model = DEFAULT_MODEL,
    temperature = 0.7,
    maxTokens = 32768,
    stream = false,
    responseFormat,
    thinking = false,
  } = options;

  const request: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
    model,
    messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    temperature,
    max_completion_tokens: maxTokens,
    stream,
  };

  // JSON 模式
  if (responseFormat === "json_object") {
    request.response_format = { type: "json_object" };
  }

  // 思维链模式（Mimo 默认开启，需显式控制）
  (request as any).thinking = { type: thinking ? "enabled" : "disabled" };

  const response = await mimoClient.chat.completions.create(request);

  if (stream) {
    return response; // 返回 Stream 对象，调用方自行处理
  }

  const choice = (response as OpenAI.Chat.Completions.ChatCompletion).choices[0];

  // 检测 Mimo 内容安全拦截
  const finishReason = choice.finish_reason;
  if (finishReason === "content_filter" || finishReason === "sensitive") {
    throw new Error(
      `⚠️ 内容安全审核未通过：AI 平台判定该文本包含高风险内容，已拦截。\n` +
        `建议：1) 缩短文本长度（控制在 5000 字以内） 2) 尝试上传更温和的章节片段 3) 联系 Mimo 平台了解内容策略`
    );
  }

  const rawContent = choice.message.content || "";

  // 有些安全拦截不会设置 finish_reason，而是直接在 content 中返回英文拒绝信息
  if (
    rawContent.includes("rejected") &&
    (rawContent.includes("high risk") || rawContent.includes("unsafe") || rawContent.includes("blocked"))
  ) {
    throw new Error(
      `⚠️ 内容安全审核未通过：AI 平台拒绝了该请求。\n` +
        `原始信息: ${rawContent.substring(0, 200)}\n` +
        `建议：1) 缩短文本 2) 尝试不同内容的片段 3) 联系 Mimo 平台`
    );
  }

  return {
    content: rawContent,
    reasoning: (choice.message as any).reasoning_content as string | undefined,
    usage: response.usage,
    model: response.model,
  };
}

// --- DeepSeek 流式聊天补全 ---

/**
 * DeepSeek 流式聊天补全 — 返回 AsyncGenerator，逐 token yield
 * 使用 OpenAI 兼容客户端 + stream:true，后端逐 token 推送 SSE 给前端
 */
export async function* chatCompletionStream(
  messages: ChatMessage[],
  options: ChatOptions = {}
): AsyncGenerator<string> {
  const {
    temperature = 0.7,
    maxTokens = 1024,
  } = options;

  const stream = await deepseekClient.chat.completions.create({
    model: DEEPSEEK_MODEL,
    messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    temperature,
    max_tokens: maxTokens,
    stream: true,
  });

  for await (const chunk of stream) {
    const delta = (chunk as any).choices?.[0]?.delta?.content;
    if (delta) yield delta;
  }
}

// --- Agent 快捷方法 ---

/** Agent 1: 剧情解构者 — 提取故事大纲与时间线 */
export async function analyzePlot(novelContent: string) {
  return chatCompletion(
    [
      {
        role: "system",
        content: `你是一位资深的剧本分析师。请通读以下小说内容，完成以下任务：
1. 提取核心故事大纲（包含起因、发展、高潮、结局）
2. 梳理全局时间线（按时间顺序列出关键事件节点，每个节点需标注时间提示、地点、涉及角色、搜索关键词）
3. 识别主要剧情冲突与转折点（冲突参与方必须是原文中有姓名的具体人物，禁止使用"命运""社会""环境"等抽象概念）

请以 JSON 格式输出，结构如下：
{
  "outline": { "opening": "...", "development": "...", "climax": "...", "ending": "..." },
  "timeline": [
    {
      "order": 1,
      "event": "事件简述（一句话）",
      "chapter": "所在章节名",
      "timeHint": "原文中的时间提示（如'三天后''当夜''次日下午'），无则填null",
      "location": "事件发生地点，无则填null",
      "characters": ["参与角色A", "角色B"],
      "keywords": ["搜索关键词1", "关键词2"]
    }
  ],
  "conflicts": [{ "type": "人物冲突", "description": "...", "parties": ["角色A", "角色B"] }]
}
注意: conflicts[].parties 只能包含原文中有具体姓名的人物。
注意: timeline[].timeHint/location/characters/keywords 务必填写，这将用于时间线精确检索。`,
      },
      { role: "user", content: novelContent },
    ],
    { responseFormat: "json_object", thinking: true }
  );
}

/** Agent 2: 角色图谱构建师 — 提取角色信息 */
export async function analyzeCharacters(novelContent: string) {
  return chatCompletion(
    [
      {
        role: "system",
        content: `你是一位专业的影视角色分析师。请从以下小说内容中提取所有重要角色，为每个角色构建详细档案。

请以 JSON 格式输出，结构如下：
{
  "characters": [
    {
      "name": "角色姓名",
      "aliases": ["别名1", "别名2"],
      "roleType": "主角/配角/反派/路人",
      "traits": {
        "identity": "身份背景",
        "personality": ["性格标签"],
        "goal": "当前阶段目标",
        "motivation": "行为动机",
        "relationships": [{"with": "关联角色", "relation": "关系描述"}]
      }
    }
  ]
}`,
      },
      { role: "user", content: novelContent },
    ],
    { responseFormat: "json_object", thinking: true }
  );
}

/** Agent 3: 场记统筹 — 划分场景 */
export async function planScenes(novelContent: string, characters: any[]) {
  return chatCompletion(
    [
      {
        role: "system",
        content: `你是一位经验丰富的场记统筹。请根据小说内容和已知的角色列表，将故事切分为可拍摄的场景。

已知角色：${JSON.stringify(characters)}

每个场景需包含：场景编号、地点、时间（日/夜/黎明/黄昏）、室内外类型、在场角色ID列表、场景摘要。

请以 JSON 格式输出：
{
  "scenes": [
    {
      "sceneNum": 1,
      "location": "地点描述",
      "timeOfDay": "日/夜/黎明/黄昏",
      "indoor": true,
      "characterIds": ["角色名"],
      "summary": "场景摘要",
      "keyEvents": ["关键事件"]
    }
  ]
}`,
      },
      { role: "user", content: novelContent },
    ],
    { responseFormat: "json_object", thinking: true }
  );
}

/** Agent 4: 剧本主笔 — 生成场景结构化剧本 */
export async function writeScript(
  sceneInfo: any,
  charactersInScene: any[]
) {
  // 构建角色语言风格指令
  const speechStyleInstructions = charactersInScene
    .filter((c: any) => c.speechStyle && typeof c.speechStyle === "object")
    .map((c: any) => {
      const s = c.speechStyle;
      const parts: string[] = [];
      if (s.tone) parts.push(`语气：${s.tone}`);
      if (s.vocabulary) parts.push(`用词：${s.vocabulary}`);
      if (s.dialect) parts.push(`方言/口音：${s.dialect}`);
      if (s.catchphrase) parts.push(`口头禅："${s.catchphrase}"`);
      if (s.sentenceLength) parts.push(`句长偏好：${s.sentenceLength}`);
      if (s.customNotes) parts.push(`补充：${s.customNotes}`);
      return parts.length > 0 ? `  - ${c.name}：${parts.join("；")}` : null;
    })
    .filter(Boolean)
    .join("\n");

  const speechStyleBlock = speechStyleInstructions
    ? `\n⚠️ 角色语言风格约束（必须严格遵守！）：\n每个角色的对白必须符合以下语言风格设定，确保每个角色说话方式有显著差异，杜绝「千人一面」：\n${speechStyleInstructions}\n`
    : "";

  return chatCompletion(
    [
      {
        role: "system",
        content: `你是一位专业的影视编剧。请根据场景信息和在场角色，为该场景撰写标准剧本。

在场角色档案：
${JSON.stringify(charactersInScene)}
${speechStyleBlock}
输出格式要求（必须严格遵循 JSON Schema）：
{
  "sceneNum": ${sceneInfo.sceneNum},
  "location": "${sceneInfo.location}",
  "timeOfDay": "${sceneInfo.timeOfDay}",
  "indoor": ${sceneInfo.indoor ?? true},
  "charactersInScene": ["角色名1", "角色名2"],
  "content": [
    { "type": "action", "text": "动作描述，描写场景发生了什么。" },
    { "type": "dialogue", "character": "角色名", "emotion": "情绪", "line": "对白内容" },
    { "type": "transition", "text": "CUT TO:" }
  ]
}

规则（非常重要）：
- content 数组按剧本时间顺序排列，action 和 dialogue 交替出现，比例约 1:1
- dialogue 的 emotion 标注角色语气（愤怒/悲伤/平静/焦急/兴奋/冷漠/...）
- **每个角色的对白必须符合其语言风格约束**，不同角色的说话方式要有明显差异
- 场景结尾必须有 transition（CUT TO: / FADE OUT. / DISSOLVE TO: / SMASH CUT:）
- charactersInScene 必须是本场景实际出场角色名
- 每个 content 元素必须包含 type 字段，值为 "action" / "dialogue" / "transition" 三者之一
- dialogue 必须包含 character 和 line 字段；emotion 可选`,
      },
      {
        role: "user",
        content: `场景信息：${JSON.stringify(sceneInfo)}`,
      },
    ],
    { responseFormat: "json_object" }
  );
}

/** Agent 4 带 Schema 校验的重试包装 */
export async function writeScriptWithRetry(
  sceneInfo: any,
  charactersInScene: any[],
  maxRetries: number = 3
): Promise<{ scriptJson: string; retries: number; validated: boolean }> {
  const { ScriptSchema } = await import("../schemas/script.schema");

  let lastError = "";
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await writeScript(
        attempt === 0 ? sceneInfo : { ...sceneInfo, _retryHint: lastError },
        charactersInScene
      );
      const data = parseAIJson(response.content);

      // 如果 AI 返回的仍是旧格式（含 script 字段），尝试转换
      let candidate = data;
      if (data.script && !data.content) {
        // 旧格式回退：尝试从 script 文本中提取结构化内容
        candidate = {
          sceneNum: data.sceneNum || sceneInfo.sceneNum,
          location: data.location || sceneInfo.location,
          timeOfDay: data.timeOfDay || sceneInfo.timeOfDay,
          indoor: data.indoor ?? sceneInfo.indoor ?? true,
          charactersInScene: data.charactersInScene || charactersInScene.map((c: any) => c.name),
          content: [
            { type: "action", text: data.script },
            { type: "transition", text: "CUT TO:" },
          ],
        };
      }

      const result = ScriptSchema.safeParse(candidate);

      if (result.success) {
        return {
          scriptJson: JSON.stringify(result.data),
          retries: attempt,
          validated: true,
        };
      }

      // 校验失败，记录错误用于重试
      lastError = result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      console.log(`  ⚠️ 场景 ${sceneInfo.sceneNum} Schema 校验失败 (第${attempt + 1}次): ${lastError.substring(0, 120)}...`);
    } catch (err: any) {
      lastError = err.message || "未知解析错误";
      console.log(`  ⚠️ 场景 ${sceneInfo.sceneNum} 解析失败 (第${attempt + 1}次): ${lastError.substring(0, 100)}`);
    }
  }

  // 所有重试失败，返回占位剧本
  console.log(`  ❌ 场景 ${sceneInfo.sceneNum} 校验重试 ${maxRetries} 次均失败，使用占位剧本`);
  return {
    scriptJson: JSON.stringify({
      sceneNum: sceneInfo.sceneNum,
      location: sceneInfo.location,
      timeOfDay: sceneInfo.timeOfDay,
      indoor: sceneInfo.indoor ?? true,
      charactersInScene: charactersInScene.map((c: any) => c.name).slice(0, 5),
      content: [
        { type: "action", text: `⚠️ 该场景AI生成未通过Schema校验，请手动编辑。错误: ${lastError.substring(0, 200)}` },
        { type: "transition", text: "CUT TO:" },
      ],
    }),
    retries: maxRetries,
    validated: false,
  };
}

// --- JSON 解析工具 ---

/**
 * 从 AI 响应中解析 JSON
 * 处理常见格式：纯 JSON、markdown 代码块包裹、含 reasoning 前缀等
 */
export function parseAIJson(content: string): any {
  // 预检：安全拦截 / 服务端错误文本
  const lower = content.toLowerCase();
  if (
    lower.includes("rejected") ||
    lower.includes("high risk") ||
    lower.includes("unsafe") ||
    lower.includes("blocked") ||
    lower.includes("content filter")
  ) {
    throw new Error(
      `⚠️ AI 平台安全拦截：请求被判定为高风险内容。\n原始响应: ${content.substring(0, 300)}\n` +
        `建议：1) 减少文本中的暴力/冲突描写 2) 缩短上传文本至 5000 字以内 3) 分章节逐步分析`
    );
  }

  // 尝试直接解析
  try {
    return JSON.parse(content);
  } catch {}

  // 尝试提取 ```json ... ``` 代码块
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1]);
    } catch {}
  }

  // 尝试找到第一个 { 和最后一个 }
  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(content.slice(firstBrace, lastBrace + 1));
    } catch {}
  }

  // 尝试找到第一个 [ 和最后一个 ]
  const firstBracket = content.indexOf("[");
  const lastBracket = content.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    try {
      return JSON.parse(content.slice(firstBracket, lastBracket + 1));
    } catch {}
  }

  throw new Error(`无法解析 AI 响应为 JSON，原始内容前200字: ${content.substring(0, 200)}`);
}

// --- 进度回调类型 ---

export interface PipelineProgress {
  stage: 'analyze' | 'characters' | 'scenes' | 'scripts' | 'save' | 'done' | 'error'
    | 'chunking' | 'chunk_analyze' | 'merging'
    | 'generate' | 'scene_start' | 'scene_done' | 'scene_error';
  progress?: number;   // 0-100 (incremental pipeline uses current/total instead)
  message: string;
  detail?: string;
  /** 当前进度计数 (增量流水线用) */
  current?: number;
  /** 总任务数 (增量流水线用) */
  total?: number;
  /** 场景编号 (增量流水线用) */
  sceneNum?: number;
  /** 版本号 (增量流水线用) */
  version?: number;
  stats?: {
    characters?: number;
    scenes?: number;
    currentScene?: number;
    totalScenes?: number;
    currentWindow?: number;
    totalWindows?: number;
    totalChapters?: number;
  };
}

export type ProgressCallback = (event: PipelineProgress) => void;

// --- 多 Agent 编排 ---

export interface AnalysisResult {
  plot: {
    outline: {
      opening: string;
      development: string;
      climax: string;
      ending: string;
    };
    timeline: { order: number; event: string; chapter?: string; timeHint?: string; location?: string; characters?: string[]; keywords?: string[] }[];
    conflicts: { type: string; description: string; parties: string[] }[];
  };
  characters: {
    name: string;
    aliases: string[];
    roleType: string;
    traits: {
      identity: string;
      personality: string[];
      goal: string;
      motivation: string;
      relationships: { with: string; relation: string }[];
    };
  }[];
}

/**
 * 执行 Agent 1 + Agent 2 分析流水线
 * Agent 1: 剧情解构 → Agent 2: 角色图谱
 * 长篇自动启用分块模式 (滑动窗口上下文拼接)
 * 内置降级策略：如遇安全拦截，自动缩短文本并关闭思维模式重试
 */
export async function runAnalysisPipeline(
  novelContent: string,
  onProgress?: ProgressCallback
): Promise<AnalysisResult> {
  const progress = (event: PipelineProgress) => onProgress?.(event);

  // 判断是否需要分块模式
  const { splitChapters } = await import("../utils/text-processor");
  const chapters = splitChapters(novelContent);
  const needsChunking =
    novelContent.length > 15000 || chapters.length > 5;

  if (needsChunking) {
    console.log(`📚 检测到长文本 (${novelContent.length} 字, ${chapters.length} 章)，启用分块分析模式`);
    progress({
      stage: "chunking",
      progress: 0,
      message: `📚 长文本检测: ${novelContent.length} 字, ${chapters.length} 章 → 启用分块分析`,
      stats: { totalChapters: chapters.length },
    });

    try {
      const { runChunkedAnalysisPipeline } = await import("./chunked-pipeline.service");
      const result = await runChunkedAnalysisPipeline(novelContent, onProgress);

      return {
        plot: result.plot,
        characters: result.characters,
      };
    } catch (err: any) {
      const msg = err.message || "";
      if (msg.includes("安全") || msg.includes("rejected") || msg.includes("high risk")) {
        // 分块模式安全拦截 → 降级为单次短文本分析
        console.log("  ⚠️ 分块分析被安全拦截，降级为单次短文本分析...");
        progress({ stage: 'analyze', progress: 5, message: '⚠️ 内容被安全拦截，正在降级重试...' });
        const fallbackContent = novelContent.substring(0, 5000) + "\n\n[安全降级：已截取前5000字]";
        return await _doAnalysis(fallbackContent, { thinking: false }, onProgress);
      }
      throw err;
    }
  }

  // 短篇小说：使用常规单次分析
  const truncatedContent = novelContent.length > 15000
    ? novelContent.substring(0, 15000) + "\n\n[文本过长，已截取前15000字分析...]"
    : novelContent;

  // 尝试主策略
  try {
    return await _doAnalysis(truncatedContent, { thinking: true }, onProgress);
  } catch (err: any) {
    const msg = err.message || "";

    // 判断是否为安全拦截
    if (msg.includes("安全") || msg.includes("rejected") || msg.includes("high risk") || msg.includes("content_filter")) {
      console.log("  ⚠️ 主策略被安全拦截，尝试降级策略（更短文本 + 关闭思维链）...");
      progress({ stage: 'analyze', progress: 5, message: '⚠️ 内容被安全拦截，正在降级重试...' });

      // 降级策略：更短文本 + 关闭思维模式
      const fallbackContent = truncatedContent.length > 5000
        ? truncatedContent.substring(0, 5000) + "\n\n[安全降级：已截取前5000字]"
        : truncatedContent.substring(0, Math.floor(truncatedContent.length * 0.6));

      try {
        return await _doAnalysis(fallbackContent, { thinking: false }, onProgress);
      } catch (fallbackErr: any) {
        const fbMsg = fallbackErr.message || "";
        if (fbMsg.includes("安全") || fbMsg.includes("rejected") || fbMsg.includes("high risk")) {
          throw new Error(
            `⚠️ 内容多次被 AI 平台安全拦截，无法完成分析。\n` +
              `可能原因：文本包含较多暴力/冲突/敏感描写。\n` +
              `建议：1) 尝试上传更短、更温和的章节（3000 字以内） 2) 更换小说内容 3) 联系 Mimo 平台了解内容审核策略`
          );
        }
        throw fallbackErr;
      }
    }

    // 非安全拦截的错误，直接抛出
    throw err;
  }
}

/** 内部：执行实际的分析调用 */
async function _doAnalysis(
  content: string,
  options: { thinking: boolean },
  onProgress?: ProgressCallback
): Promise<AnalysisResult> {
  const progress = (event: PipelineProgress) => onProgress?.(event);

  // Agent 1: 剧情解构
  progress({ stage: 'analyze', progress: 5, message: 'Agent 1: 正在解构剧情...' });
  console.log("  🧠 Agent 1: 剧情解构中...");
  const plotResponse = await chatCompletion(
    [
      {
        role: "system",
        content: `你是一位资深的剧本分析师。请通读以下小说内容，完成以下任务：
1. 提取核心故事大纲（包含起因、发展、高潮、结局）
2. 梳理全局时间线（按时间顺序列出关键事件节点，每个节点需标注时间提示、地点、涉及角色、搜索关键词）
3. 识别主要剧情冲突与转折点（冲突参与方必须是原文中有姓名的具体人物，禁止使用"命运""社会""环境"等抽象概念）

请以 JSON 格式输出，结构如下：
{
  "outline": { "opening": "...", "development": "...", "climax": "...", "ending": "..." },
  "timeline": [
    {
      "order": 1,
      "event": "事件简述（一句话）",
      "chapter": "所在章节名",
      "timeHint": "原文中的时间提示（如'三天后''当夜''次日下午'），无则填null",
      "location": "事件发生地点，无则填null",
      "characters": ["参与角色A", "角色B"],
      "keywords": ["搜索关键词1", "关键词2"]
    }
  ],
  "conflicts": [{ "type": "人物冲突", "description": "...", "parties": ["角色A", "角色B"] }]
}
注意: conflicts[].parties 只能包含原文中有具体姓名的人物。
注意: timeline[].timeHint/location/characters/keywords 务必填写，这将用于时间线精确检索。`,
      },
      { role: "user", content },
    ],
    { responseFormat: "json_object", thinking: options.thinking }
  );
  const plotData = parseAIJson(plotResponse.content);
  progress({
    stage: 'analyze',
    progress: 15,
    message: '✅ 剧情解构完成',
    detail: `大纲四段：${plotData.outline?.opening?.substring(0, 20) || '...'}...`,
  });
  console.log("  ✅ Agent 1 完成");

  // Agent 2: 角色图谱
  progress({ stage: 'characters', progress: 16, message: 'Agent 2: 正在提取角色图谱...' });
  console.log("  🧠 Agent 2: 角色提取中...");
  const charResponse = await chatCompletion(
    [
      {
        role: "system",
        content: `你是一位专业的影视角色分析师。请从以下小说内容中提取所有重要角色，为每个角色构建详细档案。

请以 JSON 格式输出，结构如下：
{
  "characters": [
    {
      "name": "角色姓名",
      "aliases": ["别名1", "别名2"],
      "roleType": "主角/配角/反派/路人",
      "traits": {
        "identity": "身份背景",
        "personality": ["性格标签"],
        "goal": "当前阶段目标",
        "motivation": "行为动机",
        "relationships": [{"with": "关联角色", "relation": "关系描述"}]
      }
    }
  ]
}`,
      },
      { role: "user", content },
    ],
    { responseFormat: "json_object", thinking: options.thinking }
  );
  const charData = parseAIJson(charResponse.content);
  const charCount = charData.characters?.length || 0;
  progress({
    stage: 'characters',
    progress: 30,
    message: `✅ 角色提取完成`,
    detail: `识别到 ${charCount} 个角色`,
    stats: { characters: charCount },
  });
  console.log("  ✅ Agent 2 完成");

  return {
    plot: plotData,
    characters: charData.characters || [],
  };
}

// --- 场景生成流水线 ---

export interface GeneratedScene {
  sceneNum: number;
  location: string;
  timeOfDay: string;
  indoor: boolean;
  characterNames: string[];
  summary: string;
}

export interface GeneratedScript {
  sceneNum: number;
  location: string;
  timeOfDay: string;
  scriptYaml: string;
}

/**
 * 执行 Agent 3 + Agent 4 场景生成流水线
 * Agent 3: 场景规划 → Agent 4: 逐场景剧本生成
 * 内置降级策略：如遇安全拦截，自动缩短文本重试
 */
export async function runScriptGenerationPipeline(
  novelContent: string,
  characters: { name: string; roleType: string; traits: any; speechStyle?: any }[],
  onProgress?: ProgressCallback
): Promise<{ scenes: GeneratedScene[]; scripts: GeneratedScript[] }> {
  const progress = (event: PipelineProgress) => onProgress?.(event);

  let truncatedContent = novelContent.length > 12000
    ? novelContent.substring(0, 12000) + "\n\n[文本截取]"
    : novelContent;

  const charSummary = characters.map((c) => ({
    name: c.name,
    roleType: c.roleType,
    personality: c.traits?.personality || [],
    speechStyle: c.speechStyle || null,
  }));

  // Agent 3: 场景规划（带降级）
  let sceneData: any;
  progress({ stage: 'scenes', progress: 31, message: 'Agent 3: 正在规划场景...' });
  try {
    console.log("  🎬 Agent 3: 场景规划中...");
    const sceneResponse = await planScenes(truncatedContent, charSummary);
    sceneData = parseAIJson(sceneResponse.content);
    const sceneCount = sceneData.scenes?.length || 0;
    progress({
      stage: 'scenes',
      progress: 50,
      message: `✅ 场景规划完成`,
      detail: `共划分 ${sceneCount} 个场景`,
      stats: { scenes: sceneCount },
    });
    console.log(`  ✅ Agent 3 完成 (${sceneCount} 个场景)`);
  } catch (err: any) {
    const msg = err.message || "";
    if (msg.includes("安全") || msg.includes("rejected") || msg.includes("high risk")) {
      console.log("  ⚠️ 场景规划被拦截，尝试更短文本...");
      progress({ stage: 'scenes', progress: 35, message: '⚠️ 场景规划被拦截，降级重试中...' });
      truncatedContent = truncatedContent.substring(0, Math.floor(truncatedContent.length * 0.5));
      const retryResponse = await planScenes(truncatedContent, charSummary);
      sceneData = parseAIJson(retryResponse.content);
      const sceneCount = sceneData.scenes?.length || 0;
      progress({
        stage: 'scenes',
        progress: 50,
        message: `✅ 场景规划完成（降级）`,
        detail: `共划分 ${sceneCount} 个场景`,
        stats: { scenes: sceneCount },
      });
      console.log(`  ✅ Agent 3 降级完成 (${sceneCount} 个场景)`);
    } else {
      throw err;
    }
  }

  const scenes: GeneratedScene[] = (sceneData.scenes || []).map((s: any, i: number) => ({
    sceneNum: s.sceneNum || i + 1,
    location: s.location || "未知地点",
    timeOfDay: s.timeOfDay || "日",
    indoor: s.indoor !== false,
    characterNames: s.characterIds || s.characterNames || [],
    summary: s.summary || "",
  }));

  // Agent 4: 逐场景生成剧本
  const totalScenes = scenes.length;
  const scripts: GeneratedScript[] = [];
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const sceneChars = characters.filter((c) =>
      scene.characterNames.some((n: string) => n.includes(c.name) || c.name.includes(n))
    );
    if (sceneChars.length === 0 && characters.length > 0) {
      sceneChars.push(...characters.slice(0, 2)); // fallback: 前2个角色
    }

    // 推进度：50% - 95% 按场景数量分配
    const progressPercent = totalScenes > 0
      ? Math.round(50 + ((i + 1) / totalScenes) * 45)
      : 95;
    progress({
      stage: 'scripts',
      progress: progressPercent,
      message: `Agent 4: 正在撰写场景剧本...`,
      detail: `场景 ${scene.sceneNum}/${totalScenes}: ${scene.location}`,
      stats: { currentScene: i + 1, totalScenes },
    });

    console.log(`  ✍️ Agent 4: 生成场景 ${scene.sceneNum} 剧本...`);
    try {
      const { scriptJson, retries, validated } = await writeScriptWithRetry(scene, sceneChars, 3);
      if (retries > 0) {
        console.log(`  ✅ 场景 ${scene.sceneNum} 剧本完成 (${retries} 次重试, ${validated ? "✅ 校验通过" : "⚠️ 校验未通过"})`);
      } else {
        console.log(`  ✅ 场景 ${scene.sceneNum} 剧本完成 ✅ 校验通过`);
      }

      scripts.push({
        sceneNum: scene.sceneNum,
        location: scene.location,
        timeOfDay: scene.timeOfDay,
        scriptYaml: scriptJson,
      });
    } catch (err: any) {
      const msg = err.message || "";
      if (msg.includes("安全") || msg.includes("rejected") || msg.includes("high risk")) {
        console.log(`  ⚠️ 场景 ${scene.sceneNum} 被安全拦截，使用占位剧本`);
        scripts.push({
          sceneNum: scene.sceneNum,
          location: scene.location,
          timeOfDay: scene.timeOfDay,
          scriptYaml: JSON.stringify({
            sceneNum: scene.sceneNum,
            location: scene.location,
            timeOfDay: scene.timeOfDay,
            indoor: scene.indoor !== false,
            charactersInScene: sceneChars.map((c: any) => c.name).slice(0, 5),
            content: [
              { type: "action", text: "⚠️ 该场景因内容安全审核未通过，未能生成剧本。请尝试缩短原文章节后重试。" },
              { type: "transition", text: "CUT TO:" },
            ],
          }),
        });
      } else {
        throw err;
      }
    }
  }

  progress({ stage: 'scripts', progress: 95, message: `✅ 剧本生成完成`, detail: `成功生成 ${scripts.length} 个场景剧本` });
  return { scenes, scripts };
}

import "dotenv/config";
import OpenAI from "openai";

// Mimo API 客户端 (OpenAI 兼容)
export const mimoClient = new OpenAI({
  apiKey: process.env.MIMO_API_KEY!,
  baseURL: process.env.MIMO_BASE_URL!,
});

const DEFAULT_MODEL = process.env.MIMO_MODEL || "mimo-v2.5";

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

// --- Agent 快捷方法 ---

/** Agent 1: 剧情解构者 — 提取故事大纲与时间线 */
export async function analyzePlot(novelContent: string) {
  return chatCompletion(
    [
      {
        role: "system",
        content: `你是一位资深的剧本分析师。请通读以下小说内容，完成以下任务：
1. 提取核心故事大纲（包含起因、发展、高潮、结局）
2. 梳理全局时间线（按时间顺序列出关键事件节点）
3. 识别主要剧情冲突与转折点

请以 JSON 格式输出，结构如下：
{
  "outline": { "opening": "...", "development": "...", "climax": "...", "ending": "..." },
  "timeline": [{ "order": 1, "event": "...", "chapter": "..." }],
  "conflicts": [{ "type": "...", "description": "...", "parties": ["..."] }]
}`,
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

/** Agent 4: 剧本主笔 — 生成场景剧本 YAML */
export async function writeScript(
  sceneInfo: any,
  charactersInScene: any[]
) {
  return chatCompletion(
    [
      {
        role: "system",
        content: `你是一位专业的影视编剧。请根据场景信息和在场角色，为该场景撰写标准剧本。

在场角色档案：
${JSON.stringify(charactersInScene)}

输出要求：
- 严格按照标准剧本格式
- 包含动作指示（Action）
- 包含角色对白（Dialogue），对话需符合角色性格
- 包含情绪/语气标注

请以 JSON 输出，格式如下：
{
  "sceneNum": ${sceneInfo.sceneNum},
  "location": "${sceneInfo.location}",
  "timeOfDay": "${sceneInfo.timeOfDay}",
  "script": "[Scene ${sceneInfo.sceneNum} - ${sceneInfo.location} - ${sceneInfo.timeOfDay}]\\n\\n[Action]...\\n\\n[Dialogue]\\n角色名（情绪）: 对白..."
}`,
      },
      {
        role: "user",
        content: `场景信息：${JSON.stringify(sceneInfo)}`,
      },
    ],
    { responseFormat: "json_object" }
  );
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

// --- 多 Agent 编排 ---

export interface AnalysisResult {
  plot: {
    outline: {
      opening: string;
      development: string;
      climax: string;
      ending: string;
    };
    timeline: { order: number; event: string; chapter?: string }[];
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
 * 内置降级策略：如遇安全拦截，自动缩短文本并关闭思维模式重试
 */
export async function runAnalysisPipeline(novelContent: string): Promise<AnalysisResult> {
  // 文本预处理：如果太长，取前 15000 字做分析
  const truncatedContent = novelContent.length > 15000
    ? novelContent.substring(0, 15000) + "\n\n[文本过长，已截取前15000字分析...]"
    : novelContent;

  // 尝试主策略
  try {
    return await _doAnalysis(truncatedContent, { thinking: true });
  } catch (err: any) {
    const msg = err.message || "";

    // 判断是否为安全拦截
    if (msg.includes("安全") || msg.includes("rejected") || msg.includes("high risk") || msg.includes("content_filter")) {
      console.log("  ⚠️ 主策略被安全拦截，尝试降级策略（更短文本 + 关闭思维链）...");

      // 降级策略：更短文本 + 关闭思维模式
      const fallbackContent = truncatedContent.length > 5000
        ? truncatedContent.substring(0, 5000) + "\n\n[安全降级：已截取前5000字]"
        : truncatedContent.substring(0, Math.floor(truncatedContent.length * 0.6));

      try {
        return await _doAnalysis(fallbackContent, { thinking: false });
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
  options: { thinking: boolean }
): Promise<AnalysisResult> {
  // Agent 1: 剧情解构
  console.log("  🧠 Agent 1: 剧情解构中...");
  const plotResponse = await chatCompletion(
    [
      {
        role: "system",
        content: `你是一位资深的剧本分析师。请通读以下小说内容，完成以下任务：
1. 提取核心故事大纲（包含起因、发展、高潮、结局）
2. 梳理全局时间线（按时间顺序列出关键事件节点）
3. 识别主要剧情冲突与转折点

请以 JSON 格式输出，结构如下：
{
  "outline": { "opening": "...", "development": "...", "climax": "...", "ending": "..." },
  "timeline": [{ "order": 1, "event": "...", "chapter": "..." }],
  "conflicts": [{ "type": "...", "description": "...", "parties": ["..."] }]
}`,
      },
      { role: "user", content },
    ],
    { responseFormat: "json_object", thinking: options.thinking }
  );
  const plotData = parseAIJson(plotResponse.content);
  console.log("  ✅ Agent 1 完成");

  // Agent 2: 角色图谱
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
  characters: { name: string; roleType: string; traits: any }[]
): Promise<{ scenes: GeneratedScene[]; scripts: GeneratedScript[] }> {
  let truncatedContent = novelContent.length > 12000
    ? novelContent.substring(0, 12000) + "\n\n[文本截取]"
    : novelContent;

  const charSummary = characters.map((c) => ({
    name: c.name,
    roleType: c.roleType,
    personality: c.traits?.personality || [],
  }));

  // Agent 3: 场景规划（带降级）
  let sceneData: any;
  try {
    console.log("  🎬 Agent 3: 场景规划中...");
    const sceneResponse = await planScenes(truncatedContent, charSummary);
    sceneData = parseAIJson(sceneResponse.content);
    console.log(`  ✅ Agent 3 完成 (${sceneData.scenes?.length || 0} 个场景)`);
  } catch (err: any) {
    const msg = err.message || "";
    if (msg.includes("安全") || msg.includes("rejected") || msg.includes("high risk")) {
      console.log("  ⚠️ 场景规划被拦截，尝试更短文本...");
      truncatedContent = truncatedContent.substring(0, Math.floor(truncatedContent.length * 0.5));
      const retryResponse = await planScenes(truncatedContent, charSummary);
      sceneData = parseAIJson(retryResponse.content);
      console.log(`  ✅ Agent 3 降级完成 (${sceneData.scenes?.length || 0} 个场景)`);
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
  const scripts: GeneratedScript[] = [];
  for (const scene of scenes) {
    const sceneChars = characters.filter((c) =>
      scene.characterNames.some((n: string) => n.includes(c.name) || c.name.includes(n))
    );
    if (sceneChars.length === 0 && characters.length > 0) {
      sceneChars.push(...characters.slice(0, 2)); // fallback: 前2个角色
    }

    console.log(`  ✍️ Agent 4: 生成场景 ${scene.sceneNum} 剧本...`);
    try {
      const scriptResponse = await writeScript(scene, sceneChars);
      const scriptData = parseAIJson(scriptResponse.content);
      console.log(`  ✅ 场景 ${scene.sceneNum} 剧本完成`);

      scripts.push({
        sceneNum: scene.sceneNum,
        location: scene.location,
        timeOfDay: scene.timeOfDay,
        scriptYaml: scriptData.script || JSON.stringify(scriptData),
      });
    } catch (err: any) {
      const msg = err.message || "";
      if (msg.includes("安全") || msg.includes("rejected") || msg.includes("high risk")) {
        console.log(`  ⚠️ 场景 ${scene.sceneNum} 被安全拦截，使用占位剧本`);
        scripts.push({
          sceneNum: scene.sceneNum,
          location: scene.location,
          timeOfDay: scene.timeOfDay,
          scriptYaml: `# ⚠️ 该场景因内容安全审核未通过，未能生成剧本\n# 请尝试缩短原文章节后重试\nscene:\n  number: ${scene.sceneNum}\n  location: "${scene.location}"\n  time_of_day: "${scene.timeOfDay}"\n  script: "# 待生成"\n`,
        });
      } else {
        throw err;
      }
    }
  }

  return { scenes, scripts };
}

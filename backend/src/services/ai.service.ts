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
  return {
    content: choice.message.content || "",
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
 */
export async function runAnalysisPipeline(novelContent: string): Promise<AnalysisResult> {
  // 文本预处理：如果太长，取前 15000 字做分析
  const truncatedContent = novelContent.length > 15000
    ? novelContent.substring(0, 15000) + "\n\n[文本过长，已截取前15000字分析...]"
    : novelContent;

  // Agent 1: 剧情解构
  console.log("  🧠 Agent 1: 剧情解构中...");
  const plotResponse = await analyzePlot(truncatedContent);
  const plotData = parseAIJson(plotResponse.content);
  console.log("  ✅ Agent 1 完成");

  // Agent 2: 角色图谱
  console.log("  🧠 Agent 2: 角色提取中...");
  const charResponse = await analyzeCharacters(truncatedContent);
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
 */
export async function runScriptGenerationPipeline(
  novelContent: string,
  characters: { name: string; roleType: string; traits: any }[]
): Promise<{ scenes: GeneratedScene[]; scripts: GeneratedScript[] }> {
  const truncatedContent = novelContent.length > 12000
    ? novelContent.substring(0, 12000) + "\n\n[文本截取]"
    : novelContent;

  const charSummary = characters.map((c) => ({
    name: c.name,
    roleType: c.roleType,
    personality: c.traits?.personality || [],
  }));

  // Agent 3: 场景规划
  console.log("  🎬 Agent 3: 场景规划中...");
  const sceneResponse = await planScenes(truncatedContent, charSummary);
  const sceneData = parseAIJson(sceneResponse.content);
  console.log(`  ✅ Agent 3 完成 (${sceneData.scenes?.length || 0} 个场景)`);

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
    const scriptResponse = await writeScript(scene, sceneChars);
    const scriptData = parseAIJson(scriptResponse.content);
    console.log(`  ✅ 场景 ${scene.sceneNum} 剧本完成`);

    scripts.push({
      sceneNum: scene.sceneNum,
      location: scene.location,
      timeOfDay: scene.timeOfDay,
      scriptYaml: scriptData.script || JSON.stringify(scriptData),
    });
  }

  return { scenes, scripts };
}

import { chatCompletion, parseAIJson } from "./ai.service";
import { splitChapters, ChapterChunk } from "../utils/text-processor";
import type { PipelineProgress, ProgressCallback } from "./ai.service";

// ─── 类型定义 ──────────────────────────────────────────

interface CharacterFromAI {
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
}

interface PlotFromAI {
  outline: {
    opening: string;
    development: string;
    climax: string;
    ending: string;
  };
  timeline: { order: number; event: string; chapter?: string; timeHint?: string; location?: string; characters?: string[]; keywords?: string[] }[];
  conflicts: { type: string; description: string; parties: string[] }[];
}

interface WindowResult {
  windowIndex: number;
  plot: PlotFromAI;
  characters: CharacterFromAI[];
  keyEventsSummary: string; // 1-2 句关键事件摘要，用于传递给下一窗口
}

interface AnalysisWindow {
  index: number;
  totalWindows: number;
  chapters: ChapterChunk[];
  content: string;
  context: WindowContext;
}

interface WindowContext {
  previousCharacters: { name: string; roleType: string }[];
  previousEventsSummary: string;
}

// ─── 滑动窗口构建 ──────────────────────────────────────

/**
 * 将章节列表构建为滑动窗口
 * 每窗 ≤ 12000 字，相邻窗口重叠 1 个章节
 */
function buildSlidingWindows(
  chapters: ChapterChunk[],
  maxWindowChars: number = 12000
): AnalysisWindow[] {
  if (chapters.length === 0) return [];

  const totalWindows = Math.ceil(
    chapters.reduce((sum, c) => sum + c.content.length, 0) / maxWindowChars
  ) || 1;

  const windows: AnalysisWindow[] = [];
  let currentChapters: ChapterChunk[] = [];
  let currentLength = 0;
  let lastChapter: ChapterChunk | null = null; // 上一窗口的最后一个章节（用于重叠）

  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];

    // 重叠：如果上一窗口有结尾章节且当前窗口为空，先加入
    if (currentChapters.length === 0 && lastChapter && i > 0) {
      currentChapters.push(lastChapter);
      currentLength += lastChapter.content.length;
    }

    currentChapters.push(ch);
    currentLength += ch.content.length;

    // 达到窗口大小限制或已是最后一章
    const isLast = i === chapters.length - 1;
    if (currentLength >= maxWindowChars || isLast) {
      const context: WindowContext = {
        previousCharacters: [],
        previousEventsSummary: windows.length === 0 ? "这是小说的开头。" : "",
      };

      windows.push({
        index: windows.length,
        totalWindows: 0, // 稍后更新
        chapters: [...currentChapters],
        content: currentChapters
          .map((c) => `\n${c.title}\n${c.content}`)
          .join("\n")
          .trim(),
        context,
      });

      // 保存最后一个章节用于下一窗口的重叠
      lastChapter = currentChapters[currentChapters.length - 1];
      currentChapters = [];
      currentLength = 0;
    }
  }

  // 更新 totalWindows
  for (const w of windows) {
    w.totalWindows = windows.length;
  }

  return windows;
}

// ─── 单窗口分析 ────────────────────────────────────────

const CHUNK_ANALYSIS_SYSTEM_PROMPT = `你是一位资深的剧本分析师。请通读以下小说片段，完成以下任务：

1. 提取该片段的剧情大纲（起因、发展、高潮、结局 — 仅基于本片段内容）
2. 梳理该片段的时间线（按时间顺序列出关键事件节点，每个节点标注时间提示、地点、涉及角色、搜索关键词）
3. 识别该片段的剧情冲突与转折点（冲突参与方必须是原文中有姓名的具体人物，禁止使用"命运""社会""环境"等抽象概念）
4. 提取该片段中出现的所有角色信息

{contextSection}

请以 JSON 格式输出：
{
  "plot": {
    "outline": { "opening": "...", "development": "...", "climax": "...", "ending": "..." },
    "timeline": [
      {
        "order": 1,
        "event": "事件简述（一句话）",
        "chapter": "所在章节名",
        "timeHint": "原文时间提示（如'三天后''当夜'），无则填null",
        "location": "事件地点，无则填null",
        "characters": ["参与角色名"],
        "keywords": ["搜索关键词"]
      }
    ],
    "conflicts": [{ "type": "人物冲突", "description": "...", "parties": ["角色A", "角色B"] }]
  },
  "characters": [
    {
      "name": "角色姓名",
      "aliases": ["别名1"],
      "roleType": "主角/配角/反派/路人",
      "traits": {
        "identity": "身份背景",
        "personality": ["性格标签"],
        "goal": "当前阶段目标",
        "motivation": "行为动机",
        "relationships": [{"with": "关联角色", "relation": "关系描述"}]
      }
    }
  ],
  "keyEventsSummary": "用1-2句话总结本片段最关键的剧情事件，用于传递给下一个分析窗口作为上下文。"
}

重要提示：
- 如果上文已列出角色，请不要重复创建同名角色。只提取本片段新出现的角色。
- 若角色在前文已出现但本片段展现了新的性格/关系，在 traits 中补充即可。`;

async function analyzeWindow(
  window: AnalysisWindow,
  onProgress?: ProgressCallback
): Promise<WindowResult> {
  const progress = (event: PipelineProgress) => onProgress?.(event);

  // 构建上下文段落
  let contextSection = "";
  if (window.context.previousCharacters.length > 0) {
    const charList = window.context.previousCharacters
      .map((c) => `${c.name}(${c.roleType})`)
      .join("、");
    contextSection = `
[上文上下文]
已出场角色：${charList}
上部分关键事件：${window.context.previousEventsSummary}
注意：请不要重复提取上述已出场角色，仅提取本片段新出现的角色。`;
  } else {
    contextSection = `[提示] 这是小说分析的第 1/${window.totalWindows} 个片段，请完整提取角色和剧情。`;
  }

  const systemPrompt = CHUNK_ANALYSIS_SYSTEM_PROMPT.replace(
    "{contextSection}",
    contextSection
  );

  console.log(`  🧠 分块分析 窗${window.index + 1}/${window.totalWindows} (${window.content.length} 字)...`);
  progress?.({
    stage: "chunk_analyze",
    progress: Math.round(((window.index + 1) / window.totalWindows) * 100),
    message: `📖 正在分析第 ${window.index + 1}/${window.totalWindows} 块...`,
    detail: `${window.chapters[0]?.title || ""} — ${window.chapters[window.chapters.length - 1]?.title || ""}`,
    stats: { currentWindow: window.index + 1, totalWindows: window.totalWindows },
  });

  const response = await chatCompletion(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: window.content },
    ],
    { responseFormat: "json_object", thinking: true, maxTokens: 8192 }
  );

  const data = parseAIJson(response.content);

  const plot: PlotFromAI = {
    outline: data.plot?.outline || { opening: "", development: "", climax: "", ending: "" },
    timeline: data.plot?.timeline || [],
    conflicts: data.plot?.conflicts || [],
  };

  const characters: CharacterFromAI[] = (data.characters || []).map((c: any) => ({
    name: c.name || "未知角色",
    aliases: c.aliases || [],
    roleType: c.roleType || "配角",
    traits: {
      identity: c.traits?.identity || "",
      personality: c.traits?.personality || [],
      goal: c.traits?.goal || "",
      motivation: c.traits?.motivation || "",
      relationships: c.traits?.relationships || [],
    },
  }));

  console.log(`  ✅ 窗${window.index + 1} 完成: ${characters.length} 个角色, ${plot.timeline.length} 个事件`);

  return {
    windowIndex: window.index,
    plot,
    characters,
    keyEventsSummary: data.keyEventsSummary || "",
  };
}

// ─── 角色去重 ──────────────────────────────────────────

/**
 * 简单的 Levenshtein 距离计算
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/**
 * 合并多个窗口的角色列表，去重
 */
function deduplicateCharacters(allResults: WindowResult[]): CharacterFromAI[] {
  const merged: CharacterFromAI[] = [];

  for (const result of allResults) {
    for (const char of result.characters) {
      // 1. 精确同名检查
      const exactMatch = merged.find(
        (m) => m.name === char.name
      );
      if (exactMatch) {
        // 合并 traits：取更详细的信息
        if (!exactMatch.traits.identity && char.traits.identity) {
          exactMatch.traits.identity = char.traits.identity;
        }
        if (char.traits.personality.length > exactMatch.traits.personality.length) {
          exactMatch.traits.personality = char.traits.personality;
        }
        if (!exactMatch.traits.goal && char.traits.goal) {
          exactMatch.traits.goal = char.traits.goal;
        }
        if (!exactMatch.traits.motivation && char.traits.motivation) {
          exactMatch.traits.motivation = char.traits.motivation;
        }
        // 合并别名
        for (const alias of char.aliases) {
          if (!exactMatch.aliases.includes(alias)) {
            exactMatch.aliases.push(alias);
          }
        }
        // 合并关系
        for (const rel of char.traits.relationships) {
          const exists = exactMatch.traits.relationships.some(
            (r) => r.with === rel.with && r.relation === rel.relation
          );
          if (!exists) {
            exactMatch.traits.relationships.push(rel);
          }
        }
        continue;
      }

      // 2. 别名交叉检查
      const aliasMatch = merged.find(
        (m) =>
          m.aliases.includes(char.name) ||
          char.aliases.includes(m.name)
      );
      if (aliasMatch) {
        if (!aliasMatch.aliases.includes(char.name)) {
          aliasMatch.aliases.push(char.name);
        }
        for (const alias of char.aliases) {
          if (!aliasMatch.aliases.includes(alias)) {
            aliasMatch.aliases.push(alias);
          }
        }
        continue;
      }

      // 3. 模糊匹配 (> 0.8 相似度且角色类型一致)
      const fuzzyMatch = merged.find(
        (m) =>
          similarity(m.name, char.name) > 0.8 &&
          m.roleType === char.roleType
      );
      if (fuzzyMatch) {
        console.log(`  🔗 模糊匹配合并: "${fuzzyMatch.name}" ↔ "${char.name}"`);
        continue;
      }

      // 无匹配，新增
      merged.push(char);
    }
  }

  return merged;
}

// ─── 剧情合并 ──────────────────────────────────────────

function mergePlots(allResults: WindowResult[]): PlotFromAI {
  const allTimeline: PlotFromAI["timeline"] = [];
  const allConflicts: PlotFromAI["conflicts"] = [];
  const outlines: PlotFromAI["outline"][] = [];

  let globalOrder = 0;
  for (const result of allResults) {
    outlines.push(result.plot.outline);

    for (const event of result.plot.timeline) {
      allTimeline.push({
        ...event,
        order: ++globalOrder,
      });
    }

    for (const conflict of result.plot.conflicts) {
      // 冲突去重：检查是否已有相同描述
      const exists = allConflicts.some(
        (c) =>
          c.description === conflict.description &&
          JSON.stringify(c.parties.sort()) === JSON.stringify(conflict.parties.sort())
      );
      if (!exists) {
        allConflicts.push(conflict);
      }
    }
  }

  // 大纲合并：取第一个的 opening、最后一个的 ending
  const firstOutline = outlines[0] || { opening: "", development: "", climax: "", ending: "" };
  const lastOutline = outlines[outlines.length - 1] || firstOutline;
  const midOutlines = outlines.slice(1, -1);

  const mergedOutline = {
    opening: firstOutline.opening || "（待生成）",
    development:
      [firstOutline.development, ...midOutlines.map((o) => o.development), lastOutline.development]
        .filter(Boolean)
        .join("；") || "（待生成）",
    climax: lastOutline.climax || firstOutline.climax || "（待生成）",
    ending: lastOutline.ending || "（待生成 — 小说可能尚未完结）",
  };

  return {
    outline: mergedOutline,
    timeline: allTimeline,
    conflicts: allConflicts,
  };
}

// ─── 全局一致性检查 ────────────────────────────────────

async function globalConsistencyCheck(
  mergedPlot: PlotFromAI,
  mergedCharacters: CharacterFromAI[],
  onProgress?: ProgressCallback
): Promise<PlotFromAI> {
  const progress = (event: PipelineProgress) => onProgress?.(event);

  progress?.({
    stage: "merging",
    progress: 95,
    message: "🔍 正在进行全局一致性检查...",
    detail: `验证 ${mergedCharacters.length} 个角色、${mergedPlot.timeline.length} 个事件`,
    stats: { characters: mergedCharacters.length },
  });

  const charSummary = mergedCharacters.map((c) => ({
    name: c.name,
    roleType: c.roleType,
    aliases: c.aliases,
  }));

  try {
    const response = await chatCompletion(
      [
        {
          role: "system",
          content: `你是一位资深剧本编辑，负责检查由多个片段合并而成的小说分析结果的一致性。

请检查以下内容：
1. 角色一致性：是否有同名不同人的角色？是否有同一角色被多次创建？
2. 时间线连续性：事件顺序是否合理？是否有跳跃或矛盾？
3. 大纲完整性：四段结构（起因-发展-高潮-结局）是否连贯？

请以 JSON 格式输出修正后的结果：
{
  "outline": { "opening": "...", "development": "...", "climax": "...", "ending": "..." },
  "timeline": [{ "order": 1, "event": "...", "chapter": "...", "timeHint": "...", "location": "...", "characters": ["..."], "keywords": ["..."] }],
  "conflicts": [{ "type": "人物冲突", "description": "...", "parties": ["角色A", "角色B"] }],
  "consistencyNotes": "一致性检查备注"
}`,
        },
        {
          role: "user",
          content: JSON.stringify({
            mergedPlot,
            characters: charSummary,
          }),
        },
      ],
      { responseFormat: "json_object", thinking: false, maxTokens: 4096 }
    );

    const data = parseAIJson(response.content);

    if (data.consistencyNotes) {
      console.log(`  📋 一致性备注: ${data.consistencyNotes}`);
    }

    return {
      outline: data.outline || mergedPlot.outline,
      timeline: data.timeline || mergedPlot.timeline,
      conflicts: data.conflicts || mergedPlot.conflicts,
    };
  } catch (err) {
    console.log("  ⚠️ 全局一致性检查失败，使用原始合并结果");
    return mergedPlot;
  }
}

// ─── 主入口：分块分析流水线 ───────────────────────────

export interface ChunkedAnalysisResult {
  plot: PlotFromAI;
  characters: CharacterFromAI[];
  totalWindows: number;
  totalChapters: number;
}

/**
 * 对长篇小说执行分块分析流水线
 * 自动按章节构建滑动窗口 → 逐窗分析 → 合并 → 全局一致性检查
 */
export async function runChunkedAnalysisPipeline(
  novelContent: string,
  onProgress?: ProgressCallback
): Promise<ChunkedAnalysisResult> {
  const progress = (event: PipelineProgress) => onProgress?.(event);

  // Phase 1: 章节检测 + 构建滑动窗口
  progress?.({
    stage: "chunking",
    progress: 0,
    message: "📚 正在检测章节并构建分析窗口...",
  });

  const chapters = splitChapters(novelContent);
  const windows = buildSlidingWindows(chapters, 12000);

  console.log(`📚 分块分析: ${chapters.length} 个章节 → ${windows.length} 个分析窗口`);
  progress?.({
    stage: "chunking",
    progress: 5,
    message: `📚 识别到 ${chapters.length} 个章节，分为 ${windows.length} 个分析窗口`,
    detail: chapters.map((c) => c.title).join(" → ").substring(0, 100),
    stats: { totalChapters: chapters.length, totalWindows: windows.length },
  });

  // Phase 2: 逐窗分析
  const windowResults: WindowResult[] = [];
  let accumulatedCharacters: { name: string; roleType: string }[] = [];
  let accumulatedSummary = "";

  for (let i = 0; i < windows.length; i++) {
    const win = windows[i];

    // 注入上下文
    win.context.previousCharacters = [...accumulatedCharacters];
    win.context.previousEventsSummary = accumulatedSummary || "这是小说的开头。";

    const result = await analyzeWindow(win, onProgress);
    windowResults.push(result);

    // 更新累积状态
    const newChars = result.characters.filter(
      (c) => !accumulatedCharacters.some((a) => a.name === c.name)
    );
    accumulatedCharacters.push(
      ...newChars.map((c) => ({ name: c.name, roleType: c.roleType }))
    );
    accumulatedSummary = result.keyEventsSummary || accumulatedSummary;
  }

  // Phase 3: 合并
  progress?.({
    stage: "merging",
    progress: 85,
    message: "🔗 正在合并各窗口分析结果...",
    detail: `去重 ${windowResults.reduce((s, r) => s + r.characters.length, 0)} 个角色条目`,
  });

  const mergedCharacters = deduplicateCharacters(windowResults);
  const mergedPlot = mergePlots(windowResults);

  console.log(
    `🔗 合并完成: ${mergedCharacters.length} 个角色, ${mergedPlot.timeline.length} 个事件, ${mergedPlot.conflicts.length} 个冲突`
  );

  // Phase 4: 全局一致性检查（仅在多窗口时执行）
  let finalPlot = mergedPlot;
  if (windows.length > 1) {
    finalPlot = await globalConsistencyCheck(mergedPlot, mergedCharacters, onProgress);
  }

  progress?.({
    stage: "characters",
    progress: 30,
    message: `✅ 分块分析完成`,
    detail: `${mergedCharacters.length} 个角色, ${finalPlot.timeline.length} 个事件`,
    stats: { characters: mergedCharacters.length },
  });

  return {
    plot: finalPlot,
    characters: mergedCharacters,
    totalWindows: windows.length,
    totalChapters: chapters.length,
  };
}

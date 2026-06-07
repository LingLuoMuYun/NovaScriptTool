import { z } from "zod";

// ─── 剧本内容块（按时间顺序排列） ──────────────────────

/** 动作指示块：描述场景中发生的动作、画面 */
export const ActionBlock = z.object({
  type: z.literal("action"),
  text: z.string().min(1, "动作描述不能为空"),
});

/** 对白块：角色的对话台词 */
export const DialogueBlock = z.object({
  type: z.literal("dialogue"),
  character: z.string().min(1, "说话角色名不能为空"),
  emotion: z.string().optional().default(""),
  line: z.string().min(1, "对白内容不能为空"),
});

/** 转场块：场景结束时的转场指令 */
export const TransitionBlock = z.object({
  type: z.literal("transition"),
  text: z.string().min(1, "转场指令不能为空"),
});

/** 所有内容块类型的判别联合 */
export const ContentBlock = z.discriminatedUnion("type", [
  ActionBlock,
  DialogueBlock,
  TransitionBlock,
]);

// ─── 完整场景剧本 ──────────────────────────────────────

/** 一个场景的完整结构化剧本 */
export const ScriptSchema = z.object({
  sceneNum: z.number().int().positive("场景编号必须为正整数"),
  location: z.string().min(1, "场景地点不能为空"),
  timeOfDay: z.enum(["日", "夜", "黄昏", "黎明", "清晨", "下午", "深夜"]),
  indoor: z.boolean(),
  charactersInScene: z
    .array(z.string())
    .min(1, "至少需要一个出场角色"),
  content: z
    .array(ContentBlock)
    .min(1, "剧本内容不能为空"),
});

// ─── 导出类型 ──────────────────────────────────────────

export type ScriptOutput = z.infer<typeof ScriptSchema>;
export type ContentBlockType = z.infer<typeof ContentBlock>;
export type ActionBlockType = z.infer<typeof ActionBlock>;
export type DialogueBlockType = z.infer<typeof DialogueBlock>;
export type TransitionBlockType = z.infer<typeof TransitionBlock>;

// ─── 校验结果 ──────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  script?: ScriptOutput;
}

/**
 * 校验 AI 输出的 JSON 是否符合标准剧本 Schema
 * 返回详细的校验结果，包含中文错误信息
 */
export function validateScript(data: unknown): ValidationResult {
  const result = ScriptSchema.safeParse(data);

  if (result.success) {
    return { valid: true, errors: [], script: result.data };
  }

  const errors = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "根对象";
    return `${path}: ${issue.message}`;
  });

  return { valid: false, errors };
}

/**
 * 尝试将旧格式（自由文本）解析为结构化数据
 * 仅做尽力而为的提取，不会报错
 */
export function parseLegacyScript(yamlContent: string): ScriptOutput | null {
  try {
    // 尝试作为 JSON 解析
    const parsed = JSON.parse(yamlContent);
    const result = validateScript(parsed);
    if (result.valid) return result.script!;
    return null;
  } catch {
    // 旧格式自由文本，尝试提取角色名和关键词
    const characterMatches = yamlContent.match(/角色名[：:]\s*(.+)/g) || [];
    const characters = characterMatches.map((m) =>
      m.replace(/角色名[：:]\s*/, "").trim()
    );

    const lines = yamlContent.split("\n").filter(Boolean);
    const content: ContentBlockType[] = [];
    let currentText = "";

    for (const line of lines) {
      if (line.startsWith("[Action]") || line.startsWith("Action:")) {
        if (currentText) {
          content.push({ type: "action", text: currentText.trim() } as const);
          currentText = "";
        }
        currentText = line.replace(/\[Action\]|Action:/, "").trim();
      } else if (line.startsWith("[Dialogue]") || line.startsWith("Dialogue:")) {
        if (currentText) {
          content.push({ type: "action", text: currentText.trim() } as const);
          currentText = "";
        }
        const dialogueLine = line.replace(/\[Dialogue\]|Dialogue:/, "").trim();
        const match = dialogueLine.match(/^(.+?)[（(](.+?)[)）][:：]\s*(.+)/);
        if (match) {
          content.push({
            type: "dialogue",
            character: match[1].trim(),
            emotion: match[2].trim(),
            line: match[3].trim(),
          } as const);
        } else {
          // 简单格式: "角色名: 对白"
          const simpleMatch = dialogueLine.match(/^(.+?)[:：]\s*(.+)/);
          if (simpleMatch) {
            content.push({
              type: "dialogue",
              character: simpleMatch[1].trim(),
              emotion: "",
              line: simpleMatch[2].trim(),
            } as const);
          } else {
            content.push({
              type: "action",
              text: dialogueLine,
            } as const);
          }
        }
      } else {
        if (currentText) currentText += "\n";
        currentText += line;
      }
    }

    if (currentText.trim()) {
      content.push({ type: "action", text: currentText.trim() } as const);
    }

    if (content.length === 0) return null;

    return {
      sceneNum: 0,
      location: "",
      timeOfDay: "日",
      indoor: true,
      charactersInScene: characters.length > 0 ? characters : ["未知角色"],
      content,
    };
  }
}

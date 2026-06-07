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

// ─── 语义校验 ──────────────────────────────────────────

export interface SemanticIssue {
  rule: string;        // 规则编号
  severity: "error" | "warning";
  path: string;        // 如 "content[2].line"
  message: string;     // 中文描述
  fix?: string;        // 可选修复建议
}

/**
 * Layer 2 语义校验：在 Zod 结构校验通过后，检查剧本的业务规则
 *
 * 规则集：
 *   R001 - 转场结尾：content 最后一条必须是 transition（error）
 *   R002 - 对白角色在场：dialogue.character 必须在 charactersInScene 中（error）
 *   R003 - 动作丰满度：action.text ≥ 5 chars（warning）
 *   R004 - 块交替：连续 ≥3 条同类型块产生警告（warning）
 *   R005 - 角色出场无对白：charactersInScene 中角色无 dialogue（warning）
 *   R006 - 空场景：content 仅含 transition → 警告（warning）
 */
export function validateSemantics(
  script: ScriptOutput,
  allKnownCharacters?: string[]
): SemanticIssue[] {
  const issues: SemanticIssue[] = [];
  const { content, charactersInScene } = script;

  if (!content || content.length === 0) {
    issues.push({
      rule: "R006",
      severity: "warning",
      path: "content",
      message: "剧本内容为空",
    });
    return issues;
  }

  // R001: 转场结尾 — 最后一条必须是 transition
  const lastBlock = content[content.length - 1];
  if (lastBlock.type !== "transition") {
    issues.push({
      rule: "R001",
      severity: "error",
      path: `content[${content.length - 1}]`,
      message: `场景结尾必须是转场指令（transition），当前为 "${lastBlock.type}"`,
      fix: '在末尾添加转场块，如: { "type": "transition", "text": "CUT TO:" }',
    });
  }

  // R006: 空场景 — content 仅含 transition
  const nonTransitionBlocks = content.filter((b) => b.type !== "transition");
  if (nonTransitionBlocks.length === 0) {
    issues.push({
      rule: "R006",
      severity: "warning",
      path: "content",
      message: "剧本仅包含转场指令，缺少动作和对白内容",
    });
  }

  // 逐块检查
  const charDialogueMap = new Map<string, boolean>();
  let consecutiveCount = 0;
  let lastType = "";

  for (let i = 0; i < content.length; i++) {
    const block = content[i];

    // R003: 动作丰满度
    if (block.type === "action" && block.text.trim().length < 5) {
      issues.push({
        rule: "R003",
        severity: "warning",
        path: `content[${i}].text`,
        message: `动作描述过短（${block.text.length} 字），建议丰富场景细节`,
      });
    }

    // R002 + dialogue tracking
    if (block.type === "dialogue") {
      charDialogueMap.set(block.character, true);

      // R002: 对白角色必须在 charactersInScene 中
      if (
        charactersInScene.length > 0 &&
        !charactersInScene.includes(block.character)
      ) {
        issues.push({
          rule: "R002",
          severity: "error",
          path: `content[${i}].character`,
          message: `角色 "${block.character}" 在对白中出现，但未在 charactersInScene 中声明`,
          fix: `将 "${block.character}" 添加到 charactersInScene 列表中`,
        });
      }

      // 对白丰满度
      if (block.line.trim().length < 2) {
        issues.push({
          rule: "R003",
          severity: "warning",
          path: `content[${i}].line`,
          message: `对白过短（${block.line.length} 字），建议丰富台词内容`,
        });
      }
    }

    // R004: 块交替 — 连续同类型块
    if (block.type === lastType && block.type !== "transition") {
      consecutiveCount++;
    } else {
      consecutiveCount = 1;
      lastType = block.type;
    }
    if (consecutiveCount >= 3) {
      // 避免重复报告同一段连续块
      if (consecutiveCount === 3) {
        issues.push({
          rule: "R004",
          severity: "warning",
          path: `content[${i - 2}] ~ content[${i}]`,
          message: `连续 ${consecutiveCount} 个 "${block.type === "dialogue" ? "对白" : "动作"}" 块，建议穿插动作/对白以增强节奏感`,
        });
      }
    }
  }

  // R005: 角色出场但无对白
  for (const charName of charactersInScene) {
    if (!charDialogueMap.has(charName)) {
      issues.push({
        rule: "R005",
        severity: "warning",
        path: "charactersInScene",
        message: `角色 "${charName}" 在出场列表中但没有任何对白`,
        fix: `为 "${charName}" 添加对白，或将其从 charactersInScene 中移除`,
      });
    }
  }

  // 跨角色一致性检查（如果提供了 knownCharacters）
  if (allKnownCharacters && allKnownCharacters.length > 0) {
    for (const charName of charactersInScene) {
      if (!allKnownCharacters.includes(charName)) {
        issues.push({
          rule: "R007",
          severity: "warning",
          path: "charactersInScene",
          message: `角色 "${charName}" 不在小说已提取的角色列表中，可能是新角色或拼写错误`,
        });
      }
    }
    // 也检查对白中的角色
    for (let i = 0; i < content.length; i++) {
      const block = content[i];
      if (block.type === "dialogue" && !allKnownCharacters.includes(block.character)) {
        issues.push({
          rule: "R007",
          severity: "warning",
          path: `content[${i}].character`,
          message: `对白角色 "${block.character}" 不在小说已提取的角色列表中`,
        });
      }
    }
  }

  return issues;
}

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

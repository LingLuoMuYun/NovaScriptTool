"use client";

import { useState, useCallback, useMemo } from "react";

// ─── 类型 ─────────────────────────────────────────

interface ContentBlock {
  type: "action" | "dialogue" | "transition";
  text?: string;
  character?: string;
  emotion?: string;
  line?: string;
}

interface ScriptData {
  sceneNum?: number;
  location?: string;
  timeOfDay?: string;
  indoor?: boolean;
  charactersInScene?: string[];
  content: ContentBlock[];
}

interface ScriptBlockEditorProps {
  /** 当前剧本 JSON 字符串 */
  value: string;
  /** 内容变更回调 */
  onChange: (json: string) => void;
  /** 可用角色名列表 */
  characterNames?: string[];
  /** 只读模式 */
  readOnly?: boolean;
}

const TIME_OPTIONS = ["日", "夜", "黄昏", "清晨", "黎明", "下午", "深夜"];
const EMOTION_OPTIONS = ["", "平静", "愤怒", "悲伤", "焦急", "兴奋", "冷漠", "温柔", "严肃", "幽默", "恐惧", "疑惑", "坚定", "轻蔑"];

// ─── 解析 & 序列化 ───────────────────────────────

function parseScript(raw: string): ScriptData | null {
  try {
    const data = JSON.parse(raw);
    if (data && Array.isArray(data.content)) return data as ScriptData;
    return null;
  } catch {
    return null;
  }
}

function serializeScript(data: ScriptData): string {
  return JSON.stringify(data, null, 2);
}

// ─── 空块模板 ─────────────────────────────────────

function newBlock(type: ContentBlock["type"]): ContentBlock {
  switch (type) {
    case "action":
      return { type: "action", text: "" };
    case "dialogue":
      return { type: "dialogue", character: "", emotion: "", line: "" };
    case "transition":
      return { type: "transition", text: "CUT TO:" };
  }
}

// ─── 组件 ─────────────────────────────────────────

export default function ScriptBlockEditor({
  value,
  onChange,
  characterNames = [],
  readOnly = false,
}: ScriptBlockEditorProps) {
  const [error, setError] = useState("");

  const script = parseScript(value);

  // ─── 本地实时校验 ──────────────────────────────
  // ⚠️ useMemo 必须在条件 return 之前调用，否则 hooks 数量不一致会触发
  //    "Rendered more hooks than during the previous render" 错误

  const validation = useMemo(() => {
    if (!script) return null;
    const issues: { rule: string; severity: "error" | "warning"; path: string; message: string }[] = [];
    const { content, charactersInScene } = script;
    if (!content || content.length === 0) return { errors: 0, warnings: 0, issues };

    // R001: 转场结尾
    if (content[content.length - 1].type !== "transition") {
      issues.push({ rule: "R001", severity: "error", path: `content[${content.length - 1}]`, message: "场景结尾必须是转场指令" });
    }
    // R006: 空场景
    if (content.filter((b) => b.type !== "transition").length === 0) {
      issues.push({ rule: "R006", severity: "warning", path: "content", message: "剧本仅包含转场指令" });
    }

    const charDialogueMap = new Map<string, boolean>();
    let consecutiveCount = 0, lastType = "";
    for (let i = 0; i < content.length; i++) {
      const b = content[i];
      if (b.type === "action" && (b.text || "").trim().length < 5) {
        issues.push({ rule: "R003", severity: "warning", path: `content[${i}]`, message: "动作描述过短" });
      }
      if (b.type === "dialogue") {
        charDialogueMap.set(b.character || "", true);
        if (charactersInScene && charactersInScene.length > 0 && !(charactersInScene.includes(b.character || ""))) {
          issues.push({ rule: "R002", severity: "error", path: `content[${i}]`, message: `"${b.character}" 未在出场角色中声明` });
        }
        if ((b.line || "").trim().length < 2) {
          issues.push({ rule: "R003", severity: "warning", path: `content[${i}]`, message: "对白过短" });
        }
      }
      if (b.type === lastType && b.type !== "transition") consecutiveCount++;
      else { consecutiveCount = 1; lastType = b.type; }
      if (consecutiveCount >= 3 && consecutiveCount === 3) {
        issues.push({ rule: "R004", severity: "warning", path: `content[${i - 2}]~[${i}]`, message: "连续相同类型块" });
      }
    }
    // R005
    if (charactersInScene) {
      for (const n of charactersInScene) {
        if (!charDialogueMap.has(n)) {
          issues.push({ rule: "R005", severity: "warning", path: "charactersInScene", message: `"${n}" 出场但无对白` });
        }
      }
    }
    const errors = issues.filter((i) => i.severity === "error").length;
    const warnings = issues.filter((i) => i.severity === "warning").length;
    return { errors, warnings, issues };
  }, [script]);

  // 解析失败时的降级：仍然显示原始 textarea
  if (!script) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-3 bg-amber-50 dark:bg-amber-950 border-b border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-300">
          ⚠️ 无法解析剧本结构，使用纯文本编辑模式
        </div>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 resize-none border-0 px-4 py-3 font-mono text-sm leading-relaxed text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-900 focus:outline-none"
          spellCheck={false}
          readOnly={readOnly}
        />
      </div>
    );
  }

  const emit = (data: ScriptData) => {
    try {
      onChange(serializeScript(data));
      setError("");
    } catch (e: any) {
      setError(e.message || "序列化失败");
    }
  };

  // ─── 场景元数据 ──────────────────────────────────

  const updateMeta = <K extends keyof ScriptData>(key: K, val: ScriptData[K]) => {
    emit({ ...script, [key]: val });
  };

  // ─── 内容块操作 ──────────────────────────────────

  const updateBlock = (idx: number, patch: Partial<ContentBlock>) => {
    const newContent = script.content.map((b, i) => (i === idx ? { ...b, ...patch } : b));
    emit({ ...script, content: newContent });
  };

  const deleteBlock = (idx: number) => {
    const newContent = script.content.filter((_, i) => i !== idx);
    emit({ ...script, content: newContent });
  };

  const addBlock = (type: ContentBlock["type"], afterIdx: number) => {
    const newContent = [...script.content];
    newContent.splice(afterIdx + 1, 0, newBlock(type));
    emit({ ...script, content: newContent });
  };

  const moveBlock = (idx: number, direction: -1 | 1) => {
    const target = idx + direction;
    if (target < 0 || target >= script.content.length) return;
    const newContent = [...script.content];
    [newContent[idx], newContent[target]] = [newContent[target], newContent[idx]];
    emit({ ...script, content: newContent });
  };

  // 切换出场角色
  const toggleCharacter = (name: string) => {
    const chars = script.charactersInScene || [];
    if (chars.includes(name)) {
      updateMeta("charactersInScene", chars.filter((c) => c !== name));
    } else {
      updateMeta("charactersInScene", [...chars, name]);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* 场景元数据区（折叠） */}
      <details className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 flex-shrink-0">
        <summary className="px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none">
          🎬 场景信息
          <span className="ml-2 text-gray-300 dark:text-gray-600">
            {script.location || "未设置"} · {script.timeOfDay || "?"} · {script.content.length} 块
          </span>
          {/* 实时校验指示灯 */}
          {validation && (
            <span className="ml-2 inline-flex items-center gap-1">
              {validation.errors > 0 ? (
                <span className="inline-flex items-center gap-0.5 text-red-500 dark:text-red-400" title={`${validation.errors} 个错误`}>
                  🔴 {validation.errors}
                </span>
              ) : validation.warnings > 0 ? (
                <span className="inline-flex items-center gap-0.5 text-amber-500 dark:text-amber-400" title={`${validation.warnings} 个警告`}>
                  🟡 {validation.warnings}
                </span>
              ) : (
                <span className="text-green-500 dark:text-green-400" title="全部通过">🟢</span>
              )}
            </span>
          )}
        </summary>
        <div className="px-4 pb-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-gray-400 dark:text-gray-500 mb-0.5">地点</label>
              <input
                type="text"
                value={script.location || ""}
                onChange={(e) => updateMeta("location", e.target.value)}
                disabled={readOnly}
                className="w-full rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 focus:outline-none disabled:opacity-50"
                placeholder="场景地点"
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-400 dark:text-gray-500 mb-0.5">时间</label>
              <select
                value={script.timeOfDay || "日"}
                onChange={(e) => updateMeta("timeOfDay", e.target.value)}
                disabled={readOnly}
                className="w-full rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 focus:outline-none disabled:opacity-50"
              >
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 出场角色 */}
          <div>
            <label className="block text-[11px] text-gray-400 dark:text-gray-500 mb-1">出场角色</label>
            <div className="flex flex-wrap gap-1.5">
              {characterNames.map((name) => {
                const inScene = (script.charactersInScene || []).includes(name);
                return (
                  <button
                    key={name}
                    onClick={() => !readOnly && toggleCharacter(name)}
                    disabled={readOnly}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition border ${
                      inScene
                        ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700"
                        : "bg-white dark:bg-gray-900 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700 hover:border-indigo-300"
                    } disabled:cursor-default`}
                  >
                    {inScene ? "✓ " : "+ "}{name}
                  </button>
                );
              })}
              {characterNames.length === 0 && (
                <span className="text-xs text-gray-400">暂无角色数据</span>
              )}
            </div>
          </div>
        </div>
      </details>

      {/* 内容块列表 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {script.content.length === 0 && !readOnly && (
          <div className="text-center py-8 text-gray-400 dark:text-gray-500">
            <p className="text-2xl mb-2">📭</p>
            <p className="text-sm">暂无内容块，点击下方按钮添加</p>
          </div>
        )}

        {script.content.map((block, idx) => (
          <BlockCard
            key={idx}
            block={block}
            index={idx}
            total={script.content.length}
            characterNames={characterNames}
            readOnly={readOnly}
            onUpdate={(patch) => updateBlock(idx, patch)}
            onDelete={() => deleteBlock(idx)}
            onAdd={(type) => addBlock(type, idx)}
            onMove={(dir) => moveBlock(idx, dir)}
          />
        ))}
      </div>

      {/* 底部添加按钮 */}
      {!readOnly && (
        <div className="flex-shrink-0 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 px-4 py-2.5 flex items-center gap-2">
          <span className="text-xs text-gray-400 dark:text-gray-500 mr-1">添加：</span>
          <button
            onClick={() => addBlock("action", script.content.length - 1)}
            className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition"
          >
            🎬 动作
          </button>
          <button
            onClick={() => addBlock("dialogue", script.content.length - 1)}
            className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 px-3 py-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition"
          >
            💬 对白
          </button>
          <button
            onClick={() => addBlock("transition", script.content.length - 1)}
            className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 dark:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:bg-gray-950 transition"
          >
            🎞️ 转场
          </button>
        </div>
      )}

      {error && (
        <p className="flex-shrink-0 px-4 py-2 text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950">
          ❌ {error}
        </p>
      )}
    </div>
  );
}

// ─── 单块卡片 ─────────────────────────────────────

function BlockCard({
  block,
  index,
  total,
  characterNames,
  readOnly,
  onUpdate,
  onDelete,
  onAdd,
  onMove,
}: {
  block: ContentBlock;
  index: number;
  total: number;
  characterNames: string[];
  readOnly: boolean;
  onUpdate: (patch: Partial<ContentBlock>) => void;
  onDelete: () => void;
  onAdd: (type: ContentBlock["type"]) => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const typeConfig = {
    action: { emoji: "🎬", label: "动作", color: "border-l-blue-400 bg-blue-50/50 dark:bg-blue-950/30" },
    dialogue: { emoji: "💬", label: "对白", color: "border-l-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/30" },
    transition: { emoji: "🎞️", label: "转场", color: "border-l-gray-400 bg-gray-50/50 dark:bg-gray-950/30" },
  };
  const cfg = typeConfig[block.type];

  return (
    <div className={`rounded-lg border border-gray-200 dark:border-gray-700 border-l-4 ${cfg.color} group`}>
      {/* 块头部 */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-white/50 dark:bg-gray-900/50 rounded-tr-lg">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
          {cfg.emoji} {cfg.label} #{index + 1}
        </span>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* 上移 */}
          <button
            onClick={() => onMove(-1)}
            disabled={index === 0 || readOnly}
            title="上移"
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-20 transition"
          >
            <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          {/* 下移 */}
          <button
            onClick={() => onMove(1)}
            disabled={index === total - 1 || readOnly}
            title="下移"
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-20 transition"
          >
            <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {/* 删除 */}
          {!readOnly && (
            <button
              onClick={onDelete}
              title="删除"
              className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/40 transition text-gray-400 hover:text-red-500"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* 块内容 */}
      <div className="px-3 pb-3 pt-1">
        {block.type === "action" && (
          <textarea
            value={block.text || ""}
            onChange={(e) => onUpdate({ text: e.target.value })}
            disabled={readOnly}
            rows={2}
            className="w-full resize-y rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm leading-relaxed text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 focus:outline-none disabled:opacity-50"
            placeholder="描写场景中发生的动作、环境变化..."
          />
        )}

        {block.type === "dialogue" && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {/* 角色选择 */}
              <div>
                <label className="block text-[10px] text-gray-400 dark:text-gray-500 mb-0.5">角色</label>
                {characterNames.length > 0 ? (
                  <select
                    value={block.character || ""}
                    onChange={(e) => onUpdate({ character: e.target.value })}
                    disabled={readOnly}
                    className="w-full rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 focus:outline-none disabled:opacity-50"
                  >
                    <option value="">选择角色</option>
                    {characterNames.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={block.character || ""}
                    onChange={(e) => onUpdate({ character: e.target.value })}
                    disabled={readOnly}
                    className="w-full rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 focus:outline-none disabled:opacity-50"
                    placeholder="角色名"
                  />
                )}
              </div>
              {/* 情绪 */}
              <div>
                <label className="block text-[10px] text-gray-400 dark:text-gray-500 mb-0.5">情绪</label>
                <select
                  value={block.emotion || ""}
                  onChange={(e) => onUpdate({ emotion: e.target.value })}
                  disabled={readOnly}
                  className="w-full rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 focus:outline-none disabled:opacity-50"
                >
                  {EMOTION_OPTIONS.map((e) => (
                    <option key={e} value={e}>{e || "— 不标注 —"}</option>
                  ))}
                </select>
              </div>
            </div>
            {/* 台词 */}
            <div>
              <label className="block text-[10px] text-gray-400 dark:text-gray-500 mb-0.5">台词</label>
              <textarea
                value={block.line || ""}
                onChange={(e) => onUpdate({ line: e.target.value })}
                disabled={readOnly}
                rows={2}
                className="w-full resize-y rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm leading-relaxed text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 focus:outline-none disabled:opacity-50"
                placeholder="输入角色台词..."
              />
            </div>
          </div>
        )}

        {block.type === "transition" && (
          <input
            type="text"
            value={block.text || ""}
            onChange={(e) => onUpdate({ text: e.target.value })}
            disabled={readOnly}
            className="w-full rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 focus:outline-none disabled:opacity-50"
            placeholder="CUT TO: / FADE OUT. / DISSOLVE TO:"
          />
        )}
      </div>
    </div>
  );
}

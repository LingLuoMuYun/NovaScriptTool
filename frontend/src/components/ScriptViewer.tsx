"use client";

import { useState, useEffect } from "react";
import { Scene, Script, updateScript } from "@/lib/api";
import VersionHistory from "./VersionHistory";

interface ScriptViewerProps {
  scene: Scene & { scripts?: Script[] };
  onRollback?: () => void;
  onScriptUpdate?: () => void;
}

/** 剧本内容块类型 */
interface ContentBlock {
  type: "action" | "dialogue" | "transition";
  text?: string;
  character?: string;
  emotion?: string;
  line?: string;
}

/** 结构化剧本渲染（只读） */
function StructuredScriptView({ content }: { content: string }) {
  // 尝试解析为结构化 JSON
  let parsed: { sceneNum?: number; location?: string; timeOfDay?: string; charactersInScene?: string[]; content?: ContentBlock[] } | null = null;
  try {
    const data = JSON.parse(content);
    if (data && Array.isArray(data.content)) {
      parsed = data;
    }
  } catch {
    // 不是结构化数据，降级为纯文本展示
  }

  if (!parsed || !parsed.content) {
    // 旧格式：纯文本展示
    return (
      <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-gray-700">
        {content}
      </pre>
    );
  }

  const blockStyles: Record<string, string> = {
    action: "text-gray-700 text-sm leading-relaxed mb-3",
    dialogue: "mb-4 pl-8 border-l-4 border-indigo-200",
    transition: "text-gray-500 text-xs font-semibold tracking-wider uppercase text-right mb-4",
  };

  return (
    <div className="space-y-1">
      {/* 场景信息栏 */}
      {parsed.charactersInScene && parsed.charactersInScene.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2">
          <span className="text-xs font-medium text-indigo-500">👥 出场角色：</span>
          {parsed.charactersInScene.map((name, i) => (
            <span
              key={i}
              className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700"
            >
              {name}
            </span>
          ))}
        </div>
      )}

      {/* 剧本内容块 */}
      {parsed.content.map((block, i) => {
        switch (block.type) {
          case "action":
            return (
              <p key={i} className={blockStyles.action}>
                {block.text}
              </p>
            );

          case "dialogue":
            return (
              <div key={i} className={blockStyles.dialogue}>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-sm font-bold text-indigo-700 uppercase tracking-wide">
                    {block.character}
                  </span>
                  {block.emotion && (
                    <span className="text-xs text-gray-500 italic">
                      ({block.emotion})
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-800 leading-relaxed">
                  {block.line}
                </p>
              </div>
            );

          case "transition":
            return (
              <p key={i} className={blockStyles.transition}>
                {block.text}
              </p>
            );

          default:
            return null;
        }
      })}

      {/* 格式标签 */}
      <div className="mt-4 pt-3 border-t border-gray-100">
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-600">
          ✅ 结构化剧本 · {parsed.content.length} 个内容块
        </span>
      </div>
    </div>
  );
}

export default function ScriptViewer({ scene, onRollback, onScriptUpdate }: ScriptViewerProps) {
  const [showVersions, setShowVersions] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const script = scene.scripts?.[0];

  // 进入编辑模式时，用当前剧本内容初始化
  useEffect(() => {
    if (isEditing && script) {
      setEditContent(script.yamlContent);
    }
  }, [isEditing, script]);

  const handleStartEdit = () => {
    setEditError("");
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditContent("");
    setEditError("");
  };

  const handleSaveEdit = async () => {
    if (!script) return;
    if (!editContent.trim()) {
      setEditError("剧本内容不能为空");
      return;
    }
    setSaving(true);
    setEditError("");
    try {
      await updateScript(script.id, editContent);
      setIsEditing(false);
      onScriptUpdate?.();
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (showVersions) {
    return (
      <VersionHistory
        sceneId={scene.id}
        sceneLabel={`Scene ${scene.sceneNum} — ${scene.location}`}
        onClose={() => setShowVersions(false)}
        onRollback={() => {
          setShowVersions(false);
          onRollback?.();
        }}
      />
    );
  }

  // 无剧本 + 编辑模式：显示空白编辑器
  if (!script && isEditing) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gray-50 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">
                Scene {scene.sceneNum} — {scene.location}
              </h3>
              <p className="text-sm text-gray-400">✏️ 手动编写剧本</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowVersions(true)}
                className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-indigo-100 hover:text-indigo-600 transition"
              >
                📜 版本历史
              </button>
            </div>
          </div>
        </div>
        <div className="p-4">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={16}
            className="w-full resize-y rounded-lg border border-gray-300 px-4 py-3 font-mono text-sm leading-relaxed focus:border-indigo-400 focus:outline-none transition"
            placeholder={`dialogue:\n  - character: "主角"\n    line: "..."\n\naction:\n  - "场景描述..."`}
          />
          {editError && (
            <p className="mt-2 text-sm text-red-500">{editError}</p>
          )}
          <div className="mt-3 flex gap-3 justify-end">
            <button
              onClick={() => { setIsEditing(false); setEditContent(""); }}
              disabled={saving}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
            >
              取消
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={saving}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition disabled:opacity-50"
            >
              {saving ? "⏳ 保存中..." : "💾 创建剧本"}
            </button>
          </div>
        </div>
        <div className="border-t border-gray-100 bg-gray-50 px-6 py-3">
          <div className="flex gap-4 text-xs text-gray-400">
            <span>📍 {scene.location}</span>
            <span>⏰ {scene.timeOfDay}</span>
            {scene.isLocked && <span className="text-amber-500">🔒 已锁定</span>}
          </div>
        </div>
      </div>
    );
  }

  // 无剧本状态
  if (!script) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <p className="text-4xl">📝</p>
        <p className="mt-3 text-gray-500">该场景尚未生成剧本</p>
        <button
          onClick={handleStartEdit}
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition"
        >
          ✏️ 手动编写
        </button>
      </div>
    );
  }

  // 编辑模式
  if (isEditing) {
    return (
      <div className="rounded-xl border border-indigo-300 bg-white shadow-sm ring-2 ring-indigo-100">
        <div className="border-b border-indigo-100 bg-indigo-50 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">
                Scene {scene.sceneNum} — {scene.location}
              </h3>
              <p className="text-sm text-indigo-500">✏️ 编辑模式 — 保存后将创建新版本</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowVersions(true)}
                className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-600 hover:bg-indigo-100 hover:text-indigo-600 transition"
              >
                📜 版本历史
              </button>
            </div>
          </div>
        </div>
        <div className="p-4">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={20}
            className="w-full resize-y rounded-lg border border-gray-300 px-4 py-3 font-mono text-sm leading-relaxed text-gray-700 focus:border-indigo-400 focus:outline-none transition"
            spellCheck={false}
          />
          {editError && (
            <p className="mt-2 text-sm text-red-500">{editError}</p>
          )}
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              当前版本: v{script.version} — 保存后将创建 v{script.version + 1}
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleCancelEdit}
                disabled={saving}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
              >
                ❌ 取消
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition disabled:opacity-50"
              >
                {saving ? "⏳ 保存中..." : "💾 保存为新版本"}
              </button>
            </div>
          </div>
        </div>
        <div className="border-t border-gray-100 bg-gray-50 px-6 py-3">
          <div className="flex gap-4 text-xs text-gray-400">
            <span>📍 {scene.location}</span>
            <span>⏰ {scene.timeOfDay}</span>
            {scene.isLocked && <span className="text-amber-500">🔒 已锁定</span>}
          </div>
        </div>
      </div>
    );
  }

  // 正常只读模式
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* 场景标题 */}
      <div className="border-b border-gray-100 bg-gray-50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">
              Scene {scene.sceneNum} — {scene.location}
            </h3>
            <p className="text-sm text-gray-400">
              第 {script.version} 版 ·{" "}
              {script.createdBy === "user" ? "👤 手动编辑" : "🤖 AI 生成"} ·{" "}
              {new Date(script.createdAt).toLocaleDateString("zh-CN")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleStartEdit}
              className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-200 transition"
            >
              ✏️ 编辑
            </button>
            <button
              onClick={() => setShowVersions(true)}
              className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-indigo-100 hover:text-indigo-600 transition"
            >
              📜 版本历史
            </button>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
              ✅ 已生成
            </span>
          </div>
        </div>
      </div>

      {/* 剧本内容 */}
      <div className="p-6">
        <StructuredScriptView content={script.yamlContent} />
      </div>

      {/* 时间/地点信息 */}
      <div className="border-t border-gray-100 bg-gray-50 px-6 py-3">
        <div className="flex gap-4 text-xs text-gray-400">
          <span>📍 {scene.location}</span>
          <span>⏰ {scene.timeOfDay}</span>
          {scene.isLocked && <span className="text-amber-500">🔒 已锁定</span>}
        </div>
      </div>
    </div>
  );
}

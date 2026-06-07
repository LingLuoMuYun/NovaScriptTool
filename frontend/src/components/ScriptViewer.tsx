"use client";

import { useState, useEffect, useCallback } from "react";
import { Scene, Script, Annotation, updateScript, createAnnotation, updateAnnotation, deleteAnnotation, getSceneAnnotations } from "@/lib/api";
import VersionHistory from "./VersionHistory";
import MentionInput from "./MentionInput";
import DualPaneEditor from "./DualPaneEditor";

interface ScriptViewerProps {
  scene: Scene & { scripts?: Script[] };
  characterNames?: string[];
  novelContent?: string;
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

/** 结构化剧本渲染（只读）+ 行内评论 */
function StructuredScriptView({
  content,
  sceneId,
  annotations,
  characters,
  onAddComment,
  onToggleResolved,
  onDeleteComment,
}: {
  content: string;
  sceneId: string;
  annotations: Annotation[];
  characters: string[];
  onAddComment: (blockIndex: number, content: string, type: string, authorName: string) => Promise<void>;
  onToggleResolved: (annotation: Annotation) => Promise<void>;
  onDeleteComment: (id: string) => Promise<void>;
}) {
  const [activeBlockIdx, setActiveBlockIdx] = useState<number | null>(null);
  const [commentingIdx, setCommentingIdx] = useState<number | null>(null);

  // 解析结构化 JSON
  let parsed: { sceneNum?: number; location?: string; timeOfDay?: string; charactersInScene?: string[]; content?: ContentBlock[] } | null = null;
  try {
    const data = JSON.parse(content);
    if (data && Array.isArray(data.content)) {
      parsed = data;
    }
  } catch { /* 旧格式，降级 */ }

  // 旧格式：纯文本展示
  if (!parsed || !parsed.content) {
    return (
      <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-gray-700 dark:text-gray-200">
        {content}
      </pre>
    );
  }

  // 按 blockIndex 分组注记
  const commentsByBlock = new Map<number, Annotation[]>();
  for (const a of annotations) {
    if (a.blockIndex != null) {
      const existing = commentsByBlock.get(a.blockIndex) || [];
      existing.push(a);
      commentsByBlock.set(a.blockIndex, existing);
    }
  }

  const blockStyles: Record<string, string> = {
    action: "text-gray-700 dark:text-gray-200 text-sm leading-relaxed mb-3",
    dialogue: "mb-4 pl-8 border-l-4 border-indigo-200",
    transition: "text-gray-500 dark:text-gray-400 text-xs font-semibold tracking-wider uppercase text-right mb-4",
  };

  return (
    <div className="space-y-1">
      {/* 场景信息栏 */}
      {parsed.charactersInScene && parsed.charactersInScene.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-indigo-50 dark:bg-indigo-950 px-3 py-2">
          <span className="text-xs font-medium text-indigo-500 dark:text-indigo-400">👥 出场角色：</span>
          {parsed.charactersInScene.map((name, i) => (
            <span
              key={i}
              className="rounded-full bg-indigo-100 dark:bg-indigo-900/40 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:text-indigo-300"
            >
              {name}
            </span>
          ))}
        </div>
      )}

      {/* 剧本内容块 */}
      {parsed.content.map((block, i) => {
        const blockComments = commentsByBlock.get(i) || [];
        const hasComments = blockComments.length > 0;
        const unresolvedCount = blockComments.filter((c) => !c.resolved).length;
        const isActive = activeBlockIdx === i;

        return (
          <div key={i} className="group relative">
            {/* 块内容 — 悬停时显示左侧强调条 + 背景微亮 */}
            <div
              className={`relative -mx-2 px-2 py-1 rounded-lg transition-all duration-150 ${
                hasComments
                  ? "bg-yellow-50 dark:bg-yellow-950/60 ring-1 ring-yellow-200/60 dark:ring-yellow-700/30"
                  : "group-hover:bg-gray-50 dark:group-hover:bg-gray-800/50"
              }`}
            >
              {/* 左侧强调条 — 悬停时显示 */}
              <div
                className={`absolute left-0 top-1 bottom-1 w-0.5 rounded-full transition-all duration-150 ${
                  hasComments
                    ? "bg-yellow-400 dark:bg-yellow-500 opacity-100"
                    : "bg-indigo-400 dark:bg-indigo-500 opacity-0 group-hover:opacity-100"
                }`}
              />

              {/* Google Docs 风格 + 评论按钮 — 右侧悬停显示 */}
              <button
                onClick={() => {
                  setCommentingIdx(commentingIdx === i ? null : i);
                  if (hasComments) setActiveBlockIdx(isActive ? null : i);
                }}
                className={`absolute -right-2 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full shadow-sm transition-all duration-150 z-10 ${
                  hasComments
                    ? "h-6 min-w-[24px] bg-yellow-400 dark:bg-yellow-500 text-white opacity-100 hover:bg-yellow-500 dark:hover:bg-yellow-400 px-1.5"
                    : "h-7 w-7 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500 opacity-0 group-hover:opacity-100 hover:border-indigo-300 dark:hover:border-indigo-600 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950"
                }`}
                title={hasComments ? `${blockComments.length} 条评论 (${unresolvedCount} 未解决) — 点击查看` : "添加行内评论"}
              >
                {hasComments ? (
                  <span className="text-xs font-bold leading-none">{blockComments.length}</span>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
                  </svg>
                )}
              </button>

              {/* 已评论块：右上角未解决指示器 */}
              {hasComments && unresolvedCount > 0 && (
                <span
                  className="absolute -top-1.5 -right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white shadow-sm cursor-pointer z-20"
                  title={`${unresolvedCount} 条未解决`}
                  onClick={() => setActiveBlockIdx(isActive ? null : i)}
                >
                  {unresolvedCount}
                </span>
              )}

              {/* 渲染块内容 */}
              {block.type === "action" && (
                <p className={blockStyles.action}>{block.text}</p>
              )}

              {block.type === "dialogue" && (
                <div className={blockStyles.dialogue}>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wide">
                      {block.character}
                    </span>
                    {block.emotion && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 italic">({block.emotion})</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-800 dark:text-gray-100 leading-relaxed">{block.line}</p>
                </div>
              )}

              {block.type === "transition" && (
                <p className={blockStyles.transition}>{block.text}</p>
              )}
            </div>

            {/* 行内评论输入表单 */}
            {commentingIdx === i && (
              <div className="mt-3 ml-2 pl-4 border-l-2 border-indigo-300 dark:border-indigo-700 animate-fade-in">
                <InlineCommentForm
                  characters={characters}
                  onSubmit={async (text, type, author) => {
                    await onAddComment(i, text, type, author);
                    setCommentingIdx(null);
                  }}
                  onCancel={() => setCommentingIdx(null)}
                />
              </div>
            )}

            {/* 评论线程 */}
            {isActive && hasComments && (
              <div className="mt-3 ml-2 space-y-2 animate-fade-in">
                {blockComments.map((comment) => (
                  <CommentBubble
                    key={comment.id}
                    comment={comment}
                    onToggleResolved={() => onToggleResolved(comment)}
                    onDelete={() => onDeleteComment(comment.id)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* 格式标签 */}
      <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          ✅ 结构化剧本 · {parsed.content.length} 个内容块
        </span>
        {annotations.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-yellow-50 dark:bg-yellow-950 px-2.5 py-0.5 text-xs font-medium text-yellow-700 dark:text-yellow-300">
            💬 {annotations.length} 条行内评论
          </span>
        )}
      </div>
    </div>
  );
}

/** 行内评论输入表单 */
function InlineCommentForm({
  characters,
  onSubmit,
  onCancel,
}: {
  characters: string[];
  onSubmit: (content: string, type: string, authorName: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [type, setType] = useState("comment");
  const [authorName, setAuthorName] = useState("编剧");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(text.trim(), type, authorName.trim() || "匿名");
      setText("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg border border-indigo-200 bg-white dark:bg-gray-900 p-3 shadow-sm dark:shadow-gray-950/30">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">✏️ 添加评论</span>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded border border-gray-200 dark:border-gray-700 px-1.5 py-0.5 text-xs text-gray-500 dark:text-gray-400"
        >
          <option value="comment">💬 评论</option>
          <option value="todo">📋 待办</option>
          <option value="question">❓ 疑问</option>
          <option value="suggestion">💡 建议</option>
          <option value="note">📝 笔记</option>
        </select>
        <input
          type="text"
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          placeholder="署名"
          className="rounded border border-gray-200 dark:border-gray-700 px-1.5 py-0.5 text-xs text-gray-500 dark:text-gray-400 w-16"
        />
      </div>
      <MentionInput
        value={text}
        onChange={setText}
        placeholder="输入评论... 使用 @ 提及角色"
        rows={2}
        characters={characters}
        autoFocus
        onCancel={onCancel}
        onSubmit={handleSubmit}
        submitLabel="添加"
        submitting={submitting}
      />
    </div>
  );
}

/** 单条评论气泡 */
function CommentBubble({
  comment,
  onToggleResolved,
  onDelete,
}: {
  comment: Annotation;
  onToggleResolved: () => void;
  onDelete: () => void;
}) {
  const TYPE_CONFIG: Record<string, { emoji: string; label: string; color: string }> = {
    comment: { emoji: "💬", label: "评论", color: "border-l-blue-400 bg-blue-50 dark:bg-blue-950" },
    todo: { emoji: "📋", label: "待办", color: "border-l-orange-400 bg-orange-50" },
    question: { emoji: "❓", label: "疑问", color: "border-l-amber-400 bg-amber-50 dark:bg-amber-950" },
    suggestion: { emoji: "💡", label: "建议", color: "border-l-emerald-400 bg-emerald-50 dark:bg-emerald-950" },
    note: { emoji: "📝", label: "笔记", color: "border-l-gray-300 bg-gray-50 dark:bg-gray-950" },
    inspiration: { emoji: "✨", label: "灵感", color: "border-l-yellow-400 bg-yellow-50 dark:bg-yellow-950" },
    warning: { emoji: "⚠️", label: "警示", color: "border-l-red-400 bg-red-50 dark:bg-red-950" },
  };
  const cfg = TYPE_CONFIG[comment.type] || TYPE_CONFIG.comment;

  // 高亮 @提及
  const renderContent = (text: string) => {
    const parts = text.split(/(@\S+)/g);
    return parts.map((part, i) => {
      if (part.startsWith("@")) {
        return (
          <span key={i} className="inline-flex items-center gap-0.5 rounded bg-indigo-100 dark:bg-indigo-900/40 px-1 py-0 text-xs font-medium text-indigo-700 dark:text-indigo-300">
            {part}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div
      className={`rounded-lg border-l-4 p-3 ${cfg.color} ${comment.resolved ? "opacity-50" : ""} transition-opacity`}
    >
      <div className="flex items-start gap-2">
        {/* 类型图标 */}
        <span className="text-sm mt-0.5">{cfg.emoji}</span>

        <div className="flex-1 min-w-0">
          {/* 头部：署名 + 时间 */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300 dark:text-gray-600">
              {comment.authorName || "匿名"}
            </span>
            <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {new Date(comment.createdAt).toLocaleDateString("zh-CN")}{" "}
              {new Date(comment.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
            </span>
            {comment.resolved && (
              <span className="text-xs text-green-500 dark:text-green-400 font-medium ml-auto">✅ 已解决</span>
            )}
          </div>

          {/* 评论内容 */}
          <p className={`text-sm leading-relaxed ${comment.resolved ? "line-through text-gray-400 dark:text-gray-500" : "text-gray-700 dark:text-gray-200"}`}>
            {renderContent(comment.content)}
          </p>
        </div>

        {/* 操作按钮 */}
        <div className="flex flex-col gap-0.5 flex-shrink-0">
          <button
            onClick={onToggleResolved}
            className={`text-xs rounded px-1.5 py-0.5 transition ${
              comment.resolved
                ? "bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 hover:bg-green-200"
                : "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 hover:bg-green-100 dark:bg-green-900/40 hover:text-green-600 dark:text-green-400"
            }`}
            title={comment.resolved ? "标记为未解决" : "标记为已解决"}
          >
            {comment.resolved ? "✅" : "○"}
          </button>
          <button
            onClick={onDelete}
            className="text-xs rounded px-1.5 py-0.5 text-gray-400 dark:text-gray-500 hover:bg-red-100 dark:bg-red-900/40 hover:text-red-500 dark:text-red-400 transition"
            title="删除"
          >
            🗑
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ScriptViewer({ scene, characterNames = [], novelContent, onRollback, onScriptUpdate }: ScriptViewerProps) {
  const [showVersions, setShowVersions] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isDualPane, setIsDualPane] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // 行内评论状态
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [annotationLoading, setAnnotationLoading] = useState(false);

  const script = scene.scripts?.[0];

  // 进入编辑模式时，用当前剧本内容初始化
  useEffect(() => {
    if (isEditing && script) {
      setEditContent(script.yamlContent);
    }
  }, [isEditing, script]);

  // 加载场景行内评论
  const fetchAnnotations = useCallback(async () => {
    if (!scene.id) return;
    setAnnotationLoading(true);
    try {
      const data = await getSceneAnnotations(scene.id);
      setAnnotations(data);
    } catch (err) {
      console.error("加载评论失败:", err);
    } finally {
      setAnnotationLoading(false);
    }
  }, [scene.id]);

  useEffect(() => {
    fetchAnnotations();
  }, [fetchAnnotations]);

  // 添加行内评论
  const handleAddComment = useCallback(
    async (blockIndex: number, content: string, type: string, authorName: string) => {
      try {
        await createAnnotation({
          novelId: scene.novelId,
          targetType: "block",
          targetId: `${scene.id}:${blockIndex}`,
          content,
          type,
          authorName,
          blockIndex,
        });
        await fetchAnnotations();
      } catch (err) {
        console.error("添加评论失败:", err);
      }
    },
    [scene.novelId, scene.id, fetchAnnotations]
  );

  // 切换解决状态
  const handleToggleResolved = useCallback(
    async (annotation: Annotation) => {
      try {
        await updateAnnotation(annotation.id, { resolved: !annotation.resolved });
        await fetchAnnotations();
      } catch (err) {
        console.error("更新评论状态失败:", err);
      }
    },
    [fetchAnnotations]
  );

  // 删除评论
  const handleDeleteComment = useCallback(
    async (id: string) => {
      if (!confirm("确定删除此评论？")) return;
      try {
        await deleteAnnotation(id);
        await fetchAnnotations();
      } catch (err) {
        console.error("删除评论失败:", err);
      }
    },
    [fetchAnnotations]
  );

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

  // 双栏编辑模式
  if (isDualPane && script && novelContent) {
    return (
      <div className="rounded-xl border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-gray-900 shadow-lg dark:shadow-gray-950/30 overflow-hidden ring-2 ring-indigo-100 dark:ring-indigo-900">
        <DualPaneEditor
          sceneId={scene.id}
          sceneLabel={`Scene ${scene.sceneNum} — ${scene.location}`}
          sceneMeta={{
            sceneNum: scene.sceneNum,
            location: scene.location,
            timeOfDay: scene.timeOfDay,
            isLocked: scene.isLocked,
          }}
          script={script}
          novelContent={novelContent}
          characterNames={characterNames}
          onSaved={() => {
            setIsDualPane(false);
            onScriptUpdate?.();
          }}
          onCancel={() => setIsDualPane(false)}
        />
      </div>
    );
  }

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
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm dark:shadow-gray-950/30">
        <div className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                Scene {scene.sceneNum} — {scene.location}
              </h3>
              <p className="text-sm text-gray-400 dark:text-gray-500">✏️ 手动编写剧本</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowVersions(true)}
                className="rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 dark:text-gray-600 hover:bg-indigo-100 dark:bg-indigo-900/40 hover:text-indigo-600 dark:text-indigo-400 transition"
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
            className="w-full resize-y rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-3 font-mono text-sm leading-relaxed focus:border-indigo-400 focus:outline-none transition"
            placeholder={`dialogue:\n  - character: "主角"\n    line: "..."\n\naction:\n  - "场景描述..."`}
          />
          {editError && (
            <p className="mt-2 text-sm text-red-500 dark:text-red-400">{editError}</p>
          )}
          <div className="mt-3 flex gap-3 justify-end">
            <button
              onClick={() => { setIsEditing(false); setEditContent(""); }}
              disabled={saving}
              className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 dark:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-950 transition disabled:opacity-50"
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
        <div className="border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 px-6 py-3">
          <div className="flex gap-4 text-xs text-gray-400 dark:text-gray-500">
            <span>📍 {scene.location}</span>
            <span>⏰ {scene.timeOfDay}</span>
            {scene.isLocked && <span className="text-amber-500 dark:text-amber-400">🔒 已锁定</span>}
          </div>
        </div>
      </div>
    );
  }

  // 无剧本状态
  if (!script) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 text-center shadow-sm dark:shadow-gray-950/30">
        <p className="text-4xl">📝</p>
        <p className="mt-3 text-gray-500 dark:text-gray-400">该场景尚未生成剧本</p>
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
      <div className="rounded-xl border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-gray-900 shadow-sm dark:shadow-gray-950/30 ring-2 ring-indigo-100">
        <div className="border-b border-indigo-100 bg-indigo-50 dark:bg-indigo-950 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                Scene {scene.sceneNum} — {scene.location}
              </h3>
              <p className="text-sm text-indigo-500 dark:text-indigo-400">✏️ 编辑模式 — 保存后将创建新版本</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowVersions(true)}
                className="rounded-full bg-white dark:bg-gray-900 px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 dark:text-gray-600 hover:bg-indigo-100 dark:bg-indigo-900/40 hover:text-indigo-600 dark:text-indigo-400 transition"
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
            className="w-full resize-y rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-3 font-mono text-sm leading-relaxed text-gray-700 dark:text-gray-200 focus:border-indigo-400 focus:outline-none transition"
            spellCheck={false}
          />
          {editError && (
            <p className="mt-2 text-sm text-red-500 dark:text-red-400">{editError}</p>
          )}
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              当前版本: v{script.version} — 保存后将创建 v{script.version + 1}
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleCancelEdit}
                disabled={saving}
                className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 dark:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-950 transition disabled:opacity-50"
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
        <div className="border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 px-6 py-3">
          <div className="flex gap-4 text-xs text-gray-400 dark:text-gray-500">
            <span>📍 {scene.location}</span>
            <span>⏰ {scene.timeOfDay}</span>
            {scene.isLocked && <span className="text-amber-500 dark:text-amber-400">🔒 已锁定</span>}
          </div>
        </div>
      </div>
    );
  }

  // 正常只读模式 — 含行内评论
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm dark:shadow-gray-950/30">
      {/* 场景标题 */}
      <div className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
              Scene {scene.sceneNum} — {scene.location}
            </h3>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              第 {script.version} 版 ·{" "}
              {script.createdBy === "user" ? "👤 手动编辑" : "🤖 AI 生成"} ·{" "}
              {new Date(script.createdAt).toLocaleDateString("zh-CN")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleStartEdit}
              className="rounded-full bg-indigo-100 dark:bg-indigo-900/40 px-3 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-200 transition"
            >
              ✏️ 快速编辑
            </button>
            {novelContent && (
              <button
                onClick={() => setIsDualPane(true)}
                className="rounded-full bg-purple-100 dark:bg-purple-900/40 px-3 py-1 text-xs font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/60 transition"
              >
                📝 详细编辑
              </button>
            )}
            <button
              onClick={() => setShowVersions(true)}
              className="rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 dark:text-gray-600 hover:bg-indigo-100 dark:bg-indigo-900/40 hover:text-indigo-600 dark:text-indigo-400 transition"
            >
              📜 版本历史
            </button>
            <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              ✅ 已生成
            </span>
          </div>
        </div>
      </div>

      {/* 剧本内容 + 行内评论 */}
      <div className="p-6">
        {annotationLoading ? (
          <div className="text-center py-4">
            <span className="text-sm text-gray-400 dark:text-gray-500">⏳ 加载评论中...</span>
          </div>
        ) : (
          <StructuredScriptView
            content={script.yamlContent}
            sceneId={scene.id}
            annotations={annotations}
            characters={characterNames}
            onAddComment={handleAddComment}
            onToggleResolved={handleToggleResolved}
            onDeleteComment={handleDeleteComment}
          />
        )}
      </div>

      {/* 时间/地点信息 */}
      <div className="border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 px-6 py-3">
        <div className="flex gap-4 text-xs text-gray-400 dark:text-gray-500">
          <span>📍 {scene.location}</span>
          <span>⏰ {scene.timeOfDay}</span>
          {scene.isLocked && <span className="text-amber-500 dark:text-amber-400">🔒 已锁定</span>}
        </div>
      </div>
    </div>
  );
}

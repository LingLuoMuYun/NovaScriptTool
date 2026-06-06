"use client";

import { useState, useEffect, useCallback } from "react";
import { Annotation, getAnnotations, createAnnotation, updateAnnotation, deleteAnnotation } from "@/lib/api";

interface AnnotationPanelProps {
  novelId: string;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  onClose?: () => void;
}

const TYPE_CONFIG: Record<string, { emoji: string; label: string; color: string }> = {
  todo: { emoji: "📋", label: "待办", color: "border-l-orange-400 bg-orange-50" },
  question: { emoji: "❓", label: "疑问", color: "border-l-blue-400 bg-blue-50" },
  inspiration: { emoji: "💡", label: "灵感", color: "border-l-yellow-400 bg-yellow-50" },
  warning: { emoji: "⚠️", label: "警示", color: "border-l-red-400 bg-red-50" },
  note: { emoji: "💬", label: "笔记", color: "border-l-gray-300 bg-gray-50" },
};

const TYPE_OPTIONS = Object.entries(TYPE_CONFIG).map(([value, cfg]) => ({
  value,
  label: `${cfg.emoji} ${cfg.label}`,
}));

export default function AnnotationPanel({ novelId, targetType, targetId, targetLabel, onClose }: AnnotationPanelProps) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [newContent, setNewContent] = useState("");
  const [newType, setNewType] = useState("note");
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  const fetchAnnotations = useCallback(async () => {
    try {
      const data = await getAnnotations(novelId);
      setAnnotations(data);
    } catch (err) {
      console.error("获取注记失败:", err);
    } finally {
      setLoading(false);
    }
  }, [novelId]);

  useEffect(() => {
    fetchAnnotations();
  }, [fetchAnnotations]);

  const filtered = filter === "all"
    ? annotations
    : annotations.filter((a) => a.targetType === filter || a.type === filter);

  const handleAdd = async () => {
    if (!newContent.trim()) return;
    setSubmitting(true);
    try {
      await createAnnotation({
        novelId,
        targetType: targetType || "scene",
        targetId: targetId || "",
        content: newContent.trim(),
        type: newType,
      });
      setNewContent("");
      await fetchAnnotations();
    } catch (err: any) {
      console.error("添加注记失败:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleResolved = async (a: Annotation) => {
    try {
      await updateAnnotation(a.id, { resolved: !a.resolved });
      await fetchAnnotations();
    } catch (err) {
      console.error("更新注记失败:", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除此注记？")) return;
    try {
      await deleteAnnotation(id);
      await fetchAnnotations();
    } catch (err) {
      console.error("删除注记失败:", err);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-700">
          💬 注记 ({annotations.length})
        </h3>
        {onClose && (
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">
            ✕
          </button>
        )}
      </div>

      {/* 筛选 */}
      <div className="flex gap-1 border-b border-gray-100 px-3 py-2">
        <button
          onClick={() => setFilter("all")}
          className={`rounded px-2 py-0.5 text-xs transition ${
            filter === "all" ? "bg-indigo-100 text-indigo-700" : "text-gray-500 hover:bg-gray-100"
          }`}
        >
          全部
        </button>
        {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded px-2 py-0.5 text-xs transition ${
              filter === key ? "bg-indigo-100 text-indigo-700" : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            {cfg.emoji}
          </button>
        ))}
      </div>

      {/* 目标信息 */}
      {targetLabel && (
        <div className="border-b border-gray-100 px-4 py-2">
          <p className="text-xs text-gray-400">
            关联: <span className="font-medium text-gray-600">{targetLabel}</span>
          </p>
        </div>
      )}

      {/* 注记列表 */}
      <div className="max-h-64 overflow-y-auto px-2 py-2">
        {loading ? (
          <p className="py-4 text-center text-xs text-gray-400">加载中...</p>
        ) : filtered.length === 0 ? (
          <p className="py-4 text-center text-xs text-gray-400">暂无注记</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((a) => {
              const cfg = TYPE_CONFIG[a.type] || TYPE_CONFIG.note;
              return (
                <div
                  key={a.id}
                  className={`rounded-lg border-l-4 p-3 ${cfg.color} ${a.resolved ? "opacity-50" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs">{cfg.emoji}</span>
                        <span className="text-xs text-gray-400">
                          {a.targetType === "scene" ? "场景" : a.targetType === "character" ? "角色" : "台词"}
                        </span>
                        <span className="text-xs text-gray-300">
                          {new Date(a.createdAt).toLocaleDateString("zh-CN")}
                        </span>
                      </div>
                      <p className={`text-sm whitespace-pre-wrap ${a.resolved ? "line-through" : ""}`}>
                        {a.content}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => handleToggleResolved(a)}
                        className={`text-xs rounded px-1.5 py-0.5 transition ${
                          a.resolved
                            ? "bg-green-100 text-green-600"
                            : "bg-gray-100 text-gray-400 hover:bg-green-100 hover:text-green-600"
                        }`}
                        title={a.resolved ? "标记为未解决" : "标记为已解决"}
                      >
                        {a.resolved ? "✅" : "○"}
                      </button>
                      <button
                        onClick={() => handleDelete(a.id)}
                        className="text-xs rounded px-1.5 py-0.5 text-gray-400 hover:bg-red-100 hover:text-red-500 transition"
                        title="删除"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 新增注记 */}
      <div className="border-t border-gray-100 px-3 py-3">
        <textarea
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder={targetLabel ? `为「${targetLabel}」添加注记...` : "添加注记..."}
          rows={2}
          className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-between">
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600"
          >
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            disabled={submitting || !newContent.trim()}
            className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            {submitting ? "..." : "添加"}
          </button>
        </div>
      </div>
    </div>
  );
}

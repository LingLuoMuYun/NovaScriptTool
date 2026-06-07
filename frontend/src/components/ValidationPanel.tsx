"use client";

import { useState, useEffect } from "react";
import { validateScripts } from "@/lib/api";
import type { ValidationReport, SceneValidationResult, SemanticIssue } from "@/lib/api";

// ─── Props ──────────────────────────────────────────

interface ValidationPanelProps {
  novelId: string;
  onClose: () => void;
  onSceneClick?: (sceneNum: number) => void;
}

// ─── 状态徽章 ──────────────────────────────────────

function StatusBadge({ status }: { status: SceneValidationResult["status"] }) {
  const map: Record<string, { icon: string; label: string; color: string }> = {
    valid:                { icon: "✅", label: "通过",    color: "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800" },
    warning:              { icon: "⚠️", label: "警告",    color: "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800" },
    error:                { icon: "❌", label: "错误",    color: "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800" },
    legacy_parsed:        { icon: "📜", label: "旧格式",  color: "bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700" },
    legacy_unparseable:   { icon: "❓", label: "无法解析", color: "bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800" },
    legacy_json_no_content:{ icon: "📜", label: "旧格式",  color: "bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700" },
    empty:                { icon: "🫙", label: "无内容",  color: "bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700" },
  };
  const m = map[status] || map.valid;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${m.color}`}>
      {m.icon} {m.label}
    </span>
  );
}

// ─── 场景行 ────────────────────────────────────────

function SceneRow({
  scene,
  isExpanded,
  onToggle,
  onSceneClick,
}: {
  scene: SceneValidationResult;
  isExpanded: boolean;
  onToggle: () => void;
  onSceneClick?: (sceneNum: number) => void;
}) {
  const errorCount = scene.structuralErrors.length + scene.semanticIssues.filter((i) => i.severity === "error").length;
  const warningCount = scene.semanticIssues.filter((i) => i.severity === "warning").length;

  return (
    <div className="border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden">
      {/* 场景头部 */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition"
      >
        <span className={`transform transition ${isExpanded ? "rotate-90" : ""} text-gray-400 text-xs`}>▶</span>
        <StatusBadge status={scene.status} />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
          场景 {scene.sceneNum}
        </span>
        <span className="text-xs text-gray-400 dark:text-gray-500 truncate flex-1">
          {scene.location}
        </span>
        <div className="flex items-center gap-2 text-xs">
          {errorCount > 0 && (
            <span className="text-red-500 dark:text-red-400 font-medium">{errorCount} 错误</span>
          )}
          {warningCount > 0 && (
            <span className="text-amber-500 dark:text-amber-400 font-medium">{warningCount} 警告</span>
          )}
          <span className="text-gray-400 dark:text-gray-500">{scene.blockCount} 块</span>
          {onSceneClick && (
            <span
              onClick={(e) => { e.stopPropagation(); onSceneClick(scene.sceneNum); }}
              className="ml-1 text-indigo-500 dark:text-indigo-400 hover:underline text-xs"
            >
              跳转 →
            </span>
          )}
        </div>
      </button>

      {/* 展开详情 */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
          {/* 结构错误 */}
          {scene.structuralErrors.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1.5">🔴 结构校验错误</p>
              <ul className="space-y-1">
                {scene.structuralErrors.map((err, i) => (
                  <li key={i} className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50 rounded-lg px-3 py-1.5">
                    {err}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 语义问题 */}
          {scene.semanticIssues.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                {scene.semanticIssues.filter((i) => i.severity === "error").length > 0 ? "🔴" : "🟡"} 语义校验问题
              </p>
              <ul className="space-y-2">
                {scene.semanticIssues.map((issue, i) => (
                  <IssueCard key={i} issue={issue} />
                ))}
              </ul>
            </div>
          )}

          {/* 全部通过 */}
          {scene.structuralErrors.length === 0 && scene.semanticIssues.length === 0 && (
            <p className="text-xs text-green-600 dark:text-green-400">✅ 所有校验通过</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 问题卡片 ──────────────────────────────────────

function IssueCard({ issue }: { issue: SemanticIssue }) {
  return (
    <li className="rounded-lg border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2">
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 text-xs font-mono rounded px-1.5 py-0.5 ${
          issue.severity === "error"
            ? "bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400"
            : "bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400"
        }`}>
          {issue.rule}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-600 dark:text-gray-300">{issue.message}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mt-0.5">{issue.path}</p>
        </div>
      </div>
      {issue.fix && (
        <p className="mt-1.5 text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 rounded-lg px-2.5 py-1.5">
          💡 {issue.fix}
        </p>
      )}
    </li>
  );
}

// ─── 组件主体 ──────────────────────────────────────

export default function ValidationPanel({ novelId, onClose, onSceneClick }: ValidationPanelProps) {
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedScenes, setExpandedScenes] = useState<Set<number>>(new Set());

  useEffect(() => {
    setLoading(true);
    validateScripts(novelId)
      .then((r) => { setReport(r); setError(""); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [novelId]);

  const toggleScene = (sceneNum: number) => {
    setExpandedScenes((prev) => {
      const next = new Set(prev);
      if (next.has(sceneNum)) next.delete(sceneNum);
      else next.add(sceneNum);
      return next;
    });
  };

  const expandAll = () => {
    if (!report) return;
    if (expandedScenes.size === report.scenes.length) {
      setExpandedScenes(new Set());
    } else {
      setExpandedScenes(new Set(report.scenes.map((s) => s.sceneNum)));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* 面板 */}
      <div className="relative w-full max-w-2xl max-h-[80vh] rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl flex flex-col animate-fade-in mx-4">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">🔍 剧本校验报告</h2>
            {report && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {report.totalScenes} 个场景 · {report.structural.valid} 通过 · {report.semantic.errors} 错误 · {report.semantic.warnings} 警告
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {report && (
              <button
                onClick={expandAll}
                className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                {expandedScenes.size === report.scenes.length ? "全部收起" : "全部展开"}
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* 加载中 */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <svg className="h-6 w-6 animate-spin text-indigo-500" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="ml-3 text-sm text-gray-400 dark:text-gray-500">校验中...</span>
            </div>
          )}

          {/* 错误 */}
          {error && (
            <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-4">
              <p className="text-sm font-medium text-red-700 dark:text-red-300">校验失败</p>
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* 统计卡片 */}
          {report && (
            <>
              <div className="grid grid-cols-4 gap-3">
                <StatCard label="总场景" value={report.totalScenes} color="text-gray-700 dark:text-gray-200" />
                <StatCard label="通过" value={report.structural.valid} color="text-green-600 dark:text-green-400" />
                <StatCard label="语义错误" value={report.semantic.errors} color="text-red-500 dark:text-red-400" />
                <StatCard label="警告" value={report.semantic.warnings} color="text-amber-500 dark:text-amber-400" />
              </div>

              {/* 跨场景问题 */}
              {report.crossSceneIssues.length > 0 && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 p-4">
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-300">🌐 跨场景一致性问题</p>
                  <ul className="mt-2 space-y-1.5">
                    {report.crossSceneIssues.map((issue, i) => (
                      <li key={i} className="text-xs text-amber-600 dark:text-amber-400">
                        <span className="font-mono bg-amber-100 dark:bg-amber-900/40 rounded px-1.5 py-0.5 mr-2">{issue.rule}</span>
                        {issue.message}
                        <span className="ml-2 text-amber-400 dark:text-amber-500">
                          (场景 {issue.scenes.join(", ")})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 空状态 */}
              {report.totalScenes === 0 && (
                <div className="text-center py-8">
                  <p className="text-4xl">🎬</p>
                  <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">暂无场景剧本，请先生成剧本</p>
                </div>
              )}

              {/* 场景列表 */}
              <div className="space-y-2">
                {report.scenes.map((scene) => (
                  <SceneRow
                    key={scene.sceneNum}
                    scene={scene}
                    isExpanded={expandedScenes.has(scene.sceneNum)}
                    onToggle={() => toggleScene(scene.sceneNum)}
                    onSceneClick={onSceneClick}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* 底部 */}
        <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            结构校验 (Zod) + 语义规则 (R001-R007) + 跨场景 (C001)
          </p>
          <button
            onClick={onClose}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-700 transition"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 统计卡片子组件 ─────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 p-3 text-center">
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-400 dark:text-gray-500">{label}</p>
    </div>
  );
}

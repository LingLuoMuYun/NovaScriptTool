"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Script, updateScript } from "@/lib/api";
import ScriptBlockEditor from "./ScriptBlockEditor";

interface DualPaneEditorProps {
  /** 场景 ID */
  sceneId: string;
  /** 场景标签 */
  sceneLabel: string;
  /** 场景元信息 */
  sceneMeta: { sceneNum: number; location: string; timeOfDay: string; isLocked?: boolean };
  /** 当前剧本 */
  script: Script;
  /** 原始小说全文 */
  novelContent: string;
  /** 出场角色名（用于左侧高亮） */
  characterNames?: string[];
  /** 保存后回调 */
  onSaved: () => void;
  /** 取消回调 */
  onCancel: () => void;
}

/**
 * 双栏工作台：左侧原文 ↔ 右侧剧本编辑器
 * 支持拖拽调整分栏比例，方便大篇幅修改时对照原文
 */
export default function DualPaneEditor({
  sceneId: _sceneId,
  sceneLabel,
  sceneMeta,
  script,
  novelContent,
  characterNames = [],
  onSaved,
  onCancel,
}: DualPaneEditorProps) {
  const [editContent, setEditContent] = useState(script.yamlContent);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [splitRatio, setSplitRatio] = useState(50); // 左栏百分比
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<number[]>([]);
  const [currentSearchIdx, setCurrentSearchIdx] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const leftPaneRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // ─── 拖拽分割线 ──────────────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const pct = Math.max(20, Math.min(80, (x / rect.width) * 100));
      setSplitRatio(pct);
    };

    const handleMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

  // ─── 原文搜索 ────────────────────────────────────

  const doSearch = useCallback(
    (term: string) => {
      setSearchTerm(term);
      setSearchResults([]);
      setCurrentSearchIdx(0);
      if (!term.trim() || !novelContent) return;

      const results: number[] = [];
      const lower = novelContent.toLowerCase();
      const q = term.toLowerCase();
      let idx = 0;
      while ((idx = lower.indexOf(q, idx)) !== -1) {
        results.push(idx);
        idx += q.length;
      }
      setSearchResults(results);
      if (results.length > 0) setCurrentSearchIdx(0);
    },
    [novelContent]
  );

  const jumpToSearch = useCallback(
    (delta: 1 | -1) => {
      if (searchResults.length === 0) return;
      const next = (currentSearchIdx + delta + searchResults.length) % searchResults.length;
      setCurrentSearchIdx(next);
      // 滚动左侧面板到对应位置
      if (leftPaneRef.current) {
        const pos = searchResults[next];
        // 估算行号：按换行符计数
        const before = novelContent.substring(0, pos);
        const lineNum = before.split("\n").length;
        const lineHeight = 24; // px，近似
        leftPaneRef.current.scrollTop = Math.max(0, (lineNum - 5) * lineHeight);
      }
    },
    [searchResults, currentSearchIdx, novelContent]
  );

  // 关键词高亮渲染
  const renderHighlightedContent = useCallback(() => {
    if (!novelContent) return null;
    if (!searchTerm.trim()) {
      // 无搜索词：仅高亮角色名
      let text = novelContent;
      if (characterNames.length > 0) {
        const namesPattern = characterNames
          .filter((n) => n.length >= 2)
          .sort((a, b) => b.length - a.length)
          .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          .join("|");
        if (namesPattern) {
          const regex = new RegExp(`(${namesPattern})`, "g");
          text = text.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-800 text-yellow-900 dark:text-yellow-100 rounded px-0.5">$1</mark>');
        }
      }
      return <span dangerouslySetInnerHTML={{ __html: text }} />;
    }

    // 带搜索词：高亮搜索词
    const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`, "gi");
    const html = novelContent.replace(regex, '<mark class="bg-orange-300 dark:bg-orange-700 text-orange-900 dark:text-orange-100 rounded px-0.5">$1</mark>');
    return <span dangerouslySetInnerHTML={{ __html: html }} />;
  }, [novelContent, searchTerm, characterNames]);

  // ─── 保存 ────────────────────────────────────────

  const handleSave = async () => {
    if (!editContent.trim()) {
      setError("剧本内容不能为空");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await updateScript(script.id, editContent);
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ─── 键盘快捷键 ──────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editContent, script.id]);

  // ─── 渲染 ────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] min-h-[500px]">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 rounded-t-xl">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-gray-800 dark:text-gray-100 text-sm">
            📝 双栏编辑 — {sceneLabel}
          </h3>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            📍 {sceneMeta.location} · ⏰ {sceneMeta.timeOfDay}
            {sceneMeta.isLocked && " · 🔒 已锁定"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            当前版本 v{script.version} → 保存为 v{script.version + 1}
          </span>
          <span className="text-xs text-gray-300 dark:text-gray-600">|</span>
          <span className="text-xs text-gray-400 dark:text-gray-500">⌘S 保存</span>
        </div>
      </div>

      {/* 左侧搜索栏 */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
          🔍 原文搜索：
        </span>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => doSearch(e.target.value)}
          placeholder="输入关键词在原文中搜索…"
          className="flex-1 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 focus:outline-none"
        />
        {searchResults.length > 0 && (
          <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
            {currentSearchIdx + 1}/{searchResults.length} 处匹配
          </span>
        )}
        <button
          onClick={() => jumpToSearch(-1)}
          disabled={searchResults.length === 0}
          className="rounded px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition"
        >
          ▲
        </button>
        <button
          onClick={() => jumpToSearch(1)}
          disabled={searchResults.length === 0}
          className="rounded px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition"
        >
          ▼
        </button>
      </div>

      {/* 双栏主体 */}
      <div ref={containerRef} className="flex flex-1 min-h-0 overflow-hidden">
        {/* 左栏：原始小说 */}
        <div
          ref={leftPaneRef}
          className="overflow-y-auto border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
          style={{ width: `${splitRatio}%` }}
        >
          <div className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800 px-4 py-1.5">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              📖 原始小说
            </span>
            <span className="ml-2 text-xs text-gray-300 dark:text-gray-600">
              {novelContent.length.toLocaleString()} 字
            </span>
          </div>
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-gray-700 dark:text-gray-200 p-4 select-text">
            {renderHighlightedContent()}
          </pre>
        </div>

        {/* 可拖拽分割线 */}
        <div
          onMouseDown={handleMouseDown}
          className="w-1.5 cursor-col-resize bg-gray-200 dark:bg-gray-700 hover:bg-indigo-400 dark:hover:bg-indigo-500 transition-colors flex-shrink-0 relative group"
        >
          <div className="absolute inset-y-0 -left-1 -right-1" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-8 rounded-full bg-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span className="text-white text-xs">⟷</span>
          </div>
        </div>

        {/* 右栏：结构化剧本编辑器 */}
        <div
          className="flex flex-col overflow-hidden bg-white dark:bg-gray-900"
          style={{ width: `${100 - splitRatio}%` }}
        >
          <div className="flex items-center justify-between px-4 py-1.5 bg-gray-50 dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              ✍️ 结构化编辑
            </span>
            <span className="text-xs text-gray-300 dark:text-gray-600">表单模式</span>
          </div>
          <div className="flex-1 overflow-hidden">
            <ScriptBlockEditor
              value={editContent}
              onChange={setEditContent}
              characterNames={characterNames}
            />
          </div>
          {error && (
            <p className="px-4 py-2 text-sm text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950 flex-shrink-0">
              ❌ {error}
            </p>
          )}
        </div>
      </div>

      {/* 底部操作栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 rounded-b-xl">
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 dark:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:bg-gray-950 transition disabled:opacity-50"
          >
            ❌ 取消
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            按 ⌘S 快速保存
          </span>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition disabled:opacity-50 shadow-sm"
          >
            {saving ? (
              <>
                <span className="inline-block animate-spin mr-1">⏳</span>
                保存中...
              </>
            ) : (
              "💾 保存为新版本"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

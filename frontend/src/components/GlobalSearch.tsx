"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { search, SearchResult, SearchResponse } from "@/lib/api";

interface GlobalSearchProps {
  className?: string;
  novelId?: string; // 限定在当前小说内搜索
}

const TARGET_ICONS: Record<string, string> = {
  novels: "📖",
  scripts: "🎬",
  characters: "👤",
  annotations: "💬",
};

const TARGET_LABELS: Record<string, string> = {
  novels: "小说",
  scripts: "剧本",
  characters: "角色",
  annotations: "注记",
};

export default function GlobalSearch({ className = "", novelId }: GlobalSearchProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [tookMs, setTookMs] = useState(0);
  const [usingFTS5, setUsingFTS5] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [targetFilter, setTargetFilter] = useState<string>("all");
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // ─── ⌘K / Ctrl+K 快捷键 ──────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        if (!open) setTimeout(() => inputRef.current?.focus(), 100);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // ─── 搜索 ────────────────────────────────────────────────

  const doSearch = useCallback(
    async (q: string, target: string) => {
      if (!q.trim()) {
        setResults([]);
        setTotal(0);
        return;
      }
      setLoading(true);
      try {
        const res: SearchResponse = await search(q, {
          target: target === "all" ? undefined : target,
          novelId,
          limit: 15,
        });
        setResults(res.results);
        setTotal(res.total);
        setTookMs(res.tookMs);
        setUsingFTS5(res.usingFTS5);
        setSelectedIdx(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [novelId]
  );

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doSearch(query, targetFilter);
    }, 200);
    return () => clearTimeout(debounceRef.current);
  }, [query, targetFilter, doSearch]);

  // ─── 键盘导航 ────────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[selectedIdx];
      if (item) {
        router.push(item.url);
        setOpen(false);
      }
    }
  };

  const handleSelect = (item: SearchResult) => {
    router.push(item.url);
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 100); }}
        className={`rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-400 dark:text-gray-500 hover:border-indigo-300 dark:hover:border-indigo-700 hover:text-indigo-500 dark:hover:text-indigo-400 transition flex items-center gap-2 ${className}`}
      >
        <span>🔍</span>
        <span>搜索角色、伏笔、剧本...</span>
        <kbd className="hidden sm:inline-flex items-center rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-1.5 py-0.5 text-[10px] font-mono text-gray-400 dark:text-gray-500 ml-auto">
          ⌘K
        </kbd>
      </button>
    );
  }

  return (
    <>
      {/* 遮罩 */}
      <div
        className="fixed inset-0 z-50 bg-black/30 dark:bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* 搜索弹窗 */}
      <div className="fixed inset-x-0 top-[15vh] z-50 mx-auto max-w-xl px-4">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl overflow-hidden">
          {/* 搜索栏 */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <span className="text-gray-400 dark:text-gray-500 text-lg">
              {loading ? "⏳" : "🔍"}
            </span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="搜索角色名、地点、伏笔、剧本片段..."
              className="flex-1 bg-transparent text-base text-gray-800 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none"
              autoFocus
            />
            <button
              onClick={() => setOpen(false)}
              className="flex-shrink-0 rounded-lg px-2 py-1 text-xs text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            >
              ESC
            </button>
          </div>

          {/* 类型过滤 */}
          {query.trim() && (
            <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-50 dark:border-gray-800">
              {["all", "characters", "scripts", "novels", "annotations"].map((t) => (
                <button
                  key={t}
                  onClick={() => setTargetFilter(t)}
                  className={`rounded-full px-2.5 py-1 text-xs transition ${
                    targetFilter === t
                      ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium"
                      : "text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  {t === "all" ? "全部" : TARGET_LABELS[t] || t}
                </button>
              ))}
            </div>
          )}

          {/* 搜索结果 */}
          <div className="max-h-[55vh] overflow-y-auto">
            {!query.trim() ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                <p className="text-3xl mb-2">⌨️</p>
                <p>输入关键词搜索 — 跨小说全文/剧本/角色/注记</p>
                <p className="text-xs mt-2 text-gray-300 dark:text-gray-600">
                  支持拼音、前缀匹配、BM25 相关性排序
                </p>
              </div>
            ) : loading ? (
              <div className="px-4 py-8 text-center">
                <span className="text-sm text-gray-400 dark:text-gray-500">⏳ 搜索中...</span>
              </div>
            ) : results.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                <p className="text-3xl mb-2">🔎</p>
                <p>未找到匹配结果</p>
              </div>
            ) : (
              <div>
                {/* 搜索元信息 */}
                <div className="px-4 py-1.5 text-xs text-gray-400 dark:text-gray-500 flex items-center justify-between bg-gray-50/50 dark:bg-gray-950/50">
                  <span>
                    共 {total} 条结果
                    {targetFilter !== "all" && ` · ${TARGET_LABELS[targetFilter]}`}
                  </span>
                  <span className="tabular-nums">
                    {usingFTS5 ? "⚡ FTS5" : "📝 LIKE"} · {tookMs}ms
                  </span>
                </div>

                {results.map((item, i) => (
                  <button
                    key={`${item.targetType}:${item.id}`}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIdx(i)}
                    className={`w-full px-4 py-3 text-left flex gap-3 items-start transition border-b border-gray-50 dark:border-gray-800/50 ${
                      i === selectedIdx
                        ? "bg-indigo-50 dark:bg-indigo-950/30"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800/30"
                    }`}
                  >
                    {/* 类型图标 */}
                    <span className="flex-shrink-0 mt-0.5 text-base">
                      {TARGET_ICONS[item.targetType] || "📄"}
                    </span>

                    <div className="flex-1 min-w-0">
                      {/* 标题 */}
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                        {item.title}
                      </p>

                      {/* 摘要（HTML 片段） */}
                      {item.snippet && (
                        <p
                          className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2"
                          dangerouslySetInnerHTML={{
                            __html: item.snippet.replace(
                              /<b>/g,
                              '<b class="bg-yellow-200 dark:bg-yellow-700 rounded px-0.5">'
                            ),
                          }}
                        />
                      )}

                      {/* 来源 */}
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 flex items-center gap-2">
                        <span>{item.novelTitle}</span>
                        <span>·</span>
                        <span>{TARGET_LABELS[item.targetType]}</span>
                      </p>
                    </div>

                    {/* 快捷键提示 */}
                    {i === selectedIdx && (
                      <span className="flex-shrink-0 text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                        ↵
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 底部提示 */}
          <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-2 flex items-center gap-4 text-[10px] text-gray-400 dark:text-gray-600">
            <span>↑↓ 导航</span>
            <span>↵ 跳转</span>
            <span>Esc 关闭</span>
            {!usingFTS5 && query.trim() && (
              <span className="text-amber-500 ml-auto">⚠️ FTS5 不可用，使用 LIKE 降级</span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

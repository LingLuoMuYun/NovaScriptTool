"use client";

import { useState, useMemo } from "react";
import ConflictChart from "./ConflictChart";

interface TimelineItem {
  order: number;
  event: string;
  chapter?: string;
  timeHint?: string | null;
  location?: string | null;
  characters?: string[] | null;
  keywords?: string[] | null;
}

interface PlotOutlineProps {
  analysis: {
    outline?: { opening: string; development: string; climax: string; ending: string };
    timeline?: TimelineItem[];
    conflicts?: { type: string; description: string; parties: string[] }[];
  };
  knownCharacters?: string[];
}

/** 高亮搜索匹配文本 */
function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="rounded bg-yellow-200 dark:bg-yellow-700 px-0.5 text-inherit">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export default function PlotOutline({ analysis, knownCharacters = [] }: PlotOutlineProps) {
  const { outline, timeline, conflicts } = analysis;

  // ─── 时间线搜索与过滤 ──────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [charFilter, setCharFilter] = useState<string>(""); // 按角色过滤
  const [showFilters, setShowFilters] = useState(false);

  const filteredTimeline = useMemo(() => {
    if (!timeline) return [];
    let result = timeline;

    // 搜索过滤：匹配 event / timeHint / location / keywords / characters / chapter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((item) => {
        const searchable = [
          item.event,
          item.timeHint,
          item.location,
          item.chapter,
          ...(item.keywords || []),
          ...(item.characters || []),
        ]
          .filter(Boolean)
          .join(" ");
        return searchable.toLowerCase().includes(q);
      });
    }

    // 角色过滤
    if (charFilter) {
      result = result.filter((item) =>
        (item.characters || []).some((c) => c === charFilter)
      );
    }

    return result;
  }, [timeline, searchQuery, charFilter]);

  // 从时间线收集所有角色用于过滤下拉
  const allTimelineChars = useMemo(() => {
    const chars = new Set<string>();
    timeline?.forEach((item) => {
      (item.characters || []).forEach((c) => chars.add(c));
    });
    return Array.from(chars).sort();
  }, [timeline]);

  // 收集所有关键词用于快速过滤
  const allKeywords = useMemo(() => {
    const kw = new Set<string>();
    timeline?.forEach((item) => {
      (item.keywords || []).forEach((k) => kw.add(k));
    });
    return Array.from(kw).sort();
  }, [timeline]);

  const matchCount = filteredTimeline.length;
  const totalCount = timeline?.length || 0;

  return (
    <div className="space-y-6">
      {/* 故事大纲 */}
      {outline && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-sm dark:shadow-gray-950/30">
          <h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-gray-100">📖 故事大纲</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { label: "起因", value: outline.opening, color: "border-l-indigo-400" },
              { label: "发展", value: outline.development, color: "border-l-blue-400" },
              { label: "高潮", value: outline.climax, color: "border-l-orange-400" },
              { label: "结局", value: outline.ending, color: "border-l-emerald-400" },
            ].map((item) => (
              <div
                key={item.label}
                className={`rounded-lg border-l-4 ${item.color} bg-gray-50 dark:bg-gray-950 p-4`}
              >
                <p className="mb-1 text-xs font-semibold uppercase text-gray-400 dark:text-gray-500">
                  {item.label}
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-200">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 时间线 — 增强版：搜索 + 过滤 + 精确信息 */}
      {timeline && timeline.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-sm dark:shadow-gray-950/30">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">⏱️ 时间线</h2>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {totalCount} 个事件
            </span>
          </div>

          {/* 搜索栏 + 过滤切换 */}
          <div className="mb-4 space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                  🔍
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索时间线 — 事件/角色/地点/关键词/章节..."
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 pl-8 pr-3 py-2 text-sm text-gray-700 dark:text-gray-200 placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 transition"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    ✕
                  </button>
                )}
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex-shrink-0 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                  showFilters || charFilter
                    ? "border-indigo-300 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400"
                    : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                ⚙️ 过滤
                {charFilter && <span className="ml-1">· 1</span>}
              </button>
            </div>

            {/* 搜索结果提示 */}
            {(searchQuery || charFilter) && (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {matchCount === 0
                  ? "😕 无匹配事件"
                  : `匹配 ${matchCount}/${totalCount} 个事件`}
              </p>
            )}

            {/* 过滤面板 */}
            {showFilters && (
              <div className="rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 p-3 space-y-2 animate-fade-in">
                {/* 角色过滤 */}
                {allTimelineChars.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-1.5">按角色过滤</p>
                    <div className="flex flex-wrap gap-1">
                      <button
                        onClick={() => setCharFilter("")}
                        className={`rounded-full px-2.5 py-1 text-xs transition ${
                          !charFilter
                            ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium"
                            : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                        }`}
                      >
                        全部
                      </button>
                      {allTimelineChars.map((name) => (
                        <button
                          key={name}
                          onClick={() => setCharFilter(charFilter === name ? "" : name)}
                          className={`rounded-full px-2.5 py-1 text-xs transition ${
                            charFilter === name
                              ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium ring-1 ring-indigo-300"
                              : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                          }`}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 关键词快速过滤 */}
                {allKeywords.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-1.5">快速定位</p>
                    <div className="flex flex-wrap gap-1">
                      {allKeywords.map((kw) => (
                        <button
                          key={kw}
                          onClick={() => setSearchQuery(kw)}
                          className={`rounded-full px-2 py-0.5 text-xs transition ${
                            searchQuery === kw
                              ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
                              : "bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-500 hover:bg-amber-50 dark:hover:bg-amber-950 hover:text-amber-600 dark:hover:text-amber-400"
                          }`}
                        >
                          #{kw}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 时间线列表 */}
          <div className="relative space-y-3">
            {filteredTimeline.map((item, i) => {
              const isLast = i === filteredTimeline.length - 1;
              return (
                <div key={i} className="flex gap-3 group">
                  {/* 左侧时间轴 */}
                  <div className="flex flex-col items-center pt-0.5">
                    <div
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition ${
                        searchQuery
                          ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 ring-1 ring-amber-300"
                          : "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400"
                      }`}
                    >
                      {item.order}
                    </div>
                    {!isLast && (
                      <div className="mt-1 h-full min-h-[20px] w-0.5 bg-indigo-100 dark:bg-indigo-900/40" />
                    )}
                  </div>

                  {/* 事件内容 */}
                  <div className={`pb-3 flex-1 min-w-0 ${!isLast ? "" : ""}`}>
                    {/* 事件标题 */}
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100 leading-relaxed">
                      <HighlightText text={item.event} query={searchQuery} />
                    </p>

                    {/* 元信息行：时间提示 · 地点 · 章节 */}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                      {item.timeHint && (
                        <span className="inline-flex items-center gap-1">
                          <span>🕐</span>
                          <HighlightText text={item.timeHint} query={searchQuery} />
                        </span>
                      )}
                      {item.location && (
                        <span className="inline-flex items-center gap-1">
                          <span>📍</span>
                          <HighlightText text={item.location} query={searchQuery} />
                        </span>
                      )}
                      {item.chapter && (
                        <span className="inline-flex items-center gap-1">
                          <span>📖</span>
                          <HighlightText text={item.chapter} query={searchQuery} />
                        </span>
                      )}
                    </div>

                    {/* 角色标签 */}
                    {item.characters && item.characters.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {item.characters.map((name) => {
                          const isFiltered = charFilter === name;
                          return (
                            <button
                              key={name}
                              onClick={() => setCharFilter(isFiltered ? "" : name)}
                              className={`rounded-full px-2 py-0.5 text-xs font-medium transition cursor-pointer ${
                                isFiltered
                                  ? "bg-indigo-200 dark:bg-indigo-800 text-indigo-800 dark:text-indigo-200 ring-1 ring-indigo-400"
                                  : "bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900"
                              }`}
                            >
                              @{name}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* 关键词标签 */}
                    {item.keywords && item.keywords.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {item.keywords.map((kw) => (
                          <button
                            key={kw}
                            onClick={() => setSearchQuery(kw)}
                            className={`rounded-full px-1.5 py-0.5 text-[10px] transition cursor-pointer ${
                              searchQuery.toLowerCase() === kw.toLowerCase()
                                ? "bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200"
                                : "bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900"
                            }`}
                          >
                            #{kw}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 冲突分析 */}
      {conflicts && conflicts.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-sm dark:shadow-gray-950/30">
          <h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-gray-100">⚡ 剧情冲突</h2>
          <div className="space-y-3">
            {conflicts.map((c, i) => (
              <div key={i} className="rounded-lg bg-red-50 dark:bg-red-950 p-4">
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded-full bg-red-200 px-2 py-0.5 text-xs font-medium text-red-700">
                    {c.type}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {c.parties?.join(" vs ")}
                  </span>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-200">{c.description}</p>
              </div>
            ))}
            <ConflictChart conflicts={conflicts} knownCharacters={knownCharacters} />
          </div>
        </div>
      )}
    </div>
  );
}

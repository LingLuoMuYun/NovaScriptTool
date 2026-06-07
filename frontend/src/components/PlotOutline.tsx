"use client";

import ConflictChart from "./ConflictChart";

interface PlotOutlineProps {
  analysis: {
    outline?: { opening: string; development: string; climax: string; ending: string };
    timeline?: { order: number; event: string; chapter?: string }[];
    conflicts?: { type: string; description: string; parties: string[] }[];
  };
  knownCharacters?: string[];
}

export default function PlotOutline({ analysis, knownCharacters }: PlotOutlineProps) {
  const { outline, timeline, conflicts } = analysis;

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

      {/* 时间线 */}
      {timeline && timeline.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-sm dark:shadow-gray-950/30">
          <h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-gray-100">⏱️ 时间线</h2>
          <div className="relative space-y-4">
            {timeline.map((item, i) => (
              <div key={i} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-xs font-bold text-indigo-600 dark:text-indigo-400">
                    {item.order}
                  </div>
                  {i < timeline.length - 1 && (
                    <div className="mt-1 h-full w-0.5 bg-indigo-100 dark:bg-indigo-900/40" />
                  )}
                </div>
                <div className="pb-4">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{item.event}</p>
                  {item.chapter && (
                    <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{item.chapter}</p>
                  )}
                </div>
              </div>
            ))}
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

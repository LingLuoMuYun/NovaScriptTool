"use client";

import { DiffLine } from "@/lib/api";

interface DiffViewerProps {
  diffs: DiffLine[];
}

export default function DiffViewer({ diffs }: DiffViewerProps) {
  if (!diffs || diffs.length === 0) {
    return <p className="p-6 text-center text-sm text-gray-400 dark:text-gray-500">无差异</p>;
  }

  const addedCount = diffs.filter((d) => d.type === "added").reduce((s, d) => s + d.lines.length, 0);
  const removedCount = diffs.filter((d) => d.type === "removed").reduce((s, d) => s + d.lines.length, 0);

  return (
    <div>
      {/* 差异统计 */}
      <div className="flex gap-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 px-4 py-2 text-xs">
        <span className="text-green-600 dark:text-green-400">+{addedCount} 行新增</span>
        <span className="text-red-600 dark:text-red-400">-{removedCount} 行删除</span>
      </div>

      {/* 代码对比 */}
      <div className="max-h-96 overflow-auto font-mono text-xs leading-relaxed">
        {diffs.map((diff, i) => (
          <div
            key={i}
            className={`flex ${
              diff.type === "added"
                ? "bg-green-50 dark:bg-green-950"
                : diff.type === "removed"
                ? "bg-red-50 dark:bg-red-950"
                : ""
            }`}
          >
            {/* 行号列 */}
            <div className="w-16 shrink-0 select-none border-r border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 px-2 text-right text-gray-400 dark:text-gray-500">
              {diff.type === "added" && diff.newLineNum != null && (
                <span>{diff.newLineNum}</span>
              )}
              {diff.type === "removed" && diff.oldLineNum != null && (
                <span>{diff.oldLineNum}</span>
              )}
              {diff.type === "unchanged" && diff.oldLineNum != null && (
                <span>{diff.oldLineNum}</span>
              )}
            </div>
            {/* 行号列（新版） */}
            <div className="w-16 shrink-0 select-none border-r border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 px-2 text-right text-gray-400 dark:text-gray-500">
              {diff.type === "added" && diff.newLineNum != null && (
                <span>{diff.newLineNum}</span>
              )}
              {diff.type === "removed" && diff.oldLineNum != null && (
                <span></span>
              )}
              {diff.type === "unchanged" && diff.newLineNum != null && (
                <span>{diff.newLineNum}</span>
              )}
            </div>
            {/* 内容 */}
            <div className="flex-1 px-3">
              {diff.lines.map((line, j) => (
                <div
                  key={j}
                  className={`whitespace-pre ${
                    diff.type === "added"
                      ? "text-green-800"
                      : diff.type === "removed"
                      ? "text-red-800 line-through"
                      : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  <span className="mr-2 select-none">
                    {diff.type === "added" ? "+" : diff.type === "removed" ? "-" : " "}
                  </span>
                  {line || " "}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

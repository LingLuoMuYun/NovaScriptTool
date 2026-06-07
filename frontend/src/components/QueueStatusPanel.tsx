"use client";

import { useState, useEffect, useCallback } from "react";
import { getQueueStatus, subscribeQueueStream, cancelQueueJob, QueueStatus as QueueStatusType } from "@/lib/api";

interface QueueStatusPanelProps {
  className?: string;
  onJobClick?: (jobId: string) => void;
}

/** 并发任务队列状态面板 — 显示活跃/排队任务、速率限制、并发槽位 */
export default function QueueStatusPanel({ className = "", onJobClick }: QueueStatusPanelProps) {
  const [status, setStatus] = useState<QueueStatusType | null>(null);
  const [expanded, setExpanded] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const s = await getQueueStatus();
      setStatus(s);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchStatus();
    const controller = subscribeQueueStream(
      (s) => setStatus(s),
      () => { /* SSE error, fall back to polling */ }
    );
    // 兜底轮询 (每 5 秒)
    const poll = setInterval(fetchStatus, 5000);
    return () => {
      controller.abort();
      clearInterval(poll);
    };
  }, [fetchStatus]);

  if (!status) return null;

  const { active, pending, maxConcurrency, totalCompleted, totalFailed, rateLimitRemaining } = status;
  const totalActive = active.length;
  const totalPending = pending.length;
  const hasActivity = totalActive > 0 || totalPending > 0;

  // 静默：没有任何活动且没有最近完成/失败记录
  if (!hasActivity && totalCompleted === 0 && totalFailed === 0) return null;

  return (
    <div className={`rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm dark:shadow-gray-950/30 ${className}`}>
      {/* 折叠头部 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-t-xl transition"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
            ⚡ 任务队列
          </span>
          {hasActivity && (
            <span className="inline-flex items-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:text-indigo-300">
              {totalActive + totalPending} 个任务
            </span>
          )}
          {!hasActivity && totalCompleted > 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              最近完成 {totalCompleted} 个任务
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* 并发槽位指示器 */}
          <div className="flex items-center gap-1" title={`${totalActive}/${maxConcurrency} 并发槽位占用`}>
            {Array.from({ length: maxConcurrency }).map((_, i) => (
              <span
                key={i}
                className={`h-2 w-2 rounded-full transition-colors ${
                  i < totalActive
                    ? "bg-emerald-500 animate-pulse"
                    : "bg-gray-200 dark:bg-gray-700"
                }`}
              />
            ))}
          </div>
          {/* 速率限制 */}
          <span
            className={`text-xs ${rateLimitRemaining <= 2 ? "text-amber-500" : "text-gray-400 dark:text-gray-500"}`}
            title={`AI API 速率限制: 剩余 ${rateLimitRemaining} 次/分钟`}
          >
            🎯 {rateLimitRemaining}
          </span>
          <span className={`text-xs text-gray-400 dark:text-gray-500 transition-transform ${expanded ? "rotate-180" : ""}`}>
            ▼
          </span>
        </div>
      </button>

      {/* 展开内容 */}
      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3 space-y-3">
          {/* 活跃任务 */}
          {totalActive > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                🔄 执行中 ({totalActive})
              </p>
              {active.map((job) => (
                <JobCard key={job.id} job={job} onClick={() => onJobClick?.(job.id)} />
              ))}
            </div>
          )}

          {/* 排队任务 */}
          {totalPending > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                ⏳ 等待中 ({totalPending})
              </p>
              {pending.map((job, i) => (
                <JobCard key={job.id} job={job} position={i + 1} onClick={() => onJobClick?.(job.id)} />
              ))}
            </div>
          )}

          {/* 空闲状态 */}
          {!hasActivity && (
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-2">
              ✅ 队列空闲 — 无等待任务
            </p>
          )}

          {/* 统计摘要 */}
          <div className="flex gap-3 text-xs text-gray-400 dark:text-gray-500 pt-2 border-t border-gray-50 dark:border-gray-800">
            <span>✅ 完成 {totalCompleted}</span>
            <span>❌ 失败 {totalFailed}</span>
            <span>⚡ 并发 {maxConcurrency}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** 单个任务卡片 */
function JobCard({
  job,
  position,
  onClick,
}: {
  job: any;
  position?: number;
  onClick?: () => void;
}) {
  const typeLabels: Record<string, string> = {
    analyze: "📖 分析",
    "generate-scripts": "🎬 生成",
    pipeline: "🚀 流水线",
    "incremental-pipeline": "🔄 增量重算",
  };

  const isRunning = job.status === "running";
  const progress = job.progress;

  return (
    <div
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 mb-1.5 transition cursor-pointer ${
        isRunning
          ? "border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/30 hover:bg-indigo-50 dark:hover:bg-indigo-950/50"
          : "border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {position && (
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-800 text-[10px] font-bold text-gray-500 dark:text-gray-400 flex items-center justify-center">
              {position}
            </span>
          )}
          <span className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate">
            {typeLabels[job.type] || job.type}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500 truncate">
            {job.novelTitle}
          </span>
        </div>
        {isRunning && (
          <span className="flex-shrink-0 ml-2 inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
            执行中
          </span>
        )}
      </div>

      {/* 进度条 */}
      {isRunning && progress && (
        <div className="mt-1.5">
          <div className="flex items-center justify-between text-[10px] text-gray-400 dark:text-gray-500 mb-0.5">
            <span>{progress.message || "处理中..."}</span>
            {progress.progress != null && <span>{progress.progress}%</span>}
          </div>
          {progress.progress != null && (
            <div className="h-1 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                style={{ width: `${Math.min(100, progress.progress)}%` }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

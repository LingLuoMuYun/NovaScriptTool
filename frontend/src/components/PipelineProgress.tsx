"use client";

interface PipelineProgressProps {
  progress: number;
  stage: string;
  message: string;
  detail?: string;
  stats?: { characters?: number; scenes?: number; currentScene?: number; totalScenes?: number };
  error?: string;
  isRunning: boolean;
}

const STEPS = [
  { key: "analyze", icon: "📖", label: "剧情解构", agent: "Agent 1" },
  { key: "characters", icon: "👤", label: "角色提取", agent: "Agent 2" },
  { key: "scenes", icon: "🎬", label: "场景规划", agent: "Agent 3" },
  { key: "scripts", icon: "✍️", label: "剧本生成", agent: "Agent 4" },
  { key: "save", icon: "💾", label: "保存数据", agent: "" },
];

const STAGE_ORDER = ["", "analyze", "characters", "scenes", "scripts", "save", "done"];

function getStepStatus(stepKey: string, stage: string) {
  const currentIdx = STAGE_ORDER.indexOf(stage);
  const stepIdx = STAGE_ORDER.indexOf(stepKey);

  if (stage === "error") return "error";
  if (stage === "done" || currentIdx > stepIdx) return "done";
  if (currentIdx === stepIdx) return "active";
  return "pending";
}

export default function PipelineProgress({
  progress,
  stage,
  message,
  detail,
  stats,
  error,
  isRunning,
}: PipelineProgressProps) {
  if (!isRunning && stage !== "done" && stage !== "error") return null;

  return (
    <div className="animate-fade-in rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      {/* 头部 */}
      <div className="mb-6 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          {stage === "done" ? (
            <>✅ 处理完成</>
          ) : stage === "error" ? (
            <>❌ 处理失败</>
          ) : (
            <>
              <svg className="h-5 w-5 animate-spin text-indigo-600" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              AI 处理中
            </>
          )}
        </h3>
        <span className="text-2xl font-bold text-indigo-600 tabular-nums">
          {progress}%
        </span>
      </div>

      {/* 进度条 */}
      <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${
            stage === "error" ? "bg-red-500" : "bg-gradient-to-r from-indigo-500 to-purple-500"
          }`}
          style={{ width: `${Math.max(progress, 2)}%` }}
        />
      </div>

      {/* 步骤节点 */}
      <div className="mb-4 flex items-start justify-between">
        {STEPS.map((step, i) => {
          const status = getStepStatus(step.key, stage);
          return (
            <div key={step.key} className="flex flex-col items-center" style={{ width: "20%" }}>
              {/* 节点圆圈 */}
              <div
                className={`z-10 flex h-10 w-10 items-center justify-center rounded-full text-lg transition-all duration-500 ${
                  status === "done"
                    ? "scale-100 bg-green-500 text-white shadow-md"
                    : status === "active"
                    ? "scale-110 bg-indigo-600 text-white shadow-lg animate-pulse-glow"
                    : status === "error"
                    ? "bg-red-100 text-red-400"
                    : "bg-gray-100 text-gray-300"
                }`}
                style={{
                  animationDelay: status === "active" ? "0s" : undefined,
                }}
              >
                {status === "done" ? (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  step.icon
                )}
              </div>

              {/* 标签 */}
              <p
                className={`mt-2 text-center text-xs font-medium leading-tight transition-colors ${
                  status === "active"
                    ? "text-indigo-600"
                    : status === "done"
                    ? "text-green-600"
                    : "text-gray-400"
                }`}
              >
                {step.label}
              </p>
              {step.agent && (
                <p className="text-xs text-gray-300">{step.agent}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* 连接线（CSS 实现 - 位于节点后方） */}
      {/* 使用百分比宽度的伪线条 */}
      <div className="relative mb-4 -mt-[52px] mx-auto h-0 w-[80%]">
        {/* 这层由 progress 条的填充部分来视觉连接 */}
      </div>

      {/* 实时消息 */}
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-700">❌ 操作失败</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-red-600">{error}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
          <div className="flex items-center gap-2">
            {isRunning && (
              <span className="flex h-2 w-2">
                <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-indigo-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500" />
              </span>
            )}
            <p className="text-sm font-medium text-gray-700">{message}</p>
          </div>
          {detail && (
            <p className="mt-1 text-xs text-gray-500">{detail}</p>
          )}

          {/* 统计信息 */}
          {stats && (stats.characters || stats.scenes) && (
            <div className="mt-3 flex gap-4 text-xs text-gray-500">
              {stats.characters && (
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-indigo-600">
                  👤 {stats.characters} 个角色
                </span>
              )}
              {stats.scenes && (
                <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-3 py-1 text-purple-600">
                  🎬 {stats.scenes} 个场景
                </span>
              )}
              {stats.currentScene && stats.totalScenes && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-amber-600">
                  ✍️ 场景 {stats.currentScene}/{stats.totalScenes}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

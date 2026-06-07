"use client";

interface ImpactPath {
  targetSceneNum: number;
  sourceSceneNum: number;
  type: string;
  weight: number;
}

interface ImpactDialogProps {
  affectedSceneNums: number[];
  excludedLockedNums: number[];
  impactPaths?: ImpactPath[];
  changeSources?: number[];
  minWeight: number;
  onMinWeightChange: (w: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onRecalculate?: () => void;
  loading?: boolean;
  recalculating?: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  causal_event: "因果事件",
  character_continuity: "角色延续",
  temporal: "时间顺序",
};

const TYPE_COLORS: Record<string, string> = {
  causal_event: "bg-red-100 dark:bg-red-900/40 text-red-700",
  character_continuity: "bg-blue-100 text-blue-700",
  temporal: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 dark:text-gray-600",
};

export default function ImpactDialog({
  affectedSceneNums,
  excludedLockedNums,
  impactPaths,
  changeSources,
  minWeight,
  onMinWeightChange,
  onConfirm,
  onCancel,
  onRecalculate,
  loading,
  recalculating,
}: ImpactDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-lg animate-fade-in rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-xl max-h-[85vh] overflow-y-auto">
        <div className="mb-4 flex items-center gap-3">
          <span className="text-2xl">⚡</span>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">增量重算确认</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              检测到变更，系统已计算影响范围
            </p>
          </div>
        </div>

        {/* 影响范围选择 */}
        <div className="mb-4 rounded-xl border border-purple-100 bg-purple-50 dark:bg-purple-950 p-3">
          <p className="text-xs font-medium text-purple-700 mb-2">🎯 重算范围</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 0.7, label: "保守", icon: "🔴", desc: "仅因果强关联", active: minWeight === 0.7 },
              { value: 0.3, label: "标准", icon: "🟡", desc: "含角色连续出场", active: minWeight === 0.3 },
              { value: 0, label: "全面", icon: "🟢", desc: "含全部时序关联", active: minWeight === 0 },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => onMinWeightChange(opt.value)}
                className={`rounded-xl border p-2.5 text-center transition ${
                  opt.active
                    ? "border-purple-500 bg-white dark:bg-gray-900 shadow-sm dark:shadow-gray-950/30"
                    : "border-purple-200 bg-purple-100/50 hover:bg-white dark:bg-gray-900"
                }`}
              >
                <span className="text-lg">{opt.icon}</span>
                <p className={`text-xs font-semibold mt-0.5 ${opt.active ? "text-purple-700" : "text-purple-500"}`}>
                  {opt.label}
                </p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 leading-tight">{opt.desc}</p>
              </button>
            ))}
          </div>
          {onRecalculate && (
            <button
              onClick={onRecalculate}
              className="mt-2 w-full rounded-lg bg-purple-100 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-200 transition"
            >
              🔄 刷新影响范围
            </button>
          )}
        </div>

        {/* 变更源 */}
        {changeSources && changeSources.length > 0 && (
          <div className="mb-4 rounded-xl border border-green-100 bg-green-50 dark:bg-green-950 p-4">
            <p className="text-sm font-medium text-green-700">
              📝 检测到 {changeSources.length} 个变更源：
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {changeSources.map((n) => (
                <span
                  key={n}
                  className="rounded-full bg-green-100 dark:bg-green-900/40 px-2.5 py-0.5 text-xs font-medium text-green-600 dark:text-green-400"
                >
                  场景 {n}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 受影响场景 + 依赖链路 */}
        <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50 dark:bg-indigo-950 p-4">
          <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
            将重新生成以下 {affectedSceneNums.length} 个场景：
          </p>

          {impactPaths && impactPaths.length > 0 ? (
            <div className="mt-2 space-y-1.5 max-h-[200px] overflow-y-auto">
              {affectedSceneNums.map((sceneNum) => {
                const paths = impactPaths.filter(
                  (p) => p.targetSceneNum === sceneNum
                );
                return (
                  <div
                    key={sceneNum}
                    className="flex items-start gap-2 rounded-lg bg-white dark:bg-gray-900/70 px-3 py-2"
                  >
                    <span className="mt-0.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 shrink-0">
                      S{sceneNum}
                    </span>
                    <div className="flex-1 min-w-0">
                      {paths.map((p, i) => (
                        <div key={i} className="text-xs leading-relaxed">
                          <span className="text-gray-400 dark:text-gray-500">← 场景 {p.sourceSceneNum}</span>
                          <span
                            className={`ml-1.5 rounded px-1 py-px text-[10px] font-medium ${
                              TYPE_COLORS[p.type] || "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 dark:text-gray-600"
                            }`}
                          >
                            {TYPE_LABELS[p.type] || p.type}
                          </span>
                          <span className="ml-1 text-[10px] text-gray-400 dark:text-gray-500">
                            ({(p.weight * 100).toFixed(0)}%)
                          </span>
                        </div>
                      ))}
                      {paths.length === 0 && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">直接变更源</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {affectedSceneNums.map((n) => (
                <span
                  key={n}
                  className="rounded-full bg-indigo-100 dark:bg-indigo-900/40 px-3 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400"
                >
                  场景 {n}
                </span>
              ))}
            </div>
          )}
        </div>

        {excludedLockedNums.length > 0 && (
          <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50 dark:bg-amber-950 p-4">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
              🔒 以下 {excludedLockedNums.length} 个锁定场景已自动排除：
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {excludedLockedNums.map((n) => (
                <span
                  key={n}
                  className="rounded-full bg-amber-100 dark:bg-amber-900/40 px-3 py-1 text-xs font-medium text-amber-600"
                >
                  场景 {n}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={loading || recalculating}
            className="rounded-xl border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 dark:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-950 transition"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={loading || recalculating}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            {loading || recalculating ? "⏳ 重算中..." : "✅ 确认重算"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

interface ImpactDialogProps {
  affectedSceneNums: number[];
  excludedLockedNums: number[];
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export default function ImpactDialog({
  affectedSceneNums,
  excludedLockedNums,
  onConfirm,
  onCancel,
  loading,
}: ImpactDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md animate-fade-in rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-3">
          <span className="text-2xl">⚡</span>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">增量重算确认</h3>
            <p className="text-sm text-gray-500">检测到变更，系统已计算影响范围</p>
          </div>
        </div>

        <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50 p-4">
          <p className="text-sm font-medium text-indigo-700">
            将重新生成以下 {affectedSceneNums.length} 个场景：
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {affectedSceneNums.map((n) => (
              <span
                key={n}
                className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-600"
              >
                场景 {n}
              </span>
            ))}
          </div>
        </div>

        {excludedLockedNums.length > 0 && (
          <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-700">
              🔒 以下 {excludedLockedNums.length} 个锁定场景已自动排除：
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {excludedLockedNums.map((n) => (
                <span
                  key={n}
                  className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-600"
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
            disabled={loading}
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            {loading ? "⏳ 重算中..." : "✅ 确认重算"}
          </button>
        </div>
      </div>
    </div>
  );
}

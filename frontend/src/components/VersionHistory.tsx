"use client";

import { useState, useEffect, useCallback } from "react";
import { Script, getSceneVersions, rollbackScene, diffSceneVersions, DiffLine } from "@/lib/api";
import DiffViewer from "./DiffViewer";

interface VersionHistoryProps {
  sceneId: string;
  sceneLabel: string;
  onClose?: () => void;
  onRollback?: () => void;
}

export default function VersionHistory({ sceneId, sceneLabel, onClose, onRollback }: VersionHistoryProps) {
  const [versions, setVersions] = useState<Script[]>([]);
  const [loading, setLoading] = useState(true);
  const [diffMode, setDiffMode] = useState(false);
  const [v1, setV1] = useState<string>("");
  const [v2, setV2] = useState<string>("");
  const [diffs, setDiffs] = useState<DiffLine[]>([]);
  const [diffLoading, setDiffLoading] = useState(false);
  const [rollingBack, setRollingBack] = useState<string | null>(null);

  const fetchVersions = useCallback(async () => {
    try {
      const data = await getSceneVersions(sceneId);
      setVersions(data);
    } catch (err) {
      console.error("获取版本列表失败:", err);
    } finally {
      setLoading(false);
    }
  }, [sceneId]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  const handleDiff = async () => {
    if (!v1 || !v2) return;
    setDiffLoading(true);
    try {
      const result = await diffSceneVersions(sceneId, v1, v2);
      setDiffs(result.diffs);
      setDiffMode(true);
    } catch (err) {
      console.error("Diff 失败:", err);
    } finally {
      setDiffLoading(false);
    }
  };

  const handleRollback = async (versionId: string) => {
    if (!confirm(`确定回滚到此版本？系统会将其复制为新版本（审计链完整）。`)) return;
    setRollingBack(versionId);
    try {
      await rollbackScene(sceneId, versionId);
      await fetchVersions();
      setDiffMode(false);
      onRollback?.();
    } catch (err) {
      console.error("回滚失败:", err);
    } finally {
      setRollingBack(null);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm dark:shadow-gray-950/30">
      {/* 头部 */}
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          📜 版本历史 — {sceneLabel}
        </h3>
        <div className="flex gap-2">
          {diffMode && (
            <button
              onClick={() => setDiffMode(false)}
              className="rounded px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 dark:bg-gray-800"
            >
              ← 返回列表
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-gray-300 dark:text-gray-600 text-sm">✕</button>
          )}
        </div>
      </div>

      {diffMode ? (
        <DiffViewer diffs={diffs} />
      ) : loading ? (
        <p className="p-6 text-center text-sm text-gray-400 dark:text-gray-500">加载中...</p>
      ) : versions.length === 0 ? (
        <p className="p-6 text-center text-sm text-gray-400 dark:text-gray-500">暂无版本记录</p>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          {/* Diff 选择器 */}
          <div className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 px-4 py-2">
            <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">选择两个版本对比差异：</p>
            <div className="flex items-center gap-3">
              <select
                value={v1}
                onChange={(e) => setV1(e.target.value)}
                className="flex-1 rounded border border-gray-200 dark:border-gray-700 px-2 py-1 text-xs"
              >
                <option value="">旧版本（基准）</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>v{v.version} — {new Date(v.createdAt).toLocaleString("zh-CN")}</option>
                ))}
              </select>
              <span className="text-xs text-gray-400 dark:text-gray-500">vs</span>
              <select
                value={v2}
                onChange={(e) => setV2(e.target.value)}
                className="flex-1 rounded border border-gray-200 dark:border-gray-700 px-2 py-1 text-xs"
              >
                <option value="">新版本（对比）</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>v{v.version} — {new Date(v.createdAt).toLocaleString("zh-CN")}</option>
                ))}
              </select>
              <button
                onClick={handleDiff}
                disabled={!v1 || !v2 || diffLoading}
                className="rounded bg-indigo-600 px-3 py-1 text-xs text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {diffLoading ? "..." : "对比"}
              </button>
            </div>
          </div>

          {/* 版本时间轴 */}
          <div className="px-4 py-2">
            {versions.map((v, i) => (
              <div key={v.id} className="relative flex gap-3 pb-4">
                {/* 时间轴线条 */}
                {i < versions.length - 1 && (
                  <div className="absolute left-[11px] top-6 h-full w-0.5 bg-gray-200" />
                )}
                {/* 版本节点 */}
                <div className={`z-10 mt-0.5 h-3 w-3 rounded-full border-2 ${
                  i === 0 ? "border-indigo-500 bg-indigo-100 dark:bg-indigo-900/40" : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900"
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">v{v.version}</span>
                    <span className={`rounded px-1.5 py-0.5 text-xs ${
                      v.createdBy === "user" ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300" : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                    }`}>
                      {v.createdBy === "user" ? "👤 手动" : "🤖 系统"}
                    </span>
                    {i === 0 && (
                      <span className="rounded bg-green-100 dark:bg-green-900/40 px-1.5 py-0.5 text-xs text-green-700">
                        当前
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {new Date(v.createdAt).toLocaleString("zh-CN")}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 truncate">
                    {v.yamlContent.substring(0, 80)}...
                  </p>
                  <button
                    onClick={() => handleRollback(v.id)}
                    disabled={rollingBack === v.id || i === 0}
                    className="mt-1 text-xs text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:text-indigo-300 disabled:text-gray-300 dark:text-gray-600"
                  >
                    {rollingBack === v.id ? "⏳ 回滚中..." : i === 0 ? "已是当前版本" : "🔄 恢复为此版本"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

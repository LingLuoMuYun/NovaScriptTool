"use client";

import { Scene, Script } from "@/lib/api";

interface ScriptViewerProps {
  scene: Scene & { scripts?: Script[] };
}

export default function ScriptViewer({ scene }: ScriptViewerProps) {
  const script = scene.scripts?.[0];

  if (!script) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <p className="text-4xl">📝</p>
        <p className="mt-3 text-gray-500">该场景尚未生成剧本</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* 场景标题 */}
      <div className="border-b border-gray-100 bg-gray-50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">
              Scene {scene.sceneNum} — {scene.location}
            </h3>
            <p className="text-sm text-gray-400">
              第 {script.version} 版 ·{" "}
              {new Date(script.createdAt).toLocaleDateString("zh-CN")}
            </p>
          </div>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
            ✅ 已生成
          </span>
        </div>
      </div>

      {/* 剧本内容 */}
      <div className="p-6">
        <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-gray-700">
          {script.yamlContent}
        </pre>
      </div>

      {/* 时间/地点信息 */}
      <div className="border-t border-gray-100 bg-gray-50 px-6 py-3">
        <div className="flex gap-4 text-xs text-gray-400">
          <span>📍 {scene.location}</span>
          <span>⏰ {scene.timeOfDay}</span>
        </div>
      </div>
    </div>
  );
}

"use client";

import { Scene, Script } from "@/lib/api";

interface SceneListProps {
  scenes: (Scene & { scripts?: Script[] })[];
  onSelectScene: (scene: Scene & { scripts?: Script[] }) => void;
  selectedSceneId?: string;
}

export default function SceneList({ scenes, onSelectScene, selectedSceneId }: SceneListProps) {
  if (scenes.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <p className="text-4xl">🎬</p>
        <p className="mt-3 text-gray-500">暂无场景数据</p>
        <p className="text-sm text-gray-400">AI 分析角色后可生成场景</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {scenes.map((scene) => (
        <button
          key={scene.id}
          onClick={() => onSelectScene(scene)}
          className={`w-full rounded-lg border p-4 text-left transition ${
            selectedSceneId === scene.id
              ? "border-indigo-400 bg-indigo-50 shadow-sm"
              : "border-gray-200 bg-white hover:border-indigo-200 hover:shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600">
                {scene.sceneNum}
              </span>
              <div>
                <p className="text-sm font-medium text-gray-800">{scene.location}</p>
                <p className="text-xs text-gray-400">
                  {scene.timeOfDay === "日" ? "☀️" : scene.timeOfDay === "夜" ? "🌙" : "🌅"}{" "}
                  {scene.timeOfDay}
                  {scene.scripts && scene.scripts.length > 0 && (
                    <span className="ml-2 text-emerald-500">· 剧本已生成</span>
                  )}
                </p>
              </div>
            </div>
            <span className="text-gray-300">→</span>
          </div>
        </button>
      ))}
    </div>
  );
}

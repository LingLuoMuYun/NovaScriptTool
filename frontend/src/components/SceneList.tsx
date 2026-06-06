"use client";

import { useState } from "react";
import { Scene, Script, lockScene, unlockScene } from "@/lib/api";

interface SceneListProps {
  scenes: (Scene & { scripts?: Script[] })[];
  onSelectScene: (scene: Scene & { scripts?: Script[] }) => void;
  selectedSceneId?: string;
  onRefresh?: () => void;
}

export default function SceneList({ scenes, onSelectScene, selectedSceneId, onRefresh }: SceneListProps) {
  const [lockingId, setLockingId] = useState<string | null>(null);

  const handleToggleLock = async (e: React.MouseEvent, scene: Scene) => {
    e.stopPropagation();
    setLockingId(scene.id);
    try {
      if (scene.isLocked) {
        await unlockScene(scene.id);
      } else {
        await lockScene(scene.id);
      }
      onRefresh?.();
    } catch (err: any) {
      console.error("锁定操作失败:", err);
    } finally {
      setLockingId(null);
    }
  };

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
          className={`relative w-full rounded-lg border p-4 text-left transition ${
            scene.isLocked ? "border-amber-300 bg-amber-50/50" : ""
          } ${
            selectedSceneId === scene.id
              ? "border-indigo-400 bg-indigo-50 shadow-sm"
              : scene.isLocked
              ? "hover:border-amber-400"
              : "border-gray-200 bg-white hover:border-indigo-200 hover:shadow-sm"
          }`}
        >
          {/* 锁定遮罩指示 */}
          {scene.isLocked && (
            <div className="absolute right-3 top-3 flex items-center gap-1">
              <span
                onClick={(e) => handleToggleLock(e, scene)}
                className={`cursor-pointer rounded-full p-1 text-xs transition hover:bg-amber-200 ${
                  lockingId === scene.id ? "animate-pulse" : ""
                }`}
                title="点击解锁"
              >
                {lockingId === scene.id ? "⏳" : "🔒"}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                  scene.isLocked
                    ? "bg-amber-100 text-amber-600"
                    : "bg-indigo-100 text-indigo-600"
                }`}
              >
                {scene.sceneNum}
              </span>
              <div>
                <p className={`text-sm font-medium ${scene.isLocked ? "text-gray-500" : "text-gray-800"}`}>
                  {scene.location}
                </p>
                <p className="text-xs text-gray-400">
                  {scene.timeOfDay === "日" ? "☀️" : scene.timeOfDay === "夜" ? "🌙" : "🌅"}{" "}
                  {scene.timeOfDay}
                  {scene.isLocked && (
                    <span className="ml-2 text-amber-500">· 🔒 已锁定</span>
                  )}
                  {!scene.isLocked && scene.scripts && scene.scripts.length > 0 && (
                    <span className="ml-2 text-emerald-500">· 剧本已生成</span>
                  )}
                </p>
              </div>
            </div>
            {!scene.isLocked && (
              <span
                onClick={(e) => handleToggleLock(e, scene)}
                className={`cursor-pointer text-xs text-gray-300 hover:text-amber-500 transition ${
                  lockingId === scene.id ? "animate-pulse" : ""
                }`}
                title="锁定此场景"
              >
                {lockingId === scene.id ? "⏳" : "🔓"}
              </span>
            )}
            {!scene.isLocked && <span className="text-gray-300">→</span>}
          </div>
        </button>
      ))}
    </div>
  );
}

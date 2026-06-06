"use client";

import { useState } from "react";
import { Scene, Script, lockScene, unlockScene, deleteScene } from "@/lib/api";

interface SceneListProps {
  scenes: (Scene & { scripts?: Script[] })[];
  onSelectScene: (scene: Scene & { scripts?: Script[] }) => void;
  selectedSceneId?: string;
  onRefresh?: () => void;
  onCreateScene?: () => void;
  onEditScene?: (scene: Scene & { scripts?: Script[] }) => void;
  onDeleteScene?: (sceneId: string) => void;
}

export default function SceneList({
  scenes,
  onSelectScene,
  selectedSceneId,
  onRefresh,
  onCreateScene,
  onEditScene,
  onDeleteScene,
}: SceneListProps) {
  const [lockingId, setLockingId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  const handleToggleMenu = (e: React.MouseEvent, sceneId: string) => {
    e.stopPropagation();
    setMenuOpenId(menuOpenId === sceneId ? null : sceneId);
  };

  const handleEdit = (e: React.MouseEvent, scene: Scene & { scripts?: Script[] }) => {
    e.stopPropagation();
    setMenuOpenId(null);
    onEditScene?.(scene);
  };

  const handleDelete = async (e: React.MouseEvent, scene: Scene & { scripts?: Script[] }) => {
    e.stopPropagation();
    setMenuOpenId(null);

    let confirmMsg = `确定删除场景 ${scene.sceneNum}「${scene.location}」？`;
    if (scene.isLocked) {
      confirmMsg += "\n\n⚠️  此场景已锁定，是否强制删除？";
    }

    if (!confirm(confirmMsg)) return;

    setDeletingId(scene.id);
    try {
      await deleteScene(scene.id, scene.isLocked ? true : false);
      onDeleteScene?.(scene.id);
    } catch (err: any) {
      alert(`删除失败: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-2">
      {/* 添加场景按钮 */}
      {onCreateScene && (
        <button
          onClick={onCreateScene}
          className="mb-3 w-full rounded-xl border-2 border-dashed border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-500 transition hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50"
        >
          + 添加场景
        </button>
      )}

      {scenes.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <p className="text-4xl">🎬</p>
          <p className="mt-3 text-gray-500">暂无场景数据</p>
          <p className="text-sm text-gray-400">AI 分析角色后可生成场景，或手动创建</p>
        </div>
      ) : (
        scenes.map((scene) => (
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
            {/* 操作菜单（三点） */}
            {(onEditScene || onDeleteScene) && (
              <div className="absolute right-3 top-3 z-10">
                <span
                  onClick={(e) => handleToggleMenu(e, scene.id)}
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs transition ${
                    menuOpenId === scene.id
                      ? "bg-gray-200 text-gray-600"
                      : "text-gray-300 hover:bg-gray-100 hover:text-gray-500"
                  }`}
                  title="更多操作"
                >
                  ⋮
                </span>

                {/* 下拉菜单 */}
                {menuOpenId === scene.id && (
                  <div
                    className="absolute right-0 top-7 min-w-[100px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {onEditScene && (
                      <button
                        onClick={(e) => handleEdit(e, scene)}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 transition"
                      >
                        ✏️ 编辑信息
                      </button>
                    )}
                    {onDeleteScene && (
                      <button
                        onClick={(e) => handleDelete(e, scene)}
                        disabled={deletingId === scene.id}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-500 hover:bg-red-50 hover:text-red-600 transition disabled:opacity-50"
                      >
                        {deletingId === scene.id ? "⏳ 删除中..." : "🗑 删除场景"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 锁定指示 */}
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

            {/* 锁定遮罩下的 ⋮ 菜单 */}
            {scene.isLocked && (onEditScene || onDeleteScene) && (
              <div className="absolute right-10 top-3 z-10">
                <span
                  onClick={(e) => handleToggleMenu(e, scene.id)}
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs transition ${
                    menuOpenId === scene.id
                      ? "bg-amber-200 text-amber-600"
                      : "text-amber-300 hover:bg-amber-100 hover:text-amber-500"
                  }`}
                  title="更多操作"
                >
                  ⋮
                </span>

                {menuOpenId === scene.id && (
                  <div
                    className="absolute right-0 top-7 min-w-[100px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {onEditScene && (
                      <button
                        onClick={(e) => handleEdit(e, scene)}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 transition"
                      >
                        ✏️ 编辑信息
                      </button>
                    )}
                    {onDeleteScene && (
                      <button
                        onClick={(e) => handleDelete(e, scene)}
                        disabled={deletingId === scene.id}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-500 hover:bg-red-50 hover:text-red-600 transition disabled:opacity-50"
                      >
                        {deletingId === scene.id ? "⏳ 删除中..." : "🗑 删除场景"}
                      </button>
                    )}
                  </div>
                )}
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
        ))
      )}
    </div>
  );
}

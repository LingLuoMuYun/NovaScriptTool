"use client";

import { useState } from "react";
import { Scene, createScene, updateScene } from "@/lib/api";

interface SceneEditorProps {
  mode: "create" | "edit";
  novelId: string;
  scene?: Scene;
  suggestedSceneNum?: number;
  onSave: (scene: Scene) => void;
  onCancel: () => void;
}

const TIME_OPTIONS = ["日", "夜", "黄昏", "清晨", "黎明", "下午", "深夜"];

export default function SceneEditor({
  mode,
  novelId,
  scene,
  suggestedSceneNum,
  onSave,
  onCancel,
}: SceneEditorProps) {
  const [sceneNum, setSceneNum] = useState<number>(
    mode === "edit" ? scene?.sceneNum ?? 1 : suggestedSceneNum ?? 1
  );
  const [location, setLocation] = useState(scene?.location || "");
  const [timeOfDay, setTimeOfDay] = useState(scene?.timeOfDay || "日");
  const [yamlContent, setYamlContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!location.trim()) {
      setError("请输入场景地点");
      return;
    }
    if (!sceneNum || sceneNum < 1) {
      setError("场景编号必须为正整数");
      return;
    }

    setSaving(true);
    try {
      if (mode === "create") {
        const result = await createScene(novelId, {
          sceneNum,
          location: location.trim(),
          timeOfDay,
          yamlContent: yamlContent.trim() || undefined,
        });
        onSave(result);
      } else {
        const result = await updateScene(scene!.id, {
          sceneNum: sceneNum !== scene?.sceneNum ? sceneNum : undefined,
          location: location.trim() !== scene?.location ? location.trim() : undefined,
          timeOfDay: timeOfDay !== scene?.timeOfDay ? timeOfDay : undefined,
        });
        onSave(result);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-lg animate-fade-in rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center gap-3">
          <span className="text-2xl">{mode === "create" ? "🎬" : "✏️"}</span>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {mode === "create" ? "添加场景" : "编辑场景"}
            </h3>
            <p className="text-sm text-gray-500">
              {mode === "create" ? "手动创建新场景及其剧本" : `修改场景 ${scene?.sceneNum} 的信息`}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 场景编号 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              场景编号 <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              min={1}
              value={sceneNum}
              onChange={(e) => setSceneNum(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none transition"
              placeholder="例如: 1"
            />
          </div>

          {/* 地点 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              地点 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none transition"
              placeholder="例如: 星海学院 - 教学楼大厅"
            />
          </div>

          {/* 时间 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              时间 <span className="text-red-400">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {TIME_OPTIONS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTimeOfDay(t)}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                    timeOfDay === t
                      ? "border-indigo-400 bg-indigo-50 text-indigo-700 font-medium"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* 初始剧本（仅创建模式） */}
          {mode === "create" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                初始剧本 <span className="text-gray-400 font-normal">(可选)</span>
              </label>
              <textarea
                value={yamlContent}
                onChange={(e) => setYamlContent(e.target.value)}
                rows={6}
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:border-indigo-400 focus:outline-none transition"
                placeholder={`dialogue:\n  - character: "主角"\n    line: "..."\n\naction:\n  - "..."`}
              />
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="rounded-xl border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition disabled:opacity-50"
            >
              {saving ? "⏳ 保存中..." : mode === "create" ? "✅ 创建场景" : "💾 保存修改"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

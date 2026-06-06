"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getCharacterHeatmap, HeatmapData } from "@/lib/api";

interface CharacterHeatmapProps {
  novelId: string;
  onSceneClick?: (sceneNum: number) => void;
}

function intensityColor(value: number): string {
  if (value === 0) return "bg-white";
  if (value <= 15) return "bg-green-100";
  if (value <= 30) return "bg-green-200";
  if (value <= 45) return "bg-green-300";
  if (value <= 60) return "bg-green-400";
  if (value <= 75) return "bg-green-500";
  if (value <= 90) return "bg-green-600";
  return "bg-green-700";
}

const ROLE_BADGES: Record<string, string> = {
  "主角": "bg-amber-100 text-amber-700",
  "反派": "bg-red-100 text-red-700",
  "配角": "bg-gray-100 text-gray-600",
};

export default function CharacterHeatmap({ novelId, onSceneClick }: CharacterHeatmapProps) {
  const [data, setData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("全部");
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{
    charName: string; sceneNum: number; location: string; value: number;
  } | null>(null);

  // 防抖 tooltip，避免快速移动时闪烁
  const handleCellEnter = useCallback((info: typeof hoveredCell) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setHoveredCell(info);
  }, []);

  const handleCellLeave = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(() => setHoveredCell(null), 150);
  }, []);

  const fetch = useCallback(async () => {
    try {
      setData(await getCharacterHeatmap(novelId));
    } catch (err) {
      console.error("热力图获取失败:", err);
    } finally {
      setLoading(false);
    }
  }, [novelId]);

  useEffect(() => { fetch(); }, [fetch]);

  if (loading) return <p className="py-8 text-center text-xs text-gray-400">加载中...</p>;
  if (!data || data.characters.length === 0) {
    return <p className="py-8 text-center text-xs text-gray-400">暂无角色出场数据</p>;
  }

  // 筛选角色
  const filteredIndices = data.characters
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => filter === "全部" || c.roleType === filter)
    .map(({ i }) => i);

  const roleTypes = ["全部", ...new Set(data.characters.map((c) => c.roleType))];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-800">🔥 角色出场频率热力图</h3>
          <p className="text-xs text-gray-400">
            {data.characters.length} 个角色 × {data.scenes.length} 个场景 ·
            颜色越深 = 出场越多
          </p>
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600"
        >
          {roleTypes.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      {/* Tooltip - 防抖后稳定显示 */}
      <div className="mb-2 h-7">
        {hoveredCell && (
          <span className="inline-block rounded-lg bg-gray-800 px-3 py-1.5 text-xs text-white shadow-lg transition-opacity duration-150">
            <span className="font-medium">{hoveredCell.charName}</span>
            {" → "}场景 {hoveredCell.sceneNum}「{hoveredCell.location}」
            {" · "}强度: {hoveredCell.value}
          </span>
        )}
      </div>

      {/* 热力图网格 */}
      <div className="overflow-x-auto">
        <div className="inline-grid gap-px rounded-lg border border-gray-200 bg-gray-100"
          style={{
            gridTemplateColumns: `80px repeat(${data.scenes.length}, minmax(36px, 1fr))`,
          }}
        >
          {/* 表头行 */}
          <div className="bg-gray-50 px-2 py-1.5 text-xs font-medium text-gray-500 rounded-tl-lg">
            角色
          </div>
          {data.scenes.map((s) => (
            <div
              key={s.sceneNum}
              className="cursor-pointer bg-gray-50 px-1 py-1.5 text-center text-[10px] text-gray-400 hover:text-indigo-500 transition"
              onClick={() => onSceneClick?.(s.sceneNum)}
              title={`场景 ${s.sceneNum} — ${s.location}`}
            >
              {s.sceneNum}
            </div>
          ))}

          {/* 数据行 */}
          {filteredIndices.map((charIdx) => {
            const char = data.characters[charIdx];
            const row = data.matrix[charIdx];
            const badge = ROLE_BADGES[char.roleType] || "bg-gray-100 text-gray-600";

            return (
              <div key={char.name} className="contents">
                <div className="bg-white px-2 py-1.5 text-xs truncate border-t border-gray-100"
                  title={char.name}>
                  <span className="font-medium text-gray-700">{char.name}</span>
                  <span className={`ml-1 rounded px-1 py-0.5 text-[10px] ${badge}`}>
                    {char.roleType}
                  </span>
                </div>
                {row.map((val: number, sceneIdx: number) => (
                  <div
                    key={sceneIdx}
                    className={`${intensityColor(val)} cursor-pointer border-t border-gray-100 transition hover:ring-1 hover:ring-indigo-400`}
                    title={`${char.name} × 场景${data.scenes[sceneIdx].sceneNum}: 强度 ${val}`}
                    onClick={() => onSceneClick?.(data.scenes[sceneIdx].sceneNum)}
                    onMouseEnter={() =>
                      handleCellEnter({
                        charName: char.name,
                        sceneNum: data.scenes[sceneIdx].sceneNum,
                        location: data.scenes[sceneIdx].location,
                        value: val,
                      })
                    }
                    onMouseLeave={handleCellLeave}
                  >
                    <div className="h-7 w-full" />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* 颜色图例 */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-400">
        <span>出场强度:</span>
        {[0, 25, 50, 75, 100].map((v) => (
          <span key={v} className="inline-flex items-center gap-1">
            <span className={`h-3 w-3 rounded ${intensityColor(v)} border border-gray-200`} />
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}

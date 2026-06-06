"use client";

import dynamic from "next/dynamic";
import PlotOutline from "./PlotOutline";

// 图表组件懒加载（不影响首屏）
const DialogueDensity = dynamic(() => import("./DialogueDensity"), { ssr: false });
const RelationshipGraph = dynamic(() => import("./RelationshipGraph"), { ssr: false });
const CharacterHeatmap = dynamic(() => import("./CharacterHeatmap"), { ssr: false });
const EmotionCurve = dynamic(() => import("./EmotionCurve"), { ssr: false });

interface AnalysisDashboardProps {
  novelId: string;
  analysis: any;
  sceneCount: number;
  characterCount: number;
  characterNames?: string[];
  onSceneClick?: (sceneNum: number) => void;
}

export default function AnalysisDashboard({
  novelId,
  analysis,
  sceneCount,
  characterCount,
  characterNames,
  onSceneClick,
}: AnalysisDashboardProps) {
  const conflictCount = analysis?.conflicts?.length || 0;
  const conflictTypes = new Set(
    (analysis?.conflicts || []).map((c: any) => c.type)
  ).size;

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-2xl font-bold text-indigo-600">{sceneCount}</p>
          <p className="text-xs text-gray-400">总场景数</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-2xl font-bold text-amber-600">{characterCount}</p>
          <p className="text-xs text-gray-400">总角色数</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-2xl font-bold text-red-500">{conflictCount}</p>
          <p className="text-xs text-gray-400">冲突事件</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-2xl font-bold text-emerald-500">{conflictTypes}</p>
          <p className="text-xs text-gray-400">冲突类型</p>
        </div>
      </div>

      {/* 剧情大纲 */}
      {analysis && <PlotOutline analysis={analysis} knownCharacters={characterNames} />}

      {/* 冲突统计已内嵌在 PlotOutline 中 */}

      {/* 对白密度分析 */}
      {sceneCount > 0 && (
        <DialogueDensity novelId={novelId} onSceneClick={onSceneClick} />
      )}

      {/* 角色关系网络图 */}
      {characterCount >= 2 && (
        <RelationshipGraph novelId={novelId} />
      )}

      {/* 角色出场频率热力图 */}
      {characterCount > 0 && sceneCount > 0 && (
        <CharacterHeatmap novelId={novelId} onSceneClick={onSceneClick} />
      )}

      {/* 情感曲线 */}
      {sceneCount > 0 && (
        <EmotionCurve novelId={novelId} />
      )}
    </div>
  );
}

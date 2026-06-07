"use client";

import PlotOutline from "./PlotOutline";
import CharacterNetworkGraph from "./CharacterNetworkGraph";
import { Character } from "@/lib/api";

interface AnalysisDashboardProps {
  novelId: string;
  analysis: any;
  sceneCount: number;
  characterCount: number;
  characterNames?: string[];
  characters?: Character[];
  onSceneClick?: (sceneNum: number) => void;
}

export default function AnalysisDashboard({
  analysis,
  sceneCount,
  characterCount,
  characterNames,
  characters,
}: AnalysisDashboardProps) {
  const conflictCount = analysis?.conflicts?.length || 0;

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
          <p className="text-2xl font-bold text-emerald-500">
            {new Set((analysis?.conflicts || []).map((c: any) => c.type)).size}
          </p>
          <p className="text-xs text-gray-400">冲突类型</p>
        </div>
      </div>

      {/* 剧情大纲（含冲突统计图表） */}
      {analysis && <PlotOutline analysis={analysis} knownCharacters={characterNames} />}

      {/* 角色关系网络图 */}
      {characters && characters.length > 0 && (
        <CharacterNetworkGraph characters={characters} />
      )}
    </div>
  );
}

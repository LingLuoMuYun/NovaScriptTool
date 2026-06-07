"use client";

import dynamic from "next/dynamic";
import PlotOutline from "./PlotOutline";
import { Character } from "@/lib/api";

const CharacterNetworkGraph = dynamic(() => import("./CharacterNetworkGraph"), {
  ssr: false,
  loading: () => (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 text-center shadow-sm dark:shadow-gray-950/30">
      <p className="text-gray-400 dark:text-gray-500">⏳ 加载关系图中...</p>
    </div>
  ),
});

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
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 shadow-sm dark:shadow-gray-950/30">
          <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{sceneCount}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">总场景数</p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 shadow-sm dark:shadow-gray-950/30">
          <p className="text-2xl font-bold text-amber-600">{characterCount}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">总角色数</p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 shadow-sm dark:shadow-gray-950/30">
          <p className="text-2xl font-bold text-red-500 dark:text-red-400">{conflictCount}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">冲突事件</p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 shadow-sm dark:shadow-gray-950/30">
          <p className="text-2xl font-bold text-emerald-500 dark:text-emerald-400">
            {new Set((analysis?.conflicts || []).map((c: any) => c.type)).size}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">冲突类型</p>
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

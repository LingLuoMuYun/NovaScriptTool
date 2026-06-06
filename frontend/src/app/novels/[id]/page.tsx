"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getNovel, Novel, Character, Scene, Script } from "@/lib/api";
import AnalyzeButton from "@/components/AnalyzeButton";
import PlotOutline from "@/components/PlotOutline";
import CharacterCard from "@/components/CharacterCard";
import SceneList from "@/components/SceneList";
import ScriptViewer from "@/components/ScriptViewer";

type SceneWithScripts = Scene & { scripts?: Script[] };

export default function NovelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [novel, setNovel] = useState<Novel | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [scenes, setScenes] = useState<SceneWithScripts[]>([]);
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"info" | "plot" | "characters" | "scenes">("info");
  const [selectedScene, setSelectedScene] = useState<SceneWithScripts | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");

  const fetchNovel = useCallback(async () => {
    const data = await getNovel(id);
    setNovel(data);
    setCharacters(data.characters || []);
    setScenes((data.scenes || []) as SceneWithScripts[]);
    if (data.analysis) {
      try { setAnalysis(JSON.parse(data.analysis)); } catch {}
    }
  }, [id]);

  useEffect(() => {
    fetchNovel().then(() => setLoading(false));
  }, [fetchNovel]);

  const handleAnalyzed = useCallback((result: any) => {
    setAnalysis(result.plot);
    setCharacters(
      result.characters.map((c: any, i: number) => ({
        id: `temp-${i}`,
        novelId: id,
        name: c.name,
        aliases: JSON.stringify(c.aliases || []),
        roleType: c.roleType || "配角",
        traits: JSON.stringify(c.traits || {}),
      }))
    );
    fetchNovel();
  }, [id, fetchNovel]);

  const handleGenerateScripts = async () => {
    setGenError("");
    setGenerating(true);
    try {
      const res = await fetch(`http://localhost:4000/api/novels/${id}/generate-scripts`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "生成失败" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const result = await res.json();
      console.log("生成完成:", result.sceneCount, "个场景");
      await fetchNovel();
      setActiveTab("scenes");
    } catch (err: any) {
      setGenError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-400">加载中...</p>
      </div>
    );
  }

  if (!novel) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-4xl">📭</p>
          <p className="mt-2 text-gray-500">小说不存在</p>
          <Link href="/" className="mt-4 inline-block text-indigo-600 hover:underline">
            ← 返回首页
          </Link>
        </div>
      </div>
    );
  }

  const isAnalyzing = novel.status === "analyzing";

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/" className="mb-6 inline-flex items-center text-sm text-gray-500 hover:text-indigo-600">
        ← 返回列表
      </Link>

      {/* 标题 + 状态 */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{novel.title}</h1>
          <p className="mt-1 text-sm text-gray-400">
            {novel.content.length.toLocaleString()} 字 · 创建于{" "}
            {new Date(novel.createdAt).toLocaleDateString("zh-CN")}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            novel.status === "draft"
              ? "bg-gray-100 text-gray-500"
              : novel.status === "analyzing"
              ? "bg-yellow-100 text-yellow-700"
              : novel.status === "analyzed"
              ? "bg-blue-100 text-blue-700"
              : "bg-green-100 text-green-700"
          }`}
        >
          {novel.status === "draft" ? "📝 草稿"
            : novel.status === "analyzing" ? "⏳ 分析中"
            : novel.status === "analyzed" ? "🔍 已分析"
            : "✅ 已完成"}
        </span>
      </div>

      {/* 操作按钮 */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        {novel.status === "draft" && (
          <AnalyzeButton novelId={id} onAnalyzed={handleAnalyzed} />
        )}
        {novel.status === "analyzed" && characters.length > 0 && (
          <button
            onClick={handleGenerateScripts}
            disabled={generating}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                AI 生成剧本中...（可能需要 30-60 秒）
              </>
            ) : (
              <>
                🎬 生成场景剧本
              </>
            )}
          </button>
        )}
        {genError && <p className="text-sm text-red-600">❌ {genError}</p>}
      </div>

      {/* Tab 导航 */}
      <div className="mb-6 flex gap-2 border-b border-gray-200">
        {[
          { key: "info", label: "📖 原文" },
          { key: "plot", label: "📊 剧情分析" },
          { key: "characters", label: `👥 角色 (${characters.length})` },
          { key: "scenes", label: `🎬 场景 (${scenes.length})` },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition ${
              activeTab === tab.key
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 内容 */}
      {activeTab === "info" && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-gray-700">
            {novel.content.substring(0, 5000)}
            {novel.content.length > 5000 && (
              <span className="mt-4 block text-center text-gray-400">
                ... 共 {novel.content.length.toLocaleString()} 字，仅展示前 5000 字
              </span>
            )}
          </pre>
        </div>
      )}

      {activeTab === "plot" && (
        analysis ? <PlotOutline analysis={analysis} /> : (
          <EmptyTab emoji="📊" title="尚未进行剧情分析" desc="点击上方按钮开始 AI 分析" />
        )
      )}

      {activeTab === "characters" && (
        characters.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {characters.map((c, i) => <CharacterCard key={c.id || i} character={c} />)}
          </div>
        ) : (
          <EmptyTab emoji="👥" title="暂无角色数据" desc="AI 分析后会自动提取角色信息" />
        )
      )}

      {activeTab === "scenes" && (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <h3 className="mb-3 text-sm font-medium text-gray-500">场景列表</h3>
            <SceneList
              scenes={scenes}
              onSelectScene={setSelectedScene}
              selectedSceneId={selectedScene?.id}
            />
          </div>
          <div className="lg:col-span-3">
            <h3 className="mb-3 text-sm font-medium text-gray-500">剧本内容</h3>
            {selectedScene ? (
              <ScriptViewer scene={selectedScene} />
            ) : (
              <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
                <p className="text-4xl">👈</p>
                <p className="mt-3 text-gray-400">选择一个场景查看剧本</p>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function EmptyTab({ emoji, title, desc }: { emoji: string; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
      <p className="text-4xl">{emoji}</p>
      <p className="mt-3 text-gray-500">{title}</p>
      <p className="text-sm text-gray-400">{desc}</p>
    </div>
  );
}

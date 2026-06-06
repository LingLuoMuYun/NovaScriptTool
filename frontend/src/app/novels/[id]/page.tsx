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
import PipelineProgress from "@/components/PipelineProgress";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type SceneWithScripts = Scene & { scripts?: Script[] };

export default function NovelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [novel, setNovel] = useState<Novel | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [scenes, setScenes] = useState<SceneWithScripts[]>([]);
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [activeTab, setActiveTab] = useState<"info" | "plot" | "characters" | "scenes">("info");
  const [selectedScene, setSelectedScene] = useState<SceneWithScripts | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [pipelining, setPipelining] = useState(false);
  const [pipelineStep, setPipelineStep] = useState("");
  // SSE 进度状态
  const [pipeProgress, setPipeProgress] = useState(0);
  const [pipeStage, setPipeStage] = useState("");
  const [pipeMessage, setPipeMessage] = useState("");
  const [pipeDetail, setPipeDetail] = useState("");
  const [pipeStats, setPipeStats] = useState<any>(null);
  const [pipeError, setPipeError] = useState("");

  const fetchNovel = useCallback(async () => {
    setFetchError("");
    try {
      const data = await getNovel(id);
      setNovel(data);
      setCharacters(data.characters || []);
      setScenes((data.scenes || []) as SceneWithScripts[]);
      if (data.analysis) {
        try { setAnalysis(JSON.parse(data.analysis)); } catch {}
      }
    } catch (err: any) {
      console.error("获取小说详情失败:", err.message);
      setFetchError(err.message || "加载失败");
    }
  }, [id]);

  useEffect(() => {
    fetchNovel().finally(() => setLoading(false));
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
      const res = await fetch(`${API_BASE}/api/novels/${id}/generate-scripts`, {
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

  const handlePipeline = async () => {
    setGenError("");
    setPipeError("");
    setPipelining(true);
    setPipeProgress(0);
    setPipeStage("");
    setPipeMessage("正在连接...");
    setPipeDetail("");
    setPipeStats(null);

    try {
      const res = await fetch(`${API_BASE}/api/novels/${id}/pipeline-stream`);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "流水线启动失败" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("不支持流式响应");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6));
              setPipeProgress(event.progress || 0);
              setPipeStage(event.stage || "");
              setPipeMessage(event.message || "");
              setPipeDetail(event.detail || "");
              setPipeStats(event.stats || null);

              if (event.stage === "done") {
                // 流水线完成，刷新页面数据
                setPipelining(false);
                await fetchNovel();
                // 提取角色和剧本数据展示
                if (event.stats) {
                  setPipelineStep(`✅ 完成！${event.stats.characters || 0} 个角色，${event.stats.scenes || 0} 个场景`);
                }
                return;
              }

              if (event.stage === "error") {
                setPipeError(event.message || "未知错误");
                setPipelining(false);
                return;
              }
            } catch {}
          }
        }
      }

      // reader done but no "done" event received — refresh anyway
      setPipelining(false);
      await fetchNovel();

    } catch (err: any) {
      setPipeError(err.message);
      setPipelining(false);
    }
  };

  const handleExport = () => {
    window.open(`${API_BASE}/api/novels/${id}/export`, "_blank");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <svg className="mx-auto h-8 w-8 animate-spin text-indigo-500" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="mt-3 text-gray-400">加载中...</p>
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-4xl">⚠️</p>
          <p className="mt-3 text-gray-700">加载小说失败</p>
          <p className="mt-1 text-sm text-red-500">{fetchError}</p>
          <div className="mt-4 flex gap-3 justify-center">
            <button
              onClick={() => { setLoading(true); fetchNovel().finally(() => setLoading(false)); }}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 transition"
            >
              🔄 重试
            </button>
            <Link href="/" className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition">
              ← 返回首页
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!novel) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-4xl">📭</p>
          <p className="mt-2 text-gray-500">小说不存在</p>
          <p className="mt-1 text-sm text-gray-400">该小说可能已被删除，或 ID 无效</p>
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
        {/* 一键流水线（草稿或已分析状态均可使用） */}
        <button
          onClick={handlePipeline}
          disabled={pipelining}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:from-indigo-700 hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pipelining ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              AI 全流程处理中...（1-2 分钟）
            </>
          ) : (
            <>🚀 一键生成（分析 + 剧本）</>
          )}
        </button>

        {/* 分步操作 */}
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
                AI 生成剧本中...（30-60 秒）
              </>
            ) : (
              <>🎬 生成场景剧本</>
            )}
          </button>
        )}

        {/* 导出 YAML */}
        {scenes.length > 0 && (
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-2 rounded-xl bg-gray-800 px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-gray-900"
          >
            📥 导出 YAML
          </button>
        )}

        {genError && (
          <div className="w-full rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-700">❌ 操作失败</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-red-600">{genError}</p>
          </div>
        )}
        {pipelineStep && !genError && !pipelining && (
          <p className="text-sm text-green-600">{pipelineStep}</p>
        )}
      </div>

      {/* 流水线进度可视化 */}
      {(pipelining || pipeStage === "done" || pipeError) && (
        <div className="mb-6">
          <PipelineProgress
            progress={pipeProgress}
            stage={pipeStage}
            message={pipeMessage}
            detail={pipeDetail}
            stats={pipeStats}
            error={pipeError}
            isRunning={pipelining}
          />
        </div>
      )}

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

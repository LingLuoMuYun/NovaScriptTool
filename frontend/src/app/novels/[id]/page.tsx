"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getNovel, Novel, Character } from "@/lib/api";
import AnalyzeButton from "@/components/AnalyzeButton";
import PlotOutline from "@/components/PlotOutline";
import CharacterCard from "@/components/CharacterCard";

export default function NovelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [novel, setNovel] = useState<Novel | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"info" | "plot" | "characters">("info");

  const fetchNovel = useCallback(async () => {
    const data = await getNovel(id);
    setNovel(data);
    setCharacters(data.characters || []);
    if (data.analysis) {
      try {
        setAnalysis(JSON.parse(data.analysis));
      } catch {}
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
    fetchNovel(); // refresh from DB
  }, [id, fetchNovel]);

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

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      {/* 导航 */}
      <Link href="/" className="mb-6 inline-flex items-center text-sm text-gray-500 hover:text-indigo-600">
        ← 返回列表
      </Link>

      {/* 标题 */}
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
              : "bg-green-100 text-green-700"
          }`}
        >
          {novel.status === "draft"
            ? "📝 草稿"
            : novel.status === "analyzing"
            ? "⏳ 分析中"
            : "✅ 已分析"}
        </span>
      </div>

      {/* 分析按钮 */}
      {novel.status === "draft" && (
        <div className="mb-6">
          <AnalyzeButton novelId={id} onAnalyzed={handleAnalyzed} />
        </div>
      )}

      {/* Tab 导航 */}
      <div className="mb-6 flex gap-2 border-b border-gray-200">
        {[
          { key: "info", label: "📖 原文" },
          { key: "plot", label: "📊 剧情分析" },
          { key: "characters", label: `👥 角色 (${characters.length})` },
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
        <div>
          {analysis ? (
            <PlotOutline analysis={analysis} />
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
              <p className="text-4xl">📊</p>
              <p className="mt-3 text-gray-500">尚未进行剧情分析</p>
              <p className="text-sm text-gray-400">点击上方按钮开始 AI 分析</p>
            </div>
          )}
        </div>
      )}

      {activeTab === "characters" && (
        <div>
          {characters.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {characters.map((c, i) => (
                <CharacterCard key={c.id || i} character={c} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
              <p className="text-4xl">👥</p>
              <p className="mt-3 text-gray-500">暂无角色数据</p>
              <p className="text-sm text-gray-400">AI 分析后会自动提取角色信息</p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

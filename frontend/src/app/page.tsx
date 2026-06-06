"use client";

import { useEffect, useState, useCallback } from "react";
import { getNovels, Novel } from "@/lib/api";
import NovelUpload from "@/components/NovelUpload";
import NovelList from "@/components/NovelList";

export default function Home() {
  const [novels, setNovels] = useState<Novel[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNovels = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getNovels();
      setNovels(data);
    } catch (err) {
      console.error("获取小说列表失败:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNovels();
  }, [fetchNovels]);

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8">
      {/* 顶部标题 */}
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-gray-900">🎬 NovaScriptTool</h1>
        <p className="mt-2 text-gray-500">
          AI 驱动的小说转剧本创作辅助系统
        </p>
      </div>

      {/* 上传区 */}
      <div className="mb-8">
        <NovelUpload onUploaded={fetchNovels} />
      </div>

      {/* 小说列表 */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-700">
            📚 我的小说 ({loading ? "..." : novels.length})
          </h2>
          <button
            onClick={fetchNovels}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 transition"
          >
            🔄 刷新
          </button>
        </div>
        <NovelList novels={novels} onRefresh={fetchNovels} loading={loading} />
      </div>
    </main>
  );
}

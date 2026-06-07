"use client";

import { useEffect, useState, useCallback } from "react";
import { getNovels, Novel, ProjectTemplate } from "@/lib/api";
import NovelUpload from "@/components/NovelUpload";
import NovelList from "@/components/NovelList";
import TemplateSelector from "@/components/TemplateSelector";
import ChatPanel from "@/components/ChatPanel";

export default function Home() {
  const [novels, setNovels] = useState<Novel[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate | null>(null);

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
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8">
      {/* 顶部标题 */}
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100">🎬 NovaScriptTool</h1>
        <p className="mt-2 text-gray-500 dark:text-gray-400">
          AI 驱动的小说转剧本创作辅助系统
        </p>
      </div>

      {/* 两栏布局 */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* 左栏：上传 + 模板 + 小说列表 */}
        <div className="lg:col-span-2 space-y-6">
          {/* 上传区 */}
          <NovelUpload onUploaded={fetchNovels} />

          {/* 项目模板选择 */}
          <TemplateSelector
            onSelect={setSelectedTemplate}
            selected={selectedTemplate?.id}
          />

          {/* 小说列表 */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-200">
                📚 我的小说 ({loading ? "..." : novels.length})
              </h2>
              <button
                onClick={fetchNovels}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              >
                🔄 刷新
              </button>
            </div>
            <NovelList novels={novels} onRefresh={fetchNovels} loading={loading} />
          </div>
        </div>

        {/* 右栏：AI 聊天面板 */}
        <div className="lg:col-span-3" style={{ minHeight: "calc(100vh - 200px)" }}>
          <div className="sticky top-24 h-full rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <ChatPanel
              templateId={selectedTemplate?.id}
              embedded
            />
          </div>
        </div>
      </div>
    </main>
  );
}

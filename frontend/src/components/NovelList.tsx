"use client";

import { Novel, deleteNovel } from "@/lib/api";
import Link from "next/link";

interface NovelListProps {
  novels: Novel[];
  onRefresh: () => void;
  loading: boolean;
}

export default function NovelList({ novels, onRefresh, loading }: NovelListProps) {
  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`确定要删除「${title}」吗？此操作不可撤销。`)) return;
    try {
      await deleteNovel(id);
      onRefresh();
    } catch (err: any) {
      alert("删除失败: " + err.message);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 text-center shadow-sm dark:shadow-gray-950/30">
        <p className="text-gray-400 dark:text-gray-500">加载中...</p>
      </div>
    );
  }

  if (novels.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 text-center shadow-sm dark:shadow-gray-950/30">
        <p className="text-4xl">📭</p>
        <p className="mt-3 text-gray-500 dark:text-gray-400">还没有上传任何小说</p>
        <p className="text-sm text-gray-400 dark:text-gray-500">上传一篇小说开始创作吧</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {novels.map((novel) => (
        <div
          key={novel.id}
          className="group rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 shadow-sm dark:shadow-gray-950/30 transition hover:border-indigo-300 dark:border-indigo-700 hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <Link
                href={`/novels/${novel.id}`}
                className="text-lg font-semibold text-gray-800 dark:text-gray-100 hover:text-indigo-600 dark:text-indigo-400 transition"
              >
                {novel.title}
              </Link>
              <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
                <span>
                  {novel.content.length.toLocaleString()} 字
                </span>
                {(novel._count?.characters ?? 0) > 0 && (
                  <span className="text-indigo-500 dark:text-indigo-400">
                    👤 {novel._count?.characters} 角色
                  </span>
                )}
                {(novel._count?.scenes ?? 0) > 0 && (
                  <span className="text-emerald-500 dark:text-emerald-400">
                    🎬 {novel._count?.scenes} 场景
                  </span>
                )}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    novel.status === "draft"
                      ? "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                      : novel.status === "analyzing"
                      ? "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300"
                      : "bg-green-100 dark:bg-green-900/40 text-green-700"
                  }`}
                >
                  {novel.status === "draft"
                    ? "草稿"
                    : novel.status === "analyzing"
                    ? "分析中"
                    : "已生成"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 opacity-0 transition group-hover:opacity-100">
              <Link
                href={`/novels/${novel.id}`}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950 dark:bg-indigo-950 transition"
              >
                查看 →
              </Link>
              <button
                onClick={() => handleDelete(novel.id, novel.title)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 dark:bg-red-950 transition"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

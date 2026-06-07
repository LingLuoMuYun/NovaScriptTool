"use client";

import { useEffect, useState } from "react";
import { getTemplates, ProjectTemplate } from "@/lib/api";

interface TemplateSelectorProps {
  onSelect: (template: ProjectTemplate) => void;
  selected?: string;
}

export default function TemplateSelector({
  onSelect,
  selected,
}: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTemplates()
      .then((data) => {
        setTemplates(data);
      })
      .catch(() => {
        // 加载失败使用空列表
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4 h-28"
          />
        ))}
      </div>
    );
  }

  if (templates.length === 0) {
    return null;
  }

  // 温度颜色映射
  const tempColor = (t: number) => {
    if (t <= 0.5) return "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950";
    if (t <= 0.7) return "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950";
    return "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950";
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          🎭 选择项目模板
        </h3>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          （可选，AI 将根据模板调整写作风格）
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {templates.map((t) => {
          const isSelected = selected === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t)}
              className={`group relative rounded-xl border-2 p-4 text-left transition-all duration-200 ${
                isSelected
                  ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950 shadow-md shadow-indigo-500/10"
                  : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-sm"
              }`}
            >
              {/* 选中标记 */}
              {isSelected && (
                <div className="absolute top-2 right-2 rounded-full bg-indigo-500 p-0.5">
                  <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              )}

              {/* 图标与名称 */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{t.icon}</span>
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                  {t.name}
                </span>
              </div>

              {/* 描述 */}
              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">
                {t.description}
              </p>

              {/* 参数标签 */}
              <div className="flex flex-wrap gap-1">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${tempColor(t.temperature)}`}
                >
                  🌡 {t.temperature.toFixed(1)}
                </span>
                <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[10px] text-gray-500 dark:text-gray-400">
                  {t.roleTypePreferences.length} 角色类型
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

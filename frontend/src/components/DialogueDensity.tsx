"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { DialogueDensityItem, getDialogueDensity } from "@/lib/api";

interface DialogueDensityProps {
  novelId: string;
  onSceneClick?: (sceneNum: number) => void;
}

function getBarColor(density: number | null): string {
  if (density === null) return "#D1D5DB"; // gray-300
  if (density <= 30) return "#3B82F6";    // blue-500 动作主导
  if (density <= 60) return "#10B981";    // green-500 均衡
  if (density <= 85) return "#F59E0B";    // amber-500 对话为主
  return "#EF4444";                        // red-500 过于密集
}

export default function DialogueDensity({ novelId, onSceneClick }: DialogueDensityProps) {
  const [data, setData] = useState<DialogueDensityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    try {
      setData(await getDialogueDensity(novelId));
    } catch (err) {
      console.error("对白密度获取失败:", err);
    } finally {
      setLoading(false);
    }
  }, [novelId]);

  useEffect(() => { fetch(); }, [fetch]);

  if (loading) return <p className="py-8 text-center text-xs text-gray-400">加载中...</p>;
  if (data.length === 0) return <p className="py-8 text-center text-xs text-gray-400">暂无场景数据</p>;

  const avg = data.reduce((s, d) => s + (d.density || 0), 0) / data.length;
  const maxItem = data.reduce((prev, curr) => {
    return (curr.density || 0) > (prev?.density || 0) ? curr : prev;
  }, data[0]);
  const minItem = data.reduce((prev, curr) => {
    return (curr.density || 0) < (prev?.density || 100) ? curr : prev;
  }, data[0]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="mb-1 text-base font-semibold text-gray-800">💬 对白密度分析</h3>
      <p className="mb-4 text-xs text-gray-400">每个场景的对白行数占对白+动作总行数的比例</p>

      {/* 统计卡片 */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-blue-50 p-3 text-center">
          <p className="text-xs text-gray-500">平均密度</p>
          <p className="text-lg font-bold text-blue-600">{avg.toFixed(0)}%</p>
        </div>
        <div className="rounded-lg bg-red-50 p-3 text-center">
          <p className="text-xs text-gray-500">最高</p>
          <p className="text-lg font-bold text-red-600">
            {maxItem?.density != null ? `${maxItem.density}%` : "—"}
          </p>
          <p className="text-xs text-gray-400 truncate">场景 {maxItem?.sceneNum}</p>
        </div>
        <div className="rounded-lg bg-green-50 p-3 text-center">
          <p className="text-xs text-gray-500">最低</p>
          <p className="text-lg font-bold text-green-600">
            {minItem?.density != null ? `${minItem.density}%` : "—"}
          </p>
          <p className="text-xs text-gray-400 truncate">场景 {minItem?.sceneNum}</p>
        </div>
      </div>

      {/* 柱状图 */}
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
          <XAxis
            dataKey="sceneNum"
            tick={{ fontSize: 11, fill: "#9CA3AF" }}
            axisLine={false}
            tickLine={false}
            label={{ value: "场景编号", position: "insideBottom", offset: -5, style: { fontSize: 11, fill: "#9CA3AF" } }}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: "#9CA3AF" }}
            axisLine={false}
            tickLine={false}
            label={{ value: "密度 %", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#9CA3AF" } }}
          />
          <Tooltip
            contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "12px" }}
            formatter={(_value: any, _name: any, props: any) => {
              const d = props?.payload;
              if (!d) return "";
              return `密度: ${d.density ?? "无数据"}%  场景 ${d.sceneNum} — ${d.location}`;
            }}
          />
          <Bar
            dataKey="density"
            radius={[6, 6, 0, 0]}
            cursor="pointer"
            onClick={(entry: any) => onSceneClick?.(entry.sceneNum)}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={getBarColor(d.density)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* 颜色图例 */}
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-400">
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded bg-blue-500" /> 动作主导 (0-30%)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded bg-green-500" /> 均衡 (30-60%)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded bg-amber-500" /> 对话为主 (60-85%)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded bg-red-500" /> 过于密集 (85%+)
        </span>
      </div>
    </div>
  );
}

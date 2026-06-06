"use client";

import { useEffect, useState, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { EmotionPoint, getEmotionCurve } from "@/lib/api";

interface EmotionCurveProps {
  novelId: string;
}

const DOMINANT_LABELS: Record<string, string> = {
  positive: "😊 正面",
  negative: "😢 负面",
  tension: "⚡ 紧张",
  neutral: "➖ 中性",
};

export default function EmotionCurve({ novelId }: EmotionCurveProps) {
  const [data, setData] = useState<EmotionPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    try {
      setData(await getEmotionCurve(novelId));
    } catch (err) {
      console.error("情感曲线获取失败:", err);
    } finally {
      setLoading(false);
    }
  }, [novelId]);

  useEffect(() => { fetch(); }, [fetch]);

  if (loading) return <p className="py-8 text-center text-xs text-gray-400">加载中...</p>;
  if (data.length === 0) return <p className="py-8 text-center text-xs text-gray-400">暂无场景数据</p>;

  // 找到情感转折点（正/负主导切换的位置）
  const turningPoints: number[] = [];
  for (let i = 1; i < data.length; i++) {
    if (
      data[i].dominant !== data[i - 1].dominant &&
      data[i].dominant !== "neutral" &&
      data[i - 1].dominant !== "neutral"
    ) {
      turningPoints.push(data[i].sceneNum);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="mb-1 text-base font-semibold text-gray-800">📈 情感曲线</h3>
      <p className="mb-4 text-xs text-gray-400">
        基于中文情感词典分析每个场景的情感走向
        {turningPoints.length > 0 && ` · ${turningPoints.length} 个情感转折点`}
      </p>

      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
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
            label={{ value: "强度", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "#9CA3AF" } }}
          />
          <Tooltip
            contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "12px" }}
            formatter={(value: any, _name: any, props: any) => {
              const d = props?.payload;
              if (!d) return "";
              const dataKey = props?.dataKey;
              const label = dataKey === "positive" ? "正面" : dataKey === "negative" ? "负面" : "紧张";
              return `${value} (${label})`;
            }}
            labelFormatter={(label: any) => {
              const d = data.find((p) => p.sceneNum === Number(label));
              return `场景 ${label} — ${d?.location || ""} (${DOMINANT_LABELS[d?.dominant || "neutral"]})`;
            }}
          />

          {/* 情感转折点标注 */}
          {turningPoints.map((sp) => (
            <ReferenceLine
              key={sp}
              x={sp}
              stroke="#9CA3AF"
              strokeDasharray="4 4"
              strokeWidth={1}
            />
          ))}

          <Line
            type="monotone"
            dataKey="positive"
            stroke="#10B981"
            strokeWidth={2}
            dot={{ r: 3, fill: "#10B981" }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="negative"
            stroke="#EF4444"
            strokeWidth={2}
            dot={{ r: 3, fill: "#EF4444" }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="tension"
            stroke="#F59E0B"
            strokeWidth={2}
            dot={{ r: 3, fill: "#F59E0B" }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* 图例 */}
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-400">
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-green-500" /> 正面情感
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> 负面情感
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> 紧张感
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-px w-4 border border-dashed border-gray-300" /> 情感转折
        </span>
      </div>
    </div>
  );
}

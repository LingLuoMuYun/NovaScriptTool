"use client";

import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface ConflictChartProps {
  conflicts: { type: string; description: string; parties: string[] }[];
  /** 已知角色名列表，用于过滤 AI 幻觉的无效 parties */
  knownCharacters?: string[];
}

const PIE_COLORS = ["#6366F1", "#F59E0B", "#EF4444", "#10B981", "#9CA3AF"];

/**
 * 关键词模糊匹配 → 标准化冲突分类
 * AI 输出的 type 是描述性的（如"住房利益冲突"），
 * 不能用精确匹配，必须用关键词归类。
 */
function normalizeType(raw: string): string {
  const t = raw.toLowerCase();

  // 人与自我：内心挣扎、命运、心理、抉择、成长
  if (
    t.includes("自我") || t.includes("内心") || t.includes("心理") ||
    t.includes("命运") || t.includes("抉择") || t.includes("成长") ||
    t.includes("挣扎") || t.includes("矛盾心理") || t.includes("认同")
  ) {
    return "人物 vs 自我";
  }

  // 人与社会：制度、阶层、社会、规则、体制
  if (
    t.includes("社会") || t.includes("制度") || t.includes("阶层") ||
    t.includes("规则") || t.includes("体制") || t.includes("阶级") ||
    t.includes("权力")
  ) {
    return "人物 vs 社会";
  }

  // 人与环境：自然、灾难、环境、外部
  if (
    t.includes("环境") || t.includes("自然") || t.includes("灾难") ||
    t.includes("外部") || t.includes("生存")
  ) {
    return "人物 vs 环境";
  }

  // 人与技术/科技
  if (t.includes("科技") || t.includes("技术") || t.includes("机器") || t.includes("ai")) {
    return "人物 vs 技术";
  }

  // 人与人：默认分类（利益冲突、矛盾、对抗、竞争、情感等都属于人际）
  // 大部分 AI 输出的冲突都是人与人之间的
  if (
    t.includes("人") || t.includes("角色") || t.includes("利益") ||
    t.includes("矛盾") || t.includes("对抗") || t.includes("竞争") ||
    t.includes("冲突") || t.includes("情感") || t.includes("恩怨") ||
    t.includes("羁绊") || t.includes("误会") || t.includes("对立") ||
    t.includes("住房") || t.includes("习惯") || t.includes("观念") ||
    t.includes("性格") || t.includes("代沟") || t.includes("家庭") ||
    t.includes("爱情") || t.includes("友情") || t.includes("亲情")
  ) {
    return "人物 vs 人物";
  }

  // 兜底：检查原始中文文本
  if (/[人角色]/.test(raw)) return "人物 vs 人物";

  return "其他";
}

export default function ConflictChart({ conflicts, knownCharacters }: ConflictChartProps) {
  if (!conflicts || conflicts.length === 0) {
    return (
      <p className="py-4 text-center text-xs text-gray-400">暂无冲突数据</p>
    );
  }

  // 按类型聚合
  const typeCount: Record<string, number> = {};
  for (const c of conflicts) {
    const t = normalizeType(c.type);
    typeCount[t] = (typeCount[t] || 0) + 1;
  }
  const pieData = Object.entries(typeCount)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // 角色冲突频次排名（过滤非角色实体）
  const validNames = new Set(knownCharacters || []);
  const partyCount: Record<string, number> = {};
  for (const c of conflicts) {
    for (const p of c.parties || []) {
      // 过滤：只统计实际角色，排除 "命运"、"社会" 等抽象概念
      if (validNames.size > 0 && !validNames.has(p)) continue;
      partyCount[p] = (partyCount[p] || 0) + 1;
    }
  }
  const barData = Object.entries(partyCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));

  // 统计被过滤的抽象实体数
  const totalParties = conflicts.reduce((s, c) => s + (c.parties || []).length, 0);
  const filteredCount = totalParties - barData.reduce((s, d) => s + d.count, 0);

  return (
    <div className="mt-6 space-y-4">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 饼图：冲突类型分布 */}
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
          <h4 className="mb-3 text-sm font-medium text-gray-600">📊 冲突类型分布</h4>
          {pieData.length === 0 ? (
            <p className="py-8 text-center text-xs text-gray-400">无法分类</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={85}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "12px" }}
                />
                <Legend
                  formatter={(value) => (
                    <span style={{ fontSize: "11px", color: "#6b7280" }}>{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
          <p className="mt-1 text-center text-xs text-gray-400">
            AI 输出类型 → 关键词智能归类
          </p>
        </div>

        {/* 柱状图：角色冲突频次 */}
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
          <h4 className="mb-3 text-sm font-medium text-gray-600">👥 角色冲突频次 (Top 8)</h4>
          {barData.length === 0 ? (
            <p className="py-8 text-center text-xs text-gray-400">
              {knownCharacters && knownCharacters.length > 0
                ? "冲突参与方不在已知角色列表中"
                : "暂无数据"}
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 10 }}>
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={50}
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "12px" }}
                />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} fill="#6366F1" barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          )}
          {filteredCount > 0 && (
            <p className="mt-1 text-center text-xs text-amber-500">
              ⚠️ 已过滤 {filteredCount} 个非角色实体（如"命运"等抽象概念）
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

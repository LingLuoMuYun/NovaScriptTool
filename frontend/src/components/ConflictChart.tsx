"use client";

import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface ConflictChartProps {
  conflicts: { type: string; description: string; parties: string[] }[];
}

// 冲突类型归一化映射
const TYPE_NORMALIZE: Record<string, string> = {
  "人物冲突": "人物 vs 人物",
  "角色冲突": "人物 vs 人物",
  "人对人": "人物 vs 人物",
  interpersonal: "人物 vs 人物",
  "环境冲突": "人物 vs 环境",
  "外部冲突": "人物 vs 环境",
  "人对环境": "人物 vs 环境",
  external: "人物 vs 环境",
  "内部冲突": "人物 vs 自我",
  "心理冲突": "人物 vs 自我",
  "人对自我": "人物 vs 自我",
  internal: "人物 vs 自我",
  "社会冲突": "人物 vs 社会",
  "制度冲突": "人物 vs 社会",
  social: "人物 vs 社会",
};

const PIE_COLORS = ["#6366F1", "#F59E0B", "#EF4444", "#10B981", "#9CA3AF"];

function normalizeType(raw: string): string {
  return TYPE_NORMALIZE[raw] || "其他";
}

export default function ConflictChart({ conflicts }: ConflictChartProps) {
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
  const pieData = Object.entries(typeCount).map(([name, value]) => ({ name, value }));

  // 角色冲突频次排名 (Top 8)
  const partyCount: Record<string, number> = {};
  for (const c of conflicts) {
    for (const p of c.parties || []) {
      partyCount[p] = (partyCount[p] || 0) + 1;
    }
  }
  const barData = Object.entries(partyCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      {/* 饼图：冲突类型分布 */}
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
        <h4 className="mb-3 text-sm font-medium text-gray-600">📊 冲突类型分布</h4>
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
      </div>

      {/* 柱状图：角色冲突频次 */}
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
        <h4 className="mb-3 text-sm font-medium text-gray-600">👥 角色冲突频次 (Top 8)</h4>
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
      </div>
    </div>
  );
}

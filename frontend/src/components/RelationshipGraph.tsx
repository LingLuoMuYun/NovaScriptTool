"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { getRelationshipGraph, RelationshipGraphData } from "@/lib/api";

interface RelationshipGraphProps {
  novelId: string;
}

const ROLE_COLORS: Record<string, string> = {
  "主角": "#F59E0B",
  "反派": "#EF4444",
  "配角": "#6366F1",
  "路人": "#9CA3AF",
};

export default function RelationshipGraph({ novelId }: RelationshipGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<any>(null);
  const [data, setData] = useState<RelationshipGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [layout, setLayout] = useState<"cose-bilkent" | "circle" | "grid">("cose-bilkent");

  useEffect(() => {
    getRelationshipGraph(novelId)
      .then(setData)
      .catch((err) => console.error("关系图谱获取失败:", err))
      .finally(() => setLoading(false));
  }, [novelId]);

  // 初始化 Cytoscape
  const initCytoscape = useCallback(async () => {
    if (!data || !containerRef.current) return;
    if (cyRef.current) cyRef.current.destroy();

    const cytoscape = (await import("cytoscape")).default;

    const elements: any[] = [];

    // 节点
    for (const node of data.nodes) {
      elements.push({
        data: {
          id: node.id,
          label: node.name,
          roleType: node.roleType,
          importance: node.importance,
        },
      });
    }

    // 边
    for (const edge of data.edges) {
      elements.push({
        data: {
          id: `${edge.source}|||${edge.target}`,
          source: edge.source,
          target: edge.target,
          relation: edge.relation,
          weight: edge.weight,
        },
      });
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: "node",
          style: {
            "background-color": (ele: any) =>
              ROLE_COLORS[ele.data("roleType")] || "#9CA3AF",
            "width": (ele: any) => 24 + ele.data("importance") * 10,
            "height": (ele: any) => 24 + ele.data("importance") * 10,
            "label": "data(label)",
            "font-size": "11px",
            "color": "#374151",
            "text-valign": "bottom",
            "text-halign": "center",
            "text-margin-y": 6,
            "border-width": 2,
            "border-color": "#fff",
          },
        },
        {
          selector: "edge",
          style: {
            "width": (ele: any) => Math.max(1, ele.data("weight") * 4),
            "line-color": "#D1D5DB",
            "target-arrow-color": "#D1D5DB",
            "target-arrow-shape": "triangle",
            "arrow-scale": 0.8,
            "curve-style": "bezier",
            "label": "data(relation)",
            "font-size": "9px",
            "color": "#9CA3AF",
            "text-rotation": "autorotate",
            "text-margin-y": -4,
          },
        },
        {
          selector: "node:selected",
          style: {
            "border-color": "#6366F1",
            "border-width": 3,
          },
        },
        {
          selector: "edge.connected",
          style: {
            "line-color": "#6366F1",
            "target-arrow-color": "#6366F1",
            "width": 3,
          },
        },
      ],
      layout: { name: layout === "cose-bilkent" ? "cose" : layout },
      wheelSensitivity: 0.3,
      minZoom: 0.3,
      maxZoom: 3,
    });

    // 点击节点高亮连接边
    cy.on("tap", "node", (evt: any) => {
      const node = evt.target;
      cy.elements().removeClass("connected");
      node.connectedEdges().addClass("connected");
      node.connectedEdges().targets().addClass("connected");
      node.connectedEdges().sources().addClass("connected");
    });

    cy.on("tap", (evt: any) => {
      if (evt.target === cy) {
        cy.elements().removeClass("connected");
      }
    });

    cyRef.current = cy;
  }, [data, layout]);

  useEffect(() => {
    initCytoscape();
    return () => { cyRef.current?.destroy(); };
  }, [initCytoscape]);

  if (loading) return <p className="py-8 text-center text-xs text-gray-400">加载中...</p>;
  if (!data || data.nodes.length === 0) {
    return <p className="py-8 text-center text-xs text-gray-400">暂无角色关系数据</p>;
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-800">🔗 角色关系网络</h3>
          <p className="text-xs text-gray-400">
            {data.nodes.length} 个角色 · {data.edges.length} 条关系 · 点击节点查看关联
          </p>
        </div>
        <div className="flex gap-1">
          {(["cose-bilkent", "circle", "grid"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLayout(l)}
              className={`rounded px-2.5 py-1 text-xs transition ${
                layout === l
                  ? "bg-indigo-100 text-indigo-700 font-medium"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {l === "cose-bilkent" ? "力导向" : l === "circle" ? "圆形" : "网格"}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={containerRef}
        className="h-[400px] w-full rounded-lg border border-gray-100 bg-gray-50"
      />

      {/* 图例 */}
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-400">
        {Object.entries(ROLE_COLORS).map(([role, color]) => (
          <span key={role} className="inline-flex items-center gap-1">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            {role}
          </span>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState, useCallback, useRef } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type {
  ForceGraphMethods,
  NodeObject,
  LinkObject,
} from "react-force-graph-2d";
import { Character } from "@/lib/api";

// ─── 类型定义 ───────────────────────────────────────

interface GraphNode {
  id: string;
  name: string;
  roleType: string;
  val: number;
  color: string;
  // Force simulation will populate these at runtime
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
  traits: {
    identity?: string;
    personality?: string[];
    goal?: string;
    motivation?: string;
    relationships?: { with: string; relation: string }[];
  };
}

interface GraphLink {
  source: string;
  target: string;
  relation: string;
  type: string;
  color: string;
}

// Runtime node type (after force-graph adds x/y)
type RuntimeNode = NodeObject<GraphNode>;
type RuntimeLink = LinkObject<GraphNode, GraphLink>;

// ─── 常量配置 ───────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  "主角": "#F59E0B", // amber
  "反派": "#EF4444", // red
  "配角": "#6366F1", // indigo
  "路人": "#9CA3AF", // gray
};

const ROLE_SIZES: Record<string, number> = {
  "主角": 8,
  "反派": 6,
  "配角": 5,
  "路人": 3,
};

const RELATION_TYPES: Record<string, { label: string; color: string }> = {
  "敌对": { label: "敌对", color: "#EF4444" },
  "亲友": { label: "亲友", color: "#10B981" },
  "恋爱": { label: "恋爱", color: "#EC4899" },
  "从属": { label: "从属", color: "#3B82F6" },
  "其他": { label: "其他", color: "#9CA3AF" },
};

// ─── 关系分类引擎 ───────────────────────────────────

function classifyRelation(relation: string): { type: string; color: string } {
  const t = relation.toLowerCase();

  // 敌对类
  if (/敌|仇|对手|敌人|冲突|对抗|对立|威胁|暗杀|陷害|背叛|出卖/.test(t)) {
    return { type: "敌对", color: RELATION_TYPES["敌对"].color };
  }
  // 恋爱类
  if (/恋|爱慕|暗恋|情侣|夫妻|情人|相亲|表白|追求/.test(t)) {
    return { type: "恋爱", color: RELATION_TYPES["恋爱"].color };
  }
  // 从属类
  if (/师|徒|上司|下属|领导|手下|主仆|雇佣|老板|秘书|总管|弟子/.test(t)) {
    return { type: "从属", color: RELATION_TYPES["从属"].color };
  }
  // 亲友类
  if (/亲|友|家人|兄弟|姐妹|父|母|儿|女|夫|妻|挚友|闺蜜|发小|青梅竹马|同窗/.test(t)) {
    return { type: "亲友", color: RELATION_TYPES["亲友"].color };
  }

  return { type: "其他", color: RELATION_TYPES["其他"].color };
}

// ─── 数据转换 ───────────────────────────────────────

function parseTraits(traitsRaw: string): GraphNode["traits"] {
  try {
    return typeof traitsRaw === "string" ? JSON.parse(traitsRaw) : traitsRaw;
  } catch {
    return {};
  }
}

function transformToGraphData(
  characters: Character[]
): { nodes: GraphNode[]; links: GraphLink[] } {
  const nameSet = new Set(characters.map((c) => c.name));
  const nodes: GraphNode[] = characters.map((c) => {
    const traits = parseTraits(c.traits);
    return {
      id: c.name,
      name: c.name,
      roleType: c.roleType || "配角",
      val: ROLE_SIZES[c.roleType] || 3,
      color: ROLE_COLORS[c.roleType] || ROLE_COLORS["路人"],
      traits,
    };
  });

  // 收集所有关系边（去重）
  const edgeMap = new Map<
    string,
    { source: string; target: string; relation: string }
  >();
  for (const c of characters) {
    const traits = parseTraits(c.traits);
    const relationships = traits.relationships || [];
    for (const rel of relationships) {
      if (!rel.with || !rel.relation) continue;
      if (!nameSet.has(rel.with)) continue;

      const pairKey = [c.name, rel.with].sort().join("||");
      const existing = edgeMap.get(pairKey);
      if (!existing || rel.relation.length > existing.relation.length) {
        edgeMap.set(pairKey, {
          source: c.name,
          target: rel.with,
          relation: rel.relation,
        });
      }
    }
  }

  const links: GraphLink[] = Array.from(edgeMap.values()).map((e) => {
    const classified = classifyRelation(e.relation);
    return {
      source: e.source,
      target: e.target,
      relation: e.relation,
      type: classified.type,
      color: classified.color,
    };
  });

  return { nodes, links };
}

// ─── 辅助函数 ───────────────────────────────────────

/** 从 RuntimeLink 获取 source/target 的节点名 */
function getLinkSourceName(link: RuntimeLink): string {
  const src = link.source;
  if (typeof src === "object") return (src as GraphNode).name || (src as GraphNode).id || "";
  return String(src);
}
function getLinkTargetName(link: RuntimeLink): string {
  const tgt = link.target;
  if (typeof tgt === "object") return (tgt as GraphNode).name || (tgt as GraphNode).id || "";
  return String(tgt);
}
function getLinkKey(link: RuntimeLink): string {
  return `${getLinkSourceName(link)}||${getLinkTargetName(link)}`;
}

// ─── Props ──────────────────────────────────────────

interface CharacterNetworkGraphProps {
  characters: Character[];
}

// ─── 组件主体 ───────────────────────────────────────

export default function CharacterNetworkGraph({
  characters,
}: CharacterNetworkGraphProps) {
  const graphRef = useRef<ForceGraphMethods<GraphNode, GraphLink>>();
  const [highlightNodes, setHighlightNodes] = useState<Set<string>>(
    new Set()
  );
  const [highlightLinks, setHighlightLinks] = useState<Set<string>>(
    new Set()
  );
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(
    new Set(["主角", "反派", "配角", "路人"])
  );

  // 数据转换（memoized）
  const { nodes, links } = useMemo(
    () => transformToGraphData(characters),
    [characters]
  );

  // 过滤后的数据
  const filteredData = useMemo(() => {
    const filteredNodes = nodes.filter((n) => activeFilters.has(n.roleType));
    const filteredNodeNames = new Set(filteredNodes.map((n) => n.id));
    const filteredLinks = links.filter(
      (l) =>
        filteredNodeNames.has(l.source) && filteredNodeNames.has(l.target)
    );
    return { nodes: filteredNodes, links: filteredLinks };
  }, [nodes, links, activeFilters]);

  // 是否有关系数据
  const hasRelationships = links.length > 0;

  // 切换筛选
  const toggleFilter = useCallback((roleType: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(roleType)) {
        if (next.size > 1) next.delete(roleType);
      } else {
        next.add(roleType);
      }
      return next;
    });
  }, []);

  // 点击节点 → 高亮其邻域
  const handleNodeClick = useCallback(
    (node: RuntimeNode) => {
      if (highlightNodes.has(node.id as string)) {
        setHighlightNodes(new Set());
        setHighlightLinks(new Set());
        return;
      }

      const connected = new Set<string>([node.id as string]);
      const connectedLinks = new Set<string>();
      for (const l of links) {
        if (l.source === node.id || l.target === node.id) {
          connected.add(l.source);
          connected.add(l.target);
          connectedLinks.add(`${l.source}||${l.target}`);
        }
      }
      setHighlightNodes(connected);
      setHighlightLinks(connectedLinks);
    },
    [highlightNodes, links]
  );

  // 画布节点绘制
  const paintNode = useCallback(
    (node: RuntimeNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const isHighlighted =
        highlightNodes.size === 0 || highlightNodes.has(node.id as string);
      // 非高亮节点保持可见（0.55 透明度），高亮节点完全不透明
      const opacity = isHighlighted ? 1 : 0.55;

      const fontSize = Math.max(12 / globalScale, 10);
      const radius = ((node.val as number) || 4) * 1.2;

      const nx = node.x!;
      const ny = node.y!;

      // 高亮节点发光效果
      if (isHighlighted && highlightNodes.size > 0) {
        ctx.save();
        ctx.shadowColor = (node as GraphNode).color;
        ctx.shadowBlur = 12 / globalScale;
        ctx.beginPath();
        ctx.arc(nx, ny, radius + 2 / globalScale, 0, 2 * Math.PI);
        ctx.fillStyle = "rgba(255,255,255,0)";
        ctx.fill();
        ctx.restore();
      }

      // 阴影
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.15)";
      ctx.shadowBlur = 4 / globalScale;

      // 圆形节点
      ctx.beginPath();
      ctx.arc(nx, ny, radius, 0, 2 * Math.PI);
      ctx.fillStyle = (node as GraphNode).color;
      ctx.globalAlpha = opacity;
      ctx.fill();

      // 边框（高亮节点有粗边框）
      ctx.shadowColor = "transparent";
      if (isHighlighted && highlightNodes.size > 0) {
        ctx.strokeStyle = "#374151";
        ctx.lineWidth = 3 / globalScale;
      } else {
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.lineWidth = 1.5 / globalScale;
      }
      ctx.stroke();
      ctx.restore();

      // 文字标签
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.font = `${fontSize}px "Microsoft YaHei", "PingFang SC", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = isHighlighted ? "#1F2937" : "#6B7280";
      ctx.fillText((node as GraphNode).name, nx, ny + radius + fontSize * 0.8);
      ctx.restore();

      // 鼠标指针区域（扩大点击范围）
      ctx.save();
      ctx.globalAlpha = 0;
      ctx.beginPath();
      ctx.arc(nx, ny, radius + 3 / globalScale, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
    },
    [highlightNodes]
  );

  // 连线文字标签 — 直接在边上绘制关系描述
  const paintLinkLabel = useCallback(
    (link: RuntimeLink, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const gl = link as unknown as GraphLink;
      const srcNode = link.source as RuntimeNode;
      const tgtNode = link.target as RuntimeNode;

      if (!srcNode.x || !srcNode.y || !tgtNode.x || !tgtNode.y) return;

      // 计算连线中点（考虑曲率偏移）
      const mx = (srcNode.x + tgtNode.x) / 2;
      const my = (srcNode.y + tgtNode.y) / 2;
      const dx = tgtNode.x - srcNode.x;
      const dy = tgtNode.y - srcNode.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // 曲率偏移（与 linkCurvature=0.15 对应）
      const curvature = 0.15;
      const normX = -dy / (dist || 1);
      const normY = dx / (dist || 1);
      const offset = dist * curvature;
      const textX = mx + normX * offset;
      const textY = my + normY * offset;

      // 文字样式
      const fontSize = Math.max(10 / globalScale, 8);
      const isLinkHighlighted =
        highlightLinks.size === 0 || highlightLinks.has(getLinkKey(link));
      const alpha = isLinkHighlighted ? 1 : 0.45;

      // 背景色块
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `${fontSize}px "Microsoft YaHei", "PingFang SC", sans-serif`;
      const text = gl.relation;
      const textWidth = ctx.measureText(text).width;
      const padX = 4 / globalScale;
      const padY = 2 / globalScale;

      // 半透明背景
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.beginPath();
      const bgX = textX - textWidth / 2 - padX;
      const bgY = textY - fontSize / 2 - padY;
      const bgW = textWidth + padX * 2;
      const bgH = fontSize + padY * 2;
      ctx.roundRect(bgX, bgY, bgW, bgH, 3 / globalScale);
      ctx.fill();

      // 背景边框
      ctx.strokeStyle = gl.color;
      ctx.globalAlpha = alpha * 0.6;
      ctx.lineWidth = 1 / globalScale;
      ctx.stroke();

      // 文字
      ctx.globalAlpha = alpha;
      ctx.fillStyle = gl.color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, textX, textY);
      ctx.restore();
    },
    [highlightLinks]
  );

  // 链接标签
  const linkLabel = useCallback((link: RuntimeLink) => {
    const src = getLinkSourceName(link);
    const tgt = getLinkTargetName(link);
    return `<div style="max-width:200px;padding:6px 8px;font-size:12px;line-height:1.4">
      <strong>${src}</strong> → <strong>${tgt}</strong>
      <br/><span style="color:${(link as GraphLink).color}">${(link as GraphLink).relation}</span>
      <br/><span style="color:#9ca3af;font-size:10px">类型: ${(link as GraphLink).type}</span>
    </div>`;
  }, []);

  // 节点悬停
  const handleNodeHover = useCallback(
    (node: RuntimeNode | null) => {
      setHoveredNode(node ? (node as unknown as GraphNode) : null);
    },
    []
  );

  // ─── 空数据状态 ─────────────────────────────────

  if (!hasRelationships) {
    return (
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <p className="text-4xl">🕸️</p>
        <p className="mt-3 text-sm font-medium text-gray-500">
          暂无角色关系数据
        </p>
        <p className="mt-1 text-xs text-gray-400">
          AI 分析后自动提取角色关系，在此展示交互式关系图谱
        </p>
      </div>
    );
  }

  // ─── 渲染 ────────────────────────────────────────

  const linkColorAccessor = (link: RuntimeLink) => {
    const gl = link as unknown as GraphLink;
    const key = getLinkKey(link);
    if (highlightLinks.size > 0) {
      return highlightLinks.has(key) ? gl.color : "rgba(180,180,180,0.5)";
    }
    return gl.color;
  };

  return (
    <div className="mt-6 space-y-3">
      {/* 标题栏 + 筛选器 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="text-sm font-medium text-gray-600">
          🕸️ 角色关系网络 ({nodes.length} 个角色, {links.length} 条关系)
        </h4>
        <div className="flex flex-wrap gap-1.5">
          {["主角", "反派", "配角", "路人"].map((role) => (
            <button
              key={role}
              onClick={() => toggleFilter(role)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                activeFilters.has(role)
                  ? "border-transparent text-white shadow-sm"
                  : "border-gray-200 bg-white text-gray-400 hover:text-gray-600"
              }`}
              style={
                activeFilters.has(role)
                  ? { backgroundColor: ROLE_COLORS[role] }
                  : undefined
              }
            >
              {role}
            </button>
          ))}
        </div>
      </div>

      {/* 关系图谱画布 */}
      <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-gray-50 shadow-sm">
        {/* 悬停提示浮层 */}
        {hoveredNode && (
          <div className="absolute left-3 top-3 z-10 max-w-[220px] rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: hoveredNode.color }}
              />
              <span className="text-sm font-semibold text-gray-800">
                {hoveredNode.name}
              </span>
              <span
                className="rounded-full px-1.5 py-0.5 text-xs text-white"
                style={{ backgroundColor: hoveredNode.color }}
              >
                {hoveredNode.roleType}
              </span>
            </div>
            {hoveredNode.traits?.identity && (
              <p className="mt-1.5 text-xs text-gray-500">
                {hoveredNode.traits.identity}
              </p>
            )}
            {hoveredNode.traits?.personality &&
              hoveredNode.traits.personality.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {hoveredNode.traits.personality.map(
                    (tag: string, i: number) => (
                      <span
                        key={i}
                        className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-600"
                      >
                        {tag}
                      </span>
                    )
                  )}
                </div>
              )}
          </div>
        )}

        <ForceGraph2D<GraphNode, GraphLink>
          ref={graphRef}
          graphData={filteredData}
          width={700}
          height={420}
          backgroundColor="transparent"
          nodeVal="val"
          nodeColor={(n) => {
            const gn = n as RuntimeNode;
            if (highlightNodes.size > 0 && !highlightNodes.has(gn.id as string)) {
              return "rgba(180,180,180,0.45)";
            }
            return (gn as unknown as GraphNode).color;
          }}
          nodeCanvasObject={paintNode}
          nodePointerAreaPaint={(
            node: RuntimeNode,
            color: string,
            ctx: CanvasRenderingContext2D
          ) => {
            const radius = ((node.val as number) || 4) * 1.2 + 3;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(node.x!, node.y!, radius, 0, 2 * Math.PI);
            ctx.fill();
          }}
          linkColor={linkColorAccessor}
          linkWidth={(link: RuntimeLink) => {
            const key = getLinkKey(link);
            if (highlightLinks.size > 0) {
              return highlightLinks.has(key) ? 2.5 : 1;
            }
            return 1.8;
          }}
          linkLabel={linkLabel}
          linkCanvasObjectMode={"after"}
          linkCanvasObject={paintLinkLabel}
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={0.5}
          linkDirectionalArrowColor={linkColorAccessor}
          linkCurvature={0.15}
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
          onBackgroundClick={() => {
            setHighlightNodes(new Set());
            setHighlightLinks(new Set());
            setHoveredNode(null);
          }}
          onLinkClick={(link: RuntimeLink) => {
            const src = getLinkSourceName(link);
            const tgt = getLinkTargetName(link);
            const connected = new Set([src, tgt]);
            setHighlightNodes(connected);
            setHighlightLinks(new Set([getLinkKey(link)]));
          }}
          enableNodeDrag={true}
          enableZoomInteraction={true}
          enablePanInteraction={true}
          minZoom={0.3}
          maxZoom={5}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
          warmupTicks={60}
          cooldownTicks={30}
        />
      </div>

      {/* 图例 */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-gray-400">
        <span className="font-medium text-gray-500">角色类型:</span>
        {Object.entries(ROLE_COLORS).map(([role, color]) => (
          <span key={role} className="inline-flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            {role}
          </span>
        ))}
        <span className="mx-2 text-gray-200">|</span>
        <span className="font-medium text-gray-500">关系类型:</span>
        {Object.values(RELATION_TYPES).map((rel) => (
          <span key={rel.label} className="inline-flex items-center gap-1">
            <span
              className="inline-block h-0.5 w-4 rounded"
              style={{ backgroundColor: rel.color }}
            />
            {rel.label}
          </span>
        ))}
        <span className="mx-2 text-gray-200">|</span>
        <span className="text-gray-400">
          💡 拖拽节点 · 滚轮缩放 · 点击高亮邻域 · 再次点击取消
        </span>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
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
  val: number;        // 度数驱动的节点大小
  color: string;
  degree: number;     // 连接度数
  // 该节点所有关系（用于详情面板）
  relationsList: { with: string; relation: string; type: string; color: string }[];
  traits: {
    identity?: string;
    personality?: string[];
    goal?: string;
    motivation?: string;
    relationships?: { with: string; relation: string }[];
  };
  // Force simulation will populate these at runtime
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
}

interface GraphLink {
  source: string;
  target: string;
  relations: string[];   // 聚合后的多条关系标签
  relationCount: number; // 关系数量（决定边宽）
  primaryType: string;   // 主关系类型（决定颜色）
  color: string;
}

// Runtime node type (after force-graph adds x/y)
type RuntimeNode = NodeObject<GraphNode>;
type RuntimeLink = LinkObject<GraphNode, GraphLink>;

// ─── 常量配置 ───────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  "主角": "#F59E0B",
  "反派": "#EF4444",
  "配角": "#6366F1",
  "路人": "#9CA3AF",
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
  if (/敌|仇|对手|敌人|冲突|对抗|对立|威胁|暗杀|陷害|背叛|出卖/.test(t)) {
    return { type: "敌对", color: RELATION_TYPES["敌对"].color };
  }
  if (/恋|爱慕|暗恋|情侣|夫妻|情人|相亲|表白|追求/.test(t)) {
    return { type: "恋爱", color: RELATION_TYPES["恋爱"].color };
  }
  if (/师|徒|上司|下属|领导|手下|主仆|雇佣|老板|秘书|总管|弟子/.test(t)) {
    return { type: "从属", color: RELATION_TYPES["从属"].color };
  }
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

  // 收集所有关系边（同一对节点可有多条）
  const pairMap = new Map<
    string,
    { source: string; target: string; rels: { relation: string; type: string; color: string }[] }
  >();

  for (const c of characters) {
    const traits = parseTraits(c.traits);
    const relationships = traits.relationships || [];
    for (const rel of relationships) {
      if (!rel.with || !rel.relation) continue;
      if (!nameSet.has(rel.with)) continue;

      const pairKey = [c.name, rel.with].sort().join("||");
      const classified = classifyRelation(rel.relation);

      if (!pairMap.has(pairKey)) {
        pairMap.set(pairKey, { source: c.name, target: rel.with, rels: [] });
      }
      const entry = pairMap.get(pairKey)!;
      // 去重：同类型关系只保留一条
      const exists = entry.rels.find(
        (r) => r.relation === rel.relation && r.type === classified.type
      );
      if (!exists) {
        entry.rels.push({
          relation: rel.relation,
          type: classified.type,
          color: classified.color,
        });
      }
    }
  }

  // 聚合边
  const links: GraphLink[] = Array.from(pairMap.values()).map((e) => {
    // 按优先级排序：敌对 > 恋爱 > 亲友 > 从属 > 其他
    const priority = (t: string) =>
      ["敌对", "恋爱", "亲友", "从属"].indexOf(t);
    e.rels.sort((a, b) => {
      const pa = priority(a.type);
      const pb = priority(b.type);
      return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
    });

    return {
      source: e.source,
      target: e.target,
      relations: e.rels.map((r) => r.relation),
      relationCount: e.rels.length,
      primaryType: e.rels[0].type,
      color: e.rels[0].color,
    };
  });

  // 计算度数
  const degreeMap = new Map<string, number>();
  for (const l of links) {
    degreeMap.set(l.source, (degreeMap.get(l.source) || 0) + 1);
    degreeMap.set(l.target, (degreeMap.get(l.target) || 0) + 1);
  }

  // 构建节点
  const nodes: GraphNode[] = characters.map((c) => {
    const traits = parseTraits(c.traits);
    const degree = degreeMap.get(c.name) || 0;
    // 度数驱动大小：基础4 + 度数平方根 × 1.8
    const baseSize = ROLE_COLORS[c.roleType] ? 4 : 3;
    const val = degree > 0 ? baseSize + Math.sqrt(degree) * 1.8 : baseSize;

    // 该节点所有关系
    const relationsList: GraphNode["relationsList"] = [];
    for (const l of links) {
      if (l.source === c.name || l.target === c.name) {
        const other = l.source === c.name ? l.target : l.source;
        for (let i = 0; i < l.relations.length; i++) {
          relationsList.push({
            with: other,
            relation: l.relations[i],
            type: l.relations[i] ? classifyRelation(l.relations[i]).type : l.primaryType,
            color: l.relations[i] ? classifyRelation(l.relations[i]).color : l.color,
          });
        }
      }
    }

    return {
      id: c.name,
      name: c.name,
      roleType: c.roleType || "配角",
      val,
      color: ROLE_COLORS[c.roleType] || ROLE_COLORS["路人"],
      degree,
      relationsList,
      traits,
    };
  });

  return { nodes, links };
}

// ─── 辅助函数 ───────────────────────────────────────

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
  const containerRef = useRef<HTMLDivElement>(null);

  // ─── 状态 ───────────────────────────────────────

  const [highlightNodes, setHighlightNodes] = useState<Set<string>>(new Set());
  const [highlightLinks, setHighlightLinks] = useState<Set<string>>(new Set());
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(
    new Set(["主角", "反派", "配角", "路人"])
  );
  const [graphKey, setGraphKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 700, height: 420 });
  const [exporting, setExporting] = useState(false);
  const isFirstRender = useRef(true);

  // ─── 响应式画布 ─────────────────────────────────

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      if (width > 0) {
        setDimensions({ width, height: Math.min(width * 0.6, 500) });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ─── 数据转换 ───────────────────────────────────

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

  const hasRelationships = links.length > 0;

  // 搜索建议
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return nodes
      .filter((n) => n.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [nodes, searchQuery]);

  // ─── 过滤器变更 → 重建图 ───────────────────────

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setGraphKey((k) => k + 1);
  }, [activeFilters]);

  // ─── 交互回调 ──────────────────────────────────

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

  // 高亮节点邻域
  const highlightNeighborhood = useCallback(
    (nodeId: string) => {
      const connected = new Set<string>([nodeId]);
      const connectedLinks = new Set<string>();
      for (const l of links) {
        if (l.source === nodeId || l.target === nodeId) {
          connected.add(l.source);
          connected.add(l.target);
          connectedLinks.add(`${l.source}||${l.target}`);
        }
      }
      setHighlightNodes(connected);
      setHighlightLinks(connectedLinks);
    },
    [links]
  );

  const clearHighlight = useCallback(() => {
    setHighlightNodes(new Set());
    setHighlightLinks(new Set());
    setSelectedNode(null);
    setHoveredNode(null);
  }, []);

  // 聚焦到节点
  const focusOnNode = useCallback(
    (node: GraphNode) => {
      highlightNeighborhood(node.id);
      setSelectedNode(node);
      // 平滑聚焦
      if (graphRef.current && node.x != null && node.y != null) {
        graphRef.current.centerAt(node.x, node.y, 1000);
        graphRef.current.zoom(3, 1000);
      }
    },
    [highlightNeighborhood]
  );

  // 搜索选择
  const handleSearchSelect = useCallback(
    (node: GraphNode) => {
      setSearchQuery("");
      setShowSearchResults(false);
      focusOnNode(node);
    },
    [focusOnNode]
  );

  // 节点点击
  const handleNodeClick = useCallback(
    (node: RuntimeNode) => {
      const gn = node as unknown as GraphNode;
      if (selectedNode?.id === gn.id) {
        // 再次点击取消
        clearHighlight();
        return;
      }
      highlightNeighborhood(gn.id);
      setSelectedNode(gn);
    },
    [highlightNeighborhood, selectedNode, clearHighlight]
  );

  // 节点悬停
  const handleNodeHover = useCallback(
    (node: RuntimeNode | null) => {
      setHoveredNode(node ? (node as unknown as GraphNode) : null);
    },
    []
  );

  // ─── 导出 PNG ──────────────────────────────────

  const handleExport = useCallback(() => {
    const canvas = containerRef.current?.querySelector("canvas");
    if (!canvas) return;

    setExporting(true);
    // 短暂延迟确保 UI 更新
    setTimeout(() => {
      try {
        const link = document.createElement("a");
        link.download = "角色关系图.png";
        link.href = canvas.toDataURL("image/png");
        link.click();
      } catch (err) {
        console.error("导出失败:", err);
      }
      setExporting(false);
    }, 100);
  }, []);

  // ─── 画布绘制回调 ──────────────────────────────

  const paintNode = useCallback(
    (node: RuntimeNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const isHighlighted =
        highlightNodes.size === 0 || highlightNodes.has(node.id as string);
      const opacity = isHighlighted ? 1 : 0.55;
      const fontSize = Math.max(12 / globalScale, 10);
      const radius = ((node.val as number) || 4) * 1.2;
      const nx = node.x!;
      const ny = node.y!;

      // 高亮节点发光效果
      if (isHighlighted && highlightNodes.size > 0) {
        ctx.save();
        ctx.shadowColor = (node as unknown as GraphNode).color;
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
      ctx.fillStyle = (node as unknown as GraphNode).color;
      ctx.globalAlpha = opacity;
      ctx.fill();

      // 边框
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
      ctx.fillText((node as unknown as GraphNode).name, nx, ny + radius + fontSize * 0.8);
      ctx.restore();

      // 度数徽章（仅对度数≥3的节点显示）
      const gn = node as unknown as GraphNode;
      if (gn.degree >= 3) {
        ctx.save();
        const badgeR = Math.max(8 / globalScale, 7);
        const badgeX = nx + radius * 0.7;
        const badgeY = ny - radius * 0.7;
        ctx.beginPath();
        ctx.arc(badgeX, badgeY, badgeR, 0, 2 * Math.PI);
        ctx.fillStyle = "#374151";
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = `bold ${Math.max(9 / globalScale, 7)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(gn.degree), badgeX, badgeY);
        ctx.restore();
      }

      // 透明点击区域
      ctx.save();
      ctx.globalAlpha = 0;
      ctx.beginPath();
      ctx.arc(nx, ny, radius + 3 / globalScale, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
    },
    [highlightNodes]
  );

  // 连线标签
  const paintLinkLabel = useCallback(
    (link: RuntimeLink, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const gl = link as unknown as GraphLink;
      const srcNode = link.source as RuntimeNode;
      const tgtNode = link.target as RuntimeNode;
      if (!srcNode.x || !srcNode.y || !tgtNode.x || !tgtNode.y) return;

      const mx = (srcNode.x + tgtNode.x) / 2;
      const my = (srcNode.y + tgtNode.y) / 2;
      const dx = tgtNode.x - srcNode.x;
      const dy = tgtNode.y - srcNode.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const curvature = 0.15;
      const normX = -dy / (dist || 1);
      const normY = dx / (dist || 1);
      const offset = dist * curvature;
      const textX = mx + normX * offset;
      const textY = my + normY * offset;

      const fontSize = Math.max(10 / globalScale, 8);
      const isLinkHighlighted =
        highlightLinks.size === 0 || highlightLinks.has(getLinkKey(link));
      const alpha = isLinkHighlighted ? 1 : 0.45;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `${fontSize}px "Microsoft YaHei", "PingFang SC", sans-serif`;

      // 聚合显示：多条关系用 "/" 连接
      const text = gl.relations.length <= 2
        ? gl.relations.join(" · ")
        : gl.relations.slice(0, 2).join(" · ") + ` +${gl.relations.length - 2}`;
      const textWidth = ctx.measureText(text).width;
      const padX = 4 / globalScale;
      const padY = 2 / globalScale;

      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.beginPath();
      const bgX = textX - textWidth / 2 - padX;
      const bgY = textY - fontSize / 2 - padY;
      const bgW = textWidth + padX * 2;
      const bgH = fontSize + padY * 2;
      ctx.roundRect(bgX, bgY, bgW, bgH, 3 / globalScale);
      ctx.fill();

      ctx.strokeStyle = gl.color;
      ctx.globalAlpha = alpha * 0.6;
      ctx.lineWidth = 1 / globalScale;
      ctx.stroke();

      ctx.globalAlpha = alpha;
      ctx.fillStyle = gl.color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, textX, textY);
      ctx.restore();
    },
    [highlightLinks]
  );

  // 链接 tooltip
  const linkLabel = useCallback((link: RuntimeLink) => {
    const gl = link as unknown as GraphLink;
    const src = getLinkSourceName(link);
    const tgt = getLinkTargetName(link);
    const relsHtml = gl.relations
      .map((r) => {
        const c = classifyRelation(r);
        return `<span style="color:${c.color}">${r}</span>`;
      })
      .join("<br/>");
    return `<div style="max-width:220px;padding:8px 10px;font-size:12px;line-height:1.5">
      <strong>${src}</strong> → <strong>${tgt}</strong>
      <hr style="margin:4px 0;border-color:#e5e7eb"/>
      ${relsHtml}
      <br/><span style="color:#9ca3af;font-size:10px">${gl.relationCount} 条关系 · ${gl.primaryType}</span>
    </div>`;
  }, []);

  // ─── 边颜色与宽度 ──────────────────────────────

  const linkColorAccessor = useCallback(
    (link: RuntimeLink) => {
      const gl = link as unknown as GraphLink;
      const key = getLinkKey(link);
      if (highlightLinks.size > 0) {
        return highlightLinks.has(key) ? gl.color : "rgba(180,180,180,0.5)";
      }
      return gl.color;
    },
    [highlightLinks]
  );

  const linkWidthAccessor = useCallback(
    (link: RuntimeLink) => {
      const gl = link as unknown as GraphLink;
      const baseWidth = 1 + gl.relationCount * 1.2;
      const key = getLinkKey(link);
      if (highlightLinks.size > 0) {
        return highlightLinks.has(key) ? baseWidth + 1 : 0.8;
      }
      return baseWidth;
    },
    [highlightLinks]
  );

  // ─── 关闭搜索浮层（点击外部） ──────────────────

  useEffect(() => {
    if (!showSearchResults) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".search-area")) {
        setShowSearchResults(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSearchResults]);

  // ─── 空数据状态 ─────────────────────────────────

  if (!hasRelationships) {
    return (
      <div className="mt-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 text-center shadow-sm dark:shadow-gray-950/30">
        <p className="text-4xl">🕸️</p>
        <p className="mt-3 text-sm font-medium text-gray-500 dark:text-gray-400">
          暂无角色关系数据
        </p>
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
          AI 分析后自动提取角色关系，在此展示交互式关系图谱
        </p>
      </div>
    );
  }

  // ─── 渲染 ────────────────────────────────────────

  // 度数最大节点（用于提示）
  const maxDegreeNode = nodes.reduce(
    (max, n) => (n.degree > max.degree ? n : max),
    nodes[0]
  );

  return (
    <div className="mt-6 space-y-3">
      {/* 标题栏 + 筛选器 + 操作按钮 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="text-sm font-medium text-gray-600 dark:text-gray-300">
          🕸️ 角色关系网络 ({nodes.length} 角色, {links.length} 条边)
        </h4>
        <div className="flex flex-wrap items-center gap-2">
          {/* 角色类型筛选 */}
          <div className="flex flex-wrap gap-1.5">
            {["主角", "反派", "配角", "路人"].map((role) => (
              <button
                key={role}
                onClick={() => toggleFilter(role)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  activeFilters.has(role)
                    ? "border-transparent text-white shadow-sm dark:shadow-gray-950/30"
                    : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
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
          {/* 分隔 */}
          <span className="text-gray-300 dark:text-gray-600">|</span>
          {/* 导出按钮 */}
          <button
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition disabled:opacity-50"
            title="导出当前视图为 PNG"
          >
            {exporting ? "⏳" : "📥"} 导出
          </button>
        </div>
      </div>

      {/* 关系图谱容器 */}
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 shadow-sm dark:shadow-gray-950/30"
        style={{ minHeight: dimensions.height }}
      >
        {/* 搜索框 */}
        <div className="search-area absolute left-3 top-3 z-20">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSearchResults(true);
              }}
              onFocus={() => setShowSearchResults(true)}
              placeholder="🔍 搜索角色..."
              className="w-44 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:focus:ring-indigo-500 focus:border-transparent"
            />
            {/* 下拉建议 */}
            {showSearchResults && searchResults.length > 0 && (
              <div className="absolute left-0 top-full mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg overflow-hidden z-30">
                {searchResults.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleSearchSelect(n)}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-gray-50 dark:hover:bg-gray-700 transition flex items-center gap-2"
                  >
                    <span
                      className="inline-block h-2 w-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: n.color }}
                    />
                    <span className="text-gray-700 dark:text-gray-200 truncate">
                      {n.name}
                    </span>
                    <span className="ml-auto text-gray-400 dark:text-gray-500 flex-shrink-0">
                      {n.roleType}
                      {n.degree >= 3 && (
                        <span className="ml-1 text-gray-300 dark:text-gray-600">
                          {n.degree}°
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 已选择角色提示 */}
        {selectedNode && (
          <div className="absolute left-3 top-16 z-10 max-w-[200px] rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950 p-2.5 shadow-lg animate-fade-in">
            <p className="text-xs text-indigo-600 dark:text-indigo-400">
              🔍 已聚焦: <strong>{selectedNode.name}</strong>
            </p>
            <button
              onClick={clearHighlight}
              className="mt-1 text-xs text-indigo-400 dark:text-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-300"
            >
              ✕ 取消聚焦
            </button>
          </div>
        )}

        {/* ForceGraph2D 画布 */}
        <ForceGraph2D<GraphNode, GraphLink>
          key={graphKey}
          ref={graphRef}
          graphData={filteredData}
          width={dimensions.width}
          height={dimensions.height}
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
          linkWidth={linkWidthAccessor}
          linkLabel={linkLabel}
          linkCanvasObjectMode={"after"}
          linkCanvasObject={paintLinkLabel}
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={0.5}
          linkDirectionalArrowColor={linkColorAccessor}
          linkCurvature={0.15}
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
          onBackgroundClick={clearHighlight}
          onLinkClick={(link: RuntimeLink) => {
            const src = getLinkSourceName(link);
            const tgt = getLinkTargetName(link);
            const connected = new Set([src, tgt]);
            setHighlightNodes(connected);
            setHighlightLinks(new Set([getLinkKey(link)]));
            setSelectedNode(null);
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

        {/* 侧边详情面板 */}
        {selectedNode && (
          <div className="absolute right-0 top-0 bottom-0 w-60 border-l border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm shadow-lg z-10 overflow-y-auto animate-slide-in-right">
            {/* 头部 */}
            <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: selectedNode.color }}
                  />
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                    {selectedNode.name}
                  </h3>
                </div>
                <button
                  onClick={clearHighlight}
                  className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xs"
                >
                  ✕
                </button>
              </div>
              <span
                className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-xs text-white"
                style={{ backgroundColor: selectedNode.color }}
              >
                {selectedNode.roleType}
              </span>
              {selectedNode.degree > 0 && (
                <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">
                  连接 {selectedNode.degree} 个角色
                </span>
              )}
            </div>

            {/* 角色信息 */}
            <div className="p-4 space-y-3">
              {selectedNode.traits?.identity && (
                <div>
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">身份</p>
                  <p className="mt-0.5 text-sm text-gray-700 dark:text-gray-200">
                    {selectedNode.traits.identity}
                  </p>
                </div>
              )}

              {selectedNode.traits?.personality && selectedNode.traits.personality.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">性格</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {selectedNode.traits.personality.map((tag, i) => (
                      <span
                        key={i}
                        className="rounded-full bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 text-xs text-indigo-600 dark:text-indigo-400"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedNode.traits?.goal && (
                <div>
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">目标</p>
                  <p className="mt-0.5 text-sm text-gray-700 dark:text-gray-200">
                    {selectedNode.traits.goal}
                  </p>
                </div>
              )}

              {selectedNode.traits?.motivation && (
                <div>
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">动机</p>
                  <p className="mt-0.5 text-sm text-gray-700 dark:text-gray-200">
                    {selectedNode.traits.motivation}
                  </p>
                </div>
              )}

              {/* 关系列表 */}
              {selectedNode.relationsList.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                    关系 ({selectedNode.relationsList.length})
                  </p>
                  <div className="mt-1.5 space-y-1.5">
                    {selectedNode.relationsList.map((rel, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          const targetNode = nodes.find((n) => n.id === rel.with);
                          if (targetNode) focusOnNode(targetNode);
                        }}
                        className="w-full text-left rounded-lg border border-gray-100 dark:border-gray-800 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition group"
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className="inline-block h-1.5 w-1.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: rel.color }}
                          />
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition">
                            {rel.with}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500 ml-[18px]">
                          {rel.relation}
                          <span
                            className="ml-1.5 inline-block rounded-full px-1.5 py-0.5 text-xs"
                            style={{
                              backgroundColor: rel.color + "20",
                              color: rel.color,
                            }}
                          >
                            {rel.type}
                          </span>
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 图例 */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-gray-400 dark:text-gray-500">
        <span className="font-medium text-gray-500 dark:text-gray-400">角色:</span>
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
        <span className="font-medium text-gray-500 dark:text-gray-400">关系:</span>
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
        <span className="text-gray-400 dark:text-gray-500">
          💡 拖拽 · 缩放 · 点击看详情
        </span>
        {maxDegreeNode.degree >= 3 && (
          <>
            <span className="mx-2 text-gray-200">|</span>
            <span className="text-gray-400 dark:text-gray-500">
              🔢 节点数字 = 连接度数
            </span>
          </>
        )}
      </div>
    </div>
  );
}

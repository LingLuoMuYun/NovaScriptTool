import { PrismaClient } from "@prisma/client";
import { chatCompletion } from "./ai.service";
import { parseAIJson } from "./ai.service";

const prisma = new PrismaClient();

/**
 * 构建场景间依赖图谱
 * 分析角色连续出场、因果事件关联、时间顺序等因素
 */
export async function buildDependencyGraph(novelId: string): Promise<{
  edges: { source: number; target: number; type: string; weight: number }[];
  sceneCount: number;
}> {
  // 获取所有场景
  const scenes = await prisma.scene.findMany({
    where: { novelId },
    orderBy: { sceneNum: "asc" },
    include: { scripts: { orderBy: { version: "desc" }, take: 1 } },
  });

  if (scenes.length < 2) {
    return { edges: [], sceneCount: scenes.length };
  }

  // 构建场景摘要列表
  const sceneSummaries = scenes.map((s) => ({
    sceneNum: s.sceneNum,
    location: s.location,
    timeOfDay: s.timeOfDay,
    summary: s.scripts[0]?.yamlContent?.substring(0, 300) || `Scene ${s.sceneNum}`,
  }));

  // 使用 AI 分析场景间依赖
  try {
    const response = await chatCompletion(
      [
        {
          role: "system",
          content: `分析以下场景列表之间的依赖关系。对每对相邻或有因果关联的场景，识别依赖类型。

依赖类型：
- "character_continuity": 同一角色连续出现
- "causal_event": 前一场景的事件直接导致后一场景
- "temporal": 时间顺序依赖

请以 JSON 格式输出：
{
  "edges": [
    { "source": 1, "target": 3, "type": "causal_event", "weight": 0.9, "reason": "场景1发现线索导致场景3前往调查" }
  ]
}`,
        },
        {
          role: "user",
          content: JSON.stringify(sceneSummaries),
        },
      ],
      { responseFormat: "json_object", thinking: false, maxTokens: 4096 }
    );

    const data = parseAIJson(response.content);
    const edges = (data.edges || []).map((e: any) => ({
      source: e.source,
      target: e.target,
      type: e.type || "character_continuity",
      weight: e.weight || 0.5,
    }));

    // 清除旧依赖边，写入新边
    await prisma.dependencyEdge.deleteMany({ where: { novelId } });
    if (edges.length > 0) {
      await prisma.dependencyEdge.createMany({
        data: edges.map((e: any) => ({
          novelId,
          sourceSceneNum: e.source,
          targetSceneNum: e.target,
          dependencyType: e.type,
          weight: e.weight,
        })),
      });
    }

    // 补充相邻场景的隐式依赖（时间顺序）
    for (let i = 0; i < scenes.length - 1; i++) {
      const exists = edges.some(
        (e: any) =>
          (e.source === scenes[i].sceneNum && e.target === scenes[i + 1].sceneNum) ||
          (e.source === scenes[i + 1].sceneNum && e.target === scenes[i].sceneNum)
      );
      if (!exists) {
        await prisma.dependencyEdge.create({
          data: {
            novelId,
            sourceSceneNum: scenes[i].sceneNum,
            targetSceneNum: scenes[i + 1].sceneNum,
            dependencyType: "temporal",
            weight: 0.3,
          },
        });
      }
    }

    return { edges, sceneCount: scenes.length };
  } catch (err) {
    console.error("依赖图构建失败:", err);
    return { edges: [], sceneCount: scenes.length };
  }
}

/**
 * BFS 影响分析：给定变更的场景编号，计算最小影响场景集合
 * @param minWeight 依赖权重阈值（默认 0），低于此权重的边在 BFS 中被忽略
 * 排除锁定场景
 */
export async function analyzeImpact(
  novelId: string,
  changedSceneNums: number[],
  minWeight: number = 0
): Promise<{
  affectedSceneNums: number[];
  excludedLockedNums: number[];
  totalScenesToRegenerate: number;
  /** 影响链路详情：每个受影响场景的依赖来源 */
  impactPaths: { targetSceneNum: number; sourceSceneNum: number; type: string; weight: number }[];
}> {
  // 获取所有依赖边
  const edges = await prisma.dependencyEdge.findMany({ where: { novelId } });

  // 构建邻接表（有向图），记录权重和类型
  const adj = new Map<number, { target: number; type: string; weight: number }[]>();
  for (const e of edges) {
    if (e.weight < minWeight) continue; // 权重阈值过滤
    if (!adj.has(e.sourceSceneNum)) adj.set(e.sourceSceneNum, []);
    adj.get(e.sourceSceneNum)!.push({
      target: e.targetSceneNum,
      type: e.dependencyType,
      weight: e.weight,
    });
  }

  // BFS 遍历，记录依赖链路
  const visited = new Set<number>();
  const queue = [...changedSceneNums];
  const impactPaths: { targetSceneNum: number; sourceSceneNum: number; type: string; weight: number }[] = [];
  for (const n of queue) visited.add(n);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = adj.get(current) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor.target)) {
        visited.add(neighbor.target);
        queue.push(neighbor.target);
        impactPaths.push({
          targetSceneNum: neighbor.target,
          sourceSceneNum: current,
          type: neighbor.type,
          weight: neighbor.weight,
        });
      }
    }
  }

  // 获取锁定场景
  const lockedScenes = await prisma.scene.findMany({
    where: { novelId, isLocked: true },
    select: { sceneNum: true },
  });
  const lockedNums = new Set(lockedScenes.map((s) => s.sceneNum));

  // 排除锁定场景
  const affected = Array.from(visited).filter((n) => !lockedNums.has(n));
  const excluded = Array.from(visited).filter((n) => lockedNums.has(n));

  return {
    affectedSceneNums: affected.sort((a, b) => a - b),
    excludedLockedNums: excluded.sort((a, b) => a - b),
    totalScenesToRegenerate: affected.length,
    impactPaths,
  };
}

/**
 * 检测变更场景：查找所有存在手动编辑版本的场景
 * （即 Script.createdBy === "user" 的场景）
 */
export async function getChangedScenes(novelId: string): Promise<number[]> {
  const scenes = await prisma.scene.findMany({
    where: { novelId },
    include: { scripts: { where: { createdBy: "user" }, select: { id: true } } },
    orderBy: { sceneNum: "asc" },
  });
  return scenes.filter((s) => s.scripts.length > 0).map((s) => s.sceneNum);
}

/**
 * 检查依赖图是否已构建
 */
export async function getDepsStatus(novelId: string): Promise<{
  hasDeps: boolean;
  edgeCount: number;
  sceneCount: number;
}> {
  const [edgeCount, sceneCount] = await Promise.all([
    prisma.dependencyEdge.count({ where: { novelId } }),
    prisma.scene.count({ where: { novelId } }),
  ]);
  return {
    hasDeps: edgeCount > 0,
    edgeCount,
    sceneCount,
  };
}

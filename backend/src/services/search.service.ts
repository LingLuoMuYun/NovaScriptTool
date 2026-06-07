/**
 * SQLite FTS5 全文搜索引擎
 *
 * 功能：
 * - 跨小说内容、剧本、角色、注记的全文本搜索
 * - BM25 相关性排序 + 上下文摘要提取
 * - 前缀匹配（*通配符）、短语搜索、布尔表达式
 * - 自动同步触发器（INSERT/UPDATE/DELETE → FTS5 索引）
 * - 启动时自动建表（幂等）
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ─── FTS5 表结构 ──────────────────────────────────────────

const FTS5_SETUP_SQL = `
-- 小说全文索引（外部内容表）
CREATE VIRTUAL TABLE IF NOT EXISTS novels_fts USING fts5(
  title,
  content,
  content='novels',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);

-- 剧本全文索引（外部内容表）
CREATE VIRTUAL TABLE IF NOT EXISTS scripts_fts USING fts5(
  yaml_content,
  scene_label,
  content='scripts',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);

-- 角色全文索引（外部内容表）
CREATE VIRTUAL TABLE IF NOT EXISTS characters_fts USING fts5(
  name,
  aliases,
  traits,
  content='characters',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);

-- 注记全文索引（外部内容表）
CREATE VIRTUAL TABLE IF NOT EXISTS annotations_fts USING fts5(
  content,
  author_name,
  content='annotations',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);

-- ─── 同步触发器：novels ────────────────────────────────

CREATE TRIGGER IF NOT EXISTS novels_fts_insert AFTER INSERT ON novels BEGIN
  INSERT INTO novels_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
END;

CREATE TRIGGER IF NOT EXISTS novels_fts_delete AFTER DELETE ON novels BEGIN
  INSERT INTO novels_fts(novels_fts, rowid, title, content) VALUES('delete', old.rowid, old.title, old.content);
END;

CREATE TRIGGER IF NOT EXISTS novels_fts_update AFTER UPDATE ON novels BEGIN
  INSERT INTO novels_fts(novels_fts, rowid, title, content) VALUES('delete', old.rowid, old.title, old.content);
  INSERT INTO novels_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
END;

-- ─── 同步触发器：scripts ───────────────────────────────

CREATE TRIGGER IF NOT EXISTS scripts_fts_insert AFTER INSERT ON scripts BEGIN
  INSERT INTO scripts_fts(rowid, yaml_content, scene_label)
  VALUES (
    new.rowid,
    new.yaml_content,
    (SELECT 'Scene ' || scene_num || ' — ' || location FROM scenes WHERE rowid = new.scene_id)
  );
END;

CREATE TRIGGER IF NOT EXISTS scripts_fts_delete AFTER DELETE ON scripts BEGIN
  INSERT INTO scripts_fts(scripts_fts, rowid, yaml_content, scene_label) VALUES('delete', old.rowid, old.yaml_content, '');
END;

CREATE TRIGGER IF NOT EXISTS scripts_fts_update AFTER UPDATE ON scripts BEGIN
  INSERT INTO scripts_fts(scripts_fts, rowid, yaml_content, scene_label) VALUES('delete', old.rowid, old.yaml_content, '');
  INSERT INTO scripts_fts(rowid, yaml_content, scene_label)
  VALUES (
    new.rowid,
    new.yaml_content,
    (SELECT 'Scene ' || scene_num || ' — ' || location FROM scenes WHERE rowid = new.scene_id)
  );
END;

-- ─── 同步触发器：characters ─────────────────────────────

CREATE TRIGGER IF NOT EXISTS characters_fts_insert AFTER INSERT ON characters BEGIN
  INSERT INTO characters_fts(rowid, name, aliases, traits) VALUES (new.rowid, new.name, new.aliases, new.traits);
END;

CREATE TRIGGER IF NOT EXISTS characters_fts_delete AFTER DELETE ON characters BEGIN
  INSERT INTO characters_fts(characters_fts, rowid, name, aliases, traits) VALUES('delete', old.rowid, old.name, old.aliases, old.traits);
END;

CREATE TRIGGER IF NOT EXISTS characters_fts_update AFTER UPDATE ON characters BEGIN
  INSERT INTO characters_fts(characters_fts, rowid, name, aliases, traits) VALUES('delete', old.rowid, old.name, old.aliases, old.traits);
  INSERT INTO characters_fts(rowid, name, aliases, traits) VALUES (new.rowid, new.name, new.aliases, new.traits);
END;

-- ─── 同步触发器：annotations ────────────────────────────

CREATE TRIGGER IF NOT EXISTS annotations_fts_insert AFTER INSERT ON annotations BEGIN
  INSERT INTO annotations_fts(rowid, content, author_name) VALUES (new.rowid, new.content, new.author_name);
END;

CREATE TRIGGER IF NOT EXISTS annotations_fts_delete AFTER DELETE ON annotations BEGIN
  INSERT INTO annotations_fts(annotations_fts, rowid, content, author_name) VALUES('delete', old.rowid, old.content, old.author_name);
END;

CREATE TRIGGER IF NOT EXISTS annotations_fts_update AFTER UPDATE ON annotations BEGIN
  INSERT INTO annotations_fts(annotations_fts, rowid, content, author_name) VALUES('delete', old.rowid, old.content, old.author_name);
  INSERT INTO annotations_fts(rowid, content, author_name) VALUES (new.rowid, new.content, new.author_name);
END;
`;

// ─── 性能索引 ─────────────────────────────────────────────

const PERFORMANCE_INDEXES_SQL = `
-- 场景按小说+编号查找（最频繁查询之一）
CREATE INDEX IF NOT EXISTS idx_scenes_novel_num ON scenes(novel_id, scene_num);

-- 剧本按场景+版本查找（最新版本查询）
CREATE INDEX IF NOT EXISTS idx_scripts_scene_version ON scripts(scene_id, version DESC);

-- 注记按小说+类型过滤（注记面板筛选）
CREATE INDEX IF NOT EXISTS idx_annotations_novel_type ON annotations(novel_id, target_type);

-- 注记按小说+目标查找（行内评论查询）
CREATE INDEX IF NOT EXISTS idx_annotations_novel_target ON annotations(novel_id, target_id);

-- 依赖边按小说查找（依赖图谱构建）
CREATE INDEX IF NOT EXISTS idx_deps_novel ON dependency_edges(novel_id);

-- 聊天消息按会话+时间排序（对话历史）
CREATE INDEX IF NOT EXISTS idx_messages_conv_time ON chat_messages(conversation_id, created_at);

-- 聊天会话按小说关联（会话列表）
CREATE INDEX IF NOT EXISTS idx_chat_conv_novel ON chat_conversations(novel_id);
`;

// ─── 初始化 ───────────────────────────────────────────────

let ftsInitialized = false;

/** 启动时初始化 FTS5 表和性能索引（幂等，可多次调用） */
export async function initFTS5(): Promise<void> {
  if (ftsInitialized) return;

  try {
    // 检查 FTS5 是否已启用（SQLite 编译选项）
    const ftsCheck = await prisma.$queryRawUnsafe<{ fts5: number }[]>(
      `SELECT count(*) as fts5 FROM pragma_module_list() WHERE name = 'fts5'`
    );
    const hasFTS5 = (ftsCheck as any)[0]?.fts5 > 0;

    if (!hasFTS5) {
      console.warn("⚠️ SQLite 未编译 FTS5 模块，全文搜索不可用。使用 LIKE 模糊搜索降级。");
      ftsInitialized = true;
      return;
    }

    // 逐条执行 SQL（SQLite 不支持批量 CREATE TRIGGER）
    const statements = (FTS5_SETUP_SQL + PERFORMANCE_INDEXES_SQL)
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      try {
        await prisma.$executeRawUnsafe(stmt + ";");
      } catch (err: any) {
        // 忽略 "already exists" 类错误
        if (!err.message?.includes("already exists") && !err.message?.includes("duplicate")) {
          console.warn(`  ⚠️ FTS5 初始化警告: ${err.message?.substring(0, 80)}`);
        }
      }
    }

    // 重建已有数据的索引（仅首次）
    await rebuildFTSIndexes();

    ftsInitialized = true;
    console.log("✅ FTS5 全文搜索引擎已就绪 + 7 个性能索引");
  } catch (err: any) {
    console.error("❌ FTS5 初始化失败:", err.message);
    ftsInitialized = true; // 避免重复尝试
  }
}

/** 重建所有 FTS5 索引（将已有数据导入 FTS5 表） */
async function rebuildFTSIndexes(): Promise<void> {
  const rebuildQueries = [
    `INSERT INTO novels_fts(rowid, title, content) SELECT rowid, title, content FROM novels WHERE rowid NOT IN (SELECT rowid FROM novels_fts)`,
    `INSERT INTO scripts_fts(rowid, yaml_content, scene_label) SELECT s.rowid, s.yaml_content, 'Scene ' || sc.scene_num || ' — ' || sc.location FROM scripts s LEFT JOIN scenes sc ON sc.rowid = s.scene_id WHERE s.rowid NOT IN (SELECT rowid FROM scripts_fts)`,
    `INSERT INTO characters_fts(rowid, name, aliases, traits) SELECT rowid, name, aliases, traits FROM characters WHERE rowid NOT IN (SELECT rowid FROM characters_fts)`,
    `INSERT INTO annotations_fts(rowid, content, author_name) SELECT rowid, content, author_name FROM annotations WHERE rowid NOT IN (SELECT rowid FROM annotations_fts)`,
  ];

  for (const sql of rebuildQueries) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (err: any) {
      if (!err.message?.includes("no such table")) {
        console.warn(`  ⚠️ FTS5 重建警告: ${err.message?.substring(0, 80)}`);
      }
    }
  }
}

// ─── 搜索接口 ─────────────────────────────────────────────

export type SearchTarget = "all" | "novels" | "scripts" | "characters" | "annotations";

export interface SearchResult {
  id: string;
  targetType: SearchTarget;
  title: string;
  snippet: string;      // 带 <b>...</b> 标记的上下文摘要
  novelId: string;
  novelTitle: string;
  url: string;          // 前端跳转路径
  rank: number;         // BM25 分数（越低越好）
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  total: number;
  tookMs: number;
  usingFTS5: boolean;
}

/** 全文搜索主入口 */
export async function search(
  query: string,
  options: {
    target?: SearchTarget;
    novelId?: string;     // 限定小说范围
    limit?: number;
    offset?: number;
  } = {}
): Promise<SearchResponse> {
  const { target = "all", novelId, limit = 20, offset = 0 } = options;
  const startTime = Date.now();
  let usingFTS5 = true;

  if (!query.trim()) {
    return { query, results: [], total: 0, tookMs: 0, usingFTS5 };
  }

  // 检查 FTS5 是否可用
  if (!ftsInitialized) await initFTS5();

  try {
    const results = await searchWithFTS5(query, target, novelId, limit, offset);
    return {
      query,
      results: results.items,
      total: results.total,
      tookMs: Date.now() - startTime,
      usingFTS5: true,
    };
  } catch (err: any) {
    // FTS5 失败 → 降级到 LIKE 模糊搜索
    console.warn(`⚠️ FTS5 搜索降级到 LIKE: ${err.message?.substring(0, 80)}`);
    usingFTS5 = false;
    const results = await searchWithLike(query, target, novelId, limit, offset);
    return {
      query,
      results: results.items,
      total: results.total,
      tookMs: Date.now() - startTime,
      usingFTS5: false,
    };
  }
}

// ─── FTS5 查询实现 ────────────────────────────────────────

async function searchWithFTS5(
  query: string,
  target: SearchTarget,
  novelId: string | undefined,
  limit: number,
  offset: number
): Promise<{ items: SearchResult[]; total: number }> {
  const items: SearchResult[] = [];
  let total = 0;

  // 对中文查询做分词优化：每个字符间加空格以支持单字匹配
  const ftsQuery = buildFTS5Query(query);

  // ─── 搜索 novels ───
  if (target === "all" || target === "novels") {
    const { results, count } = await searchNovels(ftsQuery, novelId, limit, offset);
    items.push(...results);
    total += count;
  }

  // ─── 搜索 scripts ───
  if (target === "all" || target === "scripts") {
    const remaining = limit - items.length;
    if (remaining > 0) {
      const { results, count } = await searchScripts(ftsQuery, novelId, remaining, offset);
      items.push(...results);
      total += count;
    }
  }

  // ─── 搜索 characters ───
  if (target === "all" || target === "characters") {
    const remaining = limit - items.length;
    if (remaining > 0) {
      const { results, count } = await searchCharacters(ftsQuery, novelId, remaining, offset);
      items.push(...results);
      total += count;
    }
  }

  // ─── 搜索 annotations ───
  if (target === "all" || target === "annotations") {
    const remaining = limit - items.length;
    if (remaining > 0) {
      const { results, count } = await searchAnnotations(ftsQuery, novelId, remaining, offset);
      items.push(...results);
      total += count;
    }
  }

  // 按 BM25 排名排序
  items.sort((a, b) => a.rank - b.rank);

  return { items: items.slice(0, limit), total };
}

/** 构建 FTS5 查询表达式 */
function buildFTS5Query(query: string): string {
  const trimmed = query.trim();
  // 如果包含英文/数字，保持原样；如果是纯中文，支持单字匹配
  const hasAscii = /[a-zA-Z0-9]/.test(trimmed);
  if (hasAscii) {
    // 混合查询：短语搜索 + 前缀匹配
    return `"${trimmed}" OR ${trimmed.split(/\s+/).map((w) => w + "*").join(" + ")}`;
  }
  // 中文查询：每个查询词前后加 *
  const terms = trimmed.split(/\s+/).filter(Boolean);
  if (terms.length === 1 && terms[0].length <= 2) {
    return `"${trimmed}" OR ${trimmed}*`;
  }
  return terms.map((t) => `"${t}"`).join(" OR ") + ` OR ${terms.map((t) => t + "*").join(" + ")}`;
}

// ─── 各表搜索子函数 ───────────────────────────────────────

async function searchNovels(
  ftsQuery: string,
  novelId: string | undefined,
  limit: number,
  offset: number
): Promise<{ results: SearchResult[]; count: number }> {
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
        n.id, n.title,
        snippet(novels_fts, 1, '<b>', '</b>', '…', 40) as snippet,
        rank
      FROM novels_fts
      JOIN novels n ON n.rowid = novels_fts.rowid
      WHERE novels_fts MATCH ?
      ${novelId ? `AND n.id = '${novelId}'` : ""}
      ORDER BY rank
      LIMIT ? OFFSET ?`,
      ftsQuery,
      limit,
      offset
    );

    return {
      results: rows.map((r: any) => ({
        id: r.id,
        targetType: "novels" as SearchTarget,
        title: r.title,
        snippet: r.snippet || r.title,
        novelId: r.id,
        novelTitle: r.title,
        url: `/novels/${r.id}`,
        rank: r.rank ?? 999,
      })),
      count: rows.length,
    };
  } catch {
    return { results: [], count: 0 };
  }
}

async function searchScripts(
  ftsQuery: string,
  novelId: string | undefined,
  limit: number,
  offset: number
): Promise<{ results: SearchResult[]; count: number }> {
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
        sc.id as scene_id, s.id as script_id, s.version,
        sc.scene_num, sc.location, sc.novel_id,
        snippet(scripts_fts, 1, '<b>', '</b>', '…', 50) as snippet,
        n.title as novel_title,
        rank
      FROM scripts_fts
      JOIN scripts s ON s.rowid = scripts_fts.rowid
      JOIN scenes sc ON sc.id = s.scene_id
      JOIN novels n ON n.id = sc.novel_id
      WHERE scripts_fts MATCH ?
      ${novelId ? `AND sc.novel_id = '${novelId}'` : ""}
      ORDER BY rank
      LIMIT ? OFFSET ?`,
      ftsQuery,
      limit,
      offset
    );

    return {
      results: rows.map((r: any) => ({
        id: r.script_id,
        targetType: "scripts" as SearchTarget,
        title: `Scene ${r.scene_num} — ${r.location} (v${r.version})`,
        snippet: r.snippet || "",
        novelId: r.novel_id,
        novelTitle: r.novel_title,
        url: `/novels/${r.novel_id}`,
        rank: r.rank ?? 999,
      })),
      count: rows.length,
    };
  } catch {
    return { results: [], count: 0 };
  }
}

async function searchCharacters(
  ftsQuery: string,
  novelId: string | undefined,
  limit: number,
  offset: number
): Promise<{ results: SearchResult[]; count: number }> {
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
        c.id, c.name, c.role_type, c.novel_id,
        snippet(characters_fts, 1, '<b>', '</b>', '…', 30) as snippet,
        n.title as novel_title,
        rank
      FROM characters_fts
      JOIN characters c ON c.rowid = characters_fts.rowid
      JOIN novels n ON n.id = c.novel_id
      WHERE characters_fts MATCH ?
      ${novelId ? `AND c.novel_id = '${novelId}'` : ""}
      ORDER BY rank
      LIMIT ? OFFSET ?`,
      ftsQuery,
      limit,
      offset
    );

    return {
      results: rows.map((r: any) => ({
        id: r.id,
        targetType: "characters" as SearchTarget,
        title: `${r.name} (${r.role_type || "配角"})`,
        snippet: r.snippet || r.name,
        novelId: r.novel_id,
        novelTitle: r.novel_title,
        url: `/novels/${r.novel_id}`,
        rank: r.rank ?? 999,
      })),
      count: rows.length,
    };
  } catch {
    return { results: [], count: 0 };
  }
}

async function searchAnnotations(
  ftsQuery: string,
  novelId: string | undefined,
  limit: number,
  offset: number
): Promise<{ results: SearchResult[]; count: number }> {
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
        a.id, a.content, a.type, a.author_name, a.novel_id, a.target_type, a.target_id,
        snippet(annotations_fts, 1, '<b>', '</b>', '…', 30) as snippet,
        n.title as novel_title,
        rank
      FROM annotations_fts
      JOIN annotations a ON a.rowid = annotations_fts.rowid
      JOIN novels n ON n.id = a.novel_id
      WHERE annotations_fts MATCH ?
      ${novelId ? `AND a.novel_id = '${novelId}'` : ""}
      ORDER BY rank
      LIMIT ? OFFSET ?`,
      ftsQuery,
      limit,
      offset
    );

    return {
      results: rows.map((r: any) => ({
        id: r.id,
        targetType: "annotations" as SearchTarget,
        title: `[${r.type}] ${r.author_name}: ${r.content?.substring(0, 60)}`,
        snippet: r.snippet || r.content?.substring(0, 100),
        novelId: r.novel_id,
        novelTitle: r.novel_title,
        url: `/novels/${r.novel_id}`,
        rank: r.rank ?? 999,
      })),
      count: rows.length,
    };
  } catch {
    return { results: [], count: 0 };
  }
}

// ─── LIKE 降级搜索 ────────────────────────────────────────

async function searchWithLike(
  query: string,
  target: SearchTarget,
  novelId: string | undefined,
  limit: number,
  offset: number
): Promise<{ items: SearchResult[]; total: number }> {
  const likeQuery = `%${query}%`;
  const items: SearchResult[] = [];
  let total = 0;

  if (target === "all" || target === "novels") {
    const novels = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, title FROM novels WHERE (title LIKE ? OR content LIKE ?) ${novelId ? `AND id = '${novelId}'` : ""} LIMIT ? OFFSET ?`,
      likeQuery, likeQuery, limit, offset
    );
    items.push(...novels.map((n: any) => ({
      id: n.id, targetType: "novels" as SearchTarget, title: n.title,
      snippet: n.title, novelId: n.id, novelTitle: n.title,
      url: `/novels/${n.id}`, rank: 99,
    })));
    total += novels.length;
  }

  if (target === "all" || target === "scripts") {
    const remaining = limit - items.length;
    if (remaining > 0) {
      const scripts = await prisma.$queryRawUnsafe<any[]>(
        `SELECT s.id as script_id, s.version, sc.scene_num, sc.location, sc.novel_id, n.title as novel_title
         FROM scripts s JOIN scenes sc ON sc.id = s.scene_id JOIN novels n ON n.id = sc.novel_id
         WHERE s.yaml_content LIKE ? ${novelId ? `AND sc.novel_id = '${novelId}'` : ""}
         LIMIT ? OFFSET ?`,
        likeQuery, remaining, offset
      );
      items.push(...scripts.map((r: any) => ({
        id: r.script_id, targetType: "scripts" as SearchTarget,
        title: `Scene ${r.scene_num} — ${r.location} (v${r.version})`,
        snippet: "", novelId: r.novel_id, novelTitle: r.novel_title,
        url: `/novels/${r.novel_id}`, rank: 100,
      })));
      total += scripts.length;
    }
  }

  if (target === "all" || target === "characters") {
    const remaining = limit - items.length;
    if (remaining > 0) {
      const chars = await prisma.$queryRawUnsafe<any[]>(
        `SELECT c.id, c.name, c.role_type, c.novel_id, n.title as novel_title
         FROM characters c JOIN novels n ON n.id = c.novel_id
         WHERE (c.name LIKE ? OR c.traits LIKE ? OR c.aliases LIKE ?)
         ${novelId ? `AND c.novel_id = '${novelId}'` : ""}
         LIMIT ? OFFSET ?`,
        likeQuery, likeQuery, likeQuery, remaining, offset
      );
      items.push(...chars.map((r: any) => ({
        id: r.id, targetType: "characters" as SearchTarget,
        title: `${r.name} (${r.role_type || "配角"})`,
        snippet: r.name, novelId: r.novel_id, novelTitle: r.novel_title,
        url: `/novels/${r.novel_id}`, rank: 101,
      })));
      total += chars.length;
    }
  }

  if (target === "all" || target === "annotations") {
    const remaining = limit - items.length;
    if (remaining > 0) {
      const anns = await prisma.$queryRawUnsafe<any[]>(
        `SELECT a.id, a.content, a.type, a.author_name, a.novel_id, n.title as novel_title
         FROM annotations a JOIN novels n ON n.id = a.novel_id
         WHERE a.content LIKE ?
         ${novelId ? `AND a.novel_id = '${novelId}'` : ""}
         LIMIT ? OFFSET ?`,
        likeQuery, remaining, offset
      );
      items.push(...anns.map((r: any) => ({
        id: r.id, targetType: "annotations" as SearchTarget,
        title: `[${r.type}] ${r.author_name}: ${r.content?.substring(0, 60)}`,
        snippet: r.content?.substring(0, 100) || "", novelId: r.novel_id, novelTitle: r.novel_title,
        url: `/novels/${r.novel_id}`, rank: 102,
      })));
      total += anns.length;
    }
  }

  return { items: items.slice(0, limit), total };
}

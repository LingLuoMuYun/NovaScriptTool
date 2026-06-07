import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import { mimoClient, deepseekClient, chatCompletion } from "./services/ai.service";
import { cleanText, splitChapters, chunkByChars, analyzeText } from "./utils/text-processor";
import { jobQueue } from "./services/job-queue.service";
import { initFTS5, search as fullTextSearch } from "./services/search.service";

const prisma = new PrismaClient();
const app = express();

// ─── 内容哈希（分析缓存判定） ──────────────────────

function contentHash(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex").substring(0, 16);
}

async function getCachedAnalysis(novelId: string): Promise<{
  plot: any;
  characters: { name: string; roleType: string; traits: any; aliases: string[]; speechStyle: any }[];
} | null> {
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    include: { characters: true },
  });
  if (!novel || !novel.analysis) return null;

  const hash = contentHash(novel.content);
  if (novel.contentHash !== hash) return null; // 内容已变更

  if (novel.characters.length === 0) return null; // 无角色数据

  try {
    const plot = JSON.parse(novel.analysis);
    const characters = novel.characters.map((c) => ({
      name: c.name,
      roleType: c.roleType,
      traits: JSON.parse(c.traits || "{}"),
      aliases: JSON.parse(c.aliases || "[]"),
      speechStyle: JSON.parse(c.speechStyle || "{}"),
    }));
    return { plot, characters };
  } catch {
    return null;
  }
}
const PORT = process.env.PORT || 4000;

// --- 中间件 ---

app.use(cors());
app.use(express.json({ limit: "5mb", type: "application/json" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

// 强制 UTF-8 编码
app.use((_req, res, next) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  next();
});

// 文件上传配置
const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, "..", "uploads"),
    filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + "-" + Buffer.from(file.originalname, "latin1").toString("utf8"));
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = [".txt", ".md", ".json"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`不支持的文件格式: ${ext}，仅支持 ${allowed.join(", ")}`));
    }
  },
});

// 静态文件服务
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

// --- 基础 ---

app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", db: "connected" });
  } catch {
    res.json({ status: "ok", db: "disconnected" });
  }
});

// --- 分析缓存状态 ---

app.get("/api/novels/:id/cache-status", async (req, res) => {
  try {
    const novel = await prisma.novel.findUnique({
      where: { id: req.params.id },
      select: { id: true, content: true, contentHash: true, analysis: true, status: true, _count: { select: { characters: true } } },
    });
    if (!novel) return res.status(404).json({ error: "小说不存在" });

    const currentHash = contentHash(novel.content);
    const isCached = !!(novel.contentHash && novel.contentHash === currentHash && novel.analysis && novel._count.characters > 0);

    res.json({
      novelId: novel.id,
      status: novel.status,
      currentHash,
      storedHash: novel.contentHash || null,
      isCached,
      hasAnalysis: !!novel.analysis,
      characterCount: novel._count.characters,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- FTS5 全文搜索 ---

app.get("/api/search", async (req, res) => {
  try {
    const query = (req.query.q as string) || "";
    const target = (req.query.target as string) || "all";
    const novelId = req.query.novelId as string | undefined;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await fullTextSearch(query, {
      target: target as any,
      novelId,
      limit: Math.min(limit, 50),
      offset,
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- AI 模型信息 ---

app.get("/api/ai/models", async (_req, res) => {
  try {
    const models = await mimoClient.models.list();
    res.json(models);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- AI 聊天 ---

app.post("/api/ai/chat", async (req, res) => {
  try {
    const { messages, model, temperature, maxTokens, responseFormat } = req.body;
    const result = await chatCompletion(messages, {
      model,
      temperature,
      maxTokens,
      responseFormat,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Agent 接口预留 ---

app.post("/api/ai/analyze-plot", async (req, res) => {
  try {
    const { content } = req.body;
    const { analyzePlot } = await import("./services/ai.service");
    const result = await analyzePlot(content);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/ai/analyze-characters", async (req, res) => {
  try {
    const { content } = req.body;
    const { analyzeCharacters } = await import("./services/ai.service");
    const result = await analyzeCharacters(content);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/ai/plan-scenes", async (req, res) => {
  try {
    const { content, characters } = req.body;
    const { planScenes } = await import("./services/ai.service");
    const result = await planScenes(content, characters || []);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/ai/write-script", async (req, res) => {
  try {
    const { scene, characters } = req.body;
    const { writeScript } = await import("./services/ai.service");
    const result = await writeScript(scene, characters || []);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Agent 编排：分析小说 ---

app.post("/api/novels/:id/analyze", async (req, res) => {
  try {
    const novel = await prisma.novel.findUnique({ where: { id: req.params.id } });
    if (!novel) return res.status(404).json({ error: "小说不存在" });

    if (!novel.content || novel.content.trim().length < 50) {
      return res.status(400).json({ error: "小说内容过短，至少需要50字" });
    }

    // 更新状态为分析中
    await prisma.novel.update({
      where: { id: req.params.id },
      data: { status: "analyzing" },
    });

    const { runAnalysisPipeline } = await import("./services/ai.service");

    console.log(`📖 开始分析小说: ${novel.title}`);
    const result = await runAnalysisPipeline(novel.content);

    // 存储分析结果到 Novel
    await prisma.novel.update({
      where: { id: req.params.id },
      data: {
        status: "analyzed",
        analysis: JSON.stringify(result.plot),
      },
    });

    // 批量创建角色（保留用户在人设实验室中配置的语言风格包）
    if (result.characters.length > 0) {
      // 保存旧角色的语言风格包（按角色名索引）
      const oldChars = await prisma.character.findMany({
        where: { novelId: req.params.id },
        select: { name: true, speechStyle: true },
      });
      const speechStyleMap = new Map<string, string>();
      for (const c of oldChars) {
        if (c.speechStyle && c.speechStyle !== "{}") speechStyleMap.set(c.name, c.speechStyle);
      }

      // 删除旧角色
      await prisma.character.deleteMany({ where: { novelId: req.params.id } });

      await prisma.character.createMany({
        data: result.characters.map((c) => ({
          novelId: req.params.id,
          name: c.name,
          aliases: JSON.stringify(c.aliases || []),
          roleType: c.roleType || "配角",
          traits: JSON.stringify(c.traits || {}),
        })),
      });

      // 恢复用户配置的语言风格包
      if (speechStyleMap.size > 0) {
        const newChars = await prisma.character.findMany({
          where: { novelId: req.params.id },
          select: { id: true, name: true },
        });
        for (const c of newChars) {
          const saved = speechStyleMap.get(c.name);
          if (saved) {
            await prisma.character.update({
              where: { id: c.id },
              data: { speechStyle: saved },
            });
          }
        }
      }
    }

    // 后处理：过滤 conflicts 中不属于角色的抽象实体（如"命运""社会"等AI幻觉）
    const validNames = new Set(result.characters.map((c: any) => c.name));
    if (result.plot?.conflicts) {
      let filtered = 0;
      for (const c of result.plot.conflicts) {
        const before = (c.parties || []).length;
        c.parties = (c.parties || []).filter((p: string) => validNames.has(p));
        filtered += before - c.parties.length;
      }
      if (filtered > 0) console.log(`  🧹 已过滤 ${filtered} 个非角色冲突参与方`);
    }

    console.log(`✅ 分析完成: ${novel.title} (${result.characters.length} 个角色)`);

    res.json({
      plot: result.plot,
      characters: result.characters,
      characterCount: result.characters.length,
    });
  } catch (err: any) {
    // 恢复状态
    await prisma.novel.update({
      where: { id: req.params.id },
      data: { status: "draft" },
    }).catch(() => {});
    console.error("分析失败:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- Agent 编排：生成场景剧本 ---

app.post("/api/novels/:id/generate-scripts", async (req, res) => {
  try {
    const novel = await prisma.novel.findUnique({
      where: { id: req.params.id },
      include: { characters: true },
    });
    if (!novel) return res.status(404).json({ error: "小说不存在" });
    if (novel.characters.length === 0) return res.status(400).json({ error: "请先执行角色分析" });

    const { runScriptGenerationPipeline } = await import("./services/ai.service");

    // 解析角色数据（包含人设实验室的语言风格包）
    const characters = novel.characters.map((c) => ({
      name: c.name,
      roleType: c.roleType,
      traits: JSON.parse(c.traits || "{}"),
      speechStyle: JSON.parse(c.speechStyle || "{}"),
    }));

    console.log(`🎬 开始生成场景剧本: ${novel.title}`);
    const result = await runScriptGenerationPipeline(novel.content, characters);

    // 仅删除未锁定场景（保护编剧已确认内容）
    const lockedScenes = await prisma.scene.findMany({
      where: { novelId: req.params.id, isLocked: true },
      select: { sceneNum: true },
    });
    const lockedNums = lockedScenes.map((s) => s.sceneNum);

    await prisma.scene.deleteMany({
      where: { novelId: req.params.id, isLocked: false },
    });

    // 批量创建场景和剧本（跳过锁定场景号）
    let skippedLocked = 0;
    for (const scene of result.scenes) {
      if (lockedNums.includes(scene.sceneNum)) {
        skippedLocked++;
        console.log(`  🔒 场景 ${scene.sceneNum} 已锁定，跳过`);
        continue;
      }

      const created = await prisma.scene.create({
        data: {
          novelId: req.params.id,
          sceneNum: scene.sceneNum,
          location: scene.location,
          timeOfDay: scene.timeOfDay,
        },
      });

      // 找到对应剧本
      const script = result.scripts.find((s) => s.sceneNum === scene.sceneNum);
      if (script) {
        const newScript = await prisma.script.create({
          data: {
            sceneId: created.id,
            yamlContent: script.scriptYaml,
            createdBy: "system",
          },
        });
        // 设置当前版本
        await prisma.scene.update({
          where: { id: created.id },
          data: { currentVersionId: newScript.id },
        });
      }
    }

    // 更新小说状态
    await prisma.novel.update({
      where: { id: req.params.id },
      data: { status: "completed" },
    });

    console.log(`✅ 场景剧本生成完成: ${novel.title} (${result.scenes.length} 个场景, 跳过 ${skippedLocked} 个锁定)`);

    res.json({
      scenes: result.scenes,
      scripts: result.scripts,
      sceneCount: result.scenes.length,
      lockedSkipped: skippedLocked,
    });
  } catch (err: any) {
    console.error("生成失败:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- 一键流水线：Agent 1→2→3→4 ---

app.post("/api/novels/:id/pipeline", async (req, res) => {
  try {
    const novel = await prisma.novel.findUnique({ where: { id: req.params.id } });
    if (!novel) return res.status(404).json({ error: "小说不存在" });
    if (!novel.content || novel.content.trim().length < 50) {
      return res.status(400).json({ error: "小说内容过短" });
    }

    const { runAnalysisPipeline, runScriptGenerationPipeline } = await import("./services/ai.service");

    const forceReanalyze = req.query.force === "true";
    console.log(`🚀 一键流水线启动: ${novel.title}${forceReanalyze ? " (强制重分析)" : ""}`);

    // 📦 分析缓存：检查内容是否变化，命中则跳过 Agent 1+2
    let analysisResult: { plot: any; characters: any[] };
    const hash = contentHash(novel.content);

    if (!forceReanalyze) {
      const cached = await getCachedAnalysis(req.params.id);
      if (cached) {
        console.log(`  ⚡ 分析缓存命中！跳过 Agent 1+2，直接进入剧本生成`);
        analysisResult = cached;
      }
    }

    if (!analysisResult!) {
      // 缓存未命中 → 执行完整分析
      await prisma.novel.update({ where: { id: req.params.id }, data: { status: "analyzing" } });
      console.log("📖 阶段 1/2: 剧情分析 + 角色提取");
      analysisResult = await runAnalysisPipeline(novel.content);

      await prisma.novel.update({
        where: { id: req.params.id },
        data: {
          status: "analyzed",
          analysis: JSON.stringify(analysisResult.plot),
          contentHash: hash,
        },
      });

      // 存储角色（保留用户在人设实验室中配置的语言风格包）
      const oldChars1 = await prisma.character.findMany({
        where: { novelId: req.params.id },
        select: { name: true, speechStyle: true },
      });
      const speechStyleMap1 = new Map<string, string>();
      for (const c of oldChars1) {
        if (c.speechStyle && c.speechStyle !== "{}") speechStyleMap1.set(c.name, c.speechStyle);
      }

      await prisma.character.deleteMany({ where: { novelId: req.params.id } });
      if (analysisResult.characters.length > 0) {
        await prisma.character.createMany({
          data: analysisResult.characters.map((c) => ({
            novelId: req.params.id,
            name: c.name,
            aliases: JSON.stringify(c.aliases || []),
            roleType: c.roleType || "配角",
            traits: JSON.stringify(c.traits || {}),
          })),
        });

        // 恢复用户配置的语言风格包
        if (speechStyleMap1.size > 0) {
          const newChars1 = await prisma.character.findMany({
            where: { novelId: req.params.id },
            select: { id: true, name: true },
          });
          for (const c of newChars1) {
            const saved = speechStyleMap1.get(c.name);
            if (saved) {
              await prisma.character.update({
                where: { id: c.id },
                data: { speechStyle: saved },
              });
            }
          }
        }
      }
    }

    // 2. 生成场景剧本（锁保护）
    // 从数据库重新获取角色，以包含用户配置的 speechStyle
    const dbChars1 = await prisma.character.findMany({
      where: { novelId: req.params.id },
    });
    const charsWithStyle = dbChars1.map((c) => ({
      name: c.name,
      roleType: c.roleType,
      traits: JSON.parse(c.traits || "{}"),
      speechStyle: JSON.parse(c.speechStyle || "{}"),
    }));
    console.log("🎬 阶段 2/2: 场景规划 + 剧本生成");
    const scriptResult = await runScriptGenerationPipeline(
      novel.content,
      charsWithStyle
    );

    // 仅删除未锁定场景
    const lockedScenes = await prisma.scene.findMany({
      where: { novelId: req.params.id, isLocked: true },
      select: { sceneNum: true },
    });
    const lockedNums = lockedScenes.map((s) => s.sceneNum);

    await prisma.scene.deleteMany({
      where: { novelId: req.params.id, isLocked: false },
    });

    let skippedLocked = 0;
    for (const scene of scriptResult.scenes) {
      if (lockedNums.includes(scene.sceneNum)) {
        skippedLocked++;
        console.log(`  🔒 场景 ${scene.sceneNum} 已锁定，跳过`);
        continue;
      }
      const created = await prisma.scene.create({
        data: {
          novelId: req.params.id,
          sceneNum: scene.sceneNum,
          location: scene.location,
          timeOfDay: scene.timeOfDay,
        },
      });
      const script = scriptResult.scripts.find((s) => s.sceneNum === scene.sceneNum);
      if (script) {
        const newScript = await prisma.script.create({
          data: { sceneId: created.id, yamlContent: script.scriptYaml, createdBy: "system" },
        });
        await prisma.scene.update({
          where: { id: created.id },
          data: { currentVersionId: newScript.id },
        });
      }
    }

    await prisma.novel.update({ where: { id: req.params.id }, data: { status: "completed" } });

    console.log(`✅ 一键流水线完成: ${novel.title} (跳过 ${skippedLocked} 个锁定)`);
    res.json({
      plot: analysisResult.plot,
      characters: analysisResult.characters,
      scenes: scriptResult.scenes,
      scripts: scriptResult.scripts,
      stats: {
        characters: analysisResult.characters.length,
        scenes: scriptResult.scenes.length,
        lockedSkipped: skippedLocked,
      },
    });
  } catch (err: any) {
    await prisma.novel.update({
      where: { id: req.params.id },
      data: { status: "draft" },
    }).catch(() => {});
    console.error("流水线失败:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- 多格式导出 ---

app.get("/api/novels/:id/export", async (req, res) => {
  try {
    const novel = await prisma.novel.findUnique({
      where: { id: req.params.id },
      include: { scenes: { include: { scripts: true }, orderBy: { sceneNum: "asc" } } },
    });
    if (!novel) return res.status(404).json({ error: "小说不存在" });

    const format = (req.query.format as string) || "yaml";
    const validFormats = ["yaml", "fdx", "fountain"];
    if (!validFormats.includes(format)) {
      return res.status(400).json({ error: `不支持的导出格式: ${format}，可选: ${validFormats.join(", ")}` });
    }

    const { exportNovel, getContentType, getFileExtension } = await import("./services/export.service");

    const exportData = {
      title: novel.title,
      scenes: novel.scenes.map((s) => ({
        sceneNum: s.sceneNum,
        location: s.location,
        timeOfDay: s.timeOfDay,
        yamlContent: s.scripts[0]?.yamlContent || "",
      })),
    };

    const output = exportNovel(exportData, format as any);
    const contentType = getContentType(format as any);
    const ext = getFileExtension(format as any);

    res.setHeader("Content-Type", contentType);
    const safeName = novel.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
    const formatLabel = format === "yaml" ? "剧本" : format === "fdx" ? "FinalDraft" : "Fountain";
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}_${formatLabel}${ext}`
    );
    res.send(output);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Schema 校验 ---

app.get("/api/novels/:id/validate", async (req, res) => {
  try {
    const novel = await prisma.novel.findUnique({
      where: { id: req.params.id },
      include: { scenes: { include: { scripts: true }, orderBy: { sceneNum: "asc" } } },
    });
    if (!novel) return res.status(404).json({ error: "小说不存在" });

    const { validateScript, parseLegacyScript } = await import("./schemas/script.schema");

    const results: any[] = [];
    let validCount = 0;
    let structuredCount = 0;
    let legacyCount = 0;

    for (const scene of novel.scenes) {
      const yamlContent = scene.scripts[0]?.yamlContent || "";
      if (!yamlContent) {
        results.push({ sceneNum: scene.sceneNum, status: "empty", errors: ["无剧本内容"] });
        continue;
      }

      // 判断是否为结构化数据
      let parsed: unknown;
      try {
        parsed = JSON.parse(yamlContent);
      } catch {
        // 旧格式自由文本
        legacyCount++;
        const legacyResult = parseLegacyScript(yamlContent);
        results.push({
          sceneNum: scene.sceneNum,
          status: legacyResult ? "legacy_parsed" : "legacy_unparseable",
          format: "legacy_text",
          hasContent: !!legacyResult,
          warnings: legacyResult ? ["旧格式文本，已尽力解析，导出时可能丢失部分信息"] : ["无法解析旧格式文本"],
        });
        continue;
      }

      if (parsed && typeof parsed === "object" && "content" in (parsed as any)) {
        structuredCount++;
        const validation = validateScript(parsed);
        if (validation.valid) {
          validCount++;
          results.push({
            sceneNum: scene.sceneNum,
            status: "valid",
            format: "structured",
            characterCount: validation.script!.charactersInScene.length,
            blockCount: validation.script!.content.length,
          });
        } else {
          results.push({
            sceneNum: scene.sceneNum,
            status: "invalid",
            format: "structured",
            errors: validation.errors,
          });
        }
      } else {
        legacyCount++;
        results.push({
          sceneNum: scene.sceneNum,
          status: "legacy_parsed",
          format: "legacy_json_no_content",
          warnings: ["JSON 格式但缺少 content 数组，视为旧格式"],
        });
      }
    }

    res.json({
      totalScenes: novel.scenes.length,
      validCount,
      structuredCount,
      legacyCount,
      invalidCount: structuredCount - validCount,
      results,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 获取小说的场景列表
app.get("/api/novels/:id/scenes", async (req, res) => {
  try {
    const scenes = await prisma.scene.findMany({
      where: { novelId: req.params.id },
      orderBy: { sceneNum: "asc" },
      include: { scripts: true },
    });
    res.json(scenes);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 获取小说的角色列表
app.get("/api/novels/:id/characters", async (req, res) => {
  try {
    const characters = await prisma.character.findMany({
      where: { novelId: req.params.id },
      orderBy: { name: "asc" },
    });
    res.json(characters);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 更新角色（人设实验室：语言风格包等）
app.patch("/api/characters/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, aliases, roleType, traits, speechStyle } = req.body;

    // 检查角色是否存在
    const existing = await prisma.character.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "角色不存在" });
    }

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (aliases !== undefined) data.aliases = typeof aliases === "string" ? aliases : JSON.stringify(aliases);
    if (roleType !== undefined) data.roleType = roleType;
    if (traits !== undefined) data.traits = typeof traits === "string" ? traits : JSON.stringify(traits);
    if (speechStyle !== undefined) data.speechStyle = typeof speechStyle === "string" ? speechStyle : JSON.stringify(speechStyle);

    const updated = await prisma.character.update({
      where: { id },
      data,
    });

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- 数据库 CRUD ---

// 获取所有小说
app.get("/api/novels", async (_req, res) => {
  try {
    const novels = await prisma.novel.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { characters: true, scenes: true } } },
    });
    res.json(novels);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 创建小说（支持 JSON 和文件上传）
app.post("/api/novels", upload.single("file"), async (req, res) => {
  try {
    let title = "";
    let content = "";

    if (req.file) {
      // 文件上传模式（自动检测编码：UTF-8 → GBK）
      const fs = await import("fs");
      const buf = fs.readFileSync(req.file.path);
      content = buf.toString("utf-8");
      // 检测 UTF-8 解码是否正常（乱码特征：大量替换字符 U+FFFD 或问号）
      const malformedCount = (content.match(/�/g) || []).length;
      if (malformedCount > 3 || content.includes("\x00")) {
        // UTF-8 解码失败，回退到 GBK（Windows 中文默认编码）
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const iconv = require("iconv-lite");
        content = iconv.decode(buf, "gbk");
      }
      title = req.body.title || path.basename(req.file.originalname, path.extname(req.file.originalname));
    } else if (req.body.content) {
      // JSON body 模式
      content = req.body.content;
      title = req.body.title || "未命名小说";
    } else {
      return res.status(400).json({ error: "请提供文件或文本内容" });
    }

    // 文本清洗
    const cleaned = cleanText(content);
    const stats = analyzeText(cleaned);

    const novel = await prisma.novel.create({
      data: {
        title,
        content: cleaned,
      },
    });

    res.status(201).json({
      ...novel,
      stats: {
        totalChars: stats.totalChars,
        totalLines: stats.totalLines,
        estimatedChapters: stats.estimatedChapters,
        chunksCount: stats.chunks.length,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 获取单个小说（含角色和场景）
app.get("/api/novels/:id", async (req, res) => {
  try {
    const novel = await prisma.novel.findUnique({
      where: { id: req.params.id },
      include: { characters: true, scenes: { include: { scripts: true } } },
    });
    if (!novel) return res.status(404).json({ error: "小说不存在" });
    res.json(novel);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 更新小说
app.put("/api/novels/:id", async (req, res) => {
  try {
    const { title, content } = req.body;
    const novel = await prisma.novel.update({
      where: { id: req.params.id },
      data: { ...(title && { title }), ...(content && { content }) },
    });
    res.json(novel);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 删除小说
app.delete("/api/novels/:id", async (req, res) => {
  try {
    await prisma.novel.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- 文本预处理 ---

// 获取小说文本分析
app.get("/api/novels/:id/stats", async (req, res) => {
  try {
    const novel = await prisma.novel.findUnique({ where: { id: req.params.id } });
    if (!novel) return res.status(404).json({ error: "小说不存在" });

    const stats = analyzeText(novel.content);
    const chapters = splitChapters(novel.content);

    res.json({
      ...stats,
      chapters: chapters.map((c) => ({
        index: c.index,
        title: c.title,
        charCount: c.content.length,
        lineCount: c.content.split("\n").length,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 预处理小说（重新清洗+分段）
app.post("/api/novels/:id/process", async (req, res) => {
  try {
    const novel = await prisma.novel.findUnique({ where: { id: req.params.id } });
    if (!novel) return res.status(404).json({ error: "小说不存在" });

    const cleaned = cleanText(novel.content);
    const chapters = splitChapters(cleaned);
    const chunks = chunkByChars(cleaned);

    // 更新清洗后的内容
    await prisma.novel.update({
      where: { id: req.params.id },
      data: { content: cleaned },
    });

    res.json({
      cleaned: true,
      stats: {
        totalChars: cleaned.length,
        totalLines: cleaned.split("\n").length,
        chapters: chapters.length,
        chunks: chunks.length,
      },
      chapterTitles: chapters.map((c) => c.title),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- SSE 流式流水线 ---

app.get("/api/novels/:id/pipeline-stream", async (req, res) => {
  // SSE 响应头
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // 禁用 nginx 缓冲
  res.flushHeaders();

  const sendEvent = (event: any) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  let aborted = false;
  req.on("close", () => { aborted = true; });

  try {
    const novel = await prisma.novel.findUnique({ where: { id: req.params.id } });
    if (!novel) {
      sendEvent({ stage: "error", progress: 0, message: "小说不存在" });
      return res.end();
    }
    if (!novel.content || novel.content.trim().length < 50) {
      sendEvent({ stage: "error", progress: 0, message: "小说内容过短" });
      return res.end();
    }

    const { runAnalysisPipeline, runScriptGenerationPipeline } = await import("./services/ai.service");

    const forceReanalyzeSSE = req.query.force === "true";
    console.log(`🚀 SSE 流水线启动: ${novel.title}${forceReanalyzeSSE ? " (强制重分析)" : ""}`);

    // 统一定义 onProgress，同时写 SSE 和日志
    const onProgress = (event: any) => {
      if (aborted) return;
      sendEvent(event);
      const detail = event.detail ? ` (${event.detail})` : "";
      console.log(`  📡 SSE [${event.progress}%] ${event.message}${detail}`);
    };

    // 📦 分析缓存：检查内容是否变化，命中则跳过 Agent 1+2
    let analysisResult: { plot: any; characters: any[] };
    const hashSSE = contentHash(novel.content);

    if (!forceReanalyzeSSE) {
      const cached = await getCachedAnalysis(req.params.id);
      if (cached) {
        console.log(`  ⚡ 分析缓存命中！跳过 Agent 1+2，直接进入剧本生成`);
        analysisResult = cached;
        onProgress({ stage: "analyze", progress: 100, message: "⚡ 分析缓存命中，跳过重复分析", detail: "内容未变化，使用已有结果" });
      }
    }

    if (!analysisResult!) {
      // 缓存未命中 → 执行完整分析
      // 1. 分析阶段
      await prisma.novel.update({ where: { id: req.params.id }, data: { status: "analyzing" } });
      onProgress({ stage: "analyze", progress: 0, message: "🚀 启动分析流水线..." });

      analysisResult = await runAnalysisPipeline(novel.content, onProgress);
      if (aborted) return;

      await prisma.novel.update({
        where: { id: req.params.id },
        data: { status: "analyzed", analysis: JSON.stringify(analysisResult.plot), contentHash: hashSSE },
      });

      // 存储角色（保留用户在人设实验室中配置的语言风格包）
      const oldCharsSSE = await prisma.character.findMany({
        where: { novelId: req.params.id },
        select: { name: true, speechStyle: true },
      });
      const speechStyleMapSSE = new Map<string, string>();
      for (const c of oldCharsSSE) {
        if (c.speechStyle && c.speechStyle !== "{}") speechStyleMapSSE.set(c.name, c.speechStyle);
      }

    await prisma.character.deleteMany({ where: { novelId: req.params.id } });
    if (analysisResult.characters.length > 0) {
      await prisma.character.createMany({
        data: analysisResult.characters.map((c) => ({
          novelId: req.params.id,
          name: c.name,
          aliases: JSON.stringify(c.aliases || []),
          roleType: c.roleType || "配角",
          traits: JSON.stringify(c.traits || {}),
        })),
      });

      // 恢复用户配置的语言风格包
      if (speechStyleMapSSE.size > 0) {
        const newCharsSSE = await prisma.character.findMany({
          where: { novelId: req.params.id },
          select: { id: true, name: true },
        });
        for (const c of newCharsSSE) {
          const saved = speechStyleMapSSE.get(c.name);
          if (saved) {
            await prisma.character.update({
              where: { id: c.id },
              data: { speechStyle: saved },
            });
          }
        }
      }
    }
    } // end if (!analysisResult!) — 缓存未命中分支

    // 2. 场景生成阶段（从数据库重新获取角色以包含 speechStyle）
    const dbCharsSSE = await prisma.character.findMany({
      where: { novelId: req.params.id },
    });
    const charsWithStyleSSE = dbCharsSSE.map((c) => ({
      name: c.name,
      roleType: c.roleType,
      traits: JSON.parse(c.traits || "{}"),
      speechStyle: JSON.parse(c.speechStyle || "{}"),
    }));
    const scriptResult = await runScriptGenerationPipeline(
      novel.content,
      charsWithStyleSSE,
      onProgress
    );
    if (aborted) return;

    // 3. 保存到数据库（锁保护）
    onProgress({ stage: "save", progress: 96, message: "💾 正在保存到数据库..." });

    const lockedScenesSSE = await prisma.scene.findMany({
      where: { novelId: req.params.id, isLocked: true },
      select: { sceneNum: true },
    });
    const lockedNumsSSE = lockedScenesSSE.map((s) => s.sceneNum);

    // 仅删除未锁定场景
    await prisma.scene.deleteMany({
      where: { novelId: req.params.id, isLocked: false },
    });

    let skippedLockedSSE = 0;
    for (const scene of scriptResult.scenes) {
      if (lockedNumsSSE.includes(scene.sceneNum)) {
        skippedLockedSSE++;
        console.log(`  🔒 场景 ${scene.sceneNum} 已锁定，跳过`);
        continue;
      }
      const created = await prisma.scene.create({
        data: {
          novelId: req.params.id,
          sceneNum: scene.sceneNum,
          location: scene.location,
          timeOfDay: scene.timeOfDay,
        },
      });
      const script = scriptResult.scripts.find((s) => s.sceneNum === scene.sceneNum);
      if (script) {
        const newScript = await prisma.script.create({
          data: { sceneId: created.id, yamlContent: script.scriptYaml, createdBy: "system" },
        });
        await prisma.scene.update({
          where: { id: created.id },
          data: { currentVersionId: newScript.id },
        });
      }
    }

    await prisma.novel.update({ where: { id: req.params.id }, data: { status: "completed" } });

    onProgress({
      stage: "done",
      progress: 100,
      message: "✅ 全部完成！",
      detail: `${analysisResult.characters.length} 个角色，${scriptResult.scenes.length} 个场景`,
      stats: {
        characters: analysisResult.characters.length,
        scenes: scriptResult.scenes.length,
      },
    });

    console.log(`✅ SSE 流水线完成: ${novel.title}`);
    res.end();

  } catch (err: any) {
    console.error("SSE 流水线失败:", err.message);
    if (!aborted) {
      sendEvent({ stage: "error", progress: 0, message: err.message });
    }
    await prisma.novel.update({
      where: { id: req.params.id },
      data: { status: "draft" },
    }).catch(() => {});
    res.end();
  }
});

// --- 🆕 依赖图谱 + 增量重算 ---

app.post("/api/novels/:id/build-deps", async (req, res) => {
  try {
    const { buildDependencyGraph } = await import("./services/dependency.service");
    const result = await buildDependencyGraph(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/novels/:id/impact-analysis", async (req, res) => {
  try {
    const { changedSceneNums, minWeight } = req.body;
    if (!changedSceneNums || !Array.isArray(changedSceneNums)) {
      return res.status(400).json({ error: "请提供 changedSceneNums 数组" });
    }
    const { analyzeImpact } = await import("./services/dependency.service");
    const result = await analyzeImpact(req.params.id, changedSceneNums, minWeight ?? 0);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 检查依赖图状态（避免重复 AI 调用）
app.get("/api/novels/:id/deps-status", async (req, res) => {
  try {
    const { getDepsStatus } = await import("./services/dependency.service");
    const result = await getDepsStatus(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 检测变更场景（含手动编辑版本的场景）
app.get("/api/novels/:id/changed-scenes", async (req, res) => {
  try {
    const { getChangedScenes } = await import("./services/dependency.service");
    const scenes = await getChangedScenes(req.params.id);
    res.json({ scenes });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/novels/:id/incremental-pipeline", async (req, res) => {
  try {
    const { sceneNums } = req.body;
    if (!sceneNums || !Array.isArray(sceneNums) || sceneNums.length === 0) {
      return res.status(400).json({ error: "请提供需要重新生成的场景编号数组" });
    }

    const novel = await prisma.novel.findUnique({
      where: { id: req.params.id },
      include: { characters: true },
    });
    if (!novel) return res.status(404).json({ error: "小说不存在" });

    const { writeScriptWithRetry } = await import("./services/ai.service");

    // 获取指定场景（含剧本内容用于提取在场景角色）
    const targetScenes = await prisma.scene.findMany({
      where: {
        novelId: req.params.id,
        sceneNum: { in: sceneNums },
        isLocked: false,
      },
      orderBy: { sceneNum: "asc" },
      include: { scripts: { orderBy: { version: "desc" }, take: 1 } },
    });

    const characters = novel.characters.map((c) => ({
      name: c.name,
      roleType: c.roleType,
      traits: JSON.parse(c.traits || "{}"),
    }));

    console.log(`🔄 增量重算: ${targetScenes.length} 个场景 (${sceneNums.join(", ")})`);

    const results: any[] = [];
    for (const scene of targetScenes) {
      // 从场景已有剧本中提取出场角色名，精确匹配
      const scriptContent = scene.scripts[0]?.yamlContent || "";
      const sceneChars = characters.filter((c) =>
        scriptContent.includes(c.name)
      );
      // fallback: 若未能匹配到任何角色，使用主角+反派（通常场景核心角色）
      if (sceneChars.length === 0) {
        const coreChars = characters.filter(
          (c) => c.roleType === "主角" || c.roleType === "反派"
        );
        sceneChars.push(...coreChars.slice(0, 3));
      }
      // 限制最大角色数以控制 token 消耗
      const charsForAI = sceneChars.slice(0, 5);

      console.log(`  ✍️ 增量生成场景 ${scene.sceneNum}... (${charsForAI.map(c => c.name).join(", ") || "无匹配角色"})`);
      const { scriptJson, validated } = await writeScriptWithRetry(
        { sceneNum: scene.sceneNum, location: scene.location, timeOfDay: scene.timeOfDay },
        charsForAI.length > 0 ? charsForAI : characters.slice(0, 2)
      );

      const newScriptContent = scriptJson;

      // 获取最新版本号
      const latest = await prisma.script.findFirst({
        where: { sceneId: scene.id },
        orderBy: { version: "desc" },
      });
      const nextVersion = (latest?.version || 0) + 1;

      const newScript = await prisma.script.create({
        data: {
          sceneId: scene.id,
          yamlContent: newScriptContent,
          version: nextVersion,
          createdBy: "system",
          parentVersionId: latest?.id || null,
        },
      });

      await prisma.scene.update({
        where: { id: scene.id },
        data: { currentVersionId: newScript.id },
      });

      results.push({ sceneNum: scene.sceneNum, version: nextVersion });
      console.log(`  ✅ 场景 ${scene.sceneNum} → v${nextVersion}`);
    }

    res.json({
      regenerated: results.length,
      scenes: results,
      skippedLocked: sceneNums.length - targetScenes.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 增量管道 SSE 流式版（带进度推送）
app.get("/api/novels/:id/incremental-pipeline-stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const sendEvent = (event: any) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  let aborted = false;
  req.on("close", () => { aborted = true; });

  try {
    const sceneNumsRaw = req.query.sceneNums as string;
    if (!sceneNumsRaw) {
      sendEvent({ stage: "error", message: "请提供 sceneNums 参数" });
      return res.end();
    }
    const sceneNums = sceneNumsRaw.split(",").map(Number).filter((n) => !isNaN(n));
    if (sceneNums.length === 0) {
      sendEvent({ stage: "error", message: "sceneNums 格式错误" });
      return res.end();
    }

    const novel = await prisma.novel.findUnique({
      where: { id: req.params.id },
      include: { characters: true },
    });
    if (!novel) {
      sendEvent({ stage: "error", message: "小说不存在" });
      return res.end();
    }

    const { writeScriptWithRetry } = await import("./services/ai.service");

    const targetScenes = await prisma.scene.findMany({
      where: { novelId: req.params.id, sceneNum: { in: sceneNums }, isLocked: false },
      orderBy: { sceneNum: "asc" },
      include: { scripts: { orderBy: { version: "desc" }, take: 1 } },
    });

    const characters = novel.characters.map((c) => ({
      name: c.name,
      roleType: c.roleType,
      traits: JSON.parse(c.traits || "{}"),
    }));

    const total = targetScenes.length;
    let completed = 0;

    for (const scene of targetScenes) {
      if (aborted) break;

      sendEvent({
        stage: "scene_start",
        current: completed,
        total,
        sceneNum: scene.sceneNum,
        message: `✍️ 正在生成场景 ${scene.sceneNum}... (${completed + 1}/${total})`,
      });

      try {
        const scriptContent = scene.scripts[0]?.yamlContent || "";
        const sceneChars = characters.filter((c) => scriptContent.includes(c.name));
        if (sceneChars.length === 0) {
          const coreChars = characters.filter((c) => c.roleType === "主角" || c.roleType === "反派");
          sceneChars.push(...coreChars.slice(0, 3));
        }
        const charsForAI = sceneChars.slice(0, 5);

        const { scriptJson, validated } = await writeScriptWithRetry(
          { sceneNum: scene.sceneNum, location: scene.location, timeOfDay: scene.timeOfDay },
          charsForAI.length > 0 ? charsForAI : characters.slice(0, 2)
        );
        const newScriptContent = scriptJson;

        const latest = await prisma.script.findFirst({
          where: { sceneId: scene.id },
          orderBy: { version: "desc" },
        });
        const nextVersion = (latest?.version || 0) + 1;

        const newScript = await prisma.script.create({
          data: {
            sceneId: scene.id,
            yamlContent: newScriptContent,
            version: nextVersion,
            createdBy: "system",
            parentVersionId: latest?.id || null,
          },
        });

        await prisma.scene.update({
          where: { id: scene.id },
          data: { currentVersionId: newScript.id },
        });

        completed++;
        sendEvent({
          stage: "scene_done",
          current: completed,
          total,
          sceneNum: scene.sceneNum,
          version: nextVersion,
          message: `✅ 场景 ${scene.sceneNum} 完成 → v${nextVersion}`,
        });
        console.log(`  ✅ 场景 ${scene.sceneNum} → v${nextVersion}`);
      } catch (err: any) {
        sendEvent({
          stage: "scene_error",
          current: completed,
          total,
          sceneNum: scene.sceneNum,
          message: `❌ 场景 ${scene.sceneNum} 失败: ${err.message}`,
        });
        console.error(`  ❌ 场景 ${scene.sceneNum} 失败:`, err.message);
      }
    }

    if (!aborted) {
      sendEvent({
        stage: "done",
        current: completed,
        total,
        message: `✅ 增量重算完成！更新了 ${completed} 个场景`,
        detail: `成功 ${completed}/${total}`,
      });
    }
    res.end();
  } catch (err: any) {
    console.error("增量管道 SSE 失败:", err.message);
    if (!aborted) {
      sendEvent({ stage: "error", message: err.message });
    }
    res.end();
  }
});

// --- 🆕 版本管理 + Diff + 回滚 ---

app.get("/api/scenes/:id/versions", async (req, res) => {
  try {
    const versions = await prisma.script.findMany({
      where: { sceneId: req.params.id },
      orderBy: { version: "desc" },
    });
    res.json(versions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/scenes/:id/versions/:versionId", async (req, res) => {
  try {
    const script = await prisma.script.findUnique({ where: { id: req.params.versionId } });
    if (!script) return res.status(404).json({ error: "版本不存在" });
    res.json(script);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/scenes/:id/diff", async (req, res) => {
  try {
    const { v1, v2 } = req.query;
    if (!v1 || !v2) return res.status(400).json({ error: "请指定 v1 和 v2 版本 ID" });

    const [script1, script2] = await Promise.all([
      prisma.script.findUnique({ where: { id: String(v1) } }),
      prisma.script.findUnique({ where: { id: String(v2) } }),
    ]);

    if (!script1 || !script2) return res.status(404).json({ error: "版本不存在" });

    const { diffYaml } = await import("./services/diff.service");
    const diffs = diffYaml(script1.yamlContent, script2.yamlContent);

    res.json({
      v1: { id: script1.id, version: script1.version, createdAt: script1.createdAt },
      v2: { id: script2.id, version: script2.version, createdAt: script2.createdAt },
      diffs,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/scenes/:id/rollback", async (req, res) => {
  try {
    const { targetVersionId } = req.body;
    if (!targetVersionId) return res.status(400).json({ error: "请指定目标版本 ID" });

    const targetVersion = await prisma.script.findUnique({ where: { id: targetVersionId } });
    if (!targetVersion) return res.status(404).json({ error: "目标版本不存在" });

    // 获取当前最大版本号
    const latest = await prisma.script.findFirst({
      where: { sceneId: req.params.id },
      orderBy: { version: "desc" },
    });
    const nextVersion = (latest?.version || 0) + 1;

    // 复制目标版本内容作为新版本插入（保留审计链）
    const newVersion = await prisma.script.create({
      data: {
        sceneId: req.params.id,
        yamlContent: targetVersion.yamlContent,
        version: nextVersion,
        createdBy: "user",
        parentVersionId: targetVersion.id,
      },
    });

    // 更新场景当前活跃版本
    await prisma.scene.update({
      where: { id: req.params.id },
      data: { currentVersionId: newVersion.id },
    });

    console.log(`🔄 场景 ${req.params.id} 回滚至 v${targetVersion.version} → 新版本 v${nextVersion}`);
    res.json({
      ok: true,
      rolledBackToVersion: targetVersion.version,
      newVersion,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- 🆕 场景 CRUD ---

// 手动创建场景
app.post("/api/novels/:id/scenes", async (req, res) => {
  try {
    const { sceneNum, location, timeOfDay, yamlContent } = req.body;

    if (sceneNum == null || !location || !timeOfDay) {
      return res.status(400).json({ error: "缺少必填字段: sceneNum, location, timeOfDay" });
    }

    // 检测 sceneNum 冲突
    const existing = await prisma.scene.findFirst({
      where: { novelId: req.params.id, sceneNum: Number(sceneNum) },
    });
    if (existing) {
      return res.status(409).json({ error: `场景 ${sceneNum} 已存在，请使用其他编号` });
    }

    // 创建场景
    const scene = await prisma.scene.create({
      data: {
        novelId: req.params.id,
        sceneNum: Number(sceneNum),
        location,
        timeOfDay,
      },
    });

    // 如果提供了剧本内容，创建初始 Script
    if (yamlContent && yamlContent.trim()) {
      const script = await prisma.script.create({
        data: {
          sceneId: scene.id,
          yamlContent: yamlContent.trim(),
          version: 1,
          createdBy: "user",
        },
      });
      await prisma.scene.update({
        where: { id: scene.id },
        data: { currentVersionId: script.id },
      });

      const updated = await prisma.scene.findUnique({
        where: { id: scene.id },
        include: { scripts: true },
      });
      return res.status(201).json(updated);
    }

    res.status(201).json(scene);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 更新场景元数据
app.put("/api/scenes/:id", async (req, res) => {
  try {
    const scene = await prisma.scene.findUnique({ where: { id: req.params.id } });
    if (!scene) return res.status(404).json({ error: "场景不存在" });

    // 锁保护
    if (scene.isLocked) {
      return res.status(423).json({ error: "场景已锁定，请先解锁后再修改" });
    }

    const { sceneNum, location, timeOfDay } = req.body;

    // 如果变更 sceneNum，检查冲突
    if (sceneNum != null && Number(sceneNum) !== scene.sceneNum) {
      const conflict = await prisma.scene.findFirst({
        where: { novelId: scene.novelId, sceneNum: Number(sceneNum) },
      });
      if (conflict) {
        return res.status(409).json({ error: `场景 ${sceneNum} 已存在` });
      }
    }

    const updated = await prisma.scene.update({
      where: { id: req.params.id },
      data: {
        ...(sceneNum != null && { sceneNum: Number(sceneNum) }),
        ...(location != null && { location }),
        ...(timeOfDay != null && { timeOfDay }),
      },
    });

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 删除场景
app.delete("/api/scenes/:id", async (req, res) => {
  try {
    const scene = await prisma.scene.findUnique({ where: { id: req.params.id } });
    if (!scene) return res.status(404).json({ error: "场景不存在" });

    // 锁保护
    const force = req.query.force === "true";
    if (scene.isLocked && !force) {
      return res.status(423).json({ error: "场景已锁定，请先解锁或使用 force=true 强制删除" });
    }

    await prisma.scene.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 编辑剧本（创建新版本）
app.put("/api/scripts/:id", async (req, res) => {
  try {
    const { yamlContent } = req.body;
    if (!yamlContent || !yamlContent.trim()) {
      return res.status(400).json({ error: "缺少 yamlContent" });
    }

    const currentScript = await prisma.script.findUnique({
      where: { id: req.params.id },
      include: { scene: true },
    });
    if (!currentScript) return res.status(404).json({ error: "剧本不存在" });

    // 获取最新版本号
    const latest = await prisma.script.findFirst({
      where: { sceneId: currentScript.sceneId },
      orderBy: { version: "desc" },
    });
    const nextVersion = (latest?.version || 0) + 1;

    // 创建新版本（版本链模式）
    const newScript = await prisma.script.create({
      data: {
        sceneId: currentScript.sceneId,
        yamlContent: yamlContent.trim(),
        version: nextVersion,
        createdBy: "user",
        parentVersionId: currentScript.id,
      },
    });

    // 更新场景当前活跃版本
    await prisma.scene.update({
      where: { id: currentScript.sceneId },
      data: { currentVersionId: newScript.id },
    });

    console.log(`✏️ 手动编辑剧本: 场景 ${currentScript.scene.location} → v${nextVersion}`);
    res.json(newScript);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- 🆕 场景锁定/解锁 ---

app.put("/api/scenes/:id/lock", async (req, res) => {
  try {
    const scene = await prisma.scene.update({
      where: { id: req.params.id },
      data: { isLocked: true, lockedBy: "local-editor" },
    });
    res.json({ ok: true, isLocked: true, lockedBy: scene.lockedBy });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/scenes/:id/unlock", async (req, res) => {
  try {
    const scene = await prisma.scene.update({
      where: { id: req.params.id },
      data: { isLocked: false, lockedBy: null },
    });
    res.json({ ok: true, isLocked: false });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- 🆕 注记 CRUD ---

app.get("/api/novels/:id/annotations", async (req, res) => {
  try {
    const annotations = await prisma.annotation.findMany({
      where: { novelId: req.params.id },
      orderBy: { createdAt: "desc" },
    });
    res.json(annotations);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/annotations", async (req, res) => {
  try {
    const { novelId, targetType, targetId, content, type, authorName, blockIndex } = req.body;
    const annotation = await prisma.annotation.create({
      data: {
        novelId,
        targetType,
        targetId,
        content,
        type: type || "note",
        authorName: authorName || "匿名",
        blockIndex: blockIndex ?? null,
      },
    });
    res.status(201).json(annotation);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/annotations/:id", async (req, res) => {
  try {
    const { content, type, resolved, authorName, blockIndex } = req.body;
    const data: any = {};
    if (content !== undefined) data.content = content;
    if (type !== undefined) data.type = type;
    if (resolved !== undefined) data.resolved = resolved;
    if (authorName !== undefined) data.authorName = authorName;
    if (blockIndex !== undefined) data.blockIndex = blockIndex;

    const annotation = await prisma.annotation.update({
      where: { id: req.params.id },
      data,
    });
    res.json(annotation);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 场景级注记查询（含 block 级行内评论）
app.get("/api/scenes/:id/annotations", async (req, res) => {
  try {
    const scene = await prisma.scene.findUnique({ where: { id: req.params.id } });
    if (!scene) return res.status(404).json({ error: "场景不存在" });

    const annotations = await prisma.annotation.findMany({
      where: {
        novelId: scene.novelId,
        targetId: { startsWith: req.params.id },
      },
      orderBy: [{ blockIndex: "asc" }, { createdAt: "asc" }],
    });
    res.json(annotations);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/annotations/:id", async (req, res) => {
  try {
    await prisma.annotation.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- 🆕 项目模板系统 ---

interface ProjectTemplate {
  id: string;
  name: string;
  icon: string;
  description: string;
  genre: string;
  systemPrompt: string;
  temperature: number;
  answerStyle: string;
  roleTypePreferences: string[];
  defaultSceneTypes: string[];
}

const TEMPLATES: ProjectTemplate[] = [
  {
    id: "ancient",
    name: "古装",
    icon: "🏯",
    description: "古代宫廷、武侠江湖题材，适合古装言情、权谋、仙侠小说",
    genre: "古装",
    systemPrompt: `你是一位资深的古装剧编剧顾问。你精通：
- 古代礼仪与宫廷文化
- 武侠门派体系与江湖规矩
- 仙侠世界观构建
- 古代官职体系与科举制度
- 文言文与现代对白的平衡

在帮助用户改编古装小说时，你会：
1. 关注角色服饰、礼仪、称谓是否符合朝代背景
2. 建议场景中的古代建筑、器物描写
3. 对白中适当融入古风词汇但不过度文言化
4. 注意武侠/仙侠打斗场景的节奏与画面感`,
    temperature: 0.7,
    answerStyle: "teaching",
    roleTypePreferences: ["主角", "主角", "配角", "反派", "路人"],
    defaultSceneTypes: ["宫殿", "府邸", "街道", "战场", "密室", "山林", "客栈"],
  },
  {
    id: "urban",
    name: "都市",
    icon: "🏙️",
    description: "现代都市生活、职场、爱情题材",
    genre: "都市",
    systemPrompt: `你是一位资深的都市剧编剧顾问。你擅长：
- 现代职场生态与行业细节
- 都市情感关系的细腻刻画
- 快节奏叙事的节奏掌控
- 现实主义题材的社会议题探讨

在帮助用户改编都市小说时，你会：
1. 建议场景选取最具都市感的真实地点
2. 对白设计注重自然、生活化但有戏剧张力
3. 关注当代社会议题与现实困境的真实呈现
4. 情感线需要层次分明、起伏有致`,
    temperature: 0.6,
    answerStyle: "concise",
    roleTypePreferences: ["主角", "配角", "反派", "路人"],
    defaultSceneTypes: ["办公室", "公寓", "咖啡厅", "街道", "商场", "医院", "学校"],
  },
  {
    id: "mystery",
    name: "悬疑",
    icon: "🔍",
    description: "悬疑推理、犯罪探案、心理惊悚题材",
    genre: "悬疑",
    systemPrompt: `你是一位资深的悬疑剧编剧顾问。你精通：
- 悬疑故事的伏笔设计（契诃夫之枪原则）
- 推理线索的合理铺设与误导技巧
- 犯罪心理与行为分析
- 非线性叙事（闪回、多视角）技巧
- 反转设计的戏剧张力

在帮助用户改编悬疑小说时，你会：
1. 确保每个线索在场景中有明确归属
2. 建议在关键场景制造信息不对称
3. 节奏控制：缓慢铺垫→紧张升级→爆点释放
4. 角色对白中埋设暗示但不暴露谜底`,
    temperature: 0.5,
    answerStyle: "strict",
    roleTypePreferences: ["主角", "反派", "配角", "路人"],
    defaultSceneTypes: ["案发现场", "警局", "住宅", "街道", "审讯室", "医院", "废弃建筑"],
  },
  {
    id: "scifi",
    name: "科幻",
    icon: "🚀",
    description: "科幻未来、人工智能、太空探索、赛博朋克题材",
    genre: "科幻",
    systemPrompt: `你是一位资深的科幻剧编剧顾问。你擅长：
- 科幻世界观的逻辑自洽构建
- 未来科技的社会影响推演
- AI/机器人伦理议题
- 太空探索与外星文明的合理想象
- 赛博朋克美学与反乌托邦叙事

在帮助用户改编科幻小说时，你会：
1. 确保科技设定前后一致、有合理解释
2. 建议通过场景细节展示世界观（而非大段旁白）
3. 关注科技对人性的影响，而非单纯炫技
4. 视觉化描写要具有电影感`,
    temperature: 0.8,
    answerStyle: "teaching",
    roleTypePreferences: ["主角", "配角", "反派", "路人"],
    defaultSceneTypes: ["太空站", "实验室", "控制中心", "城市街道", "虚拟空间", "飞船", "废土"],
  },
  {
    id: "fantasy",
    name: "奇幻",
    icon: "🧙",
    description: "西方奇幻、魔法世界、异世界冒险题材",
    genre: "奇幻",
    systemPrompt: `你是一位资深的奇幻剧编剧顾问。你精通：
- 魔法体系的世界观构建
- 种族设定（精灵、矮人、龙族等）的戏剧化呈现
- 史诗叙事的宏大结构与个人命运的交织
- 冒险旅程的经典叙事模型

在帮助用户改编奇幻小说时，你会：
1. 魔法战斗场景的视觉化呈现建议
2. 帮助平衡多线叙事的时间分配
3. 奇幻世界观通过角色互动自然展示
4. 角色成长弧线与世界命运的关联`,
    temperature: 0.75,
    answerStyle: "teaching",
    roleTypePreferences: ["主角", "主角", "配角", "反派", "路人", "路人"],
    defaultSceneTypes: ["城堡", "森林", "村庄", "战场", "洞穴", "酒馆", "魔法塔"],
  },
  {
    id: "history",
    name: "历史",
    icon: "📜",
    description: "历史正剧、历史传奇、年代剧题材",
    genre: "历史",
    systemPrompt: `你是一位资深的历史剧编剧顾问。你精通：
- 中国各朝代的历史背景与重大事件
- 历史人物的性格塑造与戏剧化改编
- 历史真实与艺术创作的平衡
- 年代感的场景与道具设计

在帮助用户改编历史小说时，你会：
1. 指出小说中与史实不符之处，建议如何艺术化处理
2. 帮助设计符合时代背景的礼仪、称谓、服饰
3. 大场面（战争、朝会、祭祀）的影视化建议
4. 历史人物的对白需兼顾时代感与现代观众理解`,
    temperature: 0.6,
    answerStyle: "strict",
    roleTypePreferences: ["主角", "配角", "配角", "反派", "路人"],
    defaultSceneTypes: ["宫殿", "朝堂", "战场", "府邸", "市集", "书房", "军营"],
  },
  {
    id: "romance",
    name: "言情",
    icon: "💕",
    description: "现代/古代言情、青春校园、都市爱情题材",
    genre: "言情",
    systemPrompt: `你是一位资深的言情剧编剧顾问。你擅长：
- 情感线的情感层次设计（初识→暧昧→升温→冲突→和解/遗憾）
- 角色关系的化学反应与对白设计
- 浪漫场景的视觉化呈现
- 青春校园/都市爱情的细腻质感

在帮助用户改编言情小说时，你会：
1. 重点设计男女主的关键对白场景
2. 建议通过细节动作、微表情传达情感
3. 冲突设计需要基于角色性格而非误会巧合
4. 浪漫场景的氛围营造建议（光线、场景、配乐）`,
    temperature: 0.7,
    answerStyle: "teaching",
    roleTypePreferences: ["主角", "主角", "配角", "路人"],
    defaultSceneTypes: ["住宅", "咖啡厅", "校园", "公园", "餐厅", "街道", "办公室"],
  },
  {
    id: "general",
    name: "通用",
    icon: "📝",
    description: "通用模板，适用于所有类型的小说改编",
    genre: "通用",
    systemPrompt: `你是一位专业的影视编剧顾问。你帮助作者将小说改编为剧本。

你的核心能力：
1. 分析小说剧情结构，提取核心冲突与情感线
2. 帮助设计场景切分与对白改编
3. 提供角色塑造建议
4. 解答剧本创作相关问题

在回答时注意：
- 先从整体结构分析，再进入具体细节
- 给出具体可操作的建议，而非泛泛而谈
- 尊重原作的风格和作者的创作意图
- 如需了解小说内容，可以主动询问`,
    temperature: 0.65,
    answerStyle: "teaching",
    roleTypePreferences: ["主角", "配角", "反派"],
    defaultSceneTypes: ["通用场景"],
  },
];

// 获取所有模板（脱敏：不返回完整 systemPrompt，仅摘要）
app.get("/api/templates", async (_req, res) => {
  try {
    const templates = TEMPLATES.map(({ systemPrompt, ...rest }) => ({
      ...rest,
      promptPreview: systemPrompt.split("\n").slice(0, 3).join("\n"),
    }));
    res.json(templates);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 获取单个模板详情（含完整 systemPrompt）
app.get("/api/templates/:id", async (req, res) => {
  try {
    const template = TEMPLATES.find((t) => t.id === req.params.id);
    if (!template) return res.status(404).json({ error: "模板不存在" });
    res.json(template);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- 🆕 AI 对话系统 ---

// 获取会话列表
app.get("/api/chat/conversations", async (req, res) => {
  try {
    const { novelId } = req.query;
    const where: any = { status: "active" };
    if (novelId) where.novelId = String(novelId);

    const conversations = await prisma.chatConversation.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { messages: true } } },
    });
    res.json(conversations);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 创建新会话
app.post("/api/chat/conversations", async (req, res) => {
  try {
    const { novelId, title, mode } = req.body;
    const conversation = await prisma.chatConversation.create({
      data: {
        novelId: novelId || null,
        title: title || "新对话",
        mode: mode || "general",
      },
    });
    res.status(201).json(conversation);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 获取会话消息
app.get("/api/chat/conversations/:id/messages", async (req, res) => {
  try {
    const messages = await prisma.chatMessage.findMany({
      where: { conversationId: req.params.id },
      orderBy: { createdAt: "asc" },
    });
    res.json(messages);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 删除会话
app.delete("/api/chat/conversations/:id", async (req, res) => {
  try {
    await prisma.chatConversation.update({
      where: { id: req.params.id },
      data: { status: "deleted" },
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 聊天接口（普通 JSON 响应，可靠稳定）
app.post("/api/chat/stream", async (req, res) => {
  try {
    const { conversationId, novelId, message, templateId } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "消息不能为空" });
    }

    // 获取或创建会话
    let conversation;
    if (conversationId) {
      conversation = await prisma.chatConversation.findUnique({
        where: { id: conversationId },
      });
      if (!conversation) return res.status(404).json({ error: "会话不存在" });
    } else {
      const title = message.trim().substring(0, 40) + (message.length > 40 ? "..." : "");
      conversation = await prisma.chatConversation.create({
        data: {
          novelId: novelId || null,
          title,
          mode: templateId ? "template" : "general",
        },
      });
    }

    // 获取历史消息（仅保留最近 3 轮=6 条）
    const existingMessages = await prisma.chatMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
      take: 6,
    });

    // 构建精简 system prompt
    const template = templateId
      ? TEMPLATES.find((t) => t.id === templateId)
      : null;
    const genreName = template?.name || "通用";
    const temperature = template?.temperature ?? 0.65;

    let systemPrompt = `你是 NovaScriptTool 的 AI 编剧助手（${genreName}方向）。简洁专业地回答用户关于小说改编剧本的问题。回答控制在 200 字以内，点到即止。`;

    // 如果有关联小说，直接送原文片段
    if (novelId) {
      const novel = await prisma.novel.findUnique({
        where: { id: novelId },
        include: { characters: { take: 8 } },
      });
      if (novel) {
        const chars = novel.characters.map((c) => `${c.name}(${c.roleType})`).join("、");
        const contentExcerpt = novel.content.substring(0, 3000);
        systemPrompt += `\n小说《${novel.title}》(${novel.content.length}字)，角色：${chars || "暂无"}。\n原文片段：\n${contentExcerpt}${novel.content.length > 3000 ? "\n…(后续内容省略)" : ""}`;
      }
    }

    // 构建消息列表
    const llmMessages: { role: string; content: string }[] = [
      { role: "system", content: systemPrompt },
    ];
    for (const msg of existingMessages) {
      llmMessages.push({ role: msg.role, content: msg.content });
    }
    llmMessages.push({ role: "user", content: message });

    // 保存用户消息
    const userMsg = await prisma.chatMessage.create({
      data: { conversationId: conversation.id, role: "user", content: message },
    });

    // 调用 DeepSeek API
    console.log("[chat] Calling DeepSeek...");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    const deepseekRes = await fetch(
      `${process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1"}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
          messages: llmMessages,
          temperature,
          max_tokens: 1024,
          stream: false,
        }),
        signal: controller.signal,
      }
    );
    clearTimeout(timeoutId);

    if (!deepseekRes.ok) {
      const errText = await deepseekRes.text();
      console.error("[chat] DeepSeek error:", deepseekRes.status, errText.substring(0, 200));
      return res.status(502).json({ error: `AI 服务异常 (${deepseekRes.status})` });
    }

    const data = await deepseekRes.json() as any;
    const assistantContent = data.choices?.[0]?.message?.content || "";
    console.log("[chat] Response:", assistantContent.length, "chars");

    // 保存助手回复
    const assistantMsg = await prisma.chatMessage.create({
      data: { conversationId: conversation.id, role: "assistant", content: assistantContent },
    });
    await prisma.chatConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    // 返回完整结果
    res.json({
      conversationId: conversation.id,
      userMessage: userMsg,
      assistantMessage: assistantMsg,
    });
  } catch (err: any) {
    console.error("Chat error:", err.message);
    res.status(500).json({ error: err.message || "AI 请求失败" });
  }
});

// ─── 并发控制与任务队列 API ─────────────────────────────────

/** 获取队列全局状态 */
app.get("/api/queue/status", (_req, res) => {
  const status = jobQueue.getStatus();
  res.json(status);
});

/** 全局队列状态 SSE 流 — 前端可订阅实时队列变化 */
app.get("/api/queue/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const unsubscribe = jobQueue.subscribeQueue((event, data) => {
    res.write(`event: ${event}\ndata: ${data}\n\n`);
  });

  req.on("close", () => {
    unsubscribe();
  });
});

/** 订阅特定任务的进度 SSE 流 */
app.get("/api/queue/:jobId/stream", (req, res) => {
  const { jobId } = req.params;

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // 检查任务是否存在
  const job = jobQueue.getJob(jobId);
  if (!job) {
    res.write(`event: error\ndata: ${JSON.stringify({ message: "任务不存在或已过期" })}\n\n`);
    return res.end();
  }

  // 如果任务已完成，直接推送结果
  if (job.status === "completed") {
    res.write(`event: completed\ndata: ${JSON.stringify({ jobId, result: "ok" })}\n\n`);
    return res.end();
  }
  if (job.status === "failed") {
    res.write(`event: failed\ndata: ${JSON.stringify({ jobId, error: job.error })}\n\n`);
    return res.end();
  }

  const unsubscribe = jobQueue.subscribeJob(jobId, (event, data) => {
    res.write(`event: ${event}\ndata: ${data}\n\n`);
  });

  req.on("close", () => {
    unsubscribe();
  });
});

/** 获取特定任务状态 */
app.get("/api/queue/:jobId", (req, res) => {
  const job = jobQueue.getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: "任务不存在或已过期" });
  res.json(job);
});

/** 取消排队中的任务 */
app.post("/api/queue/:jobId/cancel", (req, res) => {
  const success = jobQueue.cancelJob(req.params.jobId);
  if (success) {
    res.json({ success: true, message: "任务已取消" });
  } else {
    res.status(400).json({ success: false, error: "无法取消该任务（可能正在执行或不存在）" });
  }
});

/** 更新队列配置（运行时调整并发数等） */
app.put("/api/queue/config", (req, res) => {
  const { maxConcurrency, rateLimitPerMinute } = req.body;
  const config: any = {};
  if (maxConcurrency != null) config.maxConcurrency = Math.max(1, Math.min(8, Number(maxConcurrency)));
  if (rateLimitPerMinute != null) config.rateLimitPerMinute = Math.max(1, Math.min(60, Number(rateLimitPerMinute)));
  jobQueue.updateConfig(config);
  res.json({ success: true, config: jobQueue.getStatus() });
});

console.log("✅ 并发任务队列已初始化 (maxConcurrency=2, jobTimeout=10min, rateLimit=10/min)");

// ─── 队列化流水线端点 ──────────────────────────────────────

/**
 * 队列化一键流水线 (Agent 1→2→3→4)
 * POST /api/novels/:id/pipeline/queue
 * 立即返回 jobId，前端通过 GET /api/queue/:jobId/stream 订阅进度
 */
app.post("/api/novels/:id/pipeline/queue", async (req, res) => {
  try {
    const novel = await prisma.novel.findUnique({ where: { id: req.params.id } });
    if (!novel) return res.status(404).json({ error: "小说不存在" });
    if (!novel.content || novel.content.trim().length < 50) {
      return res.status(400).json({ error: "小说内容过短" });
    }

    const novelId = novel.id;
    const novelTitle = novel.title;
    const novelContent = novel.content;

    // 提交到队列
    const { jobId, position } = jobQueue.enqueue(
      novelId,
      novelTitle,
      "pipeline",
      async (onProgress) => {
        const { runAnalysisPipeline, runScriptGenerationPipeline } = await import("./services/ai.service");

        // 📦 分析缓存检查
        let analysisResultQ: { plot: any; characters: any[] };
        const hashQ = contentHash(novelContent);
        const cachedQ = await getCachedAnalysis(novelId);
        if (cachedQ) {
          console.log(`  ⚡ [Queue] 分析缓存命中！跳过 Agent 1+2`);
          analysisResultQ = cachedQ;
          onProgress({ stage: "analyze", progress: 100, message: "⚡ 分析缓存命中，跳过重复分析" });
        }

        if (!analysisResultQ!) {
        // Phase 1: 分析
        await prisma.novel.update({ where: { id: novelId }, data: { status: "analyzing" } });
        onProgress({ stage: "analyze", progress: 0, message: "🚀 启动分析流水线..." });

        const analysisResult = await runAnalysisPipeline(novelContent, onProgress);
        analysisResultQ = analysisResult;

        await prisma.novel.update({
          where: { id: novelId },
          data: { status: "analyzed", analysis: JSON.stringify(analysisResult.plot), contentHash: hashQ },
        });

        // 存储角色（保留用户在人设实验室中配置的语言风格包）
        const oldCharsQ = await prisma.character.findMany({
          where: { novelId },
          select: { name: true, speechStyle: true },
        });
        const speechStyleMapQ = new Map<string, string>();
        for (const c of oldCharsQ) {
          if (c.speechStyle && c.speechStyle !== "{}") speechStyleMapQ.set(c.name, c.speechStyle);
        }

        await prisma.character.deleteMany({ where: { novelId } });
        if (analysisResultQ.characters.length > 0) {
          await prisma.character.createMany({
            data: analysisResultQ.characters.map((c) => ({
              novelId,
              name: c.name,
              aliases: JSON.stringify(c.aliases || []),
              roleType: c.roleType || "配角",
              traits: JSON.stringify(c.traits || {}),
            })),
          });

          // 恢复用户配置的语言风格包
          if (speechStyleMapQ.size > 0) {
            const newCharsQ = await prisma.character.findMany({
              where: { novelId },
              select: { id: true, name: true },
            });
            for (const c of newCharsQ) {
              const saved = speechStyleMapQ.get(c.name);
              if (saved) {
                await prisma.character.update({
                  where: { id: c.id },
                  data: { speechStyle: saved },
                });
              }
            }
          }
        }
        } // end if (!analysisResultQ!) — 缓存未命中分支

        // Phase 2: 生成剧本（从数据库重新获取角色以包含 speechStyle）
        onProgress({ stage: "generate", progress: 50, message: "🎬 启动场景规划与剧本生成..." });
        const dbCharsQ = await prisma.character.findMany({ where: { novelId } });
        const charsWithStyleQ = dbCharsQ.map((c) => ({
          name: c.name,
          roleType: c.roleType,
          traits: JSON.parse(c.traits || "{}"),
          speechStyle: JSON.parse(c.speechStyle || "{}"),
        }));
        const scriptResult = await runScriptGenerationPipeline(
          novelContent,
          charsWithStyleQ,
          onProgress
        );

        // 仅删除未锁定场景
        const lockedScenes = await prisma.scene.findMany({
          where: { novelId, isLocked: true },
          select: { sceneNum: true },
        });
        const lockedNums = lockedScenes.map((s) => s.sceneNum);

        await prisma.scene.deleteMany({
          where: { novelId, isLocked: false },
        });

        let skippedLocked = 0;
        for (const scene of scriptResult.scenes) {
          if (lockedNums.includes(scene.sceneNum)) {
            skippedLocked++;
            continue;
          }
          const created = await prisma.scene.create({
            data: { novelId, sceneNum: scene.sceneNum, location: scene.location, timeOfDay: scene.timeOfDay },
          });
          const script = scriptResult.scripts.find((s) => s.sceneNum === scene.sceneNum);
          if (script) {
            const newScript = await prisma.script.create({
              data: { sceneId: created.id, yamlContent: script.scriptYaml, createdBy: "system" },
            });
            await prisma.scene.update({
              where: { id: created.id },
              data: { currentVersionId: newScript.id },
            });
          }
        }

        await prisma.novel.update({ where: { id: novelId }, data: { status: "completed" } });

        return {
          plot: analysisResult.plot,
          characters: analysisResult.characters,
          scenes: scriptResult.scenes,
          scripts: scriptResult.scripts,
          stats: {
            characters: analysisResult.characters.length,
            scenes: scriptResult.scenes.length,
            lockedSkipped: skippedLocked,
          },
        };
      }
    );

    res.json({
      jobId,
      position,
      status: "queued",
      message: position === 0
        ? "任务已开始执行"
        : `任务已加入队列，前面还有 ${position - 1} 个任务`,
    });
  } catch (err: any) {
    res.status(err.message.includes("队列已满") ? 503 : 500).json({ error: err.message });
  }
});

/**
 * 队列化增量重算
 * POST /api/novels/:id/incremental-pipeline/queue
 */
app.post("/api/novels/:id/incremental-pipeline/queue", async (req, res) => {
  try {
    const { sceneNums } = req.body;
    if (!sceneNums || !Array.isArray(sceneNums) || sceneNums.length === 0) {
      return res.status(400).json({ error: "请提供需要重新生成的场景编号数组" });
    }

    const novel = await prisma.novel.findUnique({
      where: { id: req.params.id },
      include: { characters: true },
    });
    if (!novel) return res.status(404).json({ error: "小说不存在" });

    const novelId = novel.id;
    const novelTitle = novel.title;

    const { jobId, position } = jobQueue.enqueue(
      novelId,
      novelTitle,
      "incremental-pipeline",
      async (onProgress) => {
        const { writeScriptWithRetry } = await import("./services/ai.service");

        const targetScenes = await prisma.scene.findMany({
          where: { novelId, sceneNum: { in: sceneNums }, isLocked: false },
          orderBy: { sceneNum: "asc" },
          include: { scripts: { orderBy: { version: "desc" }, take: 1 } },
        });

        const characters = novel.characters.map((c) => ({
          name: c.name,
          roleType: c.roleType,
          traits: JSON.parse(c.traits || "{}"),
        }));

        const total = targetScenes.length;
        let completed = 0;
        const results: any[] = [];

        for (const scene of targetScenes) {
          onProgress({
            stage: "scene_start",
            current: completed,
            total,
            sceneNum: scene.sceneNum,
            message: `✍️ 正在生成场景 ${scene.sceneNum}... (${completed + 1}/${total})`,
          });

          try {
            const scriptContent = scene.scripts[0]?.yamlContent || "";
            const sceneChars = characters.filter((c) => scriptContent.includes(c.name));
            if (sceneChars.length === 0) {
              const coreChars = characters.filter((c) => c.roleType === "主角" || c.roleType === "反派");
              sceneChars.push(...coreChars.slice(0, 3));
            }
            const charsForAI = sceneChars.slice(0, 5);

            const { scriptJson } = await writeScriptWithRetry(
              { sceneNum: scene.sceneNum, location: scene.location, timeOfDay: scene.timeOfDay },
              charsForAI.length > 0 ? charsForAI : characters.slice(0, 2)
            );

            const latest = await prisma.script.findFirst({
              where: { sceneId: scene.id },
              orderBy: { version: "desc" },
            });
            const nextVersion = (latest?.version || 0) + 1;

            const newScript = await prisma.script.create({
              data: {
                sceneId: scene.id,
                yamlContent: scriptJson,
                version: nextVersion,
                createdBy: "system",
                parentVersionId: latest?.id || null,
              },
            });

            await prisma.scene.update({
              where: { id: scene.id },
              data: { currentVersionId: newScript.id },
            });

            completed++;
            results.push({ sceneNum: scene.sceneNum, version: nextVersion });

            onProgress({
              stage: "scene_done",
              current: completed,
              total,
              sceneNum: scene.sceneNum,
              version: nextVersion,
              message: `✅ 场景 ${scene.sceneNum} 完成 → v${nextVersion}`,
            });
          } catch (err: any) {
            onProgress({
              stage: "scene_error",
              current: completed,
              total,
              sceneNum: scene.sceneNum,
              message: `❌ 场景 ${scene.sceneNum} 失败: ${err.message}`,
            });
          }
        }

        onProgress({
          stage: "done",
          current: completed,
          total,
          message: `✅ 增量重算完成！更新了 ${completed} 个场景`,
          detail: `成功 ${completed}/${total}`,
        });

        return { completed, total, results };
      }
    );

    res.json({
      jobId,
      position,
      status: "queued",
      message: position === 0
        ? "增量重算已开始执行"
        : `增量重算已加入队列，前面还有 ${position - 1} 个任务`,
    });
  } catch (err: any) {
    res.status(err.message.includes("队列已满") ? 503 : 500).json({ error: err.message });
  }
});

// ─── 服务器启动 ─────────────────────────────────────────────

app.listen(PORT, async () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log(`Mimo Model: ${process.env.MIMO_MODEL || "mimo-v2.5"}`);
  console.log(`Database: SQLite (file:./dev.db)`);

  // 异步初始化 FTS5 全文搜索（不阻塞服务器启动）
  initFTS5().catch((err) => console.warn("FTS5 init warning:", err.message));
});

import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { mimoClient, chatCompletion } from "./services/ai.service";
import { cleanText, splitChapters, chunkByChars, analyzeText } from "./utils/text-processor";

const prisma = new PrismaClient();
const app = express();
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

    // 批量创建角色
    if (result.characters.length > 0) {
      // 先删除旧角色
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

    // 解析角色数据
    const characters = novel.characters.map((c) => ({
      name: c.name,
      roleType: c.roleType,
      traits: JSON.parse(c.traits || "{}"),
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

    console.log(`🚀 一键流水线启动: ${novel.title}`);

    // 1. 分析
    await prisma.novel.update({ where: { id: req.params.id }, data: { status: "analyzing" } });
    console.log("📖 阶段 1/2: 剧情分析 + 角色提取");
    const analysisResult = await runAnalysisPipeline(novel.content);

    await prisma.novel.update({
      where: { id: req.params.id },
      data: { status: "analyzed", analysis: JSON.stringify(analysisResult.plot) },
    });

    // 存储角色
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
    }

    // 2. 生成场景剧本（锁保护）
    console.log("🎬 阶段 2/2: 场景规划 + 剧本生成");
    const scriptResult = await runScriptGenerationPipeline(
      novel.content,
      analysisResult.characters.map((c) => ({
        name: c.name,
        roleType: c.roleType,
        traits: c.traits,
      }))
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

// --- YAML 导出 ---

app.get("/api/novels/:id/export", async (req, res) => {
  try {
    const novel = await prisma.novel.findUnique({
      where: { id: req.params.id },
      include: { scenes: { include: { scripts: true }, orderBy: { sceneNum: "asc" } } },
    });
    if (!novel) return res.status(404).json({ error: "小说不存在" });

    // 构建完整 YAML
    let yaml = "";
    yaml += `# ==========================================\n`;
    yaml += `# 剧本: ${novel.title}\n`;
    yaml += `# 生成时间: ${new Date().toISOString()}\n`;
    yaml += `# 场景总数: ${novel.scenes.length}\n`;
    yaml += `# ==========================================\n\n`;

    if (novel.scenes.length === 0) {
      yaml += "# ⚠️ 暂未生成场景剧本，请先运行分析流水线\n";
    }

    for (const scene of novel.scenes) {
      const script = scene.scripts?.[0];
      yaml += `---\n`;
      yaml += `# Scene ${scene.sceneNum}: ${scene.location} | ${scene.timeOfDay}\n`;
      yaml += `scene:\n`;
      yaml += `  number: ${scene.sceneNum}\n`;
      yaml += `  location: "${scene.location}"\n`;
      yaml += `  time_of_day: "${scene.timeOfDay}"\n`;

      if (script) {
        yaml += `\n`;
        yaml += script.yamlContent;
        yaml += `\n`;
      } else {
        yaml += `  script: |\n`;
        yaml += `    # 未生成\n`;
      }
      yaml += `\n`;
    }

    res.setHeader("Content-Type", "text/yaml; charset=utf-8");
    const safeName = novel.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}_%E5%89%A7%E6%9C%AC.yaml`
    );
    res.send(yaml);
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
      // 文件上传模式
      const fs = await import("fs");
      content = fs.readFileSync(req.file.path, "utf-8");
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

    console.log(`🚀 SSE 流水线启动: ${novel.title}`);

    // 统一定义 onProgress，同时写 SSE 和日志
    const onProgress = (event: any) => {
      if (aborted) return;
      sendEvent(event);
      const detail = event.detail ? ` (${event.detail})` : "";
      console.log(`  📡 SSE [${event.progress}%] ${event.message}${detail}`);
    };

    // 1. 分析阶段
    await prisma.novel.update({ where: { id: req.params.id }, data: { status: "analyzing" } });
    onProgress({ stage: "analyze", progress: 0, message: "🚀 启动分析流水线..." });

    const analysisResult = await runAnalysisPipeline(novel.content, onProgress);
    if (aborted) return;

    await prisma.novel.update({
      where: { id: req.params.id },
      data: { status: "analyzed", analysis: JSON.stringify(analysisResult.plot) },
    });

    // 存储角色
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
    }

    // 2. 场景生成阶段
    const scriptResult = await runScriptGenerationPipeline(
      novel.content,
      analysisResult.characters.map((c) => ({
        name: c.name,
        roleType: c.roleType,
        traits: c.traits,
      })),
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
    const { changedSceneNums } = req.body;
    if (!changedSceneNums || !Array.isArray(changedSceneNums)) {
      return res.status(400).json({ error: "请提供 changedSceneNums 数组" });
    }
    const { analyzeImpact } = await import("./services/dependency.service");
    const result = await analyzeImpact(req.params.id, changedSceneNums);
    res.json(result);
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

    const { writeScript } = await import("./services/ai.service");

    // 获取指定场景
    const targetScenes = await prisma.scene.findMany({
      where: {
        novelId: req.params.id,
        sceneNum: { in: sceneNums },
        isLocked: false,
      },
      orderBy: { sceneNum: "asc" },
    });

    const characters = novel.characters.map((c) => ({
      name: c.name,
      roleType: c.roleType,
      traits: JSON.parse(c.traits || "{}"),
    }));

    console.log(`🔄 增量重算: ${targetScenes.length} 个场景 (${sceneNums.join(", ")})`);

    const results: any[] = [];
    for (const scene of targetScenes) {
      const sceneChars = characters.filter((c) =>
        c.name.includes(scene.location) || true // 简化：给所有角色
      ).slice(0, 3);

      console.log(`  ✍️ 增量生成场景 ${scene.sceneNum}...`);
      const scriptResponse = await writeScript(
        { sceneNum: scene.sceneNum, location: scene.location, timeOfDay: scene.timeOfDay },
        sceneChars.length > 0 ? sceneChars : characters.slice(0, 2)
      );

      const { parseAIJson } = await import("./services/ai.service");
      const scriptData = parseAIJson(scriptResponse.content);

      // 获取最新版本号
      const latest = await prisma.script.findFirst({
        where: { sceneId: scene.id },
        orderBy: { version: "desc" },
      });
      const nextVersion = (latest?.version || 0) + 1;

      const newScript = await prisma.script.create({
        data: {
          sceneId: scene.id,
          yamlContent: scriptData.script || JSON.stringify(scriptData),
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

// --- 🆕 P1 分析增强 API ---

// 对白密度分析
app.get("/api/novels/:id/dialogue-density", async (req, res) => {
  try {
    const scenes = await prisma.scene.findMany({
      where: { novelId: req.params.id },
      orderBy: { sceneNum: "asc" },
      include: {
        scripts: { orderBy: { version: "desc" }, take: 1 },
      },
    });

    const result = scenes.map((scene) => {
      const yaml = scene.scripts[0]?.yamlContent || "";
      let dialogueLines = 0;
      let actionLines = 0;

      // 3 级容错解析
      // 1. 标准 YAML: 提取 dialogue: 和 action: 块
      const dMatch = yaml.match(/^dialogue:\n([\s\S]*?)(?=^[a-z]+:|\Z)/m);
      const aMatch = yaml.match(/^action:\n([\s\S]*?)(?=^[a-z]+:|\Z)/m);

      if (dMatch) {
        dialogueLines = dMatch[1].split("\n").filter((l) => l.trim().startsWith("-")).length;
      }
      if (aMatch) {
        actionLines = aMatch[1].split("\n").filter((l) => l.trim().startsWith("-")).length;
      }

      // 2. 回退: 关键词匹配
      if (dialogueLines === 0 && actionLines === 0 && yaml.trim()) {
        const dCount = (yaml.match(/character:\s*"/g) || []).length;
        const aCount = (yaml.match(/^  - "/gm) || []).length;
        dialogueLines = dCount;
        actionLines = Math.max(0, aCount - dCount);
      }

      const total = dialogueLines + actionLines;
      const density = total > 0 ? Math.round((dialogueLines / total) * 100) : null;

      return {
        sceneNum: scene.sceneNum,
        location: scene.location,
        dialogueLines,
        actionLines,
        density,
      };
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 角色关系图谱
app.get("/api/novels/:id/relationship-graph", async (req, res) => {
  try {
    const characters = await prisma.character.findMany({
      where: { novelId: req.params.id },
    });

    const nodes: any[] = [];
    const edgeMap = new Map<string, { relations: Set<string>; weight: number }>();

    for (const c of characters) {
      let traits: any = {};
      try { traits = JSON.parse(c.traits); } catch {}

      const importance =
        c.roleType === "主角" ? 3 : c.roleType === "反派" ? 2.5 : c.roleType === "配角" ? 2 : 1;

      nodes.push({
        id: c.name,
        name: c.name,
        roleType: c.roleType || "未知",
        group: c.roleType || "路人",
        importance,
      });

      // 提取关系
      const relationships = traits.relationships || [];
      for (const rel of relationships) {
        if (!rel.with) continue;
        // 双向关系合并: A-B 和 B-A 归一化为同一键
        const key = [c.name, rel.with].sort().join("|||");
        const existing = edgeMap.get(key);
        if (existing) {
          existing.relations.add(rel.relation || "关联");
          existing.weight = Math.min(1, existing.weight + 0.3);
        } else {
          edgeMap.set(key, {
            relations: new Set([rel.relation || "关联"]),
            weight: 0.6,
          });
        }
      }
    }

    // 构建 edges
    const edges: any[] = [];
    for (const [key, val] of edgeMap) {
      const [a, b] = key.split("|||");
      edges.push({
        source: a,
        target: b,
        relation: Array.from(val.relations).join(" / "),
        weight: val.weight,
      });
    }

    res.json({ nodes, edges });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 角色出场频率热力图
app.get("/api/novels/:id/character-heatmap", async (req, res) => {
  try {
    const characters = await prisma.character.findMany({
      where: { novelId: req.params.id },
      orderBy: { name: "asc" },
    });

    const scenes = await prisma.scene.findMany({
      where: { novelId: req.params.id },
      orderBy: { sceneNum: "asc" },
      include: {
        scripts: { orderBy: { version: "desc" }, take: 1 },
      },
    });

    const charList = characters.map((c) => ({
      name: c.name,
      roleType: c.roleType || "配角",
    }));

    const sceneList = scenes.map((s) => ({
      sceneNum: s.sceneNum,
      location: s.location,
    }));

    // 构建出场矩阵
    const matrix: number[][] = [];
    const charTotals: number[] = [];

    for (const c of characters) {
      const row: number[] = [];
      let total = 0;

      for (const scene of scenes) {
        const yaml = scene.scripts[0]?.yamlContent || "";
        // 统计该角色在 dialogue 中的对白行数
        const dialogueRegex = new RegExp(
          `character:\\s*"${c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`,
          "gi"
        );
        const dialogueMentions = (yaml.match(dialogueRegex) || []).length;

        // 统计该角色在 action 中被提及的次数
        const actionRegex = new RegExp(
          `"([^"]*${c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^"]*)"`,
          "gi"
        );
        const actionMentions = (yaml.match(actionRegex) || []).length;

        const intensity = Math.min(100, dialogueMentions * 15 + actionMentions * 8);
        row.push(intensity);
        total += intensity;
      }

      matrix.push(row);
      charTotals.push(total);
    }

    // 按总出场强度排序
    const sortedIndices = charTotals.map((t, i) => i).sort((a, b) => charTotals[b] - charTotals[a]);
    const sortedChars = sortedIndices.map((i) => charList[i]);
    const sortedMatrix = sortedIndices.map((i) => matrix[i]);

    res.json({
      characters: sortedChars,
      scenes: sceneList,
      matrix: sortedMatrix,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 情感曲线分析
app.get("/api/novels/:id/emotion-curve", async (req, res) => {
  try {
    const scenes = await prisma.scene.findMany({
      where: { novelId: req.params.id },
      orderBy: { sceneNum: "asc" },
      include: {
        scripts: { orderBy: { version: "desc" }, take: 1 },
      },
    });

    const { analyzeSceneEmotion } = await import("./services/emotion.service");
    const points = scenes.map((scene) => {
      const yaml = scene.scripts[0]?.yamlContent || "";
      return {
        sceneNum: scene.sceneNum,
        location: scene.location,
        ...analyzeSceneEmotion(yaml),
      };
    });

    res.json(points);
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
    const { novelId, targetType, targetId, content, type } = req.body;
    const annotation = await prisma.annotation.create({
      data: { novelId, targetType, targetId, content, type: type || "note" },
    });
    res.status(201).json(annotation);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/annotations/:id", async (req, res) => {
  try {
    const { content, type, resolved } = req.body;
    const annotation = await prisma.annotation.update({
      where: { id: req.params.id },
      data: {
        ...(content !== undefined && { content }),
        ...(type !== undefined && { type }),
        ...(resolved !== undefined && { resolved }),
      },
    });
    res.json(annotation);
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

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log(`Mimo Model: ${process.env.MIMO_MODEL || "mimo-v2.5"}`);
  console.log(`Database: SQLite (file:./dev.db)`);
});

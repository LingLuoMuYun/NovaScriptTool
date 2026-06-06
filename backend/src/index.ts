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
app.use(express.json({ limit: "5mb" }));

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

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log(`Mimo Model: ${process.env.MIMO_MODEL || "mimo-v2.5"}`);
  console.log(`Database: SQLite (file:./dev.db)`);
});

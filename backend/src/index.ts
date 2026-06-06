import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import { mimoClient, chatCompletion } from "./services/ai.service";

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: "5mb" }));

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

// --- 数据库 CRUD ---

// 获取所有小说
app.get("/api/novels", async (_req, res) => {
  const novels = await prisma.novel.findMany({ orderBy: { createdAt: "desc" } });
  res.json(novels);
});

// 创建小说
app.post("/api/novels", async (req, res) => {
  const { title, content } = req.body;
  const novel = await prisma.novel.create({ data: { title, content } });
  res.status(201).json(novel);
});

// 获取单个小说（含角色和场景）
app.get("/api/novels/:id", async (req, res) => {
  const novel = await prisma.novel.findUnique({
    where: { id: req.params.id },
    include: { characters: true, scenes: { include: { scripts: true } } },
  });
  if (!novel) return res.status(404).json({ error: "Not found" });
  res.json(novel);
});

// 删除小说
app.delete("/api/novels/:id", async (req, res) => {
  await prisma.novel.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log(`Mimo Model: ${process.env.MIMO_MODEL || "mimo-v2.5"}`);
  console.log(`Database: SQLite (file:./dev.db)`);
});

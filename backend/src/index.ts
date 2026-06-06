import express from "express";
import cors from "cors";
import { mimoClient, chatCompletion } from "./services/ai.service";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: "5mb" }));

// --- 基础 ---

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
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

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log(`Mimo Model: ${process.env.MIMO_MODEL || "mimo-v2.5"}`);
});

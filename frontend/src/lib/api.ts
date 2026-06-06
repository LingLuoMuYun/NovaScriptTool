/**
 * NovaScriptTool API 客户端
 * 后端地址可通过 NEXT_PUBLIC_API_URL 环境变量配置
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function request<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

// ─── 小说 CRUD ────────────────────────────────────────

export interface Novel {
  id: string;
  title: string;
  content: string;
  status: string;
  analysis?: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { characters: number; scenes: number };
  characters?: Character[];
  scenes?: Scene[];
}

export interface NovelStats {
  totalChars: number;
  totalLines: number;
  estimatedChapters: number;
  chunks: string[];
  chapters: { index: number; title: string; charCount: number; lineCount: number }[];
}

export interface Character {
  id: string;
  novelId: string;
  name: string;
  aliases: string;
  roleType: string;
  traits: string;
}

export interface Scene {
  id: string;
  novelId: string;
  sceneNum: number;
  location: string;
  timeOfDay: string;
  scripts?: Script[];
}

export interface Script {
  id: string;
  sceneId: string;
  yamlContent: string;
  version: number;
  createdAt: string;
}

export function getNovels(): Promise<Novel[]> {
  return request("/api/novels");
}

export function getNovel(id: string): Promise<Novel> {
  return request(`/api/novels/${id}`);
}

export async function createNovel(
  title?: string,
  content?: string,
  file?: File
): Promise<Novel & { stats: NovelStats }> {
  if (file) {
    const formData = new FormData();
    formData.append("file", file);
    if (title) formData.append("title", title);

    const res = await fetch(`${BASE_URL}/api/novels`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  return request("/api/novels", {
    method: "POST",
    body: JSON.stringify({ title, content }),
  });
}

export function deleteNovel(id: string): Promise<{ ok: boolean }> {
  return request(`/api/novels/${id}`, { method: "DELETE" });
}

export function getNovelStats(id: string): Promise<NovelStats> {
  return request(`/api/novels/${id}/stats`);
}

export function processNovel(id: string): Promise<any> {
  return request(`/api/novels/${id}/process`, { method: "POST" });
}

// ─── AI 接口 ───────────────────────────────────────────

export interface ChatResult {
  content: string;
  reasoning?: string;
  usage: any;
  model: string;
}

export function chatCompletion(
  messages: { role: string; content: string }[],
  options?: { model?: string; temperature?: number; maxTokens?: number; thinking?: boolean }
): Promise<ChatResult> {
  return request("/api/ai/chat", {
    method: "POST",
    body: JSON.stringify({ messages, ...options }),
  });
}

export function analyzePlot(content: string): Promise<ChatResult> {
  return request("/api/ai/analyze-plot", {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

export function analyzeCharacters(content: string): Promise<ChatResult> {
  return request("/api/ai/analyze-characters", {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

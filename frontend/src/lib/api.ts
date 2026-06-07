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
  isLocked?: boolean;
  lockedBy?: string | null;
  currentVersionId?: string | null;
  scripts?: Script[];
}

export interface Script {
  id: string;
  sceneId: string;
  yamlContent: string;
  version: number;
  createdBy?: string;
  parentVersionId?: string | null;
  createdAt: string;
}

export interface Annotation {
  id: string;
  novelId: string;
  targetType: string;
  targetId: string;
  content: string;
  type: string;
  resolved: boolean;
  authorName: string;
  blockIndex?: number | null;
  createdAt: string;
}

export interface DiffLine {
  type: "added" | "removed" | "unchanged";
  lines: string[];
  oldLineNum?: number;
  newLineNum?: number;
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

// ─── 场景 CRUD ──────────────────────────────────

export function createScene(
  novelId: string,
  data: { sceneNum: number; location: string; timeOfDay: string; yamlContent?: string }
): Promise<Scene> {
  return request(`/api/novels/${novelId}/scenes`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateScene(
  sceneId: string,
  data: { sceneNum?: number; location?: string; timeOfDay?: string }
): Promise<Scene> {
  return request(`/api/scenes/${sceneId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteScene(sceneId: string, force?: boolean): Promise<{ ok: boolean }> {
  const qs = force ? "?force=true" : "";
  return request(`/api/scenes/${sceneId}${qs}`, { method: "DELETE" });
}

export function updateScript(scriptId: string, yamlContent: string): Promise<Script> {
  return request(`/api/scripts/${scriptId}`, {
    method: "PUT",
    body: JSON.stringify({ yamlContent }),
  });
}

// ─── 场景锁定/解锁 ──────────────────────────────────

export function lockScene(sceneId: string): Promise<{ ok: boolean; isLocked: boolean }> {
  return request(`/api/scenes/${sceneId}/lock`, { method: "PUT" });
}

export function unlockScene(sceneId: string): Promise<{ ok: boolean; isLocked: boolean }> {
  return request(`/api/scenes/${sceneId}/unlock`, { method: "PUT" });
}

// ─── 注记 CRUD ──────────────────────────────────────

export function getAnnotations(novelId: string): Promise<Annotation[]> {
  return request(`/api/novels/${novelId}/annotations`);
}

export function getSceneAnnotations(sceneId: string): Promise<Annotation[]> {
  return request(`/api/scenes/${sceneId}/annotations`);
}

export function createAnnotation(data: {
  novelId: string;
  targetType: string;
  targetId: string;
  content: string;
  type?: string;
  authorName?: string;
  blockIndex?: number;
}): Promise<Annotation> {
  return request("/api/annotations", { method: "POST", body: JSON.stringify(data) });
}

export function updateAnnotation(
  id: string,
  data: { content?: string; type?: string; resolved?: boolean; authorName?: string; blockIndex?: number }
): Promise<Annotation> {
  return request(`/api/annotations/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export function deleteAnnotation(id: string): Promise<{ ok: boolean }> {
  return request(`/api/annotations/${id}`, { method: "DELETE" });
}

// ─── 版本管理 ──────────────────────────────────────

export function getSceneVersions(sceneId: string): Promise<Script[]> {
  return request(`/api/scenes/${sceneId}/versions`);
}

export function getSceneVersion(sceneId: string, versionId: string): Promise<Script> {
  return request(`/api/scenes/${sceneId}/versions/${versionId}`);
}

export function diffSceneVersions(
  sceneId: string,
  v1: string,
  v2: string
): Promise<{ diffs: DiffLine[] }> {
  return request(`/api/scenes/${sceneId}/diff?v1=${v1}&v2=${v2}`);
}

export function rollbackScene(sceneId: string, targetVersionId: string): Promise<Script> {
  return request(`/api/scenes/${sceneId}/rollback`, {
    method: "POST",
    body: JSON.stringify({ targetVersionId }),
  });
}

// ─── 依赖图谱 + 增量重算 ─────────────────────────

export function buildDeps(novelId: string): Promise<{ edges: any[]; sceneCount: number }> {
  return request(`/api/novels/${novelId}/build-deps`, { method: "POST" });
}

export function analyzeImpact(
  novelId: string,
  changedSceneNums: number[],
  minWeight?: number
): Promise<{
  affectedSceneNums: number[];
  excludedLockedNums: number[];
  totalScenesToRegenerate: number;
  impactPaths: { targetSceneNum: number; sourceSceneNum: number; type: string; weight: number }[];
}> {
  return request(`/api/novels/${novelId}/impact-analysis`, {
    method: "POST",
    body: JSON.stringify({ changedSceneNums, minWeight }),
  });
}

export function runIncrementalPipeline(
  novelId: string,
  sceneNums: number[]
): Promise<{ regenerated: number; scenes: any[]; skippedLocked: number }> {
  return request(`/api/novels/${novelId}/incremental-pipeline`, {
    method: "POST",
    body: JSON.stringify({ sceneNums }),
  });
}

export function getDepsStatus(
  novelId: string
): Promise<{ hasDeps: boolean; edgeCount: number; sceneCount: number }> {
  return request(`/api/novels/${novelId}/deps-status`);
}

export function getChangedScenes(
  novelId: string
): Promise<{ scenes: number[] }> {
  return request(`/api/novels/${novelId}/changed-scenes`);
}

// ─── 模板系统 ──────────────────────────────────────

export interface ProjectTemplate {
  id: string;
  name: string;
  icon: string;
  description: string;
  genre: string;
  temperature: number;
  answerStyle: string;
  roleTypePreferences: string[];
  defaultSceneTypes: string[];
  promptPreview?: string;
  systemPrompt?: string;
}

export function getTemplates(): Promise<ProjectTemplate[]> {
  return request("/api/templates");
}

export function getTemplate(id: string): Promise<ProjectTemplate> {
  return request(`/api/templates/${id}`);
}

// ─── AI 对话 ──────────────────────────────────────

export interface ChatConversation {
  id: string;
  novelId: string | null;
  title: string;
  mode: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  _count?: { messages: number };
  messages?: ChatMessage[];
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

export function getConversations(novelId?: string): Promise<ChatConversation[]> {
  const qs = novelId ? `?novelId=${encodeURIComponent(novelId)}` : "";
  return request(`/api/chat/conversations${qs}`);
}

export function createConversation(data: {
  novelId?: string;
  title?: string;
  mode?: string;
}): Promise<ChatConversation> {
  return request("/api/chat/conversations", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function getConversationMessages(conversationId: string): Promise<ChatMessage[]> {
  return request(`/api/chat/conversations/${conversationId}/messages`);
}

export function deleteConversation(conversationId: string): Promise<{ ok: boolean }> {
  return request(`/api/chat/conversations/${conversationId}`, { method: "DELETE" });
}

/**
 * SSE 流式聊天：返回 AbortController 用于取消
 * onToken: 收到新 token 时回调
 * onMeta: 收到会话元数据时回调
 * onDone: 流结束时回调
 * onError: 出错时回调
 */
export function streamChat(
  params: {
    conversationId?: string;
    novelId?: string;
    message: string;
    templateId?: string;
  },
  callbacks: {
    onToken: (token: string) => void;
    onMeta?: (meta: { conversationId: string; title: string }) => void;
    onDone?: (conversationId: string) => void;
    onError?: (error: string) => void;
  }
): AbortController {
  const controller = new AbortController();

  fetch(`${BASE_URL}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        callbacks.onError?.(err.error || `HTTP ${res.status}`);
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) {
        callbacks.onError?.("无法读取响应流");
        return;
      }
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          try {
            const event = JSON.parse(trimmed.slice(5).trim());
            switch (event.type) {
              case "meta":
                callbacks.onMeta?.(event);
                break;
              case "token":
                callbacks.onToken(event.token);
                break;
              case "done":
                callbacks.onDone?.(event.conversationId);
                break;
              case "error":
                callbacks.onError?.(event.error);
                break;
            }
          } catch {}
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        callbacks.onError?.(err.message);
      }
    });

  return controller;
}

export interface ValidationResult {
  totalScenes: number;
  validCount: number;
  structuredCount: number;
  legacyCount: number;
  invalidCount: number;
  results: {
    sceneNum: number;
    status: string;
    format?: string;
    errors?: string[];
    warnings?: string[];
    characterCount?: number;
    blockCount?: number;
  }[];
}

export function validateScripts(novelId: string): Promise<ValidationResult> {
  return request(`/api/novels/${novelId}/validate`);
}


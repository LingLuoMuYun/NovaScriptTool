"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  getConversations,
  createConversation,
  getConversationMessages,
  deleteConversation,
  streamChat,
  getTemplates,
} from "@/lib/api";
import type { ChatConversation, ChatMessage, ProjectTemplate } from "@/lib/api";

interface ChatPanelProps {
  novelId?: string;
  novelTitle?: string;
  novelCharacters?: { name: string; roleType: string }[];
  onClose?: () => void;
  className?: string;
  /** 外部控制的模板 ID，传入后自动同步内部模板选择 */
  templateId?: string;
  /** 嵌入模式：不显示关闭按钮，全高度 */
  embedded?: boolean;
}

export default function ChatPanel({
  novelId,
  novelTitle,
  novelCharacters = [],
  onClose,
  className,
  templateId: externalTemplateId,
  embedded = false,
}: ChatPanelProps) {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [error, setError] = useState("");
  const [showSidebar, setShowSidebar] = useState(false);
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamingTextRef = useRef("");

  // 加载模板列表
  useEffect(() => {
    getTemplates()
      .then(setTemplates)
      .catch(() => {});
  }, []);

  // 同步外部模板 ID
  useEffect(() => {
    if (externalTemplateId !== undefined) {
      setSelectedTemplate(externalTemplateId);
    }
  }, [externalTemplateId]);

  // 加载会话列表
  const loadConversations = useCallback(async () => {
    setLoadingConvs(true);
    try {
      const data = await getConversations(novelId);
      setConversations(data);
    } catch {
      // ignore
    } finally {
      setLoadingConvs(false);
    }
  }, [novelId]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // 加载选中会话的消息
  useEffect(() => {
    if (!activeConvId) return;
    setLoadingMsgs(true);
    setError("");
    getConversationMessages(activeConvId)
      .then((data) => {
        setMessages(data);
        // 从已有消息中检测模板
        const conv = conversations.find((c) => c.id === activeConvId);
        if (conv?.mode === "template" && !selectedTemplate) {
          // 保持当前模板选择
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingMsgs(false));
  }, [activeConvId, conversations, selectedTemplate]);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  // 快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (streaming && abortRef.current) {
          abortRef.current.abort();
          setStreaming(false);
          return;
        }
        onClose?.();
      }
      // Ctrl+Enter 发送
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !streaming) {
        e.preventDefault();
        handleSend();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [input, streaming]);

  // 新建会话
  const handleNewChat = async () => {
    setError("");
    try {
      const conv = await createConversation({
        novelId,
        title: novelTitle ? `关于《${novelTitle}》的讨论` : "新对话",
        mode: selectedTemplate ? "template" : "general",
      });
      setConversations((prev) => [conv, ...prev]);
      setActiveConvId(conv.id);
      setMessages([]);
      setStreamingText("");
    } catch (err: any) {
      setError(err.message);
    }
  };

  // 删除会话
  const handleDeleteConv = async (convId: string) => {
    try {
      await deleteConversation(convId);
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (activeConvId === convId) {
        setActiveConvId(null);
        setMessages([]);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  // 发送消息
  const handleSend = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    setInput("");
    setError("");
    setStreaming(true);
    setStreamingText("");

    // 乐观更新：添加用户消息
    const userMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      conversationId: activeConvId || "temp",
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    abortRef.current = streamChat(
      {
        conversationId: activeConvId || undefined,
        novelId,
        message: text,
        templateId: selectedTemplate || undefined,
      },
      {
        onMeta: (meta) => {
          if (!activeConvId) {
            setActiveConvId(meta.conversationId);
            loadConversations();
          }
        },
        onToken: (token) => {
          streamingTextRef.current += token;
          setStreamingText(streamingTextRef.current);
        },
        onDone: (convId) => {
          // 添加助手消息
          const finalText = streamingTextRef.current;
          if (finalText) {
            const assistantMsg: ChatMessage = {
              id: `temp-${Date.now()}-assistant`,
              conversationId: convId,
              role: "assistant",
              content: finalText,
              createdAt: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, assistantMsg]);
          }
          setStreamingText("");
          streamingTextRef.current = "";
          setStreaming(false);
          // 如果有模板但当前会话未标记，更新
          if (selectedTemplate && activeConvId) {
            setConversations((prev) =>
              prev.map((c) =>
                c.id === activeConvId ? { ...c, mode: "template" } : c
              )
            );
          }
          // 重新加载消息以获取服务器端 ID
          if (convId) {
            getConversationMessages(convId)
              .then(setMessages)
              .catch(() => {});
          }
        },
        onError: (errMsg) => {
          setError(errMsg);
          setStreaming(false);
          setStreamingText("");
          streamingTextRef.current = "";
        },
      }
    );
  };

  // 处理输入框按键
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={`flex h-full flex-col bg-white dark:bg-gray-900 overflow-hidden ${embedded ? "" : "rounded-xl shadow-xl"} ${className || ""}`}>
      {/* 头部 */}
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="rounded-lg p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            title="会话列表"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
            </svg>
          </button>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate max-w-[200px]">
            🤖 AI 写作助手
          </h3>
          {novelTitle && (
            <span className="hidden sm:inline text-xs text-gray-400 dark:text-gray-500 truncate max-w-[150px]">
              · {novelTitle}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleNewChat}
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950 transition"
          >
            ＋ 新对话
          </button>
          {onClose ? (
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : (
            <div /> // 嵌入模式占位保持布局
          )}
        </div>
      </div>

      {/* 模板选择器（快速选择） */}
      <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin">
          <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">风格:</span>
          <button
            onClick={() => setSelectedTemplate("")}
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs transition ${
              !selectedTemplate
                ? "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-medium"
                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            智能
          </button>
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedTemplate(t.id)}
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs transition ${
                selectedTemplate === t.id
                  ? "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-medium"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
              title={t.description}
            >
              {t.icon} {t.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 侧边栏：会话列表 */}
        {showSidebar && (
          <div className="w-64 shrink-0 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 overflow-y-auto">
            <div className="p-3">
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                会话历史
              </h4>
              {loadingConvs ? (
                <div className="flex items-center justify-center py-8">
                  <svg className="h-5 w-5 animate-spin text-gray-400" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
              ) : conversations.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 py-4 text-center">
                  暂无对话
                </p>
              ) : (
                <div className="space-y-1">
                  {conversations.map((conv) => (
                    <div
                      key={conv.id}
                      onClick={() => {
                        setActiveConvId(conv.id);
                        setStreamingText("");
                        streamingTextRef.current = "";
                      }}
                      className={`group flex items-center justify-between rounded-lg px-2.5 py-2 cursor-pointer text-xs transition ${
                        activeConvId === conv.id
                          ? "bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300"
                          : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                      }`}
                    >
                      <span className="truncate flex-1">{conv.title}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteConv(conv.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 ml-1 p-0.5 text-gray-400 hover:text-red-500 transition"
                        title="删除"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 消息区域 */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* 消息列表 */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin">
            {/* 欢迎提示 */}
            {messages.length === 0 && !streamingText && !loadingMsgs && (
              <div className="text-center py-12">
                <p className="text-4xl mb-4">🤖</p>
                <h4 className="text-base font-semibold text-gray-700 dark:text-gray-200 mb-2">
                  AI 写作助手
                </h4>
                <p className="text-sm text-gray-400 dark:text-gray-500 max-w-md mx-auto">
                  我是你的专属剧本创作顾问。可以帮你：
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 max-w-sm mx-auto">
                  {[
                    "🎭 分析角色塑造",
                    "📖 讨论剧情走向",
                    "✍️ 优化对白设计",
                    "🏗️ 建议场景结构",
                    "🔄 小说到剧本改编",
                    "💡 创意灵感碰撞",
                  ].map((hint) => (
                    <button
                      key={hint}
                      onClick={() => {
                        setInput(hint.replace(/^[^\s]+\s/, ""));
                        textareaRef.current?.focus();
                      }}
                      className="rounded-lg border border-gray-200 dark:border-gray-700 px-2.5 py-2 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition text-left"
                    >
                      {hint}
                    </button>
                  ))}
                </div>
                {novelCharacters.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
                      当前角色列表（可在对话中 @提及）：
                    </p>
                    <div className="flex flex-wrap gap-1 justify-center">
                      {novelCharacters.slice(0, 8).map((c) => (
                        <span
                          key={c.name}
                          className="inline-flex items-center rounded-full bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 text-xs text-indigo-600 dark:text-indigo-400"
                        >
                          {c.name}
                          <span className="ml-1 text-gray-400">({c.roleType})</span>
                        </span>
                      ))}
                      {novelCharacters.length > 8 && (
                        <span className="text-xs text-gray-400">
                          +{novelCharacters.length - 8} 更多
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {loadingMsgs && (
              <div className="flex items-center justify-center py-8">
                <svg className="h-6 w-6 animate-spin text-gray-400" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            )}

            {/* 消息渲染 */}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white rounded-br-md"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-md"
                  }`}
                >
                  <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                  <div
                    className={`mt-1 text-right text-[10px] ${
                      msg.role === "user" ? "text-indigo-200" : "text-gray-400 dark:text-gray-500"
                    }`}
                  >
                    {new Date(msg.createdAt).toLocaleTimeString("zh-CN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </div>
            ))}

            {/* 流式响应 — 等待首个 token 时显示加载动画 */}
            {streaming && !streamingText && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-gray-100 dark:bg-gray-800 px-4 py-2.5">
                  <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>AI 思考中…</span>
                  </div>
                </div>
              </div>
            )}

            {/* 流式响应 — 有 token 时逐字显示 */}
            {streamingText && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-gray-100 dark:bg-gray-800 px-4 py-2.5">
                  <div className="whitespace-pre-wrap break-words text-sm text-gray-800 dark:text-gray-200">
                    {streamingText}
                    <span className="inline-block w-1.5 h-4 ml-0.5 bg-indigo-500 animate-pulse align-middle" />
                  </div>
                </div>
              </div>
            )}

            {/* 错误提示 */}
            {error && (
              <div className="flex justify-center">
                <div className="rounded-lg bg-red-50 dark:bg-red-950 px-4 py-2 text-xs text-red-600 dark:text-red-400 max-w-md text-center">
                  ❌ {error}
                  <button
                    onClick={() => setError("")}
                    className="ml-2 underline hover:no-underline"
                  >
                    关闭
                  </button>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* 输入区 */}
          <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3 shrink-0">
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  streaming
                    ? "AI 正在回复..."
                    : novelTitle
                    ? `向 AI 提问关于《${novelTitle}》的问题...`
                    : "向 AI 写作助手提问..."
                }
                rows={1}
                disabled={streaming}
                className="flex-1 resize-none rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:text-gray-100 disabled:opacity-50 scrollbar-thin"
                style={{ maxHeight: "120px" }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = Math.min(el.scrollHeight, 120) + "px";
                }}
              />
              {streaming ? (
                <button
                  onClick={() => {
                    abortRef.current?.abort();
                    setStreaming(false);
                  }}
                  className="shrink-0 rounded-xl bg-red-500 px-3 py-2.5 text-white text-sm font-medium hover:bg-red-600 transition"
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 6h12v12H6z" />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className="shrink-0 rounded-xl bg-indigo-600 px-3 py-2.5 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
                  </svg>
                </button>
              )}
            </div>
            <p className="mt-1.5 text-[10px] text-gray-400 dark:text-gray-500 text-center">
              Enter 发送 · Shift+Enter 换行 · Ctrl+Enter 快捷发送{streaming ? " · Esc 停止生成" : ""}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useCallback, useRef } from "react";
import { createNovel } from "@/lib/api";

interface NovelUploadProps {
  onUploaded: () => void;
}

export default function NovelUpload({ onUploaded }: NovelUploadProps) {
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(async () => {
    setError("");
    if (!file && !content.trim()) {
      setError("请上传文件或粘贴小说内容");
      return;
    }

    setUploading(true);
    try {
      await createNovel(title || undefined, content || undefined, file || undefined);
      setTitle("");
      setContent("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onUploaded();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }, [title, content, file, onUploaded]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) {
      setFile(f);
      if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
    }
  }, [title]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-800">📥 上传小说</h2>

      {/* 模式切换 */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setMode("file")}
          className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
            mode === "file"
              ? "bg-indigo-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          📁 文件上传
        </button>
        <button
          onClick={() => setMode("paste")}
          className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
            mode === "paste"
              ? "bg-indigo-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          ✍️ 直接粘贴
        </button>
      </div>

      {/* 标题输入 */}
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="小说标题（选填）"
        className="mb-4 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />

      {/* 文件上传区 */}
      {mode === "file" && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition ${
            dragOver
              ? "border-indigo-500 bg-indigo-50"
              : "border-gray-300 hover:border-indigo-400"
          }`}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setFile(f);
                if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
              }
            }}
          />
          {file ? (
            <div className="text-center">
              <p className="text-lg">📄</p>
              <p className="text-sm font-medium text-gray-700">{file.name}</p>
              <p className="text-xs text-gray-400">
                {(file.size / 1024).toFixed(1)} KB
              </p>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-2xl">📂</p>
              <p className="mt-2 text-sm text-gray-500">
                拖拽文件到此处，或点击选择
              </p>
              <p className="mt-1 text-xs text-gray-400">
                支持 .txt / .md / .json，最大 10MB
              </p>
            </div>
          )}
        </div>
      )}

      {/* 直接粘贴区 */}
      {mode === "paste" && (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="在此粘贴小说内容……"
          rows={10}
          className="w-full resize-y rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      )}

      {/* 错误提示 */}
      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
          ❌ {error}
        </p>
      )}

      {/* 提交按钮 */}
      <button
        onClick={handleSubmit}
        disabled={uploading}
        className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {uploading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            上传处理中...
          </span>
        ) : (
          "上传小说"
        )}
      </button>
    </div>
  );
}

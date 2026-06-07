"use client";

import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface AnalyzeButtonProps {
  novelId: string;
  onAnalyzed: (result: any) => void;
}

export default function AnalyzeButton({ novelId, onAnalyzed }: AnalyzeButtonProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");

  const handleAnalyze = async () => {
    setError("");
    setAnalyzing(true);
    try {
      const res = await fetch(`${API_BASE}/api/novels/${novelId}/analyze`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "分析失败" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const result = await res.json();
      onAnalyzed(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleAnalyze}
        disabled={analyzing}
        className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-medium text-white shadow-sm dark:shadow-gray-950/30 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {analyzing ? (
          <>
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            AI 分析中...（可能需要 10-30 秒）
          </>
        ) : (
          <>
            🧠 开始 AI 分析
          </>
        )}
      </button>
      {error && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">❌ {error}</p>
      )}
    </div>
  );
}

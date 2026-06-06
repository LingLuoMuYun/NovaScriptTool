import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NovaScriptTool — AI 小说转剧本",
  description: "AI 驱动的小说转剧本创作辅助系统",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {/* 顶部导航 */}
        <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <a href="/" className="flex items-center gap-2 text-lg font-bold text-gray-900 hover:text-indigo-600 transition">
              🎬 NovaScriptTool
            </a>
            <nav className="flex items-center gap-4 text-sm text-gray-500">
              <a
                href="https://github.com/LingLuoMuYun/NovaScriptTool"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-gray-700 transition"
              >
                GitHub
              </a>
            </nav>
          </div>
        </header>

        {/* 主内容 */}
        {children}

        {/* 底部 */}
        <footer className="mt-16 border-t border-gray-100 py-8 text-center text-xs text-gray-300">
          NovaScriptTool · AI 驱动的小说转剧本创作辅助系统
        </footer>
      </body>
    </html>
  );
}

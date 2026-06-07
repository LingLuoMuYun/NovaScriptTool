import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import DarkModeToggle from "@/components/DarkModeToggle";
import GlobalSearch from "@/components/GlobalSearch";

export const metadata: Metadata = {
  title: "NovaScriptTool — AI 小说转剧本",
  description: "AI 驱动的小说转剧本创作辅助系统",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased dark:bg-gray-950 dark:text-gray-100">
        <ThemeProvider>
          {/* 顶部导航 */}
          <header className="sticky top-0 z-50 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/80 backdrop-blur dark:border-gray-800 dark:bg-gray-950/80">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
              <a
                href="/"
                className="flex items-center gap-2 text-lg font-bold text-gray-900 hover:text-indigo-600 dark:text-indigo-400 transition dark:text-gray-100 dark:hover:text-indigo-400 flex-shrink-0"
              >
                🎬 NovaScriptTool
              </a>
              <div className="flex-1 max-w-sm">
                <GlobalSearch />
              </div>
              <nav className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">
                <DarkModeToggle />
                <a
                  href="https://github.com/LingLuoMuYun/NovaScriptTool"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-gray-700 dark:text-gray-200 dark:hover:text-gray-200 transition"
                >
                  GitHub
                </a>
              </nav>
            </div>
          </header>

          {/* 主内容 */}
          {children}

          {/* 底部 */}
          <footer className="mt-16 border-t border-gray-100 py-8 text-center text-xs text-gray-300 dark:border-gray-800 dark:text-gray-600 dark:text-gray-300">
            NovaScriptTool · AI 驱动的小说转剧本创作辅助系统
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}

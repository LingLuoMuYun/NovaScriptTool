import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NovaScriptTool",
  description: "AI 驱动的小说转剧本创作辅助系统",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}

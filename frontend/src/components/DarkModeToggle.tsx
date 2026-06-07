"use client";

import { useTheme } from "./ThemeProvider";

export default function DarkModeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <button
      onClick={toggle}
      className="rounded-full p-2 text-sm transition hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-800"
      title={theme === "dark" ? "切换亮色模式" : "切换暗色模式"}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}

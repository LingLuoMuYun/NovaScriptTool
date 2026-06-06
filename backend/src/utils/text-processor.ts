/**
 * 小说文本预处理工具
 * - 清洗格式
 * - 按章节分段
 * - 统计文本信息
 */

export interface TextStats {
  totalChars: number;
  totalLines: number;
  estimatedChapters: number;
  chunks: string[];
}

export interface ChapterChunk {
  index: number;
  title: string;
  content: string;
  startLine: number;
  endLine: number;
}

/**
 * 清洗文本：统一换行、去除多余空行、规范化标点
 */
export function cleanText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")           // 统一换行为 \n
    .replace(/\r/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")     // 超过3个连续换行压缩为2个
    .replace(/\t/g, "    ")           // Tab 转空格
    .replace(/\s+$/gm, "")            // 去除行尾空格
    .trim();
}

/**
 * 按章节标题自动分段
 * 匹配模式: "第X章", "Chapter X", "第X节", 等
 */
export function splitChapters(text: string): ChapterChunk[] {
  const lines = text.split("\n");
  const chapterPattern = /^(第[零一二三四五六七八九十百千\d]+[章節节]|Chapter\s+\d+|CHAPTER\s+\d+|PART\s+\d+)\b/i;

  const chapters: ChapterChunk[] = [];
  let currentChapter: ChapterChunk | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (chapterPattern.test(line)) {
      // 保存上一个章节
      if (currentChapter) {
        currentChapter.endLine = i - 1;
        currentChapter.content = lines
          .slice(currentChapter.startLine, i)
          .join("\n")
          .trim();
        chapters.push(currentChapter);
      }

      currentChapter = {
        index: chapters.length + 1,
        title: line,
        content: "",
        startLine: i,
        endLine: lines.length - 1,
      };
    }
  }

  // 最后一个章节
  if (currentChapter) {
    currentChapter.content = lines
      .slice(currentChapter.startLine)
      .join("\n")
      .trim();
    chapters.push(currentChapter);
  }

  // 如果没有识别到章节标题，整篇作为一个章节
  if (chapters.length === 0) {
    chapters.push({
      index: 1,
      title: "全文",
      content: text,
      startLine: 0,
      endLine: lines.length - 1,
    });
  }

  return chapters;
}

/**
 * 按字符数切分文本块（用于超过 AI token 限制的长文本）
 */
export function chunkByChars(text: string, maxChars: number = 10000): string[] {
  const chapters = splitChapters(text);
  const chunks: string[] = [];
  let current = "";

  for (const ch of chapters) {
    const block = `\n${ch.title}\n${ch.content}`;
    if (current.length + block.length > maxChars && current.length > 0) {
      chunks.push(current.trim());
      current = block;
    } else {
      current += block;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

/**
 * 分析文本统计信息
 */
export function analyzeText(text: string): TextStats {
  const chapters = splitChapters(text);
  const chunks = chunkByChars(text);

  return {
    totalChars: text.length,
    totalLines: text.split("\n").length,
    estimatedChapters: chapters.length,
    chunks,
  };
}

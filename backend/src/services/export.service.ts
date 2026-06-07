import { ScriptOutput, ContentBlockType, parseLegacyScript } from "../schemas/script.schema";

// ─── 类型定义 ──────────────────────────────────────────

export interface SceneExportData {
  sceneNum: number;
  location: string;
  timeOfDay: string;
  yamlContent: string; // 数据库原始存储
}

export interface NovelExportData {
  title: string;
  scenes: SceneExportData[];
}

export type ExportFormat = "yaml" | "fdx" | "fountain";

// ─── 辅助：解析场景为结构化数据 ────────────────────────

function parseSceneContent(yamlContent: string): ScriptOutput | null {
  // 尝试解析为结构化 JSON
  try {
    const parsed = JSON.parse(yamlContent);
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.content)) {
      return parsed as ScriptOutput;
    }
  } catch {
    // 不是 JSON，尝试旧格式解析
  }
  return parseLegacyScript(yamlContent);
}

function isStructured(yamlContent: string): boolean {
  try {
    const parsed = JSON.parse(yamlContent);
    return parsed && typeof parsed === "object" && Array.isArray(parsed.content);
  } catch {
    return false;
  }
}

// ─── YAML 导出 ─────────────────────────────────────────

function escapeYaml(str: string): string {
  if (str.includes('"') || str.includes("\\") || str.includes("\n")) {
    return `"${str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
  }
  if (
    str.includes(":") ||
    str.includes("#") ||
    str.includes("{") ||
    str.includes("[") ||
    str === "true" ||
    str === "false" ||
    str === "null"
  ) {
    return `"${str}"`;
  }
  return str;
}

function contentBlockToYaml(block: ContentBlockType, indent: number): string {
  const pad = "  ".repeat(indent);
  switch (block.type) {
    case "action":
      return `${pad}- type: action\n${pad}  text: ${escapeYaml(block.text)}`;
    case "dialogue":
      let d = `${pad}- type: dialogue\n${pad}  character: ${escapeYaml(block.character)}`;
      if (block.emotion) d += `\n${pad}  emotion: ${escapeYaml(block.emotion)}`;
      d += `\n${pad}  line: ${escapeYaml(block.line)}`;
      return d;
    case "transition":
      return `${pad}- type: transition\n${pad}  text: ${escapeYaml(block.text)}`;
  }
}

export function toYaml(novel: NovelExportData): string {
  let yaml = "";
  yaml += `# ==========================================\n`;
  yaml += `# 剧本: ${novel.title}\n`;
  yaml += `# 生成时间: ${new Date().toISOString()}\n`;
  yaml += `# 场景总数: ${novel.scenes.length}\n`;
  yaml += `# ==========================================\n\n`;

  yaml += `title: ${escapeYaml(novel.title)}\n`;
  yaml += `scenes:\n`;

  for (const scene of novel.scenes) {
    const script = parseSceneContent(scene.yamlContent);

    yaml += `  - number: ${scene.sceneNum}\n`;
    yaml += `    location: ${escapeYaml(scene.location)}\n`;
    yaml += `    time_of_day: ${escapeYaml(scene.timeOfDay)}\n`;

    if (script) {
      yaml += `    indoor: ${script.indoor}\n`;
      if (script.charactersInScene && script.charactersInScene.length > 0) {
        yaml += `    characters:\n`;
        for (const c of script.charactersInScene) {
          yaml += `      - ${escapeYaml(c)}\n`;
        }
      }
      yaml += `    content:\n`;
      for (const block of script.content) {
        yaml += contentBlockToYaml(block, 3) + "\n";
      }
    } else {
      yaml += `    content: |\n`;
      for (const line of scene.yamlContent.split("\n")) {
        yaml += `      ${line}\n`;
      }
    }
    yaml += `\n`;
  }

  return yaml;
}

// ─── Final Draft XML (.fdx) 导出 ──────────────────────

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** 根据场景信息生成 Scene Heading 文本 */
function makeSceneHeading(scene: SceneExportData, script: ScriptOutput | null): string {
  const indoor = script?.indoor ?? true;
  const prefix = indoor ? "INT." : "EXT.";
  return `${prefix} ${scene.location} - ${scene.timeOfDay}`;
}

function contentBlockToFdx(block: ContentBlockType): string {
  switch (block.type) {
    case "action":
      return `<Paragraph Type="Action">\n<Text>${escapeXml(block.text)}</Text>\n</Paragraph>`;

    case "dialogue": {
      let xml = `<Paragraph Type="Character">\n<Text>${escapeXml(block.character)}</Text>\n</Paragraph>\n`;
      if (block.emotion) {
        xml += `<Paragraph Type="Parenthetical">\n<Text>(${escapeXml(block.emotion)})</Text>\n</Paragraph>\n`;
      }
      xml += `<Paragraph Type="Dialogue">\n<Text>${escapeXml(block.line)}</Text>\n</Paragraph>`;
      return xml;
    }

    case "transition":
      return `<Paragraph Type="Transition">\n<Text>${escapeXml(block.text)}</Text>\n</Paragraph>`;
  }
}

export function toFdx(novel: NovelExportData): string {
  let xml = "";
  xml += `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<FinalDraft DocumentType="Script" Template="No" Version="5">\n`;
  xml += `  <Content>\n`;

  for (const scene of novel.scenes) {
    const script = parseSceneContent(scene.yamlContent);

    // Scene Heading
    const heading = makeSceneHeading(scene, script);
    xml += `    <Paragraph Type="Scene Heading">\n`;
    xml += `      <Text>${escapeXml(heading)}</Text>\n`;
    xml += `    </Paragraph>\n`;

    if (script) {
      for (const block of script.content) {
        const fdxBlock = contentBlockToFdx(block)
          .split("\n")
          .map((line) => `    ${line}`)
          .join("\n");
        xml += fdxBlock + "\n";
      }
    } else {
      // 旧格式：整个作为 Action 文本
      xml += `    <Paragraph Type="Action">\n`;
      xml += `      <Text>${escapeXml(scene.yamlContent)}</Text>\n`;
      xml += `    </Paragraph>\n`;
    }

    xml += "\n";
  }

  xml += `  </Content>\n`;
  xml += `</FinalDraft>\n`;
  return xml;
}

// ─── Fountain 导出 ─────────────────────────────────────

function contentBlockToFountain(block: ContentBlockType): string {
  switch (block.type) {
    case "action":
      return block.text + "\n";
    case "dialogue": {
      let f = `\n${block.character.toUpperCase()}`;
      if (block.emotion) f += ` (${block.emotion})`;
      f += `\n${block.line}\n`;
      return f;
    }
    case "transition":
      return `\n> ${block.text}\n`;
  }
}

export function toFountain(novel: NovelExportData): string {
  let fountain = "";
  fountain += `Title: ${novel.title}\n`;
  fountain += `Credit: AI Generated (NovaScriptTool)\n`;
  fountain += `Source: NovaScriptTool v1.2\n`;
  fountain += `Draft date: ${new Date().toISOString().split("T")[0]}\n\n`;

  fountain += `=== ${novel.title} ===\n\n`;

  for (const scene of novel.scenes) {
    const script = parseSceneContent(scene.yamlContent);
    const heading = makeSceneHeading(scene, script);

    // Fountain scene heading: starts with INT./EXT. or "." or "#"
    fountain += `\n.${heading}\n\n`;

    if (script) {
      for (const block of script.content) {
        fountain += contentBlockToFountain(block);
      }
    } else {
      fountain += `${scene.yamlContent}\n`;
    }

    fountain += "\n";
  }

  return fountain;
}

// ─── 主入口 ────────────────────────────────────────────

export function exportNovel(novel: NovelExportData, format: ExportFormat): string {
  switch (format) {
    case "yaml":
      return toYaml(novel);
    case "fdx":
      return toFdx(novel);
    case "fountain":
      return toFountain(novel);
  }
}

export function getContentType(format: ExportFormat): string {
  switch (format) {
    case "yaml":
      return "text/yaml; charset=utf-8";
    case "fdx":
      return "application/xml; charset=utf-8";
    case "fountain":
      return "text/plain; charset=utf-8";
  }
}

export function getFileExtension(format: ExportFormat): string {
  switch (format) {
    case "yaml":
      return ".yaml";
    case "fdx":
      return ".fdx";
    case "fountain":
      return ".fountain";
  }
}

/**
 * 检查内容是否为结构化数据
 */
export { isStructured };

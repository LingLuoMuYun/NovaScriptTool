import { diffLines, Change } from "diff";

export interface DiffLine {
  type: "added" | "removed" | "unchanged";
  lines: string[];
  oldLineNum?: number;
  newLineNum?: number;
}

/**
 * 对两个 YAML 字符串进行行级语义化对比
 * 返回结构化的差异数组，前端可直接渲染双栏对比视图
 */
export function diffYaml(oldYaml: string, newYaml: string): DiffLine[] {
  const changes: Change[] = diffLines(oldYaml, newYaml);
  const result: DiffLine[] = [];

  let oldLine = 1;
  let newLine = 1;

  for (const change of changes) {
    const lines = change.value.replace(/\n$/, "").split("\n");
    const isAdded = change.added === true;
    const isRemoved = change.removed === true;

    if (isAdded) {
      result.push({
        type: "added",
        lines,
        newLineNum: newLine,
      });
      newLine += lines.length;
    } else if (isRemoved) {
      result.push({
        type: "removed",
        lines,
        oldLineNum: oldLine,
      });
      oldLine += lines.length;
    } else {
      result.push({
        type: "unchanged",
        lines,
        oldLineNum: oldLine,
        newLineNum: newLine,
      });
      oldLine += lines.length;
      newLine += lines.length;
    }
  }

  return result;
}

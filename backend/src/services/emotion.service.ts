/**
 * 情感曲线分析引擎（规则引擎 MVP）
 * 通过中文情感词典匹配，分析剧本场景的情感走向
 * 后续可升级为 AI + 词典混合方案
 */

// 中文情感词典
const EMOTION_LEXICON: Record<string, string[]> = {
  positive: [
    "笑", "喜", "乐", "温暖", "幸福", "希望", "坚定", "拥抱",
    "胜利", "成功", "爱", "信任", "感动", "释然", "平静", "安心",
    "鼓励", "赞美", "欢", "悦", "欣", "慰", "满足", "骄傲",
    "自信", "勇敢", "温柔", "善良", "美好", "光明", "团圆",
  ],
  negative: [
    "怒", "悲", "哭", "恐惧", "绝望", "痛苦", "颤抖", "失败",
    "恨", "死", "黑暗", "背叛", "孤独", "后悔", "压抑", "悲伤",
    "愤怒", "哀", "忧", "愁", "焦虑", "不安", "沮丧", "失望",
    "崩溃", "无助", "冷漠", "残忍", "阴", "暗", "泪",
  ],
  tension: [
    "突然", "猛然", "危险", "紧急", "阻止", "冲突", "对抗",
    "威胁", "屏息", "紧张", "犹豫", "挣扎", "悬念", "爆发",
    "对峙", "追赶", "逃", "隐藏", "秘密", "揭露", "质问",
    "怀疑", "警惕", "逼近", "瞬间", "骤然",
  ],
};

export interface EmotionResult {
  positive: number;
  negative: number;
  tension: number;
  dominant: "positive" | "negative" | "tension" | "neutral";
}

/**
 * 分析单个场景剧本的情感走向
 * @param yamlContent 场景的 YAML 格式剧本
 * @returns 正面/负面/紧张三项得分及主导情感
 */
export function analyzeSceneEmotion(yamlContent: string): EmotionResult {
  if (!yamlContent || !yamlContent.trim()) {
    return { positive: 25, negative: 25, tension: 25, dominant: "neutral" };
  }

  // 提取 dialogue 块（权重 1.2）
  let dialogueText = "";
  const dMatch = yamlContent.match(/^dialogue:\n([\s\S]*?)(?=^[a-z]+:|\Z)/m);
  if (dMatch) {
    dialogueText = dMatch[1];
  }

  // 提取 action 块（权重 0.8）
  let actionText = "";
  const aMatch = yamlContent.match(/^action:\n([\s\S]*?)(?=^[a-z]+:|\Z)/m);
  if (aMatch) {
    actionText = aMatch[1];
  }

  // 全文（兜底）
  const fullText = yamlContent;

  // 加权统计情感词命中
  const scores = { positive: 0, negative: 0, tension: 0 };

  for (const category of ["positive", "negative", "tension"] as const) {
    const words = EMOTION_LEXICON[category];

    for (const word of words) {
      // dialogue 中匹配（权重 1.2）
      const dCount = (dialogueText.match(new RegExp(word, "g")) || []).length;
      scores[category] += dCount * 1.2;

      // action 中匹配（权重 0.8）
      const aCount = (actionText.match(new RegExp(word, "g")) || []).length;
      scores[category] += aCount * 0.8;

      // 其他区域（权重 0.5）
      const restText = fullText.replace(dialogueText, "").replace(actionText, "");
      const rCount = (restText.match(new RegExp(word, "g")) || []).length;
      scores[category] += rCount * 0.5;
    }
  }

  // 归一化到 0-100
  const maxRaw = Math.max(scores.positive, scores.negative, scores.tension, 1);
  const scale = 100 / maxRaw;

  const positive = Math.round(Math.min(100, scores.positive * scale));
  const negative = Math.round(Math.min(100, scores.negative * scale));
  const tension = Math.round(Math.min(100, scores.tension * scale));

  // 判定主导情感
  let dominant: EmotionResult["dominant"] = "neutral";
  const max = Math.max(positive, negative, tension);
  if (max > 10) {
    if (max === positive) dominant = "positive";
    else if (max === negative) dominant = "negative";
    else dominant = "tension";
  }

  return { positive, negative, tension, dominant };
}

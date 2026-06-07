"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { getNovel, updateCharacter } from "@/lib/api";
import type { Novel, Character } from "@/lib/api";

// ─── 语言风格包类型 ──────────────────────────────────

interface SpeechStyle {
  tone: string;           // 语气：毒舌/温柔/严肃/幽默/冷漠/热血/腹黑/天真/沉稳/自定义
  vocabulary: string;     // 用词：书面语/口语/古风/现代/方言/俚语/自定义
  dialect: string;        // 方言/口音
  catchphrase: string;    // 口头禅
  sentenceLength: string; // 句长偏好：短句/长句/混合
  customNotes: string;    // 自定义备注
}

const DEFAULT_SPEECH_STYLE: SpeechStyle = {
  tone: "",
  vocabulary: "",
  dialect: "",
  catchphrase: "",
  sentenceLength: "",
  customNotes: "",
};

const TONE_OPTIONS = [
  { value: "", label: "未设定" },
  { value: "毒舌", label: "🖐 毒舌" },
  { value: "温柔", label: "🌸 温柔" },
  { value: "严肃", label: "🧐 严肃" },
  { value: "幽默", label: "😄 幽默" },
  { value: "冷漠", label: "❄️ 冷漠" },
  { value: "热血", label: "🔥 热血" },
  { value: "腹黑", label: "🕶️ 腹黑" },
  { value: "天真", label: "🌟 天真" },
  { value: "沉稳", label: "🪨 沉稳" },
  { value: "神经质", label: "🌀 神经质" },
  { value: "傲娇", label: "😤 傲娇" },
  { value: "自定义", label: "✏️ 自定义" },
];

const VOCABULARY_OPTIONS = [
  { value: "", label: "未设定" },
  { value: "书面语", label: "📜 书面语" },
  { value: "口语", label: "💬 口语" },
  { value: "古风", label: "🏮 古风" },
  { value: "现代", label: "📱 现代" },
  { value: "方言", label: "🗣️ 方言" },
  { value: "俚语", label: "🪙 俚语" },
  { value: "自定义", label: "✏️ 自定义" },
];

const SENTENCE_OPTIONS = [
  { value: "", label: "未设定" },
  { value: "短句", label: "⚡ 短句（简洁有力）" },
  { value: "长句", label: "📝 长句（细腻铺陈）" },
  { value: "混合", label: "🔀 混合" },
];

// ─── Props ───────────────────────────────────────────

interface CharacterLabProps {
  novels: Novel[];
}

// ─── 辅助函数 ────────────────────────────────────────

function parseSpeechStyle(raw: string | undefined): SpeechStyle {
  if (!raw || raw === "{}") return { ...DEFAULT_SPEECH_STYLE };
  try {
    return { ...DEFAULT_SPEECH_STYLE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SPEECH_STYLE };
  }
}

function hasSpeechStyle(style: SpeechStyle): boolean {
  return !!(style.tone || style.vocabulary || style.dialect || style.catchphrase || style.sentenceLength || style.customNotes);
}

// ─── 角色卡片 ────────────────────────────────────────

function CharacterStyleCard({
  character,
  onSaved,
}: {
  character: Character;
  onSaved: (c: Character) => void;
}) {
  const [speechStyle, setSpeechStyle] = useState<SpeechStyle>(() =>
    parseSpeechStyle((character as any).speechStyle)
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 解析 Agent 2 角色特征
  let traits: any = {};
  let aliases: string[] = [];
  try { traits = typeof character.traits === "string" ? JSON.parse(character.traits) : character.traits; } catch {}
  try { aliases = typeof character.aliases === "string" ? JSON.parse(character.aliases) : character.aliases; } catch {}

  const roleColor =
    character.roleType === "主角"
      ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
      : character.roleType === "反派"
      ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300"
      : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400";

  const doSave = useCallback(
    async (style: SpeechStyle) => {
      setSaving(true);
      setError("");
      try {
        const updated = await updateCharacter(character.id, {
          speechStyle: style,
        });
        setSaved(true);
        onSaved(updated);
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaved(false), 2000);
      } catch (err: any) {
        setError(err.message || "保存失败");
      } finally {
        setSaving(false);
      }
    },
    [character.id, onSaved]
  );

  const updateField = useCallback(
    <K extends keyof SpeechStyle>(key: K, value: SpeechStyle[K]) => {
      const next = { ...speechStyle, [key]: value };
      setSpeechStyle(next);
      // 防抖自动保存
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => doSave(next), 600);
    },
    [speechStyle, doSave]
  );

  // 清理定时器
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  const configured = hasSpeechStyle(speechStyle);

  return (
    <div
      className={`rounded-xl border bg-white dark:bg-gray-900 p-5 shadow-sm transition ${
        configured
          ? "border-indigo-300 dark:border-indigo-700 ring-1 ring-indigo-100 dark:ring-indigo-900"
          : "border-gray-200 dark:border-gray-700"
      }`}
    >
      {/* 头部：角色名 + 类型 */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h4 className="font-semibold text-gray-800 dark:text-gray-100">
            {character.name}
          </h4>
          {aliases.length > 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              aka {aliases.join(", ")}
            </p>
          )}
          {/* Agent 2 提取的特征 */}
          {traits.personality && traits.personality.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {traits.personality.map((tag: string, i: number) => (
                <span
                  key={i}
                  className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs text-gray-500 dark:text-gray-400"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${roleColor}`}>
            {character.roleType}
          </span>
          {/* 保存状态 */}
          {saving && (
            <span className="text-xs text-yellow-500 animate-pulse">⏳</span>
          )}
          {saved && <span className="text-xs text-green-500">✅</span>}
          {error && (
            <span className="text-xs text-red-500" title={error}>
              ❌
            </span>
          )}
        </div>
      </div>

      {/* Agent 2 参考信息（折叠） */}
      {(traits.identity || traits.goal) && (
        <details className="mb-3 text-xs text-gray-400 dark:text-gray-500">
          <summary className="cursor-pointer hover:text-gray-600 dark:hover:text-gray-300">
            📋 Agent 2 分析详情
          </summary>
          <div className="mt-1 space-y-1 pl-2 border-l-2 border-gray-200 dark:border-gray-700">
            {traits.identity && (
              <p>
                <span className="font-medium">身份:</span> {traits.identity}
              </p>
            )}
            {traits.goal && (
              <p>
                <span className="font-medium">目标:</span> {traits.goal}
              </p>
            )}
            {traits.motivation && (
              <p>
                <span className="font-medium">动机:</span> {traits.motivation}
              </p>
            )}
          </div>
        </details>
      )}

      {/* 🎭 语言风格包编辑器 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
            🎭 语言风格包
          </span>
          {configured && (
            <span className="rounded-full bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 text-[10px] text-indigo-500 dark:text-indigo-400">
              已配置
            </span>
          )}
        </div>

        {/* 语气 */}
        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-400 dark:text-gray-500">
            语气 Tone
          </label>
          <select
            value={speechStyle.tone}
            onChange={(e) => updateField("tone", e.target.value)}
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 focus:outline-none"
          >
            {TONE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* 用词 */}
        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-400 dark:text-gray-500">
            用词风格 Vocabulary
          </label>
          <select
            value={speechStyle.vocabulary}
            onChange={(e) => updateField("vocabulary", e.target.value)}
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 focus:outline-none"
          >
            {VOCABULARY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* 方言 */}
        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-400 dark:text-gray-500">
            方言 / 口音 Dialect
          </label>
          <input
            type="text"
            value={speechStyle.dialect}
            onChange={(e) => updateField("dialect", e.target.value)}
            placeholder="如：东北话、粤语、京腔..."
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 focus:outline-none"
          />
        </div>

        {/* 口头禅 */}
        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-400 dark:text-gray-500">
            口头禅 Catchphrase
          </label>
          <input
            type="text"
            value={speechStyle.catchphrase}
            onChange={(e) => updateField("catchphrase", e.target.value)}
            placeholder='如："真是的"、"嘛"、"好吧好吧"...'
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 focus:outline-none"
          />
        </div>

        {/* 句长偏好 */}
        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-400 dark:text-gray-500">
            句长偏好 Sentence Length
          </label>
          <select
            value={speechStyle.sentenceLength}
            onChange={(e) => updateField("sentenceLength", e.target.value)}
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 focus:outline-none"
          >
            {SENTENCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* 自定义备注 */}
        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-400 dark:text-gray-500">
            自定义备注 Notes
          </label>
          <textarea
            value={speechStyle.customNotes}
            onChange={(e) => updateField("customNotes", e.target.value)}
            rows={2}
            placeholder="补充说明角色的语言特点，AI 生成对白时会参考..."
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 focus:outline-none resize-none"
          />
        </div>
      </div>
    </div>
  );
}

// ─── 主组件 ──────────────────────────────────────────

export default function CharacterLab({ novels }: CharacterLabProps) {
  const [selectedNovelId, setSelectedNovelId] = useState("");
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 只有已分析过的小说（有角色数据）
  const novelsWithCharacters = novels.filter(
    (n) => (n._count?.characters ?? n.characters?.length ?? 0) > 0
  );

  const loadCharacters = useCallback(async (novelId: string) => {
    if (!novelId) {
      setCharacters([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const novel = await getNovel(novelId);
      setCharacters(novel.characters || []);
    } catch (err: any) {
      setError(err.message || "加载角色失败");
      setCharacters([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCharacters(selectedNovelId);
  }, [selectedNovelId, loadCharacters]);

  const handleCharacterSaved = useCallback((updated: Character) => {
    setCharacters((prev) =>
      prev.map((c) => (c.id === updated.id ? updated : c))
    );
  }, []);

  const configuredCount = characters.filter((c) =>
    hasSpeechStyle(parseSpeechStyle((c as any).speechStyle))
  ).length;

  return (
    <section className="mt-12 border-t border-gray-200 dark:border-gray-700 pt-8">
      {/* 标题 + 说明 */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            🎭 角色人设实验室
          </h2>
          <span className="rounded-full bg-indigo-50 dark:bg-indigo-950 px-2.5 py-0.5 text-xs font-medium text-indigo-600 dark:text-indigo-400">
            Character Consistency Lab
          </span>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-2xl">
          基于 Agent 2 提取的角色特征，为每个角色定义「语言风格包」。
          配置后将注入 Agent 4 对白生成，解决 AI 剧本中「千人一面」的痛点。
        </p>
      </div>

      {/* 小说选择器 */}
      {novelsWithCharacters.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 p-8 text-center">
          <p className="text-gray-400 dark:text-gray-500">
            👥 暂无已分析的小说。请先上传小说并运行 AI 分析，提取角色后再使用此功能。
          </p>
        </div>
      ) : (
        <>
          <div className="mb-6 flex items-center gap-3">
            <label className="text-sm font-medium text-gray-600 dark:text-gray-300">
              选择小说：
            </label>
            <select
              value={selectedNovelId}
              onChange={(e) => setSelectedNovelId(e.target.value)}
              className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 focus:outline-none"
            >
              <option value="">-- 选择一部小说 --</option>
              {novelsWithCharacters.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title} ({n._count?.characters ?? n.characters?.length ?? 0} 个角色)
                </option>
              ))}
            </select>
          </div>

          {/* 角色卡片网格 */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <svg
                className="h-6 w-6 animate-spin text-indigo-500"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              <span className="ml-3 text-sm text-gray-400 dark:text-gray-500">
                加载角色...
              </span>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-4 text-sm text-red-600 dark:text-red-400">
              ❌ {error}
            </div>
          ) : characters.length === 0 && selectedNovelId ? (
            <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 p-8 text-center">
              <p className="text-gray-400 dark:text-gray-500">
                该小说暂无角色数据
              </p>
            </div>
          ) : characters.length > 0 ? (
            <>
              {/* 统计条 */}
              <div className="mb-4 flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                <span>
                  共 <strong className="text-gray-700 dark:text-gray-200">{characters.length}</strong> 个角色，
                </span>
                <span>
                  已配置语言风格：
                  <strong
                    className={
                      configuredCount > 0
                        ? "text-green-600 dark:text-green-400"
                        : "text-gray-400"
                    }
                  >
                    {configuredCount}
                  </strong>
                  /{characters.length}
                </span>
                {configuredCount === characters.length && characters.length > 0 && (
                  <span className="text-green-500">✅ 全部就绪</span>
                )}
              </div>

              {/* 卡片网格 */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {characters.map((c) => (
                  <CharacterStyleCard
                    key={c.id}
                    character={c}
                    onSaved={handleCharacterSaved}
                  />
                ))}
              </div>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}

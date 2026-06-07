"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  characters?: string[]; // suggestable character names
  autoFocus?: boolean;
  onCancel?: () => void;
  onSubmit?: () => void;
  submitLabel?: string;
  submitting?: boolean;
}

/**
 * 支持 @提及 自动补全的文本输入组件
 * 输入 @ 时弹出角色名建议列表，类似 Slack/Discord 的 @mention 体验
 */
export default function MentionInput({
  value,
  onChange,
  placeholder = "输入评论... 使用 @ 提及角色",
  rows = 2,
  characters = [],
  autoFocus = false,
  onCancel,
  onSubmit,
  submitLabel = "添加",
  submitting = false,
}: MentionInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIdx, setMentionIdx] = useState(0);
  const [cursorPos, setCursorPos] = useState(0);

  // 检测光标前的 @ 并弹出建议
  const checkForMention = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const pos = textarea.selectionStart;
    const textBeforeCursor = value.substring(0, pos);
    const atMatch = textBeforeCursor.match(/@([^@\s]*)$/);

    if (atMatch) {
      setMentionQuery(atMatch[1].toLowerCase());
      setCursorPos(pos);
      setShowMentions(true);
      setMentionIdx(0);
    } else {
      setShowMentions(false);
      setMentionIdx(0);
    }
  }, [value]);

  const filteredCharacters = characters.filter(
    (name) => name.toLowerCase().includes(mentionQuery)
  );

  const insertMention = (characterName: string) => {
    const textarea = textareaRef.current;
    if (!textarea || !showMentions) return;

    const beforeMention = value.substring(0, cursorPos);
    const afterMention = value.substring(cursorPos);
    const atPos = beforeMention.lastIndexOf("@");
    const newValue = beforeMention.substring(0, atPos) + `@${characterName} ` + afterMention;

    onChange(newValue);
    setShowMentions(false);

    // 恢复光标位置
    const newCursor = atPos + characterName.length + 2; // @name + space
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursor, newCursor);
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showMentions || filteredCharacters.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMentionIdx((prev) => (prev + 1) % filteredCharacters.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMentionIdx((prev) => (prev - 1 + filteredCharacters.length) % filteredCharacters.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertMention(filteredCharacters[mentionIdx]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setShowMentions(false);
    }
  };

  // 点击外部关闭建议
  useEffect(() => {
    const handler = () => setShowMentions(false);
    if (showMentions) {
      setTimeout(() => document.addEventListener("click", handler, { once: true }), 100);
    }
    return () => document.removeEventListener("click", handler);
  }, [showMentions]);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          // 延迟检查以确保 value 已更新
          setTimeout(checkForMention, 0);
        }}
        onKeyUp={(e) => {
          if (["ArrowDown", "ArrowUp", "Enter", "Escape", "Tab"].includes(e.key)) return;
          checkForMention();
        }}
        onKeyDown={handleKeyDown}
        onClick={checkForMention}
        placeholder={placeholder}
        rows={rows}
        autoFocus={autoFocus}
        className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 transition"
      />

      {/* @提及 建议下拉 */}
      {showMentions && filteredCharacters.length > 0 && (
        <div className="absolute left-0 z-50 mt-1 w-56 rounded-lg border border-gray-200 bg-white shadow-lg max-h-40 overflow-y-auto">
          <div className="px-3 py-1.5 text-xs text-gray-400 border-b border-gray-100">
            提及角色
          </div>
          {filteredCharacters.map((name, i) => (
            <button
              key={name}
              onClick={() => insertMention(name)}
              onMouseEnter={() => setMentionIdx(i)}
              className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition ${
                i === mentionIdx ? "bg-indigo-50 text-indigo-700" : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 text-xs flex items-center justify-center font-medium">
                {name[0]}
              </span>
              <span>{name}</span>
            </button>
          ))}
        </div>
      )}

      {/* 操作按钮 */}
      {(onCancel || onSubmit) && (
        <div className="mt-2 flex items-center gap-2 justify-end">
          {onCancel && (
            <button
              onClick={onCancel}
              disabled={submitting}
              className="rounded-lg border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
            >
              取消
            </button>
          )}
          {onSubmit && (
            <button
              onClick={onSubmit}
              disabled={submitting || !value.trim()}
              className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 transition disabled:opacity-50"
            >
              {submitting ? "..." : submitLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

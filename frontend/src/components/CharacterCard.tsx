"use client";

import { Character } from "@/lib/api";

interface CharacterCardProps {
  character: Character;
}

export default function CharacterCard({ character }: CharacterCardProps) {
  let traits: any = {};
  let aliases: string[] = [];
  try {
    traits = typeof character.traits === "string" ? JSON.parse(character.traits) : character.traits;
  } catch {}
  try {
    aliases = typeof character.aliases === "string" ? JSON.parse(character.aliases) : character.aliases;
  } catch {}

  const roleColor =
    character.roleType === "主角"
      ? "bg-amber-100 text-amber-700"
      : character.roleType === "反派"
      ? "bg-red-100 text-red-700"
      : "bg-gray-100 text-gray-600";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">{character.name}</h3>
          {aliases.length > 0 && (
            <p className="text-xs text-gray-400">
              aka {aliases.join(", ")}
            </p>
          )}
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${roleColor}`}>
          {character.roleType}
        </span>
      </div>

      {traits.identity && (
        <div className="mb-2">
          <span className="text-xs text-gray-400">身份</span>
          <p className="text-sm text-gray-700">{traits.identity}</p>
        </div>
      )}

      {traits.personality && traits.personality.length > 0 && (
        <div className="mb-2">
          <span className="text-xs text-gray-400">性格</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {traits.personality.map((tag: string, i: number) => (
              <span
                key={i}
                className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-600"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {traits.goal && (
        <div className="mb-2">
          <span className="text-xs text-gray-400">目标</span>
          <p className="text-sm text-gray-700">{traits.goal}</p>
        </div>
      )}

      {traits.motivation && (
        <div className="mb-2">
          <span className="text-xs text-gray-400">动机</span>
          <p className="text-sm text-gray-700">{traits.motivation}</p>
        </div>
      )}

      {traits.relationships && traits.relationships.length > 0 && (
        <div>
          <span className="text-xs text-gray-400">关系</span>
          <div className="mt-1 space-y-1">
            {traits.relationships.map((rel: any, i: number) => (
              <p key={i} className="text-sm text-gray-600">
                → <span className="font-medium">{rel.with}</span>: {rel.relation}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

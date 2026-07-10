import { claudeJSON } from "../lib/anthropic.js";

const FORMAT_SYSTEM = `You are a text formatter for a student learning platform. You will receive raw lesson content. Do not add new information, do not change the meaning, do not summarize. Your only job is to: break the content into clean concept-level sections of 80-120 words each, fix any sentences that were cut off mid-thought by completing them naturally, remove all inline citations like (Brain Facts), remove markdown formatting like **bold**, and return the result as a JSON array where each item has a "title" string and a "text" string. The text must be complete polished prose with no trailing fragments and no markdown.`;

export interface FormattedStudyBlock {
  title: string;
  text: string;
}

function normalizeBlocks(raw: unknown): FormattedStudyBlock[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? ((raw as Record<string, unknown>).sections ??
          (raw as Record<string, unknown>).items ??
          []) as unknown[]
      : [];

  return list
    .map((item) => {
      const o = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const title = String(o.title ?? o.concept ?? "").trim();
      const text = String(o.text ?? "").trim();
      if (!title || !text) return null;
      return { title, text };
    })
    .filter((b): b is FormattedStudyBlock => b !== null);
}

export async function formatStudyContent(rawContent: string): Promise<FormattedStudyBlock[]> {
  const trimmed = rawContent.trim();
  if (!trimmed) return [];

  const raw = await claudeJSON<unknown>(FORMAT_SYSTEM, trimmed, 6000);
  const blocks = normalizeBlocks(raw);
  if (!blocks.length) throw new Error("Formatter returned no sections");
  return blocks;
}

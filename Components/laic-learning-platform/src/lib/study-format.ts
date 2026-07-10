import { coerceStudyText, sanitizeLessonText } from "./study-sections";

/** Chunk metadata labels like "Emotional Memory & Basic Emotions — 6" */
const CHUNK_LABEL_RE = /^.+[—–-]\s*\d+\s*$/;

export interface FormattedStudyBlock {
  title: string;
  text: string;
  check: string;
}

export function isChunkMetadataLabel(label: string): boolean {
  return CHUNK_LABEL_RE.test(label.trim());
}

export function stripChunkMetadataLabels(text: string): string {
  return text
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line && !isChunkMetadataLabel(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Gather full unit text from one stored Text block — labels stripped, prose only. */
export function extractRawStudyText(content: Record<string, unknown>): string {
  const parts: string[] = [];
  const sections = Array.isArray(content.sections) ? content.sections : [];

  if (sections.length) {
    for (const item of sections) {
      const o = item as Record<string, unknown>;
      const text = coerceStudyText(o.text ?? o.body ?? "");
      const stripped = stripChunkMetadataLabels(text);
      if (stripped) parts.push(stripped);
    }
  } else if (Array.isArray(content.body)) {
    for (const p of content.body) {
      const text = stripChunkMetadataLabels(coerceStudyText(p));
      if (text) parts.push(text);
    }
  } else if (content.body != null) {
    const text = stripChunkMetadataLabels(coerceStudyText(content.body));
    if (text) parts.push(text);
  }

  if (!parts.length && content.text != null) {
    const text = stripChunkMetadataLabels(coerceStudyText(content.text));
    if (text) parts.push(text);
  }
  if (!parts.length && Array.isArray(content.paragraphs)) {
    for (const p of content.paragraphs) {
      const text = stripChunkMetadataLabels(coerceStudyText(p));
      if (text) parts.push(text);
    }
  }

  const joined = parts
    .map((p) => sanitizeLessonText(p))
    .filter(Boolean)
    .join("\n\n");

  return stripChunkMetadataLabels(joined);
}

/** Merge all Text blocks for a module into one raw string for the formatter. */
export function extractRawStudyTextFromBlocks(
  blocks: { content?: Record<string, unknown> }[]
): string {
  const parts = blocks
    .map((b) => extractRawStudyText((b.content ?? {}) as Record<string, unknown>))
    .map((t) => t.trim())
    .filter(Boolean);
  return stripChunkMetadataLabels(parts.join("\n\n"));
}

export function recallCheckForTitle(title: string): string {
  return `In your own words, what is the main idea behind "${title}"?`;
}

const STUDY_SECTION_MAX_WORDS = 120;
const STUDY_SECTION_TARGET_WORDS = 100;

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/** Remove markdown emphasis markers — study prose should not show literal ** */
export function stripMarkdownForStudy(text: string): string {
  return coerceStudyText(text)
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1");
}

function hardSplitWords(text: string, maxWords: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  if (words.length <= maxWords) return [words.join(" ")];
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += maxWords) {
    chunks.push(words.slice(i, i + maxWords).join(" "));
  }
  return chunks;
}

/** Split long prose at sentence boundaries, then by word count — works on single paragraphs. */
export function splitProseByWordCount(
  text: string,
  targetWords = STUDY_SECTION_TARGET_WORDS,
  maxWords = STUDY_SECTION_MAX_WORDS
): string[] {
  const trimmed = stripMarkdownForStudy(stripChunkMetadataLabels(text));
  if (!trimmed) return [];
  if (wordCount(trimmed) <= maxWords) return [trimmed];

  const sentences = trimmed.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
  if (sentences.length > 1) {
    const chunks: string[] = [];
    let buffer = "";
    for (const sentence of sentences) {
      const combined = buffer ? `${buffer} ${sentence}` : sentence;
      if (wordCount(combined) > targetWords && buffer) {
        chunks.push(buffer.trim());
        buffer = sentence;
      } else {
        buffer = combined;
      }
    }
    if (buffer.trim()) chunks.push(buffer.trim());
    return chunks.flatMap((c) => (wordCount(c) > maxWords ? hardSplitWords(c, maxWords) : [c]));
  }

  return hardSplitWords(trimmed, maxWords);
}

/** Split oversized sections so every module paginates the same way (80–120 words). */
export function splitLargeStudyBlocks(
  blocks: { title: string; text: string }[]
): { title: string; text: string }[] {
  const out: { title: string; text: string }[] = [];

  for (const block of blocks) {
    const baseTitle = stripChunkMetadataLabels(stripMarkdownForStudy(block.title)) || "Key concept";
    const text = stripChunkMetadataLabels(stripMarkdownForStudy(block.text));
    if (!text) continue;

    const pieces = splitProseByWordCount(text);
    pieces.forEach((piece, i) => {
      out.push({
        title: pieces.length === 1 ? baseTitle : i === 0 ? baseTitle : `${baseTitle} · ${i + 1}`,
        text: piece,
      });
    });
  }

  return out.length ? out : blocks;
}

export function attachChecks(blocks: { title: string; text: string }[]): FormattedStudyBlock[] {
  return splitLargeStudyBlocks(blocks).map((b) => {
    const title = stripChunkMetadataLabels(stripMarkdownForStudy(b.title));
    const text = stripChunkMetadataLabels(stripMarkdownForStudy(b.text));
    return {
      title,
      text,
      check: recallCheckForTitle(title),
    };
  });
}

/** Single entry point — same study presentation for every module. */
export function finalizeStudyBlocks(blocks: { title: string; text: string }[]): FormattedStudyBlock[] {
  const cleaned = blocks
    .map((b) => ({
      title: stripChunkMetadataLabels(coerceStudyText(b.title)),
      text: stripChunkMetadataLabels(coerceStudyText(b.text)),
    }))
    .filter((b) => b.text.trim());
  if (!cleaned.length) return [];
  return attachChecks(cleaned);
}

export function finalizeStudyBlocksFromRaw(raw: string): FormattedStudyBlock[] {
  const clean = stripChunkMetadataLabels(coerceStudyText(raw));
  if (!clean.trim()) return [];
  return fallbackFormatBlocks(clean);
}

/** Client fallback if the formatter API is unavailable. */
export function fallbackFormatBlocks(raw: string): FormattedStudyBlock[] {
  const clean = stripChunkMetadataLabels(stripMarkdownForStudy(raw));
  if (!clean.trim()) return [];

  const paragraphs = clean.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const sources = paragraphs.length ? paragraphs : [clean];

  const rawBlocks: { title: string; text: string }[] = [];
  let sectionNum = 0;

  for (const para of sources) {
    const pieces = splitProseByWordCount(para);
    for (const piece of pieces) {
      sectionNum += 1;
      rawBlocks.push({
        title: sectionNum === 1 ? "Overview" : `Key concept ${sectionNum}`,
        text: piece,
      });
    }
  }

  return attachChecks(rawBlocks);
}

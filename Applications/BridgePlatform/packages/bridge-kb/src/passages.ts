// Deterministic passage chunking (Knowledge Rework §4, carrying over the
// proven pre-rework design): a document splits into stable, ordered passages
// that citations anchor to; passages group into SECTIONS (heading-delimited)
// that extraction jobs process one at a time. Re-chunking the same text
// yields identical passages — that's what makes citations durable.

import { fnv1a } from "./ids";
import type { KbSourcePassage } from "./model";

/**
 * PDF fonts often encode suit symbols as private-use-area glyphs; unpdf
 * preserves the codepoints, which render as tofu boxes. Map the known suit
 * codes (verified against the ACBL SAYC booklet: "open 1♦ with 4–4 in the
 * minors", "2♦ transfers to hearts, 2♥ to spades", Stayman 2♣) to real
 * glyphs, and drop any other PUA character rather than show a box.
 */
const PUA_SUITS: Record<string, string> = {
  "\uE027": "\u2663", // club
  "\uE03B": "\u2660", // spade
  "\uE06B": "\u2665", // heart
  "\uE06C": "\u2666", // diamond
};

export function normalizeExtractedText(text: string): string {
  return text.replace(/[\uE000-\uF8FF]/g, (ch) => PUA_SUITS[ch] ?? "");
}

/** A heading: short, no terminal period, and either numbered, #-prefixed,
 *  ALL CAPS, or Title Case without sentence punctuation. */
export function looksLikeHeading(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 80) return false;
  if (/[.:;,]$/.test(t)) return false;
  if (/^#{1,6}\s+/.test(t)) return true;
  if (/^\d+(\.\d+)*\s+\S/.test(t)) return true;
  const letters = t.replace(/[^a-zA-Z]/g, "");
  if (letters.length >= 3 && letters === letters.toUpperCase()) return true;
  const words = t.split(/\s+/);
  return (
    words.length <= 8 &&
    words.every((w) => /^[A-Z0-9]/.test(w) || ["and", "or", "of", "the", "to", "a", "in", "over"].includes(w))
  );
}

export interface ChunkedSection {
  /** Stable anchor: the heading text, or the first passage's anchor. */
  anchor: string;
  passageOrdinals: number[];
}

export interface ChunkResult {
  passages: Omit<KbSourcePassage, "sourceId">[];
  sections: ChunkedSection[];
}

const MAX_PASSAGES_PER_SECTION = 14;
const FLAT_PARAGRAPH_THRESHOLD = 1000;
const TARGET_PASSAGE_CHARS = 600;

/**
 * PDF text extraction often yields NO newlines at all (one flat run). Explode
 * an oversized flat paragraph into heading + sentence-grouped pseudo-
 * paragraphs: inline ALL-CAPS runs (≥2 words, or one word ≥6 letters) are
 * treated as section headings — calibrated against real system booklets.
 */
export function explodeFlatText(paragraph: string): string[] {
  const headingRe =
    /(?:\b[A-Z][A-Z0-9&'-]{3,}\b)(?:\s+(?:[A-Z0-9&'-]{2,}|OF|TO|THE|AND|A|IN|ON|BY|OR|VS\.?))*/g;
  const cuts: { start: number; end: number; heading: string }[] = [];
  for (const match of paragraph.matchAll(headingRe)) {
    const heading = match[0].trim();
    const words = heading.split(/\s+/);
    const isHeadingRun =
      words.length >= 2 || heading.replace(/[^A-Z]/g, "").length >= 6;
    if (isHeadingRun) cuts.push({ start: match.index, end: match.index + match[0].length, heading });
  }

  const out: string[] = [];
  const pushBody = (body: string) => {
    const sentences = body.trim().split(/(?<=[.?!])\s+(?=[A-Z0-9])/);
    let group = "";
    for (const sentence of sentences) {
      if (group && group.length + sentence.length > TARGET_PASSAGE_CHARS) {
        out.push(group.trim());
        group = "";
      }
      group += (group ? " " : "") + sentence;
    }
    if (group.trim()) out.push(group.trim());
  };

  let cursor = 0;
  for (const cut of cuts) {
    if (cut.start > cursor) pushBody(paragraph.slice(cursor, cut.start));
    out.push(cut.heading);
    cursor = cut.end;
  }
  if (cursor < paragraph.length) pushBody(paragraph.slice(cursor));
  return out.filter(Boolean);
}

/**
 * Deterministically chunk a document into citable passages + sections.
 * `opts.scope` (the sourceId at upload time) feeds the passage-id hash so the
 * SAME document uploaded under two sources gets DISJOINT ids — passage_id is
 * the global primary key, and unscoped ids collide across sources. Ids stay
 * stable per (scope, ordinal, text), so re-uploading an unchanged document to
 * the same source keeps citations intact. Section-only callers omit it.
 */
export function chunkDocument(text: string, opts?: { scope?: string }): ChunkResult {
  const scopePrefix = opts?.scope ? `${opts.scope}\n` : "";
  const paragraphs = text
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    // Flat extractions (PDFs) arrive as one huge run: explode those.
    .flatMap((p) => (p.length > FLAT_PARAGRAPH_THRESHOLD ? explodeFlatText(p) : [p]));

  const passages: Omit<KbSourcePassage, "sourceId">[] = [];
  const sections: ChunkedSection[] = [];
  let current: ChunkedSection | null = null;

  const startSection = (anchor: string): ChunkedSection => {
    const next: ChunkedSection = { anchor, passageOrdinals: [] };
    sections.push(next);
    current = next;
    return next;
  };

  for (const para of paragraphs) {
    const firstLine = para.split(/\r?\n/)[0]!;
    const isHeading = looksLikeHeading(firstLine) && para === firstLine;

    if (isHeading) {
      // Headings start sections and are recorded as citable locator passages.
      startSection(firstLine.replace(/^#{1,6}\s+/, "").trim());
    }

    const ordinal = passages.length;
    const anchor = firstLine.slice(0, 72);
    passages.push({
      passageId: `pp_${ordinal}_${fnv1a(scopePrefix + para)}`,
      ordinal,
      anchor,
      text: para,
    });

    // TS can't see the closure assignment to `current`; assert the union.
    let target = current as ChunkedSection | null;
    if (!target || (!isHeading && target.passageOrdinals.length >= MAX_PASSAGES_PER_SECTION)) {
      target = startSection(anchor);
    }
    target.passageOrdinals.push(ordinal);
  }

  return { passages, sections: sections.filter((s) => s.passageOrdinals.length > 0) };
}

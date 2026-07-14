// Deterministic passage chunking (Knowledge Rework §4, carrying over the
// proven pre-rework design): a document splits into stable, ordered passages
// that citations anchor to; passages group into SECTIONS (heading-delimited)
// that extraction jobs process one at a time. Re-chunking the same text
// yields identical passages — that's what makes citations durable.

import { fnv1a } from "./ids";
import type { KbSourcePassage } from "./model";

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

export function chunkDocument(text: string): ChunkResult {
  const paragraphs = text
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);

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
      passageId: `pp_${ordinal}_${fnv1a(para)}`,
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

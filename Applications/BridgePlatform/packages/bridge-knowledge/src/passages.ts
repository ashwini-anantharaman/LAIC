// Deterministic passage chunking for uploaded source documents (Bridge plan
// §12.4). Same text always yields the same passages/anchors, so citations
// written today still resolve after re-uploads of identical content.

import type { SourcePassage } from "./model";

const MAX_PASSAGE_CHARS = 1400;

/** Split into paragraph-grouped passages of at most MAX_PASSAGE_CHARS. */
export function chunkSourceText(sourceId: string, text: string): SourcePassage[] {
  const normalized = text.replace(/\r\n/g, "\n");
  const paragraphs: Array<{ text: string; start: number }> = [];
  const re = /[^\n][\s\S]*?(?=\n\s*\n|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized))) {
    const t = m[0].trim();
    if (t) paragraphs.push({ text: t, start: m.index });
    if (re.lastIndex === m.index) re.lastIndex++;
  }

  // Hard-split any paragraph longer than the cap (dense PDFs often extract
  // as one giant block).
  const units: Array<{ text: string; start: number }> = [];
  for (const p of paragraphs) {
    if (p.text.length <= MAX_PASSAGE_CHARS) {
      units.push(p);
      continue;
    }
    for (let i = 0; i < p.text.length; i += MAX_PASSAGE_CHARS) {
      units.push({ text: p.text.slice(i, i + MAX_PASSAGE_CHARS), start: p.start + i });
    }
  }

  // Group consecutive units into passages up to the cap.
  const passages: SourcePassage[] = [];
  let buf: string[] = [];
  let bufStart = 0;
  let bufLen = 0;
  const flush = (end: number) => {
    if (!buf.length) return;
    const ordinal = passages.length;
    passages.push({
      passageId: `${sourceId}#p${ordinal}`,
      sourceId,
      ordinal,
      anchor: `¶${ordinal} (chars ${bufStart}–${end})`,
      text: buf.join("\n\n"),
    });
    buf = [];
    bufLen = 0;
  };
  for (const u of units) {
    if (bufLen > 0 && bufLen + u.text.length + 2 > MAX_PASSAGE_CHARS) {
      flush(u.start);
    }
    if (bufLen === 0) bufStart = u.start;
    buf.push(u.text);
    bufLen += u.text.length + 2;
  }
  flush(normalized.length);
  return passages;
}

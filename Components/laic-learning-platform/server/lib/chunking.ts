import type { ExtractedSegment } from "./extract.js";

/** ~500-1000 token chunks with ~100 token overlap (char-based approximation) */
export function chunkText(text: string, chunkSize = 3500, overlap = 700): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < cleaned.length) {
    const end = Math.min(start + chunkSize, cleaned.length);
    chunks.push(cleaned.slice(start, end));
    if (end >= cleaned.length) break;
    start = end - overlap;
  }
  return chunks;
}

export interface ProvenancedChunk {
  content: string;
  pageStart?: number;
  pageEnd?: number;
  timeStart?: number;
  timeEnd?: number;
}

/**
 * Chunk extracted segments while preserving provenance. Segments (PDF pages,
 * transcript captions) are packed into ~chunkSize character chunks; each chunk
 * records the page/time range of the segments it contains. Oversized single
 * segments are split with the plain chunker, inheriting that segment's range.
 */
export function chunkSegments(
  segments: ExtractedSegment[],
  chunkSize = 3500
): ProvenancedChunk[] {
  const chunks: ProvenancedChunk[] = [];
  let buf: ExtractedSegment[] = [];
  let bufLen = 0;

  const flush = () => {
    if (!buf.length) return;
    const content = buf.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim();
    if (content) {
      const pages = buf.map((s) => s.page).filter((p): p is number => p !== undefined);
      const starts = buf.map((s) => s.timeStart).filter((t): t is number => t !== undefined);
      const ends = buf.map((s) => s.timeEnd).filter((t): t is number => t !== undefined);
      chunks.push({
        content,
        pageStart: pages.length ? Math.min(...pages) : undefined,
        pageEnd: pages.length ? Math.max(...pages) : undefined,
        timeStart: starts.length ? Math.min(...starts) : undefined,
        timeEnd: ends.length ? Math.max(...ends) : undefined,
      });
    }
    buf = [];
    bufLen = 0;
  };

  for (const seg of segments) {
    const text = seg.text.replace(/\s+/g, " ").trim();
    if (!text) continue;

    if (text.length > chunkSize) {
      flush();
      for (const piece of chunkText(text, chunkSize)) {
        chunks.push({
          content: piece,
          pageStart: seg.page,
          pageEnd: seg.page,
          timeStart: seg.timeStart,
          timeEnd: seg.timeEnd,
        });
      }
      continue;
    }

    if (bufLen + text.length > chunkSize) flush();
    buf.push({ ...seg, text });
    bufLen += text.length + 1;
  }
  flush();
  return chunks;
}

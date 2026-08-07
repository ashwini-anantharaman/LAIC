import * as pdfjsLib from 'pdfjs-dist';
// Vite resolves this to a hashed URL for the worker bundle.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Always re-assign — after Vite HMR the old worker URL can go stale and hang forever.
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export interface DocSentence {
  text: string;
  page: number;
}

export interface ParsedDoc {
  fileName: string;
  pageCount: number;
  sentences: DocSentence[];
  /** Sanitized article HTML from a website ingest — preserves page formatting in Markup. */
  html?: string;
  sourceUrl?: string;
}

export type ParseProgress = { page: number; total: number };

/** Soft cap so a huge PDF can't freeze the tab for minutes. */
const MAX_PAGES = 80;
const PARSE_TIMEOUT_MS = 30_000;

/** Alphanumeric length — keep short titles/headings, drop page-number junk. */
const MIN_UNIT_ALNUM = 2;

function splitPunctuatedBlock(block: string): string[] {
  const normalized = block.replace(/[ \t]+/g, ' ').trim();
  if (!normalized) return [];
  // Break on sentence-ending punctuation followed by a space; keep the punctuation.
  const raw = normalized.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) || [normalized];
  return raw
    .map((s) => s.trim())
    .filter((s) => s.replace(/[^A-Za-z0-9]/g, '').length >= MIN_UNIT_ALNUM);
}

/**
 * Split a blob of page text into markup units (sentences + titles/headings).
 * Newlines are treated as unit boundaries so short headings stay selectable.
 */
export function splitSentences(text: string): string[] {
  const raw = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return [];
  // Prefer line/paragraph boundaries first (titles, headings, list lines).
  const blocks = raw.split(/\n+/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length <= 1) {
    return splitPunctuatedBlock(raw.replace(/\s+/g, ' '));
  }
  const out: string[] = [];
  for (const block of blocks) {
    // Short / title-like lines: keep whole (no period required).
    const alnum = block.replace(/[^A-Za-z0-9]/g, '').length;
    if (alnum < MIN_UNIT_ALNUM) continue;
    if (alnum <= 80 && !/[.!?]/.test(block)) {
      out.push(block.replace(/\s+/g, ' ').trim());
      continue;
    }
    out.push(...splitPunctuatedBlock(block));
  }
  return out;
}

/** Build a ParsedDoc from a raw block of text (paste / transcript). */
export function docFromText(text: string, title: string): ParsedDoc {
  const sentences = splitSentences(text).map((t) => ({ text: t, page: 1 }));
  return { fileName: title || 'Pasted text', pageCount: 1, sentences };
}

/**
 * Combine multiple sources (PDF + paste + YouTube + web, etc.) into one Mark-up doc.
 * Each source keeps its own page numbering; titles are joined for the combined name.
 */
export function mergeDocs(docs: ParsedDoc[]): ParsedDoc | null {
  const usable = docs.filter((d) => d && (d.sentences?.length || d.fileName));
  if (!usable.length) return null;
  if (usable.length === 1) return usable[0];

  const sentences: DocSentence[] = [];
  let pageOffset = 0;
  for (const d of usable) {
    const localMax = d.sentences.reduce((m, s) => Math.max(m, s.page || 1), d.pageCount || 1);
    for (const s of d.sentences) {
      sentences.push({ text: s.text, page: pageOffset + (s.page || 1) });
    }
    pageOffset += Math.max(localMax, d.pageCount || 1);
  }
  return {
    fileName: usable.map((d) => d.fileName).filter(Boolean).join(' · '),
    pageCount: pageOffset || usable.length,
    sentences,
  };
}

/**
 * Extract text from a PDF File entirely in the browser (no upload/backend).
 * Copies the buffer and tears down the loading task so a hung Vite worker
 * can't leave the UI stuck on "Reading your PDF…".
 */
export async function parsePdf(
  file: File,
  onProgress?: (p: ParseProgress) => void,
): Promise<ParsedDoc> {
  // Re-bind worker each call (HMR can invalidate the previous workerSrc).
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

  const data = await file.arrayBuffer();
  // Fresh copy — getDocument may transfer/detach the underlying buffer.
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(data.slice(0)),
    isEvalSupported: false,
  });

  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    try { loadingTask.destroy(); } catch { /* ignore */ }
  }, PARSE_TIMEOUT_MS);

  try {
    const pdf = await loadingTask.promise;
    const total = Math.min(pdf.numPages, MAX_PAGES);
    const sentences: DocSentence[] = [];

    try {
      for (let pageNum = 1; pageNum <= total; pageNum++) {
        if (timedOut) throw new Error('PDF parse timed out');
        onProgress?.({ page: pageNum, total });
        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();
        // Preserve line breaks from Y-position so titles/headings stay their own units.
        let lastY: number | null = null;
        const chunks: string[] = [];
        for (const item of content.items) {
          if (!('str' in item) || !item.str) continue;
          const y = Array.isArray((item as { transform?: number[] }).transform)
            ? (item as { transform: number[] }).transform[5]
            : null;
          if (lastY != null && y != null && Math.abs(y - lastY) > 2) chunks.push('\n');
          else if (chunks.length && !/\s$/.test(chunks[chunks.length - 1]) && !/^\s/.test(item.str)) {
            chunks.push(' ');
          }
          chunks.push(item.str);
          if (y != null) lastY = y;
        }
        const pageText = chunks.join('');
        for (const s of splitSentences(pageText)) {
          sentences.push({ text: s, page: pageNum });
        }
      }
    } finally {
      try { await pdf.destroy(); } catch { /* ignore */ }
    }

    return { fileName: file.name, pageCount: pdf.numPages, sentences };
  } catch (e) {
    if (timedOut) {
      throw new Error('Timed out reading the PDF. Hard-refresh the page (Cmd+Shift+R) and try again.');
    }
    throw e;
  } finally {
    window.clearTimeout(timer);
    try { await loadingTask.destroy(); } catch { /* ignore */ }
  }
}

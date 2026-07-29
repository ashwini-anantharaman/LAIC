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
}

export type ParseProgress = { page: number; total: number };

/** Soft cap so a huge PDF can't freeze the tab for minutes. */
const MAX_PAGES = 80;
const PARSE_TIMEOUT_MS = 30_000;

/** Split a blob of page text into reasonably clean sentences. */
export function splitSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  // Break on sentence-ending punctuation followed by a space; keep the punctuation.
  const raw = normalized.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) || [normalized];
  return raw
    .map((s) => s.trim())
    // Drop tiny fragments (page numbers, stray tokens) but keep real sentences.
    .filter((s) => s.replace(/[^A-Za-z0-9]/g, '').length >= 12);
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
        const pageText = content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ');
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

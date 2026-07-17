import * as pdfjsLib from 'pdfjs-dist';
// Vite resolves this to a hashed URL for the worker bundle.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

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

/** Extract text from a PDF File entirely in the browser (no upload/backend). */
export async function parsePdf(file: File): Promise<ParsedDoc> {
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const sentences: DocSentence[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    for (const s of splitSentences(pageText)) {
      sentences.push({ text: s, page: pageNum });
    }
  }

  return { fileName: file.name, pageCount: pdf.numPages, sentences };
}

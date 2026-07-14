// Source document upload: text/markdown ingest directly; PDFs are
// text-extracted (unpdf). Documents replace wholesale per source; passages
// re-chunk deterministically (citations anchor to passages).

import { chunkDocument, type KbSourceDocument, type KbSourcePassage } from "@bridge/kb";
import { kbStore } from "./kb";

export async function fileToText(file: File): Promise<string> {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }
  return file.text();
}

export async function uploadDocument(
  sourceId: string,
  fileName: string,
  mediaType: string,
  text: string,
): Promise<{ document: KbSourceDocument; passageCount: number; sectionCount: number }> {
  const store = kbStore();
  const document: KbSourceDocument = {
    sourceId,
    fileName,
    mediaType,
    charCount: text.length,
    uploadedAt: new Date().toISOString(),
    text,
  };
  await store.putDocument(document);

  const { passages, sections } = chunkDocument(text);
  const full: KbSourcePassage[] = passages.map((p) => ({ ...p, sourceId }));
  await store.replacePassages(sourceId, full);
  return { document, passageCount: full.length, sectionCount: sections.length };
}

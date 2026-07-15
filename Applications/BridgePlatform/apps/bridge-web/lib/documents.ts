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

/** Sections of a source's document that no completed job has covered yet. */
export async function pendingSections(kbId: string, sourceId: string) {
  const store = kbStore();
  const doc = await store.getDocument(sourceId);
  if (!doc) return { total: 0, remaining: [] as { anchor: string; passages: KbSourcePassage[] }[] };
  const passages = await store.listPassages(sourceId);
  const byOrdinal = new Map(passages.map((p) => [p.ordinal, p]));
  const { sections } = chunkDocument(doc.text);
  const done = new Set(
    (await store.listJobsForKb(kbId))
      .filter((j) => j.sourceId === sourceId && j.status === "completed")
      .flatMap((j) => j.passageOrdinals),
  );
  const remaining = sections
    .filter((s) => !s.passageOrdinals.every((o) => done.has(o)))
    .map((s) => ({
      anchor: s.anchor,
      passages: s.passageOrdinals.map((o) => byOrdinal.get(o)!).filter(Boolean),
    }));
  return { total: sections.length, remaining };
}

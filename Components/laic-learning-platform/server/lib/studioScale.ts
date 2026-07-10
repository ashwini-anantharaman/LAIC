import { config } from "./config.js";
import type { DraftCourseStructure } from "./lessonNormalize.js";

/** Scale module count to how much source material was indexed. */
export function moduleCapForCorpus(chunkCount: number, hardMax = config.studioMaxModules || 24): number {
  if (chunkCount <= 20) return Math.min(hardMax, Math.max(3, Math.ceil(chunkCount / 5)));
  if (chunkCount <= 50) return Math.min(hardMax, Math.max(4, Math.ceil(chunkCount / 6)));
  if (chunkCount <= 100) return Math.min(hardMax, Math.max(5, Math.ceil(chunkCount / 8)));
  if (chunkCount <= 180) return Math.min(hardMax, Math.max(8, Math.ceil(chunkCount / 10)));
  return hardMax;
}

export function corpusScaleHint(chunkCount: number): string {
  const cap = moduleCapForCorpus(chunkCount);
  if (chunkCount <= 50) {
    return `UPLOAD SIZE: Only ${chunkCount} indexed chunks (~a short PDF or excerpt). Create ${cap} modules or fewer, covering ONLY topics with actual text in the sources. Do NOT invent modules for every chapter in a book's table of contents if the full chapter is not in the upload.`;
  }
  if (chunkCount <= 100) {
    return `UPLOAD SIZE: ${chunkCount} indexed chunks (~a medium document). Use roughly ${cap} modules grouped by major themes in the sources.`;
  }
  return "";
}

/** True when TOC-based one-module-per-chapter structure matches the indexed material. */
export function isFullTextbookCorpus(chunkCount: number, tocChapterCount: number): boolean {
  return tocChapterCount >= 8 && chunkCount >= 80;
}

export function trimDraftToModuleCap(draft: DraftCourseStructure, cap: number): DraftCourseStructure {
  const chapters = draft.chapters ?? [];
  const slots: { ci: number; mi: number }[] = [];
  for (let ci = 0; ci < chapters.length; ci++) {
    for (let mi = 0; mi < (chapters[ci]?.modules?.length ?? 0); mi++) slots.push({ ci, mi });
  }
  if (slots.length <= cap) return draft;

  const keep = new Set(slots.slice(0, cap).map(({ ci, mi }) => `${ci}:${mi}`));
  const trimmed = chapters
    .map((ch, ci) => ({
      ...ch,
      modules: ch.modules?.filter((_, mi) => keep.has(`${ci}:${mi}`)) ?? [],
    }))
    .filter((ch) => ch.modules.length > 0);
  const names = new Set(trimmed.flatMap((ch) => ch.modules.map((m) => m.name)));
  return {
    ...draft,
    chapters: trimmed,
    prerequisiteEdges: (draft.prerequisiteEdges ?? []).filter((e) => names.has(e.from) && names.has(e.to)),
    message: `${draft.message ?? ""} Trimmed to ${cap} modules for upload size.`.trim(),
  };
}

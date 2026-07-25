// Pure helpers shared by the "new knowledge base from a document" wizard page
// and its actions. Everything here is deterministic: the wizard keeps NO state
// of its own — each GET recomputes the stage from the store (the source-audit
// discipline), so a reload, a back button, or a fresh browser all land on the
// same step.

import type {
  KbExtractionJob,
  KbSourceDocument,
  KbSourcePassage,
  KnowledgeItem,
} from "@bridge/kb";

export const WIZARD_PATH = "/bridge/kb/new-from-document";

/** Pages read per click. One click = one serverless invocation. */
export const PAGE_BATCH = 8;

/**
 * Hard cap on the posted PDF. Note the SERVER's own request-body limit is
 * smaller (next.config serverActions.bodySizeLimit = 4mb, and hosted
 * serverless caps bodies around 4.5 MB), so in practice a deck has to be a few
 * MB — the 88-page teaching deck is 2.5 MB. The cap here is the honest outer
 * bound for the stored object.
 */
export const MAX_PDF_BYTES = 50_000_000;

export type DocSection = { title: string; fromPage: number; toPage: number };

/** Build a wizard URL; empty/undefined params are dropped. */
export function wizardUrl(
  params: Readonly<Record<string, string | number | undefined>>,
): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    qs.set(key, String(value));
  }
  const query = qs.toString();
  return query ? `${WIZARD_PATH}?${query}` : WIZARD_PATH;
}

/** A visual document is one the wizard stored a PDF for and read page by page. */
export function isVisualDoc(doc: KbSourceDocument | null | undefined): boolean {
  return Boolean(doc && doc.ingestMode === "visual" && doc.storagePath);
}

/** Page numbers that already have a reading (visual passages: ordinal = page). */
export function readPages(passages: readonly KbSourcePassage[]): number[] {
  return [...new Set(passages.map((p) => p.ordinal))].sort((a, b) => a - b);
}

/**
 * Normalize an edited section map: trim titles, drop untitled rows, clamp page
 * numbers into the deck, keep from ≤ to, and order by first page. Owner edits
 * and machine proposals go through the same funnel, so what the wizard shows is
 * exactly what extraction will read.
 */
export function normalizeSections(
  rows: readonly Partial<DocSection>[],
  pageCount: number,
): DocSection[] {
  const clamp = (n: number) => Math.min(Math.max(Math.round(n), 1), Math.max(pageCount, 1));
  return rows
    .map((row) => {
      const title = String(row.title ?? "").trim();
      const from = clamp(Number(row.fromPage) || 1);
      const to = clamp(Number(row.toPage) || from);
      return { title, fromPage: Math.min(from, to), toPage: Math.max(from, to) };
    })
    .filter((row) => row.title.length > 0)
    .sort((a, b) => a.fromPage - b.fromPage || a.toPage - b.toPage);
}

/** Read the editable section-map rows a form posted (section:<i>:title|from|to). */
export function parseSectionRows(formData: FormData): Partial<DocSection>[] {
  const rows: Partial<DocSection>[] = [];
  for (const [key, value] of formData.entries()) {
    const match = /^section:(\d+):(title|from|to)$/.exec(key);
    if (!match) continue;
    const index = Number(match[1]);
    const row = (rows[index] ??= {});
    if (match[2] === "title") row.title = String(value);
    else if (match[2] === "from") row.fromPage = Number(value);
    else row.toPage = Number(value);
  }
  return rows.filter(Boolean);
}

export interface SectionProgress {
  /** Items whose citations land inside this section's page range. */
  drafted: number;
  /** …of those, the ones a person has already marked reviewed or approved. */
  reviewed: number;
  /** Completed extraction runs that touched this range. */
  runs: number;
  /** Windows the extractor couldn't structure (shown like the Sources tab does). */
  failures: { anchor: string; reason: string }[];
}

/**
 * A section's state, derived entirely from the store: which items cite pages in
 * its range, and which extraction jobs covered it. For a visual document a job's
 * passageOrdinals ARE page numbers, so a range test is all it takes.
 */
export function sectionProgress(args: {
  section: DocSection;
  sourceId: string;
  items: readonly KnowledgeItem[];
  jobs: readonly KbExtractionJob[];
  pageByPassageId: ReadonlyMap<string, number>;
}): SectionProgress {
  const { section, sourceId, items, jobs, pageByPassageId } = args;
  const inRange = (page: number | undefined) =>
    page !== undefined && page >= section.fromPage && page <= section.toPage;

  const cited = items.filter(
    (item) =>
      item.status !== "deprecated" &&
      item.sourceReferences.some(
        (ref) =>
          ref.sourceId === sourceId &&
          ref.passageId !== undefined &&
          inRange(pageByPassageId.get(ref.passageId)),
      ),
  );
  const touching = jobs.filter(
    (job) => job.sourceId === sourceId && job.passageOrdinals.some((o) => inRange(o)),
  );
  return {
    drafted: cited.length,
    reviewed: cited.filter((i) => i.status === "reviewed" || i.status === "approved").length,
    runs: touching.filter((j) => j.status === "completed").length,
    failures: touching.flatMap((j) => j.failures),
  };
}

/** The chip text the section table shows — deliberately plain language. */
export function sectionChip(progress: SectionProgress): string {
  if (progress.drafted === 0) return progress.runs > 0 ? "read, nothing drafted" : "not started";
  if (progress.reviewed === progress.drafted) return `reviewed · ${progress.drafted} items`;
  if (progress.reviewed > 0)
    return `${progress.reviewed} of ${progress.drafted} items reviewed`;
  return `${progress.drafted} items drafted`;
}

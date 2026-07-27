// One-shot structured extraction machinery (Knowledge Rework §4). The LLM
// extractor is a pluggable function; everything here is deterministic:
// section jobs, output validation (the COMPILER is the schema gate — a
// candidate that won't compile never lands), edge resolution, and the
// failure report for sections extraction couldn't structure.
//
// LLM boundary (unchanged invariant): extraction assistance only. Output is
// attributed, editable content citing exact passages — never decisions.

import { compileKb } from "./compile";
import { newId } from "./ids";
import type { SettingSpec } from "./language";
import type { ItemPayload } from "./model";
import type {
  Citation,
  KbEdge,
  KbExtractionJob,
  KbSourcePassage,
  KnowledgeItem,
  KnowledgePhase,
  KnowledgeType,
} from "./model";
import type { KbService } from "./service";
import type { KbStore } from "./store";

// ---------------------------------------------------------------------------
// What the extractor must return for one section (the one-shot contract)
// ---------------------------------------------------------------------------

export interface ExtractedItem {
  /** Section-local id other extracted items may reference in edges. */
  localId: string;
  title: string;
  humanReadableText: string;
  knowledgeType: KnowledgeType;
  phase: KnowledgePhase;
  payload: ItemPayload;
  settings?: SettingSpec[];
  /** Passage ordinals (within the source) this item is grounded in. */
  citedPassageOrdinals: number[];
  supportedLevels?: string[];
  /**
   * Fellow-facing working notes, never shown to players. Slide extraction uses
   * it for material that is content but not a rule: an Example-column hand, a
   * colour whose meaning the slide never defined, and negative agreements
   * ("Undiscussed, DON'T USE THEM!") which must NOT become rules.
   */
  internalNotes?: string;
}

export interface ExtractedEdge {
  fromLocalId: string;
  edgeType: "requires" | "conflicts_with" | "teaches" | "exception_to";
  /** Local id of another extracted item, or... */
  toLocalId?: string;
  /** ...the title of an item already in the KB (resolved case-insensitively), or... */
  toExistingTitle?: string;
  /** ...a taxonomy concept id (teaches). */
  toConceptId?: string;
}

export interface ExtractorOutput {
  items: ExtractedItem[];
  edges: ExtractedEdge[];
  /** Passages the extractor judged non-actionable (prose, examples, filler). */
  skippedReason?: string;
}

export interface ExtractionSection {
  anchor: string;
  passages: KbSourcePassage[];
  /**
   * VISUAL sources only (a slide deck read page by page): the inclusive
   * 1-indexed page range this section covers. Passage ordinal = page number, so
   * the range is redundant for citation resolution — it is here so an extractor
   * that reads the PAGES (not the transcripts) knows its window even for pages
   * whose passage is missing. Text sections leave it undefined and behave
   * exactly as before.
   */
  pageRange?: PageRange;
}

/** An inclusive, 1-indexed page range of a visual source. */
export interface PageRange {
  fromPage: number;
  toPage: number;
}

/** The pluggable LLM boundary. Throws or returns malformed output → the
 *  section lands in the job's failure report; it never half-lands. */
export type SectionExtractor = (section: ExtractionSection) => Promise<ExtractorOutput>;

// ---------------------------------------------------------------------------
// Materialization: extractor output → validated items + edges
// ---------------------------------------------------------------------------

export interface MaterializedSection {
  items: KnowledgeItem[];
  edges: Omit<KbEdge, "edgeId" | "createdAt">[];
  failures: { anchor: string; reason: string }[];
}

export function materializeExtraction(
  output: ExtractorOutput,
  section: ExtractionSection,
  context: {
    sourceId: string;
    requestedBy: string;
    now: string;
    /** Items already in the KB (edge resolution + duplicate-setting checks). */
    existingItems: KnowledgeItem[];
  },
): MaterializedSection {
  const failures: { anchor: string; reason: string }[] = [];
  const byOrdinal = new Map(section.passages.map((p) => [p.ordinal, p]));

  // 1. Shape candidates into full items (unknown enum values fail fast).
  const candidates: { local: ExtractedItem; item: KnowledgeItem }[] = [];
  for (const local of output.items) {
    const citations: Citation[] = [];
    for (const ordinal of local.citedPassageOrdinals ?? []) {
      const passage = byOrdinal.get(ordinal);
      if (passage)
        citations.push({
          sourceId: context.sourceId,
          passageId: passage.passageId,
          anchor: passage.anchor,
        });
    }
    if (!citations.length) {
      failures.push({
        anchor: `${section.anchor} → ${local.title}`,
        reason: "no valid passage citations — every extracted item must cite its passages",
      });
      continue;
    }
    candidates.push({
      local,
      item: {
        itemId: newId("ki"),
        title: local.title,
        humanReadableText: local.humanReadableText,
        knowledgeType: local.knowledgeType,
        phase: local.phase,
        payload: local.payload,
        settings: local.settings ?? [],
        sourceReferences: citations,
        supportedLevels: local.supportedLevels ?? [],
        // Optional by design: stableStringify drops undefined, so an item
        // without notes hashes exactly as it did before this field existed.
        ...(local.internalNotes?.trim() ? { internalNotes: local.internalNotes.trim() } : {}),
        status: "draft",
        version: 1,
        createdBy: context.requestedBy,
        createdAt: context.now,
        updatedAt: context.now,
      },
    });
  }

  // 2. The compiler IS the schema gate: iteratively drop candidates whose
  //    payloads/settings fail structural validation, keep the rest.
  let accepted = [...candidates];
  for (let round = 0; round < candidates.length + 1; round++) {
    const { errors } = compileKb({
      kbId: "kb_validation",
      version: 1,
      compiledAt: context.now,
      items: [...context.existingItems, ...accepted.map((c) => c.item)],
      edges: [],
      packs: [],
    });
    if (!errors.length) break;
    const failedIds = new Set(errors.map((e) => e.itemId).filter(Boolean));
    const dropped = accepted.filter((c) => failedIds.has(c.item.itemId));
    if (!dropped.length) {
      // Errors not attributable to a candidate (e.g. pre-existing): stop.
      break;
    }
    for (const d of dropped) {
      const reasons = errors
        .filter((e) => e.itemId === d.item.itemId)
        .map((e) => e.message)
        .join("; ");
      failures.push({ anchor: `${section.anchor} → ${d.local.title}`, reason: reasons });
    }
    accepted = accepted.filter((c) => !failedIds.has(c.item.itemId));
  }

  // 3. Resolve edges: local ids → new itemIds; titles → existing KB items.
  const byLocalId = new Map(accepted.map((c) => [c.local.localId, c.item.itemId]));
  const byTitle = new Map(
    context.existingItems.map((i) => [i.title.trim().toLowerCase(), i.itemId]),
  );
  const edges: Omit<KbEdge, "edgeId" | "createdAt">[] = [];
  for (const edge of output.edges ?? []) {
    const fromItemId = byLocalId.get(edge.fromLocalId);
    if (!fromItemId) continue; // its item failed validation — edge dies with it
    let toItemId: string | undefined;
    if (edge.toLocalId) toItemId = byLocalId.get(edge.toLocalId);
    else if (edge.toExistingTitle)
      toItemId = byTitle.get(edge.toExistingTitle.trim().toLowerCase());

    if (edge.edgeType === "teaches" && edge.toConceptId) {
      edges.push({
        fromItemId,
        edgeType: "teaches",
        toConceptId: edge.toConceptId,
        origin: "extracted",
        confirmed: true, // owner decision 12: auto-approve for now
        createdBy: context.requestedBy,
      });
      continue;
    }
    if (!toItemId) {
      failures.push({
        anchor: `${section.anchor} → edge from ${edge.fromLocalId}`,
        reason: `${edge.edgeType} target not found (${edge.toLocalId ?? edge.toExistingTitle ?? "?"})`,
      });
      continue;
    }
    edges.push({
      fromItemId,
      edgeType: edge.edgeType,
      toItemId,
      origin: "extracted",
      confirmed: true,
      createdBy: context.requestedBy,
    });
  }

  return { items: accepted.map((c) => c.item), edges, failures };
}

// ---------------------------------------------------------------------------
// Orchestration: sections → jobs → items in the KB
// ---------------------------------------------------------------------------

export interface RunExtractionOptions {
  kbId: string;
  sourceId: string;
  requestedBy: string;
  /** Section anchors to run (default: all sections of the document). */
  sections: ExtractionSection[];
  now?: () => string;
}

export async function runExtraction(
  store: KbStore,
  service: KbService,
  extractor: SectionExtractor,
  options: RunExtractionOptions,
): Promise<KbExtractionJob[]> {
  const now = options.now ?? (() => new Date().toISOString());
  const jobs: KbExtractionJob[] = [];

  for (const section of options.sections) {
    const job: KbExtractionJob = {
      jobId: newId("xj"),
      kbId: options.kbId,
      sourceId: options.sourceId,
      status: "running",
      passageOrdinals: section.passages.map((p) => p.ordinal),
      createdItemIds: [],
      failures: [],
      requestedBy: options.requestedBy,
      createdAt: now(),
    };
    await store.putJob(job);

    try {
      const output = await extractor(section);
      const existingItems = await store.listItemsForKb(options.kbId);
      const materialized = materializeExtraction(output, section, {
        sourceId: options.sourceId,
        requestedBy: options.requestedBy,
        now: now(),
        existingItems,
      });

      for (const item of materialized.items) {
        await store.putItem(item);
        await store.addMembership({ kbId: options.kbId, itemId: item.itemId });
      }
      for (const edge of materialized.edges) {
        await store.putEdge({ ...edge, edgeId: newId("ke"), createdAt: now() });
      }
      await service.recompile(options.kbId);

      job.status = "completed";
      job.createdItemIds = materialized.items.map((i) => i.itemId);
      job.failures = materialized.failures;
      job.completedAt = now();
    } catch (e) {
      job.status = "failed";
      job.failures = [
        {
          anchor: section.anchor,
          reason: e instanceof Error ? e.message : "extractor error",
        },
      ];
      job.completedAt = now();
    }
    await store.putJob(job);
    jobs.push(job);
  }

  return jobs;
}

// ---------------------------------------------------------------------------
// VISUAL sources: a page-range section is still a section
// ---------------------------------------------------------------------------
//
// A slide deck is read one page per passage (ordinal = page, anchor "page-N")
// and extracted one NAMED SECTION at a time — the owner settles "Opening bids"
// before touching "Responses". Nothing here forks the machinery above: a visual
// section is built into a normal ExtractionSection (plus its pageRange) and run
// through runExtraction, so KbExtractionJob rows, resumability and the
// "needs a person" failure report behave exactly as they do for text.

/** The page range a set of page passages spans (ordinal = page). */
export function pageRangeOfPassages(passages: KbSourcePassage[]): PageRange | null {
  const ordinals = passages.map((p) => p.ordinal).filter((o) => Number.isFinite(o));
  if (!ordinals.length) return null;
  return { fromPage: Math.min(...ordinals), toPage: Math.max(...ordinals) };
}

/**
 * Build the ExtractionSection for one named page range: the anchor is the
 * section's human title (it is what the job's failure report and the review
 * flow show), and the passages are that range's page passages, in page order —
 * citations resolve through them exactly as text citations do.
 */
export function visualExtractionSection(input: {
  title: string;
  fromPage: number;
  toPage: number;
  /** All of the source's page passages; the range is selected here. */
  passages: KbSourcePassage[];
}): ExtractionSection {
  const fromPage = Math.min(input.fromPage, input.toPage);
  const toPage = Math.max(input.fromPage, input.toPage);
  const passages = input.passages
    .filter((p) => p.ordinal >= fromPage && p.ordinal <= toPage)
    .sort((a, b) => a.ordinal - b.ordinal);
  return { anchor: input.title, passages, pageRange: { fromPage, toPage } };
}

export interface RunVisualSectionExtractionOptions {
  kbId: string;
  sourceId: string;
  requestedBy: string;
  /** The ONE named page range to extract now (the owner's per-section click). */
  section: { title: string; fromPage: number; toPage: number };
  /** The source's page passages (ordinal = page). */
  passages: KbSourcePassage[];
  now?: () => string;
}

/**
 * Extract ONE named page-range section. Thin by design: it builds the section
 * and delegates to runExtraction, so the job row, the compiler gate, the
 * citation wiring, the recompile and the failure report are the SAME code paths
 * text extraction uses. Returns that section's job.
 */
export async function runVisualSectionExtraction(
  store: KbStore,
  service: KbService,
  extractor: SectionExtractor,
  options: RunVisualSectionExtractionOptions,
): Promise<KbExtractionJob> {
  const section = visualExtractionSection({
    title: options.section.title,
    fromPage: options.section.fromPage,
    toPage: options.section.toPage,
    passages: options.passages,
  });
  if (!section.passages.length)
    throw new Error(
      `No page passages for "${options.section.title}" (pages ${options.section.fromPage}-${options.section.toPage}) — run the reading pass for those pages first`,
    );
  const jobs = await runExtraction(store, service, extractor, {
    kbId: options.kbId,
    sourceId: options.sourceId,
    requestedBy: options.requestedBy,
    sections: [section],
    ...(options.now ? { now: options.now } : {}),
  });
  const job = jobs[0];
  if (!job) throw new Error("visual extraction produced no job");
  return job;
}

// VISUAL SECTIONS (2026-07-25): the deterministic half of section-by-section
// slide ingestion — the SECTION MAP (a deck's table of contents) and the window
// arithmetic + merge/dedupe an extraction run over those windows needs.
//
// The owner settles one named section ("Opening bids") before touching the
// next, so a section is the unit of work: propose a map once, then extract one
// section at a time. Everything in this file is PURE (no LLM, no store, no
// node built-ins) and unit-tested; the calls live in lib/extraction.ts.
//
// Type-only imports by design: this module must stay safe to import anywhere
// (see the badges.tsx node:fs history — a runtime import from @bridge/* or from
// ./visualIngest would drag server-only code into a bundle and tsc would not
// catch it).

import type { ExtractedEdge, ExtractedItem, ExtractorOutput } from "@bridge/kb";
import type { PageReading } from "./visualIngest";

// ---------------------------------------------------------------------------
// The section map
// ---------------------------------------------------------------------------

/** One named, contiguous page range of a visual source (1-indexed, inclusive). */
export interface VisualSection {
  title: string;
  fromPage: number;
  toPage: number;
}

/** Title given to pages the proposal left uncovered — visible, never silent. */
export const UNSORTED_SECTION_TITLE = "Unsorted pages";

/** Pages per extraction window, and the overlap that carries a table that
 *  continues across a page break into the next window. */
export const DEFAULT_WINDOW_SIZE = 6;
export const DEFAULT_WINDOW_OVERLAP = 1;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Distinct titles: a wizard list with two "Responses" rows is unusable, and
 *  per-section status keys off the title. Deterministic suffixing. */
function withUniqueTitles(sections: VisualSection[]): VisualSection[] {
  const seen = new Map<string, number>();
  return sections.map((s) => {
    const key = normalizeTitle(s.title);
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    return count === 1 ? s : { ...s, title: `${s.title} (${count})` };
  });
}

/**
 * REPAIR a proposed section map into a contiguous, non-overlapping list that
 * covers exactly pages 1..pageCount. Deterministic, so the same bad proposal
 * always repairs the same way:
 *  - non-numeric / unusable entries are dropped; swapped bounds are un-swapped;
 *    bounds are clamped into 1..pageCount; blank titles become "Untitled section"
 *  - entries are sorted by start page; an entry overlapping the previous one is
 *    truncated at the previous end (fully-swallowed entries disappear)
 *  - every remaining gap — leading, interior, trailing — becomes an explicit
 *    "Unsorted pages" section, so no page is silently unextractable.
 */
export function validateSections(raw: unknown, pageCount: number): VisualSection[] {
  const total = Number.isFinite(pageCount) ? Math.trunc(pageCount) : 0;
  if (total < 1) return [];

  const cleaned: VisualSection[] = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    if (typeof entry !== "object" || entry === null) continue;
    const o = entry as Record<string, unknown>;
    let from = Math.trunc(Number(o.fromPage));
    let to = Math.trunc(Number(o.toPage));
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    if (from > to) [from, to] = [to, from];
    from = clamp(from, 1, total);
    to = clamp(to, 1, total);
    const title = typeof o.title === "string" && o.title.trim() ? o.title.trim() : "Untitled section";
    cleaned.push({ title, fromPage: from, toPage: to });
  }
  cleaned.sort((a, b) => a.fromPage - b.fromPage || a.toPage - b.toPage);

  const out: VisualSection[] = [];
  let cursor = 1;
  for (const section of cleaned) {
    const from = Math.max(section.fromPage, cursor);
    if (from > section.toPage) continue; // swallowed by an earlier section
    if (from > cursor)
      out.push({ title: UNSORTED_SECTION_TITLE, fromPage: cursor, toPage: from - 1 });
    out.push({ ...section, fromPage: from });
    cursor = section.toPage + 1;
  }
  if (cursor <= total)
    out.push({ title: UNSORTED_SECTION_TITLE, fromPage: cursor, toPage: total });
  return withUniqueTitles(out);
}

/** The 1-indexed pages of an inclusive range. */
export function pagesInRange(fromPage: number, toPage: number): number[] {
  const out: number[] = [];
  for (let p = Math.max(1, Math.trunc(fromPage)); p <= Math.trunc(toPage); p++) out.push(p);
  return out;
}

/**
 * Split ONE section into extraction windows of at most `size` pages with
 * `overlap` pages of carry-over, so a table continuing across the window's last
 * page is still seen whole. (visualIngest's `pageWindows` is the no-overlap
 * variant used by the reading pass; extraction needs the overlap.)
 */
export function sectionWindows(
  section: { fromPage: number; toPage: number },
  options: { size?: number; overlap?: number } = {},
): { fromPage: number; toPage: number }[] {
  const size = Math.max(1, Math.trunc(options.size ?? DEFAULT_WINDOW_SIZE));
  const overlap = clamp(Math.trunc(options.overlap ?? DEFAULT_WINDOW_OVERLAP), 0, size - 1);
  const step = Math.max(1, size - overlap);
  const from = Math.max(1, Math.trunc(section.fromPage));
  const to = Math.trunc(section.toPage);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return [];

  const out: { fromPage: number; toPage: number }[] = [];
  for (let start = from; start <= to; start += step) {
    const end = Math.min(start + size - 1, to);
    out.push({ fromPage: start, toPage: end });
    if (end >= to) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The section-map prompt (one cheap call over the page readings)
// ---------------------------------------------------------------------------

/** Slides whose own content is a table of contents — worth showing in full. */
const AGENDA_PATTERN =
  /\b(agenda|contents|outline|topics|syllabus|roadmap|programme|program|curriculum|what we(?:'| a|')?ll cover|course plan)\b/i;

export function looksLikeAgendaPage(reading: Pick<PageReading, "title" | "transcript">): boolean {
  if (AGENDA_PATTERN.test(reading.title ?? "")) return true;
  // Only the head of the transcript: a passing mention deep in a table is not
  // an agenda slide.
  return AGENDA_PATTERN.test((reading.transcript ?? "").slice(0, 160));
}

/** One line per page: what the slide is called and how it opens. */
export function digestPageReading(reading: PageReading, maxChars = 220): string {
  const lines = (reading.transcript ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" / ");
  const opening = lines.length > maxChars ? `${lines.slice(0, maxChars)}…` : lines;
  const title = reading.title?.trim() || "(untitled slide)";
  return `p${reading.page} [${reading.kind}] ${title}${opening ? ` — ${opening}` : ""}`;
}

/**
 * Recover page readings from the STORED page passages, so the section map can be
 * proposed (or re-proposed) from the store alone — the reading pass keeps
 * nothing else. Mirrors readingPassageText()'s header
 * ("Page 12 — Responses to 1H [table]"); anything unrecognized degrades to a
 * plain transcript on its ordinal, never to a thrown error.
 */
export function readingsFromPassages(
  passages: readonly { ordinal: number; text: string }[],
): PageReading[] {
  const header = /^Page\s+(\d+)\s*[—–-]\s*(.*?)\s*\[(table|matrix|diagram|prose|mixed)\]\s*\n?/;
  return [...passages]
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((passage) => {
      const match = header.exec(passage.text);
      if (!match) {
        return {
          page: passage.ordinal,
          kind: "mixed" as const,
          title: "",
          transcript: passage.text.trim(),
        };
      }
      const title = match[2] === "(untitled slide)" ? "" : (match[2] ?? "");
      return {
        page: Number(match[1]) || passage.ordinal,
        kind: match[3] as PageReading["kind"],
        title,
        transcript: passage.text.slice(match[0].length).trim(),
      };
    });
}

export const SECTION_MAP_INSTRUCTIONS = `
You are writing the TABLE OF CONTENTS of a bridge teaching deck. You are given a
one-line digest of every page (its slide title and opening lines) and, in full,
any agenda/contents slides the deck itself contains.

Group the pages into named TEACHING SECTIONS — the units a teacher would settle
one at a time ("Opening bids", "Responses to 1H/1S", "Notrump responses",
"Slam bidding", "Competitive auctions", "Play techniques", "Defence and signals").

Return STRICT JSON (no markdown fences, no commentary) of shape:
{"sections":[{"title":"<human topic name>","fromPage":<number>,"toPage":<number>}]}

RULES:
- Sections are CONTIGUOUS and NON-OVERLAPPING and together cover EVERY page from
  1 to the page count given. No page may be left out and none may repeat.
- Titles are topic names a bridge player would recognize — never "Section 3",
  never a page range. Use the deck's own wording where it has some.
- If an agenda/contents slide lists the deck's topics, PREFER those names and
  that order.
- Aim for 4-15 sections; a section is usually 2-15 pages. Do not make one
  section per slide, and do not put the whole deck in one section.
- A table or matrix that CONTINUES across a page break must stay inside ONE
  section — never cut a section boundary through it.
- Title slides, agenda slides, credits and closing slides belong to the section
  they introduce, or to a leading "Front matter" section.
`;

export interface SectionMapPromptInput {
  readings: PageReading[];
  pageCount: number;
  deckTitle?: string;
}

/** Build the (system, user) section-map prompt. Pure — unit-tested. */
export function buildSectionMapPrompt(input: SectionMapPromptInput): {
  system: string;
  user: string;
} {
  const ordered = [...input.readings].sort((a, b) => a.page - b.page);
  const digests = ordered.map((r) => digestPageReading(r)).join("\n");
  const agenda = ordered
    .filter((r) => looksLikeAgendaPage(r))
    .slice(0, 4)
    .map((r) => `[page ${r.page} — ${r.title || "(untitled)"}]\n${r.transcript}`)
    .join("\n\n");
  const parts = [
    input.deckTitle ? `Deck: ${input.deckTitle}` : null,
    `The deck has ${input.pageCount} pages.`,
    "",
    "PAGE DIGESTS (one line per page):",
    digests || "(no page readings available)",
  ];
  if (agenda) parts.push("", "AGENDA / CONTENTS SLIDES (full reading):", agenda);
  parts.push(
    "",
    `Propose the table of contents as strict JSON. Cover pages 1 to ${input.pageCount} exactly once.`,
  );
  return { system: SECTION_MAP_INSTRUCTIONS, user: parts.filter((p) => p !== null).join("\n") };
}

/**
 * Parse a section-map reply. Same JSON-slice idiom as the extractor (first "{"
 * … last "}"), then REPAIRED by validateSections — a proposal with gaps or
 * overlaps still yields a usable map instead of failing the run.
 */
export function parseSectionMapResponse(text: string, pageCount: number): VisualSection[] {
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart)
    throw new Error("section map returned no JSON object");
  const raw = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as { sections?: unknown };
  if (!Array.isArray(raw.sections)) throw new Error("section map output missing sections array");
  return validateSections(raw.sections, pageCount);
}

// ---------------------------------------------------------------------------
// Dedupe context: what the KB already holds, compactly
// ---------------------------------------------------------------------------

export interface DedupeContext {
  existingTitles?: string[];
  existingSettingKeys?: string[];
}

/**
 * The "don't say this twice" block for the extraction prompt. Re-running a
 * section, and the 1-page overlap between windows, both invite duplicates;
 * setting keys are KB-GLOBAL, so a second declaration is a compile error and
 * the item would be dropped.
 */
export function buildDedupeContext(context: DedupeContext, maxTitles = 400): string {
  const titles = (context.existingTitles ?? []).map((t) => t.trim()).filter(Boolean);
  const keys = (context.existingSettingKeys ?? []).map((k) => k.trim()).filter(Boolean);
  if (!titles.length && !keys.length)
    return "This knowledge base is EMPTY — nothing has been extracted yet.";
  const shown = titles.slice(0, maxTitles);
  const parts: string[] = [];
  if (shown.length)
    parts.push(
      `ITEMS ALREADY IN THIS KNOWLEDGE BASE (${titles.length}) — do NOT emit an item with any of these titles; if a slide restates one, skip it (or emit a genuinely different, more specific item with its own title):\n${shown.map((t) => `- ${t}`).join("\n")}${titles.length > shown.length ? `\n- …and ${titles.length - shown.length} more` : ""}`,
    );
  if (keys.length)
    parts.push(
      `SETTING KEYS ALREADY DECLARED (KB-global — reference them with {"$setting":"<key>"} but do NOT declare them again): ${keys.join(", ")}`,
    );
  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// Merging the windows of one section into a single ExtractorOutput
// ---------------------------------------------------------------------------

export interface VisualWindowOutput {
  /** The window's original page numbers (citation fallback + provenance). */
  pages: number[];
  output: ExtractorOutput;
}

export interface MergeVisualOptions extends DedupeContext {
  /** Ordinals a citation may use — the section's pages. Others are dropped. */
  allowedOrdinals?: number[];
}

type SettingSpecs = NonNullable<ExtractedItem["settings"]>;

function edgeKey(edge: ExtractedEdge): string {
  return [
    edge.fromLocalId,
    edge.edgeType,
    edge.toLocalId ?? "",
    normalizeTitle(edge.toExistingTitle ?? ""),
    edge.toConceptId ?? "",
  ].join("|");
}

/**
 * Merge the per-window outputs of ONE section into one ExtractorOutput:
 *  - localIds are namespaced per window (two windows both calling an item "r1"
 *    must not collide), and edges are re-pointed at the namespaced ids
 *  - duplicate items are dropped by title — against the other windows (the
 *    overlap page restates a table) and against the KB (a re-run, or a
 *    neighbouring section). Edges into a dropped duplicate are re-pointed at
 *    the survivor, or at the existing KB item by title
 *  - a duplicate SETTING declaration is stripped (keys are KB-global: declaring
 *    one twice fails the compiler and loses the whole item; the surviving
 *    declaration keeps {"$setting":...} references resolvable)
 *  - citations are clamped to the section's pages, falling back to the window's
 *    own pages so a mis-numbered citation loses provenance detail, not the item.
 */
export function mergeVisualOutputs(
  windows: VisualWindowOutput[],
  options: MergeVisualOptions = {},
): ExtractorOutput {
  const allowed = options.allowedOrdinals ? new Set(options.allowedOrdinals) : null;
  const existingTitles = new Set((options.existingTitles ?? []).map(normalizeTitle));
  const seenSettingKeys = new Set(options.existingSettingKeys ?? []);

  const items: ExtractedItem[] = [];
  /** normalized title → the localId that survived */
  const keptByTitle = new Map<string, string>();
  /** dropped localId → the localId that survived in its place */
  const supersededBy = new Map<string, string>();
  /** dropped localId → the KB item title it duplicated */
  const supersededByExisting = new Map<string, string>();
  const skipped: string[] = [];

  windows.forEach((window, index) => {
    const prefix = `w${index + 1}_`;
    for (const item of window.output.items ?? []) {
      if (!item || typeof item.title !== "string" || !item.title.trim()) continue;
      const localId = `${prefix}${item.localId}`;
      const key = normalizeTitle(item.title);

      if (existingTitles.has(key)) {
        supersededByExisting.set(localId, item.title.trim());
        continue;
      }
      const survivor = keptByTitle.get(key);
      if (survivor) {
        supersededBy.set(localId, survivor);
        continue;
      }

      const cited = (item.citedPassageOrdinals ?? []).filter(
        (o) => Number.isInteger(o) && (!allowed || allowed.has(o)),
      );
      const citedPassageOrdinals = cited.length ? [...new Set(cited)].sort((a, b) => a - b) : [...window.pages];

      const settings: SettingSpecs = [];
      for (const spec of item.settings ?? []) {
        if (!spec || typeof spec.key !== "string" || seenSettingKeys.has(spec.key)) continue;
        seenSettingKeys.add(spec.key);
        settings.push(spec);
      }

      items.push({ ...item, localId, citedPassageOrdinals, settings });
      keptByTitle.set(key, localId);
    }
    const reason = window.output.skippedReason?.trim();
    if (reason) skipped.push(`pages ${window.pages[0] ?? "?"}-${window.pages[window.pages.length - 1] ?? "?"}: ${reason}`);
  });

  const localIds = new Set(items.map((i) => i.localId));
  const titleToLocalId = new Map(items.map((i) => [normalizeTitle(i.title), i.localId]));
  const resolveFrom = (id: string): string | undefined =>
    localIds.has(id) ? id : supersededBy.get(id);

  const edges: ExtractedEdge[] = [];
  const seenEdges = new Set<string>();
  windows.forEach((window, index) => {
    const prefix = `w${index + 1}_`;
    for (const edge of window.output.edges ?? []) {
      if (!edge || typeof edge.fromLocalId !== "string") continue;
      const fromLocalId = resolveFrom(`${prefix}${edge.fromLocalId}`);
      if (!fromLocalId) continue; // its item was dropped — the edge dies with it

      const next: ExtractedEdge = { fromLocalId, edgeType: edge.edgeType };
      if (edge.edgeType === "teaches" && edge.toConceptId && !edge.toLocalId) {
        next.toConceptId = edge.toConceptId;
      } else if (edge.toLocalId) {
        const target = `${prefix}${edge.toLocalId}`;
        const resolved = resolveFrom(target);
        const existing = supersededByExisting.get(target);
        if (resolved) next.toLocalId = resolved;
        else if (existing) next.toExistingTitle = existing;
        else continue; // dangling reference
      } else if (edge.toExistingTitle) {
        // A window may name an item another window created: prefer the local id.
        const local = titleToLocalId.get(normalizeTitle(edge.toExistingTitle));
        if (local) next.toLocalId = local;
        else next.toExistingTitle = edge.toExistingTitle;
      } else {
        continue;
      }
      if (next.toLocalId === next.fromLocalId) continue; // self-edge
      const key = edgeKey(next);
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);
      edges.push(next);
    }
  });

  const merged: ExtractorOutput = { items, edges };
  if (skipped.length) merged.skippedReason = skipped.join(" | ");
  return merged;
}

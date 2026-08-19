// Which K items a curated deal shows — the tag binding (owner direction
// 2026-08-18).
//
// A curated deal is built to teach something. That lesson is recorded on the
// deal as the CARDS it leads with (`kItems`) plus the topic they were chosen
// under (`kTags`) — owner direction 2026-08-19: the coach picks K items, and
// tags are how they filter the catalogue while picking. A deal that names a
// topic but no cards still resolves through the tags' whole collections, which
// is every deal authored before the picker existed.
//
// The tags live in the curated payload's JSON (`kTags`), alongside the
// annotations and board settings, under the same discipline the rest of that
// payload keeps: the entry stores a string, every read re-validates, and a
// deal saved before tags existed still opens — it simply selects nothing,
// which `resolveKItems` reads as "no lesson chosen" and answers with the
// registry's own defaults rather than an empty panel.
//
// READ AND WRITE LIVE HERE, NOT IN curated.ts, deliberately: this is a coach
// concern layered ON the payload, and keeping it separate means the tag
// vocabulary can grow without touching the payload validator every consumer
// shares. Both functions preserve every field they do not understand, so the
// two files never fight over the same string.
//
// NOTHING HERE RENDERS. The caps and the census are read by the studio's
// lesson picker, and the resolution by the overlay; the drawing is theirs.

import {
  isBuildable, kItemsForIds, kItemsForTags, parseKItemIds, parseKTags, K_ITEMS,
} from "./kItems";
import type { KItemDef, KItemId, KPhase, KTag } from "./kItems";

/** The payload key the tags are stored under. */
const TAGS_KEY = "kTags";
/** And the key the coach's hand-picked cards are stored under. */
const ITEMS_KEY = "kItems";

/** No deal names more lessons than this; a curated board that claims twelve
 *  topics has chosen none of them. Extra tags are dropped from the end. */
export const MAX_DEAL_TAGS = 6;

/** And no deal leads with more cards than this. The Know panel's fronts are
 *  glanceable a few at a time; a lesson of twenty is a syllabus, not a board.
 *  Extra picks are dropped from the end. */
export const MAX_DEAL_ITEMS = 8;

/**
 * The tags a curated deal names, from its raw payload JSON.
 *
 * Tolerant in the same way `parseCurated` is: unreadable JSON, a missing key,
 * or a list of junk all yield `[]` rather than throwing, and unknown tags drop
 * ALONE so a deal authored against a newer vocabulary still opens with the
 * tags this build recognizes.
 */
export function readKTags(curatedJson: string | undefined): KTag[] {
  if (!curatedJson) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(curatedJson);
  } catch {
    return [];
  }
  if (typeof raw !== "object" || raw === null) return [];
  return parseKTags((raw as Record<string, unknown>)[TAGS_KEY]).slice(0, MAX_DEAL_TAGS);
}

/**
 * Store `tags` on a curated payload's JSON, keeping every other field exactly
 * as it was — the annotations, the board settings, and anything a future
 * version adds that this build has never heard of.
 *
 * An empty list REMOVES the key rather than writing `[]`, so "no lesson
 * chosen" round-trips as absence and a deal that never had tags is unchanged
 * by a save that does not set them.
 */
export function writeKTags(curatedJson: string | undefined, tags: readonly KTag[]): string {
  let raw: unknown;
  try {
    raw = curatedJson ? JSON.parse(curatedJson) : {};
  } catch {
    raw = {};
  }
  const obj: Record<string, unknown> =
    typeof raw === "object" && raw !== null ? { ...(raw as Record<string, unknown>) } : {};

  const clean = parseKTags(tags).slice(0, MAX_DEAL_TAGS);
  if (clean.length) obj[TAGS_KEY] = clean;
  else delete obj[TAGS_KEY];

  return JSON.stringify(obj);
}

/**
 * The CARDS a curated deal names, from its raw payload JSON — the coach's
 * hand-picked collection (owner direction 2026-08-19).
 *
 * Same tolerance as `readKTags` one level down: unreadable JSON, a missing
 * key, or a list of junk all yield `[]`, and an id this build has never heard
 * of drops ALONE. An empty answer means "no cards picked", which `resolveKItems`
 * answers with the deal's tags — the pre-picker behaviour, unchanged.
 */
export function readKItemIds(curatedJson: string | undefined): KItemId[] {
  if (!curatedJson) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(curatedJson);
  } catch {
    return [];
  }
  if (typeof raw !== "object" || raw === null) return [];
  return parseKItemIds((raw as Record<string, unknown>)[ITEMS_KEY]).slice(0, MAX_DEAL_ITEMS);
}

/**
 * Store `ids` on a curated payload's JSON, keeping every other field — the
 * `writeKTags` contract, including the empty-list-REMOVES-the-key rule, so a
 * deal that never picked cards round-trips unchanged.
 */
export function writeKItemIds(curatedJson: string | undefined, ids: readonly KItemId[]): string {
  let raw: unknown;
  try {
    raw = curatedJson ? JSON.parse(curatedJson) : {};
  } catch {
    raw = {};
  }
  const obj: Record<string, unknown> =
    typeof raw === "object" && raw !== null ? { ...(raw as Record<string, unknown>) } : {};

  const clean = parseKItemIds(ids).slice(0, MAX_DEAL_ITEMS);
  if (clean.length) obj[ITEMS_KEY] = clean;
  else delete obj[ITEMS_KEY];

  return JSON.stringify(obj);
}

/**
 * The registry's fallback when a deal names no lesson: the items that are
 * true of every deal in that phase — the counting habit and the score.
 *
 * A panel with nothing in it reads as broken, and an untagged deal is the
 * common case today (every deal authored before this existed). These two tags
 * are the ones no lesson can make irrelevant.
 */
export const DEFAULT_TAGS: readonly KTag[] = ["counting-the-hand", "scoring-the-contract"];

export interface ResolveOptions {
  /** Keep only items live in this phase. Omit for both. */
  phase?: KPhase;
  /**
   * Keep only what a producer can emit today (FACT / PROOF). Default TRUE —
   * the Know panel's guarantee is that nothing it shows can be wrong, and
   * READ/JUDGMENT items have no producer yet. Pass `false` to see the whole
   * declared collection (an authoring UI wants this; the panel does not).
   */
  buildableOnly?: boolean;
  /**
   * Cap the collection. Fronts are only glanceable a few at a time; the
   * overflow is reported rather than silently dropped.
   */
  limit?: number;
}

export interface ResolvedKItems {
  /** The collection, in registry (teaching) order. */
  items: KItemDef[];
  /** The tags the deal names — its topic, and the filter the coach picked
   *  through. `DEFAULT_TAGS` when the deal named no lesson at all; empty when
   *  it picked cards without naming a topic. */
  tags: readonly KTag[];
  /** True when the deal named no lesson and the defaults stood in. */
  usedDefaults: boolean;
  /** True when the coach's own card picks selected the collection, rather than
   *  the tags' whole collections. */
  picked: boolean;
  /** How many items `limit` cut. Never silently zero — a caller that caps
   *  should be able to say "and 4 more". */
  dropped: number;
}

/**
 * The whole resolution, from a curated deal's stored JSON to the collection
 * its Know panel should show.
 *
 * THE COACH'S PICKS WIN. When the deal names cards, those cards are the
 * lesson and the tags are only its topic; when it names none — every deal
 * authored before the picker, and any board whose coach set a topic and left
 * the cards alone — the tags' whole collections stand in, exactly as before.
 */
export function resolveKItems(
  curatedJson: string | undefined,
  opts: ResolveOptions = {},
): ResolvedKItems {
  const named = readKTags(curatedJson);
  const picks = readKItemIds(curatedJson);
  const usedDefaults = named.length === 0 && picks.length === 0;
  const tags = usedDefaults ? DEFAULT_TAGS : named;

  const sel = {
    ...(opts.phase ? { phase: opts.phase } : {}),
    buildableOnly: opts.buildableOnly ?? true,
  };
  const all = picks.length ? kItemsForIds(picks, sel) : kItemsForTags(tags, sel);

  const limit = opts.limit;
  const items = typeof limit === "number" && limit >= 0 ? all.slice(0, limit) : all;
  return { items, tags, usedDefaults, picked: picks.length > 0, dropped: all.length - items.length };
}

/**
 * What a tag is worth teaching with right now — the census a curate UI needs
 * to show a coach WHY a topic looks thin before they build a deal around it.
 *
 * `buildable` is what the panel can actually show today; `declared` counts the
 * whole collection including the READ and JUDGMENT items waiting on the KB and
 * model layers. A tag whose buildable count is 0 is not broken — it is a topic
 * whose knowledge is not deterministic, and the coach should know that.
 */
export function tagCensus(tag: KTag): { declared: number; buildable: number } {
  const all = K_ITEMS.filter((k) => (k.tags as readonly KTag[]).includes(tag));
  return { declared: all.length, buildable: all.filter(isBuildable).length };
}

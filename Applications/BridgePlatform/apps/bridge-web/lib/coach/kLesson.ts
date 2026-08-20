// The lesson — a curated deal's chosen K items, resolved into what the Know
// panel should put in front of the learner (owner direction 2026-08-18;
// item-level picking 2026-08-19).
//
// Two halves, and the join between them is the whole file:
//
//   · the PLAN, built server-side from the deal's own picks (or, for a deal
//     that named only a topic, from its tags' collections) — which K items
//     this board is teaching, in registry order, named for the learner;
//   · the MATCH, run client-side — which of the cards the panel actually has
//     in hand answer to those items.
//
// THE MATCH EXISTS BECAUSE THE PRODUCERS DON'T EMIT IDS YET. looking.ts and
// think.ts invent their cards from the position and title them in prose
// ("HCP", "Points hidden", "Still out"). The registry's titles were written
// FROM those, so a title lookup is exact for everything with a fixed title,
// and the one family with a computed title — a show-out, titled with whichever
// seat failed to follow — is matched on the shape of its value instead. When
// the producers eventually carry `id` themselves, `kItemIdForCard` becomes a
// one-line read of that field and this table retires; until then it is the
// seam, and it is tested against the real producer output rather than against
// its own assumptions.
//
// Nothing here decides what a card SAYS. The lesson chooses which of the
// panel's existing cards are the point of this board; the cards keep their own
// values and their own sentences, and an item the position cannot support
// simply has no card — the plan says it was expected, the panel stays honest.

import {
  isKItemId, isKTag, itemsName, kItem, kItemsForIds, kItemsForTags, lessonName,
  parseKItemIds, parseKTags,
} from "./kItems";
import type { KFact } from "./kFacts";
import type { KItemId, KPhase, KTag } from "./kItems";

/* ───────────────────── matching a rendered card to an item ───────────────────── */

/**
 * The producers' card titles, mapped to the registry.
 *
 * "HCP" and "HCP dealt" are the same idea under two names — looking.ts titles
 * the auction card one way and the play card the other — and the registry
 * absorbed that split into a single id, which is exactly what this table is
 * for.
 *
 * UNTITLED CARDS ARE NOT HERE ON PURPOSE. The system chip and the trick
 * counter carry no title because they are readouts, not exercises (they never
 * lock, never flip); they are identity, not knowledge, and a lesson never
 * claims them.
 */
const ID_BY_TITLE: Readonly<Record<string, KItemId>> = {
  // looking.ts — what is visible
  HCP: "hcp",
  "HCP dealt": "hcp",
  Distribution: "distribution",
  Shape: "shape",
  "Our tricks": "our-tricks",
  "Their tricks": "their-tricks",
  // think.ts — what can be worked out
  "Points out there": "points-out-there",
  "Points hidden": "points-hidden",
  "Still out": "still-out",
  "Winning so far": "winning-so-far",
  "Your role": "my-role",
};

/** A show-out card's value: "no ♦s" — the suit varies, the shape doesn't. */
const SHOW_OUT_VALUE = /^no\s+\S+s$/u;

/** The shape of a card as the panel holds it — the fields the match needs. */
export interface CardLike {
  title: string;
  value: string;
  group?: "me" | "partner" | "partnership" | "theirs" | "advanced";
}

/**
 * Which K item this rendered card IS, or null when the registry doesn't know
 * it — a model-authored read card, an untitled readout, or a producer card
 * that predates the catalogue.
 *
 * Null is a normal answer, not a failure: an unmatched card still shows in
 * the side views exactly as it always has. It simply can't be part of a
 * lesson, because the lesson is expressed in registry ids.
 */
export function kItemIdForCard(card: CardLike): KItemId | null {
  const byTitle = ID_BY_TITLE[card.title];
  if (byTitle) return byTitle;
  // A show-out proof is titled with the seat that showed out, so it has no
  // fixed title to look up. Which side it files under is what names it.
  if (SHOW_OUT_VALUE.test(card.value)) {
    if (card.group === "partner") return "show-out-partner";
    if (card.group === "theirs") return "show-out-opponent";
  }
  return null;
}

/* ───────────────────────── the plan ───────────────────────── */

/**
 * What a curated deal is teaching, as the overlay carries it to the panel.
 *
 * `items` is the FULL expected collection for the phase; the panel intersects
 * it with the cards it actually has. Sending the expectation rather than only
 * the achievable set is deliberate — it lets the panel say "2 of 5 so far"
 * and lets a later build light up items the moment a producer can make them.
 */
export interface LessonPlan {
  /** The tags the coach chose — the topic, and what they filtered the
   *  catalogue by while picking. Empty when they picked cards without one. */
  tags: KTag[];
  /** Their name for the learner — "Trump management", "Finesses and Entries". */
  name: string;
  /** The K item ids this lesson expects in this phase, in teaching order. */
  items: KItemId[];
  /**
   * VALUES FOR THOSE ITEMS, from this position (owner ask 2026-08-19: the
   * lesson's cards must hold real content, moving with the board).
   *
   * Filled by the host beside the plan — `kFactsFor` in kFacts.ts, which
   * produces by registry ID rather than by title. Absent or short is normal: an
   * item the position cannot support yet has no value, and the pane says so
   * rather than inventing one.
   */
  facts?: KFact[];
  /** The phase the plan was built for. */
  phase: KPhase;
  /**
   * WHERE THIS SET CAME FROM (owner direction 2026-08-19).
   *
   * "board" — the deal's own lesson, standing all board long.
   * "here"  — the cards the coach pinned to THIS decision, which take over
   *           while the learner is at it. The pane says which, because a set
   *           that changes under you without a word reads as a glitch.
   */
  scope?: "board" | "here";
}

/**
 * What a curated deal says about its lesson, as the payload carries it —
 * the coach's hand-picked cards and the topic they picked under. Both are
 * `unknown[]` because this reads STORED data: validation happens here.
 */
export interface LessonSource {
  kTags?: readonly unknown[];
  kItems?: readonly unknown[];
}

/**
 * Build the plan for a phase. Returns null when the deal names no lesson —
 * the caller then leaves the panel exactly as it was, which is the right
 * answer for every deal authored before lessons existed.
 *
 * THE COACH'S CARD PICKS ARE THE LESSON (owner direction 2026-08-19). When
 * the deal names cards, those are what the panel leads with and the tags only
 * name the topic; when it names none, the tags' whole collections stand in —
 * the pre-picker behaviour, which every deal authored under it still needs.
 *
 * Buildable items only, either way. A lesson advertising cards that cannot
 * exist yet would read as a broken panel rather than as an honest "not until
 * the knowledge base lands", and the learner is owed the version that doesn't
 * look broken.
 */
export function lessonPlan(src: LessonSource | undefined, phase: KPhase): LessonPlan | null {
  const tags = parseKTags(src?.kTags);
  const picks = parseKItemIds(src?.kItems);
  if (!tags.length && !picks.length) return null;
  const sel = { phase, buildableOnly: true } as const;
  const items = (picks.length ? kItemsForIds(picks, sel) : kItemsForTags(tags, sel)).map(
    (k) => k.id,
  );
  return { tags, name: tags.length ? lessonName(tags) : itemsName(picks), items, phase, scope: "board" };
}

/**
 * THE CARDS PINNED TO ONE DECISION (owner direction 2026-08-19: not "throughout
 * the entire game" but "at specific play or part of the game").
 *
 * A plan of its own, so the panel needs no new mechanics: same shape, same slot
 * filling, same values — only the source and the label differ. Null when the
 * coach pinned nothing here, and the caller then keeps the board's own lesson,
 * which is the right answer for every decision they said nothing about.
 *
 * Buildable-and-in-phase only, like the board's lesson: a card that cannot
 * exist at this moment is not a lesson, it is an empty slot with a name on it.
 */
export function momentPlan(
  cards: readonly unknown[] | undefined,
  phase: KPhase,
): LessonPlan | null {
  const picks = parseKItemIds(cards);
  if (!picks.length) return null;
  const items = kItemsForIds(picks, { phase, buildableOnly: true }).map((k) => k.id);
  if (!items.length) return null;
  return { tags: [], name: itemsName(picks), items, phase, scope: "here" };
}

/* ───────────────────── what the panel does with it ───────────────────── */

/** One lesson slot as the panel shows it: the item, and the card if there is one. */
export interface LessonSlot<C> {
  id: KItemId;
  /** The registry's own headline — used when no card has arrived yet. */
  title: string;
  /** The teacher's line on why this is worth tracking. */
  why: string;
  /** The panel's card for it, when one of the older producers made it. */
  card?: C;
  /**
   * The value the ID-KEYED producer made for it, when no card matched. Carried
   * separately from `card` because it is not one of the panel's own cards — the
   * pane draws it with the registry's title, which is the title it would have
   * had anyway.
   */
  fact?: KFact;
}

/**
 * Lay the lesson out against the cards the panel is holding.
 *
 * Registry order, not card order: the teaching sequence is the registry's to
 * decide, and a learner working through a lesson should meet the same cards in
 * the same order every board. Slots with no card are kept — the panel decides
 * whether to draw them as "not yet" or leave them out, and it needs to know
 * they were expected either way.
 */
export function lessonSlots<C extends CardLike>(
  plan: LessonPlan,
  cards: readonly C[],
): LessonSlot<C>[] {
  const byId = new Map<KItemId, C>();
  for (const c of cards) {
    const id = kItemIdForCard(c);
    // First card wins: the same item can be produced twice (the auction's HCP
    // and the play's HCP dealt never coexist, but a future producer might),
    // and a lesson slot holds one card.
    if (id && !byId.has(id)) byId.set(id, c);
  }
  const facts = new Map((plan.facts ?? []).map((f) => [f.id, f]));
  return plan.items.map((id) => {
    const def = kItem(id);
    const card = byId.get(id);
    // A CARD THE PANEL ALREADY HOLDS WINS. It is the same fact either way, and
    // the panel's own card is the one the learner may also meet in the side
    // views — matching them keeps one card per fact rather than two spellings
    // of it. The id-keyed value fills what nothing produced.
    const fact = card ? undefined : facts.get(id);
    return {
      id, title: def.title, why: def.why,
      ...(card ? { card } : {}),
      ...(fact ? { fact } : {}),
    };
  });
}

/**
 * The cards a lesson claims, as a set of the panel's own card identities —
 * so the side views can mark which of their cards are the point of this board
 * without re-running the match per render.
 */
export function lessonCardKeys<C extends CardLike>(
  plan: LessonPlan | null,
  cards: readonly C[],
  keyOf: (card: C) => string,
): ReadonlySet<string> {
  if (!plan) return EMPTY_KEYS;
  const wanted = new Set<string>(plan.items);
  const out = new Set<string>();
  for (const c of cards) {
    const id = kItemIdForCard(c);
    if (id && wanted.has(id)) out.add(keyOf(c));
  }
  return out;
}

const EMPTY_KEYS: ReadonlySet<string> = new Set<string>();

/** Whether a payload names a lesson this build can still read — a card it
 *  still has, or a topic it still knows. */
export const namesALesson = (src: LessonSource | undefined): boolean =>
  (Array.isArray(src?.kItems) && src.kItems.some(isKItemId)) ||
  (Array.isArray(src?.kTags) && src.kTags.some(isKTag));

// The Game State's PARTNER and PARTNERSHIP views (owner direction 2026-08-14:
// "classify into multiple states — My State, My Partner, and Partnership —
// dynamic, inferred through the bids").
//
// My State is arithmetic over the learner's own cards and already exists
// (looking.ts / think.ts). These two views are different in kind: they are
// INFERENCE, and the authority behind them is the partnership's own bidding
// system — the same replayed KB meanings the bidding diagram shows. Every
// card here traces to a meaning the system published for a call partner
// actually made; nothing reads a concealed hand, and where a meaning can't
// be parsed into numbers the card carries the meaning's own words instead.
//
// Recomputed whole from the auction on every call, so the panel's cards
// update themselves as the bidding grows — a new bid narrows the range, and
// the narrower range is what the next render deals.

import { hcp } from "@bridge/engine";
import type { Call, Card, Seat, Suit } from "@bridge/events";

import { callLabel, GLYPH, partnerOf, SUIT_WORD, SUITS } from "./position";
import type { KnownCard } from "./think";

/** What the page already computed for the bidding grid — one per call. */
export interface BidMeaning {
  label: string;
  shows?: string;
}

/** A numeric range a set of bids has promised. Either end may be unknown. */
interface Range {
  min?: number;
  max?: number;
}

/** The unit that marks a POINT phrase — the KB writes "HCP" and "total points". */
const UNIT = String.raw`(?:hcp|(?:total\s+)?points?|pts?)`;

/**
 * Pull an HCP/point range out of one meaning's prose. Tolerant on purpose:
 * the KB's own telegraphic style is "11–21 HCP" / "12–22 total points" /
 * "15+ HCP" / "up to 9 HCP" (lib/bidMeanings.ts showsText), and hand-written
 * notes say "12-21 points" or "at least 15 pts". Yields nothing when the
 * sentence doesn't talk numbers — a card that can't be built is a card not
 * shown, never a wrong one.
 */
function pointsIn(text: string): Range | null {
  const t = text.toLowerCase();
  let m = new RegExp(String.raw`(\d+)\s*(?:-|–|—|\s+to\s+)\s*(\d+)\s*${UNIT}`).exec(t);
  if (m) return { min: Number(m[1]), max: Number(m[2]) };
  m = new RegExp(String.raw`(\d+)\s*\+\s*${UNIT}`).exec(t);
  if (m) return { min: Number(m[1]) };
  m = new RegExp(String.raw`at\s+least\s+(\d+)\s*${UNIT}`).exec(t);
  if (m) return { min: Number(m[1]) };
  m = new RegExp(String.raw`(?:at\s+most|up\s+to|fewer\s+than)\s+(\d+)\s*${UNIT}`).exec(t);
  if (m) return { max: Number(m[1]) };
  return null;
}

/**
 * Suit-length promises in one meaning's prose. The KB's own shapes first —
 * "5+ ♠", "3–5 ♠", "exactly 5 ♠" — then hand-written ones ("five hearts",
 * "6 diamonds"). "at most 2 ♠" is a CEILING, not a promise, so those
 * phrases are cut before matching rather than read as a two-card suit.
 */
function suitsIn(text: string): Partial<Record<Suit, number>> {
  const out: Partial<Record<Suit, number>> = {};
  const names: Record<Suit, string[]> = {
    S: ["♠", "spades?"],
    H: ["♥", "hearts?"],
    D: ["♦", "diamonds?"],
    C: ["♣", "clubs?"],
  };
  const words: Record<string, number> = { four: 4, five: 5, six: 6, seven: 7 };
  const anySuit = String.raw`(?:♠|♥|♦|♣|spades?|hearts?|diamonds?|clubs?)`;
  const cleaned = text.replace(
    new RegExp(String.raw`(?:at\s+most|up\s+to|fewer\s+than)\s+\d+\s*(?:card\s+)?${anySuit}`, "gi"),
    "",
  );
  const keep = (s: Suit, n: number) => {
    if (Number.isFinite(n) && n >= 3 && n <= 13) out[s] = Math.max(out[s] ?? 0, n);
  };
  for (const s of SUITS) {
    for (const name of names[s]) {
      // A range promises its FLOOR: "3–5 ♠" is 3+ spades, not 5.
      const range = new RegExp(String.raw`(\d+)\s*(?:-|–|—)\s*\d+\s*(?:card\s+)?${name}`, "i").exec(cleaned);
      if (range) { keep(s, Number(range[1])); continue; }
      const m = new RegExp(String.raw`(?:exactly\s+)?(\d+|four|five|six|seven)\s*\+?\s*(?:card\s+)?${name}`, "i").exec(cleaned);
      if (!m) continue;
      keep(s, words[m[1]!.toLowerCase()] ?? Number(m[1]));
    }
  }
  return out;
}

/**
 * The partner and partnership cards for the current auction.
 *
 * `meanings` is index-aligned with the auction (the page's own bidding-grid
 * lookup, reused). Cards come back grouped, ready to concat onto the facts
 * the Game State card already draws.
 */
export function partnershipStates(opts: {
  auction: readonly { seat: Seat; call: Call }[];
  seat: Seat;
  /** The learner's dealt hand — the "my half" of every partnership sum. */
  hand: readonly Card[];
  meanings: ReadonlyArray<BidMeaning | undefined>;
}): KnownCard[] {
  const { auction, seat, hand, meanings } = opts;
  const partner = partnerOf(seat);
  const out: KnownCard[] = [];

  const bids = auction
    .map((a, i) => ({ ...a, i }))
    .filter((a) => a.seat === partner && a.call !== "P");
  if (!bids.length) return out;

  // Every bid's meaning, as one text each — label plus its "shows" prose.
  const texts = bids.map((b) => {
    const m = meanings[b.i];
    return m ? `${m.label}${m.shows ? ` — ${m.shows}` : ""}` : "";
  });

  // ── partner's latest bid, always — the anchor card of the view ──────────
  const last = bids[bids.length - 1]!;
  const lastText = texts[texts.length - 1];
  out.push({
    group: "partner",
    title: "Partner bid",
    value: callLabel(last.call),
    detail: lastText || "Your system notes don't cover this call.",
  });

  // ── the promised point range: every bid narrows it (intersection) ───────
  const range: Range = {};
  for (const text of texts) {
    const r = text ? pointsIn(text) : null;
    if (!r) continue;
    if (r.min !== undefined) range.min = Math.max(range.min ?? r.min, r.min);
    if (r.max !== undefined) range.max = Math.min(range.max ?? r.max, r.max);
  }
  if (range.min !== undefined || range.max !== undefined) {
    const shown =
      range.min !== undefined && range.max !== undefined
        ? `${range.min}–${range.max}`
        : range.min !== undefined
          ? `${range.min}+`
          : `≤${range.max}`;
    out.push({
      group: "partner",
      title: "Partner's points",
      value: shown,
      detail: `Partner's bidding promises ${shown} points, by your system.`,
    });
  }

  // ── the promised suits: the longest promise per suit across the bids ────
  const promised: Partial<Record<Suit, number>> = {};
  for (const text of texts) {
    if (!text) continue;
    for (const [s, n] of Object.entries(suitsIn(text)) as [Suit, number][]) {
      promised[s] = Math.max(promised[s] ?? 0, n);
    }
  }
  const suitBits = SUITS.filter((s) => promised[s]).map((s) => `${promised[s]}+ ${GLYPH[s]}`);
  if (suitBits.length) {
    out.push({
      group: "partner",
      title: "Partner's suits",
      value: suitBits.join("  "),
      detail: `Partner's bidding shows ${SUITS.filter((s) => promised[s])
        .map((s) => `${promised[s]}+ ${SUIT_WORD[s]}s`)
        .join(" and ")}.`,
    });
  }

  // ── the partnership: my cards plus partner's promises ───────────────────
  const mine = hcp([...hand]);
  if (range.min !== undefined) {
    const top = range.max !== undefined ? `–${mine + range.max}` : "+";
    out.push({
      group: "partnership",
      title: "Together",
      value: `${mine + range.min}${top}`,
      detail: `Your ${mine} plus partner's promised ${range.min}${range.max !== undefined ? `–${range.max}` : "+"} makes ${mine + range.min}${top} between you.`,
    });
  }
  let fit: { suit: Suit; count: number } | null = null;
  for (const s of SUITS) {
    const p = promised[s];
    if (!p) continue;
    const together = p + hand.filter((c) => c.suit === s).length;
    if (together >= 8 && (!fit || together > fit.count)) fit = { suit: s, count: together };
  }
  if (fit) {
    out.push({
      group: "partnership",
      title: "A fit",
      value: `${fit.count}+ ${GLYPH[fit.suit]}`,
      detail: `Partner's promised ${SUIT_WORD[fit.suit]}s plus yours make at least ${fit.count} — an eight-card fit is the usual bar.`,
    });
  }

  return out;
}

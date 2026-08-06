// The position as the learner can see it — and nothing else.
//
// THIS FILE IS THE SECURITY BOUNDARY for the explanation layer. The model is
// never handed a GameState, because a GameState contains all four hands and the
// solver's verdict. It is handed a VisiblePosition, an object with NO FIELD for
// either. Blindness is therefore a property of the type, not of a sentence in a
// prompt asking the model to behave.
//
// That distinction matters because the failure it prevents is silent. Tell a
// model "the King loses a trick" and ask it to explain, and it writes "West has
// the Ace" — a true sentence the learner was never supposed to read. No error is
// raised, the output looks excellent, and the learner has been handed a card off
// somebody else's hand. There is no prompt that reliably stops that; there is
// only not sending the information.
//
// The test that guards it is deliberately blunt: build a deal where every honour
// outside the learner's view sits in the concealed hands, serialise the object,
// and assert none of them appears anywhere in the JSON.

import type { GameState } from "@bridge/engine";
import { legalCalls, legalPlays } from "@bridge/engine";
import type { Call, Card, Seat, Suit } from "@bridge/events";

import { callLabel, cardLabel, GLYPH, partnerOf, SUITS, visibleSeats } from "./position";

/** One hand, grouped the way a hand diagram prints it. */
export interface VisibleHand {
  /** "♠ A Q 3" — one entry per suit held. */
  suits: string[];
  /** Flat card list, for anything that needs to match on a single card. */
  cards: string[];
}

export interface VisiblePosition {
  phase: "auction" | "play";
  /** Who the learner is. */
  seat: Seat;
  /** Which hand is being chosen from — dummy's, when declaring. */
  actor: Seat;
  role: "declarer" | "dummy" | "defender" | "bidder";
  vulnerable: string;
  contract?: string;
  /** The learner's own thirteen, as dealt. */
  myHand: VisibleHand;
  /** Dummy, once it is face up — and only when the learner is not dummy. */
  dummy?: VisibleHand;
  /** Every call, in order, with the relationship spelled out. */
  auction: { seat: Seat; relation: "you" | "partner" | "opponent"; call: string }[];
  /** Every completed and in-progress trick — all public information. */
  tricks: { plays: { seat: Seat; relation: "you" | "partner" | "opponent"; card: string }[] }[];
  /** The actor's legal options, as labels. */
  legal: string[];
}

const relationOf = (seat: Seat, me: Seat): "you" | "partner" | "opponent" =>
  seat === me ? "you" : seat === partnerOf(me) ? "partner" : "opponent";

function handOf(cards: Card[]): VisibleHand {
  const suits: string[] = [];
  for (const s of SUITS) {
    const inSuit = cards.filter((c) => c.suit === s).sort((a, b) => b.rank - a.rank);
    if (inSuit.length) suits.push(`${GLYPH[s]} ${inSuit.map((c) => cardLabel(c).slice(0, -1)).join(" ")}`);
  }
  return { suits, cards: cards.map(cardLabel) };
}

/** The cards the learner played, plus what is left — their original thirteen. */
function dealt(state: GameState, seat: Seat): Card[] {
  return [
    ...state.hands[seat],
    ...state.tricks.flatMap((t) => t.plays.filter((p) => p.seat === seat).map((p) => p.card)),
  ];
}

/**
 * Build the position, or `null` when there is nothing to describe.
 *
 * `actor` is the hand being chosen from, which is not always `seat`: declarer
 * plays dummy's cards, so at dummy's turn the legal options come from dummy.
 */
export function visiblePosition(state: GameState, seat: Seat | null): VisiblePosition | null {
  if (!seat) return null;

  const auction = state.auction.map((a) => ({
    seat: a.seat,
    relation: relationOf(a.seat, seat),
    call: callLabel(a.call as Call),
  }));

  if (state.phase === "auction") {
    if (state.turn !== seat) return null;
    return {
      phase: "auction",
      seat,
      actor: seat,
      role: "bidder",
      vulnerable: state.vul,
      myHand: handOf(dealt(state, seat)),
      auction,
      tricks: [],
      legal: [...legalCalls(state.auction, seat)].map((c) => callLabel(c)),
    };
  }

  if (state.phase !== "play" || !state.contract) return null;

  const declarer = state.contract.declarer;
  const dummySeat = partnerOf(declarer);
  const role = seat === declarer ? "declarer" : seat === dummySeat ? "dummy" : "defender";
  // Dummy makes no decisions, so there is nothing here to frame.
  if (role === "dummy") return null;

  const controlled: Seat[] = role === "declarer" ? [seat, dummySeat] : [seat];
  if (!controlled.includes(state.turn)) return null;
  const actor = state.turn;

  const seen = visibleSeats(state, seat);
  const strain = state.contract.strain === "N" ? "NT" : (GLYPH[state.contract.strain] ?? "");

  return {
    phase: "play",
    seat,
    actor,
    role,
    vulnerable: state.vul,
    contract: `${state.contract.level}${strain} by ${state.contract.declarer}`,
    myHand: handOf(dealt(state, seat)),
    // Dummy is face up during the play, so it is the learner's to see. Anything
    // NOT in `visibleSeats` is never read here.
    ...(seen.includes(dummySeat) && dummySeat !== seat
      ? { dummy: handOf(dealt(state, dummySeat)) }
      : {}),
    auction,
    tricks: state.tricks.map((t) => ({
      plays: t.plays.map((p) => ({
        seat: p.seat,
        relation: relationOf(p.seat, seat),
        card: cardLabel(p.card),
      })),
    })),
    legal: legalPlays(state, actor).map(cardLabel),
  };
}

/**
 * Every card token the learner may legitimately have seen.
 *
 * The validator checks the model's prose against this set: a card named in an
 * explanation that is not in here could only have come from a concealed hand,
 * which means the whole response is discarded rather than shown.
 */
export function visibleCards(pos: VisiblePosition): ReadonlySet<string> {
  const out = new Set<string>(pos.myHand.cards);
  for (const c of pos.dummy?.cards ?? []) out.add(c);
  for (const t of pos.tricks) for (const p of t.plays) out.add(p.card);
  for (const l of pos.legal) out.add(l);
  return out;
}

/** Every card-like token in a string: "10♦", "K♠", "3♥". */
const CARD_TOKEN = /(?:10|[2-9AKQJ])[♠♥♦♣]/g;

/** Card names in `text` that the learner could not have seen. */
export function leakedCards(text: string, pos: VisiblePosition): string[] {
  const allowed = visibleCards(pos);
  return [...new Set(text.match(CARD_TOKEN) ?? [])].filter((c) => !allowed.has(c));
}

/**
 * A stable key for this position, for the response cache.
 *
 * Sorted keys and a fixed field order, so the same position hashes identically
 * across processes — which is the whole point: a cached answer replayed for the
 * same position is what makes the coach consistent rather than a slot machine.
 */
export function positionKey(pos: VisiblePosition): string {
  const canonical = JSON.stringify(pos, (_k, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
  // FNV-1a. Not cryptographic — a cache key, and it only has to be stable.
  let h = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    h ^= canonical.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Suits, exported so the model prompt and the validator agree on notation. */
export const SUIT_GLYPHS: readonly Suit[] = SUITS;

// The legitimate-information play view (2026-07-21 play expansion).
//
// GameState carries all four hands — visibility is a UI concern — so any
// behavior smarter than "follow low" must NOT read raw state or it would be
// quietly double-dummy. This module is the honesty boundary: a PlayView
// exposes exactly what the seat is entitled to see at the table —
//   · its own remaining hand,
//   · dummy's remaining hand once the opening lead has been made
//     (declarer and dummy are one mind, so each also sees the other),
//   · every card already played, and the in-progress trick,
//   · the contract and the running trick count.
// All expanded behaviors decide from a PlayView and nothing else.

import { partnerOf, type Card, type Contract, type Seat, type Suit } from "@bridge/events";
import { legalPlays } from "../apply";
import { sideOf, type GameState, type Trick } from "../state";

export interface PlayView {
  seat: Seat;
  contract: Contract;
  /** null in notrump. */
  trumps: Suit | null;
  own: Card[];
  /**
   * The OTHER visible hand, from this seat's viewpoint: for defenders,
   * dummy's remaining cards; for declarer, dummy's; for dummy, declarer's
   * (declarer plays both — one mind). Null before the opening lead.
   */
  partnerVisible: Card[] | null;
  isDeclarerSide: boolean;
  dummySeat: Seat;
  /** Every card played so far, in play order (all tricks). */
  played: Card[];
  /** The in-progress trick (0–3 plays) or null when this seat leads a fresh one. */
  trick: { ledSuit: Suit; plays: { seat: Seat; card: Card }[] } | null;
  /** 0-based position in the current trick (0 = on lead). */
  position: number;
  /** Tricks won so far by this seat's side / by the opponents. */
  tricksOwn: number;
  tricksOpp: number;
  /** Tricks the DECLARING side still needs for the contract. */
  neededByDeclarer: number;
  /** The suit partner led on their FIRST lead (defenders returning it). */
  partnerFirstLeadSuit: Suit | null;
  /** How many tricks have been led in each suit (hold-up round counting). */
  roundsLed: Record<Suit, number>;
  legal: Card[];
}

/** Ranks of `suit` still unseen by this seat (not in visible hands or played). */
export function unseenInSuit(view: PlayView, suit: Suit): number[] {
  const seen = new Set<number>();
  for (const c of view.own) if (c.suit === suit) seen.add(c.rank);
  for (const c of view.partnerVisible ?? []) if (c.suit === suit) seen.add(c.rank);
  for (const c of view.played) if (c.suit === suit) seen.add(c.rank);
  const out: number[] = [];
  for (let r = 2; r <= 14; r++) if (!seen.has(r)) out.push(r);
  return out;
}

/** Is `card` the master (highest still-live card) of its suit from this view? */
export function isMaster(view: PlayView, card: Card): boolean {
  const unseen = unseenInSuit(view, card.suit);
  const higherUnseen = unseen.some((r) => r > card.rank);
  const higherVisibleElsewhere =
    (view.partnerVisible ?? []).some((c) => c.suit === card.suit && c.rank > card.rank) ||
    view.own.some((c) => c.suit === card.suit && c.rank > card.rank && c !== card);
  return !higherUnseen && !higherVisibleElsewhere;
}

export function buildPlayView(state: GameState, seat: Seat): PlayView | null {
  if (!state.contract || state.phase !== "play") return null;
  const contract = state.contract;
  const trumps = contract.strain === "N" ? null : contract.strain;
  const dummySeat = partnerOf(contract.declarer);
  const openingLeadMade =
    state.tricks.length > 1 || (state.tricks[0]?.plays.length ?? 0) > 0;

  const isDeclarerSide = sideOf(seat) === sideOf(contract.declarer);
  let partnerVisible: Card[] | null = null;
  if (openingLeadMade) {
    if (seat === dummySeat) partnerVisible = state.hands[contract.declarer];
    else if (seat === contract.declarer) partnerVisible = state.hands[dummySeat];
    else partnerVisible = state.hands[dummySeat]; // defenders see dummy only
  }
  // A defender's "partnerVisible" is dummy — an OPPONENT's hand. Behaviors
  // must treat it as table information, not as partner's holding; the field
  // name reflects declarer-side use, so defense behaviors read `dummy()`.

  const last: Trick | undefined = state.tricks[state.tricks.length - 1];
  const inProgress = last && last.plays.length > 0 && last.plays.length < 4 ? last : null;

  const played: Card[] = state.tricks.flatMap((t) => t.plays.map((p) => p.card));
  const completed = state.tricks.filter((t) => t.plays.length === 4);
  let ownTricks = 0;
  for (const t of completed) if (t.winner && sideOf(t.winner) === sideOf(seat)) ownTricks++;
  const oppTricks = completed.length - ownTricks;

  const declarerTricks =
    sideOf(seat) === sideOf(contract.declarer) ? ownTricks : oppTricks;

  const partner = partnerOf(seat);
  const partnerFirstLeadSuit =
    state.tricks.find((t) => t.leader === partner && t.plays.length > 0)?.plays[0]!.card
      .suit ?? null;
  const roundsLed: Record<Suit, number> = { S: 0, H: 0, D: 0, C: 0 };
  for (const t of state.tricks)
    if (t.plays.length > 0) roundsLed[t.plays[0]!.card.suit]++;

  return {
    seat,
    contract,
    trumps,
    own: state.hands[seat],
    partnerVisible,
    isDeclarerSide,
    dummySeat,
    played,
    trick: inProgress
      ? { ledSuit: inProgress.plays[0]!.card.suit, plays: inProgress.plays }
      : null,
    position: inProgress ? inProgress.plays.length : 0,
    tricksOwn: ownTricks,
    tricksOpp: oppTricks,
    neededByDeclarer: Math.max(0, contract.level + 6 - declarerTricks),
    partnerFirstLeadSuit,
    roundsLed,
    legal: legalPlays(state, seat),
  };
}

/** Dummy's remaining cards as seen from a DEFENDER's seat (else null). */
export function dummyFromDefense(view: PlayView): Card[] | null {
  return view.isDeclarerSide ? null : view.partnerVisible;
}

/** Combined declarer-side holding in a suit (declarer-side seats only). */
export function combinedInSuit(view: PlayView, suit: Suit): Card[] {
  if (!view.isDeclarerSide) return view.own.filter((c) => c.suit === suit);
  return [...view.own, ...(view.partnerVisible ?? [])].filter((c) => c.suit === suit);
}

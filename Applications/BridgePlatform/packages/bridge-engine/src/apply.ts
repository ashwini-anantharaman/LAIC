// Pure state fold, ported from the bridgebot prototype (src/game/apply.ts).
// The game's canonical state derives exclusively from action events; logic
// events never reach here.

import {
  cardId,
  nextSeat,
  type ActionEvent,
  type Card,
  type Seat,
  type Suit,
} from "@bridge/events";
import { auctionComplete, finalContract } from "./auction";
import { initialState, sideOf, type GameState, type Trick } from "./state";

/** Winner of a completed (4-card) trick given the trump strain ('N' = notrump). */
export function trickWinner(trick: Trick, trump: Suit | "N"): Seat {
  const led = trick.plays[0]!.card.suit;
  const beats = (a: Card, b: Card): boolean => {
    const at = trump !== "N" && a.suit === trump;
    const bt = trump !== "N" && b.suit === trump;
    if (at && !bt) return true;
    if (bt && !at) return false;
    if (at && bt) return a.rank > b.rank;
    // neither trump: only cards of the led suit can win
    const al = a.suit === led;
    const bl = b.suit === led;
    if (al && !bl) return true;
    if (bl && !al) return false;
    return a.rank > b.rank;
  };
  let best = trick.plays[0]!;
  for (const p of trick.plays.slice(1)) if (beats(p.card, best.card)) best = p;
  return best.seat;
}

/** Legal plays for a seat: must follow the led suit if able, else any card. */
export function legalPlays(state: GameState, seat: Seat): Card[] {
  const hand = state.hands[seat];
  const trick = state.tricks[state.tricks.length - 1];
  const onLead = !trick || trick.plays.length === 0 || trick.plays.length === 4;
  if (onLead) return [...hand];
  const led = trick.plays[0]!.card.suit;
  const following = hand.filter((c) => c.suit === led);
  return following.length ? following : [...hand];
}

/**
 * Pure fold: apply ONE state-changing action event.
 */
export function applyEvent(state: GameState, event: ActionEvent): GameState {
  if (event.category === "bid-event") {
    const auction = [...state.auction, { seat: event.seat, call: event.call }];
    if (!auctionComplete(auction)) {
      return { ...state, auction, turn: nextSeat(event.seat) };
    }
    const contract = finalContract(auction);
    if (!contract) {
      return { ...state, auction, contract: null, phase: "complete" };
    }
    const opener = nextSeat(contract.declarer); // declarer's LHO leads
    return {
      ...state,
      auction,
      contract,
      phase: "play",
      turn: opener,
      tricks: [{ leader: opener, plays: [] }],
    };
  }

  // play-event
  const seat = event.seat;
  const hands = {
    ...state.hands,
    [seat]: state.hands[seat].filter((c) => cardId(c) !== cardId(event.card)),
  };
  const tricks = state.tricks.map((t) => ({ ...t, plays: [...t.plays] }));
  let cur = tricks[tricks.length - 1];
  if (!cur || cur.plays.length === 4) {
    cur = { leader: seat, plays: [] };
    tricks.push(cur);
  }
  cur.plays.push({ seat, card: event.card });

  if (cur.plays.length < 4) {
    return { ...state, hands, tricks, turn: nextSeat(seat) };
  }

  // trick complete
  const trump = state.contract ? state.contract.strain : "N";
  const winner = trickWinner(cur, trump);
  cur.winner = winner;
  const side = sideOf(winner);
  const trickCount = { ...state.trickCount, [side]: state.trickCount[side] + 1 };
  const done =
    hands.N.length === 0 &&
    hands.E.length === 0 &&
    hands.S.length === 0 &&
    hands.W.length === 0;
  return {
    ...state,
    hands,
    tricks,
    trickCount,
    turn: winner,
    phase: done ? "complete" : "play",
  };
}

/** Reconstruct state by folding action events over a fresh initial state. */
export function reconstruct(initial: GameState, actions: ActionEvent[]): GameState {
  let s = initialState(initial.boardRef, initial.dealer, initial.vul, initial.hands);
  for (const a of actions) s = applyEvent(s, a);
  return s;
}

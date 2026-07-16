// Action realization (Knowledge Rework §2): turn a typed AuctionAction or
// PlayBehavior into a concrete legal call/card, or null when the action
// cannot be realized legally — an unrealizable action means the rule simply
// does not act (the chain continues), never an illegal move.

import {
  isContractBid,
  SUIT_RANK,
  type Call,
  type Card,
  type Hand,
  type Seat,
  type Suit,
} from "@bridge/events";
import type { AuctionAction, LeadStyle, PlayBehavior } from "@bridge/kb";
import { legalCalls } from "../auction";
import { legalPlays, trickWinner } from "../apply";
import { longestSuits, suitCounts } from "../hand";
import { sideOf, type GameState } from "../state";
import type { SeatAuctionFacts } from "./auctionContext";

// ---------------------------------------------------------------------------
// Auction actions
// ---------------------------------------------------------------------------

const STRAIN_ORDER: readonly string[] = ["C", "D", "H", "S", "N"];

export function realizeAuctionAction(
  action: AuctionAction,
  state: GameState,
  seat: Seat,
  facts: SeatAuctionFacts,
): Call | null {
  const legal = legalCalls(state.auction, seat);
  const ifLegal = (call: Call): Call | null => (legal.has(call) ? call : null);

  switch (action.type) {
    case "pass":
      return "P";
    case "double":
      return ifLegal("X");
    case "redouble":
      return ifLegal("XX");
    case "bid":
      return ifLegal(`${action.level}${action.strain}`);
    case "raise_partner": {
      if (!facts.partnerLast || !isContractBid(facts.partnerLast)) return null;
      const strain = facts.partnerLast[1]!;
      if (strain === "N") return null;
      return ifLegal(`${action.toLevel}${strain}`);
    }
    case "bid_longest": {
      const candidates = longestSuits(state.hands[seat]).filter((l) =>
        action.among.includes(l.suit),
      );
      // Prefer longer, then higher-ranked suit (longestSuits is rank-sorted).
      for (const { suit } of candidates) {
        if (action.level !== undefined) {
          const call = ifLegal(`${action.level}${suit}`);
          if (call) return call;
        } else {
          // Cheapest legal level for this suit.
          for (let level = 1; level <= 7; level++) {
            const call = ifLegal(`${level}${suit}`);
            if (call) return call;
          }
        }
      }
      return null;
    }
    case "first_legal_of": {
      for (const c of action.calls) {
        const call = ifLegal(`${c.level}${c.strain}`);
        if (call) return call;
      }
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Card play
// ---------------------------------------------------------------------------

const byRankAsc = (a: Card, b: Card) => a.rank - b.rank || SUIT_RANK[a.suit] - SUIT_RANK[b.suit];

/** Cards of the currently led suit among the legal set (empty when leading/void). */
function followingCards(state: GameState, legal: Card[]): Card[] {
  const trick = state.tricks[state.tricks.length - 1];
  if (!trick || trick.plays.length === 0 || trick.plays.length === 4) return [];
  const led = trick.plays[0]!.card.suit;
  return legal.filter((c) => c.suit === led);
}

/** The card currently winning the in-progress trick. */
function currentWinningCard(state: GameState): Card | null {
  const trick = state.tricks[state.tricks.length - 1];
  if (!trick || trick.plays.length === 0 || trick.plays.length === 4) return null;
  const trump = state.contract ? state.contract.strain : "N";
  const winner = trickWinner(
    { ...trick, plays: [...trick.plays] },
    trump === "N" ? "N" : (trump as Suit),
  );
  return trick.plays.find((p) => p.seat === winner)?.card ?? null;
}

/** Does `card` beat the current winning card of the in-progress trick? */
function beatsCurrent(state: GameState, card: Card): boolean {
  const winning = currentWinningCard(state);
  if (!winning) return true;
  const trump = state.contract && state.contract.strain !== "N" ? state.contract.strain : null;
  const cardTrump = trump !== null && card.suit === trump;
  const winTrump = trump !== null && winning.suit === trump;
  if (cardTrump && !winTrump) return true;
  if (!cardTrump && winTrump) return false;
  if (card.suit === winning.suit) return card.rank > winning.rank;
  return false;
}

export function realizeLead(style: LeadStyle, hand: Hand): Card | null {
  const longest = longestSuits(hand)[0];
  if (!longest) return null;
  const suitCards = hand.filter((c) => c.suit === longest.suit).sort(byRankAsc);
  if (!suitCards.length) return null;

  switch (style) {
    case "top_of_sequence": {
      // Highest card that heads a two-card touching sequence, else fall low.
      for (let i = suitCards.length - 1; i > 0; i--) {
        if (suitCards[i]!.rank === suitCards[i - 1]!.rank + 1 && suitCards[i]!.rank >= 10)
          return suitCards[i]!;
      }
      return suitCards[0]!;
    }
    case "fourth_best":
      return suitCards.length >= 4 ? suitCards[suitCards.length - 4]! : suitCards[0]!;
    case "top_of_nothing":
      return suitCards[suitCards.length - 1]!.rank <= 9
        ? suitCards[suitCards.length - 1]!
        : suitCards[0]!;
    case "low_from_honor":
    case "low_from_longest":
      return suitCards[0]!;
  }
}

export function realizePlayBehavior(
  behavior: PlayBehavior,
  state: GameState,
  seat: Seat,
): Card | null {
  const legal = legalPlays(state, seat);
  if (!legal.length) return null;
  const sorted = [...legal].sort(byRankAsc);
  const following = followingCards(state, legal).sort(byRankAsc);
  const trick = state.tricks[state.tricks.length - 1];
  const positionInTrick = trick && trick.plays.length < 4 ? trick.plays.length : 0;

  switch (behavior) {
    case "lowest_legal":
      return sorted[0]!;
    case "lowest_following":
      return following[0] ?? sorted[0]!;
    case "highest_following":
      return following[following.length - 1] ?? sorted[0]!;
    case "win_cheaply": {
      const winners = following.filter((c) => beatsCurrent(state, c));
      return winners[0] ?? following[0] ?? sorted[0]!;
    }
    case "second_hand_low":
      return positionInTrick === 1 ? (following[0] ?? sorted[0]!) : null;
    case "third_hand_high": {
      if (positionInTrick !== 2) return null;
      // Partner (the leader) may already be winning: then play low.
      const winning = currentWinningCard(state);
      const trickNow = state.tricks[state.tricks.length - 1]!;
      const partnerWinning =
        winning &&
        trickNow.plays.some(
          (p) => p.card === winning && sideOf(p.seat) === sideOf(seat),
        );
      if (partnerWinning) return following[0] ?? sorted[0]!;
      return following[following.length - 1] ?? sorted[0]!;
    }
    case "cover_honor": {
      const winning = currentWinningCard(state);
      if (!winning || winning.rank < 11) return null;
      const covers = following.filter((c) => c.rank > winning.rank);
      return covers[0] ?? null;
    }
    case "cash_winners": {
      // On lead: play a card that is the highest remaining in its suit.
      if (positionInTrick !== 0) return null;
      const played = new Set(
        state.tricks.flatMap((t) => t.plays.map((p) => `${p.card.suit}${p.card.rank}`)),
      );
      for (const c of [...legal].sort((a, b) => b.rank - a.rank)) {
        let isTop = true;
        for (let r = c.rank + 1; r <= 14; r++) {
          const inOwnHand = state.hands[seat].some((h) => h.suit === c.suit && h.rank === r);
          if (!played.has(`${c.suit}${r}`) && !inOwnHand) {
            isTop = false;
            break;
          }
        }
        if (isTop) return c;
      }
      return null;
    }
    case "discard_lowest": {
      if (following.length) return null; // can follow — not a discard situation
      const trump = state.contract && state.contract.strain !== "N" ? state.contract.strain : null;
      const nonTrump = sorted.filter((c) => c.suit !== trump);
      return nonTrump[0] ?? sorted[0]!;
    }
  }
}

// Expanded play behaviors (2026-07-21), ported and adapted from the
// bridgebot prototype's playEngine.ts — declarer technique (trump drawing,
// finesses, hold-ups, ducks, establishment, ruffs, cash-outs) and defense
// technique (returning partner's suit, hold-ups, overruffs, second-hand
// rises). Every behavior:
//   · decides ONLY from a PlayView (legitimate information — see playView.ts),
//   · self-gates: returns null when its trigger doesn't hold, so the decider
//     simply moves on to the next rule (mirrors second_hand_low today).

import type { Card, Suit } from "@bridge/events";
import type { PlayBehavior } from "@bridge/kb";
import {
  combinedInSuit,
  dummyFromDefense,
  isMaster,
  unseenInSuit,
  type PlayView,
} from "./playView";

const asc = (a: Card, b: Card) => a.rank - b.rank;
const inSuit = (cards: Card[], suit: Suit) => cards.filter((c) => c.suit === suit);
const lowest = (cards: Card[]): Card | null => [...cards].sort(asc)[0] ?? null;
const highest = (cards: Card[]): Card | null =>
  [...cards].sort(asc)[cards.length - 1] ?? null;

/** The card currently winning the in-progress trick, judged from the view. */
function currentWinner(view: PlayView): { card: Card; byOpponent: boolean } | null {
  if (!view.trick) return null;
  let best = view.trick.plays[0]!;
  for (const p of view.trick.plays.slice(1)) {
    const bestTrump = view.trumps !== null && best.card.suit === view.trumps;
    const pTrump = view.trumps !== null && p.card.suit === view.trumps;
    if (pTrump && !bestTrump) best = p;
    else if (pTrump === bestTrump && p.card.suit === best.card.suit && p.card.rank > best.card.rank)
      best = p;
  }
  const mySide = (s: string) => (s === "N" || s === "S" ? "NS" : "EW");
  const winnerSide = mySide(best.seat);
  const ownSide = mySide(view.seat);
  return { card: best.card, byOpponent: winnerSide !== ownSide };
}

/** Legal cards of the led suit (empty when leading or void). */
function following(view: PlayView): Card[] {
  if (!view.trick) return [];
  return inSuit(view.legal, view.trick.ledSuit).sort(asc);
}

/** Longest combined non-trump suit meeting a minimum combined length. */
function longestSideSuit(view: PlayView, minCombined: number): Suit | null {
  let best: { suit: Suit; len: number } | null = null;
  for (const suit of ["S", "H", "D", "C"] as Suit[]) {
    if (suit === view.trumps) continue;
    const len = combinedInSuit(view, suit).length;
    if (len >= minCombined && (!best || len > best.len)) best = { suit, len };
  }
  return best?.suit ?? null;
}

/** Count sure winners: top consecutive live cards per suit in the combined hands. */
function sureWinners(view: PlayView): number {
  let total = 0;
  for (const suit of ["S", "H", "D", "C"] as Suit[]) {
    const ours = combinedInSuit(view, suit)
      .map((c) => c.rank)
      .sort((a, b) => b - a);
    const unseen = unseenInSuit(view, suit);
    let expect = 14;
    for (const rank of ours) {
      // Walk down from the ace: each of our cards is a sure winner while no
      // unseen rank sits above it.
      while (expect > rank && !unseen.includes(expect)) expect--;
      if (rank === expect) {
        total++;
        expect--;
      } else break;
    }
  }
  return total;
}

export function realizeTechnique(
  behavior: Exclude<
    PlayBehavior,
    | "lowest_following"
    | "highest_following"
    | "win_cheaply"
    | "second_hand_low"
    | "third_hand_high"
    | "cover_honor"
    | "cash_winners"
    | "lowest_legal"
    | "discard_lowest"
  >,
  view: PlayView,
): Card | null {
  switch (behavior) {
    // ---- declarer ----------------------------------------------------------

    case "draw_trumps": {
      if (!view.isDeclarerSide || view.trumps === null || view.position !== 0) return null;
      const oppTrumps = unseenInSuit(view, view.trumps);
      if (!oppTrumps.length) return null; // already drawn
      const mine = inSuit(view.legal, view.trumps);
      if (!mine.length) return null;
      // Cash the master when we hold it; otherwise lead low toward the other
      // hand's honors (or concede the round cheaply to keep drawing).
      const master = mine.find((c) => isMaster(view, c));
      return master ?? lowest(mine);
    }

    case "finesse_toward_tenace": {
      if (!view.isDeclarerSide || view.position !== 0 || !view.partnerVisible) return null;
      for (const suit of ["S", "H", "D", "C"] as Suit[]) {
        const partner = inSuit(view.partnerVisible, suit)
          .map((c) => c.rank)
          .sort((a, b) => b - a);
        if (partner.length < 2) continue;
        // Tenace: partner's top two cards straddle exactly one missing rank
        // that an opponent still holds (A-Q missing K, K-J missing Q, …).
        const gap = partner[0]! - 1;
        if (partner[1]! !== partner[0]! - 2) continue;
        if (!unseenInSuit(view, suit).includes(gap)) continue;
        // Eight-ever-nine-never: with 9+ combined and the queen missing,
        // play for the drop instead (let a cashing behavior act).
        if (gap === 12 && combinedInSuit(view, suit).length >= 9) continue;
        const mine = inSuit(view.legal, suit).sort(asc);
        // Lead low TOWARD the tenace.
        if (mine.length && mine[0]!.rank < partner[1]!) return mine[0]!;
      }
      return null;
    }

    case "hold_up_stopper": {
      // NT declarer ducking the defenders' led suit while holding the lone ace.
      if (!view.isDeclarerSide || view.trumps !== null || view.position === 0) return null;
      const led = view.trick!.ledSuit;
      const follow = following(view);
      if (!follow.length) return null;
      const combined = combinedInSuit(view, led);
      const holdsLoneAce =
        combined.some((c) => c.rank === 14) && !combined.some((c) => c.rank === 13);
      if (!holdsLoneAce || combined.length < 2) return null;
      if (view.roundsLed[led] > 2) return null; // held up long enough
      const low = follow[0]!;
      return low.rank === 14 ? null : low; // forced ace = not a hold-up
    }

    case "duck_to_preserve_entry": {
      // Early establishment duck: concede the first round of the long suit.
      if (!view.isDeclarerSide || view.position !== 0) return null;
      if (view.tricksOwn + view.tricksOpp >= 3) return null; // only early
      const suit = longestSideSuit(view, 7);
      if (!suit) return null;
      const unseenTop = Math.max(0, ...unseenInSuit(view, suit));
      const ourTop = Math.max(0, ...combinedInSuit(view, suit).map((c) => c.rank));
      if (unseenTop < ourTop) return null; // we own the master — no duck needed
      if (view.roundsLed[suit] > 0) return null; // only the first round
      const mine = inSuit(view.legal, suit).sort(asc);
      return mine[0] ?? null;
    }

    case "establish_long_suit": {
      if (!view.isDeclarerSide || view.position !== 0) return null;
      const suit = longestSideSuit(view, 7);
      if (!suit) return null;
      const unseen = unseenInSuit(view, suit);
      if (!unseen.length) return null; // already established
      const ourTop = combinedInSuit(view, suit).map((c) => c.rank);
      if (Math.max(0, ...unseen) < Math.max(0, ...ourTop)) return null; // we're boss
      const mine = inSuit(view.legal, suit).sort(asc);
      if (!mine.length) return null;
      // Top of a touching sequence drives out their honor; else low toward
      // the other hand.
      for (let i = mine.length - 1; i > 0; i--) {
        if (mine[i]!.rank === mine[i - 1]!.rank + 1 && mine[i]!.rank >= 10) return mine[i]!;
      }
      return mine[0]!;
    }

    case "ruff_loser": {
      if (!view.isDeclarerSide || view.trumps === null || view.position === 0) return null;
      if (following(view).length) return null; // can follow — not a ruff spot
      const winner = currentWinner(view);
      if (!winner || !winner.byOpponent) return null;
      const trumpsHeld = inSuit(view.legal, view.trumps).sort(asc);
      if (!trumpsHeld.length) return null;
      if (winner.card.suit === view.trumps) {
        const over = trumpsHeld.find((c) => c.rank > winner.card.rank);
        return over ?? null;
      }
      return trumpsHeld[0]!;
    }

    case "discard_loser_on_winner": {
      if (view.position === 0 || following(view).length) return null;
      const winner = currentWinner(view);
      if (!winner || winner.byOpponent) return null; // our side must be winning
      if (!isMaster(view, winner.card)) return null;
      const nonTrump = view.legal.filter((c) => c.suit !== view.trumps).sort(asc);
      return nonTrump[0] ?? null;
    }

    case "cash_out_when_enough": {
      if (!view.isDeclarerSide || view.position !== 0) return null;
      if (sureWinners(view) < view.neededByDeclarer) return null;
      // Cash from the top: play a master from our own hand; else lead low
      // toward the visible hand's master.
      const ownMasters = view.legal.filter((c) => isMaster(view, c));
      const top = highest(ownMasters);
      if (top) return top;
      for (const suit of ["S", "H", "D", "C"] as Suit[]) {
        const theirs = inSuit(view.partnerVisible ?? [], suit);
        const master = theirs.find((c) => isMaster(view, c));
        if (master) {
          const mine = inSuit(view.legal, suit).sort(asc);
          if (mine.length) return mine[0]!;
        }
      }
      return null;
    }

    // ---- defense -----------------------------------------------------------

    case "return_partner_suit": {
      if (view.isDeclarerSide || view.position !== 0) return null;
      const suit = view.partnerFirstLeadSuit;
      if (!suit || suit === view.trumps) return null;
      const mine = inSuit(view.legal, suit).sort(asc);
      if (!mine.length) return null;
      // Top of a remaining doubleton, else lowest.
      return mine.length === 2 ? mine[1]! : mine[0]!;
    }

    case "hold_up_ace": {
      // Defender ducks declarer's suit while holding Ax(x) — NT hold-up.
      if (view.isDeclarerSide || view.trumps !== null || view.position === 0) return null;
      const led = view.trick!.ledSuit;
      const follow = following(view);
      if (follow.length < 2) return null; // stiff or forced
      if (!follow.some((c) => c.rank === 14)) return null;
      if (view.roundsLed[led] > 2) return null;
      return follow[0]!;
    }

    case "overruff_or_discard": {
      if (view.isDeclarerSide || view.position === 0 || following(view).length) return null;
      const winner = currentWinner(view);
      if (!winner) return null;
      if (view.trumps !== null) {
        const trumpsHeld = inSuit(view.legal, view.trumps).sort(asc);
        if (winner.byOpponent && winner.card.suit === view.trumps) {
          const over = trumpsHeld.find((c) => c.rank > winner.card.rank);
          if (over) return over;
        } else if (winner.byOpponent && trumpsHeld.length) {
          return trumpsHeld[0]!;
        }
      }
      const nonTrump = view.legal.filter((c) => c.suit !== view.trumps).sort(asc);
      return nonTrump[0] ?? lowest(view.legal);
    }

    case "second_hand_rise_vs_honor": {
      if (view.isDeclarerSide || view.position !== 1) return null;
      const ledCard = view.trick!.plays[0]!.card;
      if (ledCard.rank < 10) return null; // an honor led threatens a finesse
      const follow = following(view);
      const ace = follow.find((c) => c.rank === 14);
      // Rise with the ace over a led honor ("cover an honor with the ace" —
      // don't let their tenace ride around it). Dummy info could refine this;
      // keep the classic rule.
      return ace ?? null;
    }
  }
}

/** Defense helper re-export for tests. */
export { dummyFromDefense };

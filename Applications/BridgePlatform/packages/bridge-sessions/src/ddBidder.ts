// The solver seat's auction — a compact natural bidder, and nothing else.
//
// WHY THIS EXISTS RATHER THAN THE KNOWLEDGE BASE. The solver seat used to bid
// through `createKbDecider`. That was wrong: the KB house player is SHELVED,
// and challenges say in as many words that it "is never seated here, not even
// as a fallback" — a one-attempt scored board must not be played against it.
// Making the solver the default for challenges therefore smuggled the shelved
// player back in through the auction. It must not be used at all (owner,
// 2026-08-16), so this file replaces it.
//
// WHY NOT BEN. BEN bids well and answers in ~0.44s warm, but it is a service:
// it needs an endpoint, it is a neural net rather than a reproducible function,
// and a challenge wants every entrant to meet the SAME opponents. This is pure,
// local and deterministic — the same hand and auction always produce the same
// call — which suits a scored contest and keeps a solver table working on a
// server with no engine service at all.
//
// WHAT IT IS, HONESTLY. A small natural core: sound openings, simple responses,
// a conservative rebid, a simple overcall, and Pass whenever nothing clearly
// applies. It is not a bidding SYSTEM and does not pretend to be one — there is
// no Stayman, no transfers, no 2♣ opening, no slam machinery. It reaches
// sensible part-scores and games and gets out of the way. Every unrecognised
// situation passes, which is what keeps auctions terminating.

import { hcp, isBalanced, legalCalls, suitCounts, type GameState } from "@bridge/engine";
import type { AuctionCall, Call, Card, Seat, Suit } from "@bridge/events";

const PARTNER: Record<Seat, Seat> = { N: "S", S: "N", E: "W", W: "E" };
/** Cheapest first, so "the better minor" and "the longer major" read directly. */
const SUIT_RANK: Record<Suit, number> = { C: 0, D: 1, H: 2, S: 3 };
const STRAINS = ["C", "D", "H", "S", "N"] as const;

export interface BidChoice {
  call: Call;
  /** Why, in one line — this is what the rail shows. */
  why: string;
}

/** A contract call's ordering, so "higher than" is a comparison. -1 for P/X/XX. */
function rank(call: Call): number {
  const m = /^([1-7])([CDHSN])$/.exec(call);
  if (!m) return -1;
  return (Number(m[1]) - 1) * 5 + STRAINS.indexOf(m[2] as (typeof STRAINS)[number]);
}

const isBid = (call: Call) => rank(call) >= 0;
const strainOf = (call: Call) => call[1] as Suit | "N";
const levelOf = (call: Call) => Number(call[0]);

/**
 * The chosen call, or Pass. Never returns something illegal: everything is
 * checked against the engine's own legal set on the way out.
 */
export function chooseCall(state: GameState, seat: Seat): BidChoice {
  const legal = legalCalls(state.auction, seat);
  const hand = state.hands[seat];
  const points = hcp(hand);
  const counts = suitCounts(hand);
  const balanced = isBalanced(hand);
  const auction = state.auction;

  /** Only ever answer with a call the engine allows. */
  const say = (call: Call, why: string): BidChoice =>
    legal.has(call) ? { call, why } : { call: "P", why: `${why} — not available, passed` };
  const pass = (why: string): BidChoice => ({ call: "P", why });

  const partner = PARTNER[seat];
  const bidsBy = (who: Seat) => auction.filter((c) => c.seat === who && isBid(c.call));
  const myBids = bidsBy(seat);
  const partnerBids = bidsBy(partner);
  const oppBids = auction.filter(
    (c) => c.seat !== seat && c.seat !== partner && isBid(c.call),
  );
  const highest = auction.reduce((hi, c) => Math.max(hi, rank(c.call)), -1);

  /** Longest suit, ties broken by the higher-ranking one. */
  const longest = (): Suit => {
    let best: Suit = "C";
    for (const s of ["C", "D", "H", "S"] as Suit[])
      if (counts[s] > counts[best] || (counts[s] === counts[best] && SUIT_RANK[s] > SUIT_RANK[best]))
        best = s;
    return best;
  };
  /** The suit to open: a five-card major, else the better minor. */
  const openingSuit = (): Suit => {
    if (counts.S >= 5 || counts.H >= 5) return counts.S >= counts.H ? "S" : "H";
    if (counts.D >= 4 || counts.C >= 4) return counts.D >= counts.C ? "D" : "C";
    return longest();
  };

  // ── nobody has bid: this is an opening ────────────────────────────────────
  if (highest < 0) {
    if (points >= 20 && balanced) return say("2N", `${points} HCP balanced — 2NT`);
    if (points >= 15 && points <= 17 && balanced) return say("1N", `${points} HCP balanced — 1NT`);
    if (points >= 12) {
      const s = openingSuit();
      return say(`1${s}` as Call, `${points} HCP, ${counts[s]} ${s} — opening one`);
    }
    // Preempts: shape, not points. Long suit and not enough to open at the one
    // level is exactly the hand that makes life hard for the opponents.
    const long = longest();
    if (points >= 5 && points <= 10) {
      if (counts[long] >= 7) return say(`3${long}` as Call, `${counts[long]}-card ${long} — preempt`);
      if (counts[long] === 6 && long !== "C")
        return say(`2${long}` as Call, `six ${long}, ${points} HCP — weak two`);
    }
    return pass(`${points} HCP — no opening`);
  }

  // ── partner opened and this is the first reply ────────────────────────────
  const partnerOpened = partnerBids.length > 0 && myBids.length === 0;
  if (partnerOpened && oppBids.length === 0) {
    const opening = partnerBids[0]!.call;
    const openStrain = strainOf(opening);

    if (opening === "1N") {
      if (points >= 10) return say("3N", `${points} opposite 1NT — game`);
      if (points >= 8) return say("2N", `${points} opposite 1NT — inviting`);
      return pass(`${points} opposite 1NT — no game`);
    }
    if (opening === "2N") {
      if (points >= 5) return say("3N", `${points} opposite 2NT — game`);
      return pass(`${points} opposite 2NT — no game`);
    }
    // A weak two or a preempt is a picture, not an invitation: leave it alone.
    if (levelOf(opening) >= 2) return pass("partner preempted — passed");

    if (points < 6) return pass(`${points} HCP — too little to respond`);

    // Support for a major is the first thing worth saying.
    if (openStrain !== "N" && counts[openStrain as Suit] >= 3 && (openStrain === "H" || openStrain === "S")) {
      const fit = counts[openStrain as Suit];
      if (points >= 13) return say(`4${openStrain}` as Call, `${points} HCP, ${fit}-card fit — game`);
      if (points >= 10) return say(`3${openStrain}` as Call, `${points} HCP, ${fit}-card fit — invite`);
      return say(`2${openStrain}` as Call, `${points} HCP, ${fit}-card fit — simple raise`);
    }

    // A new suit at the one level, cheapest first, is next.
    for (const s of ["D", "H", "S"] as Suit[]) {
      const call = `1${s}` as Call;
      if (counts[s] >= 4 && legal.has(call) && rank(call) > highest)
        return say(call, `${points} HCP, ${counts[s]} ${s} — new suit`);
    }

    if (points >= 13 && balanced) return say("3N", `${points} HCP balanced — game`);
    if (points >= 11 && balanced) return say("2N", `${points} HCP balanced — invite`);
    return say("1N", `${points} HCP, nothing better — 1NT`);
  }

  // ── opener's rebid ────────────────────────────────────────────────────────
  if (myBids.length > 0 && partnerBids.length > 0) {
    const mine = myBids[0]!.call;
    const theirs = partnerBids[partnerBids.length - 1]!.call;
    const myStrain = strainOf(mine);

    // Partner supported: with extra values bid the game, otherwise stop.
    if (strainOf(theirs) === myStrain && myStrain !== "N") {
      const s = myStrain as Suit;
      const game = (s === "H" || s === "S") ? `4${s}` : `5${s}`;
      if (points >= 17 && legal.has(game as Call) && rank(game as Call) > highest)
        return say(game as Call, `${points} HCP opposite support — game`);
      return pass(`${points} HCP — the contract is high enough`);
    }
    // A six-card suit is worth repeating, once, with something to spare.
    if (myStrain !== "N" && counts[myStrain as Suit] >= 6) {
      const again = `${levelOf(theirs) + (rank(`${levelOf(theirs)}${myStrain}` as Call) > highest ? 0 : 1)}${myStrain}` as Call;
      if (points >= 15 && legal.has(again) && rank(again) > highest && levelOf(again) <= 3)
        return say(again, `${points} HCP, six ${myStrain} — rebid`);
    }
    // Four-card support for partner's suit.
    const theirStrain = strainOf(theirs);
    if (theirStrain !== "N" && counts[theirStrain as Suit] >= 4) {
      const raise = `${levelOf(theirs) + 1}${theirStrain}` as Call;
      if (points >= 14 && legal.has(raise) && rank(raise) > highest && levelOf(raise) <= 3)
        return say(raise, `${points} HCP, ${counts[theirStrain as Suit]}-card support — raise`);
    }
    if (points >= 18 && balanced && legal.has("3N") && rank("3N") > highest)
      return say("3N", `${points} HCP balanced — game`);
    return pass(`${points} HCP — nothing more to say`);
  }

  // ── the opponents opened ──────────────────────────────────────────────────
  if (oppBids.length > 0 && myBids.length === 0) {
    if (points >= 15 && points <= 18 && balanced && legal.has("1N") && rank("1N") > highest)
      return say("1N", `${points} HCP balanced over their opening — 1NT`);
    if (points >= 10 && points <= 16) {
      const s = longest();
      if (counts[s] >= 5) {
        // Cheapest available level in that suit, and never past two: a simple
        // overcall is a suggestion, and this bidder has no machinery to run an
        // auction it has pushed high.
        for (const level of [1, 2]) {
          const call = `${level}${s}` as Call;
          if (legal.has(call) && rank(call) > highest)
            return say(call, `${points} HCP, ${counts[s]} ${s} — overcall`);
        }
      }
    }
    return pass(`${points} HCP — nothing to overcall`);
  }

  // Anything this bidder does not recognise passes. That is deliberate: an
  // auction only ends because someone stops, and a bidder that guesses in
  // unfamiliar positions is how you end up at the five level with no fit.
  return pass(`${points} HCP — passed`);
}

/**
 * The card to play when the solver declines a position — lowest legal card.
 *
 * It exists so `decidePlay` never has to reach for a KB decider to fill a gap.
 * It should essentially never run: the solver refuses only a position it cannot
 * read, which a live table does not produce.
 */
export function fallbackCard(state: GameState, seat: Seat, legal: readonly Card[]): Card {
  return [...legal].sort(
    (a, b) => a.rank - b.rank || SUIT_RANK[a.suit] - SUIT_RANK[b.suit],
  )[0]!;
}

/** Exposed for tests: the auction so far, as this bidder sees it. */
export type { AuctionCall };

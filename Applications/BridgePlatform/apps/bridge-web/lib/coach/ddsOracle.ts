// The double-dummy oracle, backed by the real thing.
//
// Bo Haglund and Søren Hein's `dds` — the C++ solver essentially every bridge
// site runs — compiled to WebAssembly and reached through its raw C API.
//
// WHY THIS REPLACED OUR OWN SOLVER. Not speed. Correctness. The hand-written
// solver cached alpha-beta results after a cutoff, where the value is only a
// bound, keyed on position with no record of the window it was valid for — and
// shared one memo across every candidate card. Measured against a play-out of its
// own recommendations it was right on 17 of 40 five-card endings; on one position
// it claimed both sides could win all five tricks. This engine was right on 40 of
// 40.
//
// The speed is the bonus, and it changes what the coach can do: 13ms median for a
// full thirteen-card deal against roughly four days for ours, and 0.4ms at eight
// cards against twenty-three seconds. There is no longer any position in a hand
// the solver cannot be asked about, so `searchDepthFor` and the whole
// budget-to-depth apparatus are gone.
//
// WHY IT LIVES IN THE APP rather than in @laic/coach. `oracle.ts` in the
// component is a PORT and the app already constructed the implementation. Keeping
// it here means the coach component gains no runtime dependency and its
// dependency-free guard (`check:core`) stays meaningful.

import { Dds, loadDds, type DdsModule } from "bridge-dds";

import type { DoubleDummyOracle, OracleVerdict } from "@laic/coach/domains/bridge";
import type { LiveCardPlayState } from "@laic/coach/domains/bridge";

/** DDS numbering. Suits are ordered high-to-low; notrump is trump 4. */
const TRUMP_NO: Record<string, number> = { S: 0, H: 1, D: 2, C: 3, NT: 4 };
const SUIT_NO: Record<string, number> = { S: 0, H: 1, D: 2, C: 3 };
const SUITS = ["S", "H", "D", "C"] as const;
const SEAT_NO: Record<string, number> = { N: 0, E: 1, S: 2, W: 3 };
const SEATS = ["N", "E", "S", "W"] as const;
/** Index 0 is the deuce, matching DDS's `rank` field where 2 = the deuce. */
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"] as const;

/**
 * One shared module per process.
 *
 * Instantiating the WASM costs ~9ms, so it happens once and every later call is
 * free. The promise itself is cached rather than the module, so two concurrent
 * first-callers share one instantiation instead of racing.
 */
let modulePromise: Promise<DdsModule> | null = null;
const ddsModule = (): Promise<DdsModule> => (modulePromise ??= loadDds());

/**
 * "S:AK4 H:Q2 D:- C:9" — the host's own hand notation — to a flat card list.
 *
 * A VOID IS WRITTEN "D:-" and the dash is not a rank. Iterating the characters
 * turned it into a phantom card `D-`, which inflated that hand by one for every
 * void it held. The four-equal-lengths check downstream then found 13 against 12,
 * concluded the deal could not be reconciled, and abstained — so the coach went
 * quiet on ANY position where any of the four seats was void in any suit. That is
 * most positions from trick two onward, and it presented as "the hand is too deep
 * to work out exactly", a sentence describing a depth limit that no longer exists.
 *
 * It survived the benchmarks because those built card lists directly and never went
 * through this notation. The engine was right the whole time; nothing was asking it.
 *
 * So only real ranks are accepted. Anything else is dropped rather than guessed at,
 * and a hand genuinely corrupt in some other way still fails the length check.
 */
function cardsOf(hand: string | undefined): string[] {
  if (!hand) return [];
  const out: string[] = [];
  for (const group of hand.trim().split(/\s+/)) {
    const [suit, ranks] = group.split(":");
    if (!suit || !ranks) continue;
    for (const r of ranks) {
      if (RANKS.includes(r as (typeof RANKS)[number])) out.push(`${suit}${r}`);
    }
  }
  return out;
}

/**
 * PBN deal string: `"<first>:<hand> <hand> <hand> <hand>"`, clockwise from
 * `first`, each hand as spades.hearts.diamonds.clubs.
 *
 * DDS reads the hands in seat order starting at `first`, so the rotation matters
 * — get it wrong and every answer is confidently about somebody else's cards.
 */
function pbn(hands: Record<string, string[]>, first: string): string {
  const order = SEATS.slice(SEATS.indexOf(first as (typeof SEATS)[number]))
    .concat(SEATS.slice(0, SEATS.indexOf(first as (typeof SEATS)[number])));
  const one = (cards: string[]) =>
    SUITS.map((s) =>
      cards
        .filter((c) => c[0] === s)
        // High to low, as PBN requires.
        .sort((a, b) => RANKS.indexOf(b[1] as never) - RANKS.indexOf(a[1] as never))
        .map((c) => c[1])
        .join(""),
    ).join(".");
  return `${first}:${order.map((seat) => one(hands[seat] ?? [])).join(" ")}`;
}

/** One entry per legal card, with the tricks the playing side takes. */
export interface CardScore {
  card: string;
  tricks: number;
}

/**
 * Every legal card scored for the seat on play.
 *
 * DDS returns only the best card of each equivalence class plus an `equals`
 * bitmask of the lower cards that play identically. We expand that ourselves —
 * which is deliberate: the friendlier wrapper on npm does its own expansion and
 * crashes on partial deals because it walks below the lowest card held, and
 * partial deals are the whole use case here.
 */
export async function scoreEveryCard(state: LiveCardPlayState): Promise<CardScore[] | undefined> {
  const hands: Record<string, string[]> = {};
  for (const seat of SEATS) hands[seat] = cardsOf(state.hands[seat]);

  // Is this a position DDS can read at all? `remainCards` must exclude cards
  // already on the table, so PART-WAY THROUGH A TRICK THE HANDS ARE UNEVEN — the
  // seats that have played hold one card fewer, and that is correct, not corrupt.
  //
  // Adding the played card back before comparing is the whole point. The first
  // version of this check simply required four equal lengths, which is true only
  // at a fresh lead: it would have abstained on every position where somebody had
  // already played, meaning three out of every four decisions in the game, and it
  // would have done so silently — an oracle returning `undefined` reads as "cannot
  // judge", so the coach would just have gone quiet and nothing would have failed.
  const alreadyPlayed = new Set(state.trickSoFar.map((p) => p.seat));
  const dealt = SEATS.map((s) => hands[s]!.length + (alreadyPlayed.has(s) ? 1 : 0));
  if (dealt.some((n) => n === 0) || new Set(dealt).size > 1) return undefined;

  // WHOSE TURN DOES DDS THINK IT IS? Not something it is told — it derives the seat
  // from the trick leader plus the number of cards already down. If the caller's
  // `playFromSeat` disagrees, DDS answers correctly about a DIFFERENT HAND, and an
  // answer about the wrong hand is the worst thing this file could return.
  //
  // It surfaced from a fixture claiming "West led and South is second to play" —
  // second after West is North. DDS duly scored North's spades. The legality filter
  // below then dropped every one of them and produced an empty list, which reads as
  // "no legal cards" rather than "your position does not add up". Better to say so.
  const leader = state.trickSoFar[0]?.seat ?? state.playFromSeat;
  const expected = SEATS[(SEATS.indexOf(leader) + state.trickSoFar.length) % 4];
  if (expected !== state.playFromSeat) return undefined;

  const dds = new Dds(await ddsModule());
  // The trick so far, in play order, as parallel suit/rank arrays.
  const played = state.trickSoFar.slice(0, 3);
  const board = {
    trump: TRUMP_NO[state.trump] ?? 4,
    first: SEAT_NO[state.trickSoFar[0]?.seat ?? state.playFromSeat] ?? 0,
    currentTrickSuit: [0, 1, 2].map((i) => SUIT_NO[played[i]?.card?.[0] ?? "S"] ?? 0),
    currentTrickRank: [0, 1, 2].map((i) =>
      played[i] ? RANKS.indexOf(played[i]!.card[1] as never) + 2 : 0,
    ),
    remainCards: pbn(hands, state.playFromSeat),
  };

  // target -1, solutions 3, MODE 1.
  //
  // The mode is the one that bites. Mode 0 means "do not bother searching when
  // there is only one distinct card to play" — DDS returns a score of -2, having
  // examined zero nodes, and -2 is a plausible-looking number that flows straight
  // through arithmetic into a cost of "3 tricks worse". And "one distinct card" is
  // not rare: DDS collapses equivalent cards first, so a holding of A-K-Q with
  // nothing in between is ONE choice. Every clean run of winners hits it.
  //
  // Mode 1 always searches. Mode 2 also searches but reuses the transposition
  // table from the previous call, which is only sound on the same deal — and a
  // memo carried between positions is exactly the bug that made the last solver
  // wrong, so it is not used here however tempting the speed is.
  const res = dds.SolveBoardPBN(board, -1, 3, 1);
  const out: CardScore[] = [];
  for (let i = 0; i < res.cards; i++) {
    const suit = SUITS[res.suit[i]!];
    const tricks = res.score[i]!;
    out.push({ card: `${suit}${RANKS[res.rank[i]! - 2]}`, tricks });
    // bit r = the card of rank r (2 = deuce … 14 = ace)
    for (let r = 2; r <= 14; r++) {
      if (res.equals[i]! & (1 << r)) out.push({ card: `${suit}${RANKS[r - 2]}`, tricks });
    }
  }
  // A NEGATIVE COUNT IS NOT AN ANSWER. DDS uses them as signals — -1 for "target
  // not reached", -2 for "not searched" — and they are numbers, so they subtract
  // and compare and sort like real ones. The mode-0 bug above surfaced as
  // `playedTricks: -2, bestTricks: -1, tricksLost: 1`: a coherent-looking verdict
  // charging a learner a trick on a position nobody had solved. Abstaining here is
  // the difference between the coach going quiet and the coach being wrong.
  if (out.some((s) => s.tricks < 0)) return undefined;

  // Only cards the seat may actually play. DDS is asked about the position, not
  // about our idea of legality, so this is the place the two are reconciled.
  const legal = new Set(state.legalCards);
  return out.filter((s) => legal.has(s.card));
}

export class DdsOracle implements DoubleDummyOracle {
  async evaluate(
    state: LiveCardPlayState,
    playedCard: string,
  ): Promise<OracleVerdict | undefined> {
    let scores: CardScore[] | undefined;
    try {
      scores = await scoreEveryCard(state);
    } catch (err) {
      // A solver that cannot read a position is an authority that abstained. It
      // must never take the coach down with it.
      console.error("[coach] dds failed", err);
      return undefined;
    }
    if (!scores?.length) return undefined;

    const bestTricks = scores.reduce((m, s) => Math.max(m, s.tricks), -1);
    const played = scores.find((s) => s.card === playedCard);
    // Asked about a card that is not legal here: no verdict rather than a guess.
    if (!played) return undefined;

    return {
      playedTricks: played.tricks,
      bestTricks,
      bestCards: scores.filter((s) => s.tricks === bestTricks).map((s) => s.card),
      tricksLost: bestTricks - played.tricks,
      scores,
    };
  }
}

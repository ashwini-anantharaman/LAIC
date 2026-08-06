// "What should I play?" — the coach's one proactive answer.
//
// Runs THE SAME PANEL as judging, with `asking: true`. That matters more than it
// looks: the hint used to call its own fallback chain, so judging and advising
// consulted different authorities in different orders. The invariant test for
// "same authorities either way" passed while production violated it, because the
// test exercised the panel and the route did not.
//
// WHO LEADS: THE SOLVER. Owner's decision, and the reason is that the button now
// promises a correct answer rather than a defensible one.
//
// The cost of that is real and worth stating, because it is not visible in the
// output. A double-dummy search sees all four hands, so its advice is sometimes
// right only because it peeked: on roughly half of all finesse positions it will
// pick the play that happens to work against the actual lie, when the percentage
// play — the one reproducible at a table where you cannot see the king — is the
// other one. No card leaks. The habit taught can still be wrong. The label
// "worked out from the full deal" is what keeps that honest, and it is why the
// guideline is kept and shown alongside rather than discarded.
//
// So the order is: the calculation, then your rulebook, then a general guideline.
// The two that remain earn their place by agreeing or dissenting — "the cards say
// one thing and your system says another" is the most instructive position in the
// game, and it reads the same either way round.

import type { GameState, KbPlayerConfig } from "@bridge/engine";
import type { Seat } from "@bridge/events";
import type { CompiledKb } from "@bridge/kb";
import type { Authority } from "@laic/coach/core";

import { assessMove, BUDGET, type MoveUnderReview } from "./assessors/panel";
import type { BridgeFinding } from "./assessors/context";
import type { TeachingStore } from "./kbTeaching";
import { kbTeaching } from "./kbTeaching";

export interface PlayAdvice {
  /** Cards to prefer — several when the authority rates them equally. */
  best: string[];
  /**
   * Who is advising. Drives the wording, because the three make different
   * claims: an agreement, a maxim, and a calculation are not interchangeable.
   */
  source: Authority;
  /** The advising authority's own words. */
  because?: string;
  /** A second authority checked this and agrees. */
  corroborated?: boolean;
  /**
   * A second authority prefers something else. Deliberately NOT the card it
   * prefers: two answers to "what should I play?" is not an answer, and the
   * disagreement itself is the teachable part.
   */
  contradicted?: boolean;
  /**
   * Which of several tied cards to actually play, where convention can choose.
   *
   * THE SOLVER CANNOT PROVIDE THIS and must not be asked to. A tie in `best` means
   * the trick count is identical, so the solver has nothing left to say — but "8♣,
   * 10♣ or J♣, take your pick" teaches nothing, and a learner who spends the J♣ has
   * thrown a higher card for no reason. Bridge answers this: play the cheapest card
   * that does the job.
   *
   * Absent when convention cannot choose either — see `preferOf`.
   */
  prefer?: string;
  /**
   * Every legal card with the tricks it takes, when the solver ran.
   *
   * This is the discriminating information an explanation needs and the reason
   * the LLM has anything to say: it distinguishes "these three are equally good"
   * from "everything else throws a trick". It names no hidden card — a trick
   * count is a consequence, not a holding — so it can cross the boundary into a
   * prompt that the hands themselves may not.
   */
  scores?: { card: string; tricks: number }[];
  /** Nothing could advise here — the reason is the caller's to render. */
  silentBecause?: string;
}

/**
 * Advising precedence. `solution` LEADS — see the header for what that costs.
 *
 * This is the third and last ranking of the same three authorities, and they
 * disagree on purpose: `STRENGTH` in `reconcile.ts` ranks who is RIGHT (solution
 * first), `TEACHES` ranks who may EXPLAIN (solution zero — its reasoning is drawn
 * from cards the learner cannot see), and this ranks who ANSWERS. The solver is
 * first, forbidden, and first again depending on the question asked of it.
 */
const ADVISES: Record<Authority, number> = {
  solution: 3, // the calculation: exact, labelled as such
  system: 2, // your agreements: reproducible, citable
  convention: 1, // a general maxim: hedged, still reproducible
};

/** Low to high. Codes carry the ten as "T", so a rank is always one character. */
const RANK_ORDER = "23456789TJQKA";

/**
 * The cheapest of several equally good cards — or nothing, when "cheapest" is not
 * a meaningful idea here.
 *
 * TWO CASES ARE DELIBERATELY LEFT ALONE, because a tie is where the solver's
 * advantage stops applying and a wrong convention would be worse than none:
 *
 *   · ON LEAD. From a touching honour sequence you lead the TOP, not the bottom —
 *     leading the J from K-Q-J costs nothing double-dummy and misinforms partner.
 *     Detecting sequences reliably is a bigger job than this, so leads keep showing
 *     the tie rather than being given a rule that is wrong half the time.
 *   · A TIE ACROSS SUITS, which is a discard. Which suit to abandon is real
 *     judgement — length, guards, entries — and "lowest" is not even defined
 *     across suits. The solver rates them equal because it can see the layout; a
 *     player choosing between a spade and a club is not making the same decision.
 *
 * What is left is following suit or discarding within one suit, which is the
 * common case and the one where the answer is simply "the cheapest".
 */
export function preferOf(cards: string[], onLead: boolean): string | undefined {
  if (cards.length < 2 || onLead) return undefined;
  const suit = cards[0]![0];
  if (!cards.every((c) => c[0] === suit)) return undefined;
  return [...cards].sort(
    (a, b) => RANK_ORDER.indexOf(a[1]!) - RANK_ORDER.indexOf(b[1]!),
  )[0];
}

export async function advisePlay({
  state,
  learnerSeat,
  actor,
  system,
  kb,
  authorities,
}: {
  state: GameState;
  learnerSeat: Seat;
  /** Whose card is being chosen — dummy's, when the learner is declaring. */
  actor: Seat;
  system: { compiled: CompiledKb; player: KbPlayerConfig };
  kb?: TeachingStore;
  /**
   * Override which authorities may answer. Omitted — which is what the button
   * does — means `LIVE_AUTHORITIES`, and so no knowledge base. Present so a
   * comparison surface can ask the same position both ways without a second
   * code path.
   */
  authorities?: readonly Authority[];
}): Promise<PlayAdvice> {
  const move: MoveUnderReview = {
    // A hypothetical: the assessors read the position, not this placeholder.
    action: { kind: "card", seat: actor, auctionSoFar: [], hand: "", fallback: false },
    before: state,
    actor,
    learnerSeat,
    asking: true,
  };

  const teaching = kb ? kbTeaching({ compiled: system.compiled, store: kb }) : undefined;
  const assessment = await assessMove(
    move,
    { system, ...(teaching ? { teaching } : {}), ...(authorities ? { authorities } : {}) },
    BUDGET.asked,
  );

  const advisers = assessment.findings
    .filter((f) => f.recommends?.length)
    .sort((a, b) => ADVISES[b.authority] - ADVISES[a.authority]);

  const adviser = advisers[0];
  if (!adviser?.recommends?.length) {
    return {
      best: [],
      // Meaningless with no cards to attribute: callers key the silent case on
      // `best.length`, and read `source` only when there is advice to label.
      source: "system",
      silentBecause:
        assessment.silentBecause ?? "no agreement, guideline or calculation covers this position",
    };
  }

  // The runner-up, whoever it is. This used to look specifically for `solution`,
  // which worked only while the solver could not be the adviser. Now that it
  // leads, the corroboration has to come from the other direction — so take the
  // best-ranked finding from a DIFFERENT authority and let it agree or dissent.
  const second = advisers.find((f) => f.authority !== adviser.authority);
  const secondCards = second?.recommends ?? [];
  const overlap = secondCards.some((c) => adviser.recommends!.includes(c));

  // The table travels with the advice, from the solver's finding, whether or not
  // the solver is the one advising: an explanation of a guideline's card is better
  // for knowing what that card actually costs.
  const solved = assessment.findings.find(
    (f): f is BridgeFinding => f.authority === "solution",
  );
  const scores = solved?.bridge?.scores;

  // On lead when no trick is open, or the last one is complete — the same test
  // `legalPlays` makes, so the two cannot drift apart.
  const trick = state.tricks[state.tricks.length - 1];
  const onLead = !trick || trick.plays.length === 0 || trick.plays.length === 4;
  const best = [...new Set(adviser.recommends)];
  const prefer = preferOf(best, onLead);

  return {
    best,
    ...(prefer ? { prefer } : {}),
    source: adviser.authority,
    ...(adviser.because ? { because: adviser.because } : {}),
    ...(secondCards.length ? (overlap ? { corroborated: true } : { contradicted: true }) : {}),
    ...(scores?.length ? { scores } : {}),
  };
}

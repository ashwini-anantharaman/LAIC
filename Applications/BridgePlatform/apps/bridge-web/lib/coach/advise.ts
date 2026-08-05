// "What should I play?" — the coach's one proactive answer.
//
// Runs THE SAME PANEL as judging, with `asking: true`. That matters more than it
// looks: the hint used to call its own fallback chain, so judging and advising
// consulted different authorities in different orders. The invariant test for
// "same authorities either way" passed while production violated it, because the
// test exercised the panel and the route did not.
//
// WHO LEADS, AND WHY IT IS NOT THE SOLVER.
//
// The double-dummy search sees all four hands. Restricting what it SAYS stops
// information leaking, and does nothing about advice that is only right because
// it peeked: on roughly half of all finesse positions it will talk a learner out
// of the correct percentage play, because it can see the king sitting badly. No
// card is leaked; the habit taught is still wrong.
//
// So the order is your rulebook, then a general guideline, then — labelled as
// such — the calculation. Your rulebook only knows what you know, which makes its
// advice reproducible at the table. That is the difference between coaching and
// answering.
//
// The solver still earns its place: when it AGREES it corroborates, and when it
// DISAGREES that is worth showing, because "your system says one thing and the
// cards say another" is the most instructive position in the game.

import type { GameState, KbPlayerConfig } from "@bridge/engine";
import type { Seat } from "@bridge/events";
import type { CompiledKb } from "@bridge/kb";
import type { Authority } from "@laic/coach/core";

import { assessMove, BUDGET, type MoveUnderReview } from "./assessors/panel";
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
  /** The calculation checked this and agrees. */
  corroborated?: boolean;
  /**
   * The calculation prefers something else. Deliberately NOT the card it
   * prefers: naming it would make the solver the adviser through the back door,
   * and its choice is the one the learner could not have reasoned to.
   */
  contradicted?: boolean;
  /** Nothing could advise here — the reason is the caller's to render. */
  silentBecause?: string;
}

/** Advising precedence. Note that `solution` is last, not first. */
const ADVISES: Record<Authority, number> = {
  system: 3, // your agreements: reproducible, citable
  convention: 2, // a general maxim: hedged, still reproducible
  solution: 1, // a calculation from cards you cannot see: labelled, last resort
};

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

  // What the calculation thinks, if it ran. Used only to agree or to dissent.
  const solved = assessment.findings.find((f) => f.authority === "solution");
  const solvedCards = solved?.recommends ?? [];
  const overlap = solvedCards.some((c) => adviser.recommends!.includes(c));

  return {
    best: [...new Set(adviser.recommends)],
    source: adviser.authority,
    ...(adviser.because ? { because: adviser.because } : {}),
    ...(solvedCards.length && adviser.authority !== "solution"
      ? overlap
        ? { corroborated: true }
        : { contradicted: true }
      : {}),
  };
}

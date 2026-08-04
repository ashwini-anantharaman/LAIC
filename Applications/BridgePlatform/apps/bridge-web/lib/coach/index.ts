// The coach, at this table.
//
// This is the composition root for bridge-web's copy of `@laic/coach`: it opens
// a session, subscribes it to the table's events, judges the learner's own
// calls against the knowledge base, and returns what the coach has to say.
//
// WHERE IT RUNS (today): during the page render, over the board's persisted
// event stream. That is deliberate for a first cut — it is deterministic, so
// recomputing gives the same answer every time; it touches no write path, so a
// coach that throws cannot cost a learner their bid; and it needs no schema
// change. It is also the reason there is no persistence yet: the moment note
// text stops being deterministic (an LLM phrasing pass), notes have to be
// stored at commit time instead, keyed to the action's `seq`.
//
// WHAT IT COACHES: the learner's own calls, and their own cards (plus dummy's
// when they are declaring, since declarer chooses both).
//   · Robots' calls are not the coach's material — the strip is the coach's
//     surface and only the coach's (owner decision 2026-08-01), and the card
//     beside the bidding grid already explains any call you tap.
//   · Card play IS coached, but by a different authority: a double-dummy
//     search from the coaching component, not the bidding rulebook. The solver
//     only reaches end-game positions, so earlier tricks fall back to named
//     principles and, failing those, to silence.

import { callLabel, contractLabel, partnerOf, SEAT_LABEL } from "@bridge/events";
import type { Card, Contract, GameEvent, Seat, Vul } from "@bridge/events";
import type { CompiledKb } from "@bridge/kb";
import type { SeatConfig } from "@bridge/sessions";
import type { NexusBridgeContext } from "@laic/learner-contracts";
import {
  openCoachSession,
  type Assessment,
  type CoachNote,
  type CoachingPolicyProfile,
  type EvaluationResult,
  type InterventionDecision,
} from "@laic/coach/core";

import type { CoachNote as StripNote } from "@/components/table/play/CoachStrip";
import { BRIDGE_DOMAIN_ID, CONTRACT_VERSION, coachIdentity, type NoteContext } from "./context";
import { assessMove, BUDGET, type MoveUnderReview } from "./assessors/panel";
import { kbTeaching, type TeachingStore } from "./kbTeaching";
import { assessmentAffirmation, assessmentNote } from "./notes";
import { toStripNote } from "./render";
import { tableEventSource, tableTurns, type TableTurn } from "./tableEvents";
import { partnershipSystem } from "./verdicts";

export type { BridgeTableAction, TableActivityEvent } from "./tableEvents";
export { coachIdentity } from "./context";

/**
 * The behaviour profile for coaching at the table.
 *
 * Coaching "modes" — beginner, intermediate, advanced, socratic — are presets
 * over these fields, never a parallel enum: two vocabularies for the same thing
 * will disagree. The named presets belong in the component so every host gets
 * the same four; this single default lives here until they land, and until
 * there is a UI to pick between them.
 *
 * `interruptionTolerance: "medium"` and `maxLevel: 3` mean: speak up on a real
 * mismatch, and name the call the system would have made rather than only
 * hinting at it — a learner alone at a table with nobody to ask.
 */
const TABLE_COACH_PROFILE: CoachingPolicyProfile = {
  schemaVersion: "1.0.0",
  profileId: "cpp.bridge_table_default",
  displayName: "Bridge table coach",
  questioningStyle: "mixed",
  hintLadder: { maxLevel: 3, questionFirst: true },
  interventionPolicy: {
    maxHintLevel: 3,
    allowDirectAnswer: false,
    feedbackStyle: "gentle",
    interruptionTolerance: "medium",
    postmortemVsRealtime: "prefer_realtime",
  },
  enabledTools: [],
};

export interface CoachBoardInput {
  context: NexusBridgeContext;
  record: {
    sessionId: string;
    board: { name: string; dealer: Seat };
    events: readonly GameEvent[];
    /** Who is in each seat — the learner's system is read off their partner's. */
    seats: Record<Seat, SeatConfig>;
  };
  vul: Vul;
  /** Hands AS DEALT — during play `state.hands` has been emptied by the tricks. */
  dealtHands: Record<Seat, Card[]>;
  /** The seat this person is playing. `null` (watching) means no coaching. */
  learnerSeat: Seat | null;
  compiled: CompiledKb;
  /**
   * The knowledge base, for the human half of a rule: the item's authored
   * explanation and its source citations. Omit it and notes fall back to the
   * rule's label — degraded, never broken.
   */
  kb?: TeachingStore;
  /** The settled contract, once the auction is over. Drives the dummy note. */
  contract?: Contract | null;
  /** `?coach=trace` — show the per-call verdict reasoning in the listening note. */
  trace?: boolean;
  /**
   * The action the learner asked to have explained ("show me"), by anchorId.
   *
   * Without this a withheld hint is a DEAD END: unprompted, the engine sets the
   * level from severity alone and never rises above it, so "worth a second
   * look" could never become an answer however much the learner wanted one.
   * Escalation goes through the engine's own `hintRequested` path rather than a
   * forced level, so the policy still governs the ceiling — a socratic profile
   * with a low `maxHintLevel` keeps withholding, which is the point of it.
   */
  revealFor?: string;
  /** Builds the URL that asks for `anchorId` to be explained. Host-owned routing. */
  revealHref?: (anchorId: string) => string;
}

/**
 * Run the coach over a board and return its notes, oldest first.
 *
 * Never throws: a coach that fails is a coach that says nothing, and the table
 * around it must be unaffected. The failure is logged server-side, because a
 * silently broken coach looks exactly like a well-behaved one.
 */
export async function coachNotesForBoard(input: CoachBoardInput): Promise<StripNote[]> {
  if (!input.learnerSeat) return [];
  try {
    return await runCoach(input, input.learnerSeat);
  } catch (err) {
    console.error("[coach] board coaching failed", {
      sessionId: input.record.sessionId,
      err,
    });
    // A coach that fell over should SAY so rather than look like a coach with
    // nothing to say. Those two states are indistinguishable in an empty panel,
    // and that is how a broken pipe survives a demo.
    return [
      {
        id: "coach-error",
        source: "system",
        headline: "The coach couldn't read this board.",
        detail: err instanceof Error ? err.message : String(err),
      } satisfies StripNote,
    ];
  }
}

async function runCoach(input: CoachBoardInput, learnerSeat: Seat): Promise<StripNote[]> {
  const identity = coachIdentity(input.context);
  const { learnerId } = identity;

  const session = openCoachSession({
    learnerId,
    domainId: BRIDGE_DOMAIN_ID,
    policyProfile: TABLE_COACH_PROFILE,
    // Layers BELOW the profile — program default, class, learner preference,
    // session override — slot in here as each gets a UI. The resolver already
    // supports the whole stack, so adding one later touches this line only.
    policyLayers: [],
  });

  const turns = tableTurns({
    record: input.record,
    vul: input.vul,
    dealtHands: input.dealtHands,
    platform: identity.platform,
  });

  // The coach reads the table through the component's EventSource port. It sees
  // every action, robot and human alike; what it JUDGES is filtered here — your
  // own calls, and any card that was your decision (declarer chooses dummy's too).
  const mine: TableTurn[] = [];
  const byId = new Map(turns.map((t) => [t.event.eventId, t]));
  const detach = tableEventSource(turns).subscribe((event) => {
    const turn = byId.get(event.eventId);
    if (turn && isYourDecision(turn, learnerSeat, input.contract)) mine.push(turn);
  });
  detach();

  // The knowledge base's human half: the explanation a fellow authored for an
  // agreement, and the sources it was authored from.
  const teaching = input.kb
    ? kbTeaching({ compiled: input.compiled, store: input.kb })
    : undefined;
  const assessCtx = {
    system: {
      compiled: input.compiled,
      player: partnershipSystem(input.record.seats, learnerSeat),
    },
    ...(teaching ? { teaching } : {}),
  };
  const noteCtx: NoteContext = {
    learnerId,
    // The resolved policy is what a note has to be read against, and the profile
    // is the closest thing it has to a version today.
    policyVersion: TABLE_COACH_PROFILE.schemaVersion,
    profileId: TABLE_COACH_PROFILE.profileId,
  };

  const notes: CoachNote[] = [];
  /** Why each of your moves did or did not produce a note. */
  const outcomes: string[] = [];
  let judged = 0;
  let cardsJudged = 0;
  let yourCards = 0;

  // ONE loop over every move of yours, calls and cards alike. Two separate paths
  // with different authorities in different orders was an artifact of their being
  // written a week apart, and it let a card be judged by a general guideline while
  // the hint button quoted the learner's own rulebook for the same position.
  for (const turn of mine) {
    const move: MoveUnderReview = {
      action: turn.event.action,
      before: turn.stateBefore,
      actor: turn.event.action.seat,
      learnerSeat,
    };
    if (move.action.kind === "card") yourCards++;

    const assessment = await assessMove(move, assessCtx, BUDGET.review);
    const what = moveLabel(turn);

    // Nobody could speak — and the reason is recorded rather than left blank.
    if (!assessment.findings.length) {
      outcomes.push(`${what}: ${assessment.silentBecause}`);
      continue;
    }
    judged++;
    if (move.action.kind === "card") cardsJudged++;

    const decision = escalate(session, toEvaluation(assessment), turn.event.eventId, input.revealFor);
    // The trace names every authority that spoke, what they concluded, and what
    // the panel would have played — the three things you want when checking
    // whether the evaluation layer is behaving, and the reason it is behind ?coach=trace.
    const would = assessment.findings.find((f) => f.recommends?.length)?.recommends?.[0];
    outcomes.push(
      `${what}: ${assessment.correctness}/${assessment.severity}` +
        ` by ${assessment.findings.map((f) => `${f.authority}=${f.correctness}`).join(", ")}` +
        (would ? ` → would ${would}` : "") +
        ` → ${decision.responseType}` +
        (assessment.disagreement ? " [endorsed but costly]" : ""),
    );

    if (decision.shouldRespond || assessment.disagreement) {
      notes.push(assessmentNote(turn.event, assessment, decision, noteCtx));
    } else if (assessment.correctness === "correct" || assessment.correctness === "acceptable") {
      notes.push(assessmentAffirmation(turn.event, assessment, noteCtx));
    }
  }

  // FIRST, so a real coaching note still takes the collapsed strip's one
  // visible line. This one is only what you see when there is nothing to
  // coach yet — which is most of the time, and is exactly when an empty panel
  // is indistinguishable from a broken one.
  //
  // The dummy note goes LAST, i.e. it becomes the visible line: when you are
  // dummy, "why can't I play?" is the most pressing thing on the board, and it
  // outranks a comment on a call you made three turns ago.
  const dummy = dummyNote(input.contract, learnerSeat, noteCtx);
  return [
    listeningNote(turns, mine, outcomes, learnerSeat, input.trace, noteCtx, {
      judged: cardsJudged,
      yours: yourCards,
    }),
    ...notes,
    ...(dummy ? [dummy] : []),
  ].map((note) => toStripNote(note, { revealHref: input.revealHref }));
}

/** Just the slice of the coach session this file drives. */
type CoachDecider = {
  decide: (
    e: EvaluationResult,
    opts?: { hintRequested?: boolean; currentHintLevel?: number },
  ) => InterventionDecision;
};

/**
 * Decide, then escalate if this is the action the learner asked about.
 *
 * The escalation is the engine's own: `hintRequested` bumps one rung above the
 * level severity produced and clamps to the policy's ceiling. So "show me"
 * cannot break the policy — it climbs the ladder the profile allows, and a
 * profile that forbids the top rung still forbids it.
 */
function escalate(
  session: CoachDecider,
  evaluation: EvaluationResult,
  anchorId: string,
  revealFor: string | undefined,
): InterventionDecision {
  const decision = session.decide(evaluation);
  if (revealFor !== anchorId) return decision;
  return session.decide(evaluation, {
    hintRequested: true,
    currentHintLevel: decision.hintLevel,
  });
}

/**
 * Was this move the learner's decision to make?
 *
 * Not merely "was it their seat". Three rules, and getting them wrong is how a
 * panel ends up coaching the opponents:
 *
 *   · a CALL is theirs when they made it;
 *   · a CARD is theirs when they played it, OR when they are declarer and it came
 *     from dummy — declarer chooses both hands;
 *   · nothing is theirs while they are DUMMY. Dummy's cards are played by
 *     declarer, so there is no decision of the learner's to judge, and marking
 *     one wrong blames them for someone else's choice.
 */
function isYourDecision(
  turn: TableTurn,
  learnerSeat: Seat,
  contract: Contract | null | undefined,
): boolean {
  const { kind, seat } = turn.event.action;
  if (kind === "call") return seat === learnerSeat;
  if (!contract) return false;
  const dummy = partnerOf(contract.declarer);
  if (learnerSeat === dummy) return false;
  return seat === learnerSeat || (learnerSeat === contract.declarer && seat === dummy);
}

/** `moveLabel` — what the trace calls this move. */
function moveLabel(turn: TableTurn): string {
  const a = turn.event.action;
  return a.kind === "call" ? callLabel(a.call ?? "") : (a.card ?? "?");
}

/**
 * The panel's assessment, in the shape the intervention policy consumes.
 *
 * The policy engine is domain-free and older than the panel; it takes a single
 * EvaluationResult. Rather than widen it, the reconciled verdict is projected
 * down — the panel's extra structure (who said what, what may be quoted) is the
 * NOTE's material, not the policy's. The policy only ever needed to know how bad
 * it was and how sure we are.
 */
function toEvaluation(a: Assessment): EvaluationResult {
  const recommends = a.findings.find((f) => f.recommends?.length)?.recommends;
  return {
    correctness: a.correctness,
    severity: a.severity,
    confidence: a.confidence,
    conceptIds: [...new Set(a.findings.flatMap((f) => f.conceptIds ?? []))],
    skillIds: [...new Set(a.findings.flatMap((f) => f.skillIds ?? []))],
    ...(recommends?.length ? { bestAction: recommends[0], alternativeActions: recommends } : {}),
    explanation: a.findings.map((f) => `${f.authority}:${f.correctness}`).join(" "),
  };
}

/** Notes not tied to one action still need the contract's required fields. */
function boardNote(id: string, ctx: NoteContext): Pick<
  CoachNote,
  "schemaVersion" | "noteId" | "learnerId" | "anchorId" | "policyVersion" | "profileId" | "createdAt"
> {
  return {
    schemaVersion: CONTRACT_VERSION,
    noteId: id,
    learnerId: ctx.learnerId,
    // The board itself, not a single action — these notes describe the whole
    // position rather than one call.
    anchorId: "board",
    policyVersion: ctx.policyVersion,
    profileId: ctx.profileId,
    // Fixed, not `now`: these are recomputed on every render and a moving
    // timestamp would make two identical renders differ.
    createdAt: "1970-01-01T00:00:00.000Z",
  };
}

/**
 * "You're dummy" — the answer to a question the table only whispers.
 *
 * A learner whose partner won the auction has nothing to do for the whole
 * board: declarer plays their cards. That is correct bridge and it looks
 * exactly like the app refusing to let you play. The seat plate says "dummy"
 * in small grey text at its right edge, which is not enough.
 */
function dummyNote(
  contract: Contract | null | undefined,
  learnerSeat: Seat,
  ctx: NoteContext,
): CoachNote | null {
  if (!contract || partnerOf(contract.declarer) !== learnerSeat) return null;
  const declarer = SEAT_LABEL[contract.declarer];
  return {
    ...boardNote("coach-dummy", ctx),
    kind: "explanation",
    headline: `You're dummy — ${declarer} plays this hand, including your cards.`,
    detail:
      `Your partner won the auction at ${contractLabel(contract)}, so your hand goes face up and ` +
      `declarer plays from both. There's nothing for you to do until the next board — which makes ` +
      `it the best seat for watching how a contract gets made.`,
  };
}

/**
 * What the coach heard — the panel's proof of life.
 *
 * A coach is silent far more often than it speaks: it says nothing about the
 * robots, nothing about card play, and nothing where the rulebook has no
 * agreement. All three are correct, and all three look identical to a coach
 * that was never wired up. So it reports its own listening.
 */
function listeningNote(
  turns: readonly TableTurn[],
  heard: readonly TableTurn[],
  outcomes: readonly string[],
  learnerSeat: Seat,
  trace: boolean | undefined,
  ctx: NoteContext,
  play: { judged: number; yours: number },
): CoachNote {
  const auction = turns
    .filter((t) => t.event.action.kind === "call")
    .map((t) => `${t.event.action.seat} ${callLabel(t.event.action.call ?? "")}`);
  const cards = turns.filter((t) => t.event.action.kind === "card");
  const yourCards = cards.filter((t) => t.event.action.seat === learnerSeat).length;
  const yours = heard.length;

  const detail = [
    auction.length ? `Heard: ${auction.join(", ")}.` : "No calls at the table yet.",
    yours
      ? `${yours} of them ${yours === 1 ? "was" : "were"} yours.`
      : `None of them were yours (you're ${learnerSeat}).`,
    // Say plainly what is being heard and NOT judged. Reporting only the calls
    // would read as "nothing has happened" to someone midway through the play,
    // which is the same failure as an empty panel: silence that looks like
    // attention.
    // COVERAGE, not just a count. "13 cards played" invites the assumption that
    // all thirteen were looked at; most were not, because the double-dummy
    // search only reaches the last few tricks and the named principles fire
    // rarely. Saying how many were actually judged is the difference between a
    // coach that approved of your play and one that never saw it.
    cards.length
      ? `${cards.length} cards played, ${yourCards} by you — ${play.judged} of them judged. A card can only be judged where the double-dummy search reaches (the last few tricks) or a named principle applies.`
      : "",
    // The per-call reasoning is noise for a learner and the whole point for
    // whoever is checking the wiring, so it is behind ?coach=trace.
    ...(trace && outcomes.length ? ["", ...outcomes] : []),
  ]
    .filter(Boolean)
    .join(" ");

  const heardSoFar = cards.length
    ? `${plural(auction.length, "call")}, ${plural(cards.length, "card")}`
    : plural(auction.length, "call");
  return {
    ...boardNote("coach-listening", ctx),
    kind: "status",
    headline: yours
      ? `Heard ${heardSoFar}.`
      : `Watching — ${plural(auction.length, "call")} so far, none of them yours yet.`,
    detail,
  };
}

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

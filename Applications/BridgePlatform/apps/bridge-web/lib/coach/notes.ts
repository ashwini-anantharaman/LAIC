// Turning an assessment into something a learner reads.
//
// The panel says what is true and who said it; the policy says whether to speak
// and how much to give away. This file is the last step, and it is deterministic
// — template phrasing over the findings, no model, nothing that can hang or cost
// money in the path of a page render. When generated phrasing arrives it replaces
// the bodies of these functions and nothing else, because everything upstream has
// already decided WHAT to say.
//
// TWO RULES THIS FILE MUST KEEP, both of which were bugs first:
//
//   1. A HINT MUST NOT CONTAIN THE ANSWER. Harder than it looks, because a rule's
//      own title usually IS the answer — "1♥ with four-plus hearts (up the line)"
//      names the call. So the citation is withheld below the reveal rung too, not
//      just the sentence. A ladder whose bottom rung prints the answer in a chip
//      underneath is not a ladder.
//
//   2. ONLY A MEASUREMENT MAY SAY "COST". A rulebook and a guideline can say a
//      play is not what your system does; neither counted a trick. `cost` is read
//      off a solution finding and nowhere else — an earlier version printed
//      "A♦ cost you here" on the word of a guideline hedged with "usually",
//      turning a maxim into a measurement.
//
// The explanation always comes from `assessment.teachable`, which the reconciler
// guarantees reasoned only from cards the learner can see. That is how the
// solver's knowledge of the hidden hands stays out of the prose.

import type {
  Assessment,
  CoachNote,
  InterventionDecision,
  ResponseType,
} from "@laic/coach/core";
import { callLabel } from "@bridge/events";

import type { BridgeFinding } from "./assessors/panel";
import { whyNotText } from "./whyNot";
import { CONTRACT_VERSION, type NoteContext } from "./context";
import type { TableActivityEvent } from "./tableEvents";

/**
 * The rung at which the coach names the play it would have made.
 *
 * 2, not 3, because of how the levels are actually reached. Unprompted,
 * `decideIntervention` sets the level from SEVERITY alone: 1 for a near miss, 2
 * for a real divergence. Anything above 2 needs an explicit request, and "Show
 * me" supplies it — so one tap from a nudge reaches the answer.
 */
export const REVEAL_LEVEL = 2;

/** The AREA a call belongs to, from the engine's own auction role. */
const AREA_BY_ROLE: Record<string, string> = {
  opening: "opening the bidding",
  opener: "your rebid after opening",
  responder: "responding to partner's opening",
  overcaller: "coming in over their opening",
  advancer: "advancing partner's overcall",
};

const SUIT_GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };

/** "DT" → "10♦". The engine's card notation, in the table's. */
function cardText(card: string): string {
  const rank = card.slice(1) === "T" ? "10" : card.slice(1);
  return `${rank}${SUIT_GLYPH[card[0] ?? ""] ?? card[0]}`;
}

/** The contract's `kind` for each of the engine's response types. */
const NOTE_KIND: Partial<Record<ResponseType, CoachNote["kind"]>> = {
  hint: "hint",
  nudge: "nudge",
  question: "question",
  explanation: "explanation",
};

/**
 * The fields every note carries regardless of what it says.
 *
 * `createdAt` comes from the EVENT, not the clock: the note is about that action,
 * and deriving it keeps a re-render byte-identical to the one before — which is
 * what makes recomputing at render defensible while the coach is deterministic.
 */
function base(event: TableActivityEvent, ctx: NoteContext) {
  return {
    schemaVersion: CONTRACT_VERSION,
    noteId: event.eventId,
    context: event.context,
    learnerId: ctx.learnerId,
    anchorId: event.eventId,
    policyVersion: ctx.policyVersion,
    profileId: ctx.profileId,
    createdAt: event.timestamp,
  };
}

const bridgeOf = (f: BridgeFinding | undefined) => f?.bridge;
const trickText = (n: number) => (n === 1 ? "a trick" : `${n} tricks`);

/**
 * The finding's own words, but only when they are WORDS.
 *
 * When a knowledge item has no authored prose, the assessors fall back to the
 * rule's label — and a label is a title, not a sentence. "The finesse" as the
 * lead of a hint tells a learner nothing and, concatenated with the sentence
 * after it, reads as a fault: *"The finesse Work out what the position needed."*
 *
 * So a bare label is not prose. It still earns its place as the CITATION chip,
 * where a title is exactly the right shape.
 */
function proseOf(f: BridgeFinding | undefined): string | undefined {
  const text = f?.because?.trim();
  if (!text) return undefined;
  // A label is short, unpunctuated, and identical to what the chip will show.
  const isLabel = text === bridgeOf(f)?.ruleLabel || (!/[.!?]$/.test(text) && text.length < 60);
  return isLabel ? undefined : text;
}

/** Joins a lead onto a following sentence without running the two together. */
const sentence = (lead: string) => (/[.!?]$/.test(lead.trim()) ? lead.trim() : `${lead.trim()}.`);

/** What the learner did, in table notation — a call or a card. */
function movedText(event: TableActivityEvent): string {
  return event.action.kind === "call"
    ? callLabel(event.action.call ?? "")
    : cardText(event.action.card ?? "");
}

function playText(event: TableActivityEvent, play: string): string {
  return event.action.kind === "call" ? callLabel(play) : cardText(play);
}

/**
 * The questions a learner can ask, each answered from evidence already computed.
 *
 * No model involved. "Why?" is the item's authored prose; "Why not my call?" is
 * the decider's own trace, with the near-miss it recorded ("needed five-plus
 * spades, held one"). Both existed before this and neither was reachable — the
 * prose sat behind an unlabelled "more" and the trace was thrown away.
 *
 * Withheld along with everything else below the reveal rung: a follow-up that
 * names the answer is the answer.
 */
function followUpsFor(
  event: TableActivityEvent,
  teachable: BridgeFinding | undefined,
  fullDetail: string | undefined,
  revealed: boolean,
): { q: string; a: string }[] | undefined {
  if (!revealed) return undefined;
  const ups: { q: string; a: string }[] = [];

  const why = bridgeOf(teachable)?.whyNot;
  if (why) {
    const what = movedText(event);
    ups.push({ q: `Why not ${what}?`, a: whyNotText(why, what, event.action.kind) });
  }
  return ups.length ? ups : undefined;
}

/** The note for an assessment the policy decided to speak about. */
export function assessmentNote(
  event: TableActivityEvent,
  assessment: Assessment,
  decision: InterventionDecision,
  ctx: NoteContext,
): CoachNote {
  const moved = movedText(event);
  const revealed = decision.hintLevel >= REVEAL_LEVEL;
  const teachable = assessment.teachable as BridgeFinding | undefined;
  const cost = assessment.findings.find((f) => f.authority === "solution")?.cost?.tricks ?? 0;
  const would = bridgeOf(teachable)?.would ?? teachable?.recommends?.[0];

  // THE CASE WORTH TEACHING: your own system endorsed this and a solved position
  // measured a loss anyway. Lead with it — nothing else the coach can say is more
  // useful, and it is the entire reason the panel keeps every finding instead of
  // stopping at the first. It is also not a reprimand and must not read as one.
  if (assessment.disagreement) {
    return {
      ...base(event, ctx),
      kind: "explanation",
      hintLevel: decision.hintLevel,
      headline: `${moved} is your system's play — and it cost ${trickText(cost)} here.`,
      detail:
        `${assessment.disagreement.endorsed.because ?? "Your system endorses this."} ` +
        `The cards lay badly for it this time. Following the agreement is still right — ` +
        `this is what it costs on the deals where it doesn't work.`,
      ...citesOf(assessment.disagreement.endorsed),
    };
  }

  return {
    ...base(event, ctx),
    kind: NOTE_KIND[decision.responseType] ?? "explanation",
    hintLevel: decision.hintLevel,
    ...(revealed
      ? revealedBody(moved, would ? playText(event, would) : null, teachable, cost)
      : withheldBody(moved, decision.responseType, teachable, event)),
    // Citations name the answer, so they are withheld along with it.
    ...(revealed ? citesOf(teachable) : {}),
    ...(revealed ? alternativesOf(teachable, event) : {}),
    ...(() => {
      const ups = followUpsFor(event, teachable, teachable?.because, revealed);
      return ups ? { followUps: ups } : {};
    })(),
  };
}

/**
 * A quiet confirmation for an action every authority was content with.
 *
 * The policy engine stays silent on a correct action, which is right for
 * interruption and wrong for a panel: a coach that only ever appears when you err
 * teaches you to dread it, and gives no evidence it watched the good moves.
 */
export function assessmentAffirmation(
  event: TableActivityEvent,
  assessment: Assessment,
  ctx: NoteContext,
): CoachNote {
  const moved = movedText(event);
  const teachable = assessment.teachable as BridgeFinding | undefined;
  const agreed = assessment.correctness === "correct";
  // The prose, or nothing — never the rule's label, which the citation chip
  // directly below is already showing. Printing both put the same six words on
  // screen twice.
  const prose = proseOf(teachable);
  return {
    ...base(event, ctx),
    kind: "affirmation",
    headline: agreed ? `${moved} — that's your system's play.` : `${moved} is playable here.`,
    ...(prose ? { detail: prose } : {}),
    ...citesOf(teachable),
  };
}

function revealedBody(
  moved: string,
  would: string | null,
  teachable: BridgeFinding | undefined,
  cost: number,
): { headline: string; detail: string } {
  // `cost` reaches here only from a solution finding — see rule 2 at the top.
  const costLine = cost > 0 ? ` It cost ${trickText(cost)}.` : "";
  const prose = proseOf(teachable);
  return {
    headline: would
      ? `Your system plays ${would} here, not ${moved}.`
      : `${moved} isn't what your system plays here.`,
    detail: prose
      ? `${sentence(prose)}${costLine}`
      : // No authored prose for this agreement — the citation names it, so say
        // what a note can honestly say and leave the naming to the chip.
        `Your system has an agreement covering this position.${costLine}`,
  };
}

function withheldBody(
  moved: string,
  responseType: ResponseType,
  teachable: BridgeFinding | undefined,
  event: TableActivityEvent,
): { headline: string; detail: string } {
  // Below the rung the ANSWER is withheld, not the orientation. For a call the
  // area comes from the auction role; for a card, the guideline's own wording is
  // the lead. "Look at your responses" is a lead; "something is wrong" is not.
  const area =
    event.action.kind === "call"
      ? (AREA_BY_ROLE[bridgeOf(teachable)?.role ?? ""] ?? "this position")
      : "this trick";
  const lead = proseOf(teachable);

  if (responseType === "question") {
    return {
      headline: `What is ${moved} showing your partner?`,
      detail: `This is about ${area}. Your system has an agreement for it — compare what that asks for with the hand you're holding.`,
    };
  }
  if (responseType === "nudge") {
    return {
      headline: `Worth a second look at ${moved}.`,
      detail: lead
        ? `${sentence(lead)} Work out what the position needed before looking at the answer.`
        : `Your system has an agreement for ${area} that points somewhere else.`,
    };
  }
  return {
    headline: `${moved} isn't what your system plays here.`,
    detail: lead
      ? `${sentence(lead)} Work out what the position needed before looking at the answer.`
      : `This is about ${area}, and your system has an agreement for it.`,
  };
}

function citesOf(f: BridgeFinding | undefined) {
  return f?.cites?.length
    ? {
        citations: f.cites.map((c) => ({
          label: c.label,
          ...(c.sourceId ? { sourceId: c.sourceId } : {}),
        })),
      }
    : {};
}

function alternativesOf(f: BridgeFinding | undefined, event: TableActivityEvent) {
  const alts = bridgeOf(f)?.alternatives;
  if (!alts?.length || event.action.kind !== "call") return {};
  return { alternatives: alts.map((a) => ({ label: callLabel(a.action), why: a.title })) };
}

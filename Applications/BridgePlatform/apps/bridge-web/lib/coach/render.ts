// The component's note → what the strip draws.
//
// `CoachNote` (the contract) is what the coach SAID; `StripNote` is how this
// app chooses to show it. Keeping them apart is the whole point of making the
// note a contract: persistence, review and postmortem all key off the contract,
// while the badge colours and the seat chip are this table's business and no
// other host's.
//
// The mapping is deliberately dull. If it ever needs a decision in it, the
// decision belongs upstream in the note, not here.

import type { CoachNote } from "@laic/coach/core";

import type { CoachNote as StripNote, CoachNoteSource } from "@/components/table/play/CoachStrip";
import { REVEAL_LEVEL } from "./notes";

/** `status` is the coach reporting on itself — the table's voice, not the coach's. */
const SOURCE_BY_KIND: Partial<Record<CoachNote["kind"], CoachNoteSource>> = {
  status: "system",
};

/**
 * How the strip should WEIGH a note, as opposed to who said it.
 *
 * Measured across six real boards: 34 approvals to 6 corrections, and one board
 * that was twenty-five consecutive "that's your system's play". Rendering those
 * with the same weight as a correction turns the panel into a scoreboard — and
 * buries the one line worth acting on among two dozen identical pats on the back.
 */
const TONE_BY_KIND: Record<CoachNote["kind"], "correction" | "affirmation" | "status"> = {
  hint: "correction",
  nudge: "correction",
  question: "correction",
  explanation: "correction",
  affirmation: "affirmation",
  status: "status",
};

/**
 * Split authored prose into a LEAD SENTENCE and the rest.
 *
 * Knowledge items are written as reference material — 400 to 700 words of it,
 * complete with slide numbers and cross-references. That is the right shape for
 * someone studying the system and the wrong shape for someone holding thirteen
 * cards mid-auction, where the coach gets about one line of attention.
 *
 * So the note keeps the whole thing (the contract records what the learner was
 * offered) and the STRIP shows the opening sentence with the remainder behind a
 * toggle. On this knowledge base the opening sentences turn out to be nearly the
 * one-liners you would have written by hand — "Open 1♥/1♠ with 12-21 points and a
 * five-card or longer major, when that major is the longest suit" — and the slide
 * references mostly live in the later sentences, so they stop reaching a learner
 * as a side effect rather than by editing anyone's prose.
 *
 * A short one-line `summary` field on the item would beat this outright. Until
 * that exists, this is the cheap approximation.
 */
const LEAD_MAX = 190;

export function splitDetail(text: string): { lead: string; rest?: string } {
  const clean = text.trim();
  // First sentence boundary: a stop, then whitespace, then something that starts
  // a new sentence. Keeps "SECOND HAND PLAYS LOW: …" intact, since a colon is
  // not a boundary.
  const boundary = /(?<=[.!?])\s+(?=[A-Z(“"])/.exec(clean);
  // `boundary.index` is where the WHITESPACE starts, so the stop is the character
  // before it — slicing to `index + 1` kept a trailing space on every lead.
  let lead = boundary ? clean.slice(0, boundary.index) : clean;

  // A single sentence can still run long — several of these do. Cut at a word
  // boundary and mark it, rather than putting a paragraph on one line.
  if (lead.length > LEAD_MAX) {
    const cut = lead.slice(0, LEAD_MAX);
    const space = cut.lastIndexOf(" ");
    lead = `${(space > LEAD_MAX / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
  }

  // When the lead had to be CUT mid-sentence, the remainder is the whole passage
  // rather than the tail. Handing back the tail made "Why?" open on a lowercase
  // fragment — "the range is a full ten points wide and…" — which reads as a
  // rendering fault. Repeating the opening line is what an expand is for.
  if (lead.endsWith("…")) return { lead, rest: clean };

  const rest = clean.slice(lead.length).trim();
  return rest ? { lead, rest } : { lead };
}

/** Kinds that can be holding an answer back, and so can be escalated. */
const WITHHOLDING = new Set<CoachNote["kind"]>(["hint", "nudge", "question"]);

export function toStripNote(
  note: CoachNote,
  opts: { revealHref?: (anchorId: string) => string } = {},
): StripNote {
  // A "Show me" offer only where there is something still withheld: the note is
  // one of the withholding kinds AND sits below the rung at which the coach
  // names the answer. Offering it on a note that already answered would be a
  // button that changes nothing.
  const withholding =
    WITHHOLDING.has(note.kind) &&
    typeof note.hintLevel === "number" &&
    note.hintLevel < REVEAL_LEVEL;
  const href = withholding ? opts.revealHref?.(note.anchorId) : undefined;

  // The contract keeps the full explanation; the strip shows its opening line.
  //
  // Except for a `status` note, which is the coach reporting on ITSELF — a
  // compact line already, and the part worth reading ("none of them were yours")
  // sits in its second sentence. Splitting it hid exactly the information it
  // exists to convey.
  // Split only what was AUTHORED. A note anchored to "board" — you're dummy, or
  // the coach reporting what it heard — is a sentence the coach composed itself:
  // short already, and cutting it into a question produces a "Why?" whose answer
  // is the back half of an unrelated thought ("There's nothing for you to do
  // until the next board"). Splitting is for reference prose, not for the coach's
  // own voice.
  const authored = note.kind !== "status" && note.anchorId !== "board";
  const split = note.detail && authored ? splitDetail(note.detail) : undefined;

  return {
    id: note.noteId,
    source: SOURCE_BY_KIND[note.kind] ?? "coach",
    tone: TONE_BY_KIND[note.kind],
    headline: note.headline,
    ...(split ? { detail: split.lead } : note.detail ? { detail: note.detail } : {}),
    // The rest of the authored prose becomes the answer to "Why?", ahead of the
    // coach's own follow-ups. An unlabelled "more" toggle asked the learner to
    // guess what was behind it; a question says what they will get.
    ...(() => {
      const ups = [
        ...(split?.rest ? [{ q: "Why?", a: split.rest }] : []),
        ...(note.followUps ?? []),
      ];
      return ups.length ? { followUps: ups } : {};
    })(),
    // Citations are CARRIED here and not drawn by the strip — the decision about
    // who sees them belongs to the view, not to this mapping. They point at
    // "slide 76" of a source deck a learner cannot open, credited to "Claude
    // (Anthropic) — platform-authored judgments", which is internal vocabulary
    // and reads as a non-sequitur at a bridge table. That is provenance for
    // whoever AUTHORS or reviews the rulebook: valuable, pointed at the wrong
    // reader. Keeping the data means a review surface or an author's view needs
    // no second path to it.
    ...(note.citations?.length
      ? { citations: note.citations.map((c) => ({ label: c.label, ...(c.href ? { href: c.href } : {}) })) }
      : {}),
    ...(note.alternatives?.length ? { alternatives: note.alternatives } : {}),
    ...(href ? { action: { label: "Show me", href } } : {}),
  };
}

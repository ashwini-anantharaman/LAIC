// The "strip note" — how this app CHOOSES to show a coach note.
//
// These types used to live in the old-path table component (components/table/
// play/CoachPanel), where the CoachSheet consumed them directly. That component
// is gone (phase-2 coach transplant: his engine, our shell), but the engine
// side of the mapping stays — render.ts turns @laic/coach/core's CoachNote (the
// contract) into this presentation shape, and index.ts's coachNotesForBoard
// returns an array of them. So the types belong here now, beside the code that
// produces them, with no UI dependency.
//
// NOTE: this is the unprompted-notes path, which is OFF at the table by owner
// decision (the coach is looking / think / advice, not a running commentary).
// It stays compiled and tested so the socratic mode can switch it back on
// without a second implementation.

/** Who is speaking. Drives the badge, nothing else. */
export type CoachNoteSource = "coach" | "ben" | "kb" | "system";

/**
 * How much of the reader's attention this note deserves.
 *
 * Separate from `source`, which says who spoke. A board can produce two dozen
 * approvals and one correction; giving them equal weight makes the panel a
 * scoreboard and hides the only line worth acting on.
 */
export type CoachNoteTone = "correction" | "affirmation" | "status";

export interface CoachNote {
  /** Who is speaking. Drives the badge, nothing else. */
  source: CoachNoteSource;
  /** How the sheet weighs it. Corrections are shown; approvals are counted. */
  tone?: CoachNoteTone;
  /** One line, always visible when this is the latest note. */
  headline: string;
  /** The reasoning. One line where possible. */
  detail?: string;
  /** Questions the learner can ask, each with an answer the coach already holds. */
  followUps?: readonly { q: string; a: string }[];
  /** What it leaned on — a knowledge item, a source document, an anchor. */
  citations?: readonly { label: string; href?: string }[];
  /** What it considered and turned down — a bid engine's `rejected[]`. */
  alternatives?: readonly { label: string; why: string }[];
  /** Which seat/trick this is about, for later filtering by hand or trick. */
  about?: { seat?: string; trick?: number };
  /** A way to ask for more, on a note deliberately holding the answer back. */
  action?: { label: string; href: string };
  /** Host-supplied timestamp; rendered as given, never parsed. */
  at?: string;
  /** Stable id so a re-render doesn't reorder or re-animate notes. */
  id?: string;
}

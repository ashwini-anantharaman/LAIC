// The create-wizard draft: the ONE payload shape the client wizard builds and
// `createChallengeAction` re-validates (docs/challenges-v1-spec.md §6 + the
// "Create Challenge" canvas). Pure and client-safe — no server imports — so
// the wizard and the action check the same rules with the same code.
//
// Boards travel as SEEDS, not cards: the wizard previews `seededDeal(seed)`
// and the server re-derives the identical pack from the identical seed. A
// board the creator hand-edited in the DealEditor carries `pack` instead, in
// the editor's own ♠.♥.♦.♣ serialization, and the server re-parses it.

import {
  MAX_BOARDS,
  MIN_BOARDS,
  type ChallengeScoring,
  type ControlOverride,
  type StandingsVisibility,
} from "@bridge/challenges";
import { SEATS, type Card, type Seat } from "@bridge/events";
// Relative, not "@/": this module is unit-tested and the vitest config has no
// path aliases.
import { handFromSerialized } from "../../../lib/dealText";

export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 240;

export const SCORING_OPTIONS: readonly {
  key: ChallengeScoring;
  label: string;
  full: string;
  note: string;
}[] = [
  {
    key: "imps",
    label: "IMPs",
    full: "IMPs vs datum",
    note: "Scored in IMPs against the field datum — the average of everyone who has finished. BEN is excluded from that average.",
  },
  {
    key: "mp",
    label: "Matchpoints",
    full: "Matchpoint %",
    note: "Matchpoint %: on every board your result is compared pair-against-pair, half a point for a tie.",
  },
  {
    key: "total",
    label: "Total points",
    full: "Total points",
    note: "Raw total points, summed straight across every board — simplest to read, harshest on a single bad board.",
  },
];

export const STANDINGS_OPTIONS: readonly {
  key: StandingsVisibility;
  label: string;
  sub: string;
  note: string;
  review: string;
}[] = [
  {
    key: "after-finish",
    label: "After each player finishes",
    sub: "Spoiler-safe · default",
    note: "Nobody sees a score until they have played every board — you trade the pull of a live race for a clean, unspoiled sit-down. Moderators still see standings early.",
    review: "After each player finishes — spoiler-safe unlock",
  },
  {
    key: "always",
    label: "Always visible",
    sub: "Live race",
    note: "Everyone watches the standings move from board one — motivating, but a leader's result can colour how the rest bid and play.",
    review: "Always visible — live from board one",
  },
];

/**
 * The table controls a creator may force on or off for the challenge, keyed by
 * their ACCESS-CATALOGUE key — the override layer is applied over the
 * catalogue in both directions at the table, so the keys must be the
 * catalogue's own (spec §7).
 *
 * `table.claim` has no catalogue entry yet (the table grew no claim control);
 * the checklist carries it because the design does, and the stored override
 * starts applying the day the key exists. Undo and show-all-hands default to
 * `hide`: this is scored play.
 */
export const CHALLENGE_CONTROLS: readonly {
  key: string;
  label: string;
  sub: string;
  def: ControlState;
  note?: string;
}[] = [
  {
    key: "table.hands_view",
    label: "Show all four hands",
    sub: "The four-hand diagram",
    def: "hide",
    note: "Scored play — hands stay hidden. Turn on only to teach.",
  },
  {
    key: "table.undo",
    label: "Undo",
    sub: "Take back a bid or card",
    def: "hide",
    note: "Scored play — no take-backs. Turn on only to teach.",
  },
  { key: "table.claim", label: "Claim", sub: "Concede the rest of the tricks", def: "default" },
  { key: "table.seats_panel", label: "Seats", sub: "Who sits each seat", def: "default" },
  {
    key: "table.step_controls",
    label: "Pause / Step",
    sub: "Halt and single-step the robots",
    def: "default",
  },
  { key: "table.settings_menu", label: "☰ Menu", sub: "Table settings sheet", def: "default" },
  { key: "table.coach", label: "Coach", sub: "Commentary panel", def: "default" },
];

/** A checklist cell: leave the catalogue alone, or override it either way. */
export type ControlState = "default" | ControlOverride;

export const CONTROL_STATES: readonly { key: ControlState; label: string }[] = [
  { key: "default", label: "Default" },
  { key: "show", label: "Show" },
  { key: "hide", label: "Hide" },
];

export function defaultControlStates(): Record<string, ControlState> {
  const out: Record<string, ControlState> = {};
  for (const c of CHALLENGE_CONTROLS) out[c.key] = c.def;
  return out;
}

/** The checklist's non-`default` cells — what actually gets stored per board. */
export function controlOverridesOf(
  states: Record<string, ControlState>,
): Record<string, ControlOverride> {
  const out: Record<string, ControlOverride> = {};
  for (const control of CHALLENGE_CONTROLS) {
    const state = states[control.key];
    if (state === "show" || state === "hide") out[control.key] = state;
  }
  return out;
}

export interface ChallengeBoardDraft {
  boardNo: number;
  /** The deal seed — `seededDeal(seed)` on both sides produces the same pack. */
  seed: number;
  dealer: Seat;
  humanSeat: Seat;
  /** Set once the creator hand-edited this board: ♠.♥.♦.♣ text per seat. */
  pack?: Record<Seat, string>;
}

export interface ChallengeInviteDraft {
  userId: string;
  /** Per-invite moderator flag (ADDENDUM A2) — the creator's is implicit. */
  moderator: boolean;
}

export interface ChallengeDraft {
  title: string;
  description: string;
  scoring: ChallengeScoring;
  standingsVisibility: StandingsVisibility;
  boards: ChallengeBoardDraft[];
  controlOverrides: Record<string, ControlOverride>;
  invites: ChallengeInviteDraft[];
  /** True once a pack editor was OPENED on any board (spec §3). */
  editorBadge: boolean;
}

const SEAT_SET = new Set<string>(SEATS);
const SCORINGS = new Set<string>(SCORING_OPTIONS.map((s) => s.key));
const STANDINGS = new Set<string>(STANDINGS_OPTIONS.map((s) => s.key));
const CONTROL_KEYS = new Set(CHALLENGE_CONTROLS.map((c) => c.key));

/** A hand-edited pack, parsed and legality-checked. */
export function packFromDraft(
  pack: Record<Seat, string>,
): { hands: Record<Seat, Card[]> } | { error: string } {
  const hands = { N: [], E: [], S: [], W: [] } as Record<Seat, Card[]>;
  const seen = new Set<string>();
  for (const seat of SEATS) {
    const parsed = handFromSerialized(pack[seat] ?? "");
    if ("error" in parsed) return { error: `${seat}: ${parsed.error}` };
    if (parsed.length !== 13) return { error: `${seat} holds ${parsed.length} cards, not 13` };
    for (const card of parsed) {
      const id = `${card.suit}${card.rank}`;
      if (seen.has(id)) return { error: `${id} is dealt twice` };
      seen.add(id);
    }
    hands[seat] = parsed;
  }
  return { hands };
}

/**
 * Every rule the create form enforces, as readable sentences. The wizard runs
 * this to keep the Create button honest; the server action runs it again
 * because a client is never the authority.
 */
export function validateDraft(draft: ChallengeDraft): string[] {
  const errors: string[] = [];
  const title = draft.title.trim();
  if (!title) errors.push("Give the challenge a title.");
  if (title.length > TITLE_MAX) errors.push(`Titles are at most ${TITLE_MAX} characters.`);
  if (draft.description.trim().length > DESCRIPTION_MAX)
    errors.push(`Descriptions are at most ${DESCRIPTION_MAX} characters.`);
  if (!SCORINGS.has(draft.scoring)) errors.push("Pick a scoring method.");
  if (!STANDINGS.has(draft.standingsVisibility)) errors.push("Pick when standings are visible.");

  if (draft.boards.length < MIN_BOARDS || draft.boards.length > MAX_BOARDS)
    errors.push(`A challenge has ${MIN_BOARDS}–${MAX_BOARDS} boards.`);
  draft.boards.forEach((board, i) => {
    if (board.boardNo !== i + 1) errors.push(`Board ${i + 1} is numbered ${board.boardNo}.`);
    if (!Number.isInteger(board.seed)) errors.push(`Board ${board.boardNo} has no deal.`);
    if (!SEAT_SET.has(board.dealer)) errors.push(`Board ${board.boardNo} has no dealer.`);
    if (!SEAT_SET.has(board.humanSeat)) errors.push(`Board ${board.boardNo} has no seat for you.`);
    if (board.pack) {
      const parsed = packFromDraft(board.pack);
      if ("error" in parsed) errors.push(`Board ${board.boardNo} pack — ${parsed.error}.`);
    }
  });

  for (const [key, value] of Object.entries(draft.controlOverrides)) {
    if (!CONTROL_KEYS.has(key)) errors.push(`"${key}" is not a table control.`);
    else if (value !== "show" && value !== "hide")
      errors.push(`"${key}" must be shown or hidden.`);
  }

  const seen = new Set<string>();
  for (const invite of draft.invites) {
    if (!invite.userId) errors.push("An invite has no player.");
    else if (seen.has(invite.userId)) errors.push("Someone is invited twice.");
    seen.add(invite.userId);
  }
  return errors;
}

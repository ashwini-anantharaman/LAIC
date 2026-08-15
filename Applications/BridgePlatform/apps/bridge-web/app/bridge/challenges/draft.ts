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
  type ChallengeFormat,
  type ChallengeScoring,
  type ControlOverride,
  type StandingsVisibility,
} from "@bridge/challenges";
import { SEATS, VUL_LABEL, type Card, type Seat, type Vul } from "@bridge/events";
// Relative, not "@/": this module is unit-tested and the vitest config has no
// path aliases.
import { handFromSerialized } from "../../../lib/dealText";

export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 240;

/**
 * WHAT A BOARD ASKS FOR — the first question in `01 · Basics`, because it
 * decides whether the scoring question is asked at all.
 *
 * `bidding-only` is not a variant of a scored board: it ends the board at the
 * end of the auction and replaces the whole field calculation with one
 * comparison against BEN's own auction on the same deal. So the copy here has
 * to be honest that IMPs/matchpoints/total points do not apply.
 */
export const FORMAT_OPTIONS: readonly {
  key: ChallengeFormat;
  label: string;
  sub: string;
  note: string;
  /** The line the Review step and the draft rail read. */
  review: string;
  /** The one-word form the summary strips use. */
  short: string;
}[] = [
  {
    key: "full",
    label: "Bid & play",
    sub: "The whole board",
    note: "The full board: bid it, play all thirteen tricks, and score it against everyone else who finished.",
    review: "Bid & play — the whole board, scored against the field",
    short: "bid & play",
  },
  {
    key: "bidding-only",
    label: "Bidding only",
    sub: "The auction is the board",
    note: "The board ends when the auction ends — no cards are played. Your result is the contract you reached, set beside the contract BEN reached on the same deal.",
    review: "Bidding only — the board ends with the auction, your contract beside BEN's",
    short: "bidding only",
  },
];

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
  /**
   * The board's OWN vulnerability. Omitted, it follows the standard cycle for
   * its position — which is what a random board wants. A board imported from a
   * BBO link brings its own, because vulnerability is part of the deal that was
   * imported and re-deriving it would score the same cards differently.
   */
  vul?: Vul;
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
  /**
   * What a board asks for. Absent is tolerated and MEANS `full` — the record
   * written before the option existed reads the same way (see
   * `challengeFormat`), so a draft that predates it is not an error.
   */
  format?: ChallengeFormat;
  /**
   * Ignored entirely by a `bidding-only` challenge, which has no field maths
   * to run — it is still carried so switching the format back restores the
   * creator's choice rather than silently resetting it.
   */
  scoring: ChallengeScoring;
  standingsVisibility: StandingsVisibility;
  boards: ChallengeBoardDraft[];
  controlOverrides: Record<string, ControlOverride>;
  invites: ChallengeInviteDraft[];
  /** True once a pack editor was OPENED on any board (spec §3). */
  editorBadge: boolean;
  /**
   * A PRIVATE TABLE: this challenge belongs to the person who made it, not to a
   * club. It is stored with no owning program and `scope_level: "user"`, so it
   * appears for exactly the people invited and on nobody's club list — which is
   * what lets someone play with friends from another club, or from none.
   *
   * Explicit and opt-in, never inferred. `requireChallengeOwnerScope` exists to
   * stop an ACCIDENTAL null owner leaking a club's challenge everywhere; this flag
   * is the deliberate case, and the two must stay distinguishable.
   */
  personal?: boolean;
}

const SEAT_SET = new Set<string>(SEATS);
const VUL_SET = new Set<string>(Object.keys(VUL_LABEL));
const FORMATS = new Set<string>(FORMAT_OPTIONS.map((f) => f.key));
const SCORINGS = new Set<string>(SCORING_OPTIONS.map((s) => s.key));
const STANDINGS = new Set<string>(STANDINGS_OPTIONS.map((s) => s.key));
const CONTROL_KEYS = new Set(CHALLENGE_CONTROLS.map((c) => c.key));

/**
 * Coerce a STORED draft back into a usable one.
 *
 * A parked draft is JSON written by an older build of this wizard, so nothing
 * in it can be trusted to exist or to be well-formed: fields arrive missing,
 * renamed, or holding values that were legal once. Every unknown is replaced by
 * the default a fresh wizard starts from rather than rejected, because the
 * alternative is a saved draft that will not open — and a draft you cannot
 * reopen is worse than one you never saved.
 *
 * `validateDraft` still runs before anything is PUBLISHED. This only has to
 * make the wizard openable; it is not the authority on whether a draft is
 * fit to become a challenge.
 */
export function normalizeDraft(input: unknown): ChallengeDraft {
  const o = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
  const rawBoards = Array.isArray(o.boards) ? o.boards : [];

  const boards: ChallengeBoardDraft[] = rawBoards.flatMap((raw, i) => {
    if (!raw || typeof raw !== "object") return [];
    const b = raw as Record<string, unknown>;
    const seed = typeof b.seed === "number" && Number.isFinite(b.seed) ? b.seed : 0;
    const boardNo = typeof b.boardNo === "number" && b.boardNo > 0 ? b.boardNo : i + 1;
    const dealer = SEAT_SET.has(str(b.dealer)) ? (b.dealer as Seat) : "N";
    const humanSeat = SEAT_SET.has(str(b.humanSeat)) ? (b.humanSeat as Seat) : "S";
    // A pack is only carried when it was hand-edited; a malformed one is
    // dropped rather than kept, and the board falls back to its seed's deal.
    const pack =
      b.pack && typeof b.pack === "object"
        ? (Object.fromEntries(
            SEATS.map((seat) => [seat, str((b.pack as Record<string, unknown>)[seat])]),
          ) as Record<Seat, string>)
        : undefined;
    return [
      {
        boardNo,
        seed,
        dealer,
        humanSeat,
        ...(VUL_SET.has(str(b.vul)) ? { vul: b.vul as Vul } : {}),
        ...(pack && "hands" in packFromDraft(pack) ? { pack } : {}),
      },
    ];
  });

  const overrides: Record<string, ControlOverride> = {};
  if (o.controlOverrides && typeof o.controlOverrides === "object")
    for (const [key, value] of Object.entries(o.controlOverrides as Record<string, unknown>))
      if (CONTROL_KEYS.has(key) && (value === "show" || value === "hide"))
        overrides[key] = value;

  const invites: ChallengeInviteDraft[] = (Array.isArray(o.invites) ? o.invites : []).flatMap(
    (raw) => {
      if (!raw || typeof raw !== "object") return [];
      const i = raw as Record<string, unknown>;
      return typeof i.userId === "string" && i.userId
        ? [{ userId: i.userId, moderator: i.moderator === true }]
        : [];
    },
  );

  return {
    title: str(o.title),
    description: str(o.description),
    ...(FORMATS.has(str(o.format)) ? { format: o.format as ChallengeFormat } : {}),
    scoring: SCORINGS.has(str(o.scoring)) ? (o.scoring as ChallengeScoring) : "imps",
    standingsVisibility: STANDINGS.has(str(o.standingsVisibility))
      ? (o.standingsVisibility as StandingsVisibility)
      : "after-finish",
    boards,
    controlOverrides: overrides,
    invites,
    editorBadge: o.editorBadge === true,
  };
}

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
  // Absent is the default, not a mistake — an older draft carries no format
  // and means the full board. Anything else present must be one of the two.
  if (draft.format !== undefined && !FORMATS.has(draft.format))
    errors.push("Pick whether the board is bid and played, or bidding only.");
  // A bidding-only challenge never runs the field maths, but it still stores a
  // scoring mode (see ChallengeDraft), so the value must stay legal either way.
  if (!SCORINGS.has(draft.scoring)) errors.push("Pick a scoring method.");
  if (!STANDINGS.has(draft.standingsVisibility)) errors.push("Pick when standings are visible.");

  if (draft.boards.length < MIN_BOARDS || draft.boards.length > MAX_BOARDS)
    errors.push(`A challenge has ${MIN_BOARDS}–${MAX_BOARDS} boards.`);
  draft.boards.forEach((board, i) => {
    if (board.boardNo !== i + 1) errors.push(`Board ${i + 1} is numbered ${board.boardNo}.`);
    if (!Number.isInteger(board.seed)) errors.push(`Board ${board.boardNo} has no deal.`);
    if (!SEAT_SET.has(board.dealer)) errors.push(`Board ${board.boardNo} has no dealer.`);
    if (!SEAT_SET.has(board.humanSeat)) errors.push(`Board ${board.boardNo} has no seat for you.`);
    if (board.vul !== undefined && !VUL_SET.has(board.vul))
      errors.push(`Board ${board.boardNo} has no vulnerability.`);
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

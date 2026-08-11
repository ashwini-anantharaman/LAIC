// The SOLO challenge draft — the one payload `<ChallengeCreator/>` builds and
// `<ChallengePlayer/>` plays. A port of the platform wizard's draft.ts
// (apps/bridge-web/app/bridge/challenges/draft.ts) with the whole group half
// removed.
//
// WHAT IS GONE, AND WHY. A solo challenge has exactly one player, so there are
// no invites, no moderators and no standings visibility — there is nobody to
// invite, nobody to promote and nobody to hide a standing from. The editor
// badge goes with them: it exists to tell a FIELD that the creator had seen
// the hands, and an audience of one already knows.
//
// WHAT STAYS. Everything that describes the boards themselves: the title, what
// a board asks for (`format`), how a played board reads (`scoring`), the deals
// with their dealer/seat/vulnerability, and the table-control overrides. Those
// are the same fields the platform stores, spelled the same way, so a draft
// authored here is a subset of a platform challenge rather than a dialect.
//
// Pure and client-safe: no React, no fetch, no store.

import {
  MAX_BOARDS,
  MIN_BOARDS,
  type ChallengeFormat,
  type ChallengeScoring,
  type ControlOverride,
} from "@bridge/challenges";
import { SEATS, VUL_LABEL, type Card, type Seat, type Vul } from "@bridge/events";
import { handFromSerialized } from "./dealText";

export { MAX_BOARDS, MIN_BOARDS };

export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 240;

/**
 * WHAT A BOARD ASKS FOR — the first question the wizard puts, because it
 * decides whether the scoring question is asked at all.
 *
 * `bidding-only` is not a variant of a scored board: it ends the board at the
 * end of the auction and replaces the score with one comparison against BEN's
 * own auction on the same deal.
 */
export const FORMAT_OPTIONS: readonly {
  key: ChallengeFormat;
  label: string;
  sub: string;
  note: string;
  /** The line the Review step reads. */
  review: string;
}[] = [
  {
    key: "full",
    label: "Bid & play",
    sub: "The whole board",
    note: "The full board: bid it, play all thirteen tricks, and set your score beside BEN's on the same deal.",
    review: "Bid & play — the whole board, scored beside BEN",
  },
  {
    key: "bidding-only",
    label: "Bidding only",
    sub: "The auction is the board",
    note: "The board ends when the auction ends — no cards are played. Your result is the contract you reached, set beside the contract BEN reached on the same deal.",
    review: "Bidding only — the board ends with the auction, your contract beside BEN's",
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
    full: "IMPs vs BEN",
    note: "Every board is scored in IMPs against BEN's own result on the same deal — the ordinary way two results on one board are compared.",
  },
  {
    key: "mp",
    label: "Matchpoints",
    full: "Matchpoints vs BEN",
    note: "Every board is a single comparison: beat BEN's score and it is 100%, tie it and it is 50%.",
  },
  {
    key: "total",
    label: "Total points",
    full: "Points vs BEN",
    note: "The raw point difference between your result and BEN's, summed across the boards — simplest to read, harshest on one bad board.",
  },
];

/**
 * The table controls a creator may force on or off for this challenge, keyed by
 * their ACCESS-CATALOGUE key so a draft authored here means the same thing on
 * the platform. Undo and show-all-hands default to `hide`: this is scored play.
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

/** The checklist's non-`default` cells — what actually gets stored. */
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

/** The state of the two controls the PLAYER actually reads off the draft. */
export function tableControls(overrides: Record<string, ControlOverride> | undefined): {
  showAllHands: boolean;
} {
  return { showAllHands: overrides?.["table.hands_view"] === "show" };
}

export interface ChallengeBoardDraft {
  boardNo: number;
  /** The deal seed — `seededDeal(seed)` reproduces the pack exactly. */
  seed: number;
  dealer: Seat;
  humanSeat: Seat;
  /**
   * The board's OWN vulnerability. Omitted, it follows the standard cycle for
   * its position. A board imported from a BBO link brings its own, because
   * vulnerability is part of the deal that was imported.
   */
  vul?: Vul;
  /** Set once the creator hand-edited this board: ♠.♥.♦.♣ text per seat. */
  pack?: Record<Seat, string>;
}

/**
 * The stored draft. This IS the block's content in a host that persists one —
 * a plain JSON object with no ids, no timestamps and no user in it.
 */
export interface SoloChallengeDraft {
  title: string;
  description: string;
  /** Absent is tolerated and MEANS `full`, exactly as on the platform. */
  format?: ChallengeFormat;
  /** Ignored by a bidding-only challenge, but carried so switching back
   *  restores the creator's choice rather than silently resetting it. */
  scoring: ChallengeScoring;
  boards: ChallengeBoardDraft[];
  controlOverrides: Record<string, ControlOverride>;
}

const SEAT_SET = new Set<string>(SEATS);
const VUL_SET = new Set<string>(Object.keys(VUL_LABEL));
const FORMATS = new Set<string>(FORMAT_OPTIONS.map((f) => f.key));
const SCORINGS = new Set<string>(SCORING_OPTIONS.map((s) => s.key));
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
 * it to keep the Create button honest; a host that stores drafts should run it
 * again on the way back in, because a stored blob is never the authority.
 */
export function validateDraft(draft: SoloChallengeDraft): string[] {
  const errors: string[] = [];
  const title = draft.title.trim();
  if (!title) errors.push("Give the challenge a title.");
  if (title.length > TITLE_MAX) errors.push(`Titles are at most ${TITLE_MAX} characters.`);
  if (draft.description.trim().length > DESCRIPTION_MAX)
    errors.push(`Descriptions are at most ${DESCRIPTION_MAX} characters.`);
  if (draft.format !== undefined && !FORMATS.has(draft.format))
    errors.push("Pick whether the board is bid and played, or bidding only.");
  if (!SCORINGS.has(draft.scoring)) errors.push("Pick a scoring method.");

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

  for (const [key, value] of Object.entries(draft.controlOverrides ?? {})) {
    if (!CONTROL_KEYS.has(key)) errors.push(`"${key}" is not a table control.`);
    else if (value !== "show" && value !== "hide")
      errors.push(`"${key}" must be shown or hidden.`);
  }
  return errors;
}

/**
 * WHAT A HOST IS ALLOWED TO HAND IN. A draft that has been through JSON — a
 * tutorial block's content, a database column — is a plain object until
 * something checks it, so the components take one and run `normalizeDraft`
 * themselves rather than asking every host to prove the shape first.
 */
export type ChallengeDraftInput = SoloChallengeDraft | object;

/**
 * A stored blob read back as a draft, with every gap filled by the default the
 * wizard would have given it. A host persists JSON, and JSON that came from an
 * older version of this component must still open.
 */
export function normalizeDraft(raw: unknown): SoloChallengeDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Partial<SoloChallengeDraft>;
  if (!Array.isArray(d.boards) || d.boards.length === 0) return null;
  const boards = d.boards.slice(0, MAX_BOARDS).map((b, i) => ({
    boardNo: i + 1,
    seed: Number.isInteger(b?.seed) ? b.seed : 1,
    dealer: SEAT_SET.has(b?.dealer as string) ? b.dealer : "N",
    humanSeat: SEAT_SET.has(b?.humanSeat as string) ? b.humanSeat : "S",
    ...(b?.vul && VUL_SET.has(b.vul) ? { vul: b.vul } : {}),
    ...(b?.pack ? { pack: b.pack } : {}),
  })) as ChallengeBoardDraft[];
  return {
    title: typeof d.title === "string" ? d.title : "",
    description: typeof d.description === "string" ? d.description : "",
    ...(d.format === "bidding-only" || d.format === "full" ? { format: d.format } : {}),
    scoring: SCORINGS.has(d.scoring as string) ? (d.scoring as ChallengeScoring) : "imps",
    boards,
    controlOverrides:
      d.controlOverrides && typeof d.controlOverrides === "object" ? d.controlOverrides : {},
  };
}

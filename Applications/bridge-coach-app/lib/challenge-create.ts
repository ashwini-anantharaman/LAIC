// Creating a challenge — native client for POST /api/bridge/challenges and
// its invite directory (M3f of the webview→native migration). The draft
// shape mirrors the platform's ChallengeDraft (app/bridge/challenges/draft.ts)
// — the server re-validates with the same shared rules, so errors come back
// as its exact sentences.

import { bridgeRequest } from "./bridge-api";
import type { Seat } from "./plays";

export type ChallengeFormat = "full" | "bidding-only";
export type ChallengeScoring = "imps" | "mp" | "total";
export type StandingsVisibility = "after-finish" | "always";
/** Who the robots are: the double dummy solver (instant, exact) or BEN. */
export type ChallengeEngine = "dd" | "ben";
export type Vul = "none" | "ns" | "ew" | "both";

export type ChallengeBoardDraft = {
  boardNo: number;
  /** The deal seed — the server re-deals the identical pack from it. */
  seed: number;
  dealer: Seat;
  humanSeat: Seat;
  /** The board's own vulnerability; omitted, the standard cycle applies. */
  vul?: Vul;
};

export type ChallengeDraft = {
  title: string;
  description: string;
  format?: ChallengeFormat;
  scoring: ChallengeScoring;
  standingsVisibility: StandingsVisibility;
  boards: ChallengeBoardDraft[];
  controlOverrides: Record<string, "show" | "hide">;
  invites: { userId: string; moderator: boolean }[];
  editorBadge: boolean;
  /**
   * The robots. Omitted or "dd" seats the double dummy solver — a board in
   * seconds; "ben" seats the neural engine, only offered where the server can
   * reach one (GET /api/bridge/me → engines.ben).
   */
  engine?: ChallengeEngine;
  /**
   * A PRIVATE TABLE — owned by the person who made it rather than a club, so it is
   * visible to exactly the people invited and appears on no club's list. Opt-in and
   * explicit: the server refuses an unowned challenge otherwise, precisely so that a
   * club's challenge cannot leak everywhere by accident.
   */
  personal?: boolean;
};

export type ChallengePerson = { userId: string; name: string; handle?: string };

export const MIN_BOARDS = 1;
export const MAX_BOARDS = 16;

/** Scored play defaults — hands stay hidden, no take-backs (the wizard's
 *  checklist defaults; the native wizard doesn't carry the checklist yet). */
export const DEFAULT_CONTROL_OVERRIDES: Record<string, "show" | "hide"> = {
  "table.hands_view": "hide",
  "table.undo": "hide",
};

export function fetchChallengePeople(
  token: string,
  programId: string,
): Promise<{ people: ChallengePerson[] }> {
  return bridgeRequest("/api/bridge/challenges/people", { token, programId });
}

export function createChallenge(
  token: string,
  programId: string,
  draft: ChallengeDraft,
  /** A parked draft this came from — the server promotes that row in place. */
  draftEntryId?: string,
): Promise<{ challengeId: string; title: string; invited: number }> {
  return bridgeRequest("/api/bridge/challenges", {
    token,
    programId,
    method: "POST",
    body: draftEntryId ? { ...draft, draftEntryId } : draft,
  });
}

// ── the club's parked drafts ─────────────────────────────────────────────────
// A challenge being built can be PARKED and picked up later — by anyone in the
// club who can create challenges, not just whoever parked it. The rows live in
// the platform's library (they also appear on the web library's Challenges
// shelf) and publishing promotes the row rather than leaving a stale draft.

export type ChallengeDraftRow = {
  entryId: string;
  title: string;
  boardCount: number;
  format: string;
  scoring: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export function fetchChallengeDrafts(
  token: string,
  programId: string,
): Promise<{ drafts: ChallengeDraftRow[] }> {
  return bridgeRequest("/api/bridge/challenges/drafts", { token, programId });
}

export function fetchChallengeDraft(
  token: string,
  programId: string,
  entryId: string,
): Promise<{ entryId: string; title: string; draft: ChallengeDraft }> {
  return bridgeRequest(`/api/bridge/challenges/drafts/${encodeURIComponent(entryId)}`, {
    token,
    programId,
  });
}

export function saveChallengeDraft(
  token: string,
  programId: string,
  draft: ChallengeDraft,
  entryId?: string,
): Promise<{ entryId: string }> {
  return bridgeRequest("/api/bridge/challenges/drafts", {
    token,
    programId,
    method: "POST",
    body: entryId ? { draft, entryId } : { draft },
  });
}

export function deleteChallengeDraft(
  token: string,
  programId: string,
  entryId: string,
): Promise<{ deleted: boolean }> {
  return bridgeRequest(`/api/bridge/challenges/drafts/${encodeURIComponent(entryId)}`, {
    token,
    programId,
    method: "DELETE",
  });
}

// ── the table-controls checklist (platform 03 · Table controls) ─────────────
// Keys are the platform access catalogue's own; the override layer is applied
// over the catalogue at the table. Undo and show-all-hands default to hide:
// this is scored play.

export type ControlState = "default" | "show" | "hide";

export const CHALLENGE_CONTROLS: readonly {
  key: string;
  label: string;
  sub: string;
  def: ControlState;
}[] = [
  { key: "table.hands_view", label: "Show all four hands", sub: "Scored play hides them", def: "hide" },
  { key: "table.undo", label: "Undo", sub: "Scored play — no take-backs", def: "hide" },
  { key: "table.claim", label: "Claim", sub: "Concede the rest of the tricks", def: "default" },
  { key: "table.seats_panel", label: "Seats", sub: "Who sits each seat", def: "default" },
  { key: "table.step_controls", label: "Pause / Step", sub: "Halt and step the robots", def: "default" },
  { key: "table.settings_menu", label: "☰ Menu", sub: "Table settings sheet", def: "default" },
  { key: "table.coach", label: "Coach", sub: "Commentary panel", def: "default" },
];

export function defaultControlStates(): Record<string, ControlState> {
  const out: Record<string, ControlState> = {};
  for (const c of CHALLENGE_CONTROLS) out[c.key] = c.def;
  return out;
}

/** The checklist's non-default cells — what the draft actually carries. */
export function controlOverridesOf(
  states: Record<string, ControlState>,
): Record<string, "show" | "hide"> {
  const out: Record<string, "show" | "hide"> = {};
  for (const c of CHALLENGE_CONTROLS) {
    const st = states[c.key];
    if (st === "show" || st === "hide") out[c.key] = st;
  }
  return out;
}

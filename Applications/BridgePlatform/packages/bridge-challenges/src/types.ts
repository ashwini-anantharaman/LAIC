// Challenges v1 domain model (docs/challenges-v1-spec.md §4 + ADDENDUM A).
// A challenge is 1–16 boards that every participant plays from the SAME seat
// against BEN, plus a silent full-BEN reference line; finished players get a
// leaderboard and side-by-side comparisons. Six record kinds live here — the
// challenge, its boards, its invites, the per-(board,user) plays, the BEN
// baselines, and the BEN decision cache that makes the opposition identical
// for identical lines.
//
// Types only (plus a handful of pure derivations): NO node:fs, NO IO. The
// @bridge/events import is type-only, so nothing of the event bus is pulled
// into a browser bundle.

import type { Call, Card, Contract, Seat, Vul } from "@bridge/events";

// ── the challenge ───────────────────────────────────────────────────────────

/** How a board is scored against the field. Creator picks one at create. */
export type ChallengeScoring = "imps" | "mp" | "total";

/**
 * WHAT A BOARD ASKS OF THE PARTICIPANT (owner, 2026-08-10).
 *
 * - `full` — the v1 board: bid it, play all thirteen tricks, score it against
 *   the field in the challenge's `scoring` mode.
 * - `bidding-only` — **the board ends when the auction ends.** No cards are
 *   played and there is no play score; the result is the contract the learner
 *   reached, set beside the contract BEN reached on the same deal.
 *
 * Omitted on every record written before the option existed, and omitted MEANS
 * `full` — so nothing stored changes and no migration is owed (the whole
 * record lives in one `record jsonb` column, db/migrations/0027_challenges.sql).
 * Read it through `challengeFormat`, never by touching the field.
 */
export type ChallengeFormat = "full" | "bidding-only" | "puzzle";

/** Which robot fills a challenge's non-human seats. */
export type ChallengeEngine = "ben" | "dd";

/** Open (playable) or archived by the creator. No deadline in v1. */
export type ChallengeStatus = "open" | "archived";

/**
 * When standings/comparisons unlock (ADDENDUM A3). `after-finish` is the
 * spoiler-safe default; `always` opens them to everyone from the start.
 */
export type StandingsVisibility = "after-finish" | "always";

export interface Challenge {
  challengeId: string;
  title: string;
  description?: string;
  scoring: ChallengeScoring;
  /** Nexus org-scoped profile id of the creator. Also an auto-accepted invite. */
  createdBy: string;
  createdByName?: string;
  status: ChallengeStatus;
  /**
   * What a board asks for. Absent = `full`, which is what every challenge
   * created before the option existed is. See `ChallengeFormat`.
   */
  format?: ChallengeFormat;
  /**
   * The opposition. Absent = `ben`, which is what every challenge created
   * before the solver existed faced.
   *
   * IT IS STAMPED ON THE CHALLENGE, not decided per board, and that is the
   * whole point: a contest is only fair if everyone meets the same opponents,
   * so a challenge already under way must never switch engines because the
   * platform default moved. New challenges get `dd`, which plays a board in
   * seconds instead of minutes.
   */
  engine?: ChallengeEngine;
  /**
   * When the first participant STARTED a board. Set once; from then on boards,
   * seats and control overrides are frozen (invites stay addable forever).
   */
  lockedAt?: string;
  /**
   * True once the creator has OPENED the pack editor on any board — they have
   * seen hands, so their leaderboard row carries the `<>` editor mark. Set on
   * open, not on modification (spec §3).
   */
  editorBadge: boolean;
  standingsVisibility: StandingsVisibility;
  createdAt: string;
  /**
   * WHICH CLUB OWNS THIS (0029). The Nexus program uuid of the club it was created
   * in, and the whole of what keeps two clubs' challenges apart: a member of both
   * has ONE nexusUserId, so invites alone cannot separate them.
   *
   * Undefined/null means UNSCOPED — visible to anyone invited, wherever they are,
   * which is the cross-org case the spec's "platform-wide invites" described. The
   * read path treats it as a wildcard, so a create that cannot resolve a program
   * refuses instead of storing null.
   *
   * Optional because every challenge written before 0029 lacks it.
   */
  nexusProgramId?: string | null;
  /**
   * Whose kind of thing this is. Written as "program" today and NOT READ — it is
   * here so individually-owned challenges need no migration later. Same vocabulary
   * as library-core's ScopeLevel, mirrored rather than imported: this package does
   * not otherwise depend on library-core, and a three-member string union is not
   * worth a dependency edge.
   */
  scopeLevel?: ChallengeScopeLevel | null;
}

/** Mirrors `ScopeLevel` in packages/library-core/src/types.ts — keep them in step. */
export type ChallengeScopeLevel = "user" | "program" | "org";

/**
 * May this challenge be seen from `scope`?
 *
 * ONE definition, because it is enforced twice: as SQL in the Postgres store and in
 * `matchesChallenge` for the JSON dev store. Two hand-written copies of a
 * visibility rule is how they drift, and only a live check catches the SQL arm.
 *
 * Unscoped challenges (no owner) pass everywhere — see `nexusProgramId`. A caller
 * with no scope of its own sees everything, which is what the dev store and any
 * unscoped internal read expect.
 */
export function challengeVisibleInScope(
  challenge: Pick<Challenge, "nexusProgramId" | "scopeLevel">,
  scope: string | null | undefined,
): boolean {
  // A PERSONAL challenge (a private table between friends) belongs to nobody's club.
  // Its owner is null like a legacy row's, but the two must not be confused: the
  // legacy null is fail-open on purpose — the cross-org door 0029's header describes
  // — whereas a private table appearing on every club's list is exactly what makes
  // it not private. `scope_level` is what separates them, and this is the first
  // thing to read it.
  if (challenge.scopeLevel === "user") return !scope;
  if (!scope) return true;
  const owner = challenge.nexusProgramId;
  return !owner || owner === scope;
}

/** True when boards/seats/control overrides may still be edited (spec §2). */
export function challengeIsEditable(challenge: Challenge): boolean {
  return challenge.status === "open" && !challenge.lockedAt;
}

/**
 * The challenge's format, defaulted. THE ONLY legitimate way to ask what a
 * board asks for: a stored record may carry no `format` at all, and that is
 * not a missing value — it is `full`.
 */
export function challengeFormat(challenge: Pick<Challenge, "format">): ChallengeFormat {
  return challenge.format === "bidding-only" || challenge.format === "puzzle"
    ? challenge.format
    : "full";
}

/**
 * The challenge's engine, defaulted. THE ONLY legitimate way to ask who the
 * robots are: a stored record may carry no `engine` at all, and that is not a
 * missing value — it is `ben`, the only engine that existed when it was made.
 */
export function challengeEngine(challenge: Pick<Challenge, "engine">): ChallengeEngine {
  return challenge.engine === "dd" ? "dd" : "ben";
}

/** True when the board ends with the auction and nobody plays a card. */
export function isBiddingOnly(challenge: Pick<Challenge, "format">): boolean {
  return challengeFormat(challenge) === "bidding-only";
}

/**
 * WHEN AN ATTEMPT IS OVER, in one place.
 *
 * A full board is over when the last trick has resolved. A BIDDING-ONLY board
 * is over the moment the auction closes (owner, 2026-08-10): the engine's
 * `play` phase belongs to nobody there — no participant and no robot will ever
 * enter it — so `auction → done` is the whole life of the board. A passed-out
 * board reaches `complete` straight from the auction and satisfies both.
 *
 * It lives in this client-safe package because THREE surfaces must agree: the
 * server-side freeze, the table deciding whether the felt should still invite a
 * card, and the embedded solo player, which has no server at all.
 */
export function challengeBoardIsOver(
  phase: "auction" | "play" | "complete",
  biddingOnly: boolean,
): boolean {
  return biddingOnly ? phase !== "auction" : phase === "complete";
}

// ── boards ──────────────────────────────────────────────────────────────────

/** Board count bounds — the create wizard's board-count step (spec §1). */
export const MIN_BOARDS = 1;
export const MAX_BOARDS = 16;

/** A per-challenge override of one table control, in either direction. */
export type ControlOverride = "show" | "hide";

/**
 * The seat occupants of one board. v1 is always one user plus BEN in the other
 * three seats, but the SHAPE must not assume that (ADDENDUM A6) — live
 * human-vs-human tables slot in later by changing only the participant list.
 */
export interface BoardParticipant {
  seat: Seat;
  kind: "user" | "ben";
  /** Set for `kind: "user"`; the Nexus org-scoped profile id. */
  userId?: string;
}

export interface ChallengeBoard {
  challengeId: string;
  /** 1-based position in the challenge (1…MAX_BOARDS). */
  boardNo: number;
  /** The four hands, per seat — the frozen pack every participant plays. */
  pack: Record<Seat, Card[]>;
  dealer: Seat;
  vul: Vul;
  /** The seat EVERY participant sits in on this board (default South). */
  humanSeat: Seat;
  /** Access-catalogue key -> forced visibility, applied after catalogue checks. */
  controlOverrides: Record<string, ControlOverride>;
  /**
   * Explicit seat plan. Omitted = the v1 default (the viewer at `humanSeat`,
   * BEN elsewhere) — read it through `boardParticipants`, never by assuming.
   */
  participants?: BoardParticipant[];
  /**
   * Present exactly when the challenge's format is "puzzle": the frozen
   * position, the brief, and the authored answer. Additive jsonb, like every
   * field before it.
   */
  puzzle?: BoardPuzzle;
}

// ── puzzles ─────────────────────────────────────────────────────────────────
// A PUZZLE is a board frozen mid-story (owner, 2026-08-19; the Frank Stewart
// column shape): a position with history already on the table, a brief saying
// what to solve for, and an authored ANSWER revealed after the attempt. The
// KIND is derived from the position itself rather than stored beside it: an
// unfinished auction means the learner's one call IS the answer (a bidding
// puzzle); a settled auction means the rest of the board is played out against
// the solver toward a goal (a play puzzle). One field fewer to disagree.

export interface BoardPuzzle {
  /** Calls already made, in order from the dealer. */
  auction: { seat: Seat; call: Call }[];
  /** Cards already played, in play order (empty for a bidding puzzle). */
  play: { seat: Seat; card: Card }[];
  /** What to solve for — shown at the table before the first decision. */
  brief: string;
  solution: PuzzleSolution;
  /** The column's ANSWER paragraph — revealed once the attempt is over. */
  explanation: string;
}

export type PuzzleSolution =
  /** Bidding puzzle: the one correct call. */
  | { kind: "call"; call: Call }
  /**
   * Play puzzle: the goal. `tricks` omitted means "make the contract" — the
   * target derives from the contract level at grading time.
   */
  | { kind: "goal"; tricks?: number };

/**
 * Is this prefix a finished auction? Mirrors the engine's auctionComplete —
 * duplicated here for the same reason SEAT_ORDER mirrors SEATS: this package
 * deliberately depends on nothing but @bridge/events, because the embedded
 * solo player and the server must both read it.
 */
export function puzzleAuctionSettled(calls: readonly { call: Call }[]): boolean {
  if (calls.length < 4) return false;
  return calls.slice(-3).every((c) => c.call === "P");
}

/** The kind, derived from the position: see BoardPuzzle. */
export function puzzleKind(puzzle: Pick<BoardPuzzle, "auction">): "bidding" | "play" {
  return puzzleAuctionSettled(puzzle.auction) ? "play" : "bidding";
}

/**
 * A BIDDING puzzle is over the moment the learner has answered: the auction
 * grew past the authored prefix by one call. Play puzzles use
 * challengeBoardIsOver's ordinary full-board rule.
 */
export function puzzleBoardIsOver(
  puzzle: Pick<BoardPuzzle, "auction">,
  phase: "auction" | "play" | "complete",
  auctionLength: number,
): boolean {
  if (puzzleKind(puzzle) === "bidding")
    return auctionLength > puzzle.auction.length || phase !== "auction";
  return phase === "complete";
}

/** Grade a finished BIDDING puzzle: the call after the prefix, against the answer. */
export function gradeBiddingPuzzle(
  puzzle: Pick<BoardPuzzle, "auction" | "solution">,
  finalAuction: readonly { call: Call }[],
): boolean {
  if (puzzle.solution.kind !== "call") return false;
  const answered = finalAuction[puzzle.auction.length];
  return answered !== undefined && answered.call === puzzle.solution.call;
}

/**
 * Grade a finished PLAY puzzle from the declarer's side of the trick count.
 * `tricks` in the solution overrides the contract's own target (level + 6).
 */
export function gradePlayPuzzle(
  puzzle: Pick<BoardPuzzle, "solution">,
  contractLevel: number,
  declarerTricks: number,
): boolean {
  if (puzzle.solution.kind !== "goal") return false;
  const target = puzzle.solution.tricks ?? contractLevel + 6;
  return declarerTricks >= target;
}

/** Clockwise seat order, matching @bridge/events SEATS. */
export const SEAT_ORDER: readonly Seat[] = ["S", "W", "N", "E"];

/**
 * The board's seat plan with the user slot(s) bound to `userId`. Falls back to
 * the v1 default — viewer at `humanSeat`, BEN in every other seat — when the
 * board carries no explicit plan. Callers must go through this rather than
 * hardcoding "three BEN opponents" (ADDENDUM A6).
 */
export function boardParticipants(
  board: Pick<ChallengeBoard, "humanSeat" | "participants">,
  userId: string,
): BoardParticipant[] {
  const plan =
    board.participants && board.participants.length
      ? board.participants
      : SEAT_ORDER.map<BoardParticipant>((seat) => ({
          seat,
          kind: seat === board.humanSeat ? "user" : "ben",
        }));
  return plan.map((p) => (p.kind === "user" ? { ...p, userId: p.userId ?? userId } : { ...p }));
}

/** Dealer for a board in the standard cycle: board 1 North, then E, S, W. */
export function standardDealer(boardNo: number): Seat {
  const cycle: readonly Seat[] = ["N", "E", "S", "W"];
  return cycle[(boardNo - 1) % 4] as Seat;
}

/** Vulnerability for a board in the standard 16-board cycle. */
export function standardVul(boardNo: number): Vul {
  const cycle: readonly Vul[] = [
    "none", "ns", "ew", "both",
    "ns", "ew", "both", "none",
    "ew", "both", "none", "ns",
    "both", "none", "ns", "ew",
  ];
  return cycle[(boardNo - 1) % 16] as Vul;
}

// ── invites ─────────────────────────────────────────────────────────────────

export type InviteStatus = "pending" | "accepted" | "declined";

export interface ChallengeInvite {
  challengeId: string;
  /** Invitee — platform-wide, so cross-org by design (spec §2). */
  userId: string;
  userName?: string;
  status: InviteStatus;
  /**
   * Moderators see standings/comparisons at any time (ADDENDUM A2). The
   * creator's row is always true. A competing moderator's leaderboard row
   * carries the MOD mark so early sight is never invisible to the field.
   */
  moderator: boolean;
  invitedBy: string;
  invitedAt: string;
  /** When the invitee accepted or declined. */
  respondedAt?: string;
}

// ── plays ───────────────────────────────────────────────────────────────────

export type PlayStatus = "in_progress" | "completed";

/**
 * A frozen, render-ready picture of one line of play — the same shape as
 * @bridge/sessions `SubmissionBoard` (spec §4: "reuse the submissions freeze
 * pattern verbatim"), restated here so the client-safe barrel carries no
 * dependency on the session package.
 */
export interface ChallengeSnapshot {
  name: string;
  dealer: Seat;
  vul: Vul;
  hands: Record<Seat, Card[]>;
  auction: { seat: Seat; call: Call }[];
  play: { seat: Seat; card: Card }[];
  contractLabel?: string;
  resultLabel?: string;
  /**
   * The contract the auction produced, STRUCTURED — `null` when the board was
   * passed out. `contractLabel` is what gets printed; this is what gets
   * compared, because the label is a display string and two freeze sites are
   * free to format one differently. A bidding-only board always carries it:
   * the contract IS its result.
   *
   * Absent on lines frozen before the field existed. Those are full boards,
   * whose result is a raw score, so nothing reads it there.
   */
  contract?: Contract | null;
}

export interface ChallengePlay {
  challengeId: string;
  boardNo: number;
  userId: string;
  /** The sitting this attempt runs in. One attempt: resume, never restart. */
  sessionId: string;
  status: PlayStatus;
  /** Frozen on completion; absent while in progress. */
  snapshot?: ChallengeSnapshot;
  /**
   * Duplicate raw score FROM THE PARTICIPANT'S SIDE (positive = good for the
   * human), i.e. `scoreBoard(...).nsScore` signed for the board's humanSeat.
   * Because every participant plays the same seat, raw scores compare directly.
   */
  rawScore?: number;
  /**
   * A PUZZLE board's verdict, graded once at the freeze where the final state
   * is in hand — the moment the answer was given (bidding) or the last trick
   * fell (play). Absent on every non-puzzle board.
   */
  puzzleSolved?: boolean;
  startedAt: string;
  completedAt?: string;
}

// ── BEN baselines ───────────────────────────────────────────────────────────

/**
 * `full_ben` — BEN's own auction and play of the board (silent, per challenge).
 * `your_contract` — BEN adopts a user's auction verbatim and plays their seat.
 * `from_point` — the user's history is frozen to `ply`; BEN plays their seat on.
 */
export type BaselineKind = "full_ben" | "your_contract" | "from_point";

export type BaselineStatus = "pending" | "ready" | "failed";

/** Identity of one baseline: (challenge, board, kind) plus user/ply for the
 *  on-demand kinds. */
export interface BaselineKey {
  challengeId: string;
  boardNo: number;
  kind: BaselineKind;
  /** Required for `your_contract` and `from_point`. */
  userId?: string;
  /** Required for `from_point` — the ply of MY line the fork happens at. */
  ply?: number;
}

export interface ChallengeBaseline extends BaselineKey {
  status: BaselineStatus;
  /** Present once `status === "ready"`. */
  snapshot?: ChallengeSnapshot;
  /** Same convention as ChallengePlay.rawScore — the board's humanSeat side. */
  rawScore?: number;
  /** Why a `failed` baseline failed; surfaced as a retry affordance. */
  error?: string;
  createdAt: string;
  updatedAt?: string;
}

/** Stable single-string id for a baseline — the JSON dedupe key and the Pg
 *  primary key. */
export function baselineId(key: BaselineKey): string {
  return [key.challengeId, key.boardNo, key.kind, key.userId ?? "", key.ply ?? ""].join("|");
}

// ── BEN decision cache ──────────────────────────────────────────────────────

/** One cached BEN decision: a call during the auction or a card during play. */
export type BenDecisionPayload =
  | { kind: "call"; seat: Seat; call: Call }
  | { kind: "card"; seat: Seat; card: Card };

/**
 * The fairness cache (spec §3). Keyed by (challenge, board, history hash):
 * every participant reaching the same position meets the same BEN decision, so
 * identical lines face identical opposition BY CONSTRUCTION, and repeat
 * positions cost zero BEN calls.
 */
export interface BenDecision {
  challengeId: string;
  boardNo: number;
  historyHash: string;
  decision: BenDecisionPayload;
  createdAt: string;
}

/**
 * The canonical, human-readable serialization of a position: dealer, the calls
 * so far, then the cards so far. Deterministic — the same position always
 * produces the same string.
 */
export function benHistoryKey(input: {
  dealer: Seat;
  auction: readonly { seat: Seat; call: Call }[];
  play: readonly { seat: Seat; card: Card }[];
}): string {
  const auction = input.auction.map((a) => `${a.seat}${a.call}`).join(",");
  const play = input.play.map((p) => `${p.seat}${p.card.suit}${p.card.rank}`).join(",");
  return `${input.dealer}/${auction}/${play}`;
}

/**
 * A short, stable hash of `benHistoryKey` — FNV-1a, so it needs no crypto
 * import and stays client-safe. Collision risk is irrelevant here: the key is
 * already scoped to one (challenge, board), a space of at most a few thousand
 * positions.
 */
export function benHistoryHash(input: {
  dealer: Seat;
  auction: readonly { seat: Seat; call: Call }[];
  play: readonly { seat: Seat; card: Card }[];
}): string {
  const s = benHistoryKey(input);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16).padStart(8, "0")}${s.length.toString(16)}`;
}

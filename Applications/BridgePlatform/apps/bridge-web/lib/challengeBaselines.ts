// CHALLENGE BASELINES — the BEN reference lines a comparison is drawn against
// (spec §2 "BEN baseline" / "Compare from this point", §4, ADDENDUM A5).
//
// Three kinds, all on-demand, all write-through cached in
// `bridge_challenge_baselines`:
//
//   full_ben       BEN bids AND plays the whole board in all four seats. One
//                  per (challenge, board). Kicked off in the background at
//                  create; repaired lazily the first time anything needs it.
//   your_contract  BEN adopts ONE user's auction verbatim, then plays the
//                  cards out — "what BEN would have made of your contract".
//   from_point     the user's own line frozen to `ply`, then BEN plays their
//                  seat forward. The opponents replay from the decision cache,
//                  so the fork meets the same opposition the user did.
//
// EVERY decision goes through `challengeBenDecision` (lib/challengeBen), which
// means two things that matter here:
//
//   · FAIRNESS — a baseline meets exactly the opposition every participant
//     meets on that line, because they read the same cache.
//   · RESUMABILITY — BEN takes ~1.5 s per call to bid but ~21 s per card, so a
//     52-card board CANNOT finish inside one serverless invocation. Each
//     invocation therefore runs to a wall-clock budget and stops; the record
//     stays `pending`, and the next invocation replays the settled part from
//     the cache in milliseconds and continues where it left off. Nothing is
//     recomputed, nothing is fabricated, and no unit of work exceeds the
//     function limit (spec §10).
//
// A baseline that cannot be produced is recorded `failed` WITH THE REASON. It
// is never faked, and never quietly filled in from the KB player — the house
// player is shelved for challenges.
//
// SERVER-ONLY.

import {
  baselineId,
  type BaselineKey,
  type ChallengeBaseline,
  type ChallengeBoard,
  type ChallengeSnapshot,
  type ChallengeStore,
} from "@bridge/challenges";
import {
  applyEvent,
  initialState,
  legalCalls,
  legalPlays,
  resultLabel,
  scoreBoard,
  type GameState,
} from "@bridge/engine";
import {
  contractLabel,
  type ActionEvent,
  type Call,
  type Card,
  type Seat,
} from "@bridge/events";
import { challengeBenDecision, isBenUnavailable, type ChallengeBenDeps } from "./challengeBen";
import { challengeStore } from "./challenges";

// ── inputs the caller got wrong (never cached as a failure) ─────────────────

/**
 * A baseline was asked for that cannot exist YET or AT ALL: no such board, the
 * user has not finished the board, a ply outside their line. Distinct from a
 * BEN failure — nothing is written, and the route answers 400/404.
 */
export class BaselineInputError extends Error {
  readonly code = "baseline_input";
  constructor(message: string) {
    super(message);
    this.name = "BaselineInputError";
  }
}

// ── options + result ────────────────────────────────────────────────────────

/**
 * Wall-clock budget for ONE invocation. BEN's measured latencies (/bid ~1.5 s,
 * /lead ~42 s, /play ~21 s) put a full board well past any function limit, so
 * the budget is a stopping rule, not a timeout: work already done is cached.
 * Overridable per call and by `CHALLENGE_BASELINE_BUDGET_MS`. Even a hard kill
 * (a BEN call started just under the deadline and overrunning the function
 * limit) is safe: the record was marked `pending` before the playout began and
 * only the single in-flight decision is lost.
 */
export const DEFAULT_BASELINE_BUDGET_MS = 240_000;

/** Hard stop on a runaway loop — a legal board is at most ~90 actions. */
const MAX_ACTIONS = 400;

export interface BaselineRunOptions extends ChallengeBenDeps {
  /** Stop and leave the baseline `pending` after this long. */
  budgetMs?: number;
  /** Recompute even if a `ready` baseline exists (explicit repair). */
  force?: boolean;
}

export interface BaselineResult {
  baseline: ChallengeBaseline;
  /** Actions committed in THIS invocation (0 when served from the store). */
  actions: number;
  /** BEN calls made in THIS invocation — cache misses only. */
  benCalls: number;
  /** True when the budget ran out mid-board: call again to continue. */
  resumable: boolean;
}

function baselineBudget(opts?: BaselineRunOptions): number {
  return (
    opts?.budgetMs ??
    (Number(process.env.CHALLENGE_BASELINE_BUDGET_MS || "") || DEFAULT_BASELINE_BUDGET_MS)
  );
}

function nowIso(opts?: BaselineRunOptions): string {
  return (opts?.now ?? (() => new Date().toISOString()))();
}

// ── the timeline: what "ply" means ──────────────────────────────────────────

/**
 * A line of play as ONE ordered list — every call, then every card. This is
 * the timeline the comparison view scrubs, and `ply` everywhere in this module
 * (and in `from_point` baselines) is an index into it: `ply` = how many of the
 * user's own actions are kept before BEN takes over. `ply: 0` forks before the
 * first call; `ply: timelineLength(...)` keeps the entire line.
 */
export type TimelineStep =
  | { kind: "call"; seat: Seat; call: Call }
  | { kind: "card"; seat: Seat; card: Card };

export function challengeTimeline(
  snapshot: Pick<ChallengeSnapshot, "auction" | "play">,
): TimelineStep[] {
  return [
    ...snapshot.auction.map<TimelineStep>((a) => ({ kind: "call", seat: a.seat, call: a.call })),
    ...snapshot.play.map<TimelineStep>((p) => ({ kind: "card", seat: p.seat, card: p.card })),
  ];
}

export function timelineLength(snapshot: Pick<ChallengeSnapshot, "auction" | "play">): number {
  return snapshot.auction.length + snapshot.play.length;
}

/** The first `ply` steps of a line, split back into an auction and a play. */
export function frozenPrefix(
  snapshot: Pick<ChallengeSnapshot, "auction" | "play">,
  ply: number,
): { auction: { seat: Seat; call: Call }[]; play: { seat: Seat; card: Card }[] } {
  const total = timelineLength(snapshot);
  if (!Number.isInteger(ply) || ply < 0 || ply > total)
    throw new BaselineInputError(`ply ${ply} is outside this line (0…${total})`);
  const steps = challengeTimeline(snapshot).slice(0, ply);
  return {
    auction: steps
      .filter((s): s is Extract<TimelineStep, { kind: "call" }> => s.kind === "call")
      .map((s) => ({ seat: s.seat, call: s.call })),
    play: steps
      .filter((s): s is Extract<TimelineStep, { kind: "card" }> => s.kind === "card")
      .map((s) => ({ seat: s.seat, card: s.card })),
  };
}

// ── the playout ─────────────────────────────────────────────────────────────

function actionEvent(state: GameState, step: TimelineStep, seq: number): ActionEvent {
  const base = { seq, ts: 0, boardRef: state.boardRef, fallback: false } as const;
  return step.kind === "call"
    ? { ...base, category: "bid-event", seat: step.seat, call: step.call }
    : { ...base, category: "play-event", seat: step.seat, card: step.card };
}

/** Replay a frozen prefix onto a fresh board, refusing anything illegal. */
function applyPrefix(
  state: GameState,
  prefix: { auction: { seat: Seat; call: Call }[]; play: { seat: Seat; card: Card }[] },
): GameState {
  let s = state;
  let seq = 0;
  for (const call of prefix.auction) {
    if (s.phase !== "auction" || s.turn !== call.seat)
      throw new BaselineInputError(
        `frozen auction does not fit the board: ${call.seat} cannot call at this point`,
      );
    if (!legalCalls(s.auction, call.seat).has(call.call))
      throw new BaselineInputError(`frozen auction has an illegal call ${call.call} by ${call.seat}`);
    s = applyEvent(s, actionEvent(s, { kind: "call", ...call }, seq++));
  }
  for (const played of prefix.play) {
    if (s.phase !== "play" || s.turn !== played.seat)
      throw new BaselineInputError(
        `frozen play does not fit the board: ${played.seat} cannot play at this point`,
      );
    if (!legalPlays(s, played.seat).some((c) => c.suit === played.card.suit && c.rank === played.card.rank))
      throw new BaselineInputError(
        `frozen play has an illegal card ${played.card.suit}${played.card.rank} by ${played.seat}`,
      );
    s = applyEvent(s, actionEvent(s, { kind: "card", ...played }, seq++));
  }
  return s;
}

interface PlayOutResult {
  state: GameState;
  actions: number;
  benCalls: number;
  timedOut: boolean;
}

/**
 * Fold the board forward with BEN in every remaining seat, through the cached
 * seam, until the board completes or the budget runs out. Nothing is written
 * here — the caller owns the baseline record.
 */
async function playOut(
  challengeId: string,
  board: ChallengeBoard,
  prefix: { auction: { seat: Seat; call: Call }[]; play: { seat: Seat; card: Card }[] },
  opts: BaselineRunOptions | undefined,
  deadline: number,
): Promise<PlayOutResult> {
  let state = applyPrefix(
    initialState(`ch_${challengeId}_b${board.boardNo}`, board.dealer, board.vul, board.pack),
    prefix,
  );

  let actions = 0;
  let benCalls = 0;
  let seq = prefix.auction.length + prefix.play.length;

  while (state.phase !== "complete") {
    if (Date.now() >= deadline) return { state, actions, benCalls, timedOut: true };
    if (actions >= MAX_ACTIONS)
      throw new Error(`baseline playout exceeded ${MAX_ACTIONS} actions — refusing to loop`);

    const seat = state.turn;
    const { decision, cached } = await challengeBenDecision({
      challengeId,
      boardNo: board.boardNo,
      state,
      seat,
      store: opts?.store,
      client: opts?.client,
      now: opts?.now,
    });
    if (!cached) benCalls++;

    const step: TimelineStep =
      decision.kind === "call"
        ? { kind: "call", seat, call: decision.call }
        : { kind: "card", seat, card: decision.card };
    state = applyEvent(state, actionEvent(state, step, seq++));
    actions++;
  }

  return { state, actions, benCalls, timedOut: false };
}

// ── freezing ────────────────────────────────────────────────────────────────

/**
 * The same frozen shape a completed PLAY records (spec §4: reuse the
 * submissions freeze pattern verbatim), so the comparison view renders a
 * baseline and a human line through one renderer.
 */
function freeze(name: string, board: ChallengeBoard, state: GameState): ChallengeSnapshot {
  const score = scoreBoard(state);
  return {
    name,
    dealer: board.dealer,
    vul: board.vul,
    hands: board.pack,
    auction: state.auction.map((a) => ({ seat: a.seat, call: a.call })),
    play: state.tricks.flatMap((t) => t.plays.map((p) => ({ seat: p.seat, card: p.card }))),
    contractLabel: state.contract ? contractLabel(state.contract) : undefined,
    resultLabel: score ? resultLabel(score) : undefined,
  };
}

/**
 * The board's raw score FROM THE PARTICIPANT'S SIDE — the same convention
 * `ChallengePlay.rawScore` uses, so a baseline and a play compare directly.
 */
function rawScoreFor(board: ChallengeBoard, state: GameState): number | undefined {
  const score = scoreBoard(state);
  if (!score) return undefined;
  return board.humanSeat === "N" || board.humanSeat === "S" ? score.nsScore : -score.nsScore;
}

// ── the store dance ─────────────────────────────────────────────────────────

async function readBaseline(
  store: ChallengeStore,
  key: BaselineKey,
): Promise<ChallengeBaseline | null> {
  try {
    return await store.getBaseline(key);
  } catch (e) {
    console.error(`[challenge-baseline] ${baselineId(key)} unreadable — recomputing`, e);
    return null;
  }
}

async function writeBaseline(
  store: ChallengeStore,
  baseline: ChallengeBaseline,
): Promise<ChallengeBaseline> {
  try {
    await store.putBaseline(baseline);
  } catch (e) {
    // A baseline that cannot be stored is still an honest answer for THIS
    // request; the next caller recomputes it (cheaply — the decisions cached).
    console.error(`[challenge-baseline] could not store ${baselineId(baseline)}`, e);
  }
  return baseline;
}

async function requireBoard(
  store: ChallengeStore,
  challengeId: string,
  boardNo: number,
): Promise<ChallengeBoard> {
  const board = await store.getBoard(challengeId, boardNo);
  if (!board) throw new BaselineInputError(`challenge ${challengeId} has no board ${boardNo}`);
  return board;
}

/**
 * The shared body of all three kinds: serve a ready baseline, otherwise mark
 * it pending, play it out to the budget, and write back ready / pending /
 * failed with an honest note.
 */
async function ensureBaseline(
  key: BaselineKey,
  name: string,
  prefixFor: (board: ChallengeBoard) => Promise<{
    auction: { seat: Seat; call: Call }[];
    play: { seat: Seat; card: Card }[];
  }>,
  opts?: BaselineRunOptions,
): Promise<BaselineResult> {
  const store = opts?.store ?? challengeStore();
  const existing = await readBaseline(store, key);
  if (existing?.status === "ready" && !opts?.force)
    return { baseline: existing, actions: 0, benCalls: 0, resumable: false };

  const board = await requireBoard(store, key.challengeId, key.boardNo);
  const prefix = await prefixFor(board);
  const createdAt = existing?.createdAt ?? nowIso(opts);
  const deadline = Date.now() + baselineBudget(opts);

  // Say out loud that BEN is working on it — readers see "pending", not a hole.
  // (A concurrent worker on the same board is harmless: both replay the same
  // cached decisions and converge.)
  if (existing?.status !== "ready")
    await writeBaseline(store, {
      ...key,
      status: "pending",
      createdAt,
      updatedAt: nowIso(opts),
    });

  let out: PlayOutResult;
  try {
    out = await playOut(key.challengeId, board, prefix, opts, deadline);
  } catch (e) {
    if (!isBenUnavailable(e)) throw e;
    console.error(`[challenge-baseline] ${baselineId(key)} failed:`, e);
    const baseline = await writeBaseline(store, {
      ...key,
      status: "failed",
      error: (e as Error).message,
      createdAt,
      updatedAt: nowIso(opts),
    });
    return { baseline, actions: 0, benCalls: 0, resumable: false };
  }

  if (out.timedOut) {
    const done = out.state.auction.length + out.state.tricks.reduce((n, t) => n + t.plays.length, 0);
    const baseline = await writeBaseline(store, {
      ...key,
      status: "pending",
      // The type has one free-text slot; an interrupted baseline says so there
      // rather than pretending to be finished.
      error: `interrupted after ${done} actions — resumes from the BEN decision cache`,
      createdAt,
      updatedAt: nowIso(opts),
    });
    return { baseline, actions: out.actions, benCalls: out.benCalls, resumable: true };
  }

  const baseline = await writeBaseline(store, {
    ...key,
    status: "ready",
    snapshot: freeze(name, board, out.state),
    rawScore: rawScoreFor(board, out.state),
    createdAt,
    updatedAt: nowIso(opts),
  });
  return { baseline, actions: out.actions, benCalls: out.benCalls, resumable: false };
}

// ── the three baselines ─────────────────────────────────────────────────────

/**
 * (a) The silent reference line: BEN's OWN auction and play of the board, all
 * four seats. One per (challenge, board); computed in the background at create
 * and repaired lazily the first time a results view needs it. Idempotent —
 * calling it repeatedly is free once it is `ready`, and resumes it when it is
 * not.
 */
export async function ensureFullBenBaseline(
  challengeId: string,
  boardNo: number,
  opts?: BaselineRunOptions,
): Promise<BaselineResult> {
  return ensureBaseline(
    { challengeId, boardNo, kind: "full_ben" },
    `Board ${boardNo} — BEN`,
    async () => ({ auction: [], play: [] }),
    opts,
  );
}

/**
 * (b) "BEN in your contract": BEN adopts the user's auction VERBATIM and plays
 * the board out from there. Needs the user's completed play — the frozen
 * snapshot is the auction it adopts.
 */
export async function ensureYourContractBaseline(
  challengeId: string,
  boardNo: number,
  userId: string,
  opts?: BaselineRunOptions,
): Promise<BaselineResult> {
  return ensureBaseline(
    { challengeId, boardNo, kind: "your_contract", userId },
    `Board ${boardNo} — BEN in your contract`,
    async () => {
      const snapshot = await requireUserLine(challengeId, boardNo, userId, opts);
      return { auction: snapshot.auction, play: [] };
    },
    opts,
  );
}

/**
 * (c) "Compare from THIS point": the user's own line is frozen to `ply` (an
 * index into `challengeTimeline` — calls then cards) and BEN plays their seat
 * forward from there. The opponents are not re-decided in isolation: they come
 * from the decision cache, so the fork meets the opposition the user met until
 * the line actually diverges.
 */
export async function ensureFromPointBaseline(
  challengeId: string,
  boardNo: number,
  userId: string,
  ply: number,
  opts?: BaselineRunOptions,
): Promise<BaselineResult> {
  return ensureBaseline(
    { challengeId, boardNo, kind: "from_point", userId, ply },
    `Board ${boardNo} — BEN from ply ${ply}`,
    async () => {
      const snapshot = await requireUserLine(challengeId, boardNo, userId, opts);
      return frozenPrefix(snapshot, ply);
    },
    opts,
  );
}

/** The user's frozen line for this board, or an honest refusal. */
async function requireUserLine(
  challengeId: string,
  boardNo: number,
  userId: string,
  opts?: BaselineRunOptions,
): Promise<ChallengeSnapshot> {
  const store = opts?.store ?? challengeStore();
  const play = await store.getPlay(challengeId, boardNo, userId);
  if (!play || play.status !== "completed" || !play.snapshot)
    throw new BaselineInputError(
      `no completed play for ${userId} on board ${boardNo} — there is no line to compare against yet`,
    );
  return play.snapshot;
}

// ── what still needs computing (the background kick-off + lazy repair) ──────

/**
 * Boards whose full-BEN baseline is not `ready` yet, in board order. The
 * create-time kick-off walks this list one POST per board, and the results
 * view uses it to know what to repair. A `pending` board is included: pending
 * means "interrupted", and continuing it is exactly what should happen next.
 */
export async function pendingFullBenBoards(
  challengeId: string,
  opts?: { store?: ChallengeStore },
): Promise<number[]> {
  const store = opts?.store ?? challengeStore();
  const [boards, baselines] = await Promise.all([
    store.listBoards(challengeId),
    store.listBaselines(challengeId).catch(() => []),
  ]);
  const ready = new Set(
    baselines.filter((b) => b.kind === "full_ben" && b.status === "ready").map((b) => b.boardNo),
  );
  return boards.map((b) => b.boardNo).filter((n) => !ready.has(n));
}

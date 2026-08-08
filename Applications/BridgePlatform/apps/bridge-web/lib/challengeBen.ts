// The CHALLENGE BEN SEAM — every BEN decision inside a challenge goes through
// here, and every one of them is cached (spec §3, load-bearing fairness).
//
// WHY THIS EXISTS. BEN is a remote neural service whose determinism we do not
// control, but a challenge is duplicate bridge: everyone must meet the SAME
// opposition on the SAME line. So a decision is keyed by
// `(challengeId, boardNo, history-hash)` — the canonical serialization of
// dealer + calls-so-far + cards-so-far — and written to `bridge_ben_decisions`
// the first time it is made. Any participant (or baseline) reaching that exact
// position gets that exact decision back, for free. Divergent lines naturally
// get fresh answers; that is normal duplicate bridge.
//
// It is also the cost control (spec §10): a repeat position costs zero BEN
// calls, which is what makes the baselines RESUMABLE — a board interrupted
// half-way replays from the cache in milliseconds and only calls BEN for the
// tail it never reached.
//
// NO KB FALLBACK, ANYWHERE. The house player is shelved for challenges (spec
// §2). When BEN cannot answer — unreachable, timed out, illegal or unreadable
// answer — this throws `BenUnavailableError` so the caller can render "BEN is
// thinking… / retry". It never invents a call, and it never silently passes.
//
// CONCURRENCY. Two participants can hit the same fresh position at the same
// moment. In-process they share one in-flight BEN call; across processes both
// call BEN, then each re-reads the cache before writing and defers to whoever
// landed first. A duplicate write is an upsert, so the worst case is a
// last-write-wins on a row both sides agree exists — never a crash.
//
// SERVER-ONLY: reaches BEN_ENDPOINT and the challenge store. Never import from
// a client component.

import {
  benHistoryHash,
  benHistoryKey,
  type BenDecisionPayload,
  type ChallengeStore,
} from "@bridge/challenges";
import { legalCalls, legalPlays, type Decision, type GameState } from "@bridge/engine";
import { partnerOf, type Call, type Card, type Seat } from "@bridge/events";
import type { SeatDecider } from "@bridge/sessions";
import { auctionToCtx, handToPbn, vulToBen } from "./benchmark";
import {
  benAvailable,
  createBenTableClient,
  originalHand,
  parseBenCard,
  playedToBen,
  type BenTableClient,
} from "./benSeat";
import { challengeStore } from "./challenges";

// ── failure ─────────────────────────────────────────────────────────────────

/** Where a BEN failure happened — the retry affordance reads this. */
export type BenFailureStage = "config" | "bid" | "lead" | "play" | "phase";

/**
 * BEN could not answer. The ONLY failure mode of this module: there is no KB
 * fallback in challenges, so an unanswerable position surfaces as an error the
 * table renders as "BEN is thinking… / retry" and a baseline records as
 * `failed` with this message.
 */
export class BenUnavailableError extends Error {
  /** Structural marker — survives bundle boundaries where instanceof does not. */
  readonly code = "ben_unavailable";
  constructor(
    message: string,
    readonly stage: BenFailureStage,
    readonly seat?: Seat,
  ) {
    super(message);
    this.name = "BenUnavailableError";
  }
}

/** Type guard that works across bundles (checks the structural marker too). */
export function isBenUnavailable(e: unknown): e is BenUnavailableError {
  return (
    e instanceof BenUnavailableError ||
    (typeof e === "object" && e !== null && (e as { code?: string }).code === "ben_unavailable")
  );
}

/** Is a BEN endpoint configured at all? (No endpoint = no challenge play.) */
export function benConfigured(): boolean {
  return benAvailable();
}

// ── the cache key ───────────────────────────────────────────────────────────

/** Every card played so far, in play order — the second half of the key. */
function playsOf(state: Pick<GameState, "tricks">): { seat: Seat; card: Card }[] {
  return state.tricks.flatMap((t) => t.plays.map((p) => ({ seat: p.seat, card: p.card })));
}

/** The human-readable position key: `dealer/calls/cards` (spec §3). */
export function benPositionKey(state: Pick<GameState, "dealer" | "auction" | "tricks">): string {
  return benHistoryKey({ dealer: state.dealer, auction: state.auction, play: playsOf(state) });
}

/**
 * The stored `historyHash`. Scoped by (challengeId, boardNo) at the row level,
 * so it only has to separate positions WITHIN one board of one challenge.
 */
export function benPositionHash(state: Pick<GameState, "dealer" | "auction" | "tricks">): string {
  return benHistoryHash({ dealer: state.dealer, auction: state.auction, play: playsOf(state) });
}

// ── the seam ────────────────────────────────────────────────────────────────

export interface ChallengeBenDeps {
  /** Injectable for tests; defaults to the app's challenge store. */
  store?: ChallengeStore;
  /** Injectable for tests; defaults to a live client on BEN_ENDPOINT. */
  client?: BenTableClient;
  now?: () => string;
}

export interface ChallengePosition extends ChallengeBenDeps {
  challengeId: string;
  boardNo: number;
  /** The position to decide. `state.turn` is the seat to act unless overridden. */
  state: GameState;
  /** The seat whose action is wanted. Defaults to `state.turn`. */
  seat?: Seat;
}

export interface CachedBenDecision {
  decision: BenDecisionPayload;
  /** True when it came out of `bridge_ben_decisions` — no BEN call was made. */
  cached: boolean;
  /** The key it was stored under, for logging and the cost check. */
  historyHash: string;
}

/** In-process coalescing: one BEN call per position per server instance. */
const inFlight = new Map<string, Promise<CachedBenDecision>>();

function resolveStore(deps: ChallengeBenDeps): ChallengeStore {
  return deps.store ?? challengeStore();
}

function resolveClient(deps: ChallengeBenDeps): BenTableClient {
  if (deps.client) return deps.client;
  if (!benAvailable())
    throw new BenUnavailableError(
      "BEN_ENDPOINT is not configured on this server — challenges need BEN",
      "config",
    );
  return createBenTableClient();
}

/** Is a stored decision still playable at this position? (Cheap corruption guard.) */
function usableHere(state: GameState, seat: Seat, payload: BenDecisionPayload): boolean {
  if (payload.seat !== seat) return false;
  if (state.phase === "auction")
    return payload.kind === "call" && legalCalls(state.auction, seat).has(payload.call);
  if (state.phase === "play")
    return (
      payload.kind === "card" &&
      legalPlays(state, seat).some(
        (c) => c.suit === payload.card.suit && c.rank === payload.card.rank,
      )
    );
  return false;
}

/**
 * The one function the table and the baselines both call.
 *
 * Cache hit → the stored decision, zero BEN calls. Miss → BEN is asked once,
 * the answer is validated against the engine's own legality, written through,
 * and returned. Reads fail OPEN (a store hiccup costs a BEN call, not the
 * board); writes are best-effort (a failed write costs the next visitor a BEN
 * call, and is logged).
 */
export async function challengeBenDecision(
  position: ChallengePosition,
): Promise<CachedBenDecision> {
  const { challengeId, boardNo, state } = position;
  const seat = position.seat ?? state.turn;
  const historyHash = benPositionHash(state);
  const key = `${challengeId}|${boardNo}|${historyHash}`;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const run = (async (): Promise<CachedBenDecision> => {
    const store = resolveStore(position);

    const hit = await readDecision(store, challengeId, boardNo, historyHash);
    if (hit && usableHere(state, seat, hit)) return { decision: hit, cached: true, historyHash };
    if (hit)
      console.warn(
        `[challenge-ben] cached decision for ${key} is not playable here (${benPositionKey(state)}) — asking BEN again`,
      );

    const client = resolveClient(position);
    const fresh = await askBen(state, seat, client);

    // Someone may have landed the same position while BEN was thinking. Defer
    // to them: identical positions must yield ONE decision for everybody.
    const raced = await readDecision(store, challengeId, boardNo, historyHash);
    if (raced && usableHere(state, seat, raced))
      return { decision: raced, cached: true, historyHash };

    try {
      await store.putDecision({
        challengeId,
        boardNo,
        historyHash,
        decision: fresh,
        createdAt: (position.now ?? (() => new Date().toISOString()))(),
      });
    } catch (e) {
      // The decision is still honest; it just costs the next visitor a call.
      console.error(`[challenge-ben] could not cache decision ${key}:`, e);
    }
    return { decision: fresh, cached: false, historyHash };
  })().finally(() => inFlight.delete(key));

  inFlight.set(key, run);
  return run;
}

async function readDecision(
  store: ChallengeStore,
  challengeId: string,
  boardNo: number,
  historyHash: string,
): Promise<BenDecisionPayload | null> {
  try {
    const row = await store.getDecision(challengeId, boardNo, historyHash);
    return row?.decision ?? null;
  } catch (e) {
    console.error(`[challenge-ben] decision cache unreadable — asking BEN`, e);
    return null;
  }
}

/** The single impure step: ask BEN, validate the answer, or fail honestly. */
async function askBen(
  state: GameState,
  seat: Seat,
  client: BenTableClient,
): Promise<BenDecisionPayload> {
  const vul = vulToBen(state.vul);
  const ctx = auctionToCtx(state.auction);

  if (state.phase === "auction") {
    let bid: Call;
    try {
      const result = await client.bid({
        hand: handToPbn(originalHand(state, seat)),
        seat,
        dealer: state.dealer,
        vul,
        ctx,
      });
      bid = result.bid;
    } catch (e) {
      throw new BenUnavailableError(
        `BEN could not bid for ${seat} (${(e as Error).message})`,
        "bid",
        seat,
      );
    }
    if (!legalCalls(state.auction, seat).has(bid))
      throw new BenUnavailableError(
        `BEN answered "${bid}" for ${seat}, which is not a legal call here`,
        "bid",
        seat,
      );
    return { kind: "call", seat, call: bid };
  }

  if (state.phase !== "play")
    throw new BenUnavailableError("the board is complete — nothing left to decide", "phase", seat);

  // BEN infers who is on play from `played`; when the DUMMY is on play we ask
  // as the declarer, the seat that actually controls those cards (the same
  // rule the live table's decider uses).
  const declarer = state.contract?.declarer;
  const dummy = declarer ? partnerOf(declarer) : null;
  const requestSeat = declarer && seat === dummy ? declarer : seat;
  const played = playedToBen(state);
  const stage: BenFailureStage = played === "" ? "lead" : "play";

  let raw: string;
  try {
    const result =
      played === ""
        ? // The opening lead: dummy is still hidden, so /lead sees only the hand.
          await client.lead({
            hand: handToPbn(originalHand(state, seat)),
            seat,
            dealer: state.dealer,
            vul,
            ctx,
          })
        : await client.play({
            hand: handToPbn(originalHand(state, requestSeat)),
            dummy: dummy ? handToPbn(originalHand(state, dummy)) : "",
            seat: requestSeat,
            dealer: state.dealer,
            vul,
            ctx,
            played,
          });
    raw = result.card;
  } catch (e) {
    throw new BenUnavailableError(
      `BEN could not play for ${seat} (${(e as Error).message})`,
      stage,
      seat,
    );
  }

  const card = parseBenCard(raw);
  if (!card)
    throw new BenUnavailableError(`BEN returned an unreadable card "${raw}"`, stage, seat);
  if (!legalPlays(state, seat).some((c) => c.suit === card.suit && c.rank === card.rank))
    throw new BenUnavailableError(
      `BEN chose ${raw} for ${seat}, which is not legal here`,
      stage,
      seat,
    );
  return { kind: "card", seat, card };
}

// ── the table's decider ─────────────────────────────────────────────────────

const CACHED_REASON = "BEN · the decision every participant meets at this position";
const FRESH_REASON = "BEN neural engine";

function decisionOf<A>(action: A, cached: boolean): Decision<A> {
  return {
    action,
    candidates: [action],
    trace: [],
    citedSettings: [],
    facts: { source: "BEN", cached },
    reason: cached ? CACHED_REASON : FRESH_REASON,
    rejected: [],
    // Never a fallback: in a challenge BEN either answers or the seam throws.
    fallback: false,
  };
}

/**
 * A `SeatDecider` for a BEN seat at a CHALLENGE table — hand it to
 * `SessionService`'s `benDecider` option. Every decision routes through the
 * cache, so the opposition a participant meets is the opposition everybody
 * else met on that line. Throws `BenUnavailableError` rather than degrading.
 */
export function challengeBenDecider(
  ctx: { challengeId: string; boardNo: number } & ChallengeBenDeps,
): SeatDecider {
  const ask = (state: GameState, seat: Seat) =>
    challengeBenDecision({ ...ctx, state, seat });

  return {
    async decideBid(state, seat): Promise<Decision<Call>> {
      const { decision, cached } = await ask(state, seat);
      if (decision.kind !== "call")
        throw new BenUnavailableError(
          `BEN's cached answer for ${seat} is a card, not a call`,
          "bid",
          seat,
        );
      return decisionOf(decision.call, cached);
    },
    async decidePlay(state, seat): Promise<Decision<Card>> {
      const { decision, cached } = await ask(state, seat);
      if (decision.kind !== "card")
        throw new BenUnavailableError(
          `BEN's cached answer for ${seat} is a call, not a card`,
          "play",
          seat,
        );
      return decisionOf(decision.card, cached);
    },
  };
}

// ── warm-up + cost ──────────────────────────────────────────────────────────

export interface BenWarmResult {
  /** BEN answered within the ping budget — the first real move will be quick. */
  ok: boolean;
  /** Whether BEN_ENDPOINT exists at all. */
  configured: boolean;
  ms: number;
  /** Why the ping did not come back (usually "still warming"), never thrown. */
  error?: string;
}

/** A hand that costs BEN nothing to think about — this ping is for the boot. */
const WARM_HAND = "AKQ.AKQ.AKQ.AKQJ";

/**
 * Ping BEN so the cold start happens BEFORE a participant is waiting on it
 * (spec §2, BEN latency). Deliberately short-fused: the point is to make the
 * container boot, not to wait for it, so a timeout is a normal outcome and is
 * reported as `ok: false` rather than thrown. Never throws.
 */
export async function warmBen(opts?: {
  timeoutMs?: number;
  client?: BenTableClient;
}): Promise<BenWarmResult> {
  const started = Date.now();
  if (!opts?.client && !benAvailable())
    return { ok: false, configured: false, ms: 0, error: "BEN_ENDPOINT is not configured" };

  const timeoutMs =
    opts?.timeoutMs ?? (Number(process.env.BEN_WARM_TIMEOUT_MS || "") || 6_000);
  try {
    const client = opts?.client ?? createBenTableClient({ timeoutMs });
    await client.bid({ hand: WARM_HAND, seat: "N", dealer: "N", vul: "", ctx: "" });
    return { ok: true, configured: true, ms: Date.now() - started };
  } catch (e) {
    return {
      ok: false,
      configured: true,
      ms: Date.now() - started,
      error: (e as Error).message,
    };
  }
}

/** How many BEN decisions this challenge has accumulated (spec §10 cost check). */
export async function challengeBenCallCount(
  challengeId: string,
  store: ChallengeStore = challengeStore(),
): Promise<number> {
  try {
    return await store.countDecisions(challengeId);
  } catch (e) {
    console.error("[challenge-ben] decision count unreadable", e);
    return 0;
  }
}

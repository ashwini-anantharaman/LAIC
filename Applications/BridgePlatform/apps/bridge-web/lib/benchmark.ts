// The BEN BIDDING BENCHMARK (Pillar B) — the bridge expert's objective
// assessment tool, to Nitin's spec. BEN (github.com/lorserker/ben, a neural
// bridge engine, run as a separate GPL service and called over HTTP) bids
// seeded deals; our compiled rules bid the SAME deals under the SAME
// constraint; the FIRST call that differs on each unique bidding sequence is
// recorded as a divergence. A divergence a human marks "system difference"
// counts as a success.
//
// Nitin's params: maxDeals (default 1000), maxBids (default 4), competition
// (default false), maxUniqueSequences (default 100). BEN bids the deal and we
// SKIP deals whose bidding sequence was already tested (dedupe). For each
// remaining deal we track the first difference: our rule that applied and
// BEN's explanation. Missing rules = our call came from fallback/floor.
//
// SERVER-ONLY: BenClient reaches BEN_ENDPOINT and this module drives the KB
// decider over a full deal. Never import it from a client component. Every
// export below the BenClient (the pure helpers + the batch loop) is unit-tested
// with a STUBBED BenClient + InMemoryKbStore — no network in CI.

import {
  auctionComplete,
  createKbDecider,
  initialState,
  seededDeal,
  type GameState,
} from "@bridge/engine";
import {
  rankLabel,
  SEATS,
  type AuctionCall,
  type Call,
  type Card,
  type Seat,
  type Suit,
  type Vul,
} from "@bridge/events";
import type {
  BenCandidate,
  BenchmarkOurKind,
  CompiledKb,
  KbBenchmarkCursor,
  KbBenchmarkDivergence,
  KbBenchmarkRun,
  KbBenchmarkStats,
} from "@bridge/kb";

/** Honest no-endpoint behavior, mirroring auditAvailable() / benAvailable(). */
export function benAvailable(): boolean {
  return Boolean(process.env.BEN_ENDPOINT);
}

/**
 * Whether the Benchmark feature is surfaced at all. Off by default — the whole
 * BEN comparison is parked (undecided) so the tab and route stay hidden until
 * BRIDGE_BENCHMARK=1 is set. All the store/loop/UI code stays intact behind
 * this one flag, so re-enabling is a single env change, no rebuild of logic.
 */
export function benchmarkEnabled(): boolean {
  return process.env.BRIDGE_BENCHMARK === "1";
}

/** Batch size the UI offers (default) and its hard cap. One click = one batch;
 *  ~0.1–2 s per BEN bid keeps a 25-deal batch well under the 300 s limit. */
export const DEFAULT_BATCH = 25;
export const MAX_BATCH = 50;

// ---------------------------------------------------------------------------
// Pure serialization helpers — unit-tested without BEN.
// ---------------------------------------------------------------------------

/** PBN rank label: A K Q J T 9 … 2 (T for ten, unlike events' "10"). */
export function pbnRank(rank: number): string {
  return rank === 10 ? "T" : rankLabel(rank as never);
}

/**
 * A hand as a PBN suit string, spades.hearts.diamonds.clubs, ranks high→low,
 * a void rendered as the empty span. e.g. "AK97543.K.T3.AK7".
 */
export function handToPbn(cards: Card[]): string {
  const order: Suit[] = ["S", "H", "D", "C"];
  return order
    .map((suit) =>
      cards
        .filter((c) => c.suit === suit)
        .sort((a, b) => b.rank - a.rank)
        .map((c) => pbnRank(c.rank))
        .join(""),
    )
    .join(".");
}

/** One call as a BEN ctx token: 2-char bid, '--' pass, 'Db' double, 'Rd' redouble. */
export function callToCtxToken(call: Call): string {
  if (call === "P") return "--";
  if (call === "X") return "Db";
  if (call === "XX") return "Rd";
  return call; // "1C".."7N" — already the 2-char token BEN expects (N = notrump)
}

/** The auction so far as concatenated ctx tokens (empty = opening bid). */
export function auctionToCtx(auction: AuctionCall[]): string {
  return auction.map((c) => callToCtxToken(c.call)).join("");
}

/** BEN vul code. none = empty, both = @v@V. NS/EW-only encoding is best-effort
 *  (varies by build) — the benchmark runs vul "none", so it is never exercised. */
export function vulToBen(vul: Vul): string {
  switch (vul) {
    case "none":
      return "";
    case "both":
      return "@v@V";
    case "ns":
      return "@v";
    case "ew":
      return "@V";
  }
}

/** Normalize BEN's returned call into our Call notation (P / X / XX / "1N"…). */
export function normalizeBenCall(bid: string): Call {
  const b = bid.trim().toUpperCase();
  if (b === "PASS" || b === "P" || b === "--" || b === "PA") return "P";
  if (b === "X" || b === "DB" || b === "DBL" || b === "DOUBLE") return "X";
  if (b === "XX" || b === "RD" || b === "REDBL" || b === "REDOUBLE") return "XX";
  const m = /^([1-7])(NT|N|C|D|H|S)$/.exec(b);
  if (m) return `${m[1]}${m[2] === "NT" ? "N" : m[2]}`;
  return b; // unknown token — pass through verbatim so a divergence still records it
}

/** The dedup key for a bidding sequence: its calls '-'-joined. */
export function sequenceKey(auction: AuctionCall[]): string {
  return auction.map((c) => c.call).join("-");
}

/** The marking join key: auctionPrefix + '|' + ourCall + '|' + benCall. */
export function divergenceSignature(
  auctionPrefix: string,
  ourCall: Call,
  benCall: Call,
): string {
  return `${auctionPrefix}|${ourCall}|${benCall}`;
}

/** Seat to act at position `index` of the auction: dealer, then clockwise. */
export function seatAt(dealer: Seat, index: number): Seat {
  return SEATS[(SEATS.indexOf(dealer) + index) % 4]!;
}

/** True when competition is off and this is an opponent (E/W) seat: it passes. */
function forcedPass(competition: boolean, seat: Seat): boolean {
  return !competition && (seat === "E" || seat === "W");
}

function classifyDecision(d: { fallback: boolean; reason: string }): BenchmarkOurKind {
  if (!d.fallback) return "matched";
  if (d.reason.startsWith("ENGINE FLOOR")) return "floor";
  return "fallback";
}

/** ruleId → provenance snippet, across the compiled lists our bids resolve to. */
interface LocalRuleInfo {
  label?: string;
  itemId?: string;
  itemTitle?: string;
}
function buildLocalRuleIndex(compiled: CompiledKb): Map<string, LocalRuleInfo> {
  const index = new Map<string, LocalRuleInfo>();
  for (const r of compiled.auctionRules)
    index.set(r.ruleId, {
      label: r.label,
      itemId: r.provenance.itemId,
      itemTitle: r.provenance.itemTitle,
    });
  for (const r of compiled.forcingRules)
    index.set(r.ruleId, {
      label: r.label,
      itemId: r.provenance.itemId,
      itemTitle: r.provenance.itemTitle,
    });
  for (const r of compiled.fallbacks)
    index.set(r.ruleId, {
      label: "fallback: pass",
      itemId: r.provenance.itemId,
      itemTitle: r.provenance.itemTitle,
    });
  return index;
}

// ---------------------------------------------------------------------------
// BenClient — the ONE impure surface (HTTP to BEN_ENDPOINT).
// ---------------------------------------------------------------------------

export interface BenBidRequest {
  hand: Card[];
  seat: Seat;
  dealer: Seat;
  vul: Vul;
  /** The auction so far (this seat is next to call). */
  auction: AuctionCall[];
}

export interface BenBidResult {
  bid: Call;
  who?: string;
  quality?: string;
  candidates: BenCandidate[];
}

export interface BenClient {
  bid(req: BenBidRequest): Promise<BenBidResult>;
}

function normalizeCandidate(raw: unknown): BenCandidate {
  const o = (raw ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" ? v : undefined);
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  return {
    call: normalizeBenCall(String(o.call ?? o.bid ?? "")),
    insta_score: num(o.insta_score),
    expected_score: num(o.expected_score),
    expected_tricks: num(o.expected_tricks),
    explanation: str(o.explanation),
    alert: str(o.alert),
  };
}

/**
 * A live BEN client over REST `GET {BEN_ENDPOINT}/bid`. Serializes the hand to
 * PBN and the auction to ctx tokens, asks for details=true, and normalizes the
 * response. Times out and raises a clear error on an unreachable endpoint.
 */
export function createBenClient(opts?: {
  endpoint?: string;
  timeoutMs?: number;
}): BenClient {
  const endpoint = opts?.endpoint ?? process.env.BEN_ENDPOINT;
  if (!endpoint)
    throw new Error("BEN benchmark needs BEN_ENDPOINT configured on the server");
  const base = endpoint.replace(/\/$/, "");
  const timeoutMs = opts?.timeoutMs ?? 20_000;

  return {
    async bid(req) {
      const params = new URLSearchParams({
        hand: handToPbn(req.hand),
        seat: req.seat,
        dealer: req.dealer,
        vul: vulToBen(req.vul),
        ctx: auctionToCtx(req.auction),
        details: "true",
      });
      const url = `${base}/bid?${params.toString()}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetch(url, { signal: controller.signal });
      } catch (e) {
        throw new Error(
          `BEN is unreachable at ${base} — is the container running? (${(e as Error).message})`,
        );
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) throw new Error(`BEN /bid returned HTTP ${res.status}`);
      const data = (await res.json()) as {
        bid?: string;
        who?: string;
        quality?: string;
        candidates?: unknown[];
      };
      return {
        bid: normalizeBenCall(String(data.bid ?? "")),
        who: typeof data.who === "string" ? data.who : undefined,
        quality: typeof data.quality === "string" ? data.quality : undefined,
        candidates: Array.isArray(data.candidates)
          ? data.candidates.map(normalizeCandidate)
          : [],
      };
    },
  };
}

// ---------------------------------------------------------------------------
// The batch loop — pure over its inputs (compiled + a BenClient), unit-tested
// with a stubbed client. Computes one batch's cursor/divergences/stats; the
// caller persists them via kbService().advanceBenchmarkRun.
// ---------------------------------------------------------------------------

export interface RunBatchInput {
  run: KbBenchmarkRun;
  compiled: CompiledKb;
  client: BenClient;
  batchSize: number;
}

export interface RunBatchResult {
  cursor: KbBenchmarkCursor;
  /** Only the divergences THIS batch found (the service appends them). */
  appendDivergences: KbBenchmarkDivergence[];
  /** Running totals after this batch. */
  stats: KbBenchmarkStats;
  /** True when a stop condition (maxDeals or maxUniqueSequences) was reached. */
  complete: boolean;
  /** Deals consumed this batch (compared + dup-skipped). */
  dealsThisBatch: number;
}

/**
 * Play one batch of deals. Per deal:
 *  1. BEN bids the first maxBids CALLS of the auction (E/W forced to pass when
 *     competition=false, so only N/S consult BEN). That is the reference
 *     sequence.
 *  2. If the sequence was already tested → dup-skip (Nitin's rule), count it,
 *     advance the seed.
 *  3. Else our decider replays the SAME deal on the SAME shared prefix and we
 *     compare call-by-call. The FIRST index where our N/S call differs from
 *     BEN's is the divergence (recorded with our rule + BEN's explanation) and
 *     the deal stops. Equal all the way → a match.
 * Stop conditions: maxDeals seeds consumed OR maxUniqueSequences sequences seen.
 */
export async function runBenchmarkBatch(input: RunBatchInput): Promise<RunBatchResult> {
  const { run, compiled, client } = input;
  const { params } = run;

  const seen = new Set(run.cursor.sequencesSeen);
  const stats: KbBenchmarkStats = { ...run.stats };
  const appended: KbBenchmarkDivergence[] = [];
  const ruleIndex = buildLocalRuleIndex(compiled);
  const vul: Vul = "none";

  // One decider for the run's set. decideBid reads state fresh each call, so a
  // single decider serves every deal. first_match keeps it deterministic.
  const decider = createKbDecider({
    compiled,
    player: {
      enabledPackIds: params.packId ? [params.packId] : [],
      settingOverrides: {},
      decisionPolicyId: "first_match",
    },
    seed: `bench_${run.runId}`,
  });

  let seed = run.cursor.nextSeed;
  let dealsThisBatch = 0;

  const dealsConsumed = () => seed - params.seedStart;
  const stop = () =>
    dealsConsumed() >= params.maxDeals || seen.size >= params.maxUniqueSequences;

  while (dealsThisBatch < input.batchSize && !stop()) {
    const hands = seededDeal(seed);
    const dealer = SEATS[seed % 4]!;

    // 1) BEN bids the deal — first maxBids CALLS (positions), stopping early if
    // the auction legally closes. E/W pass without consulting BEN when
    // competition is off; only N/S bids carry a BEN response for the log.
    const benAuction: AuctionCall[] = [];
    const benResponses: (BenBidResult | null)[] = [];
    for (let i = 0; i < params.maxBids; i++) {
      if (auctionComplete(benAuction)) break;
      const seat = seatAt(dealer, i);
      if (forcedPass(params.competition, seat)) {
        benAuction.push({ seat, call: "P" });
        benResponses.push(null);
        continue;
      }
      const result = await client.bid({ hand: hands[seat], seat, dealer, vul, auction: benAuction });
      benAuction.push({ seat, call: result.bid });
      benResponses.push(result);
    }

    // 2) Dedup: SKIP deals whose bidding sequence was already tested.
    const seqKey = sequenceKey(benAuction);
    if (seen.has(seqKey)) {
      stats.dealsSkippedDup++;
      seed++;
      dealsThisBatch++;
      continue;
    }
    seen.add(seqKey);
    stats.sequences = seen.size;

    // 3) Our decider replays the same deal on the shared prefix; first differing
    // N/S call = divergence. Up to the first difference the two auctions are
    // identical, so feeding BEN's prefix IS "the same auction."
    let diverged = false;
    for (let i = 0; i < benAuction.length; i++) {
      const seat = benAuction[i]!.seat;
      const benCall = benAuction[i]!.call;
      if (forcedPass(params.competition, seat)) continue; // forced pass, always matches

      const prefix = benAuction.slice(0, i);
      const state: GameState = {
        ...initialState(`bench_${seed}`, dealer, vul, hands),
        auction: prefix,
        turn: seat,
      };
      const decision = await decider.decideBid(state, seat);
      const ourCall = decision.action;
      if (ourCall === benCall) continue;

      const auctionPrefix = sequenceKey(prefix);
      const info = decision.matchedRuleId ? ruleIndex.get(decision.matchedRuleId) : undefined;
      appended.push({
        dealSeed: seed,
        dealer,
        auction: auctionPrefix,
        index: i,
        ourCall,
        ourRuleId: decision.matchedRuleId,
        ourRuleLabel: info?.label,
        ourItemId: info?.itemId,
        ourItemTitle: info?.itemTitle,
        ourBecause: decision.reason,
        ourKind: classifyDecision(decision),
        benCall,
        benWho: benResponses[i]?.who,
        benQuality: benResponses[i]?.quality,
        benCandidates: benResponses[i]?.candidates ?? [],
        signature: divergenceSignature(auctionPrefix, ourCall, benCall),
      });
      stats.divergences++;
      diverged = true;
      break;
    }
    if (!diverged) stats.matches++;
    stats.dealsPlayed++;

    seed++;
    dealsThisBatch++;
  }

  const cursor: KbBenchmarkCursor = { nextSeed: seed, sequencesSeen: [...seen] };
  const complete =
    dealsConsumed() >= params.maxDeals || seen.size >= params.maxUniqueSequences;
  return { cursor, appendDivergences: appended, stats, complete, dealsThisBatch };
}

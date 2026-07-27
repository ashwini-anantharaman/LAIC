// BEN Bidding Benchmark — pure-helper + batch-loop unit tests. NO network:
// the batch loop is driven by a STUBBED BenClient and a minimal CompiledKb, so
// dedup / divergence / match / stop-condition / cursor logic is verified
// entirely offline. The store round-trip uses InMemoryKbStore + KbService.

import { describe, expect, it } from "vitest";
import type { AuctionCall, Card, Seat } from "@bridge/events";
import { InMemoryKbStore, KbService, type CompiledKb } from "@bridge/kb";
import {
  auctionToCtx,
  callToCtxToken,
  createBenClient,
  divergenceSignature,
  handToPbn,
  normalizeBenCall,
  runBenchmarkBatch,
  seatAt,
  sequenceKey,
  vulToBen,
  type BenBidRequest,
  type BenBidResult,
  type BenClient,
} from "./benchmark";

// ---- fixtures --------------------------------------------------------------

const card = (suit: Card["suit"], rank: number): Card => ({ suit, rank: rank as Card["rank"] });

/** A full 13-card hand: ♠AK9 ♥K ♦T3 ♣AK + filler (exact ranks matter only for PBN). */
const hand: Card[] = [
  card("S", 14),
  card("S", 13),
  card("S", 9),
  card("S", 7),
  card("S", 5),
  card("S", 4),
  card("S", 3),
  card("H", 13),
  card("D", 10),
  card("D", 3),
  card("C", 14),
  card("C", 13),
  card("C", 7),
];

/** Minimal empty compile: no rules, no fallback ⇒ our decider always floor-passes. */
function emptyCompiled(): CompiledKb {
  return {
    compileId: "cmp_test",
    kbId: "kb_test",
    version: 1,
    compiledAt: "2026-07-24T00:00:00.000Z",
    inputHash: "test",
    settings: [],
    defaults: {},
    auctionRules: [],
    forcingRules: [],
    leadRules: [],
    playRules: [],
    signalDefaults: {},
    fallbacks: [],
    conflicts: [],
    requires: [],
    items: [],
    packs: [],
  } as unknown as CompiledKb;
}

/** A stub client: returns whatever `bidFor(seat)` says, counting its calls. */
function stubClient(bidFor: (req: BenBidRequest) => string): BenClient & { calls: number } {
  const client = {
    calls: 0,
    async bid(req: BenBidRequest): Promise<BenBidResult> {
      client.calls++;
      return {
        bid: normalizeBenCall(bidFor(req)),
        who: "NN",
        quality: "Good",
        candidates: [{ call: normalizeBenCall(bidFor(req)), insta_score: 0.9, explanation: "stub" }],
      };
    },
  };
  return client;
}

function newRun(overrides?: Partial<{ maxDeals: number; maxBids: number; competition: boolean; maxUniqueSequences: number; seedStart: number }>) {
  const p = { maxDeals: 1000, maxBids: 4, competition: false, maxUniqueSequences: 100, seedStart: 0, ...overrides };
  return {
    runId: "bm_test",
    kbId: "kb_test",
    params: { maxDeals: p.maxDeals, maxBids: p.maxBids, competition: p.competition, maxUniqueSequences: p.maxUniqueSequences, seedStart: p.seedStart },
    compileRef: "cmp_test",
    status: "running" as const,
    cursor: { nextSeed: p.seedStart, sequencesSeen: [] as string[] },
    divergences: [],
    stats: { dealsPlayed: 0, dealsSkippedDup: 0, sequences: 0, matches: 0, divergences: 0 },
    createdBy: "u1",
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
  };
}

// ---- pure serialization ----------------------------------------------------

describe("handToPbn", () => {
  it("serializes ♠.♥.♦.♣ high→low with T for ten and empty for a void", () => {
    expect(handToPbn(hand)).toBe("AK97543.K.T3.AK7");
  });
  it("round-trips through the void span", () => {
    const noHearts = hand.filter((c) => c.suit !== "H");
    expect(handToPbn(noHearts)).toBe("AK97543..T3.AK7");
  });
});

describe("ctx tokens", () => {
  it("maps calls to 2-char tokens, '--' pass, 'Db'/'Rd'", () => {
    expect(callToCtxToken("P")).toBe("--");
    expect(callToCtxToken("X")).toBe("Db");
    expect(callToCtxToken("XX")).toBe("Rd");
    expect(callToCtxToken("1C")).toBe("1C");
    expect(callToCtxToken("1N")).toBe("1N");
  });
  it("concatenates an auction into a ctx string", () => {
    const auction: AuctionCall[] = [
      { seat: "N", call: "1C" },
      { seat: "E", call: "P" },
      { seat: "S", call: "1S" },
    ];
    expect(auctionToCtx(auction)).toBe("1C--1S");
    expect(auctionToCtx([])).toBe("");
  });
});

describe("normalizeBenCall", () => {
  it("normalizes pass / double / redouble spellings", () => {
    expect(normalizeBenCall("PASS")).toBe("P");
    expect(normalizeBenCall("--")).toBe("P");
    expect(normalizeBenCall("X")).toBe("X");
    expect(normalizeBenCall("Db")).toBe("X");
    expect(normalizeBenCall("XX")).toBe("XX");
    expect(normalizeBenCall("Rd")).toBe("XX");
  });
  it("normalizes notrump to our 1N form and keeps suit bids", () => {
    expect(normalizeBenCall("1NT")).toBe("1N");
    expect(normalizeBenCall("1N")).toBe("1N");
    expect(normalizeBenCall("4H")).toBe("4H");
  });
});

describe("vul, keys, seats", () => {
  it("maps vul none→'' both→@v@V", () => {
    expect(vulToBen("none")).toBe("");
    expect(vulToBen("both")).toBe("@v@V");
  });
  it("keys a sequence by its calls '-'-joined", () => {
    expect(sequenceKey([{ seat: "N", call: "1N" }, { seat: "E", call: "P" }])).toBe("1N-P");
    expect(sequenceKey([])).toBe("");
  });
  it("builds the divergence signature auctionPrefix|our|ben", () => {
    expect(divergenceSignature("1C-P", "1H", "1S")).toBe("1C-P|1H|1S");
    expect(divergenceSignature("", "P", "1N")).toBe("|P|1N");
  });
  it("seats rotate clockwise from the dealer (S W N E)", () => {
    expect(seatAt("N", 0)).toBe("N");
    expect(seatAt("N", 1)).toBe("E");
    expect(seatAt("N", 2)).toBe("S");
    expect(seatAt("N", 3)).toBe("W");
  });
});

describe("createBenClient", () => {
  it("throws a clear error when no endpoint is configured", () => {
    expect(() => createBenClient({ endpoint: "" })).toThrow(/BEN_ENDPOINT/);
  });
});

// ---- batch loop ------------------------------------------------------------

describe("runBenchmarkBatch", () => {
  it("dedups identical sequences: 1 match, the rest dup-skipped", async () => {
    // BEN passes everything ⇒ every deal produces the same 'P-P-P-P' sequence.
    const client = stubClient(() => "P");
    const result = await runBenchmarkBatch({
      run: newRun(),
      compiled: emptyCompiled(),
      client,
      batchSize: 5,
    });
    expect(result.stats.sequences).toBe(1);
    expect(result.stats.matches).toBe(1);
    expect(result.stats.dealsPlayed).toBe(1);
    expect(result.stats.dealsSkippedDup).toBe(4);
    expect(result.dealsThisBatch).toBe(5);
    expect(result.cursor.nextSeed).toBe(5);
    expect(result.cursor.sequencesSeen).toEqual(["P-P-P-P"]);
    expect(result.appendDivergences).toHaveLength(0);
    expect(result.complete).toBe(false);
  });

  it("records the first divergence: our floor-pass vs BEN's opening", async () => {
    // seed 2 ⇒ dealer = SEATS[2] = N; BEN opens 1N as North, else passes.
    const client = stubClient((req) => (req.seat === "N" ? "1N" : "P"));
    const result = await runBenchmarkBatch({
      run: newRun({ seedStart: 2 }),
      compiled: emptyCompiled(),
      client,
      batchSize: 1,
    });
    expect(result.appendDivergences).toHaveLength(1);
    const d = result.appendDivergences[0]!;
    expect(d.dealer).toBe("N");
    expect(d.index).toBe(0);
    expect(d.auction).toBe("");
    expect(d.ourCall).toBe("P");
    expect(d.benCall).toBe("1N");
    expect(d.ourKind).toBe("floor"); // empty compile ⇒ missing-rule (floor)
    expect(d.signature).toBe("|P|1N");
    expect(d.benCandidates.length).toBeGreaterThan(0);
    expect(result.stats.divergences).toBe(1);
    expect(result.stats.matches).toBe(0);
    expect(result.stats.sequences).toBe(1);
    // competition off ⇒ BEN consulted only for N/S (N here bids, S passes): 2 calls.
    expect(client.calls).toBe(2);
  });

  it("stops at maxUniqueSequences and marks the run complete", async () => {
    const client = stubClient(() => "P");
    const result = await runBenchmarkBatch({
      run: newRun({ maxUniqueSequences: 1 }),
      compiled: emptyCompiled(),
      client,
      batchSize: 10,
    });
    expect(result.stats.sequences).toBe(1);
    expect(result.complete).toBe(true);
    expect(result.dealsThisBatch).toBe(1);
  });

  it("stops at maxDeals (seeds consumed) and marks the run complete", async () => {
    const client = stubClient((req) => (req.seat === "N" ? "1N" : "P"));
    const result = await runBenchmarkBatch({
      run: newRun({ maxDeals: 3 }),
      compiled: emptyCompiled(),
      client,
      batchSize: 100,
    });
    expect(result.dealsThisBatch).toBe(3);
    expect(result.cursor.nextSeed).toBe(3);
    expect(result.complete).toBe(true);
  });
});

// ---- store round-trip ------------------------------------------------------

describe("benchmark run persistence (InMemoryKbStore + KbService)", () => {
  it("creates, advances (appending divergences), and marks a run", async () => {
    const store = new InMemoryKbStore();
    const svc = new KbService(store, { now: () => "2026-07-24T00:00:00.000Z" });

    const run = await svc.createBenchmarkRun({
      kbId: "kb_test",
      params: { maxDeals: 1000, maxBids: 4, competition: false, maxUniqueSequences: 100, seedStart: 2 },
      compileRef: "cmp_test",
      createdBy: "u1",
    });
    expect(run.status).toBe("running");
    expect(run.cursor.nextSeed).toBe(2);

    const client = stubClient((req) => (req.seat === "N" ? "1N" : "P"));
    const batch = await runBenchmarkBatch({ run, compiled: emptyCompiled(), client, batchSize: 1 });

    const advanced = await svc.advanceBenchmarkRun({
      runId: run.runId,
      cursor: batch.cursor,
      appendDivergences: batch.appendDivergences,
      stats: batch.stats,
      complete: batch.complete,
    });
    expect(advanced.divergences).toHaveLength(1);
    expect(advanced.cursor.nextSeed).toBe(3);

    // A second batch APPENDS (never rewrites) prior divergences.
    const batch2 = await runBenchmarkBatch({ run: advanced, compiled: emptyCompiled(), client, batchSize: 1 });
    const advanced2 = await svc.advanceBenchmarkRun({
      runId: run.runId,
      cursor: batch2.cursor,
      appendDivergences: batch2.appendDivergences,
      stats: batch2.stats,
    });
    expect(advanced2.divergences.length).toBeGreaterThanOrEqual(1);

    // Markings are a separate, signature-keyed, mutable entity.
    const sig = advanced.divergences[0]!.signature;
    const marking = await svc.putBenchmarkMarking({ kbId: "kb_test", signature: sig, note: "BEN opens 15-17 1NT here", createdBy: "u1" });
    expect(marking.verdict).toBe("system_difference");
    const markings = await svc.listBenchmarkMarkingsForKb("kb_test");
    expect(markings).toHaveLength(1);
    // Re-marking the same signature updates in place, no duplicate.
    await svc.putBenchmarkMarking({ kbId: "kb_test", signature: sig, note: "changed my mind", createdBy: "u2" });
    expect(await svc.listBenchmarkMarkingsForKb("kb_test")).toHaveLength(1);
  });
});

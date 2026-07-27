// Knowledge-quality detectors: outcome-anomaly heuristics fire on crafted
// deals and stay silent on sane ones; the self-play pass yields well-formed,
// ancestor-collapsed continuation gaps against the fixture KB.

import type { Card, Contract, Seat, Suit } from "@bridge/events";
import {
  FIXTURE_EDGES,
  FIXTURE_ITEMS,
  fixturePacks,
  InMemoryKbStore,
  KbService,
  type CompiledKb,
} from "@bridge/kb";
import { beforeAll, describe, expect, it } from "vitest";
import { type KbPlayerConfig } from "./decider";
import { analyzeSelfPlay, outcomeAnomalies, type DealOutcome } from "./insights";

const rankOf: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};

function parseHand(spec: string): Card[] {
  const cards = spec.split(/\s+/).map((token) => ({
    suit: token[0] as Suit,
    rank: rankOf[token[1]!]! as Card["rank"],
  }));
  if (cards.length !== 13) throw new Error(`hand spec has ${cards.length} cards`);
  return cards;
}

/** Exact N and S hands; E/W split the remaining 26 cards round-robin. */
function dealNS(nSpec: string, sSpec: string): Record<Seat, Card[]> {
  const hands: Record<Seat, Card[]> = {
    N: parseHand(nSpec),
    S: parseHand(sSpec),
    E: [],
    W: [],
  };
  const used = new Set([...hands.N, ...hands.S].map((c) => `${c.suit}${c.rank}`));
  let i = 0;
  for (const suit of ["S", "H", "D", "C"] as Suit[]) {
    for (let rank = 2; rank <= 14; rank++) {
      if (used.has(`${suit}${rank}`)) continue;
      hands[i % 2 === 0 ? "E" : "W"].push({ suit, rank: rank as Card["rank"] });
      i++;
    }
  }
  return hands;
}

const outcome = (
  hands: Record<Seat, Card[]>,
  contract: Contract | null,
): DealOutcome => ({
  hands,
  dealSeed: 1,
  dealer: "N",
  vul: "none",
  auction: "P-P-P-P",
  contract,
});

describe("outcomeAnomalies heuristics", () => {
  it("flags missed_game: 27 combined HCP stopped in 2H", () => {
    // N 20 HCP, S 7 HCP; NS hold 8 hearts so no_fit stays quiet.
    const hands = dealNS(
      "SA SK S2 S3 HA HQ H2 H3 DA DK D2 C2 C3",
      "S4 S5 S6 HK H4 H5 H6 DJ D4 D5 CQ CJ C4",
    );
    const flags = outcomeAnomalies(
      outcome(hands, { level: 2, strain: "H", declarer: "S", doubled: 0 }),
    );
    expect(flags.map((f) => f.kind)).toEqual(["missed_game"]);
    expect(flags[0]!.detail).toContain("27 combined HCP");
  });

  it("stays silent on a normal partscore", () => {
    // NS ~14 combined — 2H is a fine spot.
    const hands = dealNS(
      "SA S2 S3 S4 HQ H2 H3 H4 DK D2 D3 C2 C3",
      "S5 S6 S7 HK H5 H6 H7 DJ D4 D5 C4 C5 C6",
    );
    const flags = outcomeAnomalies(
      outcome(hands, { level: 2, strain: "H", declarer: "S", doubled: 0 }),
    );
    expect(flags).toEqual([]);
  });

  it("flags slam_missing_aces: 6H holding two aces", () => {
    const hands = dealNS(
      "HA HK HQ HJ H2 H3 SA SK SQ D2 D3 C2 C3",
      "H4 H5 H6 H7 H8 H9 DK DQ DJ CK CQ S2 S3",
    );
    const flags = outcomeAnomalies(
      outcome(hands, { level: 6, strain: "H", declarer: "S", doubled: 0 }),
    );
    expect(flags.map((f) => f.kind)).toEqual(["slam_missing_aces"]);
    expect(flags[0]!.detail).toContain("2 of the 4 aces");
  });

  it("accepts a slam with three aces", () => {
    const hands = dealNS(
      "HA HK HQ HJ H2 H3 SA SK SQ DA D3 C2 C3",
      "H4 H5 H6 H7 H8 H9 DK DQ DJ CK CQ S2 S3",
    );
    const flags = outcomeAnomalies(
      outcome(hands, { level: 6, strain: "H", declarer: "S", doubled: 0 }),
    );
    expect(flags).toEqual([]);
  });

  it("flags no_fit: a game in spades on five combined trumps", () => {
    const hands = dealNS(
      "S2 HA HK H2 H3 H4 DA DK D2 D3 C2 C3 C4",
      "S3 S4 S5 S6 HQ H5 H6 DQ DJ D4 CQ CJ C5",
    );
    const flags = outcomeAnomalies(
      outcome(hands, { level: 4, strain: "S", declarer: "S", doubled: 0 }),
    );
    expect(flags.map((f) => f.kind)).toEqual(["no_fit"]);
    expect(flags[0]!.detail).toContain("5 combined");
  });

  it("flags a pass-out holding game values (both heuristics)", () => {
    // NS 26 combined; passed out.
    const hands = dealNS(
      "SA SK S2 S3 HA HQ H2 H3 DA DK D2 C2 C3",
      "S4 S5 S6 HK HJ H4 H5 DQ D4 D5 CJ C4 C5",
    );
    const flags = outcomeAnomalies(outcome(hands, null));
    expect(flags.map((f) => f.kind).sort()).toEqual([
      "game_values_passed_out",
      "missed_game",
    ]);
    expect(flags.every((f) => f.contract === "passed out")).toBe(true);
  });

  it("stays silent on a fair pass-out (20–20)", () => {
    // N 10 + S 10; the E/W remainder then also holds 20.
    const hands = dealNS(
      "SA SK S2 S3 HQ H2 H3 H4 DJ D2 D3 C2 C3",
      "S4 S5 S6 HA HK H5 H6 DQ DT D4 C4 C5 C6",
    );
    const flags = outcomeAnomalies(outcome(hands, null));
    expect(flags).toEqual([]);
  });
});

describe("analyzeSelfPlay over the fixture KB", () => {
  let compiled: CompiledKb;
  const player: KbPlayerConfig = {
    enabledPackIds: ["pk_conventions"],
    settingOverrides: {},
    decisionPolicyId: "first_match",
  };

  beforeAll(async () => {
    const store = new InMemoryKbStore();
    const service = new KbService(store, { now: () => "2026-07-14T12:00:00.000Z" });
    const kb = await service.createKb({ name: "F", systemLabel: "SAYC", createdBy: "u" });
    for (const item of FIXTURE_ITEMS) {
      await store.putItem(item);
      await store.addMembership({ kbId: kb.kbId, itemId: item.itemId });
    }
    for (const edge of FIXTURE_EDGES) await store.putEdge(edge);
    for (const pack of fixturePacks(kb.kbId)) await store.putPack(pack);
    await service.recompile(kb.kbId);
    compiled = (await service.liveCompile(kb.kbId))!;
  });

  it("is deterministic and yields well-formed, ancestor-collapsed gaps", async () => {
    const report = await analyzeSelfPlay({ compiled, player, deals: 30, seed: 1 });
    expect(report.dealsPlayed).toBe(30);
    for (const gap of report.gaps) {
      expect(gap.samples).toBeGreaterThanOrEqual(3);
      expect(gap.fallbackShare).toBeGreaterThanOrEqual(0.8);
      expect(gap.example.dealSeed).toBeGreaterThanOrEqual(1);
    }
    // Collapsing: no reported gap strictly extends another reported gap.
    const calls = report.gaps.map((g) => (g.prefix === "" ? [] : g.prefix.split("-")));
    for (const a of calls)
      for (const b of calls)
        if (a !== b)
          expect(a.length < b.length && a.every((c, i) => c === b[i])).toBe(false);

    const again = await analyzeSelfPlay({ compiled, player, deals: 30, seed: 1 });
    expect(again.gaps).toEqual(report.gaps);
    expect(again.anomalies).toEqual(report.anomalies);
  });
});

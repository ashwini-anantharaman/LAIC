// Stage B acceptance (engine side): the decider interprets compiled KBs —
// $setting ranges bind live, enable gates work, policies behave, fallback vs
// engine floor is honest — and the full edit→recompile→behavior-change chain
// (the owner's "edit 2♣ to <10 HCP and the player plays that way") holds.

import type { Card, Seat, Suit } from "@bridge/events";
import {
  FIXTURE_EDGES,
  FIXTURE_ITEMS,
  fixturePacks,
  InMemoryKbStore,
  KbService,
  type CompiledKb,
} from "@bridge/kb";
import { beforeAll, describe, expect, it } from "vitest";
import { initialState, type GameState } from "../state";
import { createKbDecider, type KbPlayerConfig } from "./decider";
import { simulateSelfPlay } from "./simulate";

const NOW = "2026-07-14T12:00:00.000Z";

/** "SA SK ..." → Card[]; remaining cards fill the other seats round-robin. */
function dealFor(seat: Seat, spec: string): Record<Seat, Card[]> {
  const rankOf: Record<string, number> = {
    "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
    T: 10, J: 11, Q: 12, K: 13, A: 14,
  };
  const mine: Card[] = spec.split(/\s+/).map((token) => ({
    suit: token[0] as Suit,
    rank: rankOf[token[1]!]! as Card["rank"],
  }));
  if (mine.length !== 13) throw new Error(`hand spec has ${mine.length} cards`);
  const used = new Set(mine.map((c) => `${c.suit}${c.rank}`));
  const rest: Card[] = [];
  for (const suit of ["S", "H", "D", "C"] as Suit[]) {
    for (let rank = 2; rank <= 14; rank++) {
      if (!used.has(`${suit}${rank}`)) rest.push({ suit, rank: rank as Card["rank"] });
    }
  }
  const seats: Seat[] = ["N", "E", "S", "W"].filter((s) => s !== seat) as Seat[];
  const hands: Record<Seat, Card[]> = { N: [], E: [], S: [], W: [] };
  hands[seat] = mine;
  rest.forEach((card, i) => hands[seats[i % 3]!].push(card));
  return hands;
}

const basePlayer: KbPlayerConfig = {
  enabledPackIds: ["pk_conventions"],
  settingOverrides: {},
  decisionPolicyId: "first_match",
};

let compiled: CompiledKb;
let store: InMemoryKbStore;
let service: KbService;
let kbId: string;

beforeAll(async () => {
  store = new InMemoryKbStore();
  service = new KbService(store, { now: () => NOW });
  const kb = await service.createKb({ name: "Fixture", systemLabel: "SAYC", createdBy: "u" });
  kbId = kb.kbId;
  for (const item of FIXTURE_ITEMS) {
    await store.putItem(item);
    await store.addMembership({ kbId, itemId: item.itemId });
  }
  for (const edge of FIXTURE_EDGES) await store.putEdge(edge);
  for (const pack of fixturePacks(kbId)) await store.putPack(pack);
  await service.recompile(kbId);
  compiled = (await service.liveCompile(kbId))!;
});

const openingState = (hands: Record<Seat, Card[]>): GameState =>
  initialState("t1", "N", "none", hands);

describe("auction decisions", () => {
  it("opens 1NT on 16 balanced via the $setting range", async () => {
    const decider = createKbDecider({ compiled, player: basePlayer });
    const hands = dealFor("N", "SA SK S4 S3 HK HQ H2 DQ DJ D2 C4 C3 C2");
    const d = await decider.decideBid(openingState(hands), "N");
    expect(d.action).toBe("1N");
    expect(d.fallback).toBe(false);
    expect(d.matchedRuleId).toBe("ki_open_1nt.open");
    expect(d.citedSettings.map((s) => s.key)).toContain("nt_range");
  });

  it("the range moves when the setting override moves", async () => {
    const decider = createKbDecider({
      compiled,
      player: { ...basePlayer, settingOverrides: { nt_range: { low: 10, high: 12 } } },
    });
    // 11 HCP balanced: SA SQ (6) + HK (3) + DQ (2) = 11
    const hands = dealFor("N", "SA SQ S4 S3 HK H3 H2 DQ D3 D2 C4 C3 C2");
    const d = await decider.decideBid(openingState(hands), "N");
    expect(d.action).toBe("1N");
    expect(d.matchedRuleId).toBe("ki_open_1nt.open");
  });

  it("bids Stayman over partner's 1NT; the enable gate turns it off", async () => {
    const hands = dealFor("S", "SQ SJ S9 S8 HK HQ H2 D5 D4 D3 C7 C6 C5");
    const state = openingState(hands);
    state.auction = [
      { seat: "N", call: "1N" },
      { seat: "E", call: "P" },
    ];
    state.turn = "S";

    const on = createKbDecider({ compiled, player: basePlayer });
    const dOn = await on.decideBid(state, "S");
    expect(dOn.action).toBe("2C");
    expect(dOn.matchedRuleId).toBe("ki_stayman.ask");

    const off = createKbDecider({
      compiled,
      player: { ...basePlayer, settingOverrides: { stayman_on: false } },
    });
    const dOff = await off.decideBid(state, "S");
    expect(dOff.matchedRuleId).not.toBe("ki_stayman.ask");
    expect(dOff.action).toBe("P"); // nothing else applies → fallback item
    expect(dOff.fallback).toBe(true);
    expect(dOff.reason).toMatch(/fallback/);
    expect(dOff.reason).not.toMatch(/ENGINE FLOOR/);
  });

  it("level_capped ignores rules from packs above the player's tier", async () => {
    const hands = dealFor("S", "SQ SJ S9 S8 HK HQ H2 D5 D4 D3 C7 C6 C5");
    const state = openingState(hands);
    state.auction = [
      { seat: "N", call: "1N" },
      { seat: "E", call: "P" },
    ];
    state.turn = "S";

    const capped = createKbDecider({
      compiled,
      player: { ...basePlayer, decisionPolicyId: "level_capped", levelOrdinal: 1 },
    });
    const d = await capped.decideBid(state, "S");
    expect(d.matchedRuleId).not.toBe("ki_stayman.ask"); // tier 2 > cap 1
    expect(d.action).toBe("P");
  });

  it("uses the engine floor — honestly labeled — when a pack has no fallback", async () => {
    const bare = createKbDecider({
      compiled,
      player: { ...basePlayer, enabledPackIds: ["pk_bare_openings"] },
    });
    // 5 HCP: nothing matches, and pk_bare_openings carries no fallback item.
    const hands = dealFor("N", "S5 S4 S3 H5 H4 H3 D5 D4 D3 C5 C4 CK C2");
    const d = await bare.decideBid(openingState(hands), "N");
    expect(d.action).toBe("P");
    expect(d.fallback).toBe(true);
    expect(d.reason).toMatch(/ENGINE FLOOR/);
  });

  it("weighted_random is deterministic under the same seed", async () => {
    const hands = dealFor("N", "SA SK S4 S3 HK HQ H2 DQ DJ D2 C4 C3 C2");
    const a = await createKbDecider({
      compiled,
      player: { ...basePlayer, decisionPolicyId: "weighted_random" },
      seed: "session_1",
    }).decideBid(openingState(hands), "N");
    const b = await createKbDecider({
      compiled,
      player: { ...basePlayer, decisionPolicyId: "weighted_random" },
      seed: "session_1",
    }).decideBid(openingState(hands), "N");
    expect(a.action).toBe(b.action);
    expect(a.matchedRuleId).toBe(b.matchedRuleId);
  });
});

describe("the acceptance chain: edit → recompile → behavior change", () => {
  it("editing 2♣ from 22+ to <10 makes the player open 2♣ on junk", async () => {
    // 8 HCP, not balanced-in-range, no five-card major: passes today.
    const hands = dealFor("N", "SQ SJ S9 S8 HK H4 H2 D5 D4 D3 C7 C6 C5");
    const before = await createKbDecider({ compiled, player: basePlayer }).decideBid(
      openingState(hands),
      "N",
    );
    expect(before.action).toBe("P");

    // The owner's nonsense edit, exactly as the spec demands it must work.
    await service.saveItem(
      kbId,
      "ki_open_2c",
      {
        payload: {
          kind: "auction_rules",
          rules: [
            {
              key: "open",
              label: "2♣ with less than 10 (nonsense, on purpose)",
              context: { role: "opening" },
              conditions: { hcp: { max: 9 } },
              action: { type: "bid", level: 2, strain: "C" },
              priority: 5,
            },
          ],
        },
      },
      "u_owner",
    );

    const recompiled = (await service.liveCompile(kbId))!;
    expect(recompiled.version).toBeGreaterThan(compiled.version);

    const after = await createKbDecider({ compiled: recompiled, player: basePlayer }).decideBid(
      openingState(hands),
      "N",
    );
    expect(after.action).toBe("2C");
    expect(after.matchedRuleId).toBe("ki_open_2c.open");

    // Old sessions pinned to the previous compile still see the old behavior.
    const pinned = await createKbDecider({ compiled, player: basePlayer }).decideBid(
      openingState(hands),
      "N",
    );
    expect(pinned.action).toBe("P");
  });
});

describe("self-play simulation", () => {
  it("a minimally complete player finishes every deal with zero floor events", async () => {
    const report = await simulateSelfPlay({
      compiled,
      player: { ...basePlayer, enabledPackIds: ["pk_floor"] },
      deals: 8,
      seed: 42,
    });
    expect(report.completed).toBe(8);
    expect(report.engineFloorEvents).toBe(0);
  });

  it("the full ladder also completes cleanly", async () => {
    const report = await simulateSelfPlay({
      compiled,
      player: basePlayer,
      deals: 8,
      seed: 7,
    });
    expect(report.completed).toBe(8);
    expect(report.engineFloorEvents).toBe(0);
  });

  it("reports per-rule usage keyed by compiled ruleIds", async () => {
    const report = await simulateSelfPlay({
      compiled,
      player: basePlayer,
      deals: 8,
      seed: 7,
    });
    const known = new Set(
      [
        ...compiled.auctionRules,
        ...compiled.forcingRules,
        ...compiled.leadRules,
        ...compiled.playRules,
        ...compiled.fallbacks,
      ].map((r) => r.ruleId),
    );
    const used = Object.keys(report.ruleUsage);
    expect(used.length).toBeGreaterThan(0);
    for (const ruleId of used) expect(known.has(ruleId)).toBe(true);
    for (const n of Object.values(report.ruleUsage)) expect(n).toBeGreaterThan(0);
  });

  it("an incomplete player hits the floor — measurably", async () => {
    const report = await simulateSelfPlay({
      compiled,
      player: { ...basePlayer, enabledPackIds: ["pk_bare_openings"] },
      deals: 4,
      seed: 11,
    });
    expect(report.completed).toBe(4); // the floor keeps the game legal…
    expect(report.engineFloorEvents).toBeGreaterThan(0); // …but is counted honestly
  });
});

// Partnership-inference layer (Knowledge Rework, Pillar A): meaning attribution
// (explicit / derived / shows-nothing), accumulation + intersection, ask
// decoding with combined arithmetic, agreed-suit derivation, memoized
// determinism, every new predicate incl. boundary semantics, and the English
// each renders through the trace (explainFailures → describe/explainPredicate).

import type { AuctionCall, Card, Seat, Suit } from "@bridge/events";
import type { CompiledAuctionRule, CompiledKb, KnowledgeItem } from "@bridge/kb";
import { compileKb } from "@bridge/kb";
import { describe, expect, it } from "vitest";
import { initialState, type GameState } from "../state";
import { analyzeSeat, type SeatAuctionFacts } from "./auctionContext";
import { createKbDecider, type KbPlayerConfig } from "./decider";
import { evalCondition, explainFailures, type ConditionEnv } from "./handConditions";
import { inferPartnership, type PartnershipInference } from "./inference";

const rankOf: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};
const hand = (spec: string): Card[] =>
  spec.split(/\s+/).map((t) => ({ suit: t[0] as Suit, rank: rankOf[t[1]!]! as Card["rank"] }));
const calls = (...list: [Seat, string][]): AuctionCall[] =>
  list.map(([seat, call]) => ({ seat, call: call as AuctionCall["call"] }));

const NOW = "2026-07-24T00:00:00.000Z";
let itemSeq = 0;
function item(overrides: Record<string, unknown>): KnowledgeItem {
  return {
    sourceReferences: [{ sourceId: "src", anchor: "t" }],
    supportedLevels: [],
    status: "approved",
    version: 1,
    createdBy: "u",
    createdAt: NOW,
    updatedAt: NOW,
    settings: [],
    itemId: `ki_${itemSeq++}`,
    title: "T",
    humanReadableText: "t",
    knowledgeType: "agreement",
    phase: "auction",
    ...overrides,
  } as unknown as KnowledgeItem;
}

/** Compile a set of auction_rules items into a CompiledKb (no packs/gates). */
function compileRules(items: KnowledgeItem[]): CompiledKb {
  const res = compileKb({
    kbId: "kb_t",
    version: 1,
    compiledAt: NOW,
    items,
    edges: [],
    packs: [],
  });
  if (!res.compiled) throw new Error(`compile failed: ${JSON.stringify(res.errors)}`);
  return res.compiled;
}

const surfaceOf = (compiled: CompiledKb): { auctionRules: CompiledAuctionRule[] } => ({
  auctionRules: compiled.auctionRules,
});

// --- the fixture system: openings, responses, rebids, and a keycard ask ------
const OPEN_1H = item({
  itemId: "ki_open1h",
  payload: {
    kind: "auction_rules",
    rules: [
      {
        key: "open",
        label: "Open 1H",
        context: { role: "opening" },
        conditions: { all: [{ hcp: { min: 12, max: 21 } }, { suitLength: { suit: "H", min: 5 } }] },
        action: { type: "bid", level: 1, strain: "H" },
        priority: 10,
      },
    ],
  },
});

const RESPOND = item({
  itemId: "ki_resp",
  payload: {
    kind: "auction_rules",
    rules: [
      {
        // A raise: names hearts by raising partner → agreed suit (explicit).
        key: "raise_h",
        label: "Raise to 2H",
        context: { role: "responder", partnerLast: { kind: "bid", level: 1, strains: ["H"] } },
        conditions: { all: [{ hcp: { min: 6, max: 10 } }, { suitLength: { suit: "H", min: 3 } }] },
        action: { type: "raise_partner", toLevel: 2 },
        priority: 10,
      },
      {
        // A 1S response: shows spade length, does NOT name hearts.
        key: "resp_1s",
        label: "Respond 1S",
        context: { role: "responder", partnerLast: { kind: "bid", level: 1, strains: ["H"] } },
        conditions: { all: [{ hcp: { min: 6 } }, { suitLength: { suit: "S", min: 4 } }] },
        action: { type: "bid", level: 1, strain: "S" },
        priority: 20,
      },
      {
        // Jacoby-style: shows 4+ hearts with an EXPLICIT `shows` while bidding NT.
        key: "jacoby",
        label: "Jacoby 2NT",
        context: { role: "responder", partnerLast: { kind: "bid", level: 1, strains: ["H"] } },
        conditions: { hcp: { min: 13 } },
        action: { type: "bid", level: 2, strain: "N" },
        shows: { hcp: { min: 13 }, suits: [{ suit: "H", min: 4 }] },
        priority: 30,
      },
    ],
  },
});

const REBID = item({
  itemId: "ki_rebid",
  payload: {
    kind: "auction_rules",
    rules: [
      {
        key: "jump_h",
        label: "Jump rebid 3H",
        context: { role: "opener", ownFirst: { kind: "bid", level: 1, strains: ["H"] } },
        conditions: { all: [{ hcp: { min: 16, max: 18 } }, { suitLength: { suit: "H", min: 6 } }] },
        action: { type: "bid", level: 3, strain: "H" },
        priority: 10,
      },
    ],
  },
});

const ASK = item({
  itemId: "ki_ask",
  payload: {
    kind: "auction_rules",
    rules: [
      {
        key: "blackwood",
        label: "Blackwood 4NT",
        context: { role: "any", ownLast: { kind: "bid", level: 1, strains: ["S"] } },
        conditions: { hcp: { min: 15 } },
        action: { type: "bid", level: 4, strain: "N" },
        ask: { id: "blackwood", responses: { "5D": { keycards: [1, 4] }, "5H": { keycards: [2] } } },
        priority: 10,
      },
      {
        // Partner's reply rule — matches only while a Blackwood ask is pending.
        key: "reply_1ace",
        label: "One keycard",
        context: { role: "any", askInProgress: "blackwood" },
        conditions: { keycards: { suit: "S", min: 1, max: 1 } },
        action: { type: "bid", level: 5, strain: "D" },
        priority: 10,
      },
    ],
  },
});

describe("meaning attribution", () => {
  const compiled = compileRules([OPEN_1H, RESPOND, REBID]);
  const surface = surfaceOf(compiled);

  it("attributes a partner's opening from its derived shows", () => {
    // N opens 1H; S is responder deciding next.
    const inf = inferPartnership(calls(["N", "1H"], ["E", "P"]), "S", "none", surface);
    expect(inf.partnerShown.hcpMin).toBe(12);
    expect(inf.partnerShown.hcpMax).toBe(21);
    expect(inf.partnerShown.suitMin.H).toBe(5);
  });

  it("uses an EXPLICIT shows over the conditions when present", () => {
    // N 1H, S 2NT (Jacoby) — 2NT's shows says 4+ hearts though it bids NT.
    const auction = calls(["N", "1H"], ["E", "P"], ["S", "2N"], ["W", "P"]);
    const infForN = inferPartnership(auction, "N", "none", surface);
    // From N's view, partner (S) has shown 4+ hearts and 13+ HCP.
    expect(infForN.partnerShown.suitMin.H).toBe(4);
    expect(infForN.partnerShown.hcpMin).toBe(13);
  });

  it("a call no rule realizes to (fallback / opponents) shows nothing", () => {
    // E's 1H is an opponent's bid; it never enters our shown state.
    const inf = inferPartnership(calls(["E", "1H"], ["S", "P"]), "N", "none", surface);
    expect(inf.partnerShown.hcpMin).toBeUndefined();
    expect(inf.partnerShown.suitMin.H).toBeUndefined();
  });

  it("intersects bounds across a partner's several calls (tightest wins)", () => {
    // N 1H (12–21, 5+H) then N jump-rebids 3H (16–18, 6+H) → floor 16, ceiling 18, 6+H.
    const auction = calls(
      ["N", "1H"], ["E", "P"], ["S", "1S"], ["W", "P"], ["N", "3H"], ["E", "P"],
    );
    const inf = inferPartnership(auction, "S", "none", surface);
    expect(inf.partnerShown.hcpMin).toBe(16);
    expect(inf.partnerShown.hcpMax).toBe(18);
    expect(inf.partnerShown.suitMin.H).toBe(6);
  });
});

describe("agreed suit derivation", () => {
  const compiled = compileRules([OPEN_1H, RESPOND, REBID]);
  const surface = surfaceOf(compiled);

  it("explicit: a suit both partners named (a raise)", () => {
    // N 1H, S 2H (raise) — both named hearts → agreed H.
    const auction = calls(["N", "1H"], ["E", "P"], ["S", "2H"], ["W", "P"]);
    expect(inferPartnership(auction, "N", "none", surface).agreedSuit).toBe("H");
  });

  it("inferred: an 8-card fit from shown lengths (neither raised)", () => {
    // N 1H (5+H shown), S 2NT (4+H shown, bids NT) → combined 9 → agreed H.
    const auction = calls(["N", "1H"], ["E", "P"], ["S", "2N"], ["W", "P"]);
    const inf = inferPartnership(auction, "N", "none", surface);
    expect(inf.partnerShown.suitMin.H).toBe(4);
    expect(inf.selfShown.suitMin.H).toBe(5);
    expect(inf.agreedSuit).toBe("H");
  });

  it("none: no common suit and no 8-card fit", () => {
    // N 1H (5H), S 1S (4S) — H combined 5, S combined 4 → no agreement.
    const auction = calls(["N", "1H"], ["E", "P"], ["S", "1S"], ["W", "P"]);
    expect(inferPartnership(auction, "N", "none", surface).agreedSuit).toBeUndefined();
  });
});

describe("ask decoding + askInProgress", () => {
  const compiled = compileRules([ASK]);
  const surface = surfaceOf(compiled);
  // S bid 1S then 4NT (Blackwood); N replied 5D (1 or 4 keycards).
  const auction = calls(
    ["S", "1S"], ["W", "P"], ["N", "2S"], ["E", "P"],
    ["S", "4N"], ["W", "P"], ["N", "5D"], ["E", "P"],
  );

  it("decodes partner's reply into partnerShownKeycards", () => {
    const inf = inferPartnership(auction, "S", "none", surface);
    expect(inf.partnerShownKeycards).toEqual([1, 4]);
  });

  it("flags askInProgress for the responder (partner just asked)", () => {
    // After S's 4NT and W's pass, it is N's turn to reply to the ask.
    const pending = calls(["S", "1S"], ["W", "P"], ["N", "2S"], ["E", "P"], ["S", "4N"], ["W", "P"]);
    const inf = inferPartnership(pending, "N", "none", surface);
    expect(inf.askInProgress).toBe("blackwood");
    // The asker (S) sees no ask pending against themselves.
    expect(inferPartnership(pending, "S", "none", surface).askInProgress).toBeUndefined();
  });
});

// --- predicate boundary semantics via hand-built inference facts --------------

const emptyShown = () => ({ suitMin: {}, suitMax: {} });
function factsWith(inf: Partial<PartnershipInference>): SeatAuctionFacts {
  const f = analyzeSeat([], "S");
  f.inference = { partnerShown: emptyShown(), selfShown: emptyShown(), ...inf };
  return f;
}
const envWith = (inf: Partial<PartnershipInference>): ConditionEnv => ({
  values: {},
  facts: factsWith(inf),
  consulted: new Set(),
});
// 15 HCP, 5-3-3-2. Three aces (SA HA DA) + the spade king → keycards(S) = 4.
const A_HAND = hand("SA SK S5 S4 S3 HA H7 H6 DA D7 D6 C3 C2");

describe("partnership predicates — boundary semantics", () => {
  it("partnerShownHcp: floor and ceiling", () => {
    const env = envWith({ partnerShown: { ...emptyShown(), hcpMin: 6, hcpMax: 9 } });
    expect(evalCondition({ partnerShownHcp: { min: 6 } }, A_HAND, env)).toBe(true);
    expect(evalCondition({ partnerShownHcp: { min: 7 } }, A_HAND, env)).toBe(false);
    expect(evalCondition({ partnerShownHcp: { max: 9 } }, A_HAND, env)).toBe(true);
    expect(evalCondition({ partnerShownHcp: { max: 8 } }, A_HAND, env)).toBe(false);
    // No inference at all → floor 0, ceiling unknown.
    const bare = envWith({});
    expect(evalCondition({ partnerShownHcp: { min: 1 } }, A_HAND, bare)).toBe(false);
    expect(evalCondition({ partnerShownHcp: { max: 9 } }, A_HAND, bare)).toBe(false);
  });

  it("partnerShownLength: per-suit floor", () => {
    const env = envWith({ partnerShown: { suitMin: { S: 4 }, suitMax: {} } });
    expect(evalCondition({ partnerShownLength: { suit: "S", min: 4 } }, A_HAND, env)).toBe(true);
    expect(evalCondition({ partnerShownLength: { suit: "S", min: 5 } }, A_HAND, env)).toBe(false);
  });

  it("combinedHcp: my HCP + partner floor (min) / ceiling (max)", () => {
    // A_HAND = 15 HCP (SA HA DA = 12, SK = 3). Partner shown 6–9.
    const env = envWith({ partnerShown: { ...emptyShown(), hcpMin: 6, hcpMax: 9 } });
    expect(evalCondition({ combinedHcp: { min: 21 } }, A_HAND, env)).toBe(true); // 15+6
    expect(evalCondition({ combinedHcp: { min: 22 } }, A_HAND, env)).toBe(false);
    expect(evalCondition({ combinedHcp: { max: 24 } }, A_HAND, env)).toBe(true); // 15+9
    expect(evalCondition({ combinedHcp: { max: 23 } }, A_HAND, env)).toBe(false);
    // Unknown partner ceiling → a combined max can't be bounded → fails.
    const noCeil = envWith({ partnerShown: { ...emptyShown(), hcpMin: 6 } });
    expect(evalCondition({ combinedHcp: { max: 40 } }, A_HAND, noCeil)).toBe(false);
    expect(evalCondition({ combinedHcp: { min: 21 } }, A_HAND, noCeil)).toBe(true);
  });

  it("combinedKeycards + keycardsMissing: agreed suit + decoded reply", () => {
    // Agreed spades: A_HAND keycards for S = 3 aces + SK = 4. Partner shows [1,4].
    const env = envWith({
      agreedSuit: "S",
      partnerShownKeycards: [1, 4],
      partnerShown: emptyShown(),
    });
    // Combined range = 4 + [1..4] = [5, 8].
    expect(evalCondition({ combinedKeycards: { min: 5 } }, A_HAND, env)).toBe(true);
    expect(evalCondition({ combinedKeycards: { min: 6 } }, A_HAND, env)).toBe(false);
    // Missing = 5 − combined → range [5−8, 5−5] = [−3, 0]. Missing at most 0 holds.
    expect(evalCondition({ keycardsMissing: { max: 0 } }, A_HAND, env)).toBe(true);
    // "Missing two" (sign off) requires guaranteed floor ≥ 2 → false here.
    expect(evalCondition({ keycardsMissing: { min: 2 } }, A_HAND, env)).toBe(false);
    // Sign-off case: partner shows [0], combined = 4 → missing exactly 1, not ≥2.
    const one = envWith({ agreedSuit: "S", partnerShownKeycards: [0], partnerShown: emptyShown() });
    expect(evalCondition({ keycardsMissing: { min: 1 } }, A_HAND, one)).toBe(true);
    expect(evalCondition({ keycardsMissing: { min: 2 } }, A_HAND, one)).toBe(false);
    // No agreed suit or no reply → both fail (can't confirm).
    expect(evalCondition({ combinedKeycards: { min: 1 } }, A_HAND, envWith({}))).toBe(false);
  });

  it("fitEstablished: named / any / any_major with own + shown length", () => {
    // A_HAND: 5 spades. Partner shown 4 spades → combined 9.
    const env = envWith({ partnerShown: { suitMin: { S: 4 }, suitMax: {} } });
    expect(evalCondition({ fitEstablished: { suit: "S" } }, A_HAND, env)).toBe(true);
    expect(evalCondition({ fitEstablished: { suit: "S", minCombined: 9 } }, A_HAND, env)).toBe(true);
    expect(evalCondition({ fitEstablished: { suit: "S", minCombined: 10 } }, A_HAND, env)).toBe(false);
    expect(evalCondition({ fitEstablished: { suit: "any_major" } }, A_HAND, env)).toBe(true);
    expect(evalCondition({ fitEstablished: {} }, A_HAND, env)).toBe(true); // "any"
    // Only a minor shown → no major fit.
    const minor = envWith({ partnerShown: { suitMin: { C: 6 }, suitMax: {} } });
    expect(evalCondition({ fitEstablished: { suit: "any_major" } }, A_HAND, minor)).toBe(false);
  });

  it("unshownSupport: hold min+ but not yet shown that length", () => {
    // A_HAND: 5 spades. I've shown only 2 → delayed support present at 3+/4/5.
    const env = envWith({ selfShown: { suitMin: { S: 2 }, suitMax: {} }, partnerShown: emptyShown() });
    expect(evalCondition({ unshownSupport: { suit: "S", min: 3 } }, A_HAND, env)).toBe(true);
    expect(evalCondition({ unshownSupport: { suit: "S", min: 4 } }, A_HAND, env)).toBe(true);
    expect(evalCondition({ unshownSupport: { suit: "S", min: 6 } }, A_HAND, env)).toBe(false); // hold only 5
    // Already shown 4 → not "unshown".
    const shown = envWith({ selfShown: { suitMin: { S: 4 }, suitMax: {} }, partnerShown: emptyShown() });
    expect(evalCondition({ unshownSupport: { suit: "S", min: 4 } }, A_HAND, shown)).toBe(false);
  });
});

describe("English for every partnership construct (via the trace)", () => {
  const env = envWith({});
  const need = (cond: Parameters<typeof evalCondition>[0]) => explainFailures(cond, A_HAND, env)[0];

  it("renders each needed-string", () => {
    expect(need({ partnerShownHcp: { min: 6 } })).toContain("partner has shown 6+ HCP");
    expect(need({ partnerShownLength: { suit: "S", min: 4 } })).toContain(
      "partner has shown 4+ cards in ♠",
    );
    expect(need({ combinedHcp: { min: 33 } })).toContain("33+ combined HCP");
    expect(need({ combinedKeycards: { min: 4 } })).toContain("4+ combined keycards");
    expect(need({ keycardsMissing: { min: 2 } })).toContain("2+ keycards missing");
    expect(need({ fitEstablished: { suit: "any_major" } })).toContain("8+ card fit in a major");
    expect(need({ fitEstablished: { suit: "S", minCombined: 9 } })).toContain("9+ card fit in ♠");
    expect(need({ unshownSupport: { suit: "H", min: 5 } })).toContain(
      "undisclosed 5+ support in ♥",
    );
  });
});

describe("agreed_suit resolves inside bid_suit + memoized decider", () => {
  const compiled = compileRules([OPEN_1H, RESPOND, REBID]);
  const player: KbPlayerConfig = { enabledPackIds: [], settingOverrides: {}, decisionPolicyId: "first_match" };

  const raiseState = (): GameState => {
    // N 1H, E P, S 2H, W P — hearts agreed; it's N's turn again.
    const hands: Record<Seat, Card[]> = {
      // 21 HCP, 5 hearts — opener strong enough for the jump-to-fit rule.
      N: hand("SA SK S3 HA HK HQ HJ HT DA D7 D6 C3 C2"),
      E: [], S: [], W: [],
    };
    const s = initialState("t1", "N", "none", hands);
    s.auction = calls(["N", "1H"], ["E", "P"], ["S", "2H"], ["W", "P"]);
    s.turn = "N";
    return s;
  };

  it("a bid_suit on agreed_suit targets the fit (hearts)", async () => {
    const kb = compileRules([
      OPEN_1H,
      RESPOND,
      item({
        itemId: "ki_slam",
        payload: {
          kind: "auction_rules",
          rules: [
            {
              key: "jump_fit",
              label: "Jump to game in the fit",
              context: { role: "opener", partnerLast: { kind: "bid", level: 2, strains: ["H"] } },
              conditions: { hcp: { min: 18 } },
              action: { type: "bid_suit", suit: "agreed_suit", level: 4 },
              priority: 5,
            },
          ],
        },
      }),
    ]);
    const decider = createKbDecider({ compiled: kb, player });
    const d = await decider.decideBid(raiseState(), "N");
    expect(d.action).toBe("4H"); // agreed_suit resolved to hearts, hand-free
    expect(d.matchedRuleId).toBe("ki_slam.jump_fit");
  });

  it("inference is deterministic across repeated calls (memo-safe)", () => {
    const auction = calls(["N", "1H"], ["E", "P"], ["S", "2H"], ["W", "P"]);
    const surface = surfaceOf(compiled);
    const a = inferPartnership(auction, "N", "none", surface);
    const b = inferPartnership(auction, "N", "none", surface);
    expect(a).toEqual(b);
  });

  it("a decider produces identical decisions on the same state (memo hit)", async () => {
    const decider = createKbDecider({ compiled, player });
    const s = raiseState();
    const d1 = await decider.decideBid(s, "N");
    const d2 = await decider.decideBid(s, "N");
    expect(d1.action).toBe(d2.action);
    expect(d1.matchedRuleId).toBe(d2.matchedRuleId);
  });
});

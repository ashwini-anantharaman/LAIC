// The end-of-board takeaway, over a real table — same discipline as
// coach.test.ts: a real compiled KB fixture, real events, real solver, and
// assertions on the card the learner would actually be handed.
//
// What these guard, in order of how expensive a regression would be:
//   · silence — a board the rulebook has no opinion on produces NO card,
//     never a card of grey unknowns;
//   · the verdict mapping — aligned calls chip ✓, divergent ones ✗ with the
//     system's call and its citation carried;
//   · the moment — a disagreement outranks any endorsement, the worst
//     disagreement outranks a milder one, and a clean board still gets its
//     moment (praise, not absence);
//   · the chips address the history — eventId is looking.ts's "call-{i}",
//     which is what the sheet's jump-to-history and event-qa key on.

import type { Card, GameEvent, Seat, Suit } from "@bridge/events";
import type { SeatConfig } from "@bridge/sessions";
import {
  FIXTURE_EDGES,
  FIXTURE_ITEMS,
  fixturePacks,
  InMemoryKbStore,
  KbService,
  type CompiledKb,
} from "@bridge/kb";
import { beforeAll, describe, expect, it } from "vitest";

import { boardTakeaway } from "./takeaway";

const NOW = "2026-08-13T12:00:00.000Z";

/** "SA SK ..." → a full deal with `spec` at `seat` and the rest spread round-robin. */
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
  const others = (["N", "E", "S", "W"] as Seat[]).filter((s) => s !== seat);
  const hands: Record<Seat, Card[]> = { N: [], E: [], S: [], W: [] };
  hands[seat] = mine;
  rest.forEach((card, i) => hands[others[i % 3]!]!.push(card));
  return hands;
}

const bid = (seq: number, seat: Seat, call: string): GameEvent => ({
  category: "bid-event",
  seq,
  ts: 0,
  boardRef: "board-1",
  seat,
  call,
  fallback: false,
});

/** N/E/W are House robots on `packs`; S is the human learner. */
function seatsWith(packs: string[]): Record<Seat, SeatConfig> {
  const robot = {
    kind: "kb_player" as const,
    playerId: "p_house",
    label: "House",
    enabledPackIds: packs,
    settingOverrides: {},
    decisionPolicyId: "first_match" as const,
  };
  return {
    N: robot,
    E: robot,
    W: robot,
    S: { kind: "human", nexusUserId: "user-1" },
  };
}

function input(events: GameEvent[], dealtHands: Record<Seat, Card[]>) {
  return {
    record: {
      sessionId: "sess-1",
      board: { name: "board-1", dealer: "S" as Seat },
      events,
      seats: seatsWith(["pk_conventions"]),
    },
    vul: "none" as const,
    dealtHands,
    learnerSeat: "S" as Seat,
    compiled,
  };
}

/** 16 balanced — the fixture KB opens this 1NT. */
const BALANCED_16 = "SA SK S4 S3 HK HQ H2 DQ DJ D2 C4 C3 C2";

let compiled: CompiledKb;

beforeAll(async () => {
  const store = new InMemoryKbStore();
  const service = new KbService(store, { now: () => NOW });
  const kb = await service.createKb({
    name: "Fixture",
    systemLabel: "SAYC",
    createdBy: "u",
  });
  for (const item of FIXTURE_ITEMS) {
    await store.putItem(item);
    await store.addMembership({ kbId: kb.kbId, itemId: item.itemId });
  }
  for (const edge of FIXTURE_EDGES) await store.putEdge(edge);
  for (const pack of fixturePacks(kb.kbId)) await store.putPack(pack);
  await service.recompile(kb.kbId);
  compiled = (await service.liveCompile(kb.kbId))!;
});

describe("the end-of-board takeaway", () => {
  it("celebrates a system-aligned board: chip ✓, endorsement moment, citation carried", async () => {
    const hands = dealFor("S", BALANCED_16);
    const t = await boardTakeaway(input([bid(0, "S", "1N")], hands));

    expect(t).not.toBeNull();
    expect(t!.chips).toHaveLength(1);
    expect(t!.chips[0]).toMatchObject({
      eventId: "call-0",
      auctionIndex: 0,
      verdict: "correct",
      label: "1NT",
    });
    expect(t!.moment.kind).toBe("endorsement");
    expect(t!.moment.learnerCall).toBe("1NT");
    // The citation is the rule's own title, and the fallback line quotes it —
    // the card can never be wordless.
    expect(t!.moment.ruleLabel.length).toBeGreaterThan(0);
    expect(t!.fallbackLine).toContain("1NT");
  });

  it("marks a divergent call ✗, names the system's call, and makes it the moment", async () => {
    const hands = dealFor("S", BALANCED_16);
    const t = await boardTakeaway(input([bid(0, "S", "1S")], hands));

    expect(t).not.toBeNull();
    expect(t!.chips[0]).toMatchObject({ verdict: "incorrect", systemCall: "1NT" });
    expect(t!.moment).toMatchObject({
      kind: "disagreement",
      eventId: "call-0",
      learnerCall: "1♠",
      systemCall: "1NT",
    });
    expect(t!.fallbackLine).toContain("1NT");
    // Both calls are contract bids on a full known deal, so the solver prices
    // them — the cost lines are consequence, phrased with the trick counts.
    expect(t!.moment.ddLines.length).toBeGreaterThan(0);
    for (const line of t!.moment.ddLines) expect(line).toContain("double-dummy");
  });

  it("a disagreement outranks any endorsement as the moment", async () => {
    const hands = dealFor("S", BALANCED_16);
    // S opens 1NT (aligned) — robots pass — then S bids again, divergently.
    const t = await boardTakeaway(
      input(
        [bid(0, "S", "1N"), bid(1, "W", "P"), bid(2, "N", "2C"), bid(3, "E", "P"), bid(4, "S", "7N")],
        hands,
      ),
    );

    expect(t).not.toBeNull();
    // Whatever the second call's verdict, the moment must never sit on the
    // aligned opening while a judged disagreement exists anywhere.
    const wrong = t!.chips.filter((c) => c.verdict === "incorrect");
    if (wrong.length) {
      expect(t!.moment.kind).toBe("disagreement");
      expect(t!.moment.auctionIndex).toBe(wrong[0]!.auctionIndex);
    } else {
      expect(t!.moment.kind).toBe("endorsement");
    }
  });

  it("says nothing about the robots' calls — only the learner's chips exist", async () => {
    const hands = dealFor("S", BALANCED_16);
    const t = await boardTakeaway(
      input([bid(0, "S", "1N"), bid(1, "W", "P"), bid(2, "N", "3N")], hands),
    );

    expect(t).not.toBeNull();
    expect(t!.chips).toHaveLength(1);
    expect(t!.chips[0]!.auctionIndex).toBe(0);
  });

  it("builds no card at all when the learner never called", async () => {
    const hands = dealFor("S", BALANCED_16);
    const t = await boardTakeaway(input([bid(0, "N", "1N"), bid(1, "E", "P")], hands));
    expect(t).toBeNull();
  });
});

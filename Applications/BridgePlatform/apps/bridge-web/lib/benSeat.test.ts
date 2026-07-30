// The BEN seat's whole decision surface, with a stubbed client and a stubbed
// fallback — no BEN container, no compiled KB. What must hold:
//
//   · bids and cards go through when legal, carrying BEN's own explanation;
//   · anything wrong (endpoint down, illegal answer, unreadable answer)
//     DEGRADES to an honest decision instead of throwing — the table never
//     breaks because BEN is down;
//   · the dummy's turn is requested AS THE DECLARER (BEN's /play infers who is
//     on play from `played`), and the opening lead uses /lead.

import { initialState, type GameState } from "@bridge/engine";
import type { Card, Seat, Suit } from "@bridge/events";
import { describe, expect, it } from "vitest";
import type { CompiledKb } from "@bridge/kb";
import {
  benSeatDecider,
  originalHand,
  parseBenCard,
  playedToBen,
  type BenCardResult,
  type BenTableClient,
} from "./benSeat";

const rankOf: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};

/** "SA SK …" (13 cards) → that seat's hand; the rest fill the other seats. */
function dealFor(seat: Seat, spec: string): Record<Seat, Card[]> {
  const mine: Card[] = spec.split(/\s+/).map((t) => ({
    suit: t[0] as Suit,
    rank: rankOf[t[1]!]! as Card["rank"],
  }));
  if (mine.length !== 13) throw new Error(`hand spec has ${mine.length} cards`);
  const used = new Set(mine.map((c) => `${c.suit}${c.rank}`));
  const rest: Card[] = [];
  for (const suit of ["S", "H", "D", "C"] as Suit[]) {
    for (let rank = 2; rank <= 14; rank++) {
      if (!used.has(`${suit}${rank}`)) rest.push({ suit, rank: rank as Card["rank"] });
    }
  }
  const others: Seat[] = (["N", "E", "S", "W"] as Seat[]).filter((s) => s !== seat);
  const hands: Record<Seat, Card[]> = { N: [], E: [], S: [], W: [] };
  hands[seat] = mine;
  rest.forEach((card, i) => hands[others[i % 3]!]!.push(card));
  return hands;
}

const noCard: BenCardResult = { card: "", candidates: [] };

/** A stub client that records every request it gets. */
function stubClient(answers: {
  bid?: string;
  lead?: string;
  play?: string;
  throwOn?: "bid" | "lead" | "play";
}) {
  const calls: { path: string; params: Record<string, string> }[] = [];
  const client: BenTableClient = {
    async bid(params) {
      calls.push({ path: "bid", params });
      if (answers.throwOn === "bid") throw new Error("stub down");
      return {
        bid: (answers.bid ?? "P") as never,
        candidates: [
          { call: (answers.bid ?? "P") as never, insta_score: 0.9, explanation: "stub says so" },
        ],
      };
    },
    async lead(params) {
      calls.push({ path: "lead", params });
      if (answers.throwOn === "lead") throw new Error("stub down");
      return answers.lead ? { card: answers.lead, candidates: [] } : noCard;
    },
    async play(params) {
      calls.push({ path: "play", params });
      if (answers.throwOn === "play") throw new Error("stub down");
      return answers.play ? { card: answers.play, candidates: [] } : noCard;
    },
  };
  return { client, calls };
}

/** A fallback decider that always plays the first legal-ish card / passes. */
const stubFallback = () => ({
  decideBid: async () => ({
    action: "P" as never,
    candidates: ["P" as never],
    trace: [],
    citedSettings: [],
    facts: {},
    reason: "STUB FALLBACK",
    rejected: [],
    fallback: true,
  }),
  decidePlay: async (state: GameState, seat: Seat) => ({
    action: state.hands[seat][0]!,
    candidates: [state.hands[seat][0]!],
    trace: [],
    citedSettings: [],
    facts: {},
    reason: "STUB FALLBACK",
    rejected: [],
    fallback: true,
  }),
});

const FAKE_COMPILED = {} as CompiledKb;
const RECORD = { sessionId: "bs_test" } as never;

function decider(seat: Seat, stub: ReturnType<typeof stubClient>) {
  return benSeatDecider(
    () => stub.client,
    () => stubFallback(),
  )({ record: RECORD, compiled: FAKE_COMPILED, seat });
}

// Auction state: North dealt, N opened 1S, E passed — South (BEN) to call.
function auctionState(): GameState {
  const state = initialState(
    "t",
    "N",
    "none",
    dealFor("S", "SA SK S8 S6 HK HJ H7 H4 D9 D3 CQ C5 C2"),
  );
  state.auction = [
    { seat: "N", call: "1S" as never },
    { seat: "E", call: "P" as never },
  ];
  state.turn = "S";
  return state;
}

// Play state: 4S by South; West on lead. Nothing played yet.
function leadState(): GameState {
  const state = initialState(
    "t",
    "N",
    "none",
    dealFor("W", "SA S8 S6 HK HJ H7 H4 D9 D3 D2 CQ C5 C2"),
  );
  state.auction = [
    { seat: "N", call: "P" as never },
    { seat: "E", call: "P" as never },
    { seat: "S", call: "4S" as never },
    { seat: "W", call: "P" as never },
    { seat: "N", call: "P" as never },
    { seat: "E", call: "P" as never },
  ];
  state.phase = "play";
  state.contract = { level: 4, strain: "S", declarer: "S", doubled: 0 } as never;
  state.turn = "W";
  state.tricks = [{ leader: "W", plays: [] }];
  return state;
}

describe("pure helpers", () => {
  it("parses BEN cards and rejects junk", () => {
    expect(parseBenCard("S7")).toEqual({ suit: "S", rank: 7 });
    expect(parseBenCard("ht")).toEqual({ suit: "H", rank: 10 });
    expect(parseBenCard("10S")).toBeNull();
    expect(parseBenCard("")).toBeNull();
  });

  it("serializes the played sequence in play order", () => {
    const state = leadState();
    state.tricks = [
      {
        leader: "W",
        plays: [
          { seat: "W", card: { suit: "D", rank: 11 } },
          { seat: "N", card: { suit: "D", rank: 13 } },
        ],
      },
    ];
    expect(playedToBen(state)).toBe("DJDK");
  });

  it("reconstructs the original 13-card hand", () => {
    const state = leadState();
    const before = originalHand(state, "W").length;
    // W plays a card: remaining shrinks, original stays 13.
    const played = state.hands.W[0]!;
    state.hands.W = state.hands.W.slice(1);
    state.tricks = [{ leader: "W", plays: [{ seat: "W", card: played }] }];
    expect(before).toBe(13);
    expect(originalHand(state, "W")).toHaveLength(13);
  });
});

describe("bidding", () => {
  it("bids BEN's legal answer with BEN's explanation", async () => {
    const stub = stubClient({ bid: "2C" });
    const d = await decider("S", stub).decideBid(auctionState(), "S");
    expect(d.action).toBe("2C");
    expect(d.reason).toBe("BEN: stub says so");
    expect(d.fallback).toBe(false);
  });

  it("passes with an honest reason when BEN's bid is illegal", async () => {
    const stub = stubClient({ bid: "1C" }); // under 1S — illegal
    const d = await decider("S", stub).decideBid(auctionState(), "S");
    expect(d.action).toBe("P");
    expect(d.reason).toMatch(/not legal here/);
  });

  it("degrades to Pass when BEN is unreachable — never throws", async () => {
    const stub = stubClient({ throwOn: "bid" });
    const d = await decider("S", stub).decideBid(auctionState(), "S");
    expect(d.action).toBe("P");
    expect(d.fallback).toBe(true);
    expect(d.reason).toMatch(/could not be reached/);
  });
});

describe("card play", () => {
  it("uses /lead for the opening lead and accepts a legal card", async () => {
    const state = leadState();
    const wCard = state.hands.W[0]!;
    const tok = (r: number) => ({ 10: "T", 11: "J", 12: "Q", 13: "K", 14: "A" } as Record<number, string>)[r] ?? String(r);
    const leadToken = `${wCard.suit}${tok(wCard.rank)}`;
    const stub = stubClient({ lead: leadToken });
    const d = await decider("W", stub).decidePlay(state, "W");
    expect(stub.calls.map((c) => c.path)).toEqual(["lead"]);
    expect(d.action).toEqual(wCard);
    expect(d.fallback).toBe(false);
  });

  it("asks /play AS THE DECLARER when the dummy is on play", async () => {
    const state = leadState();
    // W led the DJ; dummy (N) is on play. BEN sits at S (declarer).
    const led = state.hands.W.find((c) => c.suit === "D")!;
    state.hands.W = state.hands.W.filter((c) => c !== led);
    state.tricks = [{ leader: "W", plays: [{ seat: "W", card: led }] }];
    state.turn = "N";

    const follow = state.hands.N.find((c) => c.suit === "D") ?? state.hands.N[0]!;
    const tok = (r: number) => ({ 10: "T", 11: "J", 12: "Q", 13: "K", 14: "A" } as Record<number, string>)[r] ?? String(r);
    const token = `${follow.suit}${tok(follow.rank)}`;
    const stub = stubClient({ play: token });

    const d = await decider("S", stub).decidePlay(state, "N");
    expect(stub.calls).toHaveLength(1);
    const req = stub.calls[0]!;
    expect(req.path).toBe("play");
    expect(req.params.seat).toBe("S"); // the declarer, not the dummy
    expect(req.params.played).toBe(`${led.suit}${led.rank === 11 ? "J" : led.rank}`);
    expect(d.action).toEqual(follow);
  });

  it("degrades to the fallback chain on an illegal card, with BEN named", async () => {
    const state = leadState();
    // W must lead; stub answers a card W does not hold.
    const notHeld = ["S", "H", "D", "C"]
      .flatMap((s) => Array.from({ length: 13 }, (_, i) => `${s}${"23456789TJQKA"[i]}`))
      .find((t) => {
        const c = parseBenCard(t)!;
        return !state.hands.W.some((h) => h.suit === c.suit && h.rank === c.rank);
      })!;
    const stub = stubClient({ lead: notHeld });
    const d = await decider("W", stub).decidePlay(state, "W");
    expect(d.fallback).toBe(true);
    expect(d.reason).toMatch(/BEN chose .* not legal here — STUB FALLBACK/);
  });

  it("degrades when BEN is unreachable mid-play — never throws", async () => {
    const state = leadState();
    const stub = stubClient({ throwOn: "lead" });
    const d = await decider("W", stub).decidePlay(state, "W");
    expect(d.fallback).toBe(true);
    expect(d.reason).toMatch(/could not be reached .*STUB FALLBACK/);
  });
});

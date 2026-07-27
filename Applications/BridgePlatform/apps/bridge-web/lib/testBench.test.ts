// Unit tests for the decision-bench input parsers (testBench.ts): hand and
// auction text → engine types, with friendly errors. Pure, no engine state.

import { describe, expect, it } from "vitest";
import { parseHand, parseAuction } from "./testBench";

const ok = <T>(r: T | { error: string }): T => {
  if (r && typeof r === "object" && "error" in r)
    throw new Error(`expected success, got error: ${(r as { error: string }).error}`);
  return r as T;
};
const err = (r: unknown): string => {
  if (!r || typeof r !== "object" || !("error" in r))
    throw new Error("expected an error, got success");
  return (r as { error: string }).error;
};

describe("parseHand", () => {
  it("parses a PBN suit-dot hand in ♠.♥.♦.♣ order", () => {
    const { hand } = ok(parseHand("AKQ2.T94.532.A87"));
    expect(hand).toHaveLength(13);
    // First card is the ♠A.
    expect(hand[0]).toEqual({ suit: "S", rank: 14 });
    // Spades holding is A K Q 2.
    expect(hand.filter((c) => c.suit === "S").map((c) => c.rank)).toEqual([14, 13, 12, 2]);
  });

  it("parses the token format (suit-then-rank)", () => {
    const { hand } = ok(
      parseHand("SA SK SQ S2 HT H9 H4 D5 D3 D2 CA C8 C7"),
    );
    expect(hand).toHaveLength(13);
    expect(hand[0]).toEqual({ suit: "S", rank: 14 });
    expect(hand.some((c) => c.suit === "H" && c.rank === 10)).toBe(true);
  });

  it("accepts both T and 10 for the ten in PBN", () => {
    const withT = ok(parseHand("AKQ2.T94.532.A87"));
    const with10 = ok(parseHand("AKQ2.1094.532.A87"));
    expect(with10.hand).toHaveLength(13);
    expect(with10.hand.filter((c) => c.suit === "H").map((c) => c.rank)).toEqual(
      withT.hand.filter((c) => c.suit === "H").map((c) => c.rank),
    );
  });

  it("accepts H10 as the ten in token format", () => {
    const { hand } = ok(parseHand("SA SK SQ S2 H10 H9 H4 D5 D3 D2 CA C8 C7"));
    expect(hand.some((c) => c.suit === "H" && c.rank === 10)).toBe(true);
  });

  it("rejects a duplicate card", () => {
    // PBN with a repeated ♠A.
    expect(err(parseHand("AAKQ.T94.532.87")).toLowerCase()).toContain("duplicate");
    // Token format repeating the ♥K.
    expect(err(parseHand("SA SK SQ S2 HK HK H4 D5 D3 D2 CA C8 C7")).toLowerCase()).toContain(
      "duplicate",
    );
  });

  it("rejects the wrong number of cards", () => {
    expect(err(parseHand("AKQ.T94.532.A87"))).toContain("need 13");
    expect(err(parseHand("AKQ2J.T94.532.A87"))).toContain("need 13");
  });

  it("rejects empty input", () => {
    expect(err(parseHand("   "))).toBeDefined();
  });

  it("rejects a wrong suit count in PBN", () => {
    expect(err(parseHand("AKQ2.T94.532"))).toContain("4 suits");
  });

  it("rejects a bad token", () => {
    expect(err(parseHand("SA ZZ SQ"))).toBeDefined();
  });
});

describe("parseAuction", () => {
  it("empty input = the dealer's opening decision", () => {
    const { auction, toAct } = ok(parseAuction("", "N"));
    expect(auction).toEqual([]);
    expect(toAct).toBe("N");
  });

  it("rotates seats from the dealer and reports who's next", () => {
    const { auction, toAct } = ok(parseAuction("1N P", "N"));
    expect(auction.map((a) => a.seat)).toEqual(["N", "E"]);
    expect(auction.map((a) => a.call)).toEqual(["1N", "P"]);
    // N, E acted; South is next to act.
    expect(toAct).toBe("S");
  });

  it("normalizes NT/N, PASS, DBL, RDBL", () => {
    // N pass, E 1NT, S doubles (opponent), W redoubles.
    const { auction } = ok(parseAuction("PASS 1NT DBL RDBL", "N"));
    expect(auction.map((a) => a.call)).toEqual(["P", "1N", "X", "XX"]);
    expect(auction[0]!.seat).toBe("N");
  });

  it("normalizes a suit bid's case", () => {
    const { auction } = ok(parseAuction("1h", "S"));
    expect(auction[0]!.call).toBe("1H");
  });

  it("rejects an insufficient bid", () => {
    const e = err(parseAuction("1N 1S", "N"));
    expect(e.toLowerCase()).toContain("insufficient");
  });

  it("rejects a token that isn't a call", () => {
    expect(err(parseAuction("1N frog", "N"))).toContain("isn't a call");
  });

  it("rejects a completed auction (trailing passes end it)", () => {
    // 1N followed by three passes is a complete auction.
    expect(err(parseAuction("1N P P P", "N"))).toBeDefined();
  });

  it("rejects X with no opposing bid to double", () => {
    expect(err(parseAuction("X", "N")).toLowerCase()).toContain("double");
  });

  it("accepts comma- and dash-separated calls", () => {
    const { auction } = ok(parseAuction("1N,P-2S", "N"));
    expect(auction.map((a) => a.call)).toEqual(["1N", "P", "2S"]);
  });
});

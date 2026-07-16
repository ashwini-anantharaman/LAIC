import { describe, expect, it } from "vitest";
import { parseLinToContexts } from "./linAdapter";
import { parsePbn } from "./pbn";
import { validateDeal } from "./context";
import { SAMPLE_LIN, SAMPLE_PBN } from "./fixtures/samples";
import { finalContract } from "@bridge/engine";

describe("LIN adapter", () => {
  it("parses the sample LIN into a normalized context", () => {
    const res = parseLinToContexts(SAMPLE_LIN);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const ctx = res.contexts[0]!;
    expect(ctx.dealer).toBe("S");
    expect(ctx.hands.S.length).toBe(13);
    expect(validateDeal(ctx.hands)).toBeNull();
  });
});

describe("PBN parser", () => {
  it("parses dealer, vulnerability, deal (52 unique) and auction", () => {
    const res = parsePbn(SAMPLE_PBN);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const ctx = res.contexts[0]!;
    expect(ctx.dealer).toBe("N");
    expect(ctx.vul).toBe("none");
    expect(validateDeal(ctx.hands)).toBeNull();
    const total = ctx.hands.N.length + ctx.hands.E.length + ctx.hands.S.length + ctx.hands.W.length;
    expect(total).toBe(52);
    // Auction "N": 1NT Pass 3NT AP  -> N opens 1N, contract 3NT by N.
    expect(ctx.auction[0]).toMatchObject({ seat: "N", call: "1N" });
    const c = finalContract(ctx.auction);
    expect(c).toMatchObject({ level: 3, strain: "N", declarer: "N" });
  });
});

// The partner / partnership views — inference from replayed bid meanings.
//
// The parser reads authored KB prose, so these tests pin the tolerated
// shapes ("12-21 HCP", "15+ points", "5+ spades", "five hearts") and the
// core promise: a meaning that parses becomes a numeric card, a meaning
// that doesn't still surfaces as the bid's own words, and nothing is ever
// invented.

import { describe, expect, it } from "vitest";

import type { Call, Card, Seat } from "@bridge/events";

import { opponentStates, partnershipStates } from "./states";

/** A 10-point hand (A K Q J) with five spades — the "my half" of every sum here. */
const HAND: Card[] = [
  { suit: "S", rank: 14 }, { suit: "S", rank: 13 }, { suit: "S", rank: 5 },
  { suit: "S", rank: 4 }, { suit: "S", rank: 3 },
  { suit: "H", rank: 12 }, { suit: "H", rank: 11 }, { suit: "H", rank: 2 },
  { suit: "D", rank: 10 }, { suit: "D", rank: 9 }, { suit: "D", rank: 3 },
  { suit: "C", rank: 7 }, { suit: "C", rank: 2 },
] as Card[];

const call = (seat: Seat, c: string) => ({ seat, call: c as Call });

describe("partnershipStates — inference from the bids", () => {
  it("is empty while partner has only passed", () => {
    const out = partnershipStates({
      auction: [call("W", "1D"), call("N", "P")],
      seat: "S",
      hand: HAND,
      meanings: [undefined, undefined],
    });
    expect(out).toEqual([]);
  });

  it("reads a range, a suit and the fit out of one opening bid", () => {
    const out = partnershipStates({
      auction: [call("N", "1S"), call("E", "P")],
      seat: "S",
      hand: HAND,
      meanings: [{ label: "1♠", shows: "12-21 HCP, 5+ spades" }, undefined],
    });
    const byTitle = new Map(out.map((c) => [c.title, c]));

    expect(byTitle.get("Partner bid")?.value).toBe("1♠");
    expect(byTitle.get("Partner's points")?.value).toBe("12–21");
    expect(byTitle.get("Partner's suits")?.value).toContain("5+ ♠");
    // 10 of mine + partner's 12–21.
    expect(byTitle.get("Together")?.value).toBe("22–31");
    // Partner's 5 spades + my 5 = a 10-card fit.
    expect(byTitle.get("A fit")?.value).toBe("10+ ♠");
    expect(out.every((c) => c.group === "partner" || c.group === "partnership")).toBe(true);
  });

  it("narrows the range as later bids intersect it", () => {
    const out = partnershipStates({
      auction: [call("N", "1H"), call("E", "P"), call("S", "1S"), call("W", "P"), call("N", "2H")],
      seat: "S",
      hand: HAND,
      meanings: [
        { label: "1♥", shows: "12-21 points, five hearts" },
        undefined,
        { label: "1♠", shows: "6+ points, 4+ spades" },
        undefined,
        { label: "2♥", shows: "at most 15 points, six hearts" },
      ],
    });
    const byTitle = new Map(out.map((c) => [c.title, c]));
    expect(byTitle.get("Partner's points")?.value).toBe("12–15");
    // The LONGEST promise per suit survives: six hearts beats five.
    expect(byTitle.get("Partner's suits")?.value).toContain("6+ ♥");
  });

  it("reads the KB's own telegraphic style — glyphs, en dashes, total points", () => {
    // Exactly what lib/bidMeanings.ts showsText emits.
    const out = partnershipStates({
      auction: [call("N", "1D"), call("E", "P")],
      seat: "S",
      hand: HAND,
      meanings: [
        { label: "Minor suit opening", shows: "3–5 ♦; at most 2 ♠; 12–22 total points" },
        undefined,
      ],
    });
    const byTitle = new Map(out.map((c) => [c.title, c]));
    // A suit range promises its floor; "at most 2 ♠" is a ceiling, not a promise.
    expect(byTitle.get("Partner's suits")?.value).toBe("3+ ♦");
    expect(byTitle.get("Partner's points")?.value).toBe("12–22");
  });

  it("keeps the bid card even when the meaning parses to nothing", () => {
    const out = partnershipStates({
      auction: [call("N", "2C"), call("E", "P")],
      seat: "S",
      hand: HAND,
      meanings: [{ label: "2♣", shows: "an artificial force" }, undefined],
    });
    const titles = out.map((c) => c.title);
    expect(titles).toContain("Partner bid");
    expect(titles).not.toContain("Partner's points");
    expect(titles).not.toContain("Partner's suits");
  });

  it("reads each OPPONENT per seat for the Theirs view, and skips silent ones", () => {
    // East overcalled with a parsed meaning; West only passed. One seat's
    // cards, all grouped "theirs", named by seat.
    const out = opponentStates({
      auction: [call("N", "1H"), call("E", "1S"), call("S", "P"), call("W", "P")],
      seat: "S",
      meanings: [undefined, { label: "Overcall", shows: "8-16 HCP, 5+ ♠" }, undefined, undefined],
    });
    const byTitle = new Map(out.map((c) => [c.title, c]));
    expect(byTitle.get("East bid")?.value).toBe("1♠");
    expect(byTitle.get("East's points")?.value).toBe("8–16");
    expect(byTitle.get("East's suits")?.value).toContain("5+ ♠");
    expect(out.every((c) => c.group === "theirs")).toBe(true);
    expect(out.some((c) => c.title.startsWith("West"))).toBe(false);
  });

  it("is empty for Theirs while the opponents have only passed", () => {
    const out = opponentStates({
      auction: [call("N", "1H"), call("E", "P")],
      seat: "S",
      meanings: [undefined, undefined],
    });
    expect(out).toEqual([]);
  });

  it("says the system doesn't cover an unmapped call, and invents nothing", () => {
    const out = partnershipStates({
      auction: [call("N", "1N"), call("E", "P")],
      seat: "S",
      hand: HAND,
      meanings: [undefined, undefined],
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.detail).toContain("don't cover");
  });
});

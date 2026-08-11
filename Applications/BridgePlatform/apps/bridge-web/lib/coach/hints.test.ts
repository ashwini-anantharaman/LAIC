// The hint ladder's guarantee, tested the blunt way eventQa tests its own:
// a set of hints that names a concealed card is discarded WHOLE — the model
// reasoned from information it should never act on, and no rung of that
// ladder can be trusted.

import type Anthropic from "@anthropic-ai/sdk";
import type { GameState } from "@bridge/engine";
import type { Card, Suit } from "@bridge/events";
import { describe, expect, it } from "vitest";

import { generateHints, HINT_COUNT, validateHints } from "./hints";
import { visiblePosition } from "./visible";

const RANKS: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};
const cards = (spec: string): Card[] =>
  spec.split(/\s+/).map((t) => ({ suit: t[0] as Suit, rank: RANKS[t[1]!]! as Card["rank"] }));

/** The learner's hand: ♠AQ3 ♥J8 ♦Q5 ♣KJ10753. */
const MINE = cards("SA SQ S3 HJ H8 DQ D5 CK CJ CT C7 C5 C3");

const state = (over: Partial<GameState> = {}): GameState =>
  ({
    boardRef: "b1", dealer: "N", vul: "none",
    hands: { N: [], E: [], S: MINE, W: [] },
    auction: [{ seat: "N", call: "1D" as never }],
    contract: null, phase: "auction", turn: "S",
    tricks: [], trickCount: { NS: 0, EW: 0 },
    ...over,
  }) as GameState;

const pos = visiblePosition(state(), "S")!;

const ladder = (fifth = "Bid 1♠ — a new suit at the one level shows your points cheaply.") => [
  "Start by counting your points and asking what kind of hand partner promised.",
  "You hold 13 HCP and your longest suit is clubs.",
  "Partner's opening promises about 12+ points, so your side has the majority.",
  "Look for the cheapest call that keeps the auction low while showing strength.",
  fifth,
];

describe("validateHints — the leak gate", () => {
  it("passes a clean ladder, trimmed", () => {
    const r = validateHints({ hints: ladder().map((h) => ` ${h} `) }, pos);
    expect(r).toEqual({ hints: ladder() });
  });

  it("discards the WHOLE ladder when any rung names a concealed card", () => {
    const bad = ladder();
    bad[2] = "Partner surely holds the A♥, so the majors are covered.";
    expect(validateHints({ hints: bad }, pos)).toEqual({ reason: "leaked" });
  });

  it("allows the learner's own cards to be named", () => {
    const r = validateHints({ hints: ladder("Your K♣ makes clubs the suit to bid.") }, pos);
    expect("hints" in r).toBe(true);
  });

  it("allows the auction's own bids to be named — a call is not a card", () => {
    // "2♠" parses exactly like a card token, and East's bid is public record;
    // before the auction joined the visible set, a contested auction killed
    // virtually every ladder as a "leak" (reported 2026-08-11: "No hints for
    // this position right now" on every try).
    const contested = visiblePosition(
      state({
        auction: [
          { seat: "N", call: "2H" as never },
          { seat: "E", call: "2S" as never },
        ],
      }),
      "S",
    )!;
    const naming = ladder("Compete over their 2♠ — support partner's hearts.");
    naming[0] = "East's 2♠ overcall crowds your auction; ask what partner's 2♥ promised.";
    expect("hints" in validateHints({ hints: naming }, contested)).toBe(true);
    // ...while a genuinely hidden CARD still kills the ladder whole (the
    // learner's hand has no K♦, and K♦ can never be a call).
    const leaking = ladder();
    leaking[1] = "West's K♦ is onside, so the finesse works.";
    expect(validateHints({ hints: leaking }, contested)).toEqual({ reason: "leaked" });
  });

  it("rejects the wrong shape: not five, not strings, not an object", () => {
    expect(validateHints({ hints: ladder().slice(0, 4) }, pos)).toEqual({ reason: "malformed" });
    expect(validateHints({ hints: [...ladder(), "a sixth"] }, pos)).toEqual({ reason: "malformed" });
    expect(validateHints({ hints: [1, 2, 3, 4, 5] }, pos)).toEqual({ reason: "malformed" });
    expect(validateHints("just a string", pos)).toEqual({ reason: "malformed" });
  });

  it("rejects an empty rung, and a runaway one at the boundary", () => {
    const blank = ladder();
    blank[1] = "   ";
    expect(validateHints({ hints: blank }, pos)).toEqual({ reason: "empty" });

    // One short sentence each — the ceiling is pinned at the boundary, since
    // what the gate permits, the model eventually produces.
    const long = ladder();
    long[3] = "x".repeat(221);
    expect(validateHints({ hints: long }, pos)).toEqual({ reason: "malformed" });
    const atLimit = ladder();
    atLimit[3] = "x".repeat(220);
    expect("hints" in validateHints({ hints: atLimit }, pos)).toBe(true);
  });
});

describe("generateHints — plumbing", () => {
  const fakeClient = (reply: { stop_reason: string; content: unknown[] }) =>
    ({ create: async () => reply }) as unknown as Pick<Anthropic["messages"], "create">;

  it("returns the validated ladder from a well-behaved model", async () => {
    const r = await generateHints(
      { pos, target: "1♠" },
      {
        client: fakeClient({
          stop_reason: "end_turn",
          content: [{ type: "text", text: JSON.stringify({ hints: ladder() }) }],
        }),
      },
    );
    expect(r).toEqual({ hints: ladder() });
    expect("hints" in r && r.hints.length).toBe(HINT_COUNT);
  });

  it("discards a leaking model whole", async () => {
    const bad = ladder();
    bad[0] = "West holds the A♥, so start there.";
    const r = await generateHints(
      { pos },
      {
        client: fakeClient({
          stop_reason: "end_turn",
          content: [{ type: "text", text: JSON.stringify({ hints: bad }) }],
        }),
      },
    );
    expect(r).toEqual({ reason: "leaked" });
  });

  it("checks stop_reason before reading content", async () => {
    const r = await generateHints(
      { pos },
      { client: fakeClient({ stop_reason: "refusal", content: [] }) },
    );
    expect(r).toEqual({ reason: "refused" });
  });

  it("reports malformed output rather than crashing on it", async () => {
    const r = await generateHints(
      { pos },
      { client: fakeClient({ stop_reason: "end_turn", content: [{ type: "text", text: "not json" }] }) },
    );
    expect(r).toEqual({ reason: "malformed" });
  });
});

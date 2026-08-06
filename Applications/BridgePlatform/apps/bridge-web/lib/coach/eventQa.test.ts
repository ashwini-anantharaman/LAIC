// The event-QA layer's two guarantees, tested the same blunt way visible.ts
// tests its own: (1) the position handed to the model has no field for the
// concealed hands — put every missing honour in them and assert none appears
// in the serialised JSON; (2) an answer that names a concealed card is
// discarded whole, no matter how good the rest of it reads.

import type Anthropic from "@anthropic-ai/sdk";
import type { GameState } from "@bridge/engine";
import type { Card, Seat, Suit } from "@bridge/events";
import { describe, expect, it } from "vitest";

import { answerEventQuestion, qaPosition, validateAnswer } from "./eventQa";

const RANKS: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};
const cards = (spec: string): Card[] =>
  spec.split(/\s+/).map((t) => ({ suit: t[0] as Suit, rank: RANKS[t[1]!]! as Card["rank"] }));

/** The learner's hand: ♠AQ3 ♥J8 ♦Q5 ♣KJ10753. */
const MINE = cards("SA SQ S3 HJ H8 DQ D5 CK CJ CT C7 C5 C3");

function state(over: Partial<GameState> = {}): GameState {
  return {
    boardRef: "b1", dealer: "N", vul: "none",
    hands: { N: [], E: [], S: MINE, W: [] },
    auction: [], contract: null, phase: "auction", turn: "S",
    tricks: [], trickCount: { NS: 0, EW: 0 },
    ...over,
  } as GameState;
}
const call = (seat: Seat, c: string) => ({ seat, call: c as never });

describe("qaPosition — blind by construction", () => {
  it("never carries a concealed card, even when every missing honour is out there", () => {
    // Learner S defends against E: the concealed hands are N (partner) and E
    // (declarer). Give both the big cards the learner would love to know about.
    const s = state({
      phase: "play",
      contract: { level: 3, strain: "N", doubled: 0, declarer: "E" } as GameState["contract"],
      turn: "E", // NOT the learner's turn — QA still builds
      hands: {
        N: cards("HA HK HQ DA DK"),
        E: cards("SK SJ ST CA CQ"),
        S: MINE,
        W: cards("D2 D3 D4 H2 H3"), // dummy — face up, legitimately visible
      },
      tricks: [],
    });
    const pos = qaPosition(s, "S")!;
    const json = JSON.stringify(pos);
    for (const hidden of ["A♥", "K♥", "Q♥", "A♦", "K♦", "K♠", "J♠", "10♠", "A♣", "Q♣"]) {
      expect(json).not.toContain(hidden);
    }
    // ...while the learner's own cards, and face-up dummy, are there to reason from.
    expect(json).toContain("♠ A Q 3");
    expect(JSON.stringify(pos.dummy ?? {})).toContain("2♦");
  });

  it("builds off-turn — the whole point of a question surface", () => {
    const s = state({ auction: [call("N", "1D")], turn: "E" });
    const pos = qaPosition(s, "S")!;
    expect(pos.phase).toBe("auction");
    expect(pos.legal).toEqual([]); // advice owns "what can I do"
  });

  it("follows the table's rule: dummy is face up in play, but dummy sees only their own", () => {
    const contract = { level: 3, strain: "N", doubled: 0, declarer: "E" } as GameState["contract"];
    // A defender sees dummy (visibleSeats' rule for the whole coach layer)...
    const defender = state({
      phase: "play", contract, turn: "S",
      hands: { N: [], E: [], S: MINE, W: cards("HA HK") }, // W is dummy (declarer E)
      tricks: [],
    });
    expect(JSON.stringify(qaPosition(defender, "S")!.dummy ?? {})).toContain("♥ A K");

    // ...but dummy themselves must not be handed declarer's hand.
    const asDummy = state({
      phase: "play", contract, turn: "E",
      hands: { N: [], E: cards("SK SJ"), S: [], W: MINE }, // learner W IS dummy
      tricks: [],
    });
    const pos = qaPosition(asDummy, "W")!;
    expect(pos.role).toBe("dummy");
    expect(pos.dummy).toBeUndefined();
    expect(JSON.stringify(pos)).not.toContain("K♠");
  });

  it("never lists an opponent's legal cards", () => {
    const contract = { level: 3, strain: "N", doubled: 0, declarer: "E" } as GameState["contract"];
    const s = state({
      phase: "play", contract, turn: "E",
      hands: { N: [], E: cards("SK SJ"), S: MINE, W: [] },
      tricks: [{ leader: "E", plays: [] }],
    });
    expect(qaPosition(s, "S")!.legal).toEqual([]);
  });
});

describe("validateAnswer — the leak gate", () => {
  const pos = qaPosition(state({ auction: [call("N", "1D")], turn: "S" }), "S")!;

  it("passes a clean answer", () => {
    const r = validateAnswer({ answer: "Partner's 1♦ shows an opening hand with diamonds." }, pos);
    expect(r).toEqual({ answer: "Partner's 1♦ shows an opening hand with diamonds." });
  });

  it("discards an answer naming a card the learner cannot have seen", () => {
    // A♥ is in nobody's visible set here.
    const r = validateAnswer({ answer: "West surely holds the A♥, so duck this trick." }, pos);
    expect(r).toEqual({ reason: "leaked" });
  });

  it("allows the learner's own cards to be named", () => {
    const r = validateAnswer({ answer: "With the A♠ in your hand, the finesse can wait." }, pos);
    expect("answer" in r).toBe(true);
  });

  it("rejects empty, non-string and runaway answers", () => {
    expect(validateAnswer({ answer: "  " }, pos)).toEqual({ reason: "empty" });
    expect(validateAnswer({ answer: 7 }, pos)).toEqual({ reason: "malformed" });
    expect(validateAnswer("just a string", pos)).toEqual({ reason: "malformed" });
    expect(validateAnswer({ answer: "x".repeat(1000) }, pos)).toEqual({ reason: "malformed" });
  });

  it("the ceiling is two short sentences' worth, and it is pinned at the boundary", () => {
    // The old ceiling was 900 and answers grew to meet it: a "why not the 5♥?"
    // question produced ~650 characters of trade-off tour, four sentences every
    // time, ~9 seconds of generation. The call is output-bound, so the ceiling IS
    // the latency knob — and what the gate permits, the model eventually produces.
    // 420 ≈ two short sentences with generous headroom (measured answers land at
    // 200–280). The previous test rejected at 1000, which both ceilings reject —
    // it pinned nothing.
    expect(validateAnswer({ answer: "x".repeat(421) }, pos)).toEqual({ reason: "malformed" });
    expect("answer" in validateAnswer({ answer: "x".repeat(420) }, pos)).toBe(true);
  });
});

describe("answerEventQuestion — plumbing", () => {
  const pos = qaPosition(state({ auction: [call("N", "1D")], turn: "S" }), "S")!;

  const fakeClient = (reply: { stop_reason: string; content: unknown[] }) =>
    ({ create: async () => reply }) as unknown as Pick<Anthropic["messages"], "create">;

  it("returns the validated answer from a well-behaved model", async () => {
    const r = await answerEventQuestion(
      { pos, eventLabel: "Partner bid 1♦", question: "What does that show?" },
      {
        client: fakeClient({
          stop_reason: "end_turn",
          content: [{ type: "text", text: JSON.stringify({ answer: "It shows an opening hand with diamonds." }) }],
        }),
      },
    );
    expect(r).toEqual({ answer: "It shows an opening hand with diamonds." });
  });

  it("discards a leaking model whole", async () => {
    const r = await answerEventQuestion(
      { pos, eventLabel: "Partner bid 1♦", question: "Where is the heart ace?" },
      {
        client: fakeClient({
          stop_reason: "end_turn",
          content: [{ type: "text", text: JSON.stringify({ answer: "East holds the A♥." }) }],
        }),
      },
    );
    expect(r).toEqual({ reason: "leaked" });
  });

  it("checks stop_reason before reading content", async () => {
    const r = await answerEventQuestion(
      { pos, eventLabel: "Partner bid 1♦", question: "?" },
      { client: fakeClient({ stop_reason: "refusal", content: [] }) },
    );
    expect(r).toEqual({ reason: "refused" });
  });

  it("reports malformed output rather than crashing on it", async () => {
    const r = await answerEventQuestion(
      { pos, eventLabel: "Partner bid 1♦", question: "?" },
      { client: fakeClient({ stop_reason: "end_turn", content: [{ type: "text", text: "not json" }] }) },
    );
    expect(r).toEqual({ reason: "malformed" });
  });
});

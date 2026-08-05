// The validator, which is what actually keeps the explanation layer honest.
//
// The prompt asks the model to behave; this decides whether it did. Models drift,
// and a drifted explanation should fail here rather than on a learner's screen —
// so these matter more than any prompt wording, and they run with no network and
// no API key.

import type { GameState } from "@bridge/engine";
import type { Card, Suit } from "@bridge/events";
import { describe, expect, it, vi } from "vitest";

import { explainPlay, validateExplanation, type ExplainInput } from "./model";
import { visiblePosition, type VisiblePosition } from "./visible";

const R: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};
const cards = (spec: string): Card[] =>
  spec.trim().split(/\s+/).map((t) => ({ suit: t[0] as Suit, rank: R[t[1]!]! as Card["rank"] }));
const one = (spec: string) => cards(spec)[0]!;

/**
 * The board from the screenshots: South declares 3♥, North is dummy with ♦J ♦10
 * ♦6, West led the 2♦. So the card being chosen is one of dummy's, and the
 * guidelines offered the two low ones while rejecting the Jack.
 */
function position(): VisiblePosition {
  const s = {
    boardRef: "b", dealer: "N", vul: "none", phase: "play", turn: "N",
    contract: { level: 3, strain: "H", doubled: 0, declarer: "S" },
    hands: {
      N: cards("DJ DT D6"), E: cards("SK SJ"),
      S: cards("DQ D9 D7"), W: cards("S3"),
    },
    auction: [{ seat: "E", call: "1S" }, { seat: "S", call: "2D" }],
    tricks: [{ leader: "W", plays: [{ seat: "W", card: one("D2") }] }],
    trickCount: { NS: 0, EW: 0 },
  } as unknown as GameState;
  return visiblePosition(s, "S")!;
}

const input = (over: Partial<ExplainInput> = {}): ExplainInput => ({
  pos: position(),
  best: ["6♦", "10♦"],
  source: "convention",
  rejected: ["J♦"],
  authorityBecause: "Second hand low — a small card was led, so rising with an honor…",
  ...over,
});

const GOOD = {
  why: "A small card was led, so dummy doesn't need to spend a high one to have a say in the trick.",
  notThis: [{ label: "J♦", why: "spends dummy's highest for nothing when a small card would do" }],
  equivalent: "The guideline treats 6♦ and 10♦ the same here.",
};

describe("validateExplanation — a well-formed explanation", () => {
  it("keeps every field", () => {
    const out = validateExplanation(GOOD, input());
    expect("explanation" in out).toBe(true);
    if (!("explanation" in out)) return;
    expect(out.explanation.notThis).toHaveLength(1);
    expect(out.explanation.equivalent).toContain("the same here");
  });

  it("drops `equivalent` when the authority named only one card", () => {
    const out = validateExplanation(GOOD, input({ best: ["6♦"] }));
    expect("explanation" in out).toBe(true);
    if (!("explanation" in out)) return;
    expect(out.explanation.equivalent).toBeUndefined();
  });

  it("drops a notThis entry for a card that was never rejected", () => {
    const out = validateExplanation(
      { ...GOOD, notThis: [...GOOD.notThis, { label: "A♠", why: "invented" }] },
      input(),
    );
    expect("explanation" in out).toBe(true);
    if (!("explanation" in out)) return;
    expect(out.explanation.notThis?.map((n) => n.label)).toEqual(["J♦"]);
  });
});

describe("validateExplanation — the notation hole that shipped once", () => {
  it("rejects a bare holding, which a suit-symbol scan cannot see", () => {
    // The real screenshot wrote "Q97" and "J10 6". Those slip straight past a
    // glyph-based unseen-card check, so the notation defeats the guard even when
    // the content is innocent — and "West holds AK" would slip past identically.
    for (const bare of ["Q97", "J10", "AK", "KQJ"]) {
      const out = validateExplanation({ why: `With ${bare} behind dummy, keep the 6♦ back.` }, input());
      expect("reason" in out, bare).toBe(true);
      if ("reason" in out) expect(out.detail).toContain("bare holding");
    }
  });

  it("accepts the same content written with suit symbols", () => {
    const out = validateExplanation(
      { why: "Your Q♦ 9♦ 7♦ sit behind dummy's J♦ 10♦ 6♦, so a small one is enough." },
      input(),
    );
    expect("explanation" in out).toBe(true);
  });

  it("does not mistake ordinary numbers for a holding", () => {
    const out = validateExplanation(
      { why: "West led the 2♦ at trick 1 of 13, so dummy plays low." },
      input(),
    );
    expect("explanation" in out).toBe(true);
  });
});

describe("validateExplanation — no card the learner cannot see", () => {
  it("rejects a concealed card inside otherwise good prose", () => {
    const out = validateExplanation(
      { why: "East still holds the K♠, so dummy's 6♦ keeps things flexible." },
      input(),
    );
    expect("reason" in out).toBe(true);
    if ("reason" in out) expect(out.detail).toContain("K♠");
  });

  it("allows the learner's own hand, dummy, and cards already played", () => {
    const out = validateExplanation(
      { why: "The 2♦ West led is small, and your Q♦ sits behind dummy's 6♦." },
      input(),
    );
    expect("explanation" in out).toBe(true);
  });
});

describe("validateExplanation — it may not change the answer", () => {
  it("rejects telling the learner to play a card the authority ruled out", () => {
    const out = validateExplanation({ why: "Play the J♦ to force an honour out." }, input());
    expect("reason" in out).toBe(true);
    if ("reason" in out) expect(out.detail).toContain("told the learner to play J♦");
  });

  it("ALLOWS naming a rejected card to say why it is worse — the useful sentence", () => {
    const out = validateExplanation(
      { why: "The J♦ would be wasted here; a small diamond does the same job." },
      input(),
    );
    expect("explanation" in out).toBe(true);
  });

  it("rejects hedging about the answer", () => {
    for (const hedge of ["instead", "however", "alternatively", "arguably", "rather than"]) {
      const out = validateExplanation({ why: `Dummy plays 6♦, ${hedge} something else.` }, input());
      expect("reason" in out, hedge).toBe(true);
      if ("reason" in out) expect(out.detail).toContain("hedges");
    }
  });
});

describe("validateExplanation — the remaining rules", () => {
  it("rejects blandness with nothing from this deal in it", () => {
    const out = validateExplanation({ why: "This is a standard defensive situation." }, input());
    expect("reason" in out).toBe(true);
    if ("reason" in out) expect(out.detail).toContain("nothing specific");
  });

  it("rejects an essay", () => {
    const out = validateExplanation({ why: `The 6♦ is right. ${"Because ".repeat(60)}` }, input());
    expect("reason" in out).toBe(true);
    if ("reason" in out) expect(out.detail).toContain("chars");
  });

  it("rejects anything without a usable `why`", () => {
    for (const bad of [null, "text", 7, {}, { why: "" }, { why: 42 }]) {
      expect("reason" in validateExplanation(bad, input()), JSON.stringify(bad)).toBe(true);
    }
  });
});

describe("explainPlay — the solver is never asked to explain itself", () => {
  it("returns not-explainable without calling the model at all", async () => {
    const create = vi.fn();
    const out = await explainPlay(
      input({ source: "solution", best: ["6♦"] }),
      { client: { create } as never },
    );
    expect(out).toEqual({ reason: "not-explainable" });
    // The point: no request was made. The solver's reason IS the hidden hands, so
    // asking for prose here is asking the model to invent one.
    expect(create).not.toHaveBeenCalled();
  });

  it("returns not-explainable when there is no answer to explain", async () => {
    const create = vi.fn();
    const out = await explainPlay(input({ best: [] }), { client: { create } as never });
    expect(out).toEqual({ reason: "not-explainable" });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("explainPlay — every failure is a reason, never a throw", () => {
  const reply = (text: string, stop = "end_turn") =>
    ({ content: [{ type: "text", text }], stop_reason: stop }) as never;

  it("returns the explanation, and sent no concealed card to get it", async () => {
    const create = vi.fn().mockResolvedValue(reply(JSON.stringify(GOOD)));
    const out = await explainPlay(input(), { client: { create } as never });
    expect("explanation" in out).toBe(true);

    // Scope this to the USER turn. The system prompt names K♠ as an example of
    // correct notation — not a leak, but it does defeat a naive whole-payload
    // scan, and only the per-position half can carry a concealed card.
    const params = create.mock.calls[0]![0] as { messages: { content: string }[] };
    const sent = params.messages[0]!.content;
    for (const hidden of ["K♠", "J♠", "3♠"]) expect(sent, hidden).not.toContain(hidden);
    // It DID send the answer, the rejected card, and the authority's own wording.
    expect(sent).toContain("6♦");
    expect(sent).toContain("J♦");
    expect(sent).toContain("Second hand low");
  });

  it("reports a refusal without touching content", async () => {
    const create = vi.fn().mockResolvedValue({ content: [], stop_reason: "refusal" } as never);
    expect(await explainPlay(input(), { client: { create } as never })).toEqual({ reason: "refused" });
  });

  it("reports unreachable rather than throwing", async () => {
    const create = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    expect(await explainPlay(input(), { client: { create } as never })).toEqual({ reason: "unreachable" });
  });

  it("reports malformed on non-JSON", async () => {
    const create = vi.fn().mockResolvedValue(reply("Sure! Play low here."));
    expect(await explainPlay(input(), { client: { create } as never })).toEqual({ reason: "malformed" });
  });

  it("caches the system prompt, so the stable head is paid for once", async () => {
    const create = vi.fn().mockResolvedValue(reply(JSON.stringify(GOOD)));
    await explainPlay(input(), { client: { create } as never });
    const params = create.mock.calls[0]![0] as { system: { cache_control?: unknown }[] };
    expect(params.system[0]!.cache_control).toEqual({ type: "ephemeral" });
  });
});

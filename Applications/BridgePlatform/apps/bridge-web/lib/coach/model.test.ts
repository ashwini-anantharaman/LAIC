// The validator, which is the part that keeps the explanation layer honest.
//
// The prompt asks the model to follow four rules; this decides whether it did.
// Models drift, and a drifted response should fail here rather than on a learner's
// screen — so these tests matter more than any prompt wording, and they run with
// no network and no API key.

import type { GameState } from "@bridge/engine";
import type { Card, Suit } from "@bridge/events";
import { describe, expect, it, vi } from "vitest";

import { frameThinking, validateFraming, type Framing } from "./model";
import { thinkAid } from "./think";
import { visiblePosition, type VisiblePosition } from "./visible";

const R: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};
const cards = (spec: string): Card[] =>
  spec.trim().split(/\s+/).map((t) => ({ suit: t[0] as Suit, rank: R[t[1]!]! as Card["rank"] }));
const one = (spec: string) => cards(spec)[0]!;

/** South defends 3NT by East; dummy (West) is face up. South holds ♦K ♦10 ♦6. */
function position(): { pos: VisiblePosition; aid: ReturnType<typeof thinkAid> } {
  const s = {
    boardRef: "b", dealer: "N", vul: "none", phase: "play", turn: "S",
    contract: { level: 3, strain: "N", doubled: 0, declarer: "E" },
    hands: {
      N: cards("HA HK"), E: cards("SK SJ"),
      S: cards("DK DT D6"), W: cards("DJ D9 D4"),
    },
    auction: [{ seat: "N", call: "1D" }, { seat: "E", call: "P" }],
    tricks: [{ leader: "E", plays: [{ seat: "E", card: one("D3") }] }],
    trickCount: { NS: 0, EW: 0 },
  } as unknown as GameState;
  return { pos: visiblePosition(s, "S")!, aid: thinkAid(s, "S")! };
}

const GOOD: Framing = {
  does: [
    { label: "6♦", does: "keeps the K♦ guarding the suit" },
    { label: "10♦", does: "spends the ten and leaves the King behind it" },
    { label: "K♦", does: "spends your highest diamond now" },
  ],
  question: "Is your K♦ worth spending on this trick, or worth keeping as a guard?",
};

describe("validateFraming — accepts a well-formed framing", () => {
  it("keeps every field and trims the question", () => {
    const { pos, aid } = position();
    expect(aid!.candidates.map((c) => c.label)).toEqual(["6♦", "10♦", "K♦"]);

    const out = validateFraming({ ...GOOD, question: `  ${GOOD.question}  ` }, pos, aid!);
    expect("framing" in out).toBe(true);
    if (!("framing" in out)) return;
    expect(out.framing.does).toHaveLength(3);
    expect(out.framing.question).toBe(GOOD.question);
  });
});

describe("validateFraming — RULE 1: nothing is named as the answer", () => {
  it("rejects a preference word anywhere in the prose", () => {
    const { pos, aid } = position();
    for (const word of ["best", "safer", "correct", "should", "recommend", "avoid", "a mistake"]) {
      const bad = { ...GOOD, question: `Which is ${word} here?` };
      const out = validateFraming(bad, pos, aid!);
      expect("reason" in out, word).toBe(true);
      if ("reason" in out) expect(out.detail).toContain("ranks or recommends");
    }
  });

  it("rejects annotating ONE option out of several — that is a recommendation", () => {
    const { pos, aid } = position();
    const out = validateFraming(
      { does: [{ label: "K♦", does: "spends your highest diamond" }], question: GOOD.question },
      pos,
      aid!,
    );
    expect("reason" in out).toBe(true);
    if ("reason" in out) expect(out.detail).toContain("one option out of several");
  });

  it("drops entries whose label the position never offered", () => {
    const { pos, aid } = position();
    const out = validateFraming(
      { does: [...GOOD.does!, { label: "A♠", does: "invented" }], question: GOOD.question },
      pos,
      aid!,
    );
    expect("framing" in out).toBe(true);
    if (!("framing" in out)) return;
    expect(out.framing.does?.map((d) => d.label)).toEqual(["6♦", "10♦", "K♦"]);
  });
});

describe("validateFraming — RULE 2: no card the learner cannot see", () => {
  it("rejects a concealed card even inside otherwise perfect prose", () => {
    const { pos, aid } = position();
    const out = validateFraming(
      {
        does: GOOD.does,
        // A♥ is in North's hand. True, useful, and forbidden.
        question: "Partner still holds the A♥ — does that change your diamond?",
      },
      pos,
      aid!,
    );
    expect("reason" in out).toBe(true);
    if ("reason" in out) expect(out.detail).toContain("A♥");
  });

  it("allows dummy's cards and cards already played", () => {
    const { pos, aid } = position();
    const out = validateFraming(
      {
        does: GOOD.does,
        question: "Dummy's J♦ sits over the 3♦ East led — what does your K♦ do about it?",
      },
      pos,
      aid!,
    );
    expect("framing" in out).toBe(true);
  });
});

describe("validateFraming — RULE 3: something concrete from this deal", () => {
  it("rejects blandness with nothing from the actual position in it", () => {
    const { pos, aid } = position();
    const out = validateFraming({ question: "What do you think the position needs?" }, pos, aid!);
    expect("reason" in out).toBe(true);
    if ("reason" in out) expect(out.detail).toContain("nothing specific");
  });

  it("a single named card from the position is enough", () => {
    const { pos, aid } = position();
    expect("framing" in validateFraming({ question: "What is your K♦ for?" }, pos, aid!)).toBe(true);
  });
});

describe("validateFraming — RULE 4: it ends on a question", () => {
  it("rejects a statement", () => {
    const { pos, aid } = position();
    const out = validateFraming({ ...GOOD, question: "Your K♦ is a guard." }, pos, aid!);
    expect("reason" in out).toBe(true);
    if ("reason" in out) expect(out.detail).toContain("does not end on a question");
  });
});

describe("validateFraming — malformed input", () => {
  it("rejects anything without a usable question", () => {
    const { pos, aid } = position();
    for (const bad of [null, "text", 7, {}, { question: "" }, { question: 42 }]) {
      const out = validateFraming(bad, pos, aid!);
      expect("reason" in out, JSON.stringify(bad)).toBe(true);
    }
  });
});

describe("frameThinking — every failure is a reason, never a throw", () => {
  const reply = (text: string, stop: string = "end_turn") =>
    ({ content: [{ type: "text", text }], stop_reason: stop }) as never;

  it("returns the framing on a good reply, and sends no hidden card", async () => {
    const { pos, aid } = position();
    const create = vi.fn().mockResolvedValue(reply(JSON.stringify(GOOD)));
    const out = await frameThinking(pos, aid!, { client: { create } as never });
    expect("framing" in out).toBe(true);

    // The prompt it actually sent carries nothing from a concealed hand.
    const sent = JSON.stringify(create.mock.calls[0]![0]);
    for (const hidden of ["A♥", "K♥", "K♠", "J♠"]) expect(sent, hidden).not.toContain(hidden);
  });

  it("reports a refusal without touching content", async () => {
    const { pos, aid } = position();
    const create = vi.fn().mockResolvedValue({ content: [], stop_reason: "refusal" } as never);
    const out = await frameThinking(pos, aid!, { client: { create } as never });
    expect(out).toEqual({ reason: "refused" });
  });

  it("reports unreachable rather than throwing", async () => {
    const { pos, aid } = position();
    const create = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    const out = await frameThinking(pos, aid!, { client: { create } as never });
    expect(out).toEqual({ reason: "unreachable" });
  });

  it("reports malformed on non-JSON", async () => {
    const { pos, aid } = position();
    const create = vi.fn().mockResolvedValue(reply("Sure! Here's my advice: play low."));
    const out = await frameThinking(pos, aid!, { client: { create } as never });
    expect(out).toEqual({ reason: "malformed" });
  });

  it("caches the system prompt, so the stable head is paid for once", async () => {
    const { pos, aid } = position();
    const create = vi.fn().mockResolvedValue(reply(JSON.stringify(GOOD)));
    await frameThinking(pos, aid!, { client: { create } as never });
    const params = create.mock.calls[0]![0] as { system: { cache_control?: unknown }[] };
    expect(params.system[0]!.cache_control).toEqual({ type: "ephemeral" });
  });
});

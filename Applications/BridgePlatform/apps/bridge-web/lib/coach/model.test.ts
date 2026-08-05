// The validator, which is what actually keeps the explanation layer honest.
//
// The prompt asks the model to behave; this decides whether it did. Models drift,
// and a drifted explanation should fail here rather than on a learner's screen —
// so these matter more than any prompt wording, and they run with no network and
// no API key.

import type { GameState } from "@bridge/engine";
import type { Card, Suit } from "@bridge/events";
import { describe, expect, it, vi } from "vitest";

import { capRejected, explainPlay, validateExplanation, type ExplainInput } from "./model";
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
    for (const hedge of [
      "alternatively",
      "arguably",
      "but you could",
      "could also",
      "another option",
      "might be better",
      "it depends",
    ]) {
      const out = validateExplanation({ why: `Dummy plays 6♦, ${hedge} something else.` }, input());
      expect("reason" in out, hedge).toBe(true);
      if ("reason" in out) expect(out.detail).toContain("hedges");
    }
  });

  it("ALLOWS contrast, which is how the right answer gets explained", () => {
    // "instead", "rather than" and "however" were in the list above and are not any
    // more, on measurement: across real positions "rather than" was the commonest
    // reason a learner got a card with no reason attached. They are contrast markers,
    // and contrast is the shape of a good explanation — the sentences below are
    // exactly what should reach the screen.
    //
    // What stops the model changing the answer is not this pattern but the exact
    // directed-play check: naming a specific other card as the play. A soft net for
    // tone, set too wide, catches nothing but good prose.
    for (const why of [
      "Play the small 6♦ rather than spending an honour you will want later.",
      "Dummy takes it with the 6♦ instead of wasting anything bigger.",
      "The 6♦ is enough here; however you look at it, a higher card gains nothing.",
    ]) {
      expect("explanation" in validateExplanation({ why }, input()), why).toBe(true);
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

describe("explainPlay — the solver is explained from costs, never from cards", () => {
  it("will not explain a solver answer with no cost table, and makes no request", async () => {
    const create = vi.fn();
    const out = await explainPlay(
      input({ source: "solution", best: ["6♦"] }),
      { client: { create } as never },
    );
    expect(out).toEqual({
      reason: "not-explainable",
      detail: "solver answer with no cost table",
    });
    // The point is the absent request. The solver publishes a verdict and no
    // reasoning, so a model given only the answer would have to invent the why.
    expect(create).not.toHaveBeenCalled();
  });

  it("does ask, once it has a table — the table is the material", async () => {
    // This is the change. It used to be a blanket refusal: the solver answered and
    // the coach said "worked out from the full deal" and stopped, which is honest
    // and teaches nothing.
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ why: "Cashing the 6♦ keeps the lead where the long suit is." }) }],
      stop_reason: "end_turn",
    } as never);
    const out = await explainPlay(
      input({
        source: "solution",
        best: ["6♦"],
        scores: [
          { card: "6♦", tricks: 9 },
          { card: "K♠", tricks: 8 },
        ],
      }),
      { client: { create } as never },
    );
    expect("explanation" in out).toBe(true);
    expect(create).toHaveBeenCalledOnce();
  });

  it("sends the costs and NOT the hands", async () => {
    // The invariant the whole opening rests on. A trick count is a consequence and
    // may cross; a holding may not. If a hand ever reached this payload the
    // structural guarantee would be gone and no validator downstream could restore
    // it, because a fluent sentence about a card someone holds looks like insight.
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ why: "The 6♦ costs nothing." }) }],
      stop_reason: "end_turn",
    } as never);
    await explainPlay(
      input({
        source: "solution",
        best: ["6♦"],
        scores: [
          { card: "6♦", tricks: 9 },
          { card: "K♠", tricks: 7 },
        ],
      }),
      { client: { create } as never },
    );
    const sent = JSON.stringify(create.mock.calls[0]![0]);
    // The costs are there, expressed as what the alternatives give up.
    expect(sent).toContain("9 tricks (best)");
    expect(sent).toContain("2 tricks worse");
    // And the position carries no field for anybody else's cards, by construction.
    const payload = create.mock.calls[0]![0] as { messages: { content: string }[] };
    expect(payload.messages[0]!.content).not.toMatch(/\b(?:east|west|north|south)\s+holds/i);
  });

  it("discards an explanation that reconstructs a hidden layout", async () => {
    // The leak with no card token in it. Every other guard scans for cards; "the
    // king must be offside" names none, passes all of them, and still hands over a
    // fact from a hand the learner cannot see. Feeding the cost table is what
    // created the opening, so this is where it is met.
    for (const why of [
      "Play the 6♦ — the king must be offside.",
      "The 6♦ is right because East is short in diamonds.",
      "Lead the 6♦; West holds the ace and will have to play it.",
      "The 6♦ works since the finesse fails on the actual layout.",
      "The 6♦ is best because the queen sits badly for them.",
    ]) {
      const out = validateExplanation(
        { why },
        input({
          source: "solution",
          best: ["6♦"],
          scores: [{ card: "6♦", tricks: 9 }],
        }),
      );
      expect("reason" in out, why).toBe(true);
      // Two rules cover this list now: an inherently-hidden claim ("must be
      // offside") and a shape claim about a hand the learner cannot see ("East is
      // short"). Either rejection is the right outcome; the split exists so that
      // "YOU are void in diamonds" stops being caught alongside them.
      expect((out as { detail?: string }).detail, why).toMatch(/hidden layout|cannot see/);
    }
  });

  it("returns not-explainable when there is no answer to explain", async () => {
    const create = vi.fn();
    const out = await explainPlay(input({ best: [] }), { client: { create } as never });
    expect(out).toEqual({ reason: "not-explainable" });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("capRejected — the model writes less, so the answer arrives sooner", () => {
  // MEASURED, which is why this exists at all: the call is output-bound. Thinking
  // on or off barely moved p50; prompt caching cannot touch it; what moved it was
  // shrinking what the model is asked to WRITE. A clause per rejected card meant a
  // ten-card position produced ten near-identical clauses ("parting with a trump
  // costs two tricks", five times over). One representative per cost tier cut p90
  // by two seconds on the same positions with identical validator survival.
  const scores = [
    { card: "A♠", tricks: 9 }, // best
    { card: "K♠", tricks: 8 },
    { card: "Q♠", tricks: 8 },
    { card: "J♠", tricks: 8 },
    { card: "10♠", tricks: 7 },
    { card: "9♠", tricks: 7 },
    { card: "2♠", tricks: 5 },
  ];
  const rejected = ["K♠", "Q♠", "J♠", "10♠", "9♠", "2♠"];

  /**
   * A position that actually CONTAINS the capped cards: dummy holds a long diamond
   * suit and is on play to a diamond lead, so six legal cards exist and the cap has
   * something to do. The first draft of the end-to-end test reused the shared
   * three-card fixture with invented spades — and the unseen-card rule rejected its
   * own test data, correctly: an A♠ nobody holds is exactly what that rule is for.
   */
  function longSuitPos(): VisiblePosition {
    const s = {
      boardRef: "b", dealer: "N", vul: "none", phase: "play", turn: "N",
      contract: { level: 3, strain: "N", doubled: 0, declarer: "S" },
      hands: {
        N: cards("DA DK DQ DJ DT D6"), E: cards("SK SJ S9 S8 S7 S6"),
        S: cards("H2 H3 H4 H5 H7 H8"), W: cards("S3 C2 C3 C4 C5"),
      },
      auction: [],
      tricks: [{ leader: "W", plays: [{ seat: "W", card: one("D2") }] }],
      trickCount: { NS: 0, EW: 0 },
    } as unknown as GameState;
    return visiblePosition(s, "S")!;
  }
  const diamondScores = [
    { card: "A♦", tricks: 9 }, // best
    { card: "K♦", tricks: 8 },
    { card: "Q♦", tricks: 8 },
    { card: "J♦", tricks: 8 },
    { card: "10♦", tricks: 7 },
    { card: "6♦", tricks: 5 },
  ];

  it("keeps one card per cost tier, the highest-ranked, worst tier first", () => {
    // Three tiers among the rejected: 8 tricks (K,Q,J), 7 (10,9), 5 (the 2). Two
    // cards on the same tier fail the same way, so the second clause carries
    // nothing; the highest of each tier is kept because "why not the king?" is the
    // question a learner has — nobody asks why not the deuce. Worst first, so the
    // biggest mistake survives the cap.
    expect(capRejected(rejected, scores, ["A♠"])).toEqual(["2♠", "10♠", "K♠"]);
  });

  it("leaves a short list alone", () => {
    expect(capRejected(["K♠", "Q♠"], scores, ["A♠"])).toEqual(["K♠", "Q♠"]);
  });

  it("caps blind when there is no table to tier by", () => {
    expect(capRejected(rejected, undefined, ["A♠"])).toEqual(["K♠", "Q♠", "J♠"]);
  });

  it("is applied inside explainPlay, and the validator agrees with what was sent", async () => {
    // The cap must happen before the prompt is built AND before validation reads
    // the list — a notThis entry for a card the model was never asked about is
    // dropped, so the two views of `rejected` have to be the same view.
    const create = vi.fn().mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            why: "Dummy's A♦ wins this trick outright, and the rest of the suit stays good.",
            notThis: [
              { label: "6♦", why: "concedes four tricks" },
              { label: "Q♦", why: "spends an honour for nothing" }, // capped away
            ],
          }),
        },
      ],
      stop_reason: "end_turn",
    } as never);
    const pos = longSuitPos();
    const out = await explainPlay(
      {
        pos,
        best: ["A♦"],
        source: "solution",
        rejected: pos.legal.filter((c) => c !== "A♦"),
        scores: diamondScores,
      },
      { client: { create } as never },
    );
    const sent = (create.mock.calls[0]![0] as { messages: { content: string }[] }).messages[0]!.content;
    // The prompt names only the representatives: worst tier first, highest card of
    // each tier (6♦ alone on its tier, then the 10♦, then K♦ for the 8-trick tier).
    expect(sent).toContain("Cards it ruled out: 6♦, 10♦, K♦");
    // …and the validator keeps the capped card's clause while dropping the other.
    expect("explanation" in out).toBe(true);
    if ("explanation" in out) {
      expect(out.explanation.notThis?.map((n) => n.label)).toEqual(["6♦"]);
    }
  });
});

describe("placement claims: whose hand is being described", () => {
  // MEASURED, NOT GUESSED. Over eighteen real positions the blanket ban on "void"
  // was the single largest cause of a learner getting a card with no reason, and
  // both sentences it killed deserved to be shown. A void in your own hand or in
  // dummy is not a hidden layout — you are looking at it.
  const check = (why: string) => validateExplanation({ why }, input({ best: ["6♦"] }));

  it("allows a void it can see, in the learner's hand or dummy's", () => {
    for (const why of [
      "You are void in diamonds, so this is just a discard — throw the 6♦.",
      "Dummy is void in spades, so the 6♦ can be ruffed there later.",
      "Your hand is short in clubs, which is why the 6♦ keeps the entry.",
      "Dummy's holding is a doubleton, so the 6♦ sets up the ruff.",
    ]) {
      expect("explanation" in check(why), why).toBe(true);
    }
  });

  it("still rejects a void it cannot see", () => {
    for (const why of [
      "East is void in diamonds, so lead the 6♦ now.",
      "West was short in hearts, which makes the 6♦ safe.",
      "They are void in clubs, so the 6♦ runs.",
      "The defender has a singleton, so play the 6♦.",
    ]) {
      const out = check(why);
      expect("reason" in out, why).toBe(true);
      expect((out as { detail?: string }).detail, why).toMatch(/cannot see/);
    }
  });

  it("allows dummy sitting over the lead, the most ordinary explanation in bridge", () => {
    // Sentences of the shape the blanket rule threw away, written with this
    // fixture's visible cards so the placement rule is what is being tested rather
    // than the unseen-card rule.
    for (const why of [
      "Dummy's 6♦ sits over the lead, so your Q♦ isn't needed here — play the 6♦.",
      "Dummy still holds the 6♦ behind your Q♦, so the 6♦ costs no length.",
      "Your Q♦ sits over the suit, so play the 6♦.",
    ]) {
      expect("explanation" in check(why), why).toBe(true);
    }
  });

  it("allows a claim about your own hand even when an opponent led", () => {
    // The regression that killed the first attempt. "West" names who LED a card
    // that is face up on the table; it says nothing about what West holds, and the
    // claim itself is attributed to `your`.
    expect(
      "explanation" in check("The 2♦ West led is small, and your Q♦ sits behind dummy's 6♦."),
    ).toBe(true);
  });

  it("rejects a holding it cannot see sitting over one it can", () => {
    for (const why of [
      "The queen sits over your jack, so play the 6♦.",
      "West's king sits behind dummy's ace, so the 6♦ is safe.",
    ]) {
      expect("reason" in check(why), why).toBe(true);
    }
  });

  it("does not read 'hold the trick' as holding a card", () => {
    // "holds the" used to match "lets East hold the trick" — winning a trick, not
    // holding a card. It is scoped to a named honour now.
    expect(
      "explanation" in check("Win it with the 6♦; ducking lets East hold the trick."),
    ).toBe(true);
  });

  it("is not fooled by a visible subject standing further away than an opponent", () => {
    // "you" appears, but East is nearer, and the sentence leaks. Requiring a visible
    // subject is not enough on its own — the nearest subject is the one that counts.
    const out = check("You can tell East is void in hearts, so lead the 6♦.");
    expect("reason" in out).toBe(true);
  });

  it("keeps rejecting the claims that leak however they are phrased", () => {
    // These never depend on whose hand it is: an offside king, a marked holding, a
    // finesse that works are all statements about cards the learner cannot see.
    for (const why of [
      "Play the 6♦ — the king must be offside.",
      "The 6♦ works because the finesse fails here.",
      "Lead the 6♦; West holds the ace and will have to spend it.",
      "The 6♦ is best because the queen sits badly for them.",
    ]) {
      const out = check(why);
      expect("reason" in out, why).toBe(true);
      expect((out as { detail?: string }).detail, why).toMatch(/hidden layout/);
    }
  });
});

describe("a cost figure must be the one in the table", () => {
  // The model is handed exact trick counts, and the one thing it can do with an
  // exact number is get it wrong. Every other guard here passes such a sentence: the
  // card is real, the suit is right, nothing hidden is named. Only the arithmetic is
  // false, and arithmetic is checkable.
  const withTable = (why: string, notThis: { label: string; why: string }[]) =>
    validateExplanation(
      { why, notThis },
      input({
        source: "solution",
        best: ["6♦"],
        rejected: ["K♠", "3♣"],
        scores: [
          { card: "6♦", tricks: 9 },
          { card: "K♠", tricks: 7 }, // costs 2
          { card: "3♣", tricks: 8 }, // costs 1
        ],
      }),
    );

  it("discards an understated cost", () => {
    const out = withTable("Cash the 6♦ while the timing is right.", [
      { label: "K♠", why: "costing a trick" }, // it costs two
    ]);
    expect("reason" in out).toBe(true);
    expect((out as { detail?: string }).detail).toBe("said K♠ costs 1, table says 2");
  });

  it("discards an overstated cost", () => {
    const out = withTable("Cash the 6♦ while the timing is right.", [
      { label: "3♣", why: "gives up two tricks here" }, // it costs one
    ]);
    expect((out as { detail?: string }).detail).toBe("said 3♣ costs 2, table says 1");
  });

  it("discards a cost claimed as nothing", () => {
    const out = withTable("Cash the 6♦ while the timing is right.", [
      { label: "3♣", why: "costs nothing, it is just slower" },
    ]);
    expect((out as { detail?: string }).detail).toBe("said 3♣ costs 0, table says 1");
  });

  it("accepts the right figures, in words or digits", () => {
    for (const [label, phrase] of [
      ["K♠", "costing two tricks"],
      ["K♠", "loses 2 tricks"],
      ["K♠", "concedes two tricks"],
      ["3♣", "gives up a trick"],
      ["3♣", "costing one trick"],
    ] as const) {
      const out = withTable("Cash the 6♦ while the timing is right.", [{ label, why: phrase }]);
      expect("explanation" in out, `${label}: ${phrase}`).toBe(true);
    }
  });

  it("does not read the trick being PLAYED as a price", () => {
    // The sentence this rule was written against, and the reason it requires a cost
    // verb: "on a trick the ace already wins" contains "a trick" and claims nothing
    // about cost. An earlier draft matched any "<number> trick" phrase and would
    // have rejected a correct explanation of a two-trick error.
    const out = withTable("Keep the 6♦ where it is.", [
      { label: "K♠", why: "wastes the king on a trick the ace already wins, costing two tricks" },
    ]);
    expect("explanation" in out).toBe(true);
  });

  it("says nothing about costs it was never given a table for", () => {
    // No table means no claim to check. Silence, not a rejection.
    const out = validateExplanation(
      { why: "Cash the 6♦.", notThis: [{ label: "K♠", why: "costing three tricks" }] },
      input({ best: ["6♦"], rejected: ["K♠"] }),
    );
    expect("explanation" in out).toBe(true);
  });
});

describe("a tie broken by convention, not by the solver", () => {
  it("tells the model the preference is convention's and names the card", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ why: "Throw the 8♣ — nothing is gained by spending a higher club." }) }],
      stop_reason: "end_turn",
    } as never);
    await explainPlay(
      input({
        source: "solution",
        best: ["8♣", "10♣", "J♣"],
        prefer: "8♣",
        scores: [
          { card: "8♣", tricks: 9 },
          { card: "10♣", tricks: 9 },
          { card: "J♣", tricks: 9 },
        ],
      }),
      { client: { create } as never },
    );
    const sent = (create.mock.calls[0]![0] as { messages: { content: string }[] }).messages[0]!.content;
    expect(sent).toContain("8♣");
    // The provenance matters: a learner told the SOLVER prefers the 8♣ has been
    // misinformed. The solver rated all three identical; bridge broke the tie.
    expect(sent).toMatch(/convention/i);
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

describe("validateExplanation — a card from another suit cannot win THIS trick", () => {
  /**
   * South holds a spade as well as the diamonds, so the spade is VISIBLE. That is
   * the whole point of this fixture: an invisible wrong-suit card is already
   * caught by the unseen-card rule, so the only gap worth a new rule is a card the
   * learner really can see being credited with a trick it cannot win.
   */
  function withSpade(): ExplainInput {
    const s = {
      boardRef: "b", dealer: "N", vul: "none", phase: "play", turn: "N",
      contract: { level: 3, strain: "H", doubled: 0, declarer: "S" },
      hands: {
        N: cards("DJ DT D6"), E: cards("SK SJ"),
        S: cards("DQ D9 D7 SA"), W: cards("S3"),
      },
      auction: [{ seat: "E", call: "1S" }, { seat: "S", call: "2D" }],
      tricks: [{ leader: "W", plays: [{ seat: "W", card: one("D2") }] }],
      trickCount: { NS: 0, EW: 0 },
    } as unknown as GameState;
    return { ...input(), pos: visiblePosition(s, "S")! };
  }

  it("rejects crediting a visible spade with taking a diamond trick", () => {
    const out = validateExplanation(
      { why: "West led a small diamond, so play low and let your A♠ take care of the trick." },
      withSpade(),
    );
    expect("reason" in out).toBe(true);
    if ("reason" in out) expect(out.detail).toContain("wins a ♦ trick");
  });

  it("accepts the same sentence naming a card that CAN win it", () => {
    const out = validateExplanation(
      { why: "West led a small diamond, so play low and let your Q♦ take care of the trick." },
      withSpade(),
    );
    expect("explanation" in out).toBe(true);
  });

  it("still allows a cross-suit remark that claims no trick", () => {
    const out = validateExplanation(
      { why: "Play low on the 2♦ — you will want the lead later for your A♠." },
      withSpade(),
    );
    expect("explanation" in out).toBe(true);
  });

  it("an INVISIBLE wrong-suit card is caught earlier, by the unseen-card rule", () => {
    // Which is why the reported 9-of-something was almost certainly a diamond:
    // South held 9♦, and a 9♠ they did not hold would have been discarded here.
    const out = validateExplanation(
      { why: "Play low and let your 9♠ take care of the trick." },
      input(),
    );
    expect("reason" in out).toBe(true);
    if ("reason" in out) expect(out.detail).toContain("named unseen 9♠");
  });
});

// The lesson layer. The assertion that carries the most weight is the MATCH:
// it is a table written against what looking.ts and think.ts actually title
// their cards, so it is only correct for as long as that stays true. These
// tests run the real producers and check the registry recognizes what comes
// out — if a producer is ever retitled, this fails rather than the lesson
// quietly going empty on a learner's screen.

import type { GameState } from "@bridge/engine";
import type { Card, Seat, Suit } from "@bridge/events";
import { describe, expect, it } from "vitest";

import { kItemIdForCard, lessonCardKeys, lessonPlan, lessonSlots, momentPlan } from "./kLesson";
import { lookingAt } from "./looking";
import { thinkAid } from "./think";

const R: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};
const cards = (spec: string): Card[] =>
  spec.trim().split(/\s+/).map((t) => ({ suit: t[0] as Suit, rank: R[t[1]!]! as Card["rank"] }));

/** ♠AQ3 ♥J8 ♦Q5 ♣KJT753 — think.test.ts's hand, 13 HCP. */
const HAND = cards("SA SQ S3 HJ H8 DQ D5 CK CJ CT C7 C5 C3");

function state(over: Partial<GameState> = {}): GameState {
  return {
    boardRef: "b", dealer: "N", vul: "none", phase: "auction", turn: "S",
    hands: { N: [], E: [], S: HAND, W: [] },
    auction: [], contract: null, tricks: [], trickCount: { NS: 0, EW: 0 },
    ...over,
  } as GameState;
}

/** Every card the panel would hold for a position — both producers, merged
 *  exactly as GameState merges them. */
function panelCards(st: GameState, seat: Seat) {
  const look = lookingAt(st, seat);
  const aid = thinkAid(st, seat);
  return [
    ...(look?.facts ?? []).map((f) => ({
      title: f.label, value: f.value, ...(f.group ? { group: f.group } : {}),
    })),
    ...(aid?.knownCards ?? []).map((k) => ({
      title: k.title, value: k.value, ...(k.group ? { group: k.group } : {}),
    })),
  ];
}

describe("matching a producer's card to the registry", () => {
  it("recognizes the auction's own cards", () => {
    const ids = panelCards(state(), "S").map(kItemIdForCard);
    expect(ids).toContain("hcp");
    expect(ids).toContain("distribution");
    expect(ids).toContain("shape");
    expect(ids).toContain("points-out-there");
  });

  it("recognizes the play's cards, and folds HCP dealt onto the same id", () => {
    const st = state({
      phase: "play",
      // Declarer EAST, so the learner South DEFENDS. Under a North declarer
      // South would BE dummy, and thinkAid rightly answers "nothing to
      // decide" there — no worked-out cards to match against at all.
      contract: { level: 3, strain: "H", declarer: "E", doubled: 0 },
      // No `winner` — an unfinished trick, which is what puts a card on the table.
      tricks: [{ leader: "E", plays: [{ seat: "E", card: cards("DK")[0]! }] }],
      turn: "S",
    } as Partial<GameState>);
    const ids = panelCards(st, "S").map(kItemIdForCard);
    expect(ids).toContain("hcp"); // titled "HCP dealt" here — one idea, one id
    expect(ids).toContain("our-tricks");
    expect(ids).toContain("their-tricks");
    expect(ids).toContain("points-hidden");
    expect(ids).toContain("winning-so-far");
  });

  it("names a show-out by the side it files under, not by its title", () => {
    // The title is whichever seat showed out, so there is nothing to look up.
    expect(kItemIdForCard({ title: "Partner", value: "no ♦s", group: "partner" }))
      .toBe("show-out-partner");
    expect(kItemIdForCard({ title: "West", value: "no ♦s", group: "theirs" }))
      .toBe("show-out-opponent");
  });

  it("answers null for what the registry does not know", () => {
    // The system chip and the trick counter are readouts, not exercises.
    expect(kItemIdForCard({ title: "", value: "Trick 4" })).toBeNull();
    expect(kItemIdForCard({ title: "", value: "2/1 game force" })).toBeNull();
    // A model-authored read card carries a title nobody declared.
    expect(kItemIdForCard({ title: "Partner is short in spades", value: "likely", group: "partner" }))
      .toBeNull();
  });

  it("does not mistake an ordinary value for a show-out", () => {
    expect(kItemIdForCard({ title: "Still out", value: "5 ♥", group: "advanced" }))
      .toBe("still-out");
  });
});

describe("building the plan", () => {
  it("is null when the deal names no lesson", () => {
    expect(lessonPlan(undefined, "play")).toBeNull();
    expect(lessonPlan({}, "play")).toBeNull();
    expect(lessonPlan({ kTags: [] }, "play")).toBeNull();
    expect(lessonPlan({ kTags: ["not-a-tag"], kItems: ["not-an-item"] }, "play")).toBeNull();
  });

  it("selects for the phase the board is in", () => {
    const auction = lessonPlan({ kTags: ["counting-the-hand"] }, "auction")!;
    const play = lessonPlan({ kTags: ["counting-the-hand"] }, "play")!;
    expect(auction.items).toContain("points-out-there");
    expect(auction.items).not.toContain("points-hidden");
    expect(play.items).toContain("points-hidden");
  });

  it("names itself for the learner", () => {
    expect(lessonPlan({ kTags: ["trump-management"] }, "play")!.name).toBe("Trump management");
    expect(lessonPlan({ kTags: ["finesses", "entries"] }, "play")!.name).toBe("Finesses and Entries");
  });

  it("advertises only what a producer can make", () => {
    // responding is mostly READ — the lesson must not promise cards the panel
    // cannot draw until the knowledge base lands.
    const plan = lessonPlan({ kTags: ["responding"] }, "auction")!;
    expect(plan.items).not.toContain("combined-points");
    expect(plan.items).toContain("partner-ceiling");
  });

  it("keeps a lesson whose tags this build only half recognizes", () => {
    const plan = lessonPlan({ kTags: ["squeezes", "trump-management"] }, "play")!;
    expect(plan.tags).toEqual(["trump-management"]);
  });

  it("leads with the coach's own cards, not the whole topic", () => {
    // The topic sweeps up a dozen cards; the coach picked two of them, and
    // those two are the lesson.
    const whole = lessonPlan({ kTags: ["counting-the-hand"] }, "play")!;
    const picked = lessonPlan(
      { kTags: ["counting-the-hand"], kItems: ["points-hidden", "still-out"] },
      "play",
    )!;
    expect(whole.items.length).toBeGreaterThan(2);
    expect(picked.items).toEqual(["points-hidden", "still-out"]);
    // The topic still names it — the tags are the filter, not the collection.
    expect(picked.name).toBe("Counting the hand");
  });

  it("puts the coach's picks in teaching order, whatever order they picked", () => {
    const a = lessonPlan({ kItems: ["still-out", "points-hidden"] }, "play")!;
    const b = lessonPlan({ kItems: ["points-hidden", "still-out"] }, "play")!;
    expect(a.items).toEqual(b.items);
  });

  it("names a lesson picked without a topic after its cards", () => {
    const plan = lessonPlan({ kItems: ["points-hidden", "still-out"] }, "play")!;
    expect(plan.tags).toEqual([]);
    expect(plan.name).toBe("Points hidden and Still out");
  });

  it("drops a picked card the phase or the producers cannot support", () => {
    const plan = lessonPlan(
      // hcp is a play card too; total-points is auction-only; honour-location
      // is JUDGMENT, so no producer can make it yet.
      { kItems: ["hcp", "total-points", "honour-location"] },
      "play",
    )!;
    expect(plan.items).toEqual(["hcp"]);
  });

  it("keeps a lesson whose picks this build only half recognizes", () => {
    const plan = lessonPlan({ kItems: ["no-such-card", "points-hidden"] }, "play")!;
    expect(plan.items).toEqual(["points-hidden"]);
  });
});

describe("laying the lesson against the cards on screen", () => {
  const st = state({
    phase: "play",
    contract: { level: 3, strain: "H", declarer: "E", doubled: 0 },
    // No `winner` — an unfinished trick, which is what puts a card on the table.
      tricks: [{ leader: "E", plays: [{ seat: "E", card: cards("DK")[0]! }] }],
    turn: "S",
  } as Partial<GameState>);

  it("fills the slots it can and keeps the ones it cannot", () => {
    const plan = lessonPlan({ kTags: ["counting-the-hand"] }, "play")!;
    const slots = lessonSlots(plan, panelCards(st, "S"));
    expect(slots.map((s) => s.id)).toEqual(plan.items); // registry order, whole
    expect(slots.find((s) => s.id === "points-hidden")?.card).toBeTruthy();
    // Nobody has shown out yet, so that slot is honestly empty rather than absent.
    expect(slots.find((s) => s.id === "show-out-partner")?.card).toBeUndefined();
  });

  it("carries the registry's own title and why onto an unfilled slot", () => {
    const plan = lessonPlan({ kTags: ["counting-the-hand"] }, "play")!;
    const slot = lessonSlots(plan, [])[0]!;
    expect(slot.card).toBeUndefined();
    expect(slot.title.length).toBeGreaterThan(0);
    expect(slot.why.length).toBeGreaterThan(10);
  });

  it("marks exactly the on-topic cards for the ordinary views", () => {
    const all = panelCards(st, "S");
    const plan = lessonPlan({ kTags: ["trump-management"] }, "play")!;
    const keys = lessonCardKeys(plan, all, (c) => `${c.title}|${c.value}`);
    // Trump management wants the counting cards, not the learner's own HCP.
    expect([...keys].some((k) => k.startsWith("Winning so far|"))).toBe(true);
    expect([...keys].some((k) => k.startsWith("HCP dealt|"))).toBe(false);
  });

  it("hands a slot the VALUE the id-keyed producer made for it", () => {
    // The lesson's cards come from two places: a card the panel already holds
    // (matched by title) or a value produced for the item id. This is the
    // second path — the one that turned the waiting list into readings.
    const plan = lessonPlan({ kItems: ["tricks-remaining", "points-hidden"] }, "play")!;
    const withFacts = {
      ...plan,
      facts: [{ id: "tricks-remaining" as const, value: "12", detail: "One trick complete." }],
    };
    const slots = lessonSlots(withFacts, panelCards(st, "S"));
    const left = slots.find((s) => s.id === "tricks-remaining")!;
    expect(left.card).toBeUndefined();
    expect(left.fact).toEqual({ id: "tricks-remaining", value: "12", detail: "One trick complete." });
  });

  it("prefers the panel's OWN card when both exist", () => {
    // Two spellings of one fact would read as two facts. The card the learner
    // may also meet in the side views is the one that wins.
    const plan = lessonPlan({ kItems: ["points-hidden"] }, "play")!;
    const slots = lessonSlots(
      { ...plan, facts: [{ id: "points-hidden" as const, value: "99", detail: "no" }] },
      panelCards(st, "S"),
    );
    expect(slots[0]!.card).toBeTruthy();
    expect(slots[0]!.fact).toBeUndefined();
  });

  it("leaves a slot empty when neither a card nor a value exists", () => {
    const plan = lessonPlan({ kItems: ["show-out-partner"] }, "play")!;
    const slots = lessonSlots(plan, panelCards(st, "S"));
    expect(slots[0]!.card).toBeUndefined();
    expect(slots[0]!.fact).toBeUndefined();
  });

  it("marks nothing when there is no lesson", () => {
    expect(lessonCardKeys(null, panelCards(st, "S"), (c) => c.title).size).toBe(0);
  });
});

describe("cards pinned to a moment", () => {
  it("becomes a plan of its own, labelled as one", () => {
    const plan = momentPlan(["points-hidden", "still-out"], "play")!;
    expect(plan.items).toEqual(["points-hidden", "still-out"]);
    expect(plan.scope).toBe("here");
    expect(plan.tags).toEqual([]);
    expect(plan.name).toBe("Points hidden and Still out");
  });

  it("marks the board's own lesson as the board's", () => {
    expect(lessonPlan({ kItems: ["points-hidden"] }, "play")!.scope).toBe("board");
  });

  it("is null when the coach pinned nothing — the board's lesson then stands", () => {
    expect(momentPlan(undefined, "play")).toBeNull();
    expect(momentPlan([], "play")).toBeNull();
    expect(momentPlan(["no-such-card"], "play")).toBeNull();
  });

  it("is null when nothing pinned can appear in this phase", () => {
    // total-points is an auction card; pinning it to a trick teaches nothing,
    // and an empty pane with a heading is worse than the board's own lesson.
    expect(momentPlan(["total-points"], "play")).toBeNull();
    expect(momentPlan(["total-points"], "auction")).not.toBeNull();
  });

  it("drops what the producers cannot draw yet, like the board's lesson does", () => {
    const plan = momentPlan(["hcp", "honour-location"], "play")!;
    expect(plan.items).toEqual(["hcp"]);
  });
});

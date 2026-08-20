// Curated deals — the payload gate and the line arithmetic, tested pure.

import type { Call, Card, Seat, Suit } from "@bridge/events";
import { describe, expect, it } from "vitest";

import { MAX_DEAL_ITEMS } from "./coach/kSelection";

import {
  actionsSince,
  atKey,
  chartedActionAt,
  constraintOf,
  currentAt,
  firstDivergence,
  learnerSeatOf,
  lineOf,
  parseCurated,
  parseCuratedProgress,
  pathStatus,
  sameAt,
  serializeCurated,
  serializeCuratedProgress,
} from "./curated";

const call = (seat: Seat, c: string) => ({ seat, call: c as Call });
const card = (seat: Seat, suit: string, rank: number) =>
  ({ seat, card: { suit: suit as Suit, rank: rank as Card["rank"] } });

describe("parseCurated — the tolerant gate", () => {
  it("keeps well-formed annotations and drops the unreadable ALONE", () => {
    const { annotations } = parseCurated(
      JSON.stringify({
        annotations: [
          { at: { kind: "call", auctionIndex: 2 }, note: "Count first." },
          { at: { kind: "play", trickIndex: 3, playIndex: 1 }, hints: ["One", "Two", "Three"] },
          { at: { kind: "call", auctionIndex: -1 }, note: "bad index" },
          { at: { kind: "play", trickIndex: 14, playIndex: 0 }, note: "bad trick" },
          { at: { kind: "call", auctionIndex: 4 } }, // says nothing — dropped
          { at: { kind: "call", auctionIndex: 5 }, hints: ["only one rung"] }, // not a ladder
          "garbage",
        ],
      }),
    );
    expect(annotations).toHaveLength(2);
    expect(annotations[0]?.note).toBe("Count first.");
    expect(annotations[1]?.hints).toHaveLength(3);
  });

  it("survives junk whole", () => {
    expect(parseCurated(undefined).annotations).toEqual([]);
    expect(parseCurated("not json").annotations).toEqual([]);
    expect(parseCurated('"a string"').annotations).toEqual([]);
  });

  it("round-trips through serialize", () => {
    const payload = {
      annotations: [{ at: { kind: "call" as const, auctionIndex: 1 }, note: "hi", why: "because" }],
    };
    expect(parseCurated(serializeCurated(payload)).annotations).toEqual(payload.annotations);
  });
});

describe("parseCurated — the v2 board settings", () => {
  it("round-trips learnerSeat, constraint, intro, debrief and pin", () => {
    const payload = {
      v: 2 as const,
      annotations: [],
      learnerSeat: "W" as const,
      constraint: "locked" as const,
      intro: "Nine tricks are there.",
      debrief: "The finesse was the whole board.",
      pin: "West is the danger hand.",
    };
    const back = parseCurated(serializeCurated(payload));
    expect(back).toEqual(payload);
  });

  it("keeps each setting readable ALONE when another is junk", () => {
    const back = parseCurated(
      JSON.stringify({
        annotations: [],
        learnerSeat: "Q",           // not a seat — dropped
        constraint: "guided",       // fine — kept
        intro: 42,                  // not text — dropped
        pin: "  Keep East off lead.  ",
      }),
    );
    expect(back.learnerSeat).toBeUndefined();
    expect(back.constraint).toBe("guided");
    expect(back.intro).toBeUndefined();
    expect(back.pin).toBe("Keep East off lead.");
  });

  it("a v1 payload parses exactly as before — no v stamp, no settings", () => {
    const back = parseCurated(
      JSON.stringify({ annotations: [{ at: { kind: "call", auctionIndex: 0 }, note: "hi" }] }),
    );
    expect(back.v).toBeUndefined();
    expect(back.learnerSeat).toBeUndefined();
    expect(back.constraint).toBeUndefined();
    expect(back.annotations).toHaveLength(1);
  });

  it("the defaults centralize v1 meaning: South, guided", () => {
    expect(learnerSeatOf({})).toBe("S");
    expect(constraintOf({})).toBe("guided");
    expect(learnerSeatOf({ learnerSeat: "E" })).toBe("E");
    expect(constraintOf({ constraint: "free" })).toBe("free");
  });
});

describe("cards pinned to one decision", () => {
  it("round-trips the cards an annotation names", () => {
    const p = parseCurated(
      JSON.stringify({
        annotations: [
          { at: { kind: "play", trickIndex: 2, playIndex: 1 }, cards: ["trumps-out", "my-trumps"] },
        ],
      }),
    );
    expect(p.annotations[0]?.cards).toEqual(["trumps-out", "my-trumps"]);
  });

  it("keeps an annotation ALIVE on cards alone", () => {
    // Pointing at what to look at here is teaching, even with no prose: the
    // old rule ("says nothing = not an annotation") would have dropped it.
    const p = parseCurated(
      JSON.stringify({
        annotations: [{ at: { kind: "call", auctionIndex: 0 }, cards: ["hcp"] }],
      }),
    );
    expect(p.annotations).toHaveLength(1);
    expect(p.annotations[0]?.note).toBeUndefined();
  });

  it("still drops one that says nothing at all", () => {
    const p = parseCurated(
      JSON.stringify({
        annotations: [{ at: { kind: "call", auctionIndex: 0 }, cards: [] }],
      }),
    );
    expect(p.annotations).toHaveLength(0);
  });

  it("drops a card it has never heard of, keeping the rest", () => {
    const p = parseCurated(
      JSON.stringify({
        annotations: [
          { at: { kind: "call", auctionIndex: 1 }, note: "hi", cards: ["no-such-card", "hcp"] },
        ],
      }),
    );
    expect(p.annotations[0]?.cards).toEqual(["hcp"]);
  });

  it("caps them like the board's own lesson", () => {
    const many = [
      "hcp", "distribution", "shape", "longest-suit", "vulnerability",
      "total-points", "quick-tricks", "our-tricks", "their-tricks",
    ];
    const p = parseCurated(
      JSON.stringify({
        annotations: [{ at: { kind: "call", auctionIndex: 1 }, cards: many }],
      }),
    );
    expect(p.annotations[0]?.cards).toHaveLength(MAX_DEAL_ITEMS);
  });
});

describe("pathStatus — on the coach's line, or off it", () => {
  const line = lineOf({
    auction: [call("N", "1S"), call("E", "P"), call("S", "2S"), call("W", "P")],
    play: [card("E", "H", 14), card("S", "H", 2)],
  });

  it("a matching prefix is on-path", () => {
    const s = { auction: [call("N", "1S"), call("E", "P")], tricks: [] };
    expect(pathStatus(s, line, "S").onPath).toBe(true);
  });

  it("the learner's own wrong call diverges, flagged as just-now", () => {
    const s = { auction: [call("N", "1S"), call("E", "P"), call("S", "3S")], tricks: [] };
    const st = pathStatus(s, line, "S");
    expect(st.onPath).toBe(false);
    expect(st.divergedAtOwn).toBe(true);
    expect(st.divergedJustNow).toBe(true);
  });

  // The offer survives the ROBOTS' replies. They answer within the same
  // second the learner acts, so a window that closed on any following action
  // was one nobody could ever click in — the take-back was unreachable in
  // practice, which is exactly how it was reported.
  it("stays offerable while only other seats have answered", () => {
    const s = {
      auction: [call("N", "1S"), call("E", "P"), call("S", "3S"), call("W", "P")],
      tricks: [],
    };
    const st = pathStatus(s, line, "S");
    expect(st.onPath).toBe(false);
    expect(st.divergedJustNow).toBe(true);
    expect(st.divergedAt).toEqual({ kind: "call", auctionIndex: 2 });
  });

  it("stops being offerable once the learner acts again", () => {
    const s = {
      auction: [call("N", "1S"), call("E", "P"), call("S", "3S"), call("W", "P"), call("N", "P"), call("E", "P"), call("S", "P")],
      tricks: [],
    };
    expect(pathStatus(s, line, "S").divergedJustNow).toBe(false);
  });

  /**
   * DECLARER PLAYS DUMMY. The card is recorded at the seat it came FROM, so a
   * wrong card out of dummy is stamped North while the learner sits South.
   * Judged against their own seat alone it was "not theirs": no nudge, no
   * take-back, just a notice that they were off the line (owner report
   * 2026-08-17).
   */
  it("counts a wrong card from DUMMY as the declarer's own", () => {
    const off = {
      auction: line.auction.map((a) => ({ ...a })),
      contract: { declarer: "S" as const, strain: "S" as const, level: 2, doubled: 0 as const },
      // The line charts S's H2 second; N (dummy) puts up a card instead.
      tricks: [{ plays: [card("E", "H", 14), card("N", "H", 9)] }],
    };
    const st = pathStatus(off as never, line, "S");
    expect(st.onPath).toBe(false);
    expect(st.divergedAtOwn).toBe(true);
    expect(st.divergedJustNow).toBe(true);
  });

  it("still does not blame the learner for an opponent's card", () => {
    const off = {
      auction: line.auction.map((a) => ({ ...a })),
      contract: { declarer: "S" as const, strain: "S" as const, level: 2, doubled: 0 as const },
      tricks: [{ plays: [card("E", "H", 14), card("W", "H", 9)] }],
    };
    expect(pathStatus(off as never, line, "S").divergedAtOwn).toBe(false);
  });

  it("addresses a play divergence at its own position, not the last card", () => {
    const off = {
      auction: line.auction.map((a) => ({ ...a })),
      // S leaves the line, then W and N answer — the nudge must still speak
      // about S's card, at S's position.
      tricks: [{ plays: [card("E", "H", 14), card("S", "H", 9), card("W", "H", 3), card("N", "H", 4)] }],
    };
    const st = pathStatus(off as never, line, "S");
    expect(st.divergedAtOwn).toBe(true);
    expect(st.divergedJustNow).toBe(true);
    expect(st.divergedAt).toEqual({ kind: "play", trickIndex: 0, playIndex: 1 });
  });

  it("the play prefix counts too, in table order", () => {
    const on = {
      auction: line.auction.map((a) => ({ ...a })),
      tricks: [{ plays: [card("E", "H", 14)] }],
    };
    expect(pathStatus(on as never, line, "S").onPath).toBe(true);
    const off = {
      auction: line.auction.map((a) => ({ ...a })),
      tricks: [{ plays: [card("E", "H", 14), card("S", "H", 9)] }],
    };
    const st = pathStatus(off as never, line, "S");
    expect(st.onPath).toBe(false);
    expect(st.divergedAtOwn).toBe(true);
  });
});

describe("pathStatus under the TAKEOVER: dealt dummy, playing declarer's hand", () => {
  // The learner sits South and was dealt dummy; North declares and is a robot,
  // so South plays North's cards. A wrong card out of that hand is stamped with
  // NORTH'S seat — and reading it against the dealt seat alone made it somebody
  // else's move: no nudge, no take-back offered, just "you're off the line"
  // (bug report 2026-08-19, with a screenshot of exactly that sentence).
  const line = lineOf({
    auction: [call("N", "1S"), call("E", "P"), call("S", "2S"), call("W", "P")],
    play: [card("W", "S", 9), card("N", "S", 3)],
  });
  const auction = [call("N", "1S"), call("E", "P"), call("S", "2S"), call("W", "P")];
  const contract = { level: 2, strain: "S", declarer: "N" as const, doubled: 0 };
  // North's card is wrong: the line charts the 3♠, the board played the 10♠.
  const off = {
    auction,
    contract,
    tricks: [{ leader: "W", plays: [card("W", "S", 9), card("N", "S", 10)] }],
  };

  it("without the takeover seat it reads as somebody else's move", () => {
    const st = pathStatus(off as never, line, "S");
    expect(st.onPath).toBe(false);
    expect(st.divergedAtOwn).toBe(false); // the old behaviour, and the bug
  });

  it("with it, the move is theirs and the take-back is offered", () => {
    const st = pathStatus(off as never, line, "S", "N");
    expect(st.onPath).toBe(false);
    expect(st.divergedAtOwn).toBe(true);
    expect(st.divergedJustNow).toBe(true);
    expect(st.divergedAt).toEqual({ kind: "play", trickIndex: 0, playIndex: 1 });
  });

  it("still counts their own dealt hand as theirs, not only the chair they took", () => {
    // A guard rather than a discovery: `actor === seat` must stay in the test
    // alongside the new `actor === from`, or fixing the takeover would break
    // the ordinary case — a wrong card out of the learner's OWN hand.
    const longer = lineOf({
      auction,
      play: [card("W", "S", 9), card("N", "S", 3), card("E", "S", 4), card("S", "S", 2)],
    });
    const ownCardWrong = {
      auction,
      contract,
      tricks: [
        { leader: "W", plays: [card("W", "S", 9), card("N", "S", 3), card("E", "S", 4), card("S", "S", 5)] },
      ],
    };
    const st = pathStatus(ownCardWrong as never, longer, "S", "N");
    expect(st.onPath).toBe(false);
    expect(st.divergedAt).toEqual({ kind: "play", trickIndex: 0, playIndex: 3 });
    expect(st.divergedAtOwn).toBe(true);
  });

  it("leaves the opponents' cards out of it", () => {
    const theirs = {
      auction,
      contract,
      tricks: [{ leader: "W", plays: [card("W", "S", 8)] }],
    };
    const st = pathStatus(theirs as never, line, "S", "N");
    expect(st.onPath).toBe(false);
    expect(st.divergedAtOwn).toBe(false); // West's card, not the learner's
  });
});

describe("currentAt / chartedActionAt — the addressing", () => {
  it("addresses the next call during the auction", () => {
    const at = currentAt({ phase: "auction", auction: [call("N", "1S")], tricks: [] });
    expect(at).toEqual({ kind: "call", auctionIndex: 1 });
  });

  it("addresses the next card during a trick, and the next trick between them", () => {
    const mid = currentAt({
      phase: "play",
      auction: [],
      tricks: [{ plays: [card("E", "H", 14)] }],
    } as never);
    expect(mid).toEqual({ kind: "play", trickIndex: 0, playIndex: 1 });
  });

  it("reads the charted action back off the line", () => {
    const line = lineOf({
      auction: [call("N", "1S")],
      play: [card("E", "H", 14), card("S", "H", 2)],
    });
    expect(chartedActionAt(line, { kind: "call", auctionIndex: 0 })?.call).toBe("1S");
    expect(chartedActionAt(line, { kind: "play", trickIndex: 0, playIndex: 1 })?.card?.rank).toBe(2);
    expect(chartedActionAt(line, { kind: "call", auctionIndex: 9 })).toBeNull();
  });

  it("atKey is stable per address kind", () => {
    expect(atKey({ kind: "call", auctionIndex: 3 })).toBe("call:3");
    expect(atKey({ kind: "play", trickIndex: 2, playIndex: 1 })).toBe("play:2:1");
  });

  it("sameAt distinguishes kinds and coordinates", () => {
    expect(sameAt({ kind: "call", auctionIndex: 3 }, { kind: "call", auctionIndex: 3 })).toBe(true);
    expect(
      sameAt({ kind: "play", trickIndex: 1, playIndex: 2 }, { kind: "play", trickIndex: 1, playIndex: 2 }),
    ).toBe(true);
    expect(sameAt({ kind: "call", auctionIndex: 0 }, { kind: "play", trickIndex: 0, playIndex: 0 })).toBe(
      false,
    );
  });
});

describe("firstDivergence — the review loop's anchor", () => {
  const line = lineOf({
    auction: [call("N", "1S"), call("E", "P"), call("S", "2S"), call("W", "P")],
    play: [card("E", "H", 14), card("S", "H", 2)],
  });

  it("null while the session is a prefix of the line", () => {
    const s = { auction: [call("N", "1S"), call("E", "P")], tricks: [] };
    expect(firstDivergence(s, line)).toBeNull();
  });

  it("names the first wrong call, with what was charted there", () => {
    const s = { auction: [call("N", "1S"), call("E", "P"), call("S", "3S")], tricks: [] };
    const d = firstDivergence(s, line);
    expect(d?.at).toEqual({ kind: "call", auctionIndex: 2 });
    expect(d?.played.call).toBe("3S");
    expect(d?.charted?.call).toBe("2S");
  });

  it("names the first wrong card in trick coordinates", () => {
    const s = {
      auction: line.auction.map((a) => ({ ...a })),
      tricks: [{ plays: [card("E", "H", 14), card("S", "H", 9)] }],
    };
    const d = firstDivergence(s as never, line);
    expect(d?.at).toEqual({ kind: "play", trickIndex: 0, playIndex: 1 });
    expect(d?.played.card?.rank).toBe(9);
    expect(d?.charted?.card?.rank).toBe(2);
  });

  it("charted is null when the session outran the line's end", () => {
    const s = {
      auction: [...line.auction.map((a) => ({ ...a })), call("N", "P")],
      tricks: [],
    };
    const d = firstDivergence(s, line);
    expect(d?.at).toEqual({ kind: "call", auctionIndex: 4 });
    expect(d?.charted).toBeNull();
  });
});

describe("actionsSince — what the table did while the learner watched", () => {
  it("lists the other seats' actions since the learner last acted, oldest first", () => {
    const s = {
      auction: [call("N", "1S"), call("E", "P"), call("S", "2S"), call("W", "P"), call("N", "4S")],
      tricks: [],
    };
    expect(actionsSince(s, "S")).toEqual([
      { kind: "call", auctionIndex: 3 },
      { kind: "call", auctionIndex: 4 },
    ]);
  });

  it("is empty when the learner has just acted", () => {
    const s = { auction: [call("N", "1S"), call("E", "P"), call("S", "2S")], tricks: [] };
    expect(actionsSince(s, "S")).toEqual([]);
  });

  it("counts everything when the learner has not acted at all", () => {
    const s = { auction: [call("N", "1S"), call("E", "P")], tricks: [] };
    expect(actionsSince(s, "S")).toEqual([
      { kind: "call", auctionIndex: 0 },
      { kind: "call", auctionIndex: 1 },
    ]);
  });

  it("spans the auction into the play in table order", () => {
    const s = {
      auction: [call("N", "1S"), call("E", "P"), call("S", "2S"), call("W", "P"), call("N", "P")],
      tricks: [{ plays: [card("E", "H", 14)] }],
    };
    expect(actionsSince(s as never, "S")).toEqual([
      { kind: "call", auctionIndex: 3 },
      { kind: "call", auctionIndex: 4 },
      { kind: "play", trickIndex: 0, playIndex: 0 },
    ]);
  });

  it("treats DUMMY's card as the declarer's own, so their own play ends the run", () => {
    const s = {
      auction: [],
      contract: { declarer: "S" as const, strain: "S" as const, level: 2, doubled: 0 as const },
      // W leads, dummy (N) plays — that card is the learner's own, so only
      // East's card after it is "what happened while they watched".
      tricks: [{ plays: [card("W", "H", 3), card("N", "H", 9), card("E", "H", 14)] }],
    };
    expect(actionsSince(s as never, "S")).toEqual([{ kind: "play", trickIndex: 0, playIndex: 2 }]);
  });
});

describe("parseCuratedProgress — the ladder-open stamps", () => {
  it("keeps string keys, dedupes, survives junk", () => {
    expect(parseCuratedProgress(undefined).opened).toEqual([]);
    expect(parseCuratedProgress("not json").opened).toEqual([]);
    expect(parseCuratedProgress(JSON.stringify({ opened: "nope" })).opened).toEqual([]);
    expect(
      parseCuratedProgress(JSON.stringify({ opened: ["call:1", 7, "call:1", "play:0:2"] })).opened,
    ).toEqual(["call:1", "play:0:2"]);
  });

  it("round-trips through serialize", () => {
    const p = { opened: ["call:3", "play:2:1"] };
    expect(parseCuratedProgress(serializeCuratedProgress(p))).toEqual(p);
  });
});

describe("the lesson a curated deal names", () => {
  it("round-trips the tags the coach picked", () => {
    const p = parseCurated(
      JSON.stringify({ annotations: [], kTags: ["trump-management", "finesses"] }),
    );
    expect(p.kTags).toEqual(["trump-management", "finesses"]);
    // A lesson is a v2 setting, so its presence alone stamps the payload.
    expect(p.v).toBe(2);
  });

  it("survives the re-serialize every publish does", () => {
    // save/route.ts republishes as serializeCurated({ ...parsed, annotations }).
    // Before the payload carried kTags this dropped the lesson silently.
    const first = parseCurated(JSON.stringify({ annotations: [], kTags: ["finesses"] }));
    const again = parseCurated(serializeCurated({ ...first, annotations: [] }));
    expect(again.kTags).toEqual(["finesses"]);
  });

  it("drops a tag it has never heard of, keeping the rest", () => {
    const p = parseCurated(JSON.stringify({ annotations: [], kTags: ["squeezes", "endplays"] }));
    expect(p.kTags).toEqual(["endplays"]);
  });

  it("says nothing rather than throwing when the field is junk", () => {
    for (const junk of ["finesses", 7, null, [1, 2], {}]) {
      expect(parseCurated(JSON.stringify({ annotations: [], kTags: junk })).kTags).toBeUndefined();
    }
  });

  it("caps how many lessons one board may claim", () => {
    const many = [
      "finesses", "entries", "endplays", "signaling", "discarding", "preempts", "overcalls",
    ];
    expect(parseCurated(JSON.stringify({ annotations: [], kTags: many })).kTags).toHaveLength(6);
  });

  it("leaves an untagged deal untagged", () => {
    expect(parseCurated(JSON.stringify({ annotations: [] })).kTags).toBeUndefined();
  });
});

describe("the cards a curated deal leads with", () => {
  it("round-trips the coach's own picks", () => {
    const p = parseCurated(JSON.stringify({ annotations: [], kItems: ["hcp", "still-out"] }));
    expect(p.kItems).toEqual(["hcp", "still-out"]);
    expect(p.v).toBe(2);
  });

  it("survives the re-serialize every publish does", () => {
    const first = parseCurated(JSON.stringify({ annotations: [], kItems: ["hcp"] }));
    const again = parseCurated(serializeCurated({ ...first, annotations: [] }));
    expect(again.kItems).toEqual(["hcp"]);
  });

  it("drops a card it has never heard of, keeping the rest", () => {
    const p = parseCurated(JSON.stringify({ annotations: [], kItems: ["no-such-card", "hcp"] }));
    expect(p.kItems).toEqual(["hcp"]);
  });

  it("says nothing rather than throwing when the field is junk", () => {
    for (const junk of ["hcp", 7, null, [1, 2], {}]) {
      expect(parseCurated(JSON.stringify({ annotations: [], kItems: junk })).kItems)
        .toBeUndefined();
    }
  });

  it("caps how many cards one board may lead with, at the picker's own cap", () => {
    const many = [
      "hcp", "distribution", "shape", "longest-suit", "vulnerability", "total-points",
      "quick-tricks", "our-tricks", "their-tricks", "points-hidden",
    ];
    const p = parseCurated(JSON.stringify({ annotations: [], kItems: many }));
    // The validator keeps its own copy of the cap (it imports no coach logic
    // beyond the registry); this pins the two to the same number.
    expect(p.kItems).toHaveLength(MAX_DEAL_ITEMS);
  });

  it("keeps the topic and the cards independently readable", () => {
    // Junk in one half must not cost the other — the payload's whole rule.
    const p = parseCurated(
      JSON.stringify({ annotations: [], kTags: ["finesses"], kItems: "hcp" }),
    );
    expect(p.kTags).toEqual(["finesses"]);
    expect(p.kItems).toBeUndefined();
  });

  it("leaves a deal that picked nothing unpicked", () => {
    expect(parseCurated(JSON.stringify({ annotations: [] })).kItems).toBeUndefined();
  });
});

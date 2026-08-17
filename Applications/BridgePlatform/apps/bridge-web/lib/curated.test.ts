// Curated deals — the payload gate and the line arithmetic, tested pure.

import type { Call, Card, Seat, Suit } from "@bridge/events";
import { describe, expect, it } from "vitest";

import {
  atKey,
  chartedActionAt,
  currentAt,
  firstDivergence,
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
// The comparison model's rules, without a DOM: where two lines split, what a
// line is doing at a scrubbed ply, and how a shared ply maps back onto ONE
// line's own timeline (the number `ensureFromPointBaseline` forks at).

import type { Card, Rank, Seat, Suit } from "@bridge/events";
import { describe, expect, it } from "vitest";
import {
  BIDDING_ONLY_RESULT,
  TONE_INK,
  auctionGrid,
  clampPly,
  divergePly,
  divergenceLabel,
  divergentPlies,
  forkLabel,
  frameAt,
  handRows,
  initials,
  ownPly,
  positionLabel,
  syncAt,
  timelineOf,
  type CompareLine,
} from "./compareView";

// ── fixtures ────────────────────────────────────────────────────────────────

const card = (s: string): Card => ({ suit: s[0] as Suit, rank: Number(s.slice(1)) as Rank });

/** Four cards, one per seat, in the order a trick is played. */
const trick = (leader: Seat, cards: string[]): { seat: Seat; card: Card }[] => {
  const order: Seat[] = ["N", "E", "S", "W"];
  const start = order.indexOf(leader);
  return cards.map((c, i) => ({ seat: order[(start + i) % 4] as Seat, card: card(c) }));
};

const AUCTION: { seat: Seat; call: Call }[] = [
  { seat: "S", call: "1H" },
  { seat: "W", call: "P" },
  { seat: "N", call: "4H" },
  { seat: "E", call: "P" },
  { seat: "S", call: "P" },
  { seat: "W", call: "P" },
];
type Call = string;

const SEAT_CARDS: Card[] = [
  card("S14"),
  card("S13"),
  card("H10"),
  card("H9"),
  card("D5"),
  card("C2"),
];

function line(over: Partial<CompareLine> = {}): CompareLine {
  return {
    key: "u1",
    kind: "user",
    who: "You",
    short: "You",
    badge: "YOUR LINE",
    editor: false,
    isViewer: true,
    contract: "4♥",
    contractRed: true,
    byLine: "by You",
    declarer: "S",
    result: "Down 1",
    made: false,
    resultTone: "bad",
    rawText: "-50",
    auction: AUCTION,
    play: [...trick("W", ["S3", "S14", "S6", "S13"]), ...trick("S", ["H10", "H4", "H2", "H7"])],
    seatCards: SEAT_CARDS,
    // Trick 1: North's ace of spades wins. Trick 2: South's ten of hearts.
    trickWinners: ["N", "S"],
    ...over,
  };
}

// ── divergence ──────────────────────────────────────────────────────────────

describe("divergePly", () => {
  it("returns null when the two lines are identical", () => {
    const a = line();
    const b = line({ key: "BEN" });
    expect(divergePly(a, b)).toBeNull();
    expect(divergentPlies(a, b)).toEqual([]);
  });

  it("finds a split in the auction before looking at any card", () => {
    const a = line();
    const b = line({
      key: "BEN",
      auction: [...AUCTION.slice(0, 2), { seat: "N", call: "3H" }, ...AUCTION.slice(3)],
      play: [...trick("W", ["S2", "S14", "S6", "S13"]), ...trick("S", ["H10", "H4", "H2", "H7"])],
    });
    // ply 2 is the third call — the auction beats the play to it.
    expect(divergePly(a, b)).toBe(2);
  });

  it("finds the first card that differs, indexed past the auction band", () => {
    const a = line();
    const b = line({
      key: "BEN",
      play: [...trick("W", ["S3", "S14", "S6", "S13"]), ...trick("S", ["H9", "H4", "H2", "H7"])],
      trickWinners: ["S", "S"],
    });
    const t = timelineOf(a, b);
    // auction (6 plies) + the 5th card
    expect(divergePly(a, b)).toBe(t.aucLen + 4);
    expect(divergenceLabel(divergePly(a, b), t)).toBe("Lines diverged here · Trick 2");
  });

  it("lists every differing ply for the track ticks, not just the first", () => {
    const a = line();
    const b = line({
      key: "BEN",
      play: [...trick("W", ["S3", "S14", "S6", "S13"]), ...trick("S", ["H9", "H4", "H2", "H7"])],
    });
    const t = timelineOf(a, b);
    // Only the one card differs here; the seats and the rest are card-for-card.
    expect(divergentPlies(a, b)).toEqual([t.aucLen + 4]);
  });

  it("treats a line that simply stops as diverging at its end", () => {
    const a = line();
    const b = line({ key: "BEN", play: a.play.slice(0, 5), trickWinners: ["N"] });
    const t = timelineOf(a, b);
    expect(divergePly(a, b)).toBe(t.aucLen + 5);
  });

  it("spans the LONGER auction when the two lines bid a different number of times", () => {
    const a = line();
    const b = line({ key: "BEN", auction: AUCTION.slice(0, 4) });
    const t = timelineOf(a, b);
    expect(t.aucLen).toBe(6);
    expect(divergePly(a, b)).toBe(4);
    expect(divergenceLabel(divergePly(a, b), t)).toBe("Lines diverge in the auction");
  });
});

// ── ply indexing ────────────────────────────────────────────────────────────

describe("frameAt", () => {
  const a = line();
  const t = timelineOf(a, a);

  it("shows the auction, with nothing on the table", () => {
    const f = frameAt(a, 0, t, "S");
    expect(f.phase).toBe("auction");
    expect(f.curCall).toBe("1H");
    expect(f.curSeat).toBe("S");
    expect(f.trick).toEqual([]);
    expect(f.remaining).toHaveLength(6);
  });

  it("turns the first play ply into the first card of trick 1", () => {
    const f = frameAt(a, t.aucLen, t, "S");
    expect(f.phase).toBe("play");
    expect(f.trickNo).toBe(1);
    expect(f.trick).toHaveLength(1);
    expect(f.just?.seat).toBe("W");
    expect(f.turn).toBe("N");
    expect(f.tally).toEqual({ ns: 0, ew: 0 });
  });

  it("fills the trick card by card and counts it only once it is complete", () => {
    expect(frameAt(a, t.aucLen + 2, t, "S").trick).toHaveLength(3);
    expect(frameAt(a, t.aucLen + 2, t, "S").tally).toEqual({ ns: 0, ew: 0 });
    const done = frameAt(a, t.aucLen + 3, t, "S");
    expect(done.trick).toHaveLength(4);
    expect(done.tally).toEqual({ ns: 1, ew: 0 });
  });

  it("starts the next trick from a clean table", () => {
    const f = frameAt(a, t.aucLen + 4, t, "S");
    expect(f.trickNo).toBe(2);
    expect(f.trick).toHaveLength(1);
    expect(f.trick[0]?.seat).toBe("S");
  });

  it("removes the human seat's played cards from the hand strip", () => {
    // West leads, so South's card of trick 1 is the fourth (S13); South then
    // leads the ten of hearts to trick 2.
    const ids = (ply: number) =>
      frameAt(a, ply, t, "S").remaining.map((c) => `${c.suit}${c.rank}`);
    expect(ids(t.aucLen + 2)).toContain("S13");
    expect(ids(t.aucLen + 3)).not.toContain("S13");
    // Never anyone else's card: North's ace of spades is not in South's hand.
    expect(ids(t.aucLen + 3)).toContain("S14");
    expect(ids(t.aucLen + 4)).not.toContain("H10");
  });

  it("holds the last position of a line that ran out, and says it ended", () => {
    const short = line({ key: "BEN", play: a.play.slice(0, 4), trickWinners: ["N"] });
    const t2 = timelineOf(a, short);
    const f = frameAt(short, t2.aucLen + 6, t2, "S");
    expect(f.ended).toBe(true);
    expect(f.just).toBeNull();
    expect(f.trick).toHaveLength(4);
  });

  it("clamps a scrub outside the track", () => {
    expect(clampPly(-9, t)).toBe(0);
    expect(clampPly(999, t)).toBe(t.maxPly);
  });
});

describe("ownPly", () => {
  it("is the shared ply itself while both lines are bidding", () => {
    const a = line();
    const t = timelineOf(a, a);
    expect(ownPly(a, 3, t)).toBe(3);
  });

  it("counts a line's OWN calls plus the cards, not the shared auction band", () => {
    const a = line();
    const shortAuction = line({ key: "BEN", auction: AUCTION.slice(0, 4) });
    const t = timelineOf(a, shortAuction);
    // Shared band is 6 long; this line only bid 4 times, so its first card is
    // its own ply 4 — the fork point BEN is handed.
    expect(ownPly(shortAuction, t.aucLen, t)).toBe(4);
    expect(ownPly(shortAuction, t.aucLen + 3, t)).toBe(7);
    // The viewer's own longer line keeps the shared indexing.
    expect(ownPly(a, t.aucLen + 3, t)).toBe(9);
  });

  it("never runs past the end of the line it indexes", () => {
    const a = line();
    const t = timelineOf(a, a);
    expect(ownPly(a, t.maxPly, t)).toBe(a.auction.length + a.play.length - 1);
  });
});

// ── the cross-line readout ──────────────────────────────────────────────────

describe("syncAt", () => {
  const a = line();

  it("compares calls while either line is still bidding", () => {
    const b = line({ auction: [...AUCTION.slice(0, 2), { seat: "N", call: "3H" }, ...AUCTION.slice(3)] });
    const t = timelineOf(a, b);
    const s = syncAt(a, b, 2, t, "S");
    expect(s.mode).toBe("auction");
    expect(s.differ).toBe(true);
    expect(s.mine.text).toBe("4♥");
    expect(s.cmp.text).toBe("3♥");
  });

  it("reads in sync when both lines play the same card", () => {
    const t = timelineOf(a, a);
    const s = syncAt(a, a, t.aucLen, t, "S");
    expect(s.mode).toBe("play");
    expect(s.differ).toBe(false);
    expect(s.seatName).toBe("West");
    expect(s.mine.text).toBe("3♠");
  });

  it("reads split when the cards differ", () => {
    const b = line({
      play: [...trick("W", ["S3", "S14", "S6", "S13"]), ...trick("S", ["H9", "H4", "H2", "H7"])],
    });
    const t = timelineOf(a, b);
    const s = syncAt(a, b, t.aucLen + 4, t, "S");
    expect(s.differ).toBe(true);
    expect(s.mine.text).toBe("10♥");
    expect(s.cmp.text).toBe("9♥");
  });
});

// ── labels + grid ───────────────────────────────────────────────────────────

describe("labels", () => {
  const a = line();
  const t = timelineOf(a, a);

  it("names the auction ply and the trick", () => {
    expect(positionLabel(0, t, a).label).toBe("Auction · South 1♥");
    expect(positionLabel(t.aucLen + 5, t, a)).toEqual({
      label: "Trick 2",
      sub: "Card 2 of 4 · play ply 6 of 8",
    });
  });

  it("names where a from-point fork was taken", () => {
    expect(forkLabel(1, t)).toBe("the auction");
    expect(forkLabel(t.aucLen + 4, t)).toBe("trick 2");
  });

  it("makes initials out of a display name", () => {
    expect(initials("Devan Rao")).toBe("DR");
    expect(initials("BEN")).toBe("BE");
  });
});

describe("auctionGrid", () => {
  const a = line();

  it("aligns the first call under the dealer's column and pads before it", () => {
    const grid = auctionGrid({
      line: a,
      dealer: "S",
      vul: "ew",
      reveal: 6,
      ply: 0,
      divergeAt: null,
    });
    // Column order is W N E S, so a South dealer starts in column 3.
    expect(grid.dealerCol).toBe(3);
    expect(grid.rows[0]?.slice(0, 3).every((c) => !c.filled)).toBe(true);
    expect(grid.rows[0]?.[3]?.text).toBe("1♥");
    expect(grid.rows[0]?.[3]?.current).toBe(true);
    expect(grid.rows[1]?.[0]?.text).toBe("P");
    expect(grid.heads.filter((h) => h.vul).map((h) => h.seat)).toEqual(["W", "E"]);
  });

  it("hides calls the scrubber has not reached and marks the divergence cell", () => {
    const grid = auctionGrid({
      line: a,
      dealer: "S",
      vul: "none",
      reveal: 3,
      ply: 2,
      divergeAt: 2,
    });
    expect(grid.rows[1]?.[1]?.text).toBe("4♥");
    expect(grid.rows[1]?.[1]?.divergent).toBe(true);
    // ply 3 onwards is not revealed yet
    expect(grid.rows[1]?.[2]?.text).toBe("");
  });

  it("carries the other line's differing call as a ghost", () => {
    const ghost = line({
      auction: [...AUCTION.slice(0, 2), { seat: "N", call: "3H" }, ...AUCTION.slice(3)],
    });
    const grid = auctionGrid({
      line: a,
      ghostLine: ghost,
      dealer: "S",
      vul: "none",
      reveal: 6,
      ply: 2,
      divergeAt: 2,
    });
    expect(grid.rows[1]?.[1]?.ghost?.text).toBe("3♥");
    expect(grid.rows[0]?.[3]?.ghost).toBeUndefined();
  });
});

describe("handRows", () => {
  it("reads as a hand, high card first, with an em-dash for a void", () => {
    const rows = handRows(SEAT_CARDS);
    expect(rows.map((r) => r.text)).toEqual(["AK", "109", "2", "5"]);
  });
});

// ── a board that ended with its auction ─────────────────────────────────────
//
// A bidding-only line is frozen at the close of the auction, so it carries a
// contract and NO cards. Everything the surface derives has to survive that:
// the shared timeline is the auction and nothing else, and the end state is the
// contract reached rather than a made/down figure invented from zero tricks.

/** A finished bidding-only line: an auction, a contract, no cards, no score. */
function auctionOnly(over: Partial<CompareLine> = {}): CompareLine {
  return line({
    play: [],
    trickWinners: [],
    result: BIDDING_ONLY_RESULT,
    made: false,
    resultTone: "neutral",
    rawText: "",
    ...over,
  });
}

describe("an auction-only line", () => {
  it("makes a timeline out of the auction alone", () => {
    const a = auctionOnly();
    const b = auctionOnly({ key: "BEN" });
    const t = timelineOf(a, b);
    expect(t.aucLen).toBe(AUCTION.length);
    expect(t.playLen).toBe(0);
    // The last ply is the last call — there is no play band past it.
    expect(t.maxPly).toBe(AUCTION.length - 1);
    expect(clampPly(999, t)).toBe(AUCTION.length - 1);
  });

  it("stays in the auction at every ply on the track", () => {
    const a = auctionOnly();
    const t = timelineOf(a, a);
    for (let ply = 0; ply <= t.maxPly; ply++) {
      const f = frameAt(a, ply, t, "S");
      expect(f.phase).toBe("auction");
      expect(f.trick).toEqual([]);
      // No card ever leaves the seat's hand.
      expect(f.remaining).toHaveLength(SEAT_CARDS.length);
    }
    expect(positionLabel(t.maxPly, t, a)).toEqual({
      label: "Auction · West P",
      sub: `Bidding · ply ${AUCTION.length} of ${AUCTION.length}`,
    });
  });

  it("splits on a call, and reports agreement as an AUCTION they shared", () => {
    const a = auctionOnly();
    const b = auctionOnly({
      key: "BEN",
      auction: [...AUCTION.slice(0, 2), { seat: "N", call: "3H" }, ...AUCTION.slice(3)],
    });
    const t = timelineOf(a, b);
    expect(divergePly(a, b, t)).toBe(2);
    expect(divergenceLabel(divergePly(a, b, t), t)).toBe("Lines diverge in the auction");
    // Two identical auctions agreed on the bidding, not on cards nobody played.
    const same = timelineOf(a, a);
    expect(divergenceLabel(divergePly(a, a, same), same)).toBe("Both lines bid the same auction");
  });

  it("reads its result in the quiet ink — a contract reached is not a defeat", () => {
    expect(auctionOnly().result).toBe("Bidding only");
    expect(TONE_INK.neutral).not.toBe(TONE_INK.bad);
    expect(TONE_INK.neutral).not.toBe(TONE_INK.good);
  });
});

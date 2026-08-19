// The LOCKED board's gate (curated v2): the learner's action must BE the
// charted one — and every softer outcome (guided board, off the line, a
// missing entry, no stamp at all) must pass untouched, because a gate that
// fails closed would freeze a learner's table over an infrastructure blink.

import type { LibraryEntry, SessionView } from "@bridge/sessions";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getEntry = vi.fn<(entryId: string) => Promise<LibraryEntry | null>>();

// Only the reader the gate uses is stubbed; the rest of the module's surface
// is inert stand-ins so the test cannot drift from the real import graph.
vi.mock("@/lib/sessions", () => ({
  libraryStore: () => ({ getEntry: (id: string) => getEntry(id) }),
  sessionService: vi.fn(),
  submissionStore: vi.fn(),
  assignmentStore: vi.fn(),
  sessionIsGone: vi.fn(),
}));

const { assertCoachLine, OffLineError } = await import("./curatedGate");

type Seat = "N" | "E" | "S" | "W";
const call = (seat: Seat, c: string) => ({ seat, call: c });
const card = (seat: Seat, suit: string, rank: number) => ({
  seat,
  card: { suit, rank },
});

/** A curated view: learner human in South, robots elsewhere. */
const view = (state: Record<string, unknown>, curated = true): SessionView =>
  ({
    record: {
      ...(curated ? { curated: { entryId: "le1" } } : {}),
      seats: {
        N: { kind: "kb" },
        E: { kind: "kb" },
        S: { kind: "human", nexusUserId: "u1" },
        W: { kind: "kb" },
      },
    },
    state,
  }) as unknown as SessionView;

/** The coach's entry: N deals, the line is 1S-P-2S-P then a heart lead. */
const entry = (constraint: string): LibraryEntry =>
  ({
    entryId: "le1",
    auction: [call("N", "1S"), call("E", "P"), call("S", "2S"), call("W", "P")],
    play: [card("E", "H", 14), card("S", "H", 2)],
    curatedJson: JSON.stringify({
      v: 2,
      annotations: [
        {
          at: { kind: "call", auctionIndex: 2 },
          why: "Two spades keeps the auction low.",
          hints: ["Count first.", "The answer: 2S."],
        },
      ],
      learnerSeat: "S",
      constraint,
    }),
  }) as unknown as LibraryEntry;

/** On the line, the learner's call up next (index 2). */
const atLearnersCall = { phase: "auction", auction: [call("N", "1S"), call("E", "P")], tricks: [] };

describe("assertCoachLine — the locked board's gate", () => {
  beforeEach(() => {
    getEntry.mockReset();
    getEntry.mockResolvedValue(entry("locked"));
  });

  it("refuses an off-line call with the coach's why and the ladder flag", async () => {
    const err = await assertCoachLine(view(atLearnersCall), { call: "3S" }).catch((e) => e);
    expect(err).toBeInstanceOf(OffLineError);
    expect((err as InstanceType<typeof OffLineError>).why).toBe(
      "Two spades keeps the auction low.",
    );
    expect((err as InstanceType<typeof OffLineError>).hintAvailable).toBe(true);
  });

  it("lets the charted call through", async () => {
    await expect(assertCoachLine(view(atLearnersCall), { call: "2S" })).resolves.toBeUndefined();
  });

  it("judges cards during the play the same way", async () => {
    const playState = {
      phase: "play",
      auction: [call("N", "1S"), call("E", "P"), call("S", "2S"), call("W", "P")],
      contract: { declarer: "S", strain: "S", level: 2, doubled: 0 },
      tricks: [{ plays: [card("E", "H", 14)] }],
    };
    await expect(
      assertCoachLine(view(playState), { card: { suit: "H", rank: 9 } as never }),
    ).rejects.toBeInstanceOf(OffLineError);
    await expect(
      assertCoachLine(view(playState), { card: { suit: "H", rank: 2 } as never }),
    ).resolves.toBeUndefined();
  });

  it("holds nobody on a guided or free board", async () => {
    getEntry.mockResolvedValue(entry("guided"));
    await expect(assertCoachLine(view(atLearnersCall), { call: "3S" })).resolves.toBeUndefined();
    getEntry.mockResolvedValue(entry("free"));
    await expect(assertCoachLine(view(atLearnersCall), { call: "3S" })).resolves.toBeUndefined();
  });

  it("stands down once the session is already off the line", async () => {
    const offLine = {
      phase: "auction",
      auction: [call("N", "1S"), call("E", "1NT")], // E left the line
      tricks: [],
    };
    await expect(assertCoachLine(view(offLine), { call: "3S" })).resolves.toBeUndefined();
  });

  it("stands down where the line ended before the board did", async () => {
    const pastTheLine = {
      phase: "play",
      auction: [call("N", "1S"), call("E", "P"), call("S", "2S"), call("W", "P")],
      contract: { declarer: "S", strain: "S", level: 2, doubled: 0 },
      // Both charted plays made — the next card is past the line's end.
      tricks: [{ plays: [card("E", "H", 14), card("S", "H", 2)] }],
    };
    await expect(
      assertCoachLine(view(pastTheLine), { card: { suit: "D", rank: 5 } as never }),
    ).resolves.toBeUndefined();
  });

  it("fails OPEN: no stamp, no entry, or a store fault all pass", async () => {
    await expect(
      assertCoachLine(view(atLearnersCall, false), { call: "3S" }),
    ).resolves.toBeUndefined();
    getEntry.mockResolvedValue(null);
    await expect(assertCoachLine(view(atLearnersCall), { call: "3S" })).resolves.toBeUndefined();
    getEntry.mockRejectedValue(new Error("cold connection"));
    await expect(assertCoachLine(view(atLearnersCall), { call: "3S" })).resolves.toBeUndefined();
  });
});

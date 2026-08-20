// Whose decision it is. Four doors ask this — Owlee's hint, Owlee's ladder, the
// why route and BEN's tell — and every one of them had its own copy of the rule
// with the same hole in it: a learner dealt DUMMY, playing the declarer's hand
// because that chair is a robot's, was told "not your turn" at every decision of
// the board (bug report 2026-08-19). So the rule lives in one place and this
// pins all four of its cases.

import type { GameState } from "@bridge/engine";
import type { Seat } from "@bridge/events";
import { describe, expect, it } from "vitest";

import { decisionIsTheirs, playsFrom } from "./turn";

const human = { kind: "human" as const };
const robot = { kind: "kb_player" as const };

/** A table: which chairs hold people. */
const table = (mine: Seat[]) =>
  ({
    seats: Object.fromEntries(
      (["N", "E", "S", "W"] as Seat[]).map((s) => [s, mine.includes(s) ? human : robot]),
    ),
  }) as { seats: Record<Seat, { kind: string }> };

const play = (declarer: Seat, turn: Seat): GameState =>
  ({
    phase: "play",
    turn,
    contract: { level: 3, strain: "N", declarer, doubled: 0 },
    tricks: [],
  }) as unknown as GameState;

const auction = (turn: Seat): GameState =>
  ({ phase: "auction", turn, contract: null, tricks: [] }) as unknown as GameState;

describe("an ordinary table: one person, three robots", () => {
  const solo = table(["S"]);

  it("gives the learner their own card", () => {
    expect(decisionIsTheirs(solo, play("S", "S"), "S")).toBe(true);
    expect(playsFrom(solo, play("S", "S"), "S")).toBe("S");
  });

  it("gives the DECLARER dummy's card too", () => {
    // South declares, dummy North is on play: still South's decision.
    expect(decisionIsTheirs(solo, play("S", "N"), "S")).toBe(true);
  });

  it("keeps its hands off an opponent's card", () => {
    expect(decisionIsTheirs(solo, play("S", "W"), "S")).toBe(false);
    expect(decisionIsTheirs(solo, play("S", "E"), "S")).toBe(false);
  });

  it("answers the auction on the plain rule", () => {
    expect(decisionIsTheirs(solo, auction("S"), "S")).toBe(true);
    expect(decisionIsTheirs(solo, auction("W"), "S")).toBe(false);
  });
});

describe("THE LEARNER NEVER SITS OUT: dealt dummy, robot partner declaring", () => {
  // The case every door got wrong. South was dealt dummy; North declares and is
  // a robot, so South plays North's hand — which is what the table draws, what
  // the session service accepts, and what the coach must agree with.
  const solo = table(["S"]);

  it("plays from the DECLARER'S chair, not the dealt one", () => {
    expect(playsFrom(solo, play("N", "N"), "S")).toBe("N");
  });

  it("says the declarer's card is theirs", () => {
    expect(decisionIsTheirs(solo, play("N", "N"), "S")).toBe(true);
  });

  it("says dummy's card — their own dealt hand — is theirs as well", () => {
    expect(decisionIsTheirs(solo, play("N", "S"), "S")).toBe(true);
  });

  it("still keeps its hands off the opponents", () => {
    expect(decisionIsTheirs(solo, play("N", "E"), "S")).toBe(false);
    expect(decisionIsTheirs(solo, play("N", "W"), "S")).toBe(false);
  });
});

describe("a person's chair is not the learner's to take", () => {
  // Two people at the table: North's chair is not South's to take, so dummy
  // watches — the takeover exists to stop a learner watching a ROBOT play.
  const pair = table(["N", "S"]);

  it("leaves the declarer's chair alone", () => {
    expect(playsFrom(pair, play("N", "N"), "S")).toBe("S");
    expect(decisionIsTheirs(pair, play("N", "N"), "S")).toBe(false);
  });

  it("but their OWN card is still their own", () => {
    // Not a rules statement, a platform one: `controllingSeat` maps only the
    // DECLARER'S chair, so a human dummy's own card is accepted from them and
    // this predicate agrees rather than inventing a stricter table. What the
    // takeover changes is only the robot-declarer case above.
    expect(decisionIsTheirs(pair, play("N", "S"), "S")).toBe(true);
  });
});

describe("positions with nothing to decide", () => {
  const solo = table(["S"]);

  it("answers false with no contract in the play phase", () => {
    const odd = { phase: "play", turn: "S", contract: null, tricks: [] } as unknown as GameState;
    expect(decisionIsTheirs(solo, odd, "S")).toBe(false);
    expect(playsFrom(solo, odd, "S")).toBe("S");
  });

  it("answers false once the board is complete", () => {
    const done = { phase: "complete", turn: "S", contract: null, tricks: [] } as unknown as GameState;
    expect(decisionIsTheirs(solo, done, "S")).toBe(false);
  });
});

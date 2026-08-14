// Domain-model and persistence behaviours: the ONE results-unlock rule
// (ADDENDUM A3), the participant model that must not assume three BEN
// opponents (A6), the standard board cycle, the BEN decision-cache key, and
// the store seam (in-memory + JSON-file roundtrip over all six record kinds).

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Card, Seat } from "@bridge/events";
import {
  baselineId,
  benHistoryHash,
  benHistoryKey,
  boardParticipants,
  challengeIsEditable,
  InMemoryChallengeStore,
  resultsUnlocked,
  standardDealer,
  standardVul,
  type Challenge,
  type ChallengeBaseline,
  type ChallengeBoard,
  challengeVisibleInScope,
  type ChallengeInvite,
  type ChallengePlay,
} from "./index";
import { JsonFileChallengeStore } from "./fileStore";

const CH: Challenge = {
  challengeId: "ch1",
  title: "Tuesday eight",
  scoring: "imps",
  createdBy: "user_creator",
  status: "open",
  editorBadge: false,
  standingsVisibility: "after-finish",
  createdAt: "2026-08-07T10:00:00.000Z",
};

const emptyPack: Record<Seat, Card[]> = { N: [], E: [], S: [], W: [] };

const BOARD: ChallengeBoard = {
  challengeId: "ch1",
  boardNo: 1,
  pack: emptyPack,
  dealer: "N",
  vul: "none",
  humanSeat: "S",
  controlOverrides: { "table.undo": "hide", "table.hands_view": "hide" },
};

describe("resultsUnlocked — the one rule", () => {
  it("stays locked for an unfinished, non-moderator viewer of an after-finish challenge", () => {
    expect(
      resultsUnlocked({
        viewerFinished: false,
        viewerIsModerator: false,
        standingsVisibility: "after-finish",
      }),
    ).toBe(false);
  });
  it("unlocks once the viewer has finished every board", () => {
    expect(
      resultsUnlocked({
        viewerFinished: true,
        viewerIsModerator: false,
        standingsVisibility: "after-finish",
      }),
    ).toBe(true);
  });
  it("unlocks for a moderator who has not finished", () => {
    expect(
      resultsUnlocked({
        viewerFinished: false,
        viewerIsModerator: true,
        standingsVisibility: "after-finish",
      }),
    ).toBe(true);
  });
  it("unlocks for everyone when standings are always visible", () => {
    expect(
      resultsUnlocked({
        viewerFinished: false,
        viewerIsModerator: false,
        standingsVisibility: "always",
      }),
    ).toBe(true);
  });
});

describe("boardParticipants", () => {
  it("defaults to the viewer at humanSeat and BEN everywhere else", () => {
    expect(boardParticipants(BOARD, "user_a")).toEqual([
      { seat: "S", kind: "user", userId: "user_a" },
      { seat: "W", kind: "ben" },
      { seat: "N", kind: "ben" },
      { seat: "E", kind: "ben" },
    ]);
  });
  it("honours an explicit plan rather than assuming three BEN opponents", () => {
    // The shape must already support a partly-human table (ADDENDUM A6).
    const shared: ChallengeBoard = {
      ...BOARD,
      participants: [
        { seat: "S", kind: "user" },
        { seat: "W", kind: "ben" },
        { seat: "N", kind: "user", userId: "user_partner" },
        { seat: "E", kind: "ben" },
      ],
    };
    expect(boardParticipants(shared, "user_a")).toEqual([
      { seat: "S", kind: "user", userId: "user_a" },
      { seat: "W", kind: "ben" },
      { seat: "N", kind: "user", userId: "user_partner" },
      { seat: "E", kind: "ben" },
    ]);
  });
  it("follows humanSeat when the creator moved it", () => {
    const north = boardParticipants({ ...BOARD, humanSeat: "N" }, "user_a");
    expect(north.find((p) => p.kind === "user")).toEqual({
      seat: "N",
      kind: "user",
      userId: "user_a",
    });
    expect(north.filter((p) => p.kind === "ben").map((p) => p.seat)).toEqual(["S", "W", "E"]);
  });
});

describe("the standard board cycle", () => {
  it("deals N, E, S, W from board 1", () => {
    expect([1, 2, 3, 4, 5].map(standardDealer)).toEqual(["N", "E", "S", "W", "N"]);
  });
  it("runs the 16-board vulnerability cycle and wraps", () => {
    expect(Array.from({ length: 16 }, (_, i) => standardVul(i + 1))).toEqual([
      "none", "ns", "ew", "both",
      "ns", "ew", "both", "none",
      "ew", "both", "none", "ns",
      "both", "none", "ns", "ew",
    ]);
    expect(standardVul(17)).toBe("none");
  });
});

describe("challengeIsEditable", () => {
  it("is true until the first participant starts a board", () => {
    expect(challengeIsEditable(CH)).toBe(true);
  });
  it("is false once locked, and false when archived", () => {
    expect(challengeIsEditable({ ...CH, lockedAt: "2026-08-07T11:00:00.000Z" })).toBe(false);
    expect(challengeIsEditable({ ...CH, status: "archived" })).toBe(false);
  });
});

describe("the BEN decision cache key", () => {
  const position = {
    dealer: "N" as Seat,
    auction: [
      { seat: "N" as Seat, call: "1N" },
      { seat: "E" as Seat, call: "P" },
    ],
    play: [{ seat: "E" as Seat, card: { suit: "S", rank: 14 } as Card }],
  };
  it("is stable for the same position", () => {
    expect(benHistoryHash(position)).toBe(benHistoryHash({ ...position }));
  });
  it("differs when the line diverges", () => {
    const diverged = { ...position, auction: [{ seat: "N" as Seat, call: "1S" }] };
    expect(benHistoryHash(diverged)).not.toBe(benHistoryHash(position));
  });
  it("serializes readably", () => {
    expect(benHistoryKey(position)).toBe("N/N1N,EP/ES14");
  });
});

describe("baselineId", () => {
  it("separates the on-demand kinds by user and ply", () => {
    const base = { challengeId: "ch1", boardNo: 3 } as const;
    expect(baselineId({ ...base, kind: "full_ben" })).toBe("ch1|3|full_ben||");
    expect(baselineId({ ...base, kind: "your_contract", userId: "u1" })).not.toBe(
      baselineId({ ...base, kind: "your_contract", userId: "u2" }),
    );
    expect(baselineId({ ...base, kind: "from_point", userId: "u1", ply: 8 })).not.toBe(
      baselineId({ ...base, kind: "from_point", userId: "u1", ply: 9 }),
    );
  });
});

describe("club scope (0029)", () => {
  const IN_CLUB: Challenge = { ...CH, challengeId: "ch_club", nexusProgramId: "club-a" };
  const OTHER_CLUB: Challenge = { ...CH, challengeId: "ch_other", nexusProgramId: "club-b" };
  // Pre-0029, and the deliberate cross-org case: no owner at all.
  const UNSCOPED: Challenge = { ...CH, challengeId: "ch_legacy" };

  it("keeps a club's challenges to that club", () => {
    expect(challengeVisibleInScope(IN_CLUB, "club-a")).toBe(true);
    expect(challengeVisibleInScope(OTHER_CLUB, "club-a")).toBe(false);
  });

  it("shows an unowned challenge everywhere — the cross-org door", () => {
    expect(challengeVisibleInScope(UNSCOPED, "club-a")).toBe(true);
    expect(challengeVisibleInScope(UNSCOPED, "club-b")).toBe(true);
  });

  it("keeps a PRIVATE TABLE off every club's list", () => {
    // Its owner is null, like a legacy row's — but scope_level says it belongs to a
    // person, not to nobody. Confusing the two would put every private table between
    // friends on every club's challenge list, which is the opposite of private.
    const PERSONAL: Challenge = {
      ...CH,
      challengeId: "ch_private",
      scopeLevel: "user",
    };
    expect(challengeVisibleInScope(PERSONAL, "club-a")).toBe(false);
    expect(challengeVisibleInScope(PERSONAL, "club-b")).toBe(false);
    // Asked for WITHOUT a club — the private-tables read — it is visible.
    expect(challengeVisibleInScope(PERSONAL, null)).toBe(true);
  });

  it("deleting takes every record kind with it, not just the challenge", async () => {
    // The six tables have no foreign keys between them, so nothing cascades: a delete
    // that removed only the challenge row would leave five kinds of orphan keyed to an
    // id nothing resolves. This is the test that notices when a seventh kind is added
    // and forgotten.
    const store = new InMemoryChallengeStore();
    const id = CH.challengeId;
    await store.putChallenge(CH);
    await store.putBoard(BOARD);
    await store.putInvite({
      challengeId: id,
      userId: "user_a",
      userName: "A",
      status: "accepted",
      moderator: false,
      invitedBy: CH.createdBy,
      invitedAt: CH.createdAt,
    });
    await store.putPlay({
      challengeId: id,
      boardNo: BOARD.boardNo,
      userId: "user_a",
      sessionId: "sess_1",
      status: "in-progress",
      startedAt: CH.createdAt,
    });

    // A SECOND challenge, untouched — a delete that took the whole table with it
    // would still pass every assertion about the first one.
    const other: Challenge = { ...CH, challengeId: "ch_other_keep" };
    await store.putChallenge(other);

    await store.deleteChallenge(id);

    expect(await store.getChallenge(id)).toBeNull();
    expect(await store.listBoards(id)).toEqual([]);
    expect(await store.listInvites({ challengeId: id })).toEqual([]);
    expect(await store.listPlays({ challengeId: id })).toEqual([]);
    expect(await store.listBaselines(id)).toEqual([]);
    expect(await store.countDecisions(id)).toBe(0);
    expect(await store.getChallenge("ch_other_keep")).not.toBeNull();
  });

  it("deleting something already gone is not an error", async () => {
    const store = new InMemoryChallengeStore();
    await expect(store.deleteChallenge("ch_never_existed")).resolves.toBeUndefined();
  });

  it("restricts nothing when the caller has no scope", () => {
    // What the JSON dev store and any internal read with no club in hand get.
    expect(challengeVisibleInScope(OTHER_CLUB, null)).toBe(true);
    expect(challengeVisibleInScope(OTHER_CLUB, undefined)).toBe(true);
  });

  it("filters a listing by scope, and never hides the unowned", async () => {
    const store = new InMemoryChallengeStore();
    await store.putChallenge(IN_CLUB);
    await store.putChallenge(OTHER_CLUB);
    await store.putChallenge(UNSCOPED);

    const inA = await store.listChallenges({ programId: "club-a" });
    expect(inA.map((c) => c.challengeId).sort()).toEqual(["ch_club", "ch_legacy"]);

    // Omitting the scope is the pre-0029 behaviour: everything.
    expect(await store.listChallenges({})).toHaveLength(3);
  });

  it("still ANDs with the invite id set", async () => {
    const store = new InMemoryChallengeStore();
    await store.putChallenge(IN_CLUB);
    await store.putChallenge(UNSCOPED);
    // Invited to the legacy one only: the club filter must not add the other back.
    const rows = await store.listChallenges({ challengeIds: ["ch_legacy"], programId: "club-a" });
    expect(rows.map((c) => c.challengeId)).toEqual(["ch_legacy"]);
  });
});

describe("store — in-memory", () => {
  it("round-trips all six record kinds", async () => {
    const store = new InMemoryChallengeStore();

    await store.putChallenge(CH);
    expect(await store.getChallenge("ch1")).toEqual(CH);
    expect(await store.listChallenges({ createdBy: "user_creator" })).toHaveLength(1);
    expect(await store.listChallenges({ createdBy: "someone_else" })).toHaveLength(0);
    expect(await store.listChallenges({ challengeIds: ["ch1"] })).toHaveLength(1);
    expect(await store.listChallenges({ challengeIds: [] })).toHaveLength(0);

    await store.putBoard(BOARD);
    await store.putBoard({ ...BOARD, boardNo: 2, dealer: "E", vul: "ns" });
    expect((await store.listBoards("ch1")).map((b) => b.boardNo)).toEqual([1, 2]);
    expect((await store.getBoard("ch1", 2))!.dealer).toBe("E");

    const invite: ChallengeInvite = {
      challengeId: "ch1",
      userId: "user_creator",
      status: "accepted",
      moderator: true,
      invitedBy: "user_creator",
      invitedAt: "2026-08-07T10:00:00.000Z",
    };
    await store.putInvite(invite);
    await store.putInvite({
      ...invite,
      userId: "user_b",
      status: "pending",
      moderator: false,
      invitedAt: "2026-08-07T10:01:00.000Z",
    });
    expect(await store.listInvites({ challengeId: "ch1" })).toHaveLength(2);
    expect(await store.listInvites({ status: "pending" })).toHaveLength(1);
    expect((await store.getInvite("ch1", "user_creator"))!.moderator).toBe(true);

    const play: ChallengePlay = {
      challengeId: "ch1",
      boardNo: 1,
      userId: "user_b",
      sessionId: "sess_1",
      status: "in_progress",
      startedAt: "2026-08-07T11:00:00.000Z",
    };
    await store.putPlay(play);
    // One attempt, resume-only: completing the SAME (challenge, board, user)
    // must update the row, never add a second.
    await store.putPlay({
      ...play,
      status: "completed",
      rawScore: 620,
      completedAt: "2026-08-07T11:20:00.000Z",
    });
    expect(await store.listPlays({ challengeId: "ch1" })).toHaveLength(1);
    expect((await store.getPlay("ch1", 1, "user_b"))!.rawScore).toBe(620);
    expect(await store.listPlays({ status: "completed" })).toHaveLength(1);
    expect(await store.listPlays({ userId: "nobody" })).toHaveLength(0);

    const baseline: ChallengeBaseline = {
      challengeId: "ch1",
      boardNo: 1,
      kind: "full_ben",
      status: "pending",
      createdAt: "2026-08-07T10:00:05.000Z",
    };
    await store.putBaseline(baseline);
    await store.putBaseline({ ...baseline, status: "ready", rawScore: 140 });
    await store.putBaseline({
      ...baseline,
      kind: "from_point",
      userId: "user_b",
      ply: 8,
      status: "ready",
    });
    expect(await store.listBaselines("ch1")).toHaveLength(2);
    expect((await store.getBaseline({ challengeId: "ch1", boardNo: 1, kind: "full_ben" }))!.rawScore)
      .toBe(140);
    expect(
      await store.getBaseline({ challengeId: "ch1", boardNo: 1, kind: "from_point", userId: "user_b", ply: 9 }),
    ).toBeNull();

    await store.putDecision({
      challengeId: "ch1",
      boardNo: 1,
      historyHash: "abc123",
      decision: { kind: "call", seat: "W", call: "P" },
      createdAt: "2026-08-07T11:05:00.000Z",
    });
    expect((await store.getDecision("ch1", 1, "abc123"))!.decision).toEqual({
      kind: "call",
      seat: "W",
      call: "P",
    });
    expect(await store.getDecision("ch1", 1, "nope")).toBeNull();
    expect(await store.countDecisions("ch1")).toBe(1);
  });
});

describe("store — JSON file", () => {
  it("persists across two instances", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "bridge-challenges-")), "challenges-store.json");
    const first = new JsonFileChallengeStore(file);
    await first.putChallenge(CH);
    await first.putBoard(BOARD);
    await first.putDecision({
      challengeId: "ch1",
      boardNo: 1,
      historyHash: "h1",
      decision: { kind: "card", seat: "E", card: { suit: "S", rank: 14 } },
      createdAt: "2026-08-07T11:05:00.000Z",
    });

    const reopened = new JsonFileChallengeStore(file);
    expect(await reopened.getChallenge("ch1")).toEqual(CH);
    expect((await reopened.getBoard("ch1", 1))!.controlOverrides["table.undo"]).toBe("hide");
    expect(await reopened.countDecisions("ch1")).toBe(1);
  });
});

// A PRACTICE REPLAY IS STILL A BOARD OF ITS CHALLENGE (owner, 2026-08-10).
//
// The replay deliberately wears no challenge chrome and writes no play record,
// so `challengeTableContext` returns null for it — which is exactly why the
// table could once be played out with cards on a board whose challenge only
// ever asked for an auction. The format is read from the SESSION'S OWN STAMP
// instead, and that is what this pins.

import type { Challenge } from "@bridge/challenges";
import type { SessionRecord, SessionView } from "@bridge/sessions";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getChallenge = vi.fn<(challengeId: string) => Promise<Challenge | null>>();

// Only the reader this function uses is stubbed; everything else the module
// imports is left alone, so the test cannot drift from the real import graph.
vi.mock("@/lib/challenges", () => ({
  getChallenge: (id: string) => getChallenge(id),
  challengeStore: vi.fn(),
  challengeViewerAccess: vi.fn(),
  getChallengeBoard: vi.fn(),
  listChallengeBaselines: vi.fn(),
  listChallengeBoards: vi.fn(),
  listChallengeInvites: vi.fn(),
  listChallengePlays: vi.fn(),
}));

const { practiceIsBiddingOnly } = await import("./challengeTable");

const challenge = (format?: Challenge["format"]): Challenge => ({
  challengeId: "ch1",
  title: "A challenge",
  scoring: "imps",
  createdBy: "u-coach",
  status: "open",
  ...(format ? { format } : {}),
  editorBadge: false,
  standingsVisibility: "after-finish",
  createdAt: "2026-08-01T00:00:00.000Z",
});

const sitting = (stamp?: SessionRecord["challenge"]): SessionView =>
  ({ record: { challenge: stamp } }) as unknown as SessionView;

describe("practiceIsBiddingOnly", () => {
  beforeEach(() => {
    getChallenge.mockReset();
    getChallenge.mockResolvedValue(challenge("bidding-only"));
  });

  it("ends a bidding-only replay where the scored board ended", async () => {
    expect(await practiceIsBiddingOnly(sitting({ challengeId: "ch1", boardNo: 2, practice: true }))).toBe(
      true,
    );
    expect(getChallenge).toHaveBeenCalledWith("ch1");
  });

  it("leaves a full-format replay playing all thirteen tricks", async () => {
    getChallenge.mockResolvedValue(challenge());
    expect(await practiceIsBiddingOnly(sitting({ challengeId: "ch1", boardNo: 1, practice: true }))).toBe(
      false,
    );
  });

  it("says nothing about an ordinary table, which has no stamp at all", async () => {
    expect(await practiceIsBiddingOnly(sitting())).toBe(false);
    expect(getChallenge).not.toHaveBeenCalled();
  });

  it("says nothing about a SCORED board — its format arrives on the chrome", async () => {
    expect(await practiceIsBiddingOnly(sitting({ challengeId: "ch1", boardNo: 1 }))).toBe(false);
    expect(getChallenge).not.toHaveBeenCalled();
  });

  it("degrades to an ordinary table when the challenge cannot be read", async () => {
    getChallenge.mockResolvedValue(null);
    expect(await practiceIsBiddingOnly(sitting({ challengeId: "gone", boardNo: 1, practice: true }))).toBe(
      false,
    );
  });
});

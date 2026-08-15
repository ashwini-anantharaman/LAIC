import { describe, expect, it } from "vitest";
import { seededDeal } from "@bridge/engine";
import { challengeFormat, isBiddingOnly, standardDealer, standardVul } from "@bridge/challenges";
import type { Card, Seat } from "@bridge/events";
import { rankLabel } from "@bridge/events";
import { SUIT_ORDER } from "../../../lib/dealText";
import {
  CHALLENGE_CONTROLS,
  controlOverridesOf,
  defaultControlStates,
  FORMAT_OPTIONS,
  packFromDraft,
  normalizeDraft,
  validateDraft,
  type ChallengeDraft,
} from "./draft";

const serialize = (hands: Record<Seat, Card[]>): Record<Seat, string> => {
  const out = {} as Record<Seat, string>;
  for (const seat of ["N", "E", "S", "W"] as Seat[])
    out[seat] = SUIT_ORDER.map((suit) =>
      hands[seat]
        .filter((c) => c.suit === suit)
        .sort((a, b) => b.rank - a.rank)
        .map((c) => rankLabel(c.rank))
        .join(""),
    ).join(".");
  return out;
};

function draft(patch: Partial<ChallengeDraft> = {}): ChallengeDraft {
  return {
    title: "Friday Night IMPs",
    description: "Six boards, sharp bidding.",
    scoring: "imps",
    standingsVisibility: "after-finish",
    boards: [1, 2].map((boardNo) => ({
      boardNo,
      seed: 1000 + boardNo,
      dealer: standardDealer(boardNo),
      humanSeat: "S" as Seat,
    })),
    controlOverrides: { "table.undo": "hide", "table.hands_view": "hide" },
    invites: [{ userId: "user_coach_carlos", moderator: true }],
    editorBadge: false,
    ...patch,
  };
}

describe("challenge draft validation", () => {
  it("accepts the wizard's default draft", () => {
    expect(validateDraft(draft())).toEqual([]);
  });

  it("requires a title", () => {
    expect(validateDraft(draft({ title: "   " }))[0]).toMatch(/title/i);
  });

  it("rejects a board count outside 1–16", () => {
    const boards = Array.from({ length: 17 }, (_, i) => ({
      boardNo: i + 1,
      seed: i,
      dealer: "N" as Seat,
      humanSeat: "S" as Seat,
    }));
    expect(validateDraft(draft({ boards }))[0]).toMatch(/1–16 boards/);
  });

  it("rejects an out-of-order board number", () => {
    const boards = draft().boards;
    boards[1] = { ...boards[1]!, boardNo: 7 };
    expect(validateDraft(draft({ boards }))[0]).toMatch(/numbered 7/);
  });

  it("rejects a control key that is not on the checklist", () => {
    const errors = validateDraft(draft({ controlOverrides: { "table.nope": "hide" } }));
    expect(errors[0]).toMatch(/not a table control/);
  });

  it("rejects the same person invited twice", () => {
    const invites = [
      { userId: "u1", moderator: false },
      { userId: "u1", moderator: true },
    ];
    expect(validateDraft(draft({ invites }))[0]).toMatch(/invited twice/);
  });

  it("round-trips a hand-edited pack through the DealEditor serialization", () => {
    const hands = seededDeal(42);
    const pack = serialize(hands);
    const parsed = packFromDraft(pack);
    expect("hands" in parsed).toBe(true);
    if ("hands" in parsed)
      for (const seat of ["N", "E", "S", "W"] as Seat[])
        expect(parsed.hands[seat]).toHaveLength(13);
    expect(validateDraft(draft({ boards: [{ boardNo: 1, seed: 42, dealer: "N", humanSeat: "S", pack }] }))).toEqual([]);
  });

  it("rejects a pack that does not hold 13 cards a seat", () => {
    const hands = seededDeal(42);
    const pack = serialize(hands);
    pack.N = pack.S; // two seats holding the same cards
    const errors = validateDraft(
      draft({ boards: [{ boardNo: 1, seed: 42, dealer: "N", humanSeat: "S", pack }] }),
    );
    expect(errors[0]).toMatch(/Board 1 pack/);
  });
});

describe("challenge table-control defaults", () => {
  it("hides undo and the four-hand view by default, per the spec", () => {
    const states = defaultControlStates();
    expect(states["table.undo"]).toBe("hide");
    expect(states["table.hands_view"]).toBe("hide");
    expect(controlOverridesOf(states)).toEqual({
      "table.undo": "hide",
      "table.hands_view": "hide",
    });
  });

  it("keeps every other control on the catalogue's answer", () => {
    const states = defaultControlStates();
    for (const control of CHALLENGE_CONTROLS)
      if (!["table.undo", "table.hands_view"].includes(control.key))
        expect(states[control.key]).toBe("default");
  });
});

describe("standard board cycle", () => {
  it("deals dealer and vulnerability from the standard cycle", () => {
    expect(standardDealer(1)).toBe("N");
    expect(standardVul(1)).toBe("none");
    expect(standardVul(16)).toBe("ew");
  });
});

describe("a board's own vulnerability", () => {
  it("is optional — a random board follows the standard cycle instead", () => {
    expect(validateDraft(draft())).toEqual([]);
  });

  it("is accepted when a board carries one (an imported BBO deal does)", () => {
    const d = draft();
    d.boards[0]!.vul = "ew";
    expect(validateDraft(d)).toEqual([]);
  });

  it("is rejected when it is not a vulnerability at all", () => {
    const d = draft();
    // A client is never the authority: a hand-rolled payload gets checked.
    (d.boards[0] as { vul?: unknown }).vul = "everyone";
    expect(validateDraft(d)).toContain("Board 1 has no vulnerability.");
  });
});

describe("the challenge FORMAT (bid & play vs bidding only)", () => {
  it("is optional, and absent means the full board — nothing stored changes", () => {
    const d = draft();
    expect(d.format).toBeUndefined();
    expect(validateDraft(d)).toEqual([]);
    expect(challengeFormat(d)).toBe("full");
  });

  it("accepts either option explicitly", () => {
    expect(validateDraft(draft({ format: "full" }))).toEqual([]);
    expect(validateDraft(draft({ format: "bidding-only" }))).toEqual([]);
    expect(challengeFormat({ format: "bidding-only" })).toBe("bidding-only");
    expect(isBiddingOnly({ format: "bidding-only" })).toBe(true);
    expect(isBiddingOnly({})).toBe(false);
  });

  it("rejects anything else — a client is never the authority", () => {
    const d = draft();
    (d as { format?: unknown }).format = "declarer-play-only";
    expect(validateDraft(d)).toContain(
      "Pick whether the board is bid and played, or bidding only.",
    );
  });

  it("still requires a legal scoring mode, which bidding-only carries unused", () => {
    const d = draft({ format: "bidding-only" });
    (d as { scoring?: unknown }).scoring = "vibes";
    expect(validateDraft(d)).toContain("Pick a scoring method.");
  });

  it("offers exactly the two formats the model knows about", () => {
    expect(FORMAT_OPTIONS.map((f) => f.key)).toEqual(["full", "bidding-only"]);
  });
});

describe("normalizeDraft", () => {
  it("reopens a draft saved by an older build", () => {
    // Every field missing, and one that was legal once. A parked draft must
    // still OPEN — a draft you cannot reopen is worse than one never saved.
    const d = normalizeDraft({ title: "Half-built", boards: [{ seed: 5 }], format: "gone" });
    expect(d.title).toBe("Half-built");
    expect(d.scoring).toBe("imps");
    expect(d.standingsVisibility).toBe("after-finish");
    expect(d.format).toBeUndefined();
    expect(d.boards).toEqual([{ boardNo: 1, seed: 5, dealer: "N", humanSeat: "S" }]);
    expect(d.invites).toEqual([]);
    expect(d.editorBadge).toBe(false);
  });

  it("keeps what is valid and drops what is not", () => {
    const d = normalizeDraft({
      title: "Real",
      description: "x",
      format: "bidding-only",
      scoring: "mp",
      boards: [
        { boardNo: 2, seed: 9, dealer: "E", humanSeat: "W", vul: "both" },
        "rubbish",
        { seed: 1, dealer: "nowhere", humanSeat: "S" },
      ],
      controlOverrides: { "table.undo": "show", "not.a.control": "show", "table.hands": "maybe" },
      invites: [{ userId: "u1", moderator: true }, { moderator: true }],
      editorBadge: true,
    });
    expect(d.format).toBe("bidding-only");
    expect(d.scoring).toBe("mp");
    expect(d.boards).toHaveLength(2);
    expect(d.boards[0]).toMatchObject({ boardNo: 2, dealer: "E", vul: "both" });
    // An unknown seat falls back rather than dropping the board.
    expect(d.boards[1]).toMatchObject({ dealer: "N" });
    expect(Object.keys(d.controlOverrides)).toEqual(["table.undo"]);
    expect(d.invites).toEqual([{ userId: "u1", moderator: true }]);
  });

  it("drops a malformed pack instead of the board", () => {
    const d = normalizeDraft({
      boards: [{ boardNo: 1, seed: 1, dealer: "N", humanSeat: "S", pack: { N: "junk" } }],
    });
    expect(d.boards).toHaveLength(1);
    expect(d.boards[0]!.pack, "the board survives on its seed").toBeUndefined();
  });
});

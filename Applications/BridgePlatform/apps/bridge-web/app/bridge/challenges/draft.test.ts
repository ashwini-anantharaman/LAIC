import { describe, expect, it } from "vitest";
import { seededDeal } from "@bridge/engine";
import { standardDealer, standardVul } from "@bridge/challenges";
import type { Card, Seat } from "@bridge/events";
import { rankLabel } from "@bridge/events";
import { SUIT_ORDER } from "../../../lib/dealText";
import {
  CHALLENGE_CONTROLS,
  controlOverridesOf,
  defaultControlStates,
  packFromDraft,
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

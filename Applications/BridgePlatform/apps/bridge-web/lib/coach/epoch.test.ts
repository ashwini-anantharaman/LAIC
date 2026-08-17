import { describe, expect, it } from "vitest";

import { boardEpoch, currentGroup, decisionEpoch } from "@/lib/coach/epoch";
import type { CoachPanelData } from "@/components/table/play/CoachPanel";

/** One auction group holding the given calls, newest last. */
const auction = (...tokens: string[]): CoachPanelData =>
  ({
    eventGroups: [
      {
        id: "auction",
        title: "The auction",
        current: true,
        // Ids are POSITIONAL, as the real builder makes them — which is
        // exactly why the token has to be part of the key too.
        events: tokens.map((token, i) => ({
          id: `call-${i}`,
          label: `bid ${token}`,
          kind: "call" as const,
          token,
        })),
      },
    ],
  }) as unknown as CoachPanelData;

describe("decisionEpoch — the key that drives the coach's refetches", () => {
  it("changes when a call is added", () => {
    expect(decisionEpoch(auction("1S", "P"))).not.toBe(decisionEpoch(auction("1S", "P", "2D")));
  });

  it("is stable for the same board", () => {
    expect(decisionEpoch(auction("1S", "P", "2D"))).toBe(decisionEpoch(auction("1S", "P", "2D")));
  });

  /**
   * THE REGRESSION. Bid 3♦, take it back, bid 3♥: the group is three calls
   * long both times. A key built from the count alone is identical across
   * that pair, so the overlay effect never re-runs and the coach goes on
   * offering to take back a bid that is no longer on the board — holding the
   * table, with no button able to free it (owner report 2026-08-17).
   */
  it("distinguishes a taken-back call from the one that replaced it", () => {
    const before = auction("1S", "P", "3D");
    const after = auction("1S", "P", "3H");
    expect(before.eventGroups![0]!.events.length).toBe(after.eventGroups![0]!.events.length);
    expect(decisionEpoch(before)).not.toBe(decisionEpoch(after));
  });

  it("survives a group with no events yet", () => {
    expect(decisionEpoch(auction())).toBe("auction#0#-");
    expect(decisionEpoch({} as CoachPanelData)).toBe("start");
  });
});

describe("boardEpoch / currentGroup", () => {
  it("boardEpoch keys by the group alone, so it holds across a trick", () => {
    expect(boardEpoch(auction("1S"))).toBe(boardEpoch(auction("1S", "P", "2D")));
  });

  it("currentGroup prefers the one marked current", () => {
    const data = {
      eventGroups: [
        { id: "auction", title: "a", current: true, events: [] },
        { id: "trick-0", title: "t", events: [] },
      ],
    } as unknown as CoachPanelData;
    expect(currentGroup(data)?.id).toBe("auction");
  });
});

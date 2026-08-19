// Recognizing the coach's studio. Two doors ask — the table resolver (chrome,
// open hands, the rail) and the advisor strip — and they must never disagree:
// a sitting that draws the studio but is refused by the advisor is a coach
// staring at a strip that will not speak.
//
// The case that earns this file is the LEGACY one. The studio held all four
// chairs for a day (2026-08-18 → 19), and those sittings are still open on
// screens. They carry no stamp, so recognizing them means reading their seats.

import type { SessionRecord } from "@bridge/sessions";
import type { Seat } from "@bridge/events";
import { describe, expect, it } from "vitest";

import { studioAccess } from "./studioSession";

const ME = "u_coach";
const human = (id: string) => ({ kind: "human" as const, nexusUserId: id });
const robot = (label: string) => ({
  kind: "kb_player" as const, playerId: `p_${label}`, label,
  enabledPackIds: [], settingOverrides: {}, decisionPolicyId: "first" as never,
});

const record = (
  seats: Partial<Record<Seat, ReturnType<typeof human> | ReturnType<typeof robot>>>,
  authoring?: { learnerSeat: Seat },
): SessionRecord =>
  ({
    seats: { N: robot("N"), E: robot("E"), S: robot("S"), W: robot("W"), ...seats },
    ...(authoring ? { authoring } : {}),
  }) as unknown as SessionRecord;

describe("the studio today: one chair, and a stamp", () => {
  it("is the coach's studio when they are seated in a stamped sitting", () => {
    const a = studioAccess(record({ S: human(ME) }, { learnerSeat: "S" }), ME);
    expect(a.studio).toBe(true);
    expect(a.allMine).toBe(false);
    expect(a.mine).toEqual(["S"]);
    expect(a.learnerSeat).toBe("S");
  });

  it("follows the stamp to whatever chair the board was built for", () => {
    const a = studioAccess(record({ W: human(ME) }, { learnerSeat: "W" }), ME);
    expect(a.studio).toBe(true);
    expect(a.mine).toEqual(["W"]);
    expect(a.learnerSeat).toBe("W");
  });

  it("is NOT the studio for an ordinary table — same seats, no stamp", () => {
    // The whole reason the stamp exists: a New Play board and a studio board
    // are now seated identically.
    const a = studioAccess(record({ S: human(ME) }), ME);
    expect(a.studio).toBe(false);
    expect(a.learnerSeat).toBeNull();
  });

  it("is NOT the studio for someone else's authoring sitting", () => {
    const a = studioAccess(record({ S: human("u_other") }, { learnerSeat: "S" }), ME);
    expect(a.studio).toBe(false);
    expect(a.mine).toEqual([]);
  });

  it("is NOT the studio for a watcher with no chair at all", () => {
    expect(studioAccess(record({}, { learnerSeat: "S" }), ME).studio).toBe(false);
  });
});

describe("the legacy studio: all four chairs the coach's", () => {
  it("is still the studio, stamp or no stamp", () => {
    const all = { N: human(ME), E: human(ME), S: human(ME), W: human(ME) };
    const a = studioAccess(record(all), ME);
    expect(a.studio).toBe(true);
    // `allMine` is what tells the resolver to keep letting "you" follow the
    // turn on those boards — today's studio must never get that treatment.
    expect(a.allMine).toBe(true);
    expect(a.mine).toEqual(["N", "E", "S", "W"]);
  });

  it("is not conjured by four HUMAN chairs that are not all the caller's", () => {
    const a = studioAccess(
      { seats: { N: human(ME), E: human("u_other"), S: human(ME), W: human("u_third") } } as unknown as SessionRecord,
      ME,
    );
    expect(a.studio).toBe(false);
    expect(a.allMine).toBe(false);
  });
});

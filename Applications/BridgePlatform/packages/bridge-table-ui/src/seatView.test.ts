// The phone tier's seat→position mapping. The identity case is the one that
// matters most: every table that existed before curated deals seats its human
// South (or nobody), and none of them may move a pixel.

import type { Seat } from "@bridge/events";
import { describe, expect, it } from "vitest";

import { positionOf, seatAtPosition } from "./seatView";

const SEATS: Seat[] = ["N", "E", "S", "W"];

describe("seatView — the table from the viewer's chair", () => {
  it("is the IDENTITY for a viewer in South, or in no seat at all", () => {
    for (const seat of SEATS) {
      expect(positionOf(seat, "S")).toBe(seat);
      expect(positionOf(seat, null)).toBe(seat);
      expect(seatAtPosition(seat, "S")).toBe(seat);
      expect(seatAtPosition(seat, null)).toBe(seat);
    }
  });

  it("seats the viewer at the bottom, whoever they are", () => {
    for (const viewer of SEATS) expect(positionOf(viewer, viewer)).toBe("S");
  });

  it("puts partner opposite and the opponents on the flanks", () => {
    // East's view: partner West across the table, South on the left (East's
    // left-hand opponent — the seat that plays after East), North on the right.
    expect(positionOf("W", "E")).toBe("N");
    expect(positionOf("S", "E")).toBe("W");
    expect(positionOf("N", "E")).toBe("E");

    // North's view is the table turned half round.
    expect(positionOf("S", "N")).toBe("N");
    expect(positionOf("E", "N")).toBe("W");
    expect(positionOf("W", "N")).toBe("E");
  });

  it("keeps the play travelling clockwise from every chair", () => {
    // Whoever is looking, the seat that acts next must be drawn one position
    // clockwise — otherwise the table would deal round the wrong way.
    const CW: Seat[] = ["N", "E", "S", "W"];
    for (const viewer of SEATS) {
      for (let i = 0; i < 4; i++) {
        const seat = CW[i]!;
        const next = CW[(i + 1) % 4]!;
        const here = CW.indexOf(positionOf(seat, viewer));
        expect(positionOf(next, viewer)).toBe(CW[(here + 1) % 4]);
      }
    }
  });

  it("round-trips: a position names the seat that names it back", () => {
    for (const viewer of SEATS) {
      for (const seat of SEATS) {
        expect(seatAtPosition(positionOf(seat, viewer), viewer)).toBe(seat);
        expect(positionOf(seatAtPosition(seat, viewer), viewer)).toBe(seat);
      }
    }
  });

  it("never sits two seats in one position", () => {
    for (const viewer of SEATS) {
      expect(new Set(SEATS.map((s) => positionOf(s, viewer))).size).toBe(4);
    }
  });
});

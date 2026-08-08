// The override layer is the one place a challenge is allowed to contradict the
// access catalogue, so it is tested on its own: BOTH directions, nothing else
// touched, and an ordinary table left byte-identical.

import { describe, expect, it } from "vitest";
import {
  applyControlOverrides,
  TABLE_CONTROL_KEYS,
  type TableControlAccess,
} from "./challengeControls";

const catalogue = (value: boolean): TableControlAccess =>
  Object.fromEntries(TABLE_CONTROL_KEYS.map((k) => [k, value])) as TableControlAccess;

describe("controlOverrides over the access catalogue", () => {
  it("leaves an ordinary table's catalogue exactly as it found it", () => {
    const base = catalogue(true);
    expect(applyControlOverrides(base, undefined)).toBe(base);
    expect(applyControlOverrides(base, {})).toEqual(base);
  });

  it("REVOKES what the catalogue granted — a hidden control is absent", () => {
    const out = applyControlOverrides(catalogue(true), {
      "table.undo": "hide",
      "table.hands_view": "hide",
    });
    expect(out["table.undo"]).toBe(false);
    expect(out["table.hands_view"]).toBe(false);
    // Nothing else moved.
    expect(out["table.step_controls"]).toBe(true);
    expect(out["table.coach"]).toBe(true);
  });

  it("GRANTS what the catalogue denied — a force-shown control is present", () => {
    const out = applyControlOverrides(catalogue(false), { "table.coach": "show" });
    expect(out["table.coach"]).toBe(true);
    expect(out["table.undo"]).toBe(false);
  });

  it("applies both directions in one pass", () => {
    const mixed: TableControlAccess = { ...catalogue(true), "table.coach": false };
    const out = applyControlOverrides(mixed, {
      "table.undo": "hide",
      "table.coach": "show",
    });
    expect(out["table.undo"]).toBe(false);
    expect(out["table.coach"]).toBe(true);
  });

  it("ignores keys outside the table's control set", () => {
    const out = applyControlOverrides(catalogue(true), {
      "page.challenges": "hide",
      "not.a.key": "hide",
    });
    expect(out).toEqual(catalogue(true));
  });

  it("never mutates the catalogue it was handed", () => {
    const base = catalogue(true);
    applyControlOverrides(base, { "table.undo": "hide" });
    expect(base["table.undo"]).toBe(true);
  });
});

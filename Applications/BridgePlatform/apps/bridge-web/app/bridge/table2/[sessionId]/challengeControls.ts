// The challenge branch's ONE pure rule: controlOverrides applied OVER the
// access catalogue in BOTH directions (spec §7 / ADDENDUM A4).
//
// A control the creator HID is absent — not disabled, not greyed — even when
// the catalogue grants it; a control they FORCE-SHOWED is present even when the
// catalogue denies it. The catalogue is the floor for every ordinary table and
// this layer is the per-challenge exception on top of it, resolved once so that
// the toolbar, the ☰ and the rail can never disagree about a control.
//
// No React, no store, no server imports — this is the part of the branch worth
// reading (and testing) on its own.

import type { ControlOverride } from "@bridge/challenges";

/**
 * Every access-catalogue key the table page gates a control on. This IS the
 * creator's control checklist (spec §2: Hands, Undo, Claim, Seats, Pause/Step,
 * ☰, Coach) expressed in catalogue keys, plus the three the table also reads.
 * A `controlOverrides` entry naming anything outside this list is inert, which
 * keeps the override layer an exception to the catalogue rather than a second,
 * parallel permission system.
 */
export const TABLE_CONTROL_KEYS = [
  "table.seats_panel",
  "table.ben_seat",
  "table.workbench_link",
  "table.undo",
  "table.step_controls",
  "table.settings_menu",
  "table.hands_view",
  "table.skin_settings",
  "page.skins",
  "table.coach",
] as const;

export type TableControlKey = (typeof TABLE_CONTROL_KEYS)[number];

/** What the catalogue alone says about each control, before any challenge. */
export type TableControlAccess = Record<TableControlKey, boolean>;

/**
 * The catalogue's answer with a board's overrides laid over it, BOTH ways.
 * `undefined` overrides (every ordinary table) return the catalogue untouched,
 * so normal play cannot be disturbed by this branch existing.
 */
export function applyControlOverrides(
  catalogue: TableControlAccess,
  overrides?: Readonly<Record<string, ControlOverride>>,
): TableControlAccess {
  if (!overrides) return catalogue;
  const out = { ...catalogue };
  for (const key of TABLE_CONTROL_KEYS) {
    const forced = overrides[key];
    // "show" grants what the catalogue denied; "hide" revokes what it granted.
    if (forced === "show") out[key] = true;
    else if (forced === "hide") out[key] = false;
  }
  return out;
}

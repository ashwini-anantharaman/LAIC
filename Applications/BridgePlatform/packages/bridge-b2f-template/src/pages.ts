// itemKey → the page(s) it was authored from. install.ts turns each entry into a
// Citation anchored "page 16", so a reviewer opening an item can jump to the
// paragraph the rule came from. Each chapter owns its own slice of this map.
//
// The test suite asserts EVERY item appears here: an item nobody can trace back
// to the notes is an item nobody can check.

import { CARDING_PAGES } from "./chapters/carding";
import { COMPETITIVE_PAGES } from "./chapters/competitive";
import { CONVENTIONS_PAGES } from "./chapters/conventions";
import { DEALS_PAGES } from "./chapters/deals";
import { FLOOR_PAGES } from "./chapters/floor";
import { NT_RESPONSES_PAGES } from "./chapters/ntResponses";
import { OPENINGS_PAGES } from "./chapters/openings";
import { PLAY_PAGES } from "./chapters/play";
// PARKED 2026-07-25 alongside index.ts — see the plan file, section 1b.
// import { REBIDS_PAGES } from "./chapters/rebids";
import { SUIT_RESPONSES_PAGES } from "./chapters/suitResponses";

/** The source: "Bridge 2 Fun Training", 32 pages. */
export const NOTES_PAGE_COUNT = 32;

export const PAGES_BY_KEY: Record<string, number[]> = {
  ...OPENINGS_PAGES,
  ...NT_RESPONSES_PAGES,
  ...SUIT_RESPONSES_PAGES,
  // ...REBIDS_PAGES,  // PARKED
  ...COMPETITIVE_PAGES,
  ...CONVENTIONS_PAGES,
  ...PLAY_PAGES,
  ...CARDING_PAGES,
  ...DEALS_PAGES,
  ...FLOOR_PAGES,
};

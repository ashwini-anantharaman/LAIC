// itemKey → the slide(s) it was authored from. install.ts turns each entry into
// a Citation anchored "slide N", so a reviewer opening an item can jump to the
// picture the rule came from. Each chapter owns its own slice of this map; the
// merge below is the only place they meet.
//
// This map is what makes the KB auditable: an item with no slide is an item
// nobody can check, so the test suite asserts EVERY item is listed here.

import { COMPETITIVE_SLIDES } from "./chapters/competitive";
import { FLOOR_SLIDES } from "./chapters/floor";
import { LEADS_CARDING_SLIDES } from "./chapters/leadsCarding";
import { NT_RESPONSES_SLIDES } from "./chapters/ntResponses";
import { OPENINGS_SLIDES } from "./chapters/openings";
import { PROSE_SLIDES } from "./chapters/prose";
import { REBIDS_SLIDES } from "./chapters/rebids";
import { SLAM_SLIDES } from "./chapters/slam";
import { SUIT_RESPONSES_SLIDES } from "./chapters/suitResponses";

/** The deck: Milind Girkar, "Introduction to Bridge", 88 slides, 2025-08-27. */
export const DECK_PAGE_COUNT = 88;

export const SLIDES_BY_KEY: Record<string, number[]> = {
  ...OPENINGS_SLIDES,
  ...NT_RESPONSES_SLIDES,
  ...SUIT_RESPONSES_SLIDES,
  ...REBIDS_SLIDES,
  ...COMPETITIVE_SLIDES,
  ...SLAM_SLIDES,
  ...LEADS_CARDING_SLIDES,
  ...PROSE_SLIDES,
  ...FLOOR_SLIDES,
};

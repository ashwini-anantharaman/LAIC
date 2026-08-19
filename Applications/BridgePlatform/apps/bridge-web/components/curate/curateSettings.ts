// The studio's board settings — what the deal screen collects and the studio
// rail publishes. They travel between the two via sessionStorage (the picker
// writes before navigating; the rail reads on mount and clears on publish),
// because the publish payload is assembled by the rail at the end of the
// sitting, which stays the one authority.

import type { Seat } from "@bridge/events";

import type { KItemId, KTag } from "@/lib/coach/kItems";
import type { CuratedConstraint } from "@/lib/curated";

export interface CuratedBoardSettings {
  learnerSeat: Seat;
  constraint: CuratedConstraint;
  intro: string;
  debrief: string;
  pin: string;
  /** WHAT THIS BOARD TEACHES, the topic (owner direction 2026-08-18) — the K
   *  item tags. They name the lesson on screen, and they are the filter the
   *  coach chose its cards through. */
  kTags: KTag[];
  /** WHAT THIS BOARD TEACHES, the cards (owner direction 2026-08-19) — the K
   *  items the learner's Know panel leads with. Empty falls back to the tags'
   *  whole collections; empty with no tags either means no lesson named, and
   *  the panel behaves as it does on any other board. */
  kItems: KItemId[];
  /** The board's library notes (the deal editor's own field) — published
   *  onto the entry with everything else. */
  notes?: string;
  /** Set by the REVISE flow: publish updates this entry in place instead of
   *  shelving a new one. */
  revisesEntryId?: string;
}

export const CURATE_SETTINGS_KEY = (sessionId: string): string => `curate:${sessionId}`;

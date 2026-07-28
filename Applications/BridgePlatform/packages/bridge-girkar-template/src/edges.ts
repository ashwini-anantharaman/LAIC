// The template's edges. Most are declared by the chapter that owns both ends
// (see SLAM_EDGES); the ones here cross chapter boundaries or bind a companion
// item to its parent convention.
//
// WHY THIS MATTERS: several items are SATELLITES of a convention rather than
// conventions in their own right — the keycard responses, the "may not be
// passed" forcing entries, the "this sequence is undiscussed" notes. They carry
// no enable toggle of their own, because a fellow turning off Roman keycards
// should not have to find and turn off four more items. A `requires` edge is
// what makes that safe: the satellite is only ever active when its parent is,
// and `validatePlayerStatic` reports a missing parent instead of silently
// leaving an orphan rule live.

import type { TemplateEdge } from "@bridge/sayc-template/dsl";
import { SLAM_EDGES } from "./chapters/slam";

/** Companions declared outside the chapter that owns their parent. */
const COMPANION_EDGES: TemplateEdge[] = [
  // "The strong 2♣ may not be passed" is meaningless without the 2♣ opening,
  // which is the item carrying the `g_open_2c_on` toggle.
  { from: "open-2c-forcing", edgeType: "requires", to: "open-strong-2c" },
  // Slide 21's two-suiter routes both start by bidding Stayman, so they are
  // unplayable with Stayman switched off — Smolen's 2♣ would be an undiscussed
  // bid, which is exactly what the deck's red row forbids.
  { from: "nt-1n-smolen", edgeType: "requires", to: "nt-1n-stayman" },
  { from: "nt-1n-invitational-two-suiters", edgeType: "requires", to: "nt-1n-stayman" },
  // The four-spades-five-hearts route transfers first, so it also needs the
  // transfer item to be carried.
  { from: "nt-1n-invitational-two-suiters", edgeType: "requires", to: "nt-1n-transfers" },
];

export const GIRKAR_EDGES: TemplateEdge[] = [...SLAM_EDGES, ...COMPANION_EDGES];

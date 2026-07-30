// The template's edges. A satellite item (a convention's continuations, a
// "may not be passed" forcing entry) carries no enable toggle of its own — a
// fellow turning off Texas transfers should not have to hunt down three more
// switches — so a `requires` edge to the parent that DOES carry the toggle is
// what keeps it safe: the satellite is only ever live when its parent is, and
// validatePlayerStatic reports a missing parent rather than leaving an orphan
// rule active.
//
// Chapters that own both ends of an edge may export their own list; those are
// merged here.

import type { TemplateEdge } from "@bridge/sayc-template/dsl";
import { CONVENTIONS_EDGES } from "./chapters/conventions";

export const B2F_EDGES: TemplateEdge[] = [...CONVENTIONS_EDGES];

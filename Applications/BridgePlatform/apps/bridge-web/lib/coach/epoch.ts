// Where the board is, as a cache key — pulled out of CoachPanel so it can be
// tested on its own. These strings drive effect dependencies and React keys,
// and getting one wrong does not look like a bug in the key: it looks like the
// coach saying something stale and a table that will not move.

import type { CoachEventGroup, CoachPanelData } from "@/components/table/play/CoachPanel";

export function currentGroup(data: CoachPanelData): CoachEventGroup | undefined {
  return data.eventGroups?.find((g) => g.current) ?? data.eventGroups?.[data.eventGroups.length - 1];
}

/**
 * Where the board is, per TRICK, as a remount key. A new trick is a new
 * conversation: the chat keys on this, so it survives the cards inside a
 * trick but empties for the next one.
 */
export function boardEpoch(data: CoachPanelData): string {
  return currentGroup(data)?.id ?? "start";
}

/**
 * Where the board is, per DECISION.
 *
 * A COUNT IS NOT AN IDENTITY, and that is the whole reason this function is
 * worth a file and a test. Take a bid back and make a different one: the group
 * returns to the length it already had, so a key built from the length returns
 * to the string it already had — and every effect depending on it silently
 * does not re-run. The coach's bubble then goes on showing the nudge for the
 * decision that was taken back, over a board that has moved on, holding the
 * table with it and offering no way out (owner report 2026-08-17: "I clicked
 * take it back and then clicked 3♥ but the take it back is still there").
 *
 * So the last event's own identity goes in. Both its id and its token: an id
 * derived from the position is equal across the two calls, and the token is
 * what actually differs.
 */
export function decisionEpoch(data: CoachPanelData): string {
  const g = currentGroup(data);
  if (!g) return "start";
  const last = g.events[g.events.length - 1];
  const tail = last ? `${last.id}:${last.token ?? last.label}` : "-";
  return `${g.id}#${g.events.length}#${tail}`;
}

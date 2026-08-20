// The LOCKED curated board's gate (curated v2, owner design 2026-08-18).
//
// On a board whose coach chose `constraint: "locked"`, the learner's action
// must BE the charted action — anything else is refused BEFORE it commits,
// with the coach's why riding the refusal so the table can speak it. The
// gate runs in the app layer (both act doors call it), never the engine:
// what a curated deal means is this app's business, exactly like the
// overlay and the take-back.
//
// The gate only holds while the session is still ON the line: a board that
// somehow left it (a constraint edited after assignment, an old session)
// must not lock the learner out of every card — off the line the addresses
// stop corresponding and there is nothing honest to enforce.

import type { Call, Card } from "@bridge/events";
import type { SessionView } from "@bridge/sessions";

import {
  chartedActionAt,
  constraintOf,
  currentAt,
  lineOf,
  parseCurated,
  pathStatus,
  sameAt,
} from "./curated";
import { libraryStore } from "./sessions";
import { playsFrom } from "@/lib/coach/turn";

/** Thrown when a locked board refuses an off-line action. The act doors
 *  render it as 409 { offLine: true, why?, hintAvailable } — never a 400. */
export class OffLineError extends Error {
  constructor(
    /** The coach's reason for the charted move here, when they wrote one. */
    public readonly why: string | undefined,
    /** Whether a hint ladder exists at this decision. */
    public readonly hintAvailable: boolean,
  ) {
    super("Your coach charted a different move here");
  }
}

const sameCard = (a: Card, b: Card): boolean => a.suit === b.suit && a.rank === b.rank;

/**
 * Refuse an off-line action on a LOCKED curated board; anything else passes.
 * Fail-open on infrastructure: a store hiccup must degrade the lock to a
 * guided board, never freeze a learner's table.
 */
export async function assertCoachLine(
  view: SessionView,
  action: { call?: Call; card?: Card },
): Promise<void> {
  const entryId = view.record.curated?.entryId;
  if (!entryId) return;

  let entry;
  try {
    entry = await libraryStore().getEntry(entryId);
  } catch {
    return;
  }
  if (!entry?.curatedJson) return;
  const payload = parseCurated(entry.curatedJson);
  if (constraintOf(payload) !== "locked") return;

  const { state } = view;
  const line = lineOf(entry);
  // Only the learner's seat is human on a curated table, so any action
  // reaching act() is theirs — the seat needs no re-derivation here.
  const seat = (Object.entries(view.record.seats) as [string, { kind: string }][]).find(
    ([, c]) => c.kind === "human",
  )?.[0] as Parameters<typeof pathStatus>[2] | undefined;
  if (!seat) return;
  if (!pathStatus(state, line, seat, playsFrom(view.record, state, seat)).onPath) return;

  const here = currentAt(state);
  if (!here) return;
  const charted = chartedActionAt(line, here);
  // The line ended before the board did (the coach's sitting stopped here) —
  // nothing charted means nothing to hold the learner to.
  if (!charted) return;

  const matches =
    action.call !== undefined
      ? charted.call === action.call
      : action.card !== undefined && charted.card !== undefined
        ? sameCard(charted.card, action.card)
        : false;
  if (matches) return;

  const annotation = payload.annotations.find((a) => sameAt(a.at, here));
  throw new OffLineError(annotation?.why, (annotation?.hints?.length ?? 0) >= 2);
}

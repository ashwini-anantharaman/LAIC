// GET /api/bridge/curated-overlay?sessionId=… — the coach's voice for a
// curated session (owner design 2026-08-15), computed server-side per
// position so the panel just draws it:
//
//   · current   the annotation at the decision the learner is AT (only
//               while still on the coach's line), with the charted move
//               pretty-printed — shown automatically as a "Your coach"
//               speech bubble, and its custom ladder replaces Owlee's;
//   · nudge     the learner's LAST action was the first step off the line —
//               offer the take-it-back ("Your coach charted 2♣ here…");
//   · diverged  the learner is off the line and past the nudge — the panel
//               says so once and Owlee continues live.
//
// Non-curated sessions answer { overlay: null } cheaply; the panel only
// asks at all when the page said the session is curated.

import { stubDisplayName } from "@bridge/nexus-client";
import { NextResponse } from "next/server";

import { callLabel, cardLabel } from "@/lib/coach/position";
import { corsOptions, withCors } from "@/lib/cors";
import {
  chartedActionAt,
  currentAt,
  lineOf,
  parseCurated,
  pathStatus,
  sameAt,
  type CuratedAt,
} from "@/lib/curated";
import { getBridgeContext } from "@/lib/nexus";
import { assignmentStore, libraryStore, sessionService } from "@/lib/sessions";

export const OPTIONS = corsOptions("GET");

export async function GET(request: Request): Promise<NextResponse> {
  return withCors(await handle(request), "GET");
}

async function handle(request: Request): Promise<NextResponse> {
  const context = await getBridgeContext();
  if (!context) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

  let view;
  try {
    view = await sessionService().view(sessionId);
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const { record, state } = view;
  if (!record.curated) return NextResponse.json({ overlay: null });

  const seat = (Object.entries(record.seats) as [string, (typeof record.seats)["N"]][]).find(
    ([, c]) => c.kind === "human" && c.nexusUserId === context.nexusUserId,
  )?.[0] as "N" | "E" | "S" | "W" | undefined;
  if (!seat) return NextResponse.json({ overlay: null });

  const entry = await libraryStore().getEntry(record.curated.entryId);
  if (!entry) return NextResponse.json({ overlay: null });
  const line = lineOf(entry);
  const { annotations } = parseCurated(entry.curatedJson);

  // WHO the coach is — the assignment that issued this entry knows (owner
  // pick #3, 2026-08-15: "Coach Sarah", not "Your coach"). Best-effort: a
  // curated board opened outside an assignment just keeps the generic name.
  let coachName: string | undefined;
  try {
    const mine = await assignmentStore().listAssignments({
      learnerId: context.nexusUserId,
      entryId: record.curated.entryId,
    });
    const a = mine.find((x) => x.sessionId === sessionId) ?? mine[0];
    if (a) coachName = a.coachName ?? stubDisplayName(a.coachId) ?? undefined;
  } catch {
    // Name resolution must never cost the overlay.
  }

  const status = pathStatus(state, line, seat);

  // THE FINISH (owner pick #4): the board is over — say how the journey
  // went against the coach's line. An undo that returned to the line leaves
  // no trace in the log, which is exactly right: finding the way back IS
  // staying on the road.
  const finished = state.phase === "complete" ? { stayedOnLine: status.onPath } : null;
  const pretty = (at: CuratedAt): string | null => {
    const charted = chartedActionAt(line, at);
    if (!charted) return null;
    return charted.call ? callLabel(charted.call) : charted.card ? cardLabel(charted.card) : null;
  };

  // The nudge: the learner's own action stepped off the line, and they have
  // not moved on since. It speaks about the DIVERGENCE's own address, which
  // pathStatus now hands back — this used to address "the last play on the
  // board", and the robots reply within the same second, so the charted move
  // it printed was the one for a robot's position rather than the learner's.
  let nudge: { charted: string } | null = null;
  if (!status.onPath && status.divergedAtOwn && status.divergedJustNow && status.divergedAt) {
    const charted = pretty(status.divergedAt);
    if (charted) nudge = { charted };
  }

  // The current annotation — only while the line still holds.
  const here = currentAt(state);
  const current =
    status.onPath && here ? (annotations.find((a) => sameAt(a.at, here)) ?? null) : null;
  const chartedHere = status.onPath && here ? pretty(here) : null;

  return NextResponse.json({
    overlay: {
      onPath: status.onPath,
      diverged: !status.onPath,
      ...(coachName ? { coachName } : {}),
      ...(finished ? { finished } : {}),
      ...(nudge && !finished ? { nudge } : {}),
      ...(current
        ? {
            current: {
              ...(current.note ? { note: current.note } : {}),
              ...(current.why ? { why: current.why } : {}),
              ...(current.hints ? { hints: current.hints } : {}),
              ...(chartedHere ? { charted: chartedHere } : {}),
            },
          }
        : {}),
    },
  });
}
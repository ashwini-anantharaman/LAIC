// POST /api/bridge/curated-progress — the learner opened the hint ladder at
// their current decision on a CURATED board (review loop, owner pick #5,
// 2026-08-15). The stamp rides the learner's copy of the library entry
// (`curatedProgressJson`), NOT the session record: the session is written by
// game actions, and a read-modify-write of it from here could swallow a
// robot's move. The entry copy is the learner's alone after the assign.
//
// The decision address is computed server-side from the session's state —
// the client says only "here", never where "here" is.
//
// Body: { sessionId } → { ok: boolean }. Best-effort by design: a lost stamp
// costs a statistic, never the game, so failures answer ok:false quietly.

import { NextResponse } from "next/server";

import { atKey, currentAt, parseCuratedProgress, serializeCuratedProgress } from "@/lib/curated";
import { corsOptions, withCors } from "@/lib/cors";
import { getBridgeContext } from "@/lib/nexus";
import { libraryStore, sessionService } from "@/lib/sessions";

export const OPTIONS = corsOptions("POST");

export async function POST(request: Request): Promise<NextResponse> {
  return withCors(await handle(request), "POST");
}

async function handle(request: Request): Promise<NextResponse> {
  const context = await getBridgeContext();
  if (!context) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { sessionId?: unknown };
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

  let view;
  try {
    view = await sessionService().view(sessionId);
  } catch {
    return NextResponse.json({ ok: false });
  }
  const { record, state } = view;
  if (!record.curated) return NextResponse.json({ ok: false });

  // Only the player whose board this is may stamp their own progress.
  const isMine = Object.values(record.seats).some(
    (c) => c.kind === "human" && c.nexusUserId === context.nexusUserId,
  );
  if (!isMine) return NextResponse.json({ ok: false });

  const here = currentAt(state);
  if (!here) return NextResponse.json({ ok: false });

  try {
    const entry = await libraryStore().getEntry(record.curated.entryId);
    if (!entry) return NextResponse.json({ ok: false });
    const progress = parseCuratedProgress(entry.curatedProgressJson);
    const key = atKey(here);
    if (!progress.opened.includes(key)) {
      progress.opened.push(key);
      await libraryStore().putEntry({
        ...entry,
        curatedProgressJson: serializeCuratedProgress(progress),
      });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}

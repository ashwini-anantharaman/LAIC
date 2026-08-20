// POST /api/bridge/curated/draft — the studio saves its work in progress.
//
// Building a curated board is not a five-minute job (owner ask 2026-08-19:
// "save the curated deal while they are in the middle of the editing and they
// can resume at anytime as the creation of a curated deal is a time consuming
// feature"). The BOARD was never the fragile part — it is an event log on a
// real session — but the coach's words were: annotations lived in component
// state and the board settings in sessionStorage, so a closed tab, a reload on
// a phone, or a walk to the kettle could take an hour of writing with it.
//
// So the draft rides the sitting: `authoring.draftJson`, an opaque string this
// route neither reads nor validates beyond its size. Resuming is then a LINK to
// the same table (`?author=1`), which is why there is no "restore" flow to get
// wrong — the studio reads the draft on mount exactly as it already read the
// picker's stash.
//
// Body: { sessionId, draftJson } → { ok, savedAt }. An empty `draftJson` clears
// the draft, which is what publishing does on its way out.

import { NextResponse, type NextRequest } from "next/server";

import { AccessError, apiError, requireContext } from "@/lib/api";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { sessionService } from "@/lib/sessions";
import { studioAccess } from "@/lib/studioSession";

const CORS = corsHeaders("POST");

export const OPTIONS = corsOptions("POST");

/**
 * A draft is annotations, board settings and a name. Fifty thousand characters
 * is a hundred long notes with their ladders — past that something has gone
 * wrong upstream, and a session record is not the place to find out.
 */
const MAX_DRAFT = 50_000;

export async function POST(request: NextRequest) {
  try {
    const context = await requireContext();
    const body = (await request.json().catch(() => ({}))) as {
      sessionId?: string;
      draftJson?: string;
    };
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    const draftJson = typeof body.draftJson === "string" ? body.draftJson : "";
    if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    if (draftJson.length > MAX_DRAFT)
      return NextResponse.json({ error: "That draft is too large to save." }, { status: 413 });

    const record = await sessionService().getSession(sessionId);
    // Their own studio sitting, or nothing: this writes to a session record.
    if (!record || !studioAccess(record, context.nexusUserId).studio)
      throw new AccessError("Not your authoring session");

    const saved = await sessionService().saveAuthoringDraft(sessionId, draftJson);
    return NextResponse.json(
      { ok: true, savedAt: saved.authoring?.draftAt ?? null },
      { headers: CORS },
    );
  } catch (e) {
    return withCors(apiError(e), "POST");
  }
}

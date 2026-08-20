// POST /api/bridge/curated/preview — open the coach's own curated board AS THE
// LEARNER WILL SEE IT (owner ask 2026-08-19).
//
// Until now a coach could not look at what they had built. The studio shows the
// authoring side — open hands, the annotation rail, the advisor strip — and the
// learner's side is a different experience entirely: the intro before their
// first decision, the Know panel leading with the lesson's cards, the nudge and
// the take-back when they leave the line, the pinned read, the debrief at the
// end. All of it was invisible without assigning the board to a real person and
// watching over their shoulder.
//
// So this creates the LEARNER'S session, by the same recipe the assignment door
// uses — the coach seated where the learner sits, house robots elsewhere, the
// `curated` stamp so the robots follow the recorded line and the overlay
// speaks — and marks it `preview`, which means NOTHING IS RECORDED. The one
// thing that would otherwise be written is the learner's hint-ladder progress,
// which rides the entry itself; a preview must not touch the coach's master
// entry, and the progress door refuses it by that flag.
//
// Body: { entryId } → { sessionId }. Every preview is a FRESH sitting: they are
// disposable by definition, and a coach who wants to see the opening again
// should not have to undo their way back to it.

import { canAccessAdminArea } from "@bridge/nexus-client";
import { NextResponse, type NextRequest } from "next/server";

import { houseLineup } from "@/app/bridge/library/actions";
import { AccessError, apiError, requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { learnerSeatOf, parseCurated } from "@/lib/curated";
import { ensureSeeds } from "@/lib/kb";
import { nexusProgramIdOf, orgScopeOf } from "@/lib/nexus";
import { assertAiAllowed } from "@/lib/org";
import { libraryStore, sessionService } from "@/lib/sessions";

const CORS = corsHeaders("POST");

export const OPTIONS = corsOptions("POST");

export async function POST(request: NextRequest) {
  try {
    const context = await requireContext();
    const body = (await request.json().catch(() => ({}))) as { entryId?: string };
    const entryId = typeof body.entryId === "string" ? body.entryId : "";

    const entry = await libraryStore().getEntry(entryId);
    // Only the deal's own coach previews it (admins steward the shelf), and
    // not-yours reads as not-found — the API layer's one posture.
    if (
      !entry?.hands ||
      !entry.curatedJson ||
      (entry.createdBy !== context.nexusUserId && !canAccessAdminArea(context))
    )
      throw new AccessError("No such curated deal");

    await ensureSeeds();
    await assertAiAllowed(context);

    // THE LEARNER'S OWN CHAIR. Everything the preview is for hangs off this:
    // the overlay only speaks to the seat the board was built for, and a
    // preview seated anywhere else would be a different board.
    const learnerSeat = learnerSeatOf(parseCurated(entry.curatedJson));
    let kbId: string;
    let compiled;
    let seats;
    try {
      ({ kbId, compiled, seats } = await houseLineup("", context, learnerSeat));
    } catch (e) {
      if (e instanceof AccessError) throw e;
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Couldn't seat the table." },
        { status: 409, headers: CORS },
      );
    }

    const record = await sessionService().createSession({
      kbId,
      compiled,
      seats,
      seed: 1,
      hands: entry.hands,
      dealer: entry.dealer ?? "N",
      vul: entry.vul ?? "none",
      // Named for what it is: this sitting will show up in My Games like any
      // other, and "· preview" is how the coach knows not to look for their
      // learner's play in it.
      boardName: `${entry.name} · preview`,
      createdBy: context.nexusUserId,
      programOrganizationId: orgScopeOf(context),
      nexusProgramId: (await nexusProgramIdOf()) ?? undefined,
      // The stamp does the work — the robots follow the coach's line, the
      // overlay serves the intro/lesson/nudge/debrief, the locked gate holds —
      // and `preview` is what keeps it out of the record.
      curated: { entryId: entry.entryId, preview: true },
    });

    await audit(context, "profile.update", "kb_session", record.sessionId, {
      curatedPreview: true,
      entryId: entry.entryId,
    });
    return NextResponse.json(
      { sessionId: record.sessionId, learnerSeat },
      { headers: CORS },
    );
  } catch (e) {
    return withCors(apiError(e), "POST");
  }
}

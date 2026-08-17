// POST /api/bridge/assignments/[assignmentId]/start — the learner starts (or
// resumes) an assigned board and gets back { sessionId } to open. The lift of
// startAssignmentAction: an already-started assignment returns its existing
// session (the resume case), a fresh one deals the assigned entry vs. house
// players, learner in South, and marks the row started.

import { NextResponse } from "next/server";

import { resolveEntryLineup } from "@/app/bridge/library/actions";
import { AccessError, apiError, requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { ensureSeeds } from "@/lib/kb";
import { withCuratedOverlayFrom } from "@/lib/libraryComponent";
import { nexusProgramIdOf, orgScopeOf } from "@/lib/nexus";
import { assertAiAllowed } from "@/lib/org";
import { assignmentStore, libraryStore, sessionIsGone, sessionService } from "@/lib/sessions";

const CORS = corsHeaders("POST");

export const OPTIONS = corsOptions("POST");

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  try {
    const context = await requireContext();
    const { assignmentId } = await params;

    const store = assignmentStore();
    const assignment = await store.getAssignment(assignmentId);
    if (!assignment) throw new AccessError("Assignment not found");
    // Not-yours reads as not-found, the API layer's one posture.
    if (assignment.learnerId !== context.nexusUserId) {
      throw new AccessError("Only the assigned learner can start this board");
    }

    // Already underway — back to the same table, IF that table is still
    // there. A dangling sessionId used to be handed straight back, and the
    // learner rode it to a board the table could only answer boardGone to:
    // the app closed the screen and dropped them on the list they came from,
    // every single time, with no way to start over because the row still
    // said "started". Falling through deals them a fresh board off the same
    // entry — which is also how a curated deal finally reaches someone whose
    // session predates the overlay.
    if (
      assignment.sessionId &&
      assignment.status === "started" &&
      !(await sessionIsGone(assignment.sessionId))
    ) {
      return NextResponse.json(
        { sessionId: assignment.sessionId, resumed: true },
        { headers: CORS },
      );
    }

    const stored = await libraryStore().getEntry(assignment.entryId);
    if (!stored?.hands) {
      return NextResponse.json(
        { error: "This assignment's board no longer exists." },
        { status: 400, headers: CORS },
      );
    }
    // Last chance to pick the coach's words up. An assignment issued before
    // the board was curated carries a copy with no overlay, and the `curated`
    // stamp below is decided off exactly this entry — without the refresh the
    // learner gets an ordinary table and no coach, however curated the deal.
    const entry = await withCuratedOverlayFrom(stored, assignment.sourceEntryId);

    await ensureSeeds();
    await assertAiAllowed(context);
    const { kbId, compiled, seats } = await resolveEntryLineup(entry, "", context);
    const record = await sessionService().createSession({
      kbId,
      compiled,
      seats,
      seed: 1,
      hands: entry.hands,
      dealer: entry.dealer ?? "N",
      vul: entry.vul ?? "none",
      boardName: entry.name,
      createdBy: context.nexusUserId,
      programOrganizationId: orgScopeOf(context),
      // Without the program stamp the session is invisible to every
      // program-scoped read (My Games, Resume, summary counts).
      nexusProgramId: (await nexusProgramIdOf()) ?? undefined,
      // A curated entry's session carries the stamp (owner design
      // 2026-08-15): the robots follow the coach's recorded line and the
      // coach-overlay API finds the annotations from the sessionId.
      ...(entry.curatedJson ? { curated: { entryId: entry.entryId } } : {}),
    });

    await store.putAssignment({
      ...assignment,
      status: "started",
      sessionId: record.sessionId,
      startedAt: new Date().toISOString(),
    });
    await audit(context, "assignment.started", "assignment", assignmentId, {
      sessionId: record.sessionId,
    });
    return NextResponse.json({ sessionId: record.sessionId, resumed: false }, { headers: CORS });
  } catch (e) {
    return withCors(apiError(e), "POST");
  }
}

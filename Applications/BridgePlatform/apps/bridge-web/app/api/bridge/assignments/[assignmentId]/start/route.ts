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
import { nexusProgramIdOf, orgScopeOf } from "@/lib/nexus";
import { assertAiAllowed } from "@/lib/org";
import { assignmentStore, libraryStore, sessionService } from "@/lib/sessions";

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

    // Already underway — back to the same table.
    if (assignment.sessionId && assignment.status === "started") {
      return NextResponse.json(
        { sessionId: assignment.sessionId, resumed: true },
        { headers: CORS },
      );
    }

    const entry = await libraryStore().getEntry(assignment.entryId);
    if (!entry?.hands) {
      return NextResponse.json(
        { error: "This assignment's board no longer exists." },
        { status: 400, headers: CORS },
      );
    }

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

// /api/bridge/assignments/briefs/[briefId]/learners — who plays this
// assignment. The lifts of addLearnerAction / removeLearnerAction:
//
//   POST   { learnerId }     add a roster learner (copy-on-assign, idempotent
//                            per (source, learner)) → { assignmentId }
//   DELETE { assignmentId }  detach a learner — their session, submissions
//                            and feedback are left standing (owner direction
//                            2026-08-09: detach, never destroy)

import { NextResponse, type NextRequest } from "next/server";

import { requireEditableAssignment } from "@/lib/assignmentEdit";
import { apiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { bridgeLibrary, itemToEntry, libraryPrincipalOf } from "@/lib/libraryComponent";
import { getMyLearners } from "@/lib/nexus";
import { assignmentStore } from "@/lib/sessions";

const CORS = corsHeaders("POST", "DELETE");

export const OPTIONS = corsOptions("POST", "DELETE");

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400, headers: CORS });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ briefId: string }> },
) {
  try {
    const { briefId: key } = await params;
    const { context, set } = await requireEditableAssignment(decodeURIComponent(key));
    if (!set.brief) return bad("This assignment has no brief yet — adopt it first.");
    const body = (await request.json().catch(() => ({}))) as { learnerId?: string };
    const learnerId = String(body.learnerId ?? "");

    // Only someone actually on this coach's roster, checked server-side.
    const roster = await getMyLearners();
    const learner = roster.find((l) => l.user_id === learnerId);
    if (!learner?.user_id) return bad("That learner isn't on your roster.");
    const already = set.issues.find((a) => a.learnerId === learnerId);
    if (already) {
      return NextResponse.json(
        { assignmentId: already.assignmentId, existing: true },
        { headers: CORS },
      );
    }

    const content = set.brief.contents.find((c) => c.kind === "entry");
    if (!content) return bad("This assignment has no board to give.");

    const { newId } = await import("@bridge/kb");
    // Copy-on-assign, the same primitive the create flow uses.
    const copy = itemToEntry(
      await bridgeLibrary().copyTo(await libraryPrincipalOf(context), content.entryId, {
        ownerId: learnerId,
        scopeLevel: "user",
        provenance: "assigned",
      }),
    );
    const assignmentId = newId("as");
    await assignmentStore().putAssignment({
      assignmentId,
      programOrganizationId: set.brief.programOrganizationId,
      nexusProgramId: set.brief.nexusProgramId,
      briefId: set.brief.briefId,
      coachId: set.brief.createdBy,
      coachName: set.brief.createdByName,
      learnerId,
      learnerName: learner.name ?? learner.email ?? undefined,
      entryId: copy.entryId,
      sourceEntryId: content.entryId,
      entryKind: content.entryKind,
      entryName: content.entryName,
      // No note on the row: the brief owns the instruction.
      status: "assigned",
      createdAt: new Date().toISOString(),
    });
    await audit(context, "assignment.created", "assignment", set.brief.briefId, {
      addedLearner: learnerId,
    });
    return NextResponse.json({ assignmentId, existing: false }, { headers: CORS });
  } catch (e) {
    return withCors(apiError(e), "POST");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ briefId: string }> },
) {
  try {
    const { briefId: key } = await params;
    const { context, set } = await requireEditableAssignment(decodeURIComponent(key));
    const body = (await request.json().catch(() => ({}))) as { assignmentId?: string };
    const assignmentId = String(body.assignmentId ?? "");
    const issue = set.issues.find((a) => a.assignmentId === assignmentId);
    if (!issue) return bad("No such learner on this assignment.");

    // The row, and NOTHING else: their session, their submissions and any
    // feedback on them are left exactly as they are.
    await assignmentStore().deleteAssignment(assignmentId);
    await audit(context, "assignment.learner.removed", "assignment", set.view.key, {
      learnerId: issue.learnerId,
      status: issue.status,
      keptSession: issue.sessionId ?? null,
    });
    return NextResponse.json({ removed: true }, { headers: CORS });
  } catch (e) {
    return withCors(apiError(e), "DELETE");
  }
}

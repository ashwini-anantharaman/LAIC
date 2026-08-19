// PATCH /api/bridge/assignments/briefs/[briefId] — edit one assignment's
// brief. [briefId] accepts a legacy key ("legacy:<entryId>", URL-encoded) so
// the native editor works on pre-0028 groups, exactly like the ✎ sheet.
//
//   { adopt: true }  mint a brief for a legacy group (adopt-on-first-edit;
//                    idempotent when one already exists) → { briefId }
//   { note: "…" }    replace the instruction ("" clears it) → { briefId }
//
// DELETE removes the whole assignment — the brief and every learner's row —
// leaving their games, submissions and feedback standing (detach, never
// destroy). → { deleted: true, learners, keptSessions }
//
// Same rule as the actions: ONE copy of the instruction, on the brief.

import { NextResponse, type NextRequest } from "next/server";

import { deleteAssignmentSet, requireEditableAssignment } from "@/lib/assignmentEdit";
import { apiError } from "@/lib/api";
import { adoptLegacyGroup } from "@/lib/assignmentSets";
import { audit } from "@/lib/audit";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { assignmentStore } from "@/lib/sessions";

const CORS = corsHeaders("PATCH", "DELETE");

export const OPTIONS = corsOptions("PATCH", "DELETE");

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ briefId: string }> },
) {
  try {
    const { briefId: key } = await params;
    const { context, set } = await requireEditableAssignment(decodeURIComponent(key));
    const body = (await request.json().catch(() => ({}))) as {
      adopt?: boolean;
      note?: string;
    };

    if (body.adopt) {
      if (set.brief) {
        return NextResponse.json({ briefId: set.brief.briefId }, { headers: CORS });
      }
      const briefId = await adoptLegacyGroup(set, context);
      await audit(context, "assignment.brief.created", "assignment", briefId, {
        adoptedFrom: key,
        learners: set.issues.length,
      });
      return NextResponse.json({ briefId }, { headers: CORS });
    }

    if (!set.brief) {
      return NextResponse.json(
        { error: "This assignment has no brief yet — adopt it first." },
        { status: 400, headers: CORS },
      );
    }
    if (typeof body.note !== "string") {
      return NextResponse.json(
        { error: "Nothing to change." },
        { status: 400, headers: CORS },
      );
    }
    const note = body.note.trim();
    await assignmentStore().putBrief({
      ...set.brief,
      ...(note ? { note } : { note: undefined }),
      updatedAt: new Date().toISOString(),
    });
    await audit(context, "assignment.brief.updated", "assignment", set.brief.briefId, {
      field: "note",
    });
    return NextResponse.json({ briefId: set.brief.briefId }, { headers: CORS });
  } catch (e) {
    return withCors(apiError(e), "PATCH");
  }
}

/**
 * Put the whole assignment away (owner request 2026-08-17). The coach could
 * take learners off one at a time but never retire the assignment itself, so
 * a board asked for by mistake stayed on every learner's list for good.
 *
 * The rows go; nothing anyone PLAYED does — see deleteAssignmentSet.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ briefId: string }> },
) {
  try {
    const { briefId: key } = await params;
    const { context, set } = await requireEditableAssignment(decodeURIComponent(key));
    const { learners, keptSessions } = await deleteAssignmentSet(context, set);
    return NextResponse.json({ deleted: true, learners, keptSessions }, { headers: CORS });
  } catch (e) {
    return withCors(apiError(e), "DELETE");
  }
}

// PATCH /api/bridge/assignments/briefs/[briefId] — edit one assignment's
// brief. [briefId] accepts a legacy key ("legacy:<entryId>", URL-encoded) so
// the native editor works on pre-0028 groups, exactly like the ✎ sheet.
//
//   { adopt: true }  mint a brief for a legacy group (adopt-on-first-edit;
//                    idempotent when one already exists) → { briefId }
//   { note: "…" }    replace the instruction ("" clears it) → { briefId }
//
// Same rule as the actions: ONE copy of the instruction, on the brief.

import { NextResponse, type NextRequest } from "next/server";

import { requireEditableAssignment } from "@/lib/assignmentEdit";
import { apiError } from "@/lib/api";
import { adoptLegacyGroup } from "@/lib/assignmentSets";
import { audit } from "@/lib/audit";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { assignmentStore } from "@/lib/sessions";

const CORS = corsHeaders("PATCH");

export const OPTIONS = corsOptions("PATCH");

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

// One parked draft.
//
//   GET    /api/bridge/challenges/drafts/[entryId] → { entryId, title, draft }
//   DELETE /api/bridge/challenges/drafts/[entryId] → { entryId, deleted: true }
//
// GET re-normalizes the stored JSON so the wizard always receives a complete
// draft, whatever fields existed when it was parked. Both operations are
// club-guarded in the lib: an entry outside the caller's club reads as 404 —
// what you cannot see does not exist (the library API's own posture).

import { NextResponse } from "next/server";

import { canCreateChallenge, canUse } from "@/lib/access";
import { AccessError, apiError, requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { deleteClubDraft, getClubDraft } from "@/lib/challengeDrafts";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";

const CORS = corsHeaders("GET", "DELETE");

export const OPTIONS = corsOptions("GET", "DELETE");

type Params = Readonly<{ params: Promise<{ entryId: string }> }>;

export async function GET(_request: Request, { params }: Params) {
  try {
    const context = await requireContext();
    if (!(await canUse(context, "page.challenges"))) throw new AccessError("No access");
    if (!(await canCreateChallenge(context))) throw new AccessError("No create access");
    const { entryId } = await params;
    const found = await getClubDraft(context, entryId);
    if (!found) throw new AccessError("No such draft");
    return NextResponse.json(found, { headers: CORS });
  } catch (e) {
    return withCors(apiError(e), "GET", "DELETE");
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const context = await requireContext();
    if (!(await canUse(context, "page.challenges"))) throw new AccessError("No access");
    if (!(await canCreateChallenge(context))) throw new AccessError("No create access");
    const { entryId } = await params;
    const deleted = await deleteClubDraft(context, entryId);
    if (!deleted) throw new AccessError("No such draft");
    await audit(context, "profile.delete", "kb_library", entryId, {
      kind: "challenge",
      status: "draft",
      via: "api",
    });
    return NextResponse.json({ entryId, deleted: true }, { headers: CORS });
  } catch (e) {
    return withCors(apiError(e), "GET", "DELETE");
  }
}

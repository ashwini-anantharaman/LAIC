// DELETE /api/bridge/challenges/:challengeId — erase a challenge for good.
//
// NOT a stronger archive, a different act. Archiving retires a challenge and keeps
// every board, play and standing readable, which is what you want for something
// people actually played. This is for the other case: a challenge made by mistake,
// a private table nobody used, a test from an afternoon of testing. Leaving those in
// the list as tombstones is the wrong answer, and archiving them just moves the mess.
//
// AUTHORITY IS NARROWER THAN ARCHIVING'S, deliberately. Archiving is a moderator's
// job — reversible, and someone running a club needs it. Deleting is not reversible
// and it destroys other people's results as well as the creator's, so only the
// CREATOR may do it. A moderator who wants it gone can archive it; if it truly must
// be erased, the person who made it can.
//
// AUTH is the pair every route in this folder carries:
//   - `Authorization: Bearer <nexus token>` (+ `x-program-id`) — the native app.
//   - the launch cookie — anything already inside the embed.
//
// The prompt lives in the app. There is no `?confirm=1` on the wire, because a
// confirmation is a conversation with a person, not a fact a server can check — and
// pretending otherwise would imply this endpoint is safe to call unprompted.

import type { AuditAction } from "@bridge/audit";
import { NextResponse, type NextRequest } from "next/server";

import { canUse } from "@/lib/access";
import { AccessError, apiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { challengeStore } from "@/lib/challenges";
import { getBridgeContext, getBridgeContextFromToken } from "@/lib/nexus";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-program-id, content-type",
} as const;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ challengeId: string }> },
) {
  try {
    const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    const programId =
      request.headers.get("x-program-id") ?? request.nextUrl.searchParams.get("program_id");
    const context = bearer
      ? await getBridgeContextFromToken(bearer, programId)
      : await getBridgeContext();
    if (!context) throw new AccessError("Not signed in");
    if (!(await canUse(context, "page.challenges"))) throw new AccessError("No access");

    const { challengeId } = await params;
    const store = challengeStore();
    const challenge = await store.getChallenge(challengeId);
    // Already gone is a success: a second tap on Delete, or a retry after a dropped
    // response, should not read as an error about something that is exactly as the
    // caller wanted it.
    if (!challenge) return NextResponse.json({ challengeId, deleted: true }, { headers: CORS });

    if (challenge.createdBy !== context.nexusUserId) {
      throw new AccessError("Only the person who created a challenge can delete it");
    }

    // Audited BEFORE the rows go, or there would be nothing left to describe.
    await audit(context, "challenge.deleted" as AuditAction, "challenge", challengeId, {
      title: challenge.title,
      scopeLevel: challenge.scopeLevel ?? null,
      via: "app",
    });
    await store.deleteChallenge(challengeId);

    return NextResponse.json({ challengeId, deleted: true }, { headers: CORS });
  } catch (e) {
    const res = apiError(e);
    for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
    return res;
  }
}

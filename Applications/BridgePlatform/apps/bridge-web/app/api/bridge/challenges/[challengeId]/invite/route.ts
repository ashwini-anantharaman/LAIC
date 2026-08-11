// POST /api/bridge/challenges/:challengeId/invite — answer an invite from the
// club app's OWN screens.
//
// Accept/decline lives on the platform's list card (ADDENDUM A1,
// respondInviteAction) — but the app's native challenge screen could only
// LINK there, which meant a themed screen handing the learner to the
// platform's list for one tap and taking them back. Same transition, same
// rules, served over the same dual auth the summary route carries, so the
// app answers the invite in place.
//
// AUTH. Two credentials, one context (see summary/route.ts):
//   - `Authorization: Bearer <nexus token>` (+ `x-program-id`) — the native app.
//   - the launch cookie — anything already inside the embed.
//
// SEMANTICS ARE THE ACTION'S, EXACTLY: only a PENDING invite transitions —
// a declined one stays declined here precisely because it does on the list
// card too; loosening that belongs to both doors at once or neither.

import type { AuditAction } from "@bridge/audit";
import { NextResponse, type NextRequest } from "next/server";

import { canUse } from "@/lib/access";
import { AccessError, apiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { challengeStore } from "@/lib/challenges";
import { getBridgeContext, getBridgeContextFromToken } from "@/lib/nexus";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-program-id, content-type",
} as const;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(
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
    const body = (await request.json().catch(() => ({}))) as { action?: unknown };
    if (body.action !== "accept" && body.action !== "decline") {
      return NextResponse.json(
        { error: 'action must be "accept" or "decline"' },
        { status: 400, headers: CORS },
      );
    }
    const status = body.action === "accept" ? ("accepted" as const) : ("declined" as const);

    const store = challengeStore();
    const invite = await store.getInvite(challengeId, context.nexusUserId);
    if (!invite) throw new AccessError("That invitation is no longer there");
    if (invite.status === "pending") {
      await store.putInvite({ ...invite, status, respondedAt: new Date().toISOString() });
      // Same narrow cast as the server action: the audit vocabulary is a
      // closed union this feature does not own yet.
      await audit(context, "challenge.invite.responded" as AuditAction, "challenge", challengeId, {
        status,
        via: "app",
      });
    }

    const after = await store.getInvite(challengeId, context.nexusUserId);
    return NextResponse.json(
      { challengeId, inviteStatus: after?.status ?? "none" },
      { headers: CORS },
    );
  } catch (e) {
    const res = apiError(e);
    for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
    return res;
  }
}

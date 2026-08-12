// POST /api/bridge/challenges/:challengeId/archive — retire (or reopen) a
// challenge from the club app's OWN screens.
//
// The platform's list card grew an Archive button (setChallengeArchivedAction), but
// the app can never reach it: BridgeEmbed's escapeTo guard deliberately refuses to
// show the platform's challenges list, because that screen reads as a different
// product inside the app's frame. So the same act needs its own door, exactly as
// answering an invite did.
//
// AUTH is the pair every route in this folder carries:
//   - `Authorization: Bearer <nexus token>` (+ `x-program-id`) — the native app.
//   - the launch cookie — anything already inside the embed.
//
// AUTHORITY is the action's, unchanged: creator or moderator. Retiring a challenge
// everyone was invited to is a moderator's job, and the same people already decide
// who plays it. Two doors onto one act must not disagree about who may open it.
//
// REVERSIBLE, for the same reason the list card offers Reopen: status is one field,
// and archiving by accident should not be a dead end. Nothing is deleted either way
// — boards, plays and standings survive, which is what keeps the results readable.

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
    const body = (await request.json().catch(() => ({}))) as { archived?: unknown };
    if (typeof body.archived !== "boolean") {
      return NextResponse.json(
        { error: "archived must be true or false" },
        { status: 400, headers: CORS },
      );
    }

    const store = challengeStore();
    const challenge = await store.getChallenge(challengeId);
    if (!challenge) throw new AccessError("That challenge is no longer there");

    const mine = await store.getInvite(challengeId, context.nexusUserId);
    const mayArchive = challenge.createdBy === context.nexusUserId || mine?.moderator === true;
    if (!mayArchive) throw new AccessError("Only the creator or a moderator can archive a challenge");

    const status = body.archived ? ("archived" as const) : ("open" as const);
    if (challenge.status !== status) {
      await store.putChallenge({ ...challenge, status });
      // The same narrow cast the invite route uses: the audit vocabulary is a closed
      // union this feature does not own yet.
      await audit(context, "challenge.archived" as AuditAction, "challenge", challengeId, {
        status,
        via: "app",
      });
    }

    return NextResponse.json({ challengeId, status }, { headers: CORS });
  } catch (e) {
    const res = apiError(e);
    for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
    return res;
  }
}

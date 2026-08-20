// The club's parked challenge drafts (owner, 2026-08-18).
//
//   GET  /api/bridge/challenges/drafts[?scope=personal] → { drafts: ClubDraftRow[] }
//   POST /api/bridge/challenges/drafts                  → { entryId }
//        body { draft: ChallengeDraft, entryId?: string }
//
// TWO SHELVES. The default is the club's shared drafts. ?scope=personal is the
// caller's own private-table drafts — creator-only, exactly like the unowned
// table such a draft becomes — mirroring challenges/summary's ?scope=personal.
//
// A draft is a library entry (kind "challenge", status "draft") stamped with
// the CLUB's program id, so every challenge-creator in the club sees the same
// shelf and can pick up anyone's parked work — the club builds its contests
// together. The same row appears on the web library's Challenges shelf.
//
// Gates mirror challenge creation: page.challenges + canCreateChallenge. A
// draft is a challenge that has not happened yet, so the people who may make
// one are the people who may park one. requireContext() is bearer-capable, so
// the app's token + x-program-id work with zero extra plumbing here.

import { NextResponse, type NextRequest } from "next/server";


import { normalizeDraft } from "@/app/bridge/challenges/draft";
import { canCreateChallenge, canUse } from "@/lib/access";
import { AccessError, apiError, requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { listClubDrafts, saveClubDraft } from "@/lib/challengeDrafts";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";

const CORS = corsHeaders("GET", "POST");

export const OPTIONS = corsOptions("GET", "POST");

export async function GET(request: NextRequest) {
  try {
    const context = await requireContext();
    if (!(await canUse(context, "page.challenges"))) throw new AccessError("No access");
    const personal = new URL(request.url).searchParams.get("scope") === "personal";
    // The same split the create route draws: a private table is not a club
    // activity, so the club's create right does not govern its drafts either.
    if (!personal && !(await canCreateChallenge(context)))
      throw new AccessError("No create access");
    return NextResponse.json(
      { drafts: await listClubDrafts(context, personal ? "personal" : "club") },
      { headers: CORS },
    );
  } catch (e) {
    return withCors(apiError(e), "GET", "POST");
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireContext();
    if (!(await canUse(context, "page.challenges"))) throw new AccessError("No access");

    const body = (await request.json().catch(() => null)) as {
      draft?: unknown;
      entryId?: unknown;
    } | null;
    if (!body?.draft) {
      return NextResponse.json({ error: "No draft." }, { status: 400, headers: CORS });
    }
    // normalizeDraft, not validateDraft: a draft is unfinished by definition,
    // and the normaliser is what makes an old or partial payload openable.
    const draft = normalizeDraft(body.draft);
    // The create route's own exemption, applied to parking: a PRIVATE table's
    // draft needs no club create right, and a club draft still does.
    if (draft.personal !== true && !(await canCreateChallenge(context)))
      throw new AccessError("No create access");
    const entryId = typeof body.entryId === "string" && body.entryId ? body.entryId : undefined;

    const saved = await saveClubDraft(context, draft, entryId);
    await audit(context, "profile.create", "kb_library", saved, {
      kind: "challenge",
      status: "draft",
      boards: draft.boards.length,
      via: "api",
    });
    return NextResponse.json({ entryId: saved }, { headers: CORS });
  } catch (e) {
    return withCors(apiError(e), "GET", "POST");
  }
}

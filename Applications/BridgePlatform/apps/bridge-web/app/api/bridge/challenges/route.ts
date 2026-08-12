// POST /api/bridge/challenges — create a challenge from the wizard draft.
// The lift of createChallengeAction: the SAME ChallengeDraft payload, the
// SAME shared validateDraft (the pure module both wizards and this route
// re-check, because a client is never the authority), the same writes in the
// same order — challenge, boards (seeds re-dealt server-side), the creator's
// accepted+moderator invite row, then the picked invites checked against the
// creator's own directory (never invited blind). → { challengeId, invited }.

import type { AuditAction } from "@bridge/audit";
import {
  challengeFormat,
  standardVul,
  type Challenge,
  type ChallengeBoard,
  type ChallengeInvite,
} from "@bridge/challenges";
import { seededDeal } from "@bridge/engine";
import type { Card, Seat } from "@bridge/events";
import { newId } from "@bridge/kb";
import { stubDisplayName } from "@bridge/nexus-client";
import { NextResponse, type NextRequest } from "next/server";

import { packFromDraft, validateDraft, type ChallengeDraft } from "@/app/bridge/challenges/draft";
import { listChallengePeople } from "@/app/bridge/challenges/people";
import { canCreateChallenge, canUse } from "@/lib/access";
import { AccessError, apiError, requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { challengeStore } from "@/lib/challenges";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";

const CORS = corsHeaders("POST");

export const OPTIONS = corsOptions("POST");

export async function POST(request: NextRequest) {
  try {
    const context = await requireContext();
    if (!(await canUse(context, "page.challenges"))) throw new AccessError("No access");
    // The two-catalogue rule (platform allows, the club's role gates) lives
    // in canCreateChallenge — the same gate the wizard page runs.
    if (!(await canCreateChallenge(context))) throw new AccessError("No create access");

    const draft = (await request.json().catch(() => null)) as ChallengeDraft | null;
    if (!draft) {
      return NextResponse.json({ error: "No draft." }, { status: 400, headers: CORS });
    }
    const errors = validateDraft(draft);
    if (errors.length) {
      return NextResponse.json({ error: errors[0] }, { status: 400, headers: CORS });
    }

    const displayName =
      context.displayName ?? stubDisplayName(context.nexusUserId) ?? undefined;
    const store = challengeStore();
    const challengeId = newId("chl");
    const now = new Date().toISOString();

    // Written ONLY when not the default, so a bid-and-play challenge's record
    // is byte-identical to one created before the option existed.
    const format = challengeFormat(draft);

    const challenge: Challenge = {
      challengeId,
      title: draft.title.trim(),
      ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
      ...(format === "full" ? {} : { format }),
      scoring: draft.scoring,
      createdBy: context.nexusUserId,
      ...(displayName ? { createdByName: displayName } : {}),
      status: "open",
      editorBadge: draft.editorBadge,
      standingsVisibility: draft.standingsVisibility,
      createdAt: now,
    };
    await store.putChallenge(challenge);

    for (const board of draft.boards) {
      let pack: Record<Seat, Card[]>;
      if (board.pack) {
        const parsed = packFromDraft(board.pack);
        // validateDraft already rejected an illegal pack; keep the types honest.
        if ("error" in parsed) throw new Error(parsed.error);
        pack = parsed.hands;
      } else {
        pack = seededDeal(board.seed);
      }
      const record: ChallengeBoard = {
        challengeId,
        boardNo: board.boardNo,
        pack,
        dealer: board.dealer,
        vul: board.vul ?? standardVul(board.boardNo),
        humanSeat: board.humanSeat,
        controlOverrides: draft.controlOverrides,
      };
      await store.putBoard(record);
    }

    // Invite only people this creator can actually see — plus the creator.
    const directory = new Map(
      (await listChallengePeople(context)).map((p) => [p.userId, p] as const),
    );
    const creatorRow: ChallengeInvite = {
      challengeId,
      userId: context.nexusUserId,
      ...(displayName ? { userName: displayName } : {}),
      status: "accepted",
      moderator: true,
      invitedBy: context.nexusUserId,
      invitedAt: now,
      respondedAt: now,
    };
    await store.putInvite(creatorRow);

    let invited = 0;
    for (const invite of draft.invites) {
      if (invite.userId === context.nexusUserId) continue;
      const person = directory.get(invite.userId);
      if (!person) continue; // not visible to this creator — never invite blind
      await store.putInvite({
        challengeId,
        userId: person.userId,
        userName: person.name,
        status: "pending",
        moderator: !!invite.moderator,
        invitedBy: context.nexusUserId,
        invitedAt: now,
      });
      invited++;
    }

    // Challenge verbs join @bridge/audit's closed union when that package
    // next opens — until then the trail records the real name via one cast
    // (same posture as the action).
    await audit(context, "challenge.created" as AuditAction, "challenge", challengeId, {
      title: challenge.title,
      boards: draft.boards.length,
      format,
      scoring: draft.scoring,
      standingsVisibility: draft.standingsVisibility,
      invited,
      editorBadge: draft.editorBadge,
      overrides: Object.keys(draft.controlOverrides).length,
    });

    return NextResponse.json(
      { challengeId, title: challenge.title, invited },
      { headers: CORS },
    );
  } catch (e) {
    return withCors(apiError(e), "POST");
  }
}

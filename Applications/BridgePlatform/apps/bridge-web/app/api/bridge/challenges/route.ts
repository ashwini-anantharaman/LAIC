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
  type ChallengeEngine,
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
import { promoteClubDraft } from "@/lib/challengeDrafts";
import { listChallengePeople, listFriendPeople } from "@/app/bridge/challenges/people";
import { canCreateChallenge, canUse } from "@/lib/access";
import { AccessError, apiError, requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { boardPuzzleFromDraft } from "@/lib/challengePuzzles";
import { challengeStore, requireChallengeOwnerScope } from "@/lib/challenges";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";

const CORS = corsHeaders("POST");

export const OPTIONS = corsOptions("POST");

export async function POST(request: NextRequest) {
  try {
    const context = await requireContext();
    if (!(await canUse(context, "page.challenges"))) throw new AccessError("No access");
    // The two-catalogue rule (platform allows, the club's role gates) lives
    // in canCreateChallenge — the same gate the wizard page runs.
    const draft = (await request.json().catch(() => null)) as
      | (ChallengeDraft & { draftEntryId?: string })
      | null;
    if (!draft) {
      return NextResponse.json({ error: "No draft." }, { status: 400, headers: CORS });
    }
    const personal = draft.personal === true;
    // A PRIVATE TABLE is not a club activity, so the club's create right does not
    // govern it. Owner direction: playing a few boards with your own friends should
    // not depend on whether your club lets its members run club challenges.
    //
    // What makes that safe is not a weaker check, it is a narrower reach: a private
    // table can only invite people this person already has — friends who accepted
    // them, and the roster of the club they are themselves in (see the directory
    // below) — so removing the gate grants no new access to anyone ELSE's club,
    // roster or content. Everything else still needs create access.
    if (!personal && !(await canCreateChallenge(context))) {
      throw new AccessError("No create access");
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
    // The creator's choice of robots, defaulting to the solver — stamped on
    // the challenge so everyone entering meets the same opponents however
    // long the contest runs (the same rule the web action applies).
    const engine: ChallengeEngine = draft.engine === "ben" ? "ben" : "dd";

    // 0029: the club this challenge belongs to. Refuses rather than storing a null
    // owner, which the read path would treat as "visible in every club".
    //
    // A PRIVATE TABLE is the deliberate exception: it belongs to its creator rather
    // than a club, so it is stored unowned and marked scope_level "user", which
    // keeps it off every club's list while remaining visible to whoever was invited.
    const ownerScope = personal ? null : requireChallengeOwnerScope(context);

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
      engine,
      nexusProgramId: ownerScope,
      scopeLevel: personal ? "user" : "program",
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
        // A puzzle board stores its frozen story, replay-validated against
        // this very pack — the engine refuses an illegal history here, at
        // create, rather than in front of the first participant.
        ...(board.puzzle
          ? {
              puzzle: boardPuzzleFromDraft(board.puzzle, {
                boardRef: `${challengeId}#${board.boardNo}`,
                dealer: board.dealer,
                vul: board.vul ?? standardVul(board.boardNo),
                pack,
              }),
            }
          : {}),
      };
      await store.putBoard(record);
    }

    // Invite only people this creator can actually reach — plus the creator. For a
    // private table that is their FRIENDS AND THEIR OWN CLUB; for a club challenge,
    // the club. Both are resolved server-side from the caller's own identity, so the
    // draft cannot name somebody it has no business naming: an id this client made
    // up is simply not in the map, and falls out below. "Never invite blind" holds
    // either way — and note that it falls out SILENTLY, so a client offering a wider
    // list than this one would drop players with no error to show for it.
    //
    const directory = new Map(
      (personal ? await listFriendPeople(context) : await listChallengePeople(context)).map(
        (p) => [p.userId, p] as const,
      ),
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

    // Created from a parked draft: promote that row in place, so the shelf
    // never shows a stale draft beside the challenge it became.
    if (typeof draft.draftEntryId === "string" && draft.draftEntryId) {
      await promoteClubDraft(context, draft.draftEntryId, { challengeId, title: challenge.title }, draft);
    }

    return NextResponse.json(
      { challengeId, title: challenge.title, invited },
      { headers: CORS },
    );
  } catch (e) {
    return withCors(apiError(e), "POST");
  }
}

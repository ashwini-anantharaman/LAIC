"use server";

// Challenges — the write side of the list and the create wizard.
//
// Three actions, all re-checking the access catalogue server-side because a
// client is never the authority: create a challenge (seeding its boards),
// answer an invite (ADDENDUM A1: accept/decline lives on the list card), and
// add people to an existing challenge.

import type { AuditAction } from "@bridge/audit";
import {
  challengeFormat,
  standardVul,
  type Challenge,
  type ChallengeBoard,
  type ChallengeInvite,
  type InviteStatus,
} from "@bridge/challenges";
import { seededDeal } from "@bridge/engine";
import type { Card, Seat } from "@bridge/events";
import { newId } from "@bridge/kb";
import { stubDisplayName } from "@bridge/nexus-client";
import type { NexusBridgeContext } from "@laic/learner-contracts";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireFeature } from "@/lib/access";
import { requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { challengeStore } from "@/lib/challenges";
import { libraryStore } from "@/lib/sessions";
import { authoredScope, nexusProgramIdOf, orgScopeOf } from "@/lib/nexus";
import { packFromDraft, validateDraft, type ChallengeDraft } from "./draft";
import { listChallengePeople } from "./people";

const LIST = "/bridge/challenges";

/**
 * The audit vocabulary is a closed union in @bridge/audit, which this feature
 * does not own; challenge verbs join it when that package next opens. Until
 * then the trail records them under their real names through one narrow cast,
 * rather than logging a misleading existing verb.
 */
async function auditChallenge(
  context: NexusBridgeContext,
  action: "challenge.created" | "challenge.invite.responded" | "challenge.invited",
  challengeId: string,
  details: Record<string, unknown>,
): Promise<void> {
  await audit(context, action as AuditAction, "challenge", challengeId, details);
}

function displayNameOf(context: NexusBridgeContext): string | undefined {
  return context.displayName ?? stubDisplayName(context.nexusUserId) ?? undefined;
}

/** Serialize a hand back to the pack the board stores. */
function packOf(board: { seed: number; pack?: Record<Seat, string> }): Record<Seat, Card[]> {
  if (!board.pack) return seededDeal(board.seed);
  const parsed = packFromDraft(board.pack);
  // validateDraft already rejected an illegal pack; this keeps the types honest.
  if ("error" in parsed) throw new Error(parsed.error);
  return parsed.hands;
}

/**
 * Create a challenge: validate the draft, seed every board (deal from the
 * wizard's seed, dealer from the creator or the standard cycle, vulnerability
 * ALWAYS from the standard cycle), write the boards, write the invites with
 * the creator's own row accepted + moderator, and land back on the list.
 */
export async function createChallengeAction(draft: ChallengeDraft): Promise<void> {
  const context = await requireContext();
  await requireFeature(context, "page.challenges");
  await requireFeature(context, "challenge.create");

  const errors = validateDraft(draft);
  if (errors.length) throw new Error(errors[0]!);

  const store = challengeStore();
  const challengeId = newId("chl");
  const now = new Date().toISOString();

  // Written ONLY when it is not the default, so a bid-and-play challenge's
  // record is byte-identical to one created before the option existed — which
  // is what makes this additive with no migration owed.
  const format = challengeFormat(draft);

  const challenge: Challenge = {
    challengeId,
    title: draft.title.trim(),
    ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
    ...(format === "full" ? {} : { format }),
    scoring: draft.scoring,
    createdBy: context.nexusUserId,
    ...(displayNameOf(context) ? { createdByName: displayNameOf(context) } : {}),
    status: "open",
    editorBadge: draft.editorBadge,
    standingsVisibility: draft.standingsVisibility,
    createdAt: now,
  };
  await store.putChallenge(challenge);

  // The checklist is challenge-wide; it is STORED per board, which is where
  // the table reads it from when it opens one.
  for (const board of draft.boards) {
    const record: ChallengeBoard = {
      challengeId,
      boardNo: board.boardNo,
      pack: packOf(board),
      dealer: board.dealer,
      // An imported board carries its own vulnerability; a random one follows
      // the standard cycle for its position.
      vul: board.vul ?? standardVul(board.boardNo),
      humanSeat: board.humanSeat,
      controlOverrides: draft.controlOverrides,
    };
    await store.putBoard(record);
  }

  // Invite only people this creator can actually see (the same directory the
  // wizard searched, re-read here) — plus the creator, always.
  const directory = new Map(
    (await listChallengePeople(context)).map((p) => [p.userId, p] as const),
  );
  const creatorRow: ChallengeInvite = {
    challengeId,
    userId: context.nexusUserId,
    ...(displayNameOf(context) ? { userName: displayNameOf(context) } : {}),
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

  await auditChallenge(context, "challenge.created", challengeId, {
    title: challenge.title,
    boards: draft.boards.length,
    format,
    scoring: draft.scoring,
    standingsVisibility: draft.standingsVisibility,
    invited,
    editorBadge: draft.editorBadge,
    overrides: Object.keys(draft.controlOverrides).length,
  });

  revalidatePath(LIST);
  redirect(`${LIST}?created=${encodeURIComponent(challenge.title)}`);
}

/**
 * Accept or decline an invite from the list card (ADDENDUM A1). Nothing about
 * the challenge opens until the invite is accepted, so this is the only door.
 */
export async function respondInviteAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  await requireFeature(context, "page.challenges");

  const challengeId = String(formData.get("challengeId") ?? "");
  const raw = String(formData.get("response") ?? "");
  const status: InviteStatus = raw === "accept" ? "accepted" : "declined";
  if (raw !== "accept" && raw !== "decline") throw new Error("Accept or decline, nothing else");

  const store = challengeStore();
  const invite = await store.getInvite(challengeId, context.nexusUserId);
  if (!invite) throw new Error("That invitation is no longer there");
  if (invite.status === "pending") {
    await store.putInvite({ ...invite, status, respondedAt: new Date().toISOString() });
    await auditChallenge(context, "challenge.invite.responded", challengeId, { status });
  }

  revalidatePath(LIST);
  redirect(LIST);
}

/**
 * Add people to a challenge after it exists (invites stay addable forever,
 * spec §2 "Locking"). Creator or moderator only; the moderator flag rides
 * along per row, exactly as at create time.
 */
export async function inviteAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  await requireFeature(context, "page.challenges");

  const challengeId = String(formData.get("challengeId") ?? "");
  const store = challengeStore();
  const challenge = await store.getChallenge(challengeId);
  if (!challenge) throw new Error("That challenge is no longer there");

  const mine = await store.getInvite(challengeId, context.nexusUserId);
  const mayInvite = challenge.createdBy === context.nexusUserId || mine?.moderator === true;
  if (!mayInvite) throw new Error("Only the creator or a moderator can invite people");

  const userIds = formData.getAll("userId").map(String).filter(Boolean);
  const moderators = new Set(formData.getAll("moderator").map(String));
  const directory = new Map(
    (await listChallengePeople(context)).map((p) => [p.userId, p] as const),
  );
  const now = new Date().toISOString();

  let invited = 0;
  for (const userId of userIds) {
    const person = directory.get(userId);
    if (!person) continue;
    const existing = await store.getInvite(challengeId, userId);
    if (existing) {
      // Already invited: the creator may still flip their moderator flag.
      if (challenge.createdBy === context.nexusUserId)
        await store.putInvite({ ...existing, moderator: moderators.has(userId) });
      continue;
    }
    await store.putInvite({
      challengeId,
      userId: person.userId,
      userName: person.name,
      status: "pending",
      moderator: moderators.has(userId),
      invitedBy: context.nexusUserId,
      invitedAt: now,
    });
    invited++;
  }

  await auditChallenge(context, "challenge.invited", challengeId, { invited });

  const returnTo = String(formData.get("returnTo") ?? "");
  const target = returnTo.startsWith("/bridge/challenges") ? returnTo : LIST;
  revalidatePath(target);
  redirect(target);
}

/**
 * Save a challenge to the library, so the same contest can be set again.
 *
 * WHAT IS SAVED IS THE DEFINITION, NOT THE RESULT. A challenge's standings
 * belong to the people who played it and are already on its own page; what has
 * no home anywhere else is the thing that took work to build — the boards, and
 * the format and scoring that decide what playing them means. That is what a
 * saved challenge has to carry to be worth saving.
 *
 * The boards are COPIED, not referenced. A library entry outlives the record it
 * came from: challenges are deleted, edited before they lock, and re-packed,
 * and an entry that pointed at one would quietly become a title with nothing
 * behind it. `sourceChallengeId` records where it came from without depending
 * on it still being there.
 */
export async function saveChallengeToLibraryAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  await requireFeature(context, "table.save_library");
  const challengeId = String(formData.get("challengeId"));

  const store = challengeStore();
  const challenge = await store.getChallenge(challengeId);
  if (!challenge) redirect(`${LIST}?error=${encodeURIComponent("That challenge is gone.")}`);
  const boards = await store.listBoards(challengeId);
  if (boards.length === 0)
    redirect(
      `${LIST}/${challengeId}?error=${encodeURIComponent(
        "Nothing to save yet — this challenge has no boards.",
      )}`,
    );

  const name = String(formData.get("name") ?? "").trim() || challenge.title;
  const notes = String(formData.get("notes") ?? "").trim();

  const entry = {
    entryId: newId("le"),
    kind: "challenge" as const,
    name,
    ...(notes && { notes }),
    tags: [] as string[],
    origin: "authored" as const,
    createdBy: context.nexusUserId,
    createdAt: new Date().toISOString(),
    programOrganizationId: orgScopeOf(context),
    nexusProgramId: (await nexusProgramIdOf()) ?? undefined,
    scopeLevel: authoredScope(context),
    sourceChallengeId: challengeId,
    challengeFormat: challengeFormat(challenge),
    challengeScoring: challenge.scoring,
    challengeBoards: boards
      .slice()
      .sort((a, b) => a.boardNo - b.boardNo)
      .map((b) => ({
        boardNo: b.boardNo,
        pack: b.pack,
        dealer: b.dealer,
        vul: b.vul,
        humanSeat: b.humanSeat,
      })),
  };

  try {
    await libraryStore().putEntry(entry);
  } catch {
    redirect(
      `${LIST}/${challengeId}?error=${encodeURIComponent(
        "Couldn't save — the library isn't provisioned on this backend yet.",
      )}`,
    );
  }
  await audit(context, "profile.create", "kb_library", entry.entryId, {
    challengeId,
    kind: "challenge",
    boards: entry.challengeBoards.length,
  });
  redirect(`/bridge/library?kind=challenge&saved=challenge`);
}

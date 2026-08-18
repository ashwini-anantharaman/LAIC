// Club-level challenge drafts (owner, 2026-08-18): a challenge being built in
// the app can be parked and picked up again — BY THE CLUB, not just by the
// person who parked it. The web wizard's drafts (saveChallengeDraftAction) are
// personal, which suits a solo author at a desk; a club's coaches build
// contests together, so the app's drafts hang off the club the way the
// challenges themselves do (0029: challengeOwnerScope).
//
// A draft is a LIBRARY ENTRY, exactly as on the web — kind "challenge",
// challengeStatus "draft", the wizard state whole in challengeDraftJson — so
// a draft parked in the app also appears on the web library's Challenges
// shelf, and publishing PROMOTES the same row rather than leaving a stale
// draft beside the challenge it became.
//
// SERVER-ONLY: touches the library store.

import { newId } from "@bridge/kb";
import type { LibraryEntry } from "@bridge/sessions";
import type { NexusBridgeContext } from "@bridge/nexus-client";

import { challengeFormat } from "@bridge/challenges";
import { normalizeDraft, type ChallengeDraft } from "@/app/bridge/challenges/draft";
import { challengeOwnerScope } from "@/lib/challenges";
import { orgScopeOf } from "@/lib/nexus";
import { libraryStore } from "@/lib/sessions";

/** A draft row as the app lists it — enough to render a shelf and re-open. */
export interface ClubDraftRow {
  entryId: string;
  title: string;
  boardCount: number;
  format: string;
  scoring: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** A private-table draft — the creator's own, never the club's. */
  personal: boolean;
}

/** Which shelf: the club's shared drafts, or my own private-table drafts. */
export type DraftScope = "club" | "personal";

/**
 * Is this a PERSONAL draft? Read from the stored wizard state itself — the
 * draft JSON carries `personal`, the same flag that will make the published
 * challenge a private table. Reading the flag where it lives beats mirroring
 * it into a second field that could disagree.
 */
function isPersonalDraft(entry: LibraryEntry): boolean {
  if (!entry.challengeDraftJson) return false;
  try {
    return (JSON.parse(entry.challengeDraftJson) as { personal?: unknown }).personal === true;
  } catch {
    return false;
  }
}

/**
 * May this caller SEE this draft at all?
 *
 * Two regimes, decided by what the draft will become:
 *  - a PERSONAL draft belongs to its creator alone — exactly like the private
 *    table it turns into, which is stored unowned and visible only to whoever
 *    was invited (and nobody is invited to a draft);
 *  - a CLUB draft belongs to the club: any of its challenge-creators may pick
 *    it up. The club test mirrors matchesScope's 0022 rule — a row with no
 *    program stamp is org-scoped (pre-0022) and stays visible rather than
 *    orphaned. A user-scoped row (the web wizard stamps authoredScope) is
 *    still its creator's own.
 */
function canSeeDraft(entry: LibraryEntry, context: NexusBridgeContext): boolean {
  if (entry.kind !== "challenge" || entry.challengeStatus !== "draft") return false;
  if (isPersonalDraft(entry)) return entry.createdBy === context.nexusUserId;
  if (entry.scopeLevel === "user") return entry.createdBy === context.nexusUserId;
  const org = orgScopeOf(context);
  if (entry.programOrganizationId !== undefined && entry.programOrganizationId !== org)
    return false;
  const club = challengeOwnerScope(context);
  return entry.nexusProgramId == null || club == null || entry.nexusProgramId === club;
}

/** Does this draft belong on the requested shelf? Visibility comes first. */
function onShelf(entry: LibraryEntry, scope: DraftScope): boolean {
  return isPersonalDraft(entry) === (scope === "personal");
}

/** The requested shelf's parked drafts, newest work first. */
export async function listClubDrafts(
  context: NexusBridgeContext,
  scope: DraftScope = "club",
): Promise<ClubDraftRow[]> {
  const entries = await libraryStore().listEntries("challenge");
  return entries
    .filter((e) => canSeeDraft(e, context) && onShelf(e, scope))
    .map((e) => ({
      entryId: e.entryId,
      title: e.name,
      boardCount: e.challengeBoardCount ?? e.challengeBoards?.length ?? 0,
      format: e.challengeFormat ?? "full",
      scoring: e.challengeScoring ?? "imps",
      createdBy: e.createdBy,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt ?? e.createdAt,
      personal: isPersonalDraft(e),
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * One draft, re-normalized for the wizard. The stored JSON is TEXT and is
 * re-read through the same normaliser a fresh draft goes through, so a draft
 * saved before a field existed opens with that field defaulted rather than
 * undefined — the whole reason parking is worth anything.
 */
export async function getClubDraft(
  context: NexusBridgeContext,
  entryId: string,
): Promise<{ entryId: string; title: string; draft: ChallengeDraft } | null> {
  const entry = await libraryStore().getEntry(entryId);
  if (!entry || !canSeeDraft(entry, context) || !entry.challengeDraftJson) return null;
  try {
    return {
      entryId: entry.entryId,
      title: entry.name,
      draft: normalizeDraft(JSON.parse(entry.challengeDraftJson)),
    };
  } catch {
    // A broken row must not lock the club out of its own shelf.
    return null;
  }
}

/**
 * Park (or re-park) a draft at club level. Saving again with the same entryId
 * UPDATES that row — a draft is one thing being worked on, and a shelf that
 * grew a row per save would bury the challenge it was meant to keep.
 *
 * Any of the club's challenge-creators may pick up any of the club's drafts —
 * that is the point of parking at club level — so the update guard is the
 * CLUB, not the author. createdBy keeps naming whoever started it.
 */
export async function saveClubDraft(
  context: NexusBridgeContext,
  draft: ChallengeDraft,
  entryId?: string,
): Promise<string> {
  // Deliberately NOT validateDraft: a draft is unfinished by definition. The
  // title is only defaulted for the shelf row, which needs something to show.
  const title = draft.title.trim() || "Untitled challenge";
  const store = libraryStore();
  const existing = entryId ? await store.getEntry(entryId) : null;
  const editable = existing && canSeeDraft(existing, context) ? existing : null;

  const now = new Date().toISOString();
  const entry: LibraryEntry = {
    ...(editable ?? {
      entryId: newId("le"),
      tags: [] as string[],
      origin: "authored" as const,
      createdBy: context.nexusUserId,
      createdAt: now,
      programOrganizationId: orgScopeOf(context),
      // OWNERSHIP FOLLOWS WHAT IT BECOMES. A club draft is the club's row —
      // program-scoped with the club's own program id, like the challenge it
      // turns into. A personal (private-table) draft is its creator's alone:
      // user-scoped, no owning program, exactly how the table itself is stored.
      ...(draft.personal === true
        ? { scopeLevel: "user" as const }
        : {
            nexusProgramId: challengeOwnerScope(context) ?? undefined,
            scopeLevel: "program" as const,
          }),
    }),
    kind: "challenge" as const,
    name: title,
    ...(draft.description.trim() ? { notes: draft.description.trim() } : {}),
    challengeStatus: "draft" as const,
    challengeFormat: challengeFormat(draft),
    challengeScoring: draft.scoring,
    challengeBoardCount: draft.boards.length,
    challengeDraftJson: JSON.stringify(draft),
    updatedAt: now,
  };

  await store.putEntry(entry);
  return entry.entryId;
}

/** Remove a parked draft — club-guarded like every other operation here. */
export async function deleteClubDraft(
  context: NexusBridgeContext,
  entryId: string,
): Promise<boolean> {
  const entry = await libraryStore().getEntry(entryId);
  if (!entry || !canSeeDraft(entry, context)) return false;
  await libraryStore().deleteEntry(entryId);
  return true;
}

/**
 * Publishing PROMOTES the draft row in place: status flips, the row points at
 * the challenge it became, and the shelf never shows a stale draft beside the
 * real thing. Failure is swallowed — the challenge stands either way; the row
 * simply stays a draft.
 */
export async function promoteClubDraft(
  context: NexusBridgeContext,
  entryId: string,
  challenge: { challengeId: string; title: string },
  draft: ChallengeDraft,
): Promise<void> {
  try {
    const entry = await libraryStore().getEntry(entryId);
    if (!entry || !canSeeDraft(entry, context)) return;
    await libraryStore().putEntry({
      ...entry,
      name: challenge.title,
      challengeStatus: "published",
      sourceChallengeId: challenge.challengeId,
      challengeFormat: challengeFormat(draft),
      challengeScoring: draft.scoring,
      challengeBoardCount: draft.boards.length,
    });
  } catch {
    // Stays a draft; the challenge is unaffected.
  }
}

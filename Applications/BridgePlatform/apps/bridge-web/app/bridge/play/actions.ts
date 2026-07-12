"use server";

import { defaultSettingValues } from "@bridge/config";
import { generateConstrainedBoards, specFromTeachingScope } from "@bridge/dealer";
import { seededBoard } from "@bridge/engine";
import type { Seat } from "@bridge/events";
import { BEGINNER_NATURAL_PACKAGE_ID } from "@bridge/knowledge";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { resolveProfileValues } from "@bridge/profiles";
import { getBridgeContext } from "@/lib/nexus";
import { profileService } from "@/lib/profiles";
import { recomputeSignalsSafe } from "@/lib/progress";
import { latestPackage, sessionService } from "@/lib/sessions";

async function requireContext() {
  const context = await getBridgeContext();
  if (!context) throw new Error("Not signed in");
  return context;
}

export async function createPracticeSession(formData: FormData) {
  const context = await requireContext();
  const seed = Number(formData.get("seed")) || 1;
  const humanSeat = formData.get("humanSeat") as Seat | "watch" | null;
  const pkg = await latestPackage(BEGINNER_NATURAL_PACKAGE_ID);
  const profileId = String(formData.get("profileId") || "");
  const profile = profileId
    ? await (await profileService()).getProfile(profileId, context)
    : null;
  const resolvedValues = profile
    ? resolveProfileValues(pkg.settings, profile.selectedPresetId, profile.valueOverrides).values
    : defaultSettingValues(pkg.settings);
  const record = await sessionService().createSession({
    context,
    sessionType: "single_board",
    board: seededBoard(seed),
    pkg,
    resolvedValues,
    seats:
      humanSeat && humanSeat !== "watch"
        ? {
            [humanSeat]: {
              seat: humanSeat,
              playerKind: "human",
              occupantId: context.nexusUserId,
            },
          }
        : undefined,
  });
  // Advance AI to the human's first turn (or to completion for watch mode
  // leave it stepped manually).
  if (humanSeat && humanSeat !== "watch")
    await sessionService().autoplay(record.bridgeSessionId, context);
  redirect(`/bridge/play/${record.bridgeSessionId}`);
}

export async function stepSession(formData: FormData) {
  const context = await requireContext();
  const id = String(formData.get("sessionId"));
  await sessionService().step(id, context);
  await recomputeSignalsSafe(id);
  revalidatePath(`/bridge/play/${id}`);
}

export async function autoplaySession(formData: FormData) {
  const context = await requireContext();
  const id = String(formData.get("sessionId"));
  await sessionService().autoplay(id, context);
  await recomputeSignalsSafe(id);
  revalidatePath(`/bridge/play/${id}`);
}

export async function undoSession(formData: FormData) {
  const context = await requireContext();
  const id = String(formData.get("sessionId"));
  await sessionService().undo(id, context);
  await recomputeSignalsSafe(id);
  revalidatePath(`/bridge/play/${id}`);
}

export async function humanBid(formData: FormData) {
  const context = await requireContext();
  const id = String(formData.get("sessionId"));
  const seat = String(formData.get("seat")) as Seat;
  const call = String(formData.get("call"));
  await sessionService().applyExternalAction(id, context, seat, { kind: "bid", call });
  await sessionService().autoplay(id, context); // AI responds up to the next human turn
  await recomputeSignalsSafe(id);
  revalidatePath(`/bridge/play/${id}`);
}

export async function humanPlay(formData: FormData) {
  const context = await requireContext();
  const id = String(formData.get("sessionId"));
  const seat = String(formData.get("seat")) as Seat;
  const cardId = String(formData.get("cardId"));
  await sessionService().applyExternalAction(id, context, seat, { kind: "play", cardId });
  await sessionService().autoplay(id, context);
  await recomputeSignalsSafe(id);
  revalidatePath(`/bridge/play/${id}`);
}

/**
 * Level-scoped practice (Phase 6): one board generated under the Level-1
 * teaching scope — the learner deals and always holds a 1-of-a-suit opening.
 */
export async function createLevelPracticeSession(formData: FormData) {
  const context = await requireContext();
  const seed = Number(formData.get("seed")) || Math.floor(Math.random() * 1_000_000);
  // The scope is the COACH'S (or default) record — never an objective level.
  const scopeId = String(formData.get("scopeId") || "ts_system_bn_level1");
  const scope = await (await profileService()).getScope(scopeId, context);
  if (!scope) throw new Error("Teaching scope not found in your scope");
  const pkg = await latestPackage(BEGINNER_NATURAL_PACKAGE_ID);
  const values = defaultSettingValues(pkg.settings);
  const spec = specFromTeachingScope(
    scope.derivedFromItemId ?? scope.teachingScopeId,
    { scopeId: scope.teachingScopeId, evaluatorFilter: scope.evaluatorFilter, targetConceptIds: scope.targetConceptIds },
    { seed, count: 1, dealer: "S", namePrefix: scope.name },
  );
  const board = generateConstrainedBoards(spec, { pkg, values }).boards[0]!;
  const record = await sessionService().createSession({
    context,
    sessionType: "practice_set",
    board,
    pkg,
    resolvedValues: values,
    seats: { S: { seat: "S", playerKind: "human", occupantId: context.nexusUserId } },
  });
  redirect(`/bridge/play/${record.bridgeSessionId}`);
}

// ---- Phase 14: snapshots, board library, import (§8.4, §15.1, §7.2) --------

export async function savePositionSnapshot(formData: FormData) {
  const context = await requireContext();
  const id = String(formData.get("sessionId"));
  const name = String(formData.get("name") || "");
  await sessionService().saveSnapshot(id, context, name);
  redirect("/bridge/boards");
}

export async function resumePositionSnapshot(formData: FormData) {
  const context = await requireContext();
  const snapshotId = String(formData.get("snapshotId"));
  const humanSeat = formData.get("humanSeat") as Seat | "watch" | null;
  const snapshot = (await sessionService().listSnapshots(context)).find(
    (s) => s.snapshotId === snapshotId,
  );
  if (!snapshot) throw new Error("Snapshot not found");
  const { knowledgeStore } = await import("@/lib/knowledge");
  const pkgRecord = await knowledgeStore().getPackage(
    snapshot.packageRef.packageId,
    snapshot.packageRef.version,
  );
  if (!pkgRecord) throw new Error("The snapshot's package version is no longer available");
  const record = await sessionService().resumeSnapshot(
    snapshotId,
    context,
    pkgRecord.pkg,
    humanSeat && humanSeat !== "watch"
      ? { [humanSeat]: { seat: humanSeat, playerKind: "human", occupantId: context.nexusUserId } }
      : undefined,
  );
  redirect(`/bridge/play/${record.bridgeSessionId}`);
}

export async function saveBoardToLibraryAction(formData: FormData) {
  const context = await requireContext();
  const id = String(formData.get("sessionId"));
  const name = String(formData.get("name") || "");
  const view = await sessionService().getSession(id, context);
  await sessionService().saveBoardToLibrary(
    context,
    name || view.record.board.name,
    view.record.board,
  );
  redirect("/bridge/boards");
}

export async function playSavedBoard(formData: FormData) {
  const context = await requireContext();
  const boardId = String(formData.get("boardId"));
  const humanSeat = formData.get("humanSeat") as Seat | "watch" | null;
  const saved = await sessionService().getBoard(boardId, context);
  const pkg = await latestPackage(BEGINNER_NATURAL_PACKAGE_ID);
  const record = await sessionService().createSession({
    context,
    sessionType: "single_board",
    board: saved.board,
    pkg,
    resolvedValues: defaultSettingValues(pkg.settings),
    seats:
      humanSeat && humanSeat !== "watch"
        ? { [humanSeat]: { seat: humanSeat, playerKind: "human", occupantId: context.nexusUserId } }
        : undefined,
  });
  if (humanSeat && humanSeat !== "watch")
    await sessionService().autoplay(record.bridgeSessionId, context);
  redirect(`/bridge/play/${record.bridgeSessionId}`);
}

export async function createBoardShareLink(formData: FormData) {
  const context = await requireContext();
  const boardId = String(formData.get("boardId"));
  const link = await sessionService().createShareLink(boardId, context);
  redirect(`/bridge/boards?shared=${link.token}`);
}

/** Paste-import a PBN or LIN board (deal + any recorded auction/play). */
export async function importBoard(formData: FormData) {
  const context = await requireContext();
  const text = String(formData.get("text") || "");
  const { importBoardText } = await import("@/lib/formats");
  const imported = importBoardText(text);
  const pkg = await latestPackage(BEGINNER_NATURAL_PACKAGE_ID);
  const record = await sessionService().createSession({
    context,
    sessionType: "single_board",
    board: imported.board,
    pkg,
    resolvedValues: defaultSettingValues(pkg.settings),
  });
  if (imported.events.length) {
    const { sessionStoreInstance } = await import("@/lib/sessions");
    await sessionStoreInstance().appendEvents(record.bridgeSessionId, imported.events);
  }
  redirect(`/bridge/play/${record.bridgeSessionId}`);
}

/** Onboarding-lite table profile: name at table, seat, feedback depth. */
export async function saveTableProfile(formData: FormData) {
  const context = await requireContext();
  const seat = String(formData.get("preferredSeat") || "");
  const mode = String(formData.get("preferredFeedbackMode") || "");
  await (await profileService()).saveUserProfile(context, {
    displayNameAtTable: String(formData.get("displayNameAtTable") || "").trim() || undefined,
    preferredSeat: ["N", "E", "S", "W"].includes(seat) ? (seat as Seat) : undefined,
    preferredFeedbackMode: ["full_trace", "hints_only", "minimal"].includes(mode)
      ? (mode as "full_trace" | "hints_only" | "minimal")
      : undefined,
  });
  revalidatePath("/bridge/play");
}

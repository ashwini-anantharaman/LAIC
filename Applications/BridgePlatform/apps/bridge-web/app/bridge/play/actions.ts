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

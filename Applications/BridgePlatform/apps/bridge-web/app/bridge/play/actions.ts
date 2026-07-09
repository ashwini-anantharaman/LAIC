"use server";

import { defaultSettingValues } from "@bridge/config";
import { seededBoard } from "@bridge/engine";
import type { Seat } from "@bridge/events";
import { BEGINNER_NATURAL_PACKAGE_ID } from "@bridge/knowledge";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getBridgeContext } from "@/lib/nexus";
import { latestPublishedPackage, sessionService } from "@/lib/sessions";

async function requireContext() {
  const context = await getBridgeContext();
  if (!context) throw new Error("Not signed in");
  return context;
}

export async function createPracticeSession(formData: FormData) {
  const context = await requireContext();
  const seed = Number(formData.get("seed")) || 1;
  const humanSeat = formData.get("humanSeat") as Seat | "watch" | null;
  const pkg = await latestPublishedPackage(BEGINNER_NATURAL_PACKAGE_ID);
  const record = await sessionService().createSession({
    context,
    sessionType: "single_board",
    board: seededBoard(seed),
    pkg,
    resolvedValues: defaultSettingValues(pkg.settings),
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
  revalidatePath(`/bridge/play/${id}`);
}

export async function autoplaySession(formData: FormData) {
  const context = await requireContext();
  const id = String(formData.get("sessionId"));
  await sessionService().autoplay(id, context);
  revalidatePath(`/bridge/play/${id}`);
}

export async function undoSession(formData: FormData) {
  const context = await requireContext();
  const id = String(formData.get("sessionId"));
  await sessionService().undo(id, context);
  revalidatePath(`/bridge/play/${id}`);
}

export async function humanBid(formData: FormData) {
  const context = await requireContext();
  const id = String(formData.get("sessionId"));
  const seat = String(formData.get("seat")) as Seat;
  const call = String(formData.get("call"));
  await sessionService().applyExternalAction(id, context, seat, { kind: "bid", call });
  await sessionService().autoplay(id, context); // AI responds up to the next human turn
  revalidatePath(`/bridge/play/${id}`);
}

export async function humanPlay(formData: FormData) {
  const context = await requireContext();
  const id = String(formData.get("sessionId"));
  const seat = String(formData.get("seat")) as Seat;
  const cardId = String(formData.get("cardId"));
  await sessionService().applyExternalAction(id, context, seat, { kind: "play", cardId });
  await sessionService().autoplay(id, context);
  revalidatePath(`/bridge/play/${id}`);
}

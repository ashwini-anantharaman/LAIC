"use server";

// Table v2 server actions (Knowledge Rework §7). Humans act through the same
// single-writer controller as the AI; legality is enforced in the session
// service. Flagging a decision creates a suggestion in the KB's queue.

import type { Card, Seat, Suit } from "@bridge/events";
import { AwaitingHumanError, SessionService, type SeatConfig } from "@bridge/sessions";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireContext } from "@/lib/api";
import { audit } from "@/lib/audit";
import { ensureSeeds, kbService, kbStore } from "@/lib/kb";
import { sessionService } from "@/lib/sessions";

const SEATS: Seat[] = ["N", "E", "S", "W"];

export async function createSessionAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  await ensureSeeds();
  const kbId = String(formData.get("kbId"));
  const compiled = await kbService().liveCompile(kbId);
  if (!compiled) throw new Error("That knowledge base has no live compile yet");

  const store = kbStore();
  const humanSeat = String(formData.get("humanSeat") ?? "") as Seat | "";
  const seats = {} as Record<Seat, SeatConfig>;
  for (const seat of SEATS) {
    if (seat === humanSeat) {
      seats[seat] = { kind: "human", nexusUserId: context.nexusUserId };
      continue;
    }
    const playerId = String(formData.get(`player:${seat}`) ?? "");
    const player = playerId ? await store.getPlayer(playerId) : null;
    if (!player) throw new Error(`Pick a player for seat ${seat}`);
    seats[seat] = SessionService.seatFromPlayer(player, compiled);
  }

  const record = await sessionService().createSession({
    kbId,
    compiled,
    seats,
    seed: Number(formData.get("seed") ?? 1) || 1,
    createdBy: context.nexusUserId,
  });
  await audit(context, "profile.update", "kb_session", record.sessionId, {
    kbId,
    created: true,
  });
  redirect(`/bridge/table/${record.sessionId}`);
}

export async function stepAction(formData: FormData): Promise<void> {
  await requireContext();
  const sessionId = String(formData.get("sessionId"));
  try {
    await sessionService().step(sessionId);
  } catch (e) {
    // A stale double-click on a human turn is not an error page.
    if (!(e instanceof AwaitingHumanError)) throw e;
  }
  revalidatePath(`/bridge/table/${sessionId}`);
}

export async function playToEndAction(formData: FormData): Promise<void> {
  await requireContext();
  const sessionId = String(formData.get("sessionId"));
  const service = sessionService();
  let guard = 0;
  // Runs until complete or a human seat takes over.
  for (;;) {
    const view = await service.view(sessionId);
    if (view.state.phase === "complete" || view.actingIsHuman || guard++ > 400) break;
    await service.step(sessionId);
  }
  revalidatePath(`/bridge/table/${sessionId}`);
}

export async function bidAction(formData: FormData): Promise<void> {
  await requireContext();
  const sessionId = String(formData.get("sessionId"));
  await sessionService().act(sessionId, { call: String(formData.get("call")) });
  revalidatePath(`/bridge/table/${sessionId}`);
}

export async function playCardAction(formData: FormData): Promise<void> {
  await requireContext();
  const sessionId = String(formData.get("sessionId"));
  const card: Card = {
    suit: String(formData.get("suit")) as Suit,
    rank: Number(formData.get("rank")) as Card["rank"],
  };
  await sessionService().act(sessionId, { card });
  revalidatePath(`/bridge/table/${sessionId}`);
}

export async function undoAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  const sessionId = String(formData.get("sessionId"));
  await sessionService().undo(sessionId);
  await audit(context, "session.undo", "kb_session", sessionId);
  revalidatePath(`/bridge/table/${sessionId}`);
}

/** Flag a decision → a suggestion in the KB's queue (spec §7). */
export async function flagDecisionAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  const sessionId = String(formData.get("sessionId"));
  const record = await sessionService().requireSession(sessionId);
  const seq = Number(formData.get("seq"));
  const itemId = String(formData.get("itemId") ?? "").trim() || undefined;
  const text = String(formData.get("text") ?? "").trim() || "Flagged from the table.";
  const suggestion = await kbService().createSuggestion({
    kbId: record.kbId,
    itemId,
    sessionId,
    decisionSeq: seq,
    text,
    createdBy: context.nexusUserId,
  });
  await audit(context, "kb.suggestion.change", "kb_suggestion", suggestion.suggestionId, {
    kbId: record.kbId,
    fromTable: true,
  });
  revalidatePath(`/bridge/table/${sessionId}`);
}

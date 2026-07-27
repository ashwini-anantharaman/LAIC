"use server";

// Reproduce a detector finding live: re-deal the exact seeded board the
// self-play pass flagged, against the same knowledge set's house lineup, and
// open it at the table (paused — boards never self-start) so an expert can
// step the auction and watch the gap or anomaly happen.

import { seededDeal } from "@bridge/engine";
import { SEATS, type Seat } from "@bridge/events";
import { SessionService, type SeatConfig } from "@bridge/sessions";
import { redirect } from "next/navigation";
import { requireContext } from "@/lib/api";
import { assertAiAllowed, assertKbAllowed } from "@/lib/org";
import { kbService, kbStore } from "@/lib/kb";
import { sessionService } from "@/lib/sessions";

export async function dealFindingBoardAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  const kbId = String(formData.get("kbId"));
  const packId = String(formData.get("packId"));
  const dealSeed = Number(formData.get("dealSeed"));
  if (!Number.isFinite(dealSeed)) redirect(`/bridge/kb/${kbId}/findings`);
  await assertAiAllowed(context);
  await assertKbAllowed(context, kbId);

  const compiled = await kbService().liveCompile(kbId);
  if (!compiled) throw new Error("That knowledge base has no live compile yet");
  const pack = compiled.packs.find((p) => p.packId === packId);
  if (!pack) throw new Error("Pick a knowledge set");

  const { ensureHousePlayer } = await import("@/lib/arena");
  const house = await ensureHousePlayer(kbStore(), compiled, pack, context.nexusUserId);
  const ai = SessionService.seatFromPlayer(house, compiled);
  const seats = { N: ai, E: ai, S: ai, W: ai } as Record<Seat, SeatConfig>;
  seats.S = { kind: "human", nexusUserId: context.nexusUserId };

  // The detector's exact deal: seededDeal(dealSeed) with dealer SEATS[seed % 4]
  // (insights.ts's convention) — passing hands explicitly guarantees identity.
  const record = await sessionService().createSession({
    kbId,
    compiled,
    seats,
    seed: dealSeed,
    hands: seededDeal(dealSeed),
    dealer: SEATS[dealSeed % 4]!,
    vul: "none",
    boardName: `finding-${dealSeed}`,
    createdBy: context.nexusUserId,
  });
  redirect(`/bridge/table/${record.sessionId}`);
}

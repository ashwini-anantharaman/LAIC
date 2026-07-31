import { redirect } from "next/navigation";
import { SessionService, type SeatConfig } from "@bridge/sessions";
import type { Seat } from "@bridge/events";
import { audit } from "@/lib/audit";
import { ensureSeeds, kbService, kbStore } from "@/lib/kb";
import { getBridgeContext, nexusProgramIdOf, orgScopeOf } from "@/lib/nexus";
import { assertAiAllowed, assertKbAllowed } from "@/lib/org";
import { sessionService } from "@/lib/sessions";

/**
 * "New" from the app's Play tab: deal a fresh board immediately — you South
 * against house players of the strongest set that compiles — and open it. A
 * GET twin of quickPlayAction, because the caller is a link from the app
 * rather than a form on a bridge page (same reasoning as /m/play-entry).
 */
export default async function MobileQuickPlayPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ dealer?: string }> }>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  await ensureSeeds();
  await assertAiAllowed(context);

  const { dealer: dealerParam } = await searchParams;
  const SEATS: Seat[] = ["N", "E", "S", "W"];
  const dealer: Seat = SEATS.includes(dealerParam as Seat) ? (dealerParam as Seat) : "N";

  const { pickDefaultSet, ensureHousePlayer } = await import("@/lib/arena");
  const store = kbStore();
  for (const kb of (await store.listKbs()).filter((k) => !k.archived)) {
    const compiled = await kbService().liveCompile(kb.kbId);
    if (!compiled) continue;
    const pack = pickDefaultSet(compiled);
    if (!pack) continue;
    await assertKbAllowed(context, kb.kbId);
    const house = await ensureHousePlayer(store, compiled, pack, context.nexusUserId);
    const ai = SessionService.seatFromPlayer(house, compiled);
    const seats = { N: ai, E: ai, S: ai, W: ai } as Record<Seat, SeatConfig>;
    seats.S = { kind: "human", nexusUserId: context.nexusUserId };
    const record = await sessionService().createSession({
      kbId: kb.kbId,
      compiled,
      seats,
      seed: (Date.now() % 100_000) + 1,
      dealer,
      createdBy: context.nexusUserId,
      programOrganizationId: orgScopeOf(context),
      nexusProgramId: (await nexusProgramIdOf()) ?? undefined,
    });
    await audit(context, "profile.update", "kb_session", record.sessionId, {
      kbId: kb.kbId,
      quickPlay: true,
    });
    redirect(`/m/table/${record.sessionId}`);
  }
  // No knowledge base compiles — nothing to play against.
  redirect("/m/library");
}

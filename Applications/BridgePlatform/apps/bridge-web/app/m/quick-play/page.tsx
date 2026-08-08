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
    // A name a person can tell apart at a glance (owner request 2026-08-06):
    // the moment it was dealt, not the seed that dealt it. Five rows of
    // "seeded-38302" read as a lottery; "Aug 6 · 2:14 PM" reads as your
    // afternoon. The seed still deals the board — it just doesn't name it.
    // Named in the club's own timezone, not the server's: Vercel runs in UTC,
    // and "Aug 6 · 8:08 PM" for a board dealt at 1:08 PM reads as a glitch.
    const TZ = "America/Los_Angeles";
    const dealt = new Date();
    const boardName = `${dealt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TZ })} · ${dealt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ })}`;
    const record = await sessionService().createSession({
      kbId: kb.kbId,
      compiled,
      seats,
      seed: (Date.now() % 100_000) + 1,
      dealer,
      boardName,
      createdBy: context.nexusUserId,
      programOrganizationId: orgScopeOf(context),
      nexusProgramId: (await nexusProgramIdOf()) ?? undefined,
    });
    await audit(context, "profile.update", "kb_session", record.sessionId, {
      kbId: kb.kbId,
      quickPlay: true,
    });
    // Straight to the table page — /m/table/[id] is itself only a redirect
    // to this, and each hop is a separate serverless invocation the player
    // waits on (tester complaint 2026-08-08: the table is slow to open).
    redirect(`/bridge/table2/${record.sessionId}`);
  }
  // No knowledge base compiles — nothing to play against.
  redirect("/m/library");
}

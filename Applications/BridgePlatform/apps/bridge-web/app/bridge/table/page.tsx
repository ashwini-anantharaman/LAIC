import type { Seat } from "@bridge/events";
import { SessionService, type SeatConfig } from "@bridge/sessions";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureHousePlayer, pickDefaultSet } from "@/lib/arena";
import { ensureSeeds, kbService, kbStore } from "@/lib/kb";
import { getBridgeContext } from "@/lib/nexus";
import { sessionService } from "@/lib/sessions";

/**
 * Play (2026-07-17): hitting Play drops you straight onto a board. If you have
 * an unfinished board, you land back on it; otherwise a default board is dealt
 * immediately against house opponents. "Choose a table" is where you pick a
 * specific knowledge set or configure seats.
 */
export default async function PlayPage() {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  await ensureSeeds();

  // Resume the most recent unfinished board this player started.
  const recent = await sessionService().listRecent();
  const mine = recent.find(
    (s) => s.createdBy === context.nexusUserId && s.status === "active",
  );
  if (mine) redirect(`/bridge/table/${mine.sessionId}`);

  // Otherwise deal a fresh default board: strongest set of the first KB that
  // compiles, you South against three house players.
  const store = kbStore();
  for (const kb of (await store.listKbs()).filter((k) => !k.archived)) {
    const compiled = await kbService().liveCompile(kb.kbId);
    if (!compiled) continue;
    const pack = pickDefaultSet(compiled);
    if (!pack) continue;
    const house = await ensureHousePlayer(store, compiled, pack, context.nexusUserId);
    const ai = SessionService.seatFromPlayer(house, compiled);
    const seats = { N: ai, E: ai, S: ai, W: ai } as Record<Seat, SeatConfig>;
    seats.S = { kind: "human", nexusUserId: context.nexusUserId };
    const record = await sessionService().createSession({
      kbId: kb.kbId,
      compiled,
      seats,
      seed: (Date.now() % 100_000) + 1,
      createdBy: context.nexusUserId,
    });
    redirect(`/bridge/table/${record.sessionId}`);
  }

  // Nothing compiles yet — there's no board to deal.
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.3em] text-neutral-400">Play</p>
        <h1 className="mt-1 text-3xl font-medium">Nothing to play yet</h1>
      </header>
      <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
        No knowledge base compiles yet.{" "}
        <Link href="/bridge/kb" className="text-emerald-700 underline-offset-4 hover:underline">
          Build one in the workspace
        </Link>{" "}
        — upload a system document and its knowledge sets appear here.
      </p>
    </div>
  );
}

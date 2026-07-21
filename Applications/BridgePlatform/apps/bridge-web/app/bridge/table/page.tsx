import Link from "next/link";
import { redirect } from "next/navigation";
import { pickDefaultSet } from "@/lib/arena";
import { ensureSeeds, kbService, kbStore } from "@/lib/kb";
import { getBridgeContext } from "@/lib/nexus";
import { sessionService } from "@/lib/sessions";
import { quickPlayAction } from "./actions";

/**
 * Play (2026-07-21 rework): a landing with two doors instead of an
 * auto-dealt board. QUICKPLAY starts immediately — resume your unfinished
 * board or deal a fresh one against the house lineup. CUSTOMIZE opens the
 * table builder: pick the players, the seats, the knowledge set, or start
 * from a saved board in the library.
 */
export default async function PlayPage() {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  await ensureSeeds();

  // Hidden KBs are hidden here too: their boards neither resume nor deal.
  const store = kbStore();
  const kbs = await store.listKbs();
  const archived = new Set(kbs.filter((k) => k.archived).map((k) => k.kbId));

  // An unfinished board this player started becomes the resume card.
  const recent = await sessionService().listRecent();
  const unfinished = recent.find(
    (s) =>
      s.createdBy === context.nexusUserId &&
      s.status === "active" &&
      !archived.has(s.kbId),
  );

  // Anything to deal at all? (Same walk Quickplay makes, minus the session.)
  let dealable = false;
  for (const kb of kbs.filter((k) => !k.archived)) {
    const compiled = await kbService().liveCompile(kb.kbId);
    if (compiled && pickDefaultSet(compiled)) {
      dealable = true;
      break;
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.3em] text-neutral-400">Play</p>
        <h1 className="mt-1 text-3xl font-medium">Take a seat</h1>
        <p className="mt-2 max-w-xl text-sm text-neutral-600">
          Quickplay puts you straight on a board against the house lineup. Customize lets you
          choose the players, the table, and the board.
        </p>
      </header>

      {!dealable && !unfinished ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          No knowledge base compiles yet.{" "}
          <Link href="/bridge/kb" className="text-emerald-700 underline-offset-4 hover:underline">
            Build one in the workspace
          </Link>{" "}
          — upload a system document and its knowledge sets appear here.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <section className="flex flex-col rounded-xl border border-neutral-200 bg-[var(--card)] p-6">
            <h2 className="font-serif text-xl font-medium">Quickplay</h2>
            <p className="mt-2 flex-1 text-sm text-neutral-600">
              {unfinished
                ? "You have a board in progress — pick it up where you left off, or deal a fresh one."
                : "A fresh board, dealt now: you sit South against three house players carrying the strongest knowledge set."}
            </p>
            <div className="mt-4 space-y-2">
              {unfinished && (
                <Link
                  href={`/bridge/table/${unfinished.sessionId}`}
                  className="block w-full rounded bg-emerald-700 px-4 py-2 text-center text-sm font-medium text-white hover:bg-emerald-800"
                >
                  Resume {unfinished.board.name}
                </Link>
              )}
              {dealable && (
                <form action={quickPlayAction}>
                  <button
                    type="submit"
                    className={
                      unfinished
                        ? "w-full rounded border border-neutral-300 px-4 py-2 text-sm hover:border-emerald-400"
                        : "w-full rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
                    }
                  >
                    {unfinished ? "Deal a fresh board" : "Quickplay"}
                  </button>
                </form>
              )}
            </div>
          </section>

          <section className="flex flex-col rounded-xl border border-neutral-200 bg-[var(--card)] p-6">
            <h2 className="font-serif text-xl font-medium">Customize</h2>
            <p className="mt-2 flex-1 text-sm text-neutral-600">
              Choose who sits where — any player from any knowledge base — set the deal seed,
              start from a saved board in the library, or drill an incomplete player on a safe
              deal.
            </p>
            <div className="mt-4">
              <Link
                href="/bridge/table/choose"
                className="block w-full rounded border border-neutral-300 px-4 py-2 text-center text-sm font-medium hover:border-emerald-500 hover:bg-emerald-50"
              >
                Set up a table
              </Link>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

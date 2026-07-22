import Link from "next/link";
import { redirect } from "next/navigation";
import { pickDefaultSet } from "@/lib/arena";
import { ensureSeeds, kbService, kbStore } from "@/lib/kb";
import { getBridgeContext } from "@/lib/nexus";
import { libraryStore, sessionService } from "@/lib/sessions";
import { resumePlayEntryAction } from "../library/actions";
import { quickPlayAction } from "./actions";

/**
 * Play (2026-07-22 rework, R16): a landing with two doors instead of an
 * auto-dealt board. QUICKPLAY starts immediately — resume any of your
 * unfinished boards, resume a saved play from the library, or deal a fresh
 * one against the house lineup. CUSTOMIZE opens the table builder: pick the
 * players seat by seat, save the lineup, or start from a saved table.
 */
export default async function PlayPage() {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  await ensureSeeds();

  // Hidden KBs are hidden here too: their boards neither resume nor deal.
  const store = kbStore();
  const kbs = await store.listKbs();
  const archived = new Set(kbs.filter((k) => k.archived).map((k) => k.kbId));

  // Unfinished boards this player started become the resume affordance.
  const recent = await sessionService().listRecent();
  const actives = recent
    .filter(
      (s) =>
        s.createdBy === context.nexusUserId &&
        s.status === "active" &&
        !archived.has(s.kbId),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 8);

  // Saved plays from the library resume onto a fresh table.
  let plays: Awaited<ReturnType<ReturnType<typeof libraryStore>["listEntries"]>> = [];
  try {
    plays = (await libraryStore().listEntries("play")).slice(0, 8);
  } catch {
    // Library storage not migrated yet (0015) — the dropdown just hides.
  }

  // Anything to deal at all? (Same walk Quickplay makes, minus the session.)
  let dealable = false;
  for (const kb of kbs.filter((k) => !k.archived)) {
    const compiled = await kbService().liveCompile(kb.kbId);
    if (compiled && pickDefaultSet(compiled)) {
      dealable = true;
      break;
    }
  }

  const resumable = actives.length > 0 || plays.length > 0;
  const single = actives.length === 1 ? actives[0] : undefined;

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

      {!dealable && !resumable ? (
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
              {resumable
                ? "Pick up a board or a saved play where you left off, or deal a fresh one."
                : "A fresh board, dealt now: you sit South against three house players carrying the strongest knowledge set."}
            </p>
            <div className="mt-4 space-y-2">
              {single && (
                <Link
                  href={`/bridge/table/${single.sessionId}`}
                  className="block w-full rounded bg-emerald-700 px-4 py-2 text-center text-sm font-medium text-white hover:bg-emerald-800"
                >
                  Resume {single.board.name}
                </Link>
              )}
              {actives.length > 1 && (
                <details className="relative">
                  <summary className="block w-full cursor-pointer rounded bg-emerald-700 px-4 py-2 text-center text-sm font-medium text-white hover:bg-emerald-800">
                    Resume board ▾ ({actives.length} in progress)
                  </summary>
                  <div className="absolute left-0 right-0 z-10 mt-1 rounded-lg border border-neutral-200 bg-[var(--card)] p-1 shadow-lg">
                    {actives.map((s) => (
                      <Link
                        key={s.sessionId}
                        href={`/bridge/table/${s.sessionId}`}
                        className="flex items-baseline gap-3 rounded px-3 py-1.5 text-sm hover:bg-emerald-50"
                      >
                        <span className="font-medium">{s.board.name}</span>
                        <span className="ml-auto text-xs text-neutral-400">
                          {s.updatedAt.slice(5, 16).replace("T", " ")}
                        </span>
                      </Link>
                    ))}
                  </div>
                </details>
              )}
              {plays.length > 0 && (
                <details className="relative">
                  <summary className="block w-full cursor-pointer rounded border border-neutral-300 px-4 py-2 text-center text-sm hover:border-emerald-400">
                    Resume play ▾
                  </summary>
                  <div className="absolute left-0 right-0 z-10 mt-1 rounded-lg border border-neutral-200 bg-[var(--card)] p-1 shadow-lg">
                    {plays.map((p) => (
                      <form key={p.entryId} action={resumePlayEntryAction}>
                        <input type="hidden" name="entryId" value={p.entryId} />
                        <button
                          type="submit"
                          className="flex w-full items-baseline gap-3 rounded px-3 py-1.5 text-left text-sm hover:bg-emerald-50"
                        >
                          <span className="font-medium">{p.name}</span>
                          {p.resultLabel && (
                            <span className="ml-auto text-xs text-neutral-400">
                              {p.resultLabel}
                            </span>
                          )}
                        </button>
                      </form>
                    ))}
                  </div>
                </details>
              )}
              {dealable && (
                <form action={quickPlayAction}>
                  <button
                    type="submit"
                    className={
                      resumable
                        ? "w-full rounded border border-neutral-300 px-4 py-2 text-sm hover:border-emerald-400"
                        : "w-full rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
                    }
                  >
                    {resumable ? "Deal a fresh board" : "Quickplay"}
                  </button>
                </form>
              )}
            </div>
          </section>

          <section className="flex flex-col rounded-xl border border-neutral-200 bg-[var(--card)] p-6">
            <h2 className="font-serif text-xl font-medium">Customize</h2>
            <p className="mt-2 flex-1 text-sm text-neutral-600">
              Build a table seat by seat — any player from any knowledge base, your seat, the
              deal seed — and save lineups you like to the library to start them again anytime.
            </p>
            <div className="mt-4 space-y-2">
              <Link
                href="/bridge/library/tables/new"
                className="block w-full rounded border border-neutral-300 px-4 py-2 text-center text-sm font-medium hover:border-emerald-500 hover:bg-emerald-50"
              >
                Set up a table
              </Link>
              <Link
                href="/bridge/library?kind=table"
                className="block w-full rounded px-4 py-2 text-center text-sm text-emerald-700 underline-offset-4 hover:underline"
              >
                Saved tables →
              </Link>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

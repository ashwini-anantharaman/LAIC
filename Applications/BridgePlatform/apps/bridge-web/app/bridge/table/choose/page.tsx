import { playerIsValid, validatePlayerStatic } from "@bridge/kb";
import Link from "next/link";
import { redirect } from "next/navigation";
import { arenaSets, HOUSE_PREFIX } from "@/lib/arena";
import { ensureSeeds, kbService, kbStore } from "@/lib/kb";
import { getBridgeContext } from "@/lib/nexus";
import { libraryStore, sessionService } from "@/lib/sessions";
import { arenaPlayAction, createDrillAction, createSessionAction } from "../actions";

const SEATS = ["N", "E", "S", "W"] as const;

/** Customize a table (2026-07-21): the full menu of who to play against —
 *  knowledge sets, seat-by-seat player choice, saved boards from the
 *  library, drills. Quickplay (on the Play page) is the no-questions door. */
export default async function ChooseTablePage() {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  await ensureSeeds();

  const store = kbStore();
  const kbs = (await store.listKbs()).filter((k) => !k.archived);
  const visibleKbIds = new Set(kbs.map((k) => k.kbId));
  const sessions = (await sessionService().listRecent()).filter((s) => visibleKbIds.has(s.kbId)).slice(0, 6);
  let boards: Awaited<ReturnType<ReturnType<typeof libraryStore>["listEntries"]>> = [];
  try {
    boards = (await libraryStore().listEntries("board")).slice(0, 4);
  } catch {
    // Library storage not migrated yet (0015) — the strip just hides.
  }

  const arenas = [];
  for (const kb of kbs) {
    const compiled = await kbService().liveCompile(kb.kbId);
    if (!compiled) continue;
    const players = await store.listPlayersForKb(kb.kbId);
    const houseByName = new Map(
      players.filter((p) => p.name.startsWith(HOUSE_PREFIX)).map((p) => [p.name, p]),
    );
    const valid = players.filter((p) => playerIsValid(validatePlayerStatic(compiled, p)));
    arenas.push({ kb, compiled, sets: arenaSets(compiled), players, valid, houseByName });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.3em] text-neutral-400">Play</p>
        <h1 className="mt-1 text-3xl font-medium">Customize a table</h1>
        <p className="mt-2 max-w-xl text-sm text-neutral-600">
          Pick a knowledge set to play against — house players are provisioned for you, and
          every decision they make at the table stays traceable. Or configure{" "}
          <a href="#custom" className="text-emerald-700 underline-offset-4 hover:underline">
            every seat yourself
          </a>
          . In a hurry?{" "}
          <Link href="/bridge/table" className="text-emerald-700 underline-offset-4 hover:underline">
            Quickplay
          </Link>{" "}
          deals instantly.
        </p>
      </header>

      {arenas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          No knowledge base compiles yet.{" "}
          <Link href="/bridge/kb" className="text-emerald-700 underline-offset-4 hover:underline">
            Build one in the workspace
          </Link>{" "}
          — upload a system document and its knowledge sets appear here.
        </p>
      ) : (
        arenas.map(({ kb, sets, houseByName }) => (
          <section key={kb.kbId} className="mb-8">
            <h2 className="mb-3 font-serif text-lg font-medium">{kb.name}</h2>
            {sets.length === 0 ? (
              <p className="rounded-lg border border-dashed border-neutral-300 p-5 text-sm text-neutral-500">
                This knowledge base has no knowledge sets yet —{" "}
                <Link
                  href={`/bridge/kb/${kb.kbId}/sets`}
                  className="text-emerald-700 underline-offset-4 hover:underline"
                >
                  create one
                </Link>{" "}
                to unlock the arena.
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {sets.map((pack) => {
                  const house = houseByName.get(`${HOUSE_PREFIX}${pack.name}`);
                  return (
                    <li
                      key={pack.packId}
                      className="flex flex-col rounded-lg border border-neutral-200 bg-[var(--card)] p-4"
                    >
                      <p className="font-medium">{pack.name}</p>
                      <p className="mt-1 flex-1 text-xs text-neutral-500">
                        {pack.itemIds.length} knowledge items
                        {house ? (
                          <>
                            {" · "}
                            <Link
                              href={`/bridge/kb/${kb.kbId}/players/${house.playerId}`}
                              className="underline-offset-2 hover:underline"
                            >
                              edit house player
                            </Link>
                          </>
                        ) : (
                          " · house player provisioned on first play"
                        )}
                      </p>
                      <div className="mt-3 flex gap-2">
                        <form action={arenaPlayAction} className="flex-1">
                          <input type="hidden" name="kbId" value={kb.kbId} />
                          <input type="hidden" name="packId" value={pack.packId} />
                          <button
                            type="submit"
                            className="w-full rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
                          >
                            Play
                          </button>
                        </form>
                        <form action={arenaPlayAction}>
                          <input type="hidden" name="kbId" value={kb.kbId} />
                          <input type="hidden" name="packId" value={pack.packId} />
                          <input type="hidden" name="watch" value="1" />
                          <button
                            type="submit"
                            className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:border-emerald-400"
                            title="Four house players, you observe"
                          >
                            Watch
                          </button>
                        </form>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))
      )}

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
          From the library
        </h2>
        <ul className="flex flex-wrap gap-2">
          {boards.map((b) => (
            <li key={b.entryId}>
              <Link
                href={`/bridge/library/${b.entryId}`}
                className="inline-block rounded-full border border-neutral-300 px-3 py-1 text-xs text-neutral-600 hover:border-emerald-500"
              >
                {b.name}
              </Link>
            </li>
          ))}
          <li>
            <Link
              href="/bridge/library"
              className="inline-block rounded-full px-3 py-1 text-xs text-emerald-700 underline-offset-4 hover:underline"
            >
              all saved boards →
            </Link>
          </li>
          <li>
            <Link
              href="/bridge/library/new"
              className="inline-block rounded-full px-3 py-1 text-xs text-emerald-700 underline-offset-4 hover:underline"
            >
              author or import a board →
            </Link>
          </li>
        </ul>
      </section>

      {sessions.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
            Recent boards
          </h2>
          <ul className="space-y-1">
            {sessions.map((s) => (
              <li key={s.sessionId}>
                <Link
                  href={`/bridge/table/${s.sessionId}`}
                  className="flex items-baseline gap-3 rounded border border-neutral-200 bg-[var(--card)] px-3 py-2 text-sm hover:border-emerald-400"
                >
                  <span className="font-medium">{s.board.name}</span>
                  <span className="text-xs text-neutral-500">
                    {s.status}
                    {s.forkedFromSessionId && " · fork"}
                  </span>
                  <span className="ml-auto text-xs text-neutral-400">
                    {s.createdAt.slice(5, 16).replace("T", " ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Full control, tucked away */}
      {arenas.length > 0 && (
        <details id="custom" className="rounded-lg border border-neutral-200">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-neutral-600 hover:text-neutral-900">
            Set up a custom table
          </summary>
          <div className="border-t border-[var(--line)] px-4 py-4">
            {arenas.map(({ kb, players }) => (
              <div key={kb.kbId} data-kb-block={kb.name} className="mb-6 last:mb-0">
                <h3 className="mb-2 font-serif text-base font-medium">{kb.name}</h3>
                <form action={createSessionAction} className="space-y-3">
                  <input type="hidden" name="kbId" value={kb.kbId} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">
                      <span className="mb-1 block text-xs text-neutral-500">Your seat</span>
                      <select
                        name="humanSeat"
                        className="w-full rounded border border-neutral-300 px-2 py-1.5"
                      >
                        <option value="">none — watch four AIs</option>
                        {SEATS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block text-xs text-neutral-500">Deal seed</span>
                      <input
                        name="seed"
                        type="number"
                        defaultValue={7}
                        className="w-full rounded border border-neutral-300 px-2 py-1.5"
                      />
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-4">
                    {SEATS.map((seat) => (
                      <label key={seat} className="text-sm">
                        <span className="mb-1 block text-xs text-neutral-500">Seat {seat}</span>
                        <select
                          name={`player:${seat}`}
                          className="w-full rounded border border-neutral-300 px-2 py-1.5"
                          defaultValue={players[0]?.playerId ?? ""}
                        >
                          {players.map((p) => (
                            <option key={p.playerId} value={p.playerId}>
                              {p.name} {p.validationStatus === "invalid" ? "(incomplete)" : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  <button
                    type="submit"
                    className="rounded bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
                    disabled={players.length === 0}
                  >
                    Deal a board
                  </button>
                </form>

                <form action={createDrillAction} className="mt-4 border-t border-[var(--line)] pt-4">
                  <p className="mb-1 text-sm font-medium">Constrained drill</p>
                  <p className="mb-2 text-xs text-neutral-500">
                    For incomplete players: the dealer only accepts a deal when a full simulation
                    with these exact configs finishes with zero engine-floor events.
                  </p>
                  <div className="flex flex-wrap items-end gap-3">
                    <input type="hidden" name="kbId" value={kb.kbId} />
                    <label className="text-sm">
                      <span className="mb-1 block text-xs text-neutral-500">
                        Drill player (all four seats)
                      </span>
                      <select name="playerId" className="rounded border border-neutral-300 px-2 py-1.5">
                        {players.map((p) => (
                          <option key={p.playerId} value={p.playerId}>
                            {p.name} {p.validationStatus === "invalid" ? "(incomplete)" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block text-xs text-neutral-500">Your seat (optional)</span>
                      <select name="humanSeat" className="rounded border border-neutral-300 px-2 py-1.5">
                        <option value="">none</option>
                        {SEATS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block text-xs text-neutral-500">Search from seed</span>
                      <input
                        name="seed"
                        type="number"
                        defaultValue={1}
                        className="w-24 rounded border border-neutral-300 px-2 py-1.5"
                      />
                    </label>
                    <button
                      type="submit"
                      className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:border-emerald-400"
                      disabled={players.length === 0}
                    >
                      Find a safe deal
                    </button>
                  </div>
                </form>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

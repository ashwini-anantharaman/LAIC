import { playerIsValid, validatePlayerStatic } from "@bridge/kb";
import Link from "next/link";
import { redirect } from "next/navigation";
import { arenaSets, HOUSE_PREFIX } from "@/lib/arena";
import { ensureSeeds, kbService, kbStore } from "@/lib/kb";
import { getBridgeContext } from "@/lib/nexus";
import { arenaPlayAction, createDrillAction, createSessionAction } from "../../../table/actions";
import { createTableEntryAction } from "./actions";

const SEATS = ["N", "E", "S", "W"] as const;

/** New table (2026-07-22, moved from /bridge/table/choose): the full menu of
 *  who to play against — knowledge sets, seat-by-seat player choice, drills —
 *  with the option to save a lineup back into the library. Quickplay (on the
 *  Play page) is the no-questions door. */
export default async function NewTablePage() {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  await ensureSeeds();

  const store = kbStore();
  const kbs = (await store.listKbs()).filter((k) => !k.archived);

  // All KBs fetch in parallel (compile + roster per KB, skipping KBs that
  // never compiled without touching their artifacts).
  const arenas = (
    await Promise.all(
      kbs
        .filter((kb) => kb.liveCompileId)
        .map(async (kb) => {
          const [compiled, players] = await Promise.all([
            kbService().liveCompile(kb.kbId),
            store.listPlayersForKb(kb.kbId),
          ]);
          if (!compiled) return null;
          const houseByName = new Map(
            players.filter((p) => p.name.startsWith(HOUSE_PREFIX)).map((p) => [p.name, p]),
          );
          const valid = players.filter((p) => playerIsValid(validatePlayerStatic(compiled, p)));
          return { kb, compiled, sets: arenaSets(compiled), players, valid, houseByName };
        }),
    )
  ).filter((a) => a !== null);

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.3em] text-neutral-400">
          Library / new table
        </p>
        <h1 className="mt-1 text-3xl font-medium">New table</h1>
        <p className="mt-2 max-w-xl text-sm text-neutral-600">
          Pick a knowledge set to play against right away — house players are provisioned for
          you, and every decision they make at the table stays traceable. Or set up{" "}
          <a href="#custom" className="text-emerald-700 underline-offset-4 hover:underline">
            every seat yourself
          </a>{" "}
          and, if the lineup is a keeper, save it to the library to start it again anytime.
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
                      <span className="mb-1 block text-xs text-neutral-500">
                        Table name (for saving)
                      </span>
                      <input
                        name="name"
                        placeholder={`${kb.name} lineup`}
                        className="w-full rounded border border-neutral-300 px-2 py-1.5"
                      />
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block text-xs text-neutral-500">Notes (optional)</span>
                      <textarea
                        name="notes"
                        rows={2}
                        className="w-full rounded border border-neutral-300 px-2 py-1.5"
                      />
                    </label>
                  </div>
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
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="rounded bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
                      disabled={players.length === 0}
                    >
                      Deal a board
                    </button>
                    <button
                      type="submit"
                      formAction={createTableEntryAction}
                      className="rounded border border-neutral-300 px-4 py-1.5 text-sm hover:border-emerald-400"
                      disabled={players.length === 0}
                    >
                      Save lineup to library
                    </button>
                  </div>
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

import { playerIsValid, validatePlayerStatic } from "@bridge/kb";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureSeeds, kbService, kbStore } from "@/lib/kb";
import { getBridgeContext } from "@/lib/nexus";
import { sessionService } from "@/lib/sessions";
import { createSessionAction } from "./actions";

const SEATS = ["N", "E", "S", "W"] as const;

/** Table lobby: start a session from a KB's players, or resume one. */
export default async function TablePage() {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  await ensureSeeds();

  const store = kbStore();
  const kbs = await store.listKbs();
  const sessions = (await sessionService().listRecent()).slice(0, 8);

  // Pick the first KB with a live compile + valid players as the default form.
  const candidates = [];
  for (const kb of kbs) {
    const compiled = await kbService().liveCompile(kb.kbId);
    if (!compiled) continue;
    const players = await store.listPlayersForKb(kb.kbId);
    const valid = players.filter((p) =>
      playerIsValid(validatePlayerStatic(compiled, p)),
    );
    candidates.push({ kb, players, valid });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.3em] text-neutral-400">Table</p>
        <h1 className="mt-1 text-3xl font-medium">Play a board</h1>
        <p className="mt-2 max-w-xl text-sm text-neutral-600">
          Seats are filled by players assembled from a knowledge base. Every AI
          decision at the table traces to the rule, the item, and the source
          that produced it.
        </p>
      </header>

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
                    {s.status} · compile v{s.compileRef.version}
                    {s.forkedFromSessionId && " · fork"}
                  </span>
                  <span className="ml-auto text-xs text-neutral-400">
                    {s.createdAt.slice(0, 16).replace("T", " ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {candidates.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          No knowledge base has players yet.{" "}
          <Link href="/bridge/kb" className="text-emerald-700 underline-offset-4 hover:underline">
            Build one in the workspace
          </Link>{" "}
          — the wizard suggests a minimal complete player in one click.
        </p>
      ) : (
        candidates.map(({ kb, players }) => (
          <section key={kb.kbId} className="mb-6 rounded-lg border border-neutral-200 p-5">
            <h2 className="font-serif text-lg font-medium">{kb.name}</h2>
            <form action={createSessionAction} className="mt-3 space-y-3">
              <input type="hidden" name="kbId" value={kb.kbId} />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block text-xs text-neutral-500">Your seat</span>
                  <select name="humanSeat" className="w-full rounded border border-neutral-300 px-2 py-1.5">
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
              <p className="text-xs text-neutral-400">
                Ignored for the seat you take yourself. Incomplete players belong in constrained
                drills — at a free table they may hit the engine floor, and the trace will say so
                honestly.
              </p>
              <button
                type="submit"
                className="rounded bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
                disabled={players.length === 0}
              >
                Deal a board
              </button>
            </form>
          </section>
        ))
      )}
    </div>
  );
}

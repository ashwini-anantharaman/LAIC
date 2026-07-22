import { callLabel, rankLabel, type Seat, type Suit } from "@bridge/events";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { HandDiagram } from "@/components/library/HandDiagram";
import { getBridgeContext } from "@/lib/nexus";
import { libraryStore } from "@/lib/sessions";
import {
  deleteEntryAction,
  playEntryAction,
  resumePlayEntryAction,
  startTableEntryAction,
} from "../actions";

const GLYPH: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const red = (s: Suit) => s === "H" || s === "D";

export default async function LibraryEntryPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ entryId: string }>;
  searchParams: Promise<{ error?: string }>;
}>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  const { entryId } = await params;
  const { error } = await searchParams;
  const entry = await libraryStore().getEntry(entryId);
  if (!entry) notFound();

  const auctionRows: (typeof entry.auction)[] = [];
  if (entry.auction?.length && entry.dealer) {
    const order: Seat[] = ["W", "N", "E", "S"];
    const offset = order.indexOf(entry.dealer);
    const padded = [...Array.from({ length: offset }, () => null), ...entry.auction];
    for (let i = 0; i < padded.length; i += 4) auctionRows.push(padded.slice(i, i + 4) as never);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <p className="mb-2 text-xs text-neutral-400">
        <Link href={`/bridge/library?kind=${entry.kind}`} className="hover:underline">
          Library
        </Link>{" "}
        / {entry.kind}
      </p>
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-medium">{entry.name}</h1>
        <span className="rounded-full border border-neutral-300 px-2.5 py-0.5 text-xs uppercase tracking-wide text-neutral-500">
          {entry.kind}
        </span>
        <span className="text-xs text-neutral-400">
          {entry.origin}
          {entry.importFileName && ` · ${entry.importFileName}`} · {entry.createdAt.slice(0, 10)}
        </span>
        <span className="ml-auto flex gap-2">
          {entry.kind === "table" ? (
            <form action={startTableEntryAction}>
              <input type="hidden" name="entryId" value={entry.entryId} />
              <button
                type="submit"
                className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
              >
                Start · fresh deal
              </button>
            </form>
          ) : (
            entry.hands && (
              <form action={entry.kind === "play" ? resumePlayEntryAction : playEntryAction}>
                <input type="hidden" name="entryId" value={entry.entryId} />
                <button
                  type="submit"
                  className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
                >
                  {entry.kind === "play" ? "Resume" : "Play"}
                </button>
              </form>
            )
          )}
          <form action={deleteEntryAction}>
            <input type="hidden" name="entryId" value={entry.entryId} />
            <button
              type="submit"
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-500 hover:border-red-300 hover:text-red-700"
            >
              Delete
            </button>
          </form>
        </span>
      </header>

      {error && (
        <p className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {entry.notes && <p className="mb-4 text-sm text-neutral-600">{entry.notes}</p>}

      <div className="grid gap-8 sm:grid-cols-[auto_1fr]">
        {entry.hands && (
          <section>
            <HandDiagram
              hands={entry.hands}
              center={
                <span>
                  {entry.dealer && (
                    <>
                      dealer {entry.dealer}
                      <br />
                    </>
                  )}
                  {entry.vul && `vul ${entry.vul}`}
                </span>
              }
            />
          </section>
        )}

        <div className="space-y-6">
          {entry.kind === "table" && entry.seats && (
            <section>
              <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
                Lineup
              </h2>
              <ul className="space-y-1 text-sm">
                {(["N", "E", "S", "W"] as Seat[]).map((seat) => (
                  <li key={seat}>
                    <span className="mr-2 inline-block w-4 font-medium">{seat}</span>
                    {entry.seats![seat].human ? "you" : entry.seats![seat].label}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {auctionRows.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
                Auction {entry.contractLabel && <span className="ml-2 normal-case text-neutral-400">→ {entry.contractLabel}</span>}
              </h2>
              <table className="w-full max-w-xs text-center text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-neutral-400">
                    {["W", "N", "E", "S"].map((s) => (
                      <th key={s} className="font-normal">
                        {s}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {auctionRows.map((row, i) => (
                    <tr key={i}>
                      {[0, 1, 2, 3].map((j) => (
                        <td key={j} className="py-0.5">
                          {row?.[j] ? callLabel(row[j]!.call) : ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {(entry.play?.length ?? 0) > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
                Play {entry.resultLabel && <span className="ml-2 normal-case text-neutral-400">→ {entry.resultLabel}</span>}
              </h2>
              <ol className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-sm sm:grid-cols-4">
                {entry.play!.map((p, i) => (
                  <li key={i} className="tabular-nums">
                    <span className="mr-1.5 text-[10px] text-neutral-400">{i + 1}.</span>
                    <span className="mr-1 font-medium">{p.seat}</span>
                    <span className={red(p.card.suit) ? "text-[var(--madder)]" : ""}>
                      {rankLabel(p.card.rank)}
                      {GLYPH[p.card.suit]}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

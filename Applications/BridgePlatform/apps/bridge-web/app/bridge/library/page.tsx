import type { LibraryEntry, LibraryKind } from "@bridge/sessions";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ChipRow } from "@/components/ChipTabs";
import { getBridgeContext } from "@/lib/nexus";
import { libraryStore } from "@/lib/sessions";
import { importFileAction, playEntryAction, startTableEntryAction } from "./actions";
import { ImportForm } from "@/components/library/ImportForm";

/** The fellows' library (2026-07-16 rework): saved deals, boards, table
 *  lineups and plays; drills & puzzles are reserved shelves. */
const SHELVES: { kind: LibraryKind; label: string; hint: string; reserved?: boolean }[] = [
  { kind: "deal", label: "Deals", hint: "a card distribution" },
  { kind: "board", label: "Boards", hint: "deal + dealer + vulnerability" },
  { kind: "table", label: "Tables", hint: "a saved seat lineup" },
  { kind: "play", label: "Plays", hint: "board + calls + cards, as recorded" },
  { kind: "drill", label: "Drills", hint: "reserved", reserved: true },
  { kind: "puzzle", label: "Puzzles", hint: "reserved", reserved: true },
];

export default async function LibraryPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ kind?: string; imported?: string; error?: string }>;
}>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  const params = await searchParams;
  const active = (SHELVES.find((s) => s.kind === params.kind) ?? SHELVES[1]!).kind;

  const lib = libraryStore();
  let all: LibraryEntry[] = [];
  let storeMissing = false;
  try {
    all = await lib.listEntries();
  } catch {
    storeMissing = true; // 0015 not applied yet on this backend
  }
  const byKind = new Map<LibraryKind, LibraryEntry[]>();
  for (const s of SHELVES) byKind.set(s.kind, []);
  for (const e of all) byKind.get(e.kind)?.push(e);
  const entries = byKind.get(active) ?? [];
  const shelf = SHELVES.find((s) => s.kind === active)!;

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-neutral-400">Library</p>
          <h1 className="mt-1 text-3xl font-medium">Worth keeping</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Snapshots you save from the table, or import as LIN / PBN.
          </p>
        </div>
        <ImportForm action={importFileAction} />
      </header>

      {params.imported && (
        <p className="mb-4 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Imported {params.imported} board{params.imported === "1" ? "" : "s"}.
        </p>
      )}
      {params.error && (
        <p className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {params.error}
        </p>
      )}
      {storeMissing && (
        <p className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          The library&apos;s database table isn&apos;t provisioned yet — apply migration
          0015_library.sql to this backend and reload.
        </p>
      )}

      <ChipRow
        tabs={SHELVES.map((s) => ({
          label: s.label,
          href: `/bridge/library?kind=${s.kind}`,
          active: s.kind === active,
          count: byKind.get(s.kind)?.length ?? 0,
        }))}
      />
      <p className="mt-2 text-xs text-neutral-400">
        {shelf.label} — {shelf.hint}.
      </p>

      {shelf.reserved ? (
        <section className="mt-6 rounded-lg border border-dashed border-neutral-300 p-8 text-center">
          <p className="font-serif text-lg text-neutral-600">This shelf is reserved.</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-500">
            {shelf.label} will live here — curated exercises built on saved boards. Nothing to
            configure yet.
          </p>
        </section>
      ) : (
        <ul className="mt-6 space-y-2">
          {entries.map((e) => (
            <li
              key={e.entryId}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-neutral-200 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/bridge/library/${e.entryId}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {e.name}
                </Link>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {e.kind === "table"
                    ? `lineup · ${Object.values(e.seats ?? {})
                        .map((s) => s.label)
                        .join(", ")}`
                    : [
                        e.dealer && `dealer ${e.dealer}`,
                        e.vul && `vul ${e.vul}`,
                        e.auction?.length ? `${e.auction.length} calls` : null,
                        e.play?.length ? `${e.play.length} cards` : null,
                        e.contractLabel,
                        e.resultLabel,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "deal only"}
                </p>
                <p className="mt-0.5 text-[11px] text-neutral-400">
                  {e.origin}
                  {e.importFileName && ` · ${e.importFileName}`}
                  {e.sourceSessionId && (
                    <>
                      {" · "}
                      <Link
                        href={`/bridge/table/${e.sourceSessionId}`}
                        className="underline-offset-2 hover:underline"
                      >
                        source board
                      </Link>
                    </>
                  )}
                  {" · "}
                  {e.createdAt.slice(0, 10)}
                </p>
              </div>
              {e.kind === "table" ? (
                <form action={startTableEntryAction}>
                  <input type="hidden" name="entryId" value={e.entryId} />
                  <button
                    type="submit"
                    className="rounded bg-emerald-700 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-800"
                  >
                    Start · fresh deal
                  </button>
                </form>
              ) : (
                e.hands && (
                  <form action={playEntryAction}>
                    <input type="hidden" name="entryId" value={e.entryId} />
                    <button
                      type="submit"
                      className="rounded bg-emerald-700 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-800"
                    >
                      Deal to a table
                    </button>
                  </form>
                )
              )}
            </li>
          ))}
          {entries.length === 0 && (
            <li className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
              Nothing on this shelf yet. Save from a live board (the table&apos;s “Save to
              library” menu) or import a LIN/PBN file above.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

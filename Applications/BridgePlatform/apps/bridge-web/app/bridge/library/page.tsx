import type { LibraryEntry, LibraryKind } from "@bridge/sessions";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ChipRow } from "@/components/ChipTabs";
import { canUse, requireFeature } from "@/lib/access";
import {
  canCurateCollections,
  canSeeProgramLibrary,
  canShareLibrary,
  listLibraryFor,
} from "@/lib/libraryComponent";
import { getBridgeContext } from "@/lib/nexus";
import {
  deleteEntryAction,
  importFileAction,
  playEntryAction,
  resumePlayEntryAction,
  startTableEntryAction,
} from "./actions";
import { ImportForm } from "@/components/library/ImportForm";
import { ConfirmButton } from "@/components/kb/ConfirmButton";

/** The fellows' library (2026-07-16 rework): saved deals, boards, table
 *  lineups and plays; drills & puzzles are reserved shelves. */
const SHELVES: { kind: LibraryKind; label: string; hint: string; reserved?: boolean }[] = [
  { kind: "deal", label: "Packs", hint: "a card distribution" },
  { kind: "board", label: "Boards", hint: "pack + dealer + vulnerability" },
  { kind: "table", label: "Tables", hint: "a saved seat lineup" },
  { kind: "play", label: "Deals", hint: "board + calls + cards, as recorded" },
  { kind: "drill", label: "Drills", hint: "bidding regression checks, run per knowledge base" },
  {
    kind: "challenge",
    label: "Challenges",
    hint: "boards, format and scoring — saved so the same contest can be set again",
  },
  { kind: "puzzle", label: "Puzzles", hint: "reserved", reserved: true },
];

export default async function LibraryPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ kind?: string; scope?: string; imported?: string; shared?: string; error?: string }>;
}>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  await requireFeature(context, "page.library");
  const [canCreate, canImport, canResume, canDelete] = await Promise.all([
    canUse(context, "library.create"),
    canUse(context, "library.import"),
    canUse(context, "library.resume"),
    canUse(context, "library.delete"),
  ]);
  const params = await searchParams;
  const active = (SHELVES.find((s) => s.kind === params.kind) ?? SHELVES[1]!).kind;

  // Library component (@laic/library-core): ONE library per person, decided
  // by the access policy — admins curate the program instance, everyone else
  // works in their own. No toggle; content moves between instances only by
  // Share/Assign copies.
  const [canShare, canCurate] = await Promise.all([
    canShareLibrary(context),
    canCurateCollections(context),
  ]);
  const scope = (await canSeeProgramLibrary(context)) ? "program" : "mine";

  let all: LibraryEntry[] = [];
  let storeMissing = false;
  try {
    all = await listLibraryFor(context, scope === "program" ? "program" : "mine");
  } catch {
    storeMissing = true; // 0015 not applied yet on this backend
  }
  const byKind = new Map<LibraryKind, LibraryEntry[]>();
  for (const s of SHELVES) byKind.set(s.kind, []);
  for (const e of all) byKind.get(e.kind)?.push(e);
  const entries = byKind.get(active) ?? [];
  const shelf = SHELVES.find((s) => s.kind === active)!;

  // Creation is shelf-contextual: deals/boards go through the deal editor,
  // tables through the lineup builder; plays only arrive by recording/import.
  const createLink =
    active === "deal"
      ? { href: "/bridge/library/new?kind=deal", label: "New pack" }
      : active === "board"
        ? { href: "/bridge/library/new", label: "New board" }
        : active === "table"
          ? { href: "/bridge/library/tables/new", label: "New table" }
          : null;

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-neutral-400">Bridge</p>
          <h1 className="mt-1 text-3xl font-medium">Library</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Snapshots you save from the table, author in the deal editor, or import as LIN / PBN.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* The studio (curated v2): its own gate — the page there re-checks
              the coach roster, so this is a door, not a permission. */}
          {canCreate && (
            <Link
              href="/bridge/curate/new"
              className="rounded border border-emerald-800 px-3 py-1.5 text-sm font-medium text-emerald-900 hover:bg-emerald-50"
            >
              Curated deal
            </Link>
          )}
          {canCurate && (
            <Link
              href="/bridge/library/collections"
              className="rounded border border-sky-700 px-3 py-1.5 text-sm font-medium text-sky-800 hover:bg-sky-50"
            >
              Collections
            </Link>
          )}
          {canCreate && createLink && (
            <Link
              href={createLink.href}
              className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
            >
              {createLink.label}
            </Link>
          )}
          {canImport && <ImportForm action={importFileAction} />}
        </div>
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
      {params.shared && (
        <p className="mb-4 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          Shared copies with {params.shared} {params.shared === "1" ? "person" : "people"}.
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
                  {/* A saved challenge is its BOARDS — the thing that took work
                      to build — so the line says how many, and what playing
                      them means. Without it the row is a title and a date, and
                      you cannot tell two saved challenges apart. */}
                  {e.kind === "challenge"
                    ? (() => {
                        // A draft counts its boards from the draft itself (it
                        // holds seeds, not packs, until it is published).
                        const n = e.challengeBoardCount ?? e.challengeBoards?.length ?? 0;
                        return [
                          e.challengeStatus === "draft" ? "draft" : "published",
                          `${n} board${n === 1 ? "" : "s"}`,
                          e.challengeFormat === "bidding-only" ? "bidding only" : null,
                          e.challengeScoring,
                        ]
                          .filter(Boolean)
                          .join(" · ");
                      })()
                    : e.kind === "table"
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
                        .join(" · ") || "pack only"}
                </p>
                <p className="mt-0.5 text-[11px] text-neutral-400">
                  {e.origin}
                  {/* PICK IT BACK UP. A parked draft is only worth parking if
                      there is a way back into the wizard; the entry id is what
                      the creator page reopens from, and publishing promotes
                      this same row rather than leaving it behind. */}
                  {e.kind === "challenge" && e.challengeStatus === "draft" && (
                    <>
                      {" · "}
                      <Link
                        href={`/bridge/challenges/new?draft=${e.entryId}`}
                        className="font-semibold text-emerald-800 underline-offset-4 hover:underline"
                      >
                        keep building →
                      </Link>
                    </>
                  )}
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
              <div className="flex items-center gap-2">
                {scope === "program" && canShare && (
                  <Link
                    href={`/bridge/library/share/${e.entryId}`}
                    className="rounded border border-sky-700 px-3 py-1 text-xs font-medium text-sky-800 hover:bg-sky-50"
                  >
                    Share
                  </Link>
                )}
                {(e.kind === "deal" || e.kind === "board") && e.hands && (
                  <Link
                    href={`/bridge/library/${e.entryId}/edit`}
                    className="rounded border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    Edit
                  </Link>
                )}
                {canResume &&
                  (e.kind === "table" ? (
                    <form action={startTableEntryAction}>
                      <input type="hidden" name="entryId" value={e.entryId} />
                      <button
                        type="submit"
                        className="rounded bg-emerald-700 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-800"
                      >
                        Start · fresh deal
                      </button>
                    </form>
                  ) : e.kind === "drill" ? (
                    e.kbId && (
                      <Link
                        href={`/bridge/kb/${e.kbId}/drills`}
                        className="rounded bg-emerald-700 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-800"
                      >
                        Run
                      </Link>
                    )
                  ) : (
                    e.hands && (
                      <form action={e.kind === "play" ? resumePlayEntryAction : playEntryAction}>
                        <input type="hidden" name="entryId" value={e.entryId} />
                        <button
                          type="submit"
                          className="rounded bg-emerald-700 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-800"
                        >
                          {e.kind === "play" ? "Resume" : "Play"}
                        </button>
                      </form>
                    )
                  ))}
                {canDelete && (
                  <ConfirmButton
                    action={deleteEntryAction}
                    hidden={{ entryId: e.entryId }}
                    confirm={`Delete "${e.name}" from the library? This can't be undone.`}
                    label="Delete"
                    title="Delete this library item"
                    className="rounded border border-neutral-200 px-2 py-1 text-xs text-neutral-400 hover:border-red-300 hover:text-red-700"
                  />
                )}
              </div>
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

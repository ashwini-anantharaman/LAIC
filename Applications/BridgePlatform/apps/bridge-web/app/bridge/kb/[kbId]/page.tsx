import Link from "next/link";
import { kbService, kbStore } from "@/lib/kb";
import { scopeSources } from "@/lib/sources";
import { deleteKbAction } from "../actions";

/** Overview: where to go next, and what needs attention. */
export default async function KbOverviewPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ kbId: string }>;
  searchParams: Promise<{ deleteError?: string }>;
}>) {
  const { kbId } = await params;
  const { deleteError } = await searchParams;
  const store = kbStore();
  const [kb, items, packs, allSources, jobs, compiled] = await Promise.all([
    store.getKb(kbId),
    store.listItemsForKb(kbId),
    store.listPacksForKb(kbId),
    store.listSources(),
    store.listJobsForKb(kbId),
    kbService().liveCompile(kbId),
  ]);
  // Registry is global; count only this KB's real sources (and not src_claude).
  const sources = scopeSources(allSources, kbId, items, jobs).filter(
    (s) => s.sourceId !== "src_claude",
  );

  const failures = jobs.flatMap((j) => j.failures);
  const base = `/bridge/kb/${kbId}`;

  const card = (title: string, body: string, href: string, cta: string) => (
    <section className="flex flex-col rounded-lg border border-neutral-200 p-5">
      <h2 className="mb-1 font-medium">{title}</h2>
      <p className="flex-1 text-sm text-neutral-600">{body}</p>
      <p className="mt-3">
        <Link
          href={href}
          className="text-sm font-medium text-emerald-700 underline-offset-4 hover:underline"
        >
          {cta} →
        </Link>
      </p>
    </section>
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {items.length === 0 &&
        card(
          "Sources",
          "Register the system document (e.g. the official SAYC booklet), upload it, and run extraction — items land here, cited to their exact passages.",
          `${base}/sources`,
          "Go to sources",
        )}
      {items.length > 0 &&
        card(
          `${items.length} knowledge items`,
          "Read, edit, and relate the agreements extraction produced. Every edit recompiles the KB immediately.",
          `${base}/items`,
          "Browse the Master list",
        )}
      {packs.length === 0 && items.length > 0
        ? card(
            "Knowledge sets",
            "Group knowledge items into named sets — players are assembled from them.",
            `${base}/sets`,
            "Create a set",
          )
        : packs.length > 0
          ? card(
              `${packs.length} knowledge set${packs.length === 1 ? "" : "s"}`,
              "The groups of knowledge this KB offers players.",
              `${base}/sets`,
              "View sets",
            )
          : null}
      {failures.length > 0 &&
        card(
          `${failures.length} section failure(s)`,
          "Passages extraction couldn't structure — each one is waiting for a fellow to hand-author from the source text.",
          `${base}/sources`,
          "Review failures",
        )}
      {compiled &&
        card(
          `Compile v${compiled.version}`,
          `${compiled.auctionRules.length} auction rules, ${compiled.playRules.length + compiled.leadRules.length} play/lead rules, ${compiled.settings.length} settings, ${compiled.conflicts.length} recorded conflicts.`,
          `${base}/activity`,
          "Compile history",
        )}
      {sources.length > 0 &&
        card(
          `${sources.length} registered source(s)`,
          "The provenance registry — every knowledge item cites passages from these.",
          `${base}/sources`,
          "Manage sources",
        )}

      {/* Danger zone */}
      <details className="rounded-lg border border-red-200 sm:col-span-2">
        <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-red-800 hover:bg-red-50/50">
          Delete this knowledge base…
        </summary>
        <div className="border-t border-red-100 px-5 py-4">
          {deleteError && (
            <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {deleteError}
            </p>
          )}
          <p className="text-sm text-neutral-600">
            This permanently removes the knowledge base with its {items.length} knowledge item
            {items.length === 1 ? "" : "s"} (except any shared with another KB), sets,
            players, suggestions, compiles, and every board played on it. There is no undo.
          </p>
          <form action={deleteKbAction} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="kbId" value={kbId} />
            <input type="hidden" name="from" value="overview" />
            <label className="text-sm">
              <span className="mb-1 block text-xs text-neutral-500">
                Type <span className="font-mono font-medium">{kb?.name}</span> to confirm
              </span>
              <input
                name="confirmName"
                autoComplete="off"
                className="w-64 rounded border border-neutral-300 px-2 py-1.5"
              />
            </label>
            <button
              type="submit"
              className="rounded border border-red-300 bg-red-50 px-4 py-1.5 text-sm font-medium text-red-800 hover:bg-red-100"
            >
              Delete forever
            </button>
          </form>
        </div>
      </details>
    </div>
  );
}

import Link from "next/link";
import { kbService, kbStore } from "@/lib/kb";

/** Overview: where to go next, and what needs attention. */
export default async function KbOverviewPage({
  params,
}: Readonly<{ params: Promise<{ kbId: string }> }>) {
  const { kbId } = await params;
  const store = kbStore();
  const [items, packs, sources, jobs, compiled] = await Promise.all([
    store.listItemsForKb(kbId),
    store.listPacksForKb(kbId),
    store.listSources(),
    store.listJobsForKb(kbId),
    kbService().liveCompile(kbId),
  ]);

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
          "Start with a source",
          "Register the system document (e.g. the official SAYC booklet), upload it, and run extraction — items land here, cited to their exact passages.",
          `${base}/sources`,
          "Go to sources",
        )}
      {items.length > 0 &&
        card(
          `${items.length} knowledge items`,
          "Read, edit, and relate the agreements extraction produced. Every edit recompiles the KB immediately.",
          `${base}/items`,
          "Browse items",
        )}
      {packs.length === 0 && items.length > 0
        ? card(
            "Build the ladder",
            "Group items into capability packs — minimal-incomplete up to full-system — that players are assembled from.",
            `${base}/ladder`,
            "Create packs",
          )
        : packs.length > 0
          ? card(
              `${packs.length} packs on the ladder`,
              "The capability ladder this KB offers players.",
              `${base}/ladder`,
              "View ladder",
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
          "The provenance registry — every item cites passages from these.",
          `${base}/sources`,
          "Manage sources",
        )}
    </div>
  );
}

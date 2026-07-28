import Link from "next/link";
import { kbService, kbStore } from "@/lib/kb";
import { scopeSources } from "@/lib/sources";
import { setKbArchivedAction } from "../actions";

/** Overview: where to go next, and what needs attention. */
export default async function KbOverviewPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ kbId: string }>;
  searchParams: Promise<{ augmentKept?: string; augmentDiscarded?: string }>;
}>) {
  const { kbId } = await params;
  const { augmentKept, augmentDiscarded } = await searchParams;
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
    <div>
      {augmentKept && (
        <p className="mb-4 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Augmentation draft kept — this is now an ordinary knowledge base. Rename it below if
          you like.
        </p>
      )}
      {augmentDiscarded && (
        <p className="mb-4 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Augmentation draft discarded. This knowledge base was never touched by it.
        </p>
      )}
      {kb?.augmentation?.status === "review" && (
        <Link
          href={`${base}/augment`}
          className="mb-4 block rounded-xl border border-emerald-400 bg-emerald-50 px-5 py-4 hover:bg-emerald-100"
        >
          <p className="text-xs uppercase tracking-[0.25em] text-emerald-700">
            Augmentation in review
          </p>
          <p className="mt-1 text-sm text-neutral-700">
            This is a draft merging “{allSources.find((s) => s.sourceId === kb?.augmentation?.sourceId)?.title ?? kb.augmentation.sourceId}” into{" "}
            <b>{kb.augmentation.baseKbName}</b> — open the review board to see modified items,
            new items, and conflicts, then keep or discard. →
          </p>
        </Link>
      )}
    <div className="grid gap-4 sm:grid-cols-2">
      {items.length > 0 && (
        <section className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-[var(--card)] p-5 sm:col-span-2">
          <h2 className="font-medium">Try the knowledge</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <p className="text-sm text-neutral-600">
              <Link
                href={`${base}/test`}
                className="font-medium text-emerald-700 underline-offset-4 hover:underline"
              >
                Test a decision →
              </Link>
              <br />
              Type a hand and auction and see the exact call the knowledge makes, and why.
            </p>
            <p className="text-sm text-neutral-600">
              <Link
                href={`${base}/coverage`}
                className="font-medium text-emerald-700 underline-offset-4 hover:underline"
              >
                Run a 100-deal coverage check →
              </Link>
              <br />
              Play a knowledge set across random deals to find rules that never fire.
            </p>
          </div>
        </section>
      )}
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

      {/* Retire, don't delete */}
      <section className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-200 p-5 sm:col-span-2">
        <p className="flex-1 text-sm text-neutral-600">
          Done with this one? Hidden everywhere, reversibly — knowledge bases are never
          deleted. Unhide it any time from the knowledge-base list.
        </p>
        <form action={setKbArchivedAction}>
          <input type="hidden" name="kbId" value={kbId} />
          <input type="hidden" name="archived" value="true" />
          <button
            type="submit"
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:border-emerald-400"
          >
            Hide this knowledge base
          </button>
        </form>
      </section>
    </div>
    </div>
  );
}

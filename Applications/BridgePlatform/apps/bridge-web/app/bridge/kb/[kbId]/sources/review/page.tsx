import type { KnowledgeItem } from "@bridge/kb";
import { chunkDocument } from "@bridge/kb";
import Link from "next/link";
import { deleteItemsAction } from "@/app/bridge/kb/actions";
import { StatusBadge, TYPE_LABEL } from "@/components/kb/badges";
import { BulkItemsForm } from "@/components/kb/BulkItemsForm";
import { BulkResultBanner } from "@/components/kb/BulkResultBanner";
import { kbStore } from "@/lib/kb";

/** "What this source added" — extraction is strictly additive, so everything a
 *  new document did to the KB is the list of items its jobs created. Grouped
 *  by document section for skimming, each card opens the editor, and the same
 *  bulk-delete bar as the Master tab handles cleanup sweeps. */

function payloadSummary(item: KnowledgeItem): string {
  const p = item.payload;
  switch (p.kind) {
    case "auction_rules":
      return `${p.rules.length} bidding rule${p.rules.length === 1 ? "" : "s"}`;
    case "play_rules":
      return `${p.rules.length} play rule${p.rules.length === 1 ? "" : "s"}`;
    case "lead_rules":
      return `${p.leads.length} lead rule${p.leads.length === 1 ? "" : "s"}`;
    case "signals":
      return "signal agreement";
    case "fallback":
      return "fallback behavior";
    default:
      return "teaching prose (no rules)";
  }
}

export default async function SourceReviewPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ kbId: string }>;
  searchParams: Promise<{
    source?: string;
    bulkDeleted?: string;
    bulkBlocked?: string;
    bulkSets?: string;
  }>;
}>) {
  const { kbId } = await params;
  const { source: sourceId, bulkDeleted, bulkBlocked, bulkSets } = await searchParams;
  const store = kbStore();
  const base = `/bridge/kb/${kbId}`;

  const sources = await store.listSources();
  const source = sources.find((s) => s.sourceId === sourceId);
  if (!sourceId || !source) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
        Pick a source on the{" "}
        <Link href={`${base}/sources`} className="text-emerald-700 underline-offset-2 hover:underline">
          Sources tab
        </Link>{" "}
        to review what it added.
      </p>
    );
  }

  const [jobs, items, doc] = await Promise.all([
    store.listJobsForKb(kbId),
    store.listItemsForKb(kbId),
    store.getDocument(sourceId),
  ]);
  const itemById = new Map(items.map((i) => [i.itemId, i]));
  const sourceJobs = jobs
    .filter((j) => j.sourceId === sourceId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // Job → section heading, via the same deterministic re-chunking the queue uses.
  const sections = doc ? chunkDocument(doc.text).sections : [];
  const sectionFor = (ordinals: number[]) =>
    sections.find((s) => ordinals.some((o) => s.passageOrdinals.includes(o)))?.anchor;

  const createdIds = new Set(sourceJobs.flatMap((j) => j.createdItemIds));
  // "You may already have this": exact title match against items from elsewhere.
  const elsewhereTitles = new Map(
    items
      .filter((i) => !createdIds.has(i.itemId) && i.status !== "deprecated")
      .map((i) => [i.title.trim().toLowerCase(), i.title]),
  );

  const groups: { heading: string; items: KnowledgeItem[] }[] = [];
  for (const job of sourceJobs) {
    const added = job.createdItemIds
      .map((id) => itemById.get(id))
      .filter((i): i is KnowledgeItem => Boolean(i));
    if (!added.length) continue;
    const heading = sectionFor(job.passageOrdinals) ?? "Uncategorized section";
    const existing = groups.find((g) => g.heading === heading);
    if (existing) existing.items.push(...added);
    else groups.push({ heading, items: added });
  }
  const totalAdded = groups.reduce((n, g) => n + g.items.length, 0);
  const alreadyDeleted = createdIds.size - totalAdded;
  const failures = sourceJobs.reduce((n, j) => n + j.failures.length, 0);
  const returnTo = `${base}/sources/review?source=${encodeURIComponent(sourceId)}`;

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs text-neutral-400">
          <Link href={`${base}/sources`} className="hover:underline">
            Sources
          </Link>{" "}
          / review
        </p>
        <h2 className="mt-1 font-serif text-2xl font-medium">What “{source.title}” added</h2>
        <p className="mt-1 text-sm text-neutral-600">
          {totalAdded} knowledge item{totalAdded === 1 ? "" : "s"} across {groups.length} section
          {groups.length === 1 ? "" : "s"}
          {alreadyDeleted > 0 && ` (${alreadyDeleted} since deleted)`}
          {failures > 0 && (
            <>
              {" · "}
              <Link
                href={`${base}/sources`}
                className="text-amber-700 underline-offset-2 hover:underline"
              >
                {failures} section{failures === 1 ? "" : "s"} need a person →
              </Link>
            </>
          )}
          . Everything arrives as a draft and plays immediately — skim, open anything that looks
          off, and tick what shouldn&apos;t stay.
        </p>
      </header>

      <BulkResultBanner deleted={bulkDeleted} blocked={bulkBlocked} sets={bulkSets} />

      {totalAdded === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          Nothing from this source yet — run extraction on the Sources tab first.
        </p>
      ) : (
        <BulkItemsForm kbId={kbId} returnTo={returnTo} action={deleteItemsAction}>
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.heading}>
                <h3 className="mb-2 truncate text-xs font-medium uppercase tracking-wide text-neutral-400">
                  {group.heading}
                </h3>
                <ul className="space-y-2">
                  {group.items.map((item) => {
                    const duplicateOf = elsewhereTitles.get(item.title.trim().toLowerCase());
                    return (
                      <li
                        key={item.itemId}
                        className="flex gap-3 rounded-lg border border-neutral-200 bg-[var(--card)] p-4"
                      >
                        <label className="flex cursor-pointer items-start pt-1">
                          <input
                            type="checkbox"
                            name="itemIds"
                            value={item.itemId}
                            aria-label={`Select ${item.title}`}
                            className="h-4 w-4 accent-emerald-700"
                          />
                        </label>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <Link
                              href={`${base}/items/${item.itemId}`}
                              className="font-serif text-[15px] font-medium text-emerald-800 underline-offset-2 hover:underline"
                            >
                              {item.title}
                            </Link>
                            <StatusBadge status={item.status} />
                            <span className="text-[11px] text-neutral-500">
                              {TYPE_LABEL[item.knowledgeType]} · {item.phase.replace("_", " ")} ·{" "}
                              {payloadSummary(item)}
                              {item.settings.length > 0 &&
                                ` · ${item.settings.length} setting${item.settings.length === 1 ? "" : "s"}`}
                            </span>
                            <Link
                              href={`${base}/items/${item.itemId}`}
                              className="ml-auto text-xs text-neutral-500 underline-offset-2 hover:underline"
                            >
                              Edit →
                            </Link>
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm text-neutral-600">
                            {item.humanReadableText}
                          </p>
                          {duplicateOf && (
                            <p className="mt-1 text-xs text-amber-700">
                              ⚠ You already have an item titled “{duplicateOf}” from elsewhere —
                              this may be a duplicate.
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </BulkItemsForm>
      )}
    </div>
  );
}

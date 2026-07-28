import type { KbPlayer, KnowledgeItem } from "@bridge/kb";
import { CAPABILITY_CATEGORIES, validatePlayerStatic } from "@bridge/kb";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  deleteItemsAction,
  discardAugmentationAction,
  finishAugmentationAction,
} from "@/app/bridge/kb/actions";
import { AugmentRunner } from "@/components/kb/AugmentRunner";
import { StatusBadge, TYPE_LABEL } from "@/components/kb/badges";
import { BulkItemsForm } from "@/components/kb/BulkItemsForm";
import { BulkResultBanner } from "@/components/kb/BulkResultBanner";
import { ConfirmButton } from "@/components/kb/ConfirmButton";
import { pendingSections } from "@/lib/documents";
import { extractionAvailable } from "@/lib/extraction";
import { kbService, kbStore } from "@/lib/kb";

/** The augmentation review board (2026-07-21): merging a source into a DRAFT
 *  copy of a knowledge base. Three live panels — modified items (with their
 *  before/after), new items, and conflicts that would be new relative to the
 *  base — then one decision: keep the draft or throw it away. */

const probe = (kbId: string, packIds: string[]): KbPlayer =>
  ({
    playerId: "probe",
    kbId,
    name: "probe",
    enabledPackIds: packIds,
    settingOverrides: {},
    decisionPolicyId: "first_match",
    fallbackPolicyId: "standard",
    validationStatus: "draft",
    ownerType: "coach",
    version: 1,
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:00:00.000Z",
  }) as KbPlayer;

/** Conflict pairs keyed by sorted titles — comparable across the copy. */
async function conflictPairs(kbId: string) {
  const service = kbService();
  const store = kbStore();
  const compiled = await service.liveCompile(kbId);
  if (!compiled) return { pairs: new Map<string, [string, string]>(), okCount: null };
  const packs = await store.listPacksForKb(kbId);
  const items = await store.listItemsForKb(kbId);
  const titleOf = new Map(items.map((i) => [i.itemId, i.title]));
  const report = validatePlayerStatic(
    compiled,
    probe(kbId, packs.map((p) => p.packId)),
  );
  const pairs = new Map<string, [string, string]>();
  for (const c of report.conflicts) {
    const a = titleOf.get(c.aItemId) ?? c.aItemId;
    const b = titleOf.get(c.bItemId) ?? c.bItemId;
    const [x, y] = [a, b].sort();
    pairs.set(`${x}::${y}`, [x!, y!]);
  }
  return { pairs, okCount: report.static.filter((c) => c.ok).length };
}

export default async function AugmentBoardPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ kbId: string }>;
  searchParams: Promise<{
    start?: string;
    bulkDeleted?: string;
    bulkBlocked?: string;
    bulkSets?: string;
  }>;
}>) {
  const { kbId } = await params;
  const { start, bulkDeleted, bulkBlocked, bulkSets } = await searchParams;
  const store = kbStore();
  let kb;
  try {
    kb = await kbService().getKb(kbId);
  } catch {
    notFound();
  }
  const aug = kb.augmentation;
  if (!aug) redirect(`/bridge/kb/${kbId}`);

  const [source, items, progress, draftConf, baseConf] = await Promise.all([
    store.getSource(aug.sourceId),
    store.listItemsForKb(kbId),
    pendingSections(kbId, aug.sourceId),
    conflictPairs(kbId),
    conflictPairs(aug.baseKbId),
  ]);
  const itemById = new Map(items.map((i) => [i.itemId, i]));
  const base = `/bridge/kb/${kbId}`;

  // Modified: dedupe by item, join reasons, and dig out the "before" text.
  const modMap = new Map<string, string[]>();
  for (const m of aug.modified) {
    modMap.set(m.itemId, [...(modMap.get(m.itemId) ?? []), m.reason]);
  }
  const modified = await Promise.all(
    [...modMap.entries()].map(async ([itemId, reasons]) => {
      const item = itemById.get(itemId);
      const versions = await store.listItemVersions(itemId); // newest first
      const before = [...versions]
        .reverse()
        .find((v) => v.changeNote === "Pre-augmentation snapshot");
      return { item, itemId, reasons, beforeText: before?.humanReadableText };
    }),
  );

  const fresh = aug.newItemIds
    .map((id) => itemById.get(id))
    .filter((i): i is KnowledgeItem => Boolean(i));

  // Conflicts that exist in the draft but not in the base.
  const newConflicts = [...draftConf.pairs.entries()]
    .filter(([key]) => !baseConf.pairs.has(key))
    .map(([, pair]) => pair);

  const jobs = (await store.listJobsForKb(kbId)).filter((j) => j.sourceId === aug.sourceId);
  const failureCount = jobs.reduce((n, j) => n + j.failures.length, 0);
  const llmReady = extractionAvailable();
  const done = progress.total - progress.remaining.length;

  const panel = "rounded-xl border border-neutral-200 bg-[var(--card)] p-5";
  const counter = (n: number, tone: string) => (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${tone}`}>
      {n}
    </span>
  );

  return (
    <div className="space-y-6">
      <header className="rounded-xl border border-emerald-300 bg-emerald-50/50 p-5">
        <p className="text-xs uppercase tracking-[0.25em] text-emerald-700">
          Augmentation review
        </p>
        <h1 className="mt-1 font-serif text-2xl font-medium">
          Merging “{source?.title ?? aug.sourceId}” into {aug.baseKbName}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-neutral-600">
          This board works on a <b>draft copy</b> — <b>{aug.baseKbName}</b> is untouched. The
          merge may modify existing items (every “before” is kept as a version) and create new
          ones. Review the three panels, prune anything wrong, then keep or discard the draft.
        </p>
        <div className="mt-4">
          {aug.status === "kept" ? (
            <p className="text-sm text-emerald-800">
              ✓ Review closed — this draft was kept. It now behaves like any other knowledge base.
            </p>
          ) : llmReady ? (
            <AugmentRunner
              kbId={kbId}
              total={progress.total}
              remaining={progress.remaining.length}
              autostart={start === "auto"}
            />
          ) : (
            <p className="text-sm text-[color:var(--color-draft)]">
              Merging needs ANTHROPIC_API_KEY on the server. The board still shows anything
              already merged ({done}/{progress.total} sections).
            </p>
          )}
        </div>
      </header>

      {kb.lastCompileError && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          The draft&apos;s latest state doesn&apos;t compile ({kb.lastCompileError.message}) —
          players keep using the last good rules until this is fixed.
        </p>
      )}
      <BulkResultBanner deleted={bulkDeleted} blocked={bulkBlocked} sets={bulkSets} />

      {/* Summary strip */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className={panel}>
          <p className="text-xs uppercase tracking-wide text-neutral-400">Modified items</p>
          <p className="mt-1 text-2xl font-medium tabular-nums">{modMap.size}</p>
        </div>
        <div className={panel}>
          <p className="text-xs uppercase tracking-wide text-neutral-400">New items</p>
          <p className="mt-1 text-2xl font-medium tabular-nums">{fresh.length}</p>
        </div>
        <div className={panel}>
          <p className="text-xs uppercase tracking-wide text-neutral-400">New conflicts</p>
          <p className={`mt-1 text-2xl font-medium tabular-nums ${newConflicts.length ? "text-red-700" : ""}`}>
            {newConflicts.length}
          </p>
        </div>
        <div className={panel}>
          <p className="text-xs uppercase tracking-wide text-neutral-400">Completeness</p>
          <p className="mt-1 text-2xl font-medium tabular-nums">
            {draftConf.okCount ?? "—"}/{CAPABILITY_CATEGORIES.length}
          </p>
        </div>
      </div>

      {/* Modified items */}
      <section className={panel}>
        <h2 className="flex items-center gap-2 font-serif text-lg font-medium">
          Items the source modified {counter(modMap.size, "bg-amber-100 text-amber-800")}
        </h2>
        <p className="mt-0.5 text-xs text-neutral-500">
          Each change is a committed version — open the item to compare or restore the
          “Pre-augmentation snapshot”.
        </p>
        {modMap.size === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">Nothing modified yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {modified.map(({ item, itemId, reasons, beforeText }) => (
              <li key={itemId} className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <Link
                    href={`${base}/items/${itemId}`}
                    className="font-medium text-emerald-900 underline-offset-2 hover:underline"
                  >
                    {item?.title ?? itemId}
                  </Link>
                  {item && <StatusBadge status={item.status} />}
                  <span className="text-xs text-amber-800">{reasons.join(" · ")}</span>
                </div>
                {beforeText && item && beforeText !== item.humanReadableText && (
                  <div className="mt-2 grid gap-2 text-[13px] sm:grid-cols-2">
                    <p className="rounded border border-neutral-200 bg-white/70 p-2 text-neutral-500">
                      <span className="mb-0.5 block text-[10px] uppercase tracking-wide">was</span>
                      {beforeText}
                    </p>
                    <p className="rounded border border-emerald-200 bg-white p-2 text-neutral-700">
                      <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-emerald-700">
                        now
                      </span>
                      {item.humanReadableText}
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* New items */}
      <section className={panel}>
        <h2 className="flex items-center gap-2 font-serif text-lg font-medium">
          New items from the source {counter(fresh.length, "bg-emerald-100 text-emerald-800")}
        </h2>
        <p className="mt-0.5 text-xs text-neutral-500">
          Drafts, citing their source passages. Tick anything that shouldn&apos;t stay and
          delete it — the base is unaffected either way.
        </p>
        {fresh.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">Nothing new yet.</p>
        ) : (
          <BulkItemsForm kbId={kbId} returnTo={`${base}/augment`} action={deleteItemsAction}>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {fresh.map((item) => (
                <li key={item.itemId} className="flex gap-2 rounded-lg border border-neutral-200 p-3">
                  <label className="flex cursor-pointer items-start pt-0.5">
                    <input
                      type="checkbox"
                      name="itemIds"
                      value={item.itemId}
                      aria-label={`Select ${item.title}`}
                      className="h-4 w-4 accent-emerald-700"
                    />
                  </label>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <Link
                        href={`${base}/items/${item.itemId}`}
                        className="font-medium text-emerald-900 underline-offset-2 hover:underline"
                      >
                        {item.title}
                      </Link>
                      <span className="text-[10px] uppercase tracking-wide text-neutral-400">
                        {TYPE_LABEL[item.knowledgeType]}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[13px] text-neutral-600">
                      {item.humanReadableText}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </BulkItemsForm>
        )}
      </section>

      {/* Conflicts */}
      <section className={panel}>
        <h2 className="flex items-center gap-2 font-serif text-lg font-medium">
          Conflicts the merge would introduce{" "}
          {counter(newConflicts.length, newConflicts.length ? "bg-red-100 text-red-800" : "bg-neutral-100 text-neutral-500")}
        </h2>
        <p className="mt-0.5 text-xs text-neutral-500">
          Pairs marked incompatible that were NOT in conflict in {aug.baseKbName}. Resolve by
          deleting one side, toggling it off, or editing the items.
        </p>
        {newConflicts.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">No new conflicts.</p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {newConflicts.map(([a, b]) => (
              <li key={`${a}::${b}`} className="rounded border border-red-200 bg-red-50/60 px-3 py-2 text-sm">
                <b>{a}</b> <span className="text-red-700">⇄ conflicts with ⇄</span> <b>{b}</b>
              </li>
            ))}
          </ul>
        )}
        {failureCount > 0 && (
          <p className="mt-3 border-t border-neutral-100 pt-2 text-xs text-neutral-500">
            {failureCount} section{failureCount === 1 ? "" : "s"} couldn&apos;t be merged
            automatically —{" "}
            <Link href={`${base}/sources`} className="text-amber-700 underline-offset-2 hover:underline">
              write them up by hand →
            </Link>
          </p>
        )}
      </section>

      {/* The decision */}
      {aug.status === "review" && (
        <footer className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-300 bg-[var(--card)] p-4">
          <form action={finishAugmentationAction}>
            <input type="hidden" name="kbId" value={kbId} />
            <button
              type="submit"
              className="rounded bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
            >
              Keep this draft
            </button>
          </form>
          <ConfirmButton
            action={discardAugmentationAction}
            hidden={{ kbId }}
            confirm={`Discard this draft entirely? "${aug.baseKbName}" stays exactly as it was.`}
            label="Discard draft"
            className="rounded border border-red-300 px-4 py-1.5 text-sm text-red-700 hover:bg-red-50"
          />
          <span className="text-xs text-neutral-500">
            Keeping makes this a normal knowledge base (rename it on the overview). Discarding
            deletes the draft — {aug.baseKbName} is untouched either way.
          </span>
        </footer>
      )}
    </div>
  );
}

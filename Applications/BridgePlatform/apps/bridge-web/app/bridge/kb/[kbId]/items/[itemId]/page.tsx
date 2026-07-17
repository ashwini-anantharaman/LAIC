import type { EdgeType } from "@bridge/kb";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge, TypeChip } from "@/components/kb/badges";
import { ItemEditor } from "@/components/kb/ItemEditor";
import { kbStore } from "@/lib/kb";
import { addEdgeAction, removeEdgeAction, saveItemAction } from "../../../actions";

const EDGE_LABEL: Record<EdgeType, string> = {
  requires: "requires",
  conflicts_with: "conflicts with",
  teaches: "teaches",
  exception_to: "exception to",
  enabled_by: "enabled by",
};

/** The item view (spec §6): reading pane + typed editor on the left, the
 *  cited source passages and relationship edges alongside. */
export default async function ItemPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ kbId: string; itemId: string }>;
  searchParams: Promise<{ saved?: string }>;
}>) {
  const { kbId, itemId } = await params;
  const { saved } = await searchParams;
  const store = kbStore();
  const item = await store.getItem(itemId);
  if (!item) notFound();

  const [edges, kbItems, memberships] = await Promise.all([
    store.listEdgesTouching([itemId]),
    store.listItemsForKb(kbId),
    store.listMembershipsForItem(itemId),
  ]);
  const titleOf = new Map(kbItems.map((i) => [i.itemId, i.title]));

  // Resolve cited passages for the side-by-side pane.
  const passagesBySource = new Map<string, Awaited<ReturnType<typeof store.listPassages>>>();
  for (const ref of item.sourceReferences) {
    if (!passagesBySource.has(ref.sourceId))
      passagesBySource.set(ref.sourceId, await store.listPassages(ref.sourceId));
  }
  const citedPassages = item.sourceReferences.map((ref) => ({
    ref,
    passage: passagesBySource.get(ref.sourceId)?.find((p) => p.passageId === ref.passageId),
  }));

  const base = `/bridge/kb/${kbId}`;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div>
        <p className="mb-2 text-xs text-neutral-400">
          <Link href={`${base}/items`} className="hover:underline">
            Capabilities
          </Link>{" "}
          / {item.itemId} · v{item.version}
          {item.forkedFromItemId && <> · forked from {item.forkedFromItemId}</>}
          {memberships.length > 1 && <> · shared with {memberships.length - 1} other KB(s)</>}
        </p>
        {saved && (
          <p className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Saved — the knowledge base recompiled. New sessions use it immediately.
          </p>
        )}
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-2xl font-medium">{item.title}</h2>
          <TypeChip type={item.knowledgeType} />
          <StatusBadge status={item.status} />
        </div>
        <p className="prose-knowledge mb-6 text-neutral-800">{item.humanReadableText}</p>

        <ItemEditor kbId={kbId} item={item} action={saveItemAction} />
      </div>

      <aside className="space-y-6">
        <section className="rounded-lg border border-neutral-200 p-4">
          <h3 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
            Source
          </h3>
          {citedPassages.length === 0 ? (
            <p className="text-sm text-neutral-500">No citations.</p>
          ) : (
            <ul className="space-y-3">
              {citedPassages.map(({ ref, passage }, i) => (
                <li key={i} className="border-l-2 border-emerald-300 pl-3">
                  <p className="text-[11px] uppercase tracking-wide text-neutral-400">
                    {passage ? (
                      <Link
                        href={`/bridge/kb/${kbId}/sources/${ref.sourceId}?p=${passage.passageId}#${passage.passageId}`}
                        className="text-emerald-800 underline-offset-2 hover:underline"
                        title="Open this passage in the source document"
                      >
                        {ref.sourceId} · ¶{passage.ordinal} →
                      </Link>
                    ) : (
                      <Link
                        href={`/bridge/kb/${kbId}/sources/${ref.sourceId}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {ref.sourceId}
                      </Link>
                    )}
                  </p>
                  {passage ? (
                    <blockquote className="prose-knowledge mt-1 text-[15px] text-neutral-700">
                      {passage.text}
                    </blockquote>
                  ) : (
                    <p className="mt-1 text-sm italic text-neutral-500">{ref.anchor}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-neutral-200 p-4">
          <h3 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
            Relationships
          </h3>
          <ul className="space-y-1.5">
            {edges.map((edge) => {
              const outgoing = edge.fromItemId === itemId;
              const otherId = outgoing ? edge.toItemId : edge.fromItemId;
              const target =
                edge.toConceptId ??
                (otherId ? (titleOf.get(otherId) ?? otherId) : edge.toSettingKey);
              return (
                <li key={edge.edgeId} className="flex items-center gap-2 text-sm">
                  <span
                    className={
                      edge.edgeType === "conflicts_with"
                        ? "rounded bg-red-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[color:var(--color-invalid)]"
                        : "rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-600"
                    }
                  >
                    {outgoing ? EDGE_LABEL[edge.edgeType] : `is ${EDGE_LABEL[edge.edgeType]} of`}
                  </span>
                  {otherId && outgoing !== undefined && edge.toConceptId === undefined ? (
                    <Link href={`${base}/items/${otherId}`} className="text-emerald-800 hover:underline">
                      {target}
                    </Link>
                  ) : (
                    <span>{target}</span>
                  )}
                  {edge.origin === "extracted" && (
                    <span className="text-[10px] text-neutral-400" title="proposed by extraction (auto-approved)">
                      ⚙ extracted
                    </span>
                  )}
                  <form action={removeEdgeAction} className="ml-auto">
                    <input type="hidden" name="kbId" value={kbId} />
                    <input type="hidden" name="edgeId" value={edge.edgeId} />
                    <button type="submit" className="text-xs text-neutral-400 hover:text-[var(--madder)]">
                      ×
                    </button>
                  </form>
                </li>
              );
            })}
            {edges.length === 0 && <li className="text-sm text-neutral-500">No edges yet.</li>}
          </ul>

          <form action={addEdgeAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-[var(--line)] pt-3">
            <input type="hidden" name="kbId" value={kbId} />
            <input type="hidden" name="fromItemId" value={itemId} />
            <label className="text-xs">
              <span className="mb-0.5 block text-neutral-500">This item…</span>
              <select name="edgeType" className="rounded border border-neutral-300 px-1.5 py-1 text-sm">
                <option value="requires">requires</option>
                <option value="conflicts_with">conflicts with</option>
                <option value="exception_to">is an exception to</option>
                <option value="teaches">teaches (concept id)</option>
              </select>
            </label>
            <label className="flex-1 text-xs">
              <span className="mb-0.5 block text-neutral-500">Target (item id or concept id)</span>
              <input
                name="target"
                list={`items-${kbId}`}
                className="w-full rounded border border-neutral-300 px-1.5 py-1 text-sm"
              />
              <datalist id={`items-${kbId}`}>
                {kbItems
                  .filter((i) => i.itemId !== itemId)
                  .map((i) => (
                    <option key={i.itemId} value={i.itemId}>
                      {i.title}
                    </option>
                  ))}
              </datalist>
            </label>
            <button type="submit" className="rounded border border-neutral-300 px-2 py-1 text-sm hover:border-emerald-400">
              Add
            </button>
          </form>
        </section>
      </aside>
    </div>
  );
}

import { itemIsDirty, type EdgeType } from "@bridge/kb";
import Link from "next/link";
import { notFound } from "next/navigation";
import { bandLine, StatusBadge, TypeChip } from "@/components/kb/badges";
import { ConfirmButton } from "@/components/kb/ConfirmButton";
import { ItemEditor } from "@/components/kb/ItemEditor";
import { ItemView } from "@/components/kb/ItemView";
import { kbStore } from "@/lib/kb";
import {
  addEdgeAction,
  commitItemVersionAction,
  deleteItemVersionAction,
  removeEdgeAction,
  saveItemAction,
  setItemMainVersionAction,
  setItemStatusAction,
} from "../../../actions";

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
  searchParams: Promise<{
    saved?: string;
    committed?: string;
    statusSet?: string;
    madeMain?: string;
    versionDeleted?: string;
    versionError?: string;
    mode?: string;
    from?: string;
  }>;
}>) {
  const { kbId, itemId } = await params;
  const sp = await searchParams;
  const { saved, committed, statusSet, madeMain, versionDeleted, versionError } = sp;
  const edit = sp.mode === "edit";
  // Back link (R9): only honor a `from` that points back into this KB's
  // Master view — anything else falls back to the plain items list.
  const from = sp.from?.startsWith(`/bridge/kb/${kbId}/items`) ? sp.from : undefined;
  const store = kbStore();
  const item = await store.getItem(itemId);
  if (!item) notFound();

  const [edges, kbItems, memberships, versions] = await Promise.all([
    store.listEdgesTouching([itemId]),
    store.listItemsForKb(kbId),
    store.listMembershipsForItem(itemId),
    store.listItemVersions(itemId),
  ]);
  // "Dirty" is measured against the MAIN version (the one the head should
  // reflect), not merely the newest — so pointing main at an older version
  // reads as clean until you actually edit.
  const mainSnapshot =
    item.mainVersion != null
      ? (versions.find((v) => v.versionNumber === item.mainVersion) ?? null)
      : null;
  const dirty = itemIsDirty(item, mainSnapshot);
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
  const backHref = from ?? `${base}/items`;
  const fromQuery = from ? `&from=${encodeURIComponent(from)}` : "";
  const selfHref = `${base}/items/${itemId}`;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div>
        <p className="mb-2 text-xs text-neutral-400">
          <Link href={backHref} className="hover:underline">
            ← Back to Master
          </Link>{" "}
          / {item.itemId} · rev {item.version}
          {item.mainVersion && <> · main v{item.mainVersion}</>}
          {item.forkedFromItemId && (
            <>
              {" "}
              ·{" "}
              <Link
                href={`${base}/items/${item.forkedFromItemId}`}
                className="hover:underline"
              >
                forked from {titleOf.get(item.forkedFromItemId) ?? item.forkedFromItemId}
              </Link>
            </>
          )}
          {memberships.length > 1 && <> · shared with {memberships.length - 1} other KB(s)</>}
        </p>
        {saved && (
          <p className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Saved — the knowledge base recompiled. New sessions use it immediately.
          </p>
        )}
        {committed && (
          <p className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Committed <span className="font-medium">v{committed}</span> — an immutable
            snapshot, now the main version.
          </p>
        )}
        {statusSet && (
          <p className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Status updated to <span className="font-medium">{statusSet}</span>.
          </p>
        )}
        {madeMain && (
          <p className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <span className="font-medium">v{madeMain}</span> is now the main version —
            no new version was created.
          </p>
        )}
        {versionDeleted && (
          <p className="mb-3 rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
            Version v{versionDeleted} deleted.
          </p>
        )}
        {versionError && (
          <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-[color:var(--color-invalid)]">
            {versionError}
          </p>
        )}
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-medium">{item.title}</h2>
          <TypeChip type={item.knowledgeType} />
          <StatusBadge status={item.status} />
          {dirty && (
            <span
              title="Saved edits no committed version captures yet — use Save as new version."
              className="inline-block rounded border border-amber-400 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-700"
            >
              uncommitted changes
            </span>
          )}
          {edit ? (
            <Link
              href={`${selfHref}${from ? `?from=${encodeURIComponent(from)}` : ""}`}
              className="ml-auto rounded border border-neutral-300 px-3 py-1 text-sm hover:border-emerald-400 hover:text-emerald-800"
            >
              View
            </Link>
          ) : (
            <Link
              href={`${selfHref}?mode=edit${fromQuery}`}
              className="ml-auto rounded bg-emerald-700 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-800"
            >
              Edit
            </Link>
          )}
        </div>
        <p className="mb-2 mt-1 text-xs text-neutral-400">
          {bandLine(item.knowledgeType) ?? "teaching prose — never plays"}
        </p>
        {!edit && (item.status === "draft" || item.status === "reviewed") && (
          <div className="mb-4 mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
            <span className="text-xs text-neutral-500">
              Status is a trust badge — it never gates play.
            </span>
            {item.status === "draft" && (
              <form action={setItemStatusAction} className="inline">
                <input type="hidden" name="kbId" value={kbId} />
                <input type="hidden" name="itemId" value={itemId} />
                <input type="hidden" name="status" value="reviewed" />
                <button
                  type="submit"
                  className="rounded border border-neutral-300 px-2.5 py-1 text-xs hover:border-emerald-400 hover:text-emerald-800"
                >
                  Mark reviewed
                </button>
              </form>
            )}
            <form action={setItemStatusAction} className="inline">
              <input type="hidden" name="kbId" value={kbId} />
              <input type="hidden" name="itemId" value={itemId} />
              <input type="hidden" name="status" value="approved" />
              <button
                type="submit"
                className="rounded bg-emerald-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-800"
              >
                Approve
              </button>
            </form>
          </div>
        )}
        {(item.tags?.length ?? 0) > 0 && (
          <p className="mb-2 flex flex-wrap gap-1.5">
            {item.tags!.map((t) => (
              <Link
                key={t}
                href={`${base}/items?tag=${encodeURIComponent(t)}`}
                className="rounded-full border border-neutral-200 px-1.5 py-0.5 text-[10px] text-neutral-500 hover:border-emerald-400 hover:text-emerald-800"
              >
                {t}
              </Link>
            ))}
          </p>
        )}
        <p className="prose-knowledge mb-6 mt-2 text-neutral-800">{item.humanReadableText}</p>
        {item.internalNotes && (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-amber-800">
              Internal notes — never shown to players
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-amber-900">
              {item.internalNotes}
            </p>
          </div>
        )}

        {edit ? (
          <ItemEditor
            kbId={kbId}
            item={item}
            action={saveItemAction}
            hiddenFields={{ ...(from && { from }) }}
          />
        ) : (
          <ItemView item={item} />
        )}
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

        {edit && (
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
        )}

        {!edit && (
        <section className="rounded-lg border border-neutral-200 p-4">
          <h3 className="mb-2 flex items-baseline text-sm font-medium uppercase tracking-wide text-neutral-500">
            Versions
            <Link
              href="/bridge/guide#versions"
              className="ml-auto text-[11px] font-normal normal-case tracking-normal text-neutral-400 underline-offset-2 hover:text-emerald-700 hover:underline"
            >
              how versions work →
            </Link>
          </h3>
          <p className="text-sm text-neutral-600">
            {dirty
              ? item.mainVersion
                ? `Uncommitted edits since v${item.mainVersion} — commit to create a new version.`
                : "The head has uncommitted edits."
              : versions.length
                ? `The main version (highlighted) is what's in use. Click "Make main" on any version to switch — no new version is created.`
                : "This item has never been committed."}
          </p>

          {versions.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">No committed versions yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {versions.map((v) => {
                const isMain = v.versionNumber === item.mainVersion;
                return (
                  <li
                    key={v.versionNumber}
                    className={
                      isMain
                        ? "flex items-start gap-2 rounded-md border border-emerald-300 bg-emerald-50/60 p-2 text-sm"
                        : "flex items-start gap-2 p-2 text-sm"
                    }
                  >
                    <span
                      className={
                        isMain
                          ? "mt-0.5 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white"
                          : "mt-0.5 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-600"
                      }
                    >
                      v{v.versionNumber}
                    </span>
                    <span className="flex-1">
                      <span className="text-neutral-700">{v.title}</span>
                      {isMain && (
                        <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-emerald-700">
                          main{dirty ? " (edited)" : ""}
                        </span>
                      )}
                      {v.changeNote && (
                        <span className="block text-xs text-neutral-500">{v.changeNote}</span>
                      )}
                      <span className="block text-[11px] text-neutral-400">
                        {new Date(v.committedAt).toLocaleString()}
                      </span>
                    </span>
                    {!isMain && (
                      <span className="flex shrink-0 items-center gap-2">
                        <form action={setItemMainVersionAction}>
                          <input type="hidden" name="kbId" value={kbId} />
                          <input type="hidden" name="itemId" value={itemId} />
                          <input type="hidden" name="versionNumber" value={v.versionNumber} />
                          <button
                            type="submit"
                            className="rounded border border-neutral-300 px-2 py-0.5 text-xs hover:border-emerald-400 hover:text-emerald-800"
                            title="Make this the main version (no new version is created)"
                          >
                            Make main
                          </button>
                        </form>
                        <ConfirmButton
                          action={deleteItemVersionAction}
                          hidden={{ kbId, itemId, versionNumber: v.versionNumber }}
                          confirm={`Delete v${v.versionNumber}? This permanently removes the snapshot.`}
                          label="delete"
                          className="text-xs text-neutral-400 hover:text-[var(--madder)]"
                          title="Delete this version snapshot"
                        />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {/* Commit control lives at the bottom of the panel. */}
          <form action={commitItemVersionAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-[var(--line)] pt-3">
            <input type="hidden" name="kbId" value={kbId} />
            <input type="hidden" name="itemId" value={itemId} />
            <label className="flex-1 text-xs">
              <span className="mb-0.5 block text-neutral-500">Change note (optional)</span>
              <input
                name="changeNote"
                placeholder="what changed in this version"
                className="w-full rounded border border-neutral-300 px-1.5 py-1 text-sm"
              />
            </label>
            <button
              type="submit"
              disabled={!dirty}
              className="rounded bg-emerald-700 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              Commit v{(versions[0]?.versionNumber ?? 0) + 1}
            </button>
          </form>
        </section>
        )}
      </aside>
    </div>
  );
}

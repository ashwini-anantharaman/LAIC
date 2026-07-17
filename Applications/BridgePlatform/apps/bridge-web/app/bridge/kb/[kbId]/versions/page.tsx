import { itemIsDirty, type KnowledgeItemVersion } from "@bridge/kb";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/kb/ConfirmButton";
import { kbService, kbStore } from "@/lib/kb";
import {
  deleteKbVersionAction,
  deriveKbAction,
  duplicateKbAction,
  publishKbVersionAction,
  setActiveVersionAction,
} from "../../actions";

/**
 * The Versions tab (Stage H): KB releases + publish, plus branching a KB into a
 * limited derivative. A KB version is a manifest pinning each member item's
 * committed version — consumers bind to it, not to the moving draft.
 */
export default async function VersionsPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ kbId: string }>;
  searchParams: Promise<{
    published?: string;
    unchanged?: string;
    activated?: string;
    versionDeleted?: string;
    versionError?: string;
  }>;
}>) {
  const { kbId } = await params;
  const { published, unchanged, activated, versionDeleted, versionError } = await searchParams;
  const store = kbStore();
  const kb = await store.getKb(kbId);
  if (!kb) notFound();

  const [items, versions, derivation, compiled] = await Promise.all([
    store.listItemsForKb(kbId),
    kbService().listKbVersions(kbId),
    kbService().derivationStatus(kbId),
    kbService().liveCompile(kbId),
  ]);

  // Dirty = head content diverges from its MAIN committed snapshot.
  const mainByItem = new Map<string, KnowledgeItemVersion | null>(
    await Promise.all(
      items.map(async (i) => {
        const history = await store.listItemVersions(i.itemId);
        const main = i.mainVersion != null
          ? (history.find((v) => v.versionNumber === i.mainVersion) ?? null)
          : null;
        return [i.itemId, main] as const;
      }),
    ),
  );
  const dirty = items.filter((i) => itemIsDirty(i, mainByItem.get(i.itemId) ?? null));

  // Master lineage names/numbers for the banner.
  const master = derivation.masterKbId ? await store.getKb(derivation.masterKbId) : null;
  const masterVersions = derivation.masterKbId
    ? await kbService().listKbVersions(derivation.masterKbId)
    : [];
  const numberOf = (versionId?: string) =>
    masterVersions.find((v) => v.versionId === versionId)?.versionNumber;
  const base = `/bridge/kb/${kbId}`;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {published && (
        <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Published <span className="font-medium">v{published}</span> — an immutable
          release pinning every item&apos;s committed version. It&apos;s now the
          active/main version.
        </p>
      )}
      {unchanged && (
        <p className="rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
          Nothing has changed since <span className="font-medium">v{unchanged}</span> —
          no new version was created. Make a change to the draft first, then publish.
        </p>
      )}
      {activated && (
        <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Active version updated — this release is now the main one.
        </p>
      )}
      {versionDeleted && (
        <p className="rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
          Release deleted.
        </p>
      )}
      {versionError && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-[color:var(--color-invalid)]">
          {versionError}
        </p>
      )}

      {derivation.derived && (
        <section className="rounded-lg border border-neutral-200 bg-[var(--card)] px-5 py-4 text-sm">
          <p className="text-neutral-700">
            Derived from{" "}
            {master ? (
              <Link href={`/bridge/kb/${master.kbId}`} className="font-medium text-emerald-800 hover:underline">
                {master.name}
              </Link>
            ) : (
              <span className="font-medium">{derivation.masterKbId}</span>
            )}
            {numberOf(derivation.branchedFromVersionId) !== undefined && (
              <> at v{numberOf(derivation.branchedFromVersionId)}</>
            )}
            .
          </p>
          {derivation.upgradeAvailable ? (
            <p className="mt-1 text-[color:var(--color-draft)]">
              The master has published a newer version
              {numberOf(derivation.masterLatestVersionId) !== undefined && (
                <> (v{numberOf(derivation.masterLatestVersionId)})</>
              )}{" "}
              since this branch point. Linked knowledge items already reflect master edits;
              forked knowledge items stay as you left them.
            </p>
          ) : (
            <p className="mt-1 text-neutral-500">Up to date with the master.</p>
          )}
        </section>
      )}

      {/* ---- Publish -------------------------------------------------------- */}
      <section>
        <h2 className="text-lg font-medium">Publish a version</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Freezes the current draft as an immutable release. Any knowledge items with
          uncommitted edits are committed first; the KB must compile.
        </p>

        <p className="mt-3 text-sm text-neutral-500">
          {dirty.length === 0
            ? "No uncommitted knowledge-item edits — the draft is fully committed."
            : `${dirty.length} knowledge item${dirty.length === 1 ? "" : "s"} with uncommitted edits will be committed on publish.`}
        </p>

        {kb.lastCompileError ? (
          <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-[color:var(--color-invalid)]">
            The KB doesn&apos;t currently compile — fix the error before publishing.
          </p>
        ) : (
          <form action={publishKbVersionAction} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="kbId" value={kbId} />
            <label className="text-sm">
              <span className="mb-1 block text-xs text-neutral-500">Label (optional)</span>
              <input
                name="label"
                placeholder="SAYC core"
                className="w-full rounded border border-neutral-300 px-2 py-1.5"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-neutral-500">Notes (optional)</span>
              <input
                name="notes"
                placeholder="Adds Jacoby transfers"
                className="w-full rounded border border-neutral-300 px-2 py-1.5"
              />
            </label>
            <p className="sm:col-span-2">
              <button
                type="submit"
                className="rounded bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
              >
                Publish v{(kb.latestVersionNumber ?? 0) + 1}
              </button>
            </p>
          </form>
        )}
      </section>

      {/* ---- Releases ------------------------------------------------------- */}
      <section>
        <h2 className="text-lg font-medium">Releases</h2>
        <p className="mt-1 text-sm text-neutral-600">
          The <span className="font-medium">active</span> version (highlighted) is the
          main one in use. Click <em>Make active</em> on any release to roll to it —
          older versions are never deleted.
        </p>
        {versions.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">
            No published versions yet. The draft (live compile{" "}
            {compiled ? `v${compiled.version}` : "none"}) is what the workspace edits.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {versions.map((v) => {
              const isActive = v.versionId === kb.activeVersionId;
              return (
                <li
                  key={v.versionId}
                  className={
                    isActive
                      ? "rounded-lg border-2 border-emerald-400 bg-emerald-50/60 px-5 py-4"
                      : "rounded-lg border border-neutral-200 bg-[var(--card)] px-5 py-4"
                  }
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-serif text-lg font-medium">
                      v{v.versionNumber}
                      {v.label && <span className="ml-2 text-sm text-neutral-600">{v.label}</span>}
                      {isActive && (
                        <span className="ml-2 rounded bg-emerald-600 px-1.5 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wide text-white">
                          active · main
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="text-xs text-neutral-400">
                        {new Date(v.publishedAt).toLocaleString()}
                      </span>
                      {!isActive && (
                        <>
                          <form action={setActiveVersionAction}>
                            <input type="hidden" name="kbId" value={kbId} />
                            <input type="hidden" name="versionId" value={v.versionId} />
                            <button
                              type="submit"
                              className="rounded border border-neutral-300 px-2 py-1 text-xs font-medium hover:border-emerald-400 hover:text-emerald-800"
                            >
                              Make active
                            </button>
                          </form>
                          <ConfirmButton
                            action={deleteKbVersionAction}
                            hidden={{ kbId, versionId: v.versionId }}
                            confirm={`Delete release v${v.versionNumber}? This permanently removes the release (knowledge-item snapshots and compiles are kept).`}
                            label="delete"
                            className="text-xs text-neutral-400 hover:text-[var(--madder)]"
                            title="Delete this release"
                          />
                        </>
                      )}
                    </span>
                  </div>
                  {v.notes && <p className="mt-1 text-sm text-neutral-600">{v.notes}</p>}
                  <p className="mt-2 text-xs text-neutral-500">
                    {v.items.length} item{v.items.length === 1 ? "" : "s"} pinned · compile{" "}
                    <span className="font-mono">{v.compileId.slice(0, 16)}…</span>
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---- Branch this KB ------------------------------------------------- */}
      <section className="border-t border-[var(--line)] pt-6">
        <h2 className="text-lg font-medium">Branch this knowledge base</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Create a new KB from this one. A <strong>limited</strong> derivative
          takes a subset; a <strong>duplicate</strong> copies everything to build
          on top of. Both keep the system label <span className="font-medium">{kb.systemLabel}</span>{" "}
          (so players stay pairing-compatible).
        </p>

        {/* Derive limited (subset) */}
        <form action={deriveKbAction} className="mt-4 rounded-lg border border-neutral-200 p-4">
          <input type="hidden" name="masterKbId" value={kbId} />
          <h3 className="text-sm font-medium">Derive a limited KB (subset)</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-xs text-neutral-500">Name</span>
              <input
                name="name"
                required
                placeholder="SAYC — beginner"
                className="w-full rounded border border-neutral-300 px-2 py-1.5"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-neutral-500">Import mode</span>
              <select name="mode" className="w-full rounded border border-neutral-300 px-2 py-1.5">
                <option value="linked">Linked — stays in sync, forks on edit</option>
                <option value="copied">Copied — independent from the start</option>
              </select>
            </label>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-neutral-600">
            <input type="checkbox" name="includePacks" /> Also copy the knowledge sets
          </label>
          <fieldset className="mt-3">
            <legend className="text-xs text-neutral-500">
              Items to include ({items.length} available — none selected means all)
            </legend>
            <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded border border-neutral-200 p-2">
              {items.length === 0 ? (
                <p className="text-sm text-neutral-400">This KB has no knowledge items yet.</p>
              ) : (
                items.map((i) => (
                  <label key={i.itemId} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="includeItemIds" value={i.itemId} />
                    <span className="truncate">{i.title}</span>
                  </label>
                ))
              )}
            </div>
          </fieldset>
          <p className="mt-3">
            <button
              type="submit"
              className="rounded border border-neutral-300 px-4 py-1.5 text-sm font-medium hover:border-emerald-400"
            >
              Derive limited KB
            </button>
          </p>
        </form>

        {/* Duplicate (full copy) */}
        <form action={duplicateKbAction} className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 p-4">
          <input type="hidden" name="kbId" value={kbId} />
          <label className="flex-1 text-sm">
            <span className="mb-1 block text-xs text-neutral-500">Duplicate as (full independent copy)</span>
            <input
              name="name"
              required
              placeholder={`${kb.name} (copy)`}
              className="w-full rounded border border-neutral-300 px-2 py-1.5"
            />
          </label>
          <button
            type="submit"
            className="rounded border border-neutral-300 px-4 py-1.5 text-sm font-medium hover:border-emerald-400"
          >
            Duplicate
          </button>
        </form>
      </section>
    </div>
  );
}

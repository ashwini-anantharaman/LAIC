import { canAccessAdminArea } from "@bridge/nexus-client";
import type { KnowledgeBase, KnowledgeItem } from "@bridge/kb";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DeleteKbButton } from "@/components/kb/DeleteKbButton";
import { getBridgeContext } from "@/lib/nexus";
import { ensureSeeds, kbStore } from "@/lib/kb";
import { createKbAction, deleteKbAction, deriveKbAction, duplicateKbAction } from "./actions";

/** The knowledge-base list: one tree (masters with their limited derivatives
 *  nested underneath), branch/duplicate/delete inline per base. */
export default async function KbListPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ deleted?: string; deleteError?: string }> }>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  if (!canAccessAdminArea(context)) redirect("/bridge/home");
  await ensureSeeds();
  const { deleted, deleteError } = await searchParams;

  const store = kbStore();
  const kbs = await store.listKbs();
  const itemsByKb = new Map<string, KnowledgeItem[]>(
    await Promise.all(
      kbs.map(async (k) => [k.kbId, await store.listItemsForKb(k.kbId)] as const),
    ),
  );

  // Lineage forest: children grouped by parent; roots have no (present) parent.
  const present = new Set(kbs.map((k) => k.kbId));
  const childrenOf = new Map<string, KnowledgeBase[]>();
  const roots: KnowledgeBase[] = [];
  for (const kb of kbs) {
    const parent = kb.derivedFromKbId;
    if (parent && present.has(parent)) {
      const list = childrenOf.get(parent) ?? [];
      list.push(kb);
      childrenOf.set(parent, list);
    } else {
      roots.push(kb);
    }
  }
  const nameOf = new Map(kbs.map((k) => [k.kbId, k.name]));

  const statusLabel = (kb: KnowledgeBase) =>
    kb.lastCompileError ? (
      <span className="text-[var(--madder)]">latest edit doesn&apos;t compile</span>
    ) : kb.liveCompileId ? (
      "live"
    ) : (
      "empty"
    );

  // All descendants of a master, flattened (any depth) — rendered as plain
  // blocks under the master, not as a nested tree.
  function descendantsOf(rootId: string): KnowledgeBase[] {
    const out: KnowledgeBase[] = [];
    const walk = (id: string) => {
      for (const child of childrenOf.get(id) ?? []) {
        out.push(child);
        walk(child.kbId);
      }
    };
    walk(rootId);
    return out;
  }

  function card(kb: KnowledgeBase): React.ReactNode {
    const items = itemsByKb.get(kb.kbId) ?? [];
    const kids = childrenOf.get(kb.kbId) ?? [];
    return (
      <div className="rounded-xl border border-neutral-200 bg-[var(--card)] p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/bridge/kb/${kb.kbId}`}
                  className="font-serif text-xl font-medium hover:text-emerald-800 hover:underline"
                >
                  {kb.name}
                </Link>
                <span className="text-xs uppercase tracking-wide text-neutral-400">
                  {kb.systemLabel}
                </span>
              </div>
              {kb.derivedFromKbId && (
                <p className="mt-1 text-xs text-neutral-500">
                  Limited derivative of{" "}
                  <span className="font-medium text-neutral-700">
                    {nameOf.get(kb.derivedFromKbId) ?? "an unknown KB"}
                  </span>
                </p>
              )}
              {kb.description && (
                <p className="mt-1 max-w-lg text-sm text-neutral-600">{kb.description}</p>
              )}
            </div>
            <div className="shrink-0 text-right text-xs text-neutral-500">
              <p>
                {items.length} capabilit{items.length === 1 ? "y" : "ies"}
                {kb.latestVersionNumber ? <> · v{kb.latestVersionNumber}</> : null}
              </p>
              <p className="mt-0.5">{statusLabel(kb)}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-[var(--line)] pt-3">
            <details className="group flex-1">
              <summary className="cursor-pointer list-none text-sm text-neutral-600 hover:text-emerald-800">
                <span className="group-open:hidden">⑃ Branch this base…</span>
                <span className="hidden group-open:inline">⑃ Branch this base</span>
              </summary>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {/* Derive a limited subset */}
                <form action={deriveKbAction} className="rounded-lg border border-neutral-200 p-4">
                  <input type="hidden" name="masterKbId" value={kb.kbId} />
                  <h4 className="text-sm font-medium">Derive a limited KB</h4>
                  <p className="mt-1 text-xs text-neutral-500">
                    Branches a subset of capabilities into a new KB.
                  </p>
                  <div className="mt-3 grid gap-2">
                    <input
                      name="name"
                      required
                      placeholder={`${kb.name} — beginner`}
                      className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                    />
                    <select name="mode" className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm">
                      <option value="linked">Linked — stays in sync, forks on edit</option>
                      <option value="copied">Copied — independent from the start</option>
                    </select>
                    <label className="flex items-center gap-2 text-xs text-neutral-600">
                      <input type="checkbox" name="includePacks" /> also copy the pack ladder
                    </label>
                    <fieldset>
                      <legend className="text-[11px] text-neutral-500">
                        Capabilities to include ({items.length} — none = all)
                      </legend>
                      <div className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded border border-neutral-200 p-2">
                        {items.length === 0 ? (
                          <p className="text-xs text-neutral-400">No capabilities yet.</p>
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
                    <button
                      type="submit"
                      className="justify-self-start rounded border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:border-emerald-400"
                    >
                      Derive limited KB
                    </button>
                  </div>
                </form>

                {/* Duplicate wholesale */}
                <form action={duplicateKbAction} className="rounded-lg border border-neutral-200 p-4">
                  <input type="hidden" name="kbId" value={kb.kbId} />
                  <h4 className="text-sm font-medium">Duplicate (full copy)</h4>
                  <p className="mt-1 text-xs text-neutral-500">
                    An independent copy of every capability and pack, to build on top of.
                  </p>
                  <div className="mt-3 flex flex-col gap-2">
                    <input
                      name="name"
                      required
                      placeholder={`${kb.name} (copy)`}
                      className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                    />
                    <button
                      type="submit"
                      className="self-start rounded border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:border-emerald-400"
                    >
                      Duplicate
                    </button>
                  </div>
                </form>
              </div>
            </details>

            <DeleteKbButton
              kbId={kb.kbId}
              name={kb.name}
              hasChildren={kids.length > 0}
              action={deleteKbAction}
            />
          </div>
        </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.3em] text-neutral-400">Workspace</p>
        <h1 className="mt-1 text-3xl font-medium">Knowledge bases</h1>
        <p className="mt-2 max-w-xl text-sm text-neutral-600">
          A knowledge base holds one system&apos;s agreements — items, their
          relationships, and the pack ladder players are built from. Each master
          is listed with the limited bases derived from it grouped beneath it;
          everything inside a KB is mutually compatible by construction.
        </p>
      </header>

      {deleted && (
        <p className="mb-6 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Knowledge base deleted.
        </p>
      )}
      {deleteError && (
        <p className="mb-6 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-[color:var(--color-invalid)]">
          {deleteError}
        </p>
      )}

      {kbs.length === 0 ? (
        <section className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          No knowledge bases yet. Create one below, then upload its source
          document and run extraction.
        </section>
      ) : (
        <div className="space-y-10">
          {roots.map((root) => {
            const derivatives = descendantsOf(root.kbId);
            return (
              <section key={root.kbId} className="space-y-4">
                {card(root)}
                {derivatives.length > 0 && (
                  <div className="space-y-4 pl-6">
                    <p className="text-xs uppercase tracking-wide text-neutral-400">
                      Derived from {root.name}
                    </p>
                    {derivatives.map((d) => (
                      <div key={d.kbId}>{card(d)}</div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <section className="mt-10 rounded-lg border border-neutral-200 p-5">
        <h2 className="font-medium">New knowledge base</h2>
        <p className="mt-1 text-xs text-neutral-500">
          A fresh master base. To make a limited version of an existing one,
          use &ldquo;Branch this base&rdquo; above.
        </p>
        <form action={createKbAction} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-neutral-500">Name</span>
            <input
              name="name"
              required
              placeholder="SAYC"
              className="w-full rounded border border-neutral-300 px-2 py-1.5"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-neutral-500">System label</span>
            <input
              name="systemLabel"
              required
              placeholder="SAYC"
              className="w-full rounded border border-neutral-300 px-2 py-1.5"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block text-xs text-neutral-500">Description (optional)</span>
            <input
              name="description"
              placeholder="Standard American Yellow Card, from the official document"
              className="w-full rounded border border-neutral-300 px-2 py-1.5"
            />
          </label>
          <p className="sm:col-span-2">
            <button
              type="submit"
              className="rounded bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
            >
              Create knowledge base
            </button>
          </p>
        </form>
      </section>
    </div>
  );
}

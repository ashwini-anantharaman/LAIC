import Link from "next/link";
import { redirect } from "next/navigation";
import { bridgeLibrary, canCurateCollections, libraryPrincipalOf } from "@/lib/libraryComponent";
import { getBridgeContext } from "@/lib/nexus";
import { nexusProgramId } from "@/lib/nexusPeople";
import { getCollectionDesignations, listBridgeRoles } from "@/lib/nexusBridgeRoles";
import { deleteCollectionAction, saveCollectionAction } from "./actions";

/** Collection manager (curator view): curated, mixed-kind groupings of the
 *  program's items, each designated to an AUDIENCE of roles. Learners see
 *  designated collections in their library without owning copies. */
export default async function CollectionsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ id?: string; saved?: string; deleted?: string; error?: string }> }>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  if (!(await canCurateCollections(context))) redirect("/bridge/library");
  const { id: editId, saved, deleted, error } = await searchParams;

  const principal = await libraryPrincipalOf(context);
  const service = bridgeLibrary();
  const [collections, programItems] = await Promise.all([
    service.listCollections(principal).catch(() => []),
    service.list(principal, { view: "program" }).catch(() => []),
  ]);
  const programId = nexusProgramId(context);
  const [designations, customRoles] = programId
    ? await Promise.all([
        getCollectionDesignations(programId).catch(() => ({}) as Record<string, string[]>),
        listBridgeRoles(programId).catch(() => []),
      ])
    : [{} as Record<string, string[]>, []];

  const editing = editId ? collections.find((c) => c.id === editId) : undefined;
  const audienceOf = (cid: string) =>
    Object.entries(designations)
      .filter(([, ids]) => ids.includes(cid))
      .map(([role]) => role);
  const AUDIENCES: { id: string; label: string }[] = [
    { id: "*", label: "Everyone in the program" },
    { id: "bridge_learner", label: "Learners" },
    { id: "bridge_coach", label: "Coaches" },
    ...customRoles.map((r) => ({ id: r.id, label: r.name })),
  ];
  const roleLabel = (id: string) => AUDIENCES.find((a) => a.id === id)?.label ?? id;

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <p className="text-sm">
          <Link href="/bridge/library" className="text-neutral-500 underline-offset-4 hover:underline">
            Library
          </Link>{" "}
          <span className="text-neutral-400">/ collections</span>
        </p>
        <h1 className="mt-1 text-3xl font-medium">Collections</h1>
        <p className="mt-2 max-w-2xl text-sm text-neutral-600">
          Curated groupings of boards, deals and tables. Designate each collection to an
          audience — those people see it in their library without owning copies.
        </p>
      </header>

      {error && <p className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {saved && <p className="mb-4 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">Collection saved.</p>}
      {deleted && <p className="mb-4 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">Collection deleted.</p>}

      {/* Existing collections */}
      <ul className="space-y-2">
        {collections.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-neutral-200 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{c.name}</p>
              <p className="mt-0.5 text-xs text-neutral-500">
                {c.itemIds.length} item{c.itemIds.length === 1 ? "" : "s"}
                {audienceOf(c.id).length > 0 && (
                  <> · audience: {audienceOf(c.id).map(roleLabel).join(", ")}</>
                )}
                {audienceOf(c.id).length === 0 && <> · not designated yet</>}
              </p>
              {c.description && <p className="mt-0.5 text-xs text-neutral-500">{c.description}</p>}
            </div>
            <Link
              href={`/bridge/library/collections?id=${c.id}`}
              className="rounded border border-neutral-300 px-3 py-1 text-xs font-medium hover:bg-neutral-50"
            >
              Edit
            </Link>
            <form action={deleteCollectionAction}>
              <input type="hidden" name="collectionId" value={c.id} />
              <button type="submit" className="rounded border border-red-200 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50">
                Delete
              </button>
            </form>
          </li>
        ))}
        {collections.length === 0 && (
          <p className="rounded border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
            No collections yet — create the first one below.
          </p>
        )}
      </ul>

      {/* Create / edit form */}
      <section className="mt-8 rounded-lg border border-neutral-200 p-5">
        <h2 className="font-serif text-lg font-medium">{editing ? `Edit “${editing.name}”` : "New collection"}</h2>
        <form action={saveCollectionAction} className="mt-4 space-y-4">
          {editing && <input type="hidden" name="collectionId" value={editing.id} />}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-neutral-500">Name</span>
              <input name="name" required defaultValue={editing?.name ?? ""} placeholder="Week 3 — Trump Contracts" className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-neutral-500">Description (optional)</span>
              <input name="description" defaultValue={editing?.description ?? ""} className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm" />
            </label>
          </div>

          <fieldset>
            <legend className="text-xs font-medium uppercase tracking-wide text-neutral-400">Items ({programItems.length} in the program library)</legend>
            <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded border border-neutral-200 p-3">
              {programItems.map((i) => (
                <label key={i.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="item" value={i.id} defaultChecked={editing?.itemIds.includes(i.id) ?? false} className="h-4 w-4" />
                  <span className="truncate">{i.name}</span>
                  <span className="text-xs text-neutral-400">{i.kind}</span>
                </label>
              ))}
              {programItems.length === 0 && <p className="text-xs text-neutral-400">The program library is empty.</p>}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-xs font-medium uppercase tracking-wide text-neutral-400">Audience (who sees this collection)</legend>
            <div className="mt-2 flex flex-wrap gap-4">
              {AUDIENCES.map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="audience" value={a.id} defaultChecked={editing ? audienceOf(editing.id).includes(a.id) : false} className="h-4 w-4" />
                  {a.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex items-center gap-3">
            <button type="submit" className="rounded bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-800">
              {editing ? "Save changes" : "Create collection"}
            </button>
            {editing && (
              <Link href="/bridge/library/collections" className="text-sm text-neutral-500 underline-offset-4 hover:underline">
                Cancel
              </Link>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}

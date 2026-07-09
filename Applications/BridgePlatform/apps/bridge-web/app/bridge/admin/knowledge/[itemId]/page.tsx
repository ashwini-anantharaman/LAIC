import { notFound } from "next/navigation";
import { saveItemEdit, setItemStatus } from "@/app/bridge/admin/actions";
import { knowledgeStore } from "@/lib/knowledge";

export default async function KnowledgeItemPage({
  params,
}: Readonly<{ params: Promise<{ itemId: string }> }>) {
  const { itemId } = await params;
  const store = knowledgeStore();
  const item = await store.getItem(itemId);
  if (!item) notFound();
  const revisions = await store.listItemRevisions(itemId);
  const gaps = (await Promise.all(item.gapIds.map((g) => store.getGap(g)))).filter(Boolean);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{item.title}</h1>
        <p className="text-xs text-neutral-500">
          {item.itemId} · {item.itemType} · {item.systemFamily} · v{item.version} ·{" "}
          {item.status} · {revisions.length} prior revision{revisions.length === 1 ? "" : "s"}
          {item.citations.length === 0 && (
            <span className="ml-2 rounded bg-amber-50 px-2 py-0.5 text-amber-800">uncited</span>
          )}
        </p>
      </header>

      <section className="rounded-lg border border-neutral-200 p-4">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Where this rule comes from
        </h2>
        {item.citations.length ? (
          <ul className="space-y-1 text-sm">
            {item.citations.map((c, i) => (
              <li key={i}>
                <span className="font-medium">{c.sourceId}:</span>{" "}
                <span className="text-neutral-600">{c.passage}</span>
                {c.passageId && (
                  <a
                    href={`/bridge/admin/sources/${c.sourceId}#${c.passageId.split("#")[1]}`}
                    className="ml-2 text-xs text-emerald-700 hover:underline"
                  >
                    open passage →
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-amber-700">
            No citations yet — rules from this item are badged "uncited" until a
            passage is matched.
          </p>
        )}
        {gaps.length > 0 && (
          <p className="mt-2 text-xs text-neutral-500">
            Linked gaps: {gaps.map((g) => `${g!.gapId} (${g!.resolutionStatus})`).join(", ")}
          </p>
        )}
      </section>

      <form action={saveItemEdit} className="space-y-3 rounded-lg border border-neutral-200 p-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
          Edit (bumps the version; existing package versions keep the old text)
        </h2>
        <input type="hidden" name="itemId" value={item.itemId} />
        <input
          name="title"
          defaultValue={item.title}
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <textarea
          name="humanReadableRule"
          defaultValue={item.humanReadableRule}
          rows={4}
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <textarea
          name="structuredFields"
          defaultValue={JSON.stringify(item.structuredFields, null, 2)}
          rows={12}
          className="w-full rounded border border-neutral-300 px-2 py-1 font-mono text-xs"
        />
        <textarea
          name="reviewerNotes"
          defaultValue={item.reviewerNotes}
          rows={2}
          placeholder="Notes"
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <button type="submit" className="rounded bg-neutral-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-900">
          Save edit
        </button>
      </form>

      <div className="flex gap-2">
        {item.status === "active" ? (
          <form action={setItemStatus}>
            <input type="hidden" name="itemId" value={item.itemId} />
            <input type="hidden" name="status" value="deprecated" />
            <button type="submit" className="rounded border border-red-600 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50">
              Deprecate (exclude from future generations)
            </button>
          </form>
        ) : (
          <form action={setItemStatus}>
            <input type="hidden" name="itemId" value={item.itemId} />
            <input type="hidden" name="status" value="active" />
            <button type="submit" className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800">
              Restore to active
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

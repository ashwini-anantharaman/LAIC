import Link from "next/link";
import { knowledgeStore } from "@/lib/knowledge";

export default async function KnowledgePage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ status?: string; itemType?: string; q?: string }> }>) {
  const { status, itemType, q } = await searchParams;
  let items = await knowledgeStore().listItems({ status, itemType });
  if (q) {
    const needle = q.toLowerCase();
    items = items.filter(
      (it) =>
        it.title.toLowerCase().includes(needle) ||
        it.humanReadableRule.toLowerCase().includes(needle) ||
        it.itemId.toLowerCase().includes(needle),
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Knowledge browser</h1>
        <div className="flex gap-2 text-xs">
          <Link href="/bridge/admin/knowledge" className="text-emerald-700 hover:underline">all</Link>
          <Link href="/bridge/admin/knowledge?status=active" className="text-emerald-700 hover:underline">active</Link>
          <Link href="/bridge/admin/knowledge?status=deprecated" className="text-emerald-700 hover:underline">deprecated</Link>
        </div>
      </header>
      <p className="text-sm text-neutral-500">
        The source of truth: rule packages are generated from active items;
        every generated rule links back here and to its cited sources. Uncited
        items still generate — they are just badged until someone matches them
        to a passage.
      </p>
      <form method="GET" className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search title, rule text, or id…"
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <button type="submit" className="rounded bg-neutral-800 px-3 py-1 text-sm text-white hover:bg-neutral-900">
          Search
        </button>
      </form>
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.itemId}>
            <Link
              href={`/bridge/admin/knowledge/${it.itemId}`}
              className="block rounded-lg border border-neutral-200 p-4 hover:border-emerald-400"
            >
              <div className="flex items-baseline justify-between gap-4">
                <span className="font-medium">{it.title}</span>
                <span className="flex shrink-0 gap-1">
                  {it.citations.length === 0 && (
                    <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-800">uncited</span>
                  )}
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      it.status === "deprecated"
                        ? "bg-red-50 text-red-700"
                        : "bg-emerald-50 text-emerald-800"
                    }`}
                  >
                    {it.status} · v{it.version}
                  </span>
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                {it.itemId} · {it.itemType} · {it.systemFamily} · cites{" "}
                {it.sourceIds.join(", ") || "nothing"}
              </p>
            </Link>
          </li>
        ))}
        {items.length === 0 && (
          <li className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
            No items match.
          </li>
        )}
      </ul>
    </div>
  );
}

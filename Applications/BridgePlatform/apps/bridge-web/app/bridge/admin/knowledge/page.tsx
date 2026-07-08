import Link from "next/link";
import { knowledgeStore } from "@/lib/knowledge";

const STATUS_STYLE: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-800",
  needs_review: "bg-amber-50 text-amber-800",
  draft: "bg-neutral-100 text-neutral-600",
  deprecated: "bg-red-50 text-red-700",
};

export default async function KnowledgePage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ status?: string; itemType?: string }> }>) {
  const { status, itemType } = await searchParams;
  const items = await knowledgeStore().listItems({ status, itemType });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          Human-readable knowledge base
        </h1>
        <div className="flex gap-2 text-xs">
          <Link href="/bridge/admin/knowledge" className="text-emerald-700 hover:underline">all</Link>
          <Link href="/bridge/admin/knowledge?status=needs_review" className="text-emerald-700 hover:underline">needs review</Link>
          <Link href="/bridge/admin/knowledge?status=approved" className="text-emerald-700 hover:underline">approved</Link>
        </div>
      </header>
      <p className="text-sm text-neutral-500">
        The reviewed source of truth: runtime rule packages are generated from
        approved items; every generated rule links back here and to its cited
        sources.
      </p>
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.itemId}>
            <Link
              href={`/bridge/admin/knowledge/${it.itemId}`}
              className="block rounded-lg border border-neutral-200 p-4 hover:border-emerald-400"
            >
              <div className="flex items-baseline justify-between gap-4">
                <span className="font-medium">{it.title}</span>
                <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${STATUS_STYLE[it.status]}`}>
                  {it.status} · v{it.version}
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                {it.itemId} · {it.itemType} · {it.systemFamily} · cites{" "}
                {it.sourceIds.join(", ") || "nothing (!)"}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

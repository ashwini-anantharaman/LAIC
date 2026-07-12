import Link from "next/link";
import { knowledgeStore } from "@/lib/knowledge";

export default async function AdminPage() {
  const store = knowledgeStore();
  const [sources, items, gaps, packages] = await Promise.all([
    store.listSources(),
    store.listItems(),
    store.listGaps(),
    store.listPackages(),
  ]);
  const uncited = items.filter((i) => i.status === "active" && i.citations.length === 0).length;
  const openGaps = gaps.filter(
    (g) => g.resolutionStatus === "open" || g.resolutionStatus === "expert_decision_needed",
  ).length;

  const sections = [
    {
      href: "/bridge/admin/sources",
      title: "Knowledge sources",
      body: `${sources.length} registered. Every rule traces back to one.`,
    },
    {
      href: "/bridge/admin/knowledge",
      title: "Knowledge browser",
      body: `${items.length} items (${uncited} uncited). The human-readable source of truth.`,
    },
    {
      href: "/bridge/admin/gaps",
      title: "Gap registry",
      body: `${gaps.length} gaps (${openGaps} open). Explicit, never silently filled.`,
    },
    {
      href: "/bridge/admin/runs",
      title: "Generation runs & packages",
      body: `${packages.length} package versions. Active knowledge → validated, versioned rule packages.`,
    },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Knowledge admin</h1>
        <p className="text-sm text-neutral-600">
          Author and edit bridge knowledge, then generate versioned rule
          packages players run against.
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-lg border border-neutral-200 p-5 hover:border-emerald-400"
          >
            <h2 className="mb-2 font-medium">{s.title}</h2>
            <p className="text-sm text-neutral-600">{s.body}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

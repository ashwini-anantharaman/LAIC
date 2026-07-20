import type { KnowledgePhase, KnowledgeType } from "@bridge/kb";
import Link from "next/link";
import { AccordionGroup, AccordionSection } from "@/components/kb/Accordion";
import { StatusBadge, TYPE_LABEL } from "@/components/kb/badges";
import { kbStore } from "@/lib/kb";

const PHASES: KnowledgePhase[] = ["auction", "opening_lead", "declarer_play", "defense", "scoring"];

const plural = (label: string) =>
  label.endsWith("y") ? `${label.slice(0, -1)}ies` : `${label}s`;

/** The Master list — every knowledge item (template) in this KB: searchable,
 *  faceted, grouped by kind into accordions whose open state is remembered. */
export default async function ItemsPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ kbId: string }>;
  searchParams: Promise<{ q?: string; type?: string; phase?: string; status?: string }>;
}>) {
  const { kbId } = await params;
  const { q, type, phase, status } = await searchParams;
  const items = await kbStore().listItemsForKb(kbId);

  const query = (q ?? "").toLowerCase();
  const filtered = items
    .filter((i) => !query || `${i.title} ${i.humanReadableText}`.toLowerCase().includes(query))
    .filter((i) => !type || i.knowledgeType === type)
    .filter((i) => !phase || i.phase === phase)
    .filter((i) => (status ? i.status === status : i.status !== "deprecated"))
    .sort((a, b) => a.title.localeCompare(b.title));

  const groups = (Object.keys(TYPE_LABEL) as KnowledgeType[])
    .map((kind) => ({ kind, items: filtered.filter((i) => i.knowledgeType === kind) }))
    .filter((g) => g.items.length > 0);

  const base = `/bridge/kb/${kbId}`;

  return (
    <div>
      <form className="mb-4 flex flex-wrap items-end gap-3" method="GET">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-neutral-500">Search</span>
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="stayman, 1NT, lead…"
            className="w-56 rounded border border-neutral-300 px-2 py-1.5"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-neutral-500">Kind</span>
          <select name="type" defaultValue={type ?? ""} className="rounded border border-neutral-300 px-2 py-1.5">
            <option value="">all</option>
            {Object.entries(TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-neutral-500">Phase</span>
          <select name="phase" defaultValue={phase ?? ""} className="rounded border border-neutral-300 px-2 py-1.5">
            <option value="">all</option>
            {PHASES.map((p) => (
              <option key={p} value={p}>
                {p.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-neutral-500">Status</span>
          <select name="status" defaultValue={status ?? ""} className="rounded border border-neutral-300 px-2 py-1.5">
            <option value="">active (default)</option>
            {["draft", "reviewed", "approved", "deprecated"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:border-emerald-400">
          Filter
        </button>
        <Link
          href={`${base}/items/new`}
          className="ml-auto rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
        >
          New knowledge item
        </Link>
      </form>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          Nothing here yet — run extraction on a source, or author a knowledge item by hand.
        </p>
      ) : (
        <AccordionGroup
          storageKey={`bridge.kb.${kbId}.master.groups.v1`}
          sectionIds={groups.map((g) => g.kind)}
        >
          {groups.map((group) => (
            <AccordionSection
              key={group.kind}
              id={group.kind}
              summary={
                <>
                  <span className="font-serif text-lg font-medium capitalize">
                    {plural(TYPE_LABEL[group.kind])}
                  </span>
                  <span className="text-xs text-neutral-400">{group.items.length}</span>
                </>
              }
            >
              <ul className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
                {group.items.map((item) => (
                  <li key={item.itemId}>
                    <Link
                      href={`${base}/items/${item.itemId}`}
                      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3 hover:bg-neutral-50"
                    >
                      <span className="font-serif text-[15px] font-medium">{item.title}</span>
                      <StatusBadge status={item.status} />
                      {item.settings.length > 0 && (
                        <span className="text-[10px] uppercase tracking-wide text-emerald-700">
                          {item.settings.length} setting{item.settings.length > 1 ? "s" : ""}
                        </span>
                      )}
                      <span className="ml-auto hidden max-w-md truncate text-xs text-neutral-400 sm:block">
                        {item.humanReadableText}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </AccordionSection>
          ))}
        </AccordionGroup>
      )}
    </div>
  );
}

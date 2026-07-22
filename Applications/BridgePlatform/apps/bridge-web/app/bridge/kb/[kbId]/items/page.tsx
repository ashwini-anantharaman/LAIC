import type { KnowledgeItem, KnowledgePhase, KnowledgeType } from "@bridge/kb";
import Link from "next/link";
import { deprecateItemsAction } from "@/app/bridge/kb/actions";
import { AccordionGroup, AccordionSection } from "@/components/kb/Accordion";
import { bandLine, StatusBadge, TYPE_DESCRIPTION, TYPE_LABEL } from "@/components/kb/badges";
import { BulkItemsForm } from "@/components/kb/BulkItemsForm";
import { BulkResultBanner } from "@/components/kb/BulkResultBanner";
import { SelectNav } from "@/components/kb/SelectNav";
import { ViewerPrefs } from "@/components/kb/ViewerPrefs";
import { kbStore } from "@/lib/kb";
import { WHEN_LABEL, WHEN_ORDER, whenOf, whenRoles } from "@/lib/whenFacet";

const PHASES: KnowledgePhase[] = ["auction", "opening_lead", "declarer_play", "defense", "scoring"];
const PHASE_LABEL: Record<KnowledgePhase, string> = {
  auction: "Bidding",
  opening_lead: "Opening leads",
  declarer_play: "Declarer play",
  defense: "Defense",
  scoring: "Scoring",
};
const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  reviewed: "Reviewed",
  approved: "Approved",
  deprecated: "Deprecated",
};

const plural = (label: string) =>
  label.endsWith("y") ? `${label.slice(0, -1)}ies` : `${label}s`;

/** How many executable rules an item carries (0 = teaching prose). */
function ruleCount(item: KnowledgeItem): number {
  const p = item.payload;
  switch (p.kind) {
    case "auction_rules":
      return p.rules.length;
    case "forcing_rules":
      return p.rules.length;
    case "play_rules":
      return p.rules.length;
    case "lead_rules":
      return p.leads.length;
    case "signals":
    case "fallback":
      return 1;
    default:
      return 0;
  }
}

function contentLabel(item: KnowledgeItem): string {
  const n = ruleCount(item);
  if (item.payload.kind === "signals") return "signal policy";
  if (item.payload.kind === "fallback") return "fallback";
  if (item.payload.kind === "forcing_rules")
    return `${n} forcing situation${n === 1 ? "" : "s"}`;
  if (n === 0) return "teaching prose";
  const noun = item.payload.kind === "lead_rules" ? "lead rule" : "rule";
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

type View = "cards" | "list" | "table";
type Group = "kind" | "phase" | "status" | "when" | "none";
type Sort = "title" | "updated" | "rules";

/** Does the item speak in this auction position? ("any"-role rules match all
 *  four positions; items with no auction roles never match.) */
function matchesWhen(item: KnowledgeItem, when: string): boolean {
  const roles = whenRoles(item);
  if (when === "opening") return roles.has("opening") || roles.has("any");
  if (when === "responding") return roles.has("responder") || roles.has("any");
  if (when === "rebidding") return roles.has("opener") || roles.has("any");
  if (when === "competing")
    return roles.has("overcaller") || roles.has("advancer") || roles.has("any");
  return true;
}

/** The Master knowledge viewer: three views (cards for reading, list for
 *  working, table for auditing), groupable and sortable, all URL-driven. */
export default async function ItemsPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ kbId: string }>;
  searchParams: Promise<{
    q?: string;
    type?: string;
    phase?: string;
    status?: string;
    when?: string;
    tag?: string;
    view?: string;
    group?: string;
    sort?: string;
    bulkDeleted?: string;
    bulkDeprecated?: string;
    bulkBlocked?: string;
    bulkSets?: string;
  }>;
}>) {
  const { kbId } = await params;
  const sp = await searchParams;
  const { q, type, phase, status, when, tag, bulkDeleted, bulkDeprecated, bulkBlocked, bulkSets } = sp;
  const view: View = sp.view === "list" || sp.view === "table" ? sp.view : "cards";
  const group: Group =
    sp.group === "phase" || sp.group === "status" || sp.group === "when" || sp.group === "none"
      ? sp.group
      : "kind";
  const sort: Sort = sp.sort === "updated" || sp.sort === "rules" ? sp.sort : "title";

  const items = await kbStore().listItemsForKb(kbId);

  const query = (q ?? "").toLowerCase();
  const filtered = items
    .filter((i) => !query || `${i.title} ${i.humanReadableText}`.toLowerCase().includes(query))
    .filter((i) => !type || i.knowledgeType === type)
    .filter((i) => !phase || i.phase === phase)
    .filter((i) => (status ? i.status === status : i.status !== "deprecated"))
    .filter((i) => !when || matchesWhen(i, when))
    .filter((i) => !tag || (i.tags ?? []).includes(tag))
    .sort((a, b) => {
      if (sort === "updated") return b.updatedAt.localeCompare(a.updatedAt);
      if (sort === "rules") return ruleCount(b) - ruleCount(a) || a.title.localeCompare(b.title);
      return a.title.localeCompare(b.title);
    });

  // ---- grouping ------------------------------------------------------------
  let groups: { id: string; label: string; items: KnowledgeItem[] }[];
  if (group === "phase") {
    groups = PHASES.map((p) => ({
      id: p,
      label: PHASE_LABEL[p],
      items: filtered.filter((i) => i.phase === p),
    }));
  } else if (group === "status") {
    groups = ["draft", "reviewed", "approved", "deprecated"].map((s) => ({
      id: s,
      label: STATUS_LABEL[s] ?? s,
      items: filtered.filter((i) => i.status === s),
    }));
  } else if (group === "when") {
    groups = WHEN_ORDER.map((w) => ({
      id: w,
      label: WHEN_LABEL[w],
      items: filtered.filter((i) => whenOf(i) === w),
    }));
  } else if (group === "none") {
    groups = [{ id: "all", label: "All knowledge", items: filtered }];
  } else {
    groups = (Object.keys(TYPE_LABEL) as KnowledgeType[]).map((kind) => ({
      id: kind,
      label: plural(TYPE_LABEL[kind]),
      items: filtered.filter((i) => i.knowledgeType === kind),
    }));
  }
  groups = groups.filter((g) => g.items.length > 0);

  const base = `/bridge/kb/${kbId}`;
  const qs = (overrides: Record<string, string | undefined>) => {
    const merged: Record<string, string | undefined> = {
      q, type, phase, status, when, tag, view, group, sort, ...overrides,
    };
    // Defaults stay out of the URL so links stay clean.
    if (merged.view === "cards") delete merged.view;
    if (merged.group === "kind") delete merged.group;
    if (merged.sort === "title") delete merged.sort;
    const p = new URLSearchParams(
      Object.entries(merged).filter(([, v]) => v) as [string, string][],
    ).toString();
    return `${base}/items${p ? `?${p}` : ""}`;
  };
  const returnTo = qs({});
  // Detail pages get a `from` param so their back link restores this exact
  // list shape (filters + view/group/sort).
  const itemHref = (item: KnowledgeItem) =>
    `${base}/items/${item.itemId}?from=${encodeURIComponent(returnTo)}`;

  // Tag facet is built from ALL items (not the filtered set) so options don't
  // vanish as you narrow.
  const allTags = [...new Set(items.flatMap((i) => i.tags ?? []))].sort();

  /** Muted priority-band suffix for kind group headers ("· convention (band 1 — …)"). */
  const kindSuffix = (id: string) =>
    group === "kind" ? (
      <span className="text-xs font-normal normal-case text-neutral-400">
        {" "}
        · {bandLine(id as KnowledgeType) ?? "teaching prose — never plays"}
      </span>
    ) : null;

  const tagChips = (item: KnowledgeItem) =>
    (item.tags ?? []).map((t) => (
      <Link
        key={t}
        href={qs({ tag: t })}
        className="relative rounded-full border border-neutral-200 px-1.5 py-0.5 text-[10px] text-neutral-500 hover:border-emerald-400 hover:text-emerald-800"
      >
        {t}
      </Link>
    ));

  const kindChip = (item: KnowledgeItem) => (
    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-600">
      {TYPE_LABEL[item.knowledgeType]}
    </span>
  );
  const phaseChip = (item: KnowledgeItem) => (
    <span className="text-[10px] uppercase tracking-wide text-neutral-400">
      {PHASE_LABEL[item.phase]}
    </span>
  );
  const toggleChip = (item: KnowledgeItem) => {
    const enable = item.settings.find((s) => s.role === "enable");
    if (!enable) return null;
    return (
      <span
        title={`Players can switch this on/off (${enable.key})`}
        className={`text-[10px] uppercase tracking-wide ${enable.default ? "text-emerald-700" : "text-neutral-400"}`}
      >
        {enable.default ? "on by default" : "off by default"}
      </span>
    );
  };

  // ---- the three bodies ------------------------------------------------------

  const cards = (
    <AccordionGroup
      storageKey={`bridge.kb.${kbId}.master.groups.v1`}
      sectionIds={groups.map((g) => g.id)}
    >
      {groups.map((g) => (
        <AccordionSection
          key={g.id}
          id={g.id}
          summary={
            <>
              <span className="font-serif text-lg font-medium capitalize">
                {g.label}
                {kindSuffix(g.id)}
              </span>
              <span className="text-xs text-neutral-400">{g.items.length}</span>
            </>
          }
        >
          <div className="grid gap-3 border-t border-[var(--line)] p-4 sm:grid-cols-2">
            {g.items.map((item) => (
              // Stretched-link card: the title link's ::after covers the card,
              // so tag chips can stay real links (no nested anchors).
              <div
                key={item.itemId}
                className="group relative flex flex-col rounded-xl border border-neutral-200 bg-[var(--card)] p-4 shadow-sm transition-shadow hover:border-emerald-300 hover:shadow"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={itemHref(item)}
                    className="font-serif text-[15px] font-medium after:absolute after:inset-0 after:content-[''] group-hover:text-emerald-900"
                  >
                    {item.title}
                  </Link>
                  <StatusBadge status={item.status} />
                </div>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-neutral-600">
                  {item.humanReadableText}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-2">
                  {kindChip(item)}
                  {phaseChip(item)}
                  <span className="text-[10px] uppercase tracking-wide text-neutral-400">
                    {contentLabel(item)}
                  </span>
                  {tagChips(item)}
                  <span className="ml-auto">{toggleChip(item)}</span>
                </div>
              </div>
            ))}
          </div>
        </AccordionSection>
      ))}
    </AccordionGroup>
  );

  const bulkProps = {
    kbId,
    returnTo,
    action: deprecateItemsAction,
    verb: "Deprecate",
    warning:
      "Deprecate the selected items? They stop compiling and are hidden from the default view — reversible from each item's Status.",
  };

  const list = (
    <BulkItemsForm {...bulkProps}>
      <AccordionGroup
        storageKey={`bridge.kb.${kbId}.master.groups.v1`}
        sectionIds={groups.map((g) => g.id)}
      >
        {groups.map((g) => (
          <AccordionSection
            key={g.id}
            id={g.id}
            summary={
              <>
                <span className="font-serif text-lg font-medium capitalize">
                  {g.label}
                  {kindSuffix(g.id)}
                </span>
                <span className="text-xs text-neutral-400">{g.items.length}</span>
              </>
            }
          >
            <ul className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
              {g.items.map((item) => (
                <li key={item.itemId} className="flex items-stretch">
                  <label className="flex cursor-pointer items-center pl-4 pr-1">
                    <input
                      type="checkbox"
                      name="itemIds"
                      value={item.itemId}
                      aria-label={`Select ${item.title}`}
                      className="h-4 w-4 accent-emerald-700"
                    />
                  </label>
                  <Link
                    href={itemHref(item)}
                    className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-3 hover:bg-neutral-50"
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
    </BulkItemsForm>
  );

  const th = "px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-neutral-500";
  const table = (
    <BulkItemsForm {...bulkProps}>
      <div className="space-y-6">
        {groups.map((g) => (
          <section key={g.id}>
            {group !== "none" && (
              <h2 className="mb-2 font-serif text-lg font-medium capitalize">
                {g.label}
                {kindSuffix(g.id)}{" "}
                <span className="text-xs font-normal text-neutral-400">{g.items.length}</span>
              </h2>
            )}
            <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-[var(--card)]">
              <table className="w-full text-sm">
                <thead className="border-b border-neutral-200">
                  <tr>
                    <th className={th} />
                    <th className={th}>
                      <Link href={qs({ sort: "title" })} className="hover:text-emerald-800">
                        Title {sort === "title" && "↑"}
                      </Link>
                    </th>
                    <th className={th}>Kind</th>
                    <th className={th}>Phase</th>
                    <th className={th}>
                      <Link href={qs({ sort: "rules" })} className="hover:text-emerald-800">
                        Content {sort === "rules" && "↓"}
                      </Link>
                    </th>
                    <th className={th}>Toggle</th>
                    <th className={th}>Status</th>
                    <th className={th}>
                      <Link href={qs({ sort: "updated" })} className="hover:text-emerald-800">
                        Updated {sort === "updated" && "↓"}
                      </Link>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {g.items.map((item) => (
                    <tr key={item.itemId} className="hover:bg-neutral-50">
                      <td className="pl-3">
                        <input
                          type="checkbox"
                          name="itemIds"
                          value={item.itemId}
                          aria-label={`Select ${item.title}`}
                          className="h-4 w-4 accent-emerald-700"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          href={itemHref(item)}
                          className="font-medium text-emerald-900 underline-offset-2 hover:underline"
                        >
                          {item.title}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-xs text-neutral-600">
                        {TYPE_LABEL[item.knowledgeType]}
                      </td>
                      <td className="px-3 py-2 text-xs text-neutral-600">{PHASE_LABEL[item.phase]}</td>
                      <td className="px-3 py-2 text-xs text-neutral-600">{contentLabel(item)}</td>
                      <td className="px-3 py-2 text-xs">{toggleChip(item) ?? <span className="text-neutral-300">—</span>}</td>
                      <td className="px-3 py-2">
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="px-3 py-2 text-xs tabular-nums text-neutral-500">
                        {item.updatedAt.slice(0, 10)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </BulkItemsForm>
  );

  const explicit = sp.view !== undefined || sp.group !== undefined || sp.sort !== undefined;

  return (
    <div>
      <ViewerPrefs
        storageKey={`bridge.kb.${kbId}.master.prefs.v1`}
        view={view}
        group={group}
        sort={sort}
        explicit={explicit}
      />
      <BulkResultBanner deleted={bulkDeleted} deprecated={bulkDeprecated} blocked={bulkBlocked} sets={bulkSets} />

      {/* Toolbar: search + facets (GET form) and view/group/sort (links). */}
      <form className="mb-3 flex flex-wrap items-end gap-3" method="GET">
        {view !== "cards" && <input type="hidden" name="view" value={view} />}
        {group !== "kind" && <input type="hidden" name="group" value={group} />}
        {sort !== "title" && <input type="hidden" name="sort" value={sort} />}
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
              <option key={value} value={value} title={TYPE_DESCRIPTION[value as KnowledgeType]}>
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
                {PHASE_LABEL[p]}
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
        <label className="text-sm">
          <span className="mb-1 block text-xs text-neutral-500">Applies when</span>
          <select name="when" defaultValue={when ?? ""} className="rounded border border-neutral-300 px-2 py-1.5">
            <option value="">any stage</option>
            {(["opening", "responding", "rebidding", "competing"] as const).map((w) => (
              <option key={w} value={w}>
                {WHEN_LABEL[w]}
              </option>
            ))}
          </select>
        </label>
        {allTags.length > 0 && (
          <label className="text-sm">
            <span className="mb-1 block text-xs text-neutral-500">Tag</span>
            <select name="tag" defaultValue={tag ?? ""} className="rounded border border-neutral-300 px-2 py-1.5">
              <option value="">all</option>
              {allTags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        )}
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

      <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-[var(--line)] pb-3 text-xs">
        <SelectNav
          label="View"
          value={view}
          options={[
            { value: "cards", label: "Cards", href: qs({ view: "cards" }) },
            { value: "list", label: "List", href: qs({ view: "list" }) },
            { value: "table", label: "Table", href: qs({ view: "table" }) },
          ]}
        />
        <SelectNav
          label="Group by"
          value={group}
          options={[
            { value: "kind", label: "Kind — what it is", href: qs({ group: "kind" }) },
            { value: "phase", label: "Phase", href: qs({ group: "phase" }) },
            { value: "status", label: "Status", href: qs({ group: "status" }) },
            { value: "when", label: "When — auction position", href: qs({ group: "when" }) },
            { value: "none", label: "None", href: qs({ group: "none" }) },
          ]}
        />
        <SelectNav
          label="Sort"
          value={sort}
          options={[
            { value: "title", label: "A–Z", href: qs({ sort: "title" }) },
            { value: "updated", label: "Recently updated", href: qs({ sort: "updated" }) },
            { value: "rules", label: "Most rules", href: qs({ sort: "rules" }) },
          ]}
        />
        <span className="ml-auto text-neutral-400">
          {filtered.length} item{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          Nothing here yet — run extraction on a source, install a template, or author a
          knowledge item by hand.
        </p>
      ) : view === "cards" ? (
        cards
      ) : view === "table" ? (
        table
      ) : (
        list
      )}
    </div>
  );
}

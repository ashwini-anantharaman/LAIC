import type { KnowledgeItem, KnowledgePhase, KnowledgeType } from "@bridge/kb";
import Link from "next/link";
import { AccordionGroup, AccordionSection } from "@/components/kb/Accordion";
import { bandLine, bandOf, BAND_TEXT, StatusBadge, TYPE_DESCRIPTION, TYPE_LABEL } from "@/components/kb/badges";
import { SelectNav } from "@/components/kb/SelectNav";
import { ViewerPrefs } from "@/components/kb/ViewerPrefs";
import { kbStore } from "@/lib/kb";
import { applyMasterQuery, parseMasterQuery, ruleCount } from "@/lib/masterQuery";
import { WHEN_LABEL, WHEN_ORDER, whenOf } from "@/lib/whenFacet";
import { setItemStatusAction } from "../../actions";

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

/** Rule lines an item contributes, with their priority (for the Priority view).
 *  Priorities only tie-break within a band; lower fires first. */
function itemRules(item: KnowledgeItem): { label: string; priority?: number }[] {
  const p = item.payload;
  if (p.kind === "auction_rules" || p.kind === "forcing_rules")
    return p.rules.map((r) => ({ label: r.label, priority: r.priority }));
  if (p.kind === "play_rules")
    return p.rules.map((r) => ({ label: r.behavior.replace(/_/g, " "), priority: r.priority }));
  if (p.kind === "lead_rules")
    return p.leads.map((l) => ({ label: `${l.style.replace(/_/g, " ")} vs ${l.versus}` }));
  if (p.kind === "signals") return [{ label: "signal policy" }];
  if (p.kind === "fallback") return [{ label: `fallback: ${p.fallback.behavior.replace(/_/g, " ")}` }];
  return [];
}

type View = "cards" | "list" | "table" | "priority";
type Group = "kind" | "phase" | "status" | "when" | "band" | "none";
type Sort = "title" | "updated" | "rules";

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
    statusSet?: string;
  }>;
}>) {
  const { kbId } = await params;
  const sp = await searchParams;
  const { q, type, phase, status, when, tag, statusSet } = sp;
  const view: View =
    sp.view === "list" || sp.view === "table" || sp.view === "priority" ? sp.view : "cards";
  const group: Group =
    sp.group === "phase" ||
    sp.group === "status" ||
    sp.group === "when" ||
    sp.group === "band" ||
    sp.group === "none"
      ? sp.group
      : "kind";
  const sort: Sort = sp.sort === "updated" || sp.sort === "rules" ? sp.sort : "title";

  const items = await kbStore().listItemsForKb(kbId);

  // Filter + sort via the shared Master query module (same semantics the item
  // page re-runs for prev/next review navigation).
  const filtered = applyMasterQuery(items, parseMasterQuery(sp));

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
  } else if (group === "band") {
    // Precedence bands, in firing order; teaching prose (no band) last.
    groups = [
      ...[0, 1, 2, 9].map((b) => ({
        id: `band-${b}`,
        label: `${BAND_TEXT[b]!.name} (${BAND_TEXT[b]!.blurb})`,
        items: filtered.filter((i) => bandOf(i.knowledgeType) === b),
      })),
      {
        id: "band-none",
        label: "teaching prose — never plays",
        items: filtered.filter((i) => bandOf(i.knowledgeType) === null),
      },
    ];
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

  // List-view row-approve controls: advance an item's trust status inline
  // without opening it. Real forms (siblings of the stretched row link), so
  // they need `relative z-10` to sit above the link's ::after overlay. The
  // returnTo is this exact list url so we land back here with a statusSet banner.
  const approveControls = (item: KnowledgeItem) => {
    if (item.status !== "draft" && item.status !== "reviewed") return null;
    const btn = (status: string, label: string, primary: boolean) => (
      <form action={setItemStatusAction} className="relative">
        <input type="hidden" name="kbId" value={kbId} />
        <input type="hidden" name="itemId" value={item.itemId} />
        <input type="hidden" name="status" value={status} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <button
          type="submit"
          className={
            primary
              ? "rounded bg-emerald-700 px-2 py-0.5 text-xs font-medium text-white hover:bg-emerald-800"
              : "rounded border border-neutral-300 px-2 py-0.5 text-xs hover:border-emerald-400 hover:text-emerald-800"
          }
        >
          {label}
        </button>
      </form>
    );
    return (
      <div className="relative z-10 flex shrink-0 items-center gap-1.5 pr-4">
        {item.status === "draft" && btn("reviewed", "Reviewed", false)}
        {btn("approved", "Approve", true)}
      </div>
    );
  };

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

  // ---- priority view: bands → items → rules, in firing order ----------------
  // The compiler orders every rule by band (×100k) then priority, first match
  // wins. This lays that out: each band, the items whose type sits in it, and
  // each item's rules with their priority (lower fires first).
  const BAND_ORDER = [0, 1, 2, 9] as const;
  const priorityBands = BAND_ORDER.map((band) => {
    const bandItems = filtered
      .filter((i) => bandOf(i.knowledgeType) === band && itemRules(i).length > 0)
      .map((i) => ({
        item: i,
        rules: itemRules(i)
          .slice()
          .sort((a, b) => (a.priority ?? 1e9) - (b.priority ?? 1e9)),
      }))
      // Items with the lowest-priority rule first — approximates firing order.
      .sort(
        (a, b) =>
          (a.rules[0]?.priority ?? 1e9) - (b.rules[0]?.priority ?? 1e9) ||
          a.item.title.localeCompare(b.item.title),
      );
    return { band, items: bandItems };
  }).filter((b) => b.items.length > 0);

  const priority = (
    <div className="space-y-6">
      <p className="text-xs text-neutral-500">
        The order the engine actually reads rules in: by <b>band</b> first, then by{" "}
        <b>priority</b> within an item (lower fires first). The first rule whose context and
        hand conditions match wins.
      </p>
      {priorityBands.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
          No executable rules match the current filters.
        </p>
      ) : (
        <AccordionGroup
          storageKey={`bridge.kb.${kbId}.priority.bands.v1`}
          sectionIds={priorityBands.map(({ band }) => `band-${band}`)}
        >
          {priorityBands.map(({ band, items: bandItems }) => (
            <AccordionSection
              key={band}
              id={`band-${band}`}
              summary={
                <>
                  <span className="font-serif text-lg font-medium capitalize">
                    {BAND_TEXT[band]?.name ?? `band ${band}`}
                    <span className="ml-2 text-xs font-normal normal-case text-neutral-400">
                      {BAND_TEXT[band]?.blurb}
                    </span>
                  </span>
                  <span className="text-xs text-neutral-400">{bandItems.length}</span>
                </>
              }
            >
              <ul className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
                {bandItems.map(({ item, rules }) => (
                  <li key={item.itemId} className="px-4 py-2.5">
                    {/* Each item folds too — a fat item scans as one line. */}
                    <details open>
                      <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-2 [&::-webkit-details-marker]:hidden">
                        <span aria-hidden className="text-[9px] text-neutral-400">
                          ▾
                        </span>
                        <Link
                          href={itemHref(item)}
                          className="font-serif text-[15px] font-medium hover:text-emerald-900"
                        >
                          {item.title}
                        </Link>
                        {kindChip(item)}
                        <StatusBadge status={item.status} />
                        <span className="ml-auto text-xs text-neutral-400">
                          {rules.length} rule{rules.length === 1 ? "" : "s"}
                        </span>
                      </summary>
                      <ul className="mt-1.5 space-y-0.5 pl-4">
                        {rules.map((r, i) => (
                          <li key={i} className="flex items-baseline gap-2 text-sm">
                            <span className="w-14 flex-none font-mono text-xs text-neutral-400">
                              {r.priority === undefined ? "—" : `p${r.priority}`}
                            </span>
                            <span className="text-neutral-700">{r.label}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                ))}
              </ul>
            </AccordionSection>
          ))}
        </AccordionGroup>
      )}
    </div>
  );

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

  const list = (
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
              // Stretched-link row: the row link's ::after covers the <li>, so
              // the approve forms stay real siblings (no nested anchors).
              <li key={item.itemId} className="group relative flex items-stretch hover:bg-neutral-50">
                <Link
                  href={itemHref(item)}
                  className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 after:absolute after:inset-0 after:content-['']"
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
                {approveControls(item)}
              </li>
            ))}
          </ul>
        </AccordionSection>
      ))}
    </AccordionGroup>
  );

  const th = "px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-neutral-500";
  const table = (
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

      {statusSet && (
        <p className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Status updated to <span className="font-medium">{statusSet}</span>.
        </p>
      )}

      {/* Toolbar: search (GET form) + facets (SelectNav navigations). Every
          facet auto-applies on change; only search waits for Enter. */}
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <form className="flex items-end gap-3" method="GET">
          {/* Carry every OTHER current param so Enter preserves state. */}
          {type && <input type="hidden" name="type" value={type} />}
          {phase && <input type="hidden" name="phase" value={phase} />}
          {status && <input type="hidden" name="status" value={status} />}
          {when && <input type="hidden" name="when" value={when} />}
          {tag && <input type="hidden" name="tag" value={tag} />}
          {view !== "cards" && <input type="hidden" name="view" value={view} />}
          {group !== "kind" && <input type="hidden" name="group" value={group} />}
          {sort !== "title" && <input type="hidden" name="sort" value={sort} />}
          <label className="text-sm">
            <span className="mb-1 block text-xs text-neutral-500">Search</span>
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search… press Enter"
              className="w-56 rounded border border-neutral-300 px-2 py-1.5"
            />
          </label>
        </form>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-neutral-500">Kind</span>
          <SelectNav
            label=""
            value={type ?? ""}
            options={[
              { value: "", label: "all", href: qs({ type: undefined }) },
              ...Object.entries(TYPE_LABEL).map(([value, label]) => ({
                value,
                label,
                href: qs({ type: value }),
                title: TYPE_DESCRIPTION[value as KnowledgeType],
              })),
            ]}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-neutral-500">Phase</span>
          <SelectNav
            label=""
            value={phase ?? ""}
            options={[
              { value: "", label: "all", href: qs({ phase: undefined }) },
              ...PHASES.map((p) => ({ value: p, label: PHASE_LABEL[p], href: qs({ phase: p }) })),
            ]}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-neutral-500">Status</span>
          <SelectNav
            label=""
            value={status ?? ""}
            options={[
              { value: "", label: "active (default)", href: qs({ status: undefined }) },
              ...["draft", "reviewed", "approved", "deprecated"].map((s) => ({
                value: s,
                label: s,
                href: qs({ status: s }),
              })),
            ]}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-neutral-500">Applies when</span>
          <SelectNav
            label=""
            value={when ?? ""}
            options={[
              { value: "", label: "any stage", href: qs({ when: undefined }) },
              ...(["opening", "responding", "rebidding", "competing"] as const).map((w) => ({
                value: w,
                label: WHEN_LABEL[w],
                href: qs({ when: w }),
              })),
            ]}
          />
        </label>
        {allTags.length > 0 && (
          <label className="text-sm">
            <span className="mb-1 block text-xs text-neutral-500">Tag</span>
            <SelectNav
              label=""
              value={tag ?? ""}
              options={[
                { value: "", label: "all", href: qs({ tag: undefined }) },
                ...allTags.map((t) => ({ value: t, label: t, href: qs({ tag: t }) })),
              ]}
            />
          </label>
        )}
        <Link
          href={`${base}/items/new`}
          className="ml-auto rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
        >
          New knowledge item
        </Link>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-[var(--line)] pb-3 text-xs">
        <SelectNav
          label="View"
          value={view}
          options={[
            { value: "cards", label: "Cards", href: qs({ view: "cards" }) },
            { value: "list", label: "List", href: qs({ view: "list" }) },
            { value: "table", label: "Table", href: qs({ view: "table" }) },
            { value: "priority", label: "Priority — firing order", href: qs({ view: "priority" }) },
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
            { value: "band", label: "Band — who outranks whom", href: qs({ group: "band" }) },
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
      ) : view === "priority" ? (
        priority
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

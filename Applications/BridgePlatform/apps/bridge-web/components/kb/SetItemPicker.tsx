"use client";

// Knowledge-set roster picker (2026-07-17 UX rework): grouped by knowledge
// type, searchable, per-group select all/none, with the optional "Includes"
// select built in so items arriving via the included set render as locked
// rows. Posts plain `itemIds` hidden inputs in canonical (list) order — the
// server action is unchanged and reorders can never dirty a set snapshot.
//
// 2026-07-22: matched the Master viewer's local filter/sort controls (kind,
// phase, applies-when, sort) and hardened grouping so a drifted knowledgeType
// can never silently vanish — it lands in an "other kinds" catch-all. The
// role/phase/rule-count facets arrive precomputed as plain PickerItem fields
// (computed server-side) so this client bundle never touches @bridge/kb runtime.

import type { KnowledgeType } from "@bridge/kb";
import { useMemo, useState } from "react";
import { TYPE_LABEL } from "./badges";

export type PickerItem = {
  itemId: string;
  title: string;
  knowledgeType: string;
  /** Auction roles the item's rules mention (empty for non-auction items). */
  roles: string[];
  /** Raw KnowledgePhase string (auction | opening_lead | …). */
  phase: string;
  /** Executable rules the item carries (0 = teaching prose). */
  ruleCount: number;
  /** True only for already-in-set items whose status is deprecated. */
  deprecated?: boolean;
};
export type PickerPack = {
  packId: string;
  name: string;
  itemIds: string[];
  extendsPackId?: string;
};

const GROUP_ORDER = Object.keys(TYPE_LABEL) as KnowledgeType[];
const KNOWN_KINDS = new Set<string>(GROUP_ORDER);
const OTHER_KIND = "__other__";

const plural = (label: string) => `${label}s`;

// Mirror of the Master viewer's phase / applies-when facets (kept as plain
// literals — no runtime import from @bridge/kb).
const PHASE_OPTIONS: { value: string; label: string }[] = [
  { value: "auction", label: "Bidding" },
  { value: "opening_lead", label: "Opening leads" },
  { value: "declarer_play", label: "Declarer play" },
  { value: "defense", label: "Defense" },
  { value: "scoring", label: "Scoring" },
];
const WHEN_OPTIONS: { value: string; label: string }[] = [
  { value: "opening", label: "Opening" },
  { value: "responding", label: "Responding" },
  { value: "rebidding", label: "Rebidding" },
  { value: "competing", label: "Competing" },
];

/** Does the item speak in this auction position? Mirrors lib/whenFacet's
 *  matchesWhen: "any"-role rules match all four positions; items with no
 *  auction roles never match a specific stage. */
function matchesWhen(roles: string[], when: string): boolean {
  if (!when) return true;
  const has = (r: string) => roles.includes(r);
  if (when === "opening") return has("opening") || has("any");
  if (when === "responding") return has("responder") || has("any");
  if (when === "rebidding") return has("opener") || has("any");
  if (when === "competing") return has("overcaller") || has("advancer") || has("any");
  return true;
}

export function SetItemPicker({
  items,
  packs,
  currentPackId,
  initialSelected,
  initialIncludeId,
  hiddenDeprecatedCount = 0,
}: Readonly<{
  items: PickerItem[];
  packs: PickerPack[];
  currentPackId?: string;
  initialSelected?: string[];
  initialIncludeId?: string;
  hiddenDeprecatedCount?: number;
}>) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelected ?? []));
  const [includeId, setIncludeId] = useState(initialIncludeId ?? "");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [phase, setPhase] = useState("");
  const [when, setWhen] = useState("");
  const [sort, setSort] = useState<"title" | "rules">("title");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const packById = useMemo(() => new Map(packs.map((p) => [p.packId, p])), [packs]);

  // Sets that would create a loop if included: this set itself, and any set
  // whose Includes chain already reaches it.
  const cycleBlocked = useMemo(() => {
    const blocked = new Set<string>();
    if (!currentPackId) return blocked;
    blocked.add(currentPackId);
    for (const p of packs) {
      const seen = new Set<string>();
      let cursor: string | undefined = p.packId;
      while (cursor && !seen.has(cursor)) {
        if (cursor === currentPackId) {
          blocked.add(p.packId);
          break;
        }
        seen.add(cursor);
        cursor = packById.get(cursor)?.extendsPackId;
      }
    }
    return blocked;
  }, [packs, packById, currentPackId]);

  // Items arriving via the Includes chain — locked in the list, never posted.
  const locked = useMemo(() => {
    const map = new Map<string, string>(); // itemId → name of the set it comes from
    const seen = new Set<string>();
    let cursor: string | undefined = includeId || undefined;
    while (cursor && !seen.has(cursor) && cursor !== currentPackId) {
      seen.add(cursor);
      const pack = packById.get(cursor);
      if (!pack) break;
      for (const id of pack.itemIds) if (!map.has(id)) map.set(id, pack.name);
      cursor = pack.extendsPackId;
    }
    return map;
  }, [includeId, packById, currentPackId]);

  const filtersActive = Boolean(query.trim() || kind || phase || when);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = items.filter(
      (i) =>
        (!q || i.title.toLowerCase().includes(q)) &&
        (!kind || i.knowledgeType === kind) &&
        (!phase || i.phase === phase) &&
        matchesWhen(i.roles, when),
    );
    const sortItems = (list: PickerItem[]) =>
      [...list].sort((a, b) =>
        sort === "rules"
          ? b.ruleCount - a.ruleCount || a.title.localeCompare(b.title)
          : a.title.localeCompare(b.title),
      );
    const result: { kind: string; label: string; items: PickerItem[] }[] = GROUP_ORDER.map(
      (k) => ({
        kind: k,
        label: plural(TYPE_LABEL[k]),
        items: sortItems(visible.filter((i) => i.knowledgeType === k)),
      }),
    );
    // Catch-all: any item whose knowledgeType drifted off the known set would
    // otherwise land in no group and silently disappear.
    const other = sortItems(visible.filter((i) => !KNOWN_KINDS.has(i.knowledgeType)));
    if (other.length) result.push({ kind: OTHER_KIND, label: "other kinds", items: other });
    return result.filter((g) => g.items.length > 0);
  }, [items, query, kind, phase, when, sort]);

  const toggle = (itemId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });

  const setMany = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const includeName = packById.get(includeId)?.name;
  const postedCount = items.filter(
    (i) => selected.has(i.itemId) && !locked.has(i.itemId),
  ).length;

  const selectClass = "rounded border border-neutral-300 px-2 py-1 text-sm";

  return (
    <div className="space-y-3">
      <label className="block text-sm">
        <span className="mb-1 block text-xs text-neutral-500">Includes (optional)</span>
        <select
          name="extendsPackId"
          value={includeId}
          onChange={(e) => setIncludeId(e.target.value)}
          className="w-full max-w-sm rounded border border-neutral-300 px-2 py-1.5"
        >
          <option value="">nothing — this set stands alone</option>
          {packs
            .filter((p) => p.packId !== currentPackId)
            .map((p) => (
              <option key={p.packId} value={p.packId} disabled={cycleBlocked.has(p.packId)}>
                {p.name}
                {cycleBlocked.has(p.packId) ? " (would create a loop)" : ""}
              </option>
            ))}
        </select>
        <span className="mt-1 block text-xs text-neutral-400">
          A set may pull in another set&apos;s items — nothing is assumed.
        </span>
      </label>

      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded border border-neutral-200 bg-white px-3 py-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search knowledge items…"
          className="w-48 rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <select
          aria-label="Filter by kind"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className={selectClass}
        >
          <option value="">All kinds</option>
          {GROUP_ORDER.map((k) => (
            <option key={k} value={k}>
              {plural(TYPE_LABEL[k])}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by phase"
          value={phase}
          onChange={(e) => setPhase(e.target.value)}
          className={selectClass}
        >
          <option value="">Any phase</option>
          {PHASE_OPTIONS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by applies-when"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className={selectClass}
        >
          <option value="">Applies: any</option>
          {WHEN_OPTIONS.map((w) => (
            <option key={w.value} value={w.value}>
              {w.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Sort items"
          value={sort}
          onChange={(e) => setSort(e.target.value === "rules" ? "rules" : "title")}
          className={selectClass}
        >
          <option value="title">Sort: A–Z</option>
          <option value="rules">Sort: most rules</option>
        </select>
        <span className="ml-auto text-xs text-neutral-500">
          {postedCount} selected
          {locked.size > 0 && includeName
            ? ` · ${locked.size} included via “${includeName}”`
            : ""}
        </span>
      </div>

      {hiddenDeprecatedCount > 0 && (
        <p className="px-1 text-xs text-neutral-400">
          {hiddenDeprecatedCount} deprecated item{hiddenDeprecatedCount === 1 ? "" : "s"} hidden —
          restore an item&apos;s status in the Master list to pick it here.
        </p>
      )}

      <div className="max-h-96 space-y-2 overflow-y-auto rounded border border-neutral-200 p-2">
        {groups.map((group) => {
          const isOpen = openGroups[group.kind] ?? true;
          const selectable = group.items
            .filter((i) => !locked.has(i.itemId))
            .map((i) => i.itemId);
          const onCount = group.items.filter(
            (i) => locked.has(i.itemId) || selected.has(i.itemId),
          ).length;
          return (
            <div key={group.kind} className="rounded border border-neutral-200">
              <div className="flex items-center gap-2 bg-neutral-50/60 px-3 py-2">
                <button
                  type="button"
                  onClick={() =>
                    setOpenGroups((prev) => ({ ...prev, [group.kind]: !isOpen }))
                  }
                  aria-expanded={isOpen}
                  className="flex flex-1 items-center gap-2 text-left text-sm font-medium"
                >
                  <svg
                    viewBox="0 0 12 12"
                    aria-hidden
                    className={`h-2.5 w-2.5 flex-none text-neutral-400 transition-transform ${isOpen ? "rotate-90" : ""}`}
                  >
                    <path d="M3 1l6 5-6 5z" fill="currentColor" />
                  </svg>
                  {group.label}
                  <span className="text-xs font-normal text-neutral-400">
                    {onCount}/{group.items.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setMany(selectable, true)}
                  className="rounded border border-neutral-300 px-1.5 py-0.5 text-[11px] hover:border-emerald-400"
                >
                  all
                </button>
                <button
                  type="button"
                  onClick={() => setMany(selectable, false)}
                  className="rounded border border-neutral-300 px-1.5 py-0.5 text-[11px] hover:border-emerald-400"
                >
                  none
                </button>
              </div>
              {isOpen && (
                <ul className="divide-y divide-[var(--line)]">
                  {group.items.map((item) => {
                    const lockedHere = locked.has(item.itemId);
                    return (
                      <li key={item.itemId}>
                        <label
                          className={`flex items-center gap-2 px-3 py-1.5 text-sm ${
                            lockedHere ? "text-neutral-400" : "hover:bg-emerald-50/50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={lockedHere || selected.has(item.itemId)}
                            disabled={lockedHere}
                            onChange={() => toggle(item.itemId)}
                          />
                          <span className={item.deprecated ? "text-neutral-400 line-through" : ""}>
                            {item.title}
                          </span>
                          {item.deprecated && (
                            <span className="rounded border border-neutral-200 px-1 py-0.5 text-[10px] uppercase tracking-wide text-neutral-400">
                              deprecated
                            </span>
                          )}
                          {lockedHere && (
                            <span className="ml-auto text-[10px] uppercase text-neutral-400">
                              from “{locked.get(item.itemId)}”
                            </span>
                          )}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
        {groups.length === 0 && (
          <p className="px-3 py-4 text-center text-sm text-neutral-400">
            {items.length === 0
              ? "This knowledge base has no items yet — add some in the Master list."
              : "No items match your filters."}
          </p>
        )}
      </div>

      {/* Canonical order: iterate the item list, not the selection set. Items
          arriving via Includes are never posted — the chain carries them. */}
      {items
        .filter((i) => selected.has(i.itemId) && !locked.has(i.itemId))
        .map((i) => (
          <input key={i.itemId} type="hidden" name="itemIds" value={i.itemId} />
        ))}
    </div>
  );
}

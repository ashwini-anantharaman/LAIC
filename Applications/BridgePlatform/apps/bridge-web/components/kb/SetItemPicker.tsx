"use client";

// Knowledge-set roster picker (2026-07-17 UX rework): grouped by knowledge
// type, searchable, per-group select all/none, with the optional "Includes"
// select built in so items arriving via the included set render as locked
// rows. Posts plain `itemIds` hidden inputs in canonical (list) order — the
// server action is unchanged and reorders can never dirty a set snapshot.

import type { KnowledgeType } from "@bridge/kb";
import { useMemo, useState } from "react";
import { TYPE_LABEL } from "./badges";

export type PickerItem = {
  itemId: string;
  title: string;
  knowledgeType: string;
};
export type PickerPack = {
  packId: string;
  name: string;
  itemIds: string[];
  extendsPackId?: string;
};

const GROUP_ORDER = Object.keys(TYPE_LABEL) as KnowledgeType[];

const plural = (label: string) => `${label}s`;

export function SetItemPicker({
  items,
  packs,
  currentPackId,
  initialSelected,
  initialIncludeId,
}: Readonly<{
  items: PickerItem[];
  packs: PickerPack[];
  currentPackId?: string;
  initialSelected?: string[];
  initialIncludeId?: string;
}>) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelected ?? []));
  const [includeId, setIncludeId] = useState(initialIncludeId ?? "");
  const [query, setQuery] = useState("");
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

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = q ? items.filter((i) => i.title.toLowerCase().includes(q)) : items;
    return GROUP_ORDER.map((kind) => ({
      kind,
      items: visible.filter((i) => i.knowledgeType === kind),
    })).filter((g) => g.items.length > 0);
  }, [items, query]);

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

      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded border border-neutral-200 bg-white px-3 py-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search knowledge items…"
          className="w-56 rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <span className="text-xs text-neutral-500">
          {postedCount} selected
          {locked.size > 0 && includeName
            ? ` · ${locked.size} included via “${includeName}”`
            : ""}
        </span>
      </div>

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
                  {plural(TYPE_LABEL[group.kind])}
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
                          {item.title}
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
            No knowledge items match &ldquo;{query}&rdquo;.
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

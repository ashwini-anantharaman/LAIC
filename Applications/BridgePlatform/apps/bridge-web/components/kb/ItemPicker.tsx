"use client";

// Pack roster picker with select-all/none — an 80-item KB shouldn't mean 80
// clicks. Field name stays `itemIds` (the server action is unchanged).

import { useState } from "react";

export function ItemPicker({
  items,
}: Readonly<{ items: { itemId: string; title: string; knowledgeType: string }[] }>) {
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const toggle = (itemId: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  return (
    <div>
      <p className="mb-1 flex gap-2 text-xs">
        <button
          type="button"
          onClick={() => setChecked(new Set(items.map((i) => i.itemId)))}
          className="rounded border border-neutral-300 px-2 py-0.5 hover:border-emerald-400"
        >
          Select all
        </button>
        <button
          type="button"
          onClick={() => setChecked(new Set())}
          className="rounded border border-neutral-300 px-2 py-0.5 hover:border-emerald-400"
        >
          None
        </button>
        <span className="self-center text-neutral-400">{checked.size} selected</span>
      </p>
      <div className="grid max-h-64 gap-1 overflow-y-auto rounded border border-neutral-200 p-3 sm:grid-cols-2">
        {items.map((item) => (
          <label key={item.itemId} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="itemIds"
              value={item.itemId}
              checked={checked.has(item.itemId)}
              onChange={() => toggle(item.itemId)}
            />
            {item.title}
            <span className="text-[10px] uppercase text-neutral-400">
              {item.knowledgeType.replaceAll("_", " ")}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

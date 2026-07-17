"use client";

// Persistent accordion (2026-07-17 UX rework): real <details> sections with
// visible chevrons, expand/collapse-all, and open state remembered per KB
// across navigation (localStorage). The server always renders sections open;
// an inline script placed AFTER the sections closes the stored-closed ones
// while the HTML is still parsing, and the lazy state initializer agrees at
// hydration — so there's no post-paint snap.

import { createContext, useContext, useState, type ReactNode } from "react";

type AccordionCtx = {
  isOpen: (id: string) => boolean;
  toggle: (id: string) => void;
};
const Ctx = createContext<AccordionCtx | null>(null);

function readStorage(key: string): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

export function AccordionGroup({
  storageKey,
  sectionIds,
  children,
}: Readonly<{ storageKey: string; sectionIds: string[]; children: ReactNode }>) {
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => readStorage(storageKey));

  const write = (next: Record<string, boolean>) => {
    setOpenMap(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Private browsing etc. — the accordion still works for this visit.
    }
  };
  const isOpen = (id: string) => openMap[id] ?? true; // missing = default open
  const toggle = (id: string) => write({ ...openMap, [id]: !isOpen(id) });
  const setAll = (open: boolean) =>
    write(Object.fromEntries(sectionIds.map((id) => [id, open])));

  // Runs on parse (SSR only): close stored-closed sections before first paint.
  const prePaint = `(function(){try{var m=JSON.parse(localStorage.getItem(${JSON.stringify(
    storageKey,
  )})||"{}");document.querySelectorAll("details[data-acc]").forEach(function(d){if(m[d.getAttribute("data-acc")]===false)d.removeAttribute("open")})}catch(e){}})()`;

  return (
    <Ctx.Provider value={{ isOpen, toggle }}>
      <div className="mb-2 flex justify-end gap-2 text-xs">
        <button
          type="button"
          onClick={() => setAll(true)}
          className="rounded border border-neutral-300 px-2 py-0.5 hover:border-emerald-400"
        >
          Expand all
        </button>
        <button
          type="button"
          onClick={() => setAll(false)}
          className="rounded border border-neutral-300 px-2 py-0.5 hover:border-emerald-400"
        >
          Collapse all
        </button>
      </div>
      <div className="space-y-3">{children}</div>
      <script dangerouslySetInnerHTML={{ __html: prePaint }} />
    </Ctx.Provider>
  );
}

export function AccordionSection({
  id,
  summary,
  children,
}: Readonly<{ id: string; summary: ReactNode; children: ReactNode }>) {
  const ctx = useContext(Ctx);
  const open = ctx?.isOpen(id) ?? true;
  return (
    <details
      data-acc={id}
      open={open}
      suppressHydrationWarning
      className="group rounded-lg border border-neutral-200 bg-[var(--card)]"
    >
      <summary
        onClick={(e) => {
          e.preventDefault();
          ctx?.toggle(id);
        }}
        className="flex cursor-pointer list-none items-baseline gap-2 px-5 py-3 [&::-webkit-details-marker]:hidden"
      >
        {/* Rotation is driven by the [open] attribute (CSS), not React state,
            so it never mismatches the server's default-open render. */}
        <svg
          viewBox="0 0 12 12"
          aria-hidden
          className="h-2.5 w-2.5 flex-none self-center text-neutral-400 transition-transform group-open:rotate-90"
        >
          <path d="M3 1l6 5-6 5z" fill="currentColor" />
        </svg>
        {summary}
      </summary>
      {children}
    </details>
  );
}

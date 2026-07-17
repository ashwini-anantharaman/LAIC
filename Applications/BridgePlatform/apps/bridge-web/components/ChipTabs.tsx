// Server-rendered tab chips driven by searchParams (no client state) — the
// tab structure of the Players and Library areas. Two visual tiers: `primary`
// underline tabs for the top split, chip pills for nested facets.

import Link from "next/link";

export interface ChipTab {
  label: string;
  href: string;
  active: boolean;
  /** Small trailing count, e.g. number of players under this facet. */
  count?: number;
  disabled?: boolean;
}

export function UnderlineTabs({ tabs }: Readonly<{ tabs: ChipTab[] }>) {
  return (
    <nav className="flex flex-wrap gap-4 border-b border-[var(--line)]">
      {tabs.map((tab) =>
        tab.disabled ? (
          <span
            key={tab.href}
            className="cursor-not-allowed border-b-2 border-transparent px-1 pb-2 text-sm text-neutral-300"
          >
            {tab.label}
          </span>
        ) : (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={tab.active ? "page" : undefined}
            className={
              tab.active
                ? "border-b-2 border-[var(--accent)] px-1 pb-2 text-sm font-medium text-emerald-900"
                : "border-b-2 border-transparent px-1 pb-2 text-sm text-neutral-500 hover:text-neutral-800"
            }
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1.5 text-xs text-neutral-400">{tab.count}</span>
            )}
          </Link>
        ),
      )}
    </nav>
  );
}

export function ChipRow({ tabs }: Readonly<{ tabs: ChipTab[] }>) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tabs.map((tab) => (
        <Link
          // Multi-select rows can point two chips at the same URL (deselecting
          // the last filter = Everyone), so the label joins the key.
          key={`${tab.label}:${tab.href}`}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={
            tab.active
              ? "rounded-full border border-emerald-700 bg-emerald-700 px-3 py-1 text-xs font-medium text-white"
              : "rounded-full border border-neutral-300 px-3 py-1 text-xs text-neutral-600 hover:border-emerald-500 hover:text-neutral-900"
          }
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className={tab.active ? "ml-1 text-emerald-100" : "ml-1 text-neutral-400"}>
              {tab.count}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}

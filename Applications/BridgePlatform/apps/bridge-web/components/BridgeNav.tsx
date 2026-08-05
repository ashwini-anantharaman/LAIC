"use client";

// The bridge shell's nav, as a client component so it can FOLD on the play
// table. On session-play routes the phone-tier chrome starts collapsed into one
// slim row (brand · page · ☰) instead of the multi-row wrapping link list that
// otherwise pushes the table down the screen (owner, 2026-08-05: "the navbar at
// the top should fold into something so it doesn't take up so much space at the
// top when playing"). The wide (md+) sidebar is UNCHANGED — it doesn't crowd the
// table (PlayTable measures and scales to whatever width it's given), so only
// the narrow top form folds. On every non-table route the nav is exactly as
// before, at every width.

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { clearDevUser, signOutNexus } from "@/app/actions";
import { NavLink } from "@/components/NavLink";

/** Session-play routes that fold: the new table2 session and the legacy table
 *  workbench (/bridge/table/<id>). NOT the Play landing (/bridge/table, no id)
 *  or any other page. */
function isTableRoute(pathname: string): boolean {
  return /^\/bridge\/table2?\/[^/]+/.test(pathname);
}

export function BridgeNav({
  navItems,
  displayName,
  roleText,
  orgLabel,
  showSignOut,
  showSwitchUser,
}: {
  navItems: readonly { href: string; label: string }[];
  displayName: string;
  roleText: string;
  orgLabel: string;
  showSignOut: boolean;
  showSwitchUser: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const foldable = isTableRoute(pathname);

  // Collapse again whenever the route changes: tapping a link in the expanded
  // menu navigates, which folds it back; leaving the table restores normal nav.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // The name shown on the collapsed slim bar: the active nav item, falling back
  // to "Play" (the table has no nav item of its own — Play points at the landing).
  const currentLabel =
    navItems.find(
      (i) => pathname === i.href || pathname.startsWith(`${i.href}/`),
    )?.label ?? "Play";

  return (
    <aside className="flex w-full shrink-0 flex-col overflow-y-auto border-b border-[var(--line)] bg-[var(--card)] md:w-64 md:border-b-0 md:border-r">
      {/* Collapsed slim bar — phone tier only, on foldable routes. The ☰ toggles
          the full menu below; it stays put so the menu can be closed again
          without navigating. */}
      {foldable && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 md:hidden">
          <span className="flex min-w-0 items-center gap-2">
            <span className="text-[11px] tracking-[0.3em] text-neutral-500">
              ♠<span className="text-[var(--madder)]">♥</span>♣
              <span className="text-[var(--madder)]">♦</span>
            </span>
            <span className="truncate font-serif text-base font-medium tracking-tight">
              {currentLabel}
            </span>
          </span>
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={open}
            aria-controls="bridge-nav-menu"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center justify-center rounded-md border border-neutral-200 px-2.5 py-1.5 text-base leading-none text-neutral-700 hover:border-emerald-400 hover:text-neutral-900"
          >
            ☰
          </button>
        </div>
      )}

      {/* The full nav: always shown on md+; on the phone tier hidden while a
          foldable route is collapsed, shown otherwise (non-table pages, or the
          expanded menu). */}
      <div
        id="bridge-nav-menu"
        className={`min-h-0 flex-1 flex-col ${
          foldable ? (open ? "flex" : "hidden md:flex") : "flex"
        }`}
      >
        {/* Brand block — hidden on the phone tier for foldable routes (the slim
            bar already carries the brand there). */}
        <div
          className={`border-b border-[var(--line)] px-3 py-2 md:p-4 ${
            foldable ? "hidden md:block" : ""
          }`}
        >
          <p className="hidden text-[11px] tracking-[0.35em] text-neutral-500 md:block">
            ♠ <span className="text-[var(--madder)]">♥</span> ♣{" "}
            <span className="text-[var(--madder)]">♦</span>
          </p>
          <p className="font-serif text-lg font-medium tracking-tight md:mt-1 md:text-xl">
            Bridge Platform
          </p>
          <p className="hidden text-xs text-neutral-500 md:block">LAIC Bridge Program</p>
        </div>
        <nav className="flex flex-row flex-wrap gap-1 px-2 py-1.5 md:flex-1 md:flex-col md:flex-nowrap md:gap-0 md:space-y-1 md:p-3">
          {navItems.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} />
          ))}
        </nav>
        {/* Exit controls must exist on every screen size — nobody gets
            trapped in the platform. Identity details stay desktop-only. */}
        <div className="flex items-center gap-2 border-t border-[var(--line)] px-4 py-2 md:hidden">
          {showSignOut && (
            <form action={signOutNexus}>
              <button type="submit" className="text-xs font-medium text-neutral-600 underline-offset-2 hover:underline">
                Sign out
              </button>
            </form>
          )}
        </div>
        <div className="hidden space-y-1 border-t border-[var(--line)] p-4 text-sm md:block">
          {showSignOut && (
            <form action={signOutNexus} className="mb-2">
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:border-emerald-400 hover:text-neutral-900"
              >
                Sign out
              </button>
            </form>
          )}
          <p className="font-medium">{displayName}</p>
          <p className="text-xs text-neutral-500">{roleText}</p>
          <p className="text-xs text-neutral-500">{orgLabel}</p>
          {showSwitchUser && (
            <form action={clearDevUser}>
              <button
                type="submit"
                className="text-xs text-emerald-700 underline-offset-2 hover:underline"
              >
                Switch user
              </button>
            </form>
          )}
        </div>
      </div>
    </aside>
  );
}

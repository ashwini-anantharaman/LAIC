"use client";

// SettingsMenu — the "Play Table" design's table-settings overlay
// (SettingsMenu.dc.html in Claude Design project 8bcef4b8). Opened by the
// rail's ☰; the backdrop closes it. Each row shows a setting and its current
// value and applies one change per click.
//
// The design fires intents on an event bus (`settings:set {patch}`); this
// app's equivalent for cross-table toggles is URL search params read
// server-side (`hands`, `bboAuction`, `speed`), so an href row navigates with
// router.replace — the menu stays open across the refresh and the row's value
// updates from the new props. Rows may instead carry a direct callback (`on`),
// the design's "prop handler wins" rule.

import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";

export interface SettingsItem {
  label: string;
  /** Current value, shown right-aligned in the accent color. */
  value: string;
  /** Navigate to apply (settings toggles) — menu stays open. */
  href?: string;
  /** Or a direct handler (e.g. "New board"). */
  on?: () => void;
  /**
   * Or a server action (per-user persistence, e.g. skin/layout toggles). The
   * row becomes a <form action={…}> submit button that looks identical to an
   * href/handler row; the server re-render keeps the client menu open.
   */
  action?: () => Promise<void>;
}

export function SettingsMenu({
  title = "Table settings",
  accent = "#384bb3",
  items,
  onClose,
}: Readonly<{
  title?: string;
  accent?: string;
  items: readonly SettingsItem[];
  onClose: () => void;
}>) {
  const router = useRouter();
  // One shared row style so an action row (a <form> submit) is pixel-identical
  // to an href/handler row (a plain <button>).
  const rowStyle: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%", background: "#fff", border: 0, borderBottom: "1px solid #e2e2e2", padding: "9px 10px", fontSize: 16, color: "#000", textAlign: "left", cursor: "pointer" };
  const rowInner = (item: SettingsItem) => (
    <>
      <span>{item.label}</span>
      <span style={{ flex: "none", fontWeight: 700, color: accent }}>{item.value}</span>
    </>
  );
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 20 }}>
      <div
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.35)" }}
        onClick={onClose}
        aria-hidden
      />
      <div style={{ position: "absolute", left: 12, top: 12, width: 268, background: "#fff", border: "1px solid #7d7d7d", borderRadius: 4, boxShadow: "0 6px 18px rgba(0,0,0,.5)", overflow: "hidden" }}>
        <div style={{ background: accent, color: "#fff", fontSize: 17, fontWeight: 700, padding: "6px 10px" }}>
          {title}
        </div>
        {items.map((item) =>
          item.action ? (
            // A server action persists the change; the resulting server
            // re-render preserves the client menuOpen state, so the menu stays
            // open exactly as an href row does.
            <form key={item.label} action={item.action} style={{ margin: 0, display: "block" }}>
              <button type="submit" style={rowStyle}>
                {rowInner(item)}
              </button>
            </form>
          ) : (
            <button
              key={item.label}
              type="button"
              onClick={
                item.on ??
                (item.href
                  ? () => {
                      // Same-page toggles replace (no history spam, menu stays
                      // open); leaving the page is a real navigation — push.
                      const samePage = item.href!.split("?")[0] === window.location.pathname;
                      if (samePage) router.replace(item.href!, { scroll: false });
                      else router.push(item.href!);
                    }
                  : undefined)
              }
              style={rowStyle}
            >
              {rowInner(item)}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

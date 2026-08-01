"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The five bottom tabs from the mobile design. Active tab draws a teal icon
 *  and a deep-teal semibold label; inactive tabs are muted. Hidden entirely on
 *  the table screen (which renders its own full-screen chrome). Each tab is
 *  gated by its access-catalogue feature key — the layout computes the allowed
 *  keys server-side and passes them in. */
const TABS: { href: string; icon: string; label: string; featureKey: string }[] = [
  { href: "/m/home", icon: "⌂", label: "Home", featureKey: "page.home" },
  { href: "/m/play", icon: "♠", label: "Play", featureKey: "page.play" },
  { href: "/m/players", icon: "◐", label: "Players", featureKey: "page.players" },
  { href: "/m/library", icon: "▤", label: "Library", featureKey: "page.library" },
  { href: "/m/guide", icon: "?", label: "Guide", featureKey: "page.guide" },
];

export function TabBar({ allowedKeys }: { allowedKeys?: readonly string[] }) {
  const pathname = usePathname() ?? "";
  // The table screen owns the whole viewport — no tab bar there.
  if (pathname.startsWith("/m/table")) return null;

  const allowed = allowedKeys
    ? TABS.filter((t) => allowedKeys.includes(t.featureKey))
    : TABS;

  return (
    <nav
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 40,
        display: "flex",
        background: "rgba(250,248,242,.92)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderTop: "1px solid #e7e1d3",
        padding: "8px 6px calc(26px + env(safe-area-inset-bottom))",
      }}
    >
      {allowed.map((t) => {
        const active =
          pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              padding: "2px 0",
              textDecoration: "none",
            }}
          >
            <span
              style={{
                fontSize: 19,
                lineHeight: 1,
                color: active ? "#205e63" : "#a49d8e",
              }}
            >
              {t.icon}
            </span>
            <span
              style={{
                fontFamily: "var(--font-karla)",
                fontWeight: active ? 600 : 400,
                fontSize: 10,
                color: active ? "#173c40" : "#a49d8e",
              }}
            >
              {t.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

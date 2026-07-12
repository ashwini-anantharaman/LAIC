/**
 * Navigation frame — spec §11.4. Top bar + bottom tabs rendered from config.
 * Router-agnostic: current path and navigation are injected (ShellNavigation),
 * so this works with react-router, a native wrapper, or anything else.
 */
import type { AppShellConfig, LaunchContext, ShellNavigation } from "../types";
import { Mark } from "./Chrome";

const ICONS: Record<string, string> = {
  book: "▤",
  chart: "∿",
  bolt: "↯",
  cards: "♦",
  target: "◎",
  whistle: "◈",
};

export function AppNavShell({
  config,
  ctx,
  navigation,
  onSignOut,
  children,
}: {
  config: AppShellConfig;
  ctx: LaunchContext;
  navigation: ShellNavigation;
  onSignOut: () => void;
  children: React.ReactNode;
}) {
  const tabs = config.navigation.tabs.filter((t) => {
    if (t.requiredModule && !config.enabledModules[t.requiredModule]) return false;
    if (t.visibleForRoles && !t.visibleForRoles.includes(ctx.selectedRole)) return false;
    return true;
  });

  return (
    <div className="nav-shell">
      <header className="nav-top">
        <Mark glyph={config.branding.markGlyph} small />
        <span className="nav-title">{config.identity.shortName}</span>
        <div className="nav-user">
          <span className="who">
            <b>{ctx.displayName}</b>
            {ctx.selectedRole.replace(/_/g, " ")}
          </span>
          <button className="signout-btn" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <main className="nav-content">{children}</main>

      <nav className="nav-tabs">
        {tabs.map((t) => {
          const on = navigation.path === t.route || navigation.path.startsWith(t.route + "/");
          const locked = t.requiredEntitlement && !ctx.entitlements.includes(t.requiredEntitlement);
          return (
            <button key={t.key} className={`nav-tab${on ? " on" : ""}`} onClick={() => navigation.navigate(t.route)}>
              <span className="tab-dot">{ICONS[t.icon || ""] || "•"}</span>
              {t.label}
              {locked && <span className="lock">locked</span>}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/**
 * The application shell: a quiet sidebar whose contents adapt to the session
 * mode and the current scope (org space vs. a program workspace), plus a slim
 * topbar with breadcrumb, theme toggle, and account. Minimal per §6 — no
 * version tags, no environment pills, no narration.
 */
import {
  Building2,
  LayoutDashboard,
  Settings,
  Boxes,
  Package,
  AppWindow,
  UserPlus,
  Users,
  DoorOpen,
  MessagesSquare,
  KeyRound,
  Handshake,
  Rocket,
  Waypoints,
  ScrollText,
  ListTree,
  ChevronRight,
  ChevronLeft,
  Moon,
  Sun,
  LogOut,
  Menu,
  Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState, type ReactNode } from "react";
import { Link, Outlet, useLocation, useNavigate, useParams } from "react-router";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { cn } from "@/app/components/ui/utils";
import { DEV_ENABLED, OPERATOR_PERSONAS } from "@/nexus/dev/personas";
import { devLoginAs, getDevPersonas, getMyProgramRole, getOrgBySlug, getOrgMyRole, getPlatformBranding, listMyOrgs, listProgramRoles, listPrograms, type DevPersonaEntry, type ProgramRole } from "@/services/api";
import { resolveAssetUrl } from "@/services/apiBase";
import { useSession } from "@/nexus/session";
import { useDocumentTitle } from "@/nexus/useDocumentTitle";
import { Spinner } from "@/nexus/ui/kit";
import type { Program } from "@/types/platform";
import { accentForMode } from "@/nexus/theme/accent";
import { clearBranding, onBranding, orgPortalPath, readBranding, writeBranding } from "@/nexus/branding";
import { useDocumentChrome } from "@/nexus/useDocumentChrome";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

// Org nav — each item names the org-role area that gates it (null = always).
const ORG_NAV_AREAS: Record<string, string | null> = {
  dashboard: null, programs: "programs", team: "team", "access-catalogue": "team", gates: "team", settings: "settings", audit: "audit",
};
function orgNav(orgId: string): NavItem[] {
  const base = `/o/${orgId}`;
  return [
    { to: `${base}/dashboard`, label: "Dashboard", icon: LayoutDashboard },
    { to: `${base}/programs`, label: "Programs", icon: Boxes },
    { to: `${base}/team`, label: "People", icon: KeyRound },
    { to: `${base}/access-catalogue`, label: "Access Catalogue", icon: ListTree },
    { to: `${base}/gates`, label: "Gates", icon: DoorOpen },
    { to: `${base}/settings`, label: "Settings", icon: Settings },
    { to: `${base}/audit`, label: "Audit", icon: ScrollText },
  ];
}

function programNav(orgId: string, programId: string): NavItem[] {
  const base = `/o/${orgId}/p/${programId}`;
  return [
    { to: `${base}`, label: "Overview", icon: LayoutDashboard, end: true },
    { to: `${base}/offerings`, label: "Offerings", icon: Package },
    { to: `${base}/shells`, label: "App Shells", icon: AppWindow },
    { to: `${base}/registrations`, label: "Registrations", icon: UserPlus },
    { to: `${base}/gates`, label: "Gates", icon: DoorOpen },
    { to: `${base}/groups`, label: "Participants & Groups", icon: Users },
    { to: `${base}/community`, label: "Community", icon: MessagesSquare },
    { to: `${base}/team`, label: "People", icon: KeyRound },
    { to: `${base}/access-catalogue`, label: "Access Catalogue", icon: ListTree },
    { to: `${base}/partners`, label: "Partners", icon: Handshake },
    { to: `${base}/settings`, label: "Settings", icon: SettingsIcon },
  ];
}

/**
 * A member's confined program nav: Overview plus only the areas their role
 * grants. Mirrors the prototype's five permissionable areas.
 */
function confinedProgramNav(orgId: string, programId: string, perms: Record<string, string>): NavItem[] {
  const base = `/o/${orgId}/p/${programId}`;
  const items: NavItem[] = [{ to: `${base}`, label: "Home", icon: LayoutDashboard, end: true }];
  if (perms.learning) items.push({ to: `${base}/learning`, label: "Learning Platform", icon: Rocket });
  if (perms.bridge) items.push({ to: `${base}/bridge`, label: "Bridge Platform", icon: Waypoints });
  if (perms.appbuilder) items.push({ to: `${base}/shells`, label: "App Shells", icon: AppWindow });
  if (perms.community) items.push({ to: `${base}/community`, label: "Community", icon: MessagesSquare });
  if (perms.teams) items.push({ to: `${base}/team`, label: "People", icon: KeyRound });
  if (perms.partners) items.push({ to: `${base}/partners`, label: "Partners", icon: Handshake });
  return items;
}

function NavLinkRow({ item }: { item: NavItem }) {
  const { pathname } = useLocation();
  const active = item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(item.to + "/");
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className={cn(
        "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-sm"
          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      title={dark ? "Switch to light" : "Switch to dark"}
      aria-label="Toggle theme"
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

function initials(name?: string): string {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

/** Black-or-white text choice for a hex background (WCAG-ish relative luminance). */
function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.55 ? "#14161f" : "#ffffff";
}

/**
 * CSS variables that tint the whole shell with the org's accent: primary
 * actions take the accent, and the sidebar becomes accent-colored glass with
 * a contrast-aware foreground. Operator pages stay neutral (no accent).
 */
function accentVars(rawAccent: string | null, dark: boolean): React.CSSProperties | undefined {
  if (!rawAccent) return undefined;
  const accent = accentForMode(rawAccent, dark);
  const fg = readableOn(accent);
  const fgAlpha = fg === "#ffffff" ? "255, 255, 255" : "20, 22, 31";
  return {
    "--primary": accent,
    "--primary-foreground": fg,
    // Liquid glass: the accent is a translucent tint over the page gradient
    // (the .glass-sidebar blur does the rest), not an opaque paint fill.
    "--sidebar": `color-mix(in srgb, ${accent} ${dark ? 46 : 66}%, transparent)`,
    "--sidebar-foreground": fg,
    "--sidebar-accent": `rgba(${fgAlpha}, 0.16)`,
    "--sidebar-accent-foreground": fg,
    "--sidebar-border": `rgba(${fgAlpha}, 0.18)`,
    "--ring": `color-mix(in srgb, ${accent} 55%, transparent)`,
  } as React.CSSProperties;
}

/**
 * Dev-only: hop to any real account without signing out — the operator, any
 * member/admin of the current org (including pending invites, auto-activated
 * on click), and a preview of any role defined in the current program.
 */
function DevPersonaSwitcher({ orgId, programId }: { orgId: string; programId?: string }) {
  const { login, logout, user, refresh, startImpersonation } = useSession();
  const navigate = useNavigate();
  const [orgPersonas, setOrgPersonas] = useState<DevPersonaEntry[]>([]);
  const [roles, setRoles] = useState<ProgramRole[]>([]);

  useEffect(() => {
    if (!DEV_ENABLED || !orgId) return;
    getDevPersonas({ id: orgId })
      .then((r) => setOrgPersonas(r.personas))
      .catch(() => setOrgPersonas([]));
  }, [orgId]);

  useEffect(() => {
    if (!DEV_ENABLED || !programId) {
      setRoles([]);
      return;
    }
    listProgramRoles(programId)
      .then(setRoles)
      .catch(() => setRoles([]));
  }, [programId]);

  if (!DEV_ENABLED) return null;

  async function toPerson(email: string) {
    await devLoginAs(email, { id: orgId });
    // Re-fetch /auth/me under the new token — otherwise the session still
    // holds the PREVIOUS user's role/memberships, so mode-based routing
    // (RootRedirect) sends you wherever the old session belonged, not here.
    await refresh();
    navigate("/", { replace: true });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          title="Switch account or preview a role (dev only)"
        >
          Test as…
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Nexus operator</DropdownMenuLabel>
        {OPERATOR_PERSONAS.map((p) => (
          <DropdownMenuItem
            key={p.key}
            disabled={user?.email === p.email}
            onSelect={async () => {
              await login(p.email, p.password);
              navigate("/", { replace: true });
            }}
          >
            <span className="grid size-6 place-items-center rounded-full bg-secondary text-secondary-foreground text-[10px] font-semibold">
              {p.glyph}
            </span>
            <span className="min-w-0">
              <span className="block truncate">{p.label}</span>
              <span className="block text-xs text-muted-foreground truncate">{p.sublabel}</span>
            </span>
          </DropdownMenuItem>
        ))}

        {orgPersonas.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>People in this org</DropdownMenuLabel>
            {orgPersonas.map((p) => {
              const name = p.display_name ?? p.email;
              return (
                <DropdownMenuItem key={p.email} disabled={user?.email === p.email} onSelect={() => toPerson(p.email)}>
                  <span className="grid size-6 place-items-center rounded-full bg-secondary text-secondary-foreground text-[10px] font-semibold">
                    {name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate">{name}</span>
                    <span className="block text-xs text-muted-foreground truncate">
                      {p.role}
                      {p.kind === "invite" ? " · invited" : ""}
                    </span>
                  </span>
                </DropdownMenuItem>
              );
            })}
          </>
        ) : null}

        {roles.length > 0 && programId ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Roles in this program</DropdownMenuLabel>
            {roles.map((r) => (
              <DropdownMenuItem
                key={r.id}
                onSelect={() => {
                  startImpersonation({
                    roleName: r.name,
                    perms: r.perms as Record<string, string>,
                    orgId,
                    programId,
                  });
                  navigate(`/o/${orgId}/p/${programId}`);
                }}
              >
                <span className="grid size-6 place-items-center rounded-full bg-secondary text-secondary-foreground text-[10px] font-semibold">
                  {r.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block truncate">{r.name}</span>
                  <span className="block text-xs text-muted-foreground truncate">preview role</span>
                </span>
              </DropdownMenuItem>
            ))}
          </>
        ) : null}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            const dest = orgPortalPath(orgId) ?? "/login";
            logout();
            window.location.assign(dest);
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell() {
  const { user, mode, logout, orgMemberships, programMemberships, impersonation, stopImpersonation } = useSession();
  const params = useParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  // Mobile: the sidebar collapses into a hamburger-toggled drawer. Closes on
  // navigation so tapping a link dismisses it.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  useEffect(() => setMobileNavOpen(false), [pathname]);

  const orgId = params.orgId ?? orgMemberships[0]?.org_id ?? programMemberships[0]?.org_id ?? "";
  const programId = params.programId;
  const allMemberships = [...orgMemberships, ...programMemberships];
  const orgName = allMemberships.find((m) => m.org_id === orgId)?.org_name ?? "Organization";

  // Tab title tracks context: "Nexus" in the operator console, the org's name
  // inside an org's space.
  useDocumentTitle(mode === "nexus" ? "Nexus" : orgName);

  // Org branding (§6.4): the org's accent recolors primary actions inside its
  // space, and its logo takes the brand slot. Nexus operator pages stay neutral.
  // No flash, no manual refresh: hydrate synchronously from the branding
  // cache, revalidate in the background, and live-update on any write
  // (e.g. Settings saving a new accent). See nexus/branding.ts.
  const [orgBranding, setOrgBranding] = useState<{ accent: string | null; logo: string | null }>(() => {
    const cached = readBranding(orgId);
    return cached ? { accent: cached.accent, logo: cached.logo } : { accent: null, logo: null };
  });
  // Display titles for the browser tab (see useDocumentChrome), tracked
  // separately from the paint branding so a live rename updates the tab.
  const [orgTitle, setOrgTitle] = useState<string | null>(() => (orgId ? readBranding(orgId)?.title ?? null : null));
  const [platformTitle, setPlatformTitle] = useState<string | null>(() => readBranding("platform")?.title ?? null);
  // "Ready" = we know the real branding (cache hit or fetch settled). Until
  // then the shell paints a neutral spinner — never the default palette, so
  // there is no flash of the wrong color even on a first visit.
  const [brandingReady, setBrandingReady] = useState(() => !orgId || !!readBranding(orgId));
  useEffect(() => {
    if (mode === "nexus" || !orgId) {
      setOrgBranding({ accent: null, logo: null });
      setBrandingReady(true);
      return;
    }
    const cached = readBranding(orgId);
    setOrgBranding(cached ? { accent: cached.accent, logo: cached.logo } : { accent: null, logo: null });
    setOrgTitle(cached?.title ?? null);
    setBrandingReady(!!cached);
    (async () => {
      try {
        const mine = await listMyOrgs();
        const slug = mine.find((o) => o.id === orgId)?.slug;
        if (slug) {
          const b = await getOrgBySlug(slug);
          setOrgTitle(b.name);
          writeBranding({
            orgId,
            slug,
            accent: b.theme_accent_color,
            logo: resolveAssetUrl(b.theme_logo_url),
            favicon: resolveAssetUrl(b.theme_favicon_url ?? null),
            title: b.name,
          });
        }
      } catch {
        /* keep whatever we had */
      } finally {
        setBrandingReady(true);
      }
    })();
  }, [mode, orgId]);
  // Nexus's own branding (operator console) + a program's override — same
  // cache/broadcast pattern, three layers: platform | org | program.
  const [platformBranding, setPlatformBranding] = useState<{ accent: string | null; logo: string | null }>(() => {
    const c = readBranding("platform");
    return c ? { accent: c.accent, logo: c.logo } : { accent: null, logo: null };
  });
  useEffect(() => {
    if (mode !== "nexus") return;
    getPlatformBranding()
      .then((b) => {
        setPlatformTitle(b.title ?? null);
        writeBranding({ orgId: "platform", accent: b.accent, logo: resolveAssetUrl(b.logo), favicon: resolveAssetUrl(b.favicon ?? null), title: b.title ?? null });
      })
      .catch(() => {});
  }, [mode]);

  const [programBranding, setProgramBranding] = useState<{ accent: string | null; logo: string | null } | null>(() => {
    const c = programId ? readBranding(programId) : null;
    return c ? { accent: c.accent, logo: c.logo } : null;
  });
  useEffect(() => {
    const c = programId ? readBranding(programId) : null;
    setProgramBranding(c ? { accent: c.accent, logo: c.logo } : null);
  }, [programId]);
  useEffect(
    () =>
      onBranding((b) => {
        if (b.orgId === orgId) {
          setOrgBranding({ accent: b.accent, logo: b.logo });
          if (b.title !== undefined) setOrgTitle(b.title ?? null);
        }
        if (b.orgId === "platform") {
          setPlatformBranding({ accent: b.accent, logo: b.logo });
          if (b.title !== undefined) setPlatformTitle(b.title ?? null);
        }
        if (programId && b.orgId === programId) setProgramBranding({ accent: b.accent, logo: b.logo });
      }),
    [orgId, programId],
  );

  // What the shell actually paints.
  const displayBranding =
    mode === "nexus" ? platformBranding : programId && programBranding ? programBranding : orgBranding;

  // Are we previewing a role in THIS program?
  const impersonating = impersonation && impersonation.programId === programId ? impersonation : null;

  // A custom-role ORG member (org-level membership "member") is confined to
  // the areas their org role grants — same mechanic as the program level.
  const orgMembership = orgId ? orgMemberships.find((m) => m.org_id === orgId) : undefined;
  const isPlainOrgMember = mode === "org" && !!orgMembership && !["owner", "administrator"].includes(orgMembership.role);
  const [orgRolePerms, setOrgRolePerms] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    if (!isPlainOrgMember || !orgId) {
      setOrgRolePerms(null);
      return;
    }
    getOrgMyRole(orgId)
      .then((r) => setOrgRolePerms((r?.perms as Record<string, string>) ?? {}))
      .catch(() => setOrgRolePerms({}));
  }, [isPlainOrgMember, orgId]);

  // The current program (name for the breadcrumb, features for nav gating).
  const [program, setProgram] = useState<Program | null>(null);
  useEffect(() => {
    if (!programId || !orgId) {
      setProgram(null);
      return;
    }
    listPrograms(orgId)
      .then((ps) => setProgram(ps.find((p) => p.id === programId) ?? null))
      .catch(() => setProgram(null));
  }, [orgId, programId]);
  useEffect(() => {
    // Reconcile once the program row arrives: cache its branding, or clear a
    // stale override if it reverted to the org's.
    if (!programId || !program) return;
    const b = (program as Program & { branding?: { accent: string | null; logo: string | null; favicon?: string | null } | null }).branding;
    if (b && (b.accent || b.logo || b.favicon)) {
      const org = readBranding(orgId);
      writeBranding({
        orgId: programId,
        accent: b.accent ?? org?.accent ?? null,
        logo: b.logo ? resolveAssetUrl(b.logo) : org?.logo ?? null,
        favicon: b.favicon ? resolveAssetUrl(b.favicon) : org?.favicon ?? null,
      });
    } else {
      clearBranding(programId);
      setProgramBranding(null);
    }
  }, [programId, program, orgId]);

  const programName = program?.name ?? programMemberships.find((m) => m.program_id === programId)?.program_name ?? null;

  // Browser tab (title + favicon) follows the current level.
  const effectiveOrgName = orgTitle ?? orgName;
  const tabTitle =
    mode === "nexus"
      ? platformTitle ?? "Nexus"
      : programId
        ? programName
          ? `${programName} · ${effectiveOrgName}`
          : effectiveOrgName
        : effectiveOrgName;
  // The browser-tab icon uses the active level's favicon, falling back to its
  // logo. Read from the cache at render — a branding write re-renders the shell
  // (via onBranding → state), so this stays live.
  const activeFavicon =
    (mode === "nexus"
      ? readBranding("platform")
      : programId && programBranding
        ? readBranding(programId)
        : readBranding(orgId))?.favicon ?? null;
  useDocumentChrome(tabTitle, activeFavicon ?? displayBranding.logo);
  // Effective feature switches (already clamped by the org's Nexus envelope
  // server-side). Until loaded, show everything to avoid a nav flash.
  const programFeatures: Record<string, boolean> = program?.features ?? {};
  const featureOn = (k: string) => !program || programFeatures[k] !== false;


  // A real member (mode "member") whose program membership is NOT administrator/
  // owner is confined to their assigned custom role's areas (§3.5). Program
  // administrators keep the full program workspace.
  const programMembership = programId ? programMemberships.find((m) => m.program_id === programId) : undefined;
  const isPlainMember =
    mode === "member" && !!programMembership && !["administrator", "owner"].includes(programMembership.role);
  const [myRolePerms, setMyRolePerms] = useState<Record<string, string> | null>(null);
  const [myRoleName, setMyRoleName] = useState<string | null>(null);
  useEffect(() => {
    if (!isPlainMember || !programId) {
      setMyRolePerms(null);
      setMyRoleName(null);
      return;
    }
    getMyProgramRole(programId)
      .then((r) => {
        setMyRolePerms((r?.perms as Record<string, string>) ?? {});
        setMyRoleName(r?.role_name ?? null);
      })
      .catch(() => setMyRolePerms({}));
  }, [isPlainMember, programId]);

  // Which program feature gates each program-nav segment. Segments not listed
  // (overview, offerings, registrations, groups) are always available.
  const NAV_FEATURE: Record<string, string> = {
    shells: "appbuilder", community: "community", team: "teams", "access-catalogue": "teams",
    partners: "partners", learning: "learning", bridge: "bridge",
  };
  const navKey = (to: string) => to.split("/").pop() ?? "";

  // Direct URLs to a disabled area bounce to the program overview — toggling a
  // feature off must actually close the door, not just hide the menu item.
  const currentSegment = pathname.split("/").filter(Boolean).pop() ?? "";
  const currentGate = programId ? NAV_FEATURE[currentSegment] : undefined;
  useEffect(() => {
    if (!programId || !program || !currentGate) return;
    if (programFeatures[currentGate] === false) {
      navigate(`/o/${orgId}/p/${programId}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId, program, currentGate, pathname]);

  let heading: string;
  let items: NavItem[];
  let backLink: ReactNode = null;

  if (impersonating && programId) {
    heading = impersonating.roleName;
    items = confinedProgramNav(orgId, programId, impersonating.perms).filter((it) => featureOn(NAV_FEATURE[navKey(it.to)] ?? ""));
  } else if (mode === "nexus") {
    heading = "Nexus";
    items = [
      { to: "/orgs", label: "Organizations", icon: Building2 },
      { to: "/team", label: "People", icon: KeyRound },
      { to: "/access-catalogue", label: "Access Catalogue", icon: ListTree },
      { to: "/nexus-gates", label: "Gates", icon: DoorOpen },
      { to: "/audit", label: "Platform audit", icon: ScrollText },
      { to: "/settings", label: "Settings", icon: SettingsIcon },
    ];
    // A confined operator (custom platform-scope role) sees only granted areas;
    // the Team and Gates tabs are full-operator territory.
    if (user?.role !== "platform_admin") {
      const perms = user?.nexus_role?.perms ?? {};
      const NEXUS_NAV_AREAS: Record<string, string | null> = {
        orgs: "organizations", team: "__admin__", "access-catalogue": "__admin__", "nexus-gates": "__admin__", audit: "audit", settings: "settings",
      };
      items = items.filter((it) => {
        const area = NEXUS_NAV_AREAS[navKey(it.to)];
        if (area === "__admin__") return false;
        return !area || !!perms[area];
      });
    }
  } else if (programId && isPlainMember) {
    heading = myRoleName ?? programMembership?.program_name ?? "Program";
    items = confinedProgramNav(orgId, programId, myRolePerms ?? {}).filter((it) => featureOn(NAV_FEATURE[navKey(it.to)] ?? ""));
  } else if (programId) {
    heading = programName ?? "Program";
    items = programNav(orgId, programId).filter((it) => featureOn(NAV_FEATURE[navKey(it.to)] ?? ""));
    // Members live inside their program; only org-level admins get the org space.
    if (mode === "org") {
      backLink = (
        <Link
          to={`/o/${orgId}/programs`}
          className="flex items-center gap-1.5 px-3 py-2 text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
        >
          <ChevronLeft className="size-3.5" /> Back to {orgName}
        </Link>
      );
    }
  } else {
    heading = orgName;
    items = orgNav(orgId);
    if (isPlainOrgMember) {
      const perms = orgRolePerms ?? {};
      items = items.filter((it) => {
        const area = ORG_NAV_AREAS[navKey(it.to)];
        return !area || !!perms[area];
      });
    }
  }

  // Confined viewers bounce off areas their role doesn't grant (deep links).
  useEffect(() => {
    if (!isPlainOrgMember || orgRolePerms === null || programId) return;
    const seg = pathname.split("/").filter(Boolean).pop() ?? "";
    const area = ORG_NAV_AREAS[seg];
    if (area && !orgRolePerms[area]) {
      navigate(`/o/${orgId}/dashboard`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlainOrgMember, orgRolePerms, pathname, orgId, programId]);


  const PAGE_LABELS: Record<string, string> = {
    dashboard: "Dashboard", programs: "Programs", settings: "Settings", audit: "Audit",
    orgs: "Organizations", offerings: "Offerings", shells: "App Shells",
    registrations: "Registrations", groups: "Participants & Groups", community: "Community",
    team: "People", partners: "Partners", learning: "Learning Platform",
    "access-catalogue": "Access Catalogue",
  };
  const segments = pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "";
  const crumbs: string[] = [];
  if (mode === "nexus") crumbs.push("Nexus");
  else crumbs.push(orgName);
  if (programId) crumbs.push(programName ?? "Program");
  const pageLabel = PAGE_LABELS[last];
  if (pageLabel && crumbs[crumbs.length - 1] !== pageLabel) crumbs.push(pageLabel);
  else if (!pageLabel && programId && last !== programId) crumbs.push("Editor");

  if (!brandingReady) {
    return (
      <div className="grid h-screen place-items-center">
        <Spinner />
      </div>
    );
  }

  const sidebarBody = (
    <>
      <div className="flex items-center gap-2.5 px-5 h-14 border-b border-sidebar-border">
        {displayBranding.logo ? (
          <img src={displayBranding.logo} alt="" className="size-7 rounded-md object-cover" />
        ) : (
          <div className="grid size-7 place-items-center rounded-md bg-sidebar-accent text-sidebar-foreground text-sm font-semibold">
            {mode === "nexus" ? "N" : initials(orgName)}
          </div>
        )}
        <span className="font-semibold tracking-tight truncate">{heading}</span>
      </div>
      {/* Tapping a link closes the mobile drawer (harmless on desktop). */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1" onClick={() => setMobileNavOpen(false)}>
        {backLink}
        {items.map((it) => (
          <NavLinkRow key={it.to} item={it} />
        ))}
      </nav>
    </>
  );

  return (
    <div
      className="flex h-screen text-foreground"
      style={accentVars(displayBranding.accent, dark)}
    >
      {/* Static sidebar — desktop only. */}
      <aside className="glass-sidebar hidden md:flex w-60 shrink-0 flex-col border-r border-sidebar-border text-sidebar-foreground">
        {sidebarBody}
      </aside>

      {/* Mobile drawer — a slide-in overlay of the same sidebar. */}
      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileNavOpen(false)} />
          <aside className="glass-sidebar absolute inset-y-0 left-0 flex w-64 max-w-[80%] flex-col border-r border-sidebar-border text-sidebar-foreground shadow-xl">
            {sidebarBody}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass-bar flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 md:px-6">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="md:hidden -ml-1 grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
          <nav className="hidden md:flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5 min-w-0">
                {i > 0 && <ChevronRight className="size-3.5 shrink-0 opacity-50" />}
                <span className={cn("truncate", i === crumbs.length - 1 && "text-foreground font-medium")}>{c}</span>
              </span>
            ))}
          </nav>
          <div className="flex-1" />
          <DevPersonaSwitcher orgId={mode === "nexus" ? "" : orgId} programId={programId} />
          <ThemeToggle />
          <div
            className="grid size-8 place-items-center rounded-full bg-secondary text-secondary-foreground text-xs font-semibold"
            title={`${user?.display_name ?? ""} · ${user?.email ?? ""}`}
          >
            {initials(user?.display_name)}
          </div>
          <button
            type="button"
            onClick={() => {
              const dest = mode === "nexus" ? "/login" : orgPortalPath(orgId) ?? "/login";
              logout();
              // Hard nav: clearing the session makes RequireAuth want to bounce
              // to /login, which would override an in-app navigate to the org gate.
              window.location.assign(dest);
            }}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="size-4" />
          </button>
        </header>
        {impersonating ? (
          <div className="flex items-center justify-between gap-3 bg-amber-500/15 px-6 py-2 text-sm text-amber-800 dark:text-amber-300 border-b border-amber-500/20">
            <span>
              Viewing as <b>{impersonating.roleName}</b> — a member with this role sees only their granted areas.
            </span>
            <button
              type="button"
              onClick={() => {
                stopImpersonation();
                navigate(`/o/${orgId}/p/${programId}/team`);
              }}
              className="rounded-md bg-amber-500/20 px-2.5 py-1 text-xs font-medium hover:bg-amber-500/30 transition-colors"
            >
              Exit test view
            </button>
          </div>
        ) : null}
        <main className="flex-1 overflow-x-hidden overflow-y-auto">
          <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

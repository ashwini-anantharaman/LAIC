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
  MessagesSquare,
  KeyRound,
  Handshake,
  ScrollText,
  ChevronRight,
  ChevronLeft,
  Moon,
  Sun,
  LogOut,
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
import { devLoginAs, getDevPersonas, getMyProgramRole, getOrgBySlug, listMyOrgs, listProgramRoles, listPrograms, type DevPersonaEntry, type ProgramRole } from "@/services/api";
import { resolveAssetUrl } from "@/services/apiBase";
import { useSession } from "@/nexus/session";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

function orgNav(orgId: string): NavItem[] {
  const base = `/o/${orgId}`;
  return [
    { to: `${base}/dashboard`, label: "Dashboard", icon: LayoutDashboard },
    { to: `${base}/programs`, label: "Programs", icon: Boxes },
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
    { to: `${base}/groups`, label: "Participants & Groups", icon: Users },
    { to: `${base}/community`, label: "Community", icon: MessagesSquare },
    { to: `${base}/team`, label: "Team & Roles", icon: KeyRound },
    { to: `${base}/partners`, label: "Partners", icon: Handshake },
  ];
}

/**
 * A member's confined program nav: Overview plus only the areas their role
 * grants. Mirrors the prototype's five permissionable areas.
 */
function confinedProgramNav(orgId: string, programId: string, perms: Record<string, string>): NavItem[] {
  const base = `/o/${orgId}/p/${programId}`;
  const items: NavItem[] = [{ to: `${base}`, label: "Home", icon: LayoutDashboard, end: true }];
  if (perms.appbuilder) items.push({ to: `${base}/shells`, label: "App Shells", icon: AppWindow });
  if (perms.community) items.push({ to: `${base}/community`, label: "Community", icon: MessagesSquare });
  if (perms.teams) items.push({ to: `${base}/team`, label: "Team & Roles", icon: KeyRound });
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
function accentVars(accent: string | null): React.CSSProperties | undefined {
  if (!accent) return undefined;
  const fg = readableOn(accent);
  const fgAlpha = fg === "#ffffff" ? "255, 255, 255" : "20, 22, 31";
  return {
    "--primary": accent,
    "--primary-foreground": fg,
    "--sidebar": `color-mix(in srgb, ${accent} 86%, transparent)`,
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
            logout();
            navigate("/login");
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

  const orgId = params.orgId ?? orgMemberships[0]?.org_id ?? programMemberships[0]?.org_id ?? "";
  const programId = params.programId;
  const allMemberships = [...orgMemberships, ...programMemberships];
  const orgName = allMemberships.find((m) => m.org_id === orgId)?.org_name ?? "Organization";

  // Org branding (§6.4): the org's accent recolors primary actions inside its
  // space, and its logo takes the brand slot. Nexus operator pages stay neutral.
  const [orgBranding, setOrgBranding] = useState<{ accent: string | null; logo: string | null }>({
    accent: null,
    logo: null,
  });
  useEffect(() => {
    if (mode === "nexus" || !orgId) {
      setOrgBranding({ accent: null, logo: null });
      return;
    }
    (async () => {
      try {
        const mine = await listMyOrgs();
        const slug = mine.find((o) => o.id === orgId)?.slug;
        if (!slug) return;
        const b = await getOrgBySlug(slug);
        setOrgBranding({ accent: b.theme_accent_color, logo: resolveAssetUrl(b.theme_logo_url) });
      } catch {
        /* neutral defaults */
      }
    })();
  }, [mode, orgId]);

  // Are we previewing a role in THIS program?
  const impersonating = impersonation && impersonation.programId === programId ? impersonation : null;

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

  let heading: string;
  let items: NavItem[];
  let backLink: ReactNode = null;

  if (impersonating && programId) {
    heading = impersonating.roleName;
    items = confinedProgramNav(orgId, programId, impersonating.perms);
  } else if (mode === "nexus") {
    heading = "Nexus";
    items = [
      { to: "/orgs", label: "Organizations", icon: Building2 },
      { to: "/audit", label: "Platform audit", icon: ScrollText },
    ];
  } else if (programId && isPlainMember) {
    heading = myRoleName ?? programMembership?.program_name ?? "Program";
    items = confinedProgramNav(orgId, programId, myRolePerms ?? {});
  } else if (programId) {
    heading = "Program";
    items = programNav(orgId, programId);
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
  }

  // Human breadcrumb: names, never raw ids.
  const [programName, setProgramName] = useState<string | null>(null);
  useEffect(() => {
    if (!programId || !orgId) {
      setProgramName(null);
      return;
    }
    const fromMembership = programMemberships.find((m) => m.program_id === programId)?.program_name;
    if (fromMembership) {
      setProgramName(fromMembership);
      return;
    }
    listPrograms(orgId)
      .then((ps) => setProgramName(ps.find((p) => p.id === programId)?.name ?? null))
      .catch(() => setProgramName(null));
  }, [orgId, programId, programMemberships]);

  const PAGE_LABELS: Record<string, string> = {
    dashboard: "Dashboard", programs: "Programs", settings: "Settings", audit: "Audit",
    orgs: "Organizations", offerings: "Offerings", shells: "App Shells",
    registrations: "Registrations", groups: "Participants & Groups", community: "Community",
    team: "Team & Roles", partners: "Partners", learning: "Learning Platform",
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

  return (
    <div
      className="flex h-screen text-foreground"
      style={accentVars(orgBranding.accent)}
    >
      <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground backdrop-blur-xl">
        <div className="flex items-center gap-2.5 px-5 h-14 border-b border-sidebar-border">
          {orgBranding.logo ? (
            <img src={orgBranding.logo} alt="" className="size-7 rounded-md object-cover" />
          ) : (
            <div className="grid size-7 place-items-center rounded-md bg-sidebar-accent text-sidebar-foreground text-sm font-semibold">
              {mode === "nexus" ? "N" : initials(orgName)}
            </div>
          )}
          <span className="font-semibold tracking-tight truncate">{heading}</span>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {backLink}
          {items.map((it) => (
            <NavLinkRow key={it.to} item={it} />
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass-bar flex h-14 shrink-0 items-center gap-3 border-b border-border px-6">
          <nav className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
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
              logout();
              navigate("/login");
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
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-8 py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

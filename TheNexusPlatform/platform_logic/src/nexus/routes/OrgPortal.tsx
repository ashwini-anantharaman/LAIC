/**
 * Per-org login portal (/@/:slug) — the Canvas-style "this is LAIC's space"
 * surface. Renders the org's own name, logo, and accent (fetched pre-auth from
 * the public branding endpoint) and offers members-only sign-in. The Nexus
 * operator never signs in here (§3.5); it uses the bare gate at /login.
 */
import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { ChevronRight } from "lucide-react";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { devLoginAs, getDevPersonas, getOrgBySlug, type DevPersonaEntry, type OrgBranding } from "@/services/api";
import { DEV_ENABLED } from "@/nexus/dev/personas";
import { useSession } from "@/nexus/session";

export function OrgPortal() {
  const { slug = "" } = useParams();
  const { login, refresh } = useSession();
  const navigate = useNavigate();

  const [org, setOrg] = useState<OrgBranding | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [devPersonas, setDevPersonas] = useState<DevPersonaEntry[]>([]);

  useEffect(() => {
    getOrgBySlug(slug)
      .then(setOrg)
      .catch(() => setNotFound(true));
  }, [slug]);

  useEffect(() => {
    if (!DEV_ENABLED) return;
    getDevPersonas({ slug })
      .then((r) => setDevPersonas(r.personas))
      .catch(() => setDevPersonas([]));
  }, [slug]);

  async function signInAs(em: string, pw: string) {
    setBusy(true);
    setError(null);
    try {
      // Org-scoped sign-in: this portal's slug binds the session to THIS org —
      // no account here means no entry, and operators are refused outright.
      await login(em.trim(), pw, slug);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function devSignIn(em: string) {
    setBusy(true);
    setError(null);
    try {
      await devLoginAs(em, { slug });
      await refresh();
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  if (notFound) {
    return (
      <div className="min-h-screen grid place-items-center text-foreground px-4">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">No organization at this address.</p>
        </div>
      </div>
    );
  }

  const accent = org?.theme_accent_color || "#4f46e5";
  const glyph = (org?.name ?? "•").slice(0, 1).toUpperCase();

  return (
    <div className="min-h-screen grid place-items-center text-foreground px-4" style={{ ["--primary" as string]: accent } as CSSProperties}>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          {org?.theme_logo_url ? (
            <img src={org.theme_logo_url} alt="" className="size-9 rounded-lg object-cover" />
          ) : (
            <div
              className="grid size-9 place-items-center rounded-lg text-white text-base font-semibold"
              style={{ background: accent }}
            >
              {glyph}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-semibold tracking-tight truncate">{org?.name ?? "…"}</div>
            <div className="text-xs text-muted-foreground font-mono truncate">nexus /@/{slug}</div>
          </div>
        </div>

        <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">Continue to {org?.name ?? "your organization"}.</p>

        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void signInAs(email, password);
          }}
          className="mt-6 space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="portal-email">Email</Label>
            <Input
              id="portal-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={`you@${slug}.org`}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="portal-password">Password</Label>
            <Input
              id="portal-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        {DEV_ENABLED && devPersonas.length > 0 ? (
          <div className="mt-8">
            <div className="flex items-center gap-3 mb-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Test as anyone in this org</span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <GroupedPersonas personas={devPersonas} accent={accent} busy={busy} onPick={devSignIn} />
          </div>
        ) : null}

        <p className="mt-8 text-center text-xs text-muted-foreground">
          This is {org?.name ?? "the organization"}'s space. Nothing here reveals other organizations.
        </p>
      </div>
    </div>
  );
}

/**
 * Personas grouped by role into collapsible tabs, so a long roster doesn't
 * swamp the portal. Small groups start open; large ones start collapsed.
 */
function GroupedPersonas({
  personas,
  accent,
  busy,
  onPick,
}: {
  personas: DevPersonaEntry[];
  accent: string;
  busy: boolean;
  onPick: (email: string) => void;
}) {
  const groups = new Map<string, DevPersonaEntry[]>();
  for (const p of personas) {
    const key = p.role;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  // Owners first, then administrators, then everything else alphabetically.
  const order = (r: string) => (r === "owner" ? 0 : r === "administrator" ? 1 : 2);
  const sorted = [...groups.entries()].sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b));

  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const [role, list] of sorted) init[role] = list.length <= 3;
    return init;
  });

  return (
    <div className="space-y-2">
      {sorted.map(([role, list]) => (
        <div key={role} className="rounded-lg border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setOpen((o) => ({ ...o, [role]: !o[role] }))}
            className="flex w-full items-center justify-between bg-card px-3 py-2 text-left hover:bg-accent/50 transition-colors"
          >
            <span className="text-sm font-medium capitalize text-foreground">
              {role} <span className="text-muted-foreground font-normal">({list.length})</span>
            </span>
            <ChevronRight className={`size-4 text-muted-foreground transition-transform ${open[role] ? "rotate-90" : ""}`} />
          </button>
          {open[role] ? (
            <div className="divide-y divide-border border-t border-border">
              {list.map((p) => {
                const name = p.display_name ?? p.email;
                return (
                  <button
                    key={p.email}
                    type="button"
                    disabled={busy}
                    onClick={() => onPick(p.email)}
                    className="flex w-full items-center gap-3 bg-background px-3 py-2 text-left hover:bg-accent/40 transition-colors disabled:opacity-50"
                  >
                    <span
                      className="grid size-7 place-items-center rounded-full text-white text-[11px] font-semibold shrink-0"
                      style={{ background: accent }}
                    >
                      {name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-foreground truncate">{name}</span>
                      <span className="block text-xs text-muted-foreground truncate">
                        {p.email}
                        {p.kind === "invite" ? " · invited" : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

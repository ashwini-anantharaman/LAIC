/**
 * Sign-in. Email + password only (no third-party SSO this pass, per §6.3).
 * On success we route to "/" and the index redirect sends the user to the
 * surface their mode allows.
 */
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";

import { useSession } from "@/nexus/session";
import { useDocumentTitle } from "@/nexus/useDocumentTitle";
import { DEV_ENABLED, OPERATOR_PERSONAS, type DevPersona } from "@/nexus/dev/personas";
import { listDevOrgs } from "@/services/api";
import { portalPath } from "@/nexus/orgResolver";
import { ChevronRight } from "lucide-react";

export function Login() {
  const { login } = useSession();
  const navigate = useNavigate();
  useDocumentTitle("Nexus");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [devOrgs, setDevOrgs] = useState<{ id: string; name: string; slug: string }[]>([]);

  useEffect(() => {
    if (!DEV_ENABLED) return;
    // Live list — every org (and therefore everyone invited into it) is
    // reachable from the gate via its portal, including ones created a
    // minute ago. No hardcoded slugs.
    listDevOrgs()
      .then(setDevOrgs)
      .catch(() => setDevOrgs([]));
  }, []);

  async function signInAs(em: string, pw: string) {
    setBusy(true);
    setError(null);
    try {
      await login(em.trim(), pw);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await signInAs(email, password);
  }

  return (
    <div className="min-h-screen grid place-items-center text-foreground px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <div className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground text-sm font-semibold">
            N
          </div>
          <span className="text-lg font-semibold tracking-tight">Nexus</span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Sign in to Nexus</h1>
        <p className="mt-1 text-sm text-muted-foreground">Platform operators only. Organizations sign in at their own portal.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.org"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
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

        {DEV_ENABLED && OPERATOR_PERSONAS.length > 0 ? (
          <div className="mt-8">
            <div className="flex items-center gap-3 mb-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Dev quick sign-in</span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <div className="space-y-2">
              {OPERATOR_PERSONAS.map((p: DevPersona) => (
                <button
                  key={p.key}
                  type="button"
                  disabled={busy}
                  onClick={() => signInAs(p.email, p.password)}
                  className="flex w-full items-center gap-3 glass-card rounded-lg px-3 py-2.5 text-left hover:border-foreground/20 transition-colors disabled:opacity-50"
                >
                  <span className="grid size-8 place-items-center rounded-full bg-secondary text-secondary-foreground text-xs font-semibold shrink-0">
                    {p.glyph}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground truncate">{p.label}</span>
                    <span className="block text-xs text-muted-foreground truncate">{p.sublabel}</span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>

            {devOrgs.length > 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-border p-3">
                <div className="text-xs text-muted-foreground mb-2">
                  Org portals — members and invitees sign in (or "test as") from their org's page:
                </div>
                <div className="flex flex-col gap-1.5">
                  {devOrgs.map((o) => (
                    <Link
                      key={o.id}
                      to={portalPath(o.slug)}
                      className="flex items-center justify-between rounded-md bg-secondary px-2.5 py-1.5 text-xs text-secondary-foreground hover:opacity-80 transition-opacity"
                    >
                      <span className="font-medium">{o.name}</span>
                      <span className="font-mono opacity-70">/@/{o.slug}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

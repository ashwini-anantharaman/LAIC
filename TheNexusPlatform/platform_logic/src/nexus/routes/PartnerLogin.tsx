/**
 * Partner login portal (/partner/:slug) — a partner's own org-like sign-in.
 * Resolves the partner by its slug, shows its branding, and signs its members
 * in against the owning org. A partner member is a program-scoped member of the
 * partner (a "sister program"), so after login the normal confined-program
 * routing lands them in the partner workspace (People / Community / restricted
 * platform tabs). No account here = no entry.
 */
import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { Handshake } from "lucide-react";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { getPartnerPortal, type PartnerPortal } from "@/services/api";
import { resolveAssetUrl } from "@/services/apiBase";
import { useSession } from "@/nexus/session";
import { useDocumentTitle } from "@/nexus/useDocumentTitle";

export function PartnerLogin() {
  const { slug = "" } = useParams();
  const { login, setActiveOrg } = useSession();
  const navigate = useNavigate();

  const [portal, setPortal] = useState<PartnerPortal | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useDocumentTitle(portal?.partner.name ?? "Partner");

  useEffect(() => {
    getPartnerPortal(slug).then(setPortal).catch(() => setNotFound(true));
  }, [slug]);

  async function signIn(e: FormEvent) {
    e.preventDefault();
    if (!portal) return;
    setBusy(true);
    setError(null);
    try {
      // Sign in against the partner's owning org; a partner member is program-
      // scoped there, so RootRedirect routes them into the partner workspace.
      await login(email.trim(), password, portal.org_slug ?? undefined);
      setActiveOrg(portal.org_id);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  if (notFound) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="max-w-md text-center">
          <Handshake className="mx-auto size-8 text-muted-foreground" />
          <h1 className="mt-3 text-lg font-semibold text-foreground">Partner not found</h1>
          <p className="mt-1 text-sm text-muted-foreground">This partner link isn't valid.</p>
        </div>
      </div>
    );
  }

  const branding = portal?.partner.branding ?? null;
  const logo = branding?.logo ? resolveAssetUrl(branding.logo) : null;
  const accentStyle = branding?.accent ? ({ ["--primary" as string]: branding.accent } as CSSProperties) : undefined;

  return (
    <div className="grid min-h-screen place-items-center bg-background p-6" style={accentStyle}>
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          {logo ? (
            <img src={logo} alt="" className="size-9 rounded-md object-cover" />
          ) : (
            <div className="grid size-9 place-items-center rounded-md bg-primary/10 text-primary"><Handshake className="size-4" /></div>
          )}
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold tracking-tight">{portal?.partner.name ?? "Partner"}</div>
            {portal?.connected_program ? (
              <div className="text-xs text-muted-foreground">Partner of {portal.connected_program.name}</div>
            ) : null}
          </div>
        </div>
        <form onSubmit={signIn} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pl-email">Email</Label>
            <Input id="pl-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pl-pw">Password</Label>
            <Input id="pl-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={busy || !email.trim() || !password}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}

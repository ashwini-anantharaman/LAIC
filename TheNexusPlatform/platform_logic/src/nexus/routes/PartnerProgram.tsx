/**
 * Partner program portal (/partner/:orgSlug/:programSlug) — a gated view of a
 * program for members of a PARTNER organization. Access is one-directional and
 * resolved server-side by the caller's own org holding an active affiliation
 * grant on the program (see Partners). The partner sees only the program
 * elements the granted capabilities unlock — never the owning org's own space.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { useParams } from "react-router";
import { Handshake, Lock } from "lucide-react";

import { getPartnerProgramContext, type PartnerProgramContext } from "@/services/api";
import { resolveAssetUrl } from "@/services/apiBase";
import { EmptyState, Pill, Spinner } from "@/nexus/ui/kit";
import { useDocumentTitle } from "@/nexus/useDocumentTitle";

export function PartnerProgram() {
  const { orgSlug = "", programSlug = "" } = useParams();
  const [ctx, setCtx] = useState<PartnerProgramContext | null | "denied" | "loading">("loading");

  useEffect(() => {
    let live = true;
    setCtx("loading");
    getPartnerProgramContext(orgSlug, programSlug)
      .then((c) => live && setCtx(c))
      .catch(() => live && setCtx("denied"));
    return () => { live = false; };
  }, [orgSlug, programSlug]);

  useDocumentTitle(ctx && typeof ctx === "object" ? `${ctx.program.name} · Partner` : "Partner access");

  if (ctx === "loading") return <div className="grid min-h-screen place-items-center"><Spinner /></div>;

  if (ctx === "denied" || !ctx) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="max-w-md text-center">
          <Lock className="mx-auto size-8 text-muted-foreground" />
          <h1 className="mt-3 text-lg font-semibold text-foreground">No partner access</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your organization doesn’t have an active partner grant to this program, or you’re not
            signed in with an account that does. Ask the program’s admins to grant your organization
            access under Partners.
          </p>
        </div>
      </div>
    );
  }

  const logo = ctx.program.branding?.logo ? resolveAssetUrl(ctx.program.branding.logo) : null;
  const accentStyle = ctx.program.branding?.accent
    ? ({ ["--primary" as string]: ctx.program.branding.accent } as CSSProperties)
    : undefined;

  return (
    <div className="min-h-screen bg-background" style={accentStyle}>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-6 py-4">
          {logo ? (
            <img src={logo} alt="" className="size-8 rounded-md object-cover" />
          ) : (
            <div className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary"><Handshake className="size-4" /></div>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">{ctx.program.name}</div>
            <div className="text-xs text-muted-foreground">Partner view · {ctx.org_name}</div>
          </div>
          <Pill tone="accent" >Partner access</Pill>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-foreground">{ctx.program.name}</h1>
          {ctx.program.description ? (
            <p className="mt-1 text-sm text-muted-foreground">{ctx.program.description}</p>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            You’re viewing this program as a partner. You can access the areas your organization was
            granted below — a gated slice of the program, not the owning organization’s workspace.
          </p>
        </div>

        {ctx.surfaces.length === 0 ? (
          <EmptyState>Your organization has a partner grant, but no viewable areas were included yet.</EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {ctx.surfaces.map((s) => (
              <div key={s.id} className="glass-card p-4">
                <div className="text-sm font-medium text-foreground">{s.label}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">Granted to your organization</div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8">
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Granted capabilities</div>
          <div className="flex flex-wrap gap-1">
            {ctx.capabilities.length ? (
              ctx.capabilities.map((c) => <Pill key={c} tone="neutral">{c}</Pill>)
            ) : (
              <span className="text-xs text-muted-foreground">None</span>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

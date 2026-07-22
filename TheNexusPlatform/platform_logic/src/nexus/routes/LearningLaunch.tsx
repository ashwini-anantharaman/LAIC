/**
 * Learning Platform launch surface (Phase 5). Full-screen chrome with the
 * verified org/program launch context and a "Back to Nexus" exit. The interior
 * is a placeholder this pass — but the seam is real: launching mints a
 * single-use token via the LP's registered-app record and exchanges it, the
 * exact handshake a real LP will perform. When one exists, its launch_url is
 * set on the "learning-platform" app and this page opens it with the token.
 */
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { ChevronLeft, GraduationCap, LogOut } from "lucide-react";

import { exchangeLaunchToken, launchLearningPlatform, type LpLaunch } from "@/services/api";
import { Pill, Spinner } from "@/nexus/ui/kit";
import { useSession } from "@/nexus/session";
import { useProgramAccess } from "@/nexus/access";
import { orgPortalPath } from "@/nexus/branding";

type Handshake = "pending" | "verified" | "failed";

export function LearningLaunch() {
  const { orgId = "", programId = "" } = useParams();
  const { logout } = useSession();
  const access = useProgramAccess(programId);
  const [launch, setLaunch] = useState<LpLaunch | null>(null);
  const [handshake, setHandshake] = useState<Handshake>("pending");
  const [error, setError] = useState<string | null>(null);

  // A "Back" out of the platform only makes sense if the person has somewhere
  // to go back TO — i.e. the program workspace. A member confined to just this
  // platform has no workspace (they'd only be bounced here again), so they get
  // Sign out only.
  const otherAreas = Object.keys(access.perms).filter((k) => k !== "learning");
  const canGoBack = !access.loading && (access.isAdmin || access.impersonating || otherAreas.length > 0);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const l = await launchLearningPlatform(programId);
        if (!live) return;
        setLaunch(l);
        if (l.launch_url) {
          // A real LP exists — hand it the token and go, with a return address
          // so the platform can offer "Back to Nexus".
          const returnUrl = `${window.location.origin}/o/${orgId}/p/${programId}`;
          window.location.href =
            `${l.launch_url}?launch_token=${encodeURIComponent(l.launch_token)}` +
            `&return_url=${encodeURIComponent(returnUrl)}`;
          return;
        }
        // Placeholder interior: prove the handshake ourselves (the LP's side
        // of the contract) — exchange the single-use token for a session.
        try {
          await exchangeLaunchToken(l.launch_token);
          if (live) setHandshake("verified");
        } catch {
          if (live) setHandshake("failed");
        }
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Launch failed");
      }
    })();
    return () => {
      live = false;
    };
  }, [programId]);

  return (
    <div className="flex h-screen flex-col text-foreground">
      <header className="glass-bar flex h-14 shrink-0 items-center gap-3 border-b border-border px-5">
        <div className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
          <GraduationCap className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-tight">Learning Platform</div>
          {launch ? (
            <div className="text-xs text-muted-foreground leading-tight">
              {launch.context.program_name} · {launch.context.role}
            </div>
          ) : null}
        </div>
        <div className="flex-1" />
        {launch && !launch.launch_url ? (
          <Pill tone={handshake === "verified" ? "positive" : handshake === "failed" ? "danger" : "neutral"}>
            {handshake === "verified"
              ? "launch context verified"
              : handshake === "failed"
                ? "handshake failed"
                : "verifying…"}
          </Pill>
        ) : null}
        {canGoBack ? (
          <Link
            to={`/o/${orgId}/p/${programId}`}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <ChevronLeft className="size-3.5" /> Back to {launch?.context.program_name ?? "program"}
          </Link>
        ) : null}
        <button
          type="button"
          onClick={() => {
            const dest = orgPortalPath(orgId) ?? "/login";
            logout();
            window.location.assign(dest);
          }}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <LogOut className="size-3.5" /> Sign out
        </button>
      </header>

      <main className="grid flex-1 place-items-center px-6">
        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : !launch ? (
          <Spinner label="Launching…" />
        ) : (
          <div className="max-w-sm text-center">
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10">
              <GraduationCap className="size-7 text-foreground" />
            </div>
            <h1 className="mt-4 text-lg font-semibold tracking-tight">The Learning Platform arrives here</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This launch surface is live — Nexus minted and verified a single-use launch context for{" "}
              <span className="font-medium text-foreground">{launch.context.program_name}</span>. When the
              Learning Platform ships, it opens in this frame with that context.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

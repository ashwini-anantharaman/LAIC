/**
 * Bridge Platform launch surface. Full-screen chrome with the verified
 * org/program launch context and a "Back to Nexus" exit. Mirrors the Learning
 * Platform seam: launching mints a single-use token via the Bridge app record
 * and exchanges it. The interior is a placeholder until a real Bridge Platform
 * ships; when one does, its launch_url is set on the "bridge-platform" app and
 * this page opens it with the token. A Sign out lives here too — a member
 * whose only access is this platform must not be trapped in it.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ChevronLeft, LogOut, Waypoints } from "lucide-react";

import { exchangeLaunchToken, launchBridgePlatform, type LpLaunch } from "@/services/api";
import { Pill, Spinner } from "@/nexus/ui/kit";
import { useSession } from "@/nexus/session";

type Handshake = "pending" | "verified" | "failed";

export function BridgeLaunch() {
  const { orgId = "", programId = "" } = useParams();
  const navigate = useNavigate();
  const { logout } = useSession();
  const [launch, setLaunch] = useState<LpLaunch | null>(null);
  const [handshake, setHandshake] = useState<Handshake>("pending");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const l = await launchBridgePlatform(programId);
        if (!live) return;
        setLaunch(l);
        if (l.launch_url) {
          // A real Bridge Platform exists — hand it the token and go, with a
          // return address so the platform can offer "Back to Nexus".
          const returnUrl = `${window.location.origin}/o/${orgId}/p/${programId}`;
          window.location.href =
            `${l.launch_url}?launch_token=${encodeURIComponent(l.launch_token)}` +
            `&return_url=${encodeURIComponent(returnUrl)}` +
            `&program_id=${encodeURIComponent(programId)}`;
          return;
        }
        // Placeholder interior: prove the handshake ourselves — exchange the
        // single-use token for a session (the Bridge Platform's side of it).
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
  }, [orgId, programId]);

  return (
    <div className="flex h-screen flex-col text-foreground">
      <header className="glass-bar flex h-14 shrink-0 items-center gap-3 border-b border-border px-5">
        <div className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
          <Waypoints className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-tight">Bridge Platform</div>
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
        <Link
          to={`/o/${orgId}/p/${programId}`}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <ChevronLeft className="size-3.5" /> Back to Nexus
        </Link>
        <button
          type="button"
          onClick={() => {
            logout();
            navigate("/login");
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
              <Waypoints className="size-7 text-foreground" />
            </div>
            <h1 className="mt-4 text-lg font-semibold tracking-tight">The Bridge Platform arrives here</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This launch surface is live — Nexus minted and verified a single-use launch context for{" "}
              <span className="font-medium text-foreground">{launch.context.program_name}</span>. When the
              Bridge Platform ships, it opens in this frame with that context.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

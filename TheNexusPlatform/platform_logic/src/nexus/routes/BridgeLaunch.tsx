/**
 * Bridge Platform launch — a pure pass-through, not a page. Mints the
 * single-use launch token and hands the browser to the Bridge deployment;
 * the only thing a person should ever see here is one quiet loading state.
 * Sign out stays available so nobody is trapped if the handoff fails.
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { LogOut, Waypoints } from "lucide-react";

import { launchBridgePlatform } from "@/services/api";
import { Spinner } from "@/nexus/ui/kit";
import { useSession } from "@/nexus/session";
import { orgPortalPath } from "@/nexus/branding";

export function BridgeLaunch() {
  const { orgId = "", programId = "" } = useParams();
  const { logout } = useSession();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const l = await launchBridgePlatform(programId);
        if (!live) return;
        if (!l.launch_url) {
          setError("The Bridge Platform isn't linked in this environment.");
          return;
        }
        const returnUrl = `${window.location.origin}/o/${orgId}/p/${programId}`;
        window.location.replace(
          `${l.launch_url}?launch_token=${encodeURIComponent(l.launch_token)}` +
            `&return_url=${encodeURIComponent(returnUrl)}` +
            `&program_id=${encodeURIComponent(programId)}`,
        );
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Launch failed");
      }
    })();
    return () => {
      live = false;
    };
  }, [orgId, programId]);

  return (
    <div className="grid h-screen place-items-center px-6 text-foreground">
      <div className="flex flex-col items-center gap-4 text-center">
        {error ? (
          <>
            <div className="grid size-12 place-items-center rounded-2xl bg-primary/10">
              <Waypoints className="size-6 text-foreground" />
            </div>
            <p className="max-w-sm text-sm text-red-600 dark:text-red-400">{error}</p>
            <button
              type="button"
              onClick={() => {
                const dest = orgPortalPath(orgId) ?? "/login";
                logout();
                window.location.assign(dest);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <LogOut className="size-4" /> Sign out
            </button>
          </>
        ) : (
          <Spinner label="Opening Bridge Platform…" />
        )}
      </div>
    </div>
  );
}

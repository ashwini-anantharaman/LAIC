/**
 * The Content Studio's own pipeline, in a dialog, for one object.
 *
 * WHY AN IFRAME OF THE REAL THING. The first version of this drew its own
 * read-out of the pipeline — build path, plan, sources, questions — and it was
 * wrong in the way rebuilt UIs always are: it showed the stages without BEING
 * them, so editing meant a second, thinner editor that could never keep up with
 * the Studio's. A reviewer asking "how was this built" and an editor changing a
 * generated question both want the actual authoring surface. So this frames it.
 *
 * SCOPED TO ONE OBJECT. The Studio boots with `?pipeline=edit|review&object=<id>`
 * — chromeless, no sidebar, no library, no create flow, one object's creator and
 * nothing else. See App.tsx's pipeline embed for what that mode does.
 *
 * ACCESS IS TWO SEPARATE THINGS, and this is the whole reason the mode exists:
 *
 *   learning.studio.access   may open the Content Studio — the app, its library,
 *                            every object in the program
 *   a FOLDER grant's level   may review, or edit, the objects in one folder
 *
 * Nobody needs the first to get here. The second is checked by the server on
 * every read and every write; `mode` only decides what this screen offers, so a
 * crafted `mode=edit` buys nothing.
 *
 * THE LAUNCH TOKEN IS A REAL SESSION, and worth saying plainly: the frame
 * authenticates by minting the same single-use launch token the Studio tab uses.
 * The nav is gone and the boot goes straight to one object, but the token itself
 * is not narrower than a Studio session. Narrowing it — a token scoped to one
 * object — is a server change, not a UI one, and until it exists this is a
 * confinement of the SCREEN, not of the credential.
 */
import { useEffect, useState } from "react";
import { Eye, Loader2, SquarePen, X } from "lucide-react";

import { launchLearningPlatform } from "@/services/api";
import { ObjectVersionsPanel } from "@/nexus/routes/ObjectVersionsPanel";
import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/components/ui/utils";

export function PipelineStudioDialog({
  programId,
  objectId,
  title,
  canEdit,
  view: initialView = "pipeline",
  onClose,
}: {
  programId: string;
  objectId: string;
  title: string;
  /** From the server's `can_edit` on the pipeline read — never guessed here. */
  canEdit: boolean;
  /**
   * Which face to open on.
   *   'pipeline' — how it was built, and (with edit access) change it
   *   'output'   — the finished thing, exactly as a learner receives it
   */
  view?: "pipeline" | "output" | "versions";
  onClose: () => void;
}) {
  const [view, setView] = useState<"pipeline" | "output" | "versions">(initialView);
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setSrc(null);
    setError(null);
    // Versions come from Nexus's own API, so this view needs no Studio launch —
    // minting a single-use token for a list nobody frames would be waste.
    if (view === "versions") return;
    void (async () => {
      try {
        const l = await launchLearningPlatform(programId);
        if (!live) return;
        if (!l.launch_url) {
          setError("The Content Studio is not configured for this deployment.");
          return;
        }
        const u = new URL(l.launch_url);
        u.searchParams.set("launch_token", l.launch_token);
        u.searchParams.set("object", objectId);
        u.searchParams.set("program_id", programId);
        if (view === "pipeline") {
          u.searchParams.set("pipeline", canEdit ? "edit" : "review");
        } else {
          // The learner's own reader. `chrome=none` and no `pipeline` param, so
          // this is the finished object rather than the authoring surface —
          // reading the SAME row a save just wrote, which is why an edit shows up
          // here without anything having to push it.
          u.searchParams.set("chrome", "none");
        }
        setSrc(u.toString());
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Couldn't open the pipeline");
      }
    })();
    return () => {
      live = false;
    };
    // A fresh single-use token per open. Reusing one across opens would fail the
    // second time in a way that looks like a broken screen.
    // Re-minted per view as well as per open: each launch token is single-use,
    // so switching faces needs its own.
  }, [programId, objectId, canEdit, view]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Pipeline for ${title}`}
    >
      <div className="flex h-full w-full max-w-[1400px] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl">
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-2.5">
          <span className="min-w-0 truncate text-sm font-semibold">{title || "Pipeline"}</span>
          <span
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
              view === "output" && "hidden sm:flex",
              canEdit
                ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
                : "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
            )}
          >
            {canEdit ? <SquarePen className="size-3" /> : <Eye className="size-3" />}
            {canEdit ? "Edit access" : "Review access"}
          </span>
          {/* TWO FACES OF ONE OBJECT, side by side. A reviewer checking a change
              needs to see the finished thing, and an editor needs to see what
              their edit did — asking them to close and reopen for that is asking
              them to hold it in their head. */}
          <div className="ml-auto flex rounded-lg border p-0.5">
            {(["pipeline", "output", "versions"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  view === v
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v === "pipeline" ? "Pipeline" : v === "output" ? "Final output" : "Versions"}
              </button>
            ))}
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 bg-muted/30">
          {view === "versions" ? (
            <ObjectVersionsPanel programId={programId} objectId={objectId} />
          ) : error ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm">
              <div>
                <p className="font-medium text-foreground">The pipeline didn&rsquo;t open</p>
                <p className="mt-1 text-muted-foreground">{error}</p>
              </div>
            </div>
          ) : !src ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Opening the pipeline…
            </div>
          ) : (
            <iframe
              src={src}
              title={`Pipeline for ${title}`}
              className="size-full border-0"
              // The Studio needs its own origin's storage (drafts, versions) and
              // runs same-site here; forms and popups stay off since one object's
              // pipeline needs neither.
              sandbox="allow-scripts allow-same-origin allow-downloads"
            />
          )}
        </div>
      </div>
    </div>
  );
}

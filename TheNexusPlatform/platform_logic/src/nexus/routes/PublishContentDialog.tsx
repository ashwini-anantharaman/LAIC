/**
 * "Where does this go?" — choosing the app(s) a selection publishes to.
 *
 * A list rather than a single choice, and a list even while there is one app to
 * choose. Bridge Bird is the only entry today; the shape that assumes exactly one
 * destination is the one that has to be torn out when the second arrives, and the
 * server already validates against a registry rather than a constant.
 *
 * Mixed state is shown as a dash for the same reason it is in the share dialog: a
 * selection where some items already publish to an app is not the same as one
 * where all of them do, and saving writes the whole set.
 */
import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Smartphone, Users } from "lucide-react";
import { toast } from "sonner";

import {
  listShareableClubs,
  setContentAppTargets,
  type LibraryObject,
  type ShareableClub,
} from "@/services/api";
import { CONTENT_APP_TARGETS } from "@/types/platform";
import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { cn } from "@/app/components/ui/utils";

type Tri = "on" | "off" | "some";

export function PublishContentDialog({
  programId,
  objects,
  label,
  administersApps = [],
  canScopeToClub = true,
  onClose,
  onSaved,
}: {
  programId: string;
  objects: LibraryObject[];
  label: string;
  /** Apps this viewer administers. They may publish to these without holding
   *  publish.app_target, and may scope to a club without publish_club — running
   *  the app is what those permissions describe. */
  administersApps?: string[];
  /**
   * learning.app.publish_club — or administering an app, which carries it for
   * that app: deciding which club sees what on the app you run IS the job.
   *
   * Without it the audience picker is not shown at all. Showing it and refusing
   * the save is how someone chooses "Only B2F3", presses Save, and gets a 403
   * that takes the whole publish with it.
   */
  canScopeToClub?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initial = useMemo(() => {
    const m = new Map<string, Tri>();
    for (const app of CONTENT_APP_TARGETS) {
      const n = objects.filter((o) => o.apps.includes(app.key)).length;
      m.set(app.key, n === 0 ? "off" : n === objects.length ? "on" : "some");
    }
    return m;
  }, [objects]);

  const [state, setState] = useState<Map<string, Tri>>(() => new Map(initial));
  const [saving, setSaving] = useState(false);
  /** null = the whole app. A club id limits what that club sees on the app. */
  const [scope, setScope] = useState<string | null>(null);
  const [clubs, setClubs] = useState<ShareableClub[] | null>(null);

  useEffect(() => {
    if (!canScopeToClub) return; // nothing to draw, so nothing to fetch
    let live = true;
    listShareableClubs(programId)
      .then((cs) => live && setClubs(cs))
      .catch(() => live && setClubs([]));
    return () => {
      live = false;
    };
  }, [programId, canScopeToClub]);

  // Re-read the current state THROUGH the chosen scope: "on" for the whole app is
  // not "on" for Highbury, and showing the whole-app answer while a club is
  // selected would make Save look like a no-op when it is a real change.
  const scoped = useMemo(() => {
    const m = new Map<string, Tri>();
    for (const app of CONTENT_APP_TARGETS) {
      const n = objects.filter((o) =>
        o.app_scopes.some((t) => t.app_key === app.key && t.club_program_id === scope),
      ).length;
      m.set(app.key, n === 0 ? "off" : n === objects.length ? "on" : "some");
    }
    return m;
  }, [objects, scope]);

  // Switching scope resets the picker to that scope's truth rather than carrying
  // the previous scope's ticks across, which would publish by accident.
  useEffect(() => {
    setState(new Map(scoped));
  }, [scoped]);

  const dirty = [...state].some(([k, v]) => scoped.get(k) !== v);

  async function save() {
    setSaving(true);
    try {
      const keys = [...state].filter(([, v]) => v === "on").map(([k]) => k);
      const res = await setContentAppTargets(programId, objects.map((o) => o.id), keys, scope);
      const where = scope
        ? ` for ${clubs?.find((c) => c.id === scope)?.name ?? "that club"}`
        : "";
      toast.success(
        keys.length
          ? `Published ${res.published} ${res.published === 1 ? "item" : "items"}${where}`
          : `Withdrawn${where || " from every app"} (${res.published})`,
      );
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't set the target app");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Publish &ldquo;{label}&rdquo;</DialogTitle>
          <DialogDescription>
            {objects.length === 1
              ? "Choose where this appears."
              : `Choose where these ${objects.length} items appear.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-0.5">
          {CONTENT_APP_TARGETS.map((app) => {
            const s = state.get(app.key) ?? "off";
            return (
              <button
                key={app.key}
                type="button"
                aria-pressed={s === "on"}
                onClick={() =>
                  setState((m) => {
                    const n = new Map(m);
                    n.set(app.key, m.get(app.key) === "on" ? "off" : "on");
                    return n;
                  })
                }
                className="flex items-center gap-2.5 rounded-lg px-2 py-2.5 text-left hover:bg-accent/50"
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-[4px] border shadow-xs",
                    s === "off"
                      ? "border-input bg-input-background dark:bg-input/30"
                      : "border-primary bg-primary text-primary-foreground",
                  )}
                >
                  {s === "on" && <Check className="size-3.5" />}
                  {s === "some" && <span className="h-0.5 w-2 rounded-full bg-current" />}
                </span>
                <Smartphone className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">{app.label}</span>
                {/* Why this row is available to them at all: an app
                    administrator publishes to their own app by authority, not by
                    capability. Saying so prevents "why can I do this here and
                    not there". */}
                {administersApps.includes(app.key) && (
                  <span className="ml-auto text-[11px] text-muted-foreground">you administer</span>
                )}
              </button>
            );
          })}
        </div>

        {/* WHO SEES IT ON THE APP. An app administrator's second decision, and
            the reason the row above is not the whole story. */}
        {canScopeToClub && clubs && clubs.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              On the app, visible to
            </p>
            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                aria-pressed={scope === null}
                onClick={() => setScope(null)}
                className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-accent/50"
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-3.5 shrink-0 rounded-full border-[4px]",
                    scope === null ? "border-primary" : "border-input",
                  )}
                />
                <span className="text-sm">Everyone on the app</span>
              </button>
              {clubs.map((club) => (
                <button
                  key={club.id}
                  type="button"
                  aria-pressed={scope === club.id}
                  onClick={() => setScope(club.id)}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-accent/50"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "size-3.5 shrink-0 rounded-full border-[4px]",
                      scope === club.id ? "border-primary" : "border-input",
                    )}
                  />
                  <Users className="size-4 text-muted-foreground" />
                  <span className="text-sm">Only {club.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          Publishing decides where content appears. It does not grant access — that is what
          sharing decides. Each audience is saved on its own, so publishing for one club
          leaves the others as they are.
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving || !dirty}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
import { useMemo, useState } from "react";
import { Check, Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { setContentAppTargets, type LibraryObject } from "@/services/api";
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
  onClose,
  onSaved,
}: {
  programId: string;
  objects: LibraryObject[];
  label: string;
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

  const dirty = [...state].some(([k, v]) => initial.get(k) !== v);

  async function save() {
    setSaving(true);
    try {
      const keys = [...state].filter(([, v]) => v === "on").map(([k]) => k);
      const res = await setContentAppTargets(programId, objects.map((o) => o.id), keys);
      toast.success(
        keys.length
          ? `Published ${res.published} ${res.published === 1 ? "item" : "items"}`
          : `Withdrawn from every app (${res.published})`,
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
              </button>
            );
          })}
        </div>

        <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          Publishing records where content is meant to appear. It does not change who can
          see it — that is what sharing decides.
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

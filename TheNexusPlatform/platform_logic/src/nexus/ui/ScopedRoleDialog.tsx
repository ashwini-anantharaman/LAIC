/**
 * Role builder for the ORG and NEXUS altitudes — same thought-out model as the
 * program-level builder: every toggle is a real surface at that altitude.
 * kind "graded" = view/edit select; kind "toggle" = a single on/off whose
 * stored grant is the level named in `grant` ("view" for read-only surfaces
 * like Audit, "edit" for act-on surfaces like Nexus Settings).
 */
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { Switch } from "@/app/components/ui/switch";

export interface ScopedArea {
  key: string;
  label: string;
  kind: "graded" | "toggle";
  /** For kind "toggle": the grant stored when on. */
  grant?: "view" | "edit";
  hint?: string;
}

export function ScopedRoleDialog({
  title,
  areas,
  onSave,
  onClose,
}: {
  title: string;
  areas: ScopedArea[];
  onSave: (name: string, perms: Record<string, string>) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [perms, setPerms] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  function toggle(a: ScopedArea, on: boolean) {
    setPerms((p) => {
      const next = { ...p };
      if (on) next[a.key] = a.kind === "toggle" ? (a.grant ?? "view") : "view";
      else delete next[a.key];
      return next;
    });
  }

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onSave(name.trim(), perms);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save role");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="srole-name">Role name</Label>
            <Input id="srole-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Auditor" />
          </div>
          <div className="space-y-2">
            <Label>Access</Label>
            <p className="text-xs text-muted-foreground -mt-1">
              Grant an area, then pick a level. Ungranted areas disappear from this role's view.
            </p>
            {areas.map((a) => {
              const on = a.key in perms;
              return (
                <div key={a.key} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                  <Switch checked={on} onCheckedChange={(v) => toggle(a, v)} />
                  <span className="flex-1 text-sm">
                    {a.label}
                    {a.hint ? <span className="block text-[11px] text-muted-foreground">{a.hint}</span> : null}
                  </span>
                  {a.kind === "graded" ? (
                    <Select
                      value={perms[a.key] ?? "view"}
                      onValueChange={(v) => setPerms((p) => ({ ...p, [a.key]: v }))}
                      disabled={!on}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="view">view</SelectItem>
                        <SelectItem value="edit">edit</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className={`text-xs font-medium ${on ? "text-foreground" : "text-muted-foreground"}`}>
                      {a.grant === "edit" ? "Manage" : "View"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !name.trim()}>
            {busy ? "Saving…" : "Create role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

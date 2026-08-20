/**
 * Sub-roles a Content Manager mints for other people — from Nexus, not the Studio.
 *
 * THE CEILING IS THE WHOLE IDEA. A delegate may only grant what they themselves
 * hold, and the server enforces that regardless of what this screen sends
 * (routes/platform.ts, _clampToCeiling). So this offers exactly the capabilities
 * in their ceiling and nothing more — a toggle that would be silently dropped on
 * save is worse than an absent one, because the person believes they granted it.
 *
 * `learning.roles.delegate` is never offered. A sub-role that can mint further
 * sub-roles turns one grant into an unbounded tree, and the server withholds it
 * too; showing it here would be a control that quietly does nothing.
 *
 * The server also refuses to write a capability-LESS role for a delegate, because
 * a role with no capabilities is not a weak role but an ungated one (every
 * fine-grained check returns early for a caller whose access came from their
 * launch level). Save stays disabled until something is ticked, so that refusal
 * is never reached by accident.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, Pencil, Plus, Shield, Trash2, UserCog } from "lucide-react";
import { toast } from "sonner";

import {
  assignSubRole,
  createSubRole,
  deleteSubRole,
  getLearningCapabilityCatalogue,
  getLearningCeiling,
  listLearningPeople,
  listSubRoles,
  updateSubRole,
  type LearningCapability,
  type LearningCapabilityGroup,
  type LearningPerson,
  type SubRole,
} from "@/services/api";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/app/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/app/components/ui/select";
import { EmptyState } from "@/nexus/ui/kit";
import { ConfirmButton } from "@/nexus/ui/ConfirmButton";
import { cn } from "@/app/components/ui/utils";

/** Never grantable onward, however the catalogue evolves. */
const NEVER_DELEGABLE = new Set(["learning.roles.delegate"]);

const capsOf = (r: SubRole): string[] => {
  const c = (r.perms as { capabilities?: unknown })?.capabilities;
  return Array.isArray(c) ? (c as string[]) : [];
};

function RoleEditor({
  programId,
  role,
  grantable,
  groups,
  onClose,
  onSaved,
}: {
  programId: string;
  /** null = creating. */
  role: SubRole | null;
  grantable: LearningCapability[];
  groups: LearningCapabilityGroup[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(role ? capsOf(role) : []));
  const [saving, setSaving] = useState(false);

  const byGroup = useMemo(() => {
    const m = new Map<string, LearningCapability[]>();
    for (const c of grantable) {
      const list = m.get(c.group) ?? [];
      list.push(c);
      m.set(c.group, list);
    }
    return m;
  }, [grantable]);

  const ordered = useMemo(
    () =>
      [...groups]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .filter((g) => (byGroup.get(g.id) ?? []).length > 0),
    [groups, byGroup],
  );

  async function save() {
    setSaving(true);
    try {
      const caps = [...picked];
      if (role) await updateSubRole(programId, role.id, { name: name.trim(), capabilities: caps });
      else await createSubRole(programId, name.trim(), caps);
      toast.success(role ? `Updated “${name.trim()}”` : `Created “${name.trim()}”`);
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the role");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{role ? `Edit “${role.name}”` : "New sub-role"}</DialogTitle>
          <DialogDescription>
            Pick what this role can do. You can only grant what your own role holds.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="subrole-name">Role name</Label>
          <Input
            id="subrole-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Content Access Granter"
          />
        </div>

        <div className="max-h-[42vh] space-y-4 overflow-y-auto">
          {ordered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Your role holds no capabilities that can be passed on.
            </p>
          ) : (
            ordered.map((g) => (
              <div key={g.id}>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {g.label}
                </p>
                <div className="flex flex-col gap-0.5">
                  {(byGroup.get(g.id) ?? []).map((c) => {
                    const on = picked.has(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setPicked((s) => {
                            const n = new Set(s);
                            n.has(c.id) ? n.delete(c.id) : n.add(c.id);
                            return n;
                          })
                        }
                        className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-accent/50"
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border shadow-xs",
                            on
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-input bg-input-background dark:bg-input/30",
                          )}
                        >
                          {on && <Check className="size-3.5" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm">{c.label}</span>
                          <span className="block font-mono text-[11px] text-muted-foreground">{c.id}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          A role must grant at least one capability. An empty role is not a limited one —
          it falls back to the platform&rsquo;s default access.
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => void save()}
            disabled={saving || !name.trim() || picked.size === 0}
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            {saving ? "Saving…" : role ? "Save" : "Create role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SubRolesPanel({ programId }: { programId: string }) {
  const [ceiling, setCeiling] = useState<string[] | null>(null);
  const [catalogue, setCatalogue] = useState<{
    capabilities: LearningCapability[];
    groups: LearningCapabilityGroup[];
  } | null>(null);
  const [roles, setRoles] = useState<SubRole[] | null>(null);
  const [people, setPeople] = useState<LearningPerson[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ role: SubRole | null } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [c, cat, rs, ps] = await Promise.all([
        getLearningCeiling(programId),
        getLearningCapabilityCatalogue(programId),
        listSubRoles(programId),
        listLearningPeople(programId).catch(() => [] as LearningPerson[]),
      ]);
      setCeiling(c);
      setCatalogue(cat);
      setRoles(rs);
      setPeople(ps);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load sub-roles");
    }
  }, [programId]);

  useEffect(() => {
    void load();
  }, [load]);

  // What this person may pass on: their ceiling, minus what is never delegable,
  // intersected with the catalogue so an id with no label never renders bare.
  const grantable = useMemo(() => {
    if (!ceiling || !catalogue) return [];
    const mine = new Set(ceiling.filter((id) => !NEVER_DELEGABLE.has(id)));
    return catalogue.capabilities.filter((c) => mine.has(c.id));
  }, [ceiling, catalogue]);

  const labelOf = useMemo(() => {
    const m = new Map((catalogue?.capabilities ?? []).map((c) => [c.id, c.label]));
    return (id: string) => m.get(id) ?? id;
  }, [catalogue]);

  async function assign(email: string, roleId: string | null) {
    try {
      await assignSubRole(programId, email, roleId);
      toast.success(roleId ? "Role assigned" : "Role removed");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change that person's role");
    }
  }

  if (error) {
    return (
      <EmptyState>
        <p className="font-medium text-foreground">Sub-roles didn&rsquo;t load</p>
        <p className="mt-1">{error}</p>
      </EmptyState>
    );
  }
  if (!roles || !catalogue || !ceiling) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading sub-roles…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Sub-roles</h2>
            <p className="text-sm text-muted-foreground">
              Roles you create for other people. You can grant {grantable.length} of your own
              {grantable.length === 1 ? " capability" : " capabilities"}.
            </p>
          </div>
          <Button size="sm" onClick={() => setEditing({ role: null })} disabled={!grantable.length}>
            <Plus className="size-4" /> New sub-role
          </Button>
        </div>

        {roles.length === 0 ? (
          <EmptyState>
            <p className="font-medium text-foreground">No sub-roles yet</p>
            <p className="mt-1">
              Create one to let someone publish, or share with clubs, without giving them
              everything your own role holds.
            </p>
          </EmptyState>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            {roles.map((r) => {
              const caps = capsOf(r);
              return (
                <div key={r.id} className="flex items-start gap-3 border-b p-3 last:border-b-0">
                  <Shield className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{r.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {caps.length === 0
                        ? "No capabilities"
                        : caps.map(labelOf).join(" · ")}
                    </p>
                  </div>
                  <Button size="icon" variant="ghost" aria-label={`Edit ${r.name}`}
                    onClick={() => setEditing({ role: r })}>
                    <Pencil className="size-4" />
                  </Button>
                  <ConfirmButton
                    title={`Delete “${r.name}”?`}
                    description="Anyone holding this role loses it. Their access falls back to the platform's default, which may be wider than this role allowed."
                    actionLabel="Delete role"
                    buttonTitle={`Delete ${r.name}`}
                    onConfirm={async () => {
                      try {
                        await deleteSubRole(programId, r.id);
                        toast.success(`Deleted “${r.name}”`);
                        await load();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Couldn't delete that role");
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </ConfirmButton>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3">
          <h2 className="text-lg font-semibold">People</h2>
          <p className="text-sm text-muted-foreground">
            Give someone one of your sub-roles. Administrators are not listed — their access
            is not yours to change.
          </p>
        </div>

        {!people || people.length === 0 ? (
          <EmptyState>
            <p>No people to assign yet.</p>
          </EmptyState>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            {people
              .filter((p) => !p.is_admin && p.email)
              .map((p) => (
                <div key={p.email} className="flex items-center gap-3 border-b p-3 last:border-b-0">
                  <UserCog className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.display_name || p.email}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.email}</p>
                  </div>
                  <Select
                    value={p.role_id ?? "__none__"}
                    onValueChange={(v) => void assign(p.email!, v === "__none__" ? null : v)}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="No role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No role</SelectItem>
                      {roles.map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
          </div>
        )}
      </section>

      {editing && (
        <RoleEditor
          programId={programId}
          role={editing.role}
          grantable={grantable}
          groups={catalogue.groups}
          onClose={() => setEditing(null)}
          onSaved={() => void load()}
        />
      )}
    </div>
  );
}

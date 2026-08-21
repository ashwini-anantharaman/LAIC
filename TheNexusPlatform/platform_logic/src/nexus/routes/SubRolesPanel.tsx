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
import { Check, Loader2, Pencil, Plus, Shield, Smartphone, Trash2, UserCog } from "lucide-react";
import { toast } from "sonner";

import {
  assignSubRole,
  createSubRole,
  deleteSubRole,
  getLearningCapabilityCatalogue,
  getLearningCeiling,
  listLearningPeople,
  getAppAdmins,
  listSubRoles,
  setAppAdmins,
  updateSubRole,
  type AppAdminApp,
  type LearningCapability,
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

/**
 * What a sub-role can be about: the things THIS SCREEN does, and nothing else.
 *
 * The learning catalogue holds 29 capabilities covering authoring, sources,
 * review, teaching and the learner runtime. None of those happen here, and
 * offering them would make a Content Manager the gatekeeper of the whole Studio
 * by accident — they would be handing out powers they cannot see the effects of
 * from this tab.
 *
 * So the list is the library's own surface, in the order someone reasons about
 * it: get in, look, share, publish. Four toggles, deliberately.
 *
 * `learning.roles.delegate` is absent and must stay absent: a sub-role that can
 * mint sub-roles turns one grant into an unbounded tree, and the server withholds
 * it too, so a toggle for it would be a control that does nothing.
 *
 * Adding to the library's surface means adding here. That is the intended
 * coupling — this list is the answer to "what can be delegated", and it should
 * change only when the screen does.
 */
const LIBRARY_CAPABILITIES = [
  "learning.library.console",
  "learning.library.share_view",
  "learning.library.share_club",
  "learning.library.share_member",
  "learning.library.share_app",
  "learning.publish.app_target",
  "learning.app.publish_club",
  "learning.library.upload",
  "learning.library.folder_manage",
  "learning.library.file_content",
] as const;

const DELEGABLE = new Set<string>(LIBRARY_CAPABILITIES);

/**
 * Said in terms of this screen, not the catalogue.
 *
 * The catalogue's own labels are written for the platform's role builder and
 * describe capabilities in the abstract ("Set program, organization, cohort, or
 * participant audience"). Someone here is delegating a job on a page they are
 * looking at, so the words name the buttons in front of them.
 */
const SUBROLE_LABELS: Record<string, string> = {
  "learning.library.console": "Open the Content Library",
  "learning.library.share_view": "See who content is shared with",
  "learning.library.share_club": "Share content with whole clubs",
  "learning.library.share_member": "Share content with individual members",
  "learning.library.share_app": "Share content with an app's administrators",
  "learning.publish.app_target": "Publish content to an app",
  "learning.app.publish_club": "Choose which club sees content on the app",
  "learning.library.upload": "Add files to the library",
  "learning.library.folder_manage": "Create and organize folders",
  "learning.library.file_content": "Publish Studio content into a folder",
};

const SUBROLE_HINTS: Record<string, string> = {
  "learning.library.console": "Without this the tab does not appear at all.",
  "learning.library.share_view": "Read-only: they can see the clubs and people on each item.",
  "learning.library.share_club": "A whole club at once; its administrators decide onward.",
  "learning.library.share_member": "Named people, including anyone who belongs to no club.",
  "learning.library.share_app": "They see it and decide. Sharing puts nothing on the app.",
  "learning.publish.app_target": "The publish dialog. Stronger than sharing — it goes live in the app.",
  "learning.app.publish_club": "Narrow a publish to one club instead of everyone on the app.",
  "learning.library.upload": "Upload or link a PDF, image or video, and file it into folders.",
  "learning.library.folder_manage":
    "Make, rename and remove folders. Folders only \u2014 never content. Removing one keeps what was inside.",
  "learning.library.file_content":
    "Take a tutorial from the Content Studio and put it in a folder here. Only folders they can already see.",
};

const capsOf = (r: SubRole): string[] => {
  const c = (r.perms as { capabilities?: unknown })?.capabilities;
  return Array.isArray(c) ? (c as string[]) : [];
};

function RoleEditor({
  programId,
  role,
  grantable,
  onClose,
  onSaved,
}: {
  programId: string;
  /** null = creating. */
  role: SubRole | null;
  grantable: LearningCapability[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(role ? capsOf(role) : []));
  const [saving, setSaving] = useState(false);

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

        {/* A flat list, because there are four of these. Grouping four items by
            catalogue section is filing cabinets for a single sheet of paper. */}
        <div className="flex flex-col gap-0.5">
          {grantable.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Your own role holds none of the Content Library&rsquo;s capabilities, so there is
              nothing to pass on.
            </p>
          ) : (
            grantable.map((c) => {
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
                  className="flex items-start gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-accent/50"
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
                    <span className="block text-sm">{SUBROLE_LABELS[c.id] ?? c.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {SUBROLE_HINTS[c.id] ?? c.description ?? c.id}
                    </span>
                  </span>
                </button>
              );
            })
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
  // Only the capabilities are read now — the four toggles render as a flat list,
  // so the catalogue's own grouping has nothing left to say here.
  const [catalogue, setCatalogue] = useState<{ capabilities: LearningCapability[] } | null>(null);
  const [roles, setRoles] = useState<SubRole[] | null>(null);
  const [people, setPeople] = useState<LearningPerson[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ role: SubRole | null } | null>(null);
  const [apps, setApps] = useState<AppAdminApp[] | null>(null);
  const [candidates, setCandidates] = useState<{ profile_id: string; display_name: string }[]>([]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [c, cat, rs, ps, aa] = await Promise.all([
        getLearningCeiling(programId),
        getLearningCapabilityCatalogue(programId),
        listSubRoles(programId),
        listLearningPeople(programId).catch(() => [] as LearningPerson[]),
        // Appointing app administrators needs share_app, which a delegate may not
        // hold — an empty register is the right answer for them, not an error.
        getAppAdmins(programId).catch(() => ({ apps: [], candidates: [] })),
      ]);
      setCeiling(c);
      setCatalogue(cat);
      setRoles(rs);
      setPeople(ps);
      setApps(aa.apps);
      setCandidates(aa.candidates);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load sub-roles");
    }
  }, [programId]);

  useEffect(() => {
    void load();
  }, [load]);

  // What this person may pass on: the library's own capabilities, intersected
  // with their ceiling. Ordered by LIBRARY_CAPABILITIES rather than by the
  // catalogue, so the list reads get-in → look → share → publish instead of
  // however the catalogue happens to be grouped.
  const grantable = useMemo(() => {
    if (!ceiling || !catalogue) return [];
    const mine = new Set(ceiling);
    const byId = new Map(catalogue.capabilities.map((c) => [c.id, c]));
    return LIBRARY_CAPABILITIES.filter((id) => DELEGABLE.has(id) && mine.has(id))
      .map((id) => byId.get(id))
      .filter(Boolean) as LearningCapability[];
  }, [ceiling, catalogue]);

  const labelOf = useMemo(() => {
    const m = new Map((catalogue?.capabilities ?? []).map((c) => [c.id, c.label]));
    // The screen's words first, so a role's summary reads the same as the editor
    // that made it. Falling back to the catalogue keeps any legacy capability on
    // an existing role legible rather than showing a bare id.
    return (id: string) => SUBROLE_LABELS[id] ?? m.get(id) ?? id;
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

      {/* THE APP-ADMINISTRATOR REGISTER. An `app` grant hands content to these
          people, so who they are belongs beside the roles rather than in an org
          settings screen nobody visits. Empty when the viewer cannot appoint —
          the endpoint refuses without share_app and the load treats that as "no
          register", not as an error. */}
      {apps && apps.length > 0 && (
        <section>
          <div className="mb-3">
            <h2 className="text-lg font-semibold">App administrators</h2>
            <p className="text-sm text-muted-foreground">
              Sharing content with an app shares it with these people. They decide what
              actually goes on the app, and which club sees it there.
            </p>
          </div>
          <div className="overflow-hidden rounded-xl border">
            {apps.map((app) => (
              <div key={app.key} className="flex items-start gap-3 border-b p-3 last:border-b-0">
                <Smartphone className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{app.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {app.admins.length === 0
                      ? "Nobody yet — content shared with this app reaches no one."
                      : app.admins.map((a) => a.display_name).join(" · ")}
                  </p>
                </div>
                <Select
                  value="__add__"
                  onValueChange={(v) => {
                    if (v === "__add__") return;
                    const next = [...new Set([...app.admins.map((a) => a.profile_id), v])];
                    void (async () => {
                      try {
                        await setAppAdmins(programId, app.key, next);
                        toast.success("App administrator added");
                        await load();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Couldn't add them");
                      }
                    })();
                  }}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="Add someone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__add__">Add someone…</SelectItem>
                    {candidates
                      .filter((c) => !app.admins.some((a) => a.profile_id === c.profile_id))
                      .map((c) => (
                        <SelectItem key={c.profile_id} value={c.profile_id}>
                          {c.display_name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {app.admins.length > 0 && (
                  <ConfirmButton
                    title={`Remove all administrators of ${app.label}?`}
                    description="Content shared with this app will reach nobody until someone else is appointed."
                    actionLabel="Remove all"
                    buttonTitle={`Clear ${app.label} administrators`}
                    onConfirm={async () => {
                      try {
                        await setAppAdmins(programId, app.key, []);
                        toast.success("Administrators cleared");
                        await load();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Couldn't clear them");
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </ConfirmButton>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {editing && (
        <RoleEditor
          programId={programId}
          role={editing.role}
          grantable={grantable}
          onClose={() => setEditing(null)}
          onSaved={() => void load()}
        />
      )}
    </div>
  );
}

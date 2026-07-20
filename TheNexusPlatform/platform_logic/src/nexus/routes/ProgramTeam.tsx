/**
 * Program → Team & Roles (§3.5). A program admin defines named roles (a name
 * plus per-area access), assigns people to them, and can "Test as" either a
 * role (preview) or a real person (actual dev sign-in) to confirm everything
 * is stored and confining correctly.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Copy, Eye, Pencil, Plus, Trash2 } from "lucide-react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import {
  createProgramRole,
  deleteProgramRole,
  devLoginAs,
  inviteProgramMember,
  listProgramMembers,
  listProgramRoles,
  listPrograms,
  removeMember,
  revokeInvitation,
  setProgramMemberRole,
  updateProgramRole,
  type AccessLevel,
  type ProgramMember,
  type ProgramRole,
  type RoleArea,
  type RolePerms,
} from "@/services/api";
import type { Invitation, Program, ProgramFeatureKey } from "@/types/platform";
import { DEFAULT_PROGRAM_FEATURES, PROGRAM_FEATURES } from "@/types/platform";
import { EmptyState, PageHeader, Pill, Section, Spinner } from "@/nexus/ui/kit";
import { DEV_ENABLED } from "@/nexus/dev/personas";
import { ConfirmButton } from "@/nexus/ui/ConfirmButton";
import { useSession } from "@/nexus/session";

// Role areas mirror the program's configurable features 1:1 (same keys).
// Platform areas (learning, bridge) grant a single "administrator" toggle —
// holders enter that platform as its Program Admin. Finer Bridge roles are
// administered inside the Bridge Platform itself (stored centrally in Nexus).
const AREAS: { key: RoleArea; label: string; platform?: boolean }[] =
  PROGRAM_FEATURES.map((f) => ({
    key: f.key as RoleArea,
    label: f.label,
    platform: f.key === "learning" || f.key === "bridge",
  }));
const LEVELS: AccessLevel[] = ["view", "edit", "comment"];
const areaLabel = (k: string) => AREAS.find((a) => a.key === k)?.label ?? k;
// "bridge_club_admin" → "Club Admin" (display only; assigned inside Bridge).
const bridgeRoleLabel = (r: string) =>
  r.replace(/^bridge_/, "").split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

export function ProgramTeam() {
  const { orgId = "", programId = "" } = useParams();
  const navigate = useNavigate();
  const { startImpersonation, refresh } = useSession();

  const [program, setProgram] = useState<Program | null>(null);
  const [roles, setRoles] = useState<ProgramRole[] | null>(null);
  const [members, setMembers] = useState<ProgramMember[] | null>(null);
  const [editing, setEditing] = useState<ProgramRole | "new" | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => {
    listPrograms(orgId).then((ps) => setProgram(ps.find((p) => p.id === programId) ?? null)).catch(() => {});
  }, [orgId, programId]);

  // The program's accessible features gate which areas roles can grant/show.
  const enabledFeatures = program?.features ?? DEFAULT_PROGRAM_FEATURES;

  const load = useCallback(() => {
    listProgramRoles(programId).then(setRoles).catch(() => setRoles([]));
    listProgramMembers(programId).then(setMembers).catch(() => setMembers([]));
  }, [programId]);
  useEffect(() => load(), [load]);

  async function remove(role: ProgramRole) {
    try {
      await deleteProgramRole(role.id);
      toast.success(`Deleted "${role.name}"`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete role");
    }
  }

  function testAsRole(role: ProgramRole) {
    startImpersonation({
      roleName: role.name,
      perms: role.perms as Record<string, string>,
      orgId,
      programId,
    });
    navigate(`/o/${orgId}/p/${programId}`);
  }

  async function testAsPerson(m: ProgramMember) {
    if (!m.email) return;
    try {
      await devLoginAs(m.email, { id: orgId });
      await refresh();
      navigate("/", { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not sign in as this person");
    }
  }

  async function removePerson(m: ProgramMember) {
    try {
      if (m.membership_id) {
        await removeMember(m.membership_id);
        toast.success(`${m.display_name ?? m.email} removed from the program`);
      } else if (m.invitation_id) {
        await revokeInvitation(m.invitation_id);
        toast.success(`Invitation for ${m.display_name ?? m.email} withdrawn — the link no longer works`);
      }
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    }
  }

  async function assignRole(m: ProgramMember, roleId: string | null) {
    if (!m.email) return;
    try {
      await setProgramMemberRole(programId, m.email, roleId);
      toast.success(roleId ? "Role assigned" : "Role cleared");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to assign role");
    }
  }

  return (
    <div>
      <PageHeader
        title={program?.name ?? "Program"}
        subtitle="Define roles, assign people to them, and test exactly what each person sees."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" /> Create role
          </Button>
        }
      />

      <Section title="Roles">
        {!roles ? (
          <Spinner />
        ) : roles.length === 0 ? (
          <EmptyState>No roles yet. Create one, then assign people to it below.</EmptyState>
        ) : (
          <div className="space-y-2">
            {roles.map((r) => {
              // Only show areas that are still enabled for this program — a
              // feature turned off after the fact stops appearing as granted.
              const granted = Object.keys(r.perms).filter(
                (a) => enabledFeatures[a as ProgramFeatureKey],
              );
              const holders = (members ?? []).filter((m) => m.role_id === r.id).length;
              return (
                <div key={r.id} className="flex items-center gap-3 glass-card px-4 py-3">
                  <div className="min-w-[140px]">
                    <div className="font-medium text-foreground">{r.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {holders} member{holders !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <div className="flex flex-1 flex-wrap gap-1.5">
                    {granted.length ? (
                      granted.map((a) => (
                        <Pill key={a} tone="neutral">
                          {areaLabel(a)} · {r.perms[a as RoleArea]}
                        </Pill>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">no areas</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => testAsRole(r)} title="Preview a member with this role">
                      <Eye className="size-3.5" /> Test as
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(r)} title="Edit role">
                      <Pencil className="size-3.5" />
                    </Button>
                    <ConfirmButton
                      title={`Delete the "${r.name}" role?`}
                      description="Members assigned to it keep their membership but lose the role's access."
                      actionLabel="Delete"
                      onConfirm={() => remove(r)}
                      buttonTitle="Delete role"
                    >
                      <Trash2 className="size-3.5 text-red-600 dark:text-red-400" />
                    </ConfirmButton>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section
        title="People"
        action={
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <Plus className="size-3.5" /> Invite member
          </Button>
        }
      >
        {!members ? (
          <Spinner />
        ) : members.length === 0 ? (
          <EmptyState>No people in this program yet. Invite a member and give them a role.</EmptyState>
        ) : (
          <div className="glass-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => {
                  const isAdmin = m.membership_role === "administrator" || m.membership_role === "owner";
                  return (
                    <TableRow key={m.email ?? Math.random()}>
                      <TableCell>
                        <div className="font-medium text-foreground">{m.display_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{m.email}</div>
                      </TableCell>
                      <TableCell>
                        {isAdmin ? (
                          <Pill tone="accent">Program Administrator</Pill>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <Select
                              value={m.role_id ?? "none"}
                              onValueChange={(v) => assignRole(m, v === "none" ? null : v)}
                            >
                              <SelectTrigger className="h-8 w-44">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No role</SelectItem>
                                {(roles ?? []).map((r) => (
                                  <SelectItem key={r.id} value={r.id}>
                                    {r.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {m.bridge_role ? (
                              <span
                                className="text-[11px] text-muted-foreground"
                                title="Assigned inside the Bridge Platform (People & Roles) — managed there, not here."
                              >
                                Bridge Platform · {bridgeRoleLabel(m.bridge_role)}
                              </span>
                            ) : null}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Pill tone={m.status === "active" ? "positive" : "warn"}>{m.status}</Pill>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          {DEV_ENABLED && m.email ? (
                            <Button size="sm" variant="ghost" onClick={() => testAsPerson(m)} title="Sign in as this person (dev)">
                              <Eye className="size-3.5" /> Test as
                            </Button>
                          ) : null}
                          {m.membership_id || m.invitation_id ? (
                            <ConfirmButton
                              title={
                                m.status === "invited"
                                  ? `Withdraw the invitation for ${m.display_name ?? m.email}?`
                                  : `Remove ${m.display_name ?? m.email} from this program?`
                              }
                              description={
                                m.status === "invited"
                                  ? "Their activation link stops working."
                                  : "They lose access to this program immediately."
                              }
                              actionLabel={m.status === "invited" ? "Withdraw" : "Remove"}
                              onConfirm={() => removePerson(m)}
                              buttonTitle={m.status === "invited" ? "Withdraw invitation" : "Remove from program"}
                            >
                              <Trash2 className="size-3.5 text-red-600 dark:text-red-400" />
                            </ConfirmButton>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>

      {editing ? (
        <RoleBuilder
          programId={programId}
          role={editing === "new" ? null : editing}
          features={program?.features}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      ) : null}

      <InviteMemberDialog
        programId={programId}
        roles={roles ?? []}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={load}
      />
    </div>
  );
}

function InviteMemberDialog({
  programId,
  roles,
  open,
  onOpenChange,
  onInvited,
}: {
  programId: string;
  roles: ProgramRole[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onInvited: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState<string>("none");
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<Invitation | null>(null);

  const link = invite?.token ? `${window.location.origin}/invite/${invite.token}` : invite?.redeem_url ?? "";

  function reset() {
    setName("");
    setEmail("");
    setRoleId("none");
    setInvite(null);
  }

  async function submit() {
    if (!email.trim()) return;
    setBusy(true);
    try {
      const inv = await inviteProgramMember(programId, {
        email: email.trim(),
        display_name: name.trim() || undefined,
        role_id: roleId === "none" ? undefined : roleId,
      });
      setInvite(inv);
      onInvited();
      toast.success("Member invited — they now appear in People as “invited”.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to invite member");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite member</DialogTitle>
        </DialogHeader>
        {invite ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Share this activation link with {invite.display_name ?? invite.email}. They set their own
              password on first sign-in.
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
              <code className="flex-1 truncate text-xs font-mono">{link}</code>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(link);
                  toast.success("Copied");
                }}
                className="grid size-7 place-items-center rounded-md hover:bg-accent"
                title="Copy link"
              >
                <Copy className="size-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="mem-name">Name</Label>
              <Input id="mem-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jordan Lee" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mem-email">Email</Label>
              <Input
                id="mem-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jordan@example.org"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={roleId} onValueChange={setRoleId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No role yet</SelectItem>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <DialogFooter>
          {invite ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={busy || !email.trim()}>
                {busy ? "Inviting…" : "Invite member"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoleBuilder({
  programId,
  role,
  features,
  onClose,
  onSaved,
}: {
  programId: string;
  role: ProgramRole | null;
  features?: Record<ProgramFeatureKey, boolean>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [perms, setPerms] = useState<RolePerms>(() => {
    const initial = { ...(role?.perms ?? {}) };
    // Bridge grants from the short-lived picker era normalize to the toggle.
    if (typeof initial.bridge === "string" && initial.bridge.startsWith("bridge_")) {
      initial.bridge = "administrator";
    }
    return initial;
  });
  const [busy, setBusy] = useState(false);

  // Only areas the program has enabled can be granted (defaults to all-on for
  // programs created before feature config existed).
  const enabled = features ?? DEFAULT_PROGRAM_FEATURES;
  const availableAreas = AREAS.filter((a) => enabled[a.key as ProgramFeatureKey]);

  function toggle(area: RoleArea, on: boolean) {
    const isPlatform = AREAS.find((a) => a.key === area)?.platform;
    setPerms((p) => {
      const next = { ...p };
      if (on) next[area] = isPlatform ? "administrator" : next[area] ?? "view";
      else delete next[area];
      return next;
    });
  }
  function setLevel(area: RoleArea, level: AccessLevel) {
    setPerms((p) => ({ ...p, [area]: level }));
  }

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    // Never persist perms for a disabled area, even if carried over from an
    // older role edit (the server enforces this too — belt and suspenders).
    const cleanPerms = Object.fromEntries(
      Object.entries(perms).filter(([area]) => enabled[area as ProgramFeatureKey]),
    ) as RolePerms;
    try {
      if (role) await updateProgramRole(role.id, { name: name.trim(), perms: cleanPerms });
      else await createProgramRole(programId, { name: name.trim(), perms: cleanPerms });
      toast.success(role ? "Role updated" : "Role created");
      onSaved();
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
          <DialogTitle>{role ? "Edit role" : "Create role"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="role-name">Role name</Label>
            <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Content Reviewer" />
          </div>
          <div className="space-y-2">
            <Label>Access</Label>
            <p className="text-xs text-muted-foreground -mt-1">
              Grant an area, then pick a level. Only features enabled for this program are shown.
            </p>
            {availableAreas.length === 0 ? (
              <p className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground">
                No features are enabled for this program yet. Enable some from Programs → Features.
              </p>
            ) : null}
            {availableAreas.map((a) => {
              const on = a.key in perms;
              return (
                <div key={a.key} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                  <Switch checked={on} onCheckedChange={(v) => toggle(a.key, v)} />
                  <span className="flex-1 text-sm">{a.label}</span>
                  {a.platform ? (
                    <span className={`text-xs font-medium ${on ? "text-foreground" : "text-muted-foreground"}`}>
                      Administrator
                    </span>
                  ) : (
                    <Select value={perms[a.key] ?? "view"} onValueChange={(v) => setLevel(a.key, v as AccessLevel)} disabled={!on}>
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LEVELS.map((l) => (
                          <SelectItem key={l} value={l}>
                            {l}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
            {busy ? "Saving…" : role ? "Save role" : "Create role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

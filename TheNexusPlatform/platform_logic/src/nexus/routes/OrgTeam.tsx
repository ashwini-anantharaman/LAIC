/**
 * Org space → Team & Roles: the org-altitude mirror of the program page.
 * Roles grant the org's REAL surfaces (Programs, Team, Settings graded
 * view/edit; Audit as a view toggle). People = org-LEVEL only — admins and
 * custom-role members; programs own their own rosters (§Q3).
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Copy, Eye, Plus, Trash2 } from "lucide-react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import {
  createInvitation,
  createOrgScopedRole,
  deleteProgramRole,
  devLoginAs,
  inviteOrgTeamMember,
  listOrgScopedRoles,
  listOrgTeam,
  removeMember,
  revokeInvitation,
  setOrgTeamRole,
  type ScopedRole,
  type TeamPerson,
} from "@/services/api";
import { EmptyState, PageHeader, Pill, Section, Spinner } from "@/nexus/ui/kit";
import { DEV_ENABLED } from "@/nexus/dev/personas";
import { ConfirmButton } from "@/nexus/ui/ConfirmButton";
import { ScopedRoleDialog, type ScopedArea } from "@/nexus/ui/ScopedRoleDialog";
import { useSession } from "@/nexus/session";

const ORG_AREAS: ScopedArea[] = [
  { key: "programs", label: "Programs", kind: "graded", hint: "edit = create/configure programs, assign program admins" },
  { key: "team", label: "Team & Roles", kind: "graded", hint: "edit = invite/remove members, assign roles" },
  { key: "settings", label: "Settings", kind: "graded", hint: "edit = theme, logo, categories" },
  { key: "audit", label: "Audit", kind: "toggle", grant: "view", hint: "read-only by nature" },
];
const areaLabel = (k: string) => ORG_AREAS.find((a) => a.key === k)?.label ?? k;

export function OrgTeam() {
  const { orgId = "" } = useParams();
  const navigate = useNavigate();
  const { refresh } = useSession();
  const [roles, setRoles] = useState<ScopedRole[] | null>(null);
  const [team, setTeam] = useState<TeamPerson[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const load = useCallback(() => {
    listOrgScopedRoles(orgId).then(setRoles).catch(() => setRoles([]));
    listOrgTeam(orgId).then(setTeam).catch(() => setTeam([]));
  }, [orgId]);
  useEffect(() => load(), [load]);

  async function removeRole(r: ScopedRole) {
    try {
      await deleteProgramRole(r.id);
      toast.success(`Deleted "${r.name}"`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete role");
    }
  }

  async function assignRole(p: TeamPerson, roleId: string | null) {
    if (!p.email) return;
    try {
      await setOrgTeamRole(orgId, p.email, roleId);
      toast.success(roleId ? "Role assigned" : "Role cleared");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to assign role");
    }
  }

  async function testAs(p: TeamPerson) {
    if (!p.email) return;
    try {
      await devLoginAs(p.email, { id: orgId });
      await refresh();
      navigate("/", { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not sign in as this person");
    }
  }

  async function removePerson(p: TeamPerson) {
    try {
      if (p.membership_id) await removeMember(p.membership_id);
      else if (p.invitation_id) await revokeInvitation(p.invitation_id);
      toast.success(`${p.display_name ?? p.email} removed`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    }
  }

  return (
    <div>
      <PageHeader
        title="Team & Roles"
        subtitle="Who runs this organization, and what each role can see and do."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Create role
          </Button>
        }
      />

      <Section title="Roles">
        {!roles ? (
          <Spinner />
        ) : roles.length === 0 ? (
          <EmptyState>No org roles yet. Create one, then assign people to it below.</EmptyState>
        ) : (
          <div className="space-y-2">
            {roles.map((r) => {
              const holders = (team ?? []).filter((p) => p.role_id === r.id).length;
              return (
                <div key={r.id} className="flex items-center gap-3 glass-card px-4 py-3">
                  <div className="min-w-[140px]">
                    <div className="font-medium text-foreground">{r.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {holders} member{holders !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <div className="flex flex-1 flex-wrap gap-1.5">
                    {Object.keys(r.perms).length ? (
                      Object.entries(r.perms).map(([a, lvl]) => (
                        <Pill key={a} tone="neutral">
                          {areaLabel(a)} · {lvl}
                        </Pill>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">no areas</span>
                    )}
                  </div>
                  <ConfirmButton
                    title={`Delete the "${r.name}" role?`}
                    description="Members assigned to it keep their membership but lose the role's access."
                    actionLabel="Delete"
                    onConfirm={() => removeRole(r)}
                    buttonTitle="Delete role"
                  >
                    <Trash2 className="size-3.5 text-red-600 dark:text-red-400" />
                  </ConfirmButton>
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
            <Plus className="size-3.5" /> Invite
          </Button>
        }
      >
        {!team ? (
          <Spinner />
        ) : team.length === 0 ? (
          <EmptyState>No org-level people yet.</EmptyState>
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
                {team.map((p) => {
                  const isAdmin = p.membership_role === "administrator" || p.membership_role === "owner";
                  return (
                    <TableRow key={p.membership_id ?? p.invitation_id ?? p.email}>
                      <TableCell>
                        <div className="font-medium text-foreground">{p.display_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{p.email}</div>
                      </TableCell>
                      <TableCell>
                        {isAdmin ? (
                          <div>
                            <Pill tone="accent">{p.membership_role === "owner" ? "Owner" : "Admin"}</Pill>
                            <div className="text-[11px] text-muted-foreground mt-0.5">Organization-level access</div>
                          </div>
                        ) : (
                          <Select
                            value={p.role_id ?? "none"}
                            onValueChange={(v) => assignRole(p, v === "none" ? null : v)}
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
                        )}
                      </TableCell>
                      <TableCell>
                        <Pill tone={p.status === "active" ? "positive" : "warn"}>{p.status}</Pill>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          {DEV_ENABLED && p.email ? (
                            <Button size="sm" variant="ghost" onClick={() => testAs(p)} title="Sign in as this person (dev)">
                              <Eye className="size-3.5" /> Test as
                            </Button>
                          ) : null}
                          {p.membership_role !== "owner" && (p.membership_id || p.invitation_id) ? (
                            <ConfirmButton
                              title={
                                p.status === "invited"
                                  ? `Withdraw the invitation for ${p.display_name ?? p.email}?`
                                  : `Remove ${p.display_name ?? p.email}?`
                              }
                              description={
                                p.status === "invited"
                                  ? "Their activation link stops working."
                                  : "They lose access to this organization immediately."
                              }
                              actionLabel={p.status === "invited" ? "Withdraw" : "Remove"}
                              onConfirm={() => removePerson(p)}
                              buttonTitle="Remove"
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

      {creating ? (
        <ScopedRoleDialog
          title="Create org role"
          areas={ORG_AREAS}
          onClose={() => setCreating(false)}
          onSave={async (name, perms) => {
            await createOrgScopedRole(orgId, { name, perms });
            toast.success("Role created");
            load();
          }}
        />
      ) : null}

      <OrgInviteDialog orgId={orgId} roles={roles ?? []} open={inviteOpen} onOpenChange={setInviteOpen} onDone={load} />
    </div>
  );
}

/** Invite an administrator (full org access) or a member confined by a role. */
function OrgInviteDialog({
  orgId,
  roles,
  open,
  onOpenChange,
  onDone,
}: {
  orgId: string;
  roles: ScopedRole[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [level, setLevel] = useState<string>("member");
  const [roleId, setRoleId] = useState<string>("none");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  function reset() {
    setName("");
    setEmail("");
    setLevel("member");
    setRoleId("none");
    setLink(null);
  }

  async function submit() {
    if (!email.trim()) return;
    setBusy(true);
    try {
      const inv =
        level === "administrator"
          ? await createInvitation(orgId, { email: email.trim(), display_name: name.trim() || undefined, role: "administrator" })
          : await inviteOrgTeamMember(orgId, {
              email: email.trim(),
              display_name: name.trim() || undefined,
              role_id: roleId === "none" ? undefined : roleId,
            });
      setLink(inv.token ? `${window.location.origin}/invite/${inv.token}` : inv.redeem_url ?? null);
      onDone();
      toast.success("Invited");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to invite");
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
          <DialogTitle>Invite to the organization</DialogTitle>
        </DialogHeader>
        {link ? (
          <div className="space-y-2">
            <Label>Activation link</Label>
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
              <Label htmlFor="ot-name">Name</Label>
              <Input id="ot-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jordan Lee" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ot-email">Email</Label>
              <Input id="ot-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jordan@example.org" />
            </div>
            <div className="space-y-1.5">
              <Label>Access</Label>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member (confined by a role)</SelectItem>
                  <SelectItem value="administrator">Administrator (full org access)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {level === "member" ? (
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
            ) : null}
          </div>
        )}
        <DialogFooter>
          {link ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={busy || !email.trim()}>
                {busy ? "Inviting…" : "Invite"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

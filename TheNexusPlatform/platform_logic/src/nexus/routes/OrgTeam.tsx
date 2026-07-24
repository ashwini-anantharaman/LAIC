/**
 * Org space → Team & Roles: the org-altitude mirror of the program page.
 * Roles grant the org's REAL surfaces (Programs, Team, Settings graded
 * view/edit; Audit as a view toggle). People = org-LEVEL only — admins and
 * custom-role members; programs own their own rosters (§Q3).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Copy, Eye, Layers, LayoutGrid, Plus, Trash2 } from "lucide-react";
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
import {
  createInvitation,
  devLoginAs,
  getOrgGroupsModel,
  inviteOrgTeamMember,
  listOrgScopedRoles,
  listOrgTeam,
  removeMember,
  revokeInvitation,
  setOrgMemberGroups,
  setOrgTeamRole,
  type GroupsModel,
  type ScopedRole,
  type TeamPerson,
} from "@/services/api";
import { DEV_ENABLED } from "@/nexus/dev/personas";
import { ConfirmButton } from "@/nexus/ui/ConfirmButton";
import { PeoplePage, CollapsibleSection } from "@/nexus/people/PeoplePage";
import { RolesAndGroups } from "@/nexus/people/RolesAndGroups";
import { MemberRoster, type RosterMember } from "@/nexus/people/MemberRoster";
import { orgRgAdapter } from "@/nexus/people/adapters";
import { useSession } from "@/nexus/session";

export function OrgTeam() {
  const { orgId = "" } = useParams();
  const navigate = useNavigate();
  const { refresh } = useSession();
  const [roles, setRoles] = useState<ScopedRole[] | null>(null);
  const [team, setTeam] = useState<TeamPerson[] | null>(null);
  const [groupsModel, setGroupsModel] = useState<GroupsModel | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [view, setView] = useState<"grid" | "stack">(
    () => (localStorage.getItem("nexus_people_view") as "grid" | "stack") || "grid",
  );
  const switchView = (v: "grid" | "stack") => { setView(v); localStorage.setItem("nexus_people_view", v); };
  const rg = useMemo(() => orgRgAdapter(orgId), [orgId]);

  const load = useCallback(() => {
    listOrgScopedRoles(orgId).then(setRoles).catch(() => setRoles([]));
    listOrgTeam(orgId).then(setTeam).catch(() => setTeam([]));
    getOrgGroupsModel(orgId).then(setGroupsModel).catch(() => setGroupsModel(null));
  }, [orgId]);
  useEffect(() => load(), [load]);

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

  const rosterMembers: RosterMember[] | null =
    team?.map((p) => ({
      key: p.membership_id ?? p.invitation_id ?? p.email ?? "",
      email: p.email,
      name: p.display_name,
      status: p.status,
      roleId: p.role_id,
      privileged: p.membership_role === "administrator" || p.membership_role === "owner",
      privilegedLabel: p.membership_role === "owner" ? "Owner" : "Admin",
    })) ?? null;

  const renderActions = (m: RosterMember) => {
    const p = team?.find((x) => (x.membership_id ?? x.invitation_id ?? x.email) === m.key);
    if (!p) return null;
    return (
      <>
        {DEV_ENABLED && p.email ? (
          <Button size="sm" variant="ghost" onClick={() => testAs(p)} title="Sign in as this person (dev)">
            <Eye className="size-3.5" /> Test as
          </Button>
        ) : null}
        {p.membership_role !== "owner" && (p.membership_id || p.invitation_id) ? (
          <ConfirmButton
            title={p.status === "invited" ? `Withdraw the invitation for ${p.display_name ?? p.email}?` : `Remove ${p.display_name ?? p.email}?`}
            description={p.status === "invited" ? "Their activation link stops working." : "They lose access to this organization immediately."}
            actionLabel={p.status === "invited" ? "Withdraw" : "Remove"}
            onConfirm={() => removePerson(p)}
            buttonTitle="Remove"
          >
            <Trash2 className="size-3.5 text-red-600 dark:text-red-400" />
          </ConfirmButton>
        ) : null}
      </>
    );
  };

  const peopleActions = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button
        type="button"
        onClick={() => switchView(view === "grid" ? "stack" : "grid")}
        className="grid size-9 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        title={view === "grid" ? "Stack view (group by group)" : "Grid view (everyone)"}
        aria-label="Switch people view"
      >
        {view === "grid" ? <Layers className="size-4" /> : <LayoutGrid className="size-4" />}
      </button>
      <Button size="sm" onClick={() => setInviteOpen(true)}>
        <Plus className="size-3.5" /> Invite
      </Button>
    </div>
  );

  const peopleContent = (
    <CollapsibleSection title="Organization members" count={team?.length}>
      <MemberRoster
        members={rosterMembers}
        roles={(roles ?? []).map((r) => ({ id: r.id, name: r.name }))}
        groupsModel={groupsModel}
        view={view}
        privilegedNote="Organization-level access"
        onAssignRole={(email, roleId) => assignRole({ email } as TeamPerson, roleId)}
        onSetGroups={async (email, ids) => { await setOrgMemberGroups(orgId, email, ids); load(); }}
        renderActions={renderActions}
      />
    </CollapsibleSection>
  );

  return (
    <>
      <PeoplePage
        subtitle="Who runs this organization, and what each role can see and do."
        actions={peopleActions}
        people={peopleContent}
        rolesGroups={<RolesAndGroups adapter={rg} />}
      />
      <OrgInviteDialog orgId={orgId} roles={roles ?? []} open={inviteOpen} onOpenChange={setInviteOpen} onDone={load} />
    </>
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

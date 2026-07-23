/**
 * Nexus operator → Team & Roles: who operates the platform. Full operators
 * see/do everything; confined operators carry a platform-scope custom role
 * over the console's REAL surfaces (Organizations view/edit, Audit, Settings).
 * Managed by full operators only. The org people walls are untouched — this
 * is strictly about who runs Nexus.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Layers, LayoutGrid, Plus, Trash2 } from "lucide-react";
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
  getNexusGroupsModel,
  inviteNexusOperator,
  listNexusScopedRoles,
  listNexusTeam,
  removeNexusOperator,
  setNexusMemberGroups,
  setNexusTeamRole,
  type GroupsModel,
  type NexusOperator,
  type ScopedRole,
} from "@/services/api";
import { ConfirmButton } from "@/nexus/ui/ConfirmButton";
import { PeoplePage, CollapsibleSection } from "@/nexus/people/PeoplePage";
import { RolesAndGroups } from "@/nexus/people/RolesAndGroups";
import { MemberRoster, type RosterMember } from "@/nexus/people/MemberRoster";
import { nexusRgAdapter } from "@/nexus/people/adapters";
import { useSession } from "@/nexus/session";

export function NexusTeam() {
  const { user } = useSession();
  const [roles, setRoles] = useState<ScopedRole[] | null>(null);
  const [team, setTeam] = useState<NexusOperator[] | null>(null);
  const [groupsModel, setGroupsModel] = useState<GroupsModel | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [view, setView] = useState<"grid" | "stack">(
    () => (localStorage.getItem("nexus_people_view") as "grid" | "stack") || "grid",
  );
  const switchView = (v: "grid" | "stack") => { setView(v); localStorage.setItem("nexus_people_view", v); };
  const rg = useMemo(() => nexusRgAdapter(), []);

  const load = useCallback(() => {
    listNexusScopedRoles().then(setRoles).catch(() => setRoles([]));
    listNexusTeam().then(setTeam).catch(() => setTeam([]));
    getNexusGroupsModel().then(setGroupsModel).catch(() => setGroupsModel(null));
  }, []);
  useEffect(() => load(), [load]);

  async function assignRole(p: NexusOperator, roleId: string | null) {
    if (!p.email) return;
    try {
      await setNexusTeamRole(p.email, roleId);
      toast.success(roleId ? "Role assigned" : "Role cleared");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to assign role");
    }
  }

  async function removeOperator(p: NexusOperator) {
    if (!p.email) return;
    try {
      await removeNexusOperator(p.email);
      toast.success(`${p.display_name ?? p.email} removed`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    }
  }

  const rosterMembers: RosterMember[] | null =
    team?.map((p) => ({
      key: p.email ?? p.invitation_id ?? "",
      email: p.email,
      name: p.display_name,
      status: p.status,
      roleId: p.role_id,
      privileged: p.kind === "admin",
      privilegedLabel: "Admin",
    })) ?? null;

  const renderActions = (m: RosterMember) => {
    const p = team?.find((x) => (x.email ?? x.invitation_id) === m.key);
    if (!p) return null;
    const isSelf = !!user?.email && p.email?.toLowerCase() === user.email.toLowerCase();
    if (isSelf || !p.email) return <span className="text-xs text-muted-foreground">you</span>;
    return (
      <ConfirmButton
        title={`Remove ${p.display_name ?? p.email} as an operator?`}
        description="They lose all Nexus console access. Their account itself is untouched."
        actionLabel="Remove"
        onConfirm={() => removeOperator(p)}
        buttonTitle="Remove operator"
      >
        <Trash2 className="size-3.5 text-red-600 dark:text-red-400" />
      </ConfirmButton>
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
        <Plus className="size-3.5" /> Invite operator
      </Button>
    </div>
  );

  const peopleContent = (
    <CollapsibleSection title="Operators" count={team?.length}>
      <MemberRoster
        members={rosterMembers}
        roles={(roles ?? []).map((r) => ({ id: r.id, name: r.name }))}
        groupsModel={groupsModel}
        view={view}
        privilegedNote="Platform-level access"
        onAssignRole={(email, roleId) => assignRole({ email } as NexusOperator, roleId)}
        onSetGroups={async (email, ids) => { await setNexusMemberGroups(email, ids); load(); }}
        renderActions={renderActions}
      />
    </CollapsibleSection>
  );

  return (
    <>
      <PeoplePage
        subtitle="Who operates Nexus, and what each operator role can see and do."
        actions={peopleActions}
        people={peopleContent}
        rolesGroups={<RolesAndGroups adapter={rg} />}
      />
      <NexusInviteDialog roles={roles ?? []} open={inviteOpen} onOpenChange={setInviteOpen} onDone={load} />
    </>
  );
}

function NexusInviteDialog({
  roles,
  open,
  onOpenChange,
  onDone,
}: {
  roles: ScopedRole[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState<string>("full");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  function reset() {
    setName("");
    setEmail("");
    setRoleId("full");
    setLink(null);
  }

  async function submit() {
    if (!email.trim()) return;
    setBusy(true);
    try {
      const inv = await inviteNexusOperator({
        email: email.trim(),
        display_name: name.trim() || undefined,
        role_id: roleId === "full" ? undefined : roleId,
      });
      setLink(inv.token ? `${window.location.origin}/invite/${inv.token}` : inv.redeem_url ?? null);
      onDone();
      toast.success("Operator invited");
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
          <DialogTitle>Invite an operator</DialogTitle>
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
              <Label htmlFor="nx-name">Name</Label>
              <Input id="nx-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jordan Lee" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nx-email">Email</Label>
              <Input id="nx-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jordan@example.org" />
            </div>
            <div className="space-y-1.5">
              <Label>Access</Label>
              <Select value={roleId} onValueChange={setRoleId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full operator</SelectItem>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      Confined · {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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

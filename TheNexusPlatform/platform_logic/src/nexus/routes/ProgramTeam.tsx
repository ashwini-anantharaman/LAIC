/**
 * Program → Team & Roles (§3.5). A program admin defines named roles (a name
 * plus per-area access), assigns people to them, and can "Test as" either a
 * role (preview) or a real person (actual dev sign-in) to confirm everything
 * is stored and confining correctly.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router";
import { ChevronRight, Copy, Eye, Layers, LayoutGrid, Pencil, Plus, Trash2 } from "lucide-react";
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
  createGroup,
  createProgramRole,
  deleteGroup,
  deleteProgramRole,
  devLoginAs,
  inviteProgramMember,
  getProgramGroupsModel,
  updateGroup,
  getProgramTeamSummary,
  listProgramPlatformGroup,
  listProgramRoles,
  listPrograms,
  removeMember,
  revokeInvitation,
  setProgramMemberGroups,
  setProgramMemberRole,
  updateProgramRole,
  type AccessLevel,
  type MemberEnrollResult,
  type PlatformGroupMember,
  type ProgramGroupsModel,
  type ProgramMember,
  type ProgramRole,
  type RoleArea,
  type RolePerms,
} from "@/services/api";
import type { Program, ProgramFeatureKey } from "@/types/platform";
import { DEFAULT_PROGRAM_FEATURES, PROGRAM_FEATURES } from "@/types/platform";
import { EmptyState, Pill, Section, Spinner } from "@/nexus/ui/kit";
import { DEV_ENABLED } from "@/nexus/dev/personas";
import { ConfirmButton } from "@/nexus/ui/ConfirmButton";
import { PeoplePage, CollapsibleSection } from "@/nexus/people/PeoplePage";
import { RolesAndGroups, type RgRole } from "@/nexus/people/RolesAndGroups";
import { programRgAdapter } from "@/nexus/people/adapters";
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
// Human labels for platform roles assigned inside a platform (read-only here).
const PLATFORM_LABELS: Record<string, string> = { bridge: "Bridge Platform", learning: "Content Studio" };
const platformRoleLabel = (r: string) => {
  if (["bridge_program_admin", "bridge_org_admin", "bridge_club_admin", "administrator"].includes(r)) return "Admin";
  if (r === "bridge_reviewer" || r === "bridge_fellow") return "Reviewer & Fellow";
  if (r === "bridge_coach") return "Coach";
  if (r === "bridge_learner") return "Learner";
  // Learning + generic: turn a key like "content-developer" into "Content Developer".
  return r.replace(/^(bridge|learning)[_-]/, "").split(/[-_]/).map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");
};
// The first platform this person holds a role in, if any.
const heldPlatform = (m: { platform_roles?: Record<string, string> | null; bridge_role?: string | null }) => {
  const roles = m.platform_roles ?? (m.bridge_role ? { bridge: m.bridge_role } : {});
  const platform = Object.keys(roles)[0];
  return platform ? { platform, role: roles[platform] } : null;
};

export function ProgramTeam() {
  const { orgId = "", programId = "" } = useParams();
  const navigate = useNavigate();
  const { startImpersonation, refresh } = useSession();

  const [program, setProgram] = useState<Program | null>(null);
  const [roles, setRoles] = useState<ProgramRole[] | null>(null);
  const [members, setMembers] = useState<ProgramMember[] | null>(null);
  const [groups, setGroups] = useState<{ platform: string; role: string; count: number }[]>([]);
  const [groupsModel, setGroupsModel] = useState<ProgramGroupsModel | null>(null);
  const [editing, setEditing] = useState<ProgramRole | "new" | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [managingGroups, setManagingGroups] = useState<ProgramMember | null>(null);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<{ id: string; name: string; parent_id: string | null } | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  function toggleNode(key: string) {
    setExpandedGroups((s) => {
      const next = new Set(s);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }
  // People view: "grid" = flat table; "stack" = grouped by group (a person in
  // several groups appears under each — no primary). Mirrors the Programs page.
  const [view, setView] = useState<"grid" | "stack">(
    () => (localStorage.getItem("nexus_people_view") as "grid" | "stack") || "grid",
  );
  function switchView(v: "grid" | "stack") {
    setView(v);
    localStorage.setItem("nexus_people_view", v);
  }

  useEffect(() => {
    listPrograms(orgId).then((ps) => setProgram(ps.find((p) => p.id === programId) ?? null)).catch(() => {});
  }, [orgId, programId]);

  // The program's accessible features gate which areas roles can grant/show.
  const enabledFeatures = program?.features ?? DEFAULT_PROGRAM_FEATURES;

  // Shared Roles & Groups panel adapter — enabled areas + role "Test as".
  const programRg = useMemo(
    () =>
      programRgAdapter(
        orgId,
        programId,
        (Object.keys(enabledFeatures) as (keyof typeof enabledFeatures)[]).filter((k) => enabledFeatures[k] !== false),
        (role: RgRole) => {
          startImpersonation({ roleName: role.name, perms: role.perms, orgId, programId });
          navigate(`/o/${orgId}/p/${programId}`);
        },
      ),
    [orgId, programId, enabledFeatures, startImpersonation, navigate],
  );

  const load = useCallback(() => {
    listProgramRoles(programId).then(setRoles).catch(() => setRoles([]));
    getProgramGroupsModel(programId).then(setGroupsModel).catch(() => setGroupsModel(null));
    // Team core + per-platform-role group counts; group MEMBERS page in lazily
    // (a flat list won't scale to hundreds of learners).
    getProgramTeamSummary(programId)
      .then((s) => {
        setMembers(s.team);
        setGroups(s.groups);
      })
      .catch(() => {
        setMembers([]);
        setGroups([]);
      });
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

  // A person's group chips: their role's name IF that role displays as a group,
  // plus every explicit (placement) group they're in.
  const groupNameById = new Map((groupsModel?.groups ?? []).map((g) => [g.id, g.name]));
  function memberGroupChips(m: ProgramMember): { name: string; kind: "role" | "group" }[] {
    const email = (m.email ?? "").toLowerCase();
    const role = groupsModel?.roles.find((r) => r.id === m.role_id);
    const chips: { name: string; kind: "role" | "group" }[] = [];
    if (role?.display_as_group) chips.push({ name: role.name, kind: "role" });
    for (const id of groupsModel?.placements[email] ?? []) {
      const name = groupNameById.get(id);
      if (name) chips.push({ name, kind: "group" });
    }
    return chips;
  }
  const hasPlacementGroups = (groupsModel?.groups.length ?? 0) > 0;

  async function addGroup(name: string, parentId: string | null) {
    await createGroup(orgId, { program_id: programId, name, parent_group_id: parentId ?? undefined });
    toast.success(`Group "${name}" created`);
    load();
  }
  async function saveGroup(id: string, name: string, parentId: string | null) {
    await updateGroup(id, { name, parent_group_id: parentId });
    toast.success("Group updated");
    load();
  }
  async function removeGroup(id: string, name: string) {
    try {
      await deleteGroup(id);
      toast.success(`Group "${name}" deleted`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete group");
    }
  }

  // One People row, reused by both the flat grid and each stack section.
  function personRow(m: ProgramMember, keyPrefix = "") {
    const isAdmin = m.membership_role === "administrator" || m.membership_role === "owner";
    return (
      <TableRow key={`${keyPrefix}${m.email ?? m.invitation_id ?? m.membership_id ?? ""}`}>
        <TableCell>
          <div className="font-medium text-foreground">{m.display_name ?? "—"}</div>
          <div className="text-xs text-muted-foreground">{m.email}</div>
        </TableCell>
        <TableCell>
          {isAdmin ? (
            <div>
              <Pill tone="accent">Admin</Pill>
              <div className="text-[11px] text-muted-foreground mt-0.5">Program-level access</div>
            </div>
          ) : heldPlatform(m) ? (
            (() => {
              const held = heldPlatform(m)!;
              const label = PLATFORM_LABELS[held.platform] ?? held.platform;
              return (
                <span
                  className="text-sm text-muted-foreground"
                  title={`Assigned inside the ${label} (People & Roles) — managed there, not here.`}
                >
                  {platformRoleLabel(held.role)}
                  <span className="block text-[11px] text-muted-foreground/70">{label} · managed in platform</span>
                </span>
              );
            })()
          ) : (
            <Select value={m.role_id ?? "none"} onValueChange={(v) => assignRole(m, v === "none" ? null : v)}>
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
          {isAdmin ? (
            <span className="text-xs text-muted-foreground">—</span>
          ) : (
            <div className="flex flex-wrap items-center gap-1">
              {memberGroupChips(m).map((c) => (
                <Pill key={`${c.kind}:${c.name}`} tone={c.kind === "role" ? "accent" : "neutral"}>
                  {c.name}
                </Pill>
              ))}
              {hasPlacementGroups ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5"
                  onClick={() => setManagingGroups(m)}
                  title="Edit group placement"
                >
                  <Pencil className="size-3" />
                </Button>
              ) : memberGroupChips(m).length === 0 ? (
                <span className="text-xs text-muted-foreground">—</span>
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
  }

  const peopleTableHead = (
    <TableHeader>
      <TableRow>
        <TableHead>Person</TableHead>
        <TableHead>Role</TableHead>
        <TableHead>Groups</TableHead>
        <TableHead>Status</TableHead>
        <TableHead className="text-right">Actions</TableHead>
      </TableRow>
    </TableHeader>
  );

  // ── Stack view: a collapsed, hierarchical tree, grouped by group ──────────
  // Role-as-groups are flat top-level nodes; real groups form a parent/child
  // forest (groups.parent_id). A person appears under every group they're
  // directly placed in (no primary). Empty subtrees are hidden.
  const team = members ?? [];
  const allGroups = groupsModel?.groups ?? [];
  const childrenByParent = new Map<string | null, typeof allGroups>();
  for (const g of allGroups) {
    const p = g.parent_id ?? null;
    childrenByParent.set(p, [...(childrenByParent.get(p) ?? []), g]);
  }
  const directMembersOf = (gid: string) =>
    team.filter((m) => (groupsModel?.placements[(m.email ?? "").toLowerCase()] ?? []).includes(gid));
  // Unique people in a group's whole subtree (direct + all descendants).
  function subtreeEmails(gid: string): Set<string> {
    const out = new Set<string>();
    for (const m of directMembersOf(gid)) if (m.email) out.add(m.email.toLowerCase());
    for (const child of childrenByParent.get(gid) ?? []) for (const e of subtreeEmails(child.id)) out.add(e);
    return out;
  }
  const roleNodes = (groupsModel?.roles ?? [])
    .filter((r) => r.display_as_group)
    .map((r) => ({ id: r.id, name: r.name, members: team.filter((m) => m.role_id === r.id) }))
    .filter((n) => n.members.length > 0);
  const rootGroups = (childrenByParent.get(null) ?? []).filter((g) => subtreeEmails(g.id).size > 0);
  const ungrouped = team.filter((m) => memberGroupChips(m).length === 0);
  const stackEmpty = roleNodes.length === 0 && rootGroups.length === 0 && ungrouped.length === 0;

  // Recursive render of one real-group node: a collapsed disclosure row that,
  // when expanded, shows its direct members then its child group nodes.
  function renderGroupNode(g: { id: string; name: string }, depth: number): ReactNode {
    const key = `group:${g.id}`;
    const open = expandedGroups.has(key);
    const direct = directMembersOf(g.id);
    const kids = (childrenByParent.get(g.id) ?? []).filter((c) => subtreeEmails(c.id).size > 0);
    const total = subtreeEmails(g.id).size;
    return (
      <div key={key} className="glass-card overflow-hidden" style={{ marginLeft: depth * 16 }}>
        <div className="flex items-center gap-2 px-3 py-2.5">
          <button
            type="button"
            onClick={() => toggleNode(key)}
            className="flex flex-1 items-center gap-2 text-left"
          >
            <ChevronRight className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
            <span className="text-sm font-semibold text-foreground">{g.name}</span>
            <span className="text-xs text-muted-foreground">{total} {total === 1 ? "person" : "people"}</span>
          </button>
          <button
            type="button"
            onClick={() =>
              setEditingGroup({ id: g.id, name: g.name, parent_id: allGroups.find((x) => x.id === g.id)?.parent_id ?? null })
            }
            className="grid size-7 place-items-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"
            title="Edit group"
          >
            <Pencil className="size-3.5" />
          </button>
        </div>
        {open ? (
          <div className="border-t border-border">
            {direct.length ? (
              <Table>
                {peopleTableHead}
                <TableBody>{direct.map((m) => personRow(m, `${key}:`))}</TableBody>
              </Table>
            ) : null}
            {kids.length ? <div className="space-y-2 p-2">{kids.map((c) => renderGroupNode(c, 0))}</div> : null}
            {!direct.length && !kids.length ? (
              <div className="px-4 py-3 text-xs text-muted-foreground">No one placed here yet.</div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

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
        <Plus className="size-3.5" /> Invite member
      </Button>
    </div>
  );

  const peopleContent = (
    <>
      <CollapsibleSection title="Program members" count={members?.length}>
        {!members ? (
          <Spinner />
        ) : members.length === 0 ? (
          <EmptyState>No people in this program yet. Invite a member and give them a role.</EmptyState>
        ) : view === "grid" ? (
          <div className="glass-card overflow-hidden">
            <Table>
              {peopleTableHead}
              <TableBody>{team.map((m) => personRow(m))}</TableBody>
            </Table>
          </div>
        ) : stackEmpty ? (
          <EmptyState>No groups have anyone in them yet. Create a group and place people into it.</EmptyState>
        ) : (
          <div className="space-y-2">
            {/* Role-as-group nodes (flat, collapsible). */}
            {roleNodes.map((n) => {
              const key = `role:${n.id}`;
              const open = expandedGroups.has(key);
              return (
                <div key={key} className="glass-card overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleNode(key)}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
                  >
                    <ChevronRight className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
                    <span className="text-sm font-semibold text-foreground">{n.name}</span>
                    <Pill tone="accent">role</Pill>
                    <span className="text-xs text-muted-foreground">
                      {n.members.length} {n.members.length === 1 ? "person" : "people"}
                    </span>
                  </button>
                  {open ? (
                    <div className="border-t border-border">
                      <Table>
                        {peopleTableHead}
                        <TableBody>{n.members.map((m) => personRow(m, `${key}:`))}</TableBody>
                      </Table>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {/* Real group forest (hierarchical, collapsible). */}
            {rootGroups.map((g) => renderGroupNode(g, 0))}
            {/* Anyone in no group at all. */}
            {ungrouped.length ? (
              (() => {
                const key = "none";
                const open = expandedGroups.has(key);
                return (
                  <div className="glass-card overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleNode(key)}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
                    >
                      <ChevronRight className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
                      <span className="text-sm font-semibold text-muted-foreground">No group</span>
                      <span className="text-xs text-muted-foreground">
                        {ungrouped.length} {ungrouped.length === 1 ? "person" : "people"}
                      </span>
                    </button>
                    {open ? (
                      <div className="border-t border-border">
                        <Table>
                          {peopleTableHead}
                          <TableBody>{ungrouped.map((m) => personRow(m, "none:"))}</TableBody>
                        </Table>
                      </div>
                    ) : null}
                  </div>
                );
              })()
            ) : null}
          </div>
        )}
      </CollapsibleSection>

      {groups.length > 0 ? (
        <CollapsibleSection title="Platform members" count={groups.length}>
          <div className="space-y-2">
            {groups.map((g) => (
              <PlatformGroup
                key={`${g.platform}:${g.role}`}
                programId={programId}
                group={g}
                onTestAs={(email) => {
                  void devLoginAs(email, { id: orgId }).then(() => refresh()).then(() => navigate("/", { replace: true }));
                }}
                onRemoved={load}
              />
            ))}
          </div>
        </CollapsibleSection>
      ) : null}
    </>
  );

  return (
    <>
      <PeoplePage
        subtitle="Invite people, place them in groups, and test exactly what each role sees."
        actions={peopleActions}
        people={peopleContent}
        rolesGroups={<RolesAndGroups adapter={programRg} />}
      />

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
        placementGroups={groupsModel?.groups ?? []}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={load}
      />

      <NewGroupDialog
        open={newGroupOpen}
        onOpenChange={setNewGroupOpen}
        allGroups={groupsModel?.groups ?? []}
        onCreate={addGroup}
      />

      {editingGroup ? (
        <EditGroupDialog
          group={editingGroup}
          allGroups={groupsModel?.groups ?? []}
          onClose={() => setEditingGroup(null)}
          onSave={async (name, parentId) => {
            await saveGroup(editingGroup.id, name, parentId);
            setEditingGroup(null);
          }}
          onDelete={async () => {
            await removeGroup(editingGroup.id, editingGroup.name);
            setEditingGroup(null);
          }}
        />
      ) : null}

      {managingGroups ? (
        <ManageGroupsDialog
          programId={programId}
          member={managingGroups}
          allGroups={groupsModel?.groups ?? []}
          current={groupsModel?.placements[(managingGroups.email ?? "").toLowerCase()] ?? []}
          onClose={() => setManagingGroups(null)}
          onSaved={() => {
            setManagingGroups(null);
            load();
          }}
        />
      ) : null}
    </>
  );
}

function GroupParentSelect({
  value,
  options,
  onChange,
}: {
  value: string | null;
  options: { id: string; name: string }[];
  onChange: (v: string | null) => void;
}) {
  return (
    <Select value={value ?? "none"} onValueChange={(v) => onChange(v === "none" ? null : v)}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No parent (top level)</SelectItem>
        {options.map((g) => (
          <SelectItem key={g.id} value={g.id}>
            {g.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function NewGroupDialog({
  open,
  onOpenChange,
  allGroups,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  allGroups: { id: string; name: string }[];
  onCreate: (name: string, parentId: string | null) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setName("");
    setParentId(null);
  }

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onCreate(name.trim(), parentId);
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create group");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New group</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="group-name">Group name</Label>
            <Input
              id="group-name"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !busy && name.trim() && submit()}
              placeholder="e.g. Bridge Squad"
            />
            <p className="text-xs text-muted-foreground">
              Groups place people organizationally — separate from roles, which grant access.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Parent group</Label>
            <GroupParentSelect value={parentId} options={allGroups} onChange={setParentId} />
            <p className="text-xs text-muted-foreground">
              Nest this group under another to build a hierarchy (e.g. "Littles" under "Bridge Squad").
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !name.trim()}>{busy ? "Creating…" : "Create group"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditGroupDialog({
  group,
  allGroups,
  onClose,
  onSave,
  onDelete,
}: {
  group: { id: string; name: string; parent_id: string | null };
  allGroups: { id: string; name: string; parent_id: string | null }[];
  onClose: () => void;
  onSave: (name: string, parentId: string | null) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [name, setName] = useState(group.name);
  const [parentId, setParentId] = useState<string | null>(group.parent_id);
  const [busy, setBusy] = useState(false);

  // A group can't be its own parent, nor be parented under one of its own
  // descendants (that would make a cycle).
  const descendants = (() => {
    const kids = new Map<string | null, string[]>();
    for (const g of allGroups) kids.set(g.parent_id ?? null, [...(kids.get(g.parent_id ?? null) ?? []), g.id]);
    const out = new Set<string>();
    const walk = (id: string) => (kids.get(id) ?? []).forEach((c) => { out.add(c); walk(c); });
    walk(group.id);
    return out;
  })();
  const parentOptions = allGroups.filter((g) => g.id !== group.id && !descendants.has(g.id));

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onSave(name.trim(), parentId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save group");
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit group</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-group-name">Group name</Label>
            <Input id="edit-group-name" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Parent group</Label>
            <GroupParentSelect value={parentId} options={parentOptions} onChange={setParentId} />
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          <ConfirmButton
            title={`Delete the "${group.name}" group?`}
            description="People keep their membership; any subgroups move up to this group's parent."
            actionLabel="Delete group"
            onConfirm={onDelete}
            buttonTitle="Delete group"
          >
            <span className="inline-flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
              <Trash2 className="size-3.5" /> Delete
            </span>
          </ConfirmButton>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={busy || !name.trim()}>{busy ? "Saving…" : "Save"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManageGroupsDialog({
  programId,
  member,
  allGroups,
  current,
  onClose,
  onSaved,
}: {
  programId: string;
  member: ProgramMember;
  allGroups: { id: string; name: string }[];
  current: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(current));
  const [busy, setBusy] = useState(false);

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function save() {
    if (!member.email) return;
    setBusy(true);
    try {
      await setProgramMemberGroups(programId, member.email, [...selected]);
      toast.success("Groups updated");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update groups");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Groups · {member.display_name ?? member.email}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Place this person into any of the program's groups. Roles that display as their own
            group are handled by the role itself.
          </p>
          {allGroups.length === 0 ? (
            <EmptyState>No groups yet. Create groups under Participants &amp; Groups.</EmptyState>
          ) : (
            allGroups.map((g) => (
              <label
                key={g.id}
                className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 cursor-pointer hover:bg-accent/40"
              >
                <Switch checked={selected.has(g.id)} onCheckedChange={() => toggle(g.id)} />
                <span className="text-sm">{g.name}</span>
              </label>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save groups"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InviteMemberDialog({
  programId,
  roles,
  placementGroups,
  open,
  onOpenChange,
  onInvited,
}: {
  programId: string;
  roles: ProgramRole[];
  placementGroups: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onInvited: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState<string>("none");
  const [groupIds, setGroupIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MemberEnrollResult | null>(null);

  function reset() {
    setName("");
    setEmail("");
    setRoleId("none");
    setGroupIds(new Set());
    setResult(null);
  }

  async function submit() {
    if (!email.trim()) return;
    setBusy(true);
    try {
      const res = await inviteProgramMember(programId, {
        email: email.trim(),
        display_name: name.trim() || undefined,
        role_id: roleId === "none" ? undefined : roleId,
        group_ids: groupIds.size ? [...groupIds] : undefined,
      });
      setResult(res);
      onInvited();
      toast.success(`${res.email} is now an active member.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add member");
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
          <DialogTitle>Add member</DialogTitle>
        </DialogHeader>
        {result ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{result.email}</span> is now an active member of
              this program{result.created ? " and a new account was created for them" : ""}.
            </p>
            {result.created && result.temp_password ? (
              <div className="space-y-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2">
                <p className="text-xs text-muted-foreground">Temporary password — share it so they can sign in:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate text-xs font-mono">{result.temp_password}</code>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(result.temp_password ?? "");
                      toast.success("Copied");
                    }}
                    className="grid size-7 place-items-center rounded-md hover:bg-accent"
                    title="Copy password"
                  >
                    <Copy className="size-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                They already had an account — they can sign in with their existing password.
              </p>
            )}
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
            {placementGroups.length ? (
              <div className="space-y-1.5">
                <Label>Groups</Label>
                <p className="text-xs text-muted-foreground -mt-1">Which group(s) this person belongs to.</p>
                <div className="flex flex-wrap gap-1.5">
                  {placementGroups.map((g) => {
                    const on = groupIds.has(g.id);
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() =>
                          setGroupIds((s) => {
                            const next = new Set(s);
                            next.has(g.id) ? next.delete(g.id) : next.add(g.id);
                            return next;
                          })
                        }
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          on
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {g.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        )}
        <DialogFooter>
          {result ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={busy || !email.trim()}>
                {busy ? "Adding…" : "Add member"}
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
  const [displayAsGroup, setDisplayAsGroup] = useState(role?.display_as_group ?? false);
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
      if (role) await updateProgramRole(role.id, { name: name.trim(), perms: cleanPerms, display_as_group: displayAsGroup });
      else await createProgramRole(programId, { name: name.trim(), perms: cleanPerms, display_as_group: displayAsGroup });
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
          <div className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5">
            <Switch id="role-as-group" checked={displayAsGroup} onCheckedChange={setDisplayAsGroup} />
            <div className="flex-1">
              <Label htmlFor="role-as-group" className="cursor-pointer">Display role as its own group</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                On — holders of this role also form a group by that name. Off — the role stays
                permissions-only and people are placed into groups you choose.
              </p>
            </div>
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


/**
 * One collapsible platform-role group (e.g. "Bridge Platform · Learner (128)"):
 * collapsed by default, pages members from the server 25 at a time.
 */
function PlatformGroup({
  programId,
  group,
  onTestAs,
  onRemoved,
}: {
  programId: string;
  group: { platform: string; role: string; count: number };
  onTestAs: (email: string) => void;
  onRemoved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<PlatformGroupMember[]>([]);
  const [loading, setLoading] = useState(false);
  const PAGE = 25;

  async function loadMore() {
    setLoading(true);
    try {
      const page = await listProgramPlatformGroup(programId, group.platform, group.role, rows.length, PAGE);
      setRows((cur) => [...cur, ...page]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load members");
    } finally {
      setLoading(false);
    }
  }

  async function removeRow(m: PlatformGroupMember) {
    try {
      if (m.membership_id) await removeMember(m.membership_id);
      else if (m.invitation_id) await revokeInvitation(m.invitation_id);
      setRows((cur) => cur.filter((r) => r.email !== m.email));
      toast.success(`${m.display_name ?? m.email} removed`);
      onRemoved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    }
  }

  const platformLabel = PLATFORM_LABELS[group.platform] ?? group.platform;

  return (
    <div className="glass-card overflow-hidden">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open && rows.length === 0) void loadMore();
        }}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-accent/40 transition-colors"
      >
        <span className="text-sm font-medium text-foreground">
          {platformLabel} · {platformRoleLabel(group.role)}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {group.count} {group.count === 1 ? "person" : "people"}
          </span>
        </span>
        <ChevronRight className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open ? (
        <div className="divide-y divide-border border-t border-border">
          {rows.map((m) => (
            <div key={m.email ?? m.invitation_id} className="flex items-center justify-between gap-2 px-4 py-2.5">
              <div className="min-w-0">
                <div className="text-sm text-foreground truncate">{m.display_name ?? m.email}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {m.email}
                  {m.status === "invited" ? " · invited" : ""}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {DEV_ENABLED && m.email ? (
                  <Button size="sm" variant="ghost" onClick={() => onTestAs(m.email!)} title="Sign in as this person (dev)">
                    <Eye className="size-3.5" /> Test as
                  </Button>
                ) : null}
                {m.membership_id || m.invitation_id ? (
                  <ConfirmButton
                    title={`Remove ${m.display_name ?? m.email} from this program?`}
                    description="They lose access immediately."
                    actionLabel="Remove"
                    onConfirm={() => removeRow(m)}
                    buttonTitle="Remove"
                  >
                    <Trash2 className="size-3.5 text-red-600 dark:text-red-400" />
                  </ConfirmButton>
                ) : null}
              </div>
            </div>
          ))}
          {rows.length < group.count ? (
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loading}
              className="w-full px-4 py-2.5 text-center text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              {loading ? "Loading…" : `Show more (${rows.length} of ${group.count})`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

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

import { CredentialsButton } from "@/nexus/people/CredentialsButton";

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
  inviteProgramLink,
  inviteProgramMember,
  getProgramGroupsModel,
  getOrgCapabilities,
  updateGroup,
  getProgramTeamSummary,
  listProgramPlatformGroup,
  listProgramRoles,
  listPrograms,
  removeMember,
  revokeInvitation,
  setProgramMemberGroups,
  setProgramMemberName,
  setProgramMemberRole,
  updateProgramRole,
  type AccessLevel,
  type OrgCapabilities,
  type PlatformGroupMember,
  type ProgramGroupsModel,
  type MemberEnrollResult,
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
import { ProgramAccessCatalogue } from "@/nexus/access/InstanceAccessCatalogue";
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
  const { startImpersonation, refresh, user } = useSession();
  // Super Admin = the org owner. Only they may add or remove administrators, so
  // the controls that would 403 are hidden rather than shown and then refused.
  const isOwner = (user?.memberships ?? []).some(
    (m) => m.org_id === orgId && m.role === "owner" && !m.program_id,
  );

  const [program, setProgram] = useState<Program | null>(null);
  const [roles, setRoles] = useState<ProgramRole[] | null>(null);
  const [members, setMembers] = useState<ProgramMember[] | null>(null);
  const [platformMembers, setPlatformMembers] = useState<ProgramMember[]>([]);
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

  // Org entitlements (the Nexus capability envelope) — a platform area must not
  // appear in the role builder if the ORG isn't entitled to that platform, even
  // when the program's feature flag is on. Mirrors the program overview's gate.
  const [orgCaps, setOrgCaps] = useState<OrgCapabilities | null>(null);
  useEffect(() => {
    if (orgId) getOrgCapabilities(orgId).then(setOrgCaps).catch(() => setOrgCaps(null));
  }, [orgId]);

  // The program's accessible features gate which areas roles can grant/show.
  const enabledFeatures = program?.features ?? DEFAULT_PROGRAM_FEATURES;
  const orgAllows = (cap: string) => (orgCaps ? orgCaps.features[cap] !== false : true);

  // Shared Roles & Groups panel adapter — enabled areas + role "Test as". An
  // area shows only if the program's feature is on AND (for platform areas) the
  // org is entitled to that platform.
  // Effective Partial provisioning = the program's subset intersected with the
  // org envelope's — clamps the role builder's platform capability picker.
  const effectiveFeatureAccess = useMemo(() => {
    const prog = (program?.feature_access as Record<string, { capabilities: string[] }> | null) ?? {};
    const org = orgCaps?.featureAccess ?? {};
    const out: Record<string, { capabilities: string[] }> = {};
    for (const key of ["learning", "bridge"]) {
      const p = prog[key]?.capabilities, o = org[key]?.capabilities;
      if (p && o) out[key] = { capabilities: p.filter((c) => o.includes(c)) };
      else if (p) out[key] = { capabilities: p };
      else if (o) out[key] = { capabilities: o };
    }
    return Object.keys(out).length ? out : null;
  }, [program, orgCaps]);

  const programRg = useMemo(
    () =>
      programRgAdapter(
        orgId,
        programId,
        (Object.keys(enabledFeatures) as (keyof typeof enabledFeatures)[]).filter(
          (k) => enabledFeatures[k] !== false && orgAllows(k as string),
        ),
        (role: RgRole) => {
          startImpersonation({ roleName: role.name, perms: role.perms, orgId, programId });
          navigate(`/o/${orgId}/p/${programId}`);
        },
        effectiveFeatureAccess,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orgId, programId, enabledFeatures, orgCaps, effectiveFeatureAccess, startImpersonation, navigate],
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
        setPlatformMembers(s.platformMembers ?? []);
      })
      .catch(() => {
        setMembers([]);
        setGroups([]);
        setPlatformMembers([]);
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

  // A role shown as its own group and NESTED under a real group implies
  // membership in that parent group chain — the mandatory groups it lives under.
  function roleGroupChain(roleId: string): string[] {
    const role = groupsModel?.roles.find((r) => r.id === roleId);
    if (!role?.display_as_group || !role.parent_group_id) return [];
    const byId = new Map((groupsModel?.groups ?? []).map((g) => [g.id, g]));
    const chain: string[] = [];
    let cur: string | null = role.parent_group_id;
    while (cur && byId.has(cur)) { chain.push(cur); cur = byId.get(cur)?.parent_id ?? null; }
    return chain;
  }

  /**
   * Rename a person from here.
   *
   * Addressed by email, like assignRole, so it also works for someone still INVITED —
   * they hold a profile (that is how their credentials get set) but no membership id.
   *
   * The server writes the name across every profile they hold, so this is what the
   * phone shows: the app labels its roster, leaderboard and chat from the session
   * user's display name.
   */
  async function renameMember(m: ProgramMember) {
    if (!m.email) return;
    const next = window.prompt(`Name for ${m.email}`, m.display_name ?? "");
    // Cancel returns null; an empty string would be a deletion, which this is not.
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === (m.display_name ?? "").trim()) return;
    try {
      await setProgramMemberName(programId, m.email, trimmed);
      toast.success("Name updated — it will show in the app too");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to rename");
    }
  }

  async function assignRole(m: ProgramMember, roleId: string | null) {
    if (!m.email) return;
    try {
      await setProgramMemberRole(programId, m.email, roleId);
      // Auto-place into the role's mandatory parent group chain (if nested).
      if (roleId) {
        const chain = roleGroupChain(roleId);
        if (chain.length) {
          const existing = groupsModel?.placements[m.email.toLowerCase()] ?? [];
          const next = [...new Set([...existing, ...chain])];
          if (next.length !== existing.length) await setProgramMemberGroups(programId, m.email, next).catch(() => {});
        }
      }
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
          <div className="flex items-center gap-1">
            <span className="font-medium text-foreground">{m.display_name ?? "—"}</span>
            {/* Only where there is an email to address the rename by. Same pencil the
                group-placement control uses, so an editable field looks editable in
                the one way this table already establishes. */}
            {m.email ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-1.5"
                onClick={() => void renameMember(m)}
                title="Edit this person's name"
              >
                <Pencil className="size-3" />
              </Button>
            ) : null}
          </div>
          <div className="text-xs text-muted-foreground">{m.email}</div>
        </TableCell>
        <TableCell>
          {isAdmin ? (
            <div>
              {/* An administrator is NOT the Super Admin: same static pill, but
                  its own badge and its own limit. Only the owner (Super Admin)
                  may add or remove administrators — enforced server-side in
                  POST/DELETE, mirrored in the controls below. */}
              <Pill tone="accent">{m.membership_role === "owner" ? "Super Admin" : "Admin"}</Pill>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {m.membership_role === "owner"
                  ? "Full access · only they can add or remove admins"
                  : "Manages this program · cannot add or remove admins"}
              </div>
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
            {m.membership_id && m.email ? (
              <CredentialsButton
                membershipId={m.membership_id}
                personLabel={m.display_name ?? m.email}
                currentUsername={m.username ?? null}
                onSaved={load}
              />
            ) : null}
            {DEV_ENABLED && m.email ? (
              <Button size="sm" variant="ghost" onClick={() => testAsPerson(m)} title="Sign in as this person (dev)">
                <Eye className="size-3.5" /> Test as
              </Button>
            ) : null}
            {(m.membership_id || m.invitation_id) &&
            m.membership_role !== "owner" &&
            (!isAdmin || isOwner) ? (
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
  // Group placement is email-keyed, so a placed platform-only member should
  // surface under their group(s) even though they aren't a "core" member.
  // groupPool = core members + platform-only members (disjoint by email).
  const groupPool = [...team, ...platformMembers];
  const allGroups = groupsModel?.groups ?? [];
  const childrenByParent = new Map<string | null, typeof allGroups>();
  for (const g of allGroups) {
    const p = g.parent_id ?? null;
    childrenByParent.set(p, [...(childrenByParent.get(p) ?? []), g]);
  }
  // A role shown as its own group can be NESTED under a real group. Its holders
  // then live under that group in the hierarchy (e.g. "Night Class Teachers"
  // under "Night Class") — no manual placement needed.
  const roleParentOf = new Map(
    (groupsModel?.roles ?? [])
      .filter((r) => r.display_as_group && r.parent_group_id)
      .map((r) => [r.id, r.parent_group_id as string]),
  );
  const directMembersOf = (gid: string) =>
    groupPool.filter((m) => {
      const email = (m.email ?? "").toLowerCase();
      // Someone here only via a role-group nested under this group renders under
      // that role node, not as a bare direct member (no double-listing).
      if (m.role_id && roleParentOf.get(m.role_id) === gid) return false;
      return (groupsModel?.placements[email] ?? []).includes(gid);
    });
  // Role-as-group nodes, indexed by their parent group (null = top level).
  const roleNodes = (groupsModel?.roles ?? [])
    .filter((r) => r.display_as_group)
    .map((r) => ({ id: r.id, name: r.name, parent: (r.parent_group_id as string | null | undefined) ?? null, members: team.filter((m) => m.role_id === r.id) }))
    .filter((n) => n.members.length > 0);
  const roleNodesByParent = new Map<string | null, typeof roleNodes>();
  for (const n of roleNodes) roleNodesByParent.set(n.parent, [...(roleNodesByParent.get(n.parent) ?? []), n]);
  // Unique people in a group's whole subtree: direct + nested role-groups + child groups.
  function subtreeEmails(gid: string): Set<string> {
    const out = new Set<string>();
    for (const m of directMembersOf(gid)) if (m.email) out.add(m.email.toLowerCase());
    for (const rn of roleNodesByParent.get(gid) ?? []) for (const m of rn.members) if (m.email) out.add(m.email.toLowerCase());
    for (const child of childrenByParent.get(gid) ?? []) for (const e of subtreeEmails(child.id)) out.add(e);
    return out;
  }
  const rootGroups = (childrenByParent.get(null) ?? []).filter((g) => subtreeEmails(g.id).size > 0);
  const rootRoleNodes = roleNodesByParent.get(null) ?? [];
  const ungrouped = team.filter((m) => memberGroupChips(m).length === 0);
  const stackEmpty = rootRoleNodes.length === 0 && rootGroups.length === 0 && ungrouped.length === 0;

  // One role-as-group node: a collapsible showing its holders. Reused at the top
  // level and nested inside its parent group.
  function renderRoleNode(n: { id: string; name: string; members: ProgramMember[] }, depth: number): ReactNode {
    const key = `role:${n.id}`;
    const open = expandedGroups.has(key);
    return (
      <div key={key} className="glass-card overflow-hidden" style={{ marginLeft: depth * 16 }}>
        <button type="button" onClick={() => toggleNode(key)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
          <ChevronRight className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
          <span className="text-sm font-semibold text-foreground">{n.name}</span>
          <Pill tone="accent">role</Pill>
          <span className="text-xs text-muted-foreground">{n.members.length} {n.members.length === 1 ? "person" : "people"}</span>
        </button>
        {open ? (
          <div className="border-t border-border">
            <Table>{peopleTableHead}<TableBody>{n.members.map((m) => personRow(m, `${key}:`))}</TableBody></Table>
          </div>
        ) : null}
      </div>
    );
  }

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
            {/* Role-as-group nodes nested under this group (e.g. Night Class Teachers under Night Class). */}
            {(roleNodesByParent.get(g.id) ?? []).length || kids.length ? (
              <div className="space-y-2 p-2">
                {(roleNodesByParent.get(g.id) ?? []).map((rn) => renderRoleNode(rn, 0))}
                {kids.map((c) => renderGroupNode(c, 0))}
              </div>
            ) : null}
            {!direct.length && !kids.length && !(roleNodesByParent.get(g.id) ?? []).length ? (
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
            {/* Role-as-group nodes NOT nested under a group (top level). */}
            {rootRoleNodes.map((n) => renderRoleNode(n, 0))}
            {/* Real group forest (hierarchical) — nested role-groups render inside. */}
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
                canManageGroups={hasPlacementGroups}
                onManageGroups={(pm) =>
                  setManagingGroups({
                    membership_id: pm.membership_id,
                    invitation_id: pm.invitation_id,
                    email: pm.email,
                    display_name: pm.display_name,
                    membership_role: "member",
                    status: pm.status,
                    role_id: null,
                    role_name: null,
                  })
                }
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
        actions={peopleActions}
        people={peopleContent}
        rolesGroups={<RolesAndGroups adapter={programRg} />}
        accessCatalog={<ProgramAccessCatalogue embedded />}
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
  const [result, setResult] = useState<{ redeem_url: string } | null>(null);
  /** The outcome of adding someone directly: existed already, or newly created. */
  const [added, setAdded] = useState<MemberEnrollResult | null>(null);

  function reset() {
    setName("");
    setEmail("");
    setRoleId("none");
    setGroupIds(new Set());
    setResult(null);
    setAdded(null);
  }

  const payload = () => ({
    email: email.trim(),
    display_name: name.trim() || undefined,
    role_id: roleId === "none" ? undefined : roleId,
    group_ids: groupIds.size ? [...groupIds] : undefined,
  });

  /**
   * The default: add them, active immediately.
   *
   * Someone already in the system keeps the password they have — this club is
   * simply added to their account, and there is nothing for them to do. Someone
   * new gets a starting password to pass on, which the app makes them replace at
   * first sign-in. Either way there is no "invited" limbo to chase.
   */
  async function addDirectly() {
    if (!email.trim()) return;
    setBusy(true);
    try {
      const res = await inviteProgramMember(programId, payload());
      setAdded(res);
      onInvited();
      toast.success(
        res.created ? `${res.email} added.` : `${res.email} already had an account — added here.`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add the member");
    } finally {
      setBusy(false);
    }
  }

  /** The alternative: a link they redeem, setting a password you never see. */
  async function sendLink() {
    if (!email.trim()) return;
    setBusy(true);
    try {
      const res = await inviteProgramLink(programId, payload());
      setResult(res);
      onInvited();
      toast.success(`Invitation link created for ${email.trim()}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create invitation");
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
        {added ? (
          <div className="space-y-3">
            {added.created ? (
              <>
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{added.email}</span> is added and
                  active. Give them this starting password — the app asks them to choose their own the
                  first time they sign in, and after that only they can change it.
                </p>
                {added.temp_password ? (
                  <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <code className="flex-1 select-all text-sm font-mono tracking-wide">
                        {added.temp_password}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard?.writeText(added.temp_password ?? "");
                          toast.success("Copied");
                        }}
                        className="grid size-7 place-items-center rounded-md hover:bg-accent"
                        title="Copy starting password"
                      >
                        <Copy className="size-3.5" />
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Shown once — it is not stored anywhere you can read it back.
                    </p>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{added.email}</span> already had an
                account, so this club was added to it. They keep the password they have — there is
                nothing for them to do, and nothing to send.
              </p>
            )}
          </div>
        ) : result ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Invitation created. Share this activation link — they open it, set their own password at the org
              portal, and accept. Their role and groups apply on acceptance.
            </p>
            <div className="space-y-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2">
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate text-xs font-mono">{result.redeem_url}</code>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(result.redeem_url);
                    toast.success("Copied");
                  }}
                  className="grid size-7 place-items-center rounded-md hover:bg-accent"
                  title="Copy activation link"
                >
                  <Copy className="size-3.5" />
                </button>
              </div>
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
              <Select
                value={roleId}
                onValueChange={(v) => {
                  setRoleId(v);
                  // A role shown as a group and nested under a real group implies
                  // membership in that parent — auto-select it (mandatory).
                  const r = roles.find((x) => x.id === v);
                  if (r?.display_as_group && r.parent_group_id) {
                    const pid = r.parent_group_id;
                    setGroupIds((s) => (s.has(pid) ? s : new Set(s).add(pid)));
                  }
                }}
              >
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
                  {(() => {
                    const selRole = roles.find((x) => x.id === roleId);
                    const mandatory = selRole?.display_as_group ? selRole.parent_group_id ?? null : null;
                    return placementGroups.map((g) => {
                      const on = groupIds.has(g.id);
                      const locked = g.id === mandatory;
                      return (
                        <button
                          key={g.id}
                          type="button"
                          disabled={locked}
                          title={locked ? "Required by the selected role" : undefined}
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
                          } ${locked ? "cursor-not-allowed opacity-90" : ""}`}
                        >
                          {g.name}{locked ? " ✓" : ""}
                        </button>
                      );
                    });
                  })()}
                </div>
              </div>
            ) : null}
          </div>
        )}
        <DialogFooter>
          {result || added ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              {/* Secondary: they set a password you never see. Useful for a
                  stranger; unnecessary for someone already in the system. */}
              <Button variant="outline" onClick={sendLink} disabled={busy || !email.trim()}>
                {busy ? "Working…" : "Send a link instead"}
              </Button>
              <Button onClick={addDirectly} disabled={busy || !email.trim()}>
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
  onManageGroups,
  canManageGroups,
}: {
  programId: string;
  group: { platform: string; role: string; count: number };
  onTestAs: (email: string) => void;
  onRemoved: () => void;
  onManageGroups: (m: PlatformGroupMember) => void;
  canManageGroups: boolean;
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
                {canManageGroups && m.email ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-1.5"
                    onClick={() => onManageGroups(m)}
                    title="Add to groups"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                ) : null}
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

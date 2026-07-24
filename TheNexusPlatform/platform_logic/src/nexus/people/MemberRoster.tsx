/**
 * Shared member roster used by the Org and Nexus People tabs — the same
 * grid/stack + group-placement experience the program level has. Grid = a flat
 * table; stack = grouped by group (role-as-group nodes + the real group forest +
 * "no group"), collapsible. Each non-privileged person gets a role select, group
 * chips, and a "manage groups" control that places them into this altitude's
 * groups. Group *structure* is edited in the Roles & Groups tab; here you only
 * place people.
 */
import { useState, type ReactNode } from "react";
import { ChevronRight, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { Switch } from "@/app/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { EmptyState, Pill, Spinner } from "@/nexus/ui/kit";
import type { GroupsModel } from "@/services/api";

export interface RosterMember {
  key: string;
  email: string | null;
  name: string | null;
  status: string;
  roleId: string | null;
  /** Admin/owner (full access) — shown as a static pill, no group placement. */
  privileged: boolean;
  privilegedLabel: string;
}

export function MemberRoster({
  members,
  roles,
  groupsModel,
  view,
  privilegedNote,
  onAssignRole,
  onSetGroups,
  renderActions,
}: {
  members: RosterMember[] | null;
  roles: { id: string; name: string }[];
  groupsModel: GroupsModel | null;
  view: "grid" | "stack";
  privilegedNote: string;
  onAssignRole: (email: string, roleId: string | null) => void;
  onSetGroups: (email: string, groupIds: string[]) => Promise<void>;
  renderActions: (m: RosterMember) => ReactNode;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [managing, setManaging] = useState<RosterMember | null>(null);
  const toggleNode = (k: string) =>
    setExpanded((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const groupNameById = new Map((groupsModel?.groups ?? []).map((g) => [g.id, g.name]));
  const hasGroups = (groupsModel?.groups.length ?? 0) > 0;
  function chips(m: RosterMember): { name: string; kind: "role" | "group" }[] {
    const email = (m.email ?? "").toLowerCase();
    const role = groupsModel?.roles.find((r) => r.id === m.roleId);
    const out: { name: string; kind: "role" | "group" }[] = [];
    if (role?.display_as_group) out.push({ name: role.name, kind: "role" });
    for (const id of groupsModel?.placements[email] ?? []) {
      const name = groupNameById.get(id);
      if (name) out.push({ name, kind: "group" });
    }
    return out;
  }

  const head = (
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

  function row(m: RosterMember, keyPrefix = "") {
    return (
      <TableRow key={`${keyPrefix}${m.key}`}>
        <TableCell>
          <div className="font-medium text-foreground">{m.name ?? "—"}</div>
          <div className="text-xs text-muted-foreground">{m.email}</div>
        </TableCell>
        <TableCell>
          {m.privileged ? (
            <div>
              <Pill tone="accent">{m.privilegedLabel}</Pill>
              <div className="text-[11px] text-muted-foreground mt-0.5">{privilegedNote}</div>
            </div>
          ) : (
            <Select value={m.roleId ?? "none"} onValueChange={(v) => m.email && onAssignRole(m.email, v === "none" ? null : v)}>
              <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No role</SelectItem>
                {roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </TableCell>
        <TableCell>
          {m.privileged ? (
            <span className="text-xs text-muted-foreground">—</span>
          ) : (
            <div className="flex flex-wrap items-center gap-1">
              {chips(m).map((c) => (
                <Pill key={`${c.kind}:${c.name}`} tone={c.kind === "role" ? "accent" : "neutral"}>{c.name}</Pill>
              ))}
              {hasGroups ? (
                <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={() => setManaging(m)} title="Edit group placement">
                  <Pencil className="size-3" />
                </Button>
              ) : chips(m).length === 0 ? (
                <span className="text-xs text-muted-foreground">—</span>
              ) : null}
            </div>
          )}
        </TableCell>
        <TableCell><Pill tone={m.status === "active" ? "positive" : "warn"}>{m.status}</Pill></TableCell>
        <TableCell className="text-right"><div className="inline-flex items-center gap-1">{renderActions(m)}</div></TableCell>
      </TableRow>
    );
  }

  // ── Stack model ───────────────────────────────────────────────────────────
  const team = members ?? [];
  const allGroups = groupsModel?.groups ?? [];
  const childrenByParent = new Map<string | null, typeof allGroups>();
  for (const g of allGroups) {
    const p = g.parent_id ?? null;
    childrenByParent.set(p, [...(childrenByParent.get(p) ?? []), g]);
  }
  const directMembersOf = (gid: string) =>
    team.filter((m) => (groupsModel?.placements[(m.email ?? "").toLowerCase()] ?? []).includes(gid));
  function subtreeEmails(gid: string): Set<string> {
    const out = new Set<string>();
    for (const m of directMembersOf(gid)) if (m.email) out.add(m.email.toLowerCase());
    for (const child of childrenByParent.get(gid) ?? []) for (const e of subtreeEmails(child.id)) out.add(e);
    return out;
  }
  const roleNodes = (groupsModel?.roles ?? [])
    .filter((r) => r.display_as_group)
    .map((r) => ({ id: r.id, name: r.name, members: team.filter((m) => m.roleId === r.id) }))
    .filter((n) => n.members.length > 0);
  const rootGroups = (childrenByParent.get(null) ?? []).filter((g) => subtreeEmails(g.id).size > 0);
  const ungrouped = team.filter((m) => chips(m).length === 0);
  const stackEmpty = roleNodes.length === 0 && rootGroups.length === 0 && ungrouped.length === 0;

  function renderGroupNode(g: { id: string; name: string }, depth: number): ReactNode {
    const key = `group:${g.id}`;
    const open = expanded.has(key);
    const direct = directMembersOf(g.id);
    const kids = (childrenByParent.get(g.id) ?? []).filter((c) => subtreeEmails(c.id).size > 0);
    const total = subtreeEmails(g.id).size;
    return (
      <div key={key} className="glass-card overflow-hidden" style={{ marginLeft: depth * 16 }}>
        <button type="button" onClick={() => toggleNode(key)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
          <ChevronRight className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
          <span className="text-sm font-semibold text-foreground">{g.name}</span>
          <span className="text-xs text-muted-foreground">{total} {total === 1 ? "person" : "people"}</span>
        </button>
        {open ? (
          <div className="border-t border-border">
            {direct.length ? <Table>{head}<TableBody>{direct.map((m) => row(m, `${key}:`))}</TableBody></Table> : null}
            {kids.length ? <div className="space-y-2 p-2">{kids.map((c) => renderGroupNode(c, 0))}</div> : null}
            {!direct.length && !kids.length ? <div className="px-4 py-3 text-xs text-muted-foreground">No one placed here yet.</div> : null}
          </div>
        ) : null}
      </div>
    );
  }

  const flatNode = (id: string, name: string, list: RosterMember[], tone: "role" | "muted") => {
    const key = `${tone === "role" ? "role" : "none"}:${id}`;
    const open = expanded.has(key);
    return (
      <div key={key} className="glass-card overflow-hidden">
        <button type="button" onClick={() => toggleNode(key)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
          <ChevronRight className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
          <span className={`text-sm font-semibold ${tone === "role" ? "text-foreground" : "text-muted-foreground"}`}>{name}</span>
          {tone === "role" ? <Pill tone="accent">role</Pill> : null}
          <span className="text-xs text-muted-foreground">{list.length} {list.length === 1 ? "person" : "people"}</span>
        </button>
        {open ? <div className="border-t border-border"><Table>{head}<TableBody>{list.map((m) => row(m, `${key}:`))}</TableBody></Table></div> : null}
      </div>
    );
  };

  return (
    <>
      {!members ? (
        <Spinner />
      ) : members.length === 0 ? (
        <EmptyState>No people here yet.</EmptyState>
      ) : view === "grid" ? (
        <div className="glass-card overflow-hidden">
          <Table>{head}<TableBody>{team.map((m) => row(m))}</TableBody></Table>
        </div>
      ) : stackEmpty ? (
        <EmptyState>No groups have anyone in them yet. Create a group in Roles &amp; Groups and place people into it.</EmptyState>
      ) : (
        <div className="space-y-2">
          {roleNodes.map((n) => flatNode(n.id, n.name, n.members, "role"))}
          {rootGroups.map((g) => renderGroupNode(g, 0))}
          {ungrouped.length ? flatNode("none", "No group", ungrouped, "muted") : null}
        </div>
      )}

      {managing ? (
        <ManageGroupsDialog
          member={managing}
          allGroups={allGroups}
          current={groupsModel?.placements[(managing.email ?? "").toLowerCase()] ?? []}
          onClose={() => setManaging(null)}
          onSave={onSetGroups}
        />
      ) : null}
    </>
  );
}

function ManageGroupsDialog({
  member, allGroups, current, onClose, onSave,
}: {
  member: RosterMember;
  allGroups: { id: string; name: string }[];
  current: string[];
  onClose: () => void;
  onSave: (email: string, groupIds: string[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(current));
  const [busy, setBusy] = useState(false);
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function save() {
    if (!member.email) return;
    setBusy(true);
    try {
      await onSave(member.email, [...selected]);
      toast.success("Groups updated");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update groups");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Groups · {member.name ?? member.email}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Place this person into any group. Roles shown as their own group are handled by the role itself.
          </p>
          {allGroups.length === 0 ? (
            <EmptyState>No groups yet. Create groups in the Roles &amp; Groups tab.</EmptyState>
          ) : (
            allGroups.map((g) => (
              <label key={g.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 cursor-pointer hover:bg-accent/40">
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

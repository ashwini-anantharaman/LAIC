/**
 * Shared "Roles & Groups" panel — used at every altitude (Nexus, Org, Program).
 *
 * One hierarchy of roles + groups: groups can nest, and roles can sit under a
 * parent group (or at the top). Each row is tagged Role/Group, indented by
 * depth, has an edit affordance, and is drag-to-reparent (drop onto a group, or
 * onto the top-level zone). Creating opens a Role|Group switch with a parent
 * picker; roles additionally get "display as group" + a permission builder.
 *
 * Everything level-specific (which permission areas exist, and the CRUD calls)
 * is supplied by an adapter, so the three People tabs share this one component.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Eye, FolderTree, GripVertical, Pencil, Plus, Shield, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { Switch } from "@/app/components/ui/switch";
import { EmptyState, Pill, Spinner } from "@/nexus/ui/kit";
import { ConfirmButton } from "@/nexus/ui/ConfirmButton";

export interface RgRole {
  id: string;
  name: string;
  perms: Record<string, string>;
  display_as_group: boolean;
  parent_group_id: string | null;
  /** Fine-grained capability ids granted from the Access Catalogue (additive). */
  capabilities?: string[];
}
export interface RgGroup {
  id: string;
  name: string;
  parent_id: string | null;
}
/** A permission area for the role builder. `graded` = a level select; `toggle`
 *  = on/off granting `grant`; `admin` = a single "full access" toggle. */
export interface RgArea {
  key: string;
  label: string;
  kind: "graded" | "toggle" | "admin" | "platform";
  /** graded: selectable levels (default view/edit). */
  levels?: string[];
  /** toggle: value stored when on (default "edit"). */
  grant?: string;
  /** admin: value stored when on (default "administrator"). */
  /** Catalogue group this area maps 1:1 to. Setting the area to an edit/grant
   *  level seeds all of that group's capabilities ON (then you subtract);
   *  view/off clears them. Capabilities are the enforced source of truth. */
  capabilityGroup?: { catalogueId: string; groupId: string };
  /** platform: the provider id of the platform's Access Catalogue (e.g.
   *  "bridge-platform", "learning-platform"). A platform area is a 3-way control
   *  — No access / Partial / Full — where Partial reveals that catalogue's
   *  capabilities to pick from. */
  catalogueId?: string;
}

export interface RgAdapter {
  loadRoles(): Promise<RgRole[]>;
  loadGroups(): Promise<RgGroup[]>;
  createRole(input: { name: string; perms: Record<string, string>; display_as_group: boolean; parent_group_id: string | null; capabilities?: string[] }): Promise<void>;
  updateRole(id: string, patch: { name?: string; perms?: Record<string, string>; display_as_group?: boolean; parent_group_id?: string | null; capabilities?: string[] }): Promise<void>;
  deleteRole(id: string): Promise<void>;
  createGroup(input: { name: string; parent_group_id: string | null }): Promise<void>;
  updateGroup(id: string, patch: { name?: string; parent_group_id?: string | null }): Promise<void>;
  deleteGroup(id: string): Promise<void>;
  /** Permission areas offered by the role builder at this altitude. */
  areas: RgArea[];
  /** Optional: preview the platform as a holder of this role ("Test as"). */
  testAsRole?: (role: RgRole) => void;
  /** Optional: load the Access Catalogue(s) whose fine-grained capabilities this
   *  level's roles can grant. When present, the builder shows a capabilities
   *  section (reserved capabilities are hidden). */
  loadCatalogues?: () => Promise<CatalogueForBuilder[]>;
}

/** The slice of a catalogue the role builder needs — grantable capabilities by group. */
export interface CatalogueForBuilder {
  id: string;
  name: string;
  /** Store provider id (e.g. "bridge-platform") — used to match a platform area
   *  to its catalogue for the Partial capability picker. */
  provider?: string;
  groups: { id: string; label: string; capabilities: { id: string; label: string }[] }[];
}

type Kind = "group" | "role";
interface DragItem { id: string; kind: Kind }

// ── Tree helpers ────────────────────────────────────────────────────────────
interface TreeNode { kind: Kind; id: string; name: string; role?: RgRole; children: TreeNode[] }

function buildTree(roles: RgRole[], groups: RgGroup[]): TreeNode[] {
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const node = (kind: Kind, id: string, name: string, role?: RgRole): TreeNode => ({ kind, id, name, role, children: [] });
  const groupNodes = new Map<string, TreeNode>(groups.map((g) => [g.id, node("group", g.id, g.name)]));
  const roots: TreeNode[] = [];
  // Nest groups under their parent (or root).
  for (const g of groups) {
    const n = groupNodes.get(g.id)!;
    const parent = g.parent_id && groupById.has(g.parent_id) ? groupNodes.get(g.parent_id!) : null;
    (parent ? parent.children : roots).push(n);
  }
  // Place roles under their parent group (or root).
  for (const r of roles) {
    const n = node("role", r.id, r.name, r);
    const parent = r.parent_group_id ? groupNodes.get(r.parent_group_id) : null;
    (parent ? parent.children : roots).push(n);
  }
  const sortRec = (list: TreeNode[]) => {
    list.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "group" ? -1 : 1));
    list.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

/** ids of a group and all its descendant groups — for cycle prevention. */
function groupSubtree(groupId: string, groups: RgGroup[]): Set<string> {
  const byParent = new Map<string | null, RgGroup[]>();
  for (const g of groups) {
    const k = g.parent_id ?? null;
    (byParent.get(k) ?? byParent.set(k, []).get(k)!).push(g);
  }
  const out = new Set<string>([groupId]);
  const stack = [groupId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const child of byParent.get(cur) ?? []) if (!out.has(child.id)) { out.add(child.id); stack.push(child.id); }
  }
  return out;
}

// ── Permission builder (generic over areas) ─────────────────────────────────
function PermRow({ area, value, onChange }: { area: RgArea; value: string | undefined; onChange: (v: string | undefined) => void }) {
  if (area.kind === "graded") {
    const levels = area.levels ?? ["view", "edit"];
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
        <span className="text-sm text-foreground">{area.label}</span>
        <Select value={value ?? "none"} onValueChange={(v) => onChange(v === "none" ? undefined : v)}>
          <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No access</SelectItem>
            {levels.map((l) => (
              <SelectItem key={l} value={l} className="capitalize">{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
  if (area.kind === "platform") {
    // 3-way: No access (undefined) / Partial ("partial") / Full ("administrator").
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
        <span className="text-sm text-foreground">{area.label}</span>
        <Select value={value ?? "none"} onValueChange={(v) => onChange(v === "none" ? undefined : v)}>
          <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No access</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="administrator">Full access</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  }
  const on = area.kind === "admin" ? value === "administrator" : value != null;
  const grant = area.kind === "admin" ? "administrator" : area.grant ?? "edit";
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
      <span className="text-sm text-foreground">{area.label}{area.kind === "admin" ? " · full access" : ""}</span>
      <Switch checked={on} onCheckedChange={(v) => onChange(v ? grant : undefined)} />
    </div>
  );
}

// ── Create / edit dialog ────────────────────────────────────────────────────
function GroupPicker({ groups, value, onChange, exclude }: { groups: RgGroup[]; value: string | null; onChange: (v: string | null) => void; exclude?: Set<string> }) {
  return (
    <Select value={value ?? "none"} onValueChange={(v) => onChange(v === "none" ? null : v)}>
      <SelectTrigger><SelectValue placeholder="No parent (top level)" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No parent (top level)</SelectItem>
        {groups.filter((g) => !exclude?.has(g.id)).map((g) => (
          <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function EditorDialog({
  open, onClose, adapter, groups, editing, onDone,
}: {
  open: boolean;
  onClose: () => void;
  adapter: RgAdapter;
  groups: RgGroup[];
  editing: { kind: Kind; role?: RgRole; group?: RgGroup } | "new" | null;
  onDone: () => void;
}) {
  const isNew = editing === "new";
  const existing = isNew || !editing ? null : editing;
  const [tab, setTab] = useState<Kind>("role");
  const [name, setName] = useState("");
  const [parent, setParent] = useState<string | null>(null);
  const [displayAsGroup, setDisplayAsGroup] = useState(false);
  const [perms, setPerms] = useState<Record<string, string>>({});
  const [caps, setCaps] = useState<Set<string>>(new Set());
  const [catalogues, setCatalogues] = useState<CatalogueForBuilder[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (existing?.kind === "role" && existing.role) {
      setTab("role"); setName(existing.role.name); setParent(existing.role.parent_group_id);
      setDisplayAsGroup(existing.role.display_as_group); setPerms({ ...existing.role.perms });
      setCaps(new Set(existing.role.capabilities ?? []));
    } else if (existing?.kind === "group" && existing.group) {
      setTab("group"); setName(existing.group.name); setParent(existing.group.parent_id);
    } else {
      setTab("role"); setName(""); setParent(null); setDisplayAsGroup(false); setPerms({}); setCaps(new Set());
    }
  }, [open, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !adapter.loadCatalogues) return;
    let live = true;
    adapter.loadCatalogues().then((c) => live && setCatalogues(c)).catch(() => live && setCatalogues([]));
    return () => { live = false; };
  }, [open, adapter]);

  const toggleCap = (id: string) => setCaps((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Capability ids belonging to an area's mapped catalogue group (grantable only —
  // reserved caps are already filtered out of the builder view).
  const groupCapIds = (area: RgArea): string[] => {
    const g = area.capabilityGroup;
    if (!g) return [];
    return catalogues.find((c) => c.id === g.catalogueId)?.groups.find((gr) => gr.id === g.groupId)?.capabilities.map((c) => c.id) ?? [];
  };
  // A platform area's picker draws from its own Access Catalogue, matched by
  // provider id (e.g. "bridge-platform"). Providers used by platform areas are
  // excluded from the generic Fine-grained list — they're chosen inline instead.
  const platformCatalogueFor = (area: RgArea): CatalogueForBuilder | undefined =>
    area.catalogueId ? catalogues.find((c) => c.provider === area.catalogueId) : undefined;
  const platformCapIds = (area: RgArea): string[] =>
    platformCatalogueFor(area)?.groups.flatMap((g) => g.capabilities.map((c) => c.id)) ?? [];
  const platformProviderIds = new Set(
    adapter.areas.filter((a) => a.kind === "platform" && a.catalogueId).map((a) => a.catalogueId as string),
  );
  // Setting an area's coarse level is a PRESET over its capabilities: choosing the
  // top level (edit / on) seeds every capability in the group ON; view / off clears
  // them. Individual toggles then subtract. Capabilities are the enforced truth.
  const applyAreaLevel = (area: RgArea, v: string | undefined) => {
    setPerms((p) => { const n = { ...p }; if (v == null) delete n[area.key]; else n[area.key] = v; return n; });
    // Platform areas (3-way): Partial keeps its picked caps; Full / No access
    // clear that platform's caps (Full grants everything via the level; No = none).
    if (area.kind === "platform") {
      const ids = platformCapIds(area);
      if (ids.length && v !== "partial") setCaps((s) => { const n = new Set(s); for (const id of ids) n.delete(id); return n; });
      return;
    }
    const ids = groupCapIds(area);
    if (!ids.length) return;
    const topLevel = area.levels ? area.levels[area.levels.length - 1] : "edit";
    const on = area.kind === "graded" ? v === topLevel : v != null;
    setCaps((s) => { const n = new Set(s); for (const id of ids) on ? n.add(id) : n.delete(id); return n; });
  };

  // Reparenting a group can't target itself or a descendant.
  const excluded = existing?.kind === "group" && existing.group ? groupSubtree(existing.group.id, groups) : undefined;

  async function save() {
    if (!name.trim()) { toast.error("Name is required"); return; }
    setBusy(true);
    try {
      if (isNew) {
        if (tab === "group") await adapter.createGroup({ name: name.trim(), parent_group_id: parent });
        else await adapter.createRole({ name: name.trim(), perms, display_as_group: displayAsGroup, parent_group_id: parent, capabilities: [...caps] });
      } else if (existing?.kind === "group") {
        await adapter.updateGroup(existing.group!.id, { name: name.trim(), parent_group_id: parent });
      } else if (existing?.kind === "role") {
        await adapter.updateRole(existing.role!.id, { name: name.trim(), perms, display_as_group: displayAsGroup, parent_group_id: parent, capabilities: [...caps] });
      }
      toast.success(isNew ? "Created" : "Saved");
      onClose(); onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally { setBusy(false); }
  }

  const showRoleFields = (isNew && tab === "role") || existing?.kind === "role";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isNew ? "Create role or group" : existing?.kind === "group" ? `Edit group · ${existing.group?.name}` : `Edit role · ${existing?.role?.name}`}
          </DialogTitle>
        </DialogHeader>

        {isNew ? (
          <div className="inline-flex rounded-lg border border-border p-0.5 text-sm">
            {(["role", "group"] as Kind[]).map((k) => (
              <button key={k} type="button" onClick={() => setTab(k)}
                className={`rounded-md px-4 py-1.5 capitalize transition-colors ${tab === k ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {k}
              </button>
            ))}
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label>{showRoleFields ? "Role name" : "Group name"}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={showRoleFields ? "e.g. Reviewer" : "e.g. Cohort A"} />
        </div>

        <div className="space-y-1.5">
          <Label>Parent group</Label>
          <GroupPicker groups={groups} value={parent} onChange={setParent} exclude={excluded} />
        </div>

        {showRoleFields ? (
          <>
            <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">Display role as its own group</span>
                <span className="block text-xs text-muted-foreground">Holders of this role also form a group by that name.</span>
              </span>
              <Switch checked={displayAsGroup} onCheckedChange={setDisplayAsGroup} />
            </label>
            <div className="space-y-1.5">
              <Label>Access</Label>
              <div className="space-y-1.5">
                {adapter.areas.map((a) => {
                  const cat = a.kind === "platform" && perms[a.key] === "partial" ? platformCatalogueFor(a) : undefined;
                  return (
                    <div key={a.key} className="space-y-1.5">
                      <PermRow area={a} value={perms[a.key]} onChange={(v) => applyAreaLevel(a, v)} />
                      {a.kind === "platform" && perms[a.key] === "partial" ? (
                        cat ? (
                          <div className="ml-3 rounded-lg border border-border p-2">
                            <div className="mb-1 px-1 text-[11px] text-muted-foreground">Capabilities this role has in {a.label}.</div>
                            {cat.groups.map((g) => (
                              <div key={g.id} className="mb-1.5">
                                <div className="px-1 text-[11px] uppercase tracking-wide text-muted-foreground/70">{g.label}</div>
                                {g.capabilities.map((cp) => (
                                  <label key={cp.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-accent/40">
                                    <Switch checked={caps.has(cp.id)} onCheckedChange={() => toggleCap(cp.id)} />
                                    <span className="min-w-0"><span className="text-foreground">{cp.label}</span> <span className="font-mono text-[11px] text-muted-foreground">{cp.id}</span></span>
                                  </label>
                                ))}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="ml-3 px-1 text-[11px] text-muted-foreground">Loading capabilities…</div>
                        )
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
            {catalogues.some((c) => !c.provider || !platformProviderIds.has(c.provider)) ? (
              <div className="space-y-2">
                <Label>Fine-grained capabilities</Label>
                <p className="-mt-1 text-xs text-muted-foreground">From the Access Catalogue. Layered on top of the areas above.</p>
                {catalogues.filter((c) => !c.provider || !platformProviderIds.has(c.provider)).map((cat) => (
                  <div key={cat.id} className="rounded-lg border border-border p-2">
                    <div className="mb-1 px-1 text-xs font-semibold text-muted-foreground">{cat.name}</div>
                    {cat.groups.map((g) => (
                      <div key={g.id} className="mb-1.5">
                        <div className="px-1 text-[11px] uppercase tracking-wide text-muted-foreground/70">{g.label}</div>
                        {g.capabilities.map((cp) => (
                          <label key={cp.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-accent/40">
                            <Switch checked={caps.has(cp.id)} onCheckedChange={() => toggleCap(cp.id)} />
                            <span className="min-w-0"><span className="text-foreground">{cp.label}</span> <span className="font-mono text-[11px] text-muted-foreground">{cp.id}</span></span>
                          </label>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : isNew ? "Create" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── The panel ───────────────────────────────────────────────────────────────
export function RolesAndGroups({ adapter }: { adapter: RgAdapter }) {
  const [roles, setRoles] = useState<RgRole[] | null>(null);
  const [groups, setGroups] = useState<RgGroup[]>([]);
  const [editing, setEditing] = useState<{ kind: Kind; role?: RgRole; group?: RgGroup } | "new" | null>(null);
  const [drag, setDrag] = useState<DragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<string | "root" | null>(null);

  const load = useCallback(async () => {
    const [rs, gs] = await Promise.all([adapter.loadRoles(), adapter.loadGroups()]);
    setRoles(rs); setGroups(gs);
  }, [adapter]);
  useEffect(() => { void load(); }, [load]);

  const tree = useMemo(() => (roles ? buildTree(roles, groups) : []), [roles, groups]);

  const reparent = useCallback(async (item: DragItem, newParent: string | null) => {
    // No-op / cycle guards.
    if (item.kind === "group") {
      if (newParent && groupSubtree(item.id, groups).has(newParent)) { toast.error("Can't move a group into itself"); return; }
      const g = groups.find((x) => x.id === item.id);
      if (g && (g.parent_id ?? null) === newParent) return;
    } else {
      const r = roles?.find((x) => x.id === item.id);
      if (r && (r.parent_group_id ?? null) === newParent) return;
    }
    try {
      if (item.kind === "group") await adapter.updateGroup(item.id, { parent_group_id: newParent });
      else await adapter.updateRole(item.id, { parent_group_id: newParent });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't move");
    }
  }, [adapter, groups, roles, load]);

  if (roles === null) return <Spinner />;

  const renderNode = (n: TreeNode, depth: number) => {
    const isGroup = n.kind === "group";
    const isDropTarget = dropTarget === n.id && isGroup && drag?.id !== n.id;
    return (
      <div key={`${n.kind}:${n.id}`}>
        <div
          draggable
          onDragStart={(e) => { setDrag({ id: n.id, kind: n.kind }); e.dataTransfer.effectAllowed = "move"; }}
          onDragEnd={() => { setDrag(null); setDropTarget(null); }}
          onDragOver={isGroup ? (e) => { e.preventDefault(); setDropTarget(n.id); } : undefined}
          onDrop={isGroup ? (e) => { e.preventDefault(); if (drag) void reparent(drag, n.id); setDrag(null); setDropTarget(null); } : undefined}
          className={`group flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${isDropTarget ? "border-primary bg-primary/5" : "border-border bg-card"}`}
          style={{ marginLeft: depth * 20 }}
        >
          <GripVertical className="size-3.5 shrink-0 cursor-grab text-muted-foreground/50" />
          {isGroup ? <FolderTree className="size-4 shrink-0 text-muted-foreground" /> : <Shield className="size-4 shrink-0 text-muted-foreground" />}
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{n.name}</span>
          {n.role?.display_as_group ? <Pill tone="neutral">shown as group</Pill> : null}
          <Pill tone={isGroup ? "accent" : "neutral"}>{isGroup ? "group" : "role"}</Pill>
          {!isGroup && n.role && adapter.testAsRole ? (
            <button type="button" title="Preview as a holder of this role"
              onClick={() => adapter.testAsRole!(n.role!)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground opacity-0 transition hover:text-foreground group-hover:opacity-100">
              <Eye className="size-3.5" /> Test as
            </button>
          ) : null}
          <button type="button" title="Edit"
            onClick={() => setEditing(isGroup ? { kind: "group", group: groups.find((g) => g.id === n.id) } : { kind: "role", role: n.role })}
            className="text-muted-foreground opacity-0 transition hover:text-foreground group-hover:opacity-100">
            <Pencil className="size-3.5" />
          </button>
          <ConfirmButton
            title={`Delete ${isGroup ? "group" : "role"} "${n.name}"?`}
            description={isGroup ? "Its children move up to its parent." : "People holding it lose the role."}
            actionLabel="Delete"
            onConfirm={async () => { try { isGroup ? await adapter.deleteGroup(n.id) : await adapter.deleteRole(n.id); await load(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } }}
            buttonTitle="Delete"
          >
            <Trash2 className="size-3.5 text-red-600 dark:text-red-400" />
          </ConfirmButton>
        </div>
        {n.children.length ? <div className="mt-1 space-y-1">{n.children.map((c) => renderNode(c, depth + 1))}</div> : null}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Drag a role or group onto a group to nest it — or onto the top zone to lift it out.</p>
        <Button size="sm" onClick={() => setEditing("new")}><Plus className="size-3.5" /> Create role or group</Button>
      </div>

      {/* Top-level drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDropTarget("root"); }}
        onDrop={(e) => { e.preventDefault(); if (drag) void reparent(drag, null); setDrag(null); setDropTarget(null); }}
        className={`flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs transition-colors ${dropTarget === "root" ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground"}`}
      >
        <ChevronRight className="size-3.5" /> Top level (no parent)
      </div>

      {tree.length === 0 ? (
        <EmptyState>No roles or groups yet. Create the first one.</EmptyState>
      ) : (
        <div className="space-y-1">{tree.map((n) => renderNode(n, 0))}</div>
      )}

      <EditorDialog open={editing !== null} onClose={() => setEditing(null)} adapter={adapter} groups={groups} editing={editing} onDone={load} />
    </div>
  );
}

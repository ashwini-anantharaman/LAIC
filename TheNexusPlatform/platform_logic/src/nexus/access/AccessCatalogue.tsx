/**
 * Access Catalogue editor (console, operator-only). The AshwiniNew catalogue tab,
 * rebuilt in the console's design system and backed by the central service
 * (GET/PUT /catalogues/:provider) instead of localStorage. Provider-selectable
 * so one screen edits every catalogue: nexus/org/program consoles + learning +
 * bridge. See ACCESS_CATALOGUE_DESIGN.md.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { BookOpen, ChevronDown, ChevronRight, Copy, FileJson, KeyRound, LayoutList, Plus, RotateCcw, Save, Shield, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { Switch } from "@/app/components/ui/switch";
import { EmptyState, PageHeader, Pill, Spinner } from "@/nexus/ui/kit";
import { ConfirmButton } from "@/nexus/ui/ConfirmButton";
import {
  getCatalogue, listCatalogues, resetCatalogue, saveCatalogue,
  type Capability, type CapabilityCatalogueDocument, type CatalogueListEntry, type ReservedTier, type UiSurface, type UiSurfaceKind,
} from "./catalogue";
import schemaJson from "./access-catalogue.schema.json";

type TabId = "groups" | "capabilities" | "surfaces" | "resources" | "samples" | "json" | "schema";
const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "groups", label: "Groups", icon: <LayoutList className="size-3.5" /> },
  { id: "capabilities", label: "Capabilities", icon: <KeyRound className="size-3.5" /> },
  { id: "surfaces", label: "Surfaces", icon: <LayoutList className="size-3.5" /> },
  { id: "resources", label: "Resources", icon: <LayoutList className="size-3.5" /> },
  { id: "samples", label: "Sample roles", icon: <Shield className="size-3.5" /> },
  { id: "json", label: "Export JSON", icon: <LayoutList className="size-3.5" /> },
  { id: "schema", label: "JSON Schema", icon: <FileJson className="size-3.5" /> },
];
const SURFACE_KINDS: UiSurfaceKind[] = ["navigation", "screen", "component", "action"];
const RESERVED: (ReservedTier | "none")[] = ["none", "owner", "full_operator", "program_admin"];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

/**
 * An instance-scoped catalogue source. When supplied, the editor drops the
 * provider selector and edits exactly this one catalogue (an org's or program's
 * own customization). When absent, the editor runs in Nexus multi-provider mode.
 */
export interface CatalogueSource {
  title?: string;
  subtitle?: string;
  load: () => Promise<CapabilityCatalogueDocument>;
  save: (doc: CapabilityCatalogueDocument) => Promise<CapabilityCatalogueDocument>;
  reset: () => Promise<CapabilityCatalogueDocument>;
  /** false → read-only (hide Save / Reset). Defaults to editable. */
  canEdit?: boolean;
}

export function AccessCatalogue({ source, embedded = false }: { source?: CatalogueSource; embedded?: boolean } = {}) {
  const multi = !source;
  const canEdit = source ? source.canEdit !== false : true;
  const [providers, setProviders] = useState<CatalogueListEntry[]>([]);
  const [providerId, setProviderId] = useState<string>("nexus-console");
  const [doc, setDoc] = useState<CapabilityCatalogueDocument | null>(null);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<TabId>("groups");
  const [busy, setBusy] = useState(false);
  const [capEdit, setCapEdit] = useState<Capability | "new" | null>(null);
  const [surfEdit, setSurfEdit] = useState<UiSurface | "new" | null>(null);
  // When adding a cap/surface from inside a group, pre-scope the dialog to it.
  const [capDefaultGroup, setCapDefaultGroup] = useState<string | null>(null);
  const [surfDefaultGroup, setSurfDefaultGroup] = useState<string | null>(null);
  const addCapToGroup = (gid: string) => { setCapDefaultGroup(gid); setCapEdit("new"); };
  const addSurfToGroup = (gid: string) => { setSurfDefaultGroup(gid); setSurfEdit("new"); };
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [guideOpen, setGuideOpen] = useState(false);
  const toggleGroup = (id: string) =>
    setExpandedGroups((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  useEffect(() => { if (multi) listCatalogues().then(setProviders).catch(() => setProviders([])); }, [multi]);
  const load = useCallback(() => {
    setDoc(null); setDirty(false);
    (source ? source.load() : getCatalogue(providerId)).then(setDoc).catch(() => toast.error("Failed to load catalogue"));
  }, [source, providerId]);
  useEffect(() => load(), [load]);

  const patch = useCallback((next: CapabilityCatalogueDocument) => { setDoc(next); setDirty(true); }, []);

  async function save() {
    if (!doc) return;
    setBusy(true);
    try {
      await (source ? source.save(doc) : saveCatalogue(providerId, doc));
      setDirty(false); toast.success("Catalogue saved");
      if (multi) listCatalogues().then(setProviders).catch(() => {});
    }
    catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(false); }
  }
  async function reset() {
    setBusy(true);
    try { const d = await (source ? source.reset() : resetCatalogue(providerId)); setDoc(d); setDirty(false); toast.success("Reset to shipped defaults"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Reset failed"); }
    finally { setBusy(false); }
  }

  // ── mutations (mirror the learning-platform editor) ───────────────────────
  const upsertCap = (c: Capability) => {
    if (!doc) return;
    const exists = doc.capabilities.some((x) => x.id === c.id);
    const groups = doc.groups.map((g) => {
      const ids = new Set(g.capabilityIds ?? []);
      if (g.id === c.group) ids.add(c.id); else ids.delete(c.id);
      return { ...g, capabilityIds: [...ids] };
    });
    patch({ ...doc, capabilities: exists ? doc.capabilities.map((x) => (x.id === c.id ? c : x)) : [...doc.capabilities, c], groups });
    setCapEdit(null);
  };
  const removeCap = (id: string) => {
    if (!doc) return;
    patch({
      ...doc,
      capabilities: doc.capabilities.filter((c) => c.id !== id),
      groups: doc.groups.map((g) => ({ ...g, capabilityIds: (g.capabilityIds ?? []).filter((x) => x !== id) })),
      uiSurfaces: doc.uiSurfaces.map((s) => ({ ...s, requiredAnyCapabilities: (s.requiredAnyCapabilities ?? []).filter((x) => x !== id) })),
    });
  };
  const upsertSurf = (s: UiSurface) => {
    if (!doc) return;
    const exists = doc.uiSurfaces.some((x) => x.id === s.id);
    const groups = doc.groups.map((g) => {
      const ids = new Set(g.uiSurfaceIds ?? []);
      if (g.id === s.group) ids.add(s.id); else ids.delete(s.id);
      return { ...g, uiSurfaceIds: [...ids] };
    });
    patch({ ...doc, uiSurfaces: exists ? doc.uiSurfaces.map((x) => (x.id === s.id ? s : x)) : [...doc.uiSurfaces, s], groups });
    setSurfEdit(null);
  };
  const removeSurf = (id: string) => {
    if (!doc) return;
    patch({ ...doc, uiSurfaces: doc.uiSurfaces.filter((s) => s.id !== id), groups: doc.groups.map((g) => ({ ...g, uiSurfaceIds: (g.uiSurfaceIds ?? []).filter((x) => x !== id) })) });
  };
  const addGroup = (label: string) => {
    if (!doc || !label.trim()) return;
    const id = slug(label);
    if (doc.groups.some((g) => g.id === id)) { toast.error("A group with that id exists"); return; }
    patch({ ...doc, groups: [...doc.groups, { id, label: label.trim(), order: doc.groups.length + 1, capabilityIds: [], uiSurfaceIds: [] }] });
  };
  const renameGroup = (id: string, label: string) => { if (doc) patch({ ...doc, groups: doc.groups.map((g) => (g.id === id ? { ...g, label } : g)) }); };
  const removeGroup = (id: string) => {
    if (!doc) return;
    if (doc.groups.length <= 1) { toast.error("Keep at least one group"); return; }
    const fallback = doc.groups.find((g) => g.id !== id)!.id;
    patch({
      ...doc,
      groups: doc.groups.filter((g) => g.id !== id),
      capabilities: doc.capabilities.map((c) => (c.group === id ? { ...c, group: fallback } : c)),
      uiSurfaces: doc.uiSurfaces.map((s) => (s.group === id ? { ...s, group: fallback } : s)),
    });
  };
  const addResource = (label: string) => {
    if (!doc || !label.trim()) return;
    const id = slug(label);
    if (doc.resourceTypes.some((r) => r.id === id)) return;
    patch({ ...doc, resourceTypes: [...doc.resourceTypes, { id, label: label.trim() }] });
  };
  const removeResource = (id: string) => { if (doc) patch({ ...doc, resourceTypes: doc.resourceTypes.filter((r) => r.id !== id) }); };

  const groupsSorted = useMemo(() => (doc ? [...doc.groups].sort((a, b) => a.order - b.order) : []), [doc]);
  const capsByGroup = (gid: string) => (doc?.capabilities ?? []).filter((c) => c.group === gid);
  const surfsByGroup = (gid: string) => (doc?.uiSurfaces ?? []).filter((s) => s.group === gid);

  // The provider selector + Save/Reset actions — shared between the standalone
  // PageHeader and the compact embedded row (People → Access Catalog sub-tab).
  const actionBar = (
    <div className="flex flex-wrap items-center gap-2">
      {multi ? (
        <Select value={providerId} onValueChange={setProviderId}>
          <SelectTrigger className="h-9 w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            {providers.map((p) => (
              <SelectItem key={p.providerId} value={p.providerId}>{p.name}{p.customized ? " ·edited" : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {canEdit ? (
        <>
          <Button variant="outline" size="sm" onClick={reset} disabled={busy || !doc}><RotateCcw className="size-3.5" /> Reset defaults</Button>
          <Button size="sm" onClick={save} disabled={busy || !doc || !dirty}><Save className="size-3.5" /> {busy ? "Saving…" : "Save catalog"}</Button>
        </>
      ) : null}
    </div>
  );

  return (
    <div>
      {embedded ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {source?.subtitle ?? "The inventory of what this level's roles can grant, and the UI those grants unlock."}
          </p>
          {actionBar}
        </div>
      ) : (
        <PageHeader
          title={source?.title ?? "Access Catalog"}
          subtitle={source?.subtitle ?? "The platform inventory of what can be permission-controlled. Roles bind against these ids."}
          actions={actionBar}
        />
      )}

      {!doc ? (
        <Spinner />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Pill tone="neutral">{doc.provider.kind}/{doc.provider.id}</Pill>
            <Pill tone="neutral">v{doc.catalogueVersion}</Pill>
            {dirty ? <Pill tone="warn">Unsaved</Pill> : null}
            <span className="text-xs text-muted-foreground">
              {doc.groups.length} groups · {doc.capabilities.length} capabilities · {doc.uiSurfaces.length} surfaces · {doc.resourceTypes.length} resource types
            </span>
          </div>

          <div className="mb-5 flex flex-wrap gap-1 border-b border-border">
            {TABS.map((t) => (
              <button key={t.id} type="button" onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-sm transition-colors ${tab === t.id ? "border-b-2 border-foreground font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {tab === "groups" && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Groups organize the role UI. Each holds capabilities (enforcement keys) and surfaces (nav items).</p>
              {groupsSorted.map((g) => {
                const caps = capsByGroup(g.id);
                const surfs = surfsByGroup(g.id);
                const open = expandedGroups.has(g.id);
                return (
                  <div key={g.id} className="glass-card overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3">
                      <button
                        type="button"
                        onClick={() => toggleGroup(g.id)}
                        className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                        title={open ? "Hide capabilities & surfaces" : "Show capabilities & surfaces"}
                        aria-expanded={open}
                      >
                        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      </button>
                      <Input value={g.label} onChange={(e) => renameGroup(g.id, e.target.value)} className="h-8 max-w-xs" />
                      <span className="font-mono text-xs text-muted-foreground">{g.id}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{caps.length} caps · {surfs.length} surfaces</span>
                      <ConfirmButton title={`Remove group "${g.label}"?`} description="Its capabilities/surfaces move to another group." actionLabel="Remove" onConfirm={() => removeGroup(g.id)} buttonTitle="Remove group">
                        <Trash2 className="size-3.5 text-red-600 dark:text-red-400" />
                      </ConfirmButton>
                    </div>
                    {open ? (
                      <div className="space-y-3 border-t border-border bg-muted/20 px-4 py-3 pl-13">
                        <div>
                          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            <KeyRound className="size-3" /> Capabilities
                          </div>
                          {caps.length ? (
                            <div className="flex flex-col gap-1">
                              {caps.map((c) => (
                                <div key={c.id} className="group/row flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-accent/40">
                                  <span className="text-foreground">{c.label}</span>
                                  <span className="font-mono text-xs text-muted-foreground">{c.id}</span>
                                  {c.reserved ? <Pill tone="accent">reserved · {c.reserved}</Pill> : null}
                                  {canEdit ? (
                                    <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover/row:opacity-100">
                                      <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setCapEdit(c)}>Edit</Button>
                                      <ConfirmButton title={`Delete "${c.label}"?`} description="Removed from roles and surfaces too." actionLabel="Delete" onConfirm={() => removeCap(c.id)} buttonTitle="Delete capability">
                                        <Trash2 className="size-3.5 text-red-600 dark:text-red-400" />
                                      </ConfirmButton>
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ) : <p className="text-xs text-muted-foreground">None in this group.</p>}
                          {canEdit ? (
                            <Button size="sm" variant="outline" className="mt-1.5 h-7" onClick={() => addCapToGroup(g.id)}><Plus className="size-3.5" /> Add capability</Button>
                          ) : null}
                        </div>
                        <div>
                          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            <LayoutList className="size-3" /> Surfaces
                          </div>
                          {surfs.length ? (
                            <div className="flex flex-col gap-1">
                              {surfs.map((s) => (
                                <div key={s.id} className="group/row flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-accent/40">
                                  <span className="text-foreground">{s.label}</span>
                                  <span className="font-mono text-xs text-muted-foreground">{s.id}</span>
                                  <Pill tone="neutral">{s.kind}</Pill>
                                  {canEdit ? (
                                    <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover/row:opacity-100">
                                      <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setSurfEdit(s)}>Edit</Button>
                                      <ConfirmButton title={`Delete surface "${s.label}"?`} description="" actionLabel="Delete" onConfirm={() => removeSurf(s.id)} buttonTitle="Delete surface">
                                        <Trash2 className="size-3.5 text-red-600 dark:text-red-400" />
                                      </ConfirmButton>
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ) : <p className="text-xs text-muted-foreground">None in this group.</p>}
                          {canEdit ? (
                            <Button size="sm" variant="outline" className="mt-1.5 h-7" onClick={() => addSurfToGroup(g.id)}><Plus className="size-3.5" /> Add surface</Button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
              <AddInline placeholder="New group label" onAdd={addGroup} />
            </div>
          )}

          {tab === "capabilities" && (
            <div className="space-y-4">
              <div className="flex justify-end"><Button size="sm" onClick={() => setCapEdit("new")}><Plus className="size-3.5" /> Add capability</Button></div>
              {groupsSorted.map((g) => (
                <div key={g.id}>
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</div>
                  <div className="space-y-1.5">
                    {capsByGroup(g.id).map((c) => (
                      <div key={c.id} className="glass-card flex items-center gap-2 px-4 py-2.5">
                        <span className="min-w-0"><span className="text-sm font-medium text-foreground">{c.label}</span> <span className="font-mono text-xs text-muted-foreground">{c.id}</span></span>
                        {c.reserved ? <Pill tone="accent">reserved · {c.reserved}</Pill> : null}
                        {c.supportsResourceConstraints ? <Pill tone="neutral">type-scoped</Pill> : null}
                        <div className="ml-auto flex items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setCapEdit(c)}>Edit</Button>
                          <ConfirmButton title={`Delete "${c.label}"?`} description="Removed from roles and surfaces too." actionLabel="Delete" onConfirm={() => removeCap(c.id)} buttonTitle="Delete capability">
                            <Trash2 className="size-3.5 text-red-600 dark:text-red-400" />
                          </ConfirmButton>
                        </div>
                      </div>
                    ))}
                    {capsByGroup(g.id).length === 0 ? <p className="text-xs text-muted-foreground">No capabilities in this group.</p> : null}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "surfaces" && (
            <div className="space-y-2">
              <div className="flex justify-end"><Button size="sm" onClick={() => setSurfEdit("new")}><Plus className="size-3.5" /> Add surface</Button></div>
              {doc.uiSurfaces.map((s) => (
                <div key={s.id} className="glass-card flex items-center gap-2 px-4 py-2.5">
                  <span className="min-w-0"><span className="text-sm font-medium text-foreground">{s.label}</span> <span className="font-mono text-xs text-muted-foreground">{s.id}</span></span>
                  <Pill tone="neutral">{s.kind}</Pill>
                  <span className="text-xs text-muted-foreground truncate">{(s.requiredAnyCapabilities ?? []).length ? (s.requiredAnyCapabilities ?? []).join(", ") : "always"}</span>
                  <div className="ml-auto flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setSurfEdit(s)}>Edit</Button>
                    <ConfirmButton title={`Delete surface "${s.label}"?`} description="" actionLabel="Delete" onConfirm={() => removeSurf(s.id)} buttonTitle="Delete surface">
                      <Trash2 className="size-3.5 text-red-600 dark:text-red-400" />
                    </ConfirmButton>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "resources" && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Resource types a capability can be scoped to (enforcement deferred).</p>
              {doc.resourceTypes.map((r) => (
                <div key={r.id} className="glass-card flex items-center gap-3 px-4 py-2.5">
                  <span className="text-sm text-foreground">{r.label}</span>
                  <span className="font-mono text-xs text-muted-foreground">{r.id}</span>
                  <ConfirmButton title={`Remove "${r.label}"?`} description="" actionLabel="Remove" onConfirm={() => removeResource(r.id)} buttonTitle="Remove resource type" className="ml-auto">
                    <Trash2 className="size-3.5 text-red-600 dark:text-red-400" />
                  </ConfirmButton>
                </div>
              ))}
              {doc.resourceTypes.length === 0 ? <EmptyState>No resource types.</EmptyState> : null}
              <AddInline placeholder="New resource type label" onAdd={addResource} />
            </div>
          )}

          {tab === "samples" && (
            <div className="space-y-2">
              {(doc.sampleRoleTemplates ?? []).length === 0 ? (
                <EmptyState>No sample roles in this catalog.</EmptyState>
              ) : (
                (doc.sampleRoleTemplates ?? []).map((r) => (
                  <div key={r.id} className="glass-card px-4 py-3">
                    <div className="text-sm font-medium text-foreground">{r.name}</div>
                    {r.description ? <div className="text-xs text-muted-foreground">{r.description}</div> : null}
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {r.grants.flatMap((g) => g.capabilityIds).map((cid) => <Pill key={cid} tone="neutral">{cid}</Pill>)}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === "json" && <JsonView title="Live catalog document" value={doc} />}
          {tab === "schema" && <JsonView title="JSON Schema" value={schemaJson} />}
        </>
      )}

      {/* Bottom-of-page guide entry. */}
      <div className="mt-8 flex justify-center border-t border-border pt-5">
        <Button variant="outline" size="sm" onClick={() => setGuideOpen(true)}>
          <BookOpen className="size-3.5" /> Access Catalog Guide
        </Button>
      </div>

      {capEdit && doc ? <CapabilityDialog doc={doc} initial={capEdit === "new" ? null : capEdit} defaultGroup={capDefaultGroup} onClose={() => { setCapEdit(null); setCapDefaultGroup(null); }} onSave={upsertCap} /> : null}
      {surfEdit && doc ? <SurfaceDialog doc={doc} initial={surfEdit === "new" ? null : surfEdit} defaultGroup={surfDefaultGroup} onClose={() => { setSurfEdit(null); setSurfDefaultGroup(null); }} onSave={upsertSurf} /> : null}
      {guideOpen ? <AccessCatalogGuide onClose={() => setGuideOpen(false)} /> : null}
    </div>
  );
}

/**
 * Access Catalog Guide — an in-app explainer of the whole model. Kept as static
 * copy (not editable) so every level shows the same canonical explanation.
 */
function AccessCatalogGuide({ onClose }: { onClose: () => void }) {
  const H = ({ children }: { children: ReactNode }) => (
    <h3 className="mt-5 text-sm font-semibold text-foreground">{children}</h3>
  );
  const P = ({ children }: { children: ReactNode }) => (
    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{children}</p>
  );
  const Code = ({ children }: { children: ReactNode }) => (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[12px] text-foreground">{children}</code>
  );
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><BookOpen className="size-4" /> Access Catalog Guide</DialogTitle>
        </DialogHeader>

        <div className="pb-2">
          <P>
            The Access Catalog is the <strong>inventory</strong> of everything that can be
            permission-controlled at this level. It does not assign anyone — it defines the
            vocabulary that <em>roles</em> are built from. Roles bind to items in here; people get roles.
          </P>

          <H>The three building blocks</H>
          <P>
            <strong>1. Capabilities</strong> — the atomic units of permission (e.g.{" "}
            <Code>nexus.audit.view</Code>). A role is, underneath, just a <strong>set of capability ids</strong>.
            Capabilities are the only thing actually granted and enforced.
          </P>
          <P>
            <strong>2. Groups</strong> — labeled folders that bucket related capabilities (and surfaces).
            Their job is twofold: they tidy the UI, and each group can back <strong>one coarse toggle</strong> in
            the role builder — flipping that toggle on seeds every capability in the folder onto the role.
            Groups are never stored on a role; they’re the design-time bridge between the simple toggle and the
            underlying capabilities.
          </P>
          <P>
            <strong>3. Surfaces</strong> — the UI a capability unlocks (a nav tab, screen, or action), each with{" "}
            <Code>requiredAnyCapabilities</Code>. Holding one of those capabilities reveals the surface; lacking
            them hides it. This is what makes “turn a capability off → the tab disappears” work.
          </P>
          <P>
            <strong>Resource types</strong> scope a capability to kinds of objects (enforcement is still being
            layered in), and <strong>sample roles</strong> are starter bundles of capabilities.
          </P>

          <H>How a role is actually built</H>
          <P>
            A saved role stores two things — and a group id is in neither: a set of <strong>coarse area levels</strong>{" "}
            (No / View / Edit, or No / Partial / Full for platforms) and a flat list of{" "}
            <strong>capability ids</strong>. Setting an area’s coarse level is a preset: the top level seeds every
            capability in that area’s group; “Partial” lets you hand-pick a subset. The capability list is the{" "}
            <strong>enforced source of truth</strong> — the backend validates it against this catalog and drops
            anything not in the inventory.
          </P>

          <H>Reserved (structural) capabilities</H>
          <P>
            A capability marked <Code>reserved</Code> is held implicitly by a structural tier — a Super Admin /
            owner, a full operator, or a program admin — and can <strong>never</strong> be granted to a custom
            role. Those tiers bypass the catalog and hold everything; the reserved flag just hides such a
            capability from the role builder so no one can hand it out.
          </P>

          <H>Per-level catalogs</H>
          <P>
            Each level has its own catalog: the platform (Nexus), each organization, each program, and each
            runtime (Content Studio, Bridge). An org/program starts from the shipped default and only diverges
            once you edit it here (a “·edited” marker appears). Editing one level never touches another.
          </P>

          <H>Adding a new feature end-to-end</H>
          <P>
            1) Add a <strong>capability</strong> to a group here; 2) add a <strong>surface</strong> for the UI it
            unlocks; 3) the role builder’s toggle for that group now grants it; 4) the nav/screen gated by that
            surface appears for anyone who holds it. A brand-new group is purely organizational until a role-builder
            area is wired to it — that wiring is what turns a folder into a working, grantable feature.
          </P>

          <H>Editing here</H>
          <P>
            Use the <strong>Groups</strong> tab to add capabilities/surfaces inline within a folder, or the
            dedicated <strong>Capabilities</strong> / <strong>Surfaces</strong> tabs. <strong>Save catalog</strong>{" "}
            persists your changes for this level; <strong>Reset defaults</strong> restores the shipped catalog.
            The <strong>Export JSON</strong> and <strong>JSON Schema</strong> tabs show the live document and the
            shape it must follow.
          </P>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddInline({ placeholder, onAdd }: { placeholder: string; onAdd: (v: string) => void }) {
  const [v, setV] = useState("");
  return (
    <div className="flex gap-2 pt-1">
      <Input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} className="max-w-xs" />
      <Button size="sm" disabled={!v.trim()} onClick={() => { onAdd(v); setV(""); }}><Plus className="size-3.5" /> Add</Button>
    </div>
  );
}

function JsonView({ title, value }: { title: string; value: unknown }) {
  const text = JSON.stringify(value, null, 2);
  return (
    <div className="glass-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="text-sm font-medium text-foreground">{title}</span>
        <Button size="sm" variant="ghost" onClick={() => { void navigator.clipboard?.writeText(text); toast.success("Copied"); }}><Copy className="size-3.5" /> Copy</Button>
      </div>
      <pre className="max-h-[60vh] overflow-auto p-4 text-xs leading-relaxed"><code>{text}</code></pre>
    </div>
  );
}

function CapabilityDialog({ doc, initial, defaultGroup, onClose, onSave }: { doc: CapabilityCatalogueDocument; initial: Capability | null; defaultGroup?: string | null; onClose: () => void; onSave: (c: Capability) => void }) {
  const [id, setId] = useState(initial?.id ?? "");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [group, setGroup] = useState(initial?.group ?? defaultGroup ?? doc.groups[0]?.id ?? "");
  const [reserved, setReserved] = useState<ReservedTier | "none">(initial?.reserved ?? "none");
  const [typeScoped, setTypeScoped] = useState(!!initial?.supportsResourceConstraints);
  const effId = initial ? initial.id : (id.trim() || slug(label));
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{initial ? `Edit · ${initial.id}` : "Add capability"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {!initial ? (
            <div className="space-y-1.5"><Label>Capability id</Label><Input value={id} onChange={(e) => setId(e.target.value)} placeholder={slug(label) || "e.g. org.people.manage"} /></div>
          ) : null}
          <div className="space-y-1.5"><Label>Label</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Group</Label>
            <Select value={group} onValueChange={setGroup}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{doc.groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Reserved to tier (hidden from custom roles)</Label>
            <Select value={reserved} onValueChange={(v) => setReserved(v as ReservedTier | "none")}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{RESERVED.map((r) => <SelectItem key={r} value={r}>{r === "none" ? "Grantable (not reserved)" : r}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
            <span className="text-sm">Type-scoped (restrictable to resource types)</span>
            <Switch checked={typeScoped} onCheckedChange={setTypeScoped} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!effId || !label.trim()} onClick={() => onSave({ id: effId, label: label.trim(), group, reserved: reserved === "none" ? undefined : reserved, supportsResourceConstraints: typeScoped || undefined })}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SurfaceDialog({ doc, initial, defaultGroup, onClose, onSave }: { doc: CapabilityCatalogueDocument; initial: UiSurface | null; defaultGroup?: string | null; onClose: () => void; onSave: (s: UiSurface) => void }) {
  const [id, setId] = useState(initial?.id ?? "");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [kind, setKind] = useState<UiSurfaceKind>(initial?.kind ?? "navigation");
  const [group, setGroup] = useState(initial?.group ?? defaultGroup ?? doc.groups[0]?.id ?? "");
  const [route, setRoute] = useState(initial?.routeOrComponent ?? "");
  const [req, setReq] = useState<Set<string>>(new Set(initial?.requiredAnyCapabilities ?? []));
  const effId = initial ? initial.id : (id.trim() || slug(label));
  const toggle = (cid: string) => setReq((s) => { const n = new Set(s); n.has(cid) ? n.delete(cid) : n.add(cid); return n; });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{initial ? `Edit · ${initial.id}` : "Add surface"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {!initial ? <div className="space-y-1.5"><Label>Surface id</Label><Input value={id} onChange={(e) => setId(e.target.value)} placeholder={slug(label) || "e.g. team"} /></div> : null}
          <div className="space-y-1.5"><Label>Label</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label>Kind</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as UiSurfaceKind)}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SURFACE_KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Group</Label>
              <Select value={group} onValueChange={setGroup}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{doc.groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label>Route / component</Label><Input value={route} onChange={(e) => setRoute(e.target.value)} placeholder="/team" /></div>
          <div className="space-y-1.5">
            <Label>Required capabilities (any one unlocks)</Label>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
              {doc.capabilities.map((c) => (
                <label key={c.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent/40">
                  <Switch checked={req.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                  <span className="font-mono text-xs text-muted-foreground">{c.id}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!effId || !label.trim()} onClick={() => onSave({ id: effId, label: label.trim(), kind, group, routeOrComponent: route.trim() || undefined, requiredAnyCapabilities: [...req] })}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

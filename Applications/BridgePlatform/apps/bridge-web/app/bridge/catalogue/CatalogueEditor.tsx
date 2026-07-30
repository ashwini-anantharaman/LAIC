"use client";

/**
 * Bridge Access Catalogue editor — the inventory of what Bridge can
 * permission-control (capabilities + UI surfaces + groups + resource types +
 * sample roles). Roles (Teams & roles) bind these capability ids. Parity with
 * the console/learning editor, adapted to bridge-web (plain Tailwind, and Save/
 * Reset via server actions since the session token is an httpOnly cookie).
 */
import { useMemo, useState, useTransition } from "react";
import type {
  BridgeCatalogue,
  BridgeCapability,
  BridgeUiSurface,
  BridgeUiSurfaceKind,
  BridgeReservedTier,
} from "@/lib/nexusBridgeRoles";
import { saveCatalogueAction, resetCatalogueAction } from "./actions";
import schemaJson from "@/lib/access-catalogue.schema.json";

type TabId = "groups" | "capabilities" | "surfaces" | "resources" | "samples" | "json" | "schema";
const TABS: { id: TabId; label: string }[] = [
  { id: "groups", label: "Capability Sets" },
  { id: "capabilities", label: "Capabilities" },
  { id: "surfaces", label: "Surfaces" },
  { id: "resources", label: "Resources" },
  { id: "samples", label: "Sample roles" },
  { id: "json", label: "Export JSON" },
  { id: "schema", label: "JSON Schema" },
];
const SURFACE_KINDS: BridgeUiSurfaceKind[] = ["navigation", "screen", "component", "action"];
const RESERVED: (BridgeReservedTier | "none")[] = ["none", "owner", "full_operator", "program_admin"];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

const btn = "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50";
const btnPrimary = `${btn} bg-emerald-700 text-white hover:bg-emerald-800`;
const btnOutline = `${btn} border border-neutral-300 text-neutral-700 hover:border-neutral-400`;
const input = "w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm outline-none focus:border-emerald-500";

export function CatalogueEditor({ initial, canEdit, embedded = false }: { initial: BridgeCatalogue; canEdit: boolean; embedded?: boolean }) {
  const [doc, setDoc] = useState<BridgeCatalogue>(initial);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<TabId>("groups");
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState("");
  const [capEdit, setCapEdit] = useState<BridgeCapability | "new" | null>(null);
  const [surfEdit, setSurfEdit] = useState<BridgeUiSurface | "new" | null>(null);
  // When adding a cap/surface from inside a group, pre-scope the dialog to it.
  const [capDefaultGroup, setCapDefaultGroup] = useState<string | null>(null);
  const [surfDefaultGroup, setSurfDefaultGroup] = useState<string | null>(null);
  const addCapToGroup = (gid: string) => { setCapDefaultGroup(gid); setCapEdit("new"); };
  const addSurfToGroup = (gid: string) => { setSurfDefaultGroup(gid); setSurfEdit("new"); };
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [guideOpen, setGuideOpen] = useState(false);

  const fire = (m: string) => { setToast(m); window.setTimeout(() => setToast(""), 2400); };
  const patch = (next: BridgeCatalogue) => { setDoc(next); setDirty(true); };
  const toggleGroup = (id: string) =>
    setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  function save() {
    startTransition(async () => {
      try { await saveCatalogueAction(JSON.stringify(doc)); setDirty(false); fire("Catalog saved"); }
      catch (e) { fire(e instanceof Error ? e.message : "Save failed"); }
    });
  }
  function reset() {
    startTransition(async () => {
      try { await resetCatalogueAction(); fire("Reset to defaults"); window.location.reload(); }
      catch (e) { fire(e instanceof Error ? e.message : "Reset failed"); }
    });
  }

  // ── mutations (mirror the console/learning editor) ────────────────────────
  const upsertCap = (c: BridgeCapability) => {
    const exists = doc.capabilities.some((x) => x.id === c.id);
    const groups = doc.groups.map((g) => {
      const ids = new Set(g.capabilityIds ?? []);
      if (g.id === c.group) ids.add(c.id); else ids.delete(c.id);
      return { ...g, capabilityIds: [...ids] };
    });
    patch({ ...doc, capabilities: exists ? doc.capabilities.map((x) => (x.id === c.id ? c : x)) : [...doc.capabilities, c], groups });
    setCapEdit(null);
  };
  const removeCap = (id: string) => patch({
    ...doc,
    capabilities: doc.capabilities.filter((c) => c.id !== id),
    groups: doc.groups.map((g) => ({ ...g, capabilityIds: (g.capabilityIds ?? []).filter((x) => x !== id) })),
    uiSurfaces: doc.uiSurfaces.map((s) => ({ ...s, requiredAnyCapabilities: (s.requiredAnyCapabilities ?? []).filter((x) => x !== id) })),
  });
  const upsertSurf = (s: BridgeUiSurface) => {
    const exists = doc.uiSurfaces.some((x) => x.id === s.id);
    const groups = doc.groups.map((g) => {
      const ids = new Set(g.uiSurfaceIds ?? []);
      if (g.id === s.group) ids.add(s.id); else ids.delete(s.id);
      return { ...g, uiSurfaceIds: [...ids] };
    });
    patch({ ...doc, uiSurfaces: exists ? doc.uiSurfaces.map((x) => (x.id === s.id ? s : x)) : [...doc.uiSurfaces, s], groups });
    setSurfEdit(null);
  };
  const removeSurf = (id: string) => patch({
    ...doc,
    uiSurfaces: doc.uiSurfaces.filter((s) => s.id !== id),
    groups: doc.groups.map((g) => ({ ...g, uiSurfaceIds: (g.uiSurfaceIds ?? []).filter((x) => x !== id) })),
  });
  const addGroup = (label: string) => {
    if (!label.trim()) return;
    const id = slug(label);
    if (doc.groups.some((g) => g.id === id)) { fire("A capability set with that id exists"); return; }
    patch({ ...doc, groups: [...doc.groups, { id, label: label.trim(), order: doc.groups.length + 1, capabilityIds: [], uiSurfaceIds: [] }] });
  };
  const renameGroup = (id: string, label: string) => patch({ ...doc, groups: doc.groups.map((g) => (g.id === id ? { ...g, label } : g)) });
  const removeGroup = (id: string) => {
    if (doc.groups.length <= 1) { fire("Keep at least one capability set"); return; }
    const fallback = doc.groups.find((g) => g.id !== id)!.id;
    patch({
      ...doc,
      groups: doc.groups.filter((g) => g.id !== id),
      capabilities: doc.capabilities.map((c) => (c.group === id ? { ...c, group: fallback } : c)),
      uiSurfaces: doc.uiSurfaces.map((s) => (s.group === id ? { ...s, group: fallback } : s)),
    });
  };
  const addResource = (label: string) => {
    if (!label.trim()) return;
    const id = slug(label);
    if ((doc.resourceTypes ?? []).some((r) => r.id === id)) return;
    patch({ ...doc, resourceTypes: [...(doc.resourceTypes ?? []), { id, label: label.trim() }] });
  };
  const removeResource = (id: string) => patch({ ...doc, resourceTypes: (doc.resourceTypes ?? []).filter((r) => r.id !== id) });

  const groupsSorted = useMemo(() => [...doc.groups].sort((a, b) => a.order - b.order), [doc.groups]);
  const capsByGroup = (gid: string) => doc.capabilities.filter((c) => c.group === gid);
  const surfsByGroup = (gid: string) => doc.uiSurfaces.filter((s) => s.group === gid);

  const actions = canEdit ? (
    <div className="flex items-center gap-2">
      <button type="button" className={btnOutline} onClick={reset} disabled={pending}>↺ Reset defaults</button>
      <button type="button" className={btnPrimary} onClick={save} disabled={pending || !dirty}>{pending ? "Saving…" : "Save catalog"}</button>
    </div>
  ) : null;

  return (
    <div className={embedded ? "space-y-5" : "mx-auto max-w-4xl space-y-5"}>
      {embedded ? (
        canEdit ? (
          <div className="flex flex-wrap items-center justify-end gap-3">
            {actions}
          </div>
        ) : null
      ) : (
        <header className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Access Catalog</h1>
          {actions}
        </header>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
        <span className="rounded-full bg-neutral-100 px-2.5 py-0.5">{doc.provider.kind}/{doc.provider.id}</span>
        {doc.catalogueVersion ? <span className="rounded-full bg-neutral-100 px-2.5 py-0.5">v{doc.catalogueVersion}</span> : null}
        {dirty ? <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-amber-800">Unsaved</span> : null}
        <span>{doc.groups.length} capability sets · {doc.capabilities.length} capabilities · {doc.uiSurfaces.length} surfaces · {(doc.resourceTypes ?? []).length} resource types</span>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-neutral-200">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`rounded-t-lg px-3 py-2 text-sm transition-colors ${tab === t.id ? "border-b-2 border-neutral-900 font-medium text-neutral-900" : "text-neutral-500 hover:text-neutral-800"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "groups" && (
        <div className="space-y-2">
          <p className="text-sm text-neutral-500">Capability sets bucket capabilities and the surfaces they unlock.</p>
          {groupsSorted.map((g) => {
            const caps = capsByGroup(g.id); const surfs = surfsByGroup(g.id); const open = expanded.has(g.id);
            return (
              <div key={g.id} className="overflow-hidden rounded-lg border border-neutral-200">
                <div className="flex items-center gap-3 px-4 py-3">
                  <button type="button" onClick={() => toggleGroup(g.id)} className="text-neutral-500 hover:text-neutral-800" aria-expanded={open}>{open ? "▾" : "▸"}</button>
                  {canEdit
                    ? <input value={g.label} onChange={(e) => renameGroup(g.id, e.target.value)} className={`${input} max-w-xs`} />
                    : <span className="text-sm font-medium text-neutral-800">{g.label}</span>}
                  <span className="font-mono text-xs text-neutral-400">{g.id}</span>
                  <span className="ml-auto text-xs text-neutral-400">{caps.length} caps · {surfs.length} surfaces</span>
                  {canEdit ? <button type="button" onClick={() => removeGroup(g.id)} className="text-xs text-red-600 hover:underline" title="Remove capability set">Remove</button> : null}
                </div>
                {open ? (
                  <div className="space-y-3 border-t border-neutral-200 bg-neutral-50 px-4 py-3 pl-11">
                    <div>
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Capabilities</p>
                      {caps.length ? caps.map((c) => (
                        <div key={c.id} className="flex flex-wrap items-center gap-2 py-0.5 text-sm">
                          <span className="text-neutral-800">{c.label}</span>
                          <span className="font-mono text-xs text-neutral-400">{c.id}</span>
                          {c.reserved ? <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">reserved · {c.reserved}</span> : null}
                          {canEdit ? (
                            <span className="ml-auto flex items-center gap-2">
                              <button type="button" onClick={() => setCapEdit(c)} className="text-xs text-neutral-600 hover:underline">Edit</button>
                              <button type="button" onClick={() => removeCap(c.id)} className="text-xs text-red-600 hover:underline">Delete</button>
                            </span>
                          ) : null}
                        </div>
                      )) : <p className="text-xs text-neutral-400">None in this capability set.</p>}
                      {canEdit ? <button type="button" onClick={() => addCapToGroup(g.id)} className="mt-1.5 rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100">+ Add capability</button> : null}
                    </div>
                    <div>
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Surfaces</p>
                      {surfs.length ? surfs.map((s) => (
                        <div key={s.id} className="flex flex-wrap items-center gap-2 py-0.5 text-sm">
                          <span className="text-neutral-800">{s.label}</span>
                          <span className="font-mono text-xs text-neutral-400">{s.id}</span>
                          <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">{s.kind}</span>
                          {canEdit ? (
                            <span className="ml-auto flex items-center gap-2">
                              <button type="button" onClick={() => setSurfEdit(s)} className="text-xs text-neutral-600 hover:underline">Edit</button>
                              <button type="button" onClick={() => removeSurf(s.id)} className="text-xs text-red-600 hover:underline">Delete</button>
                            </span>
                          ) : null}
                        </div>
                      )) : <p className="text-xs text-neutral-400">None in this capability set.</p>}
                      {canEdit ? <button type="button" onClick={() => addSurfToGroup(g.id)} className="mt-1.5 rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100">+ Add surface</button> : null}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
          {canEdit ? <AddInline placeholder="New capability set label" onAdd={addGroup} /> : null}
        </div>
      )}

      {tab === "capabilities" && (
        <div className="space-y-4">
          {canEdit ? <div className="flex justify-end"><button type="button" className={btnPrimary} onClick={() => setCapEdit("new")}>+ Add capability</button></div> : null}
          {groupsSorted.map((g) => (
            <div key={g.id}>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{g.label}</div>
              <div className="space-y-1.5">
                {capsByGroup(g.id).map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2.5">
                    <span className="min-w-0"><span className="text-sm font-medium text-neutral-800">{c.label}</span> <span className="font-mono text-xs text-neutral-400">{c.id}</span></span>
                    {c.reserved ? <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">reserved · {c.reserved}</span> : null}
                    {c.supportsResourceConstraints ? <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">type-scoped</span> : null}
                    {canEdit ? (
                      <div className="ml-auto flex items-center gap-2">
                        <button type="button" onClick={() => setCapEdit(c)} className="text-xs text-neutral-600 hover:underline">Edit</button>
                        <button type="button" onClick={() => removeCap(c.id)} className="text-xs text-red-600 hover:underline">Delete</button>
                      </div>
                    ) : null}
                  </div>
                ))}
                {capsByGroup(g.id).length === 0 ? <p className="text-xs text-neutral-400">No capabilities in this capability set.</p> : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "surfaces" && (
        <div className="space-y-2">
          {canEdit ? <div className="flex justify-end"><button type="button" className={btnPrimary} onClick={() => setSurfEdit("new")}>+ Add surface</button></div> : null}
          {doc.uiSurfaces.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2.5">
              <span className="min-w-0"><span className="text-sm font-medium text-neutral-800">{s.label}</span> <span className="font-mono text-xs text-neutral-400">{s.id}</span></span>
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">{s.kind}</span>
              <span className="truncate text-xs text-neutral-400">{(s.requiredAnyCapabilities ?? []).length ? (s.requiredAnyCapabilities ?? []).join(", ") : "always"}</span>
              {canEdit ? (
                <div className="ml-auto flex items-center gap-2">
                  <button type="button" onClick={() => setSurfEdit(s)} className="text-xs text-neutral-600 hover:underline">Edit</button>
                  <button type="button" onClick={() => removeSurf(s.id)} className="text-xs text-red-600 hover:underline">Delete</button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {tab === "resources" && (
        <div className="space-y-2">
          <p className="text-sm text-neutral-500">Resource types a capability can be scoped to.</p>
          {(doc.resourceTypes ?? []).map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-lg border border-neutral-200 px-4 py-2.5">
              <span className="text-sm text-neutral-800">{r.label}</span>
              <span className="font-mono text-xs text-neutral-400">{r.id}</span>
              {canEdit ? <button type="button" onClick={() => removeResource(r.id)} className="ml-auto text-xs text-red-600 hover:underline">Remove</button> : null}
            </div>
          ))}
          {(doc.resourceTypes ?? []).length === 0 ? <p className="text-sm text-neutral-400">No resource types.</p> : null}
          {canEdit ? <AddInline placeholder="New resource type label" onAdd={addResource} /> : null}
        </div>
      )}

      {tab === "samples" && (
        <div className="space-y-2">
          {(doc.sampleRoleTemplates ?? []).length === 0 ? (
            <p className="text-sm text-neutral-400">No sample roles in this catalog.</p>
          ) : (doc.sampleRoleTemplates ?? []).map((r) => (
            <div key={r.id} className="rounded-lg border border-neutral-200 px-4 py-3">
              <div className="text-sm font-medium text-neutral-800">{r.name}</div>
              {r.description ? <div className="text-xs text-neutral-500">{r.description}</div> : null}
              <div className="mt-1.5 flex flex-wrap gap-1">
                {r.grants.flatMap((g) => g.capabilityIds).map((cid) => <span key={cid} className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-600">{cid}</span>)}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "json" && <JsonView title="Live catalog document" value={doc} />}
      {tab === "schema" && <JsonView title="JSON Schema" value={schemaJson} />}

      {/* Bottom-of-page guide entry. */}
      <div className="mt-8 flex justify-center border-t border-neutral-200 pt-5">
        <button type="button" className={btnOutline} onClick={() => setGuideOpen(true)}>📘 Access Catalog Guide</button>
      </div>
      {guideOpen ? <AccessCatalogGuide onClose={() => setGuideOpen(false)} /> : null}

      {capEdit && canEdit ? <CapabilityDialog doc={doc} initial={capEdit === "new" ? null : capEdit} defaultGroup={capDefaultGroup} onClose={() => { setCapEdit(null); setCapDefaultGroup(null); }} onSave={upsertCap} /> : null}
      {surfEdit && canEdit ? <SurfaceDialog doc={doc} initial={surfEdit === "new" ? null : surfEdit} defaultGroup={surfDefaultGroup} onClose={() => { setSurfEdit(null); setSurfDefaultGroup(null); }} onSave={upsertSurf} /> : null}

      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white shadow-lg">{toast}</div>
      ) : null}
    </div>
  );
}

function AddInline({ placeholder, onAdd }: { placeholder: string; onAdd: (v: string) => void }) {
  const [v, setV] = useState("");
  return (
    <div className="flex gap-2 pt-1">
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} className={`${input} max-w-xs`} />
      <button type="button" className={btnOutline} disabled={!v.trim()} onClick={() => { onAdd(v); setV(""); }}>+ Add</button>
    </div>
  );
}

function JsonView({ title, value }: { title: string; value: unknown }) {
  const text = JSON.stringify(value, null, 2);
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-2">
        <span className="text-sm font-medium text-neutral-800">{title}</span>
        <button type="button" className={btnOutline} onClick={() => { void navigator.clipboard?.writeText(text); }}>Copy</button>
      </div>
      <pre className="max-h-[60vh] overflow-auto p-4 text-xs leading-relaxed"><code>{text}</code></pre>
    </div>
  );
}

/**
 * Access Catalog Guide — static, non-editable explainer of the whole model.
 * Same canonical copy shown by the console/learning guides.
 */
function AccessCatalogGuide({ onClose }: { onClose: () => void }) {
  const H = ({ children }: { children: React.ReactNode }) => (
    <h4 className="mt-5 text-sm font-semibold text-neutral-900">{children}</h4>
  );
  const P = ({ children }: { children: React.ReactNode }) => (
    <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">{children}</p>
  );
  const Code = ({ children }: { children: React.ReactNode }) => (
    <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[12px] text-neutral-800">{children}</code>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(11,18,32,0.4)" }}>
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="mb-2 text-base font-semibold text-neutral-900">📘 Access Catalog Guide</h3>
        <P>
          The Access Catalog is the <strong>inventory</strong> of everything that can be permission-controlled at
          this level. It does not assign anyone — it defines the vocabulary that <em>roles</em> are built from.
          Roles bind to items in here; people get roles.
        </P>

        <H>The three building blocks</H>
        <P>
          <strong>1. Capabilities</strong> — the atomic units of permission (e.g. <Code>nexus.audit.view</Code>).
          A role is, underneath, just a <strong>set of capability ids</strong>. Capabilities are the only thing
          actually granted and enforced.
        </P>
        <P>
          <strong>2. Capability sets</strong> — labeled folders that bucket related capabilities (and surfaces). Their job
          is twofold: they tidy the UI, and each set can back <strong>one coarse toggle</strong> in the role
          builder — flipping that toggle on seeds every capability in the set onto the role. Capability sets are never
          stored on a role; they’re the design-time bridge between the simple toggle and the underlying capabilities.
        </P>
        <P>
          <strong>3. Surfaces</strong> — the UI a capability unlocks (a nav tab, screen, or action), each with{" "}
          <Code>requiredAnyCapabilities</Code>. Holding one of those capabilities reveals the surface; lacking them
          hides it. This is what makes “turn a capability off → the tab disappears” work.
        </P>
        <P>
          <strong>Resource types</strong> scope a capability to kinds of objects (enforcement is still being layered
          in), and <strong>sample roles</strong> are starter bundles of capabilities.
        </P>

        <H>How a role is actually built</H>
        <P>
          A saved role stores two things — and a capability-set id is in neither: a set of <strong>coarse area levels</strong>{" "}
          (No / View / Edit, or No / Partial / Full for platforms) and a flat list of <strong>capability ids</strong>.
          Setting an area’s coarse level is a preset: the top level seeds every capability in that area’s set;
          “Partial” lets you hand-pick a subset. The capability list is the <strong>enforced source of truth</strong> —
          the backend validates it against this catalog and drops anything not in the inventory.
        </P>

        <H>Reserved (structural) capabilities</H>
        <P>
          A capability marked <Code>reserved</Code> is held implicitly by a structural tier — a Super Admin / owner,
          a full operator, or a program admin — and can <strong>never</strong> be granted to a custom role. Those
          tiers bypass the catalog and hold everything; the reserved flag just hides such a capability from the role
          builder so no one can hand it out.
        </P>

        <H>Per-level catalogs</H>
        <P>
          Each level has its own catalog: the platform (Nexus), each organization, each program, and each runtime
          (Content Studio, Bridge). An org/program starts from the shipped default and only diverges once you edit it
          (a “·edited” marker appears). Editing one level never touches another.
        </P>

        <H>Adding a new feature end-to-end</H>
        <P>
          1) Add a <strong>capability</strong> to a capability set here; 2) add a <strong>surface</strong> for the UI it
          unlocks; 3) the role builder’s toggle for that set now grants it; 4) the nav/screen gated by that surface
          appears for anyone who holds it. A brand-new capability set is purely organizational until a role-builder area is
          wired to it — that wiring is what turns a set into a working, grantable feature.
        </P>

        <H>Editing here</H>
        <P>
          Use the <strong>Capability Sets</strong> tab to add capabilities/surfaces inline within a set, or the dedicated{" "}
          <strong>Capabilities</strong> / <strong>Surfaces</strong> tabs. <strong>Save catalog</strong> persists your
          changes for this level; <strong>Reset defaults</strong> restores the shipped catalog. The{" "}
          <strong>Export JSON</strong> and <strong>JSON Schema</strong> tabs show the live document and the shape it
          must follow.
        </P>

        <div className="mt-5 flex justify-end">
          <button type="button" className={btnPrimary} onClick={onClose}>Got it</button>
        </div>
      </div>
    </div>
  );
}

function Modal({ title, children, footer }: { title: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(11,18,32,0.4)" }}>
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="mb-3 text-base font-semibold text-neutral-900">{title}</h3>
        <div className="space-y-3">{children}</div>
        <div className="mt-4 flex justify-end gap-2">{footer}</div>
      </div>
    </div>
  );
}

function CapabilityDialog({ doc, initial, defaultGroup, onClose, onSave }: { doc: BridgeCatalogue; initial: BridgeCapability | null; defaultGroup?: string | null; onClose: () => void; onSave: (c: BridgeCapability) => void }) {
  const [id, setId] = useState(initial?.id ?? "");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [group, setGroup] = useState(initial?.group ?? defaultGroup ?? doc.groups[0]?.id ?? "");
  const [reserved, setReserved] = useState<BridgeReservedTier | "none">(initial?.reserved ?? "none");
  const [typeScoped, setTypeScoped] = useState(!!initial?.supportsResourceConstraints);
  const effId = initial ? initial.id : (id.trim() || slug(label));
  return (
    <Modal
      title={initial ? `Edit · ${initial.id}` : "Add capability"}
      footer={<>
        <button type="button" className={btnOutline} onClick={onClose}>Cancel</button>
        <button type="button" className={btnPrimary} disabled={!effId || !label.trim()} onClick={() => onSave({ id: effId, label: label.trim(), group, reserved: reserved === "none" ? undefined : reserved, supportsResourceConstraints: typeScoped || undefined })}>Save</button>
      </>}
    >
      {!initial ? <div><label className="mb-1 block text-xs font-medium text-neutral-600">Capability id</label><input value={id} onChange={(e) => setId(e.target.value)} placeholder={slug(label) || "e.g. bridge.kb.edit"} className={input} /></div> : null}
      <div><label className="mb-1 block text-xs font-medium text-neutral-600">Label</label><input value={label} onChange={(e) => setLabel(e.target.value)} className={input} /></div>
      <div><label className="mb-1 block text-xs font-medium text-neutral-600">Capability set</label>
        <select value={group} onChange={(e) => setGroup(e.target.value)} className={input}>{doc.groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</select>
      </div>
      <div><label className="mb-1 block text-xs font-medium text-neutral-600">Reserved to tier (hidden from custom roles)</label>
        <select value={reserved} onChange={(e) => setReserved(e.target.value as BridgeReservedTier | "none")} className={input}>{RESERVED.map((r) => <option key={r} value={r}>{r === "none" ? "Grantable (not reserved)" : r}</option>)}</select>
      </div>
      <label className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2 text-sm">
        <span>Type-scoped (restrictable to resource types)</span>
        <input type="checkbox" checked={typeScoped} onChange={(e) => setTypeScoped(e.target.checked)} />
      </label>
    </Modal>
  );
}

function SurfaceDialog({ doc, initial, defaultGroup, onClose, onSave }: { doc: BridgeCatalogue; initial: BridgeUiSurface | null; defaultGroup?: string | null; onClose: () => void; onSave: (s: BridgeUiSurface) => void }) {
  const [id, setId] = useState(initial?.id ?? "");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [kind, setKind] = useState<BridgeUiSurfaceKind>(initial?.kind ?? "navigation");
  const [group, setGroup] = useState(initial?.group ?? defaultGroup ?? doc.groups[0]?.id ?? "");
  const [route, setRoute] = useState(initial?.routeOrComponent ?? "");
  const [req, setReq] = useState<Set<string>>(new Set(initial?.requiredAnyCapabilities ?? []));
  const effId = initial ? initial.id : (id.trim() || slug(label));
  const toggle = (cid: string) => setReq((s) => { const n = new Set(s); n.has(cid) ? n.delete(cid) : n.add(cid); return n; });
  return (
    <Modal
      title={initial ? `Edit · ${initial.id}` : "Add surface"}
      footer={<>
        <button type="button" className={btnOutline} onClick={onClose}>Cancel</button>
        <button type="button" className={btnPrimary} disabled={!effId || !label.trim()} onClick={() => onSave({ id: effId, label: label.trim(), kind, group, routeOrComponent: route.trim() || undefined, requiredAnyCapabilities: [...req] })}>Save</button>
      </>}
    >
      {!initial ? <div><label className="mb-1 block text-xs font-medium text-neutral-600">Surface id</label><input value={id} onChange={(e) => setId(e.target.value)} placeholder={slug(label) || "e.g. kb"} className={input} /></div> : null}
      <div><label className="mb-1 block text-xs font-medium text-neutral-600">Label</label><input value={label} onChange={(e) => setLabel(e.target.value)} className={input} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="mb-1 block text-xs font-medium text-neutral-600">Kind</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as BridgeUiSurfaceKind)} className={input}>{SURFACE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select>
        </div>
        <div><label className="mb-1 block text-xs font-medium text-neutral-600">Capability set</label>
          <select value={group} onChange={(e) => setGroup(e.target.value)} className={input}>{doc.groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</select>
        </div>
      </div>
      <div><label className="mb-1 block text-xs font-medium text-neutral-600">Route / component</label><input value={route} onChange={(e) => setRoute(e.target.value)} placeholder="/bridge/kb" className={input} /></div>
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-600">Required capabilities (any one unlocks)</label>
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-neutral-200 p-2">
          {doc.capabilities.map((c) => (
            <label key={c.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-neutral-50">
              <input type="checkbox" checked={req.has(c.id)} onChange={() => toggle(c.id)} />
              <span className="font-mono text-xs text-neutral-500">{c.id}</span>
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
}

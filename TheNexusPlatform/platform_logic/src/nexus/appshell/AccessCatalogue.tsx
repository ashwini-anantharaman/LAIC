/**
 * App Studio Access Catalogue — the capability catalogue the App Studio
 * application publishes, presented in the console at the program's App Studios
 * tab. This is the governing level: the catalogue decides what people can see
 * and do inside the App Studio, so it lives with the admin who grants
 * that access — never inside the Studio itself.
 *
 * Mirrors the Content Studio's Access Catalogue editor: groups embed their
 * capabilities and UI surfaces; the Capabilities tab classifies capabilities
 * under the predefined groups; capabilities and groups can be added and
 * removed. Capability IDs are the stable enforcement contract — set once at
 * creation, never renamed (programs grant these; they cannot invent new ids).
 *
 * The v1 baseline is a copy of the document the App Studio ships
 * (app_shell/docs/access/app-shell-access-catalogue.v1.json). Edits persist
 * locally; "Reset v1 defaults" restores the published baseline.
 */
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
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
import { cn } from "@/app/components/ui/utils";
import { Pill } from "@/nexus/ui/kit";
import { ConfirmButton } from "@/nexus/ui/ConfirmButton";
import catalogueV1 from "./app-shell-access-catalogue.v1.json";

/* ---------- catalogue types (subset of laic-access-control.schema.json) ---------- */

interface Capability {
  id: string;
  label: string;
  description?: string;
  group: string;
  resourceTypes?: string[];
  supportsResourceConstraints?: boolean;
}
interface ResourceType {
  id: string;
  label: string;
  description?: string;
  constraintFields?: string[];
}
interface UiSurface {
  id: string;
  label: string;
  kind: string;
  group?: string;
  routeOrComponent?: string;
  requiredAnyCapabilities?: string[];
  requiredAllCapabilities?: string[];
}
interface CatalogueGroup {
  id: string;
  label: string;
  description?: string;
  order: number;
  capabilityIds?: string[];
  uiSurfaceIds?: string[];
}
interface SampleRole {
  id: string;
  name: string;
  description?: string;
  grants: { platformInstanceId: string; capabilityIds: string[] }[];
}
interface Catalogue {
  $schema?: string;
  schemaVersion: string;
  documentType: string;
  id: string;
  name: string;
  description?: string;
  provider: { kind: string; id: string };
  catalogueVersion: string;
  capabilities: Capability[];
  resourceTypes: ResourceType[];
  uiSurfaces: UiSurface[];
  groups: CatalogueGroup[];
  sampleRoleTemplates?: SampleRole[];
}

const STORAGE_KEY = "nexus.appshell.access.catalogue";
const defaults = catalogueV1 as unknown as Catalogue;

/** Schema id rule: lowercase segments joined by . _ - */
const ID_RE = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[^a-z]+/, "");
}

function loadCatalogue(): Catalogue {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaults);
    const c = JSON.parse(raw) as Catalogue;
    return c.documentType === "capability_catalogue" && Array.isArray(c.capabilities)
      ? c
      : structuredClone(defaults);
  } catch {
    return structuredClone(defaults);
  }
}

/* ---------- small atoms ---------- */

function Code({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <code className={cn("rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground", className)}>
      {children}
    </code>
  );
}

/** Click-to-edit text. Commits on blur / Enter, cancels on Escape. */
function EditableText({
  value,
  onCommit,
  className,
  placeholder,
}: {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (!editing) {
    return (
      <span
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className={cn("cursor-text rounded px-0.5 hover:bg-muted", className)}
        title="Click to edit"
      >
        {value || <span className="text-muted-foreground/50">{placeholder ?? "—"}</span>}
      </span>
    );
  }
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
      className={cn("rounded border border-input bg-background px-1 py-0.5 outline-none", className)}
      style={{ minWidth: 180 }}
    />
  );
}

/* ---------- the panel ---------- */

type Tab = "groups" | "capabilities" | "surfaces" | "resources" | "roles" | "json";

const TABS: [Tab, string][] = [
  ["groups", "Groups"],
  ["capabilities", "Capabilities"],
  ["surfaces", "UI surfaces"],
  ["resources", "Resource types"],
  ["roles", "Sample roles"],
  ["json", "Export JSON"],
];

export function AppShellAccessCatalogue() {
  const [cat, setCat] = useState<Catalogue>(loadCatalogue);
  const [tab, setTab] = useState<Tab>("groups");
  const [dirty, setDirty] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [addCapOpen, setAddCapOpen] = useState(false);
  const [addGroupOpen, setAddGroupOpen] = useState(false);

  const update = (fn: (c: Catalogue) => void) => {
    setCat((c) => {
      const next = structuredClone(c);
      fn(next);
      return next;
    });
    setDirty(true);
  };

  const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cat));
    setDirty(false);
    toast.success("Access catalogue saved");
  };

  const reset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setCat(structuredClone(defaults));
    setDirty(false);
    toast.success("Restored the published v1 defaults");
  };

  const exportJson = useMemo(() => JSON.stringify(cat, null, 2), [cat]);
  const capById = useMemo(() => new Map(cat.capabilities.map((c) => [c.id, c])), [cat.capabilities]);
  const surfaceById = useMemo(() => new Map(cat.uiSurfaces.map((s) => [s.id, s])), [cat.uiSurfaces]);
  const groupsSorted = useMemo(() => [...cat.groups].sort((a, b) => a.order - b.order), [cat.groups]);

  /** Remove a capability everywhere it is referenced — groups, roles, surfaces. */
  const deleteCapability = (id: string) =>
    update((c) => {
      c.capabilities = c.capabilities.filter((x) => x.id !== id);
      for (const g of c.groups) g.capabilityIds = (g.capabilityIds ?? []).filter((x) => x !== id);
      for (const r of c.sampleRoleTemplates ?? [])
        for (const gr of r.grants) gr.capabilityIds = gr.capabilityIds.filter((x) => x !== id);
      for (const s of c.uiSurfaces) {
        if (s.requiredAnyCapabilities) s.requiredAnyCapabilities = s.requiredAnyCapabilities.filter((x) => x !== id);
        if (s.requiredAllCapabilities) s.requiredAllCapabilities = s.requiredAllCapabilities.filter((x) => x !== id);
      }
    });

  // Warn before the tab is closed with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const stats: [number, string][] = [
    [cat.groups.length, "Groups"],
    [cat.capabilities.length, "Capabilities"],
    [cat.uiSurfaces.length, "UI surfaces"],
    [cat.resourceTypes.length, "Resource types"],
    [cat.sampleRoleTemplates?.length ?? 0, "Sample roles"],
  ];

  const capabilityRow = (c: Capability) => (
    <div key={c.id} className="flex items-start gap-2 border-t border-border/40 py-2.5 first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-sm text-foreground">
          <EditableText
            value={c.label}
            onCommit={(v) =>
              update((x) => {
                const cap = x.capabilities.find((y) => y.id === c.id);
                if (cap) {
                  cap.label = v;
                  cap.description = v;
                }
              })
            }
          />
          <Code>{c.id}</Code>
          {c.supportsResourceConstraints && <Pill tone="warn">constrained</Pill>}
        </div>
        {(c.resourceTypes ?? []).length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {(c.resourceTypes ?? []).map((rt) => (
              <span key={rt} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                {rt}
              </span>
            ))}
          </div>
        )}
      </div>
      <ConfirmButton
        title={`Delete "${c.label}"?`}
        description={`Removes ${c.id} from the catalogue, its group, every sample role that grants it, and every UI surface that requires it. Roles in live policies that reference it would stop resolving — deprecate rather than delete once programs depend on it.`}
        actionLabel="Delete capability"
        buttonTitle="Delete this capability"
        onConfirm={() => deleteCapability(c.id)}
      >
        <Trash2 className="size-4 text-muted-foreground" />
      </ConfirmButton>
    </div>
  );

  return (
    <div>
      {/* document header */}
      <div className="glass-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <Pill>{cat.documentType}</Pill>
              <Pill tone="accent">
                {cat.id} · v{cat.catalogueVersion}
              </Pill>
              <Pill>
                {cat.provider.kind}/{cat.provider.id}
              </Pill>
            </div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">{cat.name}</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{cat.description}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ConfirmReset onConfirm={reset} />
            <Button size="sm" onClick={save} disabled={!dirty}>
              <Save className="size-4" /> Save catalogue
            </Button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {stats.map(([n, label]) => (
            <div key={label} className="rounded-lg bg-muted/50 px-3 py-2 text-center">
              <div className="text-xl font-semibold tabular-nums text-foreground">{n}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* section tabs */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {TABS.map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              tab === t ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ---- groups ---- */}
      {tab === "groups" && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Catalogue groups organize the role UI. Capabilities are the enforcement keys; UI surfaces are optional.
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setOpenGroups(Object.fromEntries(cat.groups.map((g) => [g.id, true])))}
              >
                Expand all
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setOpenGroups(Object.fromEntries(cat.groups.map((g) => [g.id, false])))}
              >
                Collapse all
              </Button>
              <Button size="sm" onClick={() => setAddGroupOpen(true)}>
                <Plus className="size-4" /> Add group
              </Button>
            </div>
          </div>
          <div className="mt-3 space-y-3">
            {groupsSorted.map((g) => {
              const open = openGroups[g.id] ?? true;
              const empty = (g.capabilityIds ?? []).length === 0 && (g.uiSurfaceIds ?? []).length === 0;
              return (
                <div key={g.id} className="glass-card overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                    <button
                      onClick={() => setOpenGroups((o) => ({ ...o, [g.id]: !open }))}
                      className="flex items-center gap-2 text-left"
                    >
                      {open ? (
                        <ChevronDown className="size-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="size-4 text-muted-foreground" />
                      )}
                      <Pill>group</Pill>
                      <span className="text-sm font-semibold text-foreground">{g.label}</span>
                      <Code>{g.id}</Code>
                      <span className="text-xs text-muted-foreground">order {g.order}</span>
                    </button>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      {g.capabilityIds?.length ?? 0} capabilities · {g.uiSurfaceIds?.length ?? 0} UI surfaces
                      {empty && (
                        <ConfirmButton
                          title={`Delete group "${g.label}"?`}
                          description="The group is empty — removing it only removes the section from the role UI."
                          actionLabel="Delete group"
                          buttonTitle="Delete this empty group"
                          onConfirm={() =>
                            update((c) => {
                              c.groups = c.groups.filter((x) => x.id !== g.id);
                            })
                          }
                        >
                          <Trash2 className="size-4 text-muted-foreground" />
                        </ConfirmButton>
                      )}
                    </span>
                  </div>
                  {open && (
                    <div className="border-t border-border/60 px-4 py-3">
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                        Capabilities
                      </p>
                      {(g.capabilityIds ?? []).length === 0 && (
                        <p className="py-1 text-xs text-muted-foreground/60">No capabilities yet</p>
                      )}
                      {(g.capabilityIds ?? []).map((id) => {
                        const c = capById.get(id);
                        return c ? capabilityRow(c) : null;
                      })}
                      <p className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                        UI surfaces
                      </p>
                      {(g.uiSurfaceIds ?? []).length === 0 && (
                        <p className="py-1 text-xs text-muted-foreground/60">No UI surfaces mapped</p>
                      )}
                      {(g.uiSurfaceIds ?? []).map((sid) => {
                        const s = surfaceById.get(sid);
                        return (
                          <div
                            key={sid}
                            className="flex items-center gap-2 border-t border-border/40 py-2 first:border-t-0"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-sm text-foreground">
                                <EditableText
                                  value={s?.label ?? sid}
                                  onCommit={(v) =>
                                    update((x) => {
                                      const su = x.uiSurfaces.find((y) => y.id === sid);
                                      if (su) su.label = v;
                                    })
                                  }
                                />
                              </div>
                              <Code>{sid}</Code>
                            </div>
                            <Pill tone="accent">{s?.kind}</Pill>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- capabilities, classified under the predefined groups ---- */}
      {tab === "capabilities" && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Authoritative enforcement keys. Programs grant these; they cannot invent new ids.
            </p>
            <Button size="sm" onClick={() => setAddCapOpen(true)}>
              <Plus className="size-4" /> Add capability
            </Button>
          </div>
          <div className="mt-3 space-y-3">
            {groupsSorted.map((g) => (
              <div key={g.id} className="glass-card px-4 py-3">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                  {g.label} · {g.capabilityIds?.length ?? 0}
                </p>
                {(g.capabilityIds ?? []).length === 0 && (
                  <p className="py-1 text-xs text-muted-foreground/60">No capabilities yet</p>
                )}
                {(g.capabilityIds ?? []).map((id) => {
                  const c = capById.get(id);
                  return c ? capabilityRow(c) : null;
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- UI surfaces ---- */}
      {tab === "surfaces" && (
        <div className="mt-3">
          <p className="text-xs text-muted-foreground">
            Optional mappings from capabilities to navigation, screens, components, and actions. Not the security
            boundary.
          </p>
          <div className="glass-card mt-3 divide-y divide-border/40 px-4">
            {cat.uiSurfaces.map((s) => (
              <div key={s.id} className="py-2.5">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1 text-sm text-foreground">
                    <EditableText
                      value={s.label}
                      onCommit={(v) =>
                        update((x) => {
                          const su = x.uiSurfaces.find((y) => y.id === s.id);
                          if (su) su.label = v;
                        })
                      }
                    />
                  </div>
                  <Pill tone="accent">{s.kind}</Pill>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <Code>{s.id}</Code>
                  {s.routeOrComponent && <span className="text-xs text-muted-foreground">{s.routeOrComponent}</span>}
                  {(s.requiredAnyCapabilities ?? []).map((id) => (
                    <Code key={id} className="text-emerald-600 dark:text-emerald-400">
                      {id}
                    </Code>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- resource types ---- */}
      {tab === "resources" && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            Protected resource types and fields usable in grant constraints.
          </p>
          {cat.resourceTypes.map((r) => (
            <div key={r.id} className="glass-card p-4">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <EditableText
                  value={r.label}
                  onCommit={(v) =>
                    update((x) => {
                      const rt = x.resourceTypes.find((y) => y.id === r.id);
                      if (rt) {
                        rt.label = v;
                        rt.description = v;
                      }
                    })
                  }
                />
                <Code>{r.id}</Code>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {(r.constraintFields ?? []).map((f) => (
                  <Code key={f} className="text-primary">
                    {f}
                  </Code>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---- sample roles ---- */}
      {tab === "roles" && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            Optional templates. Live roles and assignments are defined in the program's Team &amp; Roles.
          </p>
          {(cat.sampleRoleTemplates ?? []).map((role) => {
            const granted = new Set(role.grants[0]?.capabilityIds ?? []);
            return (
              <div key={role.id} className="glass-card p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <EditableText
                    value={role.name}
                    onCommit={(v) =>
                      update((x) => {
                        const t = x.sampleRoleTemplates?.find((y) => y.id === role.id);
                        if (t) t.name = v;
                      })
                    }
                  />
                  <Pill>template</Pill>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <EditableText
                    value={role.description ?? ""}
                    placeholder="description"
                    onCommit={(v) =>
                      update((x) => {
                        const t = x.sampleRoleTemplates?.find((y) => y.id === role.id);
                        if (t) t.description = v;
                      })
                    }
                  />
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground/60">
                  instance: {role.grants[0]?.platformInstanceId}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {cat.capabilities.map((c) => {
                    const on = granted.has(c.id);
                    return (
                      <button
                        key={c.id}
                        title={on ? "Click to remove from this role" : "Click to grant to this role"}
                        onClick={() =>
                          update((x) => {
                            const t = x.sampleRoleTemplates?.find((y) => y.id === role.id);
                            const grant = t?.grants[0];
                            if (!grant) return;
                            grant.capabilityIds = on
                              ? grant.capabilityIds.filter((id) => id !== c.id)
                              : [...grant.capabilityIds, c.id];
                          })
                        }
                        className={cn(
                          "rounded border px-1.5 py-0.5 font-mono text-[11px] transition-colors",
                          on
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "border-border/60 bg-muted/40 text-muted-foreground/60 hover:text-muted-foreground",
                        )}
                      >
                        {c.id}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ---- export JSON ---- */}
      {tab === "json" && (
        <div className="glass-card mt-3 overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-2">
            <span className="text-xs text-muted-foreground">
              {cat.id}-catalogue.v{cat.catalogueVersion}.json — validates against laic-access-control.schema.json
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(exportJson);
                  toast.success("Catalogue JSON copied");
                }}
              >
                Copy
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(new Blob([exportJson], { type: "application/json" }));
                  a.download = `${cat.id}-catalogue.v${cat.catalogueVersion}.json`;
                  a.click();
                  URL.revokeObjectURL(a.href);
                }}
              >
                <Download className="size-4" /> Download
              </Button>
            </div>
          </div>
          <pre className="max-h-[50vh] overflow-auto p-4 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {exportJson}
          </pre>
        </div>
      )}

      <AddCapabilityDialog
        open={addCapOpen}
        onClose={() => setAddCapOpen(false)}
        catalogue={cat}
        onAdd={(cap) => {
          update((c) => {
            c.capabilities.push(cap);
            const g = c.groups.find((x) => x.id === cap.group);
            if (g) g.capabilityIds = [...(g.capabilityIds ?? []), cap.id];
          });
          toast.success(`Capability ${cap.id} added`);
        }}
      />
      <AddGroupDialog
        open={addGroupOpen}
        onClose={() => setAddGroupOpen(false)}
        catalogue={cat}
        onAdd={(g) => {
          update((c) => {
            c.groups.push(g);
          });
          setOpenGroups((o) => ({ ...o, [g.id]: true }));
          toast.success(`Group ${g.id} added`);
        }}
      />
    </div>
  );
}

/* ---------- add-capability dialog ---------- */

function AddCapabilityDialog({
  open,
  onClose,
  catalogue,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  catalogue: Catalogue;
  onAdd: (cap: Capability) => void;
}) {
  const [label, setLabel] = useState("");
  const [id, setId] = useState("");
  const [idTouched, setIdTouched] = useState(false);
  const [group, setGroup] = useState("");
  const [resourceTypes, setResourceTypes] = useState<string[]>([]);

  // Suggest an id from the label until the id field is edited by hand.
  const suggestedId = label ? `appshell.${slugify(label)}` : "";
  const effectiveId = idTouched ? id : suggestedId;
  const effectiveGroup = group || catalogue.groups[0]?.id || "";

  const idError = !effectiveId
    ? "id is required"
    : !ID_RE.test(effectiveId)
      ? "lowercase segments joined by . _ - (e.g. appshell.config.edit)"
      : catalogue.capabilities.some((c) => c.id === effectiveId)
        ? "this id already exists"
        : null;
  const canAdd = label.trim().length > 0 && !idError && !!effectiveGroup;

  const closeAndClear = () => {
    setLabel("");
    setId("");
    setIdTouched(false);
    setGroup("");
    setResourceTypes([]);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && closeAndClear()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add capability</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cap-label">Label</Label>
            <Input
              id="cap-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Configure app notifications"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cap-id">Capability id (stable contract — cannot be renamed later)</Label>
            <Input
              id="cap-id"
              value={effectiveId}
              onChange={(e) => {
                setId(e.target.value);
                setIdTouched(true);
              }}
              placeholder="appshell.notifications.configure"
              className="font-mono text-xs"
            />
            {effectiveId && idError && <p className="text-xs text-red-500">{idError}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Group</Label>
            <Select value={effectiveGroup} onValueChange={setGroup}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a group" />
              </SelectTrigger>
              <SelectContent>
                {[...catalogue.groups]
                  .sort((a, b) => a.order - b.order)
                  .map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Resource types (optional — selecting any makes the capability constrainable)</Label>
            <div className="flex flex-wrap gap-1.5">
              {catalogue.resourceTypes.map((rt) => {
                const on = resourceTypes.includes(rt.id);
                return (
                  <button
                    key={rt.id}
                    type="button"
                    onClick={() =>
                      setResourceTypes((xs) => (on ? xs.filter((x) => x !== rt.id) : [...xs, rt.id]))
                    }
                    className={cn(
                      "rounded border px-2 py-1 font-mono text-[11px] transition-colors",
                      on
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border/60 bg-muted/40 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {rt.id}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={closeAndClear}>
            Cancel
          </Button>
          <Button
            disabled={!canAdd}
            onClick={() => {
              onAdd({
                id: effectiveId,
                label: label.trim(),
                description: label.trim(),
                group: effectiveGroup,
                ...(resourceTypes.length > 0
                  ? { resourceTypes: [...resourceTypes], supportsResourceConstraints: true }
                  : {}),
              });
              closeAndClear();
            }}
          >
            <Plus className="size-4" /> Add capability
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- add-group dialog ---------- */

function AddGroupDialog({
  open,
  onClose,
  catalogue,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  catalogue: Catalogue;
  onAdd: (g: CatalogueGroup) => void;
}) {
  const [label, setLabel] = useState("");
  const [id, setId] = useState("");
  const [idTouched, setIdTouched] = useState(false);
  const [description, setDescription] = useState("");

  const suggestedId = slugify(label);
  const effectiveId = idTouched ? id : suggestedId;

  const idError = !effectiveId
    ? "id is required"
    : !ID_RE.test(effectiveId)
      ? "lowercase segments joined by . _ -"
      : catalogue.groups.some((g) => g.id === effectiveId)
        ? "this id already exists"
        : null;
  const canAdd = label.trim().length > 0 && !idError;

  const closeAndClear = () => {
    setLabel("");
    setId("");
    setIdTouched(false);
    setDescription("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && closeAndClear()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add group</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="grp-label">Label</Label>
            <Input
              id="grp-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Notifications"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="grp-id">Group id</Label>
            <Input
              id="grp-id"
              value={effectiveId}
              onChange={(e) => {
                setId(e.target.value);
                setIdTouched(true);
              }}
              placeholder="notifications"
              className="font-mono text-xs"
            />
            {effectiveId && idError && <p className="text-xs text-red-500">{idError}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="grp-desc">Description (optional)</Label>
            <Input
              id="grp-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this group covers"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={closeAndClear}>
            Cancel
          </Button>
          <Button
            disabled={!canAdd}
            onClick={() => {
              onAdd({
                id: effectiveId,
                label: label.trim(),
                ...(description.trim() ? { description: description.trim() } : {}),
                order: Math.max(0, ...catalogue.groups.map((g) => g.order)) + 1,
                capabilityIds: [],
                uiSurfaceIds: [],
              });
              closeAndClear();
            }}
          >
            <Plus className="size-4" /> Add group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Reset needs an explicit confirm — it discards local edits. */
function ConfirmReset({ onConfirm }: { onConfirm: () => void }) {
  const [arm, setArm] = useState(false);
  useEffect(() => {
    if (!arm) return;
    const t = setTimeout(() => setArm(false), 3000);
    return () => clearTimeout(t);
  }, [arm]);
  return (
    <Button
      size="sm"
      variant={arm ? "destructive" : "outline"}
      onClick={() => {
        if (arm) {
          onConfirm();
          setArm(false);
        } else {
          setArm(true);
        }
      }}
    >
      <RotateCcw className="size-4" /> {arm ? "Really reset?" : "Reset v1 defaults"}
    </Button>
  );
}

/**
 * Org space → Programs. Create programs and enter their workspace. Each row
 * carries the org-altitude "assign administrator" affordance (§3.5) — an org
 * admin names who runs a program without having to manage that program's
 * internal roles (that's the assigned admin's own job, done from Team & Roles).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { ChevronLeft, ChevronRight, Copy, Handshake, ImageIcon, Layers, LayoutGrid, Lock, Plus, SlidersHorizontal, Trash2, UserCog, X } from "lucide-react";
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
import {
  assignProgramAdministrator,
  createPartner,
  createProgram,
  deleteProgram,
  getOrgCapabilities,
  listOrgCategories,
  listProgramAdministrators,
  listPrograms,
  removeMember,
  removeProgramCover,
  revokeInvitation,
  updateProgramCategories,
  updateProgramFeatures,
  uploadProgramCover,
  type CategoryNode,
  type MemberEnrollResult,
  type OrgCapabilities,
  type ProgramAdministrator,
} from "@/services/api";
import { FeatureAccessControls, type FeatureAccessMap } from "@/nexus/access/FeatureAccess";
import type { Program, ProgramCategory, ProgramFeatures } from "@/types/platform";
import { DEFAULT_PROGRAM_FEATURES, PROGRAM_FEATURES } from "@/types/platform";
import { resolveAssetUrl } from "@/services/apiBase";
import { EmptyState, PageHeader, Pill, Spinner } from "@/nexus/ui/kit";
import { ConfirmButton } from "@/nexus/ui/ConfirmButton";

type ProgramsView = "grid" | "stack";

export function Programs() {
  const { orgId = "" } = useParams();
  const [programs, setPrograms] = useState<Program[] | null>(null);
  const [caps, setCaps] = useState<OrgCapabilities | null>(null);
  const [open, setOpen] = useState(false);
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [assigning, setAssigning] = useState<Program | null>(null);
  const [editingFeatures, setEditingFeatures] = useState<Program | null>(null);
  // Grid shows everything (category tag on each card); stack groups by
  // category and drills in. Same interaction as the theme toggle: the button
  // wears the OTHER view's icon.
  const [view, setView] = useState<ProgramsView>(
    () => (localStorage.getItem("nexus_programs_view") as ProgramsView) || "grid",
  );
  const [openCategory, setOpenCategory] = useState<string | null>(null);

  function switchView(v: ProgramsView) {
    setView(v);
    localStorage.setItem("nexus_programs_view", v);
    setOpenCategory(null);
  }

  const [orgCategories, setOrgCategories] = useState<CategoryNode[]>([]);
  useEffect(() => {
    listOrgCategories(orgId).then(setOrgCategories).catch(() => setOrgCategories([]));
  }, [orgId]);
  // Flat category NAMES (for the primary/secondary pickers in the dialogs), with
  // any legacy program primaries unioned in so nothing disappears.
  const categories = useMemo(
    () =>
      [...new Set([...orgCategories.map((c) => c.name), ...(programs ?? []).map((p) => p.category)])].sort((a, b) =>
        a.localeCompare(b),
      ),
    [orgCategories, programs],
  );
  // The stack view is a folder tree: categories nest, and a program lives under
  // its PRIMARY category. `parentOf` drives drill-down + subtree program counts.
  const parentOf = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const c of orgCategories) m.set(c.name, c.parent);
    for (const name of categories) if (!m.has(name)) m.set(name, null); // legacy primaries → roots
    return m;
  }, [orgCategories, categories]);
  const childrenOf = useMemo(() => {
    const m = new Map<string | null, string[]>();
    for (const name of categories) {
      const p = parentOf.get(name) ?? null;
      m.set(p, [...(m.get(p) ?? []), name]);
    }
    for (const [, kids] of m) kids.sort((a, b) => a.localeCompare(b));
    return m;
  }, [categories, parentOf]);
  // Programs whose primary is `cat` or any descendant category (folder count).
  const subtreeProgramCount = useMemo(() => {
    return (cat: string): number => {
      const seen = new Set<string>([cat]);
      const stack = [cat];
      while (stack.length) { const cur = stack.pop()!; for (const ch of childrenOf.get(cur) ?? []) if (!seen.has(ch)) { seen.add(ch); stack.push(ch); } }
      return (programs ?? []).filter((p) => seen.has(p.category)).length;
    };
  }, [childrenOf, programs]);
  const parentCategory = openCategory ? parentOf.get(openCategory) ?? null : null;

  async function load() {
    setPrograms(await listPrograms(orgId));
  }
  useEffect(() => {
    void load();
    getOrgCapabilities(orgId).then(setCaps).catch(() => setCaps(null));
  }, [orgId]);

  // Feature-areas the Nexus envelope allows this org — anything off is gone
  // from the per-program Features dialogs entirely.
  const allowedFeatureKeys = PROGRAM_FEATURES.map((f) => f.key).filter(
    (k) => !caps || caps.features[k] !== false,
  );

  // Nexus envelope: may org admins enter this org's programs at all? When off,
  // program cards keep their management controls (admins, features) but the
  // "open" affordance is removed. (The per-program platform lock is a separate
  // concern handled inside the program workspace, not here.)
  const canEnterProgram = !caps || caps.adminsEnterPrograms !== false;

  async function remove(p: Program) {
    try {
      await deleteProgram(p.id);
      toast.success(`Removed "${p.name}"`);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove program");
    }
  }

  if (!programs) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Programs"
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => switchView(view === "grid" ? "stack" : "grid")}
              className="grid size-9 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              title={view === "grid" ? "Stack view (group by category)" : "Grid view (all programs)"}
              aria-label="Switch programs view"
            >
              {view === "grid" ? <Layers className="size-4" /> : <LayoutGrid className="size-4" />}
            </button>
            <Button variant="outline" onClick={() => setPartnerOpen(true)} disabled={programs.length === 0} title={programs.length === 0 ? "Create a program first — partners connect to one" : undefined}>
              <Handshake className="size-4" /> New partner
            </Button>
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> New program
            </Button>
          </div>
        }
      />

      {programs.length === 0 ? (
        <EmptyState>No programs yet. Create the first one.</EmptyState>
      ) : view === "grid" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {programs.map((p) => (
            <ProgramCard
              key={p.id}
              orgId={orgId}
              program={p}
              canEnter={canEnterProgram}
              onAssign={() => setAssigning(p)}
              onEditFeatures={() => setEditingFeatures(p)}
              onRemove={() => remove(p)}
            />
          ))}
        </div>
      ) : openCategory ? (
        <div>
          <button
            type="button"
            onClick={() => setOpenCategory(parentCategory)}
            className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="size-4" /> {parentCategory ?? "All categories"}
          </button>
          <h2 className="mb-3 text-lg font-semibold tracking-tight">{openCategory}</h2>
          {/* Subfolders first, then programs whose primary IS this category. */}
          {(childrenOf.get(openCategory) ?? []).length ? (
            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(childrenOf.get(openCategory) ?? []).map((cat) => (
                <CategoryFolder key={cat} name={cat} count={subtreeProgramCount(cat)} onOpen={() => setOpenCategory(cat)} />
              ))}
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {programs
              .filter((p) => p.category === openCategory)
              .map((p) => (
                <ProgramCard
                  key={p.id}
                  orgId={orgId}
                  program={p}
                  canEnter={canEnterProgram}
                  onAssign={() => setAssigning(p)}
                  onEditFeatures={() => setEditingFeatures(p)}
                  onRemove={() => remove(p)}
                />
              ))}
          </div>
          {(childrenOf.get(openCategory) ?? []).length === 0 && programs.filter((p) => p.category === openCategory).length === 0 ? (
            <EmptyState>Nothing in this category yet.</EmptyState>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(childrenOf.get(null) ?? []).map((cat) => (
            <CategoryFolder key={cat} name={cat} count={subtreeProgramCount(cat)} onOpen={() => setOpenCategory(cat)} />
          ))}
        </div>
      )}

      <NewProgramDialog orgId={orgId} open={open} onOpenChange={setOpen} onDone={load} allowedFeatureKeys={allowedFeatureKeys} categories={categories} />
      <NewPartnerDialog orgId={orgId} open={partnerOpen} onOpenChange={setPartnerOpen} onDone={load} allowedFeatureKeys={allowedFeatureKeys} programs={programs} />
      <AssignAdminsDialog program={assigning} onClose={() => setAssigning(null)} />
      <EditFeaturesDialog program={editingFeatures} onClose={() => setEditingFeatures(null)} onDone={load} allowedFeatureKeys={allowedFeatureKeys} categories={categories} />
    </div>
  );
}

/** A category folder in the stack view. Count is the whole subtree (programs
 * directly under it plus those under any nested category). */
function CategoryFolder({ name, count, onOpen }: { name: string; count: number; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="glass-card p-5 text-left hover:border-foreground/20 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <Layers className="size-4 shrink-0 text-muted-foreground" />
          <span className="font-medium text-foreground truncate">{name}</span>
        </span>
        <Pill tone="neutral">{count} program{count !== 1 ? "s" : ""}</Pill>
      </div>
    </button>
  );
}

/** Reusable on/off list of the program's feature-areas — only those the
 * Nexus envelope allows this org (a key off at the Nexus level isn't shown). */
function FeatureToggles({
  features,
  onChange,
  allowedKeys,
}: {
  features: ProgramFeatures;
  onChange: (next: ProgramFeatures) => void;
  allowedKeys: string[];
}) {
  const visible = PROGRAM_FEATURES.filter((f) => allowedKeys.includes(f.key));
  return (
    <div className="space-y-2">
      {visible.map((f) => (
        <div key={f.key} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
          <Switch
            checked={features[f.key]}
            onCheckedChange={(v) => onChange({ ...features, [f.key]: v })}
          />
          <span className="flex-1 text-sm">{f.label}</span>
        </div>
      ))}
      {visible.length === 0 ? (
        <p className="text-xs text-muted-foreground">No features are enabled for this organization.</p>
      ) : null}
    </div>
  );
}

function ProgramCard({
  orgId,
  program: p,
  canEnter,
  onAssign,
  onEditFeatures,
  onRemove,
}: {
  orgId: string;
  program: Program;
  canEnter: boolean;
  onAssign: () => void;
  onEditFeatures: () => void;
  onRemove: () => void;
}) {
  const [admins, setAdmins] = useState<ProgramAdministrator[]>([]);
  // Cover lives in the program's branding; keep it in local state so an
  // upload/remove reflects instantly without reloading the whole list.
  const [cover, setCover] = useState<string | null>(p.branding?.cover ?? null);
  const [coverBusy, setCoverBusy] = useState(false);
  const coverRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCover(p.branding?.cover ?? null);
  }, [p.branding?.cover]);

  useEffect(() => {
    listProgramAdministrators(p.id)
      .then(setAdmins)
      .catch(() => setAdmins([]));
  }, [p.id]);

  const admin = admins[0];
  const adminLabel =
    admins.length === 0
      ? "Assign admins"
      : admins.length === 1
        ? `${admin.display_name ?? admin.email}${admin.status === "invited" ? " · invited" : ""}`
        : `${admin.display_name ?? admin.email} +${admins.length - 1}`;

  const coverUrl = cover ? resolveAssetUrl(cover) ?? cover : null;
  // Over a photo we paint text light with a scrim; without one the card keeps
  // the normal theme tokens (works in both light and dark mode).
  const titleCls = coverUrl ? "text-white" : "text-foreground";
  const descCls = coverUrl ? "text-white/80" : "text-muted-foreground";
  const metaCls = coverUrl ? "text-white/85 hover:text-white" : "text-muted-foreground hover:text-foreground";
  const openCls = coverUrl ? "text-white" : "text-foreground";

  async function onPickCover(file: File) {
    setCoverBusy(true);
    try {
      const r = await uploadProgramCover(p.id, file);
      setCover(r.cover_url);
      toast.success("Cover updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setCoverBusy(false);
    }
  }

  async function clearCover() {
    setCoverBusy(true);
    try {
      await removeProgramCover(p.id);
      setCover(null);
      toast.success("Cover removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove cover");
    } finally {
      setCoverBusy(false);
    }
  }

  return (
    <div className={`glass-card relative overflow-hidden p-0 ${coverUrl ? "min-h-40" : ""}`}>
      {coverUrl ? (
        <>
          <img src={coverUrl} alt="" className="pointer-events-none absolute inset-0 size-full object-cover" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/65 to-black/40" />
        </>
      ) : null}

      <div className="relative flex h-full flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          {canEnter ? (
            <Link to={`/o/${orgId}/p/${p.id}`} className="min-w-0 group">
              <div className={`font-medium group-hover:underline truncate ${titleCls}`}>{p.name}</div>
              <div className={`text-xs mt-0.5 line-clamp-2 ${descCls}`}>{p.description}</div>
            </Link>
          ) : (
            <div className="min-w-0">
              <div className={`font-medium truncate ${titleCls}`}>{p.name}</div>
              <div className={`text-xs mt-0.5 line-clamp-2 ${descCls}`}>{p.description}</div>
            </div>
          )}
          <div className="flex shrink-0 items-center gap-1.5">
            <Pill tone="neutral">{p.category}</Pill>
            {(p.secondary_categories ?? []).slice(0, 2).map((c) => (
              <span
                key={c}
                className={
                  coverUrl
                    ? "rounded-full border border-white/40 px-2 py-0.5 text-[10px] text-white/90"
                    : "rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground"
                }
              >
                {c}
              </span>
            ))}
            <ConfirmButton
              title={`Remove the "${p.name}" program?`}
              description="This deletes the program and everything inside it — offerings, app shells, registrations, groups, and roles. This can't be undone."
              actionLabel="Remove program"
              onConfirm={onRemove}
              buttonTitle="Remove program"
            >
              <Trash2 className="size-3.5 text-red-600 dark:text-red-400" />
            </ConfirmButton>
          </div>
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-4">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 text-xs transition-colors min-w-0 ${metaCls}`}
              onClick={onAssign}
              title="Assign the program's administrators (delegation)"
            >
              <UserCog className="size-3.5 shrink-0" />
              <span className="truncate">{adminLabel}</span>
            </button>
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 text-xs transition-colors shrink-0 ${metaCls}`}
              onClick={onEditFeatures}
              title="Choose which features are accessible in this program"
            >
              <SlidersHorizontal className="size-3.5" />
              Features
            </button>
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 text-xs transition-colors shrink-0 disabled:opacity-50 ${metaCls}`}
              onClick={() => coverRef.current?.click()}
              disabled={coverBusy}
              title="Upload a background image for this program"
            >
              <ImageIcon className="size-3.5" />
              {coverBusy ? "…" : "Cover"}
            </button>
            {coverUrl ? (
              <button
                type="button"
                className={`inline-flex items-center gap-1 text-xs transition-colors shrink-0 disabled:opacity-50 ${metaCls}`}
                onClick={clearCover}
                disabled={coverBusy}
                title="Remove the background image"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
            <input
              ref={coverRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void onPickCover(file);
              }}
            />
          </div>
          {canEnter ? (
            <Link
              to={`/o/${orgId}/p/${p.id}`}
              className={`inline-flex items-center gap-1 text-xs font-medium hover:underline shrink-0 ${openCls}`}
            >
              Open <ChevronRight className="size-3.5" />
            </Link>
          ) : (
            <span
              className={`inline-flex items-center gap-1 text-xs font-medium shrink-0 ${metaCls}`}
              title="Your organization isn't allowed to open programs from the admin console (a Nexus setting). You can still manage this program's admins and features here."
            >
              <Lock className="size-3.5" /> Restricted
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function AssignAdminsDialog({ program, onClose }: { program: Program | null; onClose: () => void }) {
  const [admins, setAdmins] = useState<ProgramAdministrator[] | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<MemberEnrollResult | null>(null);

  function load(programId: string) {
    listProgramAdministrators(programId)
      .then(setAdmins)
      .catch(() => setAdmins([]));
  }

  useEffect(() => {
    if (program) load(program.id);
    else {
      setAdmins(null);
      setName("");
      setEmail("");
      setAdded(null);
    }
  }, [program]);

  async function add() {
    if (!program || !email.trim()) return;
    setBusy(true);
    try {
      const res = await assignProgramAdministrator(program.id, email.trim(), name.trim() || undefined);
      setAdded(res);
      setName("");
      setEmail("");
      load(program.id);
      toast.success(`${res.email} is now an active administrator.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to assign administrator");
    } finally {
      setBusy(false);
    }
  }

  async function remove(a: ProgramAdministrator) {
    if (!program) return;
    try {
      if (a.membership_id) await removeMember(a.membership_id);
      else if (a.invitation_id) await revokeInvitation(a.invitation_id);
      toast.success(`${a.display_name ?? a.email} removed`);
      load(program.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove administrator");
    }
  }

  return (
    <Dialog open={!!program} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign admins · {program?.name}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-1">
          They run this program end to end — offerings, team &amp; roles, partners — without you
          needing to manage it directly.
        </p>

        {!admins ? (
          <Spinner />
        ) : (
          <div className="space-y-2">
            {admins.map((a) => (
              <div
                key={a.membership_id ?? a.invitation_id ?? a.email}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm text-foreground truncate">{a.display_name ?? a.email}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {a.email}
                    {a.status === "invited" ? " · invited" : ""}
                  </div>
                </div>
                {a.role === "owner" ? (
                  <span className="text-xs text-muted-foreground shrink-0">owner</span>
                ) : (
                  <ConfirmButton
                    title={`Remove ${a.display_name ?? a.email} as administrator?`}
                    description={
                      a.status === "invited"
                        ? "Their activation link stops working."
                        : "They lose administrator access to this program immediately."
                    }
                    actionLabel="Remove"
                    onConfirm={() => remove(a)}
                    buttonTitle="Remove administrator"
                  >
                    <Trash2 className="size-3.5 text-red-600 dark:text-red-400" />
                  </ConfirmButton>
                )}
              </div>
            ))}
            {admins.length === 0 ? (
              <p className="text-xs text-muted-foreground">No administrators yet — add the first below.</p>
            ) : null}

            <div className="flex gap-2 pt-1">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="flex-1" />
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.org"
                className="flex-1"
              />
              <Button size="sm" onClick={add} disabled={busy || !email.trim()}>
                <Plus className="size-3.5" /> Add
              </Button>
            </div>
            {added ? (
              <div className="rounded-md bg-muted/40 px-2.5 py-1.5 space-y-1">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{added.email}</span> is now an active administrator.
                </p>
                {added.created && added.temp_password ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground shrink-0">Temp password:</span>
                    <code className="flex-1 truncate text-xs font-mono">{added.temp_password}</code>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(added.temp_password ?? "");
                        toast.success("Copied");
                      }}
                      className="grid size-6 place-items-center rounded hover:bg-accent shrink-0"
                      title="Copy password"
                    >
                      <Copy className="size-3.5" />
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">They sign in with their existing password.</p>
                )}
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface AdminDraft {
  email: string;
  displayName: string;
}

interface CreatedInvite {
  email: string;
  created: boolean;
  temp_password: string | null;
}

function NewProgramDialog({
  orgId,
  open,
  onOpenChange,
  onDone,
  allowedFeatureKeys,
  categories,
}: {
  orgId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
  allowedFeatureKeys: string[];
  categories: string[];
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  // Categories come from Settings → Categories: pick a primary, optionally tag
  // secondaries. (Creating categories happens in Settings, not here.)
  const [category, setCategory] = useState<string>(categories[0] ?? "");
  const [secondary, setSecondary] = useState<string[]>([]);
  useEffect(() => {
    if (open) {
      setCategory(categories[0] ?? "");
      setSecondary([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  function toggleSecondary(c: string) {
    setSecondary((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));
  }
  const [features, setFeatures] = useState<ProgramFeatures>({ ...DEFAULT_PROGRAM_FEATURES });
  const [featureAccess, setFeatureAccess] = useState<FeatureAccessMap>({});
  const [admins, setAdmins] = useState<AdminDraft[]>([{ email: "", displayName: "" }]);
  const [invites, setInvites] = useState<CreatedInvite[] | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setName("");
    setDescription("");
    setCategory(categories[0] ?? "");
    setSecondary([]);
    setFeatures({ ...DEFAULT_PROGRAM_FEATURES });
    setFeatureAccess({});
    setAdmins([{ email: "", displayName: "" }]);
    setInvites(null);
  }

  function updateAdmin(i: number, patch: Partial<AdminDraft>) {
    setAdmins((cur) => cur.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }

  const validAdmins = admins.filter((a) => a.email.trim());

  async function submit() {
    if (!name.trim() || !category) return;
    setBusy(true);
    try {
      const program = await createProgram(orgId, {
        name: name.trim(),
        category,
        secondary_categories: secondary.filter((c) => c !== category),
        description: description.trim() || undefined,
        features,
      });
      // Create can't carry Partial subsets — apply them right after if any set.
      if (Object.keys(featureAccess).length) {
        await updateProgramFeatures(program.id, features, undefined, featureAccess).catch(() => {});
      }
      // Assign each named administrator — same delegation the org provisioning
      // flow uses; each becomes an active administrator immediately.
      const created: CreatedInvite[] = [];
      for (const a of validAdmins) {
        try {
          const res = await assignProgramAdministrator(program.id, a.email.trim(), a.displayName.trim() || undefined);
          created.push({ email: res.email, created: res.created, temp_password: res.temp_password });
        } catch (e) {
          toast.error(`Couldn't assign ${a.email}: ${e instanceof Error ? e.message : "failed"}`);
        }
      }
      toast.success("Program created");
      onDone();
      if (created.length > 0) {
        setInvites(created); // stay open to show sign-in details
      } else {
        onOpenChange(false);
        reset();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create program");
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
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New program</DialogTitle>
        </DialogHeader>
        {invites ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Program created. Each administrator is now active — share the temporary password with any
              new accounts.
            </p>
            {invites.map((inv) => (
              <div key={inv.email} className="rounded-lg border border-border p-3 space-y-1.5">
                <div className="text-sm font-medium text-foreground">{inv.email}</div>
                {inv.created && inv.temp_password ? (
                  <div className="flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1.5">
                    <span className="text-xs text-muted-foreground shrink-0">Temp password:</span>
                    <code className="flex-1 truncate text-xs font-mono">{inv.temp_password}</code>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(inv.temp_password!);
                        toast.success("Copied");
                      }}
                      className="grid size-6 place-items-center rounded hover:bg-accent shrink-0"
                    >
                      <Copy className="size-3.5" />
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Signs in with their existing password.</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="p-name">Name</Label>
              <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Brain Bee Program" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-desc">Description</Label>
              <Input id="p-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this program about?" />
            </div>
            <div className="space-y-1.5">
              <Label>Primary category</Label>
              <p className="text-xs text-muted-foreground -mt-1">
                The stack view groups by this. Manage the list in Settings → Categories.
              </p>
              {categories.length === 0 ? (
                <p className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground">
                  No categories yet — add one in Settings → Categories first.
                </p>
              ) : (
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {categories.length > 1 ? (
                <div className="space-y-1.5 pt-1">
                  <Label className="text-xs text-muted-foreground">Also tag as (optional)</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {categories
                      .filter((c) => c !== category)
                      .map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => toggleSecondary(c)}
                          className={
                            secondary.includes(c)
                              ? "rounded-full border border-primary bg-primary/10 px-2.5 py-1 text-xs font-medium text-foreground"
                              : "rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                          }
                        >
                          {c}
                        </button>
                      ))}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>
                Administrators <span className="text-xs font-normal text-muted-foreground">optional — they run the program</span>
              </Label>
              {admins.map((a, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={a.displayName}
                    onChange={(e) => updateAdmin(i, { displayName: e.target.value })}
                    placeholder="Name"
                    className="flex-1"
                  />
                  <Input
                    value={a.email}
                    onChange={(e) => updateAdmin(i, { email: e.target.value })}
                    placeholder="email@example.org"
                    className="flex-1"
                  />
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAdmins((cur) => [...cur, { email: "", displayName: "" }])}
              >
                <Plus className="size-3.5" /> Add another administrator
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label>Features</Label>
              <p className="text-xs text-muted-foreground -mt-1">
                Partial limits a platform to the capabilities you pick — roles can't grant beyond them.
              </p>
              <FeatureAccessControls
                features={features}
                featureAccess={featureAccess}
                allowedKeys={allowedFeatureKeys}
                onChangeFeatures={(next) => setFeatures(next as ProgramFeatures)}
                onChangeAccess={setFeatureAccess}
                disabled={busy}
              />
            </div>
          </div>
        )}
        <DialogFooter>
          {invites ? (
            <Button
              onClick={() => {
                onOpenChange(false);
                reset();
              }}
            >
              Done
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={busy || !name.trim() || !category}>
                {busy ? "Creating…" : "Create program"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * New Partner — a "sister program" connected to one of the org's programs. Same
 * provisioning as a program, but with a required connecting program instead of a
 * category. Its Content Studio / Bridge / App Studio tabs are restricted views
 * into the connected program (provisioned via No/Partial/Full); its People /
 * Community / Partners are its own.
 */
function NewPartnerDialog({
  orgId,
  open,
  onOpenChange,
  onDone,
  allowedFeatureKeys,
  programs,
}: {
  orgId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
  allowedFeatureKeys: string[];
  programs: Program[];
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [connectedId, setConnectedId] = useState<string>("");
  const [features, setFeatures] = useState<ProgramFeatures>({ ...DEFAULT_PROGRAM_FEATURES });
  const [featureAccess, setFeatureAccess] = useState<FeatureAccessMap>({});
  const [admins, setAdmins] = useState<AdminDraft[]>([{ email: "", displayName: "" }]);
  const [invites, setInvites] = useState<CreatedInvite[] | null>(null);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setConnectedId(programs[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  // Auto-suggest the slug from the name until the user edits it directly.
  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  useEffect(() => { if (!slugEdited) setSlug(slugify(name)); }, [name, slugEdited]);

  function reset() {
    setName(""); setDescription(""); setSlug(""); setSlugEdited(false); setConnectedId(programs[0]?.id ?? "");
    setFeatures({ ...DEFAULT_PROGRAM_FEATURES }); setFeatureAccess({});
    setAdmins([{ email: "", displayName: "" }]); setInvites(null); setCreatedSlug(null);
  }
  const updateAdmin = (i: number, patch: Partial<AdminDraft>) =>
    setAdmins((cur) => cur.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  const validAdmins = admins.filter((a) => a.email.trim());
  const partnerUrl = createdSlug ? `${window.location.origin}/partner/${createdSlug}` : null;

  async function submit() {
    if (!name.trim() || !connectedId) return;
    setBusy(true);
    try {
      const partner = await createPartner(orgId, {
        name: name.trim(),
        description: description.trim() || undefined,
        connected_program_id: connectedId,
        slug: slug.trim() || undefined,
        features,
        feature_access: Object.keys(featureAccess).length ? featureAccess : undefined,
      });
      const created: CreatedInvite[] = [];
      for (const a of validAdmins) {
        try {
          const res = await assignProgramAdministrator(partner.id, a.email.trim(), a.displayName.trim() || undefined);
          created.push({ email: res.email, created: res.created, temp_password: res.temp_password });
        } catch (e) {
          toast.error(`Couldn't assign ${a.email}: ${e instanceof Error ? e.message : "failed"}`);
        }
      }
      toast.success("Partner created");
      onDone();
      setCreatedSlug(partner.slug ?? null);
      setInvites(created);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create partner");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New partner</DialogTitle></DialogHeader>
        {invites ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Partner created. Share its login link and any temporary passwords.</p>
            {partnerUrl ? (
              <div className="flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1.5">
                <span className="text-xs text-muted-foreground shrink-0">Partner login:</span>
                <code className="flex-1 truncate text-xs font-mono">{partnerUrl}</code>
                <button type="button" onClick={() => { void navigator.clipboard?.writeText(partnerUrl); toast.success("Copied"); }} className="grid size-6 place-items-center rounded hover:bg-accent shrink-0"><Copy className="size-3.5" /></button>
              </div>
            ) : null}
            {invites.map((inv) => (
              <div key={inv.email} className="rounded-lg border border-border p-3 space-y-1.5">
                <div className="text-sm font-medium text-foreground">{inv.email}</div>
                {inv.created && inv.temp_password ? (
                  <div className="flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1.5">
                    <span className="text-xs text-muted-foreground shrink-0">Temp password:</span>
                    <code className="flex-1 truncate text-xs font-mono">{inv.temp_password}</code>
                    <button type="button" onClick={() => { void navigator.clipboard?.writeText(inv.temp_password!); toast.success("Copied"); }} className="grid size-6 place-items-center rounded hover:bg-accent shrink-0"><Copy className="size-3.5" /></button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Signs in with their existing password.</p>
                )}
              </div>
            ))}
            <DialogFooter>
              <Button onClick={() => { onOpenChange(false); reset(); }}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pn-name">Name</Label>
              <Input id="pn-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CS Club at Lincoln High" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pn-desc">Description</Label>
              <Input id="pn-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Who is this partner?" />
            </div>
            <div className="space-y-1.5">
              <Label>Connecting program</Label>
              <p className="text-xs text-muted-foreground -mt-1">The program this partner is tied to. Its platforms are shown to the partner as a restricted view.</p>
              <Select value={connectedId} onValueChange={setConnectedId}>
                <SelectTrigger><SelectValue placeholder="Select a program" /></SelectTrigger>
                <SelectContent>
                  {programs.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pn-slug">Login slug</Label>
              <p className="text-xs text-muted-foreground -mt-1">The partner signs in at <span className="font-mono">/partner/{slug || "…"}</span></p>
              <Input id="pn-slug" value={slug} onChange={(e) => { setSlugEdited(true); setSlug(slugify(e.target.value)); }} placeholder="cs-club-lincoln" />
            </div>
            <div className="space-y-1.5">
              <Label>Features</Label>
              <p className="text-xs text-muted-foreground -mt-1">
                Partial limits a platform to the capabilities you pick — the partner sees only that slice of the connected program. People and Community are the partner's own.
              </p>
              <FeatureAccessControls
                features={features}
                featureAccess={featureAccess}
                allowedKeys={allowedFeatureKeys}
                onChangeFeatures={(next) => setFeatures(next as ProgramFeatures)}
                onChangeAccess={setFeatureAccess}
                disabled={busy}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Administrators</Label>
              {admins.map((a, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={a.email} onChange={(e) => updateAdmin(i, { email: e.target.value })} placeholder="admin@email.com" className="flex-1" />
                  <Input value={a.displayName} onChange={(e) => updateAdmin(i, { displayName: e.target.value })} placeholder="Name (optional)" className="flex-1" />
                </div>
              ))}
              <Button size="sm" variant="ghost" onClick={() => setAdmins((c) => [...c, { email: "", displayName: "" }])}><Plus className="size-3.5" /> Add another</Button>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => { onOpenChange(false); reset(); }}>Cancel</Button>
              <Button onClick={submit} disabled={busy || !name.trim() || !connectedId}>{busy ? "Creating…" : "Create partner"}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditFeaturesDialog({
  program,
  onClose,
  onDone,
  allowedFeatureKeys,
  categories,
}: {
  program: Program | null;
  onClose: () => void;
  onDone: () => void;
  allowedFeatureKeys: string[];
  categories: string[];
}) {
  const [features, setFeatures] = useState<ProgramFeatures>({ ...DEFAULT_PROGRAM_FEATURES });
  const [featureAccess, setFeatureAccess] = useState<FeatureAccessMap>({});
  const [primary, setPrimary] = useState<string>("");
  const [secondary, setSecondary] = useState<string[]>([]);
  const [platformsOpen, setPlatformsOpen] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (program) {
      setFeatures({ ...DEFAULT_PROGRAM_FEATURES, ...(program.features ?? {}) });
      setFeatureAccess((program.feature_access as FeatureAccessMap) ?? {});
      setPrimary(program.category);
      setSecondary(program.secondary_categories ?? []);
      setPlatformsOpen(program.platforms_open !== false);
    }
  }, [program]);

  function toggleSecondary(c: string) {
    setSecondary((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));
  }

  async function submit() {
    if (!program) return;
    setBusy(true);
    try {
      await updateProgramFeatures(program.id, features, platformsOpen, featureAccess);
      if (primary !== program.category || JSON.stringify(secondary) !== JSON.stringify(program.secondary_categories ?? [])) {
        await updateProgramCategories(program.id, {
          category: primary,
          secondary_categories: secondary.filter((c) => c !== primary),
        });
      }
      toast.success("Program updated");
      onClose();
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update program");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!program} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Features · {program?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Primary category</Label>
          <Select value={primary} onValueChange={setPrimary}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...new Set([primary, ...categories])].filter(Boolean).map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {categories.filter((c) => c !== primary).length > 0 ? (
            <div className="space-y-1.5 pt-1">
              <Label className="text-xs text-muted-foreground">Also tagged as (click to add/remove)</Label>
              <div className="flex flex-wrap gap-1.5">
                {categories
                  .filter((c) => c !== primary)
                  .map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggleSecondary(c)}
                      className={
                        secondary.includes(c)
                          ? "rounded-full border border-primary bg-primary/10 px-2.5 py-1 text-xs font-medium text-foreground"
                          : "rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                      }
                    >
                      {c}
                    </button>
                  ))}
              </div>
            </div>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label>Features</Label>
          <p className="text-xs text-muted-foreground -mt-1">
            Partial limits a platform to the capabilities you pick — roles can't grant beyond them.
          </p>
          <FeatureAccessControls
            features={features}
            featureAccess={featureAccess}
            allowedKeys={allowedFeatureKeys}
            onChangeFeatures={(next) => setFeatures(next as ProgramFeatures)}
            onChangeAccess={setFeatureAccess}
            disabled={busy}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Platform access</Label>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">This program's people can open platforms</span>
              <span className="block text-xs text-muted-foreground">
                {platformsOpen
                  ? "This program's admins and members can open its Learning, App Studio, and Bridge platforms."
                  : "Off — this program's admins and members can manage the program but can't open its platforms. (You, as an org admin, are unaffected.)"}
              </span>
            </span>
            <Switch checked={platformsOpen} onCheckedChange={setPlatformsOpen} disabled={busy} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Save features"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

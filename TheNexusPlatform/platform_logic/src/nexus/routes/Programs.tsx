/**
 * Org space → Programs. Create programs and enter their workspace. Each row
 * carries the org-altitude "assign administrator" affordance (§3.5) — an org
 * admin names who runs a program without having to manage that program's
 * internal roles (that's the assigned admin's own job, done from Team & Roles).
 */
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { ChevronRight, Copy, Plus, SlidersHorizontal, Trash2, UserCog } from "lucide-react";
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
  createProgram,
  deleteProgram,
  listProgramAdministrators,
  listPrograms,
  updateProgramFeatures,
  type ProgramAdministrator,
} from "@/services/api";
import type { Program, ProgramCategory, ProgramFeatures } from "@/types/platform";
import { DEFAULT_PROGRAM_FEATURES, PROGRAM_FEATURES } from "@/types/platform";
import { EmptyState, PageHeader, Pill, Spinner } from "@/nexus/ui/kit";
import { ConfirmButton } from "@/nexus/ui/ConfirmButton";

export function Programs() {
  const { orgId = "" } = useParams();
  const [programs, setPrograms] = useState<Program[] | null>(null);
  const [open, setOpen] = useState(false);
  const [assigning, setAssigning] = useState<Program | null>(null);
  const [editingFeatures, setEditingFeatures] = useState<Program | null>(null);

  async function load() {
    setPrograms(await listPrograms(orgId));
  }
  useEffect(() => {
    void load();
  }, [orgId]);

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
        subtitle="Each program produces offerings — courses, challenges, and apps."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> New program
          </Button>
        }
      />

      {programs.length === 0 ? (
        <EmptyState>No programs yet. Create the first one.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {programs.map((p) => (
            <ProgramCard
              key={p.id}
              orgId={orgId}
              program={p}
              onAssign={() => setAssigning(p)}
              onEditFeatures={() => setEditingFeatures(p)}
              onRemove={() => remove(p)}
            />
          ))}
        </div>
      )}

      <NewProgramDialog orgId={orgId} open={open} onOpenChange={setOpen} onDone={load} />
      <AssignAdminDialog program={assigning} onClose={() => setAssigning(null)} />
      <EditFeaturesDialog program={editingFeatures} onClose={() => setEditingFeatures(null)} onDone={load} />
    </div>
  );
}

/** Reusable on/off list of the program's feature-areas. */
function FeatureToggles({
  features,
  onChange,
}: {
  features: ProgramFeatures;
  onChange: (next: ProgramFeatures) => void;
}) {
  return (
    <div className="space-y-2">
      {PROGRAM_FEATURES.map((f) => (
        <div key={f.key} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
          <Switch
            checked={features[f.key]}
            onCheckedChange={(v) => onChange({ ...features, [f.key]: v })}
          />
          <span className="flex-1 text-sm">{f.label}</span>
        </div>
      ))}
    </div>
  );
}

function ProgramCard({
  orgId,
  program: p,
  onAssign,
  onEditFeatures,
  onRemove,
}: {
  orgId: string;
  program: Program;
  onAssign: () => void;
  onEditFeatures: () => void;
  onRemove: () => void;
}) {
  const [admins, setAdmins] = useState<ProgramAdministrator[]>([]);

  useEffect(() => {
    listProgramAdministrators(p.id)
      .then(setAdmins)
      .catch(() => setAdmins([]));
  }, [p.id]);

  const admin = admins[0];

  return (
    <div className="glass-card p-4">
      <div className="flex items-start justify-between gap-2">
        <Link to={`/o/${orgId}/p/${p.id}`} className="min-w-0 group">
          <div className="font-medium text-foreground group-hover:underline truncate">{p.name}</div>
          <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{p.description}</div>
        </Link>
        <div className="flex shrink-0 items-center gap-1.5">
          <Pill tone="neutral">{p.category}</Pill>
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
      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors min-w-0"
            onClick={onAssign}
            title="Assign the program's administrator (delegation)"
          >
            <UserCog className="size-3.5 shrink-0" />
            <span className="truncate">
              {admin ? (
                <>
                  {admin.display_name ?? admin.email}
                  {admin.status === "invited" ? " · invited" : ""}
                </>
              ) : (
                "Assign admin"
              )}
            </span>
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
            onClick={onEditFeatures}
            title="Choose which features are accessible in this program"
          >
            <SlidersHorizontal className="size-3.5" />
            Features
          </button>
        </div>
        <Link
          to={`/o/${orgId}/p/${p.id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:underline shrink-0"
        >
          Open <ChevronRight className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}

function AssignAdminDialog({ program, onClose }: { program: Program | null; onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  function reset() {
    setName("");
    setEmail("");
    setLink(null);
  }

  async function submit() {
    if (!program || !email.trim()) return;
    setBusy(true);
    try {
      const inv = await assignProgramAdministrator(program.id, email.trim(), name.trim() || undefined);
      setLink(inv.token ? `${window.location.origin}/invite/${inv.token}` : inv.redeem_url ?? null);
      toast.success(`Administrator assigned to ${program.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to assign administrator");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={!!program}
      onOpenChange={(v) => {
        if (!v) {
          onClose();
          reset();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign administrator · {program?.name}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-1">
          They'll run this program end to end — offerings, team &amp; roles, partners — without you
          needing to manage it directly.
        </p>
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
              <Label htmlFor="admin-name">Name</Label>
              <Input id="admin-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jordan Lee" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-email">Email</Label>
              <Input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jordan@example.org"
              />
            </div>
          </div>
        )}
        <DialogFooter>
          {link ? (
            <Button
              onClick={() => {
                onClose();
                reset();
              }}
            >
              Done
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={busy || !email.trim()}>
                {busy ? "Assigning…" : "Assign"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewProgramDialog({
  orgId,
  open,
  onOpenChange,
  onDone,
}: {
  orgId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ProgramCategory>("edu");
  const [features, setFeatures] = useState<ProgramFeatures>({ ...DEFAULT_PROGRAM_FEATURES });
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createProgram(orgId, {
        name: name.trim(),
        category,
        description: description.trim() || undefined,
        features,
      });
      toast.success("Program created");
      onOpenChange(false);
      setName("");
      setDescription("");
      setFeatures({ ...DEFAULT_PROGRAM_FEATURES });
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create program");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New program</DialogTitle>
        </DialogHeader>
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
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as ProgramCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="edu">Education (Teacher / Student)</SelectItem>
                <SelectItem value="game">Game (Coach / Player)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Features</Label>
            <p className="text-xs text-muted-foreground -mt-1">
              Choose what's accessible in this program. Only enabled features can be granted to roles.
            </p>
            <FeatureToggles features={features} onChange={setFeatures} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !name.trim()}>
            {busy ? "Creating…" : "Create program"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditFeaturesDialog({
  program,
  onClose,
  onDone,
}: {
  program: Program | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [features, setFeatures] = useState<ProgramFeatures>({ ...DEFAULT_PROGRAM_FEATURES });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (program) setFeatures({ ...DEFAULT_PROGRAM_FEATURES, ...(program.features ?? {}) });
  }, [program]);

  async function submit() {
    if (!program) return;
    setBusy(true);
    try {
      await updateProgramFeatures(program.id, features);
      toast.success("Features updated");
      onClose();
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update features");
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
        <p className="text-sm text-muted-foreground -mt-1">
          Turn a feature off to hide it from this program's roles. Roles already granting it keep the
          record, but the area stops being offered.
        </p>
        <FeatureToggles features={features} onChange={setFeatures} />
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

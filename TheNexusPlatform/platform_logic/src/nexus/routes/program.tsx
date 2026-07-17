/**
 * Program workspace pages, all wired to the live API. Team & Roles lives in
 * ProgramTeam.tsx; the App Shell editor in ShellEditor.tsx.
 */
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { BookOpen, Check, Plus, Rocket, X } from "lucide-react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import {
  approveRegistration,
  closeOffering,
  createApp,
  createGroup,
  createOffering,
  listAffiliatedPrograms,
  listApps,
  listGroups,
  listIntegrations,
  listOfferings,
  listPrograms,
  listProgramOrgAffiliations,
  listRegistrations,
  publishOffering,
  rejectRegistration,
} from "@/services/api";
import type {
  AffiliatedProgram,
  Group,
  Integration,
  Offering,
  OfferingType,
  Program,
  ProgramOrgAffiliation,
  RegisteredApp,
  Registration,
} from "@/types/platform";
import { EmptyState, PageHeader, Pill, Spinner, statusTone } from "@/nexus/ui/kit";

/** Fetch the current program (no single-get endpoint; list + find). */
function useProgram(): { program: Program | null; orgId: string; programId: string } {
  const { orgId = "", programId = "" } = useParams();
  const [program, setProgram] = useState<Program | null>(null);
  useEffect(() => {
    listPrograms(orgId)
      .then((ps) => setProgram(ps.find((p) => p.id === programId) ?? null))
      .catch(() => setProgram(null));
  }, [orgId, programId]);
  return { program, orgId, programId };
}

function Head({ program, subtitle, actions }: { program: Program | null; subtitle: string; actions?: React.ReactNode }) {
  return <PageHeader title={program?.name ?? "Program"} subtitle={subtitle} actions={actions} />;
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="glass-card px-5 py-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function ProgramOverview() {
  const { program, orgId, programId } = useProgram();
  const navigate = useNavigate();
  const [offerings, setOfferings] = useState<Offering[]>([]);
  useEffect(() => {
    if (programId) listOfferings(programId).then(setOfferings).catch(() => setOfferings([]));
  }, [programId]);

  return (
    <div>
      <Head program={program} subtitle={program?.description ?? "Program workspace."} />
      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        <Stat label="Offerings" value={offerings.length} />
        <Stat label="Learners" value={program?.learner_count ?? 0} />
        <Stat label="Courses" value={program?.course_count ?? 0} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <LaunchCard
          icon={<Rocket className="size-5" />}
          title="Launch Learning Platform"
          hint="Author lessons and courses for this program."
          onClick={() => navigate(`/o/${orgId}/p/${programId}/learning`)}
        />
        <LaunchCard
          icon={<BookOpen className="size-5" />}
          title="Make an application"
          hint="Configure an App Shell and fill it with content."
          onClick={() => navigate(`/o/${orgId}/p/${programId}/shells`)}
        />
      </div>
    </div>
  );
}

function LaunchCard({
  icon,
  title,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-4 glass-card p-5 text-left hover:border-foreground/20 transition-colors"
    >
      <div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-foreground">{icon}</div>
      <div className="min-w-0">
        <div className="font-medium text-foreground">{title}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
    </button>
  );
}

const OFFERING_TYPES: OfferingType[] = ["course", "challenge", "app"];

export function ProgramOfferings() {
  const { program, programId } = useProgram();
  const [offerings, setOfferings] = useState<Offering[] | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    if (programId) listOfferings(programId).then(setOfferings).catch(() => setOfferings([]));
  }, [programId]);
  useEffect(() => load(), [load]);

  async function lifecycle(o: Offering, action: "publish" | "close") {
    try {
      await (action === "publish" ? publishOffering(o.id) : closeOffering(o.id));
      toast.success(action === "publish" ? "Offering opened" : "Offering closed");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  }

  return (
    <div>
      <Head
        program={program}
        subtitle="Courses, challenges, and applications people join."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> New offering
          </Button>
        }
      />
      {!offerings ? (
        <Spinner />
      ) : offerings.length === 0 ? (
        <EmptyState>No offerings yet.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {offerings.map((o) => (
            <div key={o.id} className="glass-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-foreground truncate">{o.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{o.slug}</div>
                </div>
                <Pill tone={statusTone(o.status)}>{o.status}</Pill>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex flex-wrap gap-1.5">
                  <Pill tone="neutral">{o.offering_type}</Pill>
                  <Pill tone="neutral">{o.approval_mode}</Pill>
                  {o.content_package ? <Pill tone="accent">Learning Platform package</Pill> : null}
                </div>
                <div className="flex gap-1.5">
                  {o.status !== "open" ? (
                    <Button size="sm" variant="ghost" onClick={() => lifecycle(o, "publish")}>
                      Open
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => lifecycle(o, "close")}>
                      Close
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <NewOfferingDialog programId={programId} open={open} onOpenChange={setOpen} onDone={load} />
    </div>
  );
}

function NewOfferingDialog({
  programId,
  open,
  onOpenChange,
  onDone,
}: {
  programId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<OfferingType>("course");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createOffering(programId, {
        name: name.trim(),
        offering_type: type,
        approval_mode: "manual_approve",
        platform_module: type === "app" ? "coaching" : "learning",
      });
      toast.success("Offering created");
      onOpenChange(false);
      setName("");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create offering");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New offering</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="o-name">Name</Label>
            <Input id="o-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Spring Course 2026" />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as OfferingType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OFFERING_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !name.trim()}>
            {busy ? "Creating…" : "Create offering"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProgramRegistrations() {
  const { program, programId } = useProgram();
  const [rows, setRows] = useState<Registration[] | null>(null);

  const load = useCallback(async () => {
    if (!programId) return;
    const offs = await listOfferings(programId).catch(() => [] as Offering[]);
    const all = await Promise.all(offs.map((o) => listRegistrations(o.id).catch(() => [] as Registration[])));
    setRows(all.flat());
  }, [programId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(id: string, kind: "approve" | "reject") {
    try {
      await (kind === "approve" ? approveRegistration(id) : rejectRegistration(id));
      toast.success(kind === "approve" ? "Approved — participant created" : "Rejected");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  }

  return (
    <div>
      <Head program={program} subtitle="Signups arriving via the app hook, invites, or admin add." />
      {!rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState>No registrations yet.</EmptyState>
      ) : (
        <div className="glass-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Registrant</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium text-foreground">{r.name ?? r.email ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.email}</div>
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">{r.registration_source}</TableCell>
                  <TableCell>
                    <Pill tone={statusTone(r.status)}>{r.status.replace(/_/g, " ")}</Pill>
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status === "pending_review" ? (
                      <div className="inline-flex gap-1.5">
                        <Button size="sm" onClick={() => act(r.id, "approve")}>
                          <Check className="size-3.5" /> Approve
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => act(r.id, "reject")}>
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">participant created</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export function ProgramGroups() {
  const { program, orgId, programId } = useProgram();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    if (orgId) listGroups(orgId, programId).then(setGroups).catch(() => setGroups([]));
  }, [orgId, programId]);
  useEffect(() => load(), [load]);

  return (
    <div>
      <Head
        program={program}
        subtitle="Classes, clubs, chapters, regions — one freeform group concept with nesting."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> New group
          </Button>
        }
      />
      {!groups ? (
        <Spinner />
      ) : groups.length === 0 ? (
        <EmptyState>No groups yet.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {groups.map((g) => (
            <div key={g.id} className="glass-card p-4">
              <div className="font-medium text-foreground">{g.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {g.label ?? g.visibility}
                {g.parent_group_id
                  ? ` · nested under ${groups.find((x) => x.id === g.parent_group_id)?.name ?? "…"}`
                  : ""}
              </div>
            </div>
          ))}
        </div>
      )}
      <NewGroupDialog
        orgId={orgId}
        programId={programId}
        groups={groups ?? []}
        open={open}
        onOpenChange={setOpen}
        onDone={load}
      />
    </div>
  );
}

function NewGroupDialog({
  orgId,
  programId,
  groups,
  open,
  onOpenChange,
  onDone,
}: {
  orgId: string;
  programId: string;
  groups: Group[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [parent, setParent] = useState<string>("none");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createGroup(orgId, {
        program_id: programId,
        name: name.trim(),
        parent_group_id: parent === "none" ? undefined : parent,
      });
      toast.success("Group created");
      onOpenChange(false);
      setName("");
      setParent("none");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create group");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New group</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="g-name">Name</Label>
            <Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bay Area Chapter" />
          </div>
          <div className="space-y-1.5">
            <Label>Nest under (optional)</Label>
            <Select value={parent} onValueChange={setParent}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (top level)</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !name.trim()}>
            {busy ? "Creating…" : "Create group"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProgramPartners() {
  const { program, orgId, programId } = useProgram();
  const [affiliations, setAffiliations] = useState<ProgramOrgAffiliation[] | null>(null);
  const [affiliated, setAffiliated] = useState<AffiliatedProgram[]>([]);

  useEffect(() => {
    if (!programId) return;
    listProgramOrgAffiliations(programId).then(setAffiliations).catch(() => setAffiliations([]));
  }, [programId]);
  useEffect(() => {
    if (orgId) listAffiliatedPrograms(orgId).then(setAffiliated).catch(() => setAffiliated([]));
  }, [orgId]);

  return (
    <div>
      <Head program={program} subtitle="Organizations affiliated with this program, governed here inside it." />
      {!affiliations ? (
        <Spinner />
      ) : affiliations.length === 0 && affiliated.length === 0 ? (
        <EmptyState>No partners yet. Affiliated organizations appear here once linked.</EmptyState>
      ) : (
        <div className="space-y-6">
          {affiliations.length > 0 ? (
            <div className="glass-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Affiliated org</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {affiliations.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-mono text-xs">{a.organization_id}</TableCell>
                      <TableCell>{a.affiliation_type}</TableCell>
                      <TableCell>
                        <Pill tone={statusTone(a.status)}>{a.status}</Pill>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
          {affiliated.length > 0 ? (
            <div>
              <h2 className="text-sm font-semibold mb-2">Programs shared with this org</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {affiliated.map((p) => (
                  <div key={p.program_id} className="glass-card p-4">
                    <div className="font-medium text-foreground">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.affiliation_type}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function ProgramCommunity() {
  const { program, orgId } = useProgram();
  const [integrations, setIntegrations] = useState<Integration[] | null>(null);
  useEffect(() => {
    if (orgId) listIntegrations(orgId).then(setIntegrations).catch(() => setIntegrations([]));
  }, [orgId]);

  return (
    <div>
      <Head
        program={program}
        subtitle="A hub for participants and coaches."
        actions={
          <Button variant="ghost" onClick={() => toast("Discord integration isn\u2019t available yet.")}>
            Connect Discord
          </Button>
        }
      />
      {!integrations ? (
        <Spinner />
      ) : integrations.length === 0 ? (
        <EmptyState>No integrations connected. Connect Discord to give this program a community hub.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {integrations.map((i) => (
            <div key={i.id} className="glass-card p-4 flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-lg bg-[#5865F2] text-white font-semibold">D</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-foreground capitalize">{i.integration_type}</div>
                <div className="text-xs text-muted-foreground">{i.permission_level}</div>
              </div>
              <Pill tone={statusTone(i.status)}>{i.status}</Pill>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Placeholder({ subtitle, note }: { subtitle: string; note: string }) {
  const { program } = useProgram();
  return (
    <div>
      <Head program={program} subtitle={subtitle} />
      <EmptyState>{note}</EmptyState>
    </div>
  );
}

export function ProgramShells() {
  const { program, orgId, programId } = useProgram();
  const [apps, setApps] = useState<RegisteredApp[] | null>(null);
  const [open, setOpen] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (programId) listApps(programId).then(setApps).catch(() => setApps([]));
  }, [programId]);
  useEffect(() => load(), [load]);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const app = await createApp(programId, { app_name: name.trim() });
      setNewKey(app.api_key);
      setName("");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create App Shell");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Head
        program={program}
        subtitle="Configurable app containers — one runtime renders every shell's config."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> New App Shell
          </Button>
        }
      />
      {!apps ? (
        <Spinner />
      ) : apps.length === 0 ? (
        <EmptyState>No App Shells yet. Create one and configure its screens.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {apps.map((a) => (
            <Link
              key={a.id}
              to={`/o/${orgId}/p/${programId}/shells/${a.id}`}
              className="glass-card p-4 hover:border-foreground/20 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-foreground truncate">{a.app_name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{a.app_slug}</div>
                </div>
                <Pill tone={statusTone(a.status)}>{a.status}</Pill>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">Open editor →</div>
            </Link>
          ))}
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setNewKey(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New App Shell</DialogTitle>
          </DialogHeader>
          {newKey ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                App created. This hook API key is shown <b>once</b> — copy it now; the app uses it to fetch
                its sign-up fields and post registrations.
              </p>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
                <code className="flex-1 truncate text-xs font-mono">{newKey}</code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    void navigator.clipboard?.writeText(newKey);
                    toast.success("Copied");
                  }}
                >
                  Copy
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="app-name">App name</Label>
              <Input id="app-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Brain Bee App" />
            </div>
          )}
          <DialogFooter>
            {newKey ? (
              <Button onClick={() => setOpen(false)}>Done</Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={create} disabled={busy || !name.trim()}>
                  {busy ? "Creating…" : "Create"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

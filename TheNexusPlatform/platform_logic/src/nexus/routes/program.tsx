/**
 * Program workspace pages, all wired to the live API. Team & Roles lives in
 * ProgramTeam.tsx; App Studios are designed in the App Studio (card click).
 */
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { BookOpen, Check, ExternalLink, Lock, Plus, Rocket, ShieldCheck, Trash2, Waypoints, X } from "lucide-react";
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
import { Switch } from "@/app/components/ui/switch";
import { Label } from "@/app/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import {
  approveRegistration,
  closeOffering,
  createApp,
  createGate,
  createGroup,
  createOffering,
  deleteApp,
  deleteGate,
  getOrgCapabilities,
  inviteProgramParticipant,
  listAffiliatedPrograms,
  listApps,
  listGates,
  listGroups,
  listIntegrations,
  listOfferings,
  listPrograms,
  listProgramOrgAffiliations,
  listProgramGateRequests,
  approveProgramGateRequest,
  rejectProgramGateRequest,
  listProgramRegistrations,
  listProgramRoles,
  listRegistrations,
  publishOffering,
  rejectRegistration,
  removeRegistration,
  updateProgramFeatures,
  type Gate,
  type GateAudience,
  type GateRequest,
  type OrgCapabilities,
  type ProgramRole,
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
import { DEFAULT_PROGRAM_FEATURES } from "@/types/platform";
import type { ProgramFeatureKey, ProgramFeatures } from "@/types/platform";
import { EmptyState, PageHeader, Pill, Section, Spinner, StatPill, statusTone } from "@/nexus/ui/kit";
import { AppShellAccessCatalogue } from "@/nexus/appshell/AccessCatalogue";
import { openInStudio } from "@/services/studio";
import { ConfirmButton } from "@/nexus/ui/ConfirmButton";
import { useProgramAccess } from "@/nexus/access";
import { useSession } from "@/nexus/session";

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

// The platforms a program can run. A card renders only when the org is
// entitled to the platform (Nexus capability envelope) AND the program has the
// feature enabled AND the viewer's role grants the area. `key` doubles as the
// program-feature key and the role area; `cap` is the org-capability key.
const PROGRAM_PLATFORMS: {
  key: ProgramFeatureKey;
  cap: string;
  title: string;
  hint: string;
  icon: React.ReactNode;
  path: string;
}[] = [
  { key: "learning", cap: "learning", title: "Content Studio", hint: "Author lessons and courses for this program.", icon: <Rocket className="size-5" />, path: "learning" },
  { key: "bridge", cap: "bridge", title: "Bridge Platform", hint: "Coach-driven app runtime for this program.", icon: <Waypoints className="size-5" />, path: "bridge" },
  { key: "appbuilder", cap: "appbuilder", title: "App Studio", hint: "Configure an App Studio and fill it with content.", icon: <BookOpen className="size-5" />, path: "shells" },
];

// Confined areas that aren't platforms — their presence keeps a single-platform
// member on the overview instead of launching them straight in.
const NON_PLATFORM_AREAS = ["community", "teams", "partners"];

export function ProgramOverview() {
  const { program, orgId, programId } = useProgram();
  const navigate = useNavigate();
  const access = useProgramAccess(programId);
  const { programMemberships } = useSession();
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [caps, setCaps] = useState<OrgCapabilities | null>(null);
  const [features, setFeatures] = useState<ProgramFeatures>(DEFAULT_PROGRAM_FEATURES);
  const [busy, setBusy] = useState<ProgramFeatureKey | null>(null);

  useEffect(() => {
    if (programId) listOfferings(programId).then(setOfferings).catch(() => setOfferings([]));
  }, [programId]);
  useEffect(() => {
    if (orgId) getOrgCapabilities(orgId).then(setCaps).catch(() => setCaps(null));
  }, [orgId]);
  useEffect(() => {
    setFeatures(program?.features ?? DEFAULT_PROGRAM_FEATURES);
  }, [program]);

  const allowed = (cap: string) => (caps ? caps.features[cap] !== false : true);
  const enabled = (key: ProgramFeatureKey) => features[key] !== false;
  // A confined member only sees a platform their role grants; admins see all.
  const granted = (area: string) => access.isAdmin || !!access.perms[area];

  async function setFeature(key: ProgramFeatureKey, on: boolean) {
    const prev = features;
    setFeatures((f) => ({ ...f, [key]: on }));
    setBusy(key);
    try {
      await updateProgramFeatures(programId, { ...prev, [key]: on });
    } catch (e) {
      setFeatures(prev);
      toast.error(e instanceof Error ? e.message : "Couldn't update the program's features");
    } finally {
      setBusy(null);
    }
  }

  // Nexus envelope: an ORG-level admin (no program-scoped membership here) is
  // bounced out of the workspace when the org isn't allowed to open programs.
  // Program-scoped people always keep workspace access.
  const hasProgramMembership = programMemberships.some((m) => m.program_id === programId);
  const enterBlocked = !hasProgramMembership && (caps ? caps.adminsEnterPrograms === false : false);
  useEffect(() => {
    if (access.loading || access.impersonating) return;
    if (!caps || !program) return; // wait until the envelope is known
    if (access.isAdmin && enterBlocked) {
      navigate(`/o/${orgId}/programs`, { replace: true });
    }
  }, [access.loading, access.isAdmin, access.impersonating, caps, program, enterBlocked, orgId, navigate]);

  // Program platform lock: this program's OWN people (they have a program-scoped
  // membership) can't open the platform runtimes when platforms_open is off.
  // Org admins (no program membership) set the lock, so it never applies to them.
  const platformsLocked = hasProgramMembership && program?.platforms_open === false;

  // Confined viewers (members / role previews) never see a half-loaded page:
  // one spinner until we know whether to auto-launch or what cards to paint.
  const confinedDeciding = !access.isAdmin && (access.loading || !caps || !program);

  const active = PROGRAM_PLATFORMS.filter((p) => allowed(p.cap) && enabled(p.key) && granted(p.key));
  // Only admins manage the envelope, so only they see the dashed "add" tiles.
  const addable = access.isAdmin ? PROGRAM_PLATFORMS.filter((p) => allowed(p.cap) && !enabled(p.key)) : [];

  // A real member whose entire access is a single platform is launched straight
  // into it — there's nothing else for them here. Previews (Test as) are not
  // redirected, so the admin doesn't get trapped in a full-screen surface.
  const otherAreas = NON_PLATFORM_AREAS.some((a) => access.perms[a]);
  const soleActiveKey = active.length === 1 ? active[0] : null;
  useEffect(() => {
    if (access.loading || access.isAdmin || access.impersonating) return;
    if (!caps || !program) return; // wait until the platform set is settled
    if (platformsLocked) return; // don't fling a member into a locked platform
    if (soleActiveKey && !otherAreas) {
      navigate(`/o/${orgId}/p/${programId}/${soleActiveKey.path}`, { replace: true });
    }
  }, [access.loading, access.isAdmin, access.impersonating, caps, program, platformsLocked, soleActiveKey, otherAreas, orgId, programId, navigate]);

  if (confinedDeciding) return <Spinner />;

  return (
    <div>
      <Head program={program} subtitle={program?.description ?? "Program workspace."} />
      <div className="mb-8 flex flex-wrap gap-2">
        <StatPill label="Offerings" value={offerings.length} />
        <StatPill label="Learners" value={program?.learner_count ?? 0} />
        <StatPill label="Courses" value={program?.course_count ?? 0} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {active.map((p) => (
          <PlatformCard
            key={p.key}
            icon={p.icon}
            title={p.title}
            hint={p.hint}
            busy={busy === p.key}
            canRemove={access.isAdmin}
            locked={platformsLocked}
            href={`${window.location.origin}/o/${orgId}/p/${programId}/${p.path}`}
            onRemove={() => setFeature(p.key, false)}
          />
        ))}
        {addable.map((p) => (
          <AddPlatformCard key={p.key} title={p.title} busy={busy === p.key} onAdd={() => setFeature(p.key, true)} />
        ))}
      </div>
    </div>
  );
}

function PlatformCard({
  icon,
  title,
  hint,
  busy,
  canRemove,
  locked,
  href,
  onRemove,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  busy: boolean;
  canRemove: boolean;
  locked?: boolean;
  href: string;
  onRemove: () => void;
}) {
  // Platforms locked for this program's people: show the card but make it
  // non-clickable, with a clear reason. (Org admins never see it locked.)
  if (locked) {
    return (
      <div
        className="relative flex items-center gap-4 glass-card p-5 opacity-70"
        title="Opening platforms is turned off for this program. Ask an org admin to enable platform access."
      >
        <div className="grid size-11 place-items-center rounded-xl bg-muted text-muted-foreground">{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 font-medium text-muted-foreground">
            {title}
            <Lock className="size-3.5" />
          </div>
          <div className="text-xs text-muted-foreground">Platform access is turned off for this program.</div>
        </div>
      </div>
    );
  }
  return (
    <div className="group relative flex items-center gap-4 glass-card p-5 hover:border-foreground/20 transition-colors">
      {canRemove ? (
        <ConfirmButton
          title={`Remove ${title} from this program?`}
          description="It disappears from the workspace. You can add it back anytime."
          actionLabel="Remove"
          onConfirm={onRemove}
          buttonTitle={`Remove ${title}`}
          className="absolute right-2 top-2 grid size-6 place-items-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-foreground transition"
        >
          {busy ? <span className="text-[10px]">…</span> : <X className="size-3.5" />}
        </ConfirmButton>
      ) : null}
      {/* Opens the platform in a new tab so the console stays put (no navigate
          away + back-and-forth). A real link → cmd/middle-click work too. */}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-1 items-center gap-4 text-left"
      >
        <div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-foreground">{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 font-medium text-foreground">
            {title}
            <ExternalLink className="size-3.5 text-muted-foreground" />
          </div>
          <div className="text-xs text-muted-foreground">{hint}</div>
        </div>
      </a>
    </div>
  );
}

function AddPlatformCard({ title, busy, onAdd }: { title: string; busy: boolean; onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={busy}
      className="flex items-center gap-4 rounded-[calc(var(--radius)+4px)] border border-dashed border-border p-5 text-left text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors disabled:opacity-50"
    >
      <div className="grid size-11 place-items-center rounded-xl border border-dashed border-border">
        <Plus className="size-5" />
      </div>
      <div className="min-w-0">
        <div className="font-medium">Add {title}</div>
        <div className="text-xs">Enable this platform for the program.</div>
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
                  {o.content_package ? <Pill tone="accent">Content Studio package</Pill> : null}
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
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invEmail, setInvEmail] = useState("");
  const [invName, setInvName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!programId) return;
    setRows(await listProgramRegistrations(programId).catch(() => [] as Registration[]));
  }, [programId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(id: string, kind: "approve" | "reject" | "remove") {
    try {
      if (kind === "approve") await approveRegistration(id);
      else if (kind === "reject") await rejectRegistration(id);
      else await removeRegistration(id);
      toast.success(
        kind === "approve" ? "Approved — participant has access" : kind === "reject" ? "Rejected" : "Removed — access revoked",
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  }

  async function invite() {
    if (!invEmail.trim()) return;
    setBusy(true);
    try {
      await inviteProgramParticipant(programId, { email: invEmail.trim(), name: invName.trim() || undefined });
      toast.success("Participant added to the program — access is active once they sign in");
      setInviteOpen(false);
      setInvEmail("");
      setInvName("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add participant");
    } finally {
      setBusy(false);
    }
  }

  // A row is a live participant (removable) once it's past the pending/declined
  // states. Pending signups use approve/reject instead.
  const isActive = (s: string) => !["pending_review", "rejected", "removed"].includes(s);
  // This is the CURRENT roster — terminal states (removed/rejected) drop off the
  // view. The records stay in the DB for audit; re-invite adds a fresh row.
  const shown = rows ? rows.filter((r) => !["removed", "rejected"].includes(r.status)) : null;

  return (
    <div>
      <Head
        program={program}
        subtitle="Students in this program — from the app, or added here. Staff go through Team & Roles."
        actions={
          <Button onClick={() => setInviteOpen(true)} disabled={!programId}>
            <Plus className="size-4" /> Invite participant
          </Button>
        }
      />
      {!shown ? (
        <Spinner />
      ) : shown.length === 0 ? (
        <EmptyState>No participants yet. Invite one, or wait for app signups.</EmptyState>
      ) : (
        <div className="glass-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Participant</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((r) => (
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
                    ) : isActive(r.status) ? (
                      <ConfirmButton
                        title={`Remove ${r.name ?? r.email ?? "this participant"}?`}
                        description="Revokes their access to this program's platforms immediately. Their record stays for audit; re-invite to restore. This can't be undone with one click."
                        actionLabel="Remove participant"
                        buttonTitle="Remove participant (revoke access)"
                        onConfirm={() => act(r.id, "remove")}
                      >
                        <Trash2 className="size-3.5" />
                      </ConfirmButton>
                    ) : (
                      <span className="text-xs text-muted-foreground">{r.status.replace(/_/g, " ")}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite participant to {program?.name ?? "this program"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="inv-email">Email</Label>
              <Input id="inv-email" type="email" value={invEmail} onChange={(e) => setInvEmail(e.target.value)} placeholder="student@example.org" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-name">Name (optional)</Label>
              <Input id="inv-name" value={invName} onChange={(e) => setInvName(e.target.value)} placeholder="Full name" />
            </div>
            <p className="text-xs text-muted-foreground">
              Adds the student to the <strong>program</strong> with learner access to its platforms. They reach it by
              signing into the app with this email — a "set your password" link for brand-new students is coming with
              the claim flow.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button onClick={invite} disabled={busy || !invEmail.trim()}>
              {busy ? "Adding…" : "Add participant"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ProgramGates() {
  const { program, programId } = useProgram();
  const [gates, setGates] = useState<Gate[] | null>(null);
  const [requests, setRequests] = useState<GateRequest[] | null>(null);
  const [roles, setRoles] = useState<ProgramRole[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [audience, setAudience] = useState<GateAudience>("participant");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [allowSignin, setAllowSignin] = useState(true);
  const [allowSignup, setAllowSignup] = useState(true);
  const [approval, setApproval] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!programId) return;
    listGates(programId).then(setGates).catch(() => setGates([]));
    // Member-gate requests only; participants are approved in Registrations.
    listProgramGateRequests(programId).then(setRequests).catch(() => setRequests([]));
    listProgramRoles(programId).then(setRoles).catch(() => setRoles([]));
  }, [programId]);
  useEffect(() => load(), [load]);

  function gateUrl(g: Gate): string {
    return `${window.location.origin}/@/${g.org_slug ?? ""}/${g.slug}`;
  }

  async function decide(r: GateRequest, approve: boolean) {
    try {
      if (approve) await approveProgramGateRequest(programId, r.id);
      else await rejectProgramGateRequest(programId, r.id);
      toast.success(approve ? `Approved ${r.email}` : `Rejected ${r.email}`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function create() {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await createGate(programId, {
        title: title.trim(),
        audience,
        role_ids: audience === "member" ? roleIds : [],
        // Participant gates are sign-up only — students sign in through the app.
        allow_signin: audience === "member" ? allowSignin : false,
        allow_signup: allowSignup,
        approval_required: approval,
      });
      toast.success("Gate created");
      setOpen(false);
      setTitle("");
      setRoleIds([]);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create gate");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Head
        program={program}
        subtitle="Sign-up / sign-in pages for this program, each at its own URL."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Add a gate
          </Button>
        }
      />
      {requests && requests.length > 0 ? (
        <Section title="Waiting for approval">
          <div className="glass-card divide-y divide-border">
            {requests.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="font-medium text-foreground truncate">{r.display_name || r.email}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {r.email}
                    {r.role_name ? <> · role: <span className="text-foreground">{r.role_name}</span></> : " · no role"}
                    {r.gate_title ? <> · via {r.gate_title}</> : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={() => decide(r, false)} title="Reject">
                    <X className="size-4" /> Reject
                  </Button>
                  <Button size="sm" onClick={() => decide(r, true)} title="Approve">
                    <Check className="size-4" /> Approve
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}
      {!gates ? (
        <Spinner />
      ) : gates.length === 0 ? (
        <EmptyState>No gates yet. Add one to give this program its own sign-in / sign-up page at its own URL.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {gates.map((g) => (
            <div key={g.id} className="glass-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-foreground truncate">{g.title || g.slug}</div>
                  {g.subtitle ? <div className="text-xs text-muted-foreground truncate">{g.subtitle}</div> : null}
                </div>
                <ConfirmButton
                  title={`Delete gate "${g.title || g.slug}"?`}
                  description="The page at this URL stops working. People already admitted keep their access."
                  actionLabel="Delete gate"
                  buttonTitle="Delete gate"
                  onConfirm={async () => {
                    try {
                      await deleteGate(g.id);
                      toast.success("Gate deleted");
                      load();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Failed to delete gate");
                    }
                  }}
                >
                  <Trash2 className="size-3.5" />
                </ConfirmButton>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Pill tone={g.audience === "member" ? "warn" : "neutral"}>
                  {g.audience === "member" ? "team members" : "participants"}
                </Pill>
                {g.allow_signin ? <Pill tone="positive">sign-in</Pill> : null}
                {g.allow_signup ? <Pill tone="positive">sign-up</Pill> : null}
                {g.approval_required ? <Pill tone="warn">approval</Pill> : null}
              </div>
              <button
                onClick={() => {
                  void navigator.clipboard?.writeText(gateUrl(g));
                  toast.success("Gate URL copied");
                }}
                className="mt-3 w-full truncate rounded-md bg-secondary px-2.5 py-1.5 text-left font-mono text-xs text-secondary-foreground hover:opacity-80"
                title={gateUrl(g)}
              >
                {gateUrl(g)}
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a gate to {program?.name ?? "this program"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="gate-title">Title</Label>
              <Input id="gate-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Bridge Team" />
            </div>
            <div className="space-y-1.5">
              <Label>This gate is for</Label>
              <Select value={audience} onValueChange={(v) => setAudience(v as GateAudience)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="participant">Participants (students → Registrations)</SelectItem>
                  <SelectItem value="member">Team members (staff → Team &amp; Roles)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {audience === "member" ? (
              <div className="space-y-1.5">
                <Label>Roles people can join as</Label>
                {roles.length === 0 ? (
                  <p className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground">
                    No roles yet — create one in Team &amp; Roles first.
                  </p>
                ) : (
                  <>
                    <div className="rounded-lg border border-border divide-y divide-border">
                      {roles.map((r) => {
                        const checked = roleIds.includes(r.id);
                        return (
                          <label key={r.id} className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-accent/40">
                            <input
                              type="checkbox"
                              className="size-4 accent-[var(--primary)]"
                              checked={checked}
                              onChange={(e) =>
                                setRoleIds((cur) => (e.target.checked ? [...cur, r.id] : cur.filter((id) => id !== r.id)))
                              }
                            />
                            <span className="text-foreground">{r.name}</span>
                          </label>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {roleIds.length > 1
                        ? "People choose one of these roles when they sign up."
                        : roleIds.length === 1
                          ? "Everyone who joins gets this role."
                          : "Pick one or more roles to offer at sign-up."}
                    </p>
                  </>
                )}
              </div>
            ) : null}
            {/* Members can sign in at the gate (it's their door). Students sign
                in through the app, so a participant gate is sign-up only. */}
            {audience === "member" ? (
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={allowSignin} onCheckedChange={setAllowSignin} /> Allow sign-in
              </label>
            ) : null}
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={allowSignup} onCheckedChange={setAllowSignup} /> Allow sign-up
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={approval} onCheckedChange={setApproval} /> Require approval for sign-ups
            </label>
            <p className="text-xs text-muted-foreground">
              Creates a page at <span className="font-mono">/@/&lt;org&gt;/&lt;title&gt;</span> where people join this
              program. {audience === "member"
                ? "People who enter become staff members with the chosen role (Team & Roles)."
                : "Students sign up here, then sign in through the app — they become learner participants (Registrations)."}
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={create} disabled={busy || !title.trim()}>
              {busy ? "Creating…" : "Create gate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  const access = useProgramAccess(programId);
  const [apps, setApps] = useState<RegisteredApp[] | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  // The App Studio's capability catalogue — shown at this governing level (it
  // decides what people can see/do inside the Studio, so it must never live
  // inside the Studio itself). Admin-only.
  const [showCatalogue, setShowCatalogue] = useState(false);

  const load = useCallback(() => {
    if (programId) listApps(programId).then(setApps).catch(() => setApps([]));
  }, [programId]);
  useEffect(() => load(), [load]);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createApp(programId, { app_name: name.trim() });
      setName("");
      setOpen(false);
      toast.success("App Studio created — click its card to design it in the Studio");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create App Studio");
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
          <>
            {access.isAdmin && (
              <Button
                variant={showCatalogue ? "secondary" : "outline"}
                onClick={() => setShowCatalogue((v) => !v)}
                title="The capability catalogue the App Studio publishes — what roles can grant for the Studio and published apps"
              >
                <ShieldCheck className="size-4" /> Access Catalogue
              </Button>
            )}
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> New App
            </Button>
          </>
        }
      />
      {showCatalogue && access.isAdmin ? (
        <AppShellAccessCatalogue />
      ) : !apps ? (
        <Spinner />
      ) : apps.length === 0 ? (
        <EmptyState>No App Studios yet. Create one and configure its screens.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {apps.map((a) => (
            <div
              key={a.id}
              role="button"
              tabIndex={0}
              onClick={() => openInStudio(a, orgId, programId)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openInStudio(a, orgId, programId);
                }
              }}
              className="glass-card cursor-pointer p-4 hover:border-foreground/20 transition-colors"
              title="Open in the App Studio with your current session"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-foreground truncate">{a.app_name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{a.app_slug}</div>
                </div>
                <Pill tone={statusTone(a.status)}>{a.status}</Pill>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>Open in Studio ↗</span>
                <div
                  className="flex items-center gap-1"
                  onClick={(e) => {
                    // Actions in this corner must not also open the Studio.
                    e.stopPropagation();
                  }}
                >
                  <ConfirmButton
                    title={`Delete "${a.app_name}"?`}
                    description="Removes this App Studio from the organization's space, including its published config versions and launch tokens. Published links stop working immediately. Offerings and registrations that referenced it are kept, detached. This can't be undone."
                    actionLabel="Delete App Studio"
                    buttonTitle="Delete this App Studio"
                    onConfirm={async () => {
                      try {
                        await deleteApp(a.id);
                        toast.success(`"${a.app_name}" deleted`);
                        load();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Failed to delete App Studio");
                      }
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </ConfirmButton>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New App</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="app-name">App name</Label>
            <Input id="app-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Brain Bee App" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={create} disabled={busy || !name.trim()}>
              {busy ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

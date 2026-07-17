/**
 * Nexus operator → Organizations. The operator provisions and governs the
 * boundary; it can never enter an org's interior (§3.5). Provisioning creates
 * the org + default entitlements and invites its named administrators (first
 * = owner) — no password is ever set on their behalf.
 */
import { useEffect, useState } from "react";

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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import {
  getOrgCapabilities,
  listAllOrganizations,
  listEntitlements,
  provisionOrganization,
  setEntitlement,
  setOrgCapabilities,
  type OrgCapabilities,
  type OrgSummary,
  type ProvisionResult,
} from "@/services/api";
import type { Entitlement, ModuleKey } from "@/types/platform";
import { Switch } from "@/app/components/ui/switch";
import { EmptyState, PageHeader, Pill, Spinner, Stat, statusTone } from "@/nexus/ui/kit";
import { Copy, Plus, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

export function OperatorOrgs() {
  const [orgs, setOrgs] = useState<OrgSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [govern, setGovern] = useState<OrgSummary | null>(null);

  async function load() {
    try {
      setOrgs(await listAllOrganizations());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load organizations");
    }
  }
  useEffect(() => {
    void load();
  }, []);

  if (error) return <EmptyState>{error}</EmptyState>;
  if (!orgs) return <Spinner />;

  const active = orgs.filter((o) => (o.status ?? "active") === "active").length;

  return (
    <div>
      <PageHeader
        title="Organizations"
        subtitle="Top-level tenants provisioned on Nexus."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Provision
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 mb-8 sm:grid-cols-3">
        <Stat label="Organizations" value={orgs.length} />
        <Stat label="Active" value={active} />
        <Stat label="Isolation" value="OK" hint="tenant walls enforced" />
      </div>

      {orgs.length === 0 ? (
        <EmptyState>No organizations yet. Provision the first one.</EmptyState>
      ) : (
        <div className="glass-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Governance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <div className="font-medium text-foreground">{o.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{o.slug}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{o.organization_type ?? "—"}</TableCell>
                  <TableCell>
                    <Pill tone={statusTone(o.status ?? "active")}>{o.status ?? "active"}</Pill>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setGovern(o)}>
                      <SlidersHorizontal className="size-3.5" /> Govern
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ProvisionDialog open={open} onOpenChange={setOpen} onDone={load} />
      <GovernDialog org={govern} onClose={() => setGovern(null)} />
    </div>
  );
}

const GOVERNABLE_MODULES: { key: ModuleKey; label: string; hint: string }[] = [
  { key: "learning", label: "Learning", hint: "Courses, lessons, and the Learning Platform." },
  { key: "coaching", label: "Coaching", hint: "Coach-driven programs and app runtimes." },
  { key: "analytics", label: "Analytics", hint: "Cross-program reporting." },
];

const PROGRAM_TYPE_LABELS: Record<string, string> = { edu: "Education programs", game: "Game programs" };
const OFFERING_TYPE_LABELS: Record<string, string> = { course: "Courses", challenge: "Challenges", app: "Applications" };
const FEATURE_LABELS: Record<string, string> = {
  learningPlatform: "Learning Platform",
  appShells: "App Shell",
  bridge: "Bridge Platform",
  integrations: "Integrations",
};

/** A row of capability toggles for one section (programTypes / offeringTypes / features). */
function CapabilityRow({
  labels,
  values,
  disabled,
  onToggle,
}: {
  labels: Record<string, string>;
  values: Record<string, boolean>;
  disabled: boolean;
  onToggle: (key: string, on: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {Object.entries(labels).map(([key, label]) => (
        <label
          key={key}
          className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
        >
          <span className="truncate">{label}</span>
          <Switch checked={!!values[key]} disabled={disabled} onCheckedChange={(v) => onToggle(key, v)} />
        </label>
      ))}
    </div>
  );
}

/** Boundary governance: toggle the modules this org is entitled to, and its capability envelope. */
function GovernDialog({ org, onClose }: { org: OrgSummary | null; onClose: () => void }) {
  const [ents, setEnts] = useState<Entitlement[] | null>(null);
  const [caps, setCaps] = useState<OrgCapabilities | null>(null);
  const [saving, setSaving] = useState<ModuleKey | null>(null);
  const [capsBusy, setCapsBusy] = useState(false);

  useEffect(() => {
    if (!org) {
      setEnts(null);
      setCaps(null);
      return;
    }
    listEntitlements(org.id)
      .then(setEnts)
      .catch(() => setEnts([]));
    getOrgCapabilities(org.id)
      .then(setCaps)
      .catch(() => setCaps(null));
  }, [org]);

  function statusOf(m: ModuleKey): string {
    return ents?.find((e) => e.module === m)?.status ?? "disabled";
  }

  async function toggle(m: ModuleKey, on: boolean) {
    if (!org) return;
    setSaving(m);
    try {
      const updated = await setEntitlement(org.id, m, on ? "active" : "disabled");
      setEnts((cur) => {
        const rest = (cur ?? []).filter((e) => e.module !== m);
        return [...rest, updated];
      });
      toast.success(`${m} ${on ? "enabled" : "disabled"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update entitlement");
    } finally {
      setSaving(null);
    }
  }

  async function toggleCap(section: keyof OrgCapabilities, key: string, on: boolean) {
    if (!org) return;
    setCapsBusy(true);
    try {
      const updated = await setOrgCapabilities(org.id, { [section]: { [key]: on } });
      setCaps(updated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update capability");
    } finally {
      setCapsBusy(false);
    }
  }

  return (
    <Dialog open={!!org} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Govern · {org?.name}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-1">
          Boundary controls only — Nexus grants module access and capabilities; it never sees inside the org.
        </p>
        <div className="space-y-3 mt-2">
          {!ents ? (
            <Spinner />
          ) : (
            GOVERNABLE_MODULES.map((m) => {
              const on = statusOf(m.key) === "active";
              return (
                <div key={m.key} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground capitalize">{m.label}</div>
                    <div className="text-xs text-muted-foreground">{m.hint}</div>
                  </div>
                  <Switch checked={on} disabled={saving === m.key} onCheckedChange={(v) => toggle(m.key, v)} />
                </div>
              );
            })
          )}
          <div className="flex items-center justify-between rounded-lg border border-dashed border-border px-4 py-3 opacity-70">
            <div className="text-sm font-medium text-foreground">Nexus</div>
            <span className="text-xs text-muted-foreground">always on</span>
          </div>
        </div>

        {caps ? (
          <div className="space-y-3 mt-1 border-t border-border pt-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Capability envelope</div>
            <div>
              <div className="text-xs text-muted-foreground mb-1.5">Program categories this org may create</div>
              <CapabilityRow
                labels={PROGRAM_TYPE_LABELS}
                values={caps.programTypes}
                disabled={capsBusy}
                onToggle={(k, v) => toggleCap("programTypes", k, v)}
              />
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1.5">Offering types this org may publish</div>
              <CapabilityRow
                labels={OFFERING_TYPE_LABELS}
                values={caps.offeringTypes}
                disabled={capsBusy}
                onToggle={(k, v) => toggleCap("offeringTypes", k, v)}
              />
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1.5">Platform features</div>
              <CapabilityRow
                labels={FEATURE_LABELS}
                values={caps.features}
                disabled={capsBusy}
                onToggle={(k, v) => toggleCap("features", k, v)}
              />
            </div>
          </div>
        ) : null}

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

/**
 * The operator's provisioning event: name the org and its administrators
 * (the first becomes owner). No password is set here — each administrator
 * gets an activation link and sets their own on first sign-in.
 */
function ProvisionDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [admins, setAdmins] = useState<AdminDraft[]>([{ email: "", displayName: "" }]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ProvisionResult | null>(null);

  function reset() {
    setName("");
    setAdmins([{ email: "", displayName: "" }]);
    setResult(null);
  }

  function updateAdmin(i: number, patch: Partial<AdminDraft>) {
    setAdmins((cur) => cur.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }

  const validAdmins = admins.filter((a) => a.email.trim());

  async function submit() {
    if (!name.trim() || validAdmins.length === 0) return;
    setBusy(true);
    try {
      const res = await provisionOrganization(
        name.trim(),
        validAdmins.map((a) => ({ email: a.email.trim(), display_name: a.displayName.trim() || undefined })),
      );
      setResult(res);
      toast.success(`Provisioned ${name.trim()}`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Provision failed");
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Provision organization</DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {result.organization.name} is live. Share each activation link — they set their own
              password on first sign-in.
            </p>
            {result.invitations.map((inv) => (
              <div key={inv.invitation_id} className="rounded-lg border border-border p-3 space-y-1.5">
                <div className="text-sm font-medium text-foreground">
                  {inv.email} <span className="text-xs text-muted-foreground">· {inv.role}</span>
                </div>
                <div className="flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1.5">
                  <code className="flex-1 truncate text-xs font-mono">{inv.redeem_url}</code>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(inv.redeem_url);
                      toast.success("Copied");
                    }}
                    className="grid size-6 place-items-center rounded hover:bg-accent shrink-0"
                  >
                    <Copy className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="org-name">Organization name</Label>
              <Input
                id="org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Riverside Robotics Lab"
              />
            </div>
            <div className="space-y-2">
              <Label>
                Administrators <span className="text-xs font-normal text-muted-foreground">the first becomes owner</span>
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
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={busy || !name.trim() || validAdmins.length === 0}>
                {busy ? "Provisioning…" : "Provision"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

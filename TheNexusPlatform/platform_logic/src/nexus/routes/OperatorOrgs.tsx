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
  addOrgAdmin,
  checkOrgSlug,
  getOrgCapabilities,
  listAllOrganizations,
  listOrgAdmins,
  provisionOrganization,
  removeOrgAdmin,
  setOrgCapabilities,
  type OrgAdmin,
  type OrgCapabilities,
  type OrgSummary,
  type ProvisionResult,
} from "@/services/api";
import { PROGRAM_FEATURES } from "@/types/platform";
import { ConfirmButton } from "@/nexus/ui/ConfirmButton";
import { Switch } from "@/app/components/ui/switch";
import { EmptyState, PageHeader, Pill, Spinner, StatPill, statusTone } from "@/nexus/ui/kit";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

/** Mirrors the backend slug rule so the preview matches the real URL. */
const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

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
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Provision
          </Button>
        }
      />

      <div className="mb-8 flex flex-wrap gap-2">
        <StatPill label="Organizations" value={orgs.length} />
        <StatPill label="Active" value={active} />
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
                <TableHead className="text-right">Actions</TableHead>
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
                      <Pencil className="size-3.5" /> Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ProvisionDialog open={open} onOpenChange={setOpen} onDone={load} />
      <EditOrgDialog org={govern} onClose={() => setGovern(null)} />
    </div>
  );
}

/**
 * Nexus "Edit" for one org — boundary controls only (§3.5): program capacity,
 * which feature-areas the org may use (same six keys as per-program features;
 * a key off here disappears from the org's own Features dialogs and every
 * program's UI), and who administers the org.
 */
function EditOrgDialog({ org, onClose }: { org: OrgSummary | null; onClose: () => void }) {
  const [caps, setCaps] = useState<OrgCapabilities | null>(null);
  const [capsBusy, setCapsBusy] = useState(false);
  const [capacityDraft, setCapacityDraft] = useState<string>("");
  const [admins, setAdmins] = useState<OrgAdmin[] | null>(null);
  const [newAdmin, setNewAdmin] = useState({ email: "", displayName: "" });
  const [adminBusy, setAdminBusy] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  function loadAdmins(orgId: string) {
    listOrgAdmins(orgId)
      .then(setAdmins)
      .catch(() => setAdmins([]));
  }

  useEffect(() => {
    if (!org) {
      setCaps(null);
      setAdmins(null);
      setInviteLink(null);
      setNewAdmin({ email: "", displayName: "" });
      return;
    }
    getOrgCapabilities(org.id)
      .then((c) => {
        setCaps(c);
        setCapacityDraft(c.programCapacity != null ? String(c.programCapacity) : "");
      })
      .catch(() => setCaps(null));
    loadAdmins(org.id);
  }, [org]);

  async function patchCaps(patch: Partial<OrgCapabilities>) {
    if (!org) return;
    setCapsBusy(true);
    try {
      const updated = await setOrgCapabilities(org.id, patch);
      setCaps(updated);
      if ("programCapacity" in patch) {
        setCapacityDraft(updated.programCapacity != null ? String(updated.programCapacity) : "");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setCapsBusy(false);
    }
  }

  async function addAdmin() {
    if (!org || !newAdmin.email.trim()) return;
    setAdminBusy(true);
    try {
      const inv = await addOrgAdmin(org.id, {
        email: newAdmin.email.trim(),
        display_name: newAdmin.displayName.trim() || undefined,
      });
      setInviteLink(inv.redeem_url ?? (inv.token ? `${window.location.origin}/invite/${inv.token}` : null));
      setNewAdmin({ email: "", displayName: "" });
      loadAdmins(org.id);
      toast.success("Administrator invited");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to invite administrator");
    } finally {
      setAdminBusy(false);
    }
  }

  async function removeAdmin(a: OrgAdmin) {
    if (!org) return;
    try {
      await removeOrgAdmin(org.id, {
        membership_id: a.membership_id ?? undefined,
        invitation_id: a.invitation_id ?? undefined,
      });
      toast.success(`${a.display_name ?? a.email} removed`);
      loadAdmins(org.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove administrator");
    }
  }

  const capacityOn = caps?.programCapacity != null;

  return (
    <Dialog open={!!org} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit · {org?.name}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-1">
          Boundary controls only — Nexus sets the org's envelope; it never sees inside the org.
        </p>

        {!caps ? (
          <Spinner />
        ) : (
          <div className="space-y-5 mt-1">
            {/* Program capacity */}
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
                Program capacity
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">Limit programs</div>
                  <div className="text-xs text-muted-foreground">
                    {capacityOn ? "The org can't create more than this many programs." : "Off — unlimited programs."}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {capacityOn ? (
                    <Input
                      type="number"
                      min={1}
                      value={capacityDraft}
                      onChange={(e) => setCapacityDraft(e.target.value)}
                      onBlur={() => {
                        const n = parseInt(capacityDraft, 10);
                        if (Number.isFinite(n) && n >= 1) void patchCaps({ programCapacity: n });
                      }}
                      className="w-20 h-8"
                      disabled={capsBusy}
                    />
                  ) : null}
                  <Switch
                    checked={capacityOn}
                    disabled={capsBusy}
                    onCheckedChange={(on) => void patchCaps({ programCapacity: on ? 3 : null })}
                  />
                </div>
              </div>
            </div>

            {/* Program features */}
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
                Program features
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                A feature off here disappears from every program in the org — and from the org's own
                per-program Features dialog.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {PROGRAM_FEATURES.map((f) => (
                  <label
                    key={f.key}
                    className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <span className="truncate">{f.label}</span>
                    <Switch
                      checked={caps.features[f.key] !== false}
                      disabled={capsBusy}
                      onCheckedChange={(v) => void patchCaps({ features: { [f.key]: v } })}
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* "Admins can open programs" now lives in the org's own Settings tab,
                controlled by the org owner (Super Admin) — not here. */}

            {/* Administrators */}
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
                Administrators
              </div>
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
                          {a.email} · {a.role}
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
                              : "They lose administrator access to this organization immediately."
                          }
                          actionLabel="Remove"
                          onConfirm={() => removeAdmin(a)}
                          buttonTitle="Remove administrator"
                        >
                          <Trash2 className="size-3.5 text-red-600 dark:text-red-400" />
                        </ConfirmButton>
                      )}
                    </div>
                  ))}
                  {admins.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No administrators yet.</p>
                  ) : null}
                  <div className="flex gap-2 pt-1">
                    <Input
                      value={newAdmin.displayName}
                      onChange={(e) => setNewAdmin((c) => ({ ...c, displayName: e.target.value }))}
                      placeholder="Name"
                      className="flex-1"
                    />
                    <Input
                      value={newAdmin.email}
                      onChange={(e) => setNewAdmin((c) => ({ ...c, email: e.target.value }))}
                      placeholder="email@example.org"
                      className="flex-1"
                    />
                    <Button size="sm" onClick={addAdmin} disabled={adminBusy || !newAdmin.email.trim()}>
                      <Plus className="size-3.5" /> Add
                    </Button>
                  </div>
                  {inviteLink ? (
                    <div className="flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1.5">
                      <code className="flex-1 truncate text-xs font-mono">{inviteLink}</code>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard?.writeText(inviteLink);
                          toast.success("Copied");
                        }}
                        className="grid size-6 place-items-center rounded hover:bg-accent shrink-0"
                      >
                        <Copy className="size-3.5" />
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
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
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [admins, setAdmins] = useState<AdminDraft[]>([{ email: "", displayName: "" }]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ProvisionResult | null>(null);
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");

  // Until the operator edits the slug, it tracks the name (a sensible default).
  const effectiveSlug = slugify(slugEdited ? slug : name);

  function reset() {
    setName("");
    setSlug("");
    setSlugEdited(false);
    setAdmins([{ email: "", displayName: "" }]);
    setResult(null);
    setSlugStatus("idle");
  }

  // Debounced availability check against the normalized slug.
  useEffect(() => {
    if (!effectiveSlug) {
      setSlugStatus("idle");
      return;
    }
    setSlugStatus("checking");
    let live = true;
    const t = setTimeout(() => {
      checkOrgSlug(effectiveSlug)
        .then((r) => live && setSlugStatus(r.available ? "available" : "taken"))
        .catch(() => live && setSlugStatus("idle"));
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [effectiveSlug]);

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
        effectiveSlug || undefined,
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
              {result.organization.name} is live. Each administrator is an active member now — share the
              temporary password with any new accounts.
            </p>
            {result.admins.map((a) => (
              <div key={a.email} className="rounded-lg border border-border p-3 space-y-1.5">
                <div className="text-sm font-medium text-foreground">
                  {a.email} <span className="text-xs text-muted-foreground">· {a.role}</span>
                </div>
                {a.created && a.temp_password ? (
                  <div className="flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1.5">
                    <span className="text-xs text-muted-foreground shrink-0">Temp password:</span>
                    <code className="flex-1 truncate text-xs font-mono">{a.temp_password}</code>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(a.temp_password!);
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
              <Label htmlFor="org-name">Organization name</Label>
              <Input
                id="org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Riverside Robotics Lab"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="org-slug">URL slug</Label>
              <Input
                id="org-slug"
                value={slugEdited ? slug : effectiveSlug}
                onChange={(e) => {
                  setSlugEdited(true);
                  setSlug(e.target.value);
                }}
                placeholder="riverside-robotics"
              />
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-mono text-muted-foreground truncate">
                  nexus /@/{effectiveSlug || "…"}
                </span>
                {!effectiveSlug ? null : slugStatus === "checking" ? (
                  <span className="text-muted-foreground shrink-0">Checking…</span>
                ) : slugStatus === "available" ? (
                  <span className="text-emerald-600 dark:text-emerald-400 shrink-0">Available</span>
                ) : slugStatus === "taken" ? (
                  <span className="text-red-600 dark:text-red-400 shrink-0">Taken — pick another</span>
                ) : null}
              </div>
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
              <Button
                onClick={submit}
                disabled={busy || !name.trim() || validAdmins.length === 0 || !effectiveSlug || slugStatus === "taken" || slugStatus === "checking"}
              >
                {busy ? "Provisioning…" : "Provision"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

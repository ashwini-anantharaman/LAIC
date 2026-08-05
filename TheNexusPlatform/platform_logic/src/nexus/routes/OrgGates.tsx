/**
 * Org-level gates — org-scoped staff onboarding pages, each at its own URL.
 * Members only: someone who enters becomes an org-level member with the chosen
 * org role (Team & Roles). Mirrors the program Gates surface, one altitude up.
 */
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router";
import { Check, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Switch } from "@/app/components/ui/switch";
import { Label } from "@/app/components/ui/label";
import {
  approveOrgGateRequest,
  createOrgGate,
  deleteGate,
  listOrgGateRequests,
  listOrgGates,
  listOrgScopedRoles,
  rejectOrgGateRequest,
  type Gate,
  type GateRequest,
  type ScopedRole,
} from "@/services/api";
import { EmptyState, PageHeader, Pill, Section, Spinner } from "@/nexus/ui/kit";
import { ConfirmButton } from "@/nexus/ui/ConfirmButton";

export function OrgGates() {
  const { orgId = "" } = useParams();
  const [gates, setGates] = useState<Gate[] | null>(null);
  const [requests, setRequests] = useState<GateRequest[] | null>(null);
  const [roles, setRoles] = useState<ScopedRole[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [allowSignin, setAllowSignin] = useState(true);
  const [allowSignup, setAllowSignup] = useState(true);
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!orgId) return;
    listOrgGates(orgId).then(setGates).catch(() => setGates([]));
    listOrgGateRequests(orgId).then(setRequests).catch(() => setRequests([]));
    listOrgScopedRoles(orgId).then(setRoles).catch(() => setRoles([]));
  }, [orgId]);
  useEffect(() => load(), [load]);

  function gateUrl(g: Gate): string {
    return `${window.location.origin}/@/${g.org_slug ?? ""}/${g.slug}`;
  }

  async function create() {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await createOrgGate(orgId, {
        title: title.trim(),
        role_ids: roleIds,
        allow_signin: allowSignin,
        allow_signup: allowSignup,
        approval_required: approvalRequired,
      });
      toast.success("Gate created");
      setOpen(false);
      setTitle("");
      setRoleIds([]);
      setApprovalRequired(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create gate");
    } finally {
      setBusy(false);
    }
  }

  async function decide(r: GateRequest, approve: boolean) {
    try {
      if (approve) await approveOrgGateRequest(orgId, r.id);
      else await rejectOrgGateRequest(orgId, r.id);
      toast.success(approve ? `Approved ${r.email}` : `Rejected ${r.email}`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div>
      <PageHeader
        title="Gates"
        subtitle="People who enter join this organization's staff with the role you choose."
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
        <EmptyState>No org gates yet. Add one to give your organization its own staff sign-up page at its own URL.</EmptyState>
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
                <Pill tone="warn">org staff</Pill>
                {g.approval_required ? <Pill tone="accent">approval required</Pill> : null}
                {g.allow_signin ? <Pill tone="positive">sign-in</Pill> : null}
                {g.allow_signup ? <Pill tone="positive">sign-up</Pill> : null}
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
            <DialogTitle>Add an organization gate</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="og-title">Title</Label>
              <Input id="og-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Staff Onboarding" />
            </div>
            <div className="space-y-1.5">
              <Label>Roles people can join as</Label>
              {roles.length === 0 ? (
                <p className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground">
                  No org roles yet — create one in Team &amp; Roles first.
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
                        : "Pick one or more org roles to offer at sign-up."}
                  </p>
                </>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={allowSignin} onCheckedChange={setAllowSignin} /> Allow sign-in
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={allowSignup} onCheckedChange={setAllowSignup} /> Allow sign-up
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={approvalRequired} onCheckedChange={setApprovalRequired} /> Require approval
            </label>
            <p className="text-xs text-muted-foreground">
              Creates a page at <span className="font-mono">/@/&lt;org&gt;/&lt;title&gt;</span> where people join this
              organization as staff with the chosen org role (Team &amp; Roles).
              {approvalRequired
                ? " Sign-ups wait in “Waiting for approval” until you admit them."
                : " Sign-ups are admitted immediately."}
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

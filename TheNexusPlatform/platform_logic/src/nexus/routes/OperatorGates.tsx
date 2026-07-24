/**
 * Nexus (operator) gates — platform-altitude self-sign-up pages, plus the
 * mandatory approval queue. Full operators (platform_admin) only.
 *
 * Two guardrails are structural, enforced server-side and surfaced here:
 *   • every operator gate is approval-gated — signing up raises a request,
 *     it never grants access directly;
 *   • gates may only offer confined nexus roles, never full platform admin.
 */
import { useCallback, useEffect, useState } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Switch } from "@/app/components/ui/switch";
import { Label } from "@/app/components/ui/label";
import {
  approveNexusGateRequest,
  createNexusGate,
  deleteNexusGate,
  listNexusGateRequests,
  listNexusGates,
  listNexusScopedRoles,
  rejectNexusGateRequest,
  type Gate,
  type GateRequest,
  type ScopedRole,
} from "@/services/api";
import { EmptyState, PageHeader, Pill, Section, Spinner } from "@/nexus/ui/kit";
import { ConfirmButton } from "@/nexus/ui/ConfirmButton";

export function OperatorGates() {
  const [gates, setGates] = useState<Gate[] | null>(null);
  const [requests, setRequests] = useState<GateRequest[] | null>(null);
  const [roles, setRoles] = useState<ScopedRole[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [allowSignin, setAllowSignin] = useState(true);
  const [allowSignup, setAllowSignup] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    listNexusGates().then(setGates).catch(() => setGates([]));
    listNexusGateRequests("pending").then(setRequests).catch(() => setRequests([]));
    listNexusScopedRoles().then(setRoles).catch(() => setRoles([]));
  }, []);
  useEffect(() => load(), [load]);

  function gateUrl(g: Gate): string {
    return `${window.location.origin}/op/${g.slug}`;
  }

  async function create() {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await createNexusGate({ title: title.trim(), role_ids: roleIds, allow_signin: allowSignin, allow_signup: allowSignup });
      toast.success("Operator gate created");
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

  async function decide(r: GateRequest, approve: boolean) {
    try {
      if (approve) await approveNexusGateRequest(r.id);
      else await rejectNexusGateRequest(r.id);
      toast.success(approve ? `Approved ${r.email}` : `Rejected ${r.email}`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div>
      <PageHeader
        title="Operator gates"
        subtitle="Self-sign-up pages for platform operators. Every request needs your approval, and gates grant a confined operator role only — never full platform admin."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Add a gate
          </Button>
        }
      />

      <Section title="Awaiting approval">
        {!requests ? (
          <Spinner />
        ) : requests.length === 0 ? (
          <EmptyState>No pending requests. When someone signs up through an operator gate, they'll appear here for you to approve.</EmptyState>
        ) : (
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
        )}
      </Section>

      <Section title="Gates">
        {!gates ? (
          <Spinner />
        ) : gates.length === 0 ? (
          <EmptyState>No operator gates yet. Add one to give people a self-sign-up page for confined operator access.</EmptyState>
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
                    description="The page at this URL stops working. Operators already approved keep their access."
                    actionLabel="Delete gate"
                    buttonTitle="Delete gate"
                    onConfirm={async () => {
                      try {
                        await deleteNexusGate(g.id);
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
                  <Pill tone="warn">operator</Pill>
                  <Pill tone="accent">approval required</Pill>
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
      </Section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add an operator gate</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ng-title">Title</Label>
              <Input id="ng-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Support Operator Sign-up" />
            </div>
            <div className="space-y-1.5">
              <Label>Operator role people can request</Label>
              {roles.length === 0 ? (
                <p className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground">
                  No confined operator roles yet — create one in People first.
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
                      ? "People choose one of these roles when they request access."
                      : roleIds.length === 1
                        ? "Approved requests get this role."
                        : "Pick the confined operator role(s) to offer. Full platform admin can't be offered through a gate."}
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
            <p className="text-xs text-muted-foreground">
              Creates a page at <span className="font-mono">/op/&lt;title&gt;</span>. Sign-ups raise a request you must
              approve before the person gets any operator access.
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

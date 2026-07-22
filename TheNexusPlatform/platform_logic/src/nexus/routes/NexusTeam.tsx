/**
 * Nexus operator → Team & Roles: who operates the platform. Full operators
 * see/do everything; confined operators carry a platform-scope custom role
 * over the console's REAL surfaces (Organizations view/edit, Audit, Settings).
 * Managed by full operators only. The org people walls are untouched — this
 * is strictly about who runs Nexus.
 */
import { useCallback, useEffect, useState } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
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
  createNexusScopedRole,
  deleteProgramRole,
  inviteNexusOperator,
  listNexusScopedRoles,
  listNexusTeam,
  removeNexusOperator,
  setNexusTeamRole,
  type NexusOperator,
  type ScopedRole,
} from "@/services/api";
import { EmptyState, PageHeader, Pill, Section, Spinner } from "@/nexus/ui/kit";
import { ConfirmButton } from "@/nexus/ui/ConfirmButton";
import { ScopedRoleDialog, type ScopedArea } from "@/nexus/ui/ScopedRoleDialog";
import { useSession } from "@/nexus/session";

const NEXUS_AREAS: ScopedArea[] = [
  { key: "organizations", label: "Organizations", kind: "graded", hint: "edit = provision + the org Edit dialog" },
  { key: "audit", label: "Platform audit", kind: "toggle", grant: "view", hint: "read-only by nature" },
  { key: "settings", label: "Settings", kind: "toggle", grant: "edit", hint: "Nexus's own theme and logo" },
];
const areaLabel = (k: string) => NEXUS_AREAS.find((a) => a.key === k)?.label ?? k;

export function NexusTeam() {
  const { user } = useSession();
  const [roles, setRoles] = useState<ScopedRole[] | null>(null);
  const [team, setTeam] = useState<NexusOperator[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const load = useCallback(() => {
    listNexusScopedRoles().then(setRoles).catch(() => setRoles([]));
    listNexusTeam().then(setTeam).catch(() => setTeam([]));
  }, []);
  useEffect(() => load(), [load]);

  async function removeRole(r: ScopedRole) {
    try {
      await deleteProgramRole(r.id);
      toast.success(`Deleted "${r.name}"`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete role");
    }
  }

  async function assignRole(p: NexusOperator, roleId: string | null) {
    if (!p.email) return;
    try {
      await setNexusTeamRole(p.email, roleId);
      toast.success(roleId ? "Role assigned" : "Role cleared");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to assign role");
    }
  }

  async function removeOperator(p: NexusOperator) {
    if (!p.email) return;
    try {
      await removeNexusOperator(p.email);
      toast.success(`${p.display_name ?? p.email} removed`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    }
  }

  return (
    <div>
      <PageHeader
        title="Team & Roles"
        subtitle="Who operates Nexus, and what each operator role can see and do."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Create role
          </Button>
        }
      />

      <Section title="Roles">
        {!roles ? (
          <Spinner />
        ) : roles.length === 0 ? (
          <EmptyState>No operator roles yet — full operators see everything by default.</EmptyState>
        ) : (
          <div className="space-y-2">
            {roles.map((r) => {
              const holders = (team ?? []).filter((p) => p.role_id === r.id).length;
              return (
                <div key={r.id} className="flex items-center gap-3 glass-card px-4 py-3">
                  <div className="min-w-[140px]">
                    <div className="font-medium text-foreground">{r.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {holders} operator{holders !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <div className="flex flex-1 flex-wrap gap-1.5">
                    {Object.entries(r.perms).map(([a, lvl]) => (
                      <Pill key={a} tone="neutral">
                        {areaLabel(a)} · {lvl}
                      </Pill>
                    ))}
                  </div>
                  <ConfirmButton
                    title={`Delete the "${r.name}" role?`}
                    description="Operators assigned to it lose the role's access."
                    actionLabel="Delete"
                    onConfirm={() => removeRole(r)}
                    buttonTitle="Delete role"
                  >
                    <Trash2 className="size-3.5 text-red-600 dark:text-red-400" />
                  </ConfirmButton>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section
        title="Operators"
        action={
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <Plus className="size-3.5" /> Invite operator
          </Button>
        }
      >
        {!team ? (
          <Spinner />
        ) : (
          <div className="glass-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operator</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {team.map((p) => {
                  const isSelf = !!user?.email && p.email?.toLowerCase() === user.email.toLowerCase();
                  return (
                    <TableRow key={p.email ?? p.invitation_id}>
                      <TableCell>
                        <div className="font-medium text-foreground">{p.display_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{p.email}</div>
                      </TableCell>
                      <TableCell>
                        {p.kind === "admin" ? (
                          <div>
                            <Pill tone="accent">Admin</Pill>
                            <div className="text-[11px] text-muted-foreground mt-0.5">Platform-level access</div>
                          </div>
                        ) : (
                          <Select
                            value={p.role_id ?? "none"}
                            onValueChange={(v) => assignRole(p, v === "none" ? null : v)}
                          >
                            <SelectTrigger className="h-8 w-44">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No role</SelectItem>
                              {(roles ?? []).map((r) => (
                                <SelectItem key={r.id} value={r.id}>
                                  {r.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell>
                        <Pill tone={p.status === "active" ? "positive" : "warn"}>{p.status}</Pill>
                      </TableCell>
                      <TableCell className="text-right">
                        {!isSelf && p.email ? (
                          <ConfirmButton
                            title={`Remove ${p.display_name ?? p.email} as an operator?`}
                            description="They lose all Nexus console access. Their account itself is untouched."
                            actionLabel="Remove"
                            onConfirm={() => removeOperator(p)}
                            buttonTitle="Remove operator"
                          >
                            <Trash2 className="size-3.5 text-red-600 dark:text-red-400" />
                          </ConfirmButton>
                        ) : (
                          <span className="text-xs text-muted-foreground">you</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>

      {creating ? (
        <ScopedRoleDialog
          title="Create operator role"
          areas={NEXUS_AREAS}
          onClose={() => setCreating(false)}
          onSave={async (name, perms) => {
            await createNexusScopedRole({ name, perms });
            toast.success("Role created");
            load();
          }}
        />
      ) : null}

      <NexusInviteDialog roles={roles ?? []} open={inviteOpen} onOpenChange={setInviteOpen} onDone={load} />
    </div>
  );
}

function NexusInviteDialog({
  roles,
  open,
  onOpenChange,
  onDone,
}: {
  roles: ScopedRole[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState<string>("full");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  function reset() {
    setName("");
    setEmail("");
    setRoleId("full");
    setLink(null);
  }

  async function submit() {
    if (!email.trim()) return;
    setBusy(true);
    try {
      const inv = await inviteNexusOperator({
        email: email.trim(),
        display_name: name.trim() || undefined,
        role_id: roleId === "full" ? undefined : roleId,
      });
      setLink(inv.token ? `${window.location.origin}/invite/${inv.token}` : inv.redeem_url ?? null);
      onDone();
      toast.success("Operator invited");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to invite");
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite an operator</DialogTitle>
        </DialogHeader>
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
              <Label htmlFor="nx-name">Name</Label>
              <Input id="nx-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jordan Lee" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nx-email">Email</Label>
              <Input id="nx-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jordan@example.org" />
            </div>
            <div className="space-y-1.5">
              <Label>Access</Label>
              <Select value={roleId} onValueChange={setRoleId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full operator</SelectItem>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      Confined · {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <DialogFooter>
          {link ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={busy || !email.trim()}>
                {busy ? "Inviting…" : "Invite"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

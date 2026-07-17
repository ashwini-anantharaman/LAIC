/**
 * Org space → Settings. Minimal org theming (accent color + logo) and the
 * members table. Deep theming lives elsewhere; per §6.4 the org gets one accent
 * and a logo, nothing more.
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import {
  createInvitation,
  getOrgBySlug,
  listMyOrgs,
  listMembers,
  listOrgInvitations,
  removeMember,
  revokeInvitation,
  updateOrgTheme,
  uploadOrgLogo,
} from "@/services/api";
import { resolveAssetUrl } from "@/services/apiBase";
import type { Invitation, OrgMember } from "@/types/platform";
import { EmptyState, PageHeader, Pill, Section, Spinner } from "@/nexus/ui/kit";
import { Copy, Plus, Trash2 } from "lucide-react";
import { ConfirmButton } from "@/nexus/ui/ConfirmButton";
import { useSession } from "@/nexus/session";

export function OrgSettings() {
  const { orgId = "" } = useParams();
  const { user } = useSession();
  const [members, setMembers] = useState<OrgMember[] | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [accent, setAccent] = useState("#4f46e5");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  async function removeRow(m: OrgMember) {
    try {
      await removeMember(m.id);
      toast.success(`${m.display_name ?? m.email} removed`);
      loadMembers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove member");
    }
  }

  async function revokeRow(inv: Invitation) {
    try {
      await revokeInvitation(inv.id);
      toast.success(`Invitation for ${inv.display_name ?? inv.email} withdrawn`);
      loadMembers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to withdraw invitation");
    }
  }

  // Load the org's current theme (via its public branding, resolved by slug).
  useEffect(() => {
    (async () => {
      try {
        const mine = await listMyOrgs();
        const slug = mine.find((o) => o.id === orgId)?.slug;
        if (!slug) return;
        const b = await getOrgBySlug(slug);
        if (b.theme_accent_color) setAccent(b.theme_accent_color);
        if (b.theme_logo_url) setLogoUrl(b.theme_logo_url);
      } catch {
        /* defaults stay */
      }
    })();
  }, [orgId]);

  function loadMembers() {
    listMembers(orgId)
      .then(setMembers)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load members"));
    listOrgInvitations(orgId)
      .then((all) => setInvitations(all.filter((i) => !i.program_id))) // org-level invites only
      .catch(() => setInvitations([]));
  }
  useEffect(loadMembers, [orgId]);

  async function saveTheme() {
    try {
      await updateOrgTheme(orgId, { accent_color: accent });
      toast.success("Theme saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save theme");
    }
  }

  const hasAny = (members?.length ?? 0) > 0 || invitations.length > 0;

  return (
    <div>
      <PageHeader title="Settings" subtitle="Your organization's profile, theme, and people." />

      <Section title="Theme">
        <div className="glass-card p-5 flex flex-wrap items-end gap-6">
          <div className="space-y-1.5">
            <Label htmlFor="accent">Accent color</Label>
            <div className="flex items-center gap-2">
              <input
                id="accent"
                type="color"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="size-9 rounded-md border border-border bg-transparent p-0.5"
              />
              <Input value={accent} onChange={(e) => setAccent(e.target.value)} className="w-32 font-mono" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="logo">Logo</Label>
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <img src={resolveAssetUrl(logoUrl) ?? undefined} alt="" className="size-9 rounded-md object-cover border border-border" />
              ) : (
                <div className="grid size-9 place-items-center rounded-md border border-dashed border-border text-xs text-muted-foreground">—</div>
              )}
              <input
                id="logo"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="text-xs text-muted-foreground file:mr-2 file:rounded-md file:border file:border-border file:bg-transparent file:px-2.5 file:py-1.5 file:text-xs file:text-foreground"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const r = await uploadOrgLogo(orgId, file);
                    setLogoUrl(r.logo_url);
                    toast.success("Logo uploaded — it now shows on your org portal");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Upload failed");
                  }
                }}
              />
            </div>
          </div>
          <Button onClick={saveTheme}>Save</Button>
        </div>
      </Section>

      <Section
        title="Members"
        action={
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <Plus className="size-3.5" /> Invite administrator
          </Button>
        }
      >
        {error ? (
          <EmptyState>{error}</EmptyState>
        ) : !members ? (
          <Spinner />
        ) : !hasAny ? (
          <EmptyState>No members yet.</EmptyState>
        ) : (
          <div className="glass-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => {
                  const isSelf = !!user?.email && m.email?.toLowerCase() === user.email.toLowerCase();
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium text-foreground">{m.display_name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{m.email}</TableCell>
                      <TableCell>
                        <Pill tone={m.role === "owner" ? "accent" : "neutral"}>{m.role}</Pill>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{m.access}</TableCell>
                      <TableCell className="text-right">
                        {m.role !== "owner" && !isSelf ? (
                          <ConfirmButton
                            title={`Remove ${m.display_name ?? m.email}?`}
                            description="They lose access to this organization immediately. You can invite them again later."
                            onConfirm={() => removeRow(m)}
                            buttonTitle="Remove member"
                          >
                            <Trash2 className="size-3.5 text-red-600 dark:text-red-400" />
                          </ConfirmButton>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {invitations.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium text-foreground">{inv.display_name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{inv.email}</TableCell>
                    <TableCell>
                      <Pill tone="neutral">{inv.role}</Pill>
                    </TableCell>
                    <TableCell>
                      <Pill tone="warn">invited</Pill>
                    </TableCell>
                    <TableCell className="text-right">
                      <ConfirmButton
                        title={`Withdraw the invitation for ${inv.display_name ?? inv.email}?`}
                        description="Their activation link stops working. You can send a new invitation later."
                        actionLabel="Withdraw"
                        onConfirm={() => revokeRow(inv)}
                        buttonTitle="Withdraw invitation"
                      >
                        <Trash2 className="size-3.5 text-red-600 dark:text-red-400" />
                      </ConfirmButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>

      <InviteAdminDialog orgId={orgId} open={inviteOpen} onOpenChange={setInviteOpen} onInvited={loadMembers} />
    </div>
  );
}

function InviteAdminDialog({
  orgId,
  open,
  onOpenChange,
  onInvited,
}: {
  orgId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onInvited: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<Invitation | null>(null);

  const link = invite?.token ? `${window.location.origin}/invite/${invite.token}` : invite?.redeem_url ?? "";

  async function submit() {
    if (!email.trim()) return;
    setBusy(true);
    try {
      const inv = await createInvitation(orgId, {
        email: email.trim(),
        display_name: name.trim() || undefined,
        role: "administrator",
      });
      setInvite(inv);
      onInvited();
      toast.success("Invitation created — it now appears in Members as “invited”.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create invitation");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setName("");
    setEmail("");
    setInvite(null);
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
          <DialogTitle>Invite administrator</DialogTitle>
        </DialogHeader>
        {invite ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Share this activation link with {invite.display_name ?? invite.email}. They set their own password
              on first sign-in — you never see it.
            </p>
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
              <Label htmlFor="inv-name">Name</Label>
              <Input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jordan Lee" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-email">Email</Label>
              <Input
                id="inv-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jordan@example.org"
              />
            </div>
          </div>
        )}
        <DialogFooter>
          {invite ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={busy || !email.trim()}>
                {busy ? "Creating…" : "Create invitation"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

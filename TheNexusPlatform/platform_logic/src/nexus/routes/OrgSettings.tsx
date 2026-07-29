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
import { Switch } from "@/app/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import {
  addOrgCategory,
  createInvitation,
  getOrgBySlug,
  getOrgCapabilities,
  listMyOrgs,
  listMembers,
  listOrgCategories,
  listOrgInvitations,
  removeMember,
  removeOrgCategory,
  renameOrgCategory,
  revokeInvitation,
  setOrgAccess,
  updateOrgName,
  updateOrgTheme,
  uploadOrgFavicon,
  uploadOrgLogo,
  type OrgCapabilities,
} from "@/services/api";
import { resolveAssetUrl } from "@/services/apiBase";
import type { Invitation, OrgMember } from "@/types/platform";
import { EmptyState, PageHeader, Pill, Section, Spinner } from "@/nexus/ui/kit";
import { Check, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { ConfirmButton } from "@/nexus/ui/ConfirmButton";
import { useSession } from "@/nexus/session";
import { writeBranding } from "@/nexus/branding";
import { ThemeEditor } from "@/nexus/ui/ThemeEditor";

export function OrgSettings() {
  const { orgId = "" } = useParams();
  const { user } = useSession();
  const [members, setMembers] = useState<OrgMember[] | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [accent, setAccent] = useState("#4f46e5");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);
  const [orgSlug, setOrgSlug] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
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
        const me = mine.find((o) => o.id === orgId);
        if (me?.name) setOrgName(me.name);
        const slug = me?.slug;
        if (!slug) return;
        setOrgSlug(slug);
        const b = await getOrgBySlug(slug);
        if (b.theme_accent_color) setAccent(b.theme_accent_color);
        if (b.theme_logo_url) setLogoUrl(b.theme_logo_url);
        if (b.theme_favicon_url) setFaviconUrl(b.theme_favicon_url);
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

  const hasAny = (members?.length ?? 0) > 0 || invitations.length > 0;

  return (
    <div>
      <PageHeader title="Settings" />

      <Section title="Branding">
        <ThemeEditor
          name={orgName}
          nameLabel="Organization name"
          onSaveName={async (n) => {
            await updateOrgName(orgId, n);
            setOrgName(n);
            writeBranding({ orgId, slug: orgSlug, accent, logo: resolveAssetUrl(logoUrl), title: n });
          }}
          accent={accent}
          logoUrl={resolveAssetUrl(logoUrl)}
          faviconUrl={resolveAssetUrl(faviconUrl)}
          onSaveAccent={async (hex) => {
            await updateOrgTheme(orgId, { accent_color: hex });
            setAccent(hex);
            writeBranding({ orgId, slug: orgSlug, accent: hex, logo: resolveAssetUrl(logoUrl), title: orgName });
          }}
          onUploadLogo={async (file) => {
            const r = await uploadOrgLogo(orgId, file);
            setLogoUrl(r.logo_url);
            writeBranding({ orgId, slug: orgSlug, accent, logo: resolveAssetUrl(r.logo_url), title: orgName });
          }}
          onUploadFavicon={async (file) => {
            const r = await uploadOrgFavicon(orgId, file);
            setFaviconUrl(r.favicon_url);
            writeBranding({ orgId, slug: orgSlug, accent, logo: resolveAssetUrl(logoUrl), favicon: resolveAssetUrl(r.favicon_url), title: orgName });
          }}
        />
      </Section>

      <CategoriesSection orgId={orgId} />

      <AccessSection orgId={orgId} />

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


/**
 * Settings → Access: the org's own boundary control — whether org admins may
 * open the org's programs. Only the owner (Super Admin) can flip it; other
 * admins see it read-only.
 */
function AccessSection({ orgId }: { orgId: string }) {
  const { user } = useSession();
  const isOwner = (user?.memberships ?? []).some(
    (m) => m.org_id === orgId && m.role === "owner" && !m.program_id,
  );
  const [caps, setCaps] = useState<OrgCapabilities | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getOrgCapabilities(orgId).then(setCaps).catch(() => setCaps(null));
  }, [orgId]);
  if (!caps) return null;
  const on = caps.adminsEnterPrograms !== false;
  return (
    <Section title="Access">
      <div className="glass-card flex items-center justify-between gap-3 p-5">
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">Admins can open programs</div>
          <div className="text-xs text-muted-foreground">
            {on
              ? "Org admins can open any program in this organization."
              : "Off — admins manage programs (features, people, categories) but can't open one without explicit program access."}
            {!isOwner ? " Only the organization owner (Super Admin) can change this." : ""}
          </div>
        </div>
        <Switch
          checked={on}
          disabled={!isOwner || busy}
          onCheckedChange={async (v) => {
            setBusy(true);
            try {
              setCaps(await setOrgAccess(orgId, v));
              toast.success("Access updated");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Failed to update");
            } finally {
              setBusy(false);
            }
          }}
        />
      </div>
    </Section>
  );
}

/**
 * Settings → Categories: the org's program taxonomy. Programs pick a primary
 * (and optional secondaries) from this list; renames cascade to every program.
 */
function CategoriesSection({ orgId }: { orgId: string }) {
  const [categories, setCategories] = useState<string[] | null>(null);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameTo, setRenameTo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listOrgCategories(orgId)
      .then(setCategories)
      .catch(() => setCategories([]));
  }, [orgId]);

  async function run(op: () => Promise<string[]>, ok: string) {
    setBusy(true);
    try {
      setCategories(await op());
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Categories">
      <div className="glass-card p-5 space-y-2">
        <p className="text-xs text-muted-foreground">
          Programs pick a primary category (and optional secondaries) from this list. Renaming a
          category updates every program using it; a category can only be removed once no program
          uses it as its primary.
        </p>
        {!categories ? (
          <Spinner />
        ) : (
          <>
            {categories.map((c) => (
              <div key={c} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                {renaming === c ? (
                  <div className="flex flex-1 items-center gap-2">
                    <Input value={renameTo} onChange={(e) => setRenameTo(e.target.value)} className="h-8 flex-1" autoFocus />
                    <Button
                      size="sm"
                      disabled={busy || !renameTo.trim() || renameTo.trim() === c}
                      onClick={() => {
                        void run(() => renameOrgCategory(orgId, c, renameTo.trim()), `Renamed to "${renameTo.trim()}" everywhere`);
                        setRenaming(null);
                      }}
                    >
                      <Check className="size-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <>
                    <span className="text-sm text-foreground truncate">{c}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Rename category"
                        onClick={() => {
                          setRenaming(c);
                          setRenameTo(c);
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <ConfirmButton
                        title={`Remove the "${c}" category?`}
                        description="It disappears from every program's secondary categories. Removal is refused while any program uses it as its primary."
                        actionLabel="Remove"
                        onConfirm={() => run(() => removeOrgCategory(orgId, c), `Removed "${c}"`)}
                        buttonTitle="Remove category"
                      >
                        <Trash2 className="size-3.5 text-red-600 dark:text-red-400" />
                      </ConfirmButton>
                    </div>
                  </>
                )}
              </div>
            ))}
            {categories.length === 0 ? (
              <p className="text-xs text-muted-foreground">No categories yet — add the first below.</p>
            ) : null}
            <div className="flex gap-2 pt-1">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Competitions, Summer Camps"
                className="flex-1"
              />
              <Button
                size="sm"
                disabled={busy || !newName.trim()}
                onClick={() => {
                  void run(() => addOrgCategory(orgId, newName.trim()), `Added "${newName.trim()}"`);
                  setNewName("");
                }}
              >
                <Plus className="size-3.5" /> Add
              </Button>
            </div>
          </>
        )}
      </div>
    </Section>
  );
}

/**
 * "Sign-in details" — the key button beside Test as in every People roster.
 *
 * An org or program administrator can set a member's USERNAME (an optional
 * second sign-in identifier, so someone without an email address can still log
 * in) and their PASSWORD. Both are optional; whichever fields are filled get
 * sent.
 *
 * Deliberate choices:
 *  • The current password is never shown, because we cannot read it — only set
 *    it. The field is empty and labelled as a replacement, not a reveal.
 *  • The password is held in component state only, cleared when the dialog
 *    closes, and never written to a log or a toast.
 *  • The backend rejects a caller who is not an admin at the right altitude, and
 *    refuses anyone outranking the actor. This UI hides the button in the same
 *    cases, but the server is the authority.
 *  • ONCE THE PERSON HAS SET THEIR OWN PASSWORD, the server refuses to change it
 *    (409) and this dialog offers a CLAIM CODE instead. One credential is shared
 *    across every club someone belongs to, so a reset here would hand this club a
 *    working key to another club's member. A code lets the admin help without
 *    ever holding that key: they read it out, the person redeems it in the app
 *    and chooses a password nobody else sees.
 */
import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { issueMemberClaimCode, setMemberCredentials } from "@/services/api";

/** Mirrors usernameSchema on the server. */
const USERNAME_RE = /^[A-Za-z0-9._-]{3,32}$/;
const MIN_PASSWORD = 3;

export function CredentialsButton({
  membershipId,
  personLabel,
  currentUsername,
  onSaved,
}: {
  membershipId: string;
  /** Shown in the dialog title — a name, or the email as a fallback. */
  personLabel: string;
  currentUsername?: string | null;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState(currentUsername ?? "");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  // Never let a password outlive the dialog, and re-sync the username if the
  // roster refreshed while this row's dialog was closed.
  useEffect(() => {
    if (!open) {
      setPassword("");
      setUsername(currentUsername ?? "");
    }
  }, [open, currentUsername]);

  const trimmed = username.trim();
  const usernameChanged = trimmed !== (currentUsername ?? "").trim();
  const usernameValid = trimmed === "" || USERNAME_RE.test(trimmed);
  const passwordValid = password === "" || password.length >= MIN_PASSWORD;
  const somethingToSave = (usernameChanged && usernameValid) || password.length > 0;
  const canSave = somethingToSave && usernameValid && passwordValid && !saving;

  /** Set when the server refuses a password change because they own it. */
  const [ownsPassword, setOwnsPassword] = useState(false);
  /** An issued code, shown once — the server stores only its hash. */
  const [claimCode, setClaimCode] = useState<string | null>(null);

  async function issueCode() {
    setSaving(true);
    try {
      const res = await issueMemberClaimCode(membershipId);
      setClaimCode(res.code);
      setPassword("");
    } catch (exc) {
      toast.error((exc as Error)?.message ?? "Could not issue a claim code");
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const body: { password?: string; username?: string | null } = {};
      if (usernameChanged) body.username = trimmed === "" ? null : trimmed;
      if (password.length > 0) body.password = password;

      const res = await setMemberCredentials(membershipId, body);
      // Report WHICH fields changed, never the values.
      const parts: string[] = [];
      if (res.changed.includes("username")) parts.push(`username set to ${res.username}`);
      if (res.changed.includes("username_cleared")) parts.push("username cleared");
      if (res.changed.includes("password")) parts.push("password updated");
      toast.success(`${personLabel}: ${parts.join(", ")}`);
      setPassword("");
      setOpen(false);
      onSaved?.();
    } catch (exc) {
      const message = (exc as Error)?.message ?? "Could not update the sign-in details";
      // 409 from the server: they own their password now. Explain it here rather
      // than as a toast that vanishes, and offer the way forward.
      if (/set their own password/i.test(message)) {
        setOwnsPassword(true);
        setPassword("");
      } else {
        toast.error(message);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
        title="Set this person's username and password"
      >
        <KeyRound className="size-3.5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign-in details — {personLabel}</DialogTitle>
            <DialogDescription>
              Set a username they can sign in with instead of their email, and/or
              replace their password. Leave a field blank to leave it unchanged.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="cred-username">Username</Label>
              <Input
                id="cred-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. club1rahul"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              {trimmed !== "" && !usernameValid ? (
                <p className="text-xs text-red-600 dark:text-red-400">
                  3–32 characters: letters, numbers, dot, underscore or hyphen. No @.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {currentUsername
                    ? "Clear the field to remove their username."
                    : "Optional — they can always sign in with their email."}
                </p>
              )}
            </div>

            {claimCode ? (
              /* Shown once — the server keeps only a hash of it. */
              <div className="space-y-1.5 rounded-md border border-border bg-muted/40 p-3">
                <Label>Claim code</Label>
                <code className="block select-all text-lg font-mono tracking-widest text-foreground">
                  {claimCode}
                </code>
                <p className="text-xs text-muted-foreground">
                  Read this out to {personLabel}. They enter it in the app and choose their
                  own password. It works once, expires in 24 hours, and cannot be shown
                  again — issue a new one if it is lost.
                </p>
              </div>
            ) : ownsPassword ? (
              /* They own their password now, so there is nothing to set here. */
              <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
                <p className="text-sm text-foreground">
                  {personLabel} has set their own password, so it cannot be changed here.
                </p>
                <p className="text-xs text-muted-foreground">
                  One sign-in covers every club they belong to, so changing it from one
                  club would give that club access to the others. Issue a claim code
                  instead: they redeem it in the app and pick a password only they know.
                </p>
                <Button size="sm" onClick={() => void issueCode()} disabled={saving}>
                  {saving ? "Issuing…" : "Issue claim code"}
                </Button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="cred-password">New password</Label>
                <Input
                  id="cred-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Leave blank to keep the current password"
                  autoComplete="new-password"
                />
                {!passwordValid ? (
                  <p className="text-xs text-red-600 dark:text-red-400">
                    At least {MIN_PASSWORD} characters.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    A starting password, for someone who has not signed in yet — the app
                    asks them to choose their own on first use. Tell them what you set.
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!canSave}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

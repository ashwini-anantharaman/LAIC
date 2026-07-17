/**
 * Invitation activation (/invite/:token). Two real paths, both of which were
 * previously dead ends:
 *   - Already signed in → confirm/edit your name, then accept.
 *   - Never signed in (the common case — a brand-new administrator) → create
 *     the account right here (email is fixed to the invite, name + password),
 *     then accept automatically. There was previously no way to do this at all.
 */
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { acceptInvitation, getInvitation, signup } from "@/services/api";
import type { Invitation } from "@/types/platform";
import { Spinner } from "@/nexus/ui/kit";
import { portalPath } from "@/nexus/orgResolver";
import { useSession } from "@/nexus/session";

export function AcceptInvite() {
  const { token = "" } = useParams();
  const { user, refresh, logout } = useSession();
  const navigate = useNavigate();

  const [inv, setInv] = useState<Invitation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    getInvitation(token)
      .then((i) => {
        setInv(i);
        setName(i.display_name ?? "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Invitation not found"));
  }, [token]);

  async function finish() {
    await refresh();
    setDone(true);
    setTimeout(() => navigate("/", { replace: true }), 900);
  }

  async function acceptAsSignedInUser() {
    setBusy(true);
    setError(null);
    try {
      await acceptInvitation(token, name.trim() || undefined);
      await finish();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not accept invitation");
    } finally {
      setBusy(false);
    }
  }

  async function createAccountAndAccept(e: FormEvent) {
    e.preventDefault();
    if (!inv?.email || !name.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      await signup({ signup_type: "student", email: inv.email, password, display_name: name.trim() });
      await acceptInvitation(token, name.trim());
      await finish();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create your account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center text-foreground px-4">
      <div className="w-full max-w-sm">
        {error ? <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        {!inv ? (
          <Spinner />
        ) : (
          <>
            <h1 className="text-xl font-semibold tracking-tight">You're invited</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Join <span className="font-medium text-foreground">{inv.organization_name ?? "an organization"}</span> as{" "}
              <span className="font-medium text-foreground">{inv.role}</span>.
            </p>

            {done ? (
              <p className="mt-6 text-sm text-emerald-600 dark:text-emerald-400">Accepted — taking you in…</p>
            ) : user && inv.email && user.email?.toLowerCase() !== inv.email.toLowerCase() ? (
              // Signed in as someone ELSE (e.g. the admin who created the invite
              // testing the link). Accepting now would absorb the invitation into
              // the wrong account — switch to the invitee instead.
              <div className="mt-6 space-y-4">
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
                  This invitation is for <b>{inv.email}</b>, but you're signed in as <b>{user.email}</b>.
                </div>
                <Button
                  className="w-full"
                  onClick={() => {
                    logout();
                    // Session cleared — the create-account branch below renders.
                  }}
                >
                  Continue as {inv.display_name ?? inv.email}
                </Button>
              </div>
            ) : user ? (
              <div className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="accept-name">Your name</Label>
                  <Input id="accept-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jordan Lee" />
                </div>
                <Button className="w-full" onClick={acceptAsSignedInUser} disabled={busy}>
                  {busy ? "Accepting…" : "Accept invitation"}
                </Button>
              </div>
            ) : (
              <form onSubmit={createAccountAndAccept} className="mt-6 space-y-4">
                <p className="text-sm text-muted-foreground">Create your account to accept.</p>
                <div className="space-y-1.5">
                  <Label htmlFor="accept-name2">Your name</Label>
                  <Input
                    id="accept-name2"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jordan Lee"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="accept-email">Email</Label>
                  <Input id="accept-email" value={inv.email ?? ""} disabled />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="accept-password">Choose a password</Label>
                  <Input
                    id="accept-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy || !name.trim() || password.length < 8}>
                  {busy ? "Creating account…" : "Create account & accept"}
                </Button>
                {inv.organization_slug ? (
                  <p className="text-center text-xs text-muted-foreground">
                    Already have an account?{" "}
                    <Link to={portalPath(inv.organization_slug)} className="underline">
                      Sign in at {inv.organization_name}
                    </Link>{" "}
                    first, then reopen this link.
                  </p>
                ) : null}
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}

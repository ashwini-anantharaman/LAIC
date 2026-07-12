/**
 * Login / signup — spec §11.2. Which auth methods render is config-driven and
 * the selected role is preserved through the flow. All platform IO goes
 * through the injected ShellPlatformClient — the shell owns no network code.
 */
import { useState } from "react";
import type { AppShellConfig, RoleButton, ShellPlatformClient } from "../types";

const PROVIDER_LABEL: Record<string, string> = {
  google: "Continue with Google",
  apple: "Continue with Apple",
  phone: "Use phone number",
  otp: "Email me a code",
};

export function LoginShell({
  config,
  client,
  role,
  onBack,
  onAuthed,
}: {
  config: AppShellConfig;
  client: ShellPlatformClient;
  role: RoleButton;
  onBack: () => void;
  onAuthed: () => void;
}) {
  const isSignup = role.entryFlow === "signup" || role.entryFlow === "apply";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const providers = config.auth.allowedMethods.filter((m) => m !== "email");
  const needsInvite = role.entryFlow === "invite_only" || config.auth.requireInviteCode;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (needsInvite && !invite.trim()) {
      setError("An invite code is required for this role");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await client.authenticate({
        email: email.trim(),
        password,
        displayName: name.trim() || undefined,
        selectedRole: role.roleRequested,
        inviteCode: invite.trim() || undefined,
      });
      onAuthed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setBusy(false);
    }
  }

  const title = isSignup ? config.copy.signupTitle || "Create your account" : config.copy.loginTitle || "Sign in";

  return (
    <div className="panel-page">
      <button className="back-link rise d1" onClick={onBack}>
        ← Back
      </button>
      <h2 className="rise d1">{title}</h2>
      <p className="panel-note rise d2">
        Continuing as <b>{role.label}</b>
        {role.entryFlow === "apply" && " — your application is reviewed before full access"}
        {role.entryFlow === "invite_only" && " — this role requires an invitation"}.
      </p>

      {providers.length > 0 && (
        <>
          <div className="provider-row rise d3">
            {providers.map((p) => (
              <button
                key={p}
                type="button"
                className="provider-btn"
                onClick={() => setNotice(`${PROVIDER_LABEL[p] || p} isn't wired in this build — use email.`)}
              >
                {PROVIDER_LABEL[p] || p}
              </button>
            ))}
          </div>
          <div className="divider rise d3">or email</div>
        </>
      )}

      <form onSubmit={submit} className="rise d4">
        {isSignup && (
          <div className="field">
            <label htmlFor="ls-name">Your name</label>
            <input id="ls-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" />
          </div>
        )}
        <div className="field">
          <label htmlFor="ls-email">Email</label>
          <input id="ls-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </div>
        <div className="field">
          <label htmlFor="ls-pass">Password</label>
          <input id="ls-pass" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>
        {needsInvite && (
          <div className="field">
            <label htmlFor="ls-invite">Invite code</label>
            <input id="ls-invite" type="text" value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="e.g. LAIC-2026" />
          </div>
        )}
        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? "One moment…" : isSignup ? "Create account" : "Sign in"}
        </button>
        {error && <p className="error-text">{error}</p>}
        {notice && <p className="hint-text">{notice}</p>}
      </form>
    </div>
  );
}

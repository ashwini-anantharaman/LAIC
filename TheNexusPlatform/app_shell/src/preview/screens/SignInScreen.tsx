import { useState } from "react";
import type { AppShellConfig } from "../../types";

const REG_HINT: Record<AppShellConfig["registrationPath"], { cta: string; note: string }> = {
  public: { cta: "Create an account", note: "Anyone can sign up" },
  "invite-code": { cta: "Join with an invite code", note: "You'll need a code from your admin" },
  "admin-added": { cta: "", note: "Accounts are set up by an admin — contact yours to get access" },
  bulk: { cta: "", note: "Contact your administrator to be added to this app" },
};

/**
 * The designed sign-in screen. In the Studio preview it's a mock (onContinue
 * just advances). In the LIVE player, passing `live` wires the email/password
 * form to real authentication — same pixels, real behavior.
 */
export interface SignInLive {
  onSubmit: (email: string, password: string) => void;
  onCreateAccount?: () => void;
  busy?: boolean;
  error?: string | null;
}

export function SignInScreen({
  config,
  role,
  onBack,
  onContinue,
  live,
}: {
  config: AppShellConfig;
  role: string;
  onBack: () => void;
  onContinue: () => void;
  live?: SignInLive;
}) {
  const t = config.authToggles;
  const anyAuth = t.googleSSO || t.emailPassword || t.magicLink;
  const hint = REG_HINT[config.registrationPath];
  const accentBtn = { background: config.accentColor, color: config.accentForeground };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Advance the mock, or run the real sign-in when wired.
  const submit = () => (live ? live.onSubmit(email.trim(), password) : onContinue());
  const createAccount = () => (live?.onCreateAccount ? live.onCreateAccount() : onContinue());
  // In the LIVE app, only offer "create an account" when it actually opens a
  // sign-up gate — otherwise it would dead-end into onboarding unauthenticated.
  // The preview always shows it (it's a mock).
  const showCreateCta = Boolean(hint.cta) && (!live || Boolean(live.onCreateAccount));

  return (
    <div className="flex h-full flex-col px-5 pb-6 pt-3">
      <button onClick={onBack} className="mb-5 flex items-center gap-1 self-start text-[10px] text-gray-400 hover:text-gray-600">
        ‹ Back
      </button>

      <div className="mb-4">
        <p className="mb-0.5 text-[8px] font-semibold uppercase tracking-[0.15em] text-gray-400">Signing in as</p>
        <h2 className="text-lg font-bold text-gray-900">{role || config.roles[0]?.label || "Member"}</h2>
      </div>

      <div className="flex-1 space-y-2">
        {t.googleSSO && (
          <button
            onClick={onContinue}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 py-2.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            <span className="text-sm font-bold leading-none">G</span> Continue with Google
          </button>
        )}
        {t.magicLink && (
          <button
            onClick={onContinue}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 py-2.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            ✦ Send magic link
          </button>
        )}
        {t.emailPassword && (
          <>
            {(t.googleSSO || t.magicLink) && (
              <div className="my-1 flex items-center gap-2">
                <div className="h-px flex-1 bg-gray-100" />
                <span className="text-[9px] text-gray-400">or</span>
                <div className="h-px flex-1 bg-gray-100" />
              </div>
            )}
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 placeholder-gray-300 outline-none"
              placeholder="Email address"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 placeholder-gray-300 outline-none"
              placeholder="Password"
            />
            {live?.error ? <p className="text-[10px] leading-relaxed text-red-600">{live.error}</p> : null}
            <button
              onClick={submit}
              disabled={live?.busy}
              className="mt-1 w-full rounded-xl py-2.5 text-xs font-semibold disabled:opacity-60"
              style={accentBtn}
            >
              {live?.busy ? "Signing in…" : "Continue"}
            </button>
          </>
        )}
        {!anyAuth && <p className="py-4 text-center text-xs text-gray-400">No auth methods enabled</p>}
      </div>

      <div className="mt-3 border-t border-gray-100 pt-3">
        {showCreateCta ? (
          <button onClick={createAccount} className="w-full text-center text-[10px]" style={{ color: config.accentColor }}>
            {hint.cta} →
          </button>
        ) : (
          <p className="text-center text-[9px] leading-relaxed text-gray-400">{hint.note}</p>
        )}
        {config.requireApproval && config.registrationPath !== "admin-added" && config.registrationPath !== "bulk" && (
          <p className="mt-1.5 text-center text-[9px] text-gray-400">New accounts require admin approval</p>
        )}
      </div>
    </div>
  );
}

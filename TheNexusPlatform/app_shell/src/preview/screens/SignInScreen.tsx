import { useState } from "react";
import type { AppShellConfig } from "../../types";
import { PAL, Icon } from "../kit";

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

const inputStyle = { background: PAL.card, border: `1px solid ${PAL.hairline}`, color: PAL.ink } as const;

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
  const accent = config.accentColor;
  const anyAuth = t.googleSSO || t.emailPassword || t.magicLink;
  const hint = REG_HINT[config.registrationPath];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const submit = () => (live ? live.onSubmit(email.trim(), password) : onContinue());
  const createAccount = () => (live?.onCreateAccount ? live.onCreateAccount() : onContinue());
  const showCreateCta = Boolean(hint.cta) && (!live || Boolean(live.onCreateAccount));

  const oauthBtn = "flex w-full items-center justify-center gap-2.5 rounded-xl py-3 text-[14px] font-medium";
  const oauthStyle = { border: `1px solid ${PAL.hairline}`, background: PAL.card, color: PAL.ink } as const;

  return (
    <div className="flex h-full flex-col px-6 pb-6 pt-3" style={{ background: PAL.surface }}>
      <button onClick={onBack} className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full" style={{ border: `1px solid ${PAL.hairline}` }}>
        <Icon name="chevronLeft" size={19} color={PAL.ink} />
      </button>

      <div className="mt-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: PAL.muted }}>Signing in as</p>
        <h2 className="mt-1 text-[22px] font-semibold tracking-tight" style={{ color: PAL.ink }}>{role || config.roles[0]?.label || "Member"}</h2>
      </div>

      <div className="mt-6 flex-1 space-y-2.5">
        {t.googleSSO && (
          <button onClick={onContinue} className={oauthBtn} style={oauthStyle}>
            <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" /><path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.3-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" /><path fill="#FBBC05" d="M11.7 28.18C11.26 26.86 11 25.45 11 24s.26-2.86.7-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.36-5.7z" /><path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.36 5.7c1.72-5.2 6.57-9.07 12.3-9.07z" /></svg>
            Continue with Google
          </button>
        )}
        {t.magicLink && (
          <button onClick={onContinue} className={oauthBtn} style={oauthStyle}>
            <Icon name="chat" size={18} color="#C3CCDD" stroke={1.4} /> Email me a link
          </button>
        )}
        {t.emailPassword && (
          <>
            {(t.googleSSO || t.magicLink) && (
              <div className="my-2 flex items-center gap-3">
                <div className="h-px flex-1" style={{ background: PAL.hairline }} />
                <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: PAL.muted }}>or</span>
                <div className="h-px flex-1" style={{ background: PAL.hairline }} />
              </div>
            )}
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              className="w-full rounded-xl px-3.5 py-3 text-[14px] outline-none"
              style={{ ...inputStyle }}
              placeholder="Email address"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-xl px-3.5 py-3 text-[14px] outline-none"
              style={{ ...inputStyle }}
              placeholder="Password"
            />
            {live?.error ? <p className="text-[11px] leading-relaxed text-red-400">{live.error}</p> : null}
            <button
              onClick={submit}
              disabled={live?.busy}
              className="mt-1 w-full rounded-xl py-3 text-[14px] font-semibold disabled:opacity-60"
              style={{ background: accent, color: config.accentForeground }}
            >
              {live?.busy ? "Signing in…" : "Sign in"}
            </button>
          </>
        )}
        {!anyAuth && <p className="py-5 text-center text-[12px]" style={{ color: PAL.slate }}>No auth methods enabled</p>}
      </div>

      <div className="mt-3 border-t pt-4" style={{ borderColor: PAL.hairline }}>
        {showCreateCta ? (
          <button onClick={createAccount} className="w-full text-center text-[13px] font-semibold" style={{ color: "#C3CCDD" }}>
            {hint.cta} →
          </button>
        ) : (
          <p className="text-center text-[11px] leading-relaxed" style={{ color: PAL.muted }}>{hint.note}</p>
        )}
        {config.requireApproval && config.registrationPath !== "admin-added" && config.registrationPath !== "bulk" && (
          <p className="mt-2 text-center text-[11px]" style={{ color: PAL.muted }}>New accounts require admin approval</p>
        )}
      </div>
    </div>
  );
}

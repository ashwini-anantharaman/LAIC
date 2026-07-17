import type { AppShellConfig } from "../../types";

const REG_HINT: Record<AppShellConfig["registrationPath"], { cta: string; note: string }> = {
  public: { cta: "Create an account", note: "Anyone can sign up" },
  "invite-code": { cta: "Join with an invite code", note: "You'll need a code from your admin" },
  "admin-added": { cta: "", note: "Accounts are set up by an admin — contact yours to get access" },
  bulk: { cta: "", note: "Contact your administrator to be added to this app" },
};

export function SignInScreen({
  config,
  role,
  onBack,
  onContinue,
}: {
  config: AppShellConfig;
  role: string;
  onBack: () => void;
  onContinue: () => void;
}) {
  const t = config.authToggles;
  const anyAuth = t.googleSSO || t.emailPassword || t.magicLink;
  const hint = REG_HINT[config.registrationPath];
  const accentBtn = { background: config.accentColor, color: config.accentForeground };

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
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 placeholder-gray-300 outline-none"
              placeholder="Email address"
            />
            <input
              type="password"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 placeholder-gray-300 outline-none"
              placeholder="Password"
            />
            <button onClick={onContinue} className="mt-1 w-full rounded-xl py-2.5 text-xs font-semibold" style={accentBtn}>
              Continue
            </button>
          </>
        )}
        {!anyAuth && <p className="py-4 text-center text-xs text-gray-400">No auth methods enabled</p>}
      </div>

      <div className="mt-3 border-t border-gray-100 pt-3">
        {hint.cta ? (
          <button onClick={onContinue} className="w-full text-center text-[10px]" style={{ color: config.accentColor }}>
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

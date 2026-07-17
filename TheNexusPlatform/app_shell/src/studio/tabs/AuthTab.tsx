import type { AppShellConfig, AuthToggles } from "../../types";
import { REGISTRATION_PATHS } from "../../data/constants";
import { GroupTitle, Label, Select, Toggle } from "../../ui/fields";

export function AuthTab({
  config,
  update,
}: {
  config: AppShellConfig;
  update: (patch: Partial<AppShellConfig>) => void;
}) {
  const hint = REGISTRATION_PATHS.find((p) => p.value === config.registrationPath)?.hint;
  const setAuth = (patch: Partial<AuthToggles>) => update({ authToggles: { ...config.authToggles, ...patch } });

  return (
    <>
      <GroupTitle>Registration</GroupTitle>
      <div className="space-y-2.5">
        <div>
          <Label>How someone gets in</Label>
          <Select
            value={config.registrationPath}
            onChange={(v) => update({ registrationPath: v })}
            options={REGISTRATION_PATHS.map((p) => ({ value: p.value, label: p.label }))}
          />
          {hint && (
            <p className="mt-1.5 text-[9px]" style={{ color: "rgba(255,255,255,0.25)" }}>
              {hint}
            </p>
          )}
        </div>
        <Toggle checked={config.requireApproval} onChange={(v) => update({ requireApproval: v })} label="Require admin approval for new accounts" />
      </div>

      <GroupTitle>Auth methods</GroupTitle>
      <div className="space-y-2.5">
        <Toggle checked={config.authToggles.googleSSO} onChange={(v) => setAuth({ googleSSO: v })} label="Google SSO" />
        <Toggle checked={config.authToggles.emailPassword} onChange={(v) => setAuth({ emailPassword: v })} label="Email + Password" />
        <Toggle checked={config.authToggles.magicLink} onChange={(v) => setAuth({ magicLink: v })} label="Magic Link" />
      </div>
    </>
  );
}

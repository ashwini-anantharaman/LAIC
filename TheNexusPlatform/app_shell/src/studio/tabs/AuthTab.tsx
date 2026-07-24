import type { AppShellConfig, AuthToggles } from "../../types";
import type { NexusGate } from "../../nexus/client";
import { REGISTRATION_PATHS } from "../../data/constants";
import { GroupTitle, Label, Select, Toggle } from "../../ui/fields";

export function AuthTab({
  config,
  update,
  signupGates,
}: {
  config: AppShellConfig;
  update: (patch: Partial<AppShellConfig>) => void;
  /** The program's participant sign-up gates (when the Studio is bound to an
   *  app). Present → show the picker; absent → pick at Publish. */
  signupGates?: NexusGate[];
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

      <GroupTitle>Sign-up gate</GroupTitle>
      {signupGates ? (
        signupGates.length > 0 ? (
          <div>
            <Label>Gate for "Create an account"</Label>
            <Select
              value={config.signupGateSlug ?? ""}
              onChange={(v) => update({ signupGateSlug: v || undefined })}
              options={[
                { value: "", label: "None — hide “Create an account”" },
                ...signupGates.map((g) => ({ value: g.slug, label: g.title || g.slug })),
              ]}
            />
            <p className="mt-1.5 text-[9px]" style={{ color: "rgba(255,255,255,0.25)" }}>
              Which sign-up gate the app's "Create an account" opens. "None" hides the link.
            </p>
          </div>
        ) : (
          <p className="text-[9px] leading-relaxed" style={{ color: "rgba(255,255,255,0.25)" }}>
            This program has no participant sign-up gate yet. Create one in the console under
            <strong style={{ color: "rgba(255,255,255,0.4)" }}> Gates</strong> (audience: Participants, sign-up on),
            and it'll appear here.
          </p>
        )
      ) : (
        <p className="text-[9px] leading-relaxed" style={{ color: "rgba(255,255,255,0.25)" }}>
          The app's "Create an account" link opens a program sign-up gate. Open this app from the console (or
          choose a program at <strong style={{ color: "rgba(255,255,255,0.4)" }}>Publish</strong>) to pick which
          gate — otherwise "Auto" uses the program's sign-up gate.
        </p>
      )}
    </>
  );
}

/**
 * <AppShell> — the entry-and-frame orchestrator, and the package's whole job:
 *
 *   splash → welcome/role-select → login/signup → onboarding → nav frame
 *
 * i.e. get the right user, in the right role, with the right entitlements,
 * onboarded and dropped at the right starting point. Everything past that
 * door is the consumer's: it arrives as `children(ctx)` and renders inside
 * the frame. The shell performs no routing and no network IO of its own —
 * both are injected (ShellNavigation / ShellPlatformClient).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { AppShellConfig, LaunchContext, RoleButton, ShellNavigation, ShellPlatformClient } from "./types";
import { applyTheme } from "./theme";
import { Atmosphere, Mark } from "./components/Chrome";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { LoginShell } from "./components/LoginShell";
import { OnboardingRenderer } from "./components/OnboardingRenderer";
import { AppNavShell } from "./components/AppNavShell";

export interface AppShellProps {
  /** Validated config record (run validateAppShellConfig before passing). */
  config: AppShellConfig;
  /** Platform access — mock today, Nexus-backed later. */
  client: ShellPlatformClient;
  /** Router adapter: current path + navigate. */
  navigation: ShellNavigation;
  /** Everything past the door. Rendered inside the nav frame once launched. */
  children: (ctx: LaunchContext) => React.ReactNode;
  /** Called after sign-out completes (consumer may redirect, clear state…). */
  onSignedOut?: () => void;
  /** Minimum splash duration in ms (default 700). */
  minSplashMs?: number;
}

function Splash({ config }: { config: AppShellConfig }) {
  return (
    <div className="splash-page">
      <div className="rise d1">
        <Mark glyph={config.branding.markGlyph} />
      </div>
      <p className="splash-name rise d2">{config.identity.displayName}</p>
      <div className="splash-bar rise d3">
        <i />
      </div>
    </div>
  );
}

export function AppShell({ config, client, navigation, children, onSignedOut, minSplashMs = 700 }: AppShellProps) {
  // undefined = booting (splash covers the initial launch-context fetch)
  const [ctx, setCtx] = useState<LaunchContext | null | undefined>(undefined);
  const [pendingRole, setPendingRole] = useState<RoleButton | null>(null);
  const bootedAt = useRef(Date.now());

  useEffect(() => applyTheme(config), [config]);

  const refreshCtx = useCallback(async (): Promise<LaunchContext | null> => {
    const next = await client.getLaunchContext(config);
    setCtx(next);
    return next;
  }, [client, config]);

  // Boot: fetch launch context behind the splash, holding it for minSplashMs.
  useEffect(() => {
    let cancelled = false;
    void client.getLaunchContext(config).then((next) => {
      const wait = Math.max(0, minSplashMs - (Date.now() - bootedAt.current));
      setTimeout(() => {
        if (!cancelled) setCtx(next);
      }, wait);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, config]);

  async function handleSignOut() {
    await client.signOut();
    setPendingRole(null);
    setCtx(null);
    navigation.navigate("/");
    onSignedOut?.();
  }

  let content: React.ReactNode;
  if (ctx === undefined) {
    content = <Splash config={config} />;
  } else if (!ctx) {
    // Pre-auth: welcome → login, the selected role carried through.
    content = pendingRole ? (
      <LoginShell
        config={config}
        client={client}
        role={pendingRole}
        onBack={() => setPendingRole(null)}
        onAuthed={async () => {
          const fresh = await refreshCtx();
          if (fresh?.onboardingComplete) navigation.navigate(fresh.defaultRoute);
        }}
      />
    ) : (
      <WelcomeScreen config={config} onPickRole={setPendingRole} />
    );
  } else if (!ctx.onboardingComplete) {
    content = (
      <OnboardingRenderer
        config={config}
        client={client}
        role={ctx.selectedRole}
        onDone={async () => {
          const fresh = await refreshCtx();
          navigation.navigate(fresh?.defaultRoute || config.navigation.homeRoute);
        }}
      />
    );
  } else {
    // Through the door: the frame is ours, the content is the consumer's.
    content = (
      <AppNavShell config={config} ctx={ctx} navigation={navigation} onSignOut={handleSignOut}>
        {children(ctx)}
      </AppNavShell>
    );
  }

  return (
    <>
      <Atmosphere />
      <div className="shell-layer">{content}</div>
    </>
  );
}

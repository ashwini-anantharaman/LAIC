# @laic/app-shell

The shared **entry-and-frame** package. It renders everything an app needs to get a user
*through the door* — from a validated `AppShellConfig` record, and nothing more:

- Splash
- Welcome / role selection
- Login / signup (auth methods are config-driven)
- Onboarding (config-driven questions, role-filtered)
- Navigation frame (top bar + tabs from config)
- Entitlement gates

Its entire job: **the right user, in the right role, with the right entitlements, onboarded
and dropped at the right starting point.** Everything past that door belongs to the consuming
app, which supplies it as a render function:

```tsx
import { AppShell, type ShellPlatformClient } from "@laic/app-shell";

<AppShell config={config} client={platformClient} navigation={{ path, navigate }}>
  {(ctx) => <YourAppRoutes ctx={ctx} />}   {/* ← past the door: not the shell's business */}
</AppShell>
```

## Boundaries (deliberate)

- **No content runtimes.** The shell never imports learning/bridge/coaching/etc. It doesn't
  know they exist. Consumers mount their own modules inside the frame (lazy-loaded, gated
  with the exported `EntitlementGate`).
- **No router dependency.** Navigation is injected (`ShellNavigation`: current `path` +
  `navigate(to)`), so the package works with any router — or a native wrapper.
- **No network code.** Platform access is injected (`ShellPlatformClient`: `authenticate`,
  `signOut`, `getLaunchContext`, `submitOnboarding`). Today's consumer passes a mock;
  the Nexus-backed client implements the same interface against
  `/api/apps/{slug}/public-config`, `/launch-context`, `/onboarding`.
- **No hardcoded app identity.** All look-and-feel comes from `AppShellConfig.branding` via
  CSS custom properties (`applyTheme`). Configs are validated with `validateAppShellConfig`
  before a pixel renders.

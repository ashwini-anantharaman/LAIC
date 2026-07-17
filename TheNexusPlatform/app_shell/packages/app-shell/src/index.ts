/**
 * @laic/app-shell — public surface.
 *
 * The package renders an app's entry-and-frame experience from an
 * AppShellConfig record: splash, welcome/role-select, login/signup,
 * onboarding, nav frame, entitlement gates. Nothing past the door.
 */
import "./styles.css";

export { AppShell, type AppShellProps } from "./AppShell";
export { EntitlementGate } from "./components/EntitlementGate";

// Individual screens, exported for consumers that need custom composition.
export { WelcomeScreen } from "./components/WelcomeScreen";
export { LoginShell } from "./components/LoginShell";
export { OnboardingRenderer } from "./components/OnboardingRenderer";
export { AppNavShell } from "./components/AppNavShell";
export { Atmosphere, Mark } from "./components/Chrome";

export { validateAppShellConfig, appShellConfigSchema } from "./validator";
export { applyTheme, brandingToCssVars } from "./theme";

export type {
  AppShellConfig,
  AppNavItem,
  LaunchContext,
  OnboardingQuestion,
  RoleButton,
  ShellNavigation,
  ShellPlatformClient,
} from "./types";

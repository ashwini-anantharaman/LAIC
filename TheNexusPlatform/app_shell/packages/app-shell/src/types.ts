/**
 * App Shell contracts — App_Shell_Implementation_Spec §5 / §16.
 *
 * Deliberately domain-agnostic: module keys are plain strings, so the package
 * carries no knowledge of which runtimes (learning, bridge, …) exist. That
 * knowledge belongs to the consuming app.
 */

export interface OnboardingQuestion {
  key: string;
  label: string;
  type: "text" | "single_select" | "multi_select" | "boolean" | "date" | "phone" | "email";
  options?: Array<{ label: string; value: string }>;
  required: boolean;
  visibleForRoles?: string[];
}

export interface RoleButton {
  key: string;
  label: string;
  description?: string;
  roleRequested: string;
  entryFlow: "signin" | "signup" | "apply" | "invite_only";
  defaultRouteAfterLogin: string;
  visible: boolean;
  sortOrder: number;
}

export interface AppNavItem {
  key: string;
  label: string;
  route: string;
  icon?: string;
  requiredModule?: string;
  requiredEntitlement?: string;
  visibleForRoles?: string[];
}

export interface AppShellConfig {
  appId: string;
  slug: string;
  status: "draft" | "preview" | "published" | "retired";
  version: string;

  identity: {
    displayName: string;
    shortName: string;
    bundleId?: string;
    packageName?: string;
  };

  programContext: {
    nexusOrgId: string;
    programId: string;
    offeringId?: string;
    defaultDomainId: string;
  };

  branding: {
    primaryColor: string;
    secondaryColor?: string;
    accentColor?: string;
    backgroundColor?: string;
    surfaceColor?: string;
    textColor?: string;
    mutedColor?: string;
    fontFamily?: string;
    /** Display face for headings; falls back to fontFamily. */
    displayFontFamily?: string;
    /** "light" | "dark" hint for native form controls. */
    scheme?: "light" | "dark";
    /** Single glyph used as the app mark until real assets exist. */
    markGlyph?: string;
  };

  copy: {
    welcomeTitle: string;
    welcomeSubtitle?: string;
    loginTitle?: string;
    signupTitle?: string;
    footerText?: string;
  };

  auth: {
    allowedMethods: Array<"email" | "phone" | "otp" | "google" | "apple">;
    requireInviteCode?: boolean;
    allowSelfSignup: boolean;
    allowAdminEnrollment: boolean;
  };

  roleButtons: RoleButton[];

  onboarding: {
    questions: OnboardingQuestion[];
    requiredForRoles?: string[];
  };

  navigation: {
    homeRoute: string;
    tabs: AppNavItem[];
    hiddenRoutes?: string[];
  };

  /** Which content modules the consuming app should mount. Keys are app-domain. */
  enabledModules: Record<string, boolean>;

  featureFlags: Record<string, boolean>;

  entitlements: {
    requiredEntitlementKeys: string[];
    coachUpsellEnabled?: boolean;
    upgradeRoute?: string;
  };

  build: {
    appVariant: string;
    runtimeTemplate: "learning-app" | "bridge-app" | "general-app";
    environment: "dev" | "staging" | "production";
    configFrozenAtBuild: boolean;
  };
}

/** What the shell knows about the signed-in user (spec §16.2). */
export interface LaunchContext {
  userId: string;
  appId: string;
  programId: string;
  organizationId?: string;
  selectedRole: string;
  displayName: string;
  permissions: string[];
  entitlements: string[];
  defaultRoute: string;
  enabledModules: Record<string, boolean>;
  onboardingComplete: boolean;
}

/**
 * Platform access, injected by the consumer. The shell performs no network IO
 * of its own. A mock implements this today; the Nexus client implements the
 * same interface against /api/apps/{slug}/… endpoints later.
 */
export interface ShellPlatformClient {
  authenticate(opts: {
    email: string;
    password: string;
    displayName?: string;
    selectedRole: string;
    inviteCode?: string;
  }): Promise<void>;
  signOut(): void | Promise<void>;
  getLaunchContext(config: AppShellConfig): Promise<LaunchContext | null>;
  submitOnboarding(payload: { selectedRole: string; answers: Record<string, unknown> }): Promise<void>;
}

/**
 * Navigation, injected by the consumer. The shell has no router dependency;
 * it only needs to know where it is and how to go somewhere.
 */
export interface ShellNavigation {
  path: string;
  navigate: (to: string) => void;
}

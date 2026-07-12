/**
 * AppShellConfig validator — the `config:validate` step from spec §8. Any
 * config (JSON file today, Nexus API payload later) passes through here before
 * the shell renders a single pixel from it.
 */
import { z } from "zod";
import type { AppShellConfig } from "./types";

const hex = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "must be a hex color");

const onboardingQuestion = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["text", "single_select", "multi_select", "boolean", "date", "phone", "email"]),
  options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  required: z.boolean(),
  visibleForRoles: z.array(z.string()).optional(),
});

const roleButton = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  roleRequested: z.string().min(1),
  entryFlow: z.enum(["signin", "signup", "apply", "invite_only"]),
  defaultRouteAfterLogin: z.string().startsWith("/"),
  visible: z.boolean(),
  sortOrder: z.number().int(),
});

const navItem = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  route: z.string().startsWith("/"),
  icon: z.string().optional(),
  // Free-form: the package doesn't know which runtimes the consumer ships.
  requiredModule: z.string().min(1).optional(),
  requiredEntitlement: z.string().optional(),
  visibleForRoles: z.array(z.string()).optional(),
});

export const appShellConfigSchema = z.object({
  appId: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  status: z.enum(["draft", "preview", "published", "retired"]),
  version: z.string().min(1),
  identity: z.object({
    displayName: z.string().min(1),
    shortName: z.string().min(1),
    bundleId: z.string().optional(),
    packageName: z.string().optional(),
  }),
  programContext: z.object({
    nexusOrgId: z.string(),
    programId: z.string(),
    offeringId: z.string().optional(),
    defaultDomainId: z.string(),
  }),
  branding: z.object({
    primaryColor: hex,
    secondaryColor: hex.optional(),
    accentColor: hex.optional(),
    backgroundColor: hex.optional(),
    surfaceColor: hex.optional(),
    textColor: hex.optional(),
    mutedColor: hex.optional(),
    fontFamily: z.string().optional(),
    displayFontFamily: z.string().optional(),
    scheme: z.enum(["light", "dark"]).optional(),
    markGlyph: z.string().optional(),
  }),
  copy: z.object({
    welcomeTitle: z.string().min(1),
    welcomeSubtitle: z.string().optional(),
    loginTitle: z.string().optional(),
    signupTitle: z.string().optional(),
    footerText: z.string().optional(),
  }),
  auth: z.object({
    allowedMethods: z.array(z.enum(["email", "phone", "otp", "google", "apple"])).min(1),
    requireInviteCode: z.boolean().optional(),
    allowSelfSignup: z.boolean(),
    allowAdminEnrollment: z.boolean(),
  }),
  roleButtons: z.array(roleButton).min(1),
  onboarding: z.object({
    questions: z.array(onboardingQuestion),
    requiredForRoles: z.array(z.string()).optional(),
  }),
  navigation: z.object({
    homeRoute: z.string().startsWith("/"),
    tabs: z.array(navItem).min(1),
    hiddenRoutes: z.array(z.string()).optional(),
  }),
  // Free-form module map — consumer-domain keys, package stays agnostic.
  enabledModules: z.record(z.boolean()),
  featureFlags: z.record(z.boolean()),
  entitlements: z.object({
    requiredEntitlementKeys: z.array(z.string()),
    coachUpsellEnabled: z.boolean().optional(),
    upgradeRoute: z.string().optional(),
  }),
  build: z.object({
    appVariant: z.string(),
    runtimeTemplate: z.enum(["learning-app", "bridge-app", "general-app"]),
    environment: z.enum(["dev", "staging", "production"]),
    configFrozenAtBuild: z.boolean(),
  }),
});

export interface ValidationOk { ok: true; config: AppShellConfig }
export interface ValidationErr { ok: false; errors: string[] }

export function validateAppShellConfig(raw: unknown): ValidationOk | ValidationErr {
  const parsed = appShellConfigSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  }
  const config = parsed.data as AppShellConfig;
  // Cross-field checks the schema can't express.
  const errors: string[] = [];
  for (const tab of config.navigation.tabs) {
    if (tab.requiredModule && !config.enabledModules[tab.requiredModule]) {
      errors.push(`navigation.tabs[${tab.key}]: requires module "${tab.requiredModule}" which is disabled`);
    }
  }
  const roleKeys = new Set(config.roleButtons.map((r) => r.key));
  if (roleKeys.size !== config.roleButtons.length) errors.push("roleButtons: duplicate keys");
  return errors.length ? { ok: false, errors } : { ok: true, config };
}

/**
 * Config dialects.
 *
 * Two tools edit the same registered_apps.shell_config record:
 *   • the Nexus console's Shell Editor speaks {identity, branding, copy, auth,
 *     navigation, onboarding, signupFields} — and the backend's boot-config
 *     adapter reads those fields;
 *   • this Studio speaks the richer AppShellConfig (roles, home screen,
 *     content section, …).
 *
 * On publish, the Studio stores its full config under a `studio` key —
 * authoritative for the Player — AND derives the console-dialect fields from
 * it, so the console editor and the legacy adapter keep showing the truth.
 * Unknown keys already in the record are preserved.
 */
import type { AppShellConfig } from "../types";
import { slugify } from "./client";

/** Studio config → the server record to PUT. */
export function toServerRecord(
  config: AppShellConfig,
  existing: Record<string, unknown> = {},
): Record<string, unknown> {
  const methods: string[] = [];
  if (config.authToggles.emailPassword) methods.push("email");
  if (config.authToggles.googleSSO) methods.push("google");
  // The console dialect has no "magic link" — closest runtime method is otp.
  if (config.authToggles.magicLink) methods.push("otp");

  return {
    ...existing,
    studio: config,
    identity: {
      ...(existing.identity as Record<string, unknown> | undefined),
      displayName: config.name,
      shortName: config.logoInitials || config.name,
    },
    branding: {
      ...(existing.branding as Record<string, unknown> | undefined),
      primaryColor: config.accentColor,
      accentColor: config.accentColor,
      textColor: config.accentForeground,
      logoText: config.logoInitials,
    },
    copy: {
      ...(existing.copy as Record<string, unknown> | undefined),
      welcomeTitle: config.welcomeTitle,
      welcomeSubtitle: config.welcomeSubtitle,
    },
    auth: {
      ...(existing.auth as Record<string, unknown> | undefined),
      methods: methods.length ? methods : ["email"],
      allowSelfSignup: config.registrationPath === "public",
      requireInviteCode: config.registrationPath === "invite-code",
    },
    onboarding: config.onboardingQuestions.map((q, i) => ({
      key: slugify(q.prompt) || `q${i}`,
      label: q.prompt,
    })),
    navigation: config.homeConfig.navItems.map((n, i) => ({
      key: slugify(n.label) || `t${i}`,
      label: n.label,
    })),
  };
}

/** The Studio config stored in a server record, when one was ever published from here. */
export function studioFromServerRecord(record: Record<string, unknown>): AppShellConfig | null {
  const s = record.studio as AppShellConfig | undefined;
  if (s && typeof s.id === "string" && typeof s.name === "string" && Array.isArray(s.roles) && s.homeConfig) {
    return s;
  }
  return null;
}

type Rec = Record<string, unknown>;

/**
 * Best-effort import of a CONSOLE-dialect record (an app configured in the
 * Nexus console's editor, never Studio-published): branding, copy, auth,
 * onboarding, and navigation carry over; the rest starts from sane defaults.
 * Null when the record holds nothing to import.
 */
export function studioFromConsoleRecord(
  record: Rec,
  seed: { id: string; name: string },
): AppShellConfig | null {
  const has = ["identity", "branding", "copy", "auth", "onboarding", "navigation"].some(
    (k) => record[k] !== undefined,
  );
  if (!has) return null;

  const identity = (record.identity ?? {}) as Rec;
  const branding = (record.branding ?? {}) as Rec;
  const copy = (record.copy ?? {}) as Rec;
  const auth = (record.auth ?? {}) as Rec;
  const methods = (auth.methods as string[] | undefined) ?? [];
  const onboarding = ((record.onboarding ?? []) as Rec[]).filter((q) => q.label);
  const navigation = ((record.navigation ?? []) as Rec[]).filter((n) => n.label);
  const name = (identity.displayName as string) || seed.name;

  return {
    id: seed.id,
    name,
    tagline: "",
    appType: "learning",
    category: "learning",
    logoInitials: String(branding.logoText ?? identity.shortName ?? name).slice(0, 2).toUpperCase(),
    accentColor: (branding.primaryColor as string) || "#4f46e5",
    accentForeground: (branding.textColor as string) || "#ffffff",
    welcomeTitle: (copy.welcomeTitle as string) || "Welcome",
    welcomeSubtitle: (copy.welcomeSubtitle as string) || "",
    roles: [{ label: "Student", description: "Sign in with your school account" }],
    registrationPath: auth.requireInviteCode
      ? "invite-code"
      : auth.allowSelfSignup === false
        ? "admin-added"
        : "public",
    requireApproval: false,
    authToggles: {
      emailPassword: methods.length === 0 || methods.includes("email"),
      googleSSO: methods.includes("google"),
      magicLink: methods.includes("otp"),
    },
    onboardingQuestions: onboarding.map((q) => ({
      prompt: String(q.label),
      type: "text",
      required: false,
      options: [],
    })),
    onboardingOptional: true,
    homeConfig: {
      greeting: "Hello, {name}!",
      subtitle: "",
      tiles: [],
      showFeed: false,
      feedLabel: "Recent Activity",
      navItems: navigation.length ? navigation.map((n) => ({ label: String(n.label) })) : [{ label: "Home" }],
      activeNavIndex: 0,
    },
  };
}

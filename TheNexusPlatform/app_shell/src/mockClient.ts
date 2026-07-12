/**
 * Mock ShellPlatformClient — the demo's stand-in for the Nexus-backed client.
 * Integrating with the real platform later means writing one class with the
 * same four methods against /api/apps/{slug}/… — no shell changes.
 *
 * Sessions live in localStorage, namespaced per app slug, so "installing"
 * two apps in one browser keeps their sessions separate like real devices.
 */
import type { AppShellConfig, LaunchContext, ShellPlatformClient } from "@laic/app-shell";

interface StoredUser {
  userId: string;
  email: string;
  displayName: string;
  selectedRole: string;
  onboardingComplete: boolean;
  answers?: Record<string, unknown>;
}

export function createMockClient(slug: string): ShellPlatformClient {
  const KEY = `laic_shell.${slug}.user`;
  const read = (): StoredUser | null => {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredUser) : null;
  };
  const write = (u: StoredUser | null) => {
    if (u) localStorage.setItem(KEY, JSON.stringify(u));
    else localStorage.removeItem(KEY);
  };

  return {
    async authenticate(opts) {
      await new Promise((r) => setTimeout(r, 450)); // let the UI breathe
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(opts.email)) throw new Error("Enter a valid email address");
      if (opts.password.length < 6) throw new Error("Password must be at least 6 characters");
      write({
        userId: crypto.randomUUID(),
        email: opts.email,
        displayName: opts.displayName || opts.email.split("@")[0],
        selectedRole: opts.selectedRole,
        onboardingComplete: false,
      });
    },

    signOut() {
      write(null);
    },

    async getLaunchContext(config: AppShellConfig): Promise<LaunchContext | null> {
      const u = read();
      if (!u) return null;
      const roleBtn = config.roleButtons.find((r) => r.roleRequested === u.selectedRole);
      // Demo entitlement model: base keys granted, "*_pro" keys withheld so
      // the EntitlementGate + upsell path stays visible in the prototype.
      const entitlements = config.entitlements.requiredEntitlementKeys.filter((k) => !k.endsWith("_pro"));
      return {
        userId: u.userId,
        appId: config.appId,
        programId: config.programContext.programId,
        organizationId: config.programContext.nexusOrgId,
        selectedRole: u.selectedRole,
        displayName: u.displayName,
        permissions: [],
        entitlements,
        defaultRoute: roleBtn?.defaultRouteAfterLogin || config.navigation.homeRoute,
        enabledModules: config.enabledModules,
        onboardingComplete: u.onboardingComplete,
      };
    },

    async submitOnboarding(payload) {
      await new Promise((r) => setTimeout(r, 350));
      const u = read();
      if (!u) throw new Error("Not signed in");
      write({ ...u, onboardingComplete: true, answers: payload.answers });
    },
  };
}

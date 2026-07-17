/**
 * Real ShellPlatformClient — the Nexus-backed implementation of the same four
 * methods the mock provides. Used automatically for apps whose config was
 * booted from Nexus (any slug that isn't a bundled demo seed).
 *
 *  - authenticate: real account signup/login against /api/platform/auth/*
 *  - first getLaunchContext after signup: posts the registration through the
 *    app's signup hook (/api/hook/registrations) so the person lands in the
 *    program's registration queue in Nexus — the prototype's signature loop.
 *
 * The hook key is app-scoped and comes from VITE_NEXUS_HOOK_KEY (dev only —
 * a production app would hold its key server-side and proxy the hook call).
 */
import type { AppShellConfig, LaunchContext, ShellPlatformClient } from "@laic/app-shell";

const NEXUS_URL =
  (import.meta.env.VITE_NEXUS_URL as string | undefined)?.replace(/\/$/, "") || "http://localhost:8000";
const HOOK_KEY = (import.meta.env.VITE_NEXUS_HOOK_KEY as string | undefined) || "";

async function api<T>(path: string, opts: RequestInit = {}, token?: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${NEXUS_URL}${path}`, { ...opts, headers });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: unknown };
    throw new Error(typeof err.detail === "string" ? err.detail : `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

interface Session {
  token: string;
  selectedRole: string;
  registered: boolean;
  onboardingComplete: boolean;
  answers?: Record<string, unknown>;
}

export function createNexusClient(slug: string): ShellPlatformClient {
  const KEY = `laic_shell.${slug}.nexus_session`;
  const read = (): Session | null => {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  };
  const write = (s: Session | null) => {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  };

  return {
    async authenticate(opts) {
      let token: string;
      try {
        const u = await api<{ access_token: string }>("/api/platform/auth/signup", {
          method: "POST",
          body: JSON.stringify({
            signup_type: "student",
            email: opts.email,
            password: opts.password,
            display_name: opts.displayName || undefined,
          }),
        });
        token = u.access_token;
      } catch {
        // Already registered → sign in instead.
        const u = await api<{ access_token: string }>("/api/platform/auth/login", {
          method: "POST",
          body: JSON.stringify({ email: opts.email, password: opts.password }),
        });
        token = u.access_token;
      }
      write({ token, selectedRole: opts.selectedRole, registered: false, onboardingComplete: false });
    },

    signOut() {
      write(null);
    },

    async getLaunchContext(config: AppShellConfig): Promise<LaunchContext | null> {
      const s = read();
      if (!s) return null;
      let me: { id: string; display_name?: string; email: string };
      try {
        me = await api("/api/platform/auth/me", {}, s.token);
      } catch {
        write(null); // stale/invalid token
        return null;
      }

      // One-time: push the signup through the app's hook so it appears in the
      // Nexus registration queue. Deferred until onboarding is done when the
      // config asks onboarding questions — those carry the app's required
      // sign-up fields (the fixed auth form only collects name/email/password).
      const needsOnboarding = config.onboarding.questions.length > 0;
      const readyToRegister = !needsOnboarding || s.onboardingComplete;
      if (!s.registered && readyToRegister && HOOK_KEY && config.programContext.offeringId) {
        try {
          await api(
            "/api/hook/registrations",
            {
              method: "POST",
              body: JSON.stringify({
                offering_id: config.programContext.offeringId,
                email: me.email,
                name: me.display_name ?? me.email.split("@")[0],
                field_data: { selected_role: s.selectedRole, ...(s.answers ?? {}) },
              }),
            },
            HOOK_KEY,
          );
        } catch {
          // Duplicate/closed-offering errors shouldn't lock the user out of the app.
        }
        write({ ...s, registered: true });
      }

      const roleBtn = config.roleButtons.find((r) => r.roleRequested === s.selectedRole);
      return {
        userId: me.id,
        appId: config.appId,
        programId: config.programContext.programId,
        organizationId: config.programContext.nexusOrgId,
        selectedRole: s.selectedRole,
        displayName: me.display_name ?? me.email.split("@")[0],
        permissions: [],
        entitlements: config.entitlements.requiredEntitlementKeys.filter((k) => !k.endsWith("_pro")),
        defaultRoute: roleBtn?.defaultRouteAfterLogin || config.navigation.homeRoute,
        enabledModules: config.enabledModules,
        onboardingComplete: s.onboardingComplete,
      };
    },

    async submitOnboarding(payload) {
      const s = read();
      if (!s) throw new Error("Not signed in");
      // Answers become the registration's field_data on the next context fetch.
      write({ ...s, onboardingComplete: true, answers: payload.answers });
    },
  };
}

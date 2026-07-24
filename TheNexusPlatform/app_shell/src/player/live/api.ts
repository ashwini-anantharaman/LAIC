/**
 * The live Player's backend client — the published app talking to Nexus.
 *
 * Three calls, in the order a student experiences them:
 *   1. bootConfig  — public; what the app looks like (published version)
 *   2. login/me    — org-scoped sign-in with the account the org invited
 *   3. launchBridge — a single-use ticket, then the browser goes to Bridge
 */
import type { AppShellConfig } from "../../types";

export interface BootConfig {
  slug: string;
  version: string;
  org: { slug: string; name: string } | null;
  programContext: { nexusOrgId: string; programId: string };
  content: {
    sectionTitle: string;
    connections: { platform: string; enabled: boolean; label: string; description: string }[];
  } | null;
  /** Full Studio config when the app was published from the Studio. */
  studio: AppShellConfig | null;
  /** "Create an account" target — the Studio's URL, else the program's
   *  auto-resolved participant sign-up gate. Null when there's no sign-up gate. */
  signupGateUrl?: string | null;
  identity: { displayName: string; shortName: string };
  branding: { primaryColor: string; textColor?: string; markGlyph?: string };
  copy: { welcomeTitle: string; welcomeSubtitle?: string };
}

export interface PlayerSession {
  token: string;
  email: string;
  displayName: string;
  role: string;
  /** True when this is a learner-participant session (the student model) — the
   *  only kind this app admits. Staff sessions are turned away at sign-in. */
  participantOnly: boolean;
}

const sessionKey = (slug: string) => `shell.player.session.${slug}`;

export function loadPlayerSession(slug: string): PlayerSession | null {
  try {
    const raw = localStorage.getItem(sessionKey(slug));
    if (!raw) return null;
    const s = JSON.parse(raw) as PlayerSession;
    return s && typeof s.token === "string" ? s : null;
  } catch {
    return null;
  }
}
export function savePlayerSession(slug: string, s: PlayerSession): void {
  localStorage.setItem(sessionKey(slug), JSON.stringify(s));
}
export function clearPlayerSession(slug: string): void {
  localStorage.removeItem(sessionKey(slug));
}

async function api<T>(baseUrl: string, path: string, opts: { method?: string; token?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl.replace(/\/+$/, "")}${path}`, {
      method: opts.method ?? "GET",
      headers: {
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    });
  } catch {
    throw new Error("Can't reach the server — check your connection and try again.");
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { detail?: unknown };
      if (typeof data.detail === "string") detail = data.detail;
    } catch {
      /* keep default */
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export function fetchBootConfig(baseUrl: string, slug: string): Promise<BootConfig> {
  return api<BootConfig>(baseUrl, `/api/apps/by-slug/${encodeURIComponent(slug)}/boot-config`);
}

/**
 * Org-scoped student sign-in. The org's door: the account must exist IN this
 * org (the org invited them); platform operators are refused by the backend.
 * Org/program admins sign in fine at the backend — the Player itself turns
 * them away (this app is the student view only).
 */
export async function loginStudent(
  baseUrl: string,
  orgSlug: string,
  email: string,
  password: string,
): Promise<PlayerSession> {
  const r = await api<{
    access_token: string;
    email: string;
    display_name: string | null;
    role: string;
    participant_only?: boolean;
  }>(baseUrl, "/api/platform/auth/login", { method: "POST", body: { email, password, org_slug: orgSlug } });
  return {
    token: r.access_token,
    email: r.email,
    displayName: r.display_name || r.email.split("@")[0],
    role: r.role,
    participantOnly: !!r.participant_only,
  };
}

/** Cheap token-validity probe used to resume a stored session on reload. */
export async function validateToken(baseUrl: string, token: string): Promise<boolean> {
  try {
    await fetchMe(baseUrl, token);
    return true;
  } catch {
    return false;
  }
}

/** This student's per-app data. `enrolled` is false when they aren't a
 *  participant of the app's program (the app then shows a "not enrolled" note). */
export interface AppUserData {
  enrolled: boolean;
  onboarding_completed: boolean;
  answers: Record<string, unknown>;
}

export function getMyData(baseUrl: string, slug: string, token: string): Promise<AppUserData> {
  return api<AppUserData>(baseUrl, `/api/apps/${encodeURIComponent(slug)}/me/data`, { token });
}

export function putMyData(
  baseUrl: string,
  slug: string,
  token: string,
  body: { answers: Record<string, unknown>; onboarding_completed: boolean },
): Promise<AppUserData> {
  return api<AppUserData>(baseUrl, `/api/apps/${encodeURIComponent(slug)}/me/data`, {
    method: "PUT",
    token,
    body,
  });
}

export interface Me {
  email: string;
  display_name: string | null;
  role: string;
  memberships: { org_id?: string; role?: string }[];
}

export function fetchMe(baseUrl: string, token: string): Promise<Me> {
  return api<Me>(baseUrl, "/api/platform/auth/me", { token });
}

/** Membership roles that mean "not a student" — the Player refuses them. */
const ADMIN_MEMBERSHIP_ROLES = ["owner", "administrator"];

export function isStudentStanding(me: Me, orgId: string): boolean {
  const inOrg = me.memberships.filter((m) => !m.org_id || m.org_id === orgId);
  if (inOrg.length === 0) return false;
  return !inOrg.some((m) => ADMIN_MEMBERSHIP_ROLES.includes(m.role ?? ""));
}

/** Mint the single-use Bridge ticket and return where to send the browser. */
export async function launchBridge(
  baseUrl: string,
  token: string,
  programId: string,
  returnUrl: string,
): Promise<string> {
  const r = await api<{ launch_url: string | null; launch_token: string }>(
    baseUrl,
    `/api/programs/${programId}/bridge-platform/launch`,
    { method: "POST", token },
  );
  if (!r.launch_url) {
    throw new Error("The Bridge Platform isn't connected for this program yet — ask your organization.");
  }
  const u = new URL(r.launch_url);
  u.searchParams.set("launch_token", r.launch_token);
  u.searchParams.set("program_id", programId);
  u.searchParams.set("return_url", returnUrl);
  return u.toString();
}

/**
 * Bridge People & Roles — thin client over Nexus's central assignment store.
 * The management UI lives HERE (Bridge decides its own role vocabulary and
 * views), but who-holds-what is Nexus data: the same answer drives org-portal
 * logins, test-as, and /bridge/context. http mode only.
 */
import { cookies } from "next/headers";
import { cachedNexusGet, invalidateNexusReads } from "./nexusCache";
import type { NexusBridgeContext } from "@laic/learner-contracts";
import { NEXUS_TOKEN_COOKIE } from "./nexusToken";

export interface BridgePerson {
  email: string | null;
  display_name: string | null;
  status: string;
  bridge_role: string | null;
  is_admin: boolean;
  membership_id: string | null;
  invitation_id: string | null;
}

/** The real Nexus program uuid rides the context as an additive extension. */
export function nexusProgramId(context: NexusBridgeContext): string | null {
  const ext = context as NexusBridgeContext & { nexus_program_id?: string };
  return ext.nexus_program_id ?? null;
}

export async function nexusFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const baseUrl = process.env.NEXUS_API_BASE_URL;
  if (!baseUrl) throw new Error("People & Roles requires NEXUS_API_BASE_URL (http mode)");
  const cookieStore = await cookies();
  const token = cookieStore.get(NEXUS_TOKEN_COOKIE)?.value;
  if (!token) throw new Error("Not signed in through Nexus");
  return fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

export async function listBridgePeople(programId: string): Promise<BridgePerson[]> {
  return cachedNexusGet(`people:${programId}`, async () => {
    const res = await nexusFetch(`/api/platform/bridge/people?program_id=${encodeURIComponent(programId)}`);
    if (!res.ok) throw new Error(`Nexus people request failed: ${res.status}`);
    return (await res.json()) as BridgePerson[];
  });
}

/**
 * Everyone in a Nexus program, with the id an invite can address.
 *
 * listBridgePeople above is email-keyed and so cannot name an invitee — every
 * bridge artifact keys on the org-scoped profile id, which is what
 * /bridge/context calls nexusUserId. This endpoint returns exactly that
 * (`profile_id`), so a challenge can invite the people of a program by their
 * Nexus account rather than by whatever roster the caller happens to see.
 */
export interface NexusProgramMember {
  profile_id: string | null;
  email: string | null;
  display_name: string | null;
  membership_role: string;
  status: string;
}

export async function listNexusProgramMembers(programId: string): Promise<NexusProgramMember[]> {
  return cachedNexusGet(`members:${programId}`, async () => {
    const res = await nexusFetch(`/api/programs/${encodeURIComponent(programId)}/members`);
    if (!res.ok) throw new Error(`Nexus members request failed: ${res.status}`);
    return (await res.json()) as NexusProgramMember[];
  });
}

export async function setBridgeRole(
  programId: string,
  email: string,
  role: string | null,
): Promise<void> {
  const res = await nexusFetch("/api/platform/bridge/people/role", {
    method: "PUT",
    body: JSON.stringify({ program_id: programId, email, role }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(err?.detail ?? `Nexus role update failed: ${res.status}`);
  }
  invalidateNexusReads(`people:${programId}`);
}

export interface BridgeInviteResult {
  /** Activation link — the person opens it at the org portal, sets their own
   *  password, and accepts. Their pre-assigned role applies on acceptance. */
  redeem_url: string;
}

/**
 * Invite a person to the program via the true Nexus link flow: creates a
 * PENDING invitation and returns an activation link. The person opens it, sets
 * their OWN password at the org portal, and becomes a program member. The bridge
 * role (if any) is pre-assigned email-keyed and applies when they accept.
 */
export async function inviteBridgePerson(
  programId: string,
  opts: { email: string; displayName?: string; role?: string | null },
): Promise<BridgeInviteResult> {
  const res = await nexusFetch(`/api/programs/${encodeURIComponent(programId)}/invite`, {
    method: "POST",
    body: JSON.stringify({
      email: opts.email,
      display_name: opts.displayName || undefined,
      platform: "bridge",
      role_id: opts.role || undefined,
    }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(err?.detail ?? `Nexus invitation failed: ${res.status}`);
  }
  invalidateNexusReads(`people:${programId}`);
  const inv = (await res.json()) as { redeem_url: string };
  return { redeem_url: inv.redeem_url };
}

/** Remove a person from the program (Bridge admin action). */
export async function removeBridgePerson(programId: string, email: string): Promise<void> {
  const res = await nexusFetch(
    `/api/platform/bridge/people?program_id=${encodeURIComponent(programId)}&email=${encodeURIComponent(email)}`,
    { method: "DELETE" },
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(err?.detail ?? `Nexus removal failed: ${res.status}`);
  }
  invalidateNexusReads(`people:${programId}`);
}

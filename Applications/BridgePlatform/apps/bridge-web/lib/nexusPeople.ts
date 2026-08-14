/**
 * Bridge People & Roles — thin client over Nexus's central assignment store.
 * The management UI lives HERE (Bridge decides its own role vocabulary and
 * views), but who-holds-what is Nexus data: the same answer drives org-portal
 * logins, test-as, and /bridge/context. http mode only.
 */
import { cachedNexusGet, invalidateNexusReads } from "./nexusCache";
import type { NexusBridgeContext } from "@laic/learner-contracts";
import { requestAccessToken } from "./nexus";

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

/**
 * The CLUB's own program id, for a caller who reached the bridge through a
 * partner club — null for everyone else.
 *
 * nexusProgramId above is the CONNECTED PARENT for such a caller, because that
 * is where their data lives. It is the wrong id to ask "who is in my club": it
 * answers with the parent program's people. Anything about the club's own roster
 * must prefer this.
 */
export function nexusClubProgramId(context: NexusBridgeContext): string | null {
  const ext = context as NexusBridgeContext & { nexus_club_program_id?: string | null };
  return ext.nexus_club_program_id ?? null;
}

/**
 * Call Nexus AS THE CALLER.
 *
 * This read the launch cookie DIRECTLY, which meant it only ever worked inside the
 * embed. The native app has no cookie jar to share and sends its Nexus session as a
 * bearer instead, so every Nexus-backed read failed on the app's path — and because
 * those reads are wrapped in `.catch(() => [])`, it failed SILENTLY: an empty roster
 * reads as "nobody here" rather than as an error, which is how a club's invite list
 * could quietly become unusable after the directory stopped falling back to the
 * parent's roster.
 *
 * `requestAccessToken` already answers "who is calling" for both carriers, with the
 * header winning, so this defers to it rather than keeping a second opinion about
 * credentials that can drift from the first.
 */
export async function nexusFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const baseUrl = process.env.NEXUS_API_BASE_URL;
  if (!baseUrl) throw new Error("People & Roles requires NEXUS_API_BASE_URL (http mode)");
  // requestAccessToken already answers "who is calling" for BOTH carriers, with the
  // header winning — so this needs no opinion of its own beyond an explicit override.
  const token = await requestAccessToken();
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
  // Cached by program, not by caller: a program's members are the same answer
  // whoever asks, and the authorisation happens on the Nexus side per request.
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

/**
 * The caller's accepted FRIENDS, as ids an invite can address.
 *
 * A private table is invited from this list rather than from a club roster, which is
 * the whole point of it: a friend may be in another club, or in none. It is also what
 * keeps the create path honest once the club's create right no longer gates it —
 * "anyone may set up a private table" is safe precisely because the people they can
 * invite are the people who already agreed to be their friend.
 *
 * Not cached: a friendship accepted a moment ago should be invitable now, and this is
 * one small request on a screen the person opened deliberately.
 */
export interface NexusFriend {
  profileId: string;
  name: string;
  username: string | null;
}

export async function listNexusFriends(): Promise<NexusFriend[]> {
  const res = await nexusFetch("/api/friends");
  if (!res.ok) throw new Error(`Nexus friends request failed: ${res.status}`);
  const json = (await res.json()) as { friends?: NexusFriend[] };
  return json.friends ?? [];
}

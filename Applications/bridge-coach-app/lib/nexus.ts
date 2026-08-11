// Minimal Nexus API client for the Bridge Coach app.
//
// Auth model (Option A — the app is the LAIC Bridge Program app):
//   - Registration: POST /api/platform/gates/:gate_id/signup through the
//     program's participant gate — creates the account AND registers the
//     person as a learner of the Bridge Program.
//   - Sign-in: POST /api/platform/auth/login with org_slug — works for both
//     learners and staff of the org (the signup gate is signup-only).
//   - All authenticated calls send `Authorization: Bearer <access_token>`.

import { GATE_SLUG, NEXUS_API_URL, ORG_SLUG, PROGRAM_ID } from "./config";
import { reportSessionExpired } from "./session-expiry";

export class NexusError extends Error {
  status: number;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "NexusError";
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: {
    method?: string;
    token?: string;
    body?: unknown;
  } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${NEXUS_API_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new NexusError(0, "Cannot reach the server. Check your connection.");
  }

  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    // A 401 on a TOKEN-BEARING call means the session token is dead (they
    // live one hour) — report it so auth-context signs out to the login
    // screen. Un-tokened 401s (a wrong password at login) are not that.
    if (response.status === 401 && options.token) reportSessionExpired();
    const detail =
      typeof json.detail === "string" ? json.detail : `Request failed (${response.status})`;
    throw new NexusError(response.status, detail);
  }
  return json as T;
}

// ── Types (fields the app actually uses) ─────────────────────────────────────

export type Gate = {
  id: string;
  title: string | null;
  subtitle: string | null;
  allow_signin: boolean;
  allow_signup: boolean;
  approval_required: boolean;
  role_ids: string[];
  org: {
    id: string;
    slug: string;
    name: string;
    theme_accent_color: string | null;
  };
};

export type Session = {
  access_token: string;
};

export type GateSignupResult = {
  access_token?: string;
  pending: boolean;
  landing: string | null;
};

/**
 * One org/program membership from /auth/me.
 *
 * `role` is the membership's role in that program — "owner", "administrator",
 * "instructor", "member", "student" — and it is what decides whether this app
 * shows the coach view or the learner view. `program_category` is "partner" for
 * a partner org (a "sister program", e.g. Club 1).
 */
export type NexusMembership = {
  id: string;
  org_id: string;
  org_slug: string;
  org_name: string;
  role: string;
  program_id: string | null;
  program_name: string | null;
  program_category: string | null;
  /** "edit" | "view" | … — the membership's capability in that program. */
  access: string | null;
};

export type NexusUser = {
  id: string;
  email: string;
  display_name: string | null;
  /**
   * True while the password was handed over by an admin rather than chosen by
   * this person. One credential is shared across every club they belong to, so
   * until they own it an admin could reset it — the app makes them choose one
   * before showing anything else (backend 0046).
   */
  must_set_password?: boolean;
  /** Profile-level role: "org_admin", "teacher", "student", "platform_admin". */
  role: string;
  /** Present on /auth/me; absent from the login response. */
  memberships?: NexusMembership[];
};

/** One section of a concept card (fields are optional; render what's present).
 *  Mirrors the learning platform's ConceptCardContent. */
export type ConceptCardContent = {
  term: string;
  oneSentenceMeaning?: string;
  whyItMatters?: string;
  coreIdea?: string;
  keyComponents?: string[];
  example?: string;
  nonExample?: string;
  visualOrFormula?: string;
  commonMistake?: string;
  connection?: string;
  recallQuestion?: string;
  teachBack?: string;
  /** Older saved cards use these instead. */
  definition?: string;
  analogy?: string;
};

export type LearningBlock = {
  id: string;
  type: string;
  content?: ConceptCardContent & Record<string, unknown>;
};

/** A learning object as returned by GET /learning/objects (snake_case rows). */
export type LearningObject = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  status: string;
  owner_name: string | null;
  estimated_time: string | null;
  tags: string[] | null;
  blocks: LearningBlock[] | null;
  updated_at: string | null;
  /** The author's folders (0003). Ids are stable across renames; names are what a
   *  reader can display without holding the Studio's collection table. Both are
   *  empty arrays when the object is filed nowhere — or when the server predates
   *  the migration, so a consumer can treat them as arrays unconditionally. */
  collection_ids?: string[];
  collection_names?: string[];
};

// ── Endpoints ────────────────────────────────────────────────────────────────

/** Public: the app's signup gate, with org branding. */
export function fetchGate(): Promise<Gate> {
  return request<Gate>(`/api/gates/by-path/${ORG_SLUG}/${GATE_SLUG}`);
}

/** Register a new learner through the program gate. */
export function gateSignup(
  gateId: string,
  input: { email: string; password: string; name?: string },
): Promise<GateSignupResult> {
  return request<GateSignupResult>(`/api/platform/gates/${gateId}/signup`, {
    method: "POST",
    body: {
      email: input.email,
      password: input.password,
      name: input.name || undefined,
    },
  });
}

/** Sign in an existing account, scoped to this app's org. */
export function login(input: { email: string; password: string }): Promise<Session> {
  return request<Session>("/api/platform/auth/login", {
    method: "POST",
    body: { email: input.email, password: input.password, org_slug: ORG_SLUG },
  });
}

/** One member of a program, from /api/programs/:id/members. */
export type ProgramMemberRow = {
  membership_id: string | null;
  invitation_id: string | null;
  /** Org-scoped profile id — the key this person's picture is stored under. */
  profile_id?: string | null;
  email: string | null;
  username?: string | null;
  display_name: string | null;
  /** "owner" | "administrator" | "instructor" | "member" | … */
  membership_role: string;
  status: string;
  role_name?: string | null;
};

/**
 * Everyone in a program — the club roster.
 *
 * Readable by any member of the program (not just staff), which is what lets a
 * learner see who else is in their club. Takes the program id explicitly because
 * a partner club's id comes from the caller's own membership, not from the
 * app-wide PROGRAM_ID constant.
 */
export function fetchProgramMembers(
  token: string,
  programId: string,
): Promise<ProgramMemberRow[]> {
  return request<ProgramMemberRow[]>(`/api/programs/${programId}/members`, { token });
}

/**
 * One message in a club's chat thread (backend migration 0039).
 *
 * `author_name` and `author_standing` are joined server-side from the author's
 * profile and their membership in THIS club, so they follow a rename or a
 * promotion rather than freezing whatever was true when the message was sent.
 */
export type ClubChatMessage = {
  id: string;
  author_profile_id: string;
  author_name: string | null;
  /** "Coach" | "Learner" — the label shown beside the name. */
  author_standing: string;
  body: string;
  /** An attached picture as a data URL; a message may be image-only. */
  image: string | null;
  pinned: boolean;
  created_at: string;
  /** Did the caller write it? Decided server-side: the client holds an auth id,
   *  not the profile id messages are authored by. */
  mine: boolean;
};

/** The club's thread, oldest first. Readable by any member of the club. */
export function fetchClubChat(token: string, programId: string): Promise<ClubChatMessage[]> {
  return request<ClubChatMessage[]>(`/api/programs/${programId}/chat`, { token });
}

export function postClubChatMessage(
  token: string,
  programId: string,
  body: string,
  image?: string | null,
): Promise<{ id: string }> {
  return request<{ id: string }>(`/api/programs/${programId}/chat`, {
    method: "POST",
    token,
    body: { body, image: image ?? null },
  });
}

/** Pin or unpin a message. One shared pin list per club, so this is not per-user. */
export function setClubChatMessagePinned(
  token: string,
  programId: string,
  messageId: string,
  pinned: boolean,
): Promise<{ id: string; pinned: boolean }> {
  return request<{ id: string; pinned: boolean }>(
    `/api/programs/${programId}/chat/${messageId}/pin`,
    { method: "PATCH", token, body: { pinned } },
  );
}

// ── Profile pictures ─────────────────────────────────────────────────────────
//
// Stored as base64 data URLs on the profile row, so a picture is a string the
// app can hand straight to <Image source={{ uri }}>. Reading is separate from
// /auth/me because an avatar is tens of kilobytes and /auth/me runs on every
// launch.

/** The caller's own picture, or null. */
export async function fetchMyAvatar(token: string): Promise<string | null> {
  const res = await request<{ avatar: string | null }>("/api/platform/profile/avatar", { token });
  return res.avatar;
}

/** Set the caller's own picture; pass null to remove it. */
export async function setMyAvatar(token: string, avatar: string | null): Promise<void> {
  await request("/api/platform/profile/avatar", { method: "PUT", token, body: { avatar } });
}

/**
 * Pictures for many profiles at once, as { profile_id: data_url }.
 *
 * One request per face would be dozens of round trips for a roster or a chat
 * thread. Ids with no picture are simply absent from the result.
 */
export async function fetchAvatars(
  token: string,
  profileIds: string[],
): Promise<Record<string, string>> {
  if (profileIds.length === 0) return {};
  const res = await request<{ avatars: Record<string, string> }>(
    "/api/platform/profile/avatars",
    { method: "POST", token, body: { profile_ids: profileIds } },
  );
  return res.avatars;
}

// ── Club header image ────────────────────────────────────────────────────────

/** The club's banner, or null. Readable by any member of the club. */
export async function fetchClubHeaderImage(
  token: string,
  programId: string,
): Promise<string | null> {
  const res = await request<{ header_image: string | null }>(
    `/api/programs/${programId}/header-image`,
    { token },
  );
  return res.header_image;
}

/** Set or clear the club's banner. Staff only — a learner gets a 403. */
export async function setClubHeaderImage(
  token: string,
  programId: string,
  headerImage: string | null,
): Promise<void> {
  await request(`/api/programs/${programId}/header-image`, {
    method: "PUT",
    token,
    body: { header_image: headerImage },
  });
}

// ── Password ownership ───────────────────────────────────────────────────────

/** Change your own password. The current one is required. */
export async function changeMyPassword(
  token: string,
  currentPassword: string,
  password: string,
): Promise<void> {
  await request("/api/platform/auth/password", {
    method: "POST",
    token,
    body: { current_password: currentPassword, password },
  });
}

/**
 * Redeem a claim code an admin read out, and set a password. Unauthenticated —
 * the whole point is that the person cannot sign in.
 */
export async function claimAccount(
  identifier: string,
  code: string,
  password: string,
): Promise<{ email: string }> {
  return request<{ email: string }>("/api/platform/auth/claim", {
    method: "POST",
    body: { identifier, code, password },
  });
}

/** The signed-in user's identity. */
export function fetchMe(token: string): Promise<NexusUser> {
  return request<NexusUser>("/api/platform/auth/me", { token });
}

/** The org's learning objects, metadata only (no content payloads — the full
 *  list can run to tens of MB; content renders in the platform WebView). */
export function fetchLearningObjects(
  token: string,
  programId: string | undefined = PROGRAM_ID,
): Promise<LearningObject[]> {
  return request<LearningObject[]>(
    `/api/platform/learning/objects?program_id=${programId ?? PROGRAM_ID}&meta=1`,
    { token },
  );
}

export type PlatformLaunch = {
  launch_url: string | null;
  /** Single-use token the platform exchanges for its own session. */
  launch_token: string;
  expires_at: string;
};

/**
 * Mint a single-use launch into the learning platform (works for learners).
 *
 * `programId` decides WHICH program's access is resolved — see
 * launchBridgePlatform's note. A club's people are not in the app-wide program,
 * so launching it for them resolves no access at all.
 */
export function launchLearningPlatform(
  token: string,
  programId: string | undefined = PROGRAM_ID,
): Promise<PlatformLaunch> {
  return request<PlatformLaunch>(
    `/api/programs/${programId ?? PROGRAM_ID}/learning-platform/launch`,
    { method: "POST", token },
  );
}

export type InProgressBoard = {
  session_id: string;
  board_name: string;
  updated_at: string | null;
};

export type DealOfTheDay = {
  entry_id: string;
  name: string | null;
  dealer: string | null;
  vul: string | null;
  contract_label: string | null;
};

/**
 * One hired coach as the summary carries them, with this learner's own tallies
 * against that coach.
 *
 * The counts are OPTIONAL on purpose: the app ships to testers over Expo
 * independently of the backend deploy, so an older API answers without them.
 * Absent therefore means UNKNOWN, not zero — a card must say nothing rather
 * than invent "no games sent".
 */
export type SummaryCoach = {
  coach_id: string;
  name: string;
  /** Games this learner has sent them, in total. */
  sent?: number;
  /** …of those, how many they have reviewed. */
  reviewed?: number;
  /** …and how many are still waiting on them. */
  pending?: number;
};

export type BridgeSummary = {
  assignments_open: number;
  plays_reviewed: number;
  reviews_pending: number;
  roster_count: number;
  /** The PRIMARY coach (legacy single-coach callers). */
  coach: SummaryCoach | null;
  /** EVERY hired coach (multi-coach, 2026-08-09), name-sorted by the server —
   *  so card order, and the suit alternation riding on it, stays stable. */
  coaches: SummaryCoach[];
  /** Boards started and not finished — the Play tab's Resume. */
  in_progress: InProgressBoard[];
  /** One board a day, same for everyone in the program. */
  deal_of_the_day: DealOfTheDay | null;
};

/** Role-aware activity counts for the live Home screen (today-feed). */
export function fetchBridgeSummary(
  token: string,
  programId: string | undefined = PROGRAM_ID,
): Promise<BridgeSummary> {
  return request<BridgeSummary>(
    `/api/platform/bridge/summary?program_id=${programId ?? PROGRAM_ID}`,
    { token },
  );
}

/** Mint a single-use launch into the bridge platform (works for learners). */
/**
 * Mint a launch into the bridge platform.
 *
 * `programId` decides WHO the platform thinks you are. Launching the app-wide
 * Bridge Program is right for a member of it — and wrong for a club's people, who
 * are not in that program and so arrive with no standing at all (every challenge
 * route then renders its 404-for-forbidden). Pass the club and the partner path
 * resolves instead, emitting bridge_club_member.
 */
export function launchBridgePlatform(
  token: string,
  programId: string = PROGRAM_ID,
): Promise<PlatformLaunch> {
  return request<PlatformLaunch>(
    `/api/programs/${programId}/bridge-platform/launch`,
    { method: "POST", token },
  );
}

/** The caller's role/access in the bridge platform for this program. */
export type BridgeContext = {
  accessLevel: string;
  roles: string[];
  is_admin: boolean;
  program_name?: string | null;
  /**
   * The name of the ONE role this person holds in this program, as the console
   * shows it — "Club Mentor", "Strange Mentor". Displayed beside them in the
   * roster, and the label for whatever capabilities they carry.
   */
  role_name?: string | null;
  /**
   * The capability ids that role grants, resolved server-side against the bridge
   * access catalogue. This is what every gate in the app reads.
   *
   * Empty means "no fine-grained role assigned" — NOT "no access". The server
   * uses the same convention (accessCatalogue/enforce.ts: an empty set means the
   * coarse membership guard still governs), so an account that predates roles
   * keeps working exactly as before.
   */
  capabilities?: string[];
};

/**
 * What the caller may do in THIS APP — its own access catalogue (provider
 * `club-app`), not the Bridge Platform's. `role_name` is the one role they hold
 * in the club; `capabilities` is what that role grants.
 */
export type AppContext = {
  program_id: string | null;
  program_name: string | null;
  role_name: string | null;
  capabilities: string[];
  is_admin: boolean;
};

export function fetchAppContext(token: string, programId: string): Promise<AppContext> {
  return request<AppContext>(`/api/platform/club-app/context?program_id=${programId}`, { token });
}

/** One member of the club with the app role they hold — the roster's labels. */
export type AppMemberRow = ProgramMemberRow & {
  app_role_id?: string | null;
  app_role_name?: string | null;
};

export function fetchAppMembers(token: string, programId: string): Promise<AppMemberRow[]> {
  return request<AppMemberRow[]>(`/api/platform/club-app/members?program_id=${programId}`, {
    token,
  });
}

export function fetchBridgeContext(
  token: string,
  programId: string | undefined = PROGRAM_ID,
): Promise<BridgeContext> {
  return request<BridgeContext>(
    `/api/platform/bridge/context?program_id=${programId ?? PROGRAM_ID}`,
    { token },
  );
}

/**
 * Change your own display name — global, across every club.
 *
 * A profile row is per (person, org), so the server renames all of them: the name
 * belongs to the person, not to a club. Returns the name the server stored, which
 * may differ from what was sent (it trims and collapses whitespace).
 */
export async function updateMyDisplayName(token: string, displayName: string): Promise<string> {
  const res = await request<{ ok: boolean; display_name: string }>("/api/platform/auth/me", {
    method: "PATCH",
    token,
    body: { display_name: displayName },
  });
  return res.display_name;
}

export type ProgramLearner = {
  user_id: string | null;
  email: string | null;
  name: string | null;
  joined_at: string | null;
};

/**
 * A CLUB'S learners, from the club's own roster.
 *
 * Not the same question as fetchProgramLearners. For a club's people,
 * resolvePlatformAccess redirects the data scope to the CONNECTED program (see
 * its partner branch), so the bridge roster answers about the parent program —
 * where a club mentor is nobody's coach, and the club's own learners do not
 * appear at all. /club-app/members resolves against the club itself, so this is
 * the roster a club actually has.
 *
 * Mentors, admins and owners are the people doing the coaching, so they are not
 * their own learners.
 */
const _NOT_A_LEARNER = new Set(["owner", "administrator", "instructor"]);

export async function fetchClubLearners(
  token: string,
  programId: string,
): Promise<ProgramLearner[]> {
  const members = await fetchAppMembers(token, programId);
  return members
    .filter((m) => !_NOT_A_LEARNER.has(m.membership_role))
    .map((m) => ({
      user_id: m.profile_id ?? null,
      email: m.email,
      name: m.display_name,
      joined_at: null,
    }));
}

/** The coach's learner roster (their hires); admins see the whole program. */
export function fetchProgramLearners(
  token: string,
  programId: string = PROGRAM_ID,
): Promise<ProgramLearner[]> {
  return request<ProgramLearner[]>(
    `/api/platform/bridge/learners?program_id=${programId}`,
    { token },
  );
}

export type Coach = {
  coach_id: string;
  name: string;
  learner_count: number;
};

export type MyCoach = { coach_id: string; name: string } | null;

/** The program's coaches — visible to learners (names only). */
export function fetchCoaches(
  token: string,
  programId: string = PROGRAM_ID,
): Promise<Coach[]> {
  return request<Coach[]>(
    `/api/platform/bridge/coaches?program_id=${programId}`,
    { token },
  );
}

/** The calling learner's current coach (null when none hired yet). */
export async function fetchMyCoach(
  token: string,
  programId: string = PROGRAM_ID,
): Promise<MyCoach> {
  const res = await request<{ coach: MyCoach }>(
    `/api/platform/bridge/my-coach?program_id=${programId}`,
    { token },
  );
  return res.coach;
}

/** EVERY coach this learner has hired (multi-coach). */
export async function fetchMyCoaches(
  token: string,
  programId: string = PROGRAM_ID,
): Promise<{ coach_id: string; name: string }[]> {
  const res = await request<{ coaches: { coach_id: string; name: string }[] }>(
    `/api/platform/bridge/my-coaches?program_id=${programId}`,
    { token },
  );
  return res.coaches ?? [];
}

/** Part ways with one coach (the others stay). */
export async function removeCoach(
  token: string,
  coachId: string,
  programId: string = PROGRAM_ID,
): Promise<void> {
  await request(
    `/api/platform/bridge/my-coach/${encodeURIComponent(coachId)}?program_id=${programId}`,
    { method: "DELETE", token },
  );
}

/** Hire a coach — ADDITIVE: joins your coaches, replaces nobody. */
export async function hireCoach(
  token: string,
  coachId: string,
  programId: string = PROGRAM_ID,
): Promise<MyCoach> {
  const res = await request<{ coach: MyCoach }>(
    `/api/platform/bridge/my-coach?program_id=${programId}`,
    { method: "POST", token, body: { coach_id: coachId } },
  );
  return res.coach;
}

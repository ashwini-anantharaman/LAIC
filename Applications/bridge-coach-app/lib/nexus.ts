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
import { reportSessionExpired, requestSessionRefresh } from "./session-expiry";

export class NexusError extends Error {
  status: number;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "NexusError";
    this.status = status;
  }
}

// Exported so feature modules (lib/friends.ts) reuse the token handling, the
// single refresh-and-retry, and the NexusError mapping rather than re-implementing
// them per feature — which is how two call sites end up disagreeing about a 401.
export async function request<T>(
  path: string,
  options: {
    method?: string;
    token?: string;
    body?: unknown;
    /** Set on the one retry after a refresh — never retry twice. */
    _retried?: boolean;
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
    // A 401 on a TOKEN-BEARING call means the access token is dead (they live
    // one hour). First ask auth-context for a refreshed token and retry ONCE;
    // only when that can't happen (no refresh flow, refresh failed) does the
    // sign-out fire. Un-tokened 401s (a wrong password at login) are not that.
    if (response.status === 401 && options.token) {
      if (!options._retried) {
        const fresh = await requestSessionRefresh();
        if (fresh && fresh !== options.token) {
          return request<T>(path, { ...options, token: fresh, _retried: true });
        }
      }
      reportSessionExpired();
    }
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
  /** Present in Supabase mode; rotates on every refresh. Absent = no refresh flow. */
  refresh_token?: string;
  /** Unix SECONDS when access_token dies (Supabase's unit). */
  expires_at?: number;
};

export type GateSignupResult = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
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
  /**
   * The program that OWNS this object — a club's own id for content its people
   * authored, the parent program's for shared curriculum. A club read returns
   * both, so this is how a caller tells them apart: the Learn tab shows the
   * curriculum, and a club's own content belongs to the club's surfaces.
   * Absent on a server that predates it.
   */
  program_id?: string | null;
  /** Which version's content this row holds, and when an author last published it
   *  (0004). Publishing overwrites the row, so there is exactly one row per object
   *  and it is always the current published version — no version filtering on the
   *  read side. `published_at` null means either never explicitly published, or
   *  published before versions were tracked; `version_number` null means the
   *  latter. Absent entirely on a server that predates the migration. */
  version_number?: number | null;
  published_at?: string | null;
  /**
   * Whose content this is (0006). `"program"` — the default, and every row written
   * before the column — means the club's: anyone who can see the club sees it.
   * `"user"` means the author's own, visible to them and to whoever they invited.
   *
   * Absent on a server that predates the migration, which is why callers must read
   * it as `?? "program"` rather than checking for `"user"` by inequality.
   */
  scope_level?: "user" | "program" | null;
};

/** What the Content Studio says this person may do in a given club. */
export type LearningContext = {
  programId: string | null;
  /** The club, when they arrived through one — the parent otherwise. */
  nexus_club_program_id?: string | null;
  /**
   * The club role's own `app.content.*` grants, alongside the learning ids they map
   * to. Sent as its own fact because one of them — `app.content.create.personal` —
   * has no learning image: "for myself or for the club" is a scope question, and the
   * learning catalogue has no id for it. Absent on an older server.
   */
  app_content_capabilities?: string[] | null;
  capabilities?: string[];
  is_admin?: boolean;
  program_name?: string | null;
};

/**
 * A drive: a space of this person's own, separate from the club's library.
 *
 * `has_drive` false is the ordinary answer for most people — having one is a
 * grant, not an assumption (migration 0014), so its absence is not an error and
 * the tab simply does not appear.
 *
 * `create_types` absent means unrestricted; PRESENT AND EMPTY means they may
 * create nothing. The two must not collapse: an empty list is somebody deciding.
 */
export type MyDrive = {
  has_drive: boolean;
  can_create?: boolean;
  create_types?: string[] | null;
  surfaces?: string[] | null;
  drive_id?: string | null;
  drive_name?: string | null;
  /** Where anything authored from the app lands. Made on first need. */
  drafts_id?: string | null;
  /**
   * The scope the drive lives in — the parent program, not the club.
   *
   * Use this for the follow-up folder and content reads: those resolve a club id
   * as the club, where no drive exists, so asking them with the club id returns
   * nothing while this endpoint happily found the drive.
   */
  program_id?: string | null;
};

/**
 * A single-use LAUNCH TOKEN for the Content Studio.
 *
 * The Studio does not accept this app's bearer token: it establishes its own
 * session from `?launch_token=`, and anything else is ignored. Passing the
 * bearer token meant no session was created at all -- so the Studio fell back to
 * its DEMO session, showed that browser's local folders (bb-tutorials, My
 * content, flashcards…), and every folder made in it was written to storage
 * nobody would ever read again.
 */
export function fetchLearningLaunch(
  token: string,
  programId?: string,
): Promise<{ launch_url: string | null; launch_token: string }> {
  return request<{ launch_url: string | null; launch_token: string }>(
    `/api/programs/${programId ?? PROGRAM_ID}/learning-platform/launch`,
    { token, method: "POST" },
  );
}

/**
 * The CONTENT of your own drive.
 *
 * Not getLearningObjects: that is the club's published learner feed, and a drive
 * save is a draft published nowhere. Asking it for drive content returns nothing
 * however much has been saved -- which is how "Saved into Drafts" and "0 items"
 * came to be true at the same time.
 */
export function fetchMyDriveObjects(
  token: string,
  driveId: string,
  programId?: string,
): Promise<{ objects?: LearningObject[] }> {
  return request(
    `/api/platform/learning/library?program_id=${programId ?? PROGRAM_ID}&scope=drive&drive=${encodeURIComponent(driveId)}`,
    { token },
  );
}

/**
 * Delete a folder from your own drive.
 *
 * The content survives — its items move to the drive root rather than going with
 * it. Removing a folder is tidying, not throwing work away.
 */
export function deleteMyDriveFolder(
  token: string,
  folderId: string,
  programId?: string,
): Promise<{ folders_removed: number; content_moved: number }> {
  return request(
    `/api/platform/learning/drives/mine/folders/${encodeURIComponent(folderId)}?program_id=${programId ?? PROGRAM_ID}`,
    { token, method: "DELETE" },
  );
}

/** Remove something from your own drive. */
export function deleteMyDriveObject(
  token: string,
  objectId: string,
  programId?: string,
): Promise<{ removed: boolean; unfiled?: boolean }> {
  return request(
    `/api/platform/learning/drives/mine/objects/${encodeURIComponent(objectId)}?program_id=${programId ?? PROGRAM_ID}`,
    { token, method: "DELETE" },
  );
}

/** The folders inside your own drive. */
export function fetchMyDriveFolders(
  token: string,
  driveId: string,
  programId?: string,
): Promise<{ folders?: { id: string; name: string; parent_id: string | null }[] }> {
  return request(
    `/api/platform/learning/collections?program_id=${programId ?? PROGRAM_ID}&scope=drive&drive=${encodeURIComponent(driveId)}`,
    { token },
  );
}

/** Make a folder inside your own drive. */
export function createMyDriveFolder(
  token: string,
  name: string,
  programId?: string,
): Promise<{ id: string; name: string }> {
  return request<{ id: string; name: string }>("/api/platform/learning/drives/mine/folders", {
    token,
    method: "POST",
    body: { program_id: programId ?? PROGRAM_ID, name },
  });
}

export function fetchMyDrive(token: string, programId?: string): Promise<MyDrive> {
  return request<MyDrive>(
    `/api/platform/learning/drives/mine?program_id=${programId ?? PROGRAM_ID}`,
    { token },
  );
}

/** The learning platform's context for one club — the app reads it only to know
 *  whether to offer authoring. */
export function fetchLearningContext(token: string, programId?: string): Promise<LearningContext> {
  return request<LearningContext>(
    `/api/platform/learning/context?program_id=${programId ?? PROGRAM_ID}`,
    { token },
  );
}

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

/**
 * Trade a refresh token for a fresh session. The response's refresh_token
 * REPLACES the one sent (rotation). 401 = spent/revoked; 404 = the backend
 * has no refresh flow (demo mode / older deploy) — both mean "give up".
 * Deliberately un-tokened: a 401 here must not recurse into the retry net.
 */
export function refreshSession(refreshToken: string): Promise<Session> {
  return request<Session>("/api/platform/auth/refresh", {
    method: "POST",
    body: { refresh_token: refreshToken },
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
/** Clear a club's whole thread. Returns how many messages went. */
export async function clearClubChat(token: string, programId: string): Promise<number> {
  const res = await request<{ ok: boolean; deleted: number }>(
    `/api/programs/${programId}/chat`,
    { method: "DELETE", token },
  );
  return res.deleted ?? 0;
}

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
  /** The club's own one-line label. Null when never set, absent on an older server. */
  program_description?: string | null;
  role_name: string | null;
  capabilities: string[];
  is_admin: boolean;
  /**
   * The org's CEILING for this club — what it was PROVISIONED, as opposed to what
   * this person's role grants. Enforced by can() ahead of all role logic, because
   * neither the admin bypass nor the empty-set fallback consults `capabilities`.
   *
   * Both are optional: an older server omits them, and their absence must read as
   * "no ceiling known" rather than "nothing provisioned".
   *   app_enabled === false        → the club app is off for this club.
   *   provisioned_capabilities     → only these `app.*` ids; null/absent = all.
   */
  app_enabled?: boolean;
  provisioned_capabilities?: string[] | null;
};

export function fetchAppContext(token: string, programId: string): Promise<AppContext> {
  return request<AppContext>(`/api/platform/club-app/context?program_id=${programId}`, { token });
}

/** One member of the club with the app role they hold — the roster's labels. */
export type AppMemberRow = ProgramMemberRow & {
  app_role_id?: string | null;
  app_role_name?: string | null;
  /** Server-computed: their club role grants coaching (or they hold the club
   *  structurally). The one signal that splits a club into coaches and
   *  learners — the membership role cannot (every enrollee is "instructor"). */
  is_coach?: boolean;
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

/** The coach's learner roster (their hires — in clubs exactly as in the main
 *  program; owner direction 2026-08-11, second pass); admins see the whole
 *  program. Pass the club id to ask about a club. */
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

// ── Sharing one object with named people ───────────────────────────────────
// The Docs model. A grant is the deliberate exception to a row's default audience
// (its scope + club), for one named subject — a person, or a club role. The server
// confines every subject to the club that owns the content; the app never has to
// police that, and should not pretend to.

export type LearningGrant = {
  subject_type: "profile" | "role";
  subject_id: string;
  level: "view" | "edit";
};

/** Who this object is shared with. Author-only on the server. */
export async function fetchLearningGrants(
  token: string,
  objectId: string,
  programId: string,
): Promise<LearningGrant[]> {
  const res = await request<{ grants: LearningGrant[] }>(
    `/api/platform/learning/objects/${encodeURIComponent(objectId)}/grants?program_id=${programId}`,
    { token },
  );
  return res.grants ?? [];
}

/** Invite someone, or change the level they already hold. Idempotent. */
export async function setLearningGrant(
  token: string,
  objectId: string,
  programId: string,
  grant: LearningGrant,
): Promise<void> {
  await request(
    `/api/platform/learning/objects/${encodeURIComponent(objectId)}/grants?program_id=${programId}`,
    { method: "PUT", token, body: grant },
  );
}

/** Withdraw a share. */
export async function removeLearningGrant(
  token: string,
  objectId: string,
  programId: string,
  subjectType: "profile" | "role",
  subjectId: string,
): Promise<void> {
  await request(
    `/api/platform/learning/objects/${encodeURIComponent(objectId)}/grants` +
      `?program_id=${programId}&subject_type=${subjectType}&subject_id=${encodeURIComponent(subjectId)}`,
    { method: "DELETE", token },
  );
}

/**
 * Erase a learning object, for good.
 *
 * Authority is the SERVER's: `learning.object.delete` (or the club role's
 * `app.content.delete`, which maps to it), and for a personal row, ownership. A
 * refusal comes back as a NexusError whose message is worth showing — "That content
 * belongs to someone else" is actionable in a way "couldn't delete" is not.
 */
export async function deleteLearningObject(
  token: string,
  objectId: string,
  programId: string,
): Promise<void> {
  await request(
    `/api/platform/learning/objects/${encodeURIComponent(objectId)}?program_id=${programId}`,
    { method: "DELETE", token },
  );
}

/**
 * Change the club's one-line description.
 *
 * Authority mirrors the club banner: `app.club.description.set`, falling back on the
 * server to the coarse club-staff check for a caller with no fine role at all. It was
 * previously settable only when the club was created — the console's program routes
 * cover name, theme, features and the catalogue, and never had a description among
 * them.
 */
export async function setClubDescription(
  token: string,
  programId: string,
  description: string,
): Promise<void> {
  await request(`/api/programs/${programId}/description`, {
    method: "PATCH",
    token,
    body: { description },
  });
}

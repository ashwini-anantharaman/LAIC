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

export type NexusUser = {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
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

/** The signed-in user's identity. */
export function fetchMe(token: string): Promise<NexusUser> {
  return request<NexusUser>("/api/platform/auth/me", { token });
}

/** The org's learning objects, metadata only (no content payloads — the full
 *  list can run to tens of MB; content renders in the platform WebView). */
export function fetchLearningObjects(token: string): Promise<LearningObject[]> {
  return request<LearningObject[]>(
    `/api/platform/learning/objects?program_id=${PROGRAM_ID}&meta=1`,
    { token },
  );
}

export type PlatformLaunch = {
  launch_url: string | null;
  /** Single-use token the platform exchanges for its own session. */
  launch_token: string;
  expires_at: string;
};

/** Mint a single-use launch into the learning platform (works for learners). */
export function launchLearningPlatform(token: string): Promise<PlatformLaunch> {
  return request<PlatformLaunch>(
    `/api/programs/${PROGRAM_ID}/learning-platform/launch`,
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

export type BridgeSummary = {
  assignments_open: number;
  plays_reviewed: number;
  reviews_pending: number;
  roster_count: number;
  coach: { coach_id: string; name: string } | null;
  /** Boards started and not finished — the Play tab's Resume. */
  in_progress: InProgressBoard[];
  /** One board a day, same for everyone in the program. */
  deal_of_the_day: DealOfTheDay | null;
};

/** Role-aware activity counts for the live Home screen (today-feed). */
export function fetchBridgeSummary(token: string): Promise<BridgeSummary> {
  return request<BridgeSummary>(
    `/api/platform/bridge/summary?program_id=${PROGRAM_ID}`,
    { token },
  );
}

/** Mint a single-use launch into the bridge platform (works for learners). */
export function launchBridgePlatform(token: string): Promise<PlatformLaunch> {
  return request<PlatformLaunch>(
    `/api/programs/${PROGRAM_ID}/bridge-platform/launch`,
    { method: "POST", token },
  );
}

/** The caller's role/access in the bridge platform for this program. */
export type BridgeContext = {
  accessLevel: string;
  roles: string[];
  is_admin: boolean;
  program_name?: string | null;
  role_name?: string | null;
};

export function fetchBridgeContext(token: string): Promise<BridgeContext> {
  return request<BridgeContext>(
    `/api/platform/bridge/context?program_id=${PROGRAM_ID}`,
    { token },
  );
}

export type ProgramLearner = {
  user_id: string | null;
  email: string | null;
  name: string | null;
  joined_at: string | null;
};

/** The coach's learner roster (their hires); admins see the whole program. */
export function fetchProgramLearners(token: string): Promise<ProgramLearner[]> {
  return request<ProgramLearner[]>(
    `/api/platform/bridge/learners?program_id=${PROGRAM_ID}`,
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
export function fetchCoaches(token: string): Promise<Coach[]> {
  return request<Coach[]>(
    `/api/platform/bridge/coaches?program_id=${PROGRAM_ID}`,
    { token },
  );
}

/** The calling learner's current coach (null when none hired yet). */
export async function fetchMyCoach(token: string): Promise<MyCoach> {
  const res = await request<{ coach: MyCoach }>(
    `/api/platform/bridge/my-coach?program_id=${PROGRAM_ID}`,
    { token },
  );
  return res.coach;
}

/** Hire (or switch to) a coach. */
export async function hireCoach(token: string, coachId: string): Promise<MyCoach> {
  const res = await request<{ coach: MyCoach }>(
    `/api/platform/bridge/my-coach?program_id=${PROGRAM_ID}`,
    { method: "POST", token, body: { coach_id: coachId } },
  );
  return res.coach;
}

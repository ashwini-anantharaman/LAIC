// Real challenges for the club screens.
//
// Challenge records live on the BRIDGE platform (invite-scoped, no program id
// — see app/challenge-play.tsx), not on the Nexus API, so this client talks to
// the platform's summary route: GET /api/bridge/challenges/summary. It sends
// the same Nexus session token every Nexus call uses, as a bearer header — the
// platform resolves it through the same context path its cookie session takes.
//
// Base URL: on the deployed web build the platform is same-origin (vercel.json
// rewrites /api/* there), so the app's own origin is the base. Everywhere else
// the platform origin is derived from the launch URL the embeds already use.

import { Platform } from "react-native";

import { BRIDGE_LAUNCH_URL_OVERRIDE } from "./config";

export class ChallengesError extends Error {
  status: number;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ChallengesError";
    this.status = status;
  }
}

/** One leaderboard row, formatted for the screen's two figure columns. */
export type ChallengeStanding = {
  /** The platform's rank — ties share one, so it is not the array index. */
  rank: number;
  name: string;
  isYou: boolean;
  /** The left figure — "41 MP" in matchpoints, "+14" (IMPs) or "+3,120" otherwise. */
  score: string;
  /** The right figure — the percentage in matchpoints, empty otherwise. */
  pct: string;
};

export type ClubChallenge = {
  id: string;
  name: string;
  /** The creator's words about it — empty when they gave none. */
  description: string;
  /** Who set it, resolved to a display name. */
  createdByName: string;
  boards: number;
  scoring: "imps" | "mp" | "total";
  scoringLabel: string;
  /** "accepted"/"none" opens play directly; "pending" still needs the
   *  platform's accept flow (the challenges list) first. */
  inviteStatus: "pending" | "accepted" | "declined" | "none";
  /** Boards this viewer has completed, of `boards`. */
  finishedBoards: number;
  /** Every board done — opening the challenge shows results, not a table. */
  finished: boolean;
  /** False while the platform hides standings from this viewer (finish first). */
  resultsUnlocked: boolean;
  standings: ChallengeStanding[];
  /** BEN's unranked benchmark total, when the platform computed one. */
  benTotal: string | null;
  /** Archived challenges are retired: results stay readable, play does not. */
  archived: boolean;
  /** The creator, or someone invited AS a moderator — who may retire it. */
  moderator: boolean;
  /** When THIS viewer last played a board here; null if never. What makes
   *  "resume what you were last playing" honest — see pickPinned. */
  lastPlayedAt: string | null;
};

type SummaryRow = {
  challengeId: string;
  title: string;
  description?: string;
  createdByName?: string;
  scoring: "imps" | "mp" | "total";
  boardCount: number;
  inviteStatus?: "pending" | "accepted" | "declined" | "none";
  status?: "open" | "archived";
  viewer?: {
    finishedBoards?: number;
    finished?: boolean;
    resultsUnlocked?: boolean;
    moderator?: boolean;
    lastPlayedAt?: string | null;
  };
  leaderboard:
    | {
        rank: number;
        name: string;
        isYou: boolean;
        total: number;
        totalDisplay: string;
        matchpoints: number | null;
      }[]
    | null;
  benTotalDisplay: string | null;
};

/** The bridge platform's base URL, or null when none is configured. */
function bridgeApiBase(): string | null {
  // Deployed web: the platform is proxied through the app's own origin so the
  // embed's cookies stay first-party — the same proxy serves this API.
  if (
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    window.location.protocol === "https:"
  ) {
    return window.location.origin;
  }
  const launch = BRIDGE_LAUNCH_URL_OVERRIDE;
  if (!launch) return null;
  return launch.replace(/\/nexus\/launch\/?$/, "");
}

function mapRow(row: SummaryRow): ClubChallenge {
  const scoringLabel =
    row.scoring === "mp" ? "MP score" : row.scoring === "total" ? "Total points" : "IMP score";
  return {
    id: row.challengeId,
    name: row.title,
    description: row.description ?? "",
    createdByName: row.createdByName ?? "",
    boards: row.boardCount,
    scoring: row.scoring,
    scoringLabel,
    inviteStatus: row.inviteStatus ?? "none",
    finishedBoards: row.viewer?.finishedBoards ?? 0,
    finished: row.viewer?.finished ?? false,
    resultsUnlocked: row.viewer?.resultsUnlocked ?? false,
    // Absent on an older platform build: default to "not archived, not a
    // moderator", so a stale bridge hides the control rather than offering one
    // whose request would be refused.
    archived: row.status === "archived",
    moderator: row.viewer?.moderator ?? false,
    lastPlayedAt: row.viewer?.lastPlayedAt ?? null,
    standings: (row.leaderboard ?? []).map((r) => ({
      rank: r.rank,
      name: r.name,
      isYou: r.isYou,
      score:
        row.scoring === "mp" && typeof r.matchpoints === "number"
          ? `${Math.round(r.matchpoints)} MP`
          : r.totalDisplay,
      pct: row.scoring === "mp" ? r.totalDisplay : "",
    })),
    benTotal: row.benTotalDisplay ?? null,
  };
}

/**
 * The last fetch's rows — the info screen a tile pushes opens from here without
 * paying the summary round trip again. Module-level, like the chat threads: it
 * survives navigation, and a reload starts empty.
 *
 * Keyed by CLUB as well as id, matching lib/library.ts and lib/learning.ts. It used
 * to be id-only, which was harmless while every club saw every challenge — now that
 * a challenge belongs to one club (0029), an id-only cache would let a challenge
 * fetched in one club render on the info screen while another is selected, quietly
 * showing what the list has just stopped showing.
 */
const lastFetched = new Map<string, ClubChallenge>();

const cacheKey = (programId: string | null, id: string) => `${programId ?? ""}::${id}`;

/**
 * The two challenges the Club tab pins, in order.
 *
 * The problem this solves: the tab showed ONE challenge, "the latest", and a person
 * mid-way through an older one had no way to see the new one — or, once a newer one
 * arrived, no way back to the game they had started. Both are on screen now, and
 * they answer different questions.
 *
 *   latest — the newest challenge that can be PLAYED. Not merely the newest row: a
 *            declined or archived one is not playable, and a finished one is done.
 *            A pending invite still counts, because the app answers invites in
 *            place now, so tapping it is how you accept.
 *
 *   resume — the challenge this viewer most recently played and has NOT finished,
 *            by lastPlayedAt. Not "the newest unfinished one": the point is to
 *            return to the board you left, which may be seven challenges back.
 *
 * They collapse when they are the same challenge, which is the common case early on
 * — one card, not the same tile twice.
 *
 * Archived challenges are excluded from both. Retired means retired; they are still
 * reachable from the Challenges screen's archive view.
 */
export function pickPinned(all: ClubChallenge[]): {
  latest: ClubChallenge | null;
  resume: ClubChallenge | null;
} {
  const live = all.filter((c) => !c.archived && c.inviteStatus !== "declined");

  // The summary arrives newest-first, so the first playable row IS the latest.
  const latest = live.find((c) => !c.finished) ?? null;

  const resume =
    live
      .filter((c) => !c.finished && c.finishedBoards > 0 && c.lastPlayedAt)
      // ISO strings: lexical order is chronological.
      .sort((a, b) => (a.lastPlayedAt! < b.lastPlayedAt! ? 1 : -1))[0] ?? null;

  // One challenge cannot be both cards.
  return { latest, resume: resume && resume.id !== latest?.id ? resume : null };
}

export function getCachedChallenge(programId: string | null, id: string): ClubChallenge | null {
  // A PRIVATE TABLE is cached under no club, because it belongs to none. Falling back
  // to that key means a screen holding a club can still find one without having to
  // know which kind of challenge it is about to show.
  return (
    lastFetched.get(cacheKey(programId, id)) ?? lastFetched.get(cacheKey(null, id)) ?? null
  );
}

/**
 * The caller's challenges, newest first, standings included where the
 * platform's visibility rule allows. `programId` is the selected club — the
 * same program the challenge embeds launch as.
 */
/**
 * Why a challenge read failed, in words a tester can act on.
 *
 * Both screens used to collapse every failure into "Couldn't load challenges", which
 * hides the one distinction that matters: the bridge platform maps an access failure
 * to 404 (never 403), so "this club has no Bridge Platform access" and "that thing is
 * genuinely missing" arrive identically — and a club with the feature switched off
 * then looks exactly like club-scoping working correctly.
 */
export function describeChallengesError(e: unknown): string {
  if (!(e instanceof ChallengesError)) return "Couldn't load challenges.";
  if (e.status === 0) return "Can't reach the bridge platform.";
  if (e.status === 401) return "Your session expired — sign in again.";
  if (e.status === 404 || e.status === 403) {
    // The platform's 404-for-forbidden. Naming the club is the fastest way to see
    // that it is THIS club that lacks access, not the app that is broken.
    return "This club doesn't have Bridge Platform access — turn it on in Nexus under the club's Features.";
  }
  return `Couldn't load challenges (${e.status}).`;
}

export async function fetchClubChallenges(
  token: string,
  programId: string | null,
  /**
   * PRIVATE TABLES instead of the club's challenges: the ones the viewer set up with
   * friends, which belong to a person and appear on no club's list. The row shape is
   * identical, so this is one fetch with two questions rather than two fetches.
   */
  opts: { personal?: boolean } = {},
): Promise<ClubChallenge[]> {
  const base = bridgeApiBase();
  if (!base) throw new ChallengesError(0, "No bridge platform configured.");

  const query = opts.personal ? "?scope=personal" : "";
  let response: Response;
  try {
    response = await fetch(`${base}/api/bridge/challenges/summary${query}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(programId ? { "x-program-id": programId } : {}),
      },
    });
  } catch {
    throw new ChallengesError(0, "Cannot reach the bridge platform.");
  }
  if (!response.ok) {
    throw new ChallengesError(response.status, `Challenges request failed (${response.status})`);
  }
  const json = (await response.json().catch(() => ({}))) as { challenges?: SummaryRow[] };
  const rows = (json.challenges ?? []).map(mapRow);
  // Private tables are keyed on their own, not under the club that happened to be
  // selected when they were fetched — they belong to no club, and filing them
  // under one is how a challenge shows up where it does not live.
  const key = opts.personal ? null : programId;
  for (const row of rows) lastFetched.set(cacheKey(key, row.id), row);
  return rows;
}

/**
 * Retire a challenge, or bring it back.
 *
 * The platform's own list card can do this too, but the app can never reach that
 * page — BridgeEmbed refuses to show it on purpose — so this is the app's door onto
 * the same act, over the same dual auth the rest of this file uses.
 *
 * Creator or moderator; the platform enforces that, and this only offers it where
 * the summary says the viewer qualifies.
 */
export async function setChallengeArchived(
  token: string,
  programId: string | null,
  challengeId: string,
  archived: boolean,
): Promise<"open" | "archived"> {
  const base = bridgeApiBase();
  if (!base) throw new ChallengesError(0, "No bridge platform configured.");

  let response: Response;
  try {
    response = await fetch(
      `${base}/api/bridge/challenges/${encodeURIComponent(challengeId)}/archive`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(programId ? { "x-program-id": programId } : {}),
        },
        body: JSON.stringify({ archived }),
      },
    );
  } catch {
    throw new ChallengesError(0, "Cannot reach the bridge platform.");
  }
  if (!response.ok) {
    // 404 means an older bridge build with no archive route — say so plainly
    // rather than reporting a generic failure.
    if (response.status === 404) {
      throw new ChallengesError(404, "This bridge build cannot archive challenges yet.");
    }
    throw new ChallengesError(response.status, `Couldn't archive that challenge (${response.status})`);
  }
  const json = (await response.json().catch(() => ({}))) as { status?: "open" | "archived" };
  // The list is cached for the info screen; drop it so the next read is the truth.
  lastFetched.delete(cacheKey(programId, challengeId));
  return json.status ?? (archived ? "archived" : "open");
}

/**
 * Answer an invite IN PLACE — the app's own screens accept/decline without a
 * round trip through the platform's list page (which reads as a different
 * product inside the app's frame). Same platform, same rules: only a pending
 * invite transitions. Returns the invite's status afterwards, and refreshes
 * the info-screen cache so the button under the reader's thumb tells the
 * truth immediately.
 */
export async function respondToChallengeInvite(
  token: string,
  programId: string | null,
  challengeId: string,
  action: "accept" | "decline",
): Promise<"pending" | "accepted" | "declined" | "none"> {
  const base = bridgeApiBase();
  if (!base) throw new ChallengesError(0, "No bridge platform configured.");

  let response: Response;
  try {
    response = await fetch(
      `${base}/api/bridge/challenges/${encodeURIComponent(challengeId)}/invite`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(programId ? { "x-program-id": programId } : {}),
        },
        body: JSON.stringify({ action }),
      },
    );
  } catch {
    throw new ChallengesError(0, "Cannot reach the bridge platform.");
  }
  if (!response.ok) {
    throw new ChallengesError(response.status, `Invite response failed (${response.status})`);
  }
  const json = (await response.json().catch(() => ({}))) as {
    inviteStatus?: "pending" | "accepted" | "declined" | "none";
  };
  const status = json.inviteStatus ?? "none";
  const cached = lastFetched.get(cacheKey(programId, challengeId));
  if (cached) lastFetched.set(cacheKey(programId, challengeId), { ...cached, inviteStatus: status });
  return status;
}

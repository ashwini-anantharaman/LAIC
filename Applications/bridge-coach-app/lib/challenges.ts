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
 * The last fetch's rows by id — the info screen a tile pushes opens from here
 * without paying the summary round trip again. Module-level, like the chat
 * threads: it survives navigation, and a reload starts empty.
 */
const lastFetched = new Map<string, ClubChallenge>();

export function getCachedChallenge(id: string): ClubChallenge | null {
  return lastFetched.get(id) ?? null;
}

/**
 * The caller's challenges, newest first, standings included where the
 * platform's visibility rule allows. `programId` is the selected club — the
 * same program the challenge embeds launch as.
 */
export async function fetchClubChallenges(
  token: string,
  programId: string | null,
): Promise<ClubChallenge[]> {
  const base = bridgeApiBase();
  if (!base) throw new ChallengesError(0, "No bridge platform configured.");

  let response: Response;
  try {
    response = await fetch(`${base}/api/bridge/challenges/summary`, {
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
  for (const row of rows) lastFetched.set(row.id, row);
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
  lastFetched.delete(challengeId);
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
  const cached = lastFetched.get(challengeId);
  if (cached) lastFetched.set(challengeId, { ...cached, inviteStatus: status });
  return status;
}

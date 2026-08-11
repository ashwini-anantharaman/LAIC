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
};

type SummaryRow = {
  challengeId: string;
  title: string;
  description?: string;
  createdByName?: string;
  scoring: "imps" | "mp" | "total";
  boardCount: number;
  inviteStatus?: "pending" | "accepted" | "declined" | "none";
  viewer?: { finishedBoards?: number; finished?: boolean; resultsUnlocked?: boolean };
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

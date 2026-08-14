// @bridge/challenges — the client-safe barrel: the Challenges v1 domain model
// (./types), the net-new field-scoring engine (./scoring), the ONE results
// access rule, and the persistence seam (interface + InMemory here; JSON file
// in ./fileStore, Postgres in @bridge/pg-stores).
//
// NO node:fs in this module — it is imported by client components.

export * from "./types";
export * from "./scoring";
export * from "./format";

import type {
  BaselineKey,
  BenDecision,
  Challenge,
  ChallengeBaseline,
  ChallengeBoard,
  ChallengeInvite,
  ChallengePlay,
  ChallengeStatus,
  InviteStatus,
  PlayStatus,
  StandingsVisibility,
} from "./types";
import { baselineId, challengeVisibleInScope } from "./types";

// ── the one access rule (ADDENDUM A3) ───────────────────────────────────────

export interface ResultsAccess {
  /** The viewer has a completed play on EVERY board of the challenge. */
  viewerFinished: boolean;
  /** The viewer's invite carries `moderator` (the creator always does). */
  viewerIsModerator: boolean;
  standingsVisibility: StandingsVisibility;
}

/**
 * Whether standings, board-by-board figures and comparisons are visible to
 * this viewer. ONE rule, in ONE place — the challenges list, the results view,
 * the in-table Results button (hidden entirely when false, per ADDENDUM A4)
 * and every server action must consume this function rather than restate it.
 *
 * A viewer with early sight who has not finished is still ABSENT from the
 * standings: the field is completed humans only, and they have no rank until
 * they finish.
 */
export function resultsUnlocked(access: ResultsAccess): boolean {
  return (
    access.viewerFinished ||
    access.viewerIsModerator ||
    access.standingsVisibility === "always"
  );
}

// ── store seam ──────────────────────────────────────────────────────────────

export interface ChallengeFilter {
  createdBy?: string;
  status?: ChallengeStatus;
  /** Restrict to a known id set — how "challenges I was invited to" is read. */
  challengeIds?: readonly string[];
  /**
   * The club asking (0029). Keeps a challenge to the club it was created in, which
   * invites cannot do: a member of two clubs has one nexusUserId.
   *
   * Unscoped challenges pass any scope — see `challengeVisibleInScope`, which both
   * this store and the SQL one derive from. Omitted means no scope restriction.
   */
  programId?: string | null;
  /**
   * PRIVATE TABLES only — challenges that belong to a person rather than a club
   * (`scope_level: "user"`). A club read excludes them; this is how the surface that
   * owns them asks for them, and the two are mutually exclusive by construction.
   */
  personalOnly?: boolean;
}

export interface InviteFilter {
  challengeId?: string;
  userId?: string;
  status?: InviteStatus;
}

export interface PlayFilter {
  challengeId?: string;
  userId?: string;
  boardNo?: number;
  status?: PlayStatus;
}

/**
 * All six challenge record kinds behind one seam — they are written and read
 * together, and the JSON dev backend is one file.
 */
export interface ChallengeStore {
  putChallenge(challenge: Challenge): Promise<void>;
  getChallenge(challengeId: string): Promise<Challenge | null>;
  listChallenges(filter?: ChallengeFilter): Promise<Challenge[]>;

  putBoard(board: ChallengeBoard): Promise<void>;
  getBoard(challengeId: string, boardNo: number): Promise<ChallengeBoard | null>;
  listBoards(challengeId: string): Promise<ChallengeBoard[]>;

  putInvite(invite: ChallengeInvite): Promise<void>;
  getInvite(challengeId: string, userId: string): Promise<ChallengeInvite | null>;
  listInvites(filter?: InviteFilter): Promise<ChallengeInvite[]>;

  putPlay(play: ChallengePlay): Promise<void>;
  getPlay(challengeId: string, boardNo: number, userId: string): Promise<ChallengePlay | null>;
  listPlays(filter?: PlayFilter): Promise<ChallengePlay[]>;

  putBaseline(baseline: ChallengeBaseline): Promise<void>;
  getBaseline(key: BaselineKey): Promise<ChallengeBaseline | null>;
  listBaselines(challengeId: string, boardNo?: number): Promise<ChallengeBaseline[]>;

  putDecision(decision: BenDecision): Promise<void>;
  getDecision(
    challengeId: string,
    boardNo: number,
    historyHash: string,
  ): Promise<BenDecision | null>;
  /** BEN call volume for one challenge — the §10 cost check. */
  countDecisions(challengeId: string): Promise<number>;

  /**
   * Erase a challenge and everything written under it: boards, invites, plays,
   * baselines and BEN decisions.
   *
   * DISTINCT FROM ARCHIVING, deliberately, and not a stronger version of it.
   * Archiving retires a challenge while keeping every result readable — which is
   * what you want for something people played. This is for the other case: a
   * challenge made by mistake, or a private table nobody used, where leaving a
   * tombstone in the list is the wrong answer. There is no undo, which is why the
   * only caller prompts first.
   *
   * The six record kinds have no foreign keys between them (0027), so nothing
   * cascades on its own: a delete that removed only the challenge row would leave
   * five tables of orphans keyed to an id nothing resolves. Implementations must
   * remove all of them.
   */
  deleteChallenge(challengeId: string): Promise<void>;
}

export interface ChallengeStoreData {
  challenges: Challenge[];
  boards: ChallengeBoard[];
  invites: ChallengeInvite[];
  plays: ChallengePlay[];
  baselines: ChallengeBaseline[];
  decisions: BenDecision[];
}

export function emptyChallengeStoreData(): ChallengeStoreData {
  return { challenges: [], boards: [], invites: [], plays: [], baselines: [], decisions: [] };
}

function matchesChallenge(c: Challenge, f?: ChallengeFilter): boolean {
  if (!f) return true;
  if (f.createdBy !== undefined && c.createdBy !== f.createdBy) return false;
  if (f.status !== undefined && c.status !== f.status) return false;
  if (f.challengeIds !== undefined && !f.challengeIds.includes(c.challengeId)) return false;
  // The SAME predicate the Postgres store expresses in SQL — see
  // challengeVisibleInScope. Do not restate the rule here.
  if (f.personalOnly) {
    if (c.scopeLevel !== "user") return false;
  } else if (!challengeVisibleInScope(c, f.programId)) return false;
  return true;
}

function matchesInvite(i: ChallengeInvite, f?: InviteFilter): boolean {
  if (!f) return true;
  if (f.challengeId !== undefined && i.challengeId !== f.challengeId) return false;
  if (f.userId !== undefined && i.userId !== f.userId) return false;
  if (f.status !== undefined && i.status !== f.status) return false;
  return true;
}

function matchesPlay(p: ChallengePlay, f?: PlayFilter): boolean {
  if (!f) return true;
  if (f.challengeId !== undefined && p.challengeId !== f.challengeId) return false;
  if (f.userId !== undefined && p.userId !== f.userId) return false;
  if (f.boardNo !== undefined && p.boardNo !== f.boardNo) return false;
  if (f.status !== undefined && p.status !== f.status) return false;
  return true;
}

export class InMemoryChallengeStore implements ChallengeStore {
  constructor(protected data: ChallengeStoreData = emptyChallengeStoreData()) {}
  protected persist(): void {}

  // challenges
  async putChallenge(challenge: Challenge) {
    const i = this.data.challenges.findIndex((c) => c.challengeId === challenge.challengeId);
    if (i >= 0) this.data.challenges[i] = challenge;
    else this.data.challenges.push(challenge);
    this.persist();
  }
  async getChallenge(challengeId: string) {
    return this.data.challenges.find((c) => c.challengeId === challengeId) ?? null;
  }
  async listChallenges(filter?: ChallengeFilter) {
    return this.data.challenges
      .filter((c) => matchesChallenge(c, filter))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // boards
  async putBoard(board: ChallengeBoard) {
    const i = this.data.boards.findIndex(
      (b) => b.challengeId === board.challengeId && b.boardNo === board.boardNo,
    );
    if (i >= 0) this.data.boards[i] = board;
    else this.data.boards.push(board);
    this.persist();
  }
  async getBoard(challengeId: string, boardNo: number) {
    return (
      this.data.boards.find((b) => b.challengeId === challengeId && b.boardNo === boardNo) ?? null
    );
  }
  async listBoards(challengeId: string) {
    return this.data.boards
      .filter((b) => b.challengeId === challengeId)
      .sort((a, b) => a.boardNo - b.boardNo);
  }

  // invites
  async putInvite(invite: ChallengeInvite) {
    const i = this.data.invites.findIndex(
      (x) => x.challengeId === invite.challengeId && x.userId === invite.userId,
    );
    if (i >= 0) this.data.invites[i] = invite;
    else this.data.invites.push(invite);
    this.persist();
  }
  async getInvite(challengeId: string, userId: string) {
    return (
      this.data.invites.find((i) => i.challengeId === challengeId && i.userId === userId) ?? null
    );
  }
  async listInvites(filter?: InviteFilter) {
    return this.data.invites
      .filter((i) => matchesInvite(i, filter))
      .sort((a, b) => a.invitedAt.localeCompare(b.invitedAt));
  }

  // plays
  async putPlay(play: ChallengePlay) {
    const i = this.data.plays.findIndex(
      (p) =>
        p.challengeId === play.challengeId &&
        p.boardNo === play.boardNo &&
        p.userId === play.userId,
    );
    if (i >= 0) this.data.plays[i] = play;
    else this.data.plays.push(play);
    this.persist();
  }
  async getPlay(challengeId: string, boardNo: number, userId: string) {
    return (
      this.data.plays.find(
        (p) => p.challengeId === challengeId && p.boardNo === boardNo && p.userId === userId,
      ) ?? null
    );
  }
  async listPlays(filter?: PlayFilter) {
    return this.data.plays
      .filter((p) => matchesPlay(p, filter))
      .sort((a, b) => a.boardNo - b.boardNo || a.userId.localeCompare(b.userId));
  }

  // baselines
  async putBaseline(baseline: ChallengeBaseline) {
    const id = baselineId(baseline);
    const i = this.data.baselines.findIndex((b) => baselineId(b) === id);
    if (i >= 0) this.data.baselines[i] = baseline;
    else this.data.baselines.push(baseline);
    this.persist();
  }
  async getBaseline(key: BaselineKey) {
    const id = baselineId(key);
    return this.data.baselines.find((b) => baselineId(b) === id) ?? null;
  }
  async listBaselines(challengeId: string, boardNo?: number) {
    return this.data.baselines
      .filter((b) => b.challengeId === challengeId && (boardNo === undefined || b.boardNo === boardNo))
      .sort((a, b) => a.boardNo - b.boardNo);
  }

  // BEN decision cache
  async putDecision(decision: BenDecision) {
    const i = this.data.decisions.findIndex(
      (d) =>
        d.challengeId === decision.challengeId &&
        d.boardNo === decision.boardNo &&
        d.historyHash === decision.historyHash,
    );
    if (i >= 0) this.data.decisions[i] = decision;
    else this.data.decisions.push(decision);
    this.persist();
  }
  async getDecision(challengeId: string, boardNo: number, historyHash: string) {
    return (
      this.data.decisions.find(
        (d) =>
          d.challengeId === challengeId &&
          d.boardNo === boardNo &&
          d.historyHash === historyHash,
      ) ?? null
    );
  }
  async countDecisions(challengeId: string) {
    return this.data.decisions.filter((d) => d.challengeId === challengeId).length;
  }

  // Every kind, in one pass. Listed explicitly rather than looped over the data's
  // keys so adding a seventh record kind is a type error here rather than a silent
  // orphan later.
  async deleteChallenge(challengeId: string) {
    const keep = <T extends { challengeId: string }>(rows: T[]) =>
      rows.filter((r) => r.challengeId !== challengeId);
    this.data.challenges = this.data.challenges.filter((c) => c.challengeId !== challengeId);
    this.data.boards = keep(this.data.boards);
    this.data.invites = keep(this.data.invites);
    this.data.plays = keep(this.data.plays);
    this.data.baselines = keep(this.data.baselines);
    this.data.decisions = keep(this.data.decisions);
    this.persist();
  }
}

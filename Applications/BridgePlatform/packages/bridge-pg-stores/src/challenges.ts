// ChallengeStore over 0027 (jsonb-primary, like 0015/0020/0026): the whole
// record lives in `record` (or `decision` for the cache); scalar columns exist
// only for the keys and the filters the read paths actually use.

import {
  baselineId,
  type BaselineKey,
  type BenDecision,
  type Challenge,
  type ChallengeBaseline,
  type ChallengeBoard,
  type ChallengeFilter,
  type ChallengeInvite,
  type ChallengePlay,
  type ChallengeStore,
  type InviteFilter,
  type PlayFilter,
} from "@bridge/challenges";
import type { SupabaseClient } from "@supabase/supabase-js";
import { check } from "./client";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Every table below stores its record in one jsonb column. */
function records<T>(rows: unknown[]): T[] {
  return rows.map((r) => (r as { record: T }).record);
}

export class PgChallengeStore implements ChallengeStore {
  constructor(private readonly db: SupabaseClient) {}

  // ── challenges ────────────────────────────────────────────────────────────
  async putChallenge(challenge: Challenge) {
    check(
      await this.db.from("bridge_challenges").upsert(
        {
          challenge_id: challenge.challengeId,
          created_by: challenge.createdBy,
          status: challenge.status,
          scoring: challenge.scoring,
          record: challenge,
          created_at: challenge.createdAt,
        },
        { onConflict: "challenge_id" },
      ),
      "challenges.put",
    );
  }
  async getChallenge(challengeId: string) {
    const rows = check(
      await this.db.from("bridge_challenges").select("record").eq("challenge_id", challengeId),
      "challenges.get",
    );
    return rows.length ? ((rows[0] as any).record as Challenge) : null;
  }
  async listChallenges(filter?: ChallengeFilter) {
    let query = this.db
      .from("bridge_challenges")
      .select("record")
      .order("created_at", { ascending: false })
      .limit(200);
    if (filter?.createdBy !== undefined) query = query.eq("created_by", filter.createdBy);
    if (filter?.status !== undefined) query = query.eq("status", filter.status);
    if (filter?.challengeIds !== undefined) {
      // An empty id set means "nothing" — .in() with [] would be a no-op filter.
      if (!filter.challengeIds.length) return [];
      query = query.in("challenge_id", [...filter.challengeIds]);
    }
    return records<Challenge>(check(await query, "challenges.list"));
  }

  // ── boards ────────────────────────────────────────────────────────────────
  async putBoard(board: ChallengeBoard) {
    check(
      await this.db.from("bridge_challenge_boards").upsert(
        {
          challenge_id: board.challengeId,
          board_no: board.boardNo,
          record: board,
        },
        { onConflict: "challenge_id,board_no" },
      ),
      "challenges.board.put",
    );
  }
  async getBoard(challengeId: string, boardNo: number) {
    const rows = check(
      await this.db
        .from("bridge_challenge_boards")
        .select("record")
        .eq("challenge_id", challengeId)
        .eq("board_no", boardNo),
      "challenges.board.get",
    );
    return rows.length ? ((rows[0] as any).record as ChallengeBoard) : null;
  }
  async listBoards(challengeId: string) {
    return records<ChallengeBoard>(
      check(
        await this.db
          .from("bridge_challenge_boards")
          .select("record")
          .eq("challenge_id", challengeId)
          .order("board_no", { ascending: true }),
        "challenges.board.list",
      ),
    );
  }

  // ── invites ───────────────────────────────────────────────────────────────
  async putInvite(invite: ChallengeInvite) {
    check(
      await this.db.from("bridge_challenge_invites").upsert(
        {
          challenge_id: invite.challengeId,
          user_id: invite.userId,
          status: invite.status,
          moderator: invite.moderator,
          record: invite,
          invited_at: invite.invitedAt,
        },
        { onConflict: "challenge_id,user_id" },
      ),
      "challenges.invite.put",
    );
  }
  async getInvite(challengeId: string, userId: string) {
    const rows = check(
      await this.db
        .from("bridge_challenge_invites")
        .select("record")
        .eq("challenge_id", challengeId)
        .eq("user_id", userId),
      "challenges.invite.get",
    );
    return rows.length ? ((rows[0] as any).record as ChallengeInvite) : null;
  }
  async listInvites(filter?: InviteFilter) {
    let query = this.db
      .from("bridge_challenge_invites")
      .select("record")
      .order("invited_at", { ascending: true })
      .limit(500);
    if (filter?.challengeId !== undefined) query = query.eq("challenge_id", filter.challengeId);
    if (filter?.userId !== undefined) query = query.eq("user_id", filter.userId);
    if (filter?.status !== undefined) query = query.eq("status", filter.status);
    return records<ChallengeInvite>(check(await query, "challenges.invite.list"));
  }

  // ── plays ─────────────────────────────────────────────────────────────────
  async putPlay(play: ChallengePlay) {
    check(
      await this.db.from("bridge_challenge_plays").upsert(
        {
          challenge_id: play.challengeId,
          board_no: play.boardNo,
          user_id: play.userId,
          session_id: play.sessionId,
          status: play.status,
          record: play,
          started_at: play.startedAt,
        },
        { onConflict: "challenge_id,board_no,user_id" },
      ),
      "challenges.play.put",
    );
  }
  async getPlay(challengeId: string, boardNo: number, userId: string) {
    const rows = check(
      await this.db
        .from("bridge_challenge_plays")
        .select("record")
        .eq("challenge_id", challengeId)
        .eq("board_no", boardNo)
        .eq("user_id", userId),
      "challenges.play.get",
    );
    return rows.length ? ((rows[0] as any).record as ChallengePlay) : null;
  }
  async listPlays(filter?: PlayFilter) {
    let query = this.db
      .from("bridge_challenge_plays")
      .select("record")
      .order("board_no", { ascending: true })
      .limit(2000);
    if (filter?.challengeId !== undefined) query = query.eq("challenge_id", filter.challengeId);
    if (filter?.userId !== undefined) query = query.eq("user_id", filter.userId);
    if (filter?.boardNo !== undefined) query = query.eq("board_no", filter.boardNo);
    if (filter?.status !== undefined) query = query.eq("status", filter.status);
    return records<ChallengePlay>(check(await query, "challenges.play.list"));
  }

  // ── baselines ─────────────────────────────────────────────────────────────
  async putBaseline(baseline: ChallengeBaseline) {
    check(
      await this.db.from("bridge_challenge_baselines").upsert(
        {
          baseline_id: baselineId(baseline),
          challenge_id: baseline.challengeId,
          board_no: baseline.boardNo,
          kind: baseline.kind,
          user_id: baseline.userId ?? null,
          ply: baseline.ply ?? null,
          status: baseline.status,
          record: baseline,
          created_at: baseline.createdAt,
        },
        { onConflict: "baseline_id" },
      ),
      "challenges.baseline.put",
    );
  }
  async getBaseline(key: BaselineKey) {
    const rows = check(
      await this.db
        .from("bridge_challenge_baselines")
        .select("record")
        .eq("baseline_id", baselineId(key)),
      "challenges.baseline.get",
    );
    return rows.length ? ((rows[0] as any).record as ChallengeBaseline) : null;
  }
  async listBaselines(challengeId: string, boardNo?: number) {
    let query = this.db
      .from("bridge_challenge_baselines")
      .select("record")
      .eq("challenge_id", challengeId)
      .order("board_no", { ascending: true })
      .limit(1000);
    if (boardNo !== undefined) query = query.eq("board_no", boardNo);
    return records<ChallengeBaseline>(check(await query, "challenges.baseline.list"));
  }

  // ── BEN decision cache ────────────────────────────────────────────────────
  async putDecision(decision: BenDecision) {
    check(
      await this.db.from("bridge_ben_decisions").upsert(
        {
          challenge_id: decision.challengeId,
          board_no: decision.boardNo,
          history_hash: decision.historyHash,
          decision: decision.decision,
          created_at: decision.createdAt,
        },
        { onConflict: "challenge_id,board_no,history_hash" },
      ),
      "challenges.decision.put",
    );
  }
  async getDecision(challengeId: string, boardNo: number, historyHash: string) {
    const rows = check(
      await this.db
        .from("bridge_ben_decisions")
        .select("*")
        .eq("challenge_id", challengeId)
        .eq("board_no", boardNo)
        .eq("history_hash", historyHash),
      "challenges.decision.get",
    );
    if (!rows.length) return null;
    const r = rows[0] as any;
    return {
      challengeId: r.challenge_id,
      boardNo: r.board_no,
      historyHash: r.history_hash,
      decision: r.decision,
      createdAt: r.created_at,
    } as BenDecision;
  }
  async countDecisions(challengeId: string) {
    // Head-only count: the §10 BEN-volume check must never pull the cache back.
    const res = await this.db
      .from("bridge_ben_decisions")
      .select("history_hash", { count: "exact", head: true })
      .eq("challenge_id", challengeId);
    check(res, "challenges.decision.count");
    return res.count ?? 0;
  }
}

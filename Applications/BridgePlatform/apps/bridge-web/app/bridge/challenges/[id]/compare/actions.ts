"use server";

// The comparison surface's one write-ish action: ASK BEN FOR A LINE.
//
// Two of the three lines a reader can compare against do not exist until
// somebody asks for them — "BEN in your contract" and "BEN from here" are
// computed on demand — and even the silent full-BEN reference can still be
// mid-flight when a results view first links here. All three arrive through
// this action, which is deliberately RESUMABLE rather than long: BEN answers a
// card in ~21 s, so a whole board is minutes of wall clock. Each call does as
// much as its budget allows and answers `pending`; because every BEN decision
// is cached, calling again replays the settled part instantly and continues.
// The client loops and shows the honest "BEN is thinking…" state meanwhile.
//
// Access is re-checked here because a client is never the authority: the
// catalogue key, then `challengeViewerAccess` — the same two gates the page
// uses, and the only place `resultsUnlocked` is consulted (ADDENDUM A3).

import { isBiddingOnly } from "@bridge/challenges";
import { canUse } from "@/lib/access";
import {
  BaselineInputError,
  ensureFromPointBaseline,
  ensureFullBenBaseline,
  ensureYourContractBaseline,
  type BaselineResult,
} from "@/lib/challengeBaselines";
import { benConfigured } from "@/lib/challengeBen";
import { challengeViewerAccess, getChallengeBoard } from "@/lib/challenges";
import { getBridgeContext } from "@/lib/nexus";
import { BEN_KEY, YOUR_CONTRACT_KEY, type EnsureLineRequest, type EnsureLineResult } from "./compareView";
import { benIdentity, buildCompareLine } from "./lineModel";

/**
 * Wall-clock budget for ONE round. Short on purpose: the reader sees progress
 * and can leave; nothing computed is ever thrown away, because the decision
 * cache is what makes the next round resume rather than restart.
 */
const ROUND_BUDGET_MS = 55_000;

const denied = (note: string): EnsureLineResult => ({ status: "failed", note });

export async function ensureComparisonLine(req: EnsureLineRequest): Promise<EnsureLineResult> {
  const context = await getBridgeContext();
  if (!context) return denied("Your session has expired — sign in again to keep comparing.");
  if (!(await canUse(context, "page.challenges"))) return denied("Challenges are not available on this account.");

  const viewerId = context.nexusUserId;
  const access = await challengeViewerAccess(req.challengeId, viewerId);
  if (!access.challenge) return denied("This challenge is no longer available.");
  if (!access.viewerAccepted && !access.viewerIsModerator)
    return denied("This challenge is not yours to review.");
  // One rule, one place: comparisons live behind the same gate as the standings.
  if (!access.resultsUnlocked)
    return denied("Comparisons unlock when you have finished every board.");

  const board = await getChallengeBoard(req.challengeId, req.boardNo);
  if (!board) return denied(`This challenge has no board ${req.boardNo}.`);

  // No BEN, no baseline — and never a KB fallback (spec §2: the house player is
  // shelved for challenges). Said plainly, before anything is written.
  if (!benConfigured())
    return denied("BEN is not configured on this server, so reference lines cannot be computed.");

  try {
    let result: BaselineResult;
    let key: string;
    if (req.kind === "full_ben") {
      key = BEN_KEY;
      result = await ensureFullBenBaseline(req.challengeId, req.boardNo, {
        budgetMs: ROUND_BUDGET_MS,
      });
    } else if (req.kind === "your_contract") {
      // "YOUR contract" means the viewer's: another player's contract line is
      // not a thing this surface offers.
      key = YOUR_CONTRACT_KEY;
      result = await ensureYourContractBaseline(req.challengeId, req.boardNo, viewerId, {
        budgetMs: ROUND_BUDGET_MS,
      });
    } else {
      const ply = Number(req.ply);
      if (!Number.isInteger(ply) || ply < 0) return denied("That is not a point on your line.");
      key = `BEN.here.${ply}`;
      // The fork is always on the VIEWER'S own line — BEN takes the viewer's
      // seat forward from there, against the opposition out of the cache.
      result = await ensureFromPointBaseline(req.challengeId, req.boardNo, viewerId, ply, {
        budgetMs: ROUND_BUDGET_MS,
      });
    }

    const { baseline } = result;
    if (baseline.status === "ready" && baseline.snapshot) {
      return {
        status: "ready",
        line: buildCompareLine({
          identity: benIdentity(req.kind, key),
          snapshot: baseline.snapshot,
          board,
          rawScore: baseline.rawScore,
          // The same format the baseline was PLAYED to — a bidding-only
          // reference line stops at the close of the auction, and reading it
          // any other way would label a finished line abandoned.
          biddingOnly: isBiddingOnly(access.challenge),
        }),
        actions: result.actions,
      };
    }

    return {
      status: baseline.status === "failed" ? "failed" : "pending",
      note: baseline.error,
      resumable: result.resumable,
      actions: result.actions,
    };
  } catch (e) {
    if (e instanceof BaselineInputError) return denied(e.message);
    console.error("[compare] baseline round failed", e);
    return denied("BEN could not be reached for that line. Try again in a moment.");
  }
}

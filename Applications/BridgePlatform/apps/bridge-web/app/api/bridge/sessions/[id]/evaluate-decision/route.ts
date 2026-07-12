import { evaluateBidAction, evaluatePlayAction } from "@bridge/evaluator";
import { interpretBid, interpretPlay } from "@bridge/engine";
import { cardId, type Seat } from "@bridge/events";
import { NextResponse, type NextRequest } from "next/server";
import { apiError, requireContext } from "@/lib/api";
import { latestPackage, sessionService } from "@/lib/sessions";

/**
 * The evaluator surface the Coaching pipeline calls back into (Coaching plan
 * §12.2 "Domain Evaluator / Tool Call", §18.2, §23): for the session's
 * CURRENT position, returns the system's decision with its full rule trace
 * and concurrent alternatives; optionally judges a proposed action.
 * Structured facts only — coaching language is the coach's job (BP §14.3).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const context = await requireContext();
    const { id } = await params;
    const view = await sessionService().getSession(id, context);
    const body = (await request.json().catch(() => ({}))) as {
      proposedAction?: { kind: "bid"; call: string } | { kind: "play"; cardId: string };
    };
    const pkg = await latestPackage(view.record.packageRef.packageId);
    const state = view.state;
    if (state.phase === "complete")
      return NextResponse.json({ error: "Session is complete" }, { status: 409 });
    const seat = state.turn as Seat;
    const opts = { pkg, values: view.record.resolvedValues };
    const decision =
      state.phase === "auction" ? interpretBid(state, seat, opts) : interpretPlay(state, seat, opts);

    const evaluation = body.proposedAction
      ? body.proposedAction.kind === "bid"
        ? evaluateBidAction(state, seat, body.proposedAction.call, opts, {
            bridgeSessionId: id,
            actionEventSeq: -1, // advisory (pre-commit) evaluation
          })
        : evaluatePlayAction(state, seat, body.proposedAction.cardId, opts, {
            bridgeSessionId: id,
            actionEventSeq: -1,
          })
      : undefined;

    return NextResponse.json({
      seat,
      phase: state.phase,
      systemDecision: {
        action: state.phase === "auction" ? decision.action : cardId(decision.action as never),
        matchedRuleId: decision.matchedRuleId,
        fallback: decision.fallback,
        reason: decision.reason,
        alternatives: decision.matches ?? [],
        trace: decision.trace,
        facts: decision.facts,
      },
      evaluation,
      packageRef: view.record.packageRef,
    });
  } catch (e) {
    return apiError(e);
  }
}

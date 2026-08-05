// What a call MEANS here — the text behind the bid box's hover panel (BBO shows
// the same thing beside its box: "Minor suit opening -- 3+ ♦; 11-21 HCP").
//
// The source is the knowledge base, not BEN. That's not a shortcut: BEN is a
// neural engine and its /bid response carries scores, not prose (probed
// 2026-08-01 against ben-service: `candidates: [{call, insta_score}]`,
// `explanations: ""`). What BBO calls the bidding system's explanation is, for
// us, the compiled KB — and the KB already records exactly the fields BBO
// prints, as `RuleShows`: suit lengths promised, an HCP band, a total-point
// band, forcing or not.
//
// A meaning is NOT the same question as "what would this player bid". We don't
// evaluate the hand at all — a rule's conditions are the meaning. What we do
// use is the engine's own position logic, so the answers belong to THIS point in
// the auction: `matchContext` decides whether a rule is about the situation
// we're in (opening, response, overcall…), and `realizeAuctionAction` turns the
// rule's action into the concrete call it would make here (which is what lets
// "raise partner to 2" or "bid your longest minor" resolve to 2♥ or 1♦).

import {
  analyzeSeat,
  applyEvent,
  inferPartnership,
  initialState,
  matchContext,
  realizeAuctionAction,
  effectiveSurface,
} from "@bridge/engine";
import type { GameState } from "@bridge/engine";
import type { AuctionCall, Call, Card, Seat, Vul } from "@bridge/events";
import type { CompiledKb } from "@bridge/kb";
import type { SettingValue } from "@bridge/config";

/** One line of explanation for one call. */
export interface BidMeaning {
  /** The rule's own name — "Minor suit opening", "Stayman". */
  label: string;
  /** What the call promises, in BBO's telegraphic style. */
  shows?: string;
}

const SUIT_GLYPH: Record<string, string> = { S: "♠", H: "♥", C: "♣", D: "♦" };

/** "3+ ♦; 11–21 HCP; 12–22 total points; forcing" */
function showsText(shows: NonNullable<CompiledKb["auctionRules"][number]["shows"]>): string {
  const parts: string[] = [];
  for (const s of shows.suits ?? []) {
    const glyph = SUIT_GLYPH[s.suit] ?? s.suit;
    if (s.min !== undefined && s.max !== undefined)
      parts.push(s.min === s.max ? `exactly ${s.min} ${glyph}` : `${s.min}–${s.max} ${glyph}`);
    else if (s.min !== undefined) parts.push(`${s.min}+ ${glyph}`);
    else if (s.max !== undefined) parts.push(`at most ${s.max} ${glyph}`);
  }
  const band = (b: { min?: number; max?: number } | undefined, unit: string) => {
    if (!b) return null;
    if (b.min !== undefined && b.max !== undefined) return `${b.min}–${b.max} ${unit}`;
    if (b.min !== undefined) return `${b.min}+ ${unit}`;
    if (b.max !== undefined) return `up to ${b.max} ${unit}`;
    return null;
  };
  const hcp = band(shows.hcp, "HCP");
  if (hcp) parts.push(hcp);
  const tp = band(shows.tp, "total points");
  if (tp) parts.push(tp);
  if (shows.forcing) parts.push("forcing");
  return parts.join("; ");
}

/**
 * A reader bound to one system (KB + packs + settings). The effective surface
 * is resolved once here because explaining a whole auction asks the same
 * question at every position.
 */
export function bidMeaningReader({
  compiled,
  enabledPackIds = [],
  settingOverrides = {},
}: {
  compiled: CompiledKb;
  /** The system in play. Empty means "every pack the KB has", KB defaults. */
  enabledPackIds?: string[];
  settingOverrides?: Record<string, SettingValue>;
}) {
  const surface = effectiveSurface({
    compiled,
    player: { enabledPackIds, settingOverrides, decisionPolicyId: "first_match" },
  });

  /**
   * call → what it would mean if `seat` said it now. Several rules can produce
   * the same call (an exception and the general agreement, say); the first
   * wins, which is the order the decider itself would consider them in.
   */
  const at = (state: GameState, seat: Seat): Record<string, BidMeaning> => {
    const facts = analyzeSeat(state.auction, seat, state.vul);
    // Context gating and action realization both read partnership state (an
    // agreed suit, an ask in progress), so fill it exactly as the decider does.
    facts.inference = inferPartnership(state.auction, seat, state.vul, {
      auctionRules: surface.auctionRules,
    });

    const out: Record<string, BidMeaning> = {};
    for (const rule of surface.auctionRules) {
      if (!matchContext(rule.context, facts)) continue;
      let call: Call | null;
      try {
        call = realizeAuctionAction(rule.action, state, seat, facts);
      } catch {
        continue; // a rule whose action can't resolve here has nothing to say
      }
      if (call === null || out[call]) continue;
      out[call] = {
        label: rule.label,
        shows: rule.shows ? showsText(rule.shows) || undefined : undefined,
      };
    }
    return out;
  };

  /**
   * What each call in the auction meant WHEN IT WAS MADE — the answer to
   * tapping a call in the bidding table. A meaning is a property of the
   * position, so the auction is replayed and each call asked about at its own
   * moment; asking at the current position would explain partner's opening
   * with a rule about the fourth round.
   *
   * Aligned with `auction` by index; a call the system has no agreement for
   * comes back undefined.
   */
  const forAuction = (board: {
    boardRef: string;
    dealer: Seat;
    vul: Vul;
    /** As DEALT — during the auction that's simply the current hands. */
    hands: Record<Seat, Card[]>;
    auction: readonly AuctionCall[];
  }): (BidMeaning | undefined)[] => {
    let st = initialState(board.boardRef, board.dealer, board.vul, board.hands);
    return board.auction.map((entry, i) => {
      const meaning = at(st, entry.seat)[entry.call];
      st = applyEvent(st, {
        category: "bid-event",
        seat: entry.seat,
        call: entry.call,
        seq: i,
        ts: 0,
        boardRef: board.boardRef,
        fallback: false,
      });
      return meaning;
    });
  };

  return { at, forAuction };
}

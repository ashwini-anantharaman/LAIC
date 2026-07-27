// Partnership-state inference (Knowledge Rework, Pillar A): replay the auction
// and attribute a MEANING to every call partner (and this seat) made, so the
// rule language can reason about the COMBINED hands — the expressiveness gap
// the fellows found (Blackwood off two hands, real fits, delayed support).
//
// Method — reverse look-up, hand-free and non-circular:
//  * For each prior bid by our side, find the first live rule (band+priority
//    order) whose CONTEXT matched at that point AND whose action
//    DETERMINISTICALLY realizes to the observed call without a hand (a literal
//    bid, raise_partner, or auction-resolvable bid_suit). That rule's `shows`
//    (explicit or compile-derived) is what the call promised. We never evaluate
//    hand conditions — we don't know partner's cards, and mustn't guess.
//  * Accumulate per-suit length and HCP/TP bounds, INTERSECTING across calls
//    (tightest floor/ceiling wins).
//  * Decode active asks (Blackwood/RKCB) into partner's keycards.
//  * Derive the agreed suit from FACTS ONLY (no hand, no settings) so it also
//    resolves inside `bid_suit`, whose SuitRef resolution runs with an empty env.

import {
  isContractBid,
  partnerOf,
  type AuctionCall,
  type Call,
  type Seat,
  type Suit,
  type Vul,
} from "@bridge/events";
import type { AuctionAction, CompiledAuctionRule, RuleShows, SuitRef } from "@bridge/kb";
import { legalCalls } from "../auction";
import { analyzeSeat, matchContext, type SeatAuctionFacts } from "./auctionContext";

/** What a side's calls have SHOWN, accumulated (intersected) across the auction. */
export interface ShownState {
  /** Promised HCP floor / ceiling. */
  hcpMin?: number;
  hcpMax?: number;
  /** Promised total-point floor / ceiling. */
  tpMin?: number;
  tpMax?: number;
  /** Best-known floor length per suit. */
  suitMin: Partial<Record<Suit, number>>;
  /** Best-known ceiling length per suit. */
  suitMax: Partial<Record<Suit, number>>;
}

export interface PartnershipInference {
  /** What PARTNER's calls have shown. */
  partnerShown: ShownState;
  /** What MY OWN calls have shown. */
  selfShown: ShownState;
  /** Partner's decoded keycards (the possible-values set) from an ask I made. */
  partnerShownKeycards?: number[];
  /** Partner's decoded kings from a king ask I made. */
  partnerShownKings?: number[];
  /** The agreed trump suit — facts-only (see SuitRef "agreed_suit"). */
  agreedSuit?: Suit;
  /** An ask (this id) is awaiting my reply — partner's last bid posed it. */
  askInProgress?: string;
}

export interface InferenceSurface {
  /** The player's effective (live, capped) auction rules, band+priority order. */
  auctionRules: CompiledAuctionRule[];
}

const emptyShown = (): ShownState => ({ suitMin: {}, suitMax: {} });

const suitOfBid = (call: Call | undefined): Suit | null =>
  call && isContractBid(call) && call[1] !== "N" ? (call[1] as Suit) : null;

const ALL_SUITS: readonly Suit[] = ["S", "H", "D", "C"]; // majors (S,H) before minors

/**
 * Resolve a SuitRef from FACTS alone (no hand). Own-longest/shortest need the
 * hand and return null; everything auction-derived resolves. Used both for
 * deterministic action realization during the walk and, at the end, so
 * `agreed_suit` inside a prior `bid_suit` resolves the same way it will at play.
 */
function resolveFactsSuit(ref: SuitRef, facts: SeatAuctionFacts): Suit | null {
  switch (ref) {
    case "S":
    case "H":
    case "D":
    case "C":
      return ref;
    case "partner_last_bid_suit":
      return suitOfBid(facts.partnerLast);
    case "partner_first_bid_suit":
      return suitOfBid(facts.partnerFirstBid);
    case "own_first_bid_suit":
      return suitOfBid(facts.ownFirstBid);
    case "own_last_bid_suit":
      return suitOfBid(facts.ownLastBid);
    case "rho_bid_suit":
      return suitOfBid(facts.rhoLast);
    case "lho_bid_suit":
      return suitOfBid(facts.lhoLast);
    case "only_unbid_suit": {
      const unbid = ALL_SUITS.filter((s) => !facts.suitsBid.includes(s));
      return unbid.length === 1 ? unbid[0]! : null;
    }
    case "agreed_suit":
      return facts.inference?.agreedSuit ?? null;
    default:
      return null; // own_longest_suit / own_shortest_suit need the hand
  }
}

/**
 * Realize an action to the ONE call it must produce without a hand, or null.
 * Only literal bids, raise_partner and auction-resolvable bid_suit qualify;
 * everything else depends on the hand or is a fallback and shows nothing.
 */
function realizeDeterministic(
  action: AuctionAction,
  before: AuctionCall[],
  actingSeat: Seat,
  facts: SeatAuctionFacts,
): Call | null {
  switch (action.type) {
    case "bid":
      return `${action.level}${action.strain}`;
    case "raise_partner": {
      const strain = facts.partnerLast && isContractBid(facts.partnerLast) ? facts.partnerLast[1]! : null;
      if (!strain || strain === "N") return null;
      return `${action.toLevel}${strain}`;
    }
    case "bid_suit": {
      const suit = resolveFactsSuit(action.suit, facts);
      if (!suit) return null;
      if (action.level !== undefined) return `${action.level}${suit}`;
      const legal = legalCalls(before, actingSeat);
      for (let level = 1; level <= 7; level++) {
        const c: Call = `${level}${suit}`;
        if (legal.has(c)) return c;
      }
      return null;
    }
    default:
      return null;
  }
}

/** Tighten a shown state with a rule's `shows` (intersection: tightest wins). */
function accumulate(state: ShownState, shows: RuleShows): void {
  if (shows.hcp) {
    if (shows.hcp.min !== undefined) state.hcpMin = Math.max(state.hcpMin ?? -Infinity, shows.hcp.min);
    if (shows.hcp.max !== undefined) state.hcpMax = Math.min(state.hcpMax ?? Infinity, shows.hcp.max);
  }
  if (shows.tp) {
    if (shows.tp.min !== undefined) state.tpMin = Math.max(state.tpMin ?? -Infinity, shows.tp.min);
    if (shows.tp.max !== undefined) state.tpMax = Math.min(state.tpMax ?? Infinity, shows.tp.max);
  }
  for (const s of shows.suits ?? []) {
    if (s.min !== undefined) state.suitMin[s.suit] = Math.max(state.suitMin[s.suit] ?? 0, s.min);
    if (s.max !== undefined) state.suitMax[s.suit] = Math.min(state.suitMax[s.suit] ?? Infinity, s.max);
  }
}

export function inferPartnership(
  auction: AuctionCall[],
  seat: Seat,
  vul: Vul,
  surface: InferenceSurface,
): PartnershipInference {
  const partner = partnerOf(seat);
  const partnerShown = emptyShown();
  const selfShown = emptyShown();
  const rules = surface.auctionRules;

  // Is an ask awaiting `actingSeat`'s reply, given the prefix `before`? Ask
  // rules are not themselves gated on askInProgress, so this needs no recursion.
  const askAwaiting = (before: AuctionCall[], actingSeat: Seat): string | undefined => {
    const pner = partnerOf(actingSeat);
    for (let j = before.length - 1; j >= 0; j--) {
      const c = before[j]!;
      if (!isContractBid(c.call)) continue;
      if (c.seat === actingSeat) return undefined; // I've bid since — nothing pending
      if (c.seat !== pner) continue; // an opponent's bid doesn't answer
      const b2 = before.slice(0, j);
      const f2 = analyzeSeat(b2, c.seat, vul);
      for (const rule of rules) {
        if (!rule.ask) continue;
        if (!matchContext(rule.context, f2)) continue;
        if (realizeDeterministic(rule.action, b2, c.seat, f2) === c.call) return rule.ask.id;
      }
      return undefined;
    }
    return undefined;
  };

  // The first rule that attributes meaning to the call at `index`.
  const matchedRuleFor = (index: number): CompiledAuctionRule | null => {
    const call = auction[index]!;
    const before = auction.slice(0, index);
    const facts = analyzeSeat(before, call.seat, vul);
    facts.inference = { partnerShown: emptyShown(), selfShown: emptyShown(), askInProgress: askAwaiting(before, call.seat) };
    for (const rule of rules) {
      if (!matchContext(rule.context, facts)) continue;
      if (realizeDeterministic(rule.action, before, call.seat, facts) === call.call) return rule;
    }
    return null;
  };

  // The ask rule that a given call posed, if any.
  const askRuleOfCall = (index: number): CompiledAuctionRule | null => {
    const call = auction[index]!;
    const before = auction.slice(0, index);
    const facts = analyzeSeat(before, call.seat, vul);
    for (const rule of rules) {
      if (!rule.ask) continue;
      if (!matchContext(rule.context, facts)) continue;
      if (realizeDeterministic(rule.action, before, call.seat, facts) === call.call) return rule;
    }
    return null;
  };

  // ---- shows accumulation (partner + self) ---------------------------------
  for (let i = 0; i < auction.length; i++) {
    const c = auction[i]!;
    if (!isContractBid(c.call)) continue; // only bids show a hand
    const mine = c.seat === seat;
    if (!mine && c.seat !== partner) continue; // opponents show us nothing
    const rule = matchedRuleFor(i);
    if (rule?.shows) accumulate(mine ? selfShown : partnerShown, rule.shows);
  }

  // ---- ask decoding: my most recent ask that partner has answered ----------
  let partnerShownKeycards: number[] | undefined;
  let partnerShownKings: number[] | undefined;
  for (let j = auction.length - 1; j >= 0; j--) {
    const c = auction[j]!;
    if (c.seat !== seat || !isContractBid(c.call)) continue;
    const askRule = askRuleOfCall(j);
    if (!askRule) continue;
    for (let k = j + 1; k < auction.length; k++) {
      const r = auction[k]!;
      if (r.seat !== partner || !isContractBid(r.call)) continue;
      const meaning = askRule.ask!.responses[r.call];
      if (meaning?.keycards) partnerShownKeycards = meaning.keycards;
      if (meaning?.kings) partnerShownKings = meaning.kings;
      break;
    }
    break; // only the most recent ask matters
  }

  // ---- an ask partner is posing to me now ----------------------------------
  const askInProgress = askAwaiting(auction, seat);

  // ---- agreed suit (facts-only) --------------------------------------------
  const bidBy = (s: Seat, suit: Suit): boolean =>
    auction.some((c) => c.seat === s && isContractBid(c.call) && c.call[1] === suit);
  let agreedSuit: Suit | undefined;
  // 1) a suit BOTH partners named (explicit agreement / raise), majors first.
  for (const suit of ALL_SUITS) {
    if (bidBy(seat, suit) && bidBy(partner, suit)) {
      agreedSuit = suit;
      break;
    }
  }
  // 2) else the best known 8-card combined fit — majors as a group before minors.
  if (!agreedSuit) {
    for (const group of [["S", "H"] as Suit[], ["D", "C"] as Suit[]]) {
      let best: { suit: Suit; combined: number } | null = null;
      for (const suit of group) {
        const combined = (partnerShown.suitMin[suit] ?? 0) + (selfShown.suitMin[suit] ?? 0);
        if (combined >= 8 && (!best || combined > best.combined)) best = { suit, combined };
      }
      if (best) {
        agreedSuit = best.suit;
        break;
      }
    }
  }

  return {
    partnerShown,
    selfShown,
    ...(partnerShownKeycards && { partnerShownKeycards }),
    ...(partnerShownKings && { partnerShownKings }),
    ...(agreedSuit && { agreedSuit }),
    ...(askInProgress && { askInProgress }),
  };
}

/**
 * Zone 3 — Bridge implementation: Beginner 1 practice deal generator.
 *
 * Generates random deals by rejection sampling, then asks the evaluator what
 * the learner's correct call is. A deal is only accepted when the evaluator's
 * recommendation matches the requested target skill — so every emitted deal is
 * guaranteed consistent with the evaluator (Step 4).
 */
import { BridgeEvaluator } from "./evaluator/BridgeEvaluator";
import { parseBid, type SuitLetter } from "./evaluator/hand";
import type { BridgeGameState, Seat } from "./plugin/events";

export interface Deal {
  dealId: string;
  dealer: Seat;
  vulnerability: "None" | "NS" | "EW" | "Both";
  hands: { N: string; E: string; S: string; W: string };
  targetSkill: string;
  expectedBid: string;
  /** which seat the learner sits in */
  position: Seat;
  /** calls before the learner's turn (empty for an opening deal) */
  auctionSoFar: string[];
}

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const SUITS: SuitLetter[] = ["S", "H", "D", "C"];
const RANK_ORDER: Record<string, number> = Object.fromEntries(
  RANKS.map((r, i) => [r, i]),
);

function buildDeck(): string[] {
  const deck: string[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(`${s}${r}`);
  return deck;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatHand(cards: string[]): string {
  const bySuit: Record<SuitLetter, string[]> = { S: [], H: [], D: [], C: [] };
  for (const card of cards) {
    const suit = card[0] as SuitLetter;
    bySuit[suit].push(card.slice(1));
  }
  return SUITS.map((s) => {
    const ranks = bySuit[s].sort((a, b) => RANK_ORDER[a] - RANK_ORDER[b]);
    return `${s}:${ranks.join("")}`;
  }).join(" ");
}

interface DealtHands extends Record<string, string> {
  N: string;
  E: string;
  S: string;
  W: string;
}

function dealHands(): DealtHands {
  const deck = shuffle(buildDeck());
  return {
    N: formatHand(deck.slice(0, 13)),
    E: formatHand(deck.slice(13, 26)),
    S: formatHand(deck.slice(26, 39)),
    W: formatHand(deck.slice(39, 52)),
  };
}

let dealCounter = 0;
function nextDealId(): string {
  return `deal_${Date.now()}_${++dealCounter}`;
}

export class DealGenerator {
  constructor(
    private readonly evaluator: BridgeEvaluator = new BridgeEvaluator(),
    private readonly maxRetries = 5000,
  ) {}

  /**
   * Generate an opening-bid deal. If skillId is given, only accept deals whose
   * correct South opening exercises that skill.
   */
  async generateOpeningBidDeal(skillId?: string): Promise<Deal> {
    for (let i = 0; i < this.maxRetries; i++) {
      const hands = dealHands();
      const state: BridgeGameState = {
        dealId: "probe",
        dealer: "S",
        vulnerability: "None",
        hands,
        auctionSoFar: [],
        currentPhase: "bidding",
      };
      const result = await this.evaluator.evaluate(state, {
        bid: "P",
        position: "S",
        hand: hands.S,
        auctionSoFar: [],
      });
      const expectedBid = String(result.bestAction);
      if (skillId && !result.skillIds.includes(skillId)) continue;

      return {
        dealId: nextDealId(),
        dealer: "S",
        vulnerability: "None",
        hands,
        targetSkill: skillId ?? result.skillIds[0] ?? "",
        expectedBid,
        position: "S",
        auctionSoFar: [],
      };
    }
    throw new Error(
      `Could not generate an opening deal for skill ${skillId ?? "any"} within ${this.maxRetries} tries.`,
    );
  }

  /**
   * Generate a response deal: North opens `partnerOpening`, East passes, South
   * responds. Only accept deals where North's hand truly warrants that opening
   * and (if skillId given) South's correct response exercises that skill.
   */
  async generateResponseDeal(
    partnerOpening: string,
    skillId?: string,
  ): Promise<Deal> {
    const opening = parseBid(partnerOpening);
    if (opening.isPass || opening.level !== 1) {
      throw new Error(`partnerOpening must be a 1-level opening, got ${partnerOpening}`);
    }
    const auction = [partnerOpening, "P"];

    for (let i = 0; i < this.maxRetries; i++) {
      const hands = dealHands();

      // North must actually open `partnerOpening`.
      const northState: BridgeGameState = {
        dealId: "probe",
        dealer: "N",
        vulnerability: "None",
        hands,
        auctionSoFar: [],
        currentPhase: "bidding",
      };
      const northRec = await this.evaluator.evaluate(northState, {
        bid: "P",
        position: "N",
        hand: hands.N,
        auctionSoFar: [],
      });
      if (String(northRec.bestAction) !== partnerOpening) continue;

      // South's correct response.
      const southState: BridgeGameState = {
        dealId: "probe",
        dealer: "N",
        vulnerability: "None",
        hands,
        auctionSoFar: auction,
        currentPhase: "bidding",
      };
      const southRec = await this.evaluator.evaluate(southState, {
        bid: "P",
        position: "S",
        hand: hands.S,
        auctionSoFar: auction,
      });
      if (skillId && !southRec.skillIds.includes(skillId)) continue;

      return {
        dealId: nextDealId(),
        dealer: "N",
        vulnerability: "None",
        hands,
        targetSkill: skillId ?? southRec.skillIds[0] ?? "",
        expectedBid: String(southRec.bestAction),
        position: "S",
        auctionSoFar: auction,
      };
    }
    throw new Error(
      `Could not generate a response deal to ${partnerOpening} for skill ${skillId ?? "any"} within ${this.maxRetries} tries.`,
    );
  }
}

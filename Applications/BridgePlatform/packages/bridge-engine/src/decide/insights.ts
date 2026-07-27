// Knowledge-quality detectors (KB tools): two mechanical linters that run a
// seeded self-play pass and surface whole CLASSES of knowledge defects an
// expert would otherwise have to catch by hand.
//
//   Detector 1 — continuation-gap linter: at every AI bidding decision it
//   records the normalized auction prefix and whether a rule matched. Prefixes
//   that almost always fall through to the fallback ("nothing answers this
//   auction") are reported, collapsed to the shortest gappy prefix.
//
//   Detector 2 — outcome anomaly flags: honest HEURISTIC invariants over the
//   full known deal + final contract/tricks. These are a review queue, not
//   verdicts — a flag is a lead an expert follows, never a machine ruling.
//
// Composed from the same primitives as simulateSelfPlay (seededDeal /
// createKbDecider / createGame); it does not fork the simulation loop's law.

import { createBus, SEATS, type Card, type Seat, type Suit } from "@bridge/events";
import type { CompiledKb } from "@bridge/kb";
import { createGame, type AsyncDecider } from "../game";
import { hcp } from "../hand";
import { initialState, sideOf, type GameState } from "../state";
import type { Contract } from "@bridge/events";
import type { Decision } from "../decision";
import { createKbDecider, type KbPlayerConfig } from "./decider";
import { seededDeal } from "./simulate";

const MAX_STEPS = 400; // hard stop, far above any legal deal's action count

export interface AnalyzeOptions {
  compiled: CompiledKb;
  player: KbPlayerConfig;
  deals: number;
  seed: number;
  /** Called after each completed deal (progress reporting). */
  onDeal?: (index: number, dealSeed: number) => void;
}

/** A bidding auction prefix that almost never gets a rule answer. */
export interface ContinuationGap {
  /** Calls so far joined with '-', e.g. "2C-P-2S-P" ("" = opening seat). */
  prefix: string;
  /** How many AI bidding decisions reached this exact prefix. */
  samples: number;
  /** Fraction of those decisions that fell through (fallback or floor). */
  fallbackShare: number;
  /** One deal + auction that reproduces the gap live. */
  example: { dealSeed: number; auction: string };
}

export type AnomalyKind =
  | "missed_game"
  | "slam_missing_aces"
  | "no_fit"
  | "game_values_passed_out";

/** A single flagged completed deal — a lead for review, not a verdict. */
export interface OutcomeAnomaly {
  kind: AnomalyKind;
  dealSeed: number;
  dealer: Seat;
  vul: string;
  /** Calls joined with '-'. */
  auction: string;
  /** Final contract, e.g. "6H by S" or "passed out". */
  contract: string;
  /** One human sentence with the numbers. */
  detail: string;
}

export interface InsightsReport {
  gaps: ContinuationGap[];
  anomalies: OutcomeAnomaly[];
  dealsPlayed: number;
}

type DecisionKind = "matched" | "fallback" | "floor";

function classify(d: Decision<unknown>): DecisionKind {
  if (!d.fallback) return "matched";
  if (d.reason.startsWith("ENGINE FLOOR")) return "floor";
  return "fallback";
}

interface PrefixAgg {
  samples: number;
  nonMatched: number;
  example: { dealSeed: number; auction: string };
  exampleIsGap: boolean;
}

const GAME_LEVEL: Record<string, number> = { N: 3, S: 4, H: 4, D: 5, C: 5 };

/** Did the auction reach game or better for this contract's strain? */
function gameReached(c: Contract): boolean {
  return c.level >= (GAME_LEVEL[c.strain] ?? 4);
}

/** Combined HCP of the two hands on a side. */
function sideHcp(hands: Record<Seat, Card[]>, side: "NS" | "EW"): number {
  const seats: Seat[] = side === "NS" ? ["N", "S"] : ["E", "W"];
  return hcp(hands[seats[0]!]) + hcp(hands[seats[1]!]);
}

/** Count of aces (rank 14) a side holds across both hands. */
function sideAces(hands: Record<Seat, Card[]>, side: "NS" | "EW"): number {
  const seats: Seat[] = side === "NS" ? ["N", "S"] : ["E", "W"];
  return seats.reduce((n, s) => n + hands[s].filter((c) => c.rank === 14).length, 0);
}

/** Combined length of a suit a side holds across both hands. */
function sideSuitLen(hands: Record<Seat, Card[]>, side: "NS" | "EW", suit: Suit): number {
  const seats: Seat[] = side === "NS" ? ["N", "S"] : ["E", "W"];
  return seats.reduce((n, s) => n + hands[s].filter((c) => c.suit === suit).length, 0);
}

function contractString(c: Contract | null, completed: boolean): string {
  if (c) return `${c.level}${c.strain === "N" ? "NT" : c.strain} by ${c.declarer}`;
  return completed ? "passed out" : "unfinished";
}

/**
 * Play N seeded deals with the player at all four seats (exactly the loop
 * simulateSelfPlay uses) and mine the pass for continuation gaps and outcome
 * anomalies. Deterministic: same {seed, deals, compiled, player} → same report.
 */
export async function analyzeSelfPlay(options: AnalyzeOptions): Promise<InsightsReport> {
  const { compiled, player } = options;
  const prefixes = new Map<string, PrefixAgg>();
  const anomalies: OutcomeAnomaly[] = [];
  let dealsPlayed = 0;

  for (let i = 0; i < options.deals; i++) {
    const dealSeed = options.seed + i;
    const hands = seededDeal(dealSeed); // the FULL known deal (kept intact)
    const dealer = SEATS[dealSeed % 4]!;

    const decider = createKbDecider({ compiled, player, seed: `ins_${dealSeed}` });

    const record = (state: GameState, d: Decision<unknown>) => {
      const prefix = state.auction.map((a) => a.call).join("-");
      const kind = classify(d);
      const entry =
        prefixes.get(prefix) ??
        ({ samples: 0, nonMatched: 0, example: { dealSeed, auction: prefix }, exampleIsGap: false } as PrefixAgg);
      entry.samples++;
      if (kind !== "matched") {
        entry.nonMatched++;
        // Prefer an example drawn from a deal where the prefix actually gapped.
        if (!entry.exampleIsGap) {
          entry.example = { dealSeed, auction: prefix };
          entry.exampleIsGap = true;
        }
      }
      prefixes.set(prefix, entry);
    };

    const wrapped: AsyncDecider = {
      decideBid: async (state, seat) => {
        const d = await decider.decideBid(state, seat);
        record(state, d);
        return d;
      },
      decidePlay: (state, seat) => decider.decidePlay(state, seat),
    };

    const game = createGame(
      createBus(),
      { N: wrapped, E: wrapped, S: wrapped, W: wrapped },
      initialState(`ins_${dealSeed}`, dealer, "none", hands),
    );

    let steps = 0;
    while (game.getState().phase !== "complete" && steps < MAX_STEPS) {
      await game.step();
      steps++;
    }

    const final = game.getState();
    dealsPlayed++;
    if (final.phase === "complete") {
      anomalies.push(
        ...outcomeAnomalies({
          hands,
          dealSeed,
          dealer,
          vul: final.vul as string,
          auction: final.auction.map((a) => a.call).join("-"),
          contract: final.contract,
        }),
      );
    }
    options.onDeal?.(i, dealSeed);
  }

  // Gaps: enough samples, and almost everything fell through.
  const raw = [...prefixes.entries()]
    .filter(([, e]) => e.samples >= 3 && e.nonMatched / e.samples >= 0.8)
    .map(([prefix, e]) => ({
      prefix,
      samples: e.samples,
      fallbackShare: e.nonMatched / e.samples,
      example: e.example,
      calls: prefix === "" ? [] : prefix.split("-"),
    }));

  // Collapse to the SHORTEST distinguishing prefix: drop any gap that has a
  // gappy strict-ancestor (a shorter gappy prefix it extends).
  const isStrictPrefix = (a: string[], b: string[]) =>
    a.length < b.length && a.every((c, i) => c === b[i]);
  const collapsed = raw
    .filter((g) => !raw.some((h) => h !== g && isStrictPrefix(h.calls, g.calls)))
    .sort((a, b) => b.samples - a.samples)
    .map(({ prefix, samples, fallbackShare, example }) => ({ prefix, samples, fallbackShare, example }));

  return { gaps: collapsed, anomalies, dealsPlayed };
}

/** The known facts of one completed deal, enough to run every invariant. */
export interface DealOutcome {
  /** The FULL deal (all 13 cards per seat) — not the mid-play remainder. */
  hands: Record<Seat, Card[]>;
  dealSeed: number;
  dealer: Seat;
  vul: string;
  /** Calls joined with '-'. */
  auction: string;
  contract: Contract | null;
}

/**
 * Evaluate the outcome-anomaly heuristics for one completed deal. Pure and
 * side-effect-free (unit-testable on crafted deals). These are HEURISTICS: a
 * returned flag is a lead for an expert to review, never a verdict.
 */
export function outcomeAnomalies(o: DealOutcome): OutcomeAnomaly[] {
  const out: OutcomeAnomaly[] = [];
  const { hands, dealSeed, dealer } = o;
  const c = o.contract;
  const contract = contractString(c, true);
  const base = { dealSeed, dealer, vul: o.vul, auction: o.auction, contract };

  const nsHcp = sideHcp(hands, "NS");
  const ewHcp = sideHcp(hands, "EW");

  if (c) {
    const side = sideOf(c.declarer);
    const combined = side === "NS" ? nsHcp : ewHcp;

    // missed_game: game-worth values but the auction stopped short of game.
    if (combined >= 26 && !gameReached(c)) {
      out.push({
        ...base,
        kind: "missed_game",
        detail: `${side} declared ${contract} with ${combined} combined HCP — 26+ is usually game.`,
      });
    }

    // slam_missing_aces: slam bid off two or more aces.
    if (c.level >= 6) {
      const aces = sideAces(hands, side);
      if (aces <= 2) {
        out.push({
          ...base,
          kind: "slam_missing_aces",
          detail: `${contract} bid while ${side} held only ${aces} of the 4 aces.`,
        });
      }
    }

    // no_fit: suit contract on a combined trump holding of 6 or fewer.
    if (c.strain !== "N") {
      const len = sideSuitLen(hands, side, c.strain);
      if (len <= 6) {
        out.push({
          ...base,
          kind: "no_fit",
          detail: `${contract} is a suit contract on only ${len} combined ${c.strain} — no 8-card fit.`,
        });
      }
    }
  } else {
    // Passed out.
    const strongest = nsHcp >= ewHcp ? "NS" : "EW";
    const combined = Math.max(nsHcp, ewHcp);

    if (combined >= 26) {
      out.push({
        ...base,
        kind: "missed_game",
        detail: `Passed out while ${strongest} held ${combined} combined HCP — 26+ is usually game.`,
      });
    }
    if (nsHcp >= 25 || ewHcp >= 25) {
      out.push({
        ...base,
        kind: "game_values_passed_out",
        detail: `Passed out with ${strongest} holding ${combined} combined HCP (25+ is game-invitational or better).`,
      });
    }
  }
  return out;
}

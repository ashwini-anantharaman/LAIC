// Bidding regression drills (Pillar D): a drill is a saved LibraryEntry of
// kind "drill" carrying an auction-so-far, the hand to test (only the acting
// seat matters for a bidding decision), and the acceptable engine answers
// (`expectedCalls`). Running a drill folds the auction exactly like the test
// bench, asks the KB decider for the next call, and compares it to the
// expected set. Pure + server-only by import site (pulls @bridge/engine); no
// JSX, so it is unit-tested directly (drills.test.ts).

import { callLabel, nextSeat, type Call, type Card, type Seat } from "@bridge/events";
import {
  createKbDecider,
  initialState,
  type GameState,
  type KbPlayerConfig,
} from "@bridge/engine";
import type { CompiledKb } from "@bridge/kb";
import type { LibraryEntry } from "@bridge/sessions";

/** Normalize one typed call token to its canonical engine form, or null. */
export function normalizeDrillCall(raw: string): Call | null {
  const t = raw.trim().toUpperCase();
  if (t === "P" || t === "PASS") return "P";
  if (t === "X" || t === "DBL") return "X";
  if (t === "XX" || t === "RDBL") return "XX";
  const m = /^([1-7])(NT|N|S|H|D|C)$/.exec(t);
  if (m) return `${m[1]}${m[2] === "NT" ? "N" : m[2]}` as Call;
  return null;
}

/** Parse a comma/space-separated expected-calls field into canonical calls. */
export function parseExpectedCalls(input: string): Call[] {
  const out: Call[] = [];
  for (const token of input.split(/[\s,]+/).filter(Boolean)) {
    const c = normalizeDrillCall(token);
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

/** The seat on lead to act next, given the dealer and the auction so far. */
export function foldToAct(drill: LibraryEntry): Seat {
  const auction = drill.auction ?? [];
  if (auction.length === 0) return drill.dealer ?? "N";
  return nextSeat(auction[auction.length - 1]!.seat);
}

export interface DrillResult {
  entryId: string;
  name: string;
  note?: string;
  /** Passed = the engine's call is in the expected set. */
  pass: boolean;
  /** True when the drill can't be run (no hand, illegal auction, no compile). */
  errored: boolean;
  error?: string;
  toAct: Seat;
  expected: Call[];
  /** The engine's actual call (canonical + human label). */
  got?: Call;
  gotLabel?: string;
  /** Why the engine made that call (the failing because-English on a miss). */
  because?: string;
  /** True when the engine fell back / hit the floor (no agreement applied). */
  fallback?: boolean;
  matchedRuleId?: string;
  itemId?: string;
}

/**
 * Run one drill against a compiled KB and player configuration. The compare is
 * on the canonical Call, so `expectedCalls` must be stored canonical (they are:
 * the save action normalizes them, and prefills come from `decision.action`).
 */
export async function runDrill(
  drill: LibraryEntry,
  compiled: CompiledKb,
  config: KbPlayerConfig,
): Promise<DrillResult> {
  const expected = drill.expectedCalls ?? [];
  const toAct = foldToAct(drill);
  const base: DrillResult = {
    entryId: drill.entryId,
    name: drill.name,
    ...(drill.notes ? { note: drill.notes } : {}),
    pass: false,
    errored: false,
    toAct,
    expected,
  };

  const hand = drill.hands?.[toAct];
  if (!hand || hand.length === 0)
    return { ...base, errored: true, error: `no hand stored for the seat to act (${toAct})` };
  if (expected.length === 0)
    return { ...base, errored: true, error: "no expected call recorded" };

  try {
    const hands: Record<Seat, Card[]> = {
      N: drill.hands?.N ?? [],
      E: drill.hands?.E ?? [],
      S: drill.hands?.S ?? [],
      W: drill.hands?.W ?? [],
    };
    const state: GameState = initialState("drill", drill.dealer ?? "N", drill.vul ?? "none", hands);
    state.auction = (drill.auction ?? []).map((c) => ({ seat: c.seat, call: c.call }));
    state.turn = toAct;

    const decider = createKbDecider({ compiled, player: config });
    const decision = await decider.decideBid(state, toAct);
    const itemId = decision.matchedRuleId?.split(".")[0];
    return {
      ...base,
      pass: expected.includes(decision.action),
      got: decision.action,
      gotLabel: callLabel(decision.action),
      because: decision.reason,
      fallback: decision.fallback,
      ...(decision.matchedRuleId ? { matchedRuleId: decision.matchedRuleId } : {}),
      ...(itemId ? { itemId } : {}),
    };
  } catch (err) {
    return { ...base, errored: true, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Run every drill; returns results plus a pass-rate summary. */
export async function runDrills(
  drills: LibraryEntry[],
  compiled: CompiledKb,
  config: KbPlayerConfig,
): Promise<{ results: DrillResult[]; passed: number; failed: number; errored: number }> {
  const results = await Promise.all(drills.map((d) => runDrill(d, compiled, config)));
  let passed = 0;
  let failed = 0;
  let errored = 0;
  for (const r of results) {
    if (r.errored) errored++;
    else if (r.pass) passed++;
    else failed++;
  }
  return { results, passed, failed, errored };
}

/** Player config for a chosen set (empty packId = full knowledge). */
export function drillPlayerConfig(packId: string | undefined): KbPlayerConfig {
  return {
    enabledPackIds: packId ? [packId] : [],
    settingOverrides: {},
    decisionPolicyId: "first_match",
  };
}


/** The fellows' named expert regression cases, seeded on demand. */
export interface SeedSpec {
  name: string;
  auction: string;
  dealer: Seat;
  hand: string;
  expected: string;
  note: string;
}

export const EXPERT_SEEDS: SeedSpec[] = [
  {
    name: "[expert] Blackwood signoff missing two — pass 5♠",
    auction: "1S P 3S P 4N P 5H P 5S P",
    dealer: "N",
    hand: "KQ74.853.A62.953", // ♠K Q 7 4 = 2 keycards (♠K + ♦A); minimum for the raise
    expected: "P",
    note: "Target: after Blackwood shows the partnership is off two keycards, responder PASSES partner's 5♠ signoff — no push to a slam that is missing two.",
  },
  {
    name: "[expert] 2♣–P–2♠–P — opener finds a real continuation",
    auction: "2C P 2S P",
    dealer: "N",
    hand: "AKQJ5.AK4.AK3.32", // 24 HCP, 5 spades over a 2♠ positive
    expected: "3S 4S",
    note: "Target: over the positive 2♠ response opener makes a natural, non-fallback continuation (a spade raise on the huge fit) — not a pass / floor.",
  },
  {
    name: "[expert] 94441-class — reach 3NT on 26+ combined",
    auction: "1C P 1H P 2N P",
    dealer: "N",
    hand: "K43.QJ752.K4.632", // 9 HCP opposite an 18–19 2NT rebid = game values
    expected: "3N",
    note: "Target: opposite an 18–19 2NT rebid, responder with game values raises to 3NT (combined 26+) — the missed-game class the detectors flagged.",
  },
];

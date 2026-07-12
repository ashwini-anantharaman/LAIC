// Duplicate-bridge contract scoring (Bridge plan §8.2). Implements the
// scoring table of the Laws of Duplicate Bridge 2017, Law 77 (WBF:
// https://www.worldbridge.org/wp-content/uploads/2017/03/2017LawsofDuplicateBridge-nohighlights.pdf).
// Pure math over the completed game state — no agreements involved, so this
// is engine code, not rule-package content.

import { isVulnerable, type Contract } from "@bridge/events";
import { sideOf, type GameState } from "./state";

export interface ScoreBreakdown {
  /** null = the board was passed out. */
  contract: Contract | null;
  /** Tricks taken by the declaring side (0 when passed out). */
  tricksTaken: number;
  /** +n overtricks, -n undertricks, 0 = exact make (0 when passed out). */
  result: number;
  made: boolean;
  vulnerable: boolean;
  /** Component values (declarer perspective, all >= 0). */
  trickScore: number;
  overtrickScore: number;
  gameBonus: number;
  partscoreBonus: number;
  slamBonus: number;
  /** "Insult" bonus for making a doubled/redoubled contract (Law 77). */
  insultBonus: number;
  /** Undertrick penalty (>= 0; scored to the defenders). */
  penalty: number;
  /** Total from the declaring side's perspective (negative when down). */
  declarerScore: number;
  /** Total from North-South's perspective (0 when passed out). */
  nsScore: number;
}

const TRICK_VALUE: Record<string, number> = { C: 20, D: 20, H: 30, S: 30 };

/**
 * Score a COMPLETED board (state.phase === "complete"); returns null
 * otherwise. Handles passed-out boards (score 0, Law 77 "zero score").
 */
export function scoreBoard(state: GameState): ScoreBreakdown | null {
  if (state.phase !== "complete") return null;
  const contract = state.contract;
  if (!contract) {
    return {
      contract: null, tricksTaken: 0, result: 0, made: false, vulnerable: false,
      trickScore: 0, overtrickScore: 0, gameBonus: 0, partscoreBonus: 0,
      slamBonus: 0, insultBonus: 0, penalty: 0, declarerScore: 0, nsScore: 0,
    };
  }

  const side = sideOf(contract.declarer);
  const tricksTaken = state.trickCount[side];
  const needed = 6 + contract.level;
  const result = tricksTaken - needed;
  const made = result >= 0;
  const vulnerable = isVulnerable(state.vul, contract.declarer);
  const dbl = contract.doubled; // 0 | 1 | 2
  const dblFactor = dbl === 2 ? 4 : dbl === 1 ? 2 : 1;

  let trickScore = 0;
  let overtrickScore = 0;
  let gameBonus = 0;
  let partscoreBonus = 0;
  let slamBonus = 0;
  let insultBonus = 0;
  let penalty = 0;

  if (made) {
    // Trick score: per odd trick bid; NT's first trick is worth 40.
    trickScore =
      contract.strain === "N"
        ? (40 + (contract.level - 1) * 30) * dblFactor
        : TRICK_VALUE[contract.strain]! * contract.level * dblFactor;
    // Overtricks: at strain value undoubled; flat per-trick when (re)doubled.
    const perOvertrick =
      dbl === 0
        ? contract.strain === "N"
          ? 30
          : TRICK_VALUE[contract.strain]!
        : (vulnerable ? 200 : 100) * (dbl === 2 ? 2 : 1);
    overtrickScore = result * perOvertrick;
    // Game vs partscore bonus keys off the (doubled) trick score.
    if (trickScore >= 100) gameBonus = vulnerable ? 500 : 300;
    else partscoreBonus = 50;
    if (contract.level === 6) slamBonus = vulnerable ? 750 : 500;
    if (contract.level === 7) slamBonus = vulnerable ? 1500 : 1000;
    if (dbl > 0) insultBonus = 50 * dbl;
  } else {
    const down = -result;
    if (dbl === 0) {
      penalty = down * (vulnerable ? 100 : 50);
    } else {
      // Doubled: 1st 100/200 (nv/vul), 2nd & 3rd 200/300 each, 4th+ 300 each.
      let p = 0;
      for (let i = 1; i <= down; i++) {
        if (i === 1) p += vulnerable ? 200 : 100;
        else if (i <= 3) p += vulnerable ? 300 : 200;
        else p += 300;
      }
      penalty = p * (dbl === 2 ? 2 : 1);
    }
  }

  const declarerScore = made
    ? trickScore + overtrickScore + gameBonus + partscoreBonus + slamBonus + insultBonus
    : -penalty;
  return {
    contract, tricksTaken, result, made, vulnerable,
    trickScore, overtrickScore, gameBonus, partscoreBonus, slamBonus,
    insultBonus, penalty, declarerScore,
    nsScore: side === "NS" ? declarerScore : -declarerScore,
  };
}

/** "3♥ by S, made +1" / "4♠ X by E, down 2" / "Passed out". */
export function resultLabel(score: ScoreBreakdown): string {
  if (!score.contract) return "Passed out";
  const c = score.contract;
  const strain = c.strain === "N" ? "NT" : { C: "♣", D: "♦", H: "♥", S: "♠" }[c.strain];
  const dbl = c.doubled === 1 ? " X" : c.doubled === 2 ? " XX" : "";
  const outcome =
    score.result === 0 ? "made" : score.result > 0 ? `made +${score.result}` : `down ${-score.result}`;
  return `${c.level}${strain}${dbl} by ${c.declarer}, ${outcome}`;
}

/**
 * Zone 3 — Bridge implementation: card-play (trick play) types.
 *
 * These support real-time coaching during the play of the hand. We do not run
 * a full double-dummy engine; instead each scenario is a curated PARTIAL state
 * annotated with the tactically correct play, so the evaluator can judge the
 * learner's chosen card deterministically. (Tactics per Watson's "Play of the
 * Hand at Bridge".)
 */
import type { Seat } from "../plugin/events.js";
import type { Severity } from "../../../platform/types/index.js";

export type Strain = "S" | "H" | "D" | "C" | "NT";

/** A card the learner played, plus which scenario it belongs to. */
export interface CardPlayAction {
  /** e.g. "HQ", "S10"→"ST", "C2" */
  card: string;
  /** the seat the learner is playing from this turn */
  position: Seat;
  scenarioId: string;
}

export interface TrickCard {
  seat: Seat;
  card: string;
}

/**
 * A curated card-play situation. The full object (with bestCards/reasons) lives
 * server-side and is used as the evaluator's game state; the client only sees
 * the public view (see toPublicScenario).
 */
export interface CardPlayScenario {
  scenarioId: string;
  title: string;
  /** learner-facing setup shown above the table */
  situation: string;
  contract: string;
  trump: Strain;
  declarer: Seat;
  learnerSeat: Seat;
  role: "declarer" | "defender";
  dummySeat: Seat;
  /** hands visible to the learner, in "S:AK4 H:Q2 ..." format */
  hands: { [seat in Seat]?: string };
  /** seat whose card the learner chooses this turn (dummy for a declarer play) */
  playFromSeat: Seat;
  /** true if the learner is on lead (no card led yet this trick) */
  toLead: boolean;
  leadSuit?: "S" | "H" | "D" | "C";
  trickSoFar: TrickCard[];
  /** cards the learner may legally play from playFromSeat */
  legalCards: string[];
  /** the recommended play(s) */
  bestCards: string[];
  /** reasonable but not ideal alternatives */
  acceptableCards: string[];
  targetSkill: string;
  conceptIds: string[];
  skillIds: string[];
  /** machine-readable rationale for the right play */
  reasonBest: string;
  /** machine-readable note applied when the learner plays a wrong card */
  reasonWrong: string;
  severityIfWrong: Severity;
}

/** Client-safe view: strips the answer so the UI can't reveal it. */
export type PublicScenario = Omit<
  CardPlayScenario,
  "bestCards" | "acceptableCards" | "reasonBest" | "reasonWrong" | "severityIfWrong"
>;

export function toPublicScenario(s: CardPlayScenario): PublicScenario {
  const {
    bestCards: _b,
    acceptableCards: _a,
    reasonBest: _rb,
    reasonWrong: _rw,
    severityIfWrong: _sev,
    ...pub
  } = s;
  return pub;
}

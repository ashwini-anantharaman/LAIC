/**
 * Zone 3 — Bridge implementation: curated card-play scenarios.
 *
 * Each is a partial table state with a known-correct play, tagged to the
 * card-play taxonomy. Sourced from Watson's tactical principles. This is a
 * teaching set, not an exhaustive engine — every scenario is one whose right
 * play follows from a clear rule (finesse, second-hand-low, hold-up, etc.).
 */
import * as C from "../plugin/constants.js";
import type { CardPlayScenario } from "./types.js";

/** Normalize a card token: uppercase, "10" → "T". e.g. "hq" → "HQ". */
export function normalizeCard(card: string): string {
  return card.trim().toUpperCase().replace(/10/g, "T");
}

export const CARD_PLAY_SCENARIOS: CardPlayScenario[] = [
  {
    scenarioId: "cp_finesse_hearts",
    title: "Take the finesse",
    situation:
      "You are declarer in 3NT and need extra heart tricks. You led the ♥2 from your hand and West followed with the ♥8. It is dummy's turn — which heart do you play from dummy?",
    contract: "3NT",
    trump: "NT",
    declarer: "S",
    learnerSeat: "S",
    role: "declarer",
    dummySeat: "N",
    hands: {
      N: "S:A5 H:AQ4 D:K72 C:8643",
      S: "S:K76 H:632 D:AQ5 C:AK52",
    },
    playFromSeat: "N",
    toLead: false,
    leadSuit: "H",
    trickSoFar: [
      { seat: "S", card: "H2" },
      { seat: "W", card: "H8" },
    ],
    legalCards: ["HA", "HQ", "H4"],
    bestCards: ["HQ"],
    acceptableCards: [],
    targetSkill: C.SKILL_TAKE_FINESSE,
    conceptIds: [C.CONCEPT_FINESSE, C.CONCEPT_TENACE],
    skillIds: [C.SKILL_TAKE_FINESSE],
    reasonBest:
      "Finesse: play the Queen. Having led toward the A-Q tenace, the Queen wins whenever West holds the King — a free extra trick half the time.",
    reasonWrong:
      "Rising with the Ace crashes your own finesse and promotes the defenders' King; playing low wastes the chance entirely.",
    severityIfWrong: "major",
  },
  {
    scenarioId: "cp_second_hand_low",
    title: "Second hand low",
    situation:
      "Declarer (South) leads the ♦2 from hand toward dummy's ♦A Q. You are West, second to play, holding ♦K 6 3. Which diamond do you play?",
    contract: "3NT",
    trump: "NT",
    declarer: "S",
    learnerSeat: "W",
    role: "defender",
    dummySeat: "N",
    hands: {
      N: "S:764 H:K5 D:AQ7 C:QJ93",
      W: "S:QJ92 H:8632 D:K63 C:84",
    },
    playFromSeat: "W",
    toLead: false,
    leadSuit: "D",
    trickSoFar: [{ seat: "S", card: "D2" }],
    legalCards: ["DK", "D6", "D3"],
    bestCards: ["D3"],
    acceptableCards: ["D6"],
    targetSkill: C.SKILL_SECOND_HAND_LOW,
    conceptIds: [C.CONCEPT_SECOND_HAND_LOW],
    skillIds: [C.SKILL_SECOND_HAND_LOW],
    reasonBest:
      "Second hand low: play a small diamond. Do not spend the King on air — make declarer guess, and keep the King to capture an honor later.",
    reasonWrong:
      "Rising with the King lets declarer score both the Ace and Queen; the King wins nothing here.",
    severityIfWrong: "major",
  },
  {
    scenarioId: "cp_third_hand_high",
    title: "Third hand high",
    situation:
      "Your partner (West) leads the ♥5 against 3NT. Dummy plays the ♥3. You are East, third hand, holding ♥K 8 2. Which heart do you play?",
    contract: "3NT",
    trump: "NT",
    declarer: "S",
    learnerSeat: "E",
    role: "defender",
    dummySeat: "N",
    hands: {
      N: "S:AQ4 H:73 D:KQ95 C:J104",
      E: "S:962 H:K82 D:874 C:A653",
    },
    playFromSeat: "E",
    toLead: false,
    leadSuit: "H",
    trickSoFar: [
      { seat: "W", card: "H5" },
      { seat: "N", card: "H3" },
    ],
    legalCards: ["HK", "H8", "H2"],
    bestCards: ["HK"],
    acceptableCards: [],
    targetSkill: C.SKILL_THIRD_HAND_HIGH,
    conceptIds: [C.CONCEPT_THIRD_HAND_HIGH],
    skillIds: [C.SKILL_THIRD_HAND_HIGH],
    reasonBest:
      "Third hand high: play the King. It drives out declarer's Ace and clears the way for partner's long hearts to score.",
    reasonWrong:
      "Playing a low heart lets declarer win cheaply with a card he should never have made — third hand must play high here.",
    severityIfWrong: "major",
  },
  {
    scenarioId: "cp_cover_honor",
    title: "Cover an honor",
    situation:
      "Declarer leads the ♣Q from dummy. You sit just after dummy (East) with ♣K 5 2. Which club do you play?",
    contract: "4S",
    trump: "S",
    declarer: "S",
    learnerSeat: "E",
    role: "defender",
    dummySeat: "N",
    hands: {
      N: "S:J1098 H:A4 D:762 C:QJ4",
      E: "S:63 H:KQ92 D:A1085 C:K52",
    },
    playFromSeat: "E",
    toLead: false,
    leadSuit: "C",
    trickSoFar: [{ seat: "N", card: "CQ" }],
    legalCards: ["CK", "C5", "C2"],
    bestCards: ["CK"],
    acceptableCards: [],
    targetSkill: C.SKILL_COVER_HONOR,
    conceptIds: [C.CONCEPT_COVER_HONOR],
    skillIds: [C.SKILL_COVER_HONOR],
    reasonBest:
      "Cover an honor with an honor: play the King on dummy's Queen. This promotes your side's spot cards (and partner's) into potential winners.",
    reasonWrong:
      "Ducking lets dummy's Queen win, and declarer keeps control of the suit; cover to make your King worth a trick.",
    severityIfWrong: "moderate",
  },
  {
    scenarioId: "cp_holdup_nt",
    title: "Hold up the ace",
    situation:
      "You are declarer in 3NT. West leads the ♠5, dummy plays low, and East plays the ♠Q. You hold ♠A 6 3. Which spade do you play?",
    contract: "3NT",
    trump: "NT",
    declarer: "S",
    learnerSeat: "S",
    role: "declarer",
    dummySeat: "N",
    hands: {
      N: "S:72 H:AQ4 D:KJ96 C:J1043",
      S: "S:A63 H:KJ5 D:AQ7 C:AK5",
    },
    playFromSeat: "S",
    toLead: false,
    leadSuit: "S",
    trickSoFar: [
      { seat: "W", card: "S5" },
      { seat: "N", card: "S2" },
      { seat: "E", card: "SQ" },
    ],
    legalCards: ["SA", "S6", "S3"],
    bestCards: ["S3"],
    acceptableCards: ["S6"],
    targetSkill: C.SKILL_HOLDUP_PLAY,
    conceptIds: [C.CONCEPT_HOLDUP],
    skillIds: [C.SKILL_HOLDUP_PLAY],
    reasonBest:
      "Hold up: duck by playing low. Refusing the first (and likely second) round cuts the defenders' communication so East cannot later reach West's long spades.",
    reasonWrong:
      "Winning the Ace immediately hands the defense their entry — when West regains the lead his spades cash and beat you.",
    severityIfWrong: "major",
  },
  {
    scenarioId: "cp_draw_trumps",
    title: "Draw the trumps",
    situation:
      "You are declarer in 4♠. You won the opening lead in hand, your side suits are solid, and you have no losers to ruff in dummy. It's your lead — which card do you play?",
    contract: "4S",
    trump: "S",
    declarer: "S",
    learnerSeat: "S",
    role: "declarer",
    dummySeat: "N",
    hands: {
      N: "S:642 H:A5 D:KQ6 C:A7532",
      S: "S:AKQ103 H:K42 D:A73 C:K6",
    },
    playFromSeat: "S",
    toLead: true,
    trickSoFar: [],
    legalCards: ["SA", "SK", "SQ", "ST", "S3", "HK", "H4", "H2", "DA", "D7", "D3", "CK", "C6"],
    bestCards: ["SA", "SK", "SQ", "ST", "S3"],
    acceptableCards: [],
    targetSkill: C.SKILL_DRAW_TRUMPS,
    conceptIds: [C.CONCEPT_DRAW_TRUMPS],
    skillIds: [C.SKILL_DRAW_TRUMPS],
    reasonBest:
      "Draw trumps: lead a spade. With no ruffs needed in dummy, pull the defenders' trumps so they cannot ruff your winners.",
    reasonWrong:
      "Cashing side winners first lets a defender ruff in. Trumps have no job in dummy here, so draw them immediately.",
    severityIfWrong: "moderate",
  },
  {
    scenarioId: "cp_ruff_in_dummy",
    title: "Ruff in the short hand",
    situation:
      "You are in 4♥. You led the ♠Q (a loser) from hand and West followed. Dummy is void in spades and holds trumps. It's dummy's turn — which card do you play from dummy?",
    contract: "4H",
    trump: "H",
    declarer: "S",
    learnerSeat: "S",
    role: "declarer",
    dummySeat: "N",
    hands: {
      N: "S:- H:842 D:K7654 C:A932",
      S: "S:QJ5 H:AKQJ9 D:A2 C:K64",
    },
    playFromSeat: "N",
    toLead: false,
    leadSuit: "S",
    trickSoFar: [
      { seat: "S", card: "SQ" },
      { seat: "W", card: "S3" },
    ],
    legalCards: ["H8", "H4", "H2", "DK", "D7", "D6", "D5", "D4", "CA", "C9", "C3", "C2"],
    bestCards: ["H2", "H4"],
    acceptableCards: ["H8"],
    targetSkill: C.SKILL_RUFF_IN_DUMMY,
    conceptIds: [C.CONCEPT_RUFF],
    skillIds: [C.SKILL_RUFF_IN_DUMMY],
    reasonBest:
      "Ruff in the short hand: trump the spade with a low heart from dummy. Ruffing losers in the short trump hand is how you win extra tricks.",
    reasonWrong:
      "Discarding here throws away the ruffing trick that dummy's short trumps were meant to provide.",
    severityIfWrong: "major",
  },
  {
    scenarioId: "cp_lead_vs_nt",
    title: "Opening lead vs notrump",
    situation:
      "The contract is 3NT and it's your opening lead (West). You hold ♦K Q J 7 4 alongside scattered cards. Which card do you lead?",
    contract: "3NT",
    trump: "NT",
    declarer: "S",
    learnerSeat: "W",
    role: "defender",
    dummySeat: "N",
    hands: {
      W: "S:863 H:A72 D:KQJ74 C:95",
    },
    playFromSeat: "W",
    toLead: true,
    trickSoFar: [],
    legalCards: ["S8", "S6", "S3", "HA", "H7", "H2", "DK", "DQ", "DJ", "D7", "D4", "C9", "C5"],
    bestCards: ["DK"],
    acceptableCards: ["D7"],
    targetSkill: C.SKILL_OPENING_LEAD_NT,
    conceptIds: [C.CONCEPT_OPENING_LEAD],
    skillIds: [C.SKILL_OPENING_LEAD_NT],
    reasonBest:
      "Against notrump, lead your long suit and, with the K-Q-J sequence, lead the top honor. It drives out the Ace safely and sets up your diamonds.",
    reasonWrong:
      "Leading a short suit or another suit wastes tempo; against notrump you develop length, and here the diamond sequence is ideal.",
    severityIfWrong: "moderate",
  },
  {
    scenarioId: "cp_lead_vs_suit",
    title: "Don't lead away from an ace",
    situation:
      "The contract is 4♠ and it's your opening lead (West). You hold ♥A 7 3 and ♣Q J 10 5 among your cards. Which card do you lead?",
    contract: "4S",
    trump: "S",
    declarer: "S",
    learnerSeat: "W",
    role: "defender",
    dummySeat: "N",
    hands: {
      W: "S:64 H:A73 D:8652 C:QJ105",
    },
    playFromSeat: "W",
    toLead: true,
    trickSoFar: [],
    legalCards: ["S6", "S4", "HA", "H7", "H3", "D8", "D6", "D5", "D2", "CQ", "CJ", "CT", "C5"],
    bestCards: ["CQ"],
    acceptableCards: [],
    targetSkill: C.SKILL_OPENING_LEAD_SUIT,
    conceptIds: [C.CONCEPT_OPENING_LEAD],
    skillIds: [C.SKILL_OPENING_LEAD_SUIT],
    reasonBest:
      "Lead the top of your Q-J-10 sequence. It is safe and attacking. Avoid leading away from your unsupported Ace of hearts, which can crash under declarer's King.",
    reasonWrong:
      "Leading a low heart risks giving declarer a free trick with a singleton King, and cashing the bare Ace often helps declarer more than you.",
    severityIfWrong: "moderate",
  },
];

const BY_ID = new Map(CARD_PLAY_SCENARIOS.map((s) => [s.scenarioId, s]));

export function getScenario(scenarioId: string): CardPlayScenario | undefined {
  return BY_ID.get(scenarioId);
}

// The FLOOR: the smallest set of items that makes this knowledge base
// PLAYABLE. A player carrying only this chapter can sit down at a table and
// act at every moment of a board — it will act badly, but it will never be
// unable to act, and it will never signal in a code its partner does not
// share.
//
// WHY A FLOOR EXISTS AT ALL: the completeness spec blesses "always pass,
// lowest card" as minimally complete, so one explicit fallback per phase
// (auction, opening lead, card play) satisfies sixteen of the seventeen
// capability categories. The seventeenth — the SIGNAL POLICY — is the one
// category no fallback can ever satisfy: absence is not a policy, so a
// partnership that has not agreed on signals is a partnership whose cards mean
// nothing. Hence five items: three fallbacks, a signal agreement, and — because
// this deck answers "what do I do on a board?" with a checklist rather than a
// rule — slide 86's per-board plan, carried as teaching content.
//
// WHAT IS DIFFERENT FROM THE SAYC FLOOR (sayc chapters/floor.ts): the shape is
// deliberately identical — same three fallback phases, same signal item in the
// Floor set — but the DEFAULTS point at THIS deck's own answers rather than at
// the platform's standard ones:
//   * the opening-lead fallback is FOURTH BEST, not "low from longest". Slide
//     74 is a photographed convention card and fourth best is circled on BOTH
//     halves of it, against suits AND against notrump;
//   * the signal policy is UPSIDE-DOWN COUNT AND ATTITUDE (slide 77, written
//     in red) with ODD/EVEN discards (slide 78) — LOW encourages, HIGH
//     discourages, LOW shows an EVEN count. That is the INVERSE of the
//     platform's standard signal defaults, so it is stated explicitly here
//     rather than inherited by silence.
// The leads-and-carding chapter authors those same two slides in full detail
// (every row of the convention card, the follow-up-card discipline, the
// odd/even worked examples); the items here are the floor-level restatement,
// so a player carrying ONLY the Floor still leads and signals the deck's way.
// The two agree by construction — signal payloads MERGE at compile, so a KB
// carrying both gets one consistent policy, not a fight.
//
// BAND / PRIORITY DISCIPLINE: every item here is the lowest-ranked thing in
// its phase, so any real rule outranks it.
//   * `fallback_rule` compiles into BAND 9 — below conventions (1), below
//     bidding rules, agreements and techniques (2), below everything a fellow
//     will ever author. That is the numerically-highest band in the compiler,
//     which is why these three items carry no per-rule priority numbers to
//     tune: nothing in the KB can lose to them;
//   * the signal item is a POLICY, not a matching rule — it contributes no
//     ordered rule at all, only the codec both defenders read;
//   * the per-board checklist is `judgment_guideline`, which compiles into NO
//     band (teaching content the engine never executes).
// Consequently nothing in this chapter can pre-empt a rule from any other
// chapter, which is exactly what a floor is for.
//
// Everything here is tagged `sets: ["floor"]`, and the Core set Includes the
// Floor, so the fallbacks sit under the whole system rather than beside it.

import { item, toggle, type TemplateItem } from "@bridge/sayc-template/dsl";

export const FLOOR: TemplateItem[] = [
  // -------------------------------------------------------------------------
  // Slide 16, first row of the opening-bid table: "< 6 points → P". The deck
  // opens its own system with the call that needs no agreement, and that is
  // the honest floor under an auction: when nothing applies, PASS.
  // -------------------------------------------------------------------------

  item(
    "flr-auction-pass",
    "Auction fallback: pass",
    "WHEN NO AGREEMENT APPLIES TO THE AUCTION, PASS. The deck's own opening table starts here — the first row of slide 16 is \"fewer than 6 points → P\", with Kxx, xx, Qxxx, xxxx as the example hand — and pass is the one call that is always legal, never conventional, and never a lie about a hand nobody has described. " +
      "This is the floor under every other item in the knowledge base: it guarantees that the player always has a call to make, including in the auctions the deck never covers (its tables stop at the second round, and the slides say plainly of everything outside them — slide 19's \"DON'T USE UNDISCUSSED BIDS!\" and the last row of each rebid table on slides 27-30: \"Undiscussed, DON'T USE THEM!\"). Passing an undiscussed position is the deck's own advice, mechanized. " +
      "It ranks last on purpose: a fallback compiles into the bottom band, so every opening, response, rebid, overcall, double and slam try in this KB is consulted first, and the pass is reached only when none of them speaks to the position.",
    "fallback_rule",
    "auction",
    { kind: "fallback", fallback: { phase: "auction", behavior: "pass" } },
    { sets: ["floor"] },
  ),

  // -------------------------------------------------------------------------
  // Slide 74 — the convention card, with the deck's answers circled in red.
  // LENGTH LEADS = FOURTH BEST, circled on both halves of the card. The
  // platform's own floor is "low from longest"; this deck's is not, so the
  // fallback is authored rather than inherited.
  // -------------------------------------------------------------------------

  item(
    "flr-lead-fourth-best",
    "Opening-lead fallback: fourth best",
    "WHEN NO LEAD AGREEMENT APPLIES, LEAD FOURTH BEST FROM THE LONGEST SUIT. This is the deck's own circled answer on slide 74's convention card — \"length leads: 4th best\" is ticked on BOTH halves of the card, against suit contracts and against notrump alike — so it is the right last resort for this partnership rather than the platform's generic \"low from longest\". " +
      "Fourth best also happens to reproduce most of the card's length column by arithmetic: from x-x-x and from H-x-x the fourth-best card is the lowest one, from x-x-x-x and H-x-x-x it is again the lowest, and from H-x-x-x-x it is the genuine fourth highest — which is what the card asks for in every one of those rows. The two rows it cannot reach are the doubleton (the card says lead the HIGHER from x-x, but a fallback always pulls from the longest suit) and the honour-sequence rows (lead the KING from A-K-x), which is why the leads chapter's convention-card item — top of sequence first, then fourth best — outranks this one whenever it applies. " +
      "Keep this item and that one consistent: this is the floor, not the agreement. A partnership that leads third-and-fifth, or attitude leads, must change BOTH.",
    "fallback_rule",
    "opening_lead",
    { kind: "fallback", fallback: { phase: "opening_lead", behavior: "fourth_best" } },
    { sets: ["floor"] },
  ),

  // -------------------------------------------------------------------------
  // The last-resort card-play rule. The deck never states one — slide 76 in
  // fact warns AGAINST playing mechanically ("don't automatically play the
  // lowest card") — so this item is the legality guarantee beneath the plan of
  // slide 86, and it says so instead of pretending the deck endorses it.
  // -------------------------------------------------------------------------

  item(
    "flr-play-lowest-legal",
    "Card-play fallback: lowest legal card",
    "WHEN NO PLAY TECHNIQUE AND NO CARDING RULE APPLIES, PLAY THE LOWEST LEGAL CARD — following suit when you can, discarding your cheapest useless card when you cannot. " +
      "BE HONEST ABOUT WHAT THIS IS: the deck does not teach it. Its carding slides teach the opposite habit — every card tells a story, and you should not automatically play the lowest one — and its checklist (slide 86) expects you to have counted winners and losers and formed a plan before the first trick. This item is the guarantee UNDER that plan: something legal must hit the table on every trick, including in the positions the deck's techniques (finesses, hold-ups, ruffing losers, establishing a side suit, second/third/fourth-hand rules) do not cover. " +
      "It is deliberately the lowest-ranked play behaviour in the KB, so it never robs a real technique of a trick: every declarer technique and every defensive carding rule is consulted first, and this card is played only when none of them chose one.",
    "fallback_rule",
    "declarer_play",
    { kind: "fallback", fallback: { phase: "card_play", behavior: "lowest_legal" } },
    { sets: ["floor"] },
  ),

  // -------------------------------------------------------------------------
  // Slides 77-78 — THE SIGNAL POLICY. The one completeness category a fallback
  // cannot satisfy, and the one place where this deck's floor differs from the
  // platform's defaults in a way partner MUST know about: upside-down count
  // and attitude, with odd/even discards.
  // -------------------------------------------------------------------------

  item(
    "flr-signals-udca",
    "Signal policy: upside-down count and attitude, odd/even discards",
    "THE FLOOR'S SIGNAL POLICY, AND IT IS UPSIDE DOWN. Slide 77 states the deck's choice in red: UDCA — upside-down count and attitude. " +
      "WHICH SIGNAL TO GIVE: when WE led the suit, give ATTITUDE (do I want this suit continued?). When DECLARER led the suit, give COUNT — if declarer is playing the suit, it is unlikely we want it continued, so the useful information is length. Suit preference is reserved for the positions where neither makes sense. " +
      "HOW TO GIVE IT — inverted, on both halves: on partner's lead a LOW card ENCOURAGES (follow with a high card next round) and a HIGH card DISCOURAGES (follow with a low one); on declarer's lead a LOW card shows an EVEN number of cards (follow high) and a HIGH card shows an ODD number (follow low). Suit preference is not inverted: high asks for the higher suit, low for the lower. " +
      "DISCARDS ARE ODD/EVEN (slide 78): an ODD discard (3, 5, 7, 9) ENCOURAGES the suit discarded; an EVEN card (2, 4, 6, 8, T) discourages it and points at another suit — ignore the suit led and the suit discarded, and a HIGH even card asks for the higher of the two suits left, a LOW even card for the lower. " +
      "WHY THIS IS IN THE FLOOR: a signal policy is the one capability an \"always pass, lowest card\" fallback can never supply, because the absence of an agreement is not an agreement — partner would be reading cards in a code nobody chose. And because this policy is the INVERSE of the platform's standard defaults (where HIGH encourages and high-low shows an even count), anyone reading a card from this partnership must invert first. The engine records the codec (upside-down attitude, reversed count, attitude on the first discard); choosing which card to play in order to SEND a signal is a future engine tier, so the follow-up discipline and the odd/even parity code above are declared agreement rather than executed behaviour.",
    "signal_agreement",
    "defense",
    {
      kind: "signals",
      signals: { attitude: "upside_down", count: "reverse", firstDiscard: "attitude" },
    },
    {
      settings: [
        toggle(
          "g_flr_udca",
          "Upside-down count and attitude (the deck's signal policy)",
          true,
          "Slide 77's choice, in red: LOW encourages, HIGH discourages, LOW shows an EVEN count, and the first discard is attitude (odd/even). Turn off ONLY to replace it with another explicit policy — a partnership with no signal agreement is not a complete partnership. NOTE what this control does and does not do: a signals payload compiles into the KB's signal CODEC, which the compiler merges unconditionally, so `enable` gates do not filter it; this toggle records the partnership's declared choice for humans and for review, and the leads-and-carding chapter states the same policy under `g_lead_udca` — a partnership switching to standard signals must flip BOTH.",
        ),
      ],
      sets: ["floor"],
    },
  ),

  // -------------------------------------------------------------------------
  // Slide 86 — "Checklist to do on every board", fifteen items. This is the
  // deck's PLAY PLAN, and it is prose: there is no predicate in the language
  // for "count dummy's distribution" or "form an initial plan", so it is
  // authored as teaching content with no machine payload rather than faked as
  // a rule. It belongs in the Floor because it is the plan the fallbacks sit
  // beneath — the human half of a minimally complete player.
  // -------------------------------------------------------------------------

  item(
    "flr-board-checklist",
    "The play plan: the checklist to do on every board",
    "THE DECK'S PLAY PLAN IS A CHECKLIST, AND IT IS THE SAME ON EVERY BOARD (slide 86). All fifteen items, in the deck's own order: " +
      "(1) COUNT YOUR CARDS — thirteen, before you look at anything else. " +
      "(2) Count your HCP. " +
      "(3) Count your distribution. " +
      "(4) Count dummy's points. " +
      "(5) Count dummy's distribution. " +
      "(6) Estimate the points remaining in the other two hands. " +
      "(7) Estimate their distribution. " +
      "(8) Note the opening lead. " +
      "(9) Estimate the honours held in the suit led. " +
      "(10) Decide whether the lead was PASSIVE or AGGRESSIVE. " +
      "(11) Count your losers. " +
      "(12) Count your winners. " +
      "(13) Form an initial plan. " +
      "(14) Note what card you will play OVER or UNDER dummy's card. " +
      "(15) After the board, recall the hands and check your estimates against what the hands actually were — this is how the estimating in items 6, 7 and 9 gets better. " +
      "THE TWO PRINCIPLES THE SLIDE ADDS: with no clues at all, divide the missing HCP and the missing distribution EQUALLY between the two unseen hands — a neutral estimate beats no estimate. And start with an estimate, then REFINE it during play as each trick contradicts or confirms it; the plan formed at trick one is a hypothesis, not a commitment. " +
      "This is a discipline, not a rule the engine can execute — there is no predicate in the language for \"count dummy's distribution\" or \"form a plan\" — so it is carried here as the human half of the floor: the fallback items below it guarantee a legal card, and this checklist is what turns legal cards into a plan.",
    "judgment_guideline",
    "declarer_play",
    { kind: "none" },
    {
      settings: [
        toggle(
          "g_flr_board_checklist",
          "Per-board checklist (count, estimate, plan, review)",
          true,
          "Slide 86's fifteen-item checklist, followed on every board. Teaching content: it shapes review and coaching commentary, not card selection.",
        ),
      ],
      sets: ["floor"],
    },
  ),
];

/** Slide(s) each item was authored from — install.ts turns these into citations. */
export const FLOOR_SLIDES: Record<string, number[]> = {
  "flr-auction-pass": [16],
  "flr-lead-fourth-best": [74],
  "flr-play-lowest-legal": [86],
  "flr-signals-udca": [77, 78],
  "flr-board-checklist": [86],
};

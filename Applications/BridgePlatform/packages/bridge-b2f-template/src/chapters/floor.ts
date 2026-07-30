// The FLOOR: the smallest set of items that makes this knowledge base
// PLAYABLE. A player carrying only this chapter can sit down at a table and
// act at every moment of a board — it will act badly, but it will never be
// unable to act, and it will never signal in a code its partner does not
// share.
//
// WHY A FLOOR EXISTS AT ALL: the completeness spec blesses "always pass,
// lowest card" as minimally complete, so one explicit fallback per phase
// (auction, opening lead, card play) satisfies almost every capability
// category. The one it can never satisfy is the SIGNAL POLICY: absence is not
// a policy, so a partnership that has not agreed on signals is a partnership
// whose cards mean nothing. Hence five items: three fallbacks, a signal
// agreement, and — because pages 6-7 answer "what do I do on a board?" with an
// ordered plan rather than a rule — that plan, carried as teaching content.
//
// WHAT IS DIFFERENT FROM THE GIRKAR FLOOR (@bridge/girkar-template
// chapters/floor.ts): the shape is deliberately identical — same three fallback
// phases, same signal item inside the Floor set, same "nothing can lose to
// these" band discipline — but the DEFAULTS point at THESE notes' answers:
//   * SIGNALS ARE STANDARD, NOT UPSIDE-DOWN. Page 28 states HIGH-LOW FROM A
//     DOUBLETON, TOP OF THE SEQUENCE when leading, and FOURTH BEST from length
//     — the HIGH card is the informative one. The Girkar deck plays UPSIDE-DOWN
//     count and attitude, where LOW encourages and LOW shows an even count.
//     Every defensive card in this system therefore means the REVERSE of the
//     same card in that one. This floor states the standard policy explicitly
//     rather than inheriting it by silence, precisely because the sibling KB in
//     the same platform inverts it.
//   * the opening-lead fallback is FOURTH BEST (page 29: "4th best from 4+
//     suit"), which happens to agree with the Girkar floor's style for entirely
//     different reasons — there it was a circled convention card, here it is one
//     row of a four-row list whose other three rows the language cannot reach.
// The leads-and-carding chapter (chapters/carding.ts) authors pages 28-29 in
// full detail — every row of the card list, the fourth-best count follow-up,
// bottom-of-sequence when following, second and third hand. The items here are
// the floor-level restatement, so a player carrying ONLY the Floor still leads
// and signals the notes' way. The two agree by construction: signal payloads
// MERGE at compile (compile.ts `case "signals"` spreads them into one codec),
// so a KB carrying both gets one consistent policy, not a fight.
//
// BAND / PRIORITY DISCIPLINE: every item here is the lowest-ranked thing in its
// phase, so any real rule outranks it.
//   * `fallback_rule` compiles into BAND 9 (compile.ts BAND) — below exceptions
//     (0), conventions (1) and every rule, agreement and technique (2). It is
//     the numerically-highest band in the compiler, which is why these three
//     items carry no per-rule priority numbers to tune: nothing in this KB can
//     lose to them. The decider reaches a fallback only after every in-context
//     rule has been consulted and none matched (decider.ts: "No agreement
//     matched: the pack's auction fallback item, else floor"), and reaches the
//     lead/play fallback only when no lead rule or play technique returned a
//     card;
//   * the signal item is a POLICY, not a matching rule — it contributes no
//     ordered rule at all, only the codec both defenders read;
//   * the play plan is `judgment_guideline`, which compiles into NO band
//     (bandOf returns null — teaching content the engine never executes).
//
// NO DIALS ON THE THREE FALLBACKS, on purpose. A `fallback` payload is pushed
// into the compiled KB WITHOUT setting gates (compile.ts `case "fallback"`), so
// a toggle on one of these items would render in the UI and change nothing. The
// two items here that DO carry settings are the two whose content is a declared
// partnership agreement rather than a compiled fallback.
//
// Everything here is tagged `sets: ["floor"]`, and the Core pack Includes the
// Floor, so the fallbacks sit UNDER the whole system rather than beside it.

import { item, toggle, type TemplateItem } from "@bridge/sayc-template/dsl";

export const FLOOR: TemplateItem[] = [
  // -------------------------------------------------------------------------
  // Page 10 — the two tables that bracket every action in these notes. The
  // opening table is headed "Most common opening Bids (12+ pts)"; the response
  // tables bottom out in a pass row — the 1NT-response list ends with
  // "0-7 pts -> pass", and page 1 states "Pass with < 6 pts" opposite both 1M
  // and 1m. (The rows that go lower than that are SHAPE bids, not point bids:
  // page 10 responds 4M to 1M with 5+ support and 0-9 points, and transfers
  // over 1NT with a five-card major and 0+ points.) Below the bottom row of a
  // table there is one call, and it is the call that needs no agreement.
  // -------------------------------------------------------------------------

  item(
    "flr-auction-pass",
    "Auction fallback: pass",
    "WHEN NO AGREEMENT APPLIES TO THE AUCTION, PASS. The notes bracket themselves this way. Page 10's opening table is headed \"Most common opening Bids (12+ pts)\" and its weakest row is the 6-11 point preempt, so a hand with neither the points nor the shape for any row of that table has no opening bid in this system at all; and page 10's own response list ends with the row \"0-7 pts -> pass\". Page 1 says the same thing twice more, in words — \"Pass with < 6 pts\" opposite both 1M and 1m — and adds the strategic version: keep the bidding open only while there is a chance of a game or a slam, and \"if a game is not possible, pass early\". " +
      "So pass is not merely the legal escape hatch here: it is the notes' own stated action for every hand that falls off the bottom of a table, and it is the one call that is always legal, never conventional, and never a lie about a hand nobody has described. " +
      "THIS IS THE FLOOR UNDER EVERY OTHER ITEM IN THE KNOWLEDGE BASE. It guarantees the player always has a call, including in the auctions these 32 pages never reach — the tables stop at opener's rebid (page 14) and the competitive chapters cover the first round of interference, so fourth-round and deep competitive positions are simply not written down anywhere in the source. " +
      "TWO THINGS TO KNOW ABOUT HOW IT BEHAVES. It ranks LAST: a fallback compiles into the bottom band, so every opening, response, rebid, overcall, double, transfer and slam try in this KB is consulted first, and this pass is reached only when none of them spoke to the position. And it is CORRECTLY SUPPRESSED WHEN PASS IS NOT AVAILABLE: where a `forcing_rules` item declares that partner's call was forcing — the forcing 1NT and the 2/1 game force are the two that matter in this system — the decider removes pass from consideration and makes the cheapest sensible bid instead, so this item never converts a forcing auction into a passout.",
    "fallback_rule",
    "auction",
    { kind: "fallback", fallback: { phase: "auction", behavior: "pass" } },
    { sets: ["floor"] },
  ),

  // -------------------------------------------------------------------------
  // Page 29, "Which card to lead (opening or otherwise)" — a four-row list:
  // top of the sequence or inner sequence / 4th best from a 4+ suit / high-low
  // from a doubleton / low from a three-carder. FOURTH BEST is the row the
  // fallback vocabulary can carry, and it is the row that applies to the suit a
  // fallback lead actually comes from.
  // -------------------------------------------------------------------------

  item(
    "flr-lead-fourth-best",
    "Opening-lead fallback: fourth best from length",
    "WHEN NO LEAD AGREEMENT APPLIES, LEAD FOURTH BEST FROM THE LONGEST SUIT. This is these notes' own length lead, stated twice: page 29's card list reads \"top of the sequence or inner sequence / 4TH BEST FROM 4+ SUIT / high-low from doubleton / low from 3 carder\", and page 28 works it out — \"LEAD 4-HIGHEST CARD FROM A LONG SUIT WITHOUT SEQUENCE ... with KT852, lead the 5\". It is the notes' answer, not the platform's generic \"low from longest\", which is why it is authored here rather than inherited. " +
      "ALL FOUR ROWS OF THE LIST, AND WHAT BECOMES OF EACH, because a floor that quietly drops three of them is a floor nobody can check: " +
      "(1) TOP OF THE SEQUENCE OR INNER SEQUENCE — the notes' FIRST preference, and they condition fourth best on not having one (\"if you do not have a sequence or an inner sequence\"). It is authored as a real lead rule in the leads-and-carding chapter's card-table item, AHEAD of fourth best inside that item's array, and a lead_agreement sits in band 2 while this fallback sits in band 9 — so top of the sequence is always tried first and this item is reached only when it produced nothing. " +
      "(2) FOURTH BEST FROM A 4+ SUIT — this item. " +
      "(3) HIGH-LOW FROM A DOUBLETON and (4) LOW FROM A THREE-CARDER — UNREACHABLE through the fallback path, not omitted. Lead realization always pulls from the player's LONGEST suit, and a 13-card hand always contains a suit of four cards or more, so no doubleton and no three-carder is ever the suit a fallback lead comes from. Those two rows are the partnership's agreement for a suit led LATER in the hand (page 29 says \"opening or otherwise\"), and lead rules govern the OPENING lead only; the carding chapter records them as declared agreement for exactly that reason. " +
      "FOURTH BEST ALSO REPRODUCES ROWS 3 AND 4 BY ARITHMETIC WHEN THE HAND IS FLAT ENOUGH: from a four-card suit the fourth-highest card IS the lowest, so \"fourth best\" and \"low\" coincide, and the notes' K-T-8-5-2 is the one shape where fourth best names a genuinely middle card. " +
      "KEEP THIS ITEM AND THE CARDING CHAPTER'S CARD TABLE CONSISTENT: this is the floor, not the agreement. A partnership that switches to third-and-fifth or to attitude leads must change BOTH.",
    "fallback_rule",
    "opening_lead",
    { kind: "fallback", fallback: { phase: "opening_lead", behavior: "fourth_best" } },
    { sets: ["floor"] },
  ),

  // -------------------------------------------------------------------------
  // The last-resort card-play rule. These notes never state one — pages 6-7
  // teach the opposite habit, that every card should come out of a counted plan
  // — so this item is the legality guarantee UNDER that plan, and it says so
  // instead of pretending the notes endorse it.
  // -------------------------------------------------------------------------

  item(
    "flr-play-lowest-legal",
    "Card-play fallback: lowest legal card",
    "WHEN NO PLAY TECHNIQUE AND NO CARDING RULE APPLIES, PLAY THE LOWEST LEGAL CARD — following suit when you can, discarding your cheapest useless card when you cannot. " +
      "BE HONEST ABOUT WHAT THIS IS: THE NOTES DO NOT TEACH IT. Pages 6-7 open with the opposite instruction — \"count winners or losers before playing a single card\" — and everything after it assumes a formed plan: draw trumps unless you need to cross-ruff, choose the side suit you can ruff or establish, play a suit so as to win tricks with your highest honours. Pages 8-9 then answer eleven specific combinations card by card, and page 30 turns the remaining guesses into probabilities. Nowhere in the 32 pages is there a \"when in doubt, play low\". " +
      "So this item is the guarantee UNDER the plan, not a summary of it: something legal must hit the table on every trick, including in the positions the notes' techniques do not cover (they cover declarer play in depth, second and third hand in one line each, and defensive discarding not at all). " +
      "It is deliberately the lowest-ranked play behaviour in the KB, so it never robs a real technique of a trick: every declarer technique from the play chapter and every carding rule from the leads chapter is consulted first, and this card is played only when none of them chose one. When it does fire, the trace says so — \"no technique applied — fallback: lowest legal card\" — which makes it a coverage signal as much as a behaviour: a board where this fires often is a board the notes' techniques did not reach.",
    "fallback_rule",
    "declarer_play",
    { kind: "fallback", fallback: { phase: "card_play", behavior: "lowest_legal" } },
    { sets: ["floor"] },
  ),

  // -------------------------------------------------------------------------
  // Pages 28-29 — THE SIGNAL POLICY, and the one capability no fallback can
  // supply. These notes are STANDARD, which in this repo is the interesting
  // answer rather than the boring one: the sibling KB is upside-down.
  // -------------------------------------------------------------------------

  item(
    "flr-signals-standard",
    "Signal policy: STANDARD count and attitude (high-low from a doubleton)",
    "THE FLOOR'S SIGNAL POLICY, AND IT IS STANDARD — THE RIGHT WAY UP. Page 28's defence conventions state it and page 29's compact lists repeat it: HIGH-LOW FROM A DOUBLETON when leading or following (with 9-4, play the 9 first), TOP OF THE SEQUENCE OR INNER SEQUENCE when leading (K from K-Q, Q from Q-J, J from J-T-9, J from K-J-T-x-x, T from Q-T-9-x-x), and FOURTH BEST from a long suit without a sequence. In every one of those the HIGH card is the informative one. " +
      "READ AS A CODEC: a HIGH card ENCOURAGES the suit and a low one discourages it; HIGH-LOW shows an EVEN number of cards (the doubleton is the case page 28 works out in full, and it is the same code). Standard attitude, standard count — both of those ARE in the notes. " +
      "ONE THIRD OF THE CODEC IS INFERRED, AND IT IS THE DISCARD. `firstDiscard: \"attitude\"` is NOT stated anywhere in these 32 pages: page 28's four bullets are the doubleton, top of the sequence leading, bottom of the sequence following and fourth best from length, and page 29's lists are which suit to lead, which card to lead, second hand and third hand. Discarding is never discussed. Attitude on the first discard is the standard companion to standard attitude, so it is the reading with the most support — but it is an inference from the rest of the codec and not a row of the notes, and a partnership that wants odd/even or suit-preference discards is contradicting the platform default here, not these notes. " +
      "WHAT PAGE 28 ADDS THAT THE CODEC CANNOT HOLD, recorded here so it is not lost: when FOLLOWING to a suit you play the BOTTOM of a sequence, the exact inverse of leading (the J from Q-J-x, so that if your jack drives out the ace partner can place the queen with you); and the card AFTER a fourth-best lead is your lowest, which lets partner count the suit (led the 5 from K-T-8-5-2, follow with the 2, and partner knows three cards remain). Both are authored in full in the leads-and-carding chapter. " +
      "WARNING FOR ANYONE READING TWO KNOWLEDGE BASES IN THIS PLATFORM: the Girkar teaching deck plays UPSIDE-DOWN COUNT AND ATTITUDE — there a LOW card encourages and a LOW card shows an EVEN count. These notes are the OPPOSITE, so every defensive card means the reverse of the same card in that system. Here the 9 from 9-4 says \"doubleton\"; there the 4 would. Re-orient before reading a single trick. " +
      "WHY A SIGNAL POLICY BELONGS IN THE FLOOR AT ALL: it is the one capability an \"always pass, lowest card\" fallback can never supply, because the ABSENCE of an agreement is not an agreement — partner would be reading cards in a code nobody chose. The engine records the codec (standard attitude, standard count, attitude on the first discard); CHOOSING which card to play in order to SEND a signal is a future engine tier, so the follow-up discipline above is declared agreement rather than executed behaviour.",
    "signal_agreement",
    "defense",
    {
      kind: "signals",
      signals: { attitude: "standard", count: "standard", firstDiscard: "attitude" },
    },
    {
      settings: [
        toggle(
          "b_flr_standard_signals",
          "Standard count and attitude (high encourages, high-low shows a doubleton)",
          true,
          "Pages 28-29's own carding for attitude and count; attitude on the first discard is inferred, since the notes never discuss discards. Turn off ONLY to replace it with another explicit policy — a partnership with no signal agreement is not a complete partnership. NOTE WHAT THIS CONTROL DOES AND DOES NOT DO: a signals payload compiles into the KB's signal CODEC, which the compiler merges unconditionally, so enable gates do not filter it; this toggle records the partnership's declared choice for humans and for review. The leads-and-carding chapter states the same policy under `b_card_standard_signals`, so a partnership switching to upside-down count and attitude must flip BOTH.",
        ),
      ],
      sets: ["floor"],
    },
  ),

  // -------------------------------------------------------------------------
  // Pages 6-7 — "Declarer Play (general guidelines)", four numbered steps. This
  // is the notes' PLAY PLAN, and as a plan it is prose: there is no predicate
  // in the language for "count your losers" or "decide which side suit to
  // attack", so it is authored as teaching content with no machine payload
  // rather than faked as a rule. It belongs in the Floor because it is the plan
  // the fallbacks sit beneath — the human half of a minimally complete player.
  // The play chapter authors each step in full detail (and each combination on
  // pages 8-9); this is the ordered spine, so a Floor-only player still knows
  // what order to think in.
  // -------------------------------------------------------------------------

  item(
    "flr-play-plan",
    "The play plan: count, then trumps, then which suit, then how",
    "THE NOTES' PLAY PLAN IS FOUR STEPS IN A FIXED ORDER (pages 6-7, \"Declarer Play — general guidelines\"), and the order is the content: each step is only answerable once the one before it is done. " +
      "(1) COUNT WINNERS OR LOSERS BEFORE PLAYING A SINGLE CARD. Which one depends on the contract: in NOTRUMP count WINNERS — cash them if you have enough and the opponents are about to cash theirs, and establish extra ones first only while they have not yet established theirs. In a SUIT contract count LOSERS as well as winners, then plan to get rid of the losers by FINESSING, RUFFING, or DISCARDING them on a side suit. " +
      "(2) TAKE OUT TRUMPS — unless you need to cross-ruff, need to ruff, or cannot afford to delay some other suit. The three exceptions are the whole of the judgment: a CROSS-RUFF ruffs losers in both hands to maximise trump tricks (you may end up short in trumps and be over-ruffed, and you may prefer to play a couple of rounds of trumps first); ruffing in the LONGER trump hand usually gains nothing; and do NOT delay a suit that can discard your losers — the notes' own example is to win the club lead with the ace to keep the spade entry, then play a HEART at trick two rather than touching trumps, because drawing trumps lets them knock out the diamond ace before the hearts are set up. Also do not draw trumps if you will be left with none while side suits still need establishing. " +
      "(3) WHICH SIDE SUIT? A suit you want to RUFF (sometimes a race against their drawing your short hand's trumps — and if you cannot win that race, fall back on another plan: A-x-x opposite x-x-x is one trick however you play it, A-x-x opposite x-x may be a third-round ruff); a suit where you can ESTABLISH extra tricks (A-K-x-x-x opposite x-x-x loses one and then runs; with x-x opposite you may ruff the third round instead); or a suit to ELIMINATE from both hands so that a ruff-and-discard becomes available or the opponents are forced to open the other suit. " +
      "(4) HOW TO PLAY A SUIT? Do not sweat over tricks lost to missing top honours — if both the ace and king are missing you are losing two, and J-x-x opposite x-x-x loses three, so plan to discard those losers elsewhere instead of agonising. Try to win tricks WITH your highest honours: lead low toward K-x hoping the ace is in front of it, twice toward Q-x-x hoping both the ace and king are. And FINESSE to avoid losing to missing high cards, which needs the surrounding cards or the length to drop them: A-Q opposite x-x finesses the king, while A-J can at most capture one honour; A-J-x opposite x-x-x makes two tricks 25% of the time, A-J-T opposite x-x-x makes two 75% of the time. The whole of pages 8-9 is this step, one combination at a time. " +
      "THIS IS A DISCIPLINE, NOT A RULE THE ENGINE CAN EXECUTE. There is no predicate in the language for \"count your losers\", \"decide which side suit to attack\" or \"win that race\" — the executable pieces of steps 2, 3 and 4 are authored as real play rules in the declarer-play chapter (draw trumps, ruff a loser, discard a loser on a winner, establish a long suit, finesse toward a tenace, cash out when the winners suffice). What lives here is the ORDER, which is the part the notes are most insistent about and the part no individual play rule can carry: the fallback items above guarantee a legal card, and this plan is what turns legal cards into a contract.",
    "judgment_guideline",
    "declarer_play",
    { kind: "none" },
    {
      settings: [
        toggle(
          "b_flr_play_plan",
          "The four-step play plan (count, trumps, which suit, how)",
          true,
          "Pages 6-7's ordered guidelines, followed on every board. Teaching content: it shapes review and coaching commentary, not card selection — the engine cannot be made to skip counting, and the declarer-play chapter carries the executable half under its own `b_play_*` dials.",
        ),
      ],
      sets: ["floor"],
    },
  ),
];

/** Page(s) each item was authored from — install.ts turns these into citations. */
export const FLOOR_PAGES: Record<string, number[]> = {
  "flr-auction-pass": [10],
  "flr-lead-fourth-best": [29],
  "flr-play-lowest-legal": [6],
  "flr-signals-standard": [28, 29],
  // Pages 6-7 are one transcribed block: the notes' numbered items 1-2 (count;
  // trumps) are on page 6 and items 3-4 (which side suit; how to play a suit)
  // on page 7 — the split the declarer-play chapter cites row by row. This item
  // carries all four steps, so it cites both.
  "flr-play-plan": [6, 7],
};

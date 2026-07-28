// Defence conventions, opening leads and second/third-hand play — pages 28-29
// of the "Bridge 2 Fun Training" notes.
//
// THE ONE THING A REVIEWER MUST READ FIRST: THESE SIGNALS ARE STANDARD, NOT
// UPSIDE-DOWN. This document plays HIGH-LOW from a doubleton, TOP of a
// sequence when leading, and FOURTH BEST from length — i.e. a HIGH card is the
// informative one. The sibling knowledge base in this repo
// (@bridge/girkar-template, chapters/leadsCarding.ts) plays UPSIDE-DOWN count
// and attitude, where LOW encourages and LOW shows an even count. The two
// systems read every defensive card in OPPOSITE directions, so anyone moving
// between the two KBs who forgets to re-orient will misread the whole hand.
// That warning is repeated inside the signal item's own text, not just here,
// because the comment never reaches a player.
//
// WHAT IS EXECUTABLE AND WHAT IS NOT (the language, not a judgment call):
//   * LEADS. `LeadSpec` says only versus (suit/notrump/any) + one of five
//     styles, and lead realization always pulls from the player's LONGEST
//     suit. So the notes' card table is authored as real `lead_rules` for the
//     two rows that vocabulary reaches — TOP OF THE SEQUENCE OR INNER SEQUENCE
//     and FOURTH BEST — while "high-low from a doubleton" and "low from a
//     three-carder" are recorded agreement: in a 13-card hand the longest suit
//     always has four or more cards, so neither row is reachable through the
//     opening-lead path at all. WHICH SUIT to lead (page 29's first list) has
//     no vocabulary whatsoever — LeadSpec cannot name a suit — so all three
//     rows are judgment_guideline teaching items.
//   * ONE lead item, deliberately. Compiled lead rules are ordered by their
//     INDEX inside a single item's `leads` array (compile.ts `case
//     "lead_rules"`), and the decider takes the FIRST rule that returns a
//     card. Splitting the table across two items would make sequence-vs-length
//     precedence a tie rather than a decision, so the whole table lives in one
//     item, sequence first — which is the notes' own precedence ("lead the
//     4-highest card IF you do not have a sequence or an inner sequence").
//   * PLAY. Second and third hand ARE executable (`cover_honor`,
//     `second_hand_low`, `third_hand_high`), and keep the sayc/girkar numbering
//     so the three templates behave comparably: cover 45, third hand 50,
//     second hand 52.
//   * SIGNALS. One `signals` payload carries the standard policy. Signal
//     payloads MERGE at compile, so this item and the floor chapter's
//     floor-level restatement produce one consistent codec rather than a fight.
//
// SETS AND TOGGLES. The notes' own always-on carding is "core": the card table
// (natural, and the thing that satisfies the lead policy) carries NO enable
// toggle, exactly as in the reviewed girkar chapter — gating it could leave a
// player with no lead agreement at all. Toggles go on the five partnership
// MEANINGS a partner must share to read the cards (the standard signal policy,
// the doubleton high-low, low from a three-carder, the
// bottom-of-sequence-when-following convention and the fourth-best count
// follow-up), so a partnership that has agreed something else is one dial away
// rather than silently mis-carding.
//
// NO CONTRADICTION LANDS HERE. The three internal contradictions listed in the
// transcription header (minor-suit transfer, opener's ranges, the 1NT overcall
// range) are all bidding, on other pages. Pages 28-29 do not disagree with each
// other: page 29's compact lists restate page 28's rules, and where they add
// detail (third hand's "lowest of the highest sequence", "Q and J are
// equivalent") it agrees with page 28's "bottom of sequence when following".
// Items authored from both pages cite both.

import { item, play, toggle, type TemplateItem } from "@bridge/sayc-template/dsl";

/** Judgment the language cannot execute — teaching content, honestly labelled. */
const guideline = (
  key: string,
  title: string,
  text: string,
  phase: "opening_lead" | "defense",
): TemplateItem => item(key, title, text, "judgment_guideline", phase, { kind: "none" });

export const CARDING: TemplateItem[] = [
  // -------------------------------------------------------------------------
  // Page 28 heading — "Defense Conventions". The signal policy first, because
  // every other item on these two pages is read through it.
  // -------------------------------------------------------------------------

  item(
    "card-signals-standard",
    "Signals are STANDARD (not upside-down)",
    "THIS PARTNERSHIP PLAYS STANDARD SIGNALS. A HIGH card is the informative one: HIGH-LOW from a doubleton (with 9-4, the 9 first), TOP of a sequence or inner sequence when leading, FOURTH BEST from length. Read as a codec: high-low shows an EVEN number of cards (a doubleton being the case the notes work out in full), a high card ENCOURAGES the suit, and the first discard is attitude. " +
      "WARNING FOR ANYONE READING TWO KNOWLEDGE BASES: the sibling knowledge base in this platform (the Girkar teaching deck) plays UPSIDE-DOWN COUNT AND ATTITUDE — there LOW encourages and LOW shows an even count. These notes are the OPPOSITE. Every defensive card in this system means the reverse of the same card in that one, so a reviewer switching between the two must re-orient before reading a single trick: here the 9 from 9-4 says \"doubleton\", there the 4 would. " +
      "The engine records the policy (standard attitude, standard count, attitude on the first discard); choosing which card to play in order to SIGNAL is a future engine tier, so the follow-up discipline the notes describe (leading high then low to complete the picture) is declared agreement rather than executed behaviour.",
    "signal_agreement",
    "defense",
    {
      kind: "signals",
      signals: { attitude: "standard", count: "standard", firstDiscard: "attitude" },
    },
    {
      settings: [
        toggle(
          "b_card_standard_signals",
          "Standard signals (high-low from a doubleton, high encourages)",
          true,
          "The notes' own carding, pages 28-29. Turn OFF if this partnership has agreed upside-down count and attitude instead (the sibling Girkar knowledge base plays UDCA) — leaving it on while partner plays UDCA inverts the meaning of every defensive card.",
        ),
      ],
      // Not "floor": the floor chapter carries the floor-level restatement of
      // the signal policy, and signal payloads merge at compile. This is the
      // detailed page-28/29 statement of the same policy.
      sets: ["core"],
    },
  ),

  // -------------------------------------------------------------------------
  // Page 28, first bullet — HIGH-LOW FROM A DOUBLETON, "when leading or
  // following". The rule, then each of the notes' two worked reasons as its
  // own item, because they are two different defensive decisions.
  // -------------------------------------------------------------------------

  item(
    "card-high-low-doubleton",
    "High-low from a doubleton, leading or following",
    "HIGH-LOW FROM A DOUBLETON, WHEN LEADING OR FOLLOWING: with 9-4 play the 9 first and the 4 next. The point is not the trick, it is that partner can then PLAN THE DEFENCE — most often, give you a RUFF on the third round, because your high-then-low says the suit is breaking 2 in your hand. " +
      "This is the standard direction, not the upside-down one (see the signal item): the HIGH card carries the message. " +
      "NOT EXECUTABLE, and honestly so. Two separate limits: there is no play behaviour in the language for \"play the card that signals\" (partner-facing signalling is a future engine tier), and on the opening lead the engine always pulls from the LONGEST suit — in a 13-card hand that is always four cards or more, so the doubleton LEAD is unreachable through the lead path even in principle. The agreement is recorded here so the partnership shares it and so a coach can teach from it.",
    "agreement",
    "defense",
    { kind: "none" },
    {
      settings: [
        toggle(
          "b_card_high_low_doubleton",
          "High-low from a doubleton",
          true,
          "Play the higher card first from a two-card holding, leading or following. Off if the partnership shows a doubleton low-high (upside-down count).",
        ),
      ],
      sets: ["core"],
    },
  ),

  guideline(
    "card-doubleton-ruff-read",
    "Reading the doubleton: A-Q-x-x-x over dummy's K-x-x",
    "THE NOTES' FIRST WORKED REASON for the doubleton signal. Dummy holds K-x-x in the suit partner led and you hold A-Q-x-x-x behind it. You have a decision to make on trick one that you cannot unmake: take the A-Q and give partner a RUFF, or leave the position alone. What decides it is whether partner has a doubleton — and the LEAD OF A HIGH CARD is what tells you so. So partner's high card is not an accident of holding: it is the piece of information that makes your A-Q-and-ruff line safe to take. " +
      "Judgment, not a rule: the language has no way to say \"my partner's card was high FOR partner's holding\", and this defence needs the count of the suit round by round.",
    "defense",
  ),

  guideline(
    "card-duck-awaiting-doubleton-signal",
    "Ducking with A-x-x-x-x and no side entry, waiting for partner's low card",
    "THE NOTES' SECOND WORKED REASON, and it is a duck. Partner leads a card that LOOKS HIGH, you hold A-x-x-x-x and NO SIDE ENTRY. Do NOT take the first trick with the ace: if you cash it now, the suit is dead and you have no way back in. Instead duck, and hope partner can win a TRUMP trick and lead a LOWER card in the suit — that low card completes the high-low and confirms the doubleton. NOW take the ace and give partner the ruff. " +
      "WHY THIS IS NOT AUTHORED AS A PLAY RULE: the closest platform behaviour, `hold_up_ace`, is a NOTRUMP hold-up — it self-gates to contracts with no trump suit, on declarer's led suit, in the first two rounds. The notes' example is a TRUMP contract (partner is expected to win a trump trick), so the behaviour would never fire in the position described and would instead fire in positions the notes never discussed. Authoring it here would be a wrong rule wearing a right label, so the technique is carried as teaching content.",
    "defense",
  ),

  // -------------------------------------------------------------------------
  // Pages 28 and 29 — WHICH CARD TO LEAD. One item, ordered: sequence first
  // (the notes condition fourth best on NOT having a sequence), fourth best
  // behind it.
  // -------------------------------------------------------------------------

  item(
    "card-lead-card-table",
    "Which card to lead: top of the sequence, else fourth best",
    "THE NOTES' CARD TABLE IN FULL (page 28's bullets, restated as a list on page 29). " +
      "TOP OF THE SEQUENCE OR INNER SEQUENCE WHEN LEADING: the KING from K-Q, the QUEEN from Q-J, the JACK from J-T-9; and from an INNER sequence the same principle applied to the touching cards below the top honour — the JACK from K-J-T-x-x, the TEN from Q-T-9-x-x. " +
      "FOURTH-HIGHEST FROM A LONG SUIT WITHOUT A SEQUENCE, page 29 giving the length as \"4th best from a 4+ SUIT\": with K-T-8-5-2 lead the FIVE. The notes single this out as \"a very useful lead against NT\", but state it as the length lead generally, so it is authored for both suits and notrump. " +
      "HIGH-LOW FROM A DOUBLETON and LOW FROM A THREE-CARDER complete page 29's list; each is authored as its own agreement item (see \"High-low from a doubleton\" and \"Low from a three-carder\"). " +
      "WHAT THE ENGINE ACTUALLY DOES, precisely, so nobody is surprised by a trace: the two rules above are tried in order and the first one that produces a card is played. Top-of-sequence finds the highest card that heads a two-card touching sequence at the ten or above, so every sequence example on page 28 comes out exactly right — K from K-Q, Q from Q-J, J from J-T-9, J from K-J-T-x-x, T from Q-T-9-x-x. What it does NOT do is DECLINE: with no touching honour in the long suit it falls back to the LOWEST card rather than passing the hand to the fourth-best rule, so the notes' own K-T-8-5-2 example comes out as the TWO where the notes say the FIVE. Be precise about what that costs the second rule: both styles read the SAME suit (realization always takes the longest one) and top-of-sequence always returns some card, so the fourth-best entry behind it never actually fires — it is the recorded length half of the agreement, kept in the payload and in this order so the partnership's precedence is on the record, not a second attempt at the hand. The order is not arbitrary — reversing it would fix K-T-8-5-2 and break every sequence lead, and the notes explicitly rank the sequence first. " +
      "TWO ROWS ARE UNREACHABLE, not omitted: lead realization always pulls from the LONGEST suit, and a 13-card hand always has a suit of four or more, so \"high-low from a doubleton\" and \"low from a three-carder\" can never be reached on the opening lead. They are the partnership's agreement for a suit led LATER in the hand — and lead rules apply only to the OPENING lead, so \"which card to lead (opening or otherwise)\", as page 29 puts it, is executable only for the opening one.",
    "lead_agreement",
    "opening_lead",
    {
      kind: "lead_rules",
      leads: [
        // Sequence and inner sequence first: the notes make fourth best the
        // rule for when you do NOT have one.
        { versus: "any", style: "top_of_sequence" },
        // The notes' length lead: fourth best, against suits and notrump.
        { versus: "any", style: "fourth_best" },
      ],
    },
    // NO enable toggle: this is the notes' own always-on lead policy (natural,
    // not a named gadget), and it is what satisfies the lead-policy capability.
    { sets: ["core"] },
  ),

  item(
    "card-fourth-best-count-followup",
    "The fourth-best follow-up: the next card gives the count",
    "THE SECOND HALF OF THE FOURTH-BEST AGREEMENT, which the notes state as a worked follow-up and which is easy to lose. Having led the FIVE from K-T-8-5-2, in the next round of that suit you play the TWO — and partner then knows you have THREE MORE CARDS in the suit. The lead named the fourth-highest card; the low card behind it says \"there was nothing under it but this\", and the count of the suit falls out. " +
      "This is why fourth best earns its place against notrump: it is not a safer card than any other, it is a card that MEASURES the suit, and the measurement is what lets partner decide whether the suit can be run. " +
      "Declared agreement, not a rule: the language records the LEAD style, and card-by-card signalling on later rounds is a future engine tier.",
    "agreement",
    "defense",
    { kind: "none" },
    {
      settings: [
        toggle(
          "b_card_fourth_best_count",
          "Fourth-best leads, then the low card for count",
          true,
          "The lead is the fourth-highest card and the next card in the suit is the lowest, so partner can count the suit. Off if the partnership leads third/fifth best.",
        ),
      ],
      sets: ["core"],
    },
  ),

  item(
    "card-low-from-three-carder",
    "Low from a three-carder",
    "PAGE 29'S FOURTH ROW in the \"which card to lead (opening or otherwise)\" list: from a THREE-CARD holding, lead the LOW card. Page 28's bullets cover the doubleton, the sequences and the fourth-best length lead; this row appears only in page 29's compact list, and it is what completes the length ladder — the HIGH card from two, the LOW card from three, the FOURTH-HIGHEST from four or more. " +
      "It is consistent with the standard direction of this system rather than an exception to it: from three cards there is no high-low picture to paint and no fourth card to measure, so the low card is the one that promises the least and costs the least. " +
      "NOT EXECUTABLE, for the same two reasons as the doubleton row: lead realization always pulls from the LONGEST suit and a 13-card hand always holds four cards or more somewhere, so a three-card lead is unreachable through the opening-lead path; and lead rules fire only on the OPENING lead, so the later-round case the notes intend by \"or otherwise\" has no surface at all. Recorded as partnership agreement so it is shared and teachable rather than lost.",
    "agreement",
    "opening_lead",
    { kind: "none" },
    {
      settings: [
        toggle(
          "b_card_low_from_three",
          "Low from a three-card holding",
          true,
          "Leading a three-card suit, lead the lowest card (page 29's list). Off if the partnership leads top of nothing or the middle card from three.",
        ),
      ],
      sets: ["core"],
    },
  ),

  // -------------------------------------------------------------------------
  // Page 28, third bullet + page 29's third-hand refinement — BOTTOM of the
  // sequence when FOLLOWING. The exact inverse of leading, and the notes give
  // the inference chain that justifies it.
  // -------------------------------------------------------------------------

  item(
    "card-following-bottom-of-sequence",
    "Bottom of the sequence when following (J from Q-J-x)",
    "BOTTOM OF SEQUENCE WHEN FOLLOWING — the exact INVERSE of leading, where you play the top. From Q-J-x, following, play the JACK. " +
      "THE NOTES' REASONING, which is the whole value of the convention: partner leads a low card from K-x-x-x-x. Your JACK drives out the ACE. Partner can now place the QUEEN in your hand with certainty — because if you had held the jack WITHOUT the queen, the opponent would have won the trick with the queen instead of spending the ace. So the card that lost the trick told partner where the missing honour is, and NEXT time partner can confidently lead a low card up to your queen. " +
      "Page 29 states the same rule for third hand and adds the generalisation: play the LOWEST OF THE HIGHEST SEQUENCE, e.g. the JACK from Q-J-x-x, because \"Q and J are equivalent here\" — spending the higher of two touching honours wastes a card that was going to take the same trick. " +
      "NOT EXECUTABLE, and deliberately not faked: no play behaviour expresses \"the lowest of touching honours\". The nearest, `win_cheaply`, gets Q-J-x right by accident but would play the JACK from K-J-x and the SEVEN from 9-7-3 — under-playing in exactly the seats where page 29 says play HIGH — so it would shadow the third-hand-high rule that IS the notes' headline. Recorded as agreement instead.",
    "agreement",
    "defense",
    { kind: "none" },
    {
      settings: [
        toggle(
          "b_card_bottom_of_sequence_following",
          "Bottom of the sequence when following (J from QJx)",
          true,
          "Following, play the lowest of touching honours — the inverse of leading. Off if the partnership plays the top of the sequence in both directions.",
        ),
      ],
      sets: ["core"],
    },
  ),

  // -------------------------------------------------------------------------
  // Page 29, first list — WHICH SUIT to lead. Three rows, three items; none
  // has any executable surface, since LeadSpec cannot name a suit.
  // -------------------------------------------------------------------------

  guideline(
    "card-lead-partners-suit",
    "Lead partner's suit",
    "FIRST CHOICE ON THE NOTES' LIST: lead PARTNER'S SUIT. Partner has already spent a bid describing a holding, which is information you have and declarer's side does not get to choose; leading it puts the defence's tricks where the partnership has agreed they are, and it never needs a signal to be understood. " +
      "No executable surface: the lead language chooses a CARD from the hand's longest suit and cannot be told to attack a named suit, so suit selection is teaching content in this system.",
    "opening_lead",
  ),

  guideline(
    "card-lead-short-suit-vs-trump",
    "Lead a singleton or a doubleton against a trump contract",
    "SECOND CHOICE ON THE NOTES' LIST, and it is specific to TRUMP contracts: lead a SINGLETON OR A DOUBLETON. Your own shortness is a trick source — get the suit played while you still hold trumps and an entry and the third round becomes a RUFF. The same lead against notrump has no such point, which is why the notes attach the condition. Read it together with the doubleton signal: high-low is how partner learns the shortness is real. " +
      "No executable surface — and doubly so: lead realization always pulls from the LONGEST suit, so the engine cannot make a short-suit lead at all.",
    "opening_lead",
  ),

  guideline(
    "card-lead-safe-suit",
    "Lead a suit not likely to cost an extra trick",
    "THIRD CHOICE ON THE NOTES' LIST: lead a suit that is NOT LIKELY TO COST AN EXTRA TRICK. This is the passive lead, and it is the tie-breaker rather than an attack — when nothing about the auction points at a suit, the cheapest defence is the one that does not hand declarer a trick the play would not otherwise produce (leading away from an unsupported honour into declarer's tenace being the usual way to do exactly that). " +
      "Judgment: the notes give the principle and no table, and the language has no cost-of-lead predicate to evaluate it with.",
    "opening_lead",
  ),

  // -------------------------------------------------------------------------
  // Page 29 — SECOND HAND and THIRD HAND. These ARE executable, and carry the
  // sayc/girkar priority numbers so the templates behave comparably. Only the
  // lowest-numbered matching rule in a seat plays a card, but the behaviours
  // self-gate (cover_honor returns nothing with no honour to cover), so the
  // low/high rule behind the cover rule is a live default, not dead code.
  // -------------------------------------------------------------------------

  item(
    "card-second-hand",
    "Second hand: cover the card played, otherwise play low",
    "THE NOTES GIVE SECOND HAND TWO RULES, in this order: USUALLY COVER THE CARD PLAYED, and USUALLY PLAY LOW unless you must grab the trick. They are not in conflict — the second is what you do when there is nothing to cover — and that is exactly how they are compiled: the cover rule is consulted first (priority 45) and the low rule sits behind it (52) as the default for every other trick. Playing low in second seat is right because your partner, sitting fourth behind both opponents, still gets to decide the trick; spending an honour in second seat spends it before you know whether it was needed. " +
      "In second seat the leader is always an opponent, so covering here can never overtake your own partner's card. " +
      "ONE CLAUSE IS NOT EXECUTABLE: \"unless you must grab the trick\" is a judgment about the state of the DEFENCE (this is the setting trick, or the suit will never be led again), and the language has no predicate for it. The cover rule covers the honour case, which is the common one.",
    "defensive_technique",
    "defense",
    {
      kind: "play_rules",
      rules: [
        play("cover_honor", 45, { position: "second", side: "defense" }),
        play("second_hand_low", 52, { position: "second" }),
      ],
    },
    // No enable toggle: a fundamental of card play, not a named convention.
    { sets: ["core"] },
  ),

  item(
    "card-third-hand",
    "Third hand: cover, and play high",
    "THE NOTES GIVE THIRD HAND: USUALLY COVER THE CARD PLAYED and USUALLY PLAY HIGH. Playing high in third seat is what stops fourth hand from winning the trick cheaply — it forces declarer to spend a real honour to beat you — and in this seat covering and playing high are the same act, since the high card you contribute IS the cover of the honour dummy played. That is what is compiled here: third hand high (priority 50), which also plays LOW when partner's led card is already winning the trick, so the rule does not throw a card away on a trick the partnership has already won. " +
      "WHY THE PLATFORM'S `cover_honor` BEHAVIOUR IS NOT USED IN THIS SEAT, deliberately: it covers whatever card is currently WINNING the trick without asking whose card it is. In third seat the winning card is frequently PARTNER'S LEAD — partner leads the king, dummy plays low — and the rule would then beat partner's king with your ace, a defensive error the notes never sanction. Third-hand-high already declines that position, so the cover rule is left to second seat where the leader is always an opponent. " +
      "THE REFINEMENT PAGE 29 ADDS is authored separately (see \"Bottom of the sequence when following\"): play the LOWEST OF THE HIGHEST SEQUENCE, the jack from Q-J-x-x, since Q and J are equivalent there. It has no vocabulary and would, if forced through `win_cheaply`, under-play exactly where this rule says play high — so it stays declared agreement beside this rule rather than replacing it.",
    "defensive_technique",
    "defense",
    {
      kind: "play_rules",
      rules: [play("third_hand_high", 50, { position: "third" })],
    },
    // No enable toggle: a fundamental of card play, not a named convention.
    { sets: ["core"] },
  ),
];

/** Page(s) each item was authored from — install.ts turns these into citations. */
export const CARDING_PAGES: Record<string, number[]> = {
  "card-signals-standard": [28, 29],
  "card-high-low-doubleton": [28, 29],
  "card-doubleton-ruff-read": [28],
  "card-duck-awaiting-doubleton-signal": [28],
  "card-lead-card-table": [28, 29],
  "card-fourth-best-count-followup": [28],
  "card-low-from-three-carder": [29],
  "card-following-bottom-of-sequence": [28, 29],
  "card-lead-partners-suit": [29],
  "card-lead-short-suit-vs-trump": [29],
  "card-lead-safe-suit": [29],
  "card-second-hand": [29],
  "card-third-hand": [29],
};

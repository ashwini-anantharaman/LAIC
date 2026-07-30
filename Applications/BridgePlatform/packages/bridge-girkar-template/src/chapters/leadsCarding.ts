// Opening leads and carding, slides 73–78 of the teaching deck.
//
// WHY THIS CHAPTER LOOKS THE WAY IT DOES: slide 74 is a photographed
// CONVENTION CARD with the deck's own answers circled in red, and slides 76–77
// are the deck's carding choices written in red capitals. Two of those choices
// are NOT the platform's defaults, so they are authored explicitly rather than
// inherited:
//   * length leads are FOURTH BEST — circled on both halves of the card (vs
//     suits AND vs notrump), not "third/fifth" and not attitude leads;
//   * signals are UPSIDE-DOWN count and attitude (UDCA) — LOW encourages, HIGH
//     discourages, LOW shows an EVEN count. That is the inverse of the
//     platform's standard signal item, so the signal policy here carries its
//     own toggle and says so in as many words.
//
// BAND / ORDER DISCIPLINE (matching sayc chapters/leadsSignalsPlay.ts):
//   * compiled lead rules are ordered by their INDEX inside one item's `leads`
//     array (see compile.ts `case "lead_rules"`), so the whole slide-74 card
//     lives in ONE item — that is the only way its internal priority (honor
//     sequences before length leads) is deterministic rather than a tie
//     between two items;
//   * play rules keep the sayc numbering so the two templates behave
//     comparably: third hand 50, second hand 52, fourth hand 60. Only the
//     LOWEST-numbered matching rule in a seat ever plays a card, so each seat
//     carries exactly one behavior — a second rule behind it would be dead;
//   * the deck's own always-on carding (the slide-74 lead card, second/third/
//     fourth hand) carries NO enable toggle: it is natural, and it is what
//     satisfies lead.policy and the second/third-hand capabilities. Toggles are
//     for the named alternatives the deck lists but does not adopt;
//   * everything the deck states as prose or as a partnership MEANING (what an
//     honor lead promises, which suit to attack, the odd/even discard code)
//     has no executable surface in the language, so it is authored as
//     judgment_guideline / agreement teaching items with `{ kind: "none" }`
//     rather than faked as rules.
//
// The deck's own carding (fourth best, standard honor meanings, UDCA,
// odd/even) is "core"; the ALTERNATIVES it lists but does not adopt (Rusinov,
// "Jack denies", Lavinthal/McKenney) are "conventions" and default OFF.

import { item, play, toggle, type TemplateItem } from "@bridge/sayc-template/dsl";

/** Judgment the language cannot execute — teaching content, honestly labelled. */
const guideline = (
  key: string,
  title: string,
  text: string,
  phase: "opening_lead" | "defense",
): TemplateItem => item(key, title, text, "judgment_guideline", phase, { kind: "none" });

export const LEADS_CARDING: TemplateItem[] = [
  // -------------------------------------------------------------------------
  // Slide 73 — WHICH SUIT to lead. Pure suit selection: the lead language
  // (LeadSpec) says only which CARD to pull from the long suit, so every row
  // of this slide is teaching content.
  // -------------------------------------------------------------------------

  guideline(
    "lead-suit-partners-suit",
    "Lead partner's suit",
    "Lead partner's suit when partner has told you about one: partner OVERCALLED, partner OPENED IN THIRD SEAT, or partner DOUBLED an artificial bid. The corollary is as important as the rule — do NOT lead partner's suit when partner has not overcalled or doubled, because nothing has been shown yet. Against notrump there is one extra case: when you are weak and hold no entries, lead partner's suit (a guess if partner has not bid) — your own suit will never be reached.",
    "opening_lead",
  ),

  guideline(
    "lead-suit-vs-notrump-long-strong",
    "Against notrump: longest and strongest",
    "Against notrump you must DEVELOP tricks, so lead from your strongest AND longest suit. Strength decides between two suits of the same length: prefer K-Q-J-9 to T-7-4-3-2. If the auction explored no majors, lead a major — the unexplored suit is where their weakness is.",
    "opening_lead",
  ),

  guideline(
    "lead-suit-vs-notrump-short-strong",
    "Against notrump: a strong short suit when they have a long minor",
    "Against notrump, lead a strong suit EVEN IF IT IS SHORT when the opponents have shown a long minor. Their long minor means they will run tricks before you can establish a five-card suit, so speed beats length: attack where your honors are.",
    "opening_lead",
  ),

  guideline(
    "lead-suit-strong-sequence",
    "Lead from a strong sequence or near-sequence",
    "Lead from a strong sequence or near-sequence: A-K-Q, K-Q-J, K-Q-T. These are the safest attacking leads — they cost nothing and drive out a stopper while you keep the tempo. (The CARD to lead from each holding is the slide-74 convention card; that item makes the sequence lead executable via top-of-sequence.)",
    "opening_lead",
  ),

  guideline(
    "lead-suit-unbid",
    "Lead an unbid suit",
    "Lead an unbid suit. Suits the opponents bid are suits they are prepared for; the suit nobody mentioned is the one where your side's honors are most likely to be worth tricks and least likely to be finessed.",
    "opening_lead",
  ),

  guideline(
    "lead-trump-when-ruffs-expected",
    "Lead a trump when you expect ruffs",
    "Lead a trump when you anticipate that declarer's plan is RUFFING — the clearest signpost is a splinter bid in the auction (partner-of-declarer showing a singleton and a fit). Cutting the ruffs down by drawing dummy's trumps early beats any attacking lead when their tricks were going to come from shortness.",
    "opening_lead",
  ),

  guideline(
    "lead-short-suit-for-ruff",
    "Lead a singleton or a doubleton for a ruff",
    "Lead a singleton or a doubleton hoping for a RUFF. Against a suit contract your own shortness is a trick source: get the suit played while you still hold trumps and an entry, and the third round is a ruff.",
    "opening_lead",
  ),

  // -------------------------------------------------------------------------
  // Slide 74 — WHICH CARD to lead: the convention card, with this deck's
  // answers circled in red. Executable, and deliberately ONE item so the
  // internal order (honor sequences, then length leads) is deterministic.
  // -------------------------------------------------------------------------

  item(
    "lead-convention-card",
    "What card to lead (the convention card)",
    "LENGTH LEADS ARE FOURTH BEST — circled on BOTH halves of the card, against suits and against notrump. The length column in full: from x-x lead the HIGHER; from x-x-x lead the THIRD; from x-x-x-x lead the FOURTH; from H-x-x lead the LOWEST; from H-x-x-x lead the LOWEST; from H-x-x-x-x lead the FOURTH. " +
      "HONOR LEADS AGAINST SUITS: from A-K-x lead the KING; from K-Q-x the KING; from Q-J-x the QUEEN; from J-T-x the JACK; from T-9-x the TEN. Interior sequences against suits: from K-J-T-x lead the JACK; from K-T-9-x the TEN; from Q-T-9-x the TEN. " +
      "HONOR LEADS AGAINST NOTRUMP: from A-K-x-x (or longer) lead the KING; from K-Q-J-x the KING; from K-Q-T-9 the QUEEN; from Q-J-T-x the QUEEN; from J-T-9-x the JACK. Interior sequences against notrump: from A-Q-J-x lead the QUEEN; from A-J-T-x the JACK; from K-T-9-x the TEN; from Q-T-9-x the TEN. " +
      "HOW THE ENGINE REALIZES THIS: top-of-sequence is declared first (against suits and against notrump), with fourth best behind it as the declared length agreement. Because top-of-sequence never declines a hand — with no touching honor in the long suit it falls to the LOWEST card — the fourth-best rules behind it are the recorded agreement rather than a second attempt. From three or four cards that fallback IS the deck's answer (from three cards the third-best and from four cards the fourth-best card is the lowest one), so H-x-x, H-x-x-x, x-x-x and x-x-x-x all come out right. From FIVE or more cards with no touching honor it comes out one card too low: from H-x-x-x-x the engine leads the fifth-best where this card says fourth best. Two further rows the current lead vocabulary cannot express: the ACE-KING holdings (it leads the ace where this deck leads the KING) and K-Q-T-9 against notrump (it leads the king where this deck leads the QUEEN). The doubleton row (lead the higher from x-x) is unreachable, because lead realization always pulls from the longest suit.",
    "lead_agreement",
    "opening_lead",
    {
      kind: "lead_rules",
      leads: [
        // Honor / sequence leads FIRST: the card's honor table outranks the
        // length column whenever the long suit is headed by a sequence.
        { versus: "suit", style: "top_of_sequence" },
        { versus: "notrump", style: "top_of_sequence" },
        // Then the circled choice: fourth best, both vs suits and vs notrump.
        { versus: "suit", style: "fourth_best" },
        { versus: "notrump", style: "fourth_best" },
      ],
    },
    // NO enable toggle: this is the deck's own always-on lead policy (natural,
    // not a named gadget), and it is the only thing satisfying lead.policy —
    // gating it would let a player end up with no lead agreement at all.
    { sets: ["core"] },
  ),

  // -------------------------------------------------------------------------
  // Slide 75 — what an honor LEAD MEANS. Pure partnership meaning: the
  // language has no "this card promises that card" surface, so the standard
  // meanings and the two named variations are teaching agreements. The deck
  // teaches the standard column; the variations are OFF.
  // -------------------------------------------------------------------------

  item(
    "lead-honor-meanings",
    "What an honor lead promises",
    "The standard meanings this deck teaches, in full: the ACE promises the KING (and against notrump it asks partner to drop an honor); the KING promises the QUEEN; the QUEEN promises the JACK (and against notrump asks partner to drop the jack); the JACK DENIES the queen; the TEN DENIES the jack; the NINE DENIES the ten. Read them as a pair of inferences — the honor led tells partner what you hold below it, and the honor you did NOT lead tells partner what you do not hold.",
    "agreement",
    "opening_lead",
    { kind: "none" },
    {
      settings: [
        toggle(
          "g_lead_honor_meanings",
          "Standard honor-lead meanings (A promises K, J denies Q)",
          true,
          "The deck's own column on slide 75. Turn off if the partnership plays Rusinov or \"Jack denies\" instead.",
        ),
      ],
      sets: ["core"],
    },
  ),

  item(
    "lead-rusinov",
    "Rusinov leads (variation, off)",
    "A VARIATION the deck lists but does not adopt. Under Rusinov leads an honor promises the immediately touching HIGHER honor: lead the QUEEN from K-Q, the JACK from Q-J. The honor led is therefore one rank lower than the standard agreement would pull, which is what lets partner place the missing honor exactly. Default OFF — this deck teaches the standard meanings.",
    "agreement",
    "opening_lead",
    { kind: "none" },
    {
      settings: [
        toggle(
          "g_lead_rusinov",
          "Rusinov leads",
          false,
          "An honor lead promises the immediately touching higher honor (Q from KQ, J from QJ). Off: the deck teaches the standard meanings.",
        ),
      ],
      sets: ["conventions"],
    },
  ),

  item(
    "lead-jack-denies",
    "\"Jack denies\" leads (variation, off)",
    "A VARIATION the deck lists but does not adopt. Under \"Jack denies\", the JACK denies ANY higher honor, while the TEN or the NINE promises either zero or TWO higher honors, one of which is the jack. The point of the agreement is that partner can tell a bare interior holding from a real sequence on the first trick. Default OFF — this deck teaches the standard meanings.",
    "agreement",
    "opening_lead",
    { kind: "none" },
    {
      settings: [
        toggle(
          "g_lead_jack_denies",
          "\"Jack denies\" leads",
          false,
          "Jack denies any higher honor; ten or nine promises 0 or 2 higher honors, one being the jack. Off: the deck teaches the standard meanings.",
        ),
      ],
      sets: ["conventions"],
    },
  ),

  // -------------------------------------------------------------------------
  // Slide 76 — carding principles and the second/third/fourth-hand
  // conventions. The three positional conventions ARE executable.
  // -------------------------------------------------------------------------

  guideline(
    "lead-carding-principles",
    "Carding: every card tells a story",
    "Every card you play tells partner a story — do NOT automatically play the lowest card. FIRST hand (leading a fresh trick, not just trick one) follows the same rules as the opening lead. The three signals available to you are ATTITUDE (do I like this suit?), COUNT (how many do I hold?) and SUIT PREFERENCE (which other suit do I want?). Which of the three applies is a separate agreement — see the signal policy item.",
    "defense",
  ),

  item(
    "lead-second-hand-low",
    "Second hand low",
    "SECOND HAND USUALLY PLAYS LOW: third hand (your partner, sitting after the two opponents) will usually cover, so spending an honor in second seat only spends it twice. The deck's one exception: play high when you hold a SEQUENCE OF HONORS that covers ALL of third hand's honors — then nothing is wasted, because no card of theirs can be promoted past yours. (The exception is judgment: the language has no \"covering sequence\" predicate, so only the low rule is executable.)",
    "defensive_technique",
    "defense",
    {
      kind: "play_rules",
      rules: [play("second_hand_low", 52, { position: "second" })],
    },
    // No enable toggle: a fundamental of card play, not a convention.
    { sets: ["core"] },
  ),

  item(
    "lead-third-hand-high",
    "Third hand high — but the lower of touching honors",
    "THIRD HAND USUALLY PLAYS HIGH, to stop fourth hand winning the trick cheaply. Two refinements from the slide: play the LOWER of touching honors — the exact OPPOSITE of leading, where you lead the top of the sequence — and if you have no high card to contribute, use the card to SIGNAL instead. The slide's capitalized rule is what executes: third hand high (which also plays low when partner's led card is already winning the trick). The lower-of-touching-honors refinement has no vocabulary — a \"win as cheaply as you can\" rule in third seat would get Q-J-x right but would play the JACK from K-J-x and the seven from 9-7-3, under-playing exactly where the slide says to play high — so it stays declared judgment rather than a rule that would shadow the headline.",
    "defensive_technique",
    "defense",
    {
      kind: "play_rules",
      rules: [play("third_hand_high", 50, { position: "third" })],
    },
    // No enable toggle: a fundamental of card play, not a convention.
    { sets: ["core"] },
  ),

  item(
    "lead-fourth-hand-cheaply",
    "Fourth hand wins as cheaply as possible",
    "FOURTH HAND WINS THE TRICK AS CHEAPLY AS POSSIBLE — again the lower of touching honors, since the trick is already yours and the higher card keeps its value for later. The deck adds the declarer's-eye view of the same seat: declarer, playing fourth, can choose the RIGHT card rather than the cheapest one to HIDE the layout from the defenders.",
    "defensive_technique",
    "defense",
    {
      kind: "play_rules",
      rules: [play("win_cheaply", 60, { position: "fourth" })],
    },
    // No enable toggle: a fundamental of card play, not a convention.
    { sets: ["core"] },
  ),

  // -------------------------------------------------------------------------
  // Slides 76–77 — the signal policy. THE DECK PLAYS UPSIDE-DOWN COUNT AND
  // ATTITUDE. This inverts the platform's standard signal item, so it is
  // authored explicitly, carries its own toggle, and is the Floor's signal
  // policy (signals are the one completeness category no fallback satisfies).
  // -------------------------------------------------------------------------

  item(
    "lead-signals-udca",
    "Signals: upside-down count and attitude (UDCA)",
    "WHICH SIGNAL: when WE led the suit, give ATTITUDE. When DECLARER led the suit, give COUNT — if declarer is playing the suit it is unlikely we want it continued, so the useful information is length. Suit preference is for the specific positions where neither makes sense (see the suit-preference item). " +
      "HOW — UPSIDE DOWN, the deck's choice in red: on partner's lead, a LOW card ENCOURAGES (follow up with a high card next round) and a HIGH card DISCOURAGES (follow with a low card). On declarer's lead, a LOW card shows an EVEN number of cards (follow with a high card next) and a HIGH card shows an ODD number (follow with a low card). " +
      "THIS IS THE INVERSE OF THE PLATFORM DEFAULT: standard carding has high encouraging and high-low showing an even count. Anyone reading a card from this partnership must invert first. The engine records the policy (upside-down attitude, reversed count, attitude on the first discard); partner-facing card selection to signal is a future engine tier, so the follow-up-card discipline above is declared agreement rather than executed behavior.",
    "signal_agreement",
    "defense",
    {
      kind: "signals",
      signals: { attitude: "upside_down", count: "reverse", firstDiscard: "attitude" },
    },
    {
      settings: [
        toggle(
          "g_lead_udca",
          "Upside-down count and attitude (UDCA)",
          true,
          "The deck's choice: LOW encourages, HIGH discourages, LOW shows an EVEN count. Turn off to play standard (high encouraging) signals.",
        ),
      ],
      // Signals are the one completeness category a fallback cannot satisfy,
      // so the policy belongs to the Floor — exactly as in the SAYC template.
      sets: ["floor"],
    },
  ),

  item(
    "lead-suit-preference",
    "Suit preference: high card asks for the higher suit",
    "SUIT PREFERENCE is used in the specific circumstances where attitude and count do not make sense: the deck's example is a suit contract in which dummy holds a SINGLETON in the suit led, so a continuation will be RUFFED — telling partner \"like it / don't like it\" is pointless, and what partner needs is a different suit. The code: a HIGH card asks for the HIGHER suit, a LOW card asks for the LOWER suit.",
    "agreement",
    "defense",
    { kind: "none" },
    {
      settings: [
        toggle(
          "g_lead_suit_preference",
          "Suit-preference signals (high = higher suit)",
          true,
        ),
      ],
      sets: ["core"],
    },
  ),

  // -------------------------------------------------------------------------
  // Slide 78 — discards. Odd/even is the deck's method; Lavinthal/McKenney is
  // the alternative it names. The SignalSpec vocabulary has only
  // attitude/count/none for the first discard, so the odd/even CODE itself is
  // teaching content and only its attitude character is executable.
  // -------------------------------------------------------------------------

  item(
    "lead-odd-even-discards",
    "Odd/even discards",
    "A DISCARD is the card you play when you are out of the suit led, and the FIRST discard can be special — it is the one card partner will read hardest. ODD/EVEN, the deck's method: an ODD card (3, 5, 7, 9) ENCOURAGES the suit you discarded. An EVEN card (2, 4, 6, 8, T) DISCOURAGES that suit and points at ANOTHER suit — ignore the suit LED and the suit DISCARDED, which leaves two suits A and B: a HIGH even card asks for the higher of A and B, a LOW even card for the lower. " +
      "The deck's three worked examples, hearts led and you are void: ♠3 is odd, \"I like spades\"; ♣2 is even — \"I don't like clubs\", and 2 being low it asks for the lower of the two suits left, DIAMONDS; ♠8 is even — \"I don't like spades\", and 8 being high it asks for the higher of the two left, DIAMONDS again (diamonds over clubs). " +
      "The signal language can record only that the first discard carries ATTITUDE; the odd/even parity code and its suit-preference half are declared agreement.",
    "signal_agreement",
    "defense",
    { kind: "signals", signals: { firstDiscard: "attitude" } },
    {
      settings: [
        toggle(
          "g_lead_odd_even",
          "Odd/even discards",
          true,
          "Odd card encourages the suit discarded; even card discourages and points at another suit (high even = higher remaining suit, low even = lower).",
        ),
      ],
      sets: ["core"],
    },
  ),

  item(
    "lead-lavinthal-discards",
    "Lavinthal / McKenney discards (alternative, off)",
    "The ALTERNATIVE discard method the deck names. Under Lavinthal (McKenney) a discard shows no interest in the suit DISCARDED or in the suit LED, and points at one of the other two: a HIGH card asks for the HIGHER of the other two suits, a LOW card for the LOWER. The deck's note on practice: odd/even is common against suit contracts, Lavinthal against trump contracts. Default OFF — this deck's method is odd/even.",
    "agreement",
    "defense",
    { kind: "none" },
    {
      settings: [
        toggle(
          "g_lead_lavinthal",
          "Lavinthal / McKenney discards",
          false,
          "A discard denies the suit led and the suit discarded: high asks for the higher of the other two, low for the lower. Off: the deck plays odd/even.",
        ),
      ],
      sets: ["conventions"],
    },
  ),
];

/** Slide(s) each item was authored from — install.ts turns these into citations. */
export const LEADS_CARDING_SLIDES: Record<string, number[]> = {
  "lead-suit-partners-suit": [73],
  "lead-suit-vs-notrump-long-strong": [73],
  "lead-suit-vs-notrump-short-strong": [73],
  "lead-suit-strong-sequence": [73],
  "lead-suit-unbid": [73],
  "lead-trump-when-ruffs-expected": [73],
  "lead-short-suit-for-ruff": [73],
  "lead-convention-card": [74],
  "lead-honor-meanings": [75],
  "lead-rusinov": [75],
  "lead-jack-denies": [75],
  "lead-carding-principles": [76],
  "lead-second-hand-low": [76],
  "lead-third-hand-high": [76],
  "lead-fourth-hand-cheaply": [76],
  "lead-signals-udca": [76, 77],
  "lead-suit-preference": [77],
  "lead-odd-even-discards": [78],
  "lead-lavinthal-discards": [78],
};

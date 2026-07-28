// Card play (SAYC defaults + the 2026-07 play expansion): standard leads and
// signals, then technique items over the expanded behaviors. Priorities put
// the plan-level techniques (cash out, draw trumps) before situational ones,
// with the fundamentals as the high-numbered safety net underneath.

import { item, play, toggle, type TemplateItem } from "../dsl";

export const LEADS_SIGNALS_PLAY: TemplateItem[] = [
  item(
    "leads",
    "Opening leads",
    "Leads are fourth best, with the top of touching honors and the top of an interior sequence; against suits the ace is led from A-K-x. From three low cards lead LOW against a suit contract and HIGH against notrump; from four or more low cards without an honor, lead the second highest. (The engine currently realizes the sequence-then-fourth-best core of this table.)",
    "lead_agreement",
    "opening_lead",
    {
      kind: "lead_rules",
      leads: [
        { versus: "any", style: "top_of_sequence" },
        { versus: "notrump", style: "fourth_best" },
        { versus: "suit", style: "fourth_best" },
      ],
    },
  ),

  item(
    "signals",
    "Defensive signals",
    "Standard signals: high encourages, low discourages (attitude); when giving count, high-low shows an even number and low-high odd. The first discard is attitude. (The engine treats this as declared policy — partner-facing card selection to signal is a future engine tier.)",
    "signal_agreement",
    "defense",
    {
      kind: "signals",
      signals: { attitude: "standard", count: "standard", firstDiscard: "attitude" },
    },
    // In the Floor: signals is the one category a fallback can't satisfy — a
    // POLICY is required for completeness, and standard signals are the floor.
    { sets: ["floor"] },
  ),

  // ---- declarer technique --------------------------------------------------

  item(
    "declarer-plan",
    "Declarer plan: count and cash",
    "Count winners before touching the first trick. When the sure winners cover the contract, take them; on the way, park losers on established winners.",
    "declarer_technique",
    "declarer_play",
    {
      kind: "play_rules",
      rules: [
        play("cash_out_when_enough", 10, { side: "declarer", position: "lead" }),
        play("discard_loser_on_winner", 19, { side: "declarer" }),
      ],
    },
    { settings: [toggle("plan_cash_on", "Cash out when the contract is safe")] },
  ),

  item(
    "trump-management",
    "Trump management",
    "Draw the opponents' trumps before running side winners — unless dummy's trumps are needed for ruffs. Ruff losers when void.",
    "declarer_technique",
    "declarer_play",
    {
      kind: "play_rules",
      rules: [
        play("draw_trumps", 20, { side: "declarer", position: "lead" }),
        play("ruff_loser", 18, { side: "declarer" }),
      ],
    },
    { settings: [toggle("draw_trumps_on", "Draw trumps")] },
  ),

  item(
    "finessing",
    "Finessing",
    "Lead low toward a tenace (A-Q, K-J) to trap the missing honor — but with nine cards missing the queen, play for the drop (eight ever, nine never).",
    "declarer_technique",
    "declarer_play",
    {
      kind: "play_rules",
      rules: [play("finesse_toward_tenace", 30, { side: "declarer", position: "lead" })],
    },
    { settings: [toggle("finesse_on", "Finessing")] },
  ),

  item(
    "holdup-duck",
    "Hold-ups and ducks",
    "In notrump, refuse the first rounds of their suit while holding a lone ace (hold-up), and duck an early round of your own long suit to keep communication.",
    "declarer_technique",
    "declarer_play",
    {
      kind: "play_rules",
      rules: [
        play("hold_up_stopper", 15, { side: "declarer" }),
        play("duck_to_preserve_entry", 35, { side: "declarer", position: "lead" }),
      ],
    },
    { settings: [toggle("holdup_on", "Hold-ups & ducks")] },
  ),

  item(
    "establishment",
    "Establishing a long suit",
    "Attack the long combined suit early: drive out their stoppers while you still have entries, then run it.",
    "declarer_technique",
    "declarer_play",
    {
      kind: "play_rules",
      rules: [play("establish_long_suit", 40, { side: "declarer", position: "lead" })],
    },
    { settings: [toggle("establish_on", "Suit establishment")] },
  ),

  // ---- defense technique ---------------------------------------------------

  item(
    "defense-returns",
    "Returning partner's suit",
    "On defense, returning partner's led suit is usually right — top of a remaining doubleton, low from length.",
    "defensive_technique",
    "defense",
    {
      kind: "play_rules",
      rules: [play("return_partner_suit", 25, { side: "defense", position: "lead" })],
    },
    { settings: [toggle("return_suit_on", "Return partner's suit")] },
  ),

  item(
    "defense-holdup",
    "Defensive hold-up",
    "Hold up the ace of declarer's long suit in notrump to cut declarer off from dummy.",
    "defensive_technique",
    "defense",
    { kind: "play_rules", rules: [play("hold_up_ace", 24, { side: "defense" })] },
    { settings: [toggle("def_holdup_on", "Defensive hold-up")] },
  ),

  item(
    "second-hand",
    "Second-hand play",
    "Second hand plays low — but rise with the ace over a led honor rather than letting it ride.",
    "defensive_technique",
    "defense",
    {
      kind: "play_rules",
      rules: [
        play("second_hand_rise_vs_honor", 22, { side: "defense", position: "second" }),
        play("second_hand_low", 52, { position: "second" }),
      ],
    },
  ),

  item(
    "third-hand",
    "Third-hand play",
    "Third hand plays high to force declarer's honors — but keeps cheap cards when partner is already winning.",
    "defensive_technique",
    "defense",
    { kind: "play_rules", rules: [play("third_hand_high", 50, { position: "third" })] },
  ),

  item(
    "cover-honor",
    "Cover an honor with an honor",
    "When an honor is led, cover it with a higher honor to promote your side's lower cards.",
    "defensive_technique",
    "defense",
    { kind: "play_rules", rules: [play("cover_honor", 45, { side: "defense" })] },
  ),

  item(
    "ruff-discard-defense",
    "Overruffs and discards",
    "When void: overruff declarer cheaply if you can, otherwise throw your lowest useless card.",
    "defensive_technique",
    "defense",
    {
      kind: "play_rules",
      rules: [play("overruff_or_discard", 30, { side: "defense" })],
    },
  ),

  // ---- fundamentals (both sides, high priority numbers — fire last) --------

  item(
    "play-fundamentals",
    "Card-play fundamentals",
    "The quiet defaults under every technique: win as cheaply as possible, cash established winners, follow low, discard the lowest useless card.",
    "declarer_technique",
    "declarer_play",
    {
      kind: "play_rules",
      rules: [
        play("cash_winners", 55, { position: "lead" }),
        play("win_cheaply", 60),
        play("discard_lowest", 65),
        play("lowest_following", 90),
      ],
    },
  ),
];

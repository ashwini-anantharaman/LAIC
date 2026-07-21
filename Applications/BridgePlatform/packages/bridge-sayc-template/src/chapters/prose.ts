// Judgment & framework knowledge (SAYC booklet, complete-coverage pass
// 2026-07-21): everything the booklet TEACHES that the rule language cannot
// yet execute lives here as first-class teaching items — visible, citable,
// editable, and present so a source augmentation recognizes the knowledge
// instead of re-adding it. Where a concept is PARTLY executable, the
// executable rules live in their thematic chapters and these items carry the
// judgment around them.
//
// The chapter also owns the one EXECUTABLE judgment item: "Forcing
// situations" — a catalog of auction contexts where pass is not an available
// call. The engine reads it as a guard: rules that would pass are suppressed
// there, and with nothing else to say the player bids its longest suit and
// cites the forcing rule. Each situation is an ordinary editable rule.

import { bidAt, ctx, doubled, forcing, is, item, passed, toggle, type TemplateItem } from "../dsl";

const prose = (key: string, title: string, text: string): TemplateItem =>
  item(key, title, text, "judgment_guideline", "auction", { kind: "none" });

const SUITS = ["C", "D", "H", "S"] as const;

export const PROSE: TemplateItem[] = [
  item(
    "forcing-situations",
    "Forcing situations",
    "Auctions in which pass is NOT an available call. When one of these applies, the player never passes: a rule that would pass is suppressed, and with no better rule it bids its cheapest long suit rather than drop the auction. The catalog: a two-over-one response (forcing on opener for one round, and responder promises a rebid below game); any new suit by responder at the one level; strong 2♣ auctions below game (suit bids only — opener's 2NT rebid may be passed); Jacoby 2NT (assumes the convention is on); a new suit in response to a weak two (RONF); advancer's cue-bid raise of an overcall; partner's takeout or negative double when RHO passes (negative doubles through 2♠); and partner's 4NT/5NT ask after suit agreement. Each situation is an editable rule — delete or reshape any line the partnership plays differently.",
    "agreement",
    "auction",
    {
      kind: "forcing_rules",
      rules: [
        // --- two-over-one: forcing on opener for one round -----------------
        forcing(
          "two-over-one-1s",
          "Two-over-one response forces opener (after 1♠)",
          ctx("opener", {
            opening: is("1S"),
            partnerLast: bidAt({ level: 2, strains: ["C", "D", "H"] }),
            contested: false,
            roundMax: 2,
          }),
          10,
        ),
        forcing(
          "two-over-one-1h",
          "Two-over-one response forces opener (after 1♥)",
          ctx("opener", {
            opening: is("1H"),
            partnerLast: bidAt({ level: 2, strains: ["C", "D"] }),
            contested: false,
            roundMax: 2,
          }),
          11,
        ),
        forcing(
          "two-over-one-1d",
          "Two-over-one response forces opener (after 1♦)",
          ctx("opener", {
            opening: is("1D"),
            partnerLast: is("2C"),
            contested: false,
            roundMax: 2,
          }),
          12,
        ),
        // --- and responder promises a rebid below game ---------------------
        forcing(
          "two-over-one-responder-1s",
          "After a two-over-one, responder bids again below game (1♠ opening)",
          ctx("responder", {
            opening: is("1S"),
            ownFirst: bidAt({ level: 2, strains: ["C", "D", "H"] }),
            partnerLast: bidAt({ max: 3, strains: ["C", "D", "H", "S"] }),
            contested: false,
            roundMax: 2,
          }),
          13,
        ),
        forcing(
          "two-over-one-responder-1h",
          "After a two-over-one, responder bids again below game (1♥ opening)",
          ctx("responder", {
            opening: is("1H"),
            ownFirst: bidAt({ level: 2, strains: ["C", "D"] }),
            partnerLast: bidAt({ max: 3, strains: ["C", "D", "H", "S"] }),
            contested: false,
            roundMax: 2,
          }),
          14,
        ),
        // --- one-level new suit is unlimited and forcing --------------------
        forcing(
          "new-suit-one-level",
          "A one-level new-suit response forces opener",
          ctx("opener", {
            partnerLast: bidAt({ level: 1, strains: [...SUITS] }),
            contested: false,
            roundMax: 2,
          }),
          15,
        ),
        // --- strong 2♣: forcing below game (suit bids; 2NT may be passed) --
        forcing(
          "strong-2c-opener",
          "Strong 2♣ auctions are forcing below game (opener)",
          ctx("opener", {
            opening: is("2C"),
            partnerLast: bidAt({ max: 3, strains: [...SUITS] }),
            contested: false,
            roundMax: 3,
          }),
          16,
        ),
        forcing(
          "strong-2c-responder",
          "Strong 2♣ auctions are forcing below game (responder)",
          ctx("responder", {
            opening: is("2C"),
            partnerLast: bidAt({ max: 3, strains: [...SUITS] }),
            contested: false,
            roundMax: 3,
          }),
          17,
        ),
        // --- conventional responses that demand a reply ---------------------
        forcing(
          "jacoby-2nt",
          "Jacoby 2NT forces opener to describe",
          ctx("opener", {
            opening: bidAt({ level: 1, strains: ["H", "S"] }),
            partnerLast: is("2N"),
            contested: false,
            roundMax: 2,
          }),
          18,
        ),
        forcing(
          "ronf-2d",
          "New suit over a weak 2♦ is forcing (RONF)",
          ctx("opener", {
            opening: is("2D"),
            partnerLast: bidAt({ max: 3, strains: ["C", "H", "S"] }),
            contested: false,
            roundMax: 2,
          }),
          19,
        ),
        forcing(
          "ronf-2h",
          "New suit over a weak 2♥ is forcing (RONF)",
          ctx("opener", {
            opening: is("2H"),
            partnerLast: bidAt({ max: 3, strains: ["C", "D", "S"] }),
            contested: false,
            roundMax: 2,
          }),
          20,
        ),
        forcing(
          "ronf-2s",
          "New suit over a weak 2♠ is forcing (RONF)",
          ctx("opener", {
            opening: is("2S"),
            partnerLast: bidAt({ max: 3, strains: ["C", "D", "H"] }),
            contested: false,
            roundMax: 2,
          }),
          21,
        ),
        // --- competitive obligations ----------------------------------------
        forcing(
          "cue-advance",
          "Advancer's cue-bid raise forces the overcaller",
          ctx("overcaller", { partnerCued: true, roundMax: 2 }),
          22,
        ),
        forcing(
          "takeout-double-advance",
          "Partner's takeout double forces an advance over RHO's pass",
          ctx("advancer", {
            opening: bidAt({ max: 3 }),
            partnerLast: doubled,
            rhoLast: passed,
            roundMax: 2,
          }),
          23,
        ),
        forcing(
          "negative-double-reply",
          "Partner's negative double forces opener over RHO's pass",
          ctx("opener", {
            lhoLast: bidAt({ max: 2, strains: [...SUITS] }),
            partnerLast: doubled,
            rhoLast: passed,
            contested: true,
            roundMax: 3,
          }),
          24,
        ),
        // --- slam asks --------------------------------------------------------
        forcing(
          "blackwood-4nt",
          "Partner's 4NT after suit agreement is Blackwood — respond",
          ctx("any", {
            partnerLast: is("4N"),
            ownLast: bidAt({ strains: [...SUITS] }),
          }),
          25,
        ),
        forcing(
          "king-ask-5nt",
          "Partner's 5NT (king ask / grand slam force) — respond",
          ctx("any", {
            partnerLast: is("5N"),
            ownLast: bidAt({ strains: [...SUITS] }),
          }),
          26,
        ),
      ],
    },
    { settings: [toggle("forcing_on", "Forcing-pass guard")], sets: ["core"] },
  ),

  prose(
    "interference-over-1nt",
    "Interference over a 1NT opening",
    "If an opponent DOUBLES our 1NT, all conventional responses stay on (2♣ is still Stayman, 2♦ still transfers). If an opponent BIDS, conventions are off: bids are natural, and a cue-bid of their suit substitutes for Stayman with game-forcing values. If they intervene over a conventional response, our bids keep their original meanings — bidding voluntarily then shows a real fit.",
  ),
  prose(
    "responder-rebid-framework",
    "Responder's rebid framework",
    "After responding at the one level, responder's second call places the hand in a band: sign off in a partscore (pass, 1NT, or two of a previously bid suit — 6–9), invite (2NT or three of a previously bid suit — 10–11), or commit to game (3NT, 4♥/4♠, 5♣/5♦, or a forcing new suit). After a 1NT rebid by opener, a new suit at the next level is NON-forcing; a jump shift or a reverse by responder forces game.",
  ),
  prose(
    "two-over-one-forces",
    "Two-over-one response forces a rebid",
    "When responder bids a new suit at the two level as an unpassed hand (1♠–2♣), responder promises to bid AGAIN unless opener's rebid is at game level — and opener must also rebid. Opener could hold up to 18 points (just short of a jump shift), so responder must not pass a convenient rebid; a jump raise of opener's first suit to the three level afterwards is game forcing, since the limit raise was available directly. ENFORCED: the Forcing situations item stops the machine from passing in these auctions.",
  ),
  prose(
    "preempt-discipline",
    "Preempt discipline by vulnerability",
    "Opening preempts follow the two-three-four guideline: within TWO tricks of your bid when vulnerable against not, THREE at equal vulnerability, FOUR at favorable. ENFORCED: the weak-two and preempt items carry vulnerability-conditioned playing-trick requirements (A=1; K=1 with a second card, ½ alone; Q=½ with three; +1 per card past the third in an honor-headed suit). Edit those rules to tighten or loosen the style.",
  ),
  prose(
    "competitive-principles",
    "Competitive bidding principles",
    "Over intervention, bids mean what they meant without it — though you may need a second-choice call (a raise instead of a notrump rebid without a stopper). Cue-bidding RHO's suit shows game values without clear direction, often a game-forcing raise. Unless noted otherwise, any bid or double BY an opponent cancels a convention designed for non-competitive auctions (2NT over their overcall is natural, not Jacoby).",
  ),
  prose(
    "redouble-meanings",
    "Redouble meanings (penalty and SOS)",
    "A redouble is: TO PLAY when your side is at the four level or higher, or when they double a conventional bid you're happy with; a GOOD HAND (10+) when their double was takeout; and SOS — begging partner to run to another suit — when your side has been doubled for penalties in a trump suit at the three level or lower after passes. The four-level business redouble exists as an executable rule (see \"Penalty redouble at the four level\"), OFF by default until an expert calibrates it.",
  ),
  prose(
    "defending-their-conventions",
    "Defending the opponents' conventions",
    "When the opponents use a convention such as Michaels or the unusual notrump, DOUBLE shows at least 10 points (usually balanced) and a desire to penalize one of their known suits; a cue-bid of one of their SHOWN suits forces game. You may add specific defenses (unusual-vs-unusual, Mathe over a big club) on the convention card.",
  ),
  prose(
    "cue-two-suits-natural",
    "Cue-bid over a two-suited auction is natural",
    "A cue-bid overcall is Michaels only while the opponents have shown ONE suit. Once they have bid two suits, a \"cue-bid\" of either is simply natural — you are bidding a real suit to play. ENFORCED: the Michaels rules require that the opponents have bid at most one suit.",
  ),
  prose(
    "michaels-minor-ask",
    "Michaels minor ask (2NT)",
    "After a Michaels cue-bid of a MAJOR (showing the other major and an unspecified minor), advancer bids 2NT to ask which minor: 3♣ shows clubs, 3♦ shows diamonds. ENFORCED: the Michaels cue-bid item carries the 2NT ask and the overcaller's minor reply as executable rules.",
  ),
  prose(
    "defense-vs-preempts",
    "Defense to opening preempts",
    "Over an opposing preempt: an overcall in a suit or notrump is natural, a double is takeout through 4♦ (penalty from 4♥ up), and a cue-bid is Michaels. Aim to be within a trick or two of your side's values — the preemptor's partner will often raise the pressure.",
  ),
  prose(
    "responses-after-double",
    "Responses when partner's opening is doubled",
    "Over their takeout double: new suits at the one level stay forcing and unlimited; 2♣ over 1♦ is non-forcing (6–10, usually six clubs); 2NT is Jordan — a limit raise or better with support; REDOUBLE shows 10+ (prefer a descriptive bid with a clear alternative); a jump shift is weak and preemptive, like a weak two-bid; and a raise of partner's suit is preemptive with good trumps but fewer than 10 points.",
  ),
];

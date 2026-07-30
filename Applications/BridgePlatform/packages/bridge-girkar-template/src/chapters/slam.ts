// Slam machinery, authored from the teaching deck's slides 47–50 (fast arrival,
// opener's continuations after Jacoby 2NT, Roman keycards + the 5NT king ask,
// fourth suit forcing). Every item cites the slide it was read from.
//
// BAND DISCIPLINE. knowledgeType picks the band (exception < convention <
// rule/agreement < fallback) and `priority` orders within it, so a convention
// rule ALWAYS outranks the natural ladder. That makes context tightness a
// safety property, not a style point: a broadly-scoped convention rule would
// hijack ordinary auctions. Two mechanisms keep these tight —
//  · `askInProgress`: the deck's three questions (4NT keycards, 5NT kings, the
//    fourth suit) are declared with `ask(...)`, so partner's answering rules
//    match "this exact question is pending", never a bare call pattern. That is
//    also what makes the toggles cascade: disable the ask and the answers can
//    never match, so no stage needs its own gate;
//  · the partnership predicates: the ask fires on a REAL agreed suit
//    (`fit("agreed_suit")`) plus the deck's combined point count, and the
//    sign-off/slam decision is combined keycard arithmetic (`combKc` /
//    `kcMissing` — "missing 2 keycards, stop at 5"), never raw one-hand HCP.
//
// GRANULARITY. One item per idea, one item per stage of a convention: the ask,
// the responses and the asker's continuations are separate items wired with
// `requires` edges (SLAM_EDGES), so a fellow can review, edit or retire one
// stage without touching the others.
//
// THE DECK'S OWN CHOICES ARE ENCODED AS THEY ARE, with a setting where the deck
// is wide or unusual rather than a silent "correction":
//  · the keycard responses are the deck's scheme — 5♥/5♠ are "2 OR 5" (not the
//    common "2 or 5 with/without the queen at a higher step"), and 5♣ = 1 or 4
//    / 5♦ = 0 or 3 is the 1430 orientation the slide prints;
//  · slide 48's 3NT row says "Undiscussed" — it gets a teaching item that NAMES
//    the forbidden sequence and no rule at all;
//  · the point thresholds come from the deck (32–33 for six, 37 for seven,
//    slide 15's requirement table) and are exposed as range settings.

import {
  all,
  any,
  anyBid,
  ask,
  auctionItem,
  bid,
  bidAt,
  bidSuit,
  combHcp,
  combKc,
  ctx,
  fit,
  firstLegal,
  forcing,
  hcp,
  high,
  is,
  item,
  kcMissing,
  keycards,
  len,
  low,
  not,
  partnerHcp,
  pass as passAction,
  rule,
  range,
  stopper,
  shows,
  toggle,
  type TemplateEdge,
  type TemplateItem,
} from "@bridge/sayc-template/dsl";

// ---------------------------------------------------------------------------
// Shared patterns
// ---------------------------------------------------------------------------

/** The deck's 1♥/1♠ opening (slide 24) — the major the slam machinery agrees. */
const MAJOR_OPENING = bidAt({ level: 1, strains: ["H", "S"] });
const SUIT_BID = bidAt({ strains: ["C", "D", "H", "S"] });
const FOUR_NT = is("4N");
const FIVE_SUIT = bidAt({ level: 5, strains: ["C", "D", "H", "S"] });
const SIX_LEVEL = bidAt({ level: 6 });

/** Ask ids — the disambiguating handle every answering rule matches on. */
const RKC = "girkar-rkc";
const RKC_KINGS = "girkar-rkc-kings";
const FSF = "girkar-4sf";

/** The deck's keycard scheme (slide 49), shared by both 4NT ask rules: the
 *  five keycards are the four aces plus the king of the agreed trump suit. */
const RKC_RESPONSES = {
  "5C": { keycards: [1, 4] },
  "5D": { keycards: [0, 3] },
  "5H": { keycards: [2, 5] },
  "5S": { keycards: [2, 5] },
};

export const SLAM: TemplateItem[] = [
  // =========================================================================
  // Slide 47 — FAST ARRIVAL
  // =========================================================================
  // "In a game-forcing auction, jumping to game shows a MINIMUM for the
  // strength already shown; a below-game bid shows extras." The italicised
  // half — "for the strength ALREADY SHOWN" — is a partnership statement, so
  // these rules read partner's shown strength (partnerHcp), not this hand in
  // isolation. They do NOT re-test the deck's 26-point game requirement: the
  // auction is game forcing by the time fast arrival applies, so game is already
  // agreed, and slide 47's own examples (a ~12 HCP responder facing an opener who
  // has promised 12) are below 26 shown points.
  auctionItem(
    "slam-fast-arrival",
    "Fast arrival",
    "In an established game-forcing auction, the FASTER bid is the weaker one: jumping straight to game shows a MINIMUM for the strength already shown, while a slower, below-game bid shows extras and slam interest. The deck's examples: 1♥–2♣–2♦–4♥ (4♥ is a minimum, about 12 HCP with three-card support — 2♥ or 3♥ instead would be stronger), and 1♥–2NT–3♣–4♥ (4♥ is a minimum game-forcing raise with four trumps, about 12 HCP). Because 'the strength already shown' is a fact about the PAIR, these rules test partner's shown strength as well as this hand's. They do not re-check the deck's 26-point game requirement: fast arrival only applies once the auction is already forced to game, and both of the slide's examples are minimum hands that fall short of 26 shown points.",
    "agreement",
    [
      // ---- after a 2/1 game force (1M – 2x – opener's rebid – ?) ----------
      rule_slowExtras(),
      rule_fastGame(),
      // ---- after Jacoby 2NT (1M – 2NT – opener's answer – ?) --------------
      rule_slowExtrasJacoby(),
      rule_fastGameJacoby(),
    ],
    {
      settings: [
        toggle(
          "g_slam_fast_arrival_on",
          "Fast arrival",
          true,
          "Jumping to game in a game-forcing auction shows a minimum; a slower bid shows extras (slide 47).",
        ),
        range("g_slam_fast_arrival_min", "Fast arrival: the minimum that jumps to game", 12, 14, {
          min: 6,
          max: 24,
        }),
      ],
      sets: ["core"],
    },
  ),

  // =========================================================================
  // Slide 48 — OPENER'S CONTINUATIONS AFTER JACOBY 2NT
  // =========================================================================
  // Responder's 2NT (slide 24/48 header) is a strong FOUR-card raise of the
  // major, game forcing, with no singleton — with a singleton and a strong
  // raise the deck uses a splinter instead (that raise itself is authored in
  // the suit-response chapter; this item is opener's answer table).
  //
  // Every row of the slide, in the deck's own order of cheapness:
  //   3♣/3♦/3♥/3♠ = singleton in the bid suit   (six rules: three side suits
  //                                              per major opening, so each
  //                                              carries a `shows` the
  //                                              inference layer can read)
  //   3M          = opening hand with extras, 15+ HCP
  //   3NT         = Undiscussed  → a teaching item, no rule (see below)
  //   4♣/4♦/4♥/4♠ = a second five-card suit
  //   4M          = opening hand with a minimum (fast arrival, slide 47)
  //   4NT         = Roman keycard Blackwood (authored in the keycard item, so
  //                 the ask and its decoded responses stay in one place)
  auctionItem(
    "slam-jacoby-2nt-rebids",
    "Opener's rebids after Jacoby 2NT",
    "After 1♥/1♠–2NT (a game-forcing four-card raise with no singleton), opener answers from a fixed table: a THREE-level bid in a new suit shows a singleton in that suit; three of the agreed major shows an opening hand with extras (15+ HCP); a FOUR-level bid in a new suit shows a second five-card suit; four of the major shows a minimum opening (fast arrival); and 4NT is Roman keycard Blackwood. 3NT is undiscussed — the deck forbids it. Cheapest and most descriptive first: shortness before strength, strength before the second suit, game last.",
    "convention",
    [
      // --- 3-level new suit = singleton in the bid suit --------------------
      shortness("H", "S", 42),
      shortness("H", "D", 43),
      shortness("H", "C", 44),
      shortness("S", "H", 45),
      shortness("S", "D", 46),
      shortness("S", "C", 47),
      // --- 3M = opening hand with extras (15+) ----------------------------
      rule(
        "extras-3m",
        "Three of the major: extras (15+)",
        ctx("opener", { ownFirst: MAJOR_OPENING, partnerLast: is("2N"), contested: false }),
        hcp(low("g_slam_jacoby_extras")),
        bidSuit("own_first_bid_suit", 3),
        48,
        { shows: shows({ hcp: { min: 15 } }) },
      ),
      // --- 4-level new suit = a second five-card suit ----------------------
      secondSuit("H", "S", 49),
      secondSuit("H", "D", 50),
      secondSuit("H", "C", 51),
      secondSuit("S", "H", 52),
      secondSuit("S", "D", 53),
      secondSuit("S", "C", 54),
      // --- 4M = minimum opening (fast arrival) ----------------------------
      rule(
        "min-4m",
        "Four of the major: minimum (fast arrival)",
        ctx("opener", { ownFirst: MAJOR_OPENING, partnerLast: is("2N"), contested: false }),
        { all: [] },
        bidSuit("own_first_bid_suit", 4),
        55,
        { shows: shows({ hcp: { min: 12, max: 14 } }) },
      ),
    ],
    {
      settings: [
        toggle(
          "g_slam_jacoby_rebids_on",
          "Jacoby 2NT: opener's answer table",
          true,
          "Slide 48's table — 3-level shortness, 3M extras, 4-level second suit, 4M minimum.",
        ),
        range("g_slam_jacoby_extras", "Jacoby 2NT: opener's extras for three of the major", 15, 21, {
          min: 12,
          max: 24,
        }),
      ],
      sets: ["conventions"],
    },
  ),

  // Slide 48's 3NT row, in red: "Undiscussed". Teaching content, never a rule.
  item(
    "slam-jacoby-2nt-3nt-undiscussed",
    "1M–2NT–3NT is undiscussed",
    "The deck marks one continuation after Jacoby 2NT as UNDISCUSSED: 1♥–2NT–3NT and 1♠–2NT–3NT. Opener's answer table has a bid for shortness (three of a new suit), for extras (three of the major), for a second five-card suit (four of a new suit), for a minimum (four of the major) and for keycards (4NT) — 3NT means none of those, so it is not part of the system and must not be bid. If you play 3NT as something, agree it explicitly first.",
    "concept",
    "auction",
    { kind: "none" },
    { sets: ["conventions"] },
  ),

  // Slide 48's header says the 2NT raise is a GAME FORCE, which makes opener's
  // answer an obligation, not an option: pass is not an available call over it.
  // Only opener's side of the force is mechanized here — responder's obligation
  // depends on whether opener's answer was already at or above game (4♠ over 1♥
  // is, 4♣/4♦ are not), which the context language cannot compare, and slide
  // 47's fast-arrival rules give responder a call in every case the deck draws.
  item(
    "slam-jacoby-2nt-is-forcing",
    "Jacoby 2NT forces opener to answer",
    "The 2NT raise of slide 48's header is a GAME FORCE, so opener may not pass it — he must answer from the table (shortness at the three level, three of the major with 15+, a second five-card suit at the four level, four of the major with a minimum, or 4NT for keycards). Pass is not an available call. Because the raise commits the partnership to game, the answer is chosen for description, not for safety: the whole point of the cheap answers is that they cannot end the auction.",
    "agreement",
    "auction",
    {
      kind: "forcing_rules",
      rules: [
        forcing(
          "jacoby-force-1h",
          "1♥–2NT is forcing on opener",
          ctx("opener", {
            opening: is("1H"),
            partnerLast: is("2N"),
            contested: false,
            roundMax: 2,
          }),
          20,
        ),
        forcing(
          "jacoby-force-1s",
          "1♠–2NT is forcing on opener",
          ctx("opener", {
            opening: is("1S"),
            partnerLast: is("2N"),
            contested: false,
            roundMax: 2,
          }),
          21,
        ),
      ],
    },
    {
      settings: [
        toggle(
          "g_slam_jacoby_2nt_force",
          "Jacoby 2NT is forcing on opener",
          true,
          "Slide 48's header: the 2NT raise is a game force, so opener must answer.",
        ),
      ],
      sets: ["conventions"],
    },
  ),

  // =========================================================================
  // Slide 49 — ROMAN KEYCARDS (the 4NT ask)
  // =========================================================================
  // "Roman Keycards = 5 aces, i.e. 4 aces + K of the trump suit. AFTER THE
  // TRUMP SUIT IS FIXED, bid 4N as the inquiry." The trigger therefore tests a
  // real agreed suit (fit("agreed_suit", 8) — a suit both partners named, or a
  // known eight-card fit), never "4+ cards in partner's suit", and the deck's
  // own reason for asking ("sufficient strength for slam") is the combined
  // point count from the requirement table (slide 15: six needs 32–33 with 8+
  // trumps). With a VOID the deck says use Exclusion Blackwood instead, so the
  // trigger declines to ask — see the judgment item below.
  auctionItem(
    "slam-rkc-ask",
    "Roman keycard Blackwood (the 4NT ask)",
    "Keycards are used when you have enough strength for slam and want to confirm you are not off two aces. There are FIVE Roman keycards: the four aces plus the king of the trump suit. AFTER THE TRUMP SUIT IS FIXED, 4NT asks for them. The ask therefore requires a genuine agreed trump suit — a suit both partners have named, or a known eight-card fit — plus the deck's slam values (32–33 combined points for six, from the requirement table on slide 15). It is not asked with a void (use Exclusion Blackwood) and not asked when the answer could push the partnership a level higher than it can stand.",
    "convention",
    [
      rule(
        "ask",
        "4NT Roman keycard ask",
        ctx("any", { partnerLast: SUIT_BID, contested: false }),
        all(
          fit("agreed_suit", 8),
          combHcp(low("g_slam_rkc_slam_values")),
          // "With a void use Exclusion Blackwood" — so plain RKC stands down.
          not(len("own_shortest_suit", undefined, 0)),
        ),
        bid(4, "N"),
        10,
        { ask: ask(RKC, RKC_RESPONSES) },
      ),
      // Slide 48's 4NT row: over Jacoby 2NT the fit is already agreed (the 2NT
      // raise promised four trumps), so opener asks even though partner's last
      // call was notrump rather than a suit.
      rule(
        "ask-over-jacoby",
        "4NT keycard ask over Jacoby 2NT",
        ctx("opener", { ownFirst: MAJOR_OPENING, partnerLast: is("2N"), contested: false }),
        all(
          fit("agreed_suit", 8),
          combHcp(low("g_slam_rkc_slam_values")),
          not(len("own_shortest_suit", undefined, 0)),
        ),
        bid(4, "N"),
        11,
        { ask: ask(RKC, RKC_RESPONSES) },
      ),
    ],
    {
      settings: [
        toggle(
          "g_slam_rkc_on",
          "Roman keycard Blackwood",
          true,
          "4NT after the trump suit is fixed asks for the five keycards (slide 49).",
        ),
        range("g_slam_rkc_slam_values", "Combined points to try for slam", 32, 33, {
          min: 20,
          max: 40,
        }),
      ],
      sets: ["conventions"],
    },
  ),

  // ---- the deck's response scheme, verbatim -------------------------------
  // Matched on askInProgress (the 4NT that posed the question), never on a raw
  // call, so a natural/quantitative 4NT never gets answered in keycards. The
  // deck's rows are 5♣ = 1 or 4, 5♦ = 0 or 3, 5♥ = 2 or 5 WITHOUT the trump
  // queen, 5♠ = 2 or 5 WITH it — the "2 or 5" pairing is the deck's own and is
  // encoded as printed. The with-queen row is tested first so the queenless
  // step is the residue; between them the four rows cover 0–5 keycards, so a
  // responder can never be left without a call.
  auctionItem(
    "slam-rkc-responses",
    "Keycard responses (the deck's 14-30 scheme)",
    "Answering 4NT, counting the four aces plus the king of the agreed trump suit: 5♣ = 1 or 4 keycards, 5♦ = 0 or 3 keycards, 5♥ = 2 or 5 keycards WITHOUT the trump queen, 5♠ = 2 or 5 keycards WITH the trump queen. Keycards are counted for the AGREED suit, and each step carries the machine meaning the asker decodes into the partnership's combined keycard count.",
    "convention",
    [
      rule(
        "r-1-or-4",
        "5♣: 1 or 4 keycards",
        ctx("any", { askInProgress: RKC, contested: false }),
        any(keycards("agreed_suit", 1, 1), keycards("agreed_suit", 4, 4)),
        bid(5, "C"),
        20,
      ),
      rule(
        "r-0-or-3",
        "5♦: 0 or 3 keycards",
        ctx("any", { askInProgress: RKC, contested: false }),
        any(keycards("agreed_suit", undefined, 0), keycards("agreed_suit", 3, 3)),
        bid(5, "D"),
        21,
      ),
      rule(
        "r-2-or-5-with-queen",
        "5♠: 2 or 5 keycards with the trump queen",
        ctx("any", { askInProgress: RKC, contested: false }),
        all(
          any(keycards("agreed_suit", 2, 2), keycards("agreed_suit", 5, 5)),
          { holds: { suit: "agreed_suit", rank: 12 } },
        ),
        bid(5, "S"),
        22,
      ),
      rule(
        "r-2-or-5-without-queen",
        "5♥: 2 or 5 keycards without the trump queen",
        ctx("any", { askInProgress: RKC, contested: false }),
        any(keycards("agreed_suit", 2, 2), keycards("agreed_suit", 5, 5)),
        bid(5, "H"),
        23,
      ),
    ],
    { sets: ["conventions"] },
  ),

  // ---- the asker's decision, off the COMBINED keycard count ---------------
  // The deck's reason for asking is "confirm you are not off 2 aces", so the
  // decision is keycard arithmetic and nothing else: missing two or more, stop
  // at five in the agreed suit; missing at most one, bid the small slam in the
  // agreed suit. Holding all five the asker asks for kings (a lower priority
  // number, in the king-ask item, so it is considered first). Every contract
  // bid targets `agreed_suit` — the suit the partnership actually fixed.
  auctionItem(
    "slam-rkc-continuations",
    "Keycard continuations: sign off or bid the slam",
    "Having decoded the answer, the asker counts the partnership's keycards. Missing TWO or more, sign off at the five level in the agreed trump suit — the whole point of asking was to avoid a slam off two aces. Missing at most one, bid the small slam in the agreed suit. Holding all five keycards, ask for kings with 5NT instead. When the two-way answer (0-or-3, 1-or-4, 2-or-5) leaves the count genuinely unclear, take the safe route and sign off at five.",
    "convention",
    [
      rule(
        "small-slam",
        "Bid the small slam in the agreed suit",
        ctx("any", { ownLast: FOUR_NT, partnerLast: FIVE_SUIT, contested: false }),
        kcMissing(undefined, 1),
        bidSuit("agreed_suit", 6),
        32,
      ),
      rule(
        "sign-off",
        "Missing two keycards: stop at five",
        ctx("any", { ownLast: FOUR_NT, partnerLast: FIVE_SUIT, contested: false }),
        kcMissing(2),
        bidSuit("agreed_suit", 5),
        33,
      ),
      // Totality guard: a two-way step can leave the exact count ambiguous.
      // The deck's own caution ("the answer could push you a level higher with
      // danger of going down") says take the low road.
      rule(
        "sign-off-unclear",
        "Sign off at five (count unclear)",
        ctx("any", { ownLast: FOUR_NT, partnerLast: FIVE_SUIT, contested: false }),
        { all: [] },
        bidSuit("agreed_suit", 5),
        41,
      ),
    ],
    { sets: ["conventions"] },
  ),

  // ---- 5NT: guarantees all keycards, asks for SPECIFIC kings --------------
  // The deck's scheme is positional, not a count: "6 in a suit LOWER than
  // trumps shows that king and no lower king; 6 in the TRUMP suit shows no
  // lower king; do not show kings higher than trumps (it forces a grand)."
  // The language can say "holds the king of clubs" but has no "is this suit
  // below trumps" predicate, so below-trumps is expressed as "this suit is not
  // the fit, and no cheaper suit is the fit either": with hearts agreed, the
  // ♥K step is off (hearts IS the fit) and the ♠K step does not exist at all,
  // because spades can never be below trumps. Rules ascend by suit, so the
  // cheapest king shown is automatically the lowest one held — which is what
  // "and no lower king" means.
  auctionItem(
    "slam-rkc-king-ask",
    "5NT king ask (grand-slam try)",
    "With all five keycards accounted for, 5NT GUARANTEES all the keycards and asks for specific kings. Partner answers by bidding six of a suit LOWER than trumps to show that king and deny any lower king; six of the trump suit shows no king below trumps. A king HIGHER than trumps is never shown — bidding it would force the partnership past the small slam into a grand. The asker then bids seven in the agreed suit with the deck's grand-slam requirement (37 points) and settles for six otherwise.",
    "convention",
    [
      rule(
        "ask-kings",
        "5NT: all five keycards, ask for kings",
        ctx("any", { ownLast: FOUR_NT, partnerLast: FIVE_SUIT, contested: false }),
        combKc(5),
        bid(5, "N"),
        30,
        {
          // The steps promise a NAMED king, which `AskResponseMeaning` cannot
          // express (it carries counts only), and the map is keyed by CALL, so
          // it cannot know which suit is trumps. Six of ♣/♦/♥ is therefore
          // either "that king, no lower king" (one king below trumps) or the
          // trump-suit answer "no king below trumps" (none) — a genuine two-way
          // set, written as such. 6♠ is not ambiguous: spades can never be
          // BELOW trumps, so a 6♠ answer is always the trump-suit step and
          // always promises no king below trumps. The positional content lives
          // in the response rules' own conditions.
          ask: ask(RKC_KINGS, {
            "6C": { kings: [0, 1] },
            "6D": { kings: [0, 1] },
            "6H": { kings: [0, 1] },
            "6S": { kings: [0] },
          }),
        },
      ),
      rule(
        "king-c",
        "6♣: the club king (no lower king exists)",
        ctx("any", { askInProgress: RKC_KINGS, contested: false }),
        all({ holds: { suit: "C", rank: 13 } }, not(fit("C"))),
        bid(6, "C"),
        34,
      ),
      rule(
        "king-d",
        "6♦: the diamond king, denying the club king",
        ctx("any", { askInProgress: RKC_KINGS, contested: false }),
        all({ holds: { suit: "D", rank: 13 } }, not(fit("D")), not(fit("C"))),
        bid(6, "D"),
        35,
      ),
      rule(
        "king-h",
        "6♥: the heart king, denying the lower kings",
        ctx("any", { askInProgress: RKC_KINGS, contested: false }),
        all(
          { holds: { suit: "H", rank: 13 } },
          not(fit("H")),
          not(fit("D")),
          not(fit("C")),
        ),
        bid(6, "H"),
        36,
      ),
      // Six of the trump suit: no king BELOW trumps. Also the correct call for
      // a hand whose only king is above trumps — that king is never shown.
      rule(
        "king-none",
        "Six in the trump suit: no king below trumps",
        ctx("any", { askInProgress: RKC_KINGS, contested: false }),
        { all: [] },
        bidSuit("agreed_suit", 6),
        37,
      ),
      // The asker's decision after the king answer. The deck gives the grand
      // requirement in its point table (slide 15: seven needs 37 with 8+
      // trumps); slide 49 only says that showing a king above trumps would
      // "force a grand", so the threshold is exposed as a setting.
      rule(
        "grand",
        "Bid seven in the agreed suit",
        ctx("any", { ownLast: is("5N"), partnerLast: SIX_LEVEL, contested: false }),
        combHcp(low("g_slam_grand_values")),
        bidSuit("agreed_suit", 7),
        38,
      ),
      rule(
        "settle-for-six",
        "Settle for the small slam in the agreed suit",
        ctx("any", { ownLast: is("5N"), partnerLast: SIX_LEVEL, contested: false }),
        { all: [] },
        bidSuit("agreed_suit", 6),
        39,
      ),
      // When partner's answer already reached six of the agreed suit there is
      // nothing left to bid — pass rather than climb.
      rule(
        "decline-grand",
        "Pass partner's six-level answer",
        ctx("any", { ownLast: is("5N"), partnerLast: SIX_LEVEL, contested: false }),
        { all: [] },
        passAction,
        40,
      ),
    ],
    {
      settings: [
        toggle(
          "g_slam_king_ask_on",
          "5NT king ask",
          true,
          "With all five keycards, 5NT asks for specific kings (slide 49).",
        ),
        range("g_slam_grand_values", "Combined points to bid a grand slam", 37, 40, {
          min: 30,
          max: 40,
        }),
      ],
      sets: ["conventions"],
    },
  ),

  // Slide 49's "When NOT to use RKC" list. Two of the three cases are real
  // gates on the ask above: the strength test (the combined-points setting)
  // keeps the five level safe, and the void case is a hard condition. The
  // "worthless doubleton" case has no predicate in the language — there is no
  // way to say "a doubleton with no honor in it" — so it stays judgment for
  // the human, and Exclusion Blackwood is named but not authored (the deck
  // gives no response scheme for it).
  item(
    "slam-rkc-when-not-to-use",
    "When NOT to ask for keycards",
    "The deck lists three situations in which 4NT is the wrong call even with a fit. (1) When the ANSWER could push you a level higher than you can stand — if a 5♦ reply lands you in a contract you cannot make, do not ask; the keycard trigger therefore requires the deck's slam values so the five level is safe before the question is posed. (2) With a WORTHLESS DOUBLETON, where two quick losers can beat the slam however the keycards divide — this is human judgment; the machine cannot see the difference between a worthless doubleton and a useful one. (3) With a VOID, where keycard answers do not measure the right thing: use Exclusion Blackwood instead. The trigger stands down with a void; Exclusion itself is named by the deck but given no response scheme, so it is not authored here.",
    "judgment_guideline",
    "auction",
    { kind: "none" },
    { sets: ["conventions"] },
  ),

  // =========================================================================
  // Slide 50 — FOURTH SUIT FORCING
  // =========================================================================
  // The deck's example: AQ862, 843, Q7, A65 after 1♦–1♠–2♣–? Responder bids the
  // fourth suit; it is conventionally a GAME FORCE (some partnerships play it
  // as a one-round force — the deck names both, the default here is the deck's
  // "conventionally game force"). Opener then bids: three-card support for
  // responder's FIRST suit; notrump with the fourth suit stopped; the fourth
  // suit itself with four cards in it; or some other natural bid.
  //
  // The fourth suit is `only_unbid_suit` (it resolves exactly when the other
  // three have been bid), and declaring the bid an ASK is what lets opener's
  // answers match "the fourth-suit question is pending" instead of a bare
  // "partner bid a suit" pattern that would hijack every natural auction.
  auctionItem(
    "slam-fourth-suit-forcing",
    "Fourth suit forcing",
    "When the partnership has bid three suits, responder's bid of the FOURTH suit is artificial and forcing — conventionally a game force. It shows game-going values with no clear natural call: no fit worth showing for opener's suit and no stopper in the fourth suit for notrump. Opener then describes: three-card support for responder's FIRST suit; notrump with the fourth suit stopped; the fourth suit itself holding four cards in it; or some other natural bid (rebidding his own first suit).",
    "convention",
    [
      rule(
        "ask",
        "Bid the fourth suit (game force)",
        ctx("responder", { contested: false, roundMin: 2 }),
        all(
          hcp(low("g_slam_4sf_values")),
          len("partner_first_bid_suit", undefined, 3),
          not(stopper("only_unbid_suit")),
        ),
        bidSuit("only_unbid_suit"),
        25,
        {
          // Forcing: partner must not pass (the forcing item below suppresses
          // the pass), and `shows` carries the game-going range plus the
          // forcing flag into the inference layer. `responses` is empty — the
          // answers are natural bids, not decoded steps.
          shows: shows({ hcp: { min: 12 }, forcing: true }),
          ask: ask(FSF, {}),
        },
      ),
      rule(
        "answer-support",
        "Three-card support for responder's first suit",
        ctx("opener", { askInProgress: FSF, contested: false }),
        len("partner_first_bid_suit", 3),
        bidSuit("partner_first_bid_suit"),
        26,
      ),
      rule(
        "answer-nt",
        "Notrump with the fourth suit stopped",
        ctx("opener", { askInProgress: FSF, contested: false }),
        stopper("partner_last_bid_suit"),
        firstLegal("2N", "3N"),
        27,
      ),
      rule(
        "answer-fourth-suit",
        "Four cards in the fourth suit",
        ctx("opener", { askInProgress: FSF, contested: false }),
        len("partner_last_bid_suit", 4),
        bidSuit("partner_last_bid_suit"),
        28,
      ),
      rule(
        "answer-natural",
        "Some other natural bid (rebid the first suit)",
        ctx("opener", { askInProgress: FSF, contested: false }),
        { all: [] },
        bidSuit("own_first_bid_suit"),
        29,
      ),
    ],
    {
      settings: [
        toggle(
          "g_slam_4sf_on",
          "Fourth suit forcing",
          true,
          "The fourth suit is artificial and forcing to game (slide 50).",
        ),
        range("g_slam_4sf_values", "Fourth suit forcing: game-going values", 12, 21, {
          min: 8,
          max: 30,
        }),
      ],
      sets: ["conventions"],
    },
  ),

  // The colour semantics of the row: fourth suit forcing is a FORCE, so pass is
  // not an available call for opener. Scoped by the pending ask, which is the
  // only way to name "the fourth suit was just bid" in the language.
  item(
    "slam-fourth-suit-forcing-is-forcing",
    "Fourth suit forcing: pass is not available",
    "The fourth suit is a force. With the fourth-suit question pending, opener may not pass — he must describe his hand (support, notrump with the fourth suit stopped, four cards in the fourth suit, or another natural bid). Played as the deck presents it, it is a game force, so the auction continues to game.",
    "agreement",
    "auction",
    {
      kind: "forcing_rules",
      rules: [
        forcing(
          "fsf-force",
          "Fourth suit forcing — opener must not pass",
          ctx("opener", { askInProgress: FSF, contested: false }),
          10,
        ),
      ],
    },
    { sets: ["conventions"] },
  ),
];

// ---------------------------------------------------------------------------
// Rule builders — the repeated rows of slides 47 and 48, spelled out per suit
// so each one can carry an honest `shows` (a `shows` suit must be a literal
// suit; "own_shortest_suit" cannot be expressed there).
// ---------------------------------------------------------------------------

/** 1M–2NT–3x: a singleton (or void) in the bid side suit.
 *
 *  The `hcp` half of `shows` is not decoration. Slide 48's other rows name what
 *  the bidder is ("3M = OPENING HAND with extras", "4M = OPENING HAND with a
 *  minimum"), so every row of this table is an opening hand — slide 24's
 *  12–21. Publishing that floor is what lets responder's later partnership
 *  arithmetic work at all: `combinedHcp`/`partnerShownHcp` read partner's shown
 *  HCP floor, and the 1♥/1♠ opening publishes TOTAL points, so without an HCP
 *  floor here partner's floor stays 0 and every combined test downstream (fast
 *  arrival's extras test, the keycard ask's slam values) is unsatisfiable. */
function shortness(major: "H" | "S", side: "C" | "D" | "H" | "S", priority: number) {
  return rule(
    `short-${side.toLowerCase()}-over-1${major.toLowerCase()}`,
    `Three of ${side}: singleton in the bid suit`,
    ctx("opener", { ownFirst: is(`1${major}`), partnerLast: is("2N"), contested: false }),
    len(side, undefined, 1),
    bid(3, side),
    priority,
    { shows: shows({ hcp: { min: 12, max: 21 }, suits: [{ suit: side, max: 1 }] }) },
  );
}

/** 1M–2NT–4x: a second five-card suit. */
function secondSuit(major: "H" | "S", side: "C" | "D" | "H" | "S", priority: number) {
  return rule(
    `second-${side.toLowerCase()}-over-1${major.toLowerCase()}`,
    `Four of ${side}: second five-card suit`,
    ctx("opener", { ownFirst: is(`1${major}`), partnerLast: is("2N"), contested: false }),
    len(side, 5),
    bid(4, side),
    priority,
    { shows: shows({ hcp: { min: 12, max: 21 }, suits: [{ suit: side, min: 5 }] }) },
  );
}

// ---- slide 47's four rules ------------------------------------------------

/** 1M–2x–(opener's rebid)–3M: a slower bid, so extras and slam interest. */
function rule_slowExtras() {
  return rule(
    "slow-extras",
    "Below game with extras (2/1 auction)",
    ctx("responder", {
      opening: MAJOR_OPENING,
      ownFirst: bidAt({ level: 2, strains: ["C", "D", "H"] }),
      partnerLast: anyBid,
      contested: false,
    }),
    all(
      len("partner_first_bid_suit", 3),
      // Extras RELATIVE TO WHAT I HAVE SHOWN: my 2-level game force promised
      // 12+, so 15+ is extra, and partner's opening has shown 12+ — the
      // "strength already shown" the slide talks about is the pair's.
      hcp(15),
      partnerHcp(12),
    ),
    bidSuit("partner_first_bid_suit", 3),
    26,
    { shows: shows({ hcp: { min: 15 } }) },
  );
}

/** 1M–2x–(opener's rebid)–4M: the jump to game, so a minimum. */
function rule_fastGame() {
  return rule(
    "fast-game",
    "Jump to game shows a minimum (2/1 auction)",
    ctx("responder", {
      opening: MAJOR_OPENING,
      ownFirst: bidAt({ level: 2, strains: ["C", "D", "H"] }),
      partnerLast: anyBid,
      contested: false,
    }),
    all(
      len("partner_first_bid_suit", 3),
      hcp(low("g_slam_fast_arrival_min"), high("g_slam_fast_arrival_min")),
      // NO fresh combined-points test here. Slide 47's premise is that the
      // auction is ALREADY game forcing, so game is agreed before this call and
      // the jump only chooses minimum-vs-extras. Slide 15's 26 would in fact
      // FORBID the slide's own example: a ~12 HCP responder opposite the 12 that
      // a 2/1 rebid promises is 24 shown points, so gating on 26 would make
      // 1♥–2♣–2♦–4♥ unbiddable.
    ),
    bidSuit("partner_first_bid_suit", 4),
    27,
    { shows: shows({ hcp: { min: 12, max: 14 } }) },
  );
}

/** 1M–2NT–(opener's answer)–3M: slower, so extras over the Jacoby raise. */
function rule_slowExtrasJacoby() {
  return rule(
    "slow-extras-jacoby",
    "Below game with extras (after Jacoby 2NT)",
    ctx("responder", {
      opening: MAJOR_OPENING,
      ownLast: is("2N"),
      partnerLast: bidAt({ min: 3, max: 4, strains: ["C", "D", "H", "S"] }),
      contested: false,
    }),
    all(fit("agreed_suit", 8), hcp(15), partnerHcp(12)),
    bidSuit("partner_first_bid_suit", 3),
    28,
    { shows: shows({ hcp: { min: 15 } }) },
  );
}

/** 1M–2NT–(opener's answer)–4M: the jump to game, so a minimum raise. */
function rule_fastGameJacoby() {
  return rule(
    "fast-game-jacoby",
    "Jump to game shows a minimum (after Jacoby 2NT)",
    ctx("responder", {
      opening: MAJOR_OPENING,
      ownLast: is("2N"),
      partnerLast: bidAt({ min: 3, max: 4, strains: ["C", "D", "H", "S"] }),
      contested: false,
    }),
    all(
      fit("agreed_suit", 8),
      hcp(low("g_slam_fast_arrival_min"), high("g_slam_fast_arrival_min")),
      // As in the 2/1 branch: Jacoby 2NT already forced to game, so no fresh
      // 26-point test — the deck's own example (12 HCP opposite a 12+ opener)
      // would fail one.
    ),
    bidSuit("partner_first_bid_suit", 4),
    29,
    { shows: shows({ hcp: { min: 12, max: 14 } }) },
  );
}

/** Slide(s) each item was authored from — install.ts turns these into citations. */
export const SLAM_SLIDES: Record<string, number[]> = {
  "slam-fast-arrival": [47],
  "slam-jacoby-2nt-rebids": [48, 47],
  "slam-jacoby-2nt-3nt-undiscussed": [48],
  "slam-jacoby-2nt-is-forcing": [48, 24],
  "slam-rkc-ask": [49, 15],
  "slam-rkc-responses": [49],
  "slam-rkc-continuations": [49],
  "slam-rkc-king-ask": [49, 15],
  "slam-rkc-when-not-to-use": [49],
  "slam-fourth-suit-forcing": [50],
  "slam-fourth-suit-forcing-is-forcing": [50],
};

/** Stage wiring: every keycard stage needs the ask that poses the question. */
export const SLAM_EDGES: TemplateEdge[] = [
  { from: "slam-rkc-responses", edgeType: "requires", to: "slam-rkc-ask" },
  { from: "slam-rkc-continuations", edgeType: "requires", to: "slam-rkc-ask" },
  { from: "slam-rkc-king-ask", edgeType: "requires", to: "slam-rkc-ask" },
  { from: "slam-rkc-when-not-to-use", edgeType: "requires", to: "slam-rkc-ask" },
  { from: "slam-fourth-suit-forcing-is-forcing", edgeType: "requires", to: "slam-fourth-suit-forcing" },
  { from: "slam-jacoby-2nt-3nt-undiscussed", edgeType: "requires", to: "slam-jacoby-2nt-rebids" },
  { from: "slam-jacoby-2nt-is-forcing", edgeType: "requires", to: "slam-jacoby-2nt-rebids" },
];

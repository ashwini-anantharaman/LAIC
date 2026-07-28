// Competitive bidding, exactly as the teaching deck presents it
// (slides 35–41 + the doubles catalog on slide 51).
//
// WHAT THE DECK ACTUALLY SAYS, and how it lands here:
//  * s35 — WHY interfere. Prose only, so it is a judgment item, not rules.
//  * s36 — the OVERCALL table (four rows: 1-level 8–17, 2-level 12–17, 1NT
//    15–18 with a stopper, jump = 6–11 preempt) plus advancer's four actions.
//    The deck's 1-level floor of EIGHT HCP is deliberately wide — it is
//    encoded as the deck wrote it and exposed as `g_cmp_overcall_1lvl_hcp`
//    so a partnership that wants a sounder overcall dials the floor up
//    instead of us silently "correcting" the deck.
//  * s37 — the takeout double: the six "double, then X" rows (by strength)
//    and advancer's six actions, including the PENALTY PASS and the cue-bid
//    game force.
//  * s38 — Michaels and the Unusual 2NT (both strictly 5-5).
//  * s39 — Drury (2♣ by a PASSED hand over a 3rd/4th-seat major opening).
//  * s40 — support double / redouble: the double shows EXACTLY three-card
//    support, a raise shows four, played only up to the level of 2♥, and NOT
//    when responder's suit is diamonds.
//  * s41 — Lebensohl over interference on our 1NT.
//  * s51 — SEVEN named kinds of double. The fellows' complaint was that
//    doubles were undifferentiated, so each kind is its own item with its own
//    enable toggle: takeout (`g_cmp_dbl_takeout_on`, the item authored from
//    s37), negative, support (the s40 item), reopening/balancing, responsive,
//    maximal and Rosenkranz. Turn any one off without touching the others.
//
// BAND DISCIPLINE / PRIORITY ORDERING (same numbering as the SAYC chapter, so
// the two templates behave comparably): artificial and conventional calls get
// the LOW numbers so they are considered before the natural ladder —
//   20–22 Drury · 23–26 Lebensohl relays · 25–27 Michaels · 28–30 Unusual 2NT
//   29–31 preemptive jump overcalls (the 2-level rung is split per opening
//   suit, since only some two-level bids are genuine jumps) ·
//   30–31 takeout double · 31–38 support double / responsive / maximal /
//   Rosenkranz · 32–39 advancer over a takeout double · 36–39 advances of an
//   overcall · 38–45 the doubler's second call · 39–47 the 1NT overcall and
//   its advances · 40–44 natural overcalls and natural weak actions ·
//   49 the reopening (balancing) double.
//
// Numbers the deck does NOT state are never buried: they are either derived
// from the deck's own example hands (and said so in the item text) or exposed
// as a setting.

import {
  all,
  any,
  anyBid,
  auctionItem,
  bal,
  bid,
  bidAt,
  bidLongest,
  bidSuit,
  combHcp,
  ctx,
  dbl,
  doubled,
  firstLegal,
  forcing,
  hcp,
  high,
  is,
  item,
  len,
  longestAmong,
  low,
  not,
  pass,
  passed,
  quality,
  raise,
  range,
  rdbl,
  rule,
  stopper,
  toggle,
  tp,
  type TemplateItem,
} from "@bridge/sayc-template/dsl";

/** Their opening, one level, any suit — the direct-seat trigger. */
const THEIR_1_SUIT = bidAt({ level: 1, strains: ["C", "D", "H", "S"] });
/** Their opening at the one OR two level (a weak two is still an opening). */
const THEIR_1_OR_2 = bidAt({ min: 1, max: 2, strains: ["C", "D", "H", "S"] });
/** A suit bid at the one level (partner's overcall, RHO's intervention…). */
const ONE_LEVEL = bidAt({ level: 1, strains: ["C", "D", "H", "S"] });
const TWO_LEVEL = bidAt({ level: 2, strains: ["C", "D", "H", "S"] });

/** An honor (A, K or Q) in partner's suit — the Rosenkranz promise. */
const HONOR_IN_PARTNERS_SUIT = any(
  { holds: { suit: "partner_last_bid_suit", rank: 14 } },
  { holds: { suit: "partner_last_bid_suit", rank: 13 } },
  { holds: { suit: "partner_last_bid_suit", rank: 12 } },
);

export const COMPETITIVE: TemplateItem[] = [
  // -------------------------------------------------------------------------
  // Slide 35 — why compete at all (prose)
  // -------------------------------------------------------------------------
  item(
    "cmp-why-compete",
    "Why interfere over their opening",
    "Three reasons to bid over an opponent's opening bid: to FIND A FIT and play there when the hand belongs to us; to TAKE AWAY BIDDING SPACE so they cannot describe their hands; and to SUGGEST A GOOD OPENING LEAD to partner. Remember what their opening tells you: there are 12+ HCP sitting over there, so the hand may well be theirs — interference is judged against that, not against a silent auction.",
    "judgment_guideline",
    "auction",
    { kind: "none" },
  ),

  // -------------------------------------------------------------------------
  // Slide 36 — the overcall table, row by row
  // -------------------------------------------------------------------------
  auctionItem(
    "cmp-overcall-one-level",
    "One-level overcall",
    "Five-plus cards in the suit and 8–17 HCP: overcall at the one level. The deck's floor of EIGHT is deliberately wide — it treats a one-level overcall as a cheap, descriptive, space-stealing call rather than an opening bid — and the whole 8–17 band is exposed as a setting, so a partnership that plays sounder overcalls raises the floor instead of rewriting the item.",
    "agreement",
    [
      rule(
        "one-level",
        "One-level overcall (5+ suit, 8–17)",
        ctx("overcaller", { rhoLast: THEIR_1_SUIT }),
        all(
          hcp(low("g_cmp_overcall_1lvl_hcp"), high("g_cmp_overcall_1lvl_hcp")),
          len("own_longest_suit", 5),
        ),
        bidLongest(["S", "H", "D", "C"], 1),
        40,
        { shows: { hcp: { min: 8, max: 17 } } },
      ),
    ],
    {
      settings: [
        range("g_cmp_overcall_1lvl_hcp", "One-level overcall range (HCP)", 8, 17, {
          min: 4,
          max: 20,
        }),
      ],
    },
  ),

  auctionItem(
    "cmp-overcall-two-level",
    "Two-level (non-jump) overcall",
    "Five-plus cards in the suit and 12–17 HCP for a NON-JUMP overcall at the two level: the extra level costs four more points than the one-level overcall's floor of 8. Example from the deck: ♠xx ♥AQJxx ♦AQx ♣xxx — 2♥ over their 1♠ (13 HCP).",
    "agreement",
    [
      rule(
        "two-level",
        "Two-level non-jump overcall (5+ suit, 12–17)",
        ctx("overcaller", { rhoLast: THEIR_1_OR_2 }),
        all(
          hcp(low("g_cmp_overcall_2lvl_hcp"), high("g_cmp_overcall_2lvl_hcp")),
          len("own_longest_suit", 5),
        ),
        bidLongest(["S", "H", "D", "C"], 2),
        41,
        { shows: { hcp: { min: 12, max: 17 } } },
      ),
    ],
    {
      settings: [
        range("g_cmp_overcall_2lvl_hcp", "Two-level overcall range (HCP)", 12, 17, {
          min: 8,
          max: 20,
        }),
      ],
    },
  ),

  auctionItem(
    "cmp-overcall-1nt",
    "1NT overcall",
    "A direct 1NT overcall shows 15–18 HCP with a stopper in their suit — the same floor as the deck's 15–17 1NT opening but a point wider at the top, because the overcall is made with a known 12+ sitting to your right. The deck's example hand (♠AQx ♥KJx ♦QJxx ♣Kxx, 16 HCP) is balanced, so the rule requires a balanced hand as well as the stopper.",
    "agreement",
    [
      rule(
        "overcall",
        "1NT overcall (15–18, stopper)",
        ctx("overcaller", { rhoLast: THEIR_1_SUIT }),
        all(
          bal(),
          hcp(low("g_cmp_overcall_1nt_hcp"), high("g_cmp_overcall_1nt_hcp")),
          stopper("rho_bid_suit"),
        ),
        bid(1, "N"),
        39,
        { shows: { hcp: { min: 15, max: 18 } } },
      ),
    ],
    {
      settings: [
        range("g_cmp_overcall_1nt_hcp", "1NT overcall range (HCP)", 15, 18, { min: 12, max: 21 }),
      ],
    },
  ),

  auctionItem(
    "cmp-overcall-jump",
    "Jump overcall (preemptive)",
    "A JUMP overcall is purely preemptive: 6–11 HCP with a long suit — the deck's example is ♠AQJxxx and 2♠ over their 1♥. The deck says continuations after a jump overcall are the same as after an opening preempt, so the suit-length ladder is the one from its opening table: six cards jump to the two level, seven to the three level, eight to the four level. The two-level rung is written out per opening suit, because a two-level bid is only sometimes a JUMP: over 1♣ the jumps are 2♦/2♥/2♠, over 1♦ only 2♥/2♠, over 1♥ only 2♠, and over 1♠ there is no two-level jump at all — a six-card suit that cannot jump simply has no preemptive overcall, since a simple two-level overcall is the deck's 12–17 row.",
    "agreement",
    [
      rule(
        "jump-four",
        "Jump overcall to the four level (8-card suit)",
        ctx("overcaller", { rhoLast: THEIR_1_SUIT }),
        all(
          hcp(low("g_cmp_overcall_jump_hcp"), high("g_cmp_overcall_jump_hcp")),
          len("own_longest_suit", 8),
        ),
        bidLongest(["S", "H", "D", "C"], 4),
        29,
        { shows: { hcp: { min: 6, max: 11 } } },
      ),
      rule(
        "jump-three",
        "Jump overcall to the three level (7-card suit)",
        ctx("overcaller", { rhoLast: THEIR_1_SUIT }),
        all(
          hcp(low("g_cmp_overcall_jump_hcp"), high("g_cmp_overcall_jump_hcp")),
          len("own_longest_suit", 7),
        ),
        bidLongest(["S", "H", "D", "C"], 3),
        30,
        { shows: { hcp: { min: 6, max: 11 } } },
      ),
      // The 2-level rung has to be split by THEIR opening suit, because only
      // some two-level bids are actually JUMPS. Over 1♣ the jumps are 2♦/2♥/2♠;
      // over 1♦ only 2♥/2♠ (2♦ is the Michaels cue, 2♣ is a simple overcall);
      // over 1♥ only 2♠; over 1♠ there is NO two-level jump at all. Without the
      // split a 6–11 hand would make a SIMPLE two-level overcall, which the
      // deck's own second row prices at 12–17.
      rule(
        "jump-two-over-1c",
        "Jump overcall to the two level over 1♣ (6-card suit)",
        ctx("overcaller", { rhoLast: is("1C") }),
        all(
          hcp(low("g_cmp_overcall_jump_hcp"), high("g_cmp_overcall_jump_hcp")),
          len("own_longest_suit", 6),
          longestAmong("S", "H", "D"),
        ),
        bidLongest(["S", "H", "D"], 2),
        31,
        { shows: { hcp: { min: 6, max: 11 } } },
      ),
      rule(
        "jump-two-over-1d",
        "Jump overcall to the two level over 1♦ (6-card major)",
        ctx("overcaller", { rhoLast: is("1D") }),
        all(
          hcp(low("g_cmp_overcall_jump_hcp"), high("g_cmp_overcall_jump_hcp")),
          len("own_longest_suit", 6),
          longestAmong("S", "H"),
        ),
        bidLongest(["S", "H"], 2),
        31,
        { shows: { hcp: { min: 6, max: 11 } } },
      ),
      rule(
        "jump-two-over-1h",
        "Jump overcall to 2♠ over 1♥ (6 spades)",
        ctx("overcaller", { rhoLast: is("1H") }),
        all(
          hcp(low("g_cmp_overcall_jump_hcp"), high("g_cmp_overcall_jump_hcp")),
          len("S", 6),
          longestAmong("S"),
        ),
        bid(2, "S"),
        31,
        { shows: { hcp: { min: 6, max: 11 }, suits: [{ suit: "S", min: 6 }] } },
      ),
    ],
    {
      settings: [
        range("g_cmp_overcall_jump_hcp", "Jump (preemptive) overcall range (HCP)", 6, 11, {
          min: 0,
          max: 14,
        }),
      ],
    },
  ),

  auctionItem(
    "cmp-advance-overcall",
    "Advancing partner's overcall",
    "The deck gives advancer three actions over a simple overcall. RAISE with 6–9 HCP and three-plus support (♠Qxx ♥xxx ♦KQx ♣xxxx raises 1♠ to 2♠). CUE-BID opener's suit for a GOOD raise — the same shape with a working ace (♠Qxx ♥xxx ♦KQx ♣Axxx bids 2♥ over their 1♥). A NEW SUIT is constructive but NON-FORCING (♠Qx ♥xxx ♦AKxxx ♣Kxx bids 2♦). The deck prices the raise at 6–9 and calls the cue a \"good raise\"; the cue-bid floor and the constructive new-suit band come from its own example hands (the cue hand is 11 HCP, the new-suit hand 12) and are settings — the new-suit band therefore runs 8–12, which is the band that actually admits the deck's example.",
    "agreement",
    [
      rule(
        "cue-good-raise",
        "Cue-bid: the good raise",
        ctx("advancer", { partnerLast: anyBid, lhoLast: anyBid }),
        all(hcp(low("g_cmp_advance_cue_hcp")), len("partner_last_bid_suit", 3)),
        bidSuit("lho_bid_suit"),
        36,
        { shows: { hcp: { min: 10 } } },
      ),
      rule(
        "raise-one-level",
        "Raise a one-level overcall (6–9)",
        ctx("advancer", { partnerLast: ONE_LEVEL }),
        all(
          hcp(low("g_cmp_advance_raise_hcp"), high("g_cmp_advance_raise_hcp")),
          len("partner_last_bid_suit", 3),
        ),
        raise(2),
        37,
        { shows: { hcp: { min: 6, max: 9 } } },
      ),
      rule(
        "raise-two-level",
        "Raise a two-level overcall (6–9)",
        ctx("advancer", { partnerLast: TWO_LEVEL }),
        all(
          hcp(low("g_cmp_advance_raise_hcp"), high("g_cmp_advance_raise_hcp")),
          len("partner_last_bid_suit", 3),
        ),
        raise(3),
        38,
        { shows: { hcp: { min: 6, max: 9 } } },
      ),
      rule(
        "new-suit",
        "New suit — constructive, NON-forcing",
        ctx("advancer", { partnerLast: anyBid }),
        all(
          hcp(low("g_cmp_advance_new_suit_hcp"), high("g_cmp_advance_new_suit_hcp")),
          len("own_longest_suit", 5),
        ),
        bidLongest(["S", "H", "D", "C"]),
        42,
        { shows: { hcp: { min: 8, max: 12 }, forcing: false } },
      ),
    ],
    {
      settings: [
        range("g_cmp_advance_raise_hcp", "Advancer's raise of an overcall (HCP)", 6, 9, {
          min: 0,
          max: 14,
        }),
        range("g_cmp_advance_cue_hcp", "Advancer's cue-bid — good raise (HCP)", 10, 14, {
          min: 7,
          max: 20,
        }),
        range(
          "g_cmp_advance_new_suit_hcp",
          "Advancer's constructive new suit (HCP)",
          8,
          12,
          { min: 4, max: 16 },
        ),
      ],
    },
  ),

  auctionItem(
    "cmp-advance-over-1nt-overcall",
    "Advancing a 1NT overcall — same as over a 1NT opening",
    "The deck's rule for the 1NT overcall is explicit: \"continuations are the same as after an opening 1NT\" — Stayman and transfers. So over partner's 1NT overcall, 2♦ transfers to hearts and 2♥ transfers to spades with a five-plus card major (overcaller completes), and 2♣ is Stayman with 8+ HCP and a four-card major (overcaller bids 2♥ or 2♠ with a four-card major, 2♦ without one). Transfers are tried before Stayman because the deck's 1NT table shows a five-card major via a transfer and only a four-card major via 2♣.",
    "convention",
    [
      rule(
        "transfer-hearts",
        "2♦ transfer to hearts (5+ hearts)",
        ctx("advancer", { partnerLast: is("1N"), contested: true }),
        len("H", 5),
        bid(2, "D"),
        40,
        { shows: { suits: [{ suit: "H", min: 5 }] } },
      ),
      rule(
        "transfer-spades",
        "2♥ transfer to spades (5+ spades)",
        ctx("advancer", { partnerLast: is("1N"), contested: true }),
        len("S", 5),
        bid(2, "H"),
        41,
        { shows: { suits: [{ suit: "S", min: 5 }] } },
      ),
      rule(
        "stayman",
        "2♣ Stayman (8+, four-card major)",
        ctx("advancer", { partnerLast: is("1N"), contested: true }),
        all(hcp(8), any(len("S", 4), len("H", 4))),
        bid(2, "C"),
        42,
        { shows: { hcp: { min: 8 } } },
      ),
      rule(
        "complete-hearts",
        "Complete the transfer to hearts",
        ctx("overcaller", { ownLast: is("1N"), partnerLast: is("2D") }),
        { all: [] },
        bid(2, "H"),
        43,
      ),
      rule(
        "complete-spades",
        "Complete the transfer to spades",
        ctx("overcaller", { ownLast: is("1N"), partnerLast: is("2H") }),
        { all: [] },
        bid(2, "S"),
        44,
      ),
      rule(
        "stayman-reply-hearts",
        "Stayman reply: four hearts",
        ctx("overcaller", { ownLast: is("1N"), partnerLast: is("2C") }),
        len("H", 4),
        bid(2, "H"),
        45,
        { shows: { suits: [{ suit: "H", min: 4 }] } },
      ),
      rule(
        "stayman-reply-spades",
        "Stayman reply: four spades",
        ctx("overcaller", { ownLast: is("1N"), partnerLast: is("2C") }),
        len("S", 4),
        bid(2, "S"),
        46,
        { shows: { suits: [{ suit: "S", min: 4 }] } },
      ),
      rule(
        "stayman-reply-none",
        "Stayman reply: no four-card major",
        ctx("overcaller", { ownLast: is("1N"), partnerLast: is("2C") }),
        { all: [] },
        bid(2, "D"),
        47,
      ),
    ],
    {
      settings: [
        toggle(
          "g_cmp_1nt_overcall_advances_on",
          "Stayman and transfers over a 1NT overcall",
          true,
          "The deck says continuations after a 1NT overcall are the same as after a 1NT opening.",
        ),
      ],
      sets: ["conventions"],
    },
  ),

  item(
    "cmp-advance-same-as-opening",
    "Advances borrow the uncontested machinery",
    "Two cross-references the deck states rather than tabulates. After a 1NT OVERCALL, continuations are the same as after an opening 1NT: Stayman and transfers, with the same strength bands (they are mechanized as their own item). After a JUMP (preemptive) overcall, continuations are the same as after an opening preempt: partner is describing a long suit and 6–11 HCP, so raise to the level the fit justifies or pass — do not treat a new suit as a strong probe. Nothing new has to be learned for either auction.",
    "concept",
    "auction",
    { kind: "none" },
  ),

  // -------------------------------------------------------------------------
  // Slide 37 (+ 51) — the takeout double
  // -------------------------------------------------------------------------
  auctionItem(
    "cmp-takeout-double",
    "Takeout double",
    "Slide 51 names it first among the seven doubles: a takeout double of (1♥) is SHORT in hearts with support for the other suits. Slide 37 prices it: an opening hand (12–17, the setting) with shortness in their suit doubles, and so does any 18+ hand regardless of shape — the strong hands double first and describe on the next round. Partner is expected to BID — the one exception the deck allows is the PENALTY PASS with length in opener's suit, which is why the double is marked forcing for inference but pass is never machine-suppressed. This item is one of the seven per-kind double toggles, so takeout doubles can be switched off on their own.",
    "convention",
    [
      rule(
        "double",
        "Takeout double of a one-level opening",
        ctx("overcaller", { rhoLast: THEIR_1_SUIT }),
        any(
          all(
            hcp(low("g_cmp_takeout_dbl_hcp"), high("g_cmp_takeout_dbl_hcp")),
            len("rho_bid_suit", undefined, 2),
          ),
          hcp(18),
        ),
        dbl,
        30,
        { shows: { hcp: { min: 12 }, forcing: true } },
      ),
    ],
    {
      settings: [
        toggle("g_cmp_dbl_takeout_on", "Takeout doubles (slide 51, kind 1)"),
        range("g_cmp_takeout_dbl_hcp", "Takeout double: opening-hand range (HCP)", 12, 17, {
          min: 9,
          max: 21,
        }),
      ],
      sets: ["conventions"],
    },
  ),

  auctionItem(
    "cmp-takeout-double-rebids",
    "The doubler's second call (double, then …)",
    "Slide 37's six rows are all about the doubler's SECOND call — the double itself says nothing about strength beyond \"opening values\", the follow-up does. Double then PASS = a plain opening hand with support for the other suits (through 17). Double then a SUIT = 18+ with a strong suit of its own (♠AJx ♥xx ♦AKJxx ♣AQx). Double then a RAISE = a strong raise of whatever partner bid; double then a JUMP raise = stronger still. Double then NT = 19–21 with a stopper; double then 3NT = 22+ with a stopper. The deck gives no numbers for the two raise rows: 16–18 and 19+ are read off its own example hands (♠AKxx ♥x ♦AQJx ♣Kxxx = 17 HCP for the simple raise, ♠AKxx ♥x ♦AKJx ♣AKxx = 22 for the jump) and the strong-raise band is a setting. NOTE a language limit: once RHO has passed, no suit reference resolves to the opponents' OPENING suit, so the stopper the deck requires for the NT rebids cannot be tested — the rules check balanced shape and strength only.",
    "convention",
    [
      rule(
        "jump-raise-one-level",
        "Double, then JUMP raise (19+, four-card support)",
        ctx("overcaller", { ownFirst: doubled, partnerLast: ONE_LEVEL, roundMin: 2 }),
        all(hcp(19), len("partner_last_bid_suit", 4)),
        raise(3),
        38,
        { shows: { hcp: { min: 19 } } },
      ),
      rule(
        "jump-raise-two-level",
        "Double, then JUMP raise of a two-level advance (19+)",
        ctx("overcaller", { ownFirst: doubled, partnerLast: TWO_LEVEL, roundMin: 2 }),
        all(hcp(19), len("partner_last_bid_suit", 4)),
        raise(4),
        39,
        { shows: { hcp: { min: 19 } } },
      ),
      rule(
        "then-3nt",
        "Double, then 3NT (22+, stopper)",
        ctx("overcaller", { ownFirst: doubled, partnerLast: anyBid, roundMin: 2 }),
        all(hcp(22), bal()),
        bid(3, "N"),
        40,
        { shows: { hcp: { min: 22 } } },
      ),
      rule(
        "then-nt",
        "Double, then notrump (19–21, stopper)",
        ctx("overcaller", { ownFirst: doubled, partnerLast: anyBid, roundMin: 2 }),
        all(hcp(19, 21), bal()),
        firstLegal("1N", "2N", "3N"),
        41,
        { shows: { hcp: { min: 19, max: 21 } } },
      ),
      rule(
        "then-suit",
        "Double, then a suit of my own (18+, strong suit)",
        ctx("overcaller", { ownFirst: doubled, partnerLast: anyBid, roundMin: 2 }),
        all(hcp(18), len("own_longest_suit", 5), quality("own_longest_suit")),
        bidLongest(["S", "H", "D", "C"]),
        42,
        { shows: { hcp: { min: 18 } } },
      ),
      rule(
        "then-raise-one-level",
        "Double, then raise (strong raise, 16–18)",
        ctx("overcaller", { ownFirst: doubled, partnerLast: ONE_LEVEL, roundMin: 2 }),
        all(
          hcp(low("g_cmp_dbl_raise_hcp"), high("g_cmp_dbl_raise_hcp")),
          len("partner_last_bid_suit", 3),
        ),
        raise(2),
        43,
        { shows: { hcp: { min: 16, max: 18 } } },
      ),
      rule(
        "then-raise-two-level",
        "Double, then raise a two-level advance (16–18)",
        ctx("overcaller", { ownFirst: doubled, partnerLast: TWO_LEVEL, roundMin: 2 }),
        all(
          hcp(low("g_cmp_dbl_raise_hcp"), high("g_cmp_dbl_raise_hcp")),
          len("partner_last_bid_suit", 3),
        ),
        raise(3),
        44,
        { shows: { hcp: { min: 16, max: 18 } } },
      ),
      rule(
        "then-pass",
        "Double, then PASS (plain opening hand)",
        ctx("overcaller", { ownFirst: doubled, partnerLast: anyBid, roundMin: 2 }),
        // The ceiling is the takeout double's own opening-hand band (s37 row 1
        // IS the plain opening hand), so dialing that band moves this row too.
        hcp(undefined, high("g_cmp_takeout_dbl_hcp")),
        pass,
        45,
        { shows: { hcp: { max: 17 } } },
      ),
    ],
    {
      settings: [
        toggle("g_cmp_dbl_takeout_rebids_on", "The doubler's second call (slide 37)"),
        range("g_cmp_dbl_raise_hcp", "Doubler's strong raise (HCP, deck states no range)", 16, 18, {
          min: 12,
          max: 22,
        }),
      ],
      sets: ["conventions"],
    },
  ),

  auctionItem(
    "cmp-advance-takeout-double",
    "Advancing partner's takeout double",
    "The deck gives advancer six actions, and tells you how to think about the hand: treat it as a NORMAL OPENING HAND with shortness in the opponents' suit — partner has promised support for your suits, so bid one. Best suit at the CHEAPEST level with 0–7. JUMP in a new suit with 8+ — written out per opening suit, because which level IS a jump depends on their opening (over 1♣ every jump is at the two level, over 1♠ every jump is at the three level). Cheapest NOTRUMP with 8–10 and a stopper in opener's suit. JUMP in notrump with 10+ and a DOUBLE stopper. CUE-BID opener's suit as a GAME FORCE when it is unclear where to play. And PASS — the penalty pass — when you hold lots of opener's suit and would rather defend. (The language has no double-stopper predicate, so the notrump jump tests one stopper plus the strength; the penalty pass is triggered by five-plus cards in opener's suit.)",
    "convention",
    [
      rule(
        "penalty-pass",
        "PENALTY PASS (lots of opener's suit)",
        ctx("advancer", { partnerLast: doubled, lhoLast: anyBid }),
        len("lho_bid_suit", 5),
        pass,
        32,
      ),
      rule(
        "cue-game-force",
        "Cue-bid opener's suit — GAME FORCE",
        ctx("advancer", { partnerLast: doubled, lhoLast: anyBid }),
        tp(12),
        bidSuit("lho_bid_suit"),
        33,
        { shows: { tp: { min: 12 }, forcing: true } },
      ),
      rule(
        "jump-notrump",
        "Jump in notrump (10+, double stopper)",
        ctx("advancer", { partnerLast: doubled, lhoLast: anyBid }),
        all(hcp(10), bal(), stopper("lho_bid_suit")),
        bid(2, "N"),
        34,
        { shows: { hcp: { min: 10 } } },
      ),
      rule(
        "cheapest-notrump",
        "Cheapest notrump (8–10, stopper in their suit)",
        ctx("advancer", { partnerLast: doubled, lhoLast: anyBid }),
        all(hcp(8, 10), stopper("lho_bid_suit")),
        firstLegal("1N", "2N"),
        35,
        { shows: { hcp: { min: 8, max: 10 } } },
      ),
      // "JUMP in a new suit" is a LEVEL relative to the cheapest bid in that
      // suit, and the cheapest bid depends on their opening — so this row is
      // written out per opening suit. Over 1♣ every jump is at the two level;
      // over 1♦ the majors jump to two and clubs to three; over 1♥ spades jump
      // to two and the minors to three; over 1♠ everything jumps to three.
      // (Without the split, 2♥ over their 1♠ would be a CHEAPEST-level bid —
      // the deck's 0–7 row — masquerading as the 8+ jump.)
      rule(
        "jump-over-1c",
        "Jump in a new suit over their 1♣ (8+)",
        ctx("advancer", { partnerLast: doubled, lhoLast: is("1C") }),
        all(hcp(8), any(len("S", 4), len("H", 4), len("D", 4))),
        bidLongest(["S", "H", "D"], 2),
        36,
        { shows: { hcp: { min: 8 } } },
      ),
      rule(
        "jump-over-1d-major",
        "Jump in a major over their 1♦ (8+)",
        ctx("advancer", { partnerLast: doubled, lhoLast: is("1D") }),
        all(hcp(8), any(len("S", 4), len("H", 4))),
        bidLongest(["S", "H"], 2),
        36,
        { shows: { hcp: { min: 8 } } },
      ),
      rule(
        "jump-over-1h-spades",
        "Jump to 2♠ over their 1♥ (8+)",
        ctx("advancer", { partnerLast: doubled, lhoLast: is("1H") }),
        all(hcp(8), len("S", 4)),
        bid(2, "S"),
        36,
        { shows: { hcp: { min: 8 }, suits: [{ suit: "S", min: 4 }] } },
      ),
      rule(
        "jump-over-1d-clubs",
        "Jump to 3♣ over their 1♦ (8+)",
        ctx("advancer", { partnerLast: doubled, lhoLast: is("1D") }),
        all(hcp(8), len("C", 4)),
        bid(3, "C"),
        37,
        { shows: { hcp: { min: 8 }, suits: [{ suit: "C", min: 4 }] } },
      ),
      rule(
        "jump-over-1h-minor",
        "Jump in a minor over their 1♥ (8+)",
        ctx("advancer", { partnerLast: doubled, lhoLast: is("1H") }),
        all(hcp(8), any(len("D", 4), len("C", 4))),
        bidLongest(["D", "C"], 3),
        37,
        { shows: { hcp: { min: 8 } } },
      ),
      rule(
        "jump-over-1s",
        "Jump in a new suit over their 1♠ (8+)",
        ctx("advancer", { partnerLast: doubled, lhoLast: is("1S") }),
        all(hcp(8), any(len("H", 4), len("D", 4), len("C", 4))),
        bidLongest(["H", "D", "C"], 3),
        37,
        { shows: { hcp: { min: 8 } } },
      ),
      rule(
        "cheapest-suit",
        "Best suit at the cheapest level (0–7)",
        ctx("advancer", { partnerLast: doubled }),
        all(hcp(undefined, 7), len("own_longest_suit", 4)),
        bidLongest(["S", "H", "D", "C"]),
        38,
        { shows: { hcp: { max: 7 } } },
      ),
      rule(
        "cheapest-suit-any",
        "Best suit at the cheapest level (no four-card suit)",
        ctx("advancer", { partnerLast: doubled }),
        { all: [] },
        bidLongest(["S", "H", "D", "C"]),
        39,
      ),
    ],
    {
      settings: [
        toggle("g_cmp_dbl_takeout_advances_on", "Advancer's six actions over a takeout double"),
      ],
      sets: ["conventions"],
    },
  ),

  // -------------------------------------------------------------------------
  // Slide 38 — Michaels and the Unusual 2NT
  // -------------------------------------------------------------------------
  auctionItem(
    "cmp-michaels",
    "Michaels cue-bid",
    "A direct cue-bid of their opening, strictly FIVE-FIVE. (1♣)-2♣ and (1♦)-2♦ show both majors (♠AKxxx ♥QJxxx ♦xx ♣x). (1♥)-2♥ shows spades plus a minor. (1♠)-2♠ shows hearts plus a minor. The deck gives NO point range for Michaels — only the judgment that you want to be stronger when vulnerable — so the rules test shape alone and vulnerability discipline stays with the player. Michaels applies only while the opponents have shown ONE suit.",
    "convention",
    [
      rule(
        "over-minor",
        "Michaels over a minor (both majors, 5-5)",
        ctx("overcaller", {
          rhoLast: bidAt({ level: 1, strains: ["C", "D"] }),
          oppSuitsBidMax: 1,
        }),
        all(len("S", 5), len("H", 5)),
        bidSuit("rho_bid_suit"),
        25,
        { shows: { suits: [{ suit: "S", min: 5 }, { suit: "H", min: 5 }] } },
      ),
      rule(
        "over-hearts",
        "Michaels over 1♥ (spades + a minor, 5-5)",
        ctx("overcaller", { rhoLast: is("1H"), oppSuitsBidMax: 1 }),
        all(len("S", 5), any(len("C", 5), len("D", 5))),
        bidSuit("rho_bid_suit"),
        26,
        { shows: { suits: [{ suit: "S", min: 5 }] } },
      ),
      rule(
        "over-spades",
        "Michaels over 1♠ (hearts + a minor, 5-5)",
        ctx("overcaller", { rhoLast: is("1S"), oppSuitsBidMax: 1 }),
        all(len("H", 5), any(len("C", 5), len("D", 5))),
        bidSuit("rho_bid_suit"),
        27,
        { shows: { suits: [{ suit: "H", min: 5 }] } },
      ),
    ],
    { settings: [toggle("g_cmp_michaels_on", "Michaels cue-bid")], sets: ["conventions"] },
  ),

  auctionItem(
    "cmp-unusual-2nt",
    "Unusual 2NT",
    "(1x)-2NT shows the TWO LOWER UNBID SUITS, five-five (♠xx ♥x ♦AKxxx ♣QJxxx over their 1♥ or 1♠). Over a major that is clubs and diamonds; over 1♦ it is clubs and hearts; over 1♣ it is diamonds and hearts. As with Michaels the deck states no point range, so the rules test shape only.",
    "convention",
    [
      rule(
        "over-major",
        "Unusual 2NT over a major (clubs + diamonds)",
        ctx("overcaller", { rhoLast: bidAt({ level: 1, strains: ["H", "S"] }) }),
        all(len("C", 5), len("D", 5)),
        bid(2, "N"),
        28,
        { shows: { suits: [{ suit: "C", min: 5 }, { suit: "D", min: 5 }] } },
      ),
      rule(
        "over-1d",
        "Unusual 2NT over 1♦ (clubs + hearts)",
        ctx("overcaller", { rhoLast: is("1D") }),
        all(len("C", 5), len("H", 5)),
        bid(2, "N"),
        29,
        { shows: { suits: [{ suit: "C", min: 5 }, { suit: "H", min: 5 }] } },
      ),
      rule(
        "over-1c",
        "Unusual 2NT over 1♣ (diamonds + hearts)",
        ctx("overcaller", { rhoLast: is("1C") }),
        all(len("D", 5), len("H", 5)),
        bid(2, "N"),
        30,
        { shows: { suits: [{ suit: "D", min: 5 }, { suit: "H", min: 5 }] } },
      ),
    ],
    { settings: [toggle("g_cmp_unusual_2nt_on", "Unusual 2NT")], sets: ["conventions"] },
  ),

  // -------------------------------------------------------------------------
  // Slide 39 — Drury
  // -------------------------------------------------------------------------
  auctionItem(
    "cmp-drury",
    "Drury",
    "After a THIRD- or FOURTH-seat major opening, 2♣ by the PASSED hand is conventional and says nothing about clubs: it shows a good raise of the major — 10–12 HCP with three-plus support, a maximum for a hand that passed. Its purpose is to stop the light third-seat opening from getting too high: opener with a SUB-PAR opening signs off in two of the major, and with a regular opening makes some other bid, including 4 of the major. Opener's sign-off is gated on 11 or fewer HCP, which in this system only happens in third or fourth seat (12–21 is an opening bid) — that is how the rule recognizes the light opening; the game bid uses the COMBINED count (partner's 10–12 plus 14 of my own reaches 24+ with a fit).",
    "convention",
    [
      rule(
        "drury-2c",
        "Drury 2♣ (passed hand, 10–12, 3+ support)",
        ctx("responder", {
          partnerLast: bidAt({ level: 1, strains: ["H", "S"] }),
          ownLast: passed,
          roundMin: 2,
        }),
        all(
          hcp(low("g_cmp_drury_hcp"), high("g_cmp_drury_hcp")),
          len("partner_last_bid_suit", 3),
        ),
        bid(2, "C"),
        20,
        // Explicit: 2♣ says NOTHING about clubs, so no club length is promised.
        { shows: { hcp: { min: 10, max: 12 }, forcing: true } },
      ),
      rule(
        "drury-signoff",
        "Sub-par opening — sign off in two of the major",
        ctx("opener", {
          opening: bidAt({ level: 1, strains: ["H", "S"] }),
          partnerLast: is("2C"),
          roundMin: 2,
        }),
        hcp(undefined, 11),
        bidSuit("own_first_bid_suit", 2),
        21,
        { shows: { hcp: { max: 11 } } },
      ),
      rule(
        "drury-game",
        "Regular opening with a fit — bid game in the major",
        ctx("opener", {
          opening: bidAt({ level: 1, strains: ["H", "S"] }),
          partnerLast: is("2C"),
          roundMin: 2,
        }),
        all(combHcp(24), len("own_first_bid_suit", 5)),
        bidSuit("own_first_bid_suit", 4),
        22,
      ),
    ],
    {
      settings: [
        toggle("g_cmp_drury_on", "Drury (2♣ by a passed hand)"),
        range("g_cmp_drury_hcp", "Drury 2♣ range (HCP)", 10, 12, { min: 7, max: 15 }),
      ],
      sets: ["conventions"],
    },
  ),

  // -------------------------------------------------------------------------
  // Slide 40 (+ 51) — support double and redouble
  // -------------------------------------------------------------------------
  auctionItem(
    "cmp-support-double",
    "Support double and redouble",
    "1♦-(P)-1♠-(2♥)-? — the deck's own example. DOUBLE shows EXACTLY three-card spade support; 2♠ would show FOUR. It is played only up to the level of 2♥ (higher interference leaves no room), and it does NOT apply when responder's suit is DIAMONDS. When the interference is a DOUBLE rather than a bid, the same message is sent by REDOUBLE. A support double is almost never passed for penalty — it is information, not a punishment. This is kind 3 of slide 51's seven doubles and carries its own toggle.",
    "convention",
    [
      rule(
        "hearts-one-level",
        "Support double: exactly three hearts (over a one-level bid)",
        ctx("opener", {
          partnerLast: is("1H"),
          rhoLast: bidAt({ level: 1, strains: ["S"] }),
          contested: true,
        }),
        len("H", 3, 3),
        dbl,
        31,
        { shows: { suits: [{ suit: "H", min: 3, max: 3 }] } },
      ),
      rule(
        "hearts-two-level",
        "Support double: exactly three hearts (over 2♣/2♦)",
        ctx("opener", {
          partnerLast: is("1H"),
          rhoLast: bidAt({ level: 2, strains: ["C", "D"] }),
          contested: true,
        }),
        len("H", 3, 3),
        dbl,
        32,
        { shows: { suits: [{ suit: "H", min: 3, max: 3 }] } },
      ),
      rule(
        "spades-two-level",
        "Support double: exactly three spades (through 2♥)",
        ctx("opener", {
          partnerLast: is("1S"),
          rhoLast: bidAt({ level: 2, strains: ["C", "D", "H"] }),
          contested: true,
        }),
        len("S", 3, 3),
        dbl,
        33,
        { shows: { suits: [{ suit: "S", min: 3, max: 3 }] } },
      ),
      rule(
        "hearts-redouble",
        "Support REdouble: exactly three hearts (they doubled)",
        ctx("opener", { partnerLast: is("1H"), rhoLast: doubled, contested: true }),
        len("H", 3, 3),
        rdbl,
        34,
        { shows: { suits: [{ suit: "H", min: 3, max: 3 }] } },
      ),
      rule(
        "spades-redouble",
        "Support REdouble: exactly three spades (they doubled)",
        ctx("opener", { partnerLast: is("1S"), rhoLast: doubled, contested: true }),
        len("S", 3, 3),
        rdbl,
        35,
        { shows: { suits: [{ suit: "S", min: 3, max: 3 }] } },
      ),
      rule(
        "hearts-raise-shows-four",
        "Raise to 2♥ shows FOUR-card support (over a one-level bid)",
        ctx("opener", {
          partnerLast: is("1H"),
          rhoLast: bidAt({ level: 1, strains: ["S"] }),
          contested: true,
        }),
        len("H", 4),
        raise(2),
        36,
        { shows: { suits: [{ suit: "H", min: 4 }] } },
      ),
      rule(
        "hearts-raise-shows-four-two-level",
        "Raise to 2♥ shows FOUR-card support (over 2♣/2♦)",
        ctx("opener", {
          partnerLast: is("1H"),
          rhoLast: bidAt({ level: 2, strains: ["C", "D"] }),
          contested: true,
        }),
        len("H", 4),
        raise(2),
        37,
        { shows: { suits: [{ suit: "H", min: 4 }] } },
      ),
      rule(
        "spades-raise-shows-four",
        "Raise to 2♠ shows FOUR-card support (through 2♥)",
        ctx("opener", {
          partnerLast: is("1S"),
          rhoLast: bidAt({ level: 2, strains: ["C", "D", "H"] }),
          contested: true,
        }),
        len("S", 4),
        raise(2),
        38,
        { shows: { suits: [{ suit: "S", min: 4 }] } },
      ),
    ],
    {
      settings: [
        toggle(
          "g_cmp_dbl_support_on",
          "Support double / redouble (slide 51, kind 3)",
          true,
          "Double = exactly three-card support, a raise = four. Through 2♥ only, and never when responder's suit is diamonds.",
        ),
      ],
      sets: ["conventions"],
    },
  ),

  // -------------------------------------------------------------------------
  // Slide 41 — Lebensohl
  // -------------------------------------------------------------------------
  auctionItem(
    "cmp-lebensohl",
    "Lebensohl over interference on our 1NT",
    "After 1NT-(2x), 2NT is an artificial RELAY: opener must bid 3♣. Responder's direct 2y (below their bid, when available) is WEAK — pass it out, and PASS instead when 2y is not available, exactly as the deck's row says; 2NT then 3y is INVITATIONAL with that suit; and a DIRECT 3y is strong, a game force. The price, which the deck names explicitly, is that you give up the natural invitational 2NT. Strength bands follow the deck's 1NT framework: 8–9 invitational, 10+ game-force (both settings). A club suit has no 3y rebid available after the relay — the relay lands in 3♣ and responder passes it.",
    "convention",
    [
      rule(
        "relay-2nt",
        "2NT relay to 3♣ (invitational hand)",
        ctx("responder", { partnerLast: is("1N"), rhoLast: TWO_LEVEL, contested: true }),
        all(
          hcp(low("g_cmp_leb_inv_hcp"), high("g_cmp_leb_inv_hcp")),
          len("own_longest_suit", 5),
        ),
        bid(2, "N"),
        23,
        { shows: { hcp: { min: 8, max: 9 }, forcing: true } },
      ),
      rule(
        "complete-relay",
        "Opener completes the relay: 3♣",
        ctx("opener", {
          opening: is("1N"),
          ownLast: is("1N"),
          partnerLast: is("2N"),
          contested: true,
        }),
        { all: [] },
        bid(3, "C"),
        24,
      ),
      rule(
        "three-suit-invitational",
        "2NT then 3y — invitational with that suit",
        ctx("responder", { ownLast: is("2N"), partnerLast: is("3C"), contested: true }),
        len("own_longest_suit", 5),
        bidLongest(["S", "H", "D"], 3),
        25,
        { shows: { hcp: { min: 8, max: 9 }, forcing: false } },
      ),
      rule(
        "three-suit-direct",
        "Direct 3y — strong, game force",
        ctx("responder", { partnerLast: is("1N"), rhoLast: TWO_LEVEL, contested: true }),
        all(hcp(low("g_cmp_leb_gf_hcp")), len("own_longest_suit", 5)),
        bidLongest(["S", "H", "D", "C"], 3),
        26,
        { shows: { hcp: { min: 10 }, forcing: true } },
      ),
      rule(
        "two-suit-weak",
        "Direct 2y — weak, to play",
        ctx("responder", { partnerLast: is("1N"), rhoLast: TWO_LEVEL, contested: true }),
        all(hcp(undefined, 7), len("own_longest_suit", 5)),
        bidLongest(["S", "H", "D", "C"], 2),
        44,
        { shows: { hcp: { max: 7 }, forcing: false } },
      ),
      // The deck's own parenthesis on that row: "pass if 2y not available".
      // Their overcall may sit above my suit, in which case there is no weak
      // 2y to make — the relay is for INVITATIONAL hands, so a weak hand with
      // nowhere to go passes rather than climbing to the three level.
      rule(
        "two-suit-weak-pass",
        "Weak with no 2y available — pass",
        ctx("responder", { partnerLast: is("1N"), rhoLast: TWO_LEVEL, contested: true }),
        hcp(undefined, 7),
        pass,
        45,
      ),
    ],
    {
      settings: [
        toggle("g_cmp_lebensohl_on", "Lebensohl (2NT relay to 3♣)"),
        range("g_cmp_leb_inv_hcp", "Lebensohl invitational band (HCP)", 8, 9, { min: 5, max: 13 }),
        range("g_cmp_leb_gf_hcp", "Lebensohl direct-three game force (HCP)", 10, 14, {
          min: 8,
          max: 20,
        }),
      ],
      sets: ["conventions"],
    },
  ),

  // -------------------------------------------------------------------------
  // Forcing situations created by this chapter's conventions (s37, s39, s41)
  // -------------------------------------------------------------------------
  item(
    "cmp-forcing-competitive",
    "Forcing situations in competition",
    "Three places in this chapter where PASS is not an available call. (1) Drury: 2♣ by the passed hand asks opener to describe the opening, so opener must bid — sign off in two of the major with a sub-par opening, anything else with a regular one. (2) The Lebensohl 2NT relay: it is artificial and demands 3♣ from the 1NT opener. (3) Advancer's CUE-BID of the opponents' suit — a good raise of an overcall, a game force after a takeout double — so the overcaller or doubler must speak again. Each situation is an ordinary editable rule.",
    "agreement",
    "auction",
    {
      kind: "forcing_rules",
      rules: [
        forcing(
          "drury-forces-opener",
          "Drury 2♣ forces the third-seat opener to describe",
          ctx("opener", {
            opening: bidAt({ level: 1, strains: ["H", "S"] }),
            partnerLast: is("2C"),
            roundMin: 2,
          }),
          10,
        ),
        forcing(
          "lebensohl-relay-forces-opener",
          "The Lebensohl 2NT relay forces 1NT opener to bid 3♣",
          ctx("opener", { opening: is("1N"), partnerLast: is("2N"), contested: true }),
          11,
        ),
        forcing(
          "advancer-cue-forces",
          "Advancer's cue-bid of their suit forces overcaller/doubler",
          ctx("overcaller", { partnerCued: true, roundMin: 2 }),
          12,
        ),
      ],
    },
  ),

  // -------------------------------------------------------------------------
  // Slide 51 — the seven kinds of double
  // -------------------------------------------------------------------------
  item(
    "cmp-doubles-catalog",
    "The seven kinds of double",
    "The deck names SEVEN different doubles, and the differences are the whole point — the same card on the table means seven different things depending on who doubled and when. TAKEOUT, by the overcaller: (1♥)-X is short in hearts with support for the other suits. NEGATIVE, by responder: 1♣-(1♦)-X shows hearts and spades. SUPPORT, by opener: 1♣-(P)-1♥-(2♦)-X shows exactly three-card heart support. REOPENING (balancing), in the pass-out seat: (1♥)-P-(2♥)-P-P-X shows shortness in their suit. RESPONSIVE, by advancer: (1♣)-1♦-(2♣)-X shows hearts and spades. MAXIMAL, by opener when the opponents have stolen the game-try room: 1♠-(2♥)-2♠-(3♥)-X is a game try in spades, while 3♠ merely competes. ROSENKRANZ, by advancer: (1♣)-1♥-(2♦)-X promises an HONOR in partner's suit (Hx or Hxx), while 2♥ shows xxx support. Each of the seven is a separate knowledge item with its own enable toggle, so a partnership can play some and not others.",
    "concept",
    "auction",
    { kind: "none" },
  ),

  auctionItem(
    "cmp-dbl-negative",
    "Negative double",
    "Kind 2 of the seven: by RESPONDER, over an overcall of partner's opening. The deck's sequence is 1♣-(1♦)-X, showing hearts AND spades — the two suits you can no longer bid naturally at the one level in one call. The deck illustrates only this auction, so that is the only sequence mechanized here; the strength floor it does not state is exposed as a setting (default 6, the deck's general \"fewer than 6, pass\" discipline).",
    "convention",
    [
      rule(
        "double",
        "Negative double of 1♦ (both majors)",
        ctx("responder", { partnerLast: is("1C"), rhoLast: is("1D"), contested: true }),
        all(
          hcp(low("g_cmp_dbl_negative_hcp"), high("g_cmp_dbl_negative_hcp")),
          len("H", 4),
          len("S", 4),
        ),
        dbl,
        36,
        { shows: { hcp: { min: 6 }, suits: [{ suit: "H", min: 4 }, { suit: "S", min: 4 }] } },
      ),
    ],
    {
      settings: [
        toggle("g_cmp_dbl_negative_on", "Negative doubles (slide 51, kind 2)"),
        range("g_cmp_dbl_negative_hcp", "Negative double range (HCP, deck states none)", 6, 21, {
          min: 0,
          max: 24,
        }),
      ],
      sets: ["conventions"],
    },
  ),

  auctionItem(
    "cmp-dbl-reopening",
    "Reopening (balancing) double",
    "Kind 4 of the seven: the pass-out seat. (1♥)-P-(2♥)-P-P-X — they have found a fit and stopped low, everybody has passed to you, and your double shows SHORTNESS in their suit and asks partner to pick a spot. The deck names only the shortness, so the point floor is a setting (default 9, a king less than a direct-seat action, since partner's pass in front of you is not a denial of values).",
    "convention",
    [
      rule(
        "reopen",
        "Reopening double in the pass-out seat",
        ctx("overcaller", {
          ownLast: passed,
          partnerLast: passed,
          rhoLast: passed,
          lhoLast: bidAt({ min: 1, max: 3, strains: ["C", "D", "H", "S"] }),
        }),
        all(
          hcp(low("g_cmp_dbl_reopening_hcp"), high("g_cmp_dbl_reopening_hcp")),
          len("lho_bid_suit", undefined, 2),
        ),
        dbl,
        49,
        { shows: { hcp: { min: 9 } } },
      ),
    ],
    {
      settings: [
        toggle("g_cmp_dbl_reopening_on", "Reopening / balancing doubles (slide 51, kind 4)"),
        range("g_cmp_dbl_reopening_hcp", "Reopening double range (HCP, deck states none)", 9, 21, {
          min: 0,
          max: 24,
        }),
      ],
      sets: ["conventions"],
    },
  ),

  auctionItem(
    "cmp-dbl-responsive",
    "Responsive double",
    "Kind 5 of the seven: by ADVANCER, when partner has overcalled and the opponents have RAISED. (1♣)-1♦-(2♣)-X shows hearts and spades — with both majors and no clear single suit to name, double and let partner choose. The deck states no strength, so the band is a setting (default 8+, the level at which advancer starts making constructive noises).",
    "convention",
    [
      rule(
        "double",
        "Responsive double (both majors) over their raise",
        ctx("advancer", {
          partnerLast: bidAt({ level: 1, strains: ["C", "D"] }),
          rhoLast: bidAt({ level: 2, strains: ["C", "D"] }),
        }),
        all(
          hcp(low("g_cmp_dbl_responsive_hcp"), high("g_cmp_dbl_responsive_hcp")),
          len("H", 4),
          len("S", 4),
        ),
        dbl,
        32,
        { shows: { hcp: { min: 8 }, suits: [{ suit: "H", min: 4 }, { suit: "S", min: 4 }] } },
      ),
    ],
    {
      settings: [
        toggle("g_cmp_dbl_responsive_on", "Responsive doubles (slide 51, kind 5)"),
        range("g_cmp_dbl_responsive_hcp", "Responsive double range (HCP, deck states none)", 8, 21, {
          min: 0,
          max: 24,
        }),
      ],
      sets: ["conventions"],
    },
  ),

  auctionItem(
    "cmp-dbl-maximal",
    "Maximal double",
    "Kind 6 of the seven: 1♠-(2♥)-2♠-(3♥)-X. Their 3♥ has stolen the only bid that would have been a game try (3♠), so the DOUBLE becomes the game try in spades, and 3♠ merely competes with no further interest. The deck gives no point range; the rules use the COMBINED count instead — partner's raise showed 6–9, so the double asks about game when the pair is worth 22+ and 3♠ competes when it is not. Encoded for the deck's exact auction.",
    "convention",
    [
      rule(
        "maximal-double",
        "Maximal double = game try in spades",
        ctx("opener", {
          opening: is("1S"),
          ownLast: is("1S"),
          partnerLast: is("2S"),
          rhoLast: is("3H"),
          contested: true,
        }),
        all(len("S", 5), combHcp(22)),
        dbl,
        33,
      ),
      rule(
        "compete-3s",
        "3♠ competes — no further interest",
        ctx("opener", {
          opening: is("1S"),
          ownLast: is("1S"),
          partnerLast: is("2S"),
          rhoLast: is("3H"),
          contested: true,
        }),
        all(len("S", 5), combHcp(undefined, 21)),
        bid(3, "S"),
        34,
      ),
    ],
    {
      settings: [toggle("g_cmp_dbl_maximal_on", "Maximal doubles (slide 51, kind 6)")],
      sets: ["conventions"],
    },
  ),

  auctionItem(
    "cmp-dbl-rosenkranz",
    "Rosenkranz double",
    "Kind 7 of the seven: by ADVANCER, after partner overcalls and RHO bids. (1♣)-1♥-(2♦)-X promises an HONOR in partner's suit — Hx or Hxx — while a plain raise to 2♥ shows xxx support. The point is lead-quality information: partner learns whether the suit is safe to lead from and whether the honors are working. The deck states no point range, so the two rules differ only in the honor holding.",
    "convention",
    [
      rule(
        "double-with-honor",
        "Rosenkranz double: honor in partner's suit",
        ctx("advancer", { partnerLast: ONE_LEVEL, rhoLast: TWO_LEVEL }),
        all(len("partner_last_bid_suit", 2, 3), HONOR_IN_PARTNERS_SUIT),
        dbl,
        34,
      ),
      rule(
        "raise-without-honor",
        "Raise instead: three small (xxx support)",
        ctx("advancer", { partnerLast: ONE_LEVEL, rhoLast: TWO_LEVEL }),
        all(len("partner_last_bid_suit", 3), not(HONOR_IN_PARTNERS_SUIT)),
        bidSuit("partner_last_bid_suit"),
        35,
      ),
    ],
    {
      settings: [toggle("g_cmp_dbl_rosenkranz_on", "Rosenkranz doubles (slide 51, kind 7)")],
      sets: ["conventions"],
    },
  ),
];

/** Slide(s) each item was authored from — install.ts turns these into citations. */
export const COMPETITIVE_SLIDES: Record<string, number[]> = {
  "cmp-why-compete": [35],
  "cmp-overcall-one-level": [36],
  "cmp-overcall-two-level": [36],
  "cmp-overcall-1nt": [36],
  // The jump-overcall length ladder (6/7/8 cards → 2/3/4 level) is the opening
  // preempt table the deck points at from slide 36.
  "cmp-overcall-jump": [36, 16],
  "cmp-advance-overcall": [36],
  // "Continuations are the same as after an opening 1NT" (s36) → the 1NT
  // response table (s19) supplies the Stayman/transfer machinery.
  "cmp-advance-over-1nt-overcall": [36, 19],
  "cmp-advance-same-as-opening": [36],
  "cmp-takeout-double": [37, 51],
  "cmp-takeout-double-rebids": [37],
  "cmp-advance-takeout-double": [37],
  "cmp-michaels": [38],
  "cmp-unusual-2nt": [38],
  "cmp-drury": [39],
  "cmp-support-double": [40, 51],
  "cmp-lebensohl": [41],
  "cmp-forcing-competitive": [37, 39, 41],
  "cmp-doubles-catalog": [51],
  "cmp-dbl-negative": [51],
  "cmp-dbl-reopening": [51],
  "cmp-dbl-responsive": [51],
  "cmp-dbl-maximal": [51],
  "cmp-dbl-rosenkranz": [51],
};

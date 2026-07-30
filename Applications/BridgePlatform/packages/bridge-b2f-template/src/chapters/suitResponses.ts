// Responding to a one-of-a-suit opening — B2F training notes, pages 1, 3, 4, 10.
//
// Page 1 is the prose statement of responder's whole problem ("Response to 1M",
// "Response to 1m"), page 10 is the same material as two compact summary lists,
// page 3 is the RANKED bid-selection logic that decides between them (nine
// numbered priorities), and page 4 adds two discipline rules: how many cards a
// raise promises, and where it is acceptable to shade a suit length.
//
// THIS SYSTEM'S NUMBERS. Responder's bands over 1M/1m are 6-9 (low), 10-11
// (medium) and 12+ (high) — page 3 states them outright. Every response below
// is one of those three bands, and every band boundary is a setting.
//   · 4M with five-card support is 0-9 (pages 3 and 10). Page 1 writes the same
//     row as "0-10 pts"; two pages beat one, so 0-9 is encoded and the ceiling
//     is the setting b_sr_major_game_raise — page 1's reading is one dial away.
//   · the 3M limit raise is 10-11 (pages 3, 10, and page 16's convention table).
//     Page 11, writing about opener's rebid, assumes "1M - 3M (partner has 4+M
//     and 10-12 pts)" — the band setting covers that reading too.
//   · the inverted minor raise 2m needs 10+ (pages 1 and 10), NOT the 9+ of the
//     other 2/1 template in this repo.
//   · CONTRADICTION B lives partly on page 3: page 3 gives OPENER's bands as
//     12-15 / 16-18 / 19-21 while pages 11, 14 and 31 all say 12-15 / 16-19 /
//     20-21. That is opener's number, so the openings/rebids chapters own the
//     choice (three pages beat one); nothing in this chapter depends on it. It
//     is named in "Responder's three point bands" so a fellow reading page 3
//     is not surprised by it.
//
// POINTS. The notes say "pts" without ever saying HCP or total points. The
// raises the notes bound at BOTH ends — 2M (6-9), 3M (10-11) and the weak 3m
// (6-9) — are tested on total points OR plain HCP inside that band, because a
// raise is where length is worth counting and testing only one of the two would
// leave a hand that reaches the next band by shape with no bid at all. The
// raises the notes bound at only ONE end are tested on plain HCP, which is the
// permissive reading in each direction: 4M has only a CEILING (0-9), so an HCP
// test still lets a shapely hand whose length points top the band bid it, while
// Jacoby 2NT and the inverted 2m raise have only a FLOOR (12+, 10+), so an HCP
// test stops a thin hand claiming a strength-showing bid on distribution alone.
// New-suit responses and the notrump ladder are tested on plain HCP throughout.
//
// BAND DISCIPLINE. knowledgeType picks the outer band, so the four calls this
// document files under "conventional" — Jacoby 2NT, the inverted minor raises
// and the forcing 1NT — are considered before any natural response no matter
// what their priority number is. That precedence is correct for Jacoby 2NT
// (page 3 ranks supporting partner's major above bidding your own suit) and
// WRONG for the other three, so those carry explicit denials instead of relying
// on it: the inverted raises deny a four-card major (page 10: "prioritize
// showing a major over showing support"), and the forcing 1NT denies four-card
// support, denies four spades over 1H, and denies three-card support with only
// 6-9 (page 16's definition of the bid, which pages 1/10 describe as a
// catch-all). Inside the natural band the priority numbers follow page 3's
// ranked logic.
//
// Priority ladder over 1♥/1♠ (lower fires first):
//   20 Jacoby 2NT · 40 forcing 1NT                      (convention band)
//   23 1♠ over 1♥ with 12+ · 24-26 two-over-one game force
//   28 4M (five-card support, 0-9) · 30 3M limit raise · 34 2M simple raise
//   40 1♠ over 1♥ with 6-11 · 95 pass
// Priority ladder over 1♣/1♦:
//   22 inverted 2m (10+) · 24 inverted 3m (6-9)         (convention band)
//   22-24 major response · 26 2♣ over 1♦ game force · 30 1♦ over 1♣
//   32-34 notrump ladder · 95 pass
//
// UNDER INTERFERENCE. Page 15: "when opponents interfere, limit raise, Jacoby
// 2NT, inverted minors and Forcing NT are OFF; use the cuebid instead", and a
// 2/1 bid then shows 10+ rather than a game force. Every rule those four names
// cover — and the two-over-one rules — is therefore contexted `contested:
// false`; the competitive chapter owns what replaces them. The simple raise
// 2M/2m survives interference (page 15 keeps it as 6-9 weak support), so it is
// not contexted that way.

import {
  all,
  any,
  auctionItem,
  bid,
  bidAt,
  bidSuit,
  ctx,
  fit,
  forcing,
  hcp,
  high,
  is,
  item,
  len,
  longestAmong,
  low,
  not,
  pass as passCall,
  raise,
  range,
  rule,
  toggle,
  tp,
  unshown,
  type TemplateItem,
} from "@bridge/sayc-template/dsl";
import type { HandCondition } from "@bridge/kb";

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

const MAJORS = ["H", "S"] as const;
const MINORS = ["C", "D"] as const;
type Major = (typeof MAJORS)[number];
type Minor = (typeof MINORS)[number];

const SUIT_GLYPH = { C: "♣", D: "♦", H: "♥", S: "♠" } as const;

const ONE_OF_A_SUIT = bidAt({ level: 1, strains: ["C", "D", "H", "S"] });
const MINOR_OPENING = bidAt({ level: 1, strains: ["C", "D"] });

/** Responder facing partner's 1♥/1♠ opening, first call. */
const overMajor = (m: Major, contested?: boolean) =>
  ctx("responder", {
    opening: is(`1${m}`),
    partnerLast: is(`1${m}`),
    ...(contested !== undefined && { contested }),
  });
const overMinor = (mn: Minor, contested?: boolean) =>
  ctx("responder", {
    opening: is(`1${mn}`),
    partnerLast: is(`1${mn}`),
    ...(contested !== undefined && { contested }),
  });
const overAnyMinor = (contested?: boolean) =>
  ctx("responder", {
    opening: MINOR_OPENING,
    partnerLast: MINOR_OPENING,
    ...(contested !== undefined && { contested }),
  });

/** Page 10's "prioritize showing a major over showing support". */
const NO_FOUR_CARD_MAJOR = not(any(len("H", 4), len("S", 4)));
/**
 * Page 1's suit-choice rule for responder's OWN suits — "longest suit first,
 * higher ranking with 5-5 or 6-6" — as a denial: no major is (tied) longest, so
 * a hand whose major is at least as long as its minor is not in this rule. Used
 * over 1♦, where BOTH majors are unbid and a 4+ card major can be shown at the
 * one level, so a tie always belongs to the major.
 */
const NO_MAJOR_TIED_LONGEST = not(longestAmong("H", "S"));

/**
 * The same denial for a minor two-over-one over a MAJOR opening, and it is
 * asymmetric on purpose. Over 1♥ a four-card spade suit is biddable at the one
 * level, so spades (tied) longest means "bid 1♠ instead" and the minor is
 * denied. Over 1♠ responder's own major is hearts, and 2♥ promises FIVE (page
 * 4: never shade a major), so a 4-4 heart/diamond hand must bid 2♦ and show the
 * hearts later (page 1: "With your own 4+M as a second and shorter suit you can
 * always bid it later"); the 2♥ rule's cheaper priority claims the hands that
 * really do have five hearts, so no denial is applied over 1♠ at all.
 */
const ownMajorNotLongest = (m: Major): HandCondition[] =>
  m === "H" ? [not(longestAmong("S"))] : [];

/** Total points OR plain HCP inside a band (see the POINTS note above). */
const band = (key: string) => any(tp(low(key), high(key)), hcp(low(key), high(key)));

export const SUIT_RESPONSES: TemplateItem[] = [
  // =========================================================================
  // A. Page 1 and page 3 — the teaching text behind every response below
  // =========================================================================

  item(
    "sr-game-exploration-priority",
    "Keep the bidding open only while game or slam is possible",
    "Page 1's opening guidelines, which govern every response in this chapter. Keep the bidding open until there is a chance of a game or a slam. If a game is not possible, pass EARLY — but return to the agreed major suit if there is one, and return to an agreed minor suit if notrump looks risky. The order of priority for exploring game is 4M first, then 3NT, then 5m. Page 3 adds the notrump half of that: if no major fit exists, explore notrump, because 3NT is usually easier than 5m — but you must have controls in all suits, so with a minor fit and no major fit, bid suits UP THE LINE with controls, and understand that a skipped suit tells partner you have no control there. Because a raise, a rebid of your own suit and a natural notrump bid are all non-forcing (see \"Which responses partner may pass\"), bidding at the RIGHT LEVEL for your points is what keeps the auction from dying below game or drifting past it.",
    "concept",
    "auction",
    { kind: "none" },
  ),

  item(
    "sr-natural-and-conventional-bids",
    "Natural bids, conventional bids, and the points range every bid carries",
    "Page 1's definitions, quoted because the rest of the notes lean on them. ALL bids convey a specific points range — that is the part beginners skip. Most bids also convey information about the suit bid; those are NATURAL. A natural notrump bid is a desire to play in notrump, and a natural double is a desire to defeat the opponent's contract. Sometimes notrump, double and other bids carry an artificial meaning instead, especially early in the auction — those are CONVENTIONAL. Page 2 lists the ones this system plays by rote (2♣ opening, the forcing 1NT, Jacoby 2NT, Jacoby and Texas transfers, Stayman, takeout and negative doubles, inverted minors) and instructs: if a conventional bid can accurately describe your hand, use it. That instruction is why this chapter's four conventional responses are considered before the natural ladder.",
    "concept",
    "auction",
    { kind: "none" },
  ),

  item(
    "sr-suit-length-promises",
    "How many cards a suit bid promises (page 1's first-suit / second-suit rule)",
    "Page 1 states the length promises the whole system runs on. The FIRST natural suit bid (or implied) by any bidder requires 5+ cards — a 1M opening, an overcall or an advancer's suit bid, the suit implied by a Jacoby or Texas transfer, 2♥ over 1♠, a preemptive bid. The exceptions are the ones this chapter uses constantly: a 1m opening promises only 3+ cards, a ONE-LEVEL response to an opening bid promises 4+, and a 2/1 response in a MINOR promises 4+. The SECOND natural suit bid by any bidder requires 4+ cards, with two exceptions: opener's rebid after a forcing 1NT (2m may be a three-carder) and, generally, 2m at the three-card level in that auction. And once some other suit has been AGREED, a new suit bid no longer shows length at all — it shows a control, offered to explore game or slam. Read those together with page 4's cheating rule (\"Shading a suit length: minors yes, majors never\").",
    "concept",
    "auction",
    { kind: "none" },
  ),

  item(
    "sr-responder-point-bands",
    "Responder's three point bands, and each bid narrows the range",
    "Page 3: as RESPONDER against an opening bid of 1M or 1m, consider your ranges low (6-9), medium (10-11) and high (12+); when partner opens 1NT the ranges are low (0-7), medium (8-9) and high (10+). Every response in this chapter is one of the first three bands, and every following bid should NARROW your range — that is what \"bid at the right level\" means. Page 1 adds which responses are limited and which are not: the forcing 1NT and the support bids 2M and 3M show a LIMITED range, while other bids have a lower limit but no upper limit — including the 2NT support bid (Jacoby). Over 1m the same split applies: 3m and the notrump bids are limited, while 2m (inverted minors) has no upper limit. NOTE, because a reader of page 3 will hit it: page 3 also gives OPENER's bands as low 12-15 / medium 16-18 / high 19-21, while pages 11, 14 and 31 all say 12-15 / 16-19 / 20-21. That is a genuine contradiction in the document. It is opener's number, not responder's, so the openings and rebid chapters encode the three-page reading (12-15 / 16-19 / 20-21) and nothing in this chapter depends on it.",
    "concept",
    "auction",
    { kind: "none" },
  ),

  item(
    "sr-bid-selection-priorities",
    "Page 3's ranked logic for picking a natural bid",
    "Page 3 is the judgment behind every rule in this chapter: nine priorities, in order of importance, with the level chosen from your points and suit lengths. 1. Respond to partner's CONVENTIONAL bid — transfer, Stayman, RKC. 2. SUPPORT partner's major suit if there is an eight-card fit; first response 2M (6-9), 3M (10-11), 2NT (12+), 4M (5+M, 0-9); later, a single raise with low points, a jump raise with medium, a game-forcing bid with high — and the game-forcing bid may be 4M or even an artificial force such as a cuebid of the opponents' suit or a bid in an unbid suit. EXCEPTION: show DELAYED support with three-card major support and 10+ points, e.g. 1♥ - 1NT; 2♣ - 3♥. 3. Bid your 4+ card MAJOR that you haven't bid yet (an opening bid and 2♥ over 1♠ need 5+, but 4+ is enough at the one level or as a second suit). 4. REBID your 6+ card major — simple, jump, or game-forcing by band. 5. SUPPORT partner's minor suit with an eight-card fit; first response 3m (5+m, low points) or 2m (5+m, 10+); later raises by band, but keep the bidding at or below 3NT so you do not bid past it. 6. Rebid your 6+ card minor. 7. Bid your 4+ card minor that you haven't bid yet. 8. Bid notrump at the right level. 9. If none of the above is available because of some restriction, pick the LEAST WORSE bid — support with only a seven-card fit, a rebid of a five-card suit, and so on. Priority 9 is why this chapter never leaves a hand with nothing: the fellow's floor item is that last resort made mechanical.",
    "judgment_guideline",
    "auction",
    { kind: "none" },
  ),

  item(
    "sr-not-forcing-bids",
    "Which responses partner may pass",
    "Page 3, stated as plainly as the notes state it: if you bid your partner's suit, rebid your own suit, or bid natural notrump, PARTNER CAN PASS — unless you are already in a game-forcing auction or in an inverted-minor auction. Those bids are NOT forcing. \"That's why it is very important to bid at the right level based on the points so that the partner can judge whether to proceed.\" The forcing exceptions this chapter creates are exactly three, and each is a real forcing item below: the 1NT response to a major, the six two-over-one game forces, and the inverted 2m raise (forcing to 3m). Everything else in this chapter — the simple raise, the limit raise, 4M, 3m, the whole notrump ladder, a one-level suit response — may be passed.",
    "concept",
    "auction",
    { kind: "none" },
  ),

  item(
    "sr-strong-raise-needs-four",
    "A single raise promises 3+ cards; a strong raise needs 4+",
    "Page 4, in one line: \"A single M raise promises 3+ cards but strong raises (3M or 2N) should be 4+\". It is mechanized exactly that way in this chapter — the 2M simple raise tests three-plus cards in opener's major, while the 3M limit raise and Jacoby 2NT both test four-plus — and it is the reason a 10-11 hand with only THREE-card support does not jump to 3M: it keeps the bidding at the one level (1♠ over 1♥, or the forcing 1NT) and shows the three-card support on the next round, which is page 3's delayed-support exception. Page 4 gives the same reasoning for minors under the INVERTED MINORS heading: a single raise of 1M is weak and a double raise stronger, but for minors it is more beneficial to reverse the two, because a strong raise that stays at 2m leaves room to explore 3NT (typically easier than 5m), whereas with a major fit you almost always want the major as trumps.",
    "judgment_guideline",
    "auction",
    { kind: "none" },
  ),

  item(
    "sr-cheating-suit-length",
    "Shading a suit length: minors yes, majors never",
    "Page 4: \"It's ok to cheat with minor suit length if there is no other option, e.g. rebidding a 5-card minor, or bidding 2m over forcing 1N with only a 3-carder. Do not cheat with major suit length, e.g. 1s - 2h promises a 5-card H, but 1s - 2m could be a 4-carder minor.\" Both halves are load-bearing for this chapter. The major half is why the two-over-one 2♥ response to 1♠ tests FIVE hearts while the 2♣/2♦ responses test only four: partner will play you for five hearts and three-plus support is judged off that promise. The minor half is why opener's rebid of 2m after the forcing 1NT promises only 3+ cards (page 12/14, the rebid chapter's rules) and why a five-card minor may be rebid when nothing better exists — page 3's priority 9, \"pick a bid which is least worse\". Shading a major length breaks the fit arithmetic; shading a minor only costs a partscore.",
    "judgment_guideline",
    "auction",
    { kind: "none" },
  ),

  // =========================================================================
  // B. Responses to 1♥/1♠ — pages 1 and 10
  // =========================================================================

  auctionItem(
    "sr-responder-pass",
    "Pass a one-of-a-suit opening with fewer than 6 points",
    "Pages 1 and 10 open both response lists the same way: pass with fewer than 6 points. Page 1 writes it as \"Pass with < 6 pts\" for 1M and again for 1m, and page 10's summary lists start their bands at 6-9. The one exception page 1 names in the same breath is the preemptive 4M raise with five-card support, which is bid on 0-9 points and is a separate item — so a hand with five-card support and a weak 4-count does NOT reach this rule. HCP is the test, which is what keeps the 4M row (counted in points, so length may lift it) reachable.",
    "agreement",
    [
      rule(
        "pass",
        "Pass with fewer than 6 HCP",
        ctx("responder", { opening: ONE_OF_A_SUIT, partnerLast: ONE_OF_A_SUIT }),
        hcp(undefined, high("b_sr_responder_pass_max")),
        passCall,
        95,
        { shows: { hcp: { max: 5 } } },
      ),
    ],
    {
      settings: [
        range("b_sr_responder_pass_max", "Responder passes with at most", 0, 5, { max: 12 }),
      ],
    },
  ),

  auctionItem(
    "sr-major-support-raises",
    "Raises of 1♥/1♠: 2M with 6-9, 3M limit raise with 10-11",
    "Page 10's response list gives three support rows over 1M, and page 3's priority 2 repeats them. With 6-9 points and THREE-plus card support, raise to 2M — the simple raise, and page 10 lists it for four-plus support at 6-9 as well, so 2M is simply \"6-9 with a fit\". With 10-11 and FOUR-plus card support, jump to 3M — the LIMIT RAISE, an invitation to game (page 16's convention table: \"4-card major suit support, 10-11 pts, invitation to game\"), not forcing. The four-card floor on the jump is page 4's rule that strong raises need 4+. A 10-11 hand with only three-card support therefore does NOT jump: it bids 1♠ over 1♥ or the forcing 1NT and shows 3M next round. Both raises are LIMITED bids (page 1). Page 11, writing opener's rebid over 1M - 3M, assumes 10-12 rather than 10-11 — the band setting covers that reading. The limit raise is OFF under interference (page 15 replaces it with the cuebid), so it is contexted to uncontested auctions; the simple raise survives interference unchanged and is not.",
    "agreement",
    [
      ...MAJORS.map((m) =>
        rule(
          `limit-${m}`,
          `Limit raise to 3${SUIT_GLYPH[m]} (10-11, four-card support)`,
          overMajor(m, false),
          all(len(m, 4), band("b_sr_major_limit_raise")),
          raise(3),
          30,
          { shows: { tp: { min: 10, max: 11 }, suits: [{ suit: m, min: 4 }] } },
        ),
      ),
      ...MAJORS.map((m) =>
        rule(
          `single-${m}`,
          `Simple raise to 2${SUIT_GLYPH[m]} (6-9, three-card support)`,
          overMajor(m),
          all(len(m, 3), band("b_sr_major_single_raise")),
          raise(2),
          34,
          { shows: { tp: { min: 6, max: 9 }, suits: [{ suit: m, min: 3 }] } },
        ),
      ),
    ],
    {
      settings: [
        range("b_sr_major_single_raise", "Simple raise of a major", 6, 9),
        range("b_sr_major_limit_raise", "Limit raise (3 of the major)", 10, 11),
      ],
    },
  ),

  auctionItem(
    "sr-major-game-raise",
    "4M with five-card support and 0-9: constructive AND preemptive",
    "Page 10's first row over 1M: \"5+M support, 0-9 pts -> bid 4M (acts as a preemptive bid too)\", and page 3's priority 2 lists the same first response as \"4M (5+M, 0-9 pts)\". The bid is deliberately two-faced — it may be a hand that expects to make game opposite a minimum opening, and it may be a shapely 4-count bid to shut the opponents out; partner must not read it as showing values. Page 1 writes the same row as \"may bid 4M with 5+M and 0-10 pts\". Pages 3 and 10 agree on 9 and page 1 says 10, so 0-9 is encoded (two pages beat one) and the ceiling is the setting b_sr_major_game_raise — page 1's reading is one dial away. The ceiling is tested on HCP so that a hand whose length points lift it past the band still reaches 4M rather than falling through the whole ladder into a bid that would promise strength it does not have.",
    "agreement",
    [
      ...MAJORS.map((m) =>
        rule(
          `four-${m}`,
          `4${SUIT_GLYPH[m]} with five-card support (0-9, preemptive as well as constructive)`,
          overMajor(m),
          all(len(m, 5), hcp(undefined, high("b_sr_major_game_raise"))),
          raise(4),
          28,
          { shows: { hcp: { max: 9 }, suits: [{ suit: m, min: 5 }] } },
        ),
      ),
    ],
    {
      settings: [
        range("b_sr_major_game_raise", "4M with five-card support, at most", 0, 9, { max: 14 }),
      ],
    },
  ),

  auctionItem(
    "sr-jacoby-2nt",
    "Jacoby 2NT over 1♥/1♠ (12+, four-card support)",
    "Page 10: \"4+M support: 12+ pts -> 2N (Jacoby 2NT)\", and page 16's convention table repeats it — \"4-card major suit support, 12+ pts, game forcing\". Page 1 lists 2NT among the support bids and adds the detail that matters: unlike the forcing 1NT and the 2M/3M raises, the 2NT support bid has a lower limit but NO upper limit, so opener must keep slam in view. Page 4's \"strong raises should be 4+\" is the four-card floor. Because this is the conventional band it is considered before every natural response, which is what page 3's priority 2 wants: with 12+ and four-card support you support the major rather than bid your own suit. With only three-card support and 12+, the hand makes a two-over-one game force (or bids 1♠ over 1♥) and shows the support later. Page 15 switches Jacoby 2NT OFF under interference — the cuebid carries those hands — so the rule is contexted to uncontested auctions. Turn the toggle off and a 12+ four-card-support hand falls through to the natural ladder.",
    "convention",
    [
      ...MAJORS.map((m) =>
        rule(
          `jacoby-${m}`,
          `Jacoby 2NT over 1${SUIT_GLYPH[m]} (12+, four-card support)`,
          overMajor(m, false),
          all(len(m, 4), hcp(low("b_sr_jacoby_2nt_min"))),
          bid(2, "N"),
          20,
          { shows: { hcp: { min: 12 }, suits: [{ suit: m, min: 4 }], forcing: true } },
        ),
      ),
    ],
    {
      settings: [
        toggle("b_sr_jacoby_2nt_on", "Jacoby 2NT over a major"),
        range("b_sr_jacoby_2nt_min", "Jacoby 2NT strength from", 12, 40),
      ],
      sets: ["conventions"],
    },
  ),

  auctionItem(
    "sr-one-spade-over-one-heart",
    "1♠ over 1♥: the one-level response with four-plus spades",
    "Page 1: with a non-game-forcing hand, \"keep the bidding at 1-level. Bid 1s with 4-card S or 1N (Forcing NT)\", and page 10 restates it — \"6-11 pts: keep the bid at 1-level: bid 1s or 1N\". A one-level response promises 4+ cards (page 1's exception to the five-card rule), and this response is NOT a game force below 12. With 12+ the same bid is made for a different reason: page 10 says bid your suits naturally at the cheapest level, longer or higher-ranking first, and page 3's priority 3 puts a 4+ card major you haven't bid above any minor — so 12+ with spades (tied) longest bids 1♠ and keeps the auction low, while 12+ with a LONGER minor bids that minor at the two level instead and shows the spades later (page 1: \"With your own 4+M as a second and shorter suit you can always bid it later\"). The 6-11 rule declines the hands that belong elsewhere: four-plus heart support raises, and three-card support with 6-9 raises to 2♥.",
    "agreement",
    [
      // Deliberately the two-over-one item's dial, not a second copy of it:
      // page 10's high band ("12+ pts: free to make a 2/1 game forcing bid")
      // is one number, and a fellow who moves it should move it once. Both
      // items live in the core set, so the reference always resolves.
      rule(
        "one-spade-strong",
        "1♠ over 1♥ with 12+ (spades tied-longest)",
        overMajor("H"),
        all(hcp(low("b_sr_two_over_one_min")), len("S", 4), longestAmong("S")),
        bid(1, "S"),
        23,
        { shows: { hcp: { min: 12 }, suits: [{ suit: "S", min: 4 }] } },
      ),
      rule(
        "one-spade-constructive",
        "1♠ over 1♥ with 6-11 (keeping the bidding at the one level)",
        overMajor("H"),
        all(
          hcp(low("b_sr_one_level_response_range"), high("b_sr_one_level_response_range")),
          len("S", 4),
          // Four-plus heart support raises instead; three-card support raises
          // too, unless it is a 10-11 hand — page 3's delayed-support exception.
          len("H", undefined, 3),
          any(len("H", undefined, 2), hcp(10, 11)),
        ),
        bid(1, "S"),
        40,
        {
          shows: {
            hcp: { min: 6, max: 11 },
            suits: [
              { suit: "S", min: 4 },
              { suit: "H", max: 3 },
            ],
          },
        },
      ),
    ],
    {
      settings: [
        range("b_sr_one_level_response_range", "One-level response to a major", 6, 11),
      ],
    },
  ),

  auctionItem(
    "sr-forcing-1nt",
    "The forcing 1NT over 1♥/1♠ — the 6-11 catch-all",
    "Page 1 calls it what it is: \"The Forcing NT is a catch-all bid; you may have 3-card M support with 10-11 pts or a long minor. Show the 3-card support & 10-11 pts later.\" Page 10 says the same and adds the plan — \"Plan to bid 3M next even if it is a jump bid\". Page 16's convention table gives the exact shape of the catch-all: \"6-11 pts, no 4+ card support for partner's M, no 4-card S. No 3-card support AND 6-9 pts. May have 3-card & 10-11 pts.\" All four conditions are tested: four-plus support raises (2M/3M/2NT), four spades over 1♥ bid 1♠, and a 6-9 hand with three-card support raises to 2♥/2♠ — so what is left is a hand with no fit worth showing yet, or the 10-11 three-card-support hand that will jump to 3M next round. It is FORCING on opener (its own item below), which is what makes the catch-all safe. Page 15 turns it off under interference (1M - (??) - 1NT is then a natural 6-9 with a control in their suit), so it is contexted to uncontested auctions. Turn the toggle off and this system has NO 1NT response to a major at all below 12 points.",
    "convention",
    [
      ...MAJORS.map((m) =>
        rule(
          `forcing-1nt-${m}`,
          `Forcing 1NT over 1${SUIT_GLYPH[m]} (6-11 catch-all)`,
          overMajor(m, false),
          all(
            hcp(low("b_sr_forcing_1nt_range"), high("b_sr_forcing_1nt_range")),
            // No four-plus support (that is a raise or Jacoby 2NT)…
            len(m, undefined, 3),
            // …and with exactly three-card support, only the 10-11 hand comes
            // here — 6-9 with three-card support raises to 2M.
            any(
              len(m, undefined, 2),
              hcp(low("b_sr_forcing_1nt_three_support"), high("b_sr_forcing_1nt_three_support")),
            ),
            // Page 16: "no 4-card S" — over 1♥ those hands respond 1♠.
            ...(m === "H" ? [len("S", undefined, 3)] : []),
          ),
          bid(1, "N"),
          40,
          {
            shows: {
              hcp: { min: 6, max: 11 },
              suits: [{ suit: m, max: 3 }],
              forcing: true,
            },
          },
        ),
      ),
    ],
    {
      settings: [
        toggle("b_sr_forcing_1nt_on", "1NT response to a major is the forcing 1NT"),
        range("b_sr_forcing_1nt_range", "Forcing 1NT response", 6, 11),
        range(
          "b_sr_forcing_1nt_three_support",
          "Forcing 1NT holding three-card support",
          10,
          11,
        ),
      ],
      sets: ["conventions"],
    },
  ),

  item(
    "sr-forcing-1nt-is-forcing",
    "1♥/1♠ - 1NT may not be passed",
    "The 1NT response to a major is FORCING in this system (pages 1, 10 and 16), so after 1♥ - 1NT or 1♠ - 1NT pass is not an available call for opener — pages 12 and 13 give opener's whole rebid table for exactly this auction, banded 12-15 / 16-19 / 20+. Passing would be a double error: responder may hold 10-11 with three-card support and a planned 3M jump, or 6-11 with a long minor and no fit at all, so a pass can miss both a game and a major fit. The exception the notes name is a PASSED hand: \"1N by passed hand is not forcing, P - 1M; 1N\" (page 12) — that context is the rebid chapter's. Turn the toggle off for a partnership that plays 1NT semi-forcing.",
    "agreement",
    "auction",
    {
      kind: "forcing_rules",
      rules: MAJORS.map((m, i) =>
        forcing(
          `opener-must-bid-${m}`,
          `1${SUIT_GLYPH[m]} - 1NT is forcing on opener`,
          ctx("opener", {
            opening: is(`1${m}`),
            partnerLast: is("1N"),
            contested: false,
            roundMax: 2,
          }),
          10 + i,
        ),
      ),
    },
    {
      settings: [toggle("b_sr_1nt_response_forcing", "1NT response to a major is forcing")],
      sets: ["conventions"],
    },
  ),

  auctionItem(
    "sr-delayed-major-support",
    "Showing three-card major support on the next round",
    "Page 3's exception to priority 2, made mechanical: \"show delayed support with 3-card M support with 10+ pts\", with the notes' own example \"1h - 1N; 2c - 3h\". Page 10 writes the plan into the forcing 1NT row — the 6-11 response \"may have 3M support and 10-11 pts. Plan to bid 3M next even if it is a jump bid\" — and into the 12+ row: \"If you have 3-card M support, show it later.\" So there are two delayed raises. After a forcing 1NT with 10-11 and three-card support, responder JUMPS to 3M over opener's cheap rebid (the jump is deliberate: it shows the medium band, exactly as page 4's \"jump bid shows extra points\" says). After a two-over-one game force with 12+ and three-card support, responder raises opener's first suit at the cheapest level — the auction is already forced to game, so the raise only has to locate the fit. Both rules test UNSHOWN support (responder holds three-plus cards but has promised none) or an established fit, which is the partnership fact page 3 is reasoning about.",
    "agreement",
    [
      ...MAJORS.map((m) =>
        rule(
          `jump-3${m}-after-forcing-1nt`,
          `Jump to 3${SUIT_GLYPH[m]} after the forcing 1NT (10-11, three-card support)`,
          ctx("responder", {
            opening: is(`1${m}`),
            ownFirst: is("1N"),
            partnerLast: bidAt({ min: 2, max: 3 }),
            contested: false,
          }),
          all(hcp(low("b_sr_delayed_support_min")), any(unshown(m, 3), fit(m, 8))),
          bidSuit("partner_first_bid_suit", 3),
          30,
          { shows: { hcp: { min: 10 }, suits: [{ suit: m, min: 3 }] } },
        ),
      ),
      ...MAJORS.map((m) =>
        rule(
          `raise-${m}-after-two-over-one`,
          `Show three-card support after a two-over-one game force`,
          ctx("responder", {
            opening: is(`1${m}`),
            ownFirst: bidAt({ level: 2, strains: ["C", "D", "H"] }),
            partnerLast: bidAt({ min: 2, max: 3 }),
            contested: false,
          }),
          all(hcp(low("b_sr_delayed_support_min")), any(unshown(m, 3), fit(m, 8))),
          bidSuit("partner_first_bid_suit"),
          31,
          { shows: { hcp: { min: 12 }, suits: [{ suit: m, min: 3 }], forcing: true } },
        ),
      ),
    ],
    {
      settings: [
        range("b_sr_delayed_support_min", "Delayed three-card major support from", 10, 40),
      ],
    },
  ),

  // =========================================================================
  // C. The six two-over-one game forces — page 3 names them exactly
  // =========================================================================

  auctionItem(
    "sr-two-over-one-game-force",
    "The six two-over-one game forces: 1♠-2♣/2♦/2♥, 1♥-2♣/2♦, 1♦-2♣",
    "Page 3 counts them: \"There are SIX responses to an opening bid of 1M or 1d that are called 2/1 GAME FORCING bids, viz. 1s-2c, 1s-2d, 1s-2h, 1h-2c, 1h-2d, and 1d-2c. These bids show 12+ points, and 4+ minor or 5+ hearts. With less points, find some other bid.\" All six are authored here and nothing else is one: they are NOT jump bids, they simply take the bidding to the two level in a new suit. Which of them to choose is page 1's rule for responder's own suits — longest suit first, higher ranking with 5-5 or 6-6, and UP THE LINE with 4-4 — so 2♦ is preferred to 2♣ when diamonds are longer or both are five-plus, while 4-4 in the minors goes up the line to 2♣, and a hand whose major is at least as long as the minor bids the major instead (1♠ over 1♥, or 2♥ over 1♠ with five hearts). Page 4's cheating rule fixes the two lengths: 2♥ over 1♠ promises a FIVE-card heart suit, while a non-jump 2♣/2♦ may be a four-carder (page 1 and page 10 both say so). Over 1♦, 2♣ is the response with longer clubs; with five-plus diamonds the inverted 2♦ raise is considered first (page 3 ranks supporting partner's minor above bidding your own). Page 15: under interference a 2/1 is NOT a game force but shows 10+ and is forcing for one round — those hands are the competitive chapter's, so these rules are contexted to uncontested auctions.",
    "agreement",
    [
      rule(
        "gf-2h-over-1s",
        "2♥ over 1♠ (12+, five-plus hearts)",
        overMajor("S", false),
        all(hcp(low("b_sr_two_over_one_min")), len("H", 5), longestAmong("H")),
        bid(2, "H"),
        24,
        { shows: { hcp: { min: 12 }, suits: [{ suit: "H", min: 5 }], forcing: true } },
      ),
      ...MAJORS.map((m) =>
        rule(
          `gf-2d-over-1${m}`,
          `2♦ over 1${SUIT_GLYPH[m]} (12+, four-plus diamonds)`,
          overMajor(m, false),
          all(
            hcp(low("b_sr_two_over_one_min")),
            // Longest suit first, higher-ranking with 5-5/6-6: five-plus and
            // (tied) longest, or four with clubs shorter (4-4 goes up the line).
            any(
              all(len("D", 5), longestAmong("D")),
              all(len("D", 4), len("C", undefined, 3)),
            ),
            ...ownMajorNotLongest(m),
          ),
          bid(2, "D"),
          25,
          { shows: { hcp: { min: 12 }, suits: [{ suit: "D", min: 4 }], forcing: true } },
        ),
      ),
      ...MAJORS.map((m) =>
        rule(
          `gf-2c-over-1${m}`,
          `2♣ over 1${SUIT_GLYPH[m]} (12+, four-plus clubs)`,
          overMajor(m, false),
          all(
            hcp(low("b_sr_two_over_one_min")),
            any(
              all(len("C", 5), longestAmong("C")),
              all(len("C", 4), len("D", undefined, 4)),
            ),
            ...ownMajorNotLongest(m),
          ),
          bid(2, "C"),
          26,
          { shows: { hcp: { min: 12 }, suits: [{ suit: "C", min: 4 }], forcing: true } },
        ),
      ),
      rule(
        "gf-2c-over-1d",
        "2♣ over 1♦ (12+, longer clubs)",
        overMinor("D", false),
        all(
          hcp(low("b_sr_two_over_one_min")),
          any(
            all(len("C", 5), longestAmong("C")),
            all(len("C", 4), len("D", undefined, 3), NO_FOUR_CARD_MAJOR),
          ),
          NO_MAJOR_TIED_LONGEST,
        ),
        bid(2, "C"),
        26,
        { shows: { hcp: { min: 12 }, suits: [{ suit: "C", min: 4 }], forcing: true } },
      ),
    ],
    {
      settings: [
        range("b_sr_two_over_one_min", "Two-over-one game force from", 12, 40),
      ],
    },
  ),

  item(
    "sr-two-over-one-is-forcing",
    "A two-over-one response forces the partnership to game",
    "The six sequences page 3 names are GAME forcing, not merely forcing for one round: neither partner may pass below game. Opener must bid over responder's two-level new suit, and responder must bid again over opener's rebid — page 12's own instruction for this auction is to \"bid your suits naturally\" with no jump needed, which only works if nobody is allowed to pass. Page 3 makes the same point from the other side: a raise, a rebid or a natural notrump bid is non-forcing \"unless you are already in the game forcing auction or inverted minor auction\". Page 15's interference rule is the one exception — over an overcall a 2/1 shows 10+ and is forcing for one round only — so these forcing entries are contexted to uncontested auctions. Turn the toggle off for a partnership that plays two-over-one as forcing for one round.",
    "agreement",
    "auction",
    {
      kind: "forcing_rules",
      rules: [
        forcing(
          "opener-over-2x-1s",
          "1♠ - 2♣/2♦/2♥ forces opener",
          ctx("opener", {
            opening: is("1S"),
            partnerLast: bidAt({ level: 2, strains: ["C", "D", "H"] }),
            contested: false,
            roundMax: 2,
          }),
          20,
        ),
        forcing(
          "opener-over-2x-1h",
          "1♥ - 2♣/2♦ forces opener",
          ctx("opener", {
            opening: is("1H"),
            partnerLast: bidAt({ level: 2, strains: ["C", "D"] }),
            contested: false,
            roundMax: 2,
          }),
          21,
        ),
        forcing(
          "opener-over-2c-1d",
          "1♦ - 2♣ forces opener",
          ctx("opener", {
            opening: is("1D"),
            partnerLast: is("2C"),
            contested: false,
            roundMax: 2,
          }),
          22,
        ),
        forcing(
          "responder-below-game-1s",
          "After 1♠ - 2♣/2♦/2♥, responder bids again below game",
          ctx("responder", {
            opening: is("1S"),
            ownFirst: bidAt({ level: 2, strains: ["C", "D", "H"] }),
            partnerLast: bidAt({ max: 3, strains: ["C", "D", "H", "S"] }),
            contested: false,
            roundMax: 3,
          }),
          23,
        ),
        forcing(
          "responder-below-game-1h",
          "After 1♥ - 2♣/2♦, responder bids again below game",
          ctx("responder", {
            opening: is("1H"),
            ownFirst: bidAt({ level: 2, strains: ["C", "D"] }),
            partnerLast: bidAt({ max: 3, strains: ["C", "D", "H", "S"] }),
            contested: false,
            roundMax: 3,
          }),
          24,
        ),
        forcing(
          "responder-below-game-1d",
          "After 1♦ - 2♣, responder bids again below game",
          ctx("responder", {
            opening: is("1D"),
            ownFirst: is("2C"),
            partnerLast: bidAt({ max: 3, strains: ["C", "D", "H", "S"] }),
            contested: false,
            roundMax: 3,
          }),
          25,
        ),
      ],
    },
    { settings: [toggle("b_sr_two_over_one_forcing", "Two-over-one responses force to game")] },
  ),

  item(
    "sr-jump-shifts-out-of-syllabus",
    "Jump shift responses (1m - 2M, 1♣ - 2♦) are out of syllabus",
    "Page 3, immediately after naming the six two-over-one sequences: \"The jump bids such as 1m - 2M, 1c - 2d, etc. are out of syllabus at this time.\" They are UNDISCUSSED, not weak and not strong — this system gives no meaning to a jump in a new suit by responder, so neither partner may guess one. A hand that wants such a bid must choose from the responses that ARE defined: a one-level suit response, a raise (inverted over a minor), the forcing 1NT, one of the six two-over-ones, or the notrump ladder. No bidding rule is written for these calls on purpose, and no rule in this chapter can produce one.",
    "concept",
    "auction",
    { kind: "none" },
  ),

  // =========================================================================
  // D. Responses to 1♣/1♦ — pages 1, 4 and 10
  // =========================================================================

  item(
    "sr-minor-major-priority",
    "Over 1♣/1♦, showing a major outranks showing support",
    "Page 10 heads its second list with the instruction: \"Responses to 1m (partner has 3+m) — prioritize showing a major over support (5+m)\". Page 1 says the same thing as an ordering — \"Show own suit instead of showing support, e.g. 1M, 1d, 2c\" — and it is the reverse of the policy over a major, where page 1 says \"Show support instead of bidding your own suit\". The reason is in page 3's ladder: supporting partner's MAJOR is priority 2 (an eight-card major fit is where the tricks are), while supporting a minor is only priority 5, below bidding a 4+ card major of your own at priority 3. Mechanically this matters because the inverted minor raises are conventional and would otherwise be considered first, so BOTH inverted raises test that responder does not hold a four-card major. A four-card DIAMOND suit does not get the same protection: page 3 puts minor support (5) above bidding your own 4+ card minor (7), so with five-card club support and four diamonds the raise wins.",
    "judgment_guideline",
    "auction",
    { kind: "none" },
  ),

  auctionItem(
    "sr-minor-one-level-responses",
    "1♥/1♠/1♦ over 1♣/1♦ with a four-card suit (prefer the major)",
    "Page 10 gives the same one-level response in all three bands over 1m: 6-9 \"bid 1M or 1d with 4+ carder (prefer 1M)\", 10-11 the same, and 12+ \"1M with 4+ carder\". So the bid shows 6+ and has no upper limit — page 1's note that only 3m and the notrump bids are limited. A one-level response promises 4+ cards (page 1's exception to the five-card rule). Where two suits qualify, page 1's rule for responder's own suits applies: longest first, higher-ranking with 5-5, and UP THE LINE with 4-4 — so 4-4 in the majors is 1♥, five spades and four hearts is 1♠, and 5-5 is 1♠. The 1♦ response to 1♣ is last: page 3 ranks a 4+ card major (priority 3) above a 4+ card minor (priority 7), so 1♦ denies a four-card major, and page 3 also ranks minor SUPPORT above it, so with five-plus club support and no major the inverted raise is chosen first. Page 31's worked auction confirms the 1-level major response is treated as forcing on opener: \"1h: 6+ pts / 4+h / may have 6+m / FORCING\" — that inference belongs to the rebid chapter, which is why no forcing rule is authored here.",
    "agreement",
    [
      rule(
        "one-spade-five",
        "1♠ over 1♣/1♦ with five-plus spades",
        overAnyMinor(),
        all(hcp(low("b_sr_minor_response_min")), len("S", 5), longestAmong("S")),
        bid(1, "S"),
        22,
        { shows: { hcp: { min: 6 }, suits: [{ suit: "S", min: 5 }] } },
      ),
      rule(
        "one-heart",
        "1♥ over 1♣/1♦ with four-plus hearts (up the line)",
        overAnyMinor(),
        all(
          hcp(low("b_sr_minor_response_min")),
          len("H", 4),
          // Hearts (tied) longest, or spades no longer than four — so 4-4 majors
          // go up the line to 1♥ instead of falling into the 1♠ rule below.
          any(longestAmong("H"), len("S", undefined, 4)),
        ),
        bid(1, "H"),
        23,
        { shows: { hcp: { min: 6 }, suits: [{ suit: "H", min: 4 }] } },
      ),
      rule(
        "one-spade-four",
        "1♠ over 1♣/1♦ with four-plus spades",
        overAnyMinor(),
        all(hcp(low("b_sr_minor_response_min")), len("S", 4)),
        bid(1, "S"),
        24,
        { shows: { hcp: { min: 6 }, suits: [{ suit: "S", min: 4 }] } },
      ),
      rule(
        "one-diamond-over-one-club",
        "1♦ over 1♣ with four-plus diamonds (denies a four-card major)",
        overMinor("C"),
        all(hcp(low("b_sr_minor_response_min")), len("D", 4), NO_FOUR_CARD_MAJOR),
        bid(1, "D"),
        30,
        {
          shows: {
            hcp: { min: 6 },
            suits: [
              { suit: "D", min: 4 },
              { suit: "H", max: 3 },
              { suit: "S", max: 3 },
            ],
          },
        },
      ),
    ],
    {
      settings: [
        range("b_sr_minor_response_min", "One-level response to a minor from", 6, 40),
      ],
    },
  ),

  auctionItem(
    "sr-inverted-minor-raises",
    "Inverted minor raises: 2m is 10+ (strong), 3m is 6-9 (weak)",
    "Page 10 gives 3m with five-plus support in the 6-9 row and 2m with five-plus support in both the 10-11 and the 12+ rows; page 1 states the pair outright — \"Show support: 2m (10+ pts, inverted minor) or 3m (6-9 pts, weak)\" — and adds that 3m is a LIMITED bid while 2m has a lower limit and no upper limit. TEN is this system's floor for the strong raise, not the nine some other Standard American write-ups use, and page 16 describes it as \"limit raise or better\". Page 4 gives the reasoning: for majors the single raise is weak and the double raise stronger, but for minors it pays to reverse them, because a strong raise that stays at 2m leaves room to explore 3NT (\"typically easier than 5m\"), while with a major fit you almost always want the major as trumps. Both raises require FIVE-plus card support (page 10 says so in every band) and both deny a four-card major — page 10's \"prioritize showing a major over support\". Page 15 switches inverted minors OFF under interference (the cuebid carries those hands), so both rules are contexted to uncontested auctions.",
    "convention",
    [
      ...MINORS.map((mn) =>
        rule(
          `inverted-strong-${mn}`,
          `2${SUIT_GLYPH[mn]} inverted raise (10+, five-card support)`,
          overMinor(mn, false),
          all(len(mn, 5), hcp(low("b_sr_inverted_strong_min")), NO_FOUR_CARD_MAJOR),
          raise(2),
          22,
          {
            shows: {
              hcp: { min: 10 },
              suits: [
                { suit: mn, min: 5 },
                { suit: "H", max: 3 },
                { suit: "S", max: 3 },
              ],
              forcing: true,
            },
          },
        ),
      ),
      ...MINORS.map((mn) =>
        rule(
          `inverted-weak-${mn}`,
          `3${SUIT_GLYPH[mn]} weak raise (6-9, five-card support)`,
          overMinor(mn, false),
          all(
            len(mn, 5),
            band("b_sr_inverted_weak_range"),
            NO_FOUR_CARD_MAJOR,
          ),
          raise(3),
          24,
          {
            shows: {
              tp: { min: 6, max: 9 },
              suits: [
                { suit: mn, min: 5 },
                { suit: "H", max: 3 },
                { suit: "S", max: 3 },
              ],
            },
          },
        ),
      ),
    ],
    {
      settings: [
        toggle("b_sr_inverted_minors_on", "Inverted minor raises"),
        range("b_sr_inverted_strong_min", "Inverted 2m raise from", 10, 40),
        range("b_sr_inverted_weak_range", "Weak 3m raise", 6, 9),
      ],
      sets: ["conventions"],
    },
  ),

  item(
    "sr-inverted-minor-forcing",
    "The inverted 2m raise may not be passed",
    "Page 1 names the inverted-minor auction alongside the game-forcing auction as the two places where a raise, a rebid or a natural notrump bid is no longer non-forcing: those bids may be passed \"unless you are already in the game forcing auction or inverted minor auction\". Page 11 says it directly about this auction — \"After partner raises 1m - 2m (partner has 5+m, no M and 10+ pts), FORCING\" — and lists opener's continuations, which run to 2NT with controls, an exploration of 3NT by bidding side-suit controls, or 3NT outright with 18-21. So opener must bid over 2m, and responder must bid again while opener's rebid is still below three of the minor: the partnership is committed to at least 3m while it looks for 3NT. The toggle follows the convention — with inverted raises off there is nothing to force.",
    "agreement",
    "auction",
    {
      kind: "forcing_rules",
      rules: [
        ...MINORS.map((mn, i) =>
          forcing(
            `opener-over-inverted-${mn}`,
            `1${SUIT_GLYPH[mn]} - 2${SUIT_GLYPH[mn]} forces opener`,
            ctx("opener", {
              opening: is(`1${mn}`),
              partnerLast: is(`2${mn}`),
              contested: false,
              roundMax: 2,
            }),
            30 + i,
          ),
        ),
        ...MINORS.map((mn, i) =>
          forcing(
            `responder-to-3${mn}`,
            `After 1${SUIT_GLYPH[mn]} - 2${SUIT_GLYPH[mn]}, responder bids again below 3${SUIT_GLYPH[mn]}`,
            ctx("responder", {
              opening: is(`1${mn}`),
              ownFirst: is(`2${mn}`),
              partnerLast: bidAt({ max: 2 }),
              contested: false,
              roundMax: 3,
            }),
            32 + i,
          ),
        ),
      ],
    },
    {
      settings: [toggle("b_sr_inverted_forcing_to_3m", "Inverted 2m raise is forcing to 3m")],
      sets: ["conventions"],
    },
  ),

  auctionItem(
    "sr-minor-notrump-ladder",
    "1NT / 2NT / 3NT over 1♣/1♦ — and 1NT here is NOT forcing",
    "Page 10 gives one notrump bid per band over 1m: 1NT with 6-9, 2NT with 10-11, 3NT with 12+. Page 1 lists the same three and marks them LIMITED (\"3m and NT bids show a limited points range\") — although 3NT is limited only in the sense that it names the contract. The point a reader must not miss, and the notes say it in page 10's own words, is that this 1NT is \"(not a Forcing NT)\": unlike 1NT over a major, 1NT over a minor is a natural limit bid opener may pass. Page 3's priority 8 puts notrump LAST, below a major response, minor support and a 4+ card minor, so all three notrump bids deny a four-card major — with one, responder bids it (page 10: \"prefer 1M\"). Page 14's low column confirms the passability from opener's side: \"Pass these responses: 1m - 1N\".",
    "agreement",
    [
      rule(
        "three-nt",
        "3NT over 1♣/1♦ (12+, no four-card major)",
        overAnyMinor(false),
        all(hcp(low("b_sr_minor_3nt_min")), NO_FOUR_CARD_MAJOR),
        bid(3, "N"),
        32,
        {
          shows: {
            hcp: { min: 12 },
            suits: [
              { suit: "H", max: 3 },
              { suit: "S", max: 3 },
            ],
          },
        },
      ),
      rule(
        "two-nt",
        "2NT over 1♣/1♦ (10-11, no four-card major)",
        overAnyMinor(false),
        all(
          hcp(low("b_sr_minor_2nt_range"), high("b_sr_minor_2nt_range")),
          NO_FOUR_CARD_MAJOR,
        ),
        bid(2, "N"),
        33,
        {
          shows: {
            hcp: { min: 10, max: 11 },
            suits: [
              { suit: "H", max: 3 },
              { suit: "S", max: 3 },
            ],
          },
        },
      ),
      rule(
        "one-nt",
        "1NT over 1♣/1♦ (6-9, natural and NOT forcing)",
        overAnyMinor(),
        all(
          hcp(low("b_sr_minor_1nt_range"), high("b_sr_minor_1nt_range")),
          NO_FOUR_CARD_MAJOR,
        ),
        bid(1, "N"),
        34,
        {
          shows: {
            hcp: { min: 6, max: 9 },
            suits: [
              { suit: "H", max: 3 },
              { suit: "S", max: 3 },
            ],
          },
        },
      ),
    ],
    {
      settings: [
        range("b_sr_minor_1nt_range", "1NT response to a minor", 6, 9),
        range("b_sr_minor_2nt_range", "2NT response to a minor", 10, 11),
        range("b_sr_minor_3nt_min", "3NT response to a minor from", 12, 40),
      ],
    },
  ),
];

/** Page(s) each item was authored from — install.ts turns these into citations. */
export const SUIT_RESPONSES_PAGES: Record<string, number[]> = {
  "sr-game-exploration-priority": [1, 3],
  "sr-natural-and-conventional-bids": [1],
  "sr-suit-length-promises": [1],
  "sr-responder-point-bands": [1, 3],
  "sr-bid-selection-priorities": [3],
  "sr-not-forcing-bids": [3],
  "sr-strong-raise-needs-four": [4],
  "sr-cheating-suit-length": [4],
  "sr-responder-pass": [1, 10],
  "sr-major-support-raises": [3, 4, 10, 15],
  "sr-major-game-raise": [1, 3, 10],
  "sr-jacoby-2nt": [3, 10, 15],
  "sr-one-spade-over-one-heart": [1, 10],
  "sr-forcing-1nt": [1, 10, 15],
  "sr-forcing-1nt-is-forcing": [1, 10],
  "sr-delayed-major-support": [3, 10],
  "sr-two-over-one-game-force": [1, 3, 4, 10, 15],
  "sr-two-over-one-is-forcing": [1, 3],
  "sr-jump-shifts-out-of-syllabus": [3],
  "sr-minor-major-priority": [1, 3, 10],
  "sr-minor-one-level-responses": [1, 10],
  "sr-inverted-minor-raises": [1, 4, 10, 15],
  "sr-inverted-minor-forcing": [1],
  "sr-minor-notrump-ladder": [1, 10],
};

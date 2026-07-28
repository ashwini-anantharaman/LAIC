// Conventions chapter — pages 16-17's "Key Conventional Bids" table, the
// definitions on pages 1-3 that the whole system leans on, and page 19's
// "RKC 1430" remark.
//
// WHAT THIS CHAPTER OWNS, AND WHAT IT DELIBERATELY DOES NOT. The two-column
// table on pages 16-17 names about twenty bids, and MOST of them are the same
// gadgets other chapters author from the pages where the notes actually explain
// them: the takeout and negative doubles, the limit raise, Jacoby 2NT, Stayman,
// the Jacoby/Texas/minor-suit transfers, the forcing 1NT, inverted minors,
// Michaels, the Unusual NT and Unusual-vs-Unusual (openings, notrump responses,
// suit responses, competitive bidding). Authoring them a second time here would
// produce two rules for one bid, so this chapter authors only the rows nobody
// else owns —
//   · ROMAN KEY CARD (the 4NT ask, the notes' own step scheme, the sign-off),
//   · GERBER (4♣ over a 1NT/2NT opening),
//   · SPLINTER (the double jump in a short suit),
//   · SUPPORT CUEBID (the opponent's suit as a limit-raise-or-better raise),
// — plus one CONCEPT item that reproduces the table's definition of every row,
// so a fellow can read the system's whole vocabulary in one place, and the
// definitions from pages 1-3 that the table's shorthand depends on ("medium
// hand", "max hand", "natural", "second suit").
//
// JUMP RAISE / JUMP REBID / JUMP SHIFT / REVERSE BID are the four rows that are
// not conventions at all: they are LABELS for shapes-and-strengths inside the
// natural ladder ("8-card fit + medium hand"), and the sequences they label are
// authored — with their own point tests — in the rebid and response chapters.
// They are therefore `judgment_guideline` items here: they name the sequences
// the notes print and define the label, and they compile to NO rules, so they
// cannot fight the chapters that own the bids.
//
// BAND / PRIORITY DISCIPLINE. `knowledgeType` picks the band (convention 1 is
// considered before agreement/bidding_rule 2, and `concept` /
// `judgment_guideline` produce no band at all), so every artificial call here
// outranks the natural ladder no matter what its priority number is. That makes
// context tightness a safety property rather than a style point, and three
// mechanisms keep these rules tight:
//   · `askInProgress` — the 4NT and 4♣ asks are declared with `ask(...)`, so
//     the answering rules match "this exact question is pending" instead of a
//     bare call pattern. It is also what makes the toggles cascade: disable the
//     ask and no answer can ever match, so satellites need no gate of their own
//     (they carry a `requires` edge instead — CONVENTIONS_EDGES at the bottom);
//   · the partnership predicates — the keycard ask fires on a REAL agreed suit
//     (`fit("agreed_suit", 8)`) and the sign-off is combined-keycard arithmetic
//     (`kcMissing`), never raw one-hand points;
//   · Gerber's shape guards. Over 1NT/2NT this system gives 4♣ no natural and
//     no other conventional meaning (Stayman is 2♣/3♣, the transfers are
//     2♦/2♥/2♠/2NT/3♦/3♥/4♦/4♥), and the guards keep the ask off the hands that
//     belong to those gadgets: no four-card major, no six-card minor.
//
// Priority ladder inside the convention band (lower fires first):
//   10 4NT keycard ask · 11-12 Gerber 4♣ · 14-15 splinters ·
//   18 support cuebid · 20-23 keycard answers · 24-26 Gerber answers ·
//   30-32 the asker's continuations
//
// THE NOTES' OWN CHOICES ARE ENCODED AS WRITTEN, with a setting wherever the
// notes state a number and a plain statement wherever something was inferred:
//   · the keycard steps are the notes' scheme, which is the 1430 orientation
//     (first step = 1 or 4) — page 19's deal-5 remark calls it "RKC 1430" and
//     the two agree, so nothing had to be reconciled;
//   · CONTRADICTION B (opener's bands) is flagged on the strength-bands item:
//     page 3 prints low 12-15 / medium 16-18 / high 19-21, while pages 11, 14
//     and 31 all print 12-15 / 16-19 / 20-21. The better-supported reading is
//     encoded and page 3's is one dial away;
//   · CONTRADICTION A (the minor-suit transfer) is flagged on the vocabulary
//     item, because page 16's row is one of the two readings that disagree. The
//     RULES for that transfer belong to the notrump-response chapter, so the
//     dial lives there — this chapter states the contradiction and names the
//     pages rather than authoring a second, competing switch.

import {
  aces,
  all,
  any,
  anyBid,
  ask,
  auctionItem,
  bid,
  bidAt,
  bidSuit,
  combHcp,
  ctx,
  fit,
  forcing,
  hcp,
  is,
  item,
  kcMissing,
  keycards,
  len,
  low,
  partnerLen,
  range,
  rule,
  shows,
  toggle,
  type TemplateEdge,
  type TemplateItem,
} from "@bridge/sayc-template/dsl";

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

type Suit4 = "C" | "D" | "H" | "S";

const SUIT_GLYPH: Record<Suit4, string> = { C: "♣", D: "♦", H: "♥", S: "♠" };
const SUIT_WORD: Record<Suit4, string> = {
  C: "clubs",
  D: "diamonds",
  H: "hearts",
  S: "spades",
};

const SUIT_BID = bidAt({ strains: ["C", "D", "H", "S"] });
const FIVE_SUIT = bidAt({ level: 5, strains: ["C", "D", "H", "S"] });
const FOUR_NT = is("4N");

/** Ask ids — the disambiguating handle every answering rule matches on. */
const RKC = "b2f-rkc";
const GERBER = "b2f-gerber";

/**
 * The notes' keycard steps (page 16): "First step shows 1 or 4, 2nd step shows
 * 0 or 3, 3rd step shows 2 without the trump Q and 4th step shows 2 with the
 * trump Q." Over 4NT the steps are 5♣/5♦/5♥/5♠, which is the 1430 orientation
 * page 19 names.
 *
 * ONE GAP IN THE PRINTED TABLE, stated rather than hidden: the four steps cover
 * 0, 1, 2, 3 and 4 keycards but the notes print no answer for a hand holding
 * ALL FIVE (four aces plus the trump king). The third and fourth steps are
 * therefore recorded as "2 OR 5" — the standard 1430 pairing, which is what the
 * page-19 label implies — so a responder can never be left without a legal
 * call. The consequence is honest and conservative: when the answer is two-way
 * the asker's combined count is a range, and the continuation signs off at five
 * unless EVERY value in that range is safe.
 */
const RKC_RESPONSES = {
  "5C": { keycards: [1, 4] },
  "5D": { keycards: [0, 3] },
  "5H": { keycards: [2, 5] },
  "5S": { keycards: [2, 5] },
};

/**
 * Gerber's steps, derived from the notes' own words: page 16 defines Gerber as
 * "similar to RKC w/o agreed upon trump suit", so the RKC steps are applied to
 * ACES — first step (4♦) = 1 or 4, second step (4♥) = 0 or 3, third step (4♠) =
 * 2. Without a trump suit there is no fifth keycard and no trump queen, so the
 * third and fourth steps collapse into one and 4NT is left unused. The notes
 * print no response table for Gerber at all; this is the inference, and a
 * partnership that plays the common alternative (4♦ = 0 or 4, 4♥ = 1, 4♠ = 2,
 * 4NT = 3) must agree that explicitly — the two schemes are not compatible.
 *
 * A LANGUAGE LIMITATION worth naming: `AskResponseMeaning` carries `keycards`
 * and `kings` only, so an ACE count has to be recorded in the keycard channel.
 * Combined-keycard arithmetic needs an agreed trump suit, which Gerber by
 * definition lacks, so those tests simply do not resolve after a Gerber answer
 * (see cv-gerber-after-the-answer) — and if a suit is agreed later the count
 * can only UNDERSTATE the partnership's holding (partner's trump king is not in
 * the answer), so nothing built on it can overbid.
 */
const GERBER_RESPONSES = {
  "4D": { keycards: [1, 4] },
  "4H": { keycards: [0, 3] },
  "4S": { keycards: [2] },
};

/**
 * The splinter table. A SPLINTER is a DOUBLE jump in a side suit: over 1♥ the
 * cheapest spade call is 1♠, so the jump is 2♠ and the double jump is 3♠; the
 * cheapest club call is 2♣, so the double jump is 4♣. Worked out per opening:
 *   1♥ → 3♠ / 4♦ / 4♣      1♠ → 4♥ / 4♦ / 4♣
 *   1♣ → 3♦ / 3♥ / 3♠      1♦ → 4♣ / 3♥ / 3♠
 * Support is four cards facing a major (the notes' 1M opening promises 5+, so
 * four is an eight-card fit) and FIVE facing a minor (1m promises only 3+
 * cards, and the notes' own minor-support bids — inverted minors, the weak 3m
 * raise — all require 5+, page 10).
 */
const SPLINTERS: { open: Suit4; support: number; steps: { short: Suit4; level: number }[] }[] = [
  { open: "H", support: 4, steps: [{ short: "S", level: 3 }, { short: "D", level: 4 }, { short: "C", level: 4 }] },
  { open: "S", support: 4, steps: [{ short: "H", level: 4 }, { short: "D", level: 4 }, { short: "C", level: 4 }] },
  { open: "C", support: 5, steps: [{ short: "D", level: 3 }, { short: "H", level: 3 }, { short: "S", level: 3 }] },
  { open: "D", support: 5, steps: [{ short: "C", level: 4 }, { short: "H", level: 3 }, { short: "S", level: 3 }] },
];

/** Responder facing partner's opening bid of one of a suit, first call. */
const overOpening = (open: Suit4) =>
  ctx("responder", { opening: is(`1${open}`), partnerLast: is(`1${open}`) });

export const CONVENTIONS: TemplateItem[] = [
  // =========================================================================
  // Page 1 (with page 2's list) — NATURAL versus CONVENTIONAL
  // =========================================================================
  item(
    "cv-natural-vs-conventional",
    "Natural and conventional bids, and the ones to know by rote",
    "Page 1 draws the line the whole system rests on. EVERY bid conveys a specific POINTS RANGE. Most bids also convey information about the suit bid — those are NATURAL bids. A natural notrump bid is a proposal to PLAY in notrump; a natural double is a desire to DEFEAT the opponents' contract. Sometimes notrump, a double, or another bid carries an artificial meaning instead — especially early in the auction — and those are CONVENTIONAL. Note what the split does NOT touch: a conventional bid still carries a points range, which is why the point bands (cv-strength-bands) apply to the artificial calls as much as to the natural ones. Page 2 closes the response section with the list the notes say you must hold in ROTE MEMORY: the 2♣ opening, 1M-1NT (forcing notrump), 1M-2NT (Jacoby 2NT), 1NT-2♦ and 1NT-2♥ (Jacoby transfers), 1NT-4♦ and 1NT-4♥ (Texas transfers), 1NT-2♣ (Stayman), the takeout double, the negative double, and 1m-2m (inverted minors) — 'you need to remember these bids by rote memory'. The instruction that follows is a system-level priority rule, not a pleasantry: 'if there is a conventional bid that can accurately describe your hand, you should use that.' That is exactly how this knowledge base is ordered — conventional items are considered before the natural ladder — so the ordering is the notes' own instruction and not an implementation detail. The rote list is page 2's; the four rows this chapter authors (Roman keycards, Gerber, splinters, the support cuebid) are NOT on it, which is the notes' way of saying they are the next tier of study rather than the first.",
    "concept",
    "auction",
    { kind: "none" },
    { sets: ["core"] },
  ),

  item(
    "cv-natural-suit-length",
    "How long a natural suit bid has to be",
    "Page 1's length contract, which every chapter's rules are written against. The FIRST natural suit bid (or implied suit) by any bidder requires FIVE-plus cards: a 1♥/1♠ opening, an overcall or an advance in any suit, the suit implied by a Jacoby or Texas transfer, 2♥ over 1♠, and any preemptive bid. The exceptions are named: a 1♣/1♦ opening (3+ cards), a ONE-level response to an opening bid (4+ cards), and a 2/1 response in a minor (4+ cards). The SECOND natural suit bid by any bidder requires FOUR-plus cards, with its own exceptions: opener's rebid after a forcing 1NT — 1M-1NT, then 2m — promises only 3+ cards. And once a suit has been AGREED, a bid of a new suit no longer shows length at all: it shows a CONTROL, and its job is to explore game or slam. Page 4 adds the practical corollary: it is acceptable to cheat on MINOR-suit length when there is no other bid (rebidding a five-card minor, bidding 2m over a forcing notrump with three), but never on major-suit length — 1♠-2♥ promises five hearts, while 1♠-2m may be a four-carder. This item defines the vocabulary; the length tests themselves live on the rules in the opening, response and rebid chapters.",
    "concept",
    "auction",
    { kind: "none" },
    { sets: ["core"] },
  ),

  // =========================================================================
  // Page 3 — the LOW / MEDIUM / HIGH ladders  [CONTRADICTION B]
  // =========================================================================
  item(
    "cv-strength-bands",
    "Low, medium and high (max): what the bands mean",
    "The notes describe almost every bid as 'low', 'medium', 'high' or 'max' rather than by a number, so these three ladders are what the shorthand means. As a RESPONDER facing an opening bid of 1♥/1♠/1♣/1♦: low = 6-9, medium = 10-11, high = 12+ (pages 1 and 3). Facing a 1NT opening the responder's ladder is different: low = 0-7, medium = 8-9, high = 10+ (page 3). As an OPENER of one of a suit: low = 12-15, medium = 16-19, high = 20-21, and the notes add the discipline that goes with them — 'your next bid should narrow your point range, i.e. bid at the right level' — because the raises, simple rebids and natural notrump bids are NOT forcing (page 3: 'the partner can pass unless you are already in the game forcing auction or inverted minor auction'), so the level IS the message. CONTRADICTION B, stated rather than smoothed over: page 3 prints the opener's ladder as low 12-15 / medium 16-18 / high 19-21, while pages 11, 14 and 31 all print 12-15 / 16-19 / 20-21 — page 14's whole summary table is headed 'Low (12 - 15 pts) | Med (16 - 19 pts) | High (20 - 21 pts, GF)' and page 31's footer repeats it. The better-supported reading (three pages against one) is encoded: medium is 16-19 and high is 20-21. Page 3's reading is one dial away — move the medium band's top to 18 and the high band's floor to 19. One narrower figure inside the low band is worth keeping in view: page 31 gives the 1NT REBID as 12-14, not 12-15, and page 14's table says the same ('1N (2-3b, 12-14pts)'), so the low band's top and the notrump rebid's top are not the same number. These dials record the partnership's reading of the vocabulary; the executable thresholds sit on the rules in the opening, response and rebid chapters, each of which carries its own setting.",
    "concept",
    "auction",
    { kind: "none" },
    {
      settings: [
        range("b_cv_opener_low", "Opener's LOW band (pages 3, 14)", 12, 15),
        range("b_cv_opener_medium", "Opener's MEDIUM band (pages 11/14/31; page 3 prints 16-18)", 16, 19),
        range("b_cv_opener_high", "Opener's HIGH band (pages 11/14/31; page 3 prints 19-21)", 20, 21),
        range("b_cv_responder_suit_low", "Responder's LOW band facing 1♣/1♦/1♥/1♠ (pages 1, 3)", 6, 9),
        range("b_cv_responder_suit_medium", "Responder's MEDIUM band facing a suit opening (pages 1, 3)", 10, 11),
        range("b_cv_responder_suit_high", "Responder's HIGH band facing a suit opening (pages 1, 3)", 12, 40),
        range("b_cv_responder_nt_low", "Responder's LOW band facing 1NT (page 3)", 0, 7),
        range("b_cv_responder_nt_medium", "Responder's MEDIUM band facing 1NT (page 3)", 8, 9),
        range("b_cv_responder_nt_high", "Responder's HIGH band facing 1NT (page 3)", 10, 40),
      ],
      sets: ["core"],
    },
  ),

  // =========================================================================
  // Pages 16-17 — the table itself, as the system's vocabulary
  // =========================================================================
  item(
    "cv-key-conventional-bids-table",
    "Key conventional bids: the notes' own definitions",
    "Pages 16-17 are a two-column reference table, Bid against Description. Reproduced row by row, in the notes' order and wording, so the system's whole vocabulary can be read in one place. TAKEOUT DOUBLE — double of an opponent's opening suit bid (up to 4♥), to show 18+ points, or support for the unbid suits with 12-17. NEGATIVE DOUBLE — double of an opponent's suit overcall (up to 2♠) over partner's opening suit bid, to show support for the unbid suits. LIMIT RAISE — four-card major suit support, 10-11 points, an invitation to game. JUMP RAISE — an eight-card fit for partner's suit plus a medium hand. JUMP REBID — rebid of one's own six-card suit plus a medium hand. JUMP SHIFT — a jump bid in the second four-plus card suit plus a max hand. REVERSE BID — a NON-jump bid of a second four-plus card higher-ranking suit, showing a medium-to-max hand. JACOBY 2NT — four-card major suit support, 12+ points, game forcing. STAYMAN — 2♣ in response to partner's 1NT opening, EVEN IF the next opponent doubles, to enquire about a major suit fit; if the opponent overcalls 2♣ then DOUBLE is the Stayman bid. TEXAS TRANSFER — a response to 1NT or 2NT with a six-plus card major and either game points (10-14) or strong slam interest (17+): 4♦ shows hearts, 4♥ shows spades. JACOBY TRANSFER — a response to 1NT or 2NT with a five-plus card major and a hand not suitable for Texas: diamonds shows hearts, hearts shows spades. MINOR SUIT TRANSFER — a response to 1NT with a six-plus card minor and either less than 10 points or mild slam interest (15+, in which case bid 3NT next); page 16's row prints 'bid 2♠ to transfer to ♣ and bid 3♣ to transfer to 3♦'. THAT ROW IS CONTRADICTION A: pages 2 and 10 both give the transfer as 2♠ to clubs and 2NT to diamonds, and the two-page reading also hangs together with the rest of the notrump structure (page 2 explains that 2NT is unavailable as an invitation BECAUSE it is the transfer to diamonds, and has responder start with Stayman instead), so 2♠/2NT is the reading this knowledge base encodes; the rules and the dial for it live with the minor-suit transfer item in the notrump-response chapter, not here. FORCING NT — 6-11 points, no four-plus card support for partner's major, no four-card spade suit; no three-card support AND 6-9 points, or possibly three-card support with 10-11. INVERTED MINOR — bid 2m to show a limit raise or better in support of partner's 1m opening. ROMAN KEY CARD (RKC) — enquire about the number of aces and the king of the AGREED suit: the first step shows 1 or 4, the second step 0 or 3, the third step 2 WITHOUT the trump queen, the fourth step 2 WITH it. SPLINTER — game forcing support for partner's suit (and rarely one's own): a DOUBLE jump in a suit that is short, a void or a singleton. GERBER — bid 4♣ opposite partner's 1NT or 2NT opening to enquire about the number of aces; similar to RKC without an agreed trump suit. SUPPORT CUEBID — bid the opponent's suit to show a limit raise or better support for partner's suit. MICHEAL'S CUEBID — (1M)-2M to show the other major and a minor; (1m)-2m to show both majors. UNUSUAL NT — (1m/1M)-2NT to show the two lowest unbid suits; a notrump bid by a PASSED hand whose partner has not overcalled, P-(1a)-P-(1b)-1NT, shows the other two suits, and so does a notrump bid by a NON-passed hand whose partner has not overcalled, (1a)-P-(1b)-1NT. UNUSUAL VERSUS UNUSUAL — when an opponent bids Michael's or the Unusual NT: if only one of their suits is known, cuebid that suit to show a limit raise or better support for partner's suit; if two of their suits are known, cuebidding their LOWER suit shows our lower suit and cuebidding their HIGHER suit shows our higher suit, with limit-raise-or-better points. This item is teaching text and compiles to no rules: each row's rules live in the chapter that owns the page where the notes explain it, and the four rows this chapter authors (Roman keycards, Gerber, splinters, the support cuebid) are the ones no other page explains.",
    "concept",
    "auction",
    { kind: "none" },
    { sets: ["core"] },
  ),

  // ---- the four shape-and-strength LABELS, as teaching text only ----------
  item(
    "cv-jump-raise",
    "Jump raise: an eight-card fit plus a medium hand",
    "Page 16's definition: a JUMP RAISE is 'an 8-card fit for partner's suit + medium hand'. Medium is relative to the seat (cv-strength-bands): 16-19 for an opener, 10-11 for a responder. The sequences the notes print are all in page 14's MED column — 1a-1M; 3M (a jump raise promising 4+ cards in the major) and 1♣-1♦; 3♦ (a jump raise promising 4+ diamonds) — and page 12 gives the same call as 'jump raise to 3m with support' in the 16-19 row. Responder's own jump raise is the LIMIT RAISE row of the same table: 1M-3M with four-card support and 10-11, which page 3 files under 'jump raise (med points)'. Two properties matter as much as the point range. It is NOT forcing (page 3: a raise of partner's suit can be passed unless the auction is already game forcing or an inverted-minor auction), so it is an INVITATION and page 14 prints both answers to it — 12-13 pass, 14-15 accept. And it is capped as well as floored: 'medium' means a HIGH hand does something else, which is why page 14's HIGH column answers a raise with game or a slam try rather than another invitation. The rules for these sequences are authored in the response and rebid chapters, each with its own point setting; this item exists so the label those chapters use has one definition.",
    "judgment_guideline",
    "auction",
    { kind: "none" },
    { sets: ["core"] },
  ),

  item(
    "cv-jump-rebid",
    "Jump rebid: a six-card suit of one's own plus a medium hand",
    "Page 16's definition: a JUMP REBID is a 'rebid [of your] own 6-card suit + medium hand'. Page 3 puts it in the ladder that gives the label its meaning — for one's own six-plus card suit, 'simple rebid (low pts), jump rebid (med pts) and GF bid (high pts)' — so the jump is the message, not the suit: the suit was already shown, and the extra level shows the extra points (page 4: 'try to show new information with every bid… rebidding your suit shows extra length. Jump bid shows extra points'). The sequences printed are page 14's MED column, 1♥-1♠; 3♥ (jump rebid, 6+ hearts) and 1♣-1a; 3♣ (jump rebid, 6+ clubs), and page 12 spells out both halves of the same row: 'jump rebid a strong 6-card suit' with 16-19, and after a forcing notrump 'rebid 3 of your major if you have a strong 6+-card suit — invitational (partner can pass)'. That parenthesis is the second half of the definition: like the jump raise, the jump rebid is an INVITATION and not a force. Page 12 also draws a distinction the point bands alone do not carry — inside 16-19 a STRONG six-carder is preferred to the alternatives while a WEAK six-carder is ranked below them — which is suit-quality judgment for the human, not a point test. The rules live in the rebid chapter.",
    "judgment_guideline",
    "auction",
    { kind: "none" },
    { sets: ["core"] },
  ),

  item(
    "cv-jump-shift",
    "Jump shift: a jump in the second suit plus a max hand",
    "Page 16's definition: a JUMP SHIFT is a 'jump bid in the 2nd 4+ card suit + max hand'. It is the one label in the table that is FORCING — page 13 says so outright ('make a strong jump-shift to 3 of a new suit (shows a 4+-card suit) – forcing') and page 12 explains why the notes need it at all: with 20-21 'you have to make a forcing bid or a game bid. None of the above bids are forcing. A jump bid in a new suit is forcing.' The sequences are page 14's HIGH column — 1a-1b; 2f where f outranks b, 1M-1NT; 3m, 1♠-1NT; 3♥ — plus page 12's 1m-1M; 2M. Two cautions belong with the label. FIRST, the floor the notes print is not quite the band: page 12's row is the 20-21 row, but the parenthetical inside it reads 'jump shift, 18+ pts', and page 14 files the jump shift under HIGH (20-21) — the notes are inconsistent about whether 18-19 may jump shift, and the safe reading is that a jump shift always shows a max hand while an 18-19 hand has the reverse and the 2NT rebid available instead. SECOND, this label belongs to the OPENER in this system: page 3 puts responder's jump shifts out of scope in as many words — 'the jump bids such as 1m - 2M, 1♣ - 2♦, etc. are out of syllabus at this time' — so a jump by RESPONDER into a new suit is not a jump shift here, it is undiscussed. The sequences are authored in the rebid chapter, which also owns the forcing entry that stops partner passing them.",
    "judgment_guideline",
    "auction",
    { kind: "none" },
    { sets: ["core"] },
  ),

  item(
    "cv-reverse-bid",
    "Reverse bid: the higher-ranking second suit, without a jump",
    "Page 16's definition: a REVERSE BID is a 'non-jump bid of a 2nd 4+ card higher level suit showing medium-max hand'. Page 4 gives the reasoning and the alternative in one paragraph: 'if a fit has not been found then bid your 4+ carder LOWER ranking second suit. To bid a higher ranking second suit (REVERSE BID), you need a strong hand. With a weaker hand, hope that the partner will bid that suit and then you can show your support. For example, 1♦ - 1♠; 2♦ - 2♥; 3♥' — that is the WEAK hand's route, rebidding the first suit and supporting hearts only after partner introduces them. The reverse itself is printed in page 14's '16+ pts' row of the MED column — 1♣-1NT; 2♦ and 1m-1NT; 2M — and pages 12-13 make it forcing in that exact sequence: with 18-19 points (or a very strong 17) 'make a reverse rebid of 2♠ (if you opened 1♥ and hold a 4-card spade suit) – forcing', and the same call reappears in the 20+ list. So the reverse is the one call in page 12's 16-19 group that partner may not pass, which is what makes it the right vehicle for a hand too strong for a natural rebid and not shapely enough for a jump shift. The reason it needs strength is arithmetic rather than convention: bidding the higher suit at the two level forces partner to the three level to return to the first suit. The rules live in the rebid chapter.",
    "judgment_guideline",
    "auction",
    { kind: "none" },
    { sets: ["core"] },
  ),

  // =========================================================================
  // Pages 16-17, ROMAN KEY CARD — the 4NT ask
  // =========================================================================
  auctionItem(
    "cv-rkc-ask",
    "Roman keycard Blackwood: the 4NT ask",
    "Page 16: Roman Key Card 'enquire[s] the number of aces and K of the agreed suit' — five keycards, the four aces plus the king of the AGREED trump suit. The ask therefore requires a genuine agreed suit, and that is how it is gated here: a suit both partners have NAMED, or a fit of eight cards that both partners have SHOWN (fit('agreed_suit', 8)), never merely 'I have support in my hand'. That gate is also what keeps 4NT out of the auctions where this system gives it a NATURAL meaning: page 2 uses 4NT as a quantitative raise of a 1NT opening (15-17 points) and page 11 as a quantitative raise of 2NT (12-13), and in both of those partner's last call was notrump and no suit is agreed, so this rule cannot fire there. WHEN TO ASK is the part the notes state only by example, so it is two branches with settings rather than an invention. The POINT branch comes from page 2's own notrump ladder: 6NT is bid with 17+ opposite a 15-17 opening, which is 32 combined points, so 32 is the default combined floor. The second branch is page 19's reasoning generalized: facing a partner who has SHOWN a long trump suit — a preempt, or a jump rebid of a six-carder — the notes stop counting points and count tricks instead (page 5: assume partner is down two vulnerable or down three not vulnerable, then count what you cover), so a hand strong enough on its own (page 2's 17+ 'continue to explore slam' threshold) may ask even though the combined count is short of 32. ONE THING THE MECHANISM CANNOT REACH, stated rather than papered over: page 19's deal 5 has South bid 4NT as the SECOND call of the auction, over partner's 3♥ preempt, holding two hearts it has never bid. No rule here can produce that call, because an agreed suit is derived from what both partners have SHOWN and a seat that has not yet called has shown nothing — the fit is in South's hand, not in the auction. Agreeing hearts first makes the ask available; asking on the second call does not. The ask is also scoped to uncontested auctions, a deliberate narrowing: page 15's interference rule switches off the limit raise, Jacoby 2NT, inverted minors and the forcing notrump and says nothing about keycards, but a 4NT over an opponent's bid has other jobs the notes never discuss.",
    "convention",
    [
      rule(
        "ask",
        "4NT Roman keycard ask",
        ctx("any", { partnerLast: SUIT_BID, contested: false }),
        all(
          fit("agreed_suit", 8),
          any(
            combHcp(low("b_cv_rkc_slam_values")),
            // Page 19's reasoning: opposite a SHOWN long trump suit the notes
            // count tricks, not points, so a strong hand may ask below the
            // combined floor. Partner's shown length is the visible half of
            // page 5's trick argument; the trick count itself has no predicate.
            all(hcp(low("b_cv_rkc_solo_values")), partnerLen("agreed_suit", 6)),
          ),
        ),
        bid(4, "N"),
        10,
        {
          // An ask that partner may pass is not an ask. No forcing_rules item
          // is needed to make that true: the four steps below cover every
          // keycard count, they sit in the convention band, and they match on
          // the pending ask — so partner always has an answer that outranks
          // the natural ladder.
          shows: shows({ forcing: true }),
          ask: ask(RKC, RKC_RESPONSES),
        },
      ),
    ],
    {
      settings: [
        toggle(
          "b_cv_rkc_on",
          "Roman keycard Blackwood (4NT)",
          true,
          "After a trump suit is agreed, 4NT asks for the four aces plus the trump king (page 16).",
        ),
        range("b_cv_rkc_slam_values", "Keycards: combined points to ask (page 2's 17+ opposite 15-17)", 32, 33, {
          min: 20,
          max: 40,
        }),
        range(
          "b_cv_rkc_solo_values",
          "Keycards: own points to ask opposite a shown long trump suit (page 19, deal 5)",
          17,
          40,
          { min: 10, max: 40 },
        ),
      ],
      sets: ["conventions"],
    },
  ),

  auctionItem(
    "cv-rkc-responses",
    "Keycard answers: the notes' step scheme",
    "Page 16's scheme, answering 4NT and counting the four aces plus the king of the agreed trump suit: the FIRST step (5♣) shows 1 or 4 keycards, the SECOND step (5♦) shows 0 or 3, the THIRD step (5♥) shows 2 WITHOUT the trump queen, and the FOURTH step (5♠) shows 2 WITH the trump queen. Page 19's deal-5 remark names this scheme 'RKC 1430', and the two agree: 1430 is precisely the orientation in which the cheapest step is the 1-or-4 answer. Each step is matched on the PENDING ASK rather than on a bare 4NT, so a natural or quantitative 4NT is never answered in keycards. The with-queen step is tested before the without-queen step so the queenless answer is the residue. ONE GAP IN THE PRINTED TABLE is filled rather than hidden: the four steps account for 0, 1, 2, 3 and 4 keycards but the notes print no answer for a hand with ALL FIVE, so the third and fourth steps are read as '2 or 5' — the standard 1430 pairing implied by page 19's label — and a responder is never left without a legal call. The cost is that a two-way answer leaves the asker with a RANGE, which is exactly why the continuation signs off unless every value in that range is safe.",
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
        "r-2-with-queen",
        "5♠: 2 keycards WITH the trump queen (fourth step)",
        ctx("any", { askInProgress: RKC, contested: false }),
        all(
          any(keycards("agreed_suit", 2, 2), keycards("agreed_suit", 5, 5)),
          { holds: { suit: "agreed_suit", rank: 12 } },
        ),
        bid(5, "S"),
        22,
      ),
      rule(
        "r-2-without-queen",
        "5♥: 2 keycards WITHOUT the trump queen (third step)",
        ctx("any", { askInProgress: RKC, contested: false }),
        any(keycards("agreed_suit", 2, 2), keycards("agreed_suit", 5, 5)),
        bid(5, "H"),
        23,
      ),
    ],
    { sets: ["conventions"] },
  ),

  auctionItem(
    "cv-rkc-continuations",
    "After the keycard answer: sign off, or bid the slam",
    "The point of asking is the one page 16 states — count the aces and the trump king — so the asker's decision is KEYCARD ARITHMETIC and nothing else, never a fresh look at one hand's points. Having decoded partner's step into the partnership's combined count: missing TWO or more keycards, sign off at the five level in the agreed suit; missing at most ONE, bid the small slam in the agreed suit. Because the notes' first two steps are deliberately two-way (1 or 4, 0 or 3), the combined count is sometimes a range rather than a number, and the safe road is taken whenever the range is not entirely safe — a third rule signs off at five when nothing above it fired. Page 19's deal 5 is the worked example and it lands where the notes say it should: South holds ♠KT9 ♥AJ ♦A92 ♣AK932 — three keycards for hearts — North's 5♣ first step shows 1 or 4, so the partnership is missing at most one and South bids 6♥, which is exactly the notes' 'bid 4NT (RKC 1430) and then 6♥'. The notes give no 5NT king ask and no exclusion keycard bid, so neither is invented here: with all five keycards this system simply bids the small slam.",
    "convention",
    [
      rule(
        "small-slam",
        "Missing at most one keycard: bid six of the agreed suit",
        ctx("any", { ownLast: FOUR_NT, partnerLast: FIVE_SUIT, contested: false }),
        kcMissing(undefined, 1),
        bidSuit("agreed_suit", 6),
        30,
      ),
      rule(
        "sign-off",
        "Missing two or more keycards: stop at five",
        ctx("any", { ownLast: FOUR_NT, partnerLast: FIVE_SUIT, contested: false }),
        kcMissing(2),
        bidSuit("agreed_suit", 5),
        31,
      ),
      // Totality guard: a two-way step can leave the count genuinely unclear.
      rule(
        "sign-off-unclear",
        "Count unclear: sign off at five",
        ctx("any", { ownLast: FOUR_NT, partnerLast: FIVE_SUIT, contested: false }),
        { all: [] },
        bidSuit("agreed_suit", 5),
        32,
      ),
    ],
    { sets: ["conventions"] },
  ),

  // ---- page 19's remark, as teaching content ------------------------------
  item(
    "cv-rkc-1430",
    "'RKC 1430' — page 19's deal 5, and why nothing had to be reconciled",
    "Page 19's remark on deal 5 is the only place in the notes where the keycard convention is given a variant NAME: 'After N opens 3♥, S should immediately think about slam — two-card heart support is good enough. At the table S bid 3NT incorrectly. Any bid by S is forcing except 3NT and shows heart support. S should just bid 4NT (RKC 1430) and then 6♥.' The label agrees with the table on page 16, so there is nothing to resolve: 1430 means the cheapest step is the 1-or-4 answer and the second step is 0-or-3, which is exactly what page 16 prints. Read the other way round, page 19 is what settles the orientation for a reader who might otherwise assume the more common 0314 scheme. THREE things this remark teaches beyond the name. (1) TWO-CARD support was enough to agree hearts, because partner's preempt promised a seven-card suit — a nine-card fit — which is why the keycard ask is gated on an eight-card FIT rather than on holding three or four trumps. (2) Slam was worth asking about on 26 combined points, because facing a preempt the notes count TRICKS (page 5), not points; the ask's second branch is that reasoning, expressed as 'strong hand opposite a partner who has shown a long trump suit'. (3) 'Any bid by S is forcing except 3NT' is a statement about responding to a PREEMPT: it is teaching content here rather than a rule, because the preempt-response machinery belongs to the response chapter, and 4NT gets its answer from the step table without needing a forcing entry. AND ONE HONEST FAILURE, recorded so nobody has to rediscover it: this exact call is out of the mechanism's reach. South's 4NT is the second call of the auction and South has never bid hearts, so the fit exists only in South's hand — while an 'agreed suit' is derived from what both partners have SHOWN in the auction, which is what makes it safe to keycard against. The rules will find this ask once hearts are agreed; they will not find it on South's first turn. A fellow who wants deal 5's auction has to teach the system that a preemptive opening plus support in hand agrees the suit outright, which is a change to the inference layer, not to this chapter.",
    "concept",
    "auction",
    { kind: "none" },
    { sets: ["conventions"] },
  ),

  // =========================================================================
  // Pages 16-17, GERBER — 4♣ over a 1NT or 2NT opening
  // =========================================================================
  auctionItem(
    "cv-gerber-ask",
    "Gerber: 4♣ over a 1NT or 2NT opening",
    "Page 16: 'bid 4♣ opposite 1N or 2N opening bid by partner to enquire the number of aces. Similar to RKC w/o agreed upon trump suit.' Page 2 gives the hand type: in the balanced branch that has no major and no long minor to show — 'Pass (0-7 pts), 3N (10-14 pts), 4N (15-17 pts), 6N (17+ pts)' — 'with 15+ pts, you can also use GERBER (4♣) to enquire about the number of aces.' So 15+ is the notes' own floor opposite a 1NT opening and it is the default here. Opposite a 2NT opening the notes name Gerber (page 16 says '1N or 2N') but print no floor, so the inference is stated: page 11's 2NT ladder puts the slam-zone hand at 12-13 ('4N (12-13 pts)'), and 12 opposite a 20-21 opening is the same 32-33 combined the notrump ladder treats as slam values, so 12 is the default there and is exposed as its own dial. IT CANNOT COLLIDE WITH A NATURAL 4♣, for two reasons that are worth separating. First, this system assigns 4♣ over 1NT/2NT no other meaning at all: Stayman is 2♣ (3♣ over 2NT), the Jacoby transfers are 2♦/2♥ (3♦/3♥), Texas is 4♦/4♥, and the minor-suit transfer is 2♠/2NT — a natural 4♣ is not part of the structure. Second, the ask still carries the shape guards that keep it off the hands belonging to those gadgets: no four-card major (that hand is Stayman) and no six-card minor (that hand is the minor-suit transfer). Like the other notrump gadgets it is scoped to uncontested auctions; page 16 gives the 'even if the next opponent doubles' treatment to STAYMAN only, and extending it to Gerber would be an invention.",
    "convention",
    [
      rule(
        "ask-over-1nt",
        "4♣ Gerber over 1NT",
        ctx("responder", { opening: is("1N"), partnerLast: is("1N"), contested: false }),
        all(
          hcp(low("b_cv_gerber_values")),
          len("H", undefined, 3),
          len("S", undefined, 3),
          len("C", undefined, 5),
          len("D", undefined, 5),
        ),
        bid(4, "C"),
        11,
        { shows: shows({ hcp: { min: 15 }, forcing: true }), ask: ask(GERBER, GERBER_RESPONSES) },
      ),
      rule(
        "ask-over-2nt",
        "4♣ Gerber over 2NT",
        ctx("responder", { opening: is("2N"), partnerLast: is("2N"), contested: false }),
        all(
          hcp(low("b_cv_gerber_values_2nt")),
          len("H", undefined, 3),
          len("S", undefined, 3),
          len("C", undefined, 5),
          len("D", undefined, 5),
        ),
        bid(4, "C"),
        12,
        { shows: shows({ hcp: { min: 12 }, forcing: true }), ask: ask(GERBER, GERBER_RESPONSES) },
      ),
    ],
    {
      settings: [
        toggle(
          "b_cv_gerber_on",
          "Gerber (4♣ over 1NT/2NT)",
          true,
          "4♣ opposite a 1NT or 2NT opening asks for aces (pages 2, 16).",
        ),
        range("b_cv_gerber_values", "Gerber over 1NT: points to ask (page 2's 15+)", 15, 40, {
          min: 10,
          max: 40,
        }),
        range(
          "b_cv_gerber_values_2nt",
          "Gerber over 2NT: points to ask (inferred from page 11's 12-13 slam-zone row)",
          12,
          40,
          { min: 8, max: 40 },
        ),
      ],
      sets: ["conventions"],
    },
  ),

  auctionItem(
    "cv-gerber-responses",
    "Gerber answers: the ace-showing steps",
    "The notes define Gerber as 'similar to RKC w/o agreed upon trump suit' and print no response table for it, so the steps are the notes' OWN keycard steps (page 16) applied to aces, and the derivation is stated rather than assumed: the FIRST step (4♦) shows 1 or 4 aces, the SECOND step (4♥) shows 0 or 3, and the THIRD step (4♠) shows 2. Without an agreed trump suit there is no fifth keycard and no trump queen, so page 16's third and fourth steps collapse into one and 4NT is left with no meaning as an answer — a partnership that plays the widespread alternative (4♦ = 0 or 4, 4♥ = 1, 4♠ = 2, 4NT = 3) must agree that explicitly, because the two schemes disagree about every step. The three steps are total: they cover 0, 1, 2, 3 and 4 aces, so the asker always gets an answer. Each is matched on the PENDING ASK, so an ordinary 4♦/4♥ — a Texas transfer, for instance — is never read as an ace answer.",
    "convention",
    [
      rule(
        "g-1-or-4",
        "4♦: 1 or 4 aces (first step)",
        ctx("any", { askInProgress: GERBER, contested: false }),
        any(aces(1, 1), aces(4, 4)),
        bid(4, "D"),
        24,
      ),
      rule(
        "g-0-or-3",
        "4♥: 0 or 3 aces (second step)",
        ctx("any", { askInProgress: GERBER, contested: false }),
        any(aces(undefined, 0), aces(3, 3)),
        bid(4, "H"),
        25,
      ),
      rule(
        "g-2",
        "4♠: 2 aces (third step)",
        ctx("any", { askInProgress: GERBER, contested: false }),
        aces(2, 2),
        bid(4, "S"),
        26,
      ),
    ],
    { sets: ["conventions"] },
  ),

  item(
    "cv-gerber-after-the-answer",
    "After the Gerber answer: what the notes say, and what the language cannot",
    "The notes give Gerber a question and no continuation, so none is invented. What page 2 does give is the ladder the ask was borrowed from, and it is the right guide for the human: opposite a 15-17 notrump, 4NT is the quantitative slam invitation with 15-17, and 6NT is bid with 17+; opposite a 2NT opening, page 11 puts 4NT at 12-13. Gerber is asked instead when the DECISION turns on aces rather than on points — the answer tells you whether two of them are missing, which is the one thing a point count cannot. So: two aces missing, stop below slam (sign off in notrump at the level page 2's ladder gives the hand); at most one missing, bid the slam the point count already suggested; all four present with the values for it, the grand slam is a matter of counting tricks, which the notes do not discuss opposite a notrump opening. THIS IS DELIBERATELY NOT MECHANIZED, and the reason is a limit of the language rather than a gap in the notes. The combined-keycard arithmetic that drives the Roman keycard sign-off (`keycardsMissing`) resolves only when the partnership has an AGREED TRUMP SUIT, because the fifth keycard is that suit's king — and Gerber, by page 16's own definition, is 'RKC w/o agreed upon trump suit'. There is no predicate for 'partner has shown N aces' outside that arithmetic, so a mechanized continuation would have to guess. The ask still records the answer (the ace count goes into the keycard channel, the only one `AskResponseMeaning` offers), and if a suit is agreed later that record can only UNDERSTATE the partnership's holding — partner's trump king is not in an ace answer — so nothing downstream can overbid on it.",
    "judgment_guideline",
    "auction",
    { kind: "none" },
    { sets: ["conventions"] },
  ),

  // =========================================================================
  // Pages 16-17, SPLINTER — the double jump in a short suit
  // =========================================================================
  auctionItem(
    "cv-splinter",
    "Splinter: the double jump in a short suit",
    "Page 16: 'game forcing support for partner's suit (and rarely own suit). Double jump in a suit that is short (void or singleton)'. Page 15 repeats it in the interference list — 'Splinter bids: shows shortness in the bid suit with GF values' — which is why these rules are NOT scoped to uncontested auctions: the notes keep the splinter available when an opponent has bid, in the same breath as they switch off the limit raise, Jacoby 2NT, inverted minors and the forcing notrump. A DOUBLE jump is worked out per opening rather than assumed: over 1♥ the cheapest spade call is 1♠, so the double jump is 3♠, while the cheapest club call is 2♣, so the double jump is 4♣ — giving 3♠/4♦/4♣ over 1♥, 4♥/4♦/4♣ over 1♠, 3♦/3♥/3♠ over 1♣ and 4♣/3♥/3♠ over 1♦. A VOID qualifies as well as a singleton, so the shape test is 'at most one card'. SUPPORT is four cards facing a major (the notes' 1♥/1♠ opening promises five, so four is the eight-card fit page 3 asks for) and FIVE facing a minor, because 1♣/1♦ promises only three cards and every minor-support bid the notes print — inverted minors, the weak 3m raise — requires five (page 10). Splinters over a MINOR opening are page 16's general wording ('partner's suit') applied to 1♣/1♦: the notes only ever illustrate a splinter over a major, and the calls involved have no other meaning in this system, since page 3 puts responder's ordinary jump shifts out of syllabus. GAME FORCING sets the floor at the responder's high band, 12+ (page 3), and page 19's deal 4 shows how the notes actually use it: holding ♠K542 ♥AQ63 ♦J853 ♣6 — 10 points, four-card heart support, a singleton club — the remark offers '3♥, 4♣ (splinter) or 2NT (Jacoby 2NT, aggressive)'. The notes are describing a 10-point hand splintering while calling the 12+ gadget beside it aggressive, so the floor stays at the printed 12+ and the setting is where a partnership that wants deal 4's action lowers it.",
    "convention",
    SPLINTERS.flatMap(({ open, support, steps }) =>
      steps.map(({ short, level }) =>
        rule(
          `splinter-${short.toLowerCase()}-over-1${open.toLowerCase()}`,
          `${level}${SUIT_GLYPH[short]} splinter over 1${SUIT_GLYPH[open]} (short in ${SUIT_WORD[short]})`,
          overOpening(open),
          all(
            len(open, support),
            len(short, undefined, 1),
            hcp(low("b_cv_splinter_values")),
          ),
          bid(level, short),
          open === "H" || open === "S" ? 14 : 15,
          {
            shows: shows({
              hcp: { min: 12 },
              suits: [
                { suit: open, min: support },
                { suit: short, max: 1 },
              ],
              forcing: true,
            }),
          },
        ),
      ),
    ),
    {
      settings: [
        toggle(
          "b_cv_splinter_on",
          "Splinter bids",
          true,
          "A double jump in a short suit shows game-forcing support for partner's suit (pages 15, 16).",
        ),
        range("b_cv_splinter_values", "Splinter: game-forcing values (page 3's 12+; page 19's deal 4 splinters on 10)", 12, 40, {
          min: 8,
          max: 40,
        }),
      ],
      sets: ["conventions"],
    },
  ),

  item(
    "cv-splinter-is-forcing",
    "A splinter may not be passed",
    "Page 16 calls the splinter 'game forcing support', so opener may not pass it — the partnership is committed to at least game in the agreed suit and opener's job is to decide between game and slam, with a known singleton or void opposite. Pass is removed in each of the twelve sequences the double jump can produce (3♠/4♦/4♣ over 1♥, 4♥/4♦/4♣ over 1♠, 3♦/3♥/3♠ over 1♣ and 4♣/3♥/3♠ over 1♦). Note what the force does NOT settle: the notes give no answering table for opener after a splinter — no scheme for signing off, cuebidding a control or asking for keycards — so beyond 'do not pass' the continuation is opener's judgment, informed by the keycard machinery once the fit is agreed (which, after a splinter, it is). Page 16's 'and rarely own suit' — a splinter supporting one's OWN suit rather than partner's — is named by the notes and given no sequence, so it is not mechanized at all.",
    "agreement",
    "auction",
    {
      kind: "forcing_rules",
      rules: SPLINTERS.flatMap(({ open, steps }) =>
        steps.map(({ short, level }, i) =>
          forcing(
            `splinter-force-${short.toLowerCase()}-over-1${open.toLowerCase()}`,
            `1${SUIT_GLYPH[open]} - ${level}${SUIT_GLYPH[short]} splinter is forcing on opener`,
            ctx("opener", {
              opening: is(`1${open}`),
              partnerLast: is(`${level}${short}`),
              roundMax: 2,
            }),
            30 + i,
          ),
        ),
      ),
    },
    { sets: ["conventions"] },
  ),

  // =========================================================================
  // Pages 16-17, SUPPORT CUEBID — the opponent's suit as a strong raise
  // =========================================================================
  auctionItem(
    "cv-support-cuebid",
    "Support cuebid: the opponent's suit shows a limit raise or better",
    "Page 16: 'bid opponent's suit to show limit raise or better support for partner's suit'. Page 15 is where the notes explain why this bid has to exist — 'WHEN OPPONENTS INTERFERE, LIMIT RAISE, JACOBY 2NT, INVERTED MINORS AND FORCING NT ARE OFF. Use the cuebid to show those hands' — so the cuebid is the single replacement for four switched-off gadgets: 'cuebid with any hand that was good for a limit raise, Jacoby 2NT, inverted minors or Forcing NT with 3M support (10-11 pts)', and 'cuebid shows 10+ pts, very likely with a support for the partner's suit'. Encoded as the table's row: partner opened one of a suit, the opponent on the right overcalled, and this hand has 10+ points with support — THREE-plus cards facing a major (page 15's own 'Forcing NT with 3M support' hand cuebids, so three is enough) and FIVE facing a minor (the inverted-minor hand it replaces requires five, page 10). The cuebid is the cheapest bid of the overcaller's suit. Two boundaries are deliberate. The support cuebid has no upper limit — page 15 says 10+ and lets the rebid clarify — which is why it is the right call for the Jacoby-2NT hand as well as the limit-raise hand. And this item mechanizes only the table's row: page 15's other uses of a cuebid (the ADVANCED delayed cuebid asking partner to bid notrump with a control, the advancer's cuebid of the opener's suit over partner's overcall, and the Unusual-vs-Unusual scheme on pages 16-17 and 25) belong with the competitive-bidding material, which owns those pages.",
    "convention",
    (["H", "S", "C", "D"] as Suit4[]).map((open) =>
      rule(
        `cuebid-over-1${open.toLowerCase()}`,
        `Cuebid the overcall to show a strong raise of 1${SUIT_GLYPH[open]}`,
        ctx("responder", {
          opening: is(`1${open}`),
          partnerLast: is(`1${open}`),
          rhoLast: anyBid,
          contested: true,
        }),
        all(
          hcp(low("b_cv_support_cuebid_values")),
          len(open, open === "H" || open === "S" ? 3 : 5),
        ),
        bidSuit("rho_bid_suit"),
        18,
        {
          shows: shows({
            hcp: { min: 10 },
            suits: [{ suit: open, min: open === "H" || open === "S" ? 3 : 5 }],
          }),
        },
      ),
    ),
    {
      settings: [
        toggle(
          "b_cv_support_cuebid_on",
          "Support cuebid",
          true,
          "Over an opponent's overcall, bidding their suit shows a limit raise or better (pages 15, 16).",
        ),
        range("b_cv_support_cuebid_values", "Support cuebid: limit-raise-or-better values (page 15's 10+)", 10, 40, {
          min: 6,
          max: 40,
        }),
      ],
      sets: ["conventions"],
    },
  ),
];

/** Page(s) each item was authored from — install.ts turns these into citations. */
export const CONVENTIONS_PAGES: Record<string, number[]> = {
  "cv-natural-vs-conventional": [1, 2],
  "cv-natural-suit-length": [1, 4],
  // Both sides of contradiction B are cited, so a reviewer can see the
  // disagreement without leaving the item.
  "cv-strength-bands": [3, 11, 14, 31],
  "cv-key-conventional-bids-table": [16, 17, 2, 10],
  "cv-jump-raise": [16, 14, 3],
  "cv-jump-rebid": [16, 14, 12, 3],
  "cv-jump-shift": [16, 14, 13, 12, 3],
  "cv-reverse-bid": [16, 14, 13, 4],
  "cv-rkc-ask": [16, 19, 2],
  "cv-rkc-responses": [16, 19],
  "cv-rkc-continuations": [16, 19],
  "cv-rkc-1430": [19, 16],
  "cv-gerber-ask": [16, 2, 11],
  "cv-gerber-responses": [16],
  "cv-gerber-after-the-answer": [16, 2, 11],
  "cv-splinter": [16, 15, 19],
  "cv-splinter-is-forcing": [16],
  "cv-support-cuebid": [16, 15],
};

/**
 * Stage wiring. Every satellite of a convention authored HERE points at the
 * item that carries the enable toggle, so switching the parent off can never
 * leave an orphan stage live: the keycard answers and continuations need the
 * 4NT ask, Gerber's answers need the 4♣ ask, and the splinter's forcing entry
 * needs the splinter. The two teaching satellites (page 19's remark, the
 * Gerber post-mortem) are wired the same way so they travel with their gadget.
 *
 * Every edge stays inside this file's own keys. The vocabulary item names a
 * dozen conventions other chapters own — Stayman, the transfers, the doubles,
 * Michaels — and gets no edge to any of them: those keys are another author's
 * to create, and an edge to a key that does not exist would fail the install.
 */
export const CONVENTIONS_EDGES: TemplateEdge[] = [
  { from: "cv-rkc-responses", edgeType: "requires", to: "cv-rkc-ask" },
  { from: "cv-rkc-continuations", edgeType: "requires", to: "cv-rkc-ask" },
  { from: "cv-rkc-1430", edgeType: "requires", to: "cv-rkc-ask" },
  { from: "cv-gerber-responses", edgeType: "requires", to: "cv-gerber-ask" },
  { from: "cv-gerber-after-the-answer", edgeType: "requires", to: "cv-gerber-ask" },
  { from: "cv-splinter-is-forcing", edgeType: "requires", to: "cv-splinter" },
  { from: "cv-natural-suit-length", edgeType: "requires", to: "cv-natural-vs-conventional" },
  { from: "cv-jump-raise", edgeType: "requires", to: "cv-strength-bands" },
  { from: "cv-jump-rebid", edgeType: "requires", to: "cv-strength-bands" },
  { from: "cv-jump-shift", edgeType: "requires", to: "cv-strength-bands" },
  { from: "cv-reverse-bid", edgeType: "requires", to: "cv-strength-bands" },
];

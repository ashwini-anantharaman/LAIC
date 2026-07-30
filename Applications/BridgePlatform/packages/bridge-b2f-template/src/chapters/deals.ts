// The December 2025 deal review — pages 18-24 of the "Bridge 2 Fun Training"
// notes: fifteen real deals with full four-hand layouts, the hcp printed beside
// each seat, the makeable contracts, the par result, and a bidding lesson plus a
// play/defence lesson for every one.
//
// WHY THIS CHAPTER PRODUCES NO RULES AT ALL, deliberately. Every item here is a
// `concept` (the closing themes item is a `judgment_guideline`) with a payload of
// `{kind:"none"}`. A deal is teaching material: its lesson is true of THAT
// layout, and a bidding rule compiled from one hand is overfitting — it would
// fire on every hand that happens to match the conditions I chose to write down,
// which is not what the page claims. The generalisable content already lives in
// the openings / responses / rebids / competitive / play / carding chapters, and
// those chapters own the executable rules. So there are no priorities and no
// bands to police in this file: nothing here is ever considered by the decider.
// What the items do instead is name, in the item text, every place where a
// deal's lesson CONTRADICTS or CAVEATS a rule another chapter produces. Those
// are findings a reviewer should see, not friction to smooth away.
//
// PROVENANCE, and why the layouts are trustworthy. The hands were transcribed
// from the diagrams into `deals.json` and then machine-checked before any of
// them was used here (see b2f.deals.test.ts): 52 distinct cards, thirteen per
// seat, thirteen per suit, and — the strong check — the hcp derived from the
// transcribed cards equals the hcp PRINTED beside that seat on the page, for all
// four seats of all fifteen deals. That printed number is evidence I did not
// generate. It caught two real errors in deal 5 on the first pass (a diamond
// dropped from West, a ♦9 invented in East), which is why the layouts below are
// copied from the checked file rather than re-read from the page: on a hand
// diagram, the checksum is the arbiter and nobody's memory is.
//
// HOW THE TEXT IS LAID OUT, so a fellow can read an item cold: dealer and
// vulnerability, then the four hands one line each with the PRINTED hcp, then
// the makeable contracts and the par result QUOTED VERBATIM from the page (which
// is why those two lines use the page's suit letters — NS 4S; EW 4H — while the
// hands and the auctions use suit symbols), then the bidding lesson, then the
// play or defence lesson, then any cross-reference or conflict. `T` is the ten.
// A void prints as an em dash.
//
// PHASE. One phase per item, chosen by where the substance of the deal lies:
// `auction` for the twelve whose bidding lesson is the teaching (2, 3, 4, 5, 6,
// 13, 15, 19, 21, 28, 29 and the themes item), `declarer_play` for the three
// where the notes bless the auction and the error is declarer's (14, 17, 30),
// and `defense` for deal 20, whose headline error is a defender's card. Every
// item carries BOTH lessons in its text regardless of the phase tag.
//
// SETS. `core`, with no enable toggle. These items compile to nothing, so there
// is no rule to leave stranded when a convention is switched off, and gating
// teaching text behind a convention switch would misfile it. They reach the
// Full pack through Core.
//
// SETTINGS. Every key here is prefixed `b_deal_`. Each one is a RECORD dial: it
// documents a number or a choice the review states, and because this chapter has
// no rules, nothing reads it — the executable dial for the same idea, where one
// exists, belongs to the chapter that owns the rule. They are exposed anyway
// because the notes' choice should be visible and adjustable rather than buried
// in prose, per the authoring brief. Numeric dials use the DSL's `range` control
// (the only numeric control the vocabulary has); where the notes state only a
// floor, low and high are set equal and the description says so.

import { item, range, toggle, type TemplateItem } from "@bridge/sayc-template/dsl";

/** One reviewed deal: teaching material, never a rule. */
const deal = (
  key: string,
  title: string,
  text: string,
  phase: "auction" | "declarer_play" | "defense",
  opts: Parameters<typeof item>[6] = {},
): TemplateItem => item(key, title, text, "concept", phase, { kind: "none" }, opts);

export const DEALS: TemplateItem[] = [
  // =========================================================================
  // PAGE 18 — deals 2 and 3
  // =========================================================================

  deal(
    "deal-2",
    "Deal 2 (p.18) — bring the major in first, even holding six diamonds",
    "DEALER East. NORTH-SOUTH VULNERABLE. " +
      "NORTH 18 hcp: ♠KQJ974 ♥QJ ♦5 ♣AKQT. " +
      "EAST 12 hcp: ♠AT8 ♥A43 ♦K8 ♣J8753. " +
      "SOUTH 5 hcp: ♠632 ♥982 ♦AJ73 ♣942. " +
      "WEST 5 hcp: ♠5 ♥KT765 ♦QT9642 ♣6. " +
      "MAKEABLE CONTRACTS (quoted from the page): NS 4S; EW 4H; EW 4D; NS 2C. " +
      "PAR (quoted): Par +100; EW 5D x-1; EW 5H x-1. " +
      "BIDDING LESSON. East opens 1♣. West should IGNORE the diamonds and bid 1♥ even with six diamonds and only four hearts, because with a NON-GAME-FORCING hand you bring a major in as soon as possible — bypass the diamonds. With a GAME-FORCING hand you bid naturally instead: the longer suit first, the higher-ranking of two equal-length suits. " +
      "DEFENCE AND PLAY. After (1♣)-(1♦) — the auction that actually happened, with the diamonds bid — North should DOUBLE to show a strong hand and plan to bid spades later. East should PASS rather than bid 1NT to show a weak hand. Play problem: dummy had ♦J73 remaining when East played the ♦8, and West should play the 9 if South plays low. " +
      "AGAINST THE REST OF THE NOTES (my reading, labelled as mine). Page 1 restricts longest-suit-first to game-forcing hands, so this is the notes' own tie-break for the non-forcing case rather than a contradiction of it. It does sit awkwardly with the response floor: page 1 says pass a 1m opening with fewer than 6 points and West holds 5 — the 6-5 shape is the obvious justification, but the page states only WHICH suit to bid, not that West is worth a bid at all. No auction rule is authored from this deal.",
    "auction",
    {
      settings: [
        toggle(
          "b_deal_major_before_longer_minor",
          "Non-forcing responder shows the major before a longer minor",
          true,
          "The notes' choice on page 18 (deal 2): with a non-game-forcing hand, respond 1♥ on four hearts even holding six diamonds. A record dial — the executable response ladder lives in the responses chapter, where longest-suit-first applies to game-forcing hands only.",
        ),
      ],
    },
  ),

  deal(
    "deal-3",
    "Deal 3 (p.18) — the cuebid is the strong raise once they have bid",
    "DEALER South. EAST-WEST VULNERABLE. " +
      "NORTH 9 hcp: ♠3 ♥J97543 ♦KJ7 ♣KJ3. " +
      "EAST 13 hcp: ♠KQT97 ♥AQT ♦Q32 ♣92. " +
      "SOUTH 7 hcp: ♠J54 ♥6 ♦T54 ♣AQT864. " +
      "WEST 11 hcp: ♠A862 ♥K82 ♦A986 ♣75. " +
      "MAKEABLE CONTRACTS (quoted): EW 4S; EW 3D; NS 3C; EW 1N. " +
      "PAR (quoted): Par -300: NS 5C x-2. " +
      "BIDDING LESSON. After (P)-P-(2♥)-2♠, West should bid 3♥ — a CUEBID showing 10+ points and spade support. " +
      "PLAY LESSON. 4♠ makes because the ♦K is with North. Declarer should take the ♦A and lead towards the ♦Q after removing all the trumps; you do not need trumps for any ruffs. " +
      "NOTES (mine). West's initial pass is correct, not timid: 11 hcp is below the notes' 12-point opening floor, so the values can only be shown later. The 3♥ call is a worked instance of the systemic rule on page 15 — with interference the limit raise, Jacoby 2NT, inverted minors and the forcing 1NT are ALL OFF and the cuebid carries those hands — so this deal supports that rule rather than adding one. Nothing here is authored as a rule.",
    "auction",
  ),

  // =========================================================================
  // PAGE 19 — deals 4 and 5
  // =========================================================================

  deal(
    "deal-4",
    "Deal 4 (p.19) — show the heart fit: 3♥, the splinter or Jacoby 2NT, never 1NT",
    "DEALER West. BOTH VULNERABLE. " +
      "NORTH 14 hcp: ♠AQ8 ♥KJ9874 ♦A4 ♣75. " +
      "EAST 6 hcp: ♠963 ♥T ♦K962 ♣QJT84. " +
      "SOUTH 10 hcp: ♠K542 ♥AQ63 ♦J853 ♣6. " +
      "WEST 10 hcp: ♠JT7 ♥52 ♦QT7 ♣AK932. " +
      "MAKEABLE CONTRACTS (quoted): NS 6H; NS 5S; NS 2N; EW 2C; NS 1D. " +
      "PAR (quoted): Par +1400: EW 7C x-5. " +
      "BIDDING LESSON. After North opens 1♥, South should bid 3♥, 4♣ (SPLINTER) or 2NT (JACOBY 2NT, which the page calls aggressive on this hand). At the table South bid 1NT INCORRECTLY. " +
      "PLAY LESSON. 6♥ is hard to reach and too aggressive. Twelve tricks are available by discarding a diamond on the fourth spade; 6♥ makes only because spades are 3-3. " +
      "WHY 1NT IS THE WRONG TYPE OF BID, not merely the wrong strength (my reading). South holds four-card heart support and a singleton club. Page 1 says show support instead of bidding your own suit, and the forcing 1NT is the catch-all that may be holding only THREE-card support with 10-11 — so 1NT here conceals the fit as well as the shape. No rule is authored from this deal.",
    "auction",
  ),

  deal(
    "deal-5",
    "Deal 5 (p.19) — two-card support is enough to drive to slam over a 3♥ preempt",
    "DEALER North. NORTH-SOUTH VULNERABLE. " +
      "NORTH 7 hcp: ♠Q54 ♥KQ98654 ♦— ♣865. " +
      "EAST 3 hcp: ♠J873 ♥T732 ♦T3 ♣QT7. " +
      "SOUTH 19 hcp: ♠KT9 ♥AJ ♦A92 ♣AK932. " +
      "WEST 11 hcp: ♠A62 ♥— ♦KQJ87654 ♣J4. " +
      "MAKEABLE CONTRACTS (quoted): NS 6H; S 4S; S 5C; N 3S; N 4C; EW 2D. " +
      "PAR (quoted): Par +1100: EW 7D x-5. " +
      "BIDDING LESSON. After North opens 3♥, South should immediately think about SLAM — two-card heart support is good enough. At the table South bid 3NT INCORRECTLY. Any bid by South is FORCING except 3NT, and shows heart support. South should just bid 4NT (RKC 1430) and then 6♥. " +
      "PLAY AND DEFENCE. Because of the bad heart break you must finesse the ♠J to make 6♥. Against 3NT, West incorrectly led the ♦8 when a lead from a sequence was available — the correct lead is the ♦K. South should hold up twice. " +
      "TWO NOTES (mine). (1) North's 3♥ is a SEVEN-card suit, so two cards opposite is a nine-card fit; that is why two-card support suffices here, and the page's phrasing should not be read as a general licence to drive to slam on a doubleton. (2) The agreement that every bid except 3NT is forcing over our own preempt is stated NOWHERE ELSE in the notes — page 19 is its only appearance — so it is recorded here rather than promoted into the responses chapter. " +
      "PROVENANCE. This is the deal whose first transcription was wrong in two places (a diamond dropped from West, a ♦9 invented in East), caught by comparing the hcp derived from the cards with the hcp printed beside each seat. The layout above is the corrected, checked one; where it disagrees with anyone's memory of the page, the checksum is the arbiter.",
    "auction",
    {
      settings: [
        toggle(
          "b_deal_two_card_support_slam",
          "Two-card support for partner's preempt is enough to explore slam",
          true,
          "Page 19 (deal 5) states it outright, opposite a seven-card 3♥ opening. A record dial: this chapter compiles to no rules, and slam machinery lives in the conventions chapter.",
        ),
      ],
    },
  ),

  // =========================================================================
  // PAGE 20 — deals 6 and 13
  // =========================================================================

  deal(
    "deal-6",
    "Deal 6 (p.20) — a perfect takeout double, and a 3NT that was never there",
    "DEALER East. EAST-WEST VULNERABLE. " +
      "NORTH 5 hcp: ♠432 ♥J62 ♦J7 ♣QJ542. " +
      "EAST 9 hcp: ♠J8 ♥Q53 ♦Q8653 ♣AT9. " +
      "SOUTH 13 hcp: ♠AK76 ♥KT4 ♦2 ♣K8763. " +
      "WEST 13 hcp: ♠QT95 ♥A987 ♦AKT94 ♣—. " +
      "MAKEABLE CONTRACTS (quoted): EW 4D; EW 2H; EW 1N; NS 2C. " +
      "PAR (quoted): Par -130: EW 3D+1. " +
      "BIDDING LESSON. South opened 1♣. West has a PERFECT TAKEOUT DOUBLE. At the table South bid 3NT INCORRECTLY. " +
      "PLAY LESSON. During the play, draw trumps and establish the spades; discard two hearts on the spades. At the table West discarded a CLUB incorrectly — the club can be ruffed on the other side and the ♥Q was a loser. " +
      "NOTES (mine). West is 4-4-5-0, the exact shape a takeout double exists for. West's club VOID is what makes the discard wrong: dummy's clubs can be ruffed in the West hand, whereas the ♥Q cannot be ruffed away, so the heart is the loser to throw. The page records only that South bid 3NT; with a singleton diamond opposite the doubler's ♦AKT94 it had no play. No rule is authored from this deal.",
    "auction",
  ),

  deal(
    "deal-13",
    "Deal 13 (p.20) — advancer's 2NT shows 8-10 with a spade control; passing misses a game",
    "DEALER North. BOTH VULNERABLE. " +
      "NORTH 13 hcp: ♠AJ984 ♥43 ♦A8 ♣KJ87. " +
      "EAST 14 hcp: ♠Q62 ♥AQT65 ♦T ♣AQ32. " +
      "SOUTH 4 hcp: ♠7 ♥J987 ♦QJ6543 ♣T5. " +
      "WEST 9 hcp: ♠KT53 ♥K2 ♦K972 ♣964. " +
      "MAKEABLE CONTRACTS (quoted): EW 2N; EW 2S; EW 2H; EW 1D; EW 1C. " +
      "PAR (quoted): Par -120: EW 1N+1. " +
      "BIDDING LESSON. After (1♠)-2♥, West should bid 2NT showing 8-10 points and a SPADE CONTROL. With a little extra, West should bid 3NT. At the table West PASSED INCORRECTLY — you can miss an easy game if East has a little extra. " +
      "DEFENCE LESSON. Against 2♥, South led the ♠7 and West played low. The ♠7 could be a doubleton, so it is correct for North NOT to take the ace right away; North should play the ♠8. At the table North played the ♠J INCORRECTLY, giving a free finesse of the ♠T. " +
      "NOTE (mine). West holds 9 hcp with the ♠K over the opener's spades — the middle of the band the page states — and East's 14 is exactly the little extra the page has in mind. Nothing here is authored as a rule; the advancer's 2NT belongs to the competitive chapter.",
    "auction",
    {
      settings: [
        range("b_deal_advancer_2n_hcp", "Advancer's 2NT after partner's overcall (deal 13)", 8, 10, {
          min: 0,
          max: 20,
        }),
      ],
    },
  ),

  // =========================================================================
  // PAGE 21 — deals 14, 15 and 17
  // =========================================================================

  deal(
    "deal-14",
    "Deal 14 (p.21) — plan the spade ruff BEFORE drawing trumps",
    "DEALER East. NEITHER SIDE VULNERABLE. " +
      "NORTH 8 hcp: ♠KQJ97 ♥5 ♦T43 ♣Q764. " +
      "EAST 11 hcp: ♠A83 ♥QJT743 ♦J85 ♣K. " +
      "SOUTH 10 hcp: ♠T65 ♥A92 ♦Q92 ♣A832. " +
      "WEST 11 hcp: ♠42 ♥K86 ♦AK76 ♣JT95. " +
      "MAKEABLE CONTRACTS (quoted): EW 4H; EW 2D; NS 2C; NS 1S. " +
      "PAR (quoted): Par -420: EW 4H=. " +
      "BIDDING LESSON. It is hard to reach 4♥ unless both players are aggressive, but you should make ten tricks. (The page gives no auction; East 11 opposite West 11 is the 22 combined points that makes the game a stretch to find.) " +
      "PLAY LESSON. East has two spade losers, one of which can be ruffed in the dummy. At the table East DREW TRUMPS INCORRECTLY before planning to ruff the spade. Play a low spade from both hands first, then take the ♠A followed by a spade ruff BEFORE drawing trumps. Another source of tricks is clubs: the ♣K will lose to the ace, but a ruffing finesse of the ♣Q establishes two club tricks in the dummy. " +
      "NOTE (mine). The club sentence is transcribed as the page has it. Read against the layout, East's club holding is the singleton ♣K and dummy's is ♣JT95 with North holding ♣Q764, so the finesse is taken THROUGH North's queen; the page's wording is preserved rather than reworded, because the point it is making is that a second suit exists at all. No rule is authored from this deal.",
    "declarer_play",
  ),

  deal(
    "deal-15",
    "Deal 15 (p.21) — with no good bid, pass: the 1NT OVERCALL is 15-18",
    "DEALER South. NORTH-SOUTH VULNERABLE. " +
      "NORTH 6 hcp: ♠Q763 ♥AT96532 ♦8 ♣8. " +
      "EAST 6 hcp: ♠A8542 ♥Q7 ♦52 ♣T963. " +
      "SOUTH 16 hcp: ♠J ♥J4 ♦AKQT76 ♣AJ54. " +
      "WEST 12 hcp: ♠KT9 ♥K8 ♦J943 ♣KQ72. " +
      "MAKEABLE CONTRACTS (quoted): NS 4H; S 1N; NS 2D; EW 1S; EW 1C. " +
      "PAR (quoted): Par +500: EW 4S x-3. " +
      "BIDDING LESSON. After South bids 1♦ there is no good bid for West — the CORRECT BID IS PASS. At the table West bid 1NT INCORRECTLY. 1NT shows 15-18 points; 1NT doubled can go down four for -800. (West holds 12.) " +
      "AFTERWARDS. After West bid 1NT, North bid 3♥ — which the page itself labels OUT OF SYLLABUS — and South correctly bid 4♥. " +
      "CONTRADICTION C, resolved rather than papered over. The notes state a 1NT range three times and not with one number: page 4 gives the 1NT OVERCALL as 15-18 with a stopper, page 10 gives the 1NT OPENING as 15-17, and page 23 (deal 28) says 1NT should be 15-17. Read as one call, the document contradicts itself. Read as TWO CALLS — overcall 15-18, opening 15-17 — every passage is true, and that is the reading with more support (pp.4, 10, 21 and 23 all fit it). This deal is an OVERCALL, South having opened 1♦, so 15-18 is the number that applies here; deal 28 is an OPENING, so 15-17 applies there. Both numbers are exposed as dials, so a partnership that plays a single 15-17 range for both calls is one dial away rather than silently corrected. No rule is authored from this deal.",
    "auction",
    {
      settings: [
        range(
          "b_deal_nt_overcall_hcp",
          "1NT OVERCALL range as page 21 states it (deal 15)",
          15,
          18,
          { min: 10, max: 24 },
        ),
      ],
    },
  ),

  deal(
    "deal-17",
    "Deal 17 (p.21) — the auction was perfect; the line of play was never tried",
    "DEALER North. NEITHER SIDE VULNERABLE. " +
      "NORTH 9 hcp: ♠QJT76 ♥J9 ♦KQ82 ♣82. " +
      "EAST 17 hcp: ♠A954 ♥K85 ♦JT5 ♣AKQ. " +
      "SOUTH 6 hcp: ♠8 ♥QT643 ♦A63 ♣T764. " +
      "WEST 8 hcp: ♠K32 ♥A72 ♦974 ♣J953. " +
      "MAKEABLE CONTRACTS (quoted): EW 2N; EW 2C; EW 1S; EW 1H; EW 1D. " +
      "PAR (quoted): Par -120: EW 1N+1. " +
      "BIDDING LESSON. The bidding at the table was PERFECT: 1N-2N; 3N. Unfortunately it goes one down. (East's 17 is the top of the 15-17 opening range and West's 8 is the invitational band, so the auction is exactly what the notes teach — and the contract still fails.) " +
      "PLAY LESSON. At the table it went TWO down because the ♠K and ♥A were played before unlocking the clubs. There are only eight top tricks assuming four club tricks are taken properly. The only chance of an extra trick is in spades: play low spades from both hands, since you will lose at least one spade anyway. THE ISSUE IS THIS LINE OF PLAY WAS NOT ATTEMPTED — taking the top tricks just concedes defeat without trying. " +
      "NOTE (mine). This is one of three deals in the review (with 20 and 30) where the notes bless the auction and the result is still poor — evidence that the review is a critique of table technique, not of the system. No rule is authored from this deal.",
    "declarer_play",
  ),

  // =========================================================================
  // PAGE 22 — deals 19 and 20
  // =========================================================================

  deal(
    "deal-19",
    "Deal 19 (p.22) — 1♠ before 2NT: the points are right and the bid is still wrong",
    "DEALER South. EAST-WEST VULNERABLE. " +
      "NORTH 6 hcp: ♠7 ♥A962 ♦642 ♣Q8763. " +
      "EAST 14 hcp: ♠KT52 ♥KQT4 ♦AQ83 ♣T. " +
      "SOUTH 10 hcp: ♠A983 ♥J75 ♦KJT ♣J52. " +
      "WEST 10 hcp: ♠QJ64 ♥83 ♦975 ♣AK94. " +
      "MAKEABLE CONTRACTS (quoted): EW 3S; EW 2N; EW 2D; EW 1H; NS 1C. " +
      "PAR (quoted): Par -140: EW 2S+1. " +
      "BIDDING LESSON. After three passes East opened 1♦. At the table West incorrectly bid 2NT (CORRECT ON POINTS BUT DENIES A MAJOR SUIT) instead of 1♠. East incorrectly bid 3♥ — that is a REVERSE bid. With 14 points East could accept the invite and bid 3NT. The correct contract is 4♠. " +
      "DEFENCE LESSON. At the table the contract was 4♦ and South led the ♦J INCORRECTLY — South should just wait for their diamond tricks rather than give a free finesse. Try a safer lead, e.g. clubs, which no one had bid. " +
      "A REAL CONFLICT WITH ANOTHER CHAPTER, recorded rather than resolved. The response ladder to 1m (pp.1, 10, 11: 1NT 6-9, 2NT 10-11, 3NT 12+) is authored as an executable rule elsewhere in this template, and on West's balanced 10 that rule WOULD choose 2NT — the page says so itself, \"correct on points\". Page 22 nonetheless calls the bid wrong, because it denies the four-card spade suit. The ladder stays the machine's rule; this deal is the caveat a human applies on top of it, and the conflict is stated here so a reviewer sees it instead of discovering it at the table.",
    "auction",
    {
      settings: [
        toggle(
          "b_deal_major_over_2n_response",
          "Responder shows a four-card major ahead of a points-correct 2NT",
          true,
          "Page 22 (deal 19). A record dial: the executable 1m response ladder (1NT 6-9 / 2NT 10-11 / 3NT 12+) belongs to the responses chapter, and it would choose 2NT on the deal-19 hand.",
        ),
        range(
          "b_deal_invite_accept_hcp",
          "Opener accepts the 2NT invitation from this many points (deal 19)",
          14,
          14,
          { min: 10, max: 21 },
        ),
      ],
    },
  ),

  deal(
    "deal-20",
    "Deal 20 (p.22) — lead the top of a sequence, follow with the lowest",
    "DEALER West. BOTH VULNERABLE. " +
      "NORTH 10 hcp: ♠K5 ♥T742 ♦KQ ♣Q9852. " +
      "EAST 15 hcp: ♠AJ42 ♥Q96 ♦A52 ♣KJ4. " +
      "SOUTH 9 hcp: ♠96 ♥A853 ♦J973 ♣AT7. " +
      "WEST 6 hcp: ♠QT873 ♥KJ ♦T864 ♣63. " +
      "MAKEABLE CONTRACTS (quoted): EW 3N; EW 3S; EW 2C; NS 1H; NS 1D. " +
      "PAR (quoted): Par -600: EW 3N=. " +
      "BIDDING. The CORRECT CONTRACT of 2♠ was reached after 1N-2♥; 2♠ — a Jacoby transfer on the 0-7 branch: transfer, then pass. " +
      "DEFENCE LESSON. On the opening lead of a low diamond, North incorrectly played the ♦K instead of the ♦Q (North's holding is ♦KQ). WHEN LEADING YOU LEAD THE TOP OF THE SEQUENCE, BUT WHEN FOLLOWING YOU PLAY THE LOWEST OF THE SEQUENCE. " +
      "PLAY LESSON. East correctly entered the dummy to finesse the ♠K, but played a LOW spade towards the ♠J. That won, but East could not repeat the finesse. START THE FINESSE BY PLAYING A HIGH CARD so that you can repeat it if it succeeds. " +
      "TWO NOTES (mine). (1) The page calls 2♠ correct while its own par line says East-West make 3NT for 600 — so the notes accept a system-correct underbid here and do NOT record the missed game as an error; that is worth knowing before reading their other verdicts. (2) Bottom-of-the-sequence-when-following is the carding chapter's standard-signal rule (pp.28-29); this deal is its worked instance, and the whole point turns on these signals being STANDARD rather than upside-down. No rule is authored from this deal.",
    "defense",
  ),

  // =========================================================================
  // PAGE 23 — deals 21, 28 and 29
  // =========================================================================

  deal(
    "deal-21",
    "Deal 21 (p.23) — pass the takeout double and convert it to penalties",
    "DEALER North. NORTH-SOUTH VULNERABLE. " +
      "NORTH 6 hcp: ♠QJ8 ♥43 ♦8 ♣K987653. " +
      "EAST 10 hcp: ♠AT6 ♥865 ♦KT92 ♣QJ4. " +
      "SOUTH 10 hcp: ♠543 ♥QJT9 ♦QJ64 ♣A2. " +
      "WEST 14 hcp: ♠K972 ♥AK72 ♦A753 ♣T. " +
      "MAKEABLE CONTRACTS (quoted): EW 3S; EW 2N; EW 2H; EW 3D; NS 1C. " +
      "PAR (quoted): Par -140: EW 1S+2. " +
      "BIDDING LESSON. Most Norths would open 3♣. After two passes West should DOUBLE FOR TAKEOUT. East could pass this double since North-South are vulnerable, bid 3NT (they have a control in clubs and no major), or bid 3♦/4♦. PASSING THE DOUBLE — converting the takeout double into a PENALTY double — would work best here. " +
      "DEFENCE LESSON. A proper defence should limit North-South to seven tricks. If North plays a low club, East should play the ♣J to ensure one club trick; at the table East played low INCORRECTLY. " +
      "NOTES (mine). North's 3♣ is a seven-card suit with 6 hcp, and the page treats that opening as normal rather than arguing for it. Vulnerability is doing the work in the recommendation: North-South vulnerable is exactly why the penalty conversion pays, so the advice is conditional on the board and should not be read as a general preference. Converting partner's takeout double by passing it is not covered on the notes' own double pages (25-26), so this deal is its only statement. No rule is authored from this deal.",
    "auction",
    {
      settings: [
        toggle(
          "b_deal_convert_takeout_to_penalty",
          "Advancer may pass partner's takeout double for penalties",
          true,
          "Page 23 (deal 21), where North-South are vulnerable and the conversion is the winning action. A record dial: the notes' double pages (25-26) do not cover the conversion, and no rule is authored from it.",
        ),
      ],
    },
  ),

  deal(
    "deal-28",
    "Deal 28 (p.23) — 1NT is 15-17: with 19 you open a suit",
    "DEALER West. NORTH-SOUTH VULNERABLE. " +
      "NORTH 19 hcp: ♠K2 ♥AQ42 ♦AQT ♣KJT2. " +
      "EAST 10 hcp: ♠T754 ♥KJT87 ♦7 ♣AQ9. " +
      "SOUTH 4 hcp: ♠J63 ♥6 ♦K9842 ♣8543. " +
      "WEST 7 hcp: ♠AQ98 ♥953 ♦J653 ♣76. " +
      "MAKEABLE CONTRACTS (quoted): EW 2S; EW 2H; NS 3C; NS 2D. " +
      "PAR (quoted): Par +100: EW 3H x-1; EW 3S x-1. " +
      "BIDDING LESSON. At the table North INCORRECTLY OPENED THE BIDDING WITH 1NT. 1NT should be 15-17. If partner has 6-7 points you may miss a game by bidding 1NT with 19 points. " +
      "DEFENCE LESSON. The correct lead is the ♥J. East can get three heart tricks but forgot that the hearts were good at the end, and misdefended. " +
      "NOTES (mine, and one cross-reference). The ♥J from ♥KJT87 is the top of an interior sequence, which is exactly the standard lead the carding chapter authors from pages 28-29 — the review and the carding table agree. What page 23 does NOT say is what North should have opened instead; read against the notes' own bands (12-15 / 16-19 / 20-21, pp.11, 14, 31) a balanced 19 sits at the top of the middle band and 2NT is reserved for 20-21, so the hand opens a minor and shows the extras on the rebid. That inference belongs to the openings and rebids chapters and is labelled here as mine. See deal 15 for the reason 15-17 here does not contradict the 15-18 quoted for a 1NT OVERCALL: they are different calls.",
    "auction",
    {
      settings: [
        range("b_deal_nt_opening_hcp", "1NT OPENING range as page 23 restates it (deal 28)", 15, 17, {
          min: 10,
          max: 24,
        }),
      ],
    },
  ),

  deal(
    "deal-29",
    "Deal 29 (p.23) — you may not pass a forcing 2♠",
    "DEALER North. BOTH VULNERABLE. " +
      "NORTH 6 hcp: ♠J985 ♥9763 ♦Q ♣K753. " +
      "EAST 8 hcp: ♠QT ♥J54 ♦AJT643 ♣96. " +
      "SOUTH 9 hcp: ♠K4 ♥T82 ♦K987 ♣QJT8. " +
      "WEST 17 hcp: ♠A7632 ♥AKQ ♦52 ♣A42. " +
      "MAKEABLE CONTRACTS (quoted): EW 2N; EW 2S; EW 3D; EW 1H. " +
      "PAR (quoted): Par -120: EW 1N+1. " +
      "BIDDING LESSON. East opened 2♦. West correctly bid 2♠, WHICH IS FORCING. East INCORRECTLY PASSED THE FORCING 2♠ BID. East could have three-card spade support and 4♠ would be a better game contract. East should rebid 3♦ or raise to 4♦/5♦. " +
      "PLAY NOTE. 3NT could make if diamonds are divided 3-2 with at least one honour with North. " +
      "NOTES (mine). East's actual spades are the doubleton ♠QT, so the page's reason — East COULD have three-card support — is an argument about the class of hands that hold this auction, not about this hand; for this hand the page's own alternatives are 3♦ or the diamond raise. And the 3NT condition does not hold on the layout: North's diamond holding is the singleton ♦Q, so the five missing diamonds are 4-1, not 3-2. The forcing status of a new suit here is the rule; it belongs to the responses chapter, and no rule is authored from this deal.",
    "auction",
    {
      settings: [
        toggle(
          "b_deal_new_suit_over_two_forcing",
          "Responder's new suit over a 2♦ opening is forcing and may not be passed",
          true,
          "Page 23 (deal 29), where East's pass of a forcing 2♠ is the recorded error. A record dial: the executable forcing entry belongs to the responses chapter.",
        ),
      ],
    },
  ),

  // =========================================================================
  // PAGE 24 — deal 30
  // =========================================================================

  deal(
    "deal-30",
    "Deal 30 (p.24) — Rule of 11, then establish the trick you actually need",
    "DEALER East. NEITHER SIDE VULNERABLE. " +
      "NORTH 4 hcp: ♠43 ♥KJ74 ♦8432 ♣T52. " +
      "EAST 11 hcp: ♠T65 ♥Q95 ♦KQ76 ♣A76. " +
      "SOUTH 8 hcp: ♠Q972 ♥83 ♦T5 ♣KQJ84. " +
      "WEST 17 hcp: ♠AKJ8 ♥AT62 ♦AJ9 ♣93. " +
      "MAKEABLE CONTRACTS (quoted): EW 4N; EW 4S; EW 4H; EW 5D; EW 2C. " +
      "PAR (quoted): Par -430: EW 3N+1. " +
      "BIDDING. 3NT was reached CORRECTLY with 1N-3N. " +
      "LESSON ON TRICK ONE. North led the ♥4 (fourth best). West should apply the RULE OF 11 and determine that South has only ONE card higher than the ♥4. At the table the ♥Q was played, which would have been INCORRECT if South held the ♥K. " +
      "PLAY LESSON. West should play a LOW heart from the dummy to see which card South plays; win the ♥T, then plan to play a low heart towards the ♥Q to establish it. At the table West simply cashed the top tricks and conceded the rest — West could have made 5NT but made only 3N. " +
      "THE ARITHMETIC, worked from the layout (mine). 11 − 4 = 7 cards higher than the ♥4 outside North's hand; West can see six of them (♥A, ♥T, ♥6 in hand and ♥Q, ♥9, ♥5 in dummy), so South holds exactly one — and it is the ♥8, not the ♥K. NOTE THE DEPENDENCY: the Rule of 11 is only valid because this system leads FOURTH BEST from length (pp.28-29, the carding chapter). A partnership with a different length-lead agreement cannot use the arithmetic at all, so the count is an agreement, not a fact of the deal. No rule is authored from this deal.",
    "declarer_play",
  ),

  // =========================================================================
  // WHAT THE FIFTEEN DEALS HAVE IN COMMON (pp.18-24). Read after the deals.
  // =========================================================================

  item(
    "deal-review-themes",
    "What the December 2025 review is actually about: five recurring errors",
    "The fifteen deals on pages 18-24 are not fifteen unrelated stories. Counted up, the table's mistakes fall into five groups, and every group is named with the deals that belong to it so a reader can check the claim rather than take it. " +
      "1. THE WRONG NOTRUMP BID — six of the fifteen. Deal 4: South bid 1NT holding four-card heart support (the forcing 1NT may hold only three). Deal 5: South bid 3NT, which page 19 points out is the ONE non-forcing call available, so it killed a slam. Deal 6: South bid 3NT with a singleton in the doubler's suit. Deal 15: West overcalled 1NT with 12 when that call shows 15-18. Deal 19: West responded 2NT, correct on points, denying a four-card major. Deal 28: North opened 1NT with 19 when the opening is 15-17. Notrump is where this partnership's bidding errors concentrate, and in five of the six the notrump bid CONCEALED something — a fit, a major, or extra strength. " +
      "2. BID THE MAJOR, NOT THE LONG MINOR AND NOT NOTRUMP — deals 2, 4, 5 and 19. Respond 1♥ on four hearts holding six diamonds (2); support hearts rather than bid 1NT (4); support a seven-card heart suit on a doubleton rather than bid 3NT (5); bid 1♠ rather than the points-correct 2NT (19). All four are the priority order stated on page 1 — 4M, then 3NT, then 5m — applied at the moment of choice. " +
      "3. THE PASS DECISION, WRONG IN BOTH DIRECTIONS — six deals. Passed when action was required: deal 29 (East passed a FORCING 2♠), deal 13 (West passed instead of the 2NT/3NT that finds the game), deal 3 (West must cuebid 3♥ to show 10+ with support rather than sit). Acted when a pass was the bid: deal 15 (the correct call for West is PASS), deal 21 (East should pass the takeout double and convert it to penalties), deal 2 (East should pass rather than bid 1NT to show a weak hand). So the review's single most common decision point is not which suit but whether to speak at all. " +
      "4. THE LINE OF PLAY WAS NEVER ATTEMPTED — five deals, and the notes say this in almost those words twice. Deal 17: \"the issue is this line of play was not attempted — taking the top tricks just concedes defeat without trying\". Deal 30: West simply cashed the top tricks and conceded the rest, making 3NT where 5NT was available. Deal 14: trumps were drawn before anyone planned the ruff the hand needs. Deal 6: a discard was chosen without asking which loser could be ruffed. Deal 20: the finesse was begun with a low card, so a successful finesse could not be repeated. In none of these five did declarer pick the WRONG line — the error was making no plan, which is a different failure and needs a different remedy. " +
      "5. THE CARD WITHIN THE SUIT — six deals, all of them applications of the standard signals on pages 28-29 rather than of any bidding rule. Deal 20: ♦K instead of ♦Q (lead the top of a sequence, follow with the lowest). Deal 5: led the ♦8 with ♦KQJ available. Deal 13: ♠J instead of ♠8, handing over a free finesse. Deal 21: a low club instead of the ♣J. Deal 28: the correct lead ♥J was found and then the count was lost. Deal 30: the ♥Q played instead of a low one, when the Rule of 11 answered the question. " +
      "WHAT THE REVIEW DOES NOT SAY. No deal blames the system. Three of them (17, 20, 30) record an auction the notes call correct or perfect and a result that is ordinary or bad — deal 17 goes down in a well-bid 3NT, and on deal 20 the page calls 2♠ the correct contract while its own par line shows 3NT making. The review's verdicts are about table technique. " +
      "WHERE A DEAL CONTRADICTS OR CAVEATS A RULE ELSEWHERE IN THIS TEMPLATE, all recorded rather than smoothed away. (a) Deal 19 versus the 1m response ladder of pages 1, 10 and 11 (1NT 6-9 / 2NT 10-11 / 3NT 12+): that ladder is authored as an executable rule and it WOULD bid 2NT on the deal-19 hand, which page 22 calls wrong. (b) Deal 2 versus page 1's response floor: the page has West bidding with 5 hcp where page 1 says pass below 6, and versus longest-suit-first, which page 1 confines to game-forcing hands. (c) Deals 15 and 28 together RESOLVE the document's third internal contradiction: the 1NT OVERCALL is 15-18 (pp.4, 21) and the 1NT OPENING is 15-17 (pp.10, 23) — two calls, not one number stated twice. (d) Deal 5's agreement that every call except 3NT is forcing over our own preempt appears on page 19 and nowhere else. (e) Deal 21's conversion of a takeout double to penalties is not covered by the notes' own double pages (25-26). (f) Page 21 itself labels North's 3♥ on deal 15 as OUT OF SYLLABUS. " +
      "THE DISCIPLINE OF THIS CHAPTER. Not one auction rule is authored from any of these fifteen deals, on purpose. A rule that fires on one specific layout is overfitting: it would apply the deal's conclusion to every hand matching whatever conditions I chose to write down, which is a stronger claim than the page makes. The generalisable content lives in the other chapters, and the deals are here to be read.",
    "judgment_guideline",
    "auction",
    { kind: "none" },
    {
      settings: [
        toggle(
          "b_deal_review_teaching_only",
          "Keep the deal review as teaching material only",
          true,
          "On by default and the state this chapter is authored in: the fifteen deals compile to no rules of any kind. The dial exists to make that editorial decision visible and reviewable, not to switch machinery on — there is no machinery behind it.",
        ),
      ],
    },
  ),
];

/** Page(s) each item was authored from — install.ts turns these into citations. */
export const DEALS_PAGES: Record<string, number[]> = {
  "deal-2": [18],
  "deal-3": [18],
  "deal-4": [19],
  "deal-5": [19],
  "deal-6": [20],
  "deal-13": [20],
  "deal-14": [21],
  "deal-15": [21],
  "deal-17": [21],
  "deal-19": [22],
  "deal-20": [22],
  "deal-21": [23],
  "deal-28": [23],
  "deal-29": [23],
  "deal-30": [24],
  "deal-review-themes": [18, 19, 20, 21, 22, 23, 24],
};

// Concepts, judgment and technique (teaching deck, slides 4–14, 32–34, 42–46,
// 52–72, 79–88): everything the deck TEACHES that is not a bidding table.
//
// This is the chapter a human actually reads, so every item is written to be
// useful cold: the deck's numbers in full (no row of a scoring or evaluation
// table is summarized away), the deck's worked examples kept as worked
// examples, and the deck's own conclusion stated even where it is wider or
// blunter than a modern expert would put it ("Ignore all other factors!!").
// Where the deck commits to a choice a partnership might play differently, the
// choice is encoded as the DEFAULT and exposed as a setting rather than quietly
// softened in the prose.
//
// PAYLOADS. Scoring, evaluation, inference, laws and process are teaching
// content: `{kind:"none"}` (per model.ts, `concept` / `judgment_guideline`
// items carry no machine payload, and scoring-phase items never do). The
// declarer-play techniques on slides 52–72 that the play language can actually
// execute — finesse, ruff a loser, park a loser on dummy's winner, establish a
// long suit, hold up — carry `{kind:"play_rules"}` as well, so the engine
// plays what the slide teaches. Priority numbers deliberately match the SAYC
// template's play chapter (hold-up 15, ruff 18, discard-loser 19, finesse 30,
// duck 35, establish 40) so the two knowledge bases play comparably.
//
// SETTINGS. Every setting key in this chapter is prefixed `g_cpt_`. The
// percentage/loser/undertrick dials reuse the DSL's `range` control (low/high)
// because that is the only numeric control the authoring vocabulary exposes;
// each one documents in its description which end of the range is which.

import { item, play, range, toggle, type TemplateItem } from "@bridge/sayc-template/dsl";

/** A pure teaching item: a fact of the game as the deck states it. */
const concept = (
  key: string,
  title: string,
  text: string,
  phase: "auction" | "opening_lead" | "declarer_play" | "defense" | "scoring",
  opts: Parameters<typeof item>[6] = {},
): TemplateItem => item(key, title, text, "concept", phase, { kind: "none" }, opts);

/** A decision rule the deck gives a human, not (yet) the machine. */
const judgment = (
  key: string,
  title: string,
  text: string,
  phase: "auction" | "opening_lead" | "declarer_play" | "defense" | "scoring",
  opts: Parameters<typeof item>[6] = {},
): TemplateItem =>
  item(key, title, text, "judgment_guideline", phase, { kind: "none" }, opts);

export const PROSE: TemplateItem[] = [
  // =========================================================================
  // SCORING & INCENTIVES (slides 4–14). The deck opens with scoring on
  // purpose: every later bidding rule is an answer to "what pays?".
  // =========================================================================

  concept(
    "cpt-the-game",
    "The game: four players, one board, one score",
    "Contract bridge is played by four players in two partnerships — North–South against East–West. All 52 cards are dealt, thirteen to each player; one deal is called a board. Each board has two phases. In the AUCTION the two sides compete for the right to declare: the side that wins the bidding names the trump suit (or notrump) and promises to take x tricks. In the PLAY the declaring side takes some number of tricks y. You score as OFFENSE by winning the auction and fulfilling the contract (y is at least x), or as DEFENSE by losing the auction but stopping them (y is less than x). The board's score is zero-sum: if North–South score z, East–West score −z. The whole object of the game is to maximize your partnership's score, which is why the point counts and bidding rules in this deck all trace back to the scoring table.",
    "scoring",
  ),

  concept(
    "cpt-auction-mechanics",
    "How the auction works",
    "A designated dealer makes the first call and the auction proceeds clockwise. Every call is either PASS or a bid of a level (one through seven) in a strain (clubs, diamonds, hearts, spades, or notrump); a level-N bid is a promise to take N+6 tricks. Each bid must be higher than the last: either more tricks, or the same number of tricks in a higher-ranking strain. The ranking, highest first, is NO TRUMP, spades, hearts, diamonds, clubs — so over 3♥ you may bid 3♠, 3NT, 4♣, 4♦ and upward, but not 3♣ or 3♦. The auction ends when a bid is followed by three passes, and the last bid is the CONTRACT. You may DOUBLE an opponent's contract to express doubt that it can be made, and the doubled side may REDOUBLE; a doubled or redoubled contract scores more when it makes and costs more when it fails. The legal vocabulary at the table is just fifteen words: one, two, three, four, five, six, seven, clubs, diamonds, hearts, spades, no trumps, pass, double, redouble.",
    "auction",
  ),

  concept(
    "cpt-trick-values-and-game-targets",
    "Trick values and the resulting game targets",
    "Tricks are counted from the seventh onward — the first six are free. MINORS (clubs, diamonds) are worth 20 per trick, so 100 trick points needs eleven tricks: game in a minor is 5♣ or 5♦ (5 × 20 = 100). MAJORS (hearts, spades) are worth 30, so ten tricks suffice: game in a major is 4♥ or 4♠ (4 × 30 = 120). NOTRUMP pays 40 for the first trick and 30 for each one after, so nine tricks reach 100: game in notrump is 3NT (40 + 2 × 30 = 100). This one table is the reason the whole system is shaped the way it is: a major-suit game is three tricks cheaper than a minor-suit game, and 3NT is two tricks cheaper. Anything below 100 trick points is a PARTSCORE and earns only the small partscore bonus.",
    "scoring",
  ),

  concept(
    "cpt-scoring-a-contract",
    "Scoring a contract, worked",
    "Score a made contract by counting trick points for the tricks bid and taken past six, then adding the bonus for the level you BID. The deck's examples, all in diamonds: 3♦ making nine tricks — discount the first six, so 3 × 20 = 60 trick points, plus the 50 partscore bonus = 110. 3♦ making eleven tricks — 5 × 20 = 100 plus the 50 partscore bonus = 150; note that the overtricks pay their trick value but do NOT buy the game bonus, because you only contracted for a partscore. 5♦ making eleven — 5 × 20 = 100, which is game, so 100 + 300 (non-vulnerable game bonus) = 400. That 250-point gap between 150 and 400 on the identical eleven tricks is the whole incentive to bid game when you can make it. Failing costs the other side's undertrick penalty: down two non-vulnerable is −100 (50 per trick), and down two vulnerable is −200 (100 per trick).",
    "scoring",
  ),

  concept(
    "cpt-bonus-table",
    "The bonus table (non-vulnerable)",
    "Bonuses, assuming non-vulnerable. PARTIAL (fewer than 100 trick points) = 50. GAME (100 or more trick points) = 300. SMALL SLAM (contracting for and taking twelve tricks) = 500 on top of the game bonus, so 800 of bonus in total. GRAND SLAM (all thirteen) = 1000 on top of the game bonus, so 1300 in total. The steps are deliberately steep — 50, then 300, then 800, then 1300 — and that is the deck's point: there is a great incentive to contract for game whenever the partnership can make 100 trick points, and a further large incentive to find the slams. A bonus is paid for what you BID, never for what you happen to take.",
    "scoring",
  ),

  concept(
    "cpt-vulnerability",
    "Vulnerability changes the incentives",
    "Vulnerability is assigned by the board, not earned, and it scales both the rewards and the risks. NON-VULNERABLE: game bonus 300, small slam +500, grand slam +1000; undertricks cost 50 each undoubled, and doubled they run 100, 300, 500, 800, 1100 … as cumulative totals for down one, two, three, four, five. VULNERABLE: game bonus 500, small slam +750, grand slam +1500; undertricks cost 100 each undoubled, and doubled they run 200, 500, 800, 1100 … cumulatively. So being vulnerable raises the payoff for bidding a game or slam AND raises the cost of failing — which is why the deck's expected-value thresholds and its sacrifice arithmetic both change with vulnerability rather than being one fixed rule.",
    "scoring",
  ),

  concept(
    "cpt-scoring-summary-table",
    "The full scoring table",
    "The deck's summary page, row by row. TRICK VALUES (seventh trick onward), as undoubled / doubled / redoubled: clubs and diamonds 20 / 40 / 80; hearts and spades 30 / 60 / 120; notrump first trick 40 / 80 / 160 and each subsequent trick 30 / 60 / 120. BONUSES, as non-vulnerable / vulnerable: partscore 50 / 50; game 300 / 500; small slam 500 / 750; grand slam 1000 / 1500; any DOUBLED contract made 50 / 50 (the \"insult\"); any REDOUBLED contract made 100 / 100. OVERTRICKS: undoubled they simply pay the trick value of the strain; doubled they pay 100 each non-vulnerable and 200 each vulnerable; redoubled 200 and 400. UNDERTRICKS, non-vulnerable / vulnerable: undoubled 50 / 100 each; doubled — first 100 / 200, second and third 200 / 300 each, fourth onward 300 / 300 each; redoubled — first 200 / 400, second and third 400 / 600 each, fourth onward 600 / 600 each. Everything else in this chapter about whether to bid a game, a slam or a sacrifice is arithmetic over these numbers.",
    "scoring",
  ),

  judgment(
    "cpt-strain-exploration-order",
    "Explore majors, then notrump, then minors",
    "Because a major game needs only ten tricks, 3NT needs nine, and a minor game needs eleven, games are easiest to make in this order: MAJORS (4♥/4♠), then NO TRUMP (3NT), then MINORS (5♣/5♦). The deck turns that into the search order for the whole auction: look for an eight-card major fit first; failing that, check whether notrump is playable (which needs stoppers rather than a fit); and only settle for a minor-suit game when neither is available — often preferring to stop in a partscore instead. The questions a bidding system exists to answer, in order, are: can the partnership make game? If yes, bid it, because an unbid game pays no bonus. Can it make a slam or a grand slam? And if there is no game, where is the safest partscore?",
    "auction",
    { settings: [toggle("g_cpt_major_first", "Explore majors before notrump and minors")] },
  ),

  concept(
    "cpt-imp-scoring",
    "IMP (team) scoring",
    "In duplicate play your result is compared with other pairs or teams who played the same board. At IMPs the raw point difference between your result and the comparison is converted through a compression table: 0–10 points = 0 IMPs, 20–40 = 1, 50–80 = 2, 90–120 = 3, 130–160 = 4, 170–210 = 5, 220–260 = 6, 270–310 = 7, 320–360 = 8, and so on up the scale. The consequence is that the table is deliberately non-linear: winning a small number of points is worth almost nothing, while a game or slam swing is worth many IMPs. That is what makes the expected-value thresholds on the next page (bid a 45% non-vulnerable game) the right way to think at IMPs.",
    "scoring",
  ),

  concept(
    "cpt-matchpoint-scoring",
    "Matchpoint (pairs) scoring",
    "At matchpoints your score on a board is simply how many pairs you beat on the same board — you score 1 for each pair you outscore and ½ for each you tie, expressed as a percentage of the available matchpoints. The deck's example: 4♠ down one for −50 scored 8.93%, coming from 1 × 1 plus 3 × ½ out of 28 available matchpoints. The size of the difference does not matter at all, only its direction: beating a field score by 10 points pays exactly as much as beating it by 500.",
    "scoring",
  ),

  judgment(
    "cpt-matchpoints-vs-imps",
    "Matchpoints versus IMPs",
    "The two forms of scoring reward different things, so the same hand can call for different bids. At IMPs the raw point difference is compressed through the IMP table, so only large swings matter much — games, slams, doubled disasters — and the deck's expected-value rule of thumb is stated FOR IMPs. At matchpoints only the direction of each comparison counts, so the frequency of being right matters more than the size of being right: a single overtrick or a better partscore is worth as much as a swing of hundreds. Know which one you are playing before you decide how much to stretch.",
    "auction",
  ),

  judgment(
    "cpt-bid-game-ev",
    "Should you bid the game? The expected-value rule",
    "Decide by comparing expected values, not by feel. The deck's worked cases, all in diamonds and non-vulnerable unless stated. (1) A 5♦ game you rate to make HALF the time: bidding 5♦ = 0.5 × 400 + 0.5 × (−50) = +175, while stopping in 4♦ = 0.5 × 150 + 0.5 × 130 = +140. Bid it. (2) The same game at 40%: 5♦ = 0.40 × 400 + 0.60 × (−50) = +130, against 4♦ = 0.40 × 150 + 0.60 × 130 = +138. Do NOT bid it. (3) The same 40% game VULNERABLE: 5♦ = 0.40 × 600 + 0.60 × (−100) = +180 against 4♦'s +138. Bid it — vulnerability moved a game that was wrong to a game that is right, because the game bonus grew by 200 while the undertricks only grew by 50 each. THE RULE OF THUMB, which is the takeaway to memorize: at IMPs bid games that are 45% or better NON-VULNERABLE and 38% or better VULNERABLE; bid slams that are 50% or better; bid grand slams that are 56% or better. Those four numbers are the deck's decision rule — apply them to your own estimate of the contract's chance.",
    "auction",
    {
      settings: [
        range("g_cpt_ev_game_pct", "Game-bidding threshold (%): low = vulnerable, high = non-vulnerable", 38, 45, {
          min: 0,
          max: 100,
        }),
        range("g_cpt_ev_slam_pct", "Slam-bidding threshold (%): low = small slam, high = grand slam", 50, 56, {
          min: 0,
          max: 100,
        }),
      ],
    },
  ),

  judgment(
    "cpt-sacrifice-arithmetic",
    "Sacrifice arithmetic",
    "A sacrifice is profitable when the doubled penalty you expect to pay is smaller than the contract they were going to make. The deck's two cases, both against 4♠ that will make. NON-VULNERABLE against VULNERABLE opponents, expecting down two in 5♦: passing costs −620 (120 trick points plus their 500 vulnerable game bonus), while 5♦ doubled down two costs −300. Bid 5♦. VULNERABLE against NON-VULNERABLE opponents: passing costs −420, while 5♦ doubled down two costs −500. Pass. Generalized — if you are sacrificing and expect to be doubled, you can afford to go down THREE at favorable vulnerability, TWO at equal vulnerability, and at most ONE at unfavorable vulnerability. Count the tricks you expect to lose before you bid, not after.",
    "auction",
    {
      settings: [
        range(
          "g_cpt_sacrifice_undertricks",
          "Affordable undertricks when sacrificing: low = unfavorable, high = favorable",
          1,
          3,
          { min: 0, max: 5 },
        ),
      ],
    },
  ),

  // =========================================================================
  // HAND EVALUATION (slides 32–34). High-card points are only the start:
  // the deck adds length, then support shortness, then a trick count.
  // =========================================================================

  judgment(
    "cpt-length-points",
    "Length points (evaluating as opener)",
    "Long suits take tricks that high cards alone do not, so add LENGTH POINTS to your high-card count when deciding whether and how high to open: a four-card suit adds 0, a five-card suit adds 1, a six-card suit adds 2, and a seven-card suit adds 3. The deck's ladder of examples all hold exactly 11 high-card points and get progressively better as shape replaces balance: ♠AQ854 ♥T98 ♦Q5 ♣K84 = 12 with distribution, and is closer to a pass; ♠AQ854 ♥KQT9 ♦65 ♣43 = 12, and is closer to 1♠; ♠AQ854 ♥KQT98 ♦6 ♣54 = 13, a safe 1♠; ♠AQ8543 ♥KQT98 ♦6 ♣5 = 14, open 1♠; ♠AQ8543 ♥KQT986 ♦5 ♣— = 15, open 1♠ then bid 3♥; ♠AQ85432 ♥KQT986 ♦— ♣— = 16, open 1♠ then bid 3♥. Same 11 high-card points throughout — the shape is doing all the work.",
    "auction",
    { settings: [toggle("g_cpt_length_points_on", "Add length points when evaluating")] },
  ),

  judgment(
    "cpt-honor-placement",
    "Where your honors sit matters",
    "The deck's evaluation principles beyond raw point count. LENGTH MATTERS: extra cards in a suit are extra tricks once the suit is established. BALANCED HANDS CAN BE DISCOUNTED: a flat hand with no long suit will take fewer tricks than its point count suggests. HONORS IN LONG SUITS ARE IMPORTANT: a king or queen in your five- or six-card suit pulls its weight because the suit will be played, and the small cards behind it become winners. HONORS IN SHORT SUITS ARE DISCOUNTED, especially UNSUPPORTED ones: a bare queen or a singleton king may well take nothing at all. Apply this before you choose between passing and opening, and again before you stretch toward game — the deck's 11-point examples differ only in whether the honors sit in the long suits.",
    "auction",
  ),

  judgment(
    "cpt-support-points",
    "Support points (evaluating when you support partner)",
    "Once a trump fit is found, your evaluation changes: what matters is not balance but SHORTNESS, because a short suit opposite partner's length lets you ruff declarer's losers. Add support points by the length of your trump holding. With THREE trumps: three small cards in a side suit 0, a doubleton 1, a singleton 2, a void 3. With FOUR trumps: three small 0, a doubleton 1, a singleton 3, a void 5. The extra trump is worth real value because it buys a second ruff. The two ways a supporting hand contributes tricks are exactly these: RUFFING declarer's losers with the short suit, and WINNERS in a side suit. Note that support points and length points answer different questions — count length points when you are describing your own suit, support points when you are raising partner's.",
    "auction",
    { settings: [toggle("g_cpt_support_points_on", "Add support points when raising partner")] },
  ),

  judgment(
    "cpt-losing-trick-count",
    "Losing Trick Count",
    "For SUIT contracts only (it says nothing useful about notrump), count losers instead of points. Per suit: with THREE OR MORE cards, count the number of the ace, king and queen you are MISSING (so Axx = 2 losers, AKx = 1, xxx = 3); with TWO cards, count the number of the ace and king you are missing (Ax = 1, AK = 0, xx = 2); with a SINGLETON, 1 loser unless it is the ace; with a VOID, 0. The deck's illustration of that first line: ♠xxxx, ♥xxx and ♦Jxxxx are each THREE losers — past the third card the extra length adds no further losers, which is exactly why the count treats a long weak suit more kindly than a point count does. Add your losers to partner's losers and the partnership should take 24 minus the total number of tricks. An opening bid is a hand with SEVEN OR FEWER losers. The deck's examples: ♠AQxxxx ♥xxx ♦AJxx ♣— is 11 high-card points, 13 with distribution, and 6 losers — open 1♠. Responding with ♠xxx ♥xx ♦x ♣Kxxxxxx: 3 high-card points, 6 support points, 8 losers; opposite a seven-loser opening that is 15 total, so 24 − 15 = 9 tricks, and the deck's answer on that hand is 2♠. Use the count as a cross-check on the point count, particularly on shapely hands where points understate the trick-taking.",
    "auction",
    {
      settings: [
        toggle("g_cpt_ltc_on", "Use the Losing Trick Count on suit hands"),
        range(
          "g_cpt_ltc_opening_losers",
          "Losers allowed for an opening bid (the deck: 7 or fewer)",
          7,
          7,
          { min: 3, max: 10 },
        ),
      ],
    },
  ),

  // =========================================================================
  // THE LAW OF TOTAL TRICKS (slides 42–46).
  // =========================================================================

  concept(
    "cpt-law-of-total-tricks",
    "The Law of Total Tricks",
    "The Law: THE TOTAL NUMBER OF TRICKS AVAILABLE ON A DEAL IS EQUAL TO THE TOTAL NUMBER OF TRUMP CARDS BOTH SIDES HOLD IN THEIR RESPECTIVE BEST SUITS. Total Number of Trumps equals Total Number of Tricks — TNT. If we hold nine hearts between us and they hold eight spades between them, there are seventeen tricks on the board: whatever we can make in hearts plus whatever they can make in spades adds to seventeen. Crucially the Law says NOTHING about how the total splits between the two sides — that depends on the high cards and the layout. The deck's worked examples take one deal with sixteen total trumps and move the ♠K from South to East to West: the split between the sides changes each time, but the total stays sixteen, and the Law holds. Its practical value is therefore not in predicting your own tricks but in telling you how high it is safe to compete.",
    "auction",
  ),

  judgment(
    "cpt-total-trumps-principle",
    "Total Trumps Principle: bid to the level of your trump length",
    "The Law's actionable form: IN A COMPETITIVE AUCTION, BID TO A NUMBER OF TRICKS EQUAL TO THE NUMBER OF TRUMPS YOU AND YOUR PARTNER HOLD — AND NO HIGHER. Count the combined trumps, subtract six, and that is your level. The deck's auction, West–North–East–South: —, 1♥, Pass, 2♥; Pass, Pass, 2♠, and it is your call holding ♠973 ♥KQ32 ♦J2 ♣Q1072. Count trumps: your four hearts plus the five partner promised with the 1♥ opening is nine, so bid 3♥. Holding only three hearts the total is eight, so PASS and let them have 2♠. The deck's instruction is blunt: \"Ignore all other factors!!\" — do not talk yourself out of the count with your point total or your honor location. The reason it works either way is that when the high cards lie favorably the level is makeable, and when they lie badly the same contract is a profitable sacrifice against what they were going to make.",
    "auction",
    {
      settings: [
        toggle("g_cpt_ttp_on", "Compete to the level of the combined trump length"),
        toggle(
          "g_cpt_ttp_ignore_other_factors",
          "Follow the trump count strictly (the deck: ignore all other factors)",
          true,
          "The deck states the Total Trumps Principle without adjustments. Turn this off to allow honor location, vulnerability and shape to override the raw trump count.",
        ),
      ],
    },
  ),

  // =========================================================================
  // DECLARER PLAY (slides 52–72). The deck's technique list, then each
  // technique on its own page of diagrams, then the planning framework.
  // =========================================================================

  concept(
    "cpt-play-techniques",
    "The declarer's toolkit",
    "The deck's catalog of declarer techniques, each of which has its own item in this chapter: the FINESSE; CARD COMBINATIONS (choosing the best line from a given holding); RESTRICTED CHOICE; the ENDPLAY; RUFFING LOSERS; DISCARDING LOSERS on dummy's side-suit winners; ESTABLISHING A LONG SIDE SUIT for winners by ruffing; and the RUFF AND DISCARD. The first three are about winning an extra trick from a single suit combination; the rest are about the whole hand — where your losers can go and which suit will produce the tricks you still need. Recognizing which of these a deal calls for, before playing to trick one, is most of declarer play.",
    "declarer_play",
  ),

  item(
    "cpt-finesse",
    "The finesse",
    "A finesse plays a missing honor as though it sits in one particular defender's hand: lead toward the hand holding the tenace so that the defender in front of it must commit first. The deck works through six positions — AQ opposite 32; K4 opposite 32; AJT opposite 432; AJ9 opposite 432; KQ5 opposite 432; and KQT opposite 432 — listing the candidate lines for each and marking the best one. From AJT or AJ9 the finesse can be repeated (the double or DELAYED finesse), taking two chances rather than one instead of cashing out early. The deck's conclusion is stated flatly: THE FINESSE, OR THE DELAYED FINESSE, IS THE BETTER LINE IN MOST CASES. It is not free — a finesse that loses costs a trick you might have kept — so the question is always whether the extra trick it wins is a trick you need.",
    "declarer_technique",
    "declarer_play",
    {
      kind: "play_rules",
      rules: [play("finesse_toward_tenace", 30, { side: "declarer", position: "lead" })],
    },
    { settings: [toggle("g_cpt_finesse_on", "Finessing")] },
  ),

  judgment(
    "cpt-card-combinations",
    "Card combinations, and \"eight ever, nine never\"",
    "With a specific holding there is usually one line that is mathematically best, and the deck drills three: AKJ76 opposite 432, AKJT5 opposite 32, and AKJ76 opposite 5432. From these comes the maxim to memorize — EIGHT EVER, NINE NEVER: missing the queen with EIGHT cards in the suit, finesse for her; with NINE cards, play for the drop by cashing the top cards. The deck is honest about the limits of memorized lines: evaluating the best play at the table can be very complicated, and memory, intuition and calculation all contribute. It also warns that the smallest scrap of information shifts the odds — if East preempted in hearts, East is shorter in your suit than West and the finesse may be better even with nine cards. Count the whole hand, and treat the maxim as the default rather than the law.",
    "declarer_play",
    {
      settings: [
        toggle(
          "g_cpt_nine_never",
          "Play for the drop with nine cards missing the queen",
          true,
          "The deck's \"eight ever, nine never\". Turn this off to finesse for the queen with nine cards as well.",
        ),
      ],
    },
  ),

  judgment(
    "cpt-restricted-choice",
    "Restricted choice",
    "The deck's holding is AKT65 opposite 7432, and it tabulates all sixteen possible East–West splits. You cash the ace and East drops the QUEEN — only two of the sixteen rows are now possible: East began with a singleton queen, or East began with queen-jack doubleton. The queen and the jack are EQUAL cards, so from Q-J East would have played each of them about half the time; scoring the rows accordingly, East drops the queen 150 times, and 100 of those favor finessing the ten. Finessing the ten is therefore correct by a 2-to-1 margin. THE RULE, as the deck states it: IF A PLAYER DROPS AN HONOR FROM AMONG EQUAL HONORS, ASSUME THEY DID NOT HAVE A CHOICE — that they held it alone — AND PLAY ACCORDINGLY. The honor that appears is far more likely to have been forced than freely chosen.",
    "declarer_play",
    {
      settings: [
        toggle("g_cpt_restricted_choice_on", "Apply restricted choice when an honor appears"),
      ],
    },
  ),

  item(
    "cpt-ruff-losers",
    "Ruffing losers",
    "A loser in a side suit does not have to be lost: if one hand is shorter in that suit than the other, the extra cards can be trumped. The deck's deal has South cashing the ♥A and ♥K and then ruffing the third heart in dummy, turning a certain loser into a trick. The technique needs two things you must check before drawing trumps: a trump left in the SHORT hand to ruff with, and the entries to get there. Count your losers suit by suit at trick one and ask of each one whether it can be ruffed — that count, not the point count, decides how the hand is played.",
    "declarer_technique",
    "declarer_play",
    { kind: "play_rules", rules: [play("ruff_loser", 18, { side: "declarer" })] },
    { settings: [toggle("g_cpt_ruff_losers_on", "Ruff losers when void")] },
  ),

  item(
    "cpt-discard-losers-on-dummy",
    "Discarding losers on dummy's winners",
    "The second way a loser disappears: park it on a WINNER in the other hand. In the deck's deal South throws a heart loser on dummy's ♣A — the heart never has to be played from the South hand at all. Look for a suit where the other hand holds a high card and you hold a loser, and make sure you take the discard while you still can: the winner must still be there, and the opponents must not be able to ruff it. Ruffing losers and discarding losers on winners are the two techniques the deck flags in red, because between them they dispose of most of the losers a trump contract has.",
    "declarer_technique",
    "declarer_play",
    { kind: "play_rules", rules: [play("discard_loser_on_winner", 19, { side: "declarer" })] },
    { settings: [toggle("g_cpt_discard_losers_on", "Park losers on the other hand's winners")] },
  ),

  item(
    "cpt-establish-side-suit",
    "Establishing a long side suit by ruffing — count the entries",
    "A long side suit in dummy can be turned into winners by ruffing the defenders' cards out of it. In the deck's deal, ruffing two hearts sets the suit up so that the ♥A then provides five winners. The deck immediately shows the same idea FAILING: North's fourth club cannot be established, because doing so needs four entries to dummy and there are only two trumps available to ruff with. That is the lesson — establishment by ruffing costs one trump AND one entry per ruff, plus a final entry to cash the established suit. Count the entries before you start, because a suit you set up and cannot reach is worth nothing.",
    "declarer_technique",
    "declarer_play",
    { kind: "play_rules", rules: [play("establish_long_suit", 40, { side: "declarer", position: "lead" })] },
    { settings: [toggle("g_cpt_establish_side_suit_on", "Establish a long side suit")] },
  ),

  judgment(
    "cpt-endplay",
    "The endplay",
    "Some suits cannot be attacked profitably by you but yield a trick if a defender has to open them. An endplay engineers exactly that: strip the hand of safe exits, then deliberately hand the lead to the defender who must then play into your strength. The deck's deal: South cashes the ♠A and leads a second spade, forcing West to win the trick — with nothing safe left, West must lead a heart into South's A-Q, and South makes three heart tricks in a suit that would have produced two if declarer had led it. The ingredients are the same every time: a defender with no safe lead, your tenace still intact, and the timing to give up the lead when you choose rather than when they choose.",
    "declarer_play",
  ),

  judgment(
    "cpt-ruff-and-discard",
    "The ruff and discard",
    "The last technique in the deck's list. When a defender leads a suit in which BOTH declarer and dummy are void, declarer gets a free roll: ruff in one hand and throw a loser from the other, disposing of a loser and winning the trick at the same time. It is the mirror image of the two loser-disposal techniques — normally you must find a ruff or a discard yourself, and here the defense donates both at once. As declarer, strip the side suits so a defender may be forced to concede it; as a defender, this is the trick to avoid giving away.",
    "declarer_play",
  ),

  judgment(
    "cpt-play-planning-framework",
    "Planning the play: the three questions",
    "Before trick one the deck asks declarer three questions in order. WHICH SUIT DO I ESTABLISH FIRST? — how many tricks do I need against how many each suit can produce, how many top cards must I drive out to get them, and do I have the entries. HOW DO I PLAY THE SUIT? — the finessing positions available in that particular holding, the entries needed to take them, and how many tricks I actually need from it. And DO I NEED A HOLD-UP? — must I refuse an early round of their suit to break the defenders' communication. The three questions in that order are the deck's play-problem framework, and the deals that follow are worked examples of each.",
    "declarer_play",
  ),

  judgment(
    "cpt-which-suit-to-establish",
    "Which suit to establish first",
    "Count the tricks you NEED, count what each suit can PRODUCE and at what cost, then take the fastest route to just enough — you are in a race with the defenders' suit. The deck's three book deals. (1) Play CLUBS first: clubs give four tricks for the price of driving out the ♣A, diamonds give three, and there is no time to set up both — go where the tricks are. (2) Play CLUBS first: driving out the ace and king in clubs yields three extra tricks, while diamonds give at most one and even that needs a 3-3 break — prefer the certain source to the one that needs a friendly split. (3) Play DIAMONDS first: here there is NO time to establish clubs, because the opponents establish spades before you get there, and declarer needs only one extra trick — take the quick trick that is enough rather than the bigger one that arrives too late. The deciding factors are always the same four: tricks needed, tricks available, top cards to drive out, entries — plus the tempo race against the suit the defenders are working on.",
    "declarer_play",
  ),

  judgment(
    "cpt-how-to-play-the-suit",
    "How to play the suit: the two finesse positions",
    "Once you have chosen the suit, play it in the order that takes the most chances. The deck's two positions. With AQT85 opposite 432, finesse the TEN first and the QUEEN on the next round: that double finesse loses only when East holds both the king and the jack. With KJT94 opposite 532, finesse the NINE first and the TEN next, for the same reason — each round gives the defender in front of your holding another chance to hold the missing honor. The principle: with two touching gaps below your top card, take the LOWER finesse first so the higher one is still available afterward, and make sure you have the entries to lead the suit twice from the correct side.",
    "declarer_play",
  ),

  item(
    "cpt-holdup",
    "The hold-up play",
    "In notrump, when the defenders lead their long suit and you hold a single stopper, refusing the early rounds cuts their communication. The deck's problem: duck the first two rounds and win the third, so that when the defender holding the outside entry (the ♦A) finally gets in, they have NO cards left in the suit to lead. The deck's own phrasing is the thing to remember — \"if the defender with the ♦A has clubs left to lead you are sunk; exhaust their clubs before conceding the ♦A.\" So count their suit, count the rounds you must duck to strip the danger hand, and duck exactly that many. The same tempo logic covers the deck's other hold-up deal: duck the first heart, then drive out the ♦A-K, so the defenders' entry is gone by the time their suit is ready. WHEN NOT TO HOLD UP: with TWO stoppers (A-J-T, A-T-9-8) there is nothing to gain — win the trick and get on with establishing your own suit, because ducking only hands them a tempo you cannot get back.",
    "declarer_technique",
    "declarer_play",
    {
      kind: "play_rules",
      rules: [
        play("hold_up_stopper", 15, { side: "declarer" }),
        play("duck_to_preserve_entry", 35, { side: "declarer", position: "lead" }),
      ],
    },
    {
      settings: [
        toggle("g_cpt_holdup_on", "Hold up a single stopper in notrump"),
        toggle(
          "g_cpt_holdup_two_stoppers",
          "Never hold up when you hold two stoppers",
          true,
          "The deck's explicit exception (A-J-T, A-T-9-8): winning immediately is better than ducking.",
        ),
      ],
    },
  ),

  judgment(
    "cpt-second-stopper",
    "Manufacturing a second stopper",
    "A hold-up is not the only answer to their long suit — sometimes you can create an extra stopper out of a split holding. The deck's position is Q8 opposite K73: play the QUEEN on the first round of the suit. If it wins or is covered, the king is now a genuine second stopper, and you have bought the extra round of the suit that the hold-up was trying to buy. This is why the count of your stoppers has to be made before trick one and from BOTH hands together: what looks like one stopper plus a spare card is often two stoppers if you play the honors in the right order.",
    "declarer_play",
  ),

  // =========================================================================
  // DEFENSE & INFERENCE (slides 79–81).
  // =========================================================================

  judgment(
    "cpt-inference-from-opening-lead",
    "Drawing inferences from the opening lead",
    "Every card the defenders play is evidence, and the opening lead is the richest single piece of it, because it was chosen from thirteen unseen cards under known agreements. The deck's exercise: with 842 in one hand and A105 in the other, the 3 is led and the KING appears — that combination places the QUEEN with the leader (West) and the JACK with the third hand (East), because those are the only holdings consistent with the lead and the card played. The second inference is a negative one: a defender does NOT underlead an ace against a trump contract, so a low lead denies the ace of that suit. Play the whole hand on those placements from trick one — reading the lead is usually worth more than any single finesse.",
    "defense",
  ),

  judgment(
    "cpt-inference-from-auction",
    "Drawing inferences from the auction",
    "The bids the opponents did NOT make are as informative as the ones they did. The deck's full-deal exercise: the auction is 1♠ – Pass – Pass – 2♥; Pass – 4♥ – Pass – Pass – Pass, and West — the player who opened 1♠ — leads the ♠5. Reason it out. Start with the spade position: East must hold one of the ♠K or ♠Q, because otherwise West would hold both and would have led the ♠K rather than the 5. From the play of the diamonds, East must also hold one of the ♦K or ♦A. That gives East a minimum of about 5 high-card points — and East PASSED partner's 1♠ opening, so East cannot have more. Therefore every remaining honor is with West: West holds the ♥Q and the ♣Q, and declarer plays both suits accordingly. The pattern to reuse: combine what the lead shows with what a player's FAILURE to bid denies, and the missing honors are often placed exactly.",
    "defense",
  ),

  // =========================================================================
  // LAWS, ETHICS AND PROCESS (slides 82–88).
  // =========================================================================

  concept(
    "cpt-laws-and-director",
    "The Laws and the director",
    "Duplicate bridge is governed by the Laws of Duplicate Bridge, some 93 articles. You do not need to know them, but you do need to know to CALL THE DIRECTOR whenever anything irregular happens, and to do it at once rather than trying to fix it yourselves. The director's remedies include transferring tricks between the sides, forcing a player to pass, designating exposed cards as penalty cards, restricting the opening lead, and assigning an artificial or adjusted score when normal play is no longer possible. A director's ruling can be appealed to the Appeals Committee. Calling the director is a normal, friendly part of the game — never an accusation.",
    "auction",
  ),

  concept(
    "cpt-irregularities",
    "The common irregularities",
    "The irregularities you will actually meet at the table: a REVOKE (failing to follow suit when you could); a CALL OUT OF TURN; an INSUFFICIENT or INADMISSIBLE call (a bid lower than the last, or a double when nothing can be doubled); an EXPOSED CARD; a PLAY OUT OF TURN; a MISTAKEN BID OR EXPLANATION (including a wrong answer about your own agreements); and UNAUTHORIZED INFORMATION — partner's remarks, questions, mannerisms or hesitations, withdrawn calls, and remarks overheard from another table. Each has a prescribed remedy in the Laws, which is the director's job, not yours: stop, call the director, and describe what happened without discussing what you would have done.",
    "auction",
  ),

  concept(
    "cpt-lead-out-of-turn",
    "Opening lead out of turn — declarer's five choices",
    "When the wrong defender leads to trick one, the Laws give DECLARER the choice, and there are five options: accept the lead and play the hand normally; accept the lead and let partner play the hand (the dummy and declarer swap roles); refuse it and require the correct leader to lead THAT SAME suit; refuse it and PROHIBIT that suit for as long as the correct leader holds the lead; or allow any lead, with the exposed card becoming a penalty card. Choose by asking which suit you actually want led. The deck also notes GOLDWATER'S RULE, offered semi-seriously: an opening lead out of turn should generally be ACCEPTED — the lead you were unexpectedly given is usually better for you than the one the correct defender was about to choose.",
    "opening_lead",
    {
      settings: [
        toggle(
          "g_cpt_accept_lead_out_of_turn",
          "Accept an opening lead out of turn (Goldwater's Rule)",
          true,
          "The deck's default. Turn off to consider all five of declarer's options on the merits of the particular hand.",
        ),
      ],
    },
  ),

  judgment(
    "cpt-unauthorized-information",
    "Unauthorized information and active ethics",
    "Information from partner that does not come from a legal call or play is UNAUTHORIZED: hesitations, mannerisms, remarks, questions asked, and withdrawn calls. You are not allowed to use it, and the standard the deck sets is ACTIVE ETHICS — after partner's slow pass, IGNORE the hesitation and do NOT take the action it suggests, even when you are sure that action is right. That is the whole point: the fact that you now know it is right is exactly the problem. The best defense against ever facing this is procedural — BID AND PLAY IN TEMPO, at an even rhythm, so that no unauthorized information is created in the first place. When a hesitation does occur and the opponents object, call the director; there is nothing wrong with an unavoidable pause, only with acting on it.",
    "auction",
    {
      settings: [
        toggle(
          "g_cpt_active_ethics",
          "Active ethics: ignore partner's hesitation",
          true,
          "The deck's stated position — take the action you would have taken with no unauthorized information, even at a cost.",
        ),
      ],
    },
  ),

  judgment(
    "cpt-board-checklist",
    "The checklist to run on every board",
    "The deck's most practical page: fifteen things to do on every single board, in order. (1) Count your cards — you should have thirteen. (2) Count your high-card points. (3) Count your distribution. (4) Count dummy's points. (5) Count dummy's distribution. (6) Estimate the points remaining in the other two hands. (7) Estimate their distribution. (8) Note the opening lead. (9) Estimate the honors in the suit led. (10) Ask whether the lead was passive or aggressive. (11) Count your losers. (12) Count your winners. (13) Form an initial plan. (14) Note which card you will play over or under dummy. (15) After the board, recall the hands and check your estimates against what was actually there. Two working rules make it usable: WITH NO CLUES, divide the missing high-card points and the missing distribution equally between the two unseen hands; and START WITH AN ESTIMATE AND REFINE IT as the bidding and the play give you evidence — an approximate count from trick one beats an exact count at trick twelve.",
    "declarer_play",
  ),

  concept(
    "cpt-glossary",
    "Bridge language: a glossary",
    "The deck's vocabulary page, for reading everything else. RUFF — to play a trump on a trick in a suit you are void in. DISCARD — to play a card of another suit when void, without trumping. BOARD — one deal (and the tray it is dealt into for duplicate). HAND — the thirteen cards one player holds. TRICK — one round of four cards, won by the highest trump or, with no trump played, the highest card of the suit led. STOPPER — a holding that will stop the opponents from running a suit at notrump (an ace, a guarded king). STIFF — a singleton. BREAK — how a suit divides between the defenders (a 3-3 break). COLD, or ICE COLD — a contract that cannot be defeated. DUCK — to deliberately play low and let the opponents win a trick you could have taken. RHO and LHO — your right-hand and left-hand opponent; and, jokingly, CHO, your \"centre-hand opponent\", which is partner. OPENER — the player who opened the bidding. RESPONDER — opener's partner. OVERCALLER — a player who bids over an opponent's opening. ADVANCER — the overcaller's partner.",
    "auction",
  ),

  concept(
    "cpt-areas-of-study",
    "The three areas of study",
    "Bridge divides into three areas, and the deck is clear that they are studied separately. BIDDING: how to reach the right contract, and how to prevent the opponents from reaching theirs. This is where systems differ — this deck teaches Standard American 2/1 Game Force, and the alternatives you will meet include Precision, Acol and Polish Club. DECLARER PLAY: bringing home the contract you bid, which is the technique material in this chapter. DEFENSE: beating the contract, of which the two hardest and most learnable parts are the choice of the opening lead and signaling to partner. Progress in all three is worth having, but bidding accuracy and defensive signaling are where most matchpoints are won and lost.",
    "auction",
  ),
];

/** Slide(s) each item was authored from — install.ts turns these into citations. */
export const PROSE_SLIDES: Record<string, number[]> = {
  // scoring & incentives
  "cpt-the-game": [4],
  "cpt-auction-mechanics": [5],
  "cpt-trick-values-and-game-targets": [8, 10],
  "cpt-scoring-a-contract": [6],
  "cpt-bonus-table": [7],
  "cpt-vulnerability": [9],
  "cpt-scoring-summary-table": [10],
  "cpt-strain-exploration-order": [8],
  "cpt-imp-scoring": [11],
  "cpt-matchpoint-scoring": [12],
  "cpt-matchpoints-vs-imps": [11, 12, 13],
  "cpt-bid-game-ev": [13],
  "cpt-sacrifice-arithmetic": [14],
  // hand evaluation
  "cpt-length-points": [32],
  "cpt-honor-placement": [32],
  "cpt-support-points": [33],
  "cpt-losing-trick-count": [34],
  // law of total tricks
  "cpt-law-of-total-tricks": [42, 43, 44, 45],
  "cpt-total-trumps-principle": [46],
  // declarer play
  "cpt-play-techniques": [52],
  "cpt-finesse": [52, 53],
  "cpt-card-combinations": [54],
  "cpt-restricted-choice": [55],
  "cpt-ruff-losers": [52, 56],
  "cpt-discard-losers-on-dummy": [52, 57],
  // 56–60 are five deal-diagram problems, one per slide, in the order the
  // toolkit list on 52 gives them: ruff losers, discard losers, establish by
  // ruffing, endplay, ruff-and-discard.
  "cpt-establish-side-suit": [52, 58],
  "cpt-endplay": [52, 59],
  "cpt-ruff-and-discard": [52, 60],
  "cpt-play-planning-framework": [61],
  "cpt-which-suit-to-establish": [61, 62, 63, 64],
  "cpt-how-to-play-the-suit": [61, 65, 66],
  // The deck presents 67–72 as one block of hold-up problems (duck twice, the
  // two-stopper exception, the manufactured stopper, the tempo duck) without a
  // one-problem-per-page split, so both items cite the block.
  "cpt-holdup": [61, 67, 68, 69, 70, 71, 72],
  "cpt-second-stopper": [67, 68, 69, 70, 71, 72],
  // defense & inference
  "cpt-inference-from-opening-lead": [79, 80],
  "cpt-inference-from-auction": [81],
  // laws, ethics, process
  "cpt-laws-and-director": [82],
  "cpt-irregularities": [83],
  "cpt-lead-out-of-turn": [84],
  "cpt-unauthorized-information": [83, 85],
  "cpt-board-checklist": [86],
  "cpt-glossary": [87],
  "cpt-areas-of-study": [88],
};

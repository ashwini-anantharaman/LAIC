// Declarer play (notes pages 6–7, the suit-combinations table on 8–9, and the
// missing-card arithmetic on 30): everything the training notes teach about
// playing the hand once the auction is over.
//
// STRUCTURE. The notes give declarer play as a numbered discipline — (1) count
// winners or losers before playing a card, (2) take out trumps unless you need
// the trumps for something else, (3) which side suit to play, (4) how to play a
// suit — and then spend a two-page table on eleven specific card positions.
// This chapter keeps that shape: one item per numbered idea, one item per
// sub-case the notes argue separately (the cross-ruff, the long-hand ruff, the
// tempo example, the trumps you must keep), and — per the authoring
// assignment — ONE ITEM PER ROW of the suit-combinations table, so a fellow can
// look up "AQx opposite xxx" or "J9x opposite Qxx" and read the notes' line of
// play without reading the other ten rows.
//
// PAYLOADS. `{kind:"play_rules"}` is used ONLY where the notes' advice is one of
// the play behaviours the language actually has (see PlayBehavior in
// @bridge/kb/language.ts): cash out when the winners are enough, ruff a loser,
// park a loser on the other hand's winner, draw trumps, finesse toward a
// tenace, establish a long suit, duck to keep communication. Each of those
// seven behaviours is declared by EXACTLY ONE item in this chapter, at the same
// priority the SAYC and Girkar play chapters use (cash-out 10, ruff 18,
// discard-loser 19, draw-trumps 20, finesse 30, duck 35, establish 40), so the
// three knowledge bases play comparably and no behaviour is declared twice.
// Everything else is teaching text: a `declarer_technique` with `{kind:"none"}`
// when it is a line of play a human executes (the table rows, the honour
// positions), and a `judgment_guideline` when it is a choice between lines. The
// notes' table positions are NOT mechanizable — the language has no "lead the
// ten from AJT9 and cover" vocabulary, and inventing one was out of scope — so
// they are honest teaching items that name what the engine cannot do.
//
// SETTINGS. Every setting key here is prefixed `b_play_`. Every number the
// notes state gets a dial: the 25% and 75% finesse percentages, the 50%
// finesse-versus-drop line, the "only four cards missing" drop rule, the couple
// of trump rounds before a cross-ruff, and the three ducks that establish a
// five-card suit. Percentages use the DSL's `range` control (the only numeric
// control the vocabulary exposes) with explicit 0–100 bounds; where the notes
// state a single number both ends of the range carry it, and the description
// says so.
//
// PAGE CITATIONS. Pages 6–7 are transcribed as one block, but the worked
// two-hand diagram is on page 6, so the notes' items 1–2 cite page 6 and items
// 3–4 (which side suit, how to play a suit) cite page 7. The suit-combinations
// table is transcribed as one table across pages 8–9 with no stated row split,
// so every row cites BOTH pages rather than guessing which page it fell on.
// The AJT-opposite-xxx position is stated three times in the document (page 7's
// finesse list, the page 8–9 table, and page 30's arithmetic) and is authored
// once, citing all three.

import { item, play, range, toggle, type TemplateItem } from "@bridge/sayc-template/dsl";

/** A line of play a human executes; payload only where the engine has it. */
const technique = (
  key: string,
  title: string,
  text: string,
  opts: Parameters<typeof item>[6] = {},
): TemplateItem =>
  item(key, title, text, "declarer_technique", "declarer_play", { kind: "none" }, opts);

/** A choice between lines — teaching content, never a rule. */
const judgment = (
  key: string,
  title: string,
  text: string,
  opts: Parameters<typeof item>[6] = {},
): TemplateItem =>
  item(key, title, text, "judgment_guideline", "declarer_play", { kind: "none" }, opts);

/** A fact of the game or a piece of arithmetic — teaching content. */
const concept = (
  key: string,
  title: string,
  text: string,
  opts: Parameters<typeof item>[6] = {},
): TemplateItem => item(key, title, text, "concept", "declarer_play", { kind: "none" }, opts);

export const PLAY: TemplateItem[] = [
  // =========================================================================
  // PAGE 6, ITEM 1 — COUNT FIRST.
  // =========================================================================

  judgment(
    "play-count-first",
    "Count winners or losers before playing a single card",
    "The notes' first and most emphatic instruction: COUNT WINNERS OR LOSERS BEFORE PLAYING A SINGLE CARD. Which of the two you count depends on the contract. In NOTRUMP count WINNERS — the tricks you can already take — and decide whether they are enough. In a SUIT contract count LOSERS (and the winners), because the whole plan of a trump hand is the disposal of the losers. Everything else the notes say about declarer play is an answer to that count: the count tells you how many extra tricks you need, and only then can you sensibly choose which suit to attack and how to play it. Do the counting at trick one, from both hands together, before you call for a card from dummy.",
    {
      settings: [
        toggle(
          "b_play_count_before_trick_one",
          "Count winners (notrump) or losers (suit) before trick one",
          true,
          "The notes' opening instruction. There is no way for the engine to skip counting, so this dial documents the discipline rather than switching a behaviour off.",
        ),
      ],
    },
  ),

  item(
    "play-count-winners-notrump",
    "Counting winners in notrump: cash them, or establish extras first",
    "Count your winners in notrump and then judge the RACE. If you have enough winners for the contract AND there is a danger of the opponents cashing theirs, CASH YOUR WINNERS — take the tricks that are already yours rather than giving up the lead and letting them take theirs. If the opponents have NOT established their winners and cannot yet defeat you, you have time: establish ADDITIONAL winners first, and cash afterwards. So the order of play in notrump is decided by whose suit is ready. Count their tricks as well as yours before deciding: the notes' condition is not \"do I have enough?\" alone but \"do I have enough AND are they threatening?\".",
    "declarer_technique",
    "declarer_play",
    {
      kind: "play_rules",
      rules: [play("cash_out_when_enough", 10, { side: "declarer", position: "lead" })],
    },
    {
      settings: [
        toggle("b_play_cash_when_enough", "Cash out when the winners already cover the contract"),
      ],
    },
  ),

  item(
    "play-count-losers-suit",
    "Counting losers in a suit contract: finesse, ruff, or discard them",
    "In a suit contract count the LOSERS (and the winners) and then plan on GETTING RID OF the losers. The notes give exactly three routes, and every trump-contract plan in this chapter is one of them or a combination: FINESSING the loser away (see the finesse items — a missing honour that sits in front of your tenace need not cost a trick); RUFFING it, which needs a trump left in the hand that is short in that suit; or DISCARDING it on some other SIDE SUIT, which needs a winner in the other hand and a loser in yours. Take the count suit by suit and ask of each loser which of the three routes will dispose of it — the answer decides whether you can afford to draw trumps and which side suit you must play first.",
    "declarer_technique",
    "declarer_play",
    {
      kind: "play_rules",
      rules: [
        play("ruff_loser", 18, { side: "declarer" }),
        play("discard_loser_on_winner", 19, { side: "declarer" }),
      ],
    },
    {
      settings: [
        toggle("b_play_ruff_losers", "Ruff losers when the short hand is void"),
        toggle("b_play_discard_losers_on_side_suit", "Park losers on the other hand's side-suit winners"),
      ],
    },
  ),

  // =========================================================================
  // PAGE 6, ITEM 2 — TRUMPS: DRAW THEM, AND THE THREE REASONS NOT TO.
  // =========================================================================

  item(
    "play-draw-trumps",
    "Take out trumps — unless you need them for something else",
    "The notes' default is to TAKE OUT TRUMPS: draw the opponents' trumps so your side-suit winners cannot be ruffed. The rule is stated with its exceptions attached, and all three are on this page — do NOT draw trumps when you need to CROSS-RUFF, when you need to RUFF (in the short hand), or when you CANNOT DELAY playing some other suit. Each exception has its own item in this chapter. Read the default as \"draw trumps unless the count of losers you took at trick one tells you the trumps have another job\" — the exceptions are not rare, and the notes spend more words on them than on the rule.",
    "declarer_technique",
    "declarer_play",
    { kind: "play_rules", rules: [play("draw_trumps", 20, { side: "declarer", position: "lead" })] },
    { settings: [toggle("b_play_draw_trumps", "Draw trumps before running side suits")] },
  ),

  judgment(
    "play-cross-ruff",
    "Exception: the cross-ruff — maximum trump tricks, at a price",
    "A CROSS-RUFF ruffs losers in BOTH hands, and the notes' reason for it is arithmetic: it MAXIMIZES YOUR TRUMP TRICKS, because every trump in both hands can take a trick separately instead of the two hands' trumps colliding on the same trick. The price is stated just as plainly: you may END UP SHORT IN TRUMPS, and you may GET OVER-RUFFED — a defender with a higher trump than the one you ruff with turns your planned trick into their trick. The notes offer a middle course rather than an all-or-nothing choice: you may decide to play A COUPLE OF ROUNDS OF TRUMPS FIRST and then embark on the cross-ruff, which removes the small trumps that would over-ruff you at the cost of two of the ruffs you were counting on. Decide from the loser count: if the cross-ruff needs every trump, you cannot afford the two rounds.",
    {
      settings: [
        toggle("b_play_cross_ruff_on", "Cross-ruff when it maximises trump tricks"),
        range(
          "b_play_cross_ruff_trump_rounds",
          "Trump rounds to play before embarking on a cross-ruff (the notes: \"a couple\")",
          1,
          2,
          { min: 0, max: 5 },
        ),
      ],
    },
  ),

  judgment(
    "play-ruff-in-short-hand",
    "Exception: ruff in the SHORT trump hand — ruffing in the long hand usually gains nothing",
    "The notes' warning about the second exception: RUFFING LOSERS IN THE HAND WITH THE LONGER TRUMPS USUALLY DOESN'T HELP. The reason is that the long trump hand's trumps were going to take tricks anyway — spending one of them on a ruff converts a trick you already had into the same trick, and it shortens the holding you need to draw the opponents' trumps with. A ruff gains a trick when it is taken in the hand that is SHORT in trumps, because that hand's small trump would otherwise never win anything. So before you plan a ruff, ask which hand it is taken in; if the answer is the long hand, the ruff is usually an illusion and the loser has to go somewhere else.",
    {
      settings: [
        toggle(
          "b_play_ruff_in_short_hand",
          "Count a ruff as a trick only in the short trump hand",
          true,
          "The notes' reasoning: ruffing in the long trump hand usually gains nothing. Turn off to allow long-hand ruffs to count as extra tricks.",
        ),
      ],
    },
  ),

  technique(
    "play-tempo-before-trumps",
    "Exception: do not delay the suit that gives you the discard — the notes' worked example",
    "DO NOT DELAY PLAYING A SUIT THAT CAN BE USED TO DISCARD YOUR LOSER(S). The notes work it through on a boxed two-hand diagram. NORTH: ♠KQJTxx ♥xx ♦xx ♣Axx. SOUTH: ♠xxx ♥KQJ ♦Axx ♣Kxxx. Spades are trumps and the lead is a CLUB. Two decisions, in order. First, WIN THE CLUB WITH THE ACE — the notes' stated reason is \"TO RETAIN AN ENTRY IN S\", i.e. taking the first trick with North's ♣A leaves South's ♣K intact as a later entry to the hand holding ♥KQJ, which is the hand you must be able to reach again once the hearts are established. Second, and this is the point of the example, PLAY A HEART AT TRICK TWO rather than starting on trumps. If you go after the trumps instead, the defenders take the ♠A and then drive out your ♦A, and now you have no time left to establish the hearts and no discard for the diamond loser. Play the heart first, lose it if you must, and discard the diamond loser on the established heart when you regain control. The general shape: when the discard suit needs establishing and the defenders can attack your entries, the discard suit is played BEFORE the trumps.",
    {
      settings: [
        toggle(
          "b_play_tempo_before_trumps",
          "Play the discard suit before drawing trumps when the tempo demands it",
          true,
          "The notes' example: playing trumps first loses the tempo to establish hearts for the diamond discard.",
        ),
      ],
    },
  ),

  judgment(
    "play-keep-trumps-for-side-suits",
    "Exception: do not draw trumps if you will be left with none and still need side-suit tricks",
    "The fourth thing the notes say about trumps, and the one most often ignored: DO NOT TAKE OUT TRUMPS IF YOU ARE NOT GOING TO BE LEFT WITH ANY TRUMPS AND STILL HAVE TO ESTABLISH TRICKS IN THE SIDE SUITS. Drawing the last of the opponents' trumps sometimes costs the last of yours, and a declarer with no trumps left in either hand is playing notrump with a side suit that is not yet established — the defenders simply cash their suit the moment you give up the lead. Count the trumps: yours, dummy's and theirs. If drawing them all leaves you with nothing to stop the run of their suit while your own suit is still unset, leave a trump outstanding and do your establishing first.",
    {
      settings: [
        toggle(
          "b_play_keep_trump_for_side_suits",
          "Leave a trump outstanding when side suits still need establishing",
          true,
        ),
      ],
    },
  ),

  // =========================================================================
  // PAGE 7, ITEM 3 — WHICH SIDE SUIT TO PLAY.
  // =========================================================================

  judgment(
    "play-side-suit-to-ruff",
    "Which side suit? One you want to RUFF — and you may be in a race",
    "The first of the notes' three reasons to choose a side suit: A SUIT WHICH YOU WANT TO RUFF. The warning attached to it is about timing — SOMETIMES YOU MAY HAVE TO HURRY BEFORE THE OPPONENTS CAN TAKE OUT YOUR TRUMPS FROM THE SHORT HAND, since a defender who leads trumps at every opportunity is attacking exactly the trump you were going to ruff with. And the notes' own instruction if the race looks lost: IF YOU ARE NOT GOING TO WIN THAT RACE THEN FALL BACK ON SOME OTHER OPTION — do not spend tricks setting up a ruff that will not happen. The two examples show how the shape decides. With Axx opposite xxx you CANNOT get more than ONE trick in the suit however you play it: both hands have three cards, so there is no third-round ruff to take. With Axx opposite xx you MAY be able to RUFF THE THIRD CARD, because the doubleton runs out first — that is the difference between a suit worth attacking and a suit that is only a source of losers.",
  ),

  item(
    "play-side-suit-to-establish",
    "Which side suit? One where you can ESTABLISH extra tricks",
    "The second reason to choose a side suit: A SUIT IN WHICH YOU CAN ESTABLISH ADDITIONAL TRICKS. The notes' example is AKxxx opposite xxx — you will LOSE AT LEAST ONE TRICK in the suit, and that is the price of admission, but AFTER THAT YOUR REMAINING CARDS MAY BE GOOD: once the defenders' cards in the suit are gone, the fourth and fifth cards are winners. Shape changes the method: IF YOU HAVE ONLY xx IN ONE HAND you may be able to RUFF THE THIRD ROUND and establish the remaining cards that way, spending a trump instead of a trick. The extreme version of the same idea is the last row of the suit-combinations table — with xxxxx opposite xxx and no honour at all, giving up the first three tricks still establishes the rest. Establishment always costs tricks or trumps up front, so count what it costs against the tricks the count at trick one said you still need.",
    "declarer_technique",
    "declarer_play",
    {
      kind: "play_rules",
      rules: [
        play("duck_to_preserve_entry", 35, { side: "declarer", position: "lead" }),
        play("establish_long_suit", 40, { side: "declarer", position: "lead" }),
      ],
    },
    {
      settings: [
        toggle("b_play_establish_side_suit", "Establish a long side suit for extra tricks"),
      ],
    },
  ),

  judgment(
    "play-eliminate-for-ruff-discard",
    "Which side suit? One you can ELIMINATE from both hands",
    "The third reason: ELIMINATE THE SUIT FROM BOTH HANDS. Playing a suit until neither you nor dummy holds one is not a wasted effort — it changes what the defenders can safely do. Once both of your hands are void, a defender who leads that suit hands you a RUFF-AND-DISCARD (ruff in one hand, throw a loser from the other), and a defender who does not want to give you that must play SOME OTHER SUIT instead — which is exactly the suit you could not attack yourself. So elimination is played for one of two payoffs: the free ruff-and-discard, or the forced lead into your weakness. It needs the trumps still in place to make the ruff-and-discard a threat, which is why it belongs to the same decision as whether to draw trumps.",
    {
      settings: [
        toggle(
          "b_play_eliminate_for_ruff_discard",
          "Eliminate a side suit to threaten a ruff-and-discard",
          true,
        ),
      ],
    },
  ),

  // =========================================================================
  // PAGE 7, ITEM 4 — HOW TO PLAY A SUIT.
  // =========================================================================

  concept(
    "play-suit-combinations-are-learnable",
    "How to play a suit: thousands of combinations, a handful of concepts",
    "The notes introduce card play in a single suit with a warning and a promise: there are THOUSANDS OF COMBINATIONS, but UNDERSTANDING SOME BASIC CONCEPTS HELPS A LOT. The concepts are the four that follow in this chapter — do not grieve over tricks that must be lost to missing top honours; try to win your tricks with your HIGHEST honours; FINESSE to avoid losing to a missing high card when you hold the surrounding cards; and count the probability of where the missing cards are (page 30). The eleven-position table on pages 8–9 is the notes' worked application of those concepts, not a list to memorize blind: each row is one of these ideas applied to one holding.",
  ),

  judgment(
    "play-honors-you-cannot-save",
    "Do not grieve over tricks lost to missing top honours",
    "The notes' first concept is a piece of temperament: DO NOT SWEAT OVER LOSING TRICKS TO TOP HONORS — YOU USUALLY CAN'T AVOID THAT. The example is the plainest possible one: if the ACE and the KING are both missing, you are GOING TO LOSE TWO TRICKS in that suit, and no line of play changes it. The practical value of accepting it is that it redirects the plan: a trick that cannot be won in this suit has to be found in another suit, or the loser has to be ruffed or discarded (see the loser count). Declarers lose contracts by spending entries and tempo trying to rescue tricks that were never available, while the trick they could have had somewhere else goes untaken.",
  ),

  technique(
    "play-win-with-highest-honors",
    "Try to win tricks with your highest honours — Kx, Qxx and Jxx",
    "The notes' second concept: TRY TO WIN TRICKS WITH YOUR HIGHEST HONORS, which in practice means leading TOWARD the honour so the defender in front of it must commit first. Their three examples, in descending order of hope. Kx opposite xx: PLAY A SMALL CARD TOWARDS THE Kx AND HOPE THE A IS BEFORE THE K — if the ace sits in front of the king, the king makes a trick either by winning the trick outright or after the ace has been spent on air. Qxx opposite xxx: PLAY TWICE TOWARDS THE Q AND HOPE BOTH THE AK ARE BEFORE THE Q — the queen needs two honours placed favourably, and you need the entries to lead the suit twice. Jxx opposite xxx: YOU ARE GOING TO LOSE THREE TRICKS — DO NOT SWEAT OVER IT, and the notes' instruction is to TRY TO GET RID OF THOSE LOSERS ON SOME OTHER SIDE-SUIT rather than to play the suit at all. The pattern across all three: the honour is worth a trick only if a defender must play before it, and each honour you drop down the ladder needs one more card to lie favourably.",
  ),

  item(
    "play-finesse-basics",
    "The finesse: avoid losing to a missing high card",
    "FINESSE — the notes' definition is a purpose, not a manoeuvre: AVOID LOSING TRICKS TO THE MISSING HIGH CARDS. What makes it possible is what you hold around the missing card: YOU NEED THE SURROUNDING CARDS OR ENOUGH LENGTH TO DROP THEM. Their two-card contrast makes the point. With AQ opposite xx you CAN FINESSE THE KING: lead toward the A-Q and, if the defender in front plays low, the queen wins because the king dare not appear. With AJ opposite xx you CAN AT MOST CAPTURE THE KING (or the queen) WITH YOUR ACE BUT WILL LOSE THE JACK TO THE REMAINING MISSING HONOUR — the ace and jack are not a real tenace, because two honours sit between them. So the test before you plan a finesse is whether your holding actually surrounds the card you are hunting; if two honours are missing above your second card, the finesse cannot gain and the trick has to come from length or from another suit.",
    "declarer_technique",
    "declarer_play",
    {
      kind: "play_rules",
      rules: [play("finesse_toward_tenace", 30, { side: "declarer", position: "lead" })],
    },
    { settings: [toggle("b_play_finesse", "Finesse toward a tenace")] },
  ),

  technique(
    "play-combo-ajx-xxx",
    "AJx opposite xxx — lead twice toward the AJx; two tricks 25% of the time",
    "AJx opposite xxx. HOPE TO MAKE A TRICK WITH THE JACK IF BOTH THE KING AND QUEEN ARE BEFORE THE AJx: LEAD TWICE TOWARDS THE AJx AND PLAY THE JACK IF THE NEXT PLAYER PLAYS LOW. The notes state the odds outright — the PROBABILITY OF GETTING TWO TRICKS IS 25%. Page 30 is the arithmetic behind that number: with two cards missing there are four equally likely layouts, and only ONE of them (the defender in front of you holding BOTH the king and the queen) gives you two tricks, so 1 in 4. Compare it with AJT opposite xxx, where the ten turns the same position into a 75% chance — the difference between one chance in four and three in four is a single spot card, which is why the notes teach the two positions together. Note the entry requirement: leading the suit twice from the correct side means two entries to the hand opposite the AJx.",
    {
      settings: [
        range(
          "b_play_ajx_xxx_two_tricks_pct",
          "AJx opposite xxx: chance of two tricks (%) — the notes state 25, so both ends are 25",
          25,
          25,
          { min: 0, max: 100 },
        ),
      ],
    },
  ),

  technique(
    "play-combo-ajt-xxx",
    "AJT opposite xxx — the 75% position (stated three times in the notes)",
    "AJT opposite xxx, the position the notes state on page 7, again in the suit-combinations table, and a third time as the payoff of page 30's arithmetic. THE LINE: LEAD TWICE TOWARDS THE AJT AND PLAY THE ACE ONLY IF THE DEFENDER IN FRONT PLAYS THE KING OR THE QUEEN — otherwise insert the ten on the first round and the jack on the second. YOU CAN MAKE TWO TRICKS 75% OF THE TIME, I.E. WHEN THE PLAYER IN FRONT OF THE AJT HAS AT LEAST ONE OF (OR BOTH) THE KING AND QUEEN. THE ARITHMETIC (page 30): two missing cards, four equally likely layouts of 25% each — that player holds both, holds the king only, holds the queen only, or holds neither — and THREE of the four give you a second trick, hence 3/4 = 75%. This is the single most valuable row in the table, because it converts a holding that looks like one trick into a three-in-four chance of two, and it costs nothing but the entries to lead the suit twice.",
    {
      settings: [
        range(
          "b_play_ajt_xxx_two_tricks_pct",
          "AJT opposite xxx: chance of two tricks (%) — the notes state 75, so both ends are 75",
          75,
          75,
          { min: 0, max: 100 },
        ),
      ],
    },
  ),

  // =========================================================================
  // PAGES 8–9 — THE SUIT-COMBINATIONS TABLE. One item per row, in the notes'
  // order. The table's preamble is authored as its own item because every row
  // depends on it. AJT opposite xxx is above, with the page-7 finesse list.
  // =========================================================================

  concept(
    "play-combo-table-assumptions",
    "The suit-combinations table: what it assumes before every row",
    "The preamble to the notes' eleven-position table, which every row depends on and which is easy to skip: ASSUME TRUMPS ARE OUT AND YOU HAVE ENOUGH ENTRIES IN OTHER SUITS IN BOTH HANDS. ASSUME SOUTH IS THE DECLARER. Both assumptions matter. \"Trumps are out\" means the lines below ignore the risk of being ruffed and the question of whether you could afford to draw trumps at all — pages 6–7 decide that, and one of the table's own rows (the advanced play in AQx opposite xxx) is explicitly about a trump suit. \"Enough entries in both hands\" is the bigger one: almost every line in the table says LEAD TOWARDS a holding, some of them twice, and each such lead needs an entry to the hand opposite. At the table, count the entries before you commit to a line that needs two of them. The table is written from SOUTH's point of view, so \"the LHO\" throughout is the defender to declarer's left — the player who plays before dummy's (North's) honours.",
  ),

  technique(
    "play-combo-aqx-xxx",
    "AQx opposite xxx — the most basic finesse, and its advanced variation",
    "AQx (North) opposite xxx (South). THE BASIC LINE: HOPE THE KING IS WITH THE LHO; PLAY TOWARDS THE QUEEN AND PLAY THE QUEEN IF THE LHO PLAYS LOW. The notes call this THE MOST BASIC FINESSE — one lead, one chance, and it wins whenever the king sits in front of the A-Q. THE ADVANCED PLAY: SOMETIMES PLAYING THE ACE FIRST, AND THEN COMING BACK TO SOUTH IN SOME OTHER SUIT TO PLAY TOWARDS THE QUEEN, HELPS IN TWO SITUATIONS — (1) you DO NOT LOSE A TRICK TO A SINGLETON KING, because the singleton falls under the ace instead of scoring on the first round, and (2) if THIS IS A TRUMP SUIT, you are able to REMOVE MOST OF THE OPPONENTS' TRUMPS QUICKLY and so avoid ruffs. The notes' justification for spending the ace early is that YOU ARE GOING TO LOSE A TRICK TO EITHER THE JACK OR THE KING ANYWAY, so the ace was never protecting a third trick. Note that this cuts the other way from the AQx-opposite-Jxxx row, where the notes explicitly say NOT to cash the ace first — there the jack makes the doubleton king worth playing for, and here there is no jack to promote.",
    {
      settings: [
        toggle(
          "b_play_aqx_cash_ace_first",
          "AQx opposite xxx: cash the ace before finessing (the notes' \"advanced play\")",
          false,
          "The notes present the plain finesse as the line and the ace-first play as an occasional variation for two named reasons (a singleton king, or pulling trumps quickly). Default off; turn on to take the variation as the default.",
        ),
      ],
    },
  ),

  technique(
    "play-combo-aqx-jxxx",
    "AQx opposite Jxxx — finesse, and why a doubleton king beats a singleton one",
    "AQx (North) opposite Jxxx (South), seven cards with the king missing. THE LINE: HOPE THE KING IS WITH THE LHO; PLAY TOWARDS THE QUEEN AND PLAY THE QUEEN IF THE LHO PLAYS LOW — the same basic finesse as AQx opposite xxx. What the extra length adds: IF THE KING IS DOUBLETON WITH THE LHO IT WILL DROP UNDER THE ACE, AND YOU CAN WIN THE JACK TOO, so the position is worth three tricks rather than two when the cards lie that way. And the explicit instruction the notes attach: DO NOT PLAY THE ACE FIRST TO DROP THE SINGLETON KING, SINCE A DOUBLETON KING IS MORE LIKELY THAN A SINGLETON KING. That is the reasoning to carry away, and it is a counting argument, not a preference: there are more ways for a defender to be dealt a specific card with one companion than with none, so the layout you should cater for is the doubleton — which the finesse handles (the king is caught on the second round and the jack cashes) while the ace-first play does not.",
    {
      settings: [
        toggle(
          "b_play_prefer_doubleton_king",
          "Play for a doubleton king rather than a singleton king",
          true,
          "The notes' stated reason for finessing rather than cashing the ace: a doubleton king is more likely than a singleton king.",
        ),
      ],
    },
  ),

  technique(
    "play-combo-ajxx-qtxx",
    "AJxx opposite QTxx — AQJT split between the hands: repeat the finesse",
    "AJxx (North) opposite QTxx (South). Look at the honours TOGETHER: IF YOU HAVE AQJT COMBINED IN BOTH HANDS, WITH ONLY THE KING MISSING, you can LEAD THE TEN (OR THE JACK, OR THE QUEEN) TOWARDS THE ACE AND REPEAT THE FINESSE UNTIL EITHER THE LHO PLAYS THE KING OR YOU LOSE TO THE RHO'S KING. The mechanism: with A-Q-J-T between the hands every round of the suit presents the defender in front of the ace with the same losing choice — play the king and it is captured, or duck and your honour wins the trick. Because the finesse is REPEATABLE you are never forced to guess on one round; the only losing layout is the king sitting behind the ace, and then it was always a trick. Two practical notes: lead the LOWER of your touching honours from the hand opposite the ace so the ace-hand's honours stay in place, and count the entries — repeating the finesse means leading the suit two or three times from the same side.",
  ),

  technique(
    "play-combo-axx-qxx",
    "Axx opposite Qxx — lead TOWARDS the queen, never lead the queen",
    "Axx (North) opposite Qxx (South) — one of the most commonly misplayed positions, and the notes give both the wrong line and the right one. THE WRONG LINE: IF YOU LEAD THE QUEEN, the LHO will COVER IT WITH THE KING, or your QUEEN WILL LOSE TO THE RHO'S KING; either way YOU CAN ONLY MAKE ONE TRICK WITH THIS APPROACH IRRESPECTIVE OF WHERE THE KING IS. That last clause is the point — leading the queen throws away the position's whole chance, because a queen led is a queen the king can kill for free. THE BETTER APPROACH: LEAD A LOW CARD TOWARDS THE QUEEN AND HOPE THE KING IS BEFORE THE QUEEN. NOW YOU CAN WIN THE ACE AND THE QUEEN SEPARATELY, because the defender in front of the queen must either play the king into it or duck and let it win. The general rule the row teaches: an honour that is not accompanied by the honour below it is played by leading TOWARDS it, never by leading it.",
    {
      settings: [
        toggle(
          "b_play_lead_toward_lone_queen",
          "Lead low toward an unsupported queen rather than leading the queen",
          true,
        ),
      ],
    },
  ),

  technique(
    "play-combo-aj9-xxx",
    "AJ9 opposite xxx — finesse the TEN as well as the king and queen",
    "AJ9 (North) opposite xxx (South), the position one spot card below AJT. THE LINE: LEAD TWICE TOWARDS NORTH AND \"COVER\" THE CARD PLAYED BY THE LHO — if a low card appears insert the nine on the first round and the jack on the second; if an honour appears, cover it. YOU CAN MAKE TWO TRICKS IF THE LHO HAS THE TEN AS WELL AS AT LEAST ONE HONOUR, and the notes name what is happening: YOU ARE FINESSING THE TEN AS WELL AS THE KING AND QUEEN. That is the row's lesson — with A-J-9 the missing cards you are hunting are three (king, queen and ten), not two, so this position needs MORE from the layout than AJT does, which makes two tricks whenever the LHO holds either honour regardless of the ten. Read the two rows side by side: AJT is 75%, AJ9 is the same manoeuvre with a stricter requirement, and the whole difference is the ten.",
  ),

  technique(
    "play-combo-ajx-ktx",
    "AJx opposite KTx — a two-way finesse for the queen: DELAY it",
    "AJx (North) opposite KTx (South). YOU HAVE A TWO-WAY FINESSE FOR THE QUEEN: with the ace, king, jack and ten between the hands you can lead toward either hand and play the queen to be in either defender's hand, so you have a genuine choice of which defender to play for. The notes' instruction is therefore not about which way to finesse but about WHEN: DELAY THIS FINESSE AS LONG AS POSSIBLE AND HOPE THE OPPONENTS HAVE TO PLAY THAT SUIT. IF THEY PLAY IT, YOU GET THE FREE FINESSE. The reasoning is that a two-way guess is a 50% proposition today and may be a certainty later — every round of every other suit is evidence about the layout, and if a defender is ever forced to lead this suit the guess disappears entirely (whoever plays it has told you where the queen is, or has led into your tenace). So play the rest of the hand first, keep both tenaces intact, and take this suit last. Note the interaction with elimination play on page 7: stripping the hand is exactly how you MAKE the opponents open the suit.",
    {
      settings: [
        toggle(
          "b_play_delay_two_way_finesse",
          "Delay a two-way finesse and take the free finesse if the opponents open the suit",
          true,
        ),
      ],
    },
  ),

  technique(
    "play-combo-j9x-qxx",
    "J9x opposite Qxx — let THEM play it; breaking the suit may cost the trick entirely",
    "J9x (North) opposite Qxx (South) — the row that is about restraint rather than technique. IF THE OPPONENTS PLAY THIS SUIT THEN YOU ARE GUARANTEED ONE TRICK: with the jack, nine and queen placed around their honours, any lead they make into either hand promotes one of your cards. IF YOU PLAY THIS SUIT — if you \"BREAK\" it yourself — THEN YOU MAY NOT GET ANY TRICK IN THIS COMBINATION AT ALL, because you have to lead a small card toward an honour that both of their honours sit over. The notes' best line if you must play it: FINESSE THE TEN USING THE J9 — lead toward the J-9 and insert the nine, hoping the ten is in front of it. Practically: count this suit as one trick you own only so long as you do not touch it, park it in your plan as \"theirs to open\", and if you find yourself needing the trick, take the J9 finesse rather than leading toward the queen.",
    {
      settings: [
        toggle(
          "b_play_dont_break_j9x_qxx",
          "Leave J9x-opposite-Qxx alone and let the opponents open it",
          true,
          "The notes: guaranteed one trick if they play the suit, possibly none if you break it yourself.",
        ),
      ],
    },
  ),

  technique(
    "play-combo-axx-qjx",
    "Axx opposite QJx — two tricks guaranteed; a different line if you need them QUICKLY",
    "Axx (North) opposite QJx (South). YOU ARE GUARANTEED TWO TRICKS WITH ANY NORMAL PLAY — the ace is one, and the queen-jack together force out the king so that the survivor is the second, whichever defender holds the king and whatever they do with it. So this is a row that needs no thought at all UNLESS the count you took at trick one says you need the tricks EARLY. IF YOU NEED TWO QUICK TRICKS THEN PLAY THE QUEEN AND FINESSE THE KING: leading the queen (or playing it through) takes the finesse immediately and, when the king is in front of it, gives you both tricks at once rather than after conceding one. That line risks nothing you were guaranteed only in the sense that it changes the ORDER — the notes offer it as the answer to a tempo problem, not as an improvement on the count.",
    {
      settings: [
        toggle(
          "b_play_axx_qjx_quick_tricks",
          "Axx opposite QJx: play the queen and finesse the king (two QUICK tricks)",
          false,
          "The notes' default is any normal play for two guaranteed tricks. Turn on when the hand needs both tricks immediately.",
        ),
      ],
    },
  ),

  technique(
    "play-combo-axx-qjt",
    "Axx opposite QJT — finesse the king TWICE, and you may make all three",
    "Axx (North) opposite QJT (South). FINESSE THE KING TWICE BY LEADING TOWARDS THE ACE — lead the ten (then the jack) from the QJT hand toward the ace, so the defender in front of the ace must decide each time whether to play the king. YOU MAY MAKE ALL THREE TRICKS: when the king lies in front of the ace, the first lead wins, the second lead wins, and the ace takes the third. The reason the manoeuvre repeats is that Q-J-T is a solid sequence — each round you lead a card the defenders cannot profitably cover, so you get a second chance at the same guess for free. Contrast it with Axx opposite QJx one row above, where the missing ten means there is no second lead worth making and the position is worth exactly two.",
  ),

  technique(
    "play-combo-xxxxx-xxx",
    "xxxxx opposite xxx — no honours at all: duck three rounds and establish the rest",
    "xxxxx (North) opposite xxx (South) — eight cards, not a single honour, and still a source of tricks. EVEN IF YOU DO NOT HAVE ANY HONORS IN THIS SUIT, YOU COULD GIVE UP THE FIRST THREE TRICKS AND HOPEFULLY THE REMAINING CARDS WILL BE ESTABLISHED. The arithmetic behind \"three\": the defenders hold five cards between them, so after three rounds — if the suit breaks 3-2 — their cards are gone and North's fourth and fifth cards are winners. What it costs is exactly what the notes say: three tricks, plus an entry to reach the established suit afterwards, plus the tempo the defenders get with those three leads. So this line belongs to hands where you have time and need length tricks, and it is the extreme illustration of the page-7 principle that establishment is paid for up front.",
    {
      settings: [
        range(
          "b_play_duck_rounds_to_establish",
          "Rounds to duck when establishing a five-card suit with no honours (the notes: 3)",
          3,
          3,
          { min: 0, max: 6 },
        ),
      ],
    },
  ),

  // =========================================================================
  // PAGE 30 — THE ARITHMETIC BEHIND PAGE 7'S PERCENTAGES.
  // =========================================================================

  concept(
    "play-prob-one-missing-card",
    "One missing key card: 50% either way — so usually finesse",
    "The notes' arithmetic for a single missing card. THERE ARE TWO POSSIBILITIES — the LHO has it, or the RHO has it — so the PROBABILITY IS 50%. The conclusion they draw is a default: USUALLY FINESSE THE CARD, because a 50% finesse is better than no chance at all. And the exception is stated as a comparison, which is the way to remember it: finesse the card WHEN THE PROBABILITY OF DROPPING IT IS LOWER THAN 50% — equivalently, play to DROP it when dropping is the BETTER-THAN-50% chance. THE NOTES' OWN EXAMPLE of that case: IF ONLY FOUR CARDS ARE MISSING INCLUDING THE QUEEN, PLAY THE ACE AND THE KING TO DROP THE QUEEN INSTEAD OF FINESSING — with only four cards out, the queen falls under the top honours often enough to beat the coin-flip. (Four missing cards means you hold nine, so this is the notes' version of the familiar \"nine never\" maxim, arrived at from the probability rather than from a rhyme.) The decision procedure at the table: work out how often the drop works for YOUR length, compare it with 50%, and take the bigger number.",
    {
      settings: [
        range(
          "b_play_finesse_vs_drop_pct",
          "Finesse-versus-drop line (%) — the notes: finesse unless dropping beats 50",
          50,
          50,
          { min: 0, max: 100 },
        ),
        range(
          "b_play_drop_queen_missing_cards",
          "Cards missing (including the queen) at which to cash A-K for the drop (the notes: 4)",
          4,
          4,
          { min: 2, max: 8 },
        ),
      ],
    },
  ),

  concept(
    "play-prob-two-missing-cards",
    "Two missing key cards: four layouts, and why the AJT position is 75%",
    "The notes' arithmetic for two missing cards X and Y. THERE ARE FOUR POSSIBILITIES, EACH 25%: the LHO has BOTH; the LHO has X and the RHO has Y; the LHO has Y and the RHO has X; the RHO has BOTH. Therefore THE PROBABILITY OF THE LHO HAVING AT LEAST ONE OF THEM IS 75% — three of the four possibilities. That single number is the whole reason for the notes' most valuable finessing position, and they draw the connection themselves: LEAD TWICE TOWARDS AJT AND HOPE THE LHO HAS AT LEAST ONE HONOUR — THERE IS A 75% CHANCE THAT YOU CAN MAKE TWO TRICKS. Read this item together with the AJx and AJT rows: AJx opposite xxx needs the LHO to hold BOTH missing honours, which is one layout in four (25%), while AJT needs EITHER, which is three in four (75%). Page 30 is the arithmetic behind page 7's percentages — the two pages are one idea, and knowing the four layouts means you never have to memorize a table of finesse percentages again. (The notes count layouts, not exact card combinations, so these are the teaching approximations, not the textbook vacant-places numbers.)",
    {
      settings: [
        range(
          "b_play_lho_holds_one_of_two_pct",
          "Chance the LHO holds at least one of two missing cards (%) — the notes: 75",
          75,
          75,
          { min: 0, max: 100 },
        ),
      ],
    },
  ),
];

/** Page(s) each item was authored from — install.ts turns these into citations. */
export const PLAY_PAGES: Record<string, number[]> = {
  // Pages 6–7 are one transcribed block. The worked two-hand diagram is on
  // page 6, so the notes' numbered items 1–2 (count; trumps) cite page 6 and
  // items 3–4 (which side suit; how to play a suit) cite page 7.
  "play-count-first": [6],
  "play-count-winners-notrump": [6],
  "play-count-losers-suit": [6],
  "play-draw-trumps": [6],
  "play-cross-ruff": [6],
  "play-ruff-in-short-hand": [6],
  "play-tempo-before-trumps": [6],
  "play-keep-trumps-for-side-suits": [6],
  "play-side-suit-to-ruff": [7],
  "play-side-suit-to-establish": [7],
  "play-eliminate-for-ruff-discard": [7],
  "play-suit-combinations-are-learnable": [7],
  "play-honors-you-cannot-save": [7],
  "play-win-with-highest-honors": [7],
  "play-finesse-basics": [7],
  "play-combo-ajx-xxx": [7],
  // Stated on page 7, again in the pages 8–9 table, and a third time as the
  // conclusion of page 30's arithmetic — authored once, citing all three.
  "play-combo-ajt-xxx": [7, 8, 9, 30],
  // The suit-combinations table is transcribed as ONE table spanning pages
  // 8–9 with no stated row split, so every row cites both pages rather than
  // guessing which page it fell on.
  "play-combo-table-assumptions": [8, 9],
  "play-combo-aqx-xxx": [8, 9],
  "play-combo-aqx-jxxx": [8, 9],
  "play-combo-ajxx-qtxx": [8, 9],
  "play-combo-axx-qxx": [8, 9],
  "play-combo-aj9-xxx": [8, 9],
  "play-combo-ajx-ktx": [8, 9],
  "play-combo-j9x-qxx": [8, 9],
  "play-combo-axx-qjx": [8, 9],
  "play-combo-axx-qjt": [8, 9],
  "play-combo-xxxxx-xxx": [8, 9],
  // Page 30 — the arithmetic behind page 7's percentages. The one-missing-card
  // rule (50%, and the four-cards-missing drop) is stated ONLY on page 30, so
  // it cites 30 alone; the two-missing-card item restates page 7's 75% AJT
  // conclusion, so it cites both.
  "play-prob-one-missing-card": [30],
  "play-prob-two-missing-cards": [7, 30],
};

// Judgment & framework knowledge (SAYC booklet, complete-coverage pass
// 2026-07-21): everything the booklet TEACHES that the rule language cannot
// yet execute lives here as first-class teaching items — visible, citable,
// editable, and present so a source augmentation recognizes the knowledge
// instead of re-adding it. Where a concept is PARTLY executable, the
// executable rules live in their thematic chapters and these items carry the
// judgment around them.

import { item, type TemplateItem } from "../dsl";

const prose = (key: string, title: string, text: string): TemplateItem =>
  item(key, title, text, "judgment_guideline", "auction", { kind: "none" });

export const PROSE: TemplateItem[] = [
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
    "fourth-suit-forcing",
    "Fourth suit forcing",
    "When responder bids the fourth suit — the only unbid suit — that bid is forcing for one round and may be artificial: it asks opener to describe the hand further (often looking for a stopper for notrump) rather than promising length in the suit. The rule engine cannot name \"the fourth suit\" dynamically, so treat any otherwise-unexplained new-suit bid in the fourth suit as this ask.",
  ),
  prose(
    "two-over-one-forces",
    "Two-over-one response forces a rebid",
    "When responder bids a new suit at the two level as an unpassed hand (1♠–2♣), responder promises to bid AGAIN unless opener's rebid is at game level — and opener must also rebid. Opener could hold up to 18 points (just short of a jump shift), so responder must not pass a convenient rebid; a jump raise of opener's first suit to the three level afterwards is game forcing, since the limit raise was available directly.",
  ),
  prose(
    "preempt-discipline",
    "Preempt discipline by vulnerability",
    "Opening preempts follow the two-three-four guideline: within TWO tricks of your bid when vulnerable against not, THREE at equal vulnerability, FOUR at favorable. The engine cannot yet see vulnerability, so its preempts follow the equal-vulnerability standard — tighten or loosen by editing the preempt items' suit-quality conditions.",
  ),
  prose(
    "competitive-principles",
    "Competitive bidding principles",
    "Over intervention, bids mean what they meant without it — though you may need a second-choice call (a raise instead of a notrump rebid without a stopper). Cue-bidding RHO's suit shows game values without clear direction, often a game-forcing raise. Unless noted otherwise, any bid or double BY an opponent cancels a convention designed for non-competitive auctions (2NT over their overcall is natural, not Jacoby).",
  ),
  prose(
    "redouble-meanings",
    "Redouble meanings (penalty and SOS)",
    "A redouble is: TO PLAY when your side is at the four level or higher, or when they double a conventional bid you're happy with; a GOOD HAND (10+) when their double was takeout; and SOS — begging partner to run to another suit — when your side has been doubled for penalties in a trump suit at the three level or lower after passes.",
  ),
  prose(
    "defending-their-conventions",
    "Defending the opponents' conventions",
    "When the opponents use a convention such as Michaels or the unusual notrump, DOUBLE shows at least 10 points (usually balanced) and a desire to penalize one of their known suits; a cue-bid of one of their SHOWN suits forces game. You may add specific defenses (unusual-vs-unusual, Mathe over a big club) on the convention card.",
  ),
  prose(
    "cue-two-suits-natural",
    "Cue-bid over a two-suited auction is natural",
    "A cue-bid overcall is Michaels only while the opponents have shown ONE suit. Once they have bid two suits, a \"cue-bid\" of either is simply natural — you are bidding a real suit to play.",
  ),
  prose(
    "michaels-minor-ask",
    "Michaels minor ask (2NT)",
    "After a Michaels cue-bid of a MAJOR (showing the other major and an unspecified minor), advancer bids 2NT to ask which minor: 3♣ shows clubs, 3♦ shows diamonds. The engine cannot yet detect that partner's bid was a cue-bid, so this ask is played by people, not the machine.",
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

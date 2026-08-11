/**
 * @bridge/table-embed
 *
 * The Bridge table as a portable component. One import, one deal, no platform:
 * `<BridgeTable/>` owns a real game through @bridge/engine's pure reducer and
 * draws it with the same PlayTable the app uses. React is the only runtime
 * dependency — no Next, no server, no session.
 *
 *   import { BridgeTable } from "@bridge/table-embed";
 *   <BridgeTable seed={7} humanSeat="S" appearance={{ skin: "claret" }} />
 *
 * Robots are the host's business: pass `decide` and the other three seats play.
 *
 * A TABLE IS NOT THE ONLY SHAPE A LESSON WANTS. Three now, and they are the same
 * deal seen at three altitudes — the same seed, the same engine, the same
 * `decide`:
 *
 *   <BridgeTable/>    play the board out
 *   <BiddingDrill/>   N hands, one call each, BEN's call beside yours
 *   <DealDiagram/>    a deal as a record — look, do not touch
 *
 * The last two are column-shaped on purpose: a tutorial is a strip of prose, and
 * a felt table dropped into one is a table in a corridor.
 *
 * AND A CHALLENGE IS A LESSON WITH A SCORE. The platform's create wizard and its
 * challenge table travel here too, as a pair:
 *
 *   <ChallengeCreator/>  author N boards — the deals, the seat, what a board asks
 *   <ChallengePlayer/>   play them in sequence, your line beside BEN's
 *
 * They are SOLO. The platform's challenge is a group event with invites,
 * moderators, standings and a field; embedded there is one learner and BEN, so
 * every one of those is gone rather than stubbed. What is left is the part that
 * was always about bridge.
 *
 * AND ONE OF THEM DOES NOT ASK BEN AT ALL:
 *
 *   <BiddingChallenge/>  25 opening bids, marked against the AUTHOR's answer
 *
 * It is the drill's twin and its opposite. <BiddingDrill/> asks what a strong
 * engine would call and shows BEN's answer beside yours; <BiddingChallenge/>
 * asks what the lesson teaches and shows the author's, in the author's words.
 * There is no `decide` prop on it and no network call under it — BEN bids its
 * own system, and a drill that contradicts the lesson above it is worse than no
 * drill. Which one a lesson wants is a question about the lesson.
 */
export { BridgeTable } from "./BridgeTable";
export { BiddingDrill } from "./BiddingDrill";
export { DealDiagram } from "./DealDiagram";
export { ChallengeCreator } from "./ChallengeCreator";
export { ChallengePlayer } from "./ChallengePlayer";
export { createBenDecider } from "./benDecider";
export type { BenDeciderOptions } from "./benDecider";
export type { BridgeTableProps, BridgeDecide, BridgeDecision, } from "./BridgeTable";
export type { BiddingDrillProps, DrillHand, DrillAnswer } from "./BiddingDrill";
export type { DealDiagramProps } from "./DealDiagram";
export type { ChallengeCreatorProps } from "./ChallengeCreator";
export type { ChallengePlayerProps } from "./ChallengePlayer";
/**
 * The opening-bid drill: the component, its hands, and the check on them.
 *
 * `OpeningBidHand` is `openingBidHands.ts`'s own `DrillHand`, renamed on the way
 * out because this barrel already spends that name on <BiddingDrill/>'s posed
 * problem — a seed and an auction prefix, which is a different thing from a
 * hand with an answer attached. The author's file keeps its own name; only the
 * export is aliased.
 *
 * `validateDrillHands` is public because the FAULTS ARE PUBLIC. Five of these
 * hands arrived holding twelve cards, and the notes on several disagreed with
 * the cards; the author has since completed them, so the check is quiet today.
 * It stays exported and stays wired: the component shows what it finds, and a
 * host with its own author-facing panel (the learning platform's Configure)
 * shows it there too. A set with a twelve-card hand in it is drawn, flagged and
 * still playable — never hidden, never fatal.
 */
export { BiddingChallenge } from "./BiddingChallenge";
export type { BiddingChallengeProps } from "./BiddingChallenge";
export { OPENING_BID_HANDS, hcp, validateDrillHands } from "./openingBidHands";
export type { DrillHand as OpeningBidHand, DrillHandProblem } from "./openingBidHands";
export { normalizeCall, callsMatch, judgeHand, markAnswers } from "./openingBidDrill";
export type { BiddingChallengeAnswer, BiddingChallengeMark } from "./openingBidDrill";
/**
 * The challenge draft: the ONE object the creator produces and the player
 * consumes. A host that persists it needs the shape, the validator and the
 * reader that fills a stored blob's gaps with defaults.
 */
export { validateDraft, normalizeDraft, packFromDraft, MIN_BOARDS, MAX_BOARDS, } from "./challengeDraft";
export type { SoloChallengeDraft, ChallengeBoardDraft, } from "./challengeDraft";
/** What the player reports onward: completion, and how it went against BEN. */
export { buildSoloResults } from "./soloResults";
export type { SoloChallengeMark, SoloResultsView, SoloBoardOutcome, SoloLine, } from "./soloResults";
/**
 * The deal a seed means, so a host can SHOW it without mounting anything —
 * an author picking a board, a summary line, a printed hand record. Hosts were
 * re-implementing the derivation (same PRNG, same S-W-N-E rotation) to do this,
 * and a mirror of a deal is a mirror that can drift.
 */
export { seededDeal } from "@bridge/engine";
export type { Card, Seat, Suit, Call, Vul } from "@bridge/events";

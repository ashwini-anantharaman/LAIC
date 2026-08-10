// @bridge/table-ui — the play-table component family. The whole table
// (PlayTable) plus every props-driven leaf it composes, so both the live app
// and the component tester mount the SAME production components.

export { PlayTable } from "./PlayTable";
export type { PlayTableProps, PlayTableSeat, ResolvedAppearance } from "./PlayTable";

export { HandViewer } from "./HandViewer";
export type { HandViewerProps } from "./HandViewer";

export { BidColumns } from "./BidColumns";
export type { BidColumnsProps } from "./BidColumns";

export { EdgeToolbar } from "./EdgeToolbar";
export type { ToolbarItem } from "./EdgeToolbar";

export { SettingsMenu } from "./SettingsMenu";
export type { SettingsItem } from "./SettingsMenu";

// The extracted leaves — each a real component the tester registry can mount.
export { SeatHand } from "./SeatHand";
export type { SeatHandProps, SeatHandMetrics } from "./SeatHand";

export { SeatPlate } from "./SeatPlate";
export type { SeatPlateProps, SeatPlateMetrics } from "./SeatPlate";

export { SeatDiagram } from "./SeatDiagram";
export type { SeatDiagramProps } from "./SeatDiagram";

export { AuctionBox } from "./AuctionBox";
export type { AuctionBoxProps, AuctionBoxSizing, AuctionHead } from "./AuctionBox";

export { TrickArea } from "./TrickArea";
export type { TrickAreaProps, TrickPlay } from "./TrickArea";

export { ResultCard } from "./ResultCard";
export type { ResultCardProps } from "./ResultCard";

export { SeatsPopup } from "./SeatsPopup";
export type { SeatsPopupProps } from "./SeatsPopup";

export { CoachPanel } from "./CoachPanel";
export type { CoachPanelProps, CoachLine, CoachAction } from "./CoachPanel";

// ── the challenge family (docs/design/challenges/*.dc.html, spec ADDENDUM A) ──
// Props-driven like every leaf above: no data fetching, no server imports and
// no dependency on the challenges data package — the page layer adapts whatever
// its store returns into these plain shapes.
export { TableHostProvider, useTableHost, DEFAULT_TABLE_HOST } from "./host";
export type { TableHost } from "./host";

export { ChallengeStrip, CHALLENGE_STRIP_HEIGHT } from "./ChallengeStrip";
export type { ChallengeStripProps } from "./ChallengeStrip";

export { ChallengeResultsOverlay } from "./ChallengeResultsOverlay";
export type { ChallengeResultsOverlayProps, ChallengeBoardCell } from "./ChallengeResultsOverlay";

export { Leaderboard } from "./Leaderboard";
export type {
  LeaderboardProps,
  LeaderboardRow,
  LeaderboardBenchRow,
  LeaderboardMark,
} from "./Leaderboard";

export { Scorecard } from "./Scorecard";
export type { ScorecardProps, ScorecardColumn, ScorecardRow, ScorecardCell } from "./Scorecard";

export { BoardSquares } from "./BoardSquares";
export type { BoardSquaresProps, BoardSquare, BoardSquareState } from "./BoardSquares";

// The challenge palette and the pure logic behind the components, so a host can
// tint to match and a test can drive the rules without a DOM.
export {
  CHALLENGE_ACCENT,
  POS,
  NEG,
  NEU,
  SLATE,
  toneColor,
  toneOf,
} from "./challengeTokens";
export type { ChallengeTone } from "./challengeTokens";

export {
  rankRows,
  leaderFlags,
  displayedValue,
  compareReduce,
  comparePair,
  compareRowInert,
  comparePicked,
  COMPARE_IDLE,
  onwardFromBoard,
} from "./challengeLogic";
export type { Rankable, ComparePick, CompareState, CompareAction, OnwardStep } from "./challengeLogic";

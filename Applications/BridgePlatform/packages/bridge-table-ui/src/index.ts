// @bridge/table-ui — the play-table component family. The whole table
// (PlayTable) plus every props-driven leaf it composes, so both the live app
// and the component tester mount the SAME production components.

export { PlayTable } from "./PlayTable";
export type { PlayTableProps, PlayTableSeat, ResolvedAppearance } from "./PlayTable";

export { HandViewer } from "./HandViewer";
export type { HandViewerProps, TrickLine } from "./HandViewer";

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

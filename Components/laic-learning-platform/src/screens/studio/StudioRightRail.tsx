import type { StudioTool } from "../../learning/types";
import "./studio.css";

function ToolIcon({ kind }: { kind: StudioTool["kind"] }) {
  switch (kind) {
    case "cases":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M4 4h9l3 3h4v13H4z" />
        </svg>
      );
    case "cards":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <rect x="3" y="6" width="14" height="12" rx="2" />
          <path d="M8 3h13v13" />
        </svg>
      );
    case "vocab":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3z" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M12 3l2.2 5.6 6 .3-4.7 3.8 1.6 5.8L12 15.9 6.9 18.9l1.6-5.8L3.8 8.9l6-.3z" />
        </svg>
      );
  }
}

function shortName(name: string) {
  return name.split(" ")[0].slice(0, 7);
}

export type StudioRightRailProps = {
  tools: StudioTool[];
  activeToolId?: string | null;
  onSelect: (tool: StudioTool) => void;
  onAddTool: () => void;
};

export function StudioRightRail({ tools, activeToolId, onSelect, onAddTool }: StudioRightRailProps) {
  return (
    <nav className="studio-rail-r" aria-label="Studio tools">
      {tools.map((tool) => (
        <button
          key={tool.id}
          type="button"
          className={`studio-rr${tool.id === activeToolId ? " on" : ""}`}
          onClick={() => onSelect(tool)}
        >
          <ToolIcon kind={tool.kind} />
          {shortName(tool.name)}
        </button>
      ))}
      <button type="button" className="studio-rr addtool" onClick={onAddTool}>
        ＋<span>Tool</span>
      </button>
    </nav>
  );
}

import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { ContentPolicy, StudioTool } from "../../learning/types";
import { normalizeCardItem, normalizeVocabItem } from "../../learning/studio-vocab";
import { AgentAPI } from "../../lib/api";
import { TOOL_LABELS } from "./studioTheme";
import "./studio.css";

export type StudioToolDrawerProps = {
  open: boolean;
  tool: StudioTool | null;
  courseId?: string | null;
  policy: ContentPolicy;
  pageTitles: string[];
  highlightTerm?: string | null;
  onClose: () => void;
  onChange: (tool: StudioTool) => void;
  onDelete?: (toolId: string) => void;
};

type CaseToolItem = {
  name: string;
  tag: string;
  color: string;
  rows: [string, string][];
  lesson: string;
};

function normalizeCaseItem(item: unknown): CaseToolItem {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return {
      name: "New case",
      tag: "Topic",
      color: "#3fd0c0",
      rows: [["Observation", ""]],
      lesson: "",
    };
  }

  const value = item as Partial<CaseToolItem>;
  return {
    name: typeof value.name === "string" ? value.name : "New case",
    tag: typeof value.tag === "string" ? value.tag : "Topic",
    color: typeof value.color === "string" ? value.color : "#3fd0c0",
    rows: Array.isArray(value.rows)
      ? value.rows.map((row) =>
          Array.isArray(row)
            ? [typeof row[0] === "string" ? row[0] : "", typeof row[1] === "string" ? row[1] : ""]
            : ["", ""]
        )
      : [["Observation", ""]],
    lesson: typeof value.lesson === "string" ? value.lesson : "",
  };
}

function defaultItem(kind: StudioTool["kind"]): unknown {
  if (kind === "cases") return normalizeCaseItem(null);
  if (kind === "cards") return ["Front", "Back"] as [string, string];
  if (kind === "vocab") return ["Term", "Add definition", 1] as [string, string, number];
  return ["Label", "Value"] as [string, string];
}

export function StudioToolDrawer({
  open,
  tool,
  courseId,
  policy,
  pageTitles,
  highlightTerm,
  onClose,
  onChange,
  onDelete,
}: StudioToolDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (highlightTerm && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightTerm, tool?.items.length]);

  const updateItems = (items: unknown[]) => {
    if (!tool) return;
    onChange({ ...tool, items });
  };

  const generateMore = async () => {
    if (!tool || !courseId) {
      setError("Open a course before generating tool items.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await AgentAPI.studioGenerateToolItems({
        courseId,
        policy,
        kind: tool.kind,
        pageTitles,
        existing: tool.items,
      });
      let normalized = result.items;
      if (tool.kind === "cards") normalized = result.items.map(normalizeCardItem);
      if (tool.kind === "vocab") normalized = result.items.map((item, i) => normalizeVocabItem(item, i));
      onChange({ ...tool, items: [...tool.items, ...normalized] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate tool items.");
    } finally {
      setLoading(false);
    }
  };

  if (!open || !tool) return null;

  return (
    <aside className="studio-drawer show" aria-label="Tool drawer">
      <div className="studio-drawer-h">
        <h3>{TOOL_LABELS[tool.kind]}</h3>
        <button type="button" className="studio-drawer-x" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className="studio-drawer-b">
        <label className="studio-label">
          <span>Tool name</span>
          <input
            className="studio-ef"
            data-editable="true"
            value={tool.name}
            onChange={(event) => onChange({ ...tool, name: event.target.value })}
          />
        </label>

        {tool.kind === "vocab" ? (
          <>
            <p className="studio-drawer-note">
              Terms linked from <b>bold</b> words in lessons. Click a vocab word in a lesson to jump here.
            </p>
            {tool.items.map((item, itemIndex) => {
              const [term, def, rank] = normalizeVocabItem(item, itemIndex);
              const highlighted = highlightTerm && term.toLowerCase() === highlightTerm.toLowerCase();
              return (
                <div
                  key={`${term}-${itemIndex}`}
                  ref={highlighted ? highlightRef : undefined}
                  className={`studio-vocab-item${highlighted ? " highlight" : ""}`}
                >
                  <div className="studio-vocab-term">
                    <input
                      className="studio-ef blk"
                      value={term}
                      onChange={(event) => {
                        const items = [...tool.items];
                        items[itemIndex] = [event.target.value, def, rank];
                        updateItems(items);
                      }}
                    />
                  </div>
                  <div className="studio-vocab-def">
                    <textarea
                      className="studio-ef blk"
                      rows={2}
                      value={def}
                      onChange={(event) => {
                        const items = [...tool.items];
                        items[itemIndex] = [term, event.target.value, rank];
                        updateItems(items);
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    className="studio-rm"
                    onClick={() => updateItems(tool.items.filter((_, index) => index !== itemIndex))}
                    aria-label="Delete term"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </>
        ) : tool.kind === "cards" ? (
          tool.items.map((item, itemIndex) => {
            const [front, back] = normalizeCardItem(item);
            return (
              <div key={`card-${itemIndex}`} className="studio-card-item">
                <div className="studio-rowhead">
                  <strong>Card {itemIndex + 1}</strong>
                  <button
                    type="button"
                    className="studio-iconbtn"
                    onClick={() => updateItems(tool.items.filter((_, index) => index !== itemIndex))}
                    aria-label="Delete card"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <label className="studio-label">
                  <span>Front</span>
                  <textarea
                    className="studio-ef blk"
                    rows={2}
                    value={front}
                    onChange={(event) => {
                      const items = [...tool.items];
                      items[itemIndex] = [event.target.value, back];
                      updateItems(items);
                    }}
                  />
                </label>
                <label className="studio-label">
                  <span>Back</span>
                  <textarea
                    className="studio-ef blk"
                    rows={2}
                    value={back}
                    onChange={(event) => {
                      const items = [...tool.items];
                      items[itemIndex] = [front, event.target.value];
                      updateItems(items);
                    }}
                  />
                </label>
              </div>
            );
          })
        ) : tool.kind === "cases" ? (
          tool.items.map((item, itemIndex) => {
            const caseItem = normalizeCaseItem(item);
            return (
              <div key={`${caseItem.name}-${itemIndex}`} className="studio-toolitem">
                <div className="studio-rowhead">
                  <strong>Case {itemIndex + 1}</strong>
                  <button
                    type="button"
                    className="studio-iconbtn"
                    onClick={() => updateItems(tool.items.filter((_, index) => index !== itemIndex))}
                    aria-label="Delete tool item"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                <div className="studio-grid-2">
                  <label className="studio-label">
                    <span>Name</span>
                    <input
                      className="studio-ef"
                      data-editable="true"
                      value={caseItem.name}
                      onChange={(event) => {
                        const items = [...tool.items];
                        items[itemIndex] = { ...caseItem, name: event.target.value };
                        updateItems(items);
                      }}
                    />
                  </label>
                  <label className="studio-label">
                    <span>Tag</span>
                    <input
                      className="studio-ef"
                      data-editable="true"
                      value={caseItem.tag}
                      onChange={(event) => {
                        const items = [...tool.items];
                        items[itemIndex] = { ...caseItem, tag: event.target.value };
                        updateItems(items);
                      }}
                    />
                  </label>
                </div>

                <div className="studio-grid-2">
                  <label className="studio-label">
                    <span>Color</span>
                    <input
                      className="studio-ef"
                      data-editable="true"
                      value={caseItem.color}
                      onChange={(event) => {
                        const items = [...tool.items];
                        items[itemIndex] = { ...caseItem, color: event.target.value };
                        updateItems(items);
                      }}
                    />
                  </label>
                  <label className="studio-label">
                    <span>Takeaway</span>
                    <textarea
                      className="studio-ef"
                      data-editable="true"
                      rows={3}
                      value={caseItem.lesson}
                      onChange={(event) => {
                        const items = [...tool.items];
                        items[itemIndex] = { ...caseItem, lesson: event.target.value };
                        updateItems(items);
                      }}
                    />
                  </label>
                </div>

                {caseItem.rows.map(([left, right], rowIndex) => (
                  <div key={`${left}-${rowIndex}`} className="studio-row">
                    <div className="studio-rowhead">
                      <strong>Row {rowIndex + 1}</strong>
                      <button
                        type="button"
                        className="studio-iconbtn"
                        onClick={() => {
                          const items = [...tool.items];
                          const rows = caseItem.rows.filter((_, index) => index !== rowIndex);
                          items[itemIndex] = { ...caseItem, rows };
                          updateItems(items);
                        }}
                        aria-label="Delete case row"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <div className="studio-grid-2">
                      <input
                        className="studio-ef"
                        data-editable="true"
                        value={left}
                        onChange={(event) => {
                          const rows = [...caseItem.rows];
                          rows[rowIndex] = [event.target.value, right];
                          const items = [...tool.items];
                          items[itemIndex] = { ...caseItem, rows };
                          updateItems(items);
                        }}
                      />
                      <input
                        className="studio-ef"
                        data-editable="true"
                        value={right}
                        onChange={(event) => {
                          const rows = [...caseItem.rows];
                          rows[rowIndex] = [left, event.target.value];
                          const items = [...tool.items];
                          items[itemIndex] = { ...caseItem, rows };
                          updateItems(items);
                        }}
                      />
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  className="studio-btn"
                  data-variant="ghost"
                  onClick={() => {
                    const items = [...tool.items];
                    items[itemIndex] = { ...caseItem, rows: [...caseItem.rows, ["Observation", ""]] };
                    updateItems(items);
                  }}
                >
                  <Plus size={15} />
                  Add row
                </button>
              </div>
            );
          })
        ) : (
          tool.items.map((item, itemIndex) => {
            const tuple = Array.isArray(item) ? [...item] : [String(item ?? "")];
            return (
              <div key={`${tool.kind}-${itemIndex}`} className="studio-toolitem">
                <div className="studio-rowhead">
                  <strong>Item {itemIndex + 1}</strong>
                  <button
                    type="button"
                    className="studio-iconbtn"
                    onClick={() => updateItems(tool.items.filter((_, index) => index !== itemIndex))}
                    aria-label="Delete tool item"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="studio-grid">
                  {tuple.map((cell, cellIndex) => (
                    <label key={cellIndex} className="studio-label">
                      <span>Field {cellIndex + 1}</span>
                      <input
                        className="studio-ef"
                        data-editable="true"
                        value={typeof cell === "number" ? String(cell) : String(cell ?? "")}
                        onChange={(event) => {
                          const items = [...tool.items];
                          const nextTuple = [...tuple];
                          nextTuple[cellIndex] = event.target.value;
                          items[itemIndex] = nextTuple;
                          updateItems(items);
                        }}
                      />
                    </label>
                  ))}
                </div>
              </div>
            );
          })
        )}

        <div className="studio-inline" style={{ justifyContent: "space-between" }}>
          <button
            type="button"
            className="studio-btn"
            data-variant="ghost"
            onClick={() => updateItems([...(tool.items ?? []), defaultItem(tool.kind)])}
          >
            <Plus size={16} />
            Add item
          </button>

          <button type="button" className="studio-btn" data-variant="primary" onClick={() => void generateMore()} disabled={loading}>
            <RefreshCw size={16} />
            {loading ? "Generating…" : "Generate more"}
          </button>
        </div>

        {error ? <p className="studio-help" style={{ color: "#ffb6c6" }}>{error}</p> : null}

        {onDelete ? (
          <button type="button" className="studio-btn ghost" style={{ marginTop: 10, width: "100%" }} onClick={() => onDelete(tool.id)}>
            <Trash2 size={16} />
            Delete tool
          </button>
        ) : null}
      </div>
    </aside>
  );
}

import type { StudioCourseData, StudioTool } from "../../learning/types";
import { normalizeCardItem, normalizeVocabItem } from "../../learning/studio-vocab";
import { TOOL_LABELS } from "../studio/studioTheme";
import "../studio/studio.css";

type CaseItem = {
  name: string;
  tag: string;
  color: string;
  rows: [string, string][];
  lesson: string;
};

function normalizeCase(item: unknown): CaseItem {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return { name: "Case", tag: "Topic", color: "#3fd0c0", rows: [], lesson: "" };
  }
  const v = item as Partial<CaseItem>;
  return {
    name: typeof v.name === "string" ? v.name : "Case",
    tag: typeof v.tag === "string" ? v.tag : "Topic",
    color: typeof v.color === "string" ? v.color : "#3fd0c0",
    rows: Array.isArray(v.rows) ? (v.rows as [string, string][]) : [],
    lesson: typeof v.lesson === "string" ? v.lesson : "",
  };
}

export function StudentReadOnlyDrawer({
  open,
  tool,
  highlightTerm,
  onClose,
}: {
  open: boolean;
  tool: StudioTool | null;
  highlightTerm?: string | null;
  onClose: () => void;
}) {
  if (!open || !tool) return null;

  return (
    <>
      <div className="studio-scrim show" onClick={onClose} aria-hidden />
      <aside className="studio-drawer show" aria-label={TOOL_LABELS[tool.kind]}>
        <div className="studio-drawer-h">
          <h3>{TOOL_LABELS[tool.kind]}</h3>
          <button type="button" className="studio-drawer-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="studio-drawer-b">
          {tool.kind === "vocab" &&
            tool.items.map((item, i) => {
              const [term, def] = normalizeVocabItem(item, i);
              const highlighted = highlightTerm && term.toLowerCase() === highlightTerm.toLowerCase();
              return (
                <div key={`${term}-${i}`} className={`studio-vocab-item${highlighted ? " highlight" : ""}`}>
                  <div>
                    <div className="studio-vocab-term" style={{ fontWeight: 600 }}>
                      {term}
                    </div>
                    <div className="studio-vocab-def" style={{ color: "var(--soft)", fontSize: 13 }}>
                      {def}
                    </div>
                  </div>
                </div>
              );
            })}

          {tool.kind === "cards" &&
            tool.items.map((item, i) => {
              const [front, back] = normalizeCardItem(item);
              return (
                <div key={`card-${i}`} className="studio-card-item">
                  <strong>{front}</strong>
                  <p style={{ color: "var(--soft)", margin: "8px 0 0", fontSize: 14 }}>{back}</p>
                </div>
              );
            })}

          {tool.kind === "cases" &&
            tool.items.map((item, i) => {
              const c = normalizeCase(item);
              return (
                <div key={`${c.name}-${i}`} className="studio-toolitem" style={{ marginBottom: 14 }}>
                  <span style={{ color: c.color, fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase" }}>
                    {c.tag}
                  </span>
                  <h4 style={{ fontFamily: "var(--disp)", margin: "4px 0 10px" }}>{c.name}</h4>
                  <dl style={{ display: "grid", gridTemplateColumns: "78px 1fr", gap: "3px 12px", margin: 0 }}>
                    {c.rows.map(([k, v], ri) => (
                      <div key={ri} style={{ display: "contents" }}>
                        <dt style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", color: "var(--dim)" }}>{k}</dt>
                        <dd style={{ margin: "0 0 7px", fontSize: 14 }}>{v}</dd>
                      </div>
                    ))}
                  </dl>
                  {c.lesson ? <p style={{ fontSize: 13.5, color: "var(--soft)", borderTop: "1px solid var(--line)", paddingTop: 9, marginTop: 8 }}>{c.lesson}</p> : null}
                </div>
              );
            })}
        </div>
      </aside>
    </>
  );
}

export function collectAllQuestions(studio: StudioCourseData) {
  const out: {
    module: string;
    concept: string;
    kind: string;
    stem: string;
    opts: string[];
    ans: number;
    exp: string;
  }[] = [];

  for (const page of studio.pages) {
    for (const block of page.blocks) {
      if (block.type === "quiz") {
        for (const concept of block.concepts) {
          for (const q of concept.pool) {
            out.push({
              module: page.title,
              concept: concept.name,
              kind: "Mastery quiz",
              stem: q.stem,
              opts: q.opts,
              ans: q.ans,
              exp: q.exp,
            });
          }
        }
      }
      if (block.type === "check") {
        out.push({
          module: page.title,
          concept: block.concept,
          kind: "Inline check",
          stem: block.stem,
          opts: block.opts,
          ans: block.ans,
          exp: block.exp,
        });
      }
      if (block.type === "study" && block.check) {
        out.push({
          module: page.title,
          concept: block.check.concept,
          kind: "Lesson check",
          stem: block.check.stem,
          opts: block.check.opts,
          ans: block.check.ans,
          exp: block.check.exp,
        });
      }
    }
  }
  return out;
}

export function allFlashcards(studio: StudioCourseData) {
  const out: { q: string; a: string; src: string }[] = [];
  for (const [front, back] of studio.cards) {
    out.push({ q: front, a: back, src: "Core deck" });
  }
  for (const [term, def, pageIdx] of studio.vocab) {
    const src = studio.pages[pageIdx]?.title ?? "Vocabulary";
    out.push({ q: term, a: def, src });
  }
  return out;
}

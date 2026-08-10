import type { CSSProperties, ReactNode } from "react";

import { STATUS_LABEL, peopleLine } from "../copy";
import { BIRDBRIDGE_THEME, type AssignmentTheme } from "../theme";
import type { AssignmentView } from "../view";

/**
 * One assignment in a list: what it is, who is involved, and the way in.
 *
 * The header is a single link carrying the pencil, and it opens the editor by
 * URL FRAGMENT (`#edit-<key>`) so the tap costs no request. The learner rows
 * below are their own sibling links to threads — never nested inside the header's
 * link, which would make the whole card one target.
 *
 * `variant`:
 *   • "own"       — the caller created it; the header opens the editor.
 *   • "reviewing" — someone else's, the caller is a named reviewer: read-only,
 *                   no pencil, and only learners whose play they actually hold
 *                   are listed. The rest is a count, never a list of names,
 *                   because being a reviewer grants one play at a time and not a
 *                   view of another coach's roster.
 */
export function AssignmentCard({
  view,
  index,
  variant = "own",
  threadHref,
  theme = BIRDBRIDGE_THEME,
  footer,
}: Readonly<{
  view: AssignmentView;
  /** Position in the list — alternates the suit like a dealt row. */
  index: number;
  variant?: "own" | "reviewing";
  /** Where a learner's row goes, when the caller may open it. */
  threadHref?: (submissionId: string) => string;
  theme?: AssignmentTheme;
  footer?: ReactNode;
}>) {
  const t = theme;
  const suit = index % 2 === 0 ? t.maroon : t.green;
  const edge = index % 2 === 0 ? t.maroonEdge : t.greenEdge;
  const reviewing = variant === "reviewing";

  // Reviewing someone else's: only the learners whose plays are with me.
  const rows = reviewing
    ? view.learners.filter((l) => l.mine.length > 0)
    : view.learners;
  const waiting = reviewing ? view.learners.length - rows.length : 0;

  const header = (
    <>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", font: `500 17px ${t.display}`, color: "#ffffff" }}>
          {view.title}
        </span>
        <span style={{ display: "block", font: `400 12px ${t.body}`, color: SOFT, marginTop: 3 }}>
          {reviewing
            ? `from ${view.creatorName} · ${view.learners.length} learner${view.learners.length === 1 ? "" : "s"}`
            : peopleLine(view)}
        </span>
      </span>
      {!reviewing && (
        // Padding, not margin: the glyph carries a finger-sized target INSIDE
        // the link.
        <span
          aria-hidden
          style={{ font: `15px/1 ${t.body}`, color: "rgba(255,244,215,0.78)", padding: "2px 2px 8px 8px" }}
        >
          ✎
        </span>
      )}
    </>
  );

  return (
    <section
      id={`card-${view.key}`}
      style={{
        background: suit,
        borderRadius: 16,
        boxShadow: `0 3px 0 ${edge}`,
        padding: "15px 16px",
        // The anchor the sheet closes back to — offset so the card isn't jammed
        // under the host's header when the browser scrolls to it.
        scrollMarginTop: 60,
      }}
    >
      {reviewing ? (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>{header}</div>
      ) : (
        <a
          href={`#edit-${view.key}`}
          aria-label={`Edit ${view.title}`}
          style={{ display: "flex", alignItems: "flex-start", gap: 10, textDecoration: "none" }}
        >
          {header}
        </a>
      )}

      {view.note && (
        <p style={{ font: `400 12.5px/1.5 ${t.body}`, color: SOFT, margin: "6px 0 0" }}>
          “{view.note}”
        </p>
      )}

      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((l) => {
          const href = l.mine[0] && threadHref ? threadHref(l.mine[0].submissionId) : null;
          const body = (
            <>
              <span style={{ font: `600 13px ${t.body}`, color: "#ffffff", flex: 1, minWidth: 0 }}>
                {l.name}
              </span>
              {!reviewing && <span style={chip(t, l.status)}>{STATUS_LABEL[l.status]}</span>}
              {href && (
                <span aria-hidden style={{ color: SOFT, fontSize: 13 }}>
                  ›
                </span>
              )}
            </>
          );
          return href ? (
            <a key={l.assignmentId} href={href} style={{ ...row, textDecoration: "none" }}>
              {body}
            </a>
          ) : (
            <div key={l.assignmentId} style={row}>
              {body}
            </div>
          );
        })}
        {reviewing && rows.length === 0 && (
          <p style={{ font: `400 12.5px ${t.body}`, color: SOFT, margin: 0 }}>
            Nothing to review here yet — plays arrive when learners finish.
          </p>
        )}
        {reviewing && rows.length > 0 && waiting > 0 && (
          <p style={{ font: `400 12px ${t.body}`, color: SOFT, margin: "2px 0 0" }}>
            {waiting} learner{waiting === 1 ? " hasn't" : "s haven't"} played it yet.
          </p>
        )}
      </div>
      {footer}
    </section>
  );
}

const SOFT = "rgba(255,244,215,0.72)";

const row: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  borderRadius: 12,
  padding: "9px 12px",
  background: "rgba(0,0,0,0.22)",
};

/** Status chips sit INSIDE a dark suit card, so they wear cream: filled for a
 *  done state, outlined while things are pending. */
function chip(t: AssignmentTheme, status: keyof typeof STATUS_LABEL): CSSProperties {
  const done = status === "completed";
  return {
    font: `600 11px ${t.body}`,
    padding: "3px 10px",
    borderRadius: 999,
    background: done ? t.cream : "transparent",
    border: done ? "1px solid transparent" : "1px solid rgba(255,244,215,0.55)",
    color: done ? t.green : status === "started" ? t.cream : "rgba(255,244,215,0.85)",
    whiteSpace: "nowrap",
  };
}

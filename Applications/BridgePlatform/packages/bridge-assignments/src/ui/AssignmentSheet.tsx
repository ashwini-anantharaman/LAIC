import type { CSSProperties, ReactNode } from "react";

import {
  EMPTY_COPY,
  STATUS_LABEL,
  removeLearnerCopy,
  removeReviewerCopy,
  reviewerState,
} from "../copy";
import type { PlaySubmission } from "@bridge/sessions";

import type { AssignmentActions, AssignmentFlash, AssignmentLinks, PickablePerson } from "../ports";
import { BIRDBRIDGE_THEME, type AssignmentTheme } from "../theme";
import type { AssignmentView } from "../view";

/**
 * ONE assignment, edited in a sheet over the list.
 *
 * OPENING IS INSTANT AND OFFLINE: the host renders one of these per assignment,
 * hidden by CSS, and the pencil is a link to `#edit-<key>`. Tapping it only moves
 * the URL fragment — no request, no re-render (owner direction 2026-08-09: "I
 * want every click to be instant"). The confirmations work the same way, which
 * is why the panel stays open for them via `:has(:target)` — see SHEET_CSS.
 *
 * No client JavaScript anywhere. Only the mutations navigate, because they must.
 */
export function AssignmentSheet({
  view,
  actions,
  links,
  addableLearners,
  addableReviewers,
  flash,
  theme = BIRDBRIDGE_THEME,
  renderThread,
}: Readonly<{
  view: AssignmentView;
  actions: AssignmentActions;
  links: AssignmentLinks;
  addableLearners: PickablePerson[];
  addableReviewers: PickablePerson[];
  /** Present when a mutation just came back to THIS sheet: it carries the banner
   *  AND forces the sheet open, because a server action's redirect is a
   *  client-side navigation and browsers do not re-evaluate `:target` for one. */
  flash?: AssignmentFlash;
  theme?: AssignmentTheme;
  /** The host's own review-thread row, so a learner's feedback looks identical
   *  wherever it appears. Absent, threads simply aren't listed. */
  renderThread?: (submission: PlaySubmission) => ReactNode;
}>) {
  const t = theme;
  const serverOpen = flash !== undefined;
  const f = flash ?? {};
  const sheetId = `edit-${view.key}`;
  const openHref = `#${sheetId}`;
  // Closing a server-opened sheet must also drop the query that forced it open,
  // or it would immediately re-open. That costs one navigation, right after a
  // mutation that navigated anyway; every other close is a pure fragment change.
  const closeHref = serverOpen ? `${links.list}#card-${view.key}` : `#card-${view.key}`;
  const confirmId = (what: string) => `confirm-${view.key}-${what}`;
  const readOnly = !view.canEdit;

  const S = styles(t);

  return (
    <div id={sheetId} className={serverOpen ? "asgn-sheet asgn-open" : "asgn-sheet"}>
      {/* The scrim: a plain anchor, so tapping outside closes with no request. */}
      <a href={closeHref} aria-label="Close" className="asgn-scrim" />
      <section style={S.panel}>
        {/* Header pinned, body scrolls: Close stays reachable however long the
            learner list grows. */}
        <div style={{ flex: "none", padding: "14px 18px 10px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={S.eyebrow}>
                Assignment{view.contents[0] ? ` · ${view.contents[0].entryKind}` : ""}
              </p>
              <h2 style={{ font: `700 21px ${t.display}`, color: t.ink, margin: "5px 0 0" }}>
                {view.title}
              </h2>
              <p style={{ font: `400 12.5px ${t.body}`, color: "#5e5749", margin: "4px 0 0" }}>
                Created by {view.creatorIsViewer ? "you" : view.creatorName}
                {view.createdAt ? ` · ${view.createdAt.slice(0, 10)}` : ""}
                {readOnly ? " · you're a reviewer" : ""}
              </p>
            </div>
            <a href={closeHref} aria-label="Close" style={S.closeBtn}>
              ✕
            </a>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 18px 26px" }}>
          {f.saved && <p style={S.banner(t.green, t.cream)}>Saved.</p>}
          {f.added === "learner" && (
            <p style={S.banner(t.green, t.cream)}>Added — they can play it now.</p>
          )}
          {f.added === "reviewer" && (
            <p style={S.banner(t.green, t.cream)}>
              Added — they'll review each learner's play.
              {f.sent
                ? ` ${f.sent} finished game${f.sent === "1" ? "" : "s"} went to them straight away.`
                : ""}
            </p>
          )}
          {f.removed === "learner" && (
            <p style={S.banner(t.green, t.cream)}>Removed from this assignment.</p>
          )}
          {f.removed === "reviewer" && <p style={S.banner(t.green, t.cream)}>Reviewer removed.</p>}
          {f.error && <p style={S.banner(t.danger, "#ffffff")}>{f.error}</p>}

          {/* A legacy group has no brief and so cannot hold reviewers. Offer the
              one-tap adoption rather than controls that quietly do nothing. */}
          {view.canEdit && !view.brief && (
            <form action={actions.adopt} style={{ marginTop: 16 }}>
              <input type="hidden" name="key" value={view.key} />
              <p style={{ font: `400 12.5px/1.55 ${t.body}`, color: "#5e5749", margin: "0 0 10px" }}>
                {EMPTY_COPY.legacyPrompt}
              </p>
              <button type="submit" style={S.primaryBtn}>
                Enable reviewers
              </button>
            </form>
          )}

          <p style={S.sectionLabel}>Instruction</p>
          {readOnly || !view.brief ? (
            <p
              style={{
                font: `400 13px/1.55 ${t.body}`,
                color: view.note ? t.ink : t.muted,
                margin: 0,
              }}
            >
              {view.note ? `“${view.note}”` : EMPTY_COPY.noInstruction}
            </p>
          ) : (
            <form action={actions.saveNote}>
              <input type="hidden" name="key" value={view.key} />
              <textarea
                name="note"
                rows={2}
                defaultValue={view.note ?? ""}
                placeholder="Optional instruction — e.g. focus on your opening lead"
                style={S.textarea}
              />
              <button type="submit" style={{ ...S.primaryBtn, marginTop: 10 }}>
                Save note
              </button>
            </form>
          )}

          <p style={S.sectionLabel}>Learners · {view.learners.length}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {view.learners.length === 0 && <p style={S.empty}>{EMPTY_COPY.noLearners}</p>}
            {view.learners.map((l) => {
              const cid = confirmId(`learner-${l.assignmentId}`);
              return (
                <div key={l.assignmentId} style={S.card(t.green, t.greenEdge)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={S.rowName}>{l.name}</span>
                    <span style={S.chipOutline}>{STATUS_LABEL[l.status]}</span>
                    {view.canEdit && (
                      <a href={`#${cid}`} style={S.chipQuiet}>
                        Remove
                      </a>
                    )}
                  </div>
                  {renderThread && l.mine[0] ? renderThread(l.mine[0]) : null}
                  {view.canEdit && (
                    <div id={cid} className="asgn-confirm" style={S.confirmBox}>
                      <p style={S.confirmText}>{removeLearnerCopy(l)}</p>
                      <div style={S.confirmRow}>
                        <form action={actions.removeLearner} style={{ display: "inline" }}>
                          <input type="hidden" name="key" value={view.key} />
                          <input type="hidden" name="assignmentId" value={l.assignmentId} />
                          <button type="submit" style={S.dangerBtn}>
                            Yes, remove
                          </button>
                        </form>
                        <a href={openHref} style={S.chipOutline}>
                          Keep them
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {view.canEdit && view.brief && (
            <PickerFold
              label="+ Add a learner"
              theme={t}
              action={actions.addLearner}
              fieldName="learnerId"
              assignmentKey={view.key}
              people={addableLearners}
              suit={t.green}
              edge={t.greenEdge}
              empty={
                addableLearners.length === 0
                  ? EMPTY_COPY.rosterExhausted
                  : undefined
              }
            />
          )}

          <p style={S.sectionLabel}>Reviewers · {view.reviewers.length}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {view.reviewers.map((r) => {
              const cid = confirmId(`reviewer-${r.reviewerId}`);
              const canDrop = view.canEdit && !r.isCreator;
              return (
                <div key={r.reviewerId} style={S.card(t.maroon, t.maroonEdge)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={S.rowName}>{r.isViewer ? "you" : r.name}</span>
                    {r.isCreator ? (
                      <span style={S.chipCream(t.maroon)}>creator</span>
                    ) : (
                      <span style={S.chipOutline}>{reviewerState(r)}</span>
                    )}
                    {canDrop && (
                      <a href={`#${cid}`} style={S.chipQuiet}>
                        Remove
                      </a>
                    )}
                  </div>
                  {canDrop && (
                    <div id={cid} className="asgn-confirm" style={S.confirmBox}>
                      <p style={S.confirmText}>{removeReviewerCopy(r)}</p>
                      <div style={S.confirmRow}>
                        <form action={actions.removeReviewer} style={{ display: "inline" }}>
                          <input type="hidden" name="key" value={view.key} />
                          <input type="hidden" name="reviewerId" value={r.reviewerId} />
                          <button type="submit" style={S.dangerBtn}>
                            Yes, remove
                          </button>
                        </form>
                        <a href={openHref} style={S.chipOutline}>
                          Keep them
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {view.canEdit && view.brief && (
            <PickerFold
              label="+ Add a reviewer"
              theme={t}
              action={actions.addReviewer}
              fieldName="reviewerId"
              assignmentKey={view.key}
              people={addableReviewers}
              suit={t.maroon}
              edge={t.maroonEdge}
              empty={
                addableReviewers.length === 0 ? EMPTY_COPY.allCoachesReviewing : undefined
              }
            />
          )}

          {view.sourceEntryId && (
            <p style={{ marginTop: 22 }}>
              <a
                href={links.board(view.sourceEntryId)}
                style={{ font: `600 12.5px ${t.body}`, color: t.green }}
              >
                Open the board ›
              </a>
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

/**
 * A fold of people, each row its own one-tap form.
 *
 * Batch multi-select belongs to CREATION, where the picking IS the step and the
 * submit is the commit. On an edit, each add is an immediate singular act — and a
 * half-filled checkbox set would be silently destroyed by the next navigation.
 */
function PickerFold({
  label,
  theme,
  action,
  fieldName,
  assignmentKey,
  people,
  suit,
  edge,
  empty,
}: Readonly<{
  label: string;
  theme: AssignmentTheme;
  action: (formData: FormData) => void | Promise<void>;
  fieldName: string;
  assignmentKey: string;
  people: PickablePerson[];
  suit: string;
  edge: string;
  empty?: string;
}>) {
  const S = styles(theme);
  return (
    <details style={{ marginTop: 10 }}>
      <summary style={S.summaryPill}>
        {label} <span aria-hidden style={{ fontSize: 11 }}>▾</span>
      </summary>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 8 }}>
        {empty && <p style={S.empty}>{empty}</p>}
        {people.map((p) => (
          <form key={p.id} action={action} style={{ display: "flex" }}>
            <input type="hidden" name="key" value={assignmentKey} />
            <input type="hidden" name={fieldName} value={p.id} />
            <button type="submit" style={S.addRow(suit, edge)}>
              <span style={{ flex: 1, minWidth: 0 }}>{p.name}</span>
              {p.detail && <span style={S.detail}>{p.detail}</span>}
              <span style={S.chipCream(suit)}>Add</span>
            </button>
          </form>
        ))}
      </div>
    </details>
  );
}

/**
 * The stylesheet the fragment sheet needs — the host renders it once.
 *
 * `:has(:target)` keeps the panel open while a confirmation inside it is the
 * fragment target: only one element can be `:target` at a time, so without it
 * tapping Remove would close the sheet. A browser without `:has` closes it
 * instead — degraded, never broken.
 */
export const SHEET_CSS = `
.asgn-sheet { display: none; }
.asgn-sheet:target, .asgn-sheet:has(:target) { display: block; }
.asgn-sheet.asgn-open { display: block; }
body:has(:target) .asgn-sheet.asgn-open:not(:target):not(:has(:target)) { display: none; }
.asgn-scrim {
  position: fixed; inset: 0; z-index: 40; display: block;
  background: rgba(31,31,31,0.55);
}
.asgn-confirm { display: none; }
.asgn-confirm:target { display: block; }
`;

function styles(t: AssignmentTheme) {
  return {
    panel: {
      position: "fixed",
      left: 0,
      right: 0,
      bottom: 0,
      // Tall, not full: the strip of dimmed list above says "this is over your
      // assignments", not a new place.
      top: 26,
      zIndex: 41,
      background: t.cream,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      boxShadow: "0 -10px 30px rgba(31,31,31,0.35)",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    } as CSSProperties,
    eyebrow: {
      font: `600 10px ${t.body}`,
      letterSpacing: ".28em",
      textTransform: "uppercase",
      color: t.muted,
      margin: 0,
    } as CSSProperties,
    sectionLabel: {
      font: `600 10px ${t.body}`,
      letterSpacing: ".22em",
      textTransform: "uppercase",
      color: t.muted,
      margin: "24px 0 10px",
    } as CSSProperties,
    closeBtn: {
      flex: "none",
      width: 32,
      height: 32,
      borderRadius: 999,
      background: "#fff",
      border: "1px solid #d3ccbb",
      color: t.ink,
      font: `600 13px ${t.body}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      textDecoration: "none",
    } as CSSProperties,
    textarea: {
      width: "100%",
      font: `400 13.5px/1.5 ${t.body}`,
      border: "1px solid #d3ccbb",
      borderRadius: 12,
      padding: "11px 13px",
      background: "#fff",
      resize: "vertical",
    } as CSSProperties,
    empty: {
      border: "1px dashed #d3ccbb",
      borderRadius: 12,
      padding: 14,
      textAlign: "center",
      font: `400 12.5px ${t.body}`,
      color: t.muted,
    } as CSSProperties,
    rowName: {
      font: `600 14px ${t.body}`,
      color: "#ffffff",
      flex: 1,
      minWidth: 0,
    } as CSSProperties,
    detail: {
      font: `400 11.5px ${t.body}`,
      color: "rgba(255,244,215,0.72)",
      whiteSpace: "nowrap",
    } as CSSProperties,
    chipOutline: {
      font: `600 11px ${t.body}`,
      padding: "3px 10px",
      borderRadius: 999,
      border: "1px solid rgba(255,244,215,0.55)",
      color: "rgba(255,244,215,0.85)",
      whiteSpace: "nowrap",
      textDecoration: "none",
    } as CSSProperties,
    chipQuiet: {
      font: `500 11.5px ${t.body}`,
      padding: "3px 9px",
      borderRadius: 999,
      border: "1px solid rgba(255,244,215,0.34)",
      color: "rgba(255,244,215,0.78)",
      textDecoration: "none",
      whiteSpace: "nowrap",
    } as CSSProperties,
    summaryPill: {
      font: `600 12.5px ${t.body}`,
      color: t.ink,
      listStyle: "none",
      cursor: "pointer",
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "9px 16px",
      background: "#fff",
      border: "1px solid #d3ccbb",
      borderRadius: 999,
    } as CSSProperties,
    primaryBtn: {
      font: `600 12.5px ${t.body}`,
      background: t.green,
      color: "#fff",
      border: "none",
      borderRadius: 999,
      boxShadow: `0 2px 0 ${t.greenEdge}`,
      padding: "10px 20px",
      cursor: "pointer",
    } as CSSProperties,
    dangerBtn: {
      font: `600 12.5px ${t.body}`,
      padding: "9px 16px",
      borderRadius: 999,
      border: "none",
      cursor: "pointer",
      background: t.cream,
      color: t.danger,
    } as CSSProperties,
    confirmBox: {
      marginTop: 10,
      borderRadius: 12,
      padding: "12px 14px",
      background: "rgba(0,0,0,0.28)",
    } as CSSProperties,
    confirmText: {
      font: `500 12.5px/1.5 ${t.body}`,
      color: "#ffffff",
      margin: 0,
    } as CSSProperties,
    confirmRow: {
      display: "flex",
      gap: 8,
      marginTop: 10,
      flexWrap: "wrap",
    } as CSSProperties,
    banner: (bg: string, fg: string): CSSProperties => ({
      font: `500 13px ${t.body}`,
      background: bg,
      color: fg,
      borderRadius: 12,
      padding: "10px 14px",
      margin: "14px 0 0",
    }),
    card: (suit: string, edge: string): CSSProperties => ({
      background: suit,
      borderRadius: 14,
      boxShadow: `0 3px 0 ${edge}`,
      padding: "13px 14px",
    }),
    addRow: (suit: string, edge: string): CSSProperties => ({
      flex: 1,
      display: "flex",
      alignItems: "center",
      gap: 10,
      borderRadius: 12,
      padding: "12px 14px",
      border: "none",
      cursor: "pointer",
      background: suit,
      boxShadow: `0 3px 0 ${edge}`,
      color: "#ffffff",
      font: `600 13px ${t.body}`,
      textAlign: "left",
    }),
    chipCream: (fg: string): CSSProperties => ({
      font: `600 11px ${t.body}`,
      padding: "3px 10px",
      borderRadius: 999,
      background: t.cream,
      color: fg,
      whiteSpace: "nowrap",
    }),
  };
}

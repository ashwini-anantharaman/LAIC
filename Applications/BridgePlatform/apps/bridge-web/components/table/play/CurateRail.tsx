"use client";

// The coach's authoring rail (owner design 2026-08-15, curated deals;
// reworked same day — "too simplistic" — into the coach panel's own design
// language: paper cards on cream, maroon small-caps, the coach's badge).
//
// Rides the wide table's rail (railExtra) on the desktop, or fills the coach
// band (fill) inside the app. The coach PLAYS the board normally — their
// sitting's event log becomes the recorded line — and at each of their own
// decisions the rail offers the annotation fields: the "your coach says"
// note, the reason behind the move they are about to chart, and an optional
// custom hint ladder (one rung per line, 2–5 rungs).
//
// Annotations accumulate in component state for the sitting and can be
// REOPENED from the "your annotations" list (fields rebind to the picked
// decision). PUBLISH is one POST to the save-to-library route with the
// payload riding `curatedJson` — the server re-validates every position
// against the final line, so an undo that orphaned an annotation drops it
// rather than shipping a ghost.

import { useEffect, useState } from "react";

import { atKey, type CuratedAnnotation, type CuratedAt } from "@/lib/curated";

import { fetchHints } from "./coachPrefetch";

// The coach panel's palette (bridge-coach-app/constants/theme.ts lineage).
const PAPER = "#ffffff";
const CREAM = "#fff4d7";
const INK = "#1f1f1f";
const MUTED = "#7b7466";
const FAINT = "#a49d8e";
const MAROON = "#541015";
const GREEN = "#105431";
const LINE = "#e0d7c2";
const CARD_EDGE = "#e8ddc3";

interface Draft {
  label: string;
  note: string;
  why: string;
  hints: string;
}

/** What one draft amounts to, for the annotations list. */
function draftSummary(d: Draft): string | null {
  const rungs = d.hints.split("\n").filter((h) => h.trim()).length;
  const bits = [
    ...(d.note.trim() ? ["note"] : []),
    ...(d.why.trim() ? ["why"] : []),
    ...(rungs >= 2 ? [`${rungs}-rung ladder`] : []),
  ];
  return bits.length ? bits.join(" · ") : null;
}

const SECTION: React.CSSProperties = {
  background: PAPER, borderWidth: 1, borderStyle: "solid", borderColor: CARD_EDGE,
  borderRadius: 11, padding: "11px 12px",
};

const SMALLCAPS: React.CSSProperties = {
  fontSize: 9.5, fontWeight: 700, letterSpacing: 0.7,
  textTransform: "uppercase", color: FAINT,
};

const FIELD: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "7px 9px",
  borderWidth: 1, borderStyle: "solid", borderColor: LINE, borderRadius: 8,
  fontSize: 12.5, fontFamily: "inherit", color: INK, background: "#fffdf6",
  lineHeight: 1.45,
};

/** The coach's identity chip — same maroon "C" the learner's bubbles wear. */
function Badge({ size = 30 }: Readonly<{ size?: number }>) {
  return (
    <span
      aria-hidden
      style={{
        flex: "none", width: size, height: size, borderRadius: "50%",
        background: MAROON, display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "inset 0 0 0 2px rgba(255,244,215,.35)",
        color: CREAM, fontSize: size * 0.42, fontWeight: 700,
        fontFamily: "Georgia, 'Times New Roman', serif",
      }}
    >
      C
    </span>
  );
}

export function CurateRail({
  sessionId,
  at,
  atLabel,
  boardOver,
  boardName,
  fill = false,
}: Readonly<{
  sessionId: string;
  /** The coach's CURRENT decision address, when it is theirs to make. */
  at: CuratedAt | null;
  /** "Your call — bid #3", "Trick 4, card 2" — the address, spoken. */
  atLabel: string | null;
  boardOver: boolean;
  boardName: string;
  /** Fill the host's box (the app's coach band) instead of the 250px rail. */
  fill?: boolean;
}>) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  // Which decision the fields are bound to: the live one by default, or an
  // earlier annotation reopened from the list below.
  const [editKey, setEditKey] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // OWLEE AT THE COACH'S ELBOW (owner pick #2, 2026-08-15): the ladder Owlee
  // would generate for the decision in front of the coach, folded under the
  // custom-hints field — write against it, or start from it. Live decision
  // only: the server writes hints for the seat whose turn it IS.
  const [owleeOpen, setOwleeOpen] = useState(false);
  const [owlee, setOwlee] = useState<
    { kind: "idle" } | { kind: "loading" } | { kind: "ready"; hints: string[] } | { kind: "none" }
  >({ kind: "idle" });

  const liveKey = at ? atKey(at) : null;

  // Each new decision gets a fresh, folded Owlee — yesterday's ladder is for
  // yesterday's problem. (fetchHints keys its shared cache by this same key,
  // so reopening the fold at the same decision costs nothing.)
  useEffect(() => {
    setOwleeOpen(false);
    setOwlee({ kind: "idle" });
  }, [liveKey]);

  const askOwlee = () => {
    setOwleeOpen((v) => !v);
    if (owlee.kind !== "idle" || !liveKey) return;
    setOwlee({ kind: "loading" });
    fetchHints(sessionId, liveKey)
      .then((r) =>
        setOwlee(r.hints?.length ? { kind: "ready", hints: r.hints } : { kind: "none" }),
      )
      .catch(() => setOwlee({ kind: "none" }));
  };

  const boundKey = editKey ?? liveKey;
  const bound: Draft =
    (boundKey && drafts[boundKey]) ||
    ({ label: atLabel ?? "", note: "", why: "", hints: "" } as Draft);
  const boundLabel = editKey ? (drafts[editKey]?.label ?? "an earlier decision") : atLabel;

  const setBound = (patch: Partial<Draft>) => {
    if (!boundKey) return;
    const label = bound.label || atLabel || "";
    setDrafts((prev) => ({ ...prev, [boundKey]: { ...bound, label, ...patch } }));
  };

  // The coach's ladder as rungs, for the per-rung pickers below: a borrowed
  // Owlee rung APPENDS to whatever is already written (capped at 5), so the
  // coach can mix Owlee's wording with their own instead of taking the whole
  // ladder or nothing.
  const boundRungs = bound.hints.split("\n").map((h) => h.trim()).filter(Boolean);
  const addRung = (h: string) => {
    if (boundRungs.includes(h) || boundRungs.length >= 5) return;
    setBound({ hints: [...boundRungs, h].join("\n") });
  };

  const annotations = (): CuratedAnnotation[] =>
    Object.entries(drafts)
      .map(([k, d]) => {
        const parts = k.split(":");
        const where: CuratedAt =
          parts[0] === "call"
            ? { kind: "call", auctionIndex: Number(parts[1]) }
            : { kind: "play", trickIndex: Number(parts[1]), playIndex: Number(parts[2]) };
        const hints = d.hints.split("\n").map((h) => h.trim()).filter(Boolean).slice(0, 5);
        const note = d.note.trim();
        const why = d.why.trim();
        if (!note && !why && hints.length < 2) return null;
        return {
          at: where,
          ...(note ? { note } : {}),
          ...(why ? { why } : {}),
          ...(hints.length >= 2 ? { hints } : {}),
        };
      })
      .filter((a): a is CuratedAnnotation => a !== null);

  const savedEntries = Object.entries(drafts).filter(([, d]) => draftSummary(d));
  const saved = annotations().length;
  const rungCount = bound.hints.split("\n").filter((h) => h.trim()).length;

  async function publish() {
    if (publishing) return;
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch(`/api/bridge/sessions/${encodeURIComponent(sessionId)}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "play",
          name: title.trim() || `${boardName} · curated`,
          curatedJson: JSON.stringify({ annotations: annotations() }),
        }),
      });
      const body = (await res.json()) as { entryId?: string; error?: string };
      if (!res.ok || !body.entryId) throw new Error(body.error ?? "Couldn't publish");
      setPublished(body.entryId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't publish");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div
      style={{
        boxSizing: "border-box", padding: "12px 13px 16px",
        background: CREAM, fontSize: 12.5, color: INK,
        display: "flex", flexDirection: "column", gap: 10,
        ...(fill
          ? { width: "100%", height: "100%", overflowY: "auto" }
          : {
              width: 260,
              borderWidth: 1, borderStyle: "solid", borderColor: LINE, borderRadius: 11,
            }),
      }}
    >
      {/* ── identity: who is authoring, and how far along ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <Badge />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 15, fontWeight: 700, color: INK, lineHeight: 1.2 }}>
            Curating this board
          </span>
          <span style={{ fontSize: 10.5, color: MUTED }}>
            Play the line you want to teach
          </span>
        </span>
        {saved > 0 && !published && (
          <span
            style={{
              flex: "none", minHeight: 22, padding: "2px 9px", borderRadius: 11,
              background: GREEN, color: "#fff", fontSize: 10.5, fontWeight: 700,
              display: "flex", alignItems: "center",
            }}
          >
            {saved} noted
          </span>
        )}
      </div>

      {published ? (
        /* ── the finish line ── */
        <div style={{ ...SECTION, textAlign: "center", padding: "18px 14px" }}>
          <span
            aria-hidden
            style={{
              display: "inline-flex", width: 40, height: 40, borderRadius: "50%",
              background: GREEN, color: "#fff", fontSize: 20,
              alignItems: "center", justifyContent: "center",
            }}
          >
            ✓
          </span>
          <p style={{ margin: "9px 0 0", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 14.5, fontWeight: 700, color: INK }}>
            Published to your library
          </p>
          <p style={{ margin: "5px 0 0", fontSize: 12, lineHeight: 1.55, color: MUTED }}>
            Assign it from <b>Assignments</b> — the learner plays this exact
            board, with your voice beside Owlee's at every decision you noted.
          </p>
          <a
            href={`/m/curated/${encodeURIComponent(published)}`}
            style={{
              display: "inline-block", marginTop: 9,
              fontSize: 11.5, fontWeight: 700, color: GREEN,
              textDecoration: "underline", textUnderlineOffset: 3,
            }}
          >
            Edit your annotations
          </a>
        </div>
      ) : (
        <>
          {/* ── the decision being annotated ── */}
          {boundKey && (boundLabel || editKey) ? (
            <div style={SECTION}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                <span
                  style={{
                    flex: "none", padding: "3px 10px", borderRadius: 12,
                    background: MAROON, color: CREAM, fontSize: 11, fontWeight: 700,
                  }}
                >
                  {boundLabel || bound.label}
                </span>
                {editKey ? (
                  <button
                    type="button"
                    onClick={() => setEditKey(null)}
                    style={{
                      marginLeft: "auto", padding: 0, background: "transparent", borderWidth: 0,
                      fontSize: 10.5, fontWeight: 700, color: GREEN, fontFamily: "inherit",
                      cursor: "pointer",
                    }}
                  >
                    ← back to the live decision
                  </button>
                ) : (
                  <span style={{ marginLeft: "auto", fontSize: 10, color: FAINT }}>
                    saved as you type
                  </span>
                )}
              </div>

              <label style={{ ...SMALLCAPS, display: "block", color: MAROON }}>
                Your note to the learner
                <textarea
                  value={bound.note}
                  onChange={(e) => setBound({ note: e.target.value })}
                  rows={3}
                  maxLength={500}
                  placeholder="What should they be seeing here?"
                  style={{ ...FIELD, resize: "vertical", marginTop: 4, fontWeight: 400, letterSpacing: 0, textTransform: "none" }}
                />
              </label>

              <label style={{ ...SMALLCAPS, display: "block", color: MAROON, marginTop: 9 }}>
                Why your move is right
                <textarea
                  value={bound.why}
                  onChange={(e) => setBound({ why: e.target.value })}
                  rows={2}
                  maxLength={500}
                  placeholder="The move you play next becomes the charted road."
                  style={{ ...FIELD, resize: "vertical", marginTop: 4, fontWeight: 400, letterSpacing: 0, textTransform: "none" }}
                />
              </label>

              <label style={{ ...SMALLCAPS, display: "block", color: MAROON, marginTop: 9 }}>
                Custom hints — optional
                <textarea
                  value={bound.hints}
                  onChange={(e) => setBound({ hints: e.target.value })}
                  rows={3}
                  placeholder={"One rung per line, 2–5.\nThe last line names the answer."}
                  style={{ ...FIELD, resize: "vertical", marginTop: 4, fontWeight: 400, letterSpacing: 0, textTransform: "none" }}
                />
              </label>
              <p style={{ margin: "4px 0 0", fontSize: 10, color: rungCount === 1 ? "#9c5a12" : FAINT }}>
                {rungCount === 0
                  ? "Replaces Owlee's ladder for this decision."
                  : rungCount === 1
                    ? "One rung isn't a ladder yet — add at least one more."
                    : `${rungCount} rungs — the last one is "The answer".`}
              </p>

              {/* ── what Owlee would say here, for reference (live only) ── */}
              {!editKey && liveKey && (
                <div style={{ marginTop: 9, paddingTop: 8, borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "#f2e8d2" }}>
                  <button
                    type="button"
                    aria-expanded={owleeOpen}
                    onClick={askOwlee}
                    style={{
                      display: "flex", alignItems: "center", gap: 5, padding: 0,
                      background: "transparent", borderWidth: 0,
                      fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                      textTransform: "uppercase", color: GREEN,
                      fontFamily: "inherit", cursor: "pointer",
                    }}
                  >
                    Owlee would say…
                    <span aria-hidden style={{ fontSize: 7, transform: owleeOpen ? "rotate(180deg)" : undefined }}>▼</span>
                  </button>
                  {owleeOpen && (
                    <div style={{ marginTop: 8 }}>
                      {owlee.kind === "loading" && (
                        <p style={{ margin: 0, fontSize: 11, color: FAINT, fontStyle: "italic" }}>
                          Owlee is writing the ladder…
                        </p>
                      )}
                      {owlee.kind === "none" && (
                        <p style={{ margin: 0, fontSize: 11, color: FAINT, fontStyle: "italic" }}>
                          Owlee has no ladder for this decision.
                        </p>
                      )}
                      {owlee.kind === "ready" && (
                        <>
                          {/* Each rung is its own card with its own + — the
                              coach picks the rungs worth keeping, one at a
                              time (owner direction 2026-08-16: never
                              all-or-nothing), and edits them in the field
                              like their own words. */}
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {owlee.hints.map((h, i) => {
                              const taken = boundRungs.includes(h);
                              const full = !taken && boundRungs.length >= 5;
                              return (
                                <div
                                  key={i}
                                  style={{
                                    display: "flex", alignItems: "flex-start", gap: 8,
                                    padding: "7px 8px 8px",
                                    background: "#fbf5e3", borderRadius: 8,
                                    borderWidth: 1, borderStyle: "solid", borderColor: "#f0e6cd",
                                  }}
                                >
                                  <span style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ display: "block", fontSize: 8.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: i === owlee.hints.length - 1 ? MAROON : FAINT }}>
                                      {i === owlee.hints.length - 1 ? "The answer" : `Hint ${i + 1}`}
                                    </span>
                                    <span style={{ display: "block", marginTop: 2, fontSize: 11.5, lineHeight: 1.5, color: INK }}>
                                      {h}
                                    </span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => addRung(h)}
                                    disabled={taken || full}
                                    aria-label={taken ? "Already in your ladder" : `Add "${h}" to your ladder`}
                                    title={taken ? "Already in your ladder" : full ? "Your ladder is full (5 rungs)" : "Add to your ladder"}
                                    style={{
                                      flex: "none", width: 24, height: 24, borderRadius: "50%",
                                      display: "flex", alignItems: "center", justifyContent: "center",
                                      background: taken ? GREEN : "transparent",
                                      borderWidth: 1, borderStyle: "solid",
                                      borderColor: taken ? GREEN : full ? LINE : GREEN,
                                      color: taken ? "#fff" : full ? FAINT : GREEN,
                                      fontSize: taken ? 11 : 15, fontWeight: 700, lineHeight: 1,
                                      fontFamily: "inherit",
                                      cursor: taken || full ? "default" : "pointer",
                                    }}
                                  >
                                    {taken ? "✓" : "+"}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 7 }}>
                            {/* The whole ladder at once — only into an EMPTY
                                field, never over the coach's words. */}
                            {!bound.hints.trim() && (
                              <button
                                type="button"
                                onClick={() => setBound({ hints: owlee.hints.join("\n") })}
                                style={{
                                  padding: 0, background: "transparent", borderWidth: 0,
                                  fontSize: 10.5, fontWeight: 700, color: GREEN,
                                  fontFamily: "inherit", cursor: "pointer",
                                }}
                              >
                                Take all {owlee.hints.length} →
                              </button>
                            )}
                            <span style={{ fontSize: 10, color: FAINT }}>
                              + adds a rung to your ladder above — reword it there once it&rsquo;s yours.
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div style={{ ...SECTION, display: "flex", alignItems: "center", gap: 9 }}>
              <span aria-hidden style={{ fontSize: 16 }}>{boardOver ? "🏁" : "⏳"}</span>
              <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5, color: MUTED }}>
                {boardOver
                  ? "The board is done — name your curated deal below and publish it."
                  : "Waiting for your next decision — the robots are playing."}
              </p>
            </div>
          )}

          {/* ── everything annotated so far, reopenable ── */}
          {savedEntries.length > 0 && (
            <div style={SECTION}>
              <div style={{ ...SMALLCAPS, color: MAROON, marginBottom: 6 }}>Your annotations</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {savedEntries.map(([k, d]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setEditKey(k === liveKey ? null : k)}
                    style={{
                      display: "flex", alignItems: "baseline", gap: 7, width: "100%",
                      padding: "4px 2px", background: "transparent", borderWidth: 0,
                      borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "#f2e8d2",
                      fontFamily: "inherit", textAlign: "left", cursor: "pointer",
                    }}
                  >
                    <span style={{ flex: "none", fontSize: 11, fontWeight: 700, color: INK }}>
                      {d.label || k}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 10.5, color: FAINT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {draftSummary(d)}
                    </span>
                    <span style={{ flex: "none", fontSize: 10, fontWeight: 700, color: GREEN }}>
                      {boundKey === k && editKey ? "editing" : "edit"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── publish, once the board is played out ── */}
          {boardOver && (
            <div style={SECTION}>
              <label style={{ ...SMALLCAPS, display: "block", color: MAROON }}>
                Curated deal name
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={80}
                  placeholder={`${boardName} · curated`}
                  style={{ ...FIELD, marginTop: 4, fontWeight: 400, letterSpacing: 0, textTransform: "none" }}
                />
              </label>
              <button
                type="button"
                onClick={() => void publish()}
                disabled={publishing}
                style={{
                  marginTop: 9, width: "100%", minHeight: 38,
                  background: publishing ? "#9db3a5" : GREEN,
                  borderWidth: 0, borderRadius: 10, color: "#fff",
                  fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                  cursor: publishing ? "default" : "pointer",
                  boxShadow: "0 1px 3px rgba(0,0,0,.2)",
                }}
              >
                {publishing
                  ? "Publishing…"
                  : `Publish curated deal${saved ? ` · ${saved} annotation${saved === 1 ? "" : "s"}` : ""}`}
              </button>
              {saved === 0 && (
                <p style={{ margin: "6px 0 0", fontSize: 10.5, lineHeight: 1.5, color: "#9c5a12" }}>
                  No annotations yet — the learner would get the board and the
                  line, but none of your voice.
                </p>
              )}
              {error && (
                <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "#b91c1c" }}>{error}</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
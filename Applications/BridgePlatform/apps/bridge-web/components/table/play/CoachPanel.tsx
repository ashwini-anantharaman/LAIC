"use client";

// The coach at the table: an icon on the felt, and a sheet that rises when you
// tap it.
//
// Replaces CoachStrip, which was a fixed row under the player's hand. The strip
// had a real problem no amount of layout could fix — it competed with the cards
// for vertical space on a phone, so it was either too small to read or too big
// to allow. Two revisions in, the honest answer is that a coaching surface
// should cost NOTHING while you are playing and be allowed to be LARGE while you
// are reading it. That is an overlay, not a row:
//
//   at rest   a 52px icon over the felt. The hand, the bidding box and the
//             tray get every pixel back. The felt is whole again.
//   open      a sheet at 78% of the screen, over a scrim, with the table
//             still visible above it. More room than the strip could ever
//             have taken, and none of it borrowed.
//
// THE ONE NEW COLOUR IN THE APP IS DELIBERATE. Everything else here is
// PlayTable's palette — the tray's tan, a bidding-box button's pale head, the
// felt's hairline, the dealer tint for a correction. But the coach's own accent
// is a plum that appears nowhere else in the table, because an icon on green
// felt has to be findable and the app's existing coach teal is within a few
// degrees of the felt itself. One introduced hue, with a reason.
//
// PHONE ONLY (owner decision 2026-08-01). The desktop platform's table doesn't
// carry coaching; coaching is the app's surface. PlayTable renders this in its
// portrait layout and nowhere else.

import { useEffect, useState, type ReactNode } from "react";

// ── the table's own palette (PlayTable's constants) ──────────────────────────
const HEAD = "#f2f2ea";
const PAPER = "#fbfaf6"; // the auction box's cell white, reused as a card surface
const LINE = "#8a8a6a";
const INK = "#2b2b1e";
const MUTED = "#57573f";
const FAINT = "#7d7d66";
const TEAL = "#1f5e56"; // "your system" / agreement
const TINT = "#f2e2b8"; // PlayTable's DEALER_TINT — a correction's ground
const TINT_EDGE = "#a8871f";

// ── the coach's own identity, and the only hue introduced ────────────────────
const PLUM = "#8e3b5e";
const PLUM_2 = "#a8517a";
const PLUM_SOFT = "#f3e8ee";
const PLUM_LINE = "#e2cbd6";

const BADGE: Record<CoachNoteSource, { bg: string; label: string }> = {
  coach: { bg: PLUM, label: "Coach" },
  ben: { bg: "#384bb3", label: "BEN" },
  kb: { bg: "#6b4ea8", label: "Rulebook" },
  system: { bg: "#6f6f5a", label: "Table" },
};

export type CoachNoteSource = "coach" | "ben" | "kb" | "system";

/**
 * How much of the reader's attention this note deserves.
 *
 * Separate from `source`, which says who spoke. A board can produce two dozen
 * approvals and one correction — measured 34 to 6 across six real boards, with
 * one board at twenty-five approvals and nothing to fix. Giving them equal weight
 * makes the panel a scoreboard and hides the only line worth acting on.
 */
export type CoachNoteTone = "correction" | "affirmation" | "status";

export interface CoachNote {
  /** Who is speaking. Drives the badge, nothing else. */
  source: CoachNoteSource;
  /** How the sheet weighs it. Corrections are shown; approvals are counted. */
  tone?: CoachNoteTone;
  /** One line, always visible when this is the latest note. */
  headline: string;
  /** The reasoning. One line where possible. */
  detail?: string;
  /**
   * Questions the learner can ask, each with an answer the coach already holds.
   *
   * Every one is deterministic — the authored prose behind "Why?", the decider's
   * own trace behind "Why not my call?". Nothing here is generated, so nothing
   * here can contradict the verdict above it.
   */
  followUps?: readonly { q: string; a: string }[];
  /**
   * What it leaned on — a knowledge item, a source document, an anchor.
   *
   * CARRIED BUT NOT DRAWN at the table. On a real board these came out as a rule
   * title the prose above had already explained, and a slide number in a deck the
   * learner cannot open, credited in internal vocabulary. Provenance for whoever
   * authors or reviews the rulebook; noise to someone holding thirteen cards.
   */
  citations?: readonly { label: string; href?: string }[];
  /**
   * What it considered and turned down — a bid engine's `rejected[]`. Half of
   * "why this bid" is "why not that one", and for a learner that half is
   * usually the more useful one.
   */
  alternatives?: readonly { label: string; why: string }[];
  /** Which seat/trick this is about, for later filtering by hand or trick. */
  about?: { seat?: string; trick?: number };
  /**
   * A way to ask for more, on a note deliberately holding the answer back.
   * Withholding is switched off at the policy level (REVEAL_LEVEL is 1), so
   * nothing produces this today; the path stays for the socratic mode.
   */
  action?: { label: string; href: string };
  /** Host-supplied timestamp; rendered as given, never parsed. */
  at?: string;
  /** Stable id so a re-render doesn't reorder or re-animate notes. */
  id?: string;
}

/**
 * How present the coach should be — the learner's call, not the coach's.
 *
 * This is the control that resolves an argument the code has been having with
 * itself. Unprompted judging was measured at 34 approvals to 6 corrections, so
 * it was switched off; but "never volunteer" is also wrong for someone who wants
 * to be checked. Neither default is right for everybody, which is the signature
 * of a setting rather than a policy.
 */
export type CoachPresence = "silent" | "request" | "guided";

export const PRESENCE: Record<CoachPresence, { label: string; under: string; sub: string }> = {
  silent: { label: "Silent", under: "track only", sub: "Tracking quietly — won't interrupt" },
  request: { label: "On request", under: "when I ask", sub: "Watching this hand — ask any time" },
  guided: { label: "Guided", under: "check my play", sub: "Guided — I'll flag what's worth a look" },
};

export interface CoachPanelData {
  /** Sheet title. Defaults to "Coach". */
  title?: string;
  /** Newest last. */
  notes?: readonly CoachNote[];
  /** What to say before there is anything to say. */
  placeholder?: string;
  /** The coach is working on an answer. */
  busy?: boolean;
  /**
   * At-a-glance numbers for the sheet's context card ("13 HCP", "3=2=2=6").
   *
   * A PRESENTATIONAL SLOT ONLY: whatever it is handed, it draws. Nothing passes
   * it yet. Worth deciding on purpose before wiring — a permanent readout is
   * arithmetic the learner should arguably do themselves, so it wants gating on
   * level rather than being always on.
   */
  facts?: readonly { label: string; value: string }[];
  /** One line on what the coach is looking at, for the context card. */
  looking?: string;
  /** The coach's primary affordances — the buttons the learner pulls on. */
  prompts?: ReactNode;
  /** Secondary host controls. */
  actions?: ReactNode;
  /**
   * Open the sheet on first render. For `?coach=trace`, which exists to be read
   * — making someone tap an icon to reach the thing they asked for in the URL is
   * a tap that carries no decision.
   */
  defaultOpen?: boolean;
}

const KEYFRAMES = `@keyframes coachRise{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes coachFade{from{opacity:0}to{opacity:1}}
@keyframes coachRing{0%{box-shadow:0 0 0 0 rgba(190,138,30,.5)}70%{box-shadow:0 0 0 9px rgba(190,138,30,0)}100%{box-shadow:0 0 0 0 rgba(190,138,30,0)}}
@keyframes coachNote{from{transform:translateY(8px);opacity:.4}to{transform:translateY(0);opacity:1}}
@media (prefers-reduced-motion:reduce){.coach-anim{animation:none!important}}`;

/* ════════════════════════════════════════════════════════════════════════════
   THE ICON — lives on the felt, never over the cards
   ════════════════════════════════════════════════════════════════════════════ */

export function CoachFab({
  presence,
  onOpen,
  toReview = 0,
  busy = false,
}: Readonly<{
  presence: CoachPresence;
  onOpen: () => void;
  /** Corrections waiting — drives the count bubble. Guided mode only; see below. */
  toReview?: number;
  busy?: boolean;
}>) {
  const dot = busy ? TEAL : presence === "silent" ? "#9a9a86" : presence === "guided" ? TINT_EDGE : TEAL;
  // A count on the icon IS volunteering, so only Guided may show one. Enforced
  // here rather than left to the caller: "On request never volunteers" is the
  // promise the mode makes, and a promise a caller can forget to keep is not one.
  const count = presence === "guided" ? toReview : 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open the coach"
      style={{
        position: "absolute", right: 10, bottom: 10, zIndex: 6,
        width: 52, height: 52, borderRadius: "50%",
        background: `linear-gradient(145deg,${PLUM_2},${PLUM})`,
        borderWidth: 0, padding: 0, cursor: "pointer",
        boxShadow: "0 3px 10px rgba(40,10,25,.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        // Silent still shows — otherwise there is no way back to the setting.
        filter: presence === "silent" ? "saturate(.5) brightness(.92)" : undefined,
      }}
    >
      <style>{KEYFRAMES}</style>
      <span aria-hidden style={{ color: "#fff", fontSize: 21, lineHeight: 1, transform: "translateY(1px)" }}>♠</span>
      <span
        aria-hidden
        className={presence === "guided" ? "coach-anim" : undefined}
        style={{
          position: "absolute", right: -1, top: -1, width: 14, height: 14, borderRadius: "50%",
          background: dot, borderWidth: 2, borderStyle: "solid", borderColor: "#1c6b4f",
          animation: presence === "guided" ? "coachRing 2.2s infinite" : undefined,
        }}
      />
      {count > 0 && (
        <span
          style={{
            position: "absolute", left: -3, top: -3, minWidth: 18, height: 18, padding: "0 4px",
            borderRadius: 9, background: TINT_EDGE, color: "#fff",
            fontSize: 11, fontWeight: 700, lineHeight: "18px", textAlign: "center",
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   THE SHEET — rises over the table, which stays visible above it
   ════════════════════════════════════════════════════════════════════════════ */

export function CoachSheet({
  data,
  presence,
  onPresence,
  onClose,
}: Readonly<{
  data: CoachPanelData;
  presence: CoachPresence;
  onPresence: (p: CoachPresence) => void;
  onClose: () => void;
}>) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  // Escape closes it, like every other overlay at this table.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const notes = data.notes ?? [];
  const corrections = notes.filter((n) => (n.tone ?? "correction") === "correction").reverse();
  const approvals = notes.filter((n) => n.tone === "affirmation");
  const status = notes.filter((n) => n.tone === "status");
  // Silent means silent: the sheet still opens so the setting is reachable, but
  // it carries nothing the coach would have volunteered.
  const showNotes = presence === "guided";

  return (
    <>
      <style>{KEYFRAMES}</style>
      <button
        type="button"
        aria-label="Close the coach"
        onClick={onClose}
        className="coach-anim"
        style={{
          position: "absolute", inset: 0, zIndex: 8, borderWidth: 0, padding: 0,
          background: "rgba(8,26,18,.44)", cursor: "pointer", animation: "coachFade .2s ease",
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={data.title ?? "Coach"}
        className="coach-anim"
        style={{
          position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 9,
          height: "78%", background: HEAD, color: INK,
          borderTopLeftRadius: 18, borderTopRightRadius: 18,
          boxShadow: "0 -8px 26px rgba(0,0,0,.34)",
          display: "flex", flexDirection: "column", overflow: "hidden",
          animation: "coachRise .3s cubic-bezier(.22,1,.36,1)",
        }}
      >
        {/* grabber */}
        <div style={{ flex: "none", display: "flex", justifyContent: "center", padding: "8px 0 2px" }}>
          <span style={{ width: 36, height: 4, borderRadius: 2, background: "#d3cdb9" }} />
        </div>

        {/* ── who is talking, and how present they are ── */}
        <div
          style={{
            flex: "none", display: "flex", alignItems: "center", gap: 10,
            padding: "4px 14px 11px",
            borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "#e0dcc8",
          }}
        >
          <span
            aria-hidden
            style={{
              flex: "none", width: 38, height: 38, borderRadius: "50%",
              background: `linear-gradient(160deg,${PLUM_2},${PLUM})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: 17,
            }}
          >
            ♠
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 17, fontWeight: 700, lineHeight: 1.2 }}>
              {data.title ?? "Coach"}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: MUTED }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: data.busy ? TEAL : presence === "silent" ? FAINT : TEAL }} />
              {data.busy ? "Working it out…" : PRESENCE[presence].sub}
            </span>
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              flex: "none", width: 32, height: 32, borderRadius: 8, background: "#e8e4d4",
              borderWidth: 0, color: "#6f6858", fontSize: 16, lineHeight: 1, cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "13px 14px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* ── presence ── */}
          <div>
            <Label>How present should I be?</Label>
            <div style={{ display: "flex", background: "#e6e2d0", borderRadius: 10, padding: 3, gap: 3 }}>
              {(["silent", "request", "guided"] as CoachPresence[]).map((p) => {
                const on = p === presence;
                return (
                  <button
                    key={p}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => onPresence(p)}
                    style={{
                      flex: 1, minHeight: 42, borderWidth: 0, borderRadius: 8, cursor: "pointer",
                      background: on ? PAPER : "transparent", color: on ? PLUM : "#75705f",
                      fontSize: 12, fontWeight: 700, fontFamily: "inherit", lineHeight: 1.2,
                      boxShadow: on ? "0 1px 2px rgba(0,0,0,.12)" : undefined,
                    }}
                  >
                    {PRESENCE[p].label}
                    <span style={{ display: "block", fontSize: 9.5, fontWeight: 500, color: on ? PLUM_2 : "#9a9483", marginTop: 2 }}>
                      {PRESENCE[p].under}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── what it's looking at ── */}
          {(data.looking || !!data.facts?.length) && (
            <div style={{ background: PAPER, borderWidth: 1, borderStyle: "solid", borderColor: "#e4e0d0", borderRadius: 11, padding: "10px 12px" }}>
              <Label color={PLUM}>What I'm looking at</Label>
              {data.looking && <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.45 }}>{data.looking}</p>}
              {!!data.facts?.length && (
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: data.looking ? 9 : 0 }}>
                  {data.facts.map((f, i) => (
                    <span
                      key={f.label}
                      style={{
                        fontSize: 11.5, fontWeight: 700, padding: "4px 9px", borderRadius: 20,
                        background: i === 0 ? PLUM_SOFT : "#eeece0", color: i === 0 ? PLUM : "#5b5648",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {f.value}
                      <span style={{ fontWeight: 500, opacity: 0.75 }}> {f.label}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── the buttons ── */}
          {presence !== "silent" && data.prompts && (
            <div>
              <Label>Ask me</Label>
              {data.prompts}
            </div>
          )}

          {presence === "silent" && (
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: MUTED }}>
              I'm keeping out of the way. Nothing will interrupt you, and I won't offer anything
              unless you switch me to <b>On request</b>.
            </p>
          )}

          {/* ── what it flagged, in Guided ── */}
          {showNotes && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Label>{corrections.length ? "Worth a look" : "This board so far"}</Label>
              {corrections.length === 0 && approvals.length === 0 && status.length === 0 && (
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: MUTED }}>
                  {data.placeholder ?? "Nothing to flag yet."}
                </p>
              )}
              {corrections.map((note, i) => (
                <NoteBody
                  key={note.id ?? `c-${i}`}
                  note={note}
                  keyBase={note.id ?? `c-${i}`}
                  expanded={expanded}
                  setExpanded={setExpanded}
                  tinted={i === 0}
                />
              ))}
              {approvals.length > 0 && (
                <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45, color: MUTED }}>
                  <span style={{ color: TEAL, fontWeight: 700 }}>
                    {approvals.length} other {approvals.length === 1 ? "move" : "moves"} checked
                  </span>
                  {" — all as your system plays."}
                </p>
              )}
              {status.map((note, i) => (
                <p
                  key={note.id ?? `s-${i}`}
                  style={{
                    margin: 0, paddingTop: 8, fontSize: 11.5, lineHeight: 1.45, color: FAINT,
                    borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "#e0dcc8",
                  }}
                >
                  {statusLine(note)}
                </p>
              ))}
            </div>
          )}

          {data.actions && <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>{data.actions}</div>}
        </div>
      </div>
    </>
  );
}

function Label({ children, color = FAINT }: Readonly<{ children: ReactNode; color?: string }>) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", color, marginBottom: 7 }}>
      {children}
    </div>
  );
}

/**
 * A status note's one line, without saying the same thing twice.
 *
 * The composer writes the headline and then repeats it as the detail's first
 * sentence, so the panel printed the sentence twice. This is a DISPLAY GUARD,
 * not the fix — the note should not be composed that way, but that belongs to
 * the coaching pass.
 */
function statusLine(note: CoachNote): string {
  const head = note.headline.trim();
  const detail = note.detail?.trim();
  if (!detail) return head;
  const tail = detail.startsWith(head) ? detail.slice(head.length).trim() : detail;
  return tail ? `${head} ${tail}` : head;
}

/** One note's content — the sentence, its questions, and what it turned down. */
function NoteBody({
  note, expanded, setExpanded, keyBase, tinted = false,
}: Readonly<{
  note: CoachNote;
  expanded: ReadonlySet<string>;
  setExpanded: (fn: (prev: ReadonlySet<string>) => ReadonlySet<string>) => void;
  keyBase: string;
  /** The newest correction gets the dealer tint; older ones sit on the sheet. */
  tinted?: boolean;
}>) {
  // No badge when the coach is speaking — the sheet's header already says who
  // this is, so a row badge on every line was the same word twice over.
  const badge = note.source === "coach" ? null : BADGE[note.source];
  const correction = (note.tone ?? "correction") === "correction";

  return (
    <div className="coach-anim" style={{ display: "flex", flexDirection: "column", gap: 7, animation: tinted ? "coachNote .28s ease" : undefined }}>
      <div
        style={
          tinted && correction
            ? { background: TINT, borderRadius: 8, padding: "10px 12px", borderLeftWidth: 3, borderLeftStyle: "solid", borderLeftColor: TINT_EDGE }
            : { background: PAPER, borderRadius: 8, padding: "10px 12px", borderWidth: 1, borderStyle: "solid", borderColor: "#e4e0d0" }
        }
      >
        {badge && (
          <span
            style={{
              display: "inline-block", marginRight: 6, height: 16, padding: "0 5px",
              background: badge.bg, borderRadius: 3, color: "#fff",
              fontSize: 9.5, fontWeight: 700, lineHeight: "16px", verticalAlign: "middle",
            }}
          >
            {badge.label}
          </span>
        )}
        <span style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 15.5, lineHeight: 1.35, fontWeight: 700 }}>
          {note.headline}
        </span>
        {note.detail && (
          <p style={{ margin: "5px 0 0", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 14, lineHeight: 1.5, color: MUTED }}>
            {note.detail}
          </p>
        )}
      </div>

      {/* Ask the coach. One tap, an answer it already had. */}
      {!!note.followUps?.length && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {note.followUps.map((up) => {
              const id = `${keyBase}:${up.q}`;
              const isOpen = expanded.has(id);
              return (
                <button
                  key={id}
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    })
                  }
                  style={{
                    minHeight: 34, padding: "7px 13px",
                    background: isOpen ? PLUM : PAPER,
                    borderWidth: 1, borderStyle: "solid", borderColor: isOpen ? PLUM : PLUM_LINE,
                    borderRadius: 17, color: isOpen ? "#fff" : PLUM,
                    fontSize: 12.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
                  }}
                >
                  {up.q}
                </button>
              );
            })}
          </div>
          {note.followUps.map((up) => {
            const id = `${keyBase}:${up.q}`;
            if (!expanded.has(id)) return null;
            return (
              <p
                key={`${id}:a`}
                style={{
                  margin: 0, paddingLeft: 11, fontFamily: "Georgia, 'Times New Roman', serif",
                  fontSize: 14, lineHeight: 1.55, color: MUTED,
                  borderLeftWidth: 2, borderLeftStyle: "solid", borderLeftColor: PLUM_LINE,
                }}
              >
                {up.a}
              </p>
            );
          })}
        </div>
      )}

      {!!note.alternatives?.length && (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 3 }}>
          {note.alternatives.map((alt) => (
            <li key={alt.label} style={{ fontSize: 12.5, lineHeight: 1.45, color: MUTED }}>
              <span style={{ color: INK, fontWeight: 700 }}>not {alt.label}</span>
              {" — "}
              {alt.why}
            </li>
          ))}
        </ul>
      )}

      {note.action && (
        <a
          href={note.action.href}
          style={{
            alignSelf: "flex-start", minHeight: 34, padding: "7px 13px",
            background: PAPER, borderWidth: 1, borderStyle: "solid", borderColor: PLUM_LINE,
            borderRadius: 17, color: PLUM, fontSize: 12.5, fontWeight: 700,
            textDecoration: "none", display: "inline-flex", alignItems: "center",
          }}
        >
          {note.action.label}
        </a>
      )}
    </div>
  );
}

"use client";

// CoachStrip — the coaching surface at the table, below the player's hand.
//
// UI ONLY. Nothing here talks to the coach, to BEN or to a knowledge base: the
// host hands it notes and it draws them. That's deliberate — the contract below
// is the seam the coaching runtime plugs into, and fixing the seam first means
// the runtime can be wired without touching layout again.
//
// The shape it expects is one flat list of NOTES, newest last, each carrying
// its own source and its own tone.
//
// PHONE ONLY (owner decision 2026-08-01). The desktop platform's table doesn't
// show it — coaching is the app's surface — so PlayTable renders this in its
// portrait layout and nowhere else.
//
// ── HEIGHT CARRIES MEANING (2026-08-04) ────────────────────────────────────
// This used to be one 46px strip: a single ellipsised line behind a caret, with
// the real note hidden until you tapped. On a live auction that produced a panel
// whose entire visible content was "Watching — 2 calls so far, none of them
// yours yet" — a sentence narrating the auction grid two inches above it, set in
// the smallest type on the screen, with nothing tappable, at the exact moment
// the learner had to choose a bid.
//
// So the strip now sizes itself to what it has to say:
//
//   nothing to report   → header only, ~36px. Quieter than before.
//   status only         → header + one hairline-separated line, ~58px.
//   something to say    → the latest note IN FULL at rest, ~150px, no tap needed.
//   opened              → older notes too, capped and scrolling.
//
// The felt above is the layout's only flexible row (PlayTable), so every pixel
// this takes comes out of empty green — the bidding box, the hand and the tray
// are untouched. The auction grid needs about 60px and was sitting in 200.
//
// The palette is the table's own throughout: the tray's tan, a bidding-box
// button's pale head, the felt's hairline, the dealer tint for a correction.
// Legibility came from size and from putting sentences on the pale ground, not
// from introducing a surface that belongs to a different app.

import { useEffect, useRef, useState, type ReactNode } from "react";

// The table's own palette (PlayTable's constants): the bid tray's tan, the
// pale head of a bidding-box button, the auction box's hairline, and the
// dealer-tint used on the auction grid — which is already this app's amber.
const TAN = "#cccc9b";
const HEAD = "#f2f2ea";
const LINE = "#8a8a6a";
const INK = "#2b2b1e";
const MUTED = "#57573f";
const FAINT = "#7d7d66";
const TEAL = "#1f5e56"; // the coach's own accent, as used by its badge
const TINT = "#f2e2b8"; // PlayTable's DEALER_TINT — a correction's ground
const TINT_EDGE = "#a8871f";

const BADGE: Record<CoachNoteSource, { bg: string; label: string }> = {
  coach: { bg: TEAL, label: "Coach" },
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
  /** How the strip weighs it. Corrections are shown; approvals are counted. */
  tone?: CoachNoteTone;
  /** One line, always visible when this is the latest note. */
  headline: string;
  /** The reasoning, shown when the strip is open. One line where possible. */
  detail?: string;
  /**
   * Questions the learner can ask, each with an answer the coach already holds.
   *
   * Every one is deterministic — the authored prose behind "Why?", the decider's
   * own trace behind "Why not my call?". Nothing here is generated, so nothing
   * here can contradict the verdict above it.
   *
   * This replaced an unlabelled "more" toggle, which asked the learner to guess
   * what was behind it. A question states what tapping will get you.
   */
  followUps?: readonly { q: string; a: string }[];
  /**
   * What it leaned on — a knowledge item, a source document, an anchor.
   *
   * CARRIED BUT NOT DRAWN at the table. On a real board these came out as
   * "Fourth hand wins as cheaply as possible" (a title the prose above it has
   * already explained) and "Claude (Anthropic) — platform-authored judgments —
   * slide 76" (a page of a deck the learner has no access to, credited in
   * internal vocabulary). Useful to whoever authors or reviews the rulebook;
   * noise to someone holding thirteen cards. A review surface can render them
   * from the same note.
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
   * A way to ask for more — "Show me", on a note that is deliberately holding
   * the answer back. Withholding is currently switched off at the policy level
   * (REVEAL_LEVEL is 1), so nothing produces this today; the path stays for the
   * socratic mode, which will raise the rung and want it back.
   */
  action?: { label: string; href: string };
  /** Host-supplied timestamp; rendered as given, never parsed. */
  at?: string;
  /** Stable id so a re-render doesn't reorder or re-animate notes. */
  id?: string;
}

export interface CoachPanelData {
  /** Strip title. Defaults to "Coach". */
  title?: string;
  /** Newest last. Empty (or absent) shows `placeholder`. */
  notes?: readonly CoachNote[];
  /** What to say before there is anything to say. */
  placeholder?: string;
  /** The coach/BEN is working on an answer — shows a live hint in the header. */
  busy?: boolean;
  /**
   * At-a-glance numbers for the header — the arithmetic a learner is doing
   * badly in their head right now ("13 HCP", "3=2=2=6").
   *
   * A PRESENTATIONAL SLOT ONLY: the strip draws whatever it is handed and
   * computes nothing. Nothing passes it yet.
   *
   * Worth a deliberate decision before it is wired: a permanent readout is
   * arithmetic the learner arguably should be doing themselves, and having it
   * always on means they may never learn to. The natural answer is to gate it on
   * level — show it while they are new, retire it once they count reliably —
   * which makes it a teaching call rather than a layout one.
   */
  facts?: readonly { label: string; value: string }[];
  /** Host controls for the header, e.g. an "Explain that" button. */
  actions?: ReactNode;
  /** Open on first render. Defaults to closed. */
  defaultOpen?: boolean;
}

/** The one keyframe this needs, injected once — inline styles can't hold one. */
const ARRIVE_CSS = `@keyframes coachArrive{from{transform:translateY(10px);opacity:.35}to{transform:translateY(0);opacity:1}}
@media (prefers-reduced-motion:reduce){.coach-arrive{animation:none!important}}`;

/**
 * A status note's one line, without saying the same thing twice.
 *
 * The composer currently writes the headline and then repeats it as the first
 * sentence of the detail, so the panel printed the sentence twice — visible on
 * screen as "Watching — 2 calls so far, none of them yours yet." followed by
 * "Watching — 2 calls so far, none of them yours yet. Heard: N 1♠, E P."
 *
 * This is a DISPLAY GUARD, not the fix: the note should not be composed that way
 * in the first place. Dropping the duplicated prefix here keeps the panel honest
 * while the note itself is left for the coaching pass.
 */
function statusLine(note: CoachNote): string {
  const head = note.headline.trim();
  const detail = note.detail?.trim();
  if (!detail) return head;
  const tail = detail.startsWith(head) ? detail.slice(head.length).trim() : detail;
  return tail ? `${head} ${tail}` : head;
}

export function CoachStrip({
  data,
  compact = false,
}: Readonly<{
  data: CoachPanelData;
  /** Phone metrics: smaller type, taller open state (there's more room below). */
  compact?: boolean;
}>) {
  const [open, setOpen] = useState(Boolean(data.defaultOpen));
  // Which notes have had their remainder expanded. Per note, because opening one
  // long explanation should not unfold every other one on the board.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const notes = data.notes ?? [];

  // Three groups, because they want three different amounts of space.
  // Corrections newest-first: the one at the top is the one at rest.
  const corrections = notes.filter((n) => (n.tone ?? "correction") === "correction").reverse();
  const approvals = notes.filter((n) => n.tone === "affirmation");
  const status = notes.filter((n) => n.tone === "status");

  const lead = corrections[0];
  const older = corrections.slice(1);
  const hasMore = older.length > 0 || approvals.length > 0 || status.length > 0;

  // A note that ARRIVES should be noticed — this sits at the bottom of a screen
  // the learner is not looking at. Once, briefly, and never on the same note twice.
  const seen = useRef<string | undefined>(undefined);
  const [arriving, setArriving] = useState(false);
  const leadKey = lead ? (lead.id ?? lead.headline) : undefined;
  useEffect(() => {
    if (!leadKey || seen.current === leadKey) return;
    const first = seen.current === undefined;
    seen.current = leadKey;
    if (first) return; // don't animate whatever was already on screen at mount
    setArriving(true);
    const t = setTimeout(() => setArriving(false), 360);
    return () => clearTimeout(t);
  }, [leadKey]);

  const font = compact ? 15 : 16;      // the coach's voice, and the largest type here
  const sub = compact ? 13.5 : 14;
  const maxOpen = compact ? 240 : 200;
  // The top edge says what kind of panel this is before a word is read.
  const edge = lead ? (lead.tone === "correction" || !lead.tone ? TINT_EDGE : TEAL) : LINE;

  return (
    <div
      data-testid="coach-strip"
      style={{
        flex: "none", width: "100%", boxSizing: "border-box",
        background: TAN, borderTop: `2px solid ${edge}`, color: INK,
      }}
    >
      <style>{ARRIVE_CSS}</style>

      {/* ── header ──────────────────────────────────────────────────────────
          It no longer carries the message: the body does, at rest. So this is
          a label, the live-state dot, the at-a-glance facts, and the toggle. */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={open ? "Hide earlier coaching" : "Show earlier coaching"}
        disabled={!hasMore}
        style={{
          display: "flex", alignItems: "center", gap: 7, width: "100%",
          padding: compact ? "7px 9px" : "6px 10px", background: HEAD,
          // Longhands only. `borderBottom` is a shorthand for the same values
          // borderStyle/borderColor set, and it changes with `open` — React
          // warns because the two can disagree across a re-render.
          borderWidth: 0, borderBottomWidth: 1, borderStyle: "solid", borderColor: LINE,
          color: INK, textAlign: "left", cursor: hasMore ? "pointer" : "default",
          fontFamily: "inherit", boxSizing: "border-box",
        }}
      >
        <span
          aria-hidden
          style={{
            flex: "none", width: 7, height: 7, borderRadius: "50%",
            background: data.busy ? TEAL : lead ? edge : FAINT,
          }}
        />
        <span style={{ flex: "none", fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: MUTED }}>
          {data.title ?? "Coach"}
        </span>
        {data.busy && (
          <span style={{ flex: "none", fontSize: sub - 1, color: MUTED }}>Thinking…</span>
        )}

        {/* The numbers a learner needs while deciding. Tabular so they don't
            jitter as the hand shrinks. Nothing passes these yet. */}
        {!!data.facts?.length && (
          <span style={{ marginLeft: "auto", display: "flex", gap: 9, alignItems: "baseline" }}>
            {data.facts.map((f) => (
              <span key={f.label} style={{ display: "flex", gap: 3, alignItems: "baseline" }}>
                <span style={{ fontSize: 9, letterSpacing: 0.6, textTransform: "uppercase", color: FAINT }}>{f.label}</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: INK }}>{f.value}</span>
              </span>
            ))}
          </span>
        )}

        {/* A count of things to LOOK AT, not of notes. "25" told a learner
            nothing except that the panel was busy. */}
        {corrections.length > 1 && (
          <span
            style={{
              flex: "none", marginLeft: data.facts?.length ? 0 : "auto", padding: "1px 6px",
              borderRadius: 8, background: TEAL, color: "#fff", fontSize: 10, fontWeight: 700,
            }}
          >
            {corrections.length} to review
          </span>
        )}
        {hasMore && (
          <span style={{ flex: "none", marginLeft: corrections.length > 1 || data.facts?.length ? 0 : "auto", fontSize: 11, color: MUTED }}>
            {open ? "▾" : "▸"}
          </span>
        )}
      </button>

      {/* ── at rest: the latest note, in full, no tap required ───────────── */}
      {lead ? (
        <div
          className={arriving ? "coach-arrive" : undefined}
          style={{
            padding: compact ? "9px 9px 10px" : "9px 10px 10px",
            display: "flex", flexDirection: "column", gap: 7,
            animation: arriving ? "coachArrive .32s cubic-bezier(.2,.9,.3,1)" : undefined,
          }}
        >
          <NoteBody note={lead} font={font} sub={sub} expanded={expanded} setExpanded={setExpanded} keyBase="lead" tinted />
        </div>
      ) : (
        <p style={{ margin: 0, padding: compact ? "9px" : "9px 10px", fontSize: sub, lineHeight: 1.45, color: MUTED }}>
          {data.placeholder ?? "Your coach's notes will appear here as you play."}
        </p>
      )}

      {/* ── opened: everything earlier ──────────────────────────────────── */}
      {open && hasMore && (
        <div
          style={{
            maxHeight: maxOpen, overflowY: "auto",
            padding: compact ? "0 9px 9px" : "0 10px 9px",
            display: "flex", flexDirection: "column", gap: 8,
            borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: LINE,
            paddingTop: 8,
          }}
        >
          {older.map((note, i) => (
            <NoteBody
              key={note.id ?? `c-${i}`}
              note={note}
              font={font - 1}
              sub={sub - 0.5}
              expanded={expanded}
              setExpanded={setExpanded}
              keyBase={note.id ?? `c-${i}`}
            />
          ))}

          {/* APPROVALS — one line, not one line each. The reassurance that the
              coach was watching survives; the wall of identical praise does not. */}
          {approvals.length > 0 && (
            <p style={{ margin: 0, fontSize: sub - 0.5, lineHeight: 1.45, color: MUTED }}>
              <span style={{ color: TEAL, fontWeight: 700 }}>
                {approvals.length} other {approvals.length === 1 ? "move" : "moves"} checked
              </span>
              {" — all as your system plays."}
            </p>
          )}

          {/* WHAT IT HEARD — last and quietest. Proof of life, not coaching. */}
          {status.map((note, i) => (
            <p
              key={note.id ?? `s-${i}`}
              style={{
                margin: 0, paddingTop: 6, fontSize: sub - 1.5, lineHeight: 1.45, color: FAINT,
                borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: LINE,
              }}
            >
              {statusLine(note)}
            </p>
          ))}

          {data.actions && <div style={{ display: "flex", gap: 6, paddingTop: 2 }}>{data.actions}</div>}
        </div>
      )}

      {/* With nothing to open, the header's controls have nowhere to live, so
          host actions sit under the resting note instead of disappearing. */}
      {!open && data.actions && (
        <div style={{ display: "flex", gap: 6, padding: compact ? "0 9px 9px" : "0 10px 9px" }}>{data.actions}</div>
      )}

      {/* Status with nothing above it: one quiet line rather than a whole panel.
          This is the auction case that started the redesign — the coach saying
          it is listening should cost a line, not a screen. */}
      {!lead && !open && status.length > 0 && (
        <p
          style={{
            margin: 0, padding: compact ? "6px 9px 8px" : "6px 10px 8px",
            fontSize: sub - 1.5, lineHeight: 1.45, color: FAINT,
            borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: LINE,
          }}
        >
          {statusLine(status[status.length - 1]!)}
        </p>
      )}
    </div>
  );
}

/** One note's content — the sentence, its questions, and what it turned down. */
function NoteBody({
  note, font, sub, expanded, setExpanded, keyBase, tinted = false,
}: Readonly<{
  note: CoachNote;
  font: number;
  sub: number;
  expanded: ReadonlySet<string>;
  setExpanded: (fn: (prev: ReadonlySet<string>) => ReadonlySet<string>) => void;
  keyBase: string;
  /** The resting note gets the dealer tint; older ones sit on the tray. */
  tinted?: boolean;
}>) {
  // No badge when the coach is speaking — the strip's own header already says
  // COACH, so a row badge on every line was the same word twice, twenty-five
  // times over. Other voices still get one.
  const badge = note.source === "coach" ? null : BADGE[note.source];
  const correction = (note.tone ?? "correction") === "correction";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        style={
          tinted && correction
            ? {
                background: TINT, borderRadius: 4, padding: "8px 10px",
                borderLeftWidth: 3, borderLeftStyle: "solid", borderLeftColor: TINT_EDGE,
              }
            : undefined
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
        <span style={{ fontSize: font, lineHeight: 1.35, fontWeight: 600 }}>{note.headline}</span>
        {note.detail && (
          <p style={{ margin: "4px 0 0", fontSize: sub, lineHeight: 1.45, color: MUTED }}>{note.detail}</p>
        )}
      </div>

      {/* Ask the coach. One tap, an answer it already had — and a target a
          thumb can hit, which a 1px-padded pill was not. */}
      {!!note.followUps?.length && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
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
                    minHeight: 32, padding: "6px 12px", background: isOpen ? TEAL : HEAD,
                    borderWidth: 1, borderStyle: "solid", borderColor: isOpen ? TEAL : LINE,
                    borderRadius: 16, color: isOpen ? "#fff" : TEAL,
                    fontSize: sub - 0.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
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
                  margin: 0, paddingLeft: 10, fontSize: sub, lineHeight: 1.5, color: MUTED,
                  borderLeftWidth: 2, borderLeftStyle: "solid", borderLeftColor: LINE,
                }}
              >
                {up.a}
              </p>
            );
          })}
        </div>
      )}

      {!!note.alternatives?.length && (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 2 }}>
          {note.alternatives.map((alt) => (
            <li key={alt.label} style={{ fontSize: sub - 1, lineHeight: 1.4, color: MUTED }}>
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
            alignSelf: "flex-start", minHeight: 32, padding: "6px 12px",
            background: HEAD, border: `1px solid ${LINE}`, borderRadius: 16,
            color: TEAL, fontSize: sub - 0.5, fontWeight: 700, textDecoration: "none",
            display: "inline-flex", alignItems: "center",
          }}
        >
          {note.action.label}
        </a>
      )}
    </div>
  );
}

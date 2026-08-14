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
// THE COACH WEARS THE TABLE'S OWN COLOURS (2026-08-05, replacing the plum).
// The plum accent existed for one reason — an icon on green felt has to be
// findable, and the app's coach teal is within a few degrees of the felt. But
// the table already owns a colour whose entire job is "look here": the
// dealer's gold. So the icon is now a gold chip with a spade on it, the
// sheet's header is the felt itself, and everything inside is PlayTable's
// palette — the bidding box's paper, the dealer tint for a correction, the
// felt's greens for the coach's own voice. No introduced hues.
//
// THE CHIP IS THE MODE SWITCH (2026-08-05, replacing the gear's panel). The
// silent / on-request / guided control went from a sheet row to a panel behind
// the header's gear to, now, the chip itself: tapping it cycles the mode, the
// chip's glyph says which one you're in (☾ asleep, ? ask me, ! I'll flag
// things), and a short-lived pill names the change since the panel is closed
// when you tap. The gear stays in the header as a placeholder — settings will
// grow back into it — but it does nothing for now. Opening the sheet moved to
// a small ♠ button riding above the chip.
//
// PHONE ONLY (owner decision 2026-08-01). The desktop platform's table doesn't
// carry coaching; coaching is the app's surface. PlayTable renders this in its
// portrait layout and nowhere else.

import { useEffect, useRef, useState, type ReactNode } from "react";

import type { BoardTakeaway } from "@/lib/coach/takeaway";
import type { KnownCard, ThinkAid } from "@/lib/coach/think";

import { CoachChat, CoachEventAsk } from "./CoachEventAsk";
import { BenWhatIf, CoachHints, CoachTell } from "./CoachHintsTell";
import { CoachTakeaway } from "./CoachTakeaway";
import { useCoachPrefetch } from "./coachPrefetch";

// ── the BirdBridge palette (owner direction 2026-08-06: the coach wears the
// app's brand — bridge-coach-app/constants/theme.ts is the source of truth).
// The felt/gold identity is retired: maroon takes the headings and the
// header band, forest green takes the actions, cream takes the surfaces,
// and the coach's chip glows the home screen's sunset orange. The constant
// NAMES keep their old felt vocabulary so every usage below maps 1:1. ──────
const HEAD = "#fff4d7"; // Brand.cream — the app's page background
const PAPER = "#ffffff"; // cards on cream, as the app's cardBackground
const INK = "#1f1f1f"; // Brand.ink
const MUTED = "#7b7466"; // body-muted, as the /m pages already use on cream
const FAINT = "#a49d8e"; // uppercase labels, same source
const TEAL = "#105431"; // Brand.green — "your system" / agreement
const TINT = "#f2e2b8"; // a correction's warm ground — already at home on cream
const TINT_EDGE = "#a8871f";

const FELT_DEEP = "#541015"; // Brand.maroon — headings, labels, the header band
const FELT_MID = "#105431"; // Brand.green — buttons, pills, active states
const FELT_HI = "#7a1c23"; // the maroon band's lit corner
const FELT_SOFT = "#f6ead0"; // cream tint on a white card
const FELT_LINE = "#e0d7c2"; // hairlines on cream
const GOLD = "#f5a95b"; // the home screen's sunset orange
const GOLD_DEEP = "#c96f33";
const CHIP = `radial-gradient(circle at 34% 28%,${GOLD},#e8853f 55%,${GOLD_DEEP} 100%)`;
const RED = "#cc0000"; // suit red — unchanged, ♥/♦ read the same everywhere
/** The stacked-edge shadow behind the app's playing cards (Brand.cardShadow). */
const CARD_EDGE = "0 2px 0 rgba(42,5,6,.75)";

/**
 * OWLEE's face (owner direction 2026-08-14: the coach is named Owlee and
 * wears the owl, not a ♠ chip) — the mascot art cropped to a round badge,
 * zoomed to the owl's head. Decorative; the name beside it does the naming.
 */
function OwleeFace({ size }: Readonly<{ size: number }>) {
  return (
    <span
      aria-hidden
      style={{
        flex: "none", width: size, height: size, borderRadius: "50%",
        overflow: "hidden", position: "relative", display: "block",
        background: GOLD, // paints while the image streams in
        boxShadow: "inset 0 0 0 1px rgba(42,5,6,.25)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/coach/owlee.png"
        alt=""
        style={{ position: "absolute", width: "200%", height: "200%", left: "-54%", top: "-10%", objectFit: "cover" }}
      />
    </span>
  );
}

/**
 * The big "Ask me" button row, switched off (owner decision 2026-08-05) while
 * those actions move into the context card's event rows. A flag rather than a
 * deletion: the buttons and everything behind them still work, and come back
 * by flipping this.
 */
const SHOW_PROMPT_BUTTONS = false as boolean;

/**
 * The "Ask" pill on the learner's own rows in the PLAY screen, switched off
 * (owner decision 2026-08-06) — the rows read as a clean ledger for now. Same
 * discipline as the flag above: everything behind it stays wired, and the
 * pills come back by flipping this.
 */
const SHOW_PLAY_ASK = false as boolean;

const BADGE: Record<CoachNoteSource, { bg: string; label: string }> = {
  coach: { bg: FELT_MID, label: "Owlee" },
  ben: { bg: "#384bb3", label: "BEN" },
  kb: { bg: "#0d707c", label: "Rulebook" }, // PlayTable's CARD_BACK
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

/**
 * One table event as an interactive row in the context card — a call in the
 * auction ("West — Pass") or a card in the current trick ("West led the A♠").
 *
 * A row with a `detail` expands to show it: for a call, what it meant when it
 * was made (the same replayed KB meaning the bidding grid shows on tap). Rows
 * without one render flat for now — the per-event ask actions ("Help me
 * think" / "What should I play?" in miniature) land here next, once the
 * answer block they embed settles.
 */
export interface CoachLookingEvent {
  /** Stable key, so re-renders keep the same row open. */
  id: string;
  /** The event as one sentence — the accessible name, and the fallback when
   *  the structured parts below weren't provided. */
  label: string;
  /** What it means, shown when the row is expanded. */
  detail?: string;
  /** A call in the auction, or a card in a trick. */
  kind: "call" | "play";
  /** Seat letter for the row's badge — N/E/S/W. */
  seat?: string;
  /** The actor, from the learner's side — "You", "Partner", "East". */
  who?: string;
  /** What they did — "led", "played", "bid", "passed". */
  verb?: string;
  /** The card or call itself — "A♠", "1♦" — drawn as a small card face. */
  token?: string;
  /**
   * The takeaway's judgment of this call, once the board is over — a small
   * corner mark on the bidding diagram's token. Only the learner's own calls
   * ever carry one, and only where the system had an agreement.
   */
  verdict?: "correct" | "acceptable" | "incorrect";
  /** For a call: its index into the auction — `ben-tell?at=` addressing. */
  auctionIndex?: number;
  /** For a play: trick number and position — `ben-tell?play=` addressing. */
  trickIndex?: number;
  playIndex?: number;
  /**
   * The decision was the learner's to make — their own card, or dummy's
   * while they declared. Gates the "what if" affordance; the server enforces
   * the same rule, this only keeps dead buttons off the rows.
   */
  mine?: boolean;
}

/** One section of the board's history — the auction, or one trick. */
export interface CoachEventGroup {
  /** Stable key — "auction", "trick-0" … */
  id: string;
  /** "The auction", "Trick 3", "This trick". */
  title: string;
  /** A completed trick's outcome — "won by partner". */
  note?: string;
  /** The section the board is in right now — open unless the learner closed it. */
  current?: boolean;
  events: readonly CoachLookingEvent[];
}

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
  facts?: readonly { label: string; value: string; detail?: string }[];
  /** One line on what the coach is looking at, for the context card. */
  looking?: string;
  /**
   * The whole board so far, in sections — the auction, then every trick. The
   * panel keeps past sections collapsed and opens the `current` one, so the
   * history accumulates without walling the card. Lives on the HISTORY view.
   */
  eventGroups?: readonly CoachEventGroup[];
  /**
   * The reasoning scaffold — what can be worked out, and the realistic
   * choices. Deterministic and server-computed (lib/coach/think.ts); the
   * NOW view shows it without being asked, which is that view's whole job.
   */
  aid?: ThinkAid;
  /**
   * Context for interaction — present means calls in the auction diagram and
   * the learner's OWN plays grow an "Ask" question box, and, during the play
   * while it is the learner's decision, the card shows a standalone "What
   * should I play?" for the choice still ahead of them. Absent for watchers:
   * no seat, nothing to ask from.
   */
  ask?: { sessionId: string; active: boolean; phase: "auction" | "play" | "other" };
  /**
   * The end-of-board takeaway — present exactly when the board is over AND
   * the system judged at least one of the learner's calls. Its presence is
   * what flips the NOW screen from forward-facing to the review card.
   */
  takeaway?: BoardTakeaway;
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
@keyframes coachRing{0%{box-shadow:0 0 0 0 rgba(204,0,0,.45)}70%{box-shadow:0 0 0 9px rgba(204,0,0,0)}100%{box-shadow:0 0 0 0 rgba(204,0,0,0)}}
@keyframes coachNote{from{transform:translateY(8px);opacity:.4}to{transform:translateY(0);opacity:1}}
@media (prefers-reduced-motion:reduce){.coach-anim{animation:none!important}}`;

/* ════════════════════════════════════════════════════════════════════════════
   THE ICON — lives on the felt, never over the cards
   ════════════════════════════════════════════════════════════════════════════ */

/** Tap → the next mode, round the circle: silent → request → guided → silent. */
const NEXT_PRESENCE: Record<CoachPresence, CoachPresence> = {
  silent: "request",
  request: "guided",
  guided: "silent",
};

/**
 * Each mode wears its own glyph on the chip, because the chip IS the mode
 * control now and a control has to show its state: ☾ asleep, ? ask me,
 * ! I'll flag things. Text glyphs, not emoji — colour and size stay ours.
 */
const MODE_GLYPH: Record<CoachPresence, { glyph: string; size: number }> = {
  silent: { glyph: "☾", size: 21 },
  request: { glyph: "?", size: 24 },
  guided: { glyph: "!", size: 24 },
};

/** Where the learner has dragged the coach to, as a translate off its home corner. */
export interface CoachFabPos {
  x: number;
  y: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function CoachFab({
  presence,
  onOpen,
  onPresence,
  pos: posProp,
  onPos: onPosProp,
  toReview = 0,
  busy = false,
}: Readonly<{
  presence: CoachPresence;
  /** Opens the sheet — the small ♠ button, now that the chip switches modes. */
  onOpen: () => void;
  /** A tap on the chip moves to the next mode; this reports the new one. */
  onPresence: (p: CoachPresence) => void;
  /**
   * Where the learner dragged it, held by the HOST: this component unmounts
   * while the sheet is open, and a coach that snaps home every time you ask it
   * something wasn't moved, it was misplaced. Omit both and it still drags,
   * just without that persistence.
   */
  pos?: CoachFabPos;
  onPos?: (p: CoachFabPos) => void;
  /** Corrections waiting — drives the count bubble. Guided mode only; see below. */
  toReview?: number;
  busy?: boolean;
}>) {
  // A tap changes the mode while the panel is closed, so the panel can't be
  // the feedback. A pill beside the chip names the mode just chosen, then
  // leaves; the glyph carries the state after that.
  const [announced, setAnnounced] = useState<CoachPresence | null>(null);
  useEffect(() => {
    if (!announced) return;
    const t = setTimeout(() => setAnnounced(null), 1800);
    return () => clearTimeout(t);
  }, [announced]);

  // ── draggable, within the felt ──────────────────────────────────────────
  // The icons sit over the playing surface, and where they don't cover a card
  // is the learner's call, not this file's. Plain pointer math rather than a
  // library: one moving box, clamped to its positioned parent.
  const [internalPos, setInternalPos] = useState<CoachFabPos>({ x: 0, y: 0 });
  const pos = posProp ?? internalPos;
  const onPos = onPosProp ?? setInternalPos;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // A drag must not be a tap: once the pointer has moved past a slop of a few
  // pixels, the release swallows the click that follows it, so letting go of
  // a dragged chip never cycles the mode underneath it.
  const suppressClick = useRef(false);
  // Which side the announce pill hangs on: past the felt's midline it flips
  // right, so dragging the chip to the left wall can't push the pill offscreen.
  const pillFlipAt = useRef(-Infinity);

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const el = wrapRef.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return;
    const r = el.getBoundingClientRect();
    const p = parent.getBoundingClientRect();
    // The wide stage draws at design size and scales; a pointer moves in
    // screen pixels but the translate applies before the scale, so divide the
    // deltas by it or the chip outruns the finger. 1 on the phone layout.
    const scale = el.offsetWidth ? r.width / el.offsetWidth : 1;
    const M = 4; // keep a hairline of felt visible around it
    const d = {
      id: e.pointerId,
      startX: e.clientX, startY: e.clientY,
      baseX: pos.x, baseY: pos.y, scale,
      minX: pos.x + (p.left + M - r.left) / scale, maxX: pos.x + (p.right - M - r.right) / scale,
      minY: pos.y + (p.top + M - r.top) / scale, maxY: pos.y + (p.bottom - M - r.bottom) / scale,
      moved: false,
    };
    pillFlipAt.current = (d.minX + d.maxX) / 2;

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== d.id) return;
      if (!d.moved && Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY) > 6) d.moved = true;
      if (!d.moved) return;
      onPos({
        x: clamp(d.baseX + (ev.clientX - d.startX) / d.scale, d.minX, d.maxX),
        y: clamp(d.baseY + (ev.clientY - d.startY) / d.scale, d.minY, d.maxY),
      });
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== d.id) return;
      if (d.moved) suppressClick.current = true;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  // The dot reads against the chip's gold AND the felt behind it, so its
  // colours come from what survives on both: teal for at-work, red for guided.
  const dot = busy ? TEAL : presence === "silent" ? "#9a9a86" : presence === "guided" ? RED : TEAL;
  // A count on the icon IS volunteering, so only Guided may show one. Enforced
  // here rather than left to the caller: "On request never volunteers" is the
  // promise the mode makes, and a promise a caller can forget to keep is not one.
  const count = presence === "guided" ? toReview : 0;
  const next = NEXT_PRESENCE[presence];

  return (
    <div
      ref={wrapRef}
      onPointerDown={onPointerDown}
      onClickCapture={(e) => {
        // The click after a drag is the hand letting go, not a request.
        if (suppressClick.current) {
          suppressClick.current = false;
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      style={{
        position: "absolute", right: 10, bottom: 10, zIndex: 6,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
        transform: pos.x || pos.y ? `translate(${pos.x}px,${pos.y}px)` : undefined,
        touchAction: "none", // the drag is ours; don't let the page scroll with it
      }}
    >
      <style>{KEYFRAMES}</style>
      {/* The way into the panel — Owlee's own face. */}
      <button
        type="button"
        onClick={onOpen}
        aria-label="Open Owlee"
        style={{
          width: 30, height: 30, borderRadius: "50%", padding: 0,
          background: PAPER, borderWidth: 1, borderStyle: "solid", borderColor: "rgba(42,5,6,.35)",
          boxShadow: "0 2px 6px rgba(42,5,6,.4)",
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <OwleeFace size={28} />
      </button>

      <div style={{ position: "relative" }}>
        {announced && (
          <span
            role="status"
            className="coach-anim"
            style={{
              position: "absolute", top: "50%", transform: "translateY(-50%)",
              ...(pos.x < pillFlipAt.current ? { left: 60 } : { right: 60 }),
              whiteSpace: "nowrap", background: "rgba(42,5,6,.85)", color: "#fff",
              borderRadius: 15, padding: "6px 11px", fontSize: 12, fontWeight: 700,
              animation: "coachFade .15s ease",
            }}
          >
            {PRESENCE[announced].label}
            <span style={{ fontWeight: 500, opacity: 0.8 }}> — {PRESENCE[announced].under}</span>
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            onPresence(next);
            setAnnounced(next);
          }}
          aria-label={`Owlee mode: ${PRESENCE[presence].label}. Tap to switch to ${PRESENCE[next].label}.`}
          style={{
            width: 52, height: 52, borderRadius: "50%",
            // The dealer's chip: the table's gold, because gold is the one colour
            // this felt already uses to mean "look here".
            background: CHIP,
            borderWidth: 0, padding: 0, cursor: "pointer",
            boxShadow: "0 3px 10px rgba(42,5,6,.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            // Silent still shows, dimmed — the chip is the way back out of it.
            filter: presence === "silent" ? "saturate(.5) brightness(.92)" : undefined,
          }}
        >
          {/* a chip's inner ring */}
          <span
            aria-hidden
            style={{
              position: "absolute", inset: 4, borderRadius: "50%",
              borderWidth: 1.5, borderStyle: "dashed", borderColor: "rgba(84,16,21,.5)",
            }}
          />
          <span
            aria-hidden
            style={{
              color: FELT_DEEP, fontSize: MODE_GLYPH[presence].size, fontWeight: 700,
              lineHeight: 1, transform: "translateY(1px)",
            }}
          >
            {MODE_GLYPH[presence].glyph}
          </span>
          <span
            aria-hidden
            className={presence === "guided" ? "coach-anim" : undefined}
            style={{
              position: "absolute", right: -1, top: -1, width: 14, height: 14, borderRadius: "50%",
              background: dot, borderWidth: 2, borderStyle: "solid", borderColor: "#f2f2ea",
              animation: presence === "guided" ? "coachRing 2.2s infinite" : undefined,
            }}
          />
          {count > 0 && (
            <span
              style={{
                position: "absolute", left: -3, top: -3, minWidth: 18, height: 18, padding: "0 4px",
                borderRadius: 9, background: RED, color: "#fff",
                fontSize: 11, fontWeight: 700, lineHeight: "18px", textAlign: "center",
              }}
            >
              {count}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   THE SHEET — rises over the table, which stays visible above it
   ════════════════════════════════════════════════════════════════════════════ */

export function CoachSheet({
  data,
  presence,
  onClose,
}: Readonly<{
  data: CoachPanelData;
  presence: CoachPresence;
  onClose: () => void;
}>) {
  // The screen selector lives with the HOST, not the shared body — the dock
  // carries the same tabs in its own header row (owner direction 2026-08-13).
  const [view, setView] = useState<CoachView>("now");
  // Escape closes it, like every other overlay at this table.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <style>{KEYFRAMES}</style>
      <button
        type="button"
        aria-label="Close Owlee"
        onClick={onClose}
        className="coach-anim"
        style={{
          position: "absolute", inset: 0, zIndex: 8, borderWidth: 0, padding: 0,
          background: "rgba(42,5,6,.44)", cursor: "pointer", animation: "coachFade .2s ease",
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={data.title ?? "Owlee"}
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
        {/* ── the header IS the felt: the sheet rises out of the table ── */}
        <div
          style={{
            flex: "none",
            background: `linear-gradient(160deg,${FELT_HI},${FELT_DEEP})`,
            color: "#fff",
          }}
        >
          {/* grabber */}
          <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 2px" }}>
            <span style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,.4)" }} />
          </div>

          {/* who is talking — with the settings gear beside Owlee */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 14px 11px" }}>
            <OwleeFace size={38} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 17, fontWeight: 700, lineHeight: 1.2 }}>
                {data.title ?? "Owlee"}
              </span>
              {/* The mode line is gone (owner direction 2026-08-13: "remove
                  the text") — the header names the coach and nothing else.
                  Only actual work still earns a line under the name. */}
              {data.busy && (
                <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "rgba(255,244,215,.85)" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: GOLD }} />
                  Working it out…
                </span>
              )}
            </span>
            {/* A PLACEHOLDER, ON PURPOSE (owner decision 2026-08-05): the mode
                moved out to the chip on the felt, and nothing else lives in
                settings yet — the gear stays for the settings that will, and
                does nothing until they do. */}
            <button
              type="button"
              aria-label="Owlee settings (nothing here yet)"
              aria-disabled="true"
              style={{
                flex: "none", width: 32, height: 32, borderRadius: 8,
                background: "rgba(255,255,255,.14)",
                borderWidth: 0, color: "#f2f2ea",
                fontSize: 16, lineHeight: 1, cursor: "default",
              }}
            >
              ⚙︎
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                flex: "none", width: 32, height: 32, borderRadius: 8,
                background: "rgba(255,255,255,.14)",
                borderWidth: 0, color: "#f2f2ea", fontSize: 16, lineHeight: 1, cursor: "pointer",
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* the tabs, under the header band — the dock lays these same
            buttons into its own header row instead */}
        <div
          style={{
            flex: "none", display: "flex", gap: 6, padding: "10px 14px 0",
            overflowX: "auto", scrollbarWidth: "none",
          }}
        >
          <CoachTabRow view={view} onView={setView} />
        </div>
        <CoachScreens data={data} presence={presence} view={view} onView={setView} />
      </div>
    </>
  );
}

/** The four screens, by name. */
type CoachView = "now" | "hints" | "tell" | "history";

/**
 * The four tabs, as bare buttons — each host lays them into its own row:
 * the sheet under its felt header band, the dock IN its header row, on the
 * same level as the coach's chip and the expand button (owner direction
 * 2026-08-13). FOUR SCREENS (owner direction 2026-08-11, folding the
 * earlier five): "Now" faces forward — the position and the chat. "Hints"
 * is the choices and the ladder. "Tell" is the answers side by side.
 * "History" faces back and holds both records as one tab.
 */
function CoachTabRow({
  view,
  onView,
}: Readonly<{ view: CoachView; onView: (v: CoachView) => void }>) {
  return (
    <>
      {(
        [
          ["now", "Game State"],
          ["hints", "Hints"],
          ["tell", "Tell"],
          ["history", "History"],
        ] as const
      ).map(([v, label]) => {
        const on = view === v;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={on}
            aria-label={label}
            title={label}
            onClick={() => onView(v)}
            style={{
              flex: "none", minHeight: 40, padding: "4px 9px 3px", borderRadius: 11,
              background: on ? FELT_MID : "transparent",
              borderWidth: 1, borderStyle: "solid", borderColor: on ? FELT_MID : FELT_LINE,
              color: on ? "#fff" : "#8a8071",
              fontFamily: "inherit", cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", gap: 1,
            }}
          >
            <TabGlyph kind={v} />
            {/* the icon's name, spelled out under it (owner direction
                2026-08-13) — same ink as the glyph, so the pair reads as
                one control */}
            <span
              style={{
                fontSize: 8, fontWeight: 700, letterSpacing: ".03em",
                lineHeight: 1.1, whiteSpace: "nowrap",
              }}
            >
              {label}
            </span>
          </button>
        );
      })}
    </>
  );
}

/**
 * The four screens' content pane — the coach's whole body below the tabs,
 * shared by the expanded sheet and the collapsed dock (owner direction
 * 2026-08-13: the dock shows each screen whole, so the collapsed panel
 * hides nothing — expanding only buys reading room). Owns every per-view
 * state except the selector itself, which lives with the host's tab row.
 */
function CoachScreens({
  data,
  presence,
  view,
  onView,
}: Readonly<{
  data: CoachPanelData;
  presence: CoachPresence;
  view: CoachView;
  /** For the screens that jump elsewhere — the takeaway's "show me that call". */
  onView: (v: CoachView) => void;
}>) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  // The context card's event rows: an accordion, one open at a time. Reading
  // two meanings side by side is not a real use, and one-at-a-time keeps a
  // 10-call auction from unfolding into a wall.
  const [openEvent, setOpenEvent] = useState<string | null>(null);
  // The ask surface, same discipline: one open at a time. Separate from the
  // meaning accordion — reading what a call means while asking about it is a
  // real use, so the two don't close each other.
  const [openAsk, setOpenAsk] = useState<string | null>(null);
  // The "what if" surface on a played card, once the board is over — one at
  // a time, like the ask boxes. Its own state: an open what-if is a running
  // (and cached) simulation, and toggling a meaning shouldn't collapse it.
  const [openWhatIf, setOpenWhatIf] = useState<string | null>(null);
  // Which history sections the learner has toggled. Anything untouched falls
  // back to the data's own default — the current section open, the past
  // collapsed — so a NEW trick arrives open without wiping the learner's
  // choices about the old ones.
  const [groupToggles, setGroupToggles] = useState<Record<string, boolean>>({});
  const groupOpen = (g: CoachEventGroup) => groupToggles[g.id] ?? Boolean(g.current);
  // The auction renders as a bidding diagram, and one call at a time is
  // selected: its meaning and its ask box show below the grid.
  const [selectedCall, setSelectedCall] = useState<string | null>(null);
  // Start writing the hints and the play advice the moment the decision is
  // the learner's — the screens that show them then open onto answers, not
  // spinners (owner direction 2026-08-11). Keyed per CARD, not per trick:
  // each play is its own decision with its own answers.
  useCoachPrefetch(data.ask, decisionEpoch(data));
  // Which history sections (the auction, the play) the learner has toggled.
  // Untouched, each falls back to where the board is: the play opens once a
  // card has been led, the auction opens while the bidding is the story.
  const [historyToggles, setHistoryToggles] = useState<Record<string, boolean>>({});

  const notes = data.notes ?? [];
  const corrections = notes.filter((n) => (n.tone ?? "correction") === "correction").reverse();
  const approvals = notes.filter((n) => n.tone === "affirmation");
  const status = notes.filter((n) => n.tone === "status");
  // Silent means silent: the panel still shows so the setting is reachable, but
  // it carries nothing the coach would have volunteered.
  const showNotes = presence === "guided";

  return (
    <>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "13px 14px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* ── NOW: the default screen, shared with the table's coach band.
              Once the board is over, "now" IS reflection (owner decision
              2026-08-13): the takeaway card takes the screen, the chat stays
              below it, and the tab row stays at four. ── */}
          {view === "now" &&
            (data.takeaway ? (
              <>
                <CoachTakeaway
                  takeaway={data.takeaway}
                  sessionId={data.ask?.sessionId}
                  onShowCall={(eventId) => {
                    setSelectedCall(eventId);
                    setHistoryToggles((prev) => ({ ...prev, auction: true }));
                    onView("history");
                  }}
                />
                {data.ask && (
                  <div>
                    <Label>Ask Owlee</Label>
                    <CoachChat key="board-over" sessionId={data.ask.sessionId} />
                  </div>
                )}
              </>
            ) : (
              <CoachNow data={data} />
            ))}

          {/* ── HINTS: the realistic choices first (owner direction
              2026-08-13, moved here from Now — the menu of options belongs
              beside the ladder that narrows them), then five hints for this
              decision, opened one at a time. Keyed per decision (every card,
              every call) so each play deals a fresh, unopened ladder. ── */}
          {view === "hints" && (
            <>
              {data.aid && (data.aid.candidates.length > 0 || data.aid.noChoice) && (
                <ThinkCard aid={data.aid} />
              )}
              {data.ask ? (
                <CoachHints
                  key={decisionEpoch(data)}
                  sessionId={data.ask.sessionId}
                  epoch={decisionEpoch(data)}
                  active={data.ask.active}
                />
              ) : (
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: MUTED }}>
                  Hints are for a player with a decision in front of them — take a seat to use
                  them.
                </p>
              )}
            </>
          )}

          {/* ── TELL: the answers, side by side — the coach's card and BEN's ── */}
          {view === "tell" &&
            (data.ask ? (
              <CoachTell
                key={decisionEpoch(data)}
                sessionId={data.ask.sessionId}
                epoch={decisionEpoch(data)}
                phase={data.ask.phase}
                active={data.ask.active}
              />
            ) : (
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: MUTED }}>
                The answers are for a player with a decision in front of them — take a seat to
                see them.
              </p>
            ))}

          {/* ── HISTORY: the board's past — the auction and the play, one tab,
              two collapsible sections (owner direction 2026-08-11). Untouched,
              the section where the board LIVES is the open one: the auction
              while the bidding is the story, the play once a card has led. ── */}
          {view === "history" &&
            (() => {
              const tricks = (data.eventGroups ?? []).filter((g) => g.id !== "auction");
              const auction = (data.eventGroups ?? []).find((g) => g.id === "auction");
              const auctionOpen = historyToggles["auction"] ?? tricks.length === 0;
              const playOpen = historyToggles["play"] ?? tricks.length > 0;
              return (
                <>
                  <div style={{ background: PAPER, borderWidth: 1, borderStyle: "solid", borderColor: "#e8ddc3", borderRadius: 11, padding: "10px 12px" }}>
                    <HistorySectionHeader
                      title="The auction"
                      open={auctionOpen}
                      count={auction?.events.length ?? 0}
                      onToggle={() => setHistoryToggles((prev) => ({ ...prev, auction: !auctionOpen }))}
                    />
                    {auctionOpen &&
                      (auction?.events.length ? (
                        <AuctionDiagram
                          events={auction.events}
                          selectedId={selectedCall}
                          onSelect={setSelectedCall}
                          {...(data.ask ? { ask: data.ask } : {})}
                        />
                      ) : (
                        <p style={{ margin: "7px 0 0", fontSize: 13, lineHeight: 1.5, color: MUTED }}>
                          Nobody has called yet.
                        </p>
                      ))}
                  </div>

                  <div style={{ background: PAPER, borderWidth: 1, borderStyle: "solid", borderColor: "#e8ddc3", borderRadius: 11, padding: "10px 12px" }}>
                    <HistorySectionHeader
                      title="The play"
                      open={playOpen}
                      count={tricks.reduce((n, g) => n + g.events.length, 0)}
                      onToggle={() => setHistoryToggles((prev) => ({ ...prev, play: !playOpen }))}
                    />
                    {playOpen &&
                      (tricks.length ? (
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          {tricks.map((group) => {
                            const isOpen = groupOpen(group);
                            return (
                              <div key={group.id}>
                                <button
                                  type="button"
                                  aria-expanded={isOpen}
                                  onClick={() => setGroupToggles((prev) => ({ ...prev, [group.id]: !isOpen }))}
                                  style={{
                                    display: "flex", alignItems: "center", gap: 6, width: "100%",
                                    minHeight: 30, padding: "4px 1px",
                                    background: "transparent", borderWidth: 0,
                                    borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "#e8ddc3",
                                    fontFamily: "inherit", textAlign: "left", cursor: "pointer",
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6,
                                      textTransform: "uppercase", color: isOpen ? FELT_DEEP : FAINT,
                                    }}
                                  >
                                    {group.title}
                                  </span>
                                  {group.note && (
                                    <span style={{ fontSize: 10.5, fontWeight: 500, color: FAINT }}>
                                      · {group.note}
                                    </span>
                                  )}
                                  <span style={{ flex: 1 }} />
                                  {!isOpen && (
                                    <span style={{ fontSize: 10, color: FAINT, fontVariantNumeric: "tabular-nums" }}>
                                      {group.events.length}
                                    </span>
                                  )}
                                  <span
                                    aria-hidden
                                    style={{
                                      flex: "none", width: 13, textAlign: "center", color: FELT_MID, fontSize: 9,
                                      transform: isOpen ? "rotate(180deg)" : undefined, transition: "transform .15s ease",
                                    }}
                                  >
                                    ▼
                                  </span>
                                </button>
                                {isOpen &&
                                  group.events.map((ev) => (
                                    <EventRow
                                      key={ev.id}
                                      event={ev}
                                      open={openEvent === ev.id}
                                      onToggle={() => setOpenEvent(openEvent === ev.id ? null : ev.id)}
                                      {...(SHOW_PLAY_ASK && data.ask && ev.who === "You"
                                        ? {
                                            // Only the learner's OWN plays take an
                                            // Ask (owner decision 2026-08-05); the
                                            // other seats' cards stay plain rows.
                                            askOpen: openAsk === ev.id,
                                            onToggleAsk: () => setOpenAsk(openAsk === ev.id ? null : ev.id),
                                            ask: (
                                              <CoachEventAsk
                                                sessionId={data.ask.sessionId}
                                                eventId={ev.id}
                                                eventLabel={ev.label}
                                              />
                                            ),
                                          }
                                        : {})}
                                      {...(data.ask &&
                                      data.ask.phase === "other" &&
                                      ev.mine &&
                                      ev.trickIndex !== undefined &&
                                      ev.playIndex !== undefined
                                        ? {
                                            // The "what if" (owner direction
                                            // 2026-08-13): BEN's read of this
                                            // card's spot, once the board is
                                            // over. Only decisions that were
                                            // the learner's own wear the pill;
                                            // the server enforces the same
                                            // gates.
                                            askOpen: openWhatIf === ev.id,
                                            onToggleAsk: () =>
                                              setOpenWhatIf(openWhatIf === ev.id ? null : ev.id),
                                            askLabel: "What if",
                                            ask: (
                                              <div style={{ margin: "2px 0 9px 29px" }}>
                                                <BenWhatIf
                                                  sessionId={data.ask.sessionId}
                                                  query={`play=${ev.trickIndex}-${ev.playIndex}`}
                                                  kind="card"
                                                  {...(ev.token ? { actual: ev.token } : {})}
                                                  auto
                                                />
                                              </div>
                                            ),
                                          }
                                        : {})}
                                    />
                                  ))}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p style={{ margin: "7px 0 0", fontSize: 13, lineHeight: 1.5, color: MUTED }}>
                          No cards have been played yet.
                        </p>
                      ))}
                  </div>
                </>
              );
            })()}

          {/* ── the buttons ── */}
          {/* HIDDEN, NOT GONE (owner decision 2026-08-05). The big "Help me
              think" / "What should I play?" row is coming off the sheet: those
              actions are moving into the event rows above, in miniature, once
              the answer block they embed settles. Everything behind them —
              CoachPrompts, both API routes, the think scaffold — stays wired,
              and the host still passes `prompts`; flip this to bring the row
              back. */}
          {view === "now" && SHOW_PROMPT_BUTTONS && presence !== "silent" && data.prompts && (
            <div>
              <Label>Ask me</Label>
              {data.prompts}
            </div>
          )}

          {view === "now" && presence === "silent" && (
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: MUTED }}>
              I'm keeping out of the way. Nothing will interrupt you, and I won't offer anything
              unless you switch me to <b>On request</b> — tap my chip on the felt to change mode.
            </p>
          )}

          {/* ── what it flagged, in Guided ── */}
          {view === "now" && showNotes && (
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

          {view === "now" && data.actions && (
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>{data.actions}</div>
          )}
        </div>
    </>
  );
}

/**
 * The forward tabs' pictograms (owner-supplied concept, restyled to the
 * app's own theme): a speech bubble — the coach speaking — carrying the
 * screen's symbol.
 *   now      an eye — what the coach is looking at with you
 *   hints    a bulb — a nudge, not the answer
 *   tell     a check — the answer itself
 *   history  a clock — the board's past, auction and play both
 * MONOCHROME IN currentColor, deliberately: the icons wear exactly what the
 * text labels wore — the muted ink on cream when idle, white on the brand
 * green when active — so the row introduces no hue the sheet doesn't already
 * speak (the reference art's leaf green was nobody's palette here).
 */
function TabGlyph({ kind }: Readonly<{ kind: "now" | "hints" | "tell" | "history" }>) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      aria-hidden
      style={{ display: "block" }}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* the bubble, tail bottom-left — as the reference art has it */}
      <path d="M6 3h12a3.5 3.5 0 0 1 3.5 3.5v7.5a3.5 3.5 0 0 1-3.5 3.5h-7.4l-3.85 3.6v-3.6H6A3.5 3.5 0 0 1 2.5 14V6.5A3.5 3.5 0 0 1 6 3Z" />
      {kind === "now" && (
        <>
          <path d="M6.2 10.4c1.1-2 3.2-3.4 5.8-3.4s4.7 1.4 5.8 3.4c-1.1 2-3.2 3.4-5.8 3.4s-4.7-1.4-5.8-3.4Z" />
          <circle cx="12" cy="10.4" r="1.7" fill="currentColor" stroke="none" />
        </>
      )}
      {kind === "hints" && (
        <>
          <path d="M12 6.6a3.3 3.3 0 0 1 1.5 6.24c-.25.14-.4.3-.4.52v.24h-2.2v-.24c0-.22-.15-.38-.4-.52A3.3 3.3 0 0 1 12 6.6Z" />
          <path d="M10.9 15.5h2.2" />
          <g strokeWidth="1.3">
            <path d="M12 3.8v1" />
            <path d="M7.4 5.7l.7.7" />
            <path d="M16.6 5.7l-.7.7" />
            <path d="M5.4 10.2h1" />
            <path d="M17.6 10.2h1" />
          </g>
        </>
      )}
      {kind === "tell" && <path d="M7.8 10.8l3 3.1 5.4-6.3" strokeWidth="2.1" />}
      {kind === "history" && (
        <>
          <circle cx="12" cy="10.4" r="4.6" />
          <path d="M12 7.9v2.5l1.9 1.4" />
        </>
      )}
    </svg>
  );
}

/**
 * A History card's own header — the whole row toggles its section, in the
 * same visual language as the per-trick headers inside it (uppercase label,
 * closed rows dim and carry their count, the chevron turns).
 */
function HistorySectionHeader({
  title, open, count, onToggle,
}: Readonly<{ title: string; open: boolean; count: number; onToggle: () => void }>) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      style={{
        display: "flex", alignItems: "center", gap: 6, width: "100%",
        minHeight: 26, padding: 0,
        background: "transparent", borderWidth: 0,
        fontFamily: "inherit", textAlign: "left", cursor: "pointer",
      }}
    >
      <span
        style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 0.7,
          textTransform: "uppercase", color: open ? FELT_DEEP : FAINT,
        }}
      >
        {title}
      </span>
      <span style={{ flex: 1 }} />
      {!open && count > 0 && (
        <span style={{ fontSize: 10, color: FAINT, fontVariantNumeric: "tabular-nums" }}>
          {count}
        </span>
      )}
      <span
        aria-hidden
        style={{
          flex: "none", width: 13, textAlign: "center", color: FELT_MID, fontSize: 9,
          transform: open ? "rotate(180deg)" : undefined, transition: "transform .15s ease",
        }}
      >
        ▼
      </span>
    </button>
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
 * Text with its ♥ and ♦ in red, as every printed hand diagram has them. Not
 * decoration: at row size, ♦ and ♠ are near-identical shapes, and these labels
 * exist to be told apart at a glance.
 */
function RedSuits({ children }: Readonly<{ children: string }>) {
  return (
    <>
      {children.split(/([♥♦])/).map((part, i) =>
        part === "♥" || part === "♦" ? (
          <span key={i} style={{ color: "#c00" }}>
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** The board's current history section — the open trick, or the auction. */
function currentGroup(data: CoachPanelData): CoachEventGroup | undefined {
  return (
    data.eventGroups?.find((g) => g.current) ??
    data.eventGroups?.[data.eventGroups.length - 1]
  );
}

/**
 * Where the board is, per TRICK, as a remount key. A new trick is a new
 * conversation: the chat keys on this, so it survives the cards inside a
 * trick but empties for the next one.
 */
function boardEpoch(data: CoachPanelData): string {
  return currentGroup(data)?.id ?? "start";
}

/**
 * Where the board is, per CARD. The hint ladder, the advice and BEN's tell
 * are about ONE decision, and a trick holds up to four — declarer decides for
 * dummy at trick one and again from hand three cards later, and serving the
 * first decision's ladder to the second is coaching the wrong position (the
 * bug this fixes: hints "not resetting for every play"). Counting the current
 * section's events makes every card — and every call in the auction — a new
 * epoch, which is a new cache key and a fresh, face-down ladder.
 */
function decisionEpoch(data: CoachPanelData): string {
  const g = currentGroup(data);
  return g ? `${g.id}#${g.events.length}` : "start";
}

/**
 * The Now screen's content — the position and the chat. Exported standalone
 * for hosts that want just this screen; the dock no longer condenses it
 * (owner direction 2026-08-13: the collapsed panel shows each tab whole,
 * through the same CoachScreens the sheet uses).
 */
export function CoachNow({ data }: Readonly<{ data: CoachPanelData }>) {
  // A new trick is a new conversation. The chat and the advice answer hold
  // their exchanges in component state, so they are keyed by where the board
  // is (the current history section): the next trick remounts them empty
  // rather than carrying last trick's answers into a different position.
  const epoch = boardEpoch(data);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* THE GAME STATE (owner direction 2026-08-10): "What I'm looking at"
          and "What you can work out" merged into one section of small flip
          cards — sealed to a title first, the value one tap in, the full
          fact behind it. */}
      {(data.looking || !!data.facts?.length) && (
        <GameState
          looking={data.looking}
          facts={data.facts ?? []}
          known={data.aid?.knownCards ?? []}
          epoch={epoch}
        />
      )}

      {/* NO CHOICES HERE (owner direction 2026-08-13): "Your realistic
          choices" moved to the HINTS screen, above the ladder — the menu of
          options belongs beside the hints that narrow them. */}

      {/* NO ADVICE HERE (owner direction 2026-08-11). "What should I play?"
          left the Now screen for TELL, where the answer now shows itself —
          Now stays the screen that helps you think, Tell the one that tells. */}

      {/* the chat — anything about the position */}
      {data.ask && (
        <div>
          <Label>Ask Owlee</Label>
          <CoachChat key={epoch} sessionId={data.ask.sessionId} />
        </div>
      )}
    </div>
  );
}

/**
 * Renders nothing; starts writing the current decision's hints and play
 * advice into the shared prefetch cache. For hosts where the coach's own
 * surfaces mount late — the phone table shows only the FAB until the sheet
 * opens — so the answers are ready before any coach UI exists to ask for
 * them. Hosts whose coach is always mounted (the dock) don't need this.
 */
export function CoachPrefetch({ data }: Readonly<{ data: CoachPanelData }>) {
  useCoachPrefetch(data.ask, decisionEpoch(data));
  return null;
}

/**
 * The original coach, inside the NEW table's reserved coach band. The dock
 * now carries the sheet's own four tab icons and shows each screen WHOLE
 * (owner direction 2026-08-13: "show as much content as possible of each
 * tab in the default panel") — collapsed mode hides nothing. The expand
 * button stays: it opens the full-height CoachSheet as an overlay above
 * the whole table, same content with more room to read it.
 *
 * The dock never unmounts while the table is up, so the CoachScreens inside
 * it is the one reliable place the decision's hints and advice get
 * prefetched — the sheet's own copy only helps while the sheet is open.
 */
export function CoachDock({ data }: Readonly<{ data: CoachPanelData }>) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<CoachView>("now");
  return (
    // The dock IS the panel (owner direction 2026-08-05: "the entire default
    // screen occupies the entire coach panel"): the shell hands over the whole
    // band, and this draws everything — its own slim identity row, its own
    // scroll, the coach's own paper.
    <div
      style={{
        position: "relative", width: "100%", height: "100%", minHeight: 0,
        display: "flex", flexDirection: "column",
        background: HEAD, fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "7px 12px 5px" }}>
        <OwleeFace size={26} />
        <span style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 14.5, fontWeight: 700, color: INK }}>
          Owlee
        </span>
        {/* the tabs ride the header itself (owner direction 2026-08-13:
            same level as the coach's chip and the expand button) */}
        <div
          style={{
            flex: 1, minWidth: 0, display: "flex", alignItems: "center",
            justifyContent: "center", gap: 5,
            overflowX: "auto", scrollbarWidth: "none",
          }}
        >
          <CoachTabRow view={view} onView={setView} />
        </div>
        <button
          type="button"
          aria-label="Open the full Owlee panel"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          style={{
            flex: "none", width: 30, height: 26, borderRadius: 8,
            background: FELT_MID, borderWidth: 0, color: "#fff",
            fontSize: 13, lineHeight: 1, cursor: "pointer",
            boxShadow: "0 1px 3px rgba(0,0,0,.25)",
          }}
        >
          ⤢
        </button>
      </div>
      <CoachScreens data={data} presence="request" view={view} onView={setView} />
      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 900 }}>
          <CoachSheet data={data} presence="request" onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

/* ── the Game State — the position as flip cards ─────────────────────────────
   "What I'm looking at" and "What you can work out" used to be two prose
   blocks; the owner asked for one section (2026-08-10) with the information
   dissected into small cards. THREE FACES NOW (owner direction 2026-08-13):
   the card starts SEALED — its title alone ("HCP"), like an unopened letter —
   the first tap opens it to the value ("4 HCP"), and taps after that turn it
   between the value and the full fact. Working the number out before peeking
   is the exercise. The same discipline as the sections it replaces: every
   card is arithmetic or a definition, all cards are styled identically, and
   nothing on any face recommends. */

/** What every card shows: a sealed title, the value behind it, the fact behind that. */
type StateCard = { title: string; value: string; detail?: string };

/** The three faces, in opening order. */
type FlipStage = "sealed" | "value" | "detail";

function FlipCard({ card }: Readonly<{ card: StateCard }>) {
  // A card with no title has nothing to seal with — it starts open.
  const [stage, setStage] = useState<FlipStage>(card.title ? "sealed" : "value");
  // The 3D stage exists ONLY while the card is turning. A face that sits under
  // perspective/preserve-3d/backface-visibility lives on a composited layer,
  // where the text is a rasterized texture — visibly blurry at this size. At
  // rest the visible face renders flat, with no transform anywhere, so the
  // glyphs come off the ordinary crisp text path.
  const [turning, setTurning] = useState(false);
  // The face this turn lands on; null at rest. Every turn animates 0→180 with
  // the outgoing face in front and the incoming behind, then settles flat.
  const [target, setTarget] = useState<FlipStage | null>(null);
  const [rotated, setRotated] = useState(false);

  // A letter, once opened, stays open: sealed leads to the value, and from
  // there taps toggle value ↔ fact. No detail means nothing past the value.
  const next: FlipStage | null =
    stage === "sealed" ? "value" : card.detail ? (stage === "value" ? "detail" : "value") : null;
  const canFlip = next !== null;

  const finish = (to: FlipStage) => {
    setStage(to);
    setTarget(null);
    setTurning(false);
    setRotated(false);
  };
  const flip = () => {
    if (!next || turning) return;
    const to = next;
    setTarget(to);
    setTurning(true);
    // Two frames so the stage PAINTS at the old angle first — flipping state in
    // the same frame it mounts would jump straight to the target, unanimated.
    requestAnimationFrame(() => requestAnimationFrame(() => setRotated(true)));
    // Backstop for environments where transitionend never fires (reduced
    // motion sets transition:none): settle to the crisp flat face regardless.
    setTimeout(() => finish(to), 650);
  };
  // IN-FLOW, not absolute (2026-08-14: "the text here is overflowing"). A
  // face pinned inset:0 could never size its card, so a two-line title or a
  // long fact spilled past the 54px footprint. The face now sizes the card
  // — minHeight keeps the small ones even, and the grid row grows for the
  // tall ones instead of clipping them.
  const face: React.CSSProperties = {
    position: "relative", width: "100%", minHeight: 54, boxSizing: "border-box",
    borderRadius: 9,
    display: "flex", flexDirection: "column", justifyContent: "center",
    padding: "5px 7px", textAlign: "center",
  };
  const sealed = (
    <span style={{ ...face, background: "#f3ead4", borderWidth: 1, borderStyle: "solid", borderColor: "#e8ddc3" }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: INK, lineHeight: 1.25 }}>
        {card.title}
      </span>
      <span style={{ marginTop: 2, fontSize: 7.5, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "#b3a789" }}>
        tap to open
      </span>
      <span aria-hidden style={{ position: "absolute", top: 3, right: 5, fontSize: 8, color: "#b3a789" }}>
        ✉
      </span>
    </span>
  );
  const front = (
    <span style={{ ...face, background: "#f3ead4", borderWidth: 1, borderStyle: "solid", borderColor: "#e8ddc3" }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: INK, fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}>
        <RedSuits>{card.value}</RedSuits>
      </span>
      {card.title && (
        <span style={{ marginTop: 2, fontSize: 8.5, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "#6b5f50" }}>
          {card.title}
        </span>
      )}
      {card.detail && (
        <span aria-hidden style={{ position: "absolute", top: 3, right: 5, fontSize: 8, color: "#b3a789" }}>
          ⟳
        </span>
      )}
    </span>
  );
  const back = card.detail ? (
    <span
      style={{
        // No scroll region any more: the card grows to hold the whole fact.
        ...face,
        background: FELT_SOFT, borderWidth: 1, borderStyle: "solid", borderColor: "#e0cfa4",
      }}
    >
      <span style={{ fontSize: 9.5, lineHeight: 1.35, color: FELT_DEEP, fontWeight: 500 }}>
        <RedSuits>{card.detail}</RedSuits>
      </span>
    </span>
  ) : null;
  const faceFor = (s: FlipStage) => (s === "sealed" ? sealed : s === "value" ? front : back);
  return (
    <button
      type="button"
      onClick={canFlip ? flip : undefined}
      aria-pressed={stage !== "sealed"}
      aria-label={
        stage === "sealed"
          ? `${card.title} — tap to open`
          : card.detail
            ? `${card.title || card.value} — tap to flip`
            : card.value
      }
      style={{
        // The CONTENT owns the footprint now: the visible face renders
        // in-flow, so the button — and with it the grid row — grows to hold
        // whatever the face says, and nothing clips.
        position: "relative", minHeight: 54,
        display: "flex", flexDirection: "column",
        ...(turning ? { perspective: 600 } : {}),
        padding: 0, borderWidth: 0, background: "transparent",
        cursor: canFlip ? "pointer" : "default", textAlign: "inherit",
        fontFamily: "inherit",
      }}
    >
      {turning && target ? (
        <span
          className="coach-flip"
          onTransitionEnd={() => finish(target)}
          style={{
            position: "relative", flex: 1, transformStyle: "preserve-3d",
            transform: rotated ? "rotateY(180deg)" : "rotateY(0deg)",
          }}
        >
          {/* An invisible IN-FLOW copy of the landing face holds the
              footprint while the stage's real faces sit absolute above it —
              so the card is already the right size when the turn settles. */}
          <span aria-hidden style={{ visibility: "hidden", display: "block" }}>
            {faceFor(target)}
          </span>
          <span style={{ position: "absolute", inset: 0, display: "flex", backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}>
            {faceFor(stage)}
          </span>
          <span
            style={{
              position: "absolute", inset: 0, display: "flex", transform: "rotateY(180deg)",
              backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
            }}
          >
            {faceFor(target)}
          </span>
        </span>
      ) : (
        // At rest: one face, in flow, no transforms — this is where the
        // crispness lives, and where the card takes its size from its text.
        <span style={{ flex: 1, display: "flex" }}>{faceFor(stage)}</span>
      )}
    </button>
  );
}

/**
 * The Game State section: the one-line position, then the cards — the hand's
 * own facts first, the worked-out inferences after them, one grid.
 *
 * Keyed by `epoch` so a new trick deals a fresh set with every card face up;
 * a flip is a reading of THIS position and must not survive into the next.
 */
function GameState({
  looking, facts, known, epoch,
}: Readonly<{
  looking?: string;
  facts: readonly { label: string; value: string; detail?: string }[];
  known: readonly KnownCard[];
  epoch: string;
}>) {
  const cards: StateCard[] = [
    ...facts.map((f) => ({ title: f.label, value: f.value, ...(f.detail ? { detail: f.detail } : {}) })),
    ...known.map((k) => ({ title: k.title, value: k.value, detail: k.detail })),
  ];
  return (
    <div style={{ background: PAPER, borderWidth: 1, borderStyle: "solid", borderColor: "#e8ddc3", borderRadius: 11, padding: "10px 12px" }}>
      {/* the flip rotation, and its absence for those who asked motion to stop */}
      <style>{`.coach-flip{transition:transform .45s;display:block}
@media (prefers-reduced-motion:reduce){.coach-flip{transition:none!important}}`}</style>
      <Label color={FELT_DEEP}>Game state</Label>
      {looking && <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.45 }}>{looking}</p>}
      {cards.length > 0 && (
        <div
          style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(86px, 1fr))",
            gap: 6, marginTop: looking ? 9 : 0,
          }}
        >
          {cards.map((c) => (
            <FlipCard key={`${epoch}|${c.title}|${c.value}`} card={c} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The realistic choices, shown at the top of the HINTS screen (owner
 * direction 2026-08-13, moved off Now) — this is what the "Help me think"
 * button used to answer with, now sitting above the ladder that narrows the
 * options it lists. (Its "what you can work out" half lives in the Game
 * State card on Now.) Candidates render in given order and are styled
 * identically, same as CoachPrompts' block: any visual difference between
 * them reads as a recommendation, and the point of the scaffold is that it
 * does not answer.
 */
function ThinkCard({ aid }: Readonly<{ aid: ThinkAid }>) {
  return (
    <div
      style={{
        background: PAPER, borderWidth: 1, borderStyle: "solid", borderColor: "#e8ddc3",
        borderRadius: 11, padding: "10px 12px",
        display: "flex", flexDirection: "column", gap: 11,
      }}
    >
      {aid.candidates.length > 0 && (
        <div>
          <Label>Your realistic choices</Label>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
            {aid.candidates.map((c) => (
              <li key={c.label} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 13.5, lineHeight: 1.45 }}>
                <span style={{ flex: "none", minWidth: 42, fontWeight: 700, color: INK }}>
                  <RedSuits>{c.label}</RedSuits>
                </span>
                {c.note ? (
                  <span style={{ color: FAINT }}>
                    <RedSuits>{c.note}</RedSuits>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
      {aid.noChoice && (
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.45, color: MUTED }}>{aid.noChoice}</p>
      )}
    </div>
  );
}

/* ── the auction, printed as a bidding box ──────────────────────────────────
   A column per seat in rotation from the dealer, each call a token in bidding
   order — the shape every bridge app and every printed deal uses, so the
   learner reads it without translating. Tapping a call selects it; its
   meaning and its ask box open below the grid. */

const SEAT_ROTATION = ["N", "E", "S", "W"];

/** The takeaway verdict's corner mark, as the bidding diagram wears it. */
const TOKEN_MARK: Record<NonNullable<CoachLookingEvent["verdict"]>, { mark: string; bg: string }> = {
  correct: { mark: "✓", bg: FELT_MID },
  acceptable: { mark: "≈", bg: "#9c5a12" },
  incorrect: { mark: "✗", bg: "#b91c1c" },
};

/** One call as a token: bids as card faces, Pass/Dbl/Rdbl as coloured chips. */
function CallToken({
  event, selected, onSelect,
}: Readonly<{ event: CoachLookingEvent; selected: boolean; onSelect: () => void }>) {
  const isBid = Boolean(event.token);
  const text = event.token ?? (event.verb === "passed" ? "Pass" : event.verb === "doubled" ? "Dbl" : "Rdbl");
  const red = /[♥♦]/.test(text);
  const mark = event.verdict ? TOKEN_MARK[event.verdict] : null;
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={event.label + (event.verdict ? ` — ${event.verdict}` : "")}
      onClick={onSelect}
      style={{
        position: "relative",
        width: "100%", minHeight: 28, padding: "3px 2px",
        background: isBid ? "#fff" : event.verb === "passed" ? FELT_MID : "#b91c1c",
        borderWidth: 1, borderStyle: "solid",
        borderColor: selected ? FELT_DEEP : isBid ? "#d8d3bf" : "transparent",
        borderRadius: 6, cursor: "pointer",
        boxShadow: selected ? `0 0 0 2px ${GOLD}` : CARD_EDGE,
        fontSize: isBid ? 14 : 10.5, fontWeight: 700, fontFamily: "inherit",
        lineHeight: 1.2, textAlign: "center",
        color: isBid ? (red ? "#c00" : "#20201a") : "#fff",
        textTransform: isBid ? undefined : "uppercase",
        letterSpacing: isBid ? undefined : 0.4,
      }}
    >
      {text}
      {mark && (
        <span
          aria-hidden
          style={{
            position: "absolute", top: -5, right: -5,
            width: 14, height: 14, borderRadius: "50%",
            background: mark.bg, color: "#fff",
            fontSize: 9, fontWeight: 700, lineHeight: "14px", textAlign: "center",
          }}
        >
          {mark.mark}
        </span>
      )}
    </button>
  );
}

function AuctionDiagram({
  events, selectedId, onSelect, ask,
}: Readonly<{
  events: readonly CoachLookingEvent[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Present means the selected call's meaning panel carries a question box —
   *  and, once the auction is over, the "what if" ask on the learner's own
   *  calls. `phase` is where the board is now, gating that second surface. */
  ask?: { sessionId: string; phase?: "auction" | "play" | "other" };
}>) {
  // The first call is the dealer's, so the column order falls out of the data.
  const dealer = events[0]?.seat ?? "N";
  const start = Math.max(0, SEAT_ROTATION.indexOf(dealer));
  const cols = [0, 1, 2, 3].map((i) => SEAT_ROTATION[(start + i) % 4]!);
  const bySeat = new Map<string, CoachLookingEvent[]>(cols.map((s) => [s, []]));
  for (const ev of events) bySeat.get(ev.seat ?? "")?.push(ev);
  const youSeat = events.find((e) => e.who === "You")?.seat;
  const selected = selectedId ? events.find((e) => e.id === selectedId) : undefined;

  return (
    <div style={{ padding: "7px 0 2px" }}>
      <div style={{ display: "flex", gap: 5 }}>
        {cols.map((s) => (
          <div key={s} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            {/* seat header — your seat wears the gold chip, the dealer is underlined */}
            <span
              style={{
                alignSelf: "center", minWidth: 21, height: 21, padding: "0 4px", borderRadius: 5,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700,
                background: s === youSeat ? CHIP : "#105431",
                color: s === youSeat ? FELT_DEEP : "#fff",
                textDecoration: s === dealer ? "underline" : undefined,
                textUnderlineOffset: 2,
              }}
            >
              {s}
            </span>
            <div
              style={{
                display: "flex", flexDirection: "column", gap: 3,
                background: FELT_SOFT, borderRadius: 8, padding: 4, minHeight: 40,
              }}
            >
              {(bySeat.get(s) ?? []).map((ev) => (
                <CallToken
                  key={ev.id}
                  event={ev}
                  selected={ev.id === selectedId}
                  onSelect={() => onSelect(ev.id === selectedId ? null : ev.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── the selected call: its meaning, and the way to ask about it ── */}
      {selected && (
        <div
          style={{
            marginTop: 8, borderRadius: 9, padding: "9px 11px 4px",
            background: FELT_SOFT,
            borderWidth: 1, borderStyle: "solid", borderColor: FELT_LINE,
          }}
        >
          <div
            style={{
              fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6,
              textTransform: "uppercase", color: FELT_DEEP, marginBottom: 4,
            }}
          >
            Meaning ·{" "}
            <RedSuits>
              {`${
                selected.token ??
                (selected.verb === "doubled" ? "Double" : selected.verb === "redoubled" ? "Redouble" : "Pass")
              } by ${selected.who ?? "?"}`}
            </RedSuits>
          </div>
          <p
            style={{
              margin: "0 0 6px", fontFamily: "Georgia, 'Times New Roman', serif",
              fontSize: 13.5, lineHeight: 1.5, color: selected.detail ? MUTED : FAINT,
            }}
          >
            {selected.detail ? (
              <RedSuits>{selected.detail}</RedSuits>
            ) : (
              "Your system notes don't cover this call."
            )}
          </p>
          {/* The "what if": BEN's read of the same spot, on the learner's own
              calls once the auction is over (asked live it could still steer
              the decision in front of them — the server enforces the same
              gate). A button first: selecting a call is for reading its
              meaning, and a model run shouldn't ride along uninvited. */}
          {ask && ask.phase !== "auction" && selected.who === "You" && selected.auctionIndex !== undefined && (
            <div style={{ margin: "0 0 8px" }}>
              <BenWhatIf
                key={selected.id}
                sessionId={ask.sessionId}
                query={`at=${selected.auctionIndex}`}
                kind="call"
                actual={
                  selected.token ??
                  (selected.verb === "doubled"
                    ? "Double"
                    : selected.verb === "redoubled"
                      ? "Redouble"
                      : "Pass")
                }
              />
            </div>
          )}
          {ask && (
            <CoachEventAsk
              key={selected.id}
              sessionId={ask.sessionId}
              eventId={selected.id}
              eventLabel={selected.label}
              flush
            />
          )}
        </div>
      )}
    </div>
  );
}

/** The card or call itself, drawn as a small card face — red for ♥/♦, as printed. */
function TokenChip({ token }: Readonly<{ token: string }>) {
  return (
    <span
      style={{
        flex: "none", padding: "2px 8px",
        background: "#fff", borderWidth: 1, borderStyle: "solid", borderColor: "#d8d3bf",
        borderRadius: 4, boxShadow: CARD_EDGE,
        fontSize: 13.5, fontWeight: 700, lineHeight: 1.3,
        color: /[♥♦]/.test(token) ? "#c00" : "#20201a",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {token}
    </span>
  );
}

/**
 * One table event in the context card, as a ledger line: seat badge, actor
 * and verb, then the card or call itself as a small card face — and, when the
 * host provides ask context, an "Ask" toggle opening this event's interaction
 * surface (a question box, and the play advice in miniature).
 *
 * The label area and the "Ask" pill are SEPARATE buttons inside one row —
 * tapping the label expands the meaning, tapping Ask opens the conversation.
 * The learner's own rows get the coach's gold badge — the same chip that sits
 * on the felt — so "which of these was me" needs no reading at all.
 */
function EventRow({
  event, open, onToggle, askOpen = false, onToggleAsk, ask, askLabel = "Ask",
}: Readonly<{
  event: CoachLookingEvent;
  open: boolean;
  onToggle: () => void;
  askOpen?: boolean;
  onToggleAsk?: () => void;
  /** The interaction surface, rendered when askOpen. */
  ask?: ReactNode;
  /** What the pill says — "Ask" for the question box, "What if" for BEN. */
  askLabel?: string;
}>) {
  const expandable = Boolean(event.detail);
  const isYou = event.who === "You";
  const structured = Boolean(event.who && event.verb);

  const content = structured ? (
    <>
      <span
        aria-hidden
        style={{
          flex: "none", width: 21, height: 21, borderRadius: 5,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 700,
          background: isYou ? CHIP : "#105431",
          color: isYou ? FELT_DEEP : "#fff",
        }}
      >
        {event.seat}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 700 }}>{event.who}</span>
        <span style={{ color: MUTED }}> {event.verb}</span>
      </span>
      {event.token && <TokenChip token={event.token} />}
    </>
  ) : (
    <span style={{ flex: 1, fontWeight: 600 }}>
      <RedSuits>{event.label}</RedSuits>
    </span>
  );

  // A fixed slot whether or not there is a chevron, so the card faces line up
  // down the column like a ledger's figures.
  const chevron = (
    <span
      aria-hidden
      style={{
        flex: "none", width: 13, textAlign: "center", color: FELT_MID, fontSize: 10,
        transform: open ? "rotate(180deg)" : undefined, transition: "transform .15s ease",
      }}
    >
      {expandable ? "▼" : ""}
    </span>
  );

  const label = {
    display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0,
    fontSize: 13, color: INK, lineHeight: 1.35,
  } as const;

  return (
    <div>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 8,
          minHeight: 36, padding: "5px 1px",
          borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "#f2e8d2",
        }}
      >
        {expandable ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={event.label}
            onClick={onToggle}
            style={{
              ...label, background: "transparent", borderWidth: 0, padding: 0,
              fontFamily: "inherit", textAlign: "left", cursor: "pointer",
            }}
          >
            {content}
            {chevron}
          </button>
        ) : (
          <div style={label} aria-label={event.label}>
            {content}
            {chevron}
          </div>
        )}
        {onToggleAsk && (
          <button
            type="button"
            aria-expanded={askOpen}
            aria-label={`${askLabel} — ${event.label}`}
            onClick={onToggleAsk}
            style={{
              flex: "none", minHeight: 26, padding: "3px 11px",
              background: askOpen ? FELT_MID : "transparent",
              borderWidth: 1, borderStyle: "solid", borderColor: askOpen ? FELT_MID : FELT_LINE,
              borderRadius: 13, color: askOpen ? "#fff" : FELT_DEEP,
              fontSize: 11, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
            }}
          >
            {askLabel}
          </button>
        )}
      </div>
      {open && (
        <p
          style={{
            // Indented to the text column, under the actor it belongs to.
            margin: "0 0 9px 29px", paddingLeft: 10,
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: 13.5, lineHeight: 1.5, color: MUTED,
            borderLeftWidth: 2, borderLeftStyle: "solid", borderLeftColor: FELT_LINE,
          }}
        >
          <RedSuits>{event.detail ?? ""}</RedSuits>
        </p>
      )}
      {askOpen && ask}
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
            : { background: PAPER, borderRadius: 8, padding: "10px 12px", borderWidth: 1, borderStyle: "solid", borderColor: "#e8ddc3" }
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
                    background: isOpen ? FELT_MID : PAPER,
                    borderWidth: 1, borderStyle: "solid", borderColor: isOpen ? FELT_MID : FELT_LINE,
                    borderRadius: 17, color: isOpen ? "#fff" : FELT_DEEP,
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
                  borderLeftWidth: 2, borderLeftStyle: "solid", borderLeftColor: FELT_LINE,
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
            background: PAPER, borderWidth: 1, borderStyle: "solid", borderColor: FELT_LINE,
            borderRadius: 17, color: FELT_DEEP, fontSize: 12.5, fontWeight: 700,
            textDecoration: "none", display: "inline-flex", alignItems: "center",
          }}
        >
          {note.action.label}
        </a>
      )}
    </div>
  );
}

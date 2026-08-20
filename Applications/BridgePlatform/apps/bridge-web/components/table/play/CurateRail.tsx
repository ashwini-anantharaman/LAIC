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
// THREE BEATS, ONE AT A TIME (owner direction 2026-08-19: "this entire screen
// looks too packed and complicated… intuitive, and gamified for a game even if
// we are doing something sophisticated"; designed on a canvas first, then
// built). The studio rail used to stack every task in one scroll — the lesson,
// the live decision, the advisors, the annotation list, four board settings and
// the publish button — on a phone band about 500px tall. Now:
//
//   SET UP     what the board teaches, how tightly they are held, who sits.
//   THE LINE   the decision in front of the coach, and nothing else.
//   PUBLISH    what the learner will get, said as a check, then the button.
//
// A tracker at the top says which beat you are in and lets you move between
// them; the body holds exactly one; a single primary action sits at the foot.
// Two devices carry the "gamified" ask without inventing points: the LINE METER
// (two pips for the auction, thirteen for the tricks, filling as the sitting is
// recorded) and WHAT THIS BOARD CARRIES (five marks a board earns — lesson,
// note, why, ladder, framing — which are the same five the publish check
// reads). The annotation list moved behind the foot's "N noted" button, because
// scrolling past your own history to reach the field you are typing in is the
// packing the owner was describing.
//
// The LEGACY v1 door (?curate=1, annotate your own sitting) keeps the plain
// stacked column: it has no beats to walk — no lesson, no board settings — and
// nothing points at it any more.
//
// Annotations accumulate in component state for the sitting and can be
// REOPENED from the "your annotations" list (fields rebind to the picked
// decision). PUBLISH is one POST to the save-to-library route with the
// payload riding `curatedJson` — the server re-validates every position
// against the final line, so an undo that orphaned an annotation drops it
// rather than shipping a ghost.

import { useEffect, useState } from "react";

import type { Seat } from "@bridge/events";

import { parseKItemIds, parseKTags, type KItemId, type KTag } from "@/lib/coach/kItems";
import { MAX_DEAL_ITEMS, MAX_DEAL_TAGS } from "@/lib/coach/kSelection";

import {
  atKey,
  type CuratedAnnotation,
  type CuratedAt,
  type CuratedConstraint,
} from "@/lib/curated";
import {
  CURATE_SETTINGS_KEY,
  type CuratedBoardSettings,
} from "@/components/curate/curateSettings";
import { hasLesson, LessonPicker, lessonSummary } from "@/components/curate/LessonPicker";

import { PreviewAsLearnerButton } from "@/components/curate/PreviewAsLearnerButton";

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
const FIELD_BG = "#fffdf6";

/**
 * The app's display face, with the app's own fallback behind it.
 *
 * `--font-neco` is defined by the /m layout (the shell the coach app embeds and
 * the mobile web uses), NOT by the desktop root layout — and an undefined
 * custom property inside a font-family list invalidates the whole declaration,
 * which would drop the rail back to the inherited sans. So the var carries its
 * own fallback: Neco where the app defines it, Georgia on the desktop table,
 * which is what the rail already used there.
 */
const DISPLAY = "var(--font-neco, Georgia), Georgia, 'Times New Roman', serif";

/** The three beats of building a board. */
type Beat = "setup" | "line" | "publish";

const BEATS: readonly { id: Beat; label: string }[] = [
  { id: "setup", label: "Set up" },
  { id: "line", label: "The line" },
  { id: "publish", label: "Publish" },
];

/** One stroke tick, at whatever size the caller needs. */
function Tick({ size = 10, color = "#fff" }: Readonly<{ size?: number; color?: string }>) {
  return (
    <svg width={size} height={size * 0.8} viewBox="0 0 10 8" aria-hidden focusable="false">
      <path
        d="M1 4l2.5 2.5L9 1"
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Chevron({ open = false, color = GREEN }: Readonly<{ open?: boolean; color?: string }>) {
  return (
    <svg
      width="11"
      height="7"
      viewBox="0 0 12 8"
      aria-hidden
      focusable="false"
      style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform .15s" }}
    >
      <path d="M1.5 1.5L6 6l4.5-4.5" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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

const SEAT_NAME: Record<Seat, string> = { N: "North", E: "East", S: "South", W: "West" };

const DEFAULT_SETTINGS: CuratedBoardSettings = {
  learnerSeat: "S",
  constraint: "guided",
  intro: "",
  debrief: "",
  pin: "",
  kTags: [],
  kItems: [],
};

export function CurateRail({
  sessionId,
  at,
  atLabel,
  boardOver,
  boardName,
  fill = false,
  author = false,
  atSeat = null,
  declarer = null,
  dummySeat = null,
  lineSummary = null,
  progress = null,
  line = null,
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
  /** THE STUDIO (curated v2, owner design 2026-08-18): the coach sits in the
   *  LEARNER'S chair and the robots play the other three (owner direction
   *  2026-08-19 — an ordinary table, with this rail beside it), so every
   *  decision that reaches this rail is one the learner will face. The
   *  robots' own actions are carried to the learner by the overlay's `since`
   *  list at their next decision. The advisor strip — BEN's bid, DDS's card
   *  counts — speaks at every decision. */
  author?: boolean;
  /** Whose decision the live `at` is — the acting seat (studio only). */
  atSeat?: Seat | null;
  declarer?: Seat | null;
  dummySeat?: Seat | null;
  /** The sitting's compass — "6 calls so far", "4♠ by S · trick 3 of 13". */
  lineSummary?: string | null;
  /** THE LINE METER's own numbers (owner direction 2026-08-19). The compass
   *  above is a sentence; this is what fills the pips, so the coach can see how
   *  much of the board is recorded without reading. */
  progress?: { calls: number; tricks: number; phase: "auction" | "play" | "complete" } | null;
  /**
   * THE RECORD, for showing a note beside the position it was made at (owner
   * ask 2026-08-19). Calls and cards only — the board's public half, which is
   * all a position strip needs; the hands stay out of this component.
   */
  line?: {
    auction: { seat: Seat; call: string }[];
    tricks: { plays: { seat: Seat; card: { suit: string; rank: number } }[] }[];
    contract: string | null;
  } | null;
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

  // THE STUDIO'S BOARD SETTINGS: seeded by the deal picker via sessionStorage,
  // editable again at publish. Read once on mount — the picker wrote them
  // before this table ever rendered.
  const [settings, setSettings] = useState<CuratedBoardSettings>(DEFAULT_SETTINGS);
  // The TOPIC is the filter the coach picks cards through, and the name the
  // lesson wears; the CARDS are what the learner's panel leads with. Turning a
  // topic off never drops the cards it found — the coach chose those.
  const toggleLessonTag = (tag: KTag) =>
    setSettings((prev) => ({
      ...prev,
      kTags: prev.kTags.includes(tag)
        ? prev.kTags.filter((x) => x !== tag)
        : prev.kTags.length >= MAX_DEAL_TAGS
          ? prev.kTags
          : [...prev.kTags, tag],
    }));
  const toggleLessonItem = (id: KItemId) =>
    setSettings((prev) => ({
      ...prev,
      kItems: prev.kItems.includes(id)
        ? prev.kItems.filter((x) => x !== id)
        : prev.kItems.length >= MAX_DEAL_ITEMS
          ? prev.kItems
          : [...prev.kItems, id],
    }));
  const clearLessonItems = () => setSettings((prev) => ({ ...prev, kItems: [] }));
  const lessonSet = hasLesson(settings.kTags, settings.kItems);
  // THE PICKER LIVES IN TWO PLACES ON PURPOSE (owner UI/UX pass 2026-08-18):
  // under the studio header, where it is reachable for the whole sitting, and
  // once more in the publish panel. The header copy is the one that matters — a
  // coach who cannot see the lesson while they play the line has no way to tell
  // whether the board they are building still matches what they set out to
  // teach, and the answer arriving at trick 13 is the answer arriving too late.
  // One element, rendered twice: the choice cannot disagree with itself.
  // `fold` false where the host already carries the summary line and its
  // toggle (the header strip below); true in the publish panel, where the
  // picker's own closed state keeps the last look before shipping calm.
  const lessonPicker = (fold: boolean) => (
    <LessonPicker
      skin="rail"
      fold={fold}
      tags={settings.kTags}
      items={settings.kItems}
      onToggleTag={toggleLessonTag}
      onToggleItem={toggleLessonItem}
      onClear={clearLessonItems}
    />
  );
  useEffect(() => {
    if (!author) return;
    try {
      const raw = sessionStorage.getItem(CURATE_SETTINGS_KEY(sessionId));
      if (!raw) return;
      const stored = JSON.parse(raw) as CuratedBoardSettings & {
        annotations?: CuratedAnnotation[];
      };
      // The lesson comes back through the registry's own door: a stash
      // written by an older build (no lesson at all) or naming a tag or card
      // this one has since dropped must not put junk into the publish payload.
      setSettings({
        ...DEFAULT_SETTINGS,
        ...stored,
        kTags: parseKTags(stored.kTags),
        kItems: parseKItemIds(stored.kItems),
      });
      // A REVISION arrives with the entry's annotations — seed the drafts, or
      // republishing would wipe the coach's words. Only into an empty rail:
      // the coach's live edits always win over the stored copy.
      if (stored.annotations?.length) {
        setDrafts((prev) => {
          if (Object.keys(prev).length) return prev;
          const seeded: Record<string, Draft> = {};
          for (const a of stored.annotations!) {
            seeded[atKey(a.at)] = {
              label:
                a.at.kind === "call"
                  ? `Bid #${a.at.auctionIndex + 1}`
                  : `Trick ${a.at.trickIndex + 1}, card ${a.at.playIndex + 1}`,
              note: a.note ?? "",
              why: a.why ?? "",
              hints: (a.hints ?? []).join("\n"),
            };
          }
          return seeded;
        });
      }
    } catch {
      // Storage refused or junk — the defaults hold; everything is editable
      // at publish anyway.
    }
  }, [author, sessionId]);

  // THE ADVISOR STRIP (studio only): what BEN would bid, what DDS counts for
  // every card — fetched on demand per decision, never automatically (BEN is
  // a network hop; the coach may not want the machines' view at all).
  const [advice, setAdvice] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "bid"; ben: { bid: string; candidates: { call: string; score?: number; explanation?: string }[] } }
    | { kind: "cards"; cards: { card: string; tricks: number }[] }
    | { kind: "none" }
  >({ kind: "idle" });

  const liveKey = at ? atKey(at) : null;

  // THE CARD STAYS SHORT (UI/UX pass 2026-08-18): the note is the primary
  // field; "why" and the hint ladder fold in behind small adders until the
  // coach reaches for them — or already wrote in them, which keeps a
  // reopened annotation's fields visible without any extra state.
  const [whyOpen, setWhyOpen] = useState(false);
  const [hintsOpen, setHintsOpen] = useState(false);

  // WHOSE MOMENT THIS IS. The learner's own decisions — their seat, and
  // dummy's chair while they declare — are where the coach speaks to a
  // choice the learner is about to make. Every OTHER seat's action is still
  // worth a word (a partner's 2NT, an opponent's overcall), and the learner
  // reads it when the board comes back to them (lib/curated actionsSince).
  const decisionIsLearners =
    !author ||
    (atSeat != null &&
      (atSeat === settings.learnerSeat ||
        (declarer === settings.learnerSeat && atSeat === dummySeat)));

  useEffect(() => {
    setAdvice({ kind: "idle" });
  }, [liveKey]);

  // A new decision starts folded — yesterday's expansions were for
  // yesterday's words (written text keeps its own field open, see below).
  const boundKeyForFolds = editKey ?? liveKey;
  useEffect(() => {
    setWhyOpen(false);
    setHintsOpen(false);
  }, [boundKeyForFolds]);

  const askMachines = () => {
    if (advice.kind === "loading") return;
    setAdvice({ kind: "loading" });
    fetch(`/api/bridge/sessions/${encodeURIComponent(sessionId)}/author-assist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
      .then((r) => r.json())
      .then(
        (d: {
          ben?: { bid: string; candidates: { call: string; score?: number; explanation?: string }[] } | null;
          dds?: { cards: { card: string; tricks: number }[] } | null;
        }) => {
          if (d.ben) setAdvice({ kind: "bid", ben: d.ben });
          else if (d.dds?.cards?.length) setAdvice({ kind: "cards", cards: d.dds.cards });
          else setAdvice({ kind: "none" });
        },
      )
      .catch(() => setAdvice({ kind: "none" }));
  };

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

  // WHICH BEAT the coach is looking at. Null means "wherever the board is" —
  // the tracker follows the sitting until they pick a beat themselves, and a
  // pick sticks (a coach writing the intro at trick 3 is not dragged back).
  const [beatPick, setBeatPick] = useState<Beat | null>(null);
  // The annotation list, behind the foot's counter rather than under the field.
  const [notesOpen, setNotesOpen] = useState(false);
  // The three framing fields, folded: most boards leave them empty.
  const [framingOpen, setFramingOpen] = useState(false);
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

  /* ── where the sitting is, and therefore which beat leads ── */
  const lineStarted = (progress?.calls ?? 0) > 0 || (progress?.tricks ?? 0) > 0;
  const beatDone: Record<Beat, boolean> = {
    setup: lessonSet || lineStarted,
    line: boardOver,
    publish: !!published,
  };
  const autoBeat: Beat = boardOver ? "publish" : lineStarted || lessonSet ? "line" : "setup";
  const beat: Beat = beatPick ?? autoBeat;
  const beatCopy =
    beat === "setup"
      ? "What it teaches, and how tightly they're held"
      : beat === "line"
        ? `You bid every hand, then play ${SEAT_NAME[settings.learnerSeat]} — the robots play the rest`
        : "What your learner gets, then the button";

  /** THE PUBLISH CHECK: what the learner will and will not get, in words, with
   *  the beat that fixes each gap. It replaces the row of struck-through chips,
   *  which said as little as it could while still looking like an answer. */
  const withNote = annotations().filter((a) => a.note);
  const missingWhy = withNote.filter((a) => !a.why).length;
  const ladders = annotations().filter((a) => a.hints).length;
  const checks: { label: string; note: string; on: boolean; fix?: Beat }[] = ([
    {
      label: boardOver ? "The line" : "The line, still being played",
      note: boardOver
        ? "Every call and card, exactly as you played them."
        : "Publishing opens when the last trick is in.",
      on: boardOver,
    },
    {
      label: lessonSet
        ? `Teaches ${lessonSummary(settings.kTags, settings.kItems).toLowerCase()}`
        : "No lesson named",
      note: lessonSet
        ? "The Know panel leads with these."
        : "Their panel falls back to its usual cards.",
      on: lessonSet,
      fix: "setup",
    },
    {
      label: saved ? `${saved} note${saved === 1 ? "" : "s"}` : "No notes yet",
      note: saved
        ? savedEntries.map(([, d]) => d.label).filter(Boolean).slice(0, 3).join(", ")
        : "They would get the board and the line, but none of your voice.",
      on: saved > 0,
      fix: "line",
    },
    {
      label: missingWhy
        ? `${missingWhy} note${missingWhy === 1 ? "" : "s"} with no reason`
        : "Every note has its reason",
      note: missingWhy
        ? "A note says what to see; the reason says why it is right."
        : "Your why rides beside each note.",
      on: saved > 0 && missingWhy === 0,
      fix: "line",
    },
    {
      label: ladders ? `${ladders} hint ladder${ladders === 1 ? "" : "s"}` : "No hint ladders",
      note: ladders ? "Yours replace Owlee's at those decisions." : "Owlee's own rungs will stand in.",
      on: ladders > 0,
      fix: "line",
    },
    {
      label: `Held ${settings.constraint}`,
      note:
        settings.constraint === "locked"
          ? "Only your line plays."
          : settings.constraint === "free"
            ? "Nothing interrupts them."
            : "They can stray; your nudge offers the take-back.",
      on: true,
      fix: "setup",
    },
    // A REASON ROW WITH NO NOTES TO REASON ABOUT is a contradiction on screen:
    // "every note has its reason" beside an empty circle. The notes row above
    // already says the real problem.
  ] as { label: string; note: string; on: boolean; fix?: Beat }[]).filter(
    (c) => saved > 0 || !c.label.toLowerCase().includes("reason"),
  );

  // "SK" → ♠K, colored — the DDS strip's card chips.
  const GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
  const cardChip = (code: string) => {
    const suit = code.slice(0, 1);
    const red = suit === "H" || suit === "D";
    return (
      <span style={{ fontWeight: 700, color: red ? "#c02b23" : INK }}>
        {GLYPH[suit] ?? suit}
        {code.slice(1)}
      </span>
    );
  };

  // "5D" → 5♦ in the suit's own color — a bid never reads as raw letters
  // anywhere else at the table, so BEN's candidates don't either.
  const callChip = (call: string) => {
    const m = /^([1-7])([SHDCN])$/.exec(call);
    if (!m)
      return (
        <span style={{ fontWeight: 700, color: INK }}>
          {call === "P" ? "Pass" : call === "X" ? "Dbl" : call === "XX" ? "Rdbl" : call}
        </span>
      );
    const suit = m[2]!;
    if (suit === "N") return <span style={{ fontWeight: 700, color: INK }}>{m[1]}NT</span>;
    return (
      <span style={{ fontWeight: 700, color: suit === "H" || suit === "D" ? "#c02b23" : INK }}>
        {m[1]}
        {GLYPH[suit]}
      </span>
    );
  };

  /**
   * WHERE THE TABLE WAS when the coach said this (owner ask 2026-08-19: "is it
   * possible to show the state of the table at the point the comment is made?").
   *
   * A note in the list used to carry its address and nothing else — "Trick 1,
   * card 2" tells a coach where they were only if they still remember the board.
   * So each note gets the position it belongs to, read off the RECORD: the calls
   * that had been made, or the cards already in that trick, and then the move
   * the coach charted there, boxed.
   *
   * Only public information is involved, and only what the line already holds —
   * an address that no longer exists (an undo orphaned it) simply draws nothing.
   */
  const positionStrip = (key: string) => {
    if (!line) return null;
    const parts = key.split(":");
    const chip = (
      seat: Seat,
      body: React.ReactNode,
      here: boolean,
      slot: number,
    ) => (
      <span
        key={`${slot}-${seat}`}
        style={{
          flex: "none", display: "inline-flex", alignItems: "baseline", gap: 3,
          padding: here ? "2px 7px" : "2px 5px", borderRadius: 7,
          ...(here
            ? { background: "#e6f2ea", boxShadow: `inset 0 0 0 1px #bcd8c6` }
            : {}),
        }}
      >
        <span style={{ fontSize: 9, fontWeight: 700, color: here ? GREEN : FAINT }}>{seat}</span>
        <span style={{ fontSize: 11 }}>{body}</span>
      </span>
    );

    if (parts[0] === "call") {
      const i = Number(parts[1]);
      // The three calls before it are the context a bid is judged in; more than
      // that and the strip stops being glanceable.
      const before = line.auction.slice(Math.max(0, i - 3), i);
      const here = line.auction[i];
      if (!here && !before.length) return null;
      return (
        <span style={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
          {i > 3 && <span style={{ fontSize: 10, color: FAINT }}>…</span>}
          {before.map((c, n) => chip(c.seat, callChip(c.call), false, n))}
          {here && chip(here.seat, callChip(here.call), true, before.length)}
        </span>
      );
    }

    const t = Number(parts[1]);
    const pIndex = Number(parts[2]);
    const trick = line.tricks[t];
    if (!trick) return null;
    const before = trick.plays.slice(0, pIndex);
    const here = trick.plays[pIndex];
    if (!here && !before.length) return null;
    const code = (c: { suit: string; rank: number }) =>
      `${c.suit}${({ 14: "A", 13: "K", 12: "Q", 11: "J", 10: "T" } as Record<number, string>)[c.rank] ?? c.rank}`;
    return (
      <span style={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
        {line.contract && (
          <span style={{ flex: "none", fontSize: 9.5, fontWeight: 700, color: MUTED, marginRight: 3 }}>
            {line.contract}
          </span>
        )}
        {before.length === 0 && (
          <span style={{ fontSize: 10, color: FAINT, marginRight: 2 }}>on lead</span>
        )}
        {before.map((x, n) => chip(x.seat, cardChip(code(x.card)), false, n))}
        {here && chip(here.seat, cardChip(code(here.card)), true, before.length)}
      </span>
    );
  };

  /** The advisor chip — the one look both cards' ask-buttons wear. */
  const ADVISOR_CHIP: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 5,
    borderWidth: 1, borderStyle: "solid", borderColor: LINE, background: "#fbf5e3",
    borderRadius: 999, padding: "5px 11px",
    fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase",
    color: GREEN, fontFamily: "inherit",
  };

  /** The machines' ANSWER, shared by the learner-decision card and the
   *  line-building card — each provides its own ask-chip. */
  const adviceResults = (
    <>
      {advice.kind === "none" && (
          <p style={{ margin: "6px 0 0", fontSize: 11, color: FAINT, fontStyle: "italic" }}>
            No machine view here — BEN may not be configured, or the position is unreadable.
          </p>
        )}
        {advice.kind === "bid" && (
          <div style={{ marginTop: 7, display: "flex", flexDirection: "column", gap: 4 }}>
            {advice.ben.candidates.slice(0, 4).map((c, i) => (
              <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 7, fontSize: 12 }}>
                {/* The call as it looks at the table — suit glyph, suit
                    color — with BEN's own pick on a quiet green pill. */}
                <span
                  style={{
                    flex: "none", minWidth: 30, textAlign: "center",
                    padding: "1px 6px", borderRadius: 6,
                    ...(c.call === advice.ben.bid
                      ? { background: "#e6f2ea", boxShadow: "inset 0 0 0 1px #bcd8c6" }
                      : {}),
                  }}
                >
                  {callChip(c.call)}
                </span>
                {typeof c.score === "number" && (
                  <span style={{ flex: "none", fontSize: 10, color: FAINT }}>{c.score.toFixed(2)}</span>
                )}
                <span style={{ flex: 1, minWidth: 0, color: MUTED, fontSize: 10.5, lineHeight: 1.4 }}>
                  {c.explanation ?? (c.call === advice.ben.bid ? "BEN's choice" : "")}
                </span>
              </div>
            ))}
            <p style={{ margin: "2px 0 0", fontSize: 9.5, color: FAINT }}>
              BEN · neural — advice, not authority: your card is the line.
            </p>
          </div>
        )}
        {advice.kind === "cards" && (
          <div style={{ marginTop: 7 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {advice.cards.slice(0, 8).map((c, i) => (
                <span
                  key={i}
                  style={{
                    padding: "3px 7px", borderRadius: 7, fontSize: 11,
                    background: c.tricks === advice.cards[0]!.tricks ? "#e6f2ea" : "#fbf5e3",
                    borderWidth: 1, borderStyle: "solid",
                    borderColor: c.tricks === advice.cards[0]!.tricks ? "#bcd8c6" : "#f0e6cd",
                  }}
                >
                  {cardChip(c.card)}
                  <span style={{ color: MUTED, marginLeft: 4, fontSize: 10 }}>{c.tricks}</span>
                </span>
              ))}
            </div>
            <p style={{ margin: "5px 0 0", fontSize: 9.5, color: FAINT }}>
              Double-dummy tricks from here, best first — advice, not authority.
            </p>
          </div>
        )}
    </>
  );

  async function publish() {
    if (publishing) return;
    setPublishing(true);
    setError(null);
    try {
      // v2 (the studio): the board settings publish WITH the annotations —
      // learner seat, constraint, and the coach's intro/debrief/pin. A v1
      // sitting (no studio) keeps the v1 payload it always sent.
      const payload = author
        ? {
            v: 2,
            annotations: annotations(),
            learnerSeat: settings.learnerSeat,
            constraint: settings.constraint,
            ...(settings.intro.trim() ? { intro: settings.intro.trim() } : {}),
            ...(settings.debrief.trim() ? { debrief: settings.debrief.trim() } : {}),
            ...(settings.pin.trim() ? { pin: settings.pin.trim() } : {}),
            // WHAT THE BOARD TEACHES: the topic that names the lesson (owner
            // direction 2026-08-18) and the cards the learner's Know panel
            // leads with (2026-08-19). Cards alone are a lesson; a topic alone
            // still resolves to that topic's whole collection.
            ...(settings.kTags?.length ? { kTags: settings.kTags } : {}),
            ...(settings.kItems?.length ? { kItems: settings.kItems } : {}),
          }
        : { annotations: annotations() };
      const res = await fetch(`/api/bridge/sessions/${encodeURIComponent(sessionId)}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "play",
          name: title.trim() || `${boardName} · curated`,
          // The deal screen's library notes ride through to the entry.
          ...(author && settings.notes?.trim() ? { notes: settings.notes.trim() } : {}),
          curatedJson: JSON.stringify(payload),
          // A revision lands ON the entry it revises (future assignments
          // only — copy-on-assign shields learners mid-board).
          ...(author && settings.revisesEntryId
            ? { updateEntryId: settings.revisesEntryId }
            : {}),
        }),
      });
      const body = (await res.json()) as { entryId?: string; error?: string };
      if (!res.ok || !body.entryId) throw new Error(body.error ?? "Couldn't publish");
      try {
        sessionStorage.removeItem(CURATE_SETTINGS_KEY(sessionId));
      } catch {
        // Storage refused — a stale settings blob is harmless; it keys by a
        // session that will never author again.
      }
      setPublished(body.entryId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't publish");
    } finally {
      setPublishing(false);
    }
  }

  /* ─────────────────────── the pieces, built once ─────────────────────── */

  /** WHAT THIS BOARD CARRIES: five marks a board earns. Not a score — each one
   *  is a thing the learner either gets or does not, and the publish check
   *  below reads the same five. */
  const carries: { label: string; on: boolean; beat: Beat }[] = [
    { label: "Lesson", on: lessonSet, beat: "setup" },
    { label: "Note", on: saved > 0, beat: "line" },
    { label: "Why", on: annotations().some((a) => a.why), beat: "line" },
    { label: "Ladder", on: annotations().some((a) => a.hints), beat: "line" },
    {
      label: "Framing",
      on: !!(settings.intro.trim() || settings.debrief.trim() || settings.pin.trim()),
      beat: "publish",
    },
  ];
  const carried = carries.filter((c) => c.on).length;

  /**
   * The five marks. `size` is the circle; the label rides under it.
   *
   * EVERY BOX HERE IS `flex: none` ON PURPOSE. The button is a COLUMN flex, so
   * flex-shrink runs down the vertical axis: an empty circle (no content to
   * hold it open) was squashed into an oval by the button's own 44px floor,
   * while the one containing a tick stayed round — four ellipses and a circle,
   * which is what "not being shown correctly" looked like.
   */
  const carriesRow = (size: number) => (
    <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
      {carries.map((c) => (
        <button
          key={c.label}
          type="button"
          onClick={() => {
            setNotesOpen(false);
            setBeatPick(c.beat);
          }}
          title={c.on ? `${c.label} — done` : `${c.label} — not yet`}
          style={{
            flex: 1, minWidth: 0, minHeight: 44, padding: 0,
            background: "transparent", borderWidth: 0, cursor: "pointer",
            fontFamily: "inherit",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
          }}
        >
          <span
            aria-hidden
            style={{
              flex: "none", boxSizing: "border-box",
              width: size, height: size, minHeight: size, borderRadius: "50%",
              borderWidth: 1, borderStyle: c.on ? "solid" : "dashed",
              borderColor: c.on ? GREEN : LINE,
              background: c.on ? GREEN : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {c.on && <Tick size={size * 0.4} />}
          </span>
          <span
            style={{
              flex: "none",
              // The 260px desktop rail gives each mark ~44px; the app's band
              // gives half again as much, so the label need not whisper there.
              fontSize: fill ? 9.5 : 8.5,
              fontWeight: 700, letterSpacing: 0.1, textTransform: "uppercase",
              color: c.on ? GREEN : FAINT, textAlign: "center", lineHeight: 1.2,
            }}
          >
            {c.label}
          </span>
        </button>
      ))}
    </div>
  );

  /** THE LINE METER: two pips for the auction, thirteen for the tricks. The
   *  compass sentence says the same thing in words; this is the one a coach
   *  reads without reading. */
  const meter = (() => {
    const calls = progress?.calls ?? 0;
    const tricks = Math.min(progress?.tricks ?? 0, 13);
    const phase = progress?.phase ?? "auction";
    const auctionPips = phase === "auction" ? (calls > 0 ? 1 : 0) : 2;
    const pips = [
      ...Array.from({ length: 2 }, (_, i) => (i < auctionPips ? MAROON : CARD_EDGE)),
      ...Array.from({ length: 13 }, (_, i) => (i < tricks ? GREEN : CARD_EDGE)),
    ];
    const label =
      phase === "complete"
        ? "13 of 13"
        : phase === "play"
          ? `trick ${Math.min(tricks + 1, 13)}`
          : `${calls} call${calls === 1 ? "" : "s"}`;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ ...SMALLCAPS, flex: "none" }}>The line</span>
        <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 2 }}>
          {pips.map((bg, i) => (
            <span key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: bg }} />
          ))}
        </span>
        <span style={{ flex: "none", fontSize: 10.5, fontWeight: 700, color: GREEN }}>{label}</span>
      </div>
    );
  })();

  /** The tracker: who is authoring, which beat, and how much line there is. */
  const tracker = (
    <div
      style={{
        flex: "none", display: "flex", flexDirection: "column", gap: 9,
        padding: "11px 12px 9px",
        borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: CARD_EDGE,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <Badge size={26} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontFamily: DISPLAY, fontSize: 15, fontWeight: 700, color: INK, lineHeight: 1.15 }}>
            The studio
          </span>
          <span style={{ display: "block", fontSize: 10, color: MUTED, lineHeight: 1.35 }}>
            {beatCopy}
          </span>
        </span>
        <span style={{ flex: "none", fontSize: 10, fontWeight: 700, color: MUTED }}>
          Step {BEATS.findIndex((b) => b.id === beat) + 1} of 3
        </span>
      </div>

      {/* the three beats, with the trail behind them */}
      <div style={{ display: "flex", alignItems: "stretch" }}>
        {BEATS.map((b, i) => {
          const current = b.id === beat && !notesOpen;
          const done = beatDone[b.id];
          const reached = i <= BEATS.findIndex((x) => x.id === beat);
          const trail = (side: "left" | "right") => {
            if ((side === "left" && i === 0) || (side === "right" && i === BEATS.length - 1))
              return "transparent";
            return reached ? GREEN : LINE;
          };
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => {
                setNotesOpen(false);
                setBeatPick(b.id);
              }}
              aria-current={current ? "step" : undefined}
              style={{
                flex: 1, minWidth: 0, minHeight: 44, padding: 0,
                background: "transparent", borderWidth: 0, cursor: "pointer",
                fontFamily: "inherit",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", width: "100%" }}>
                <span style={{ flex: 1, height: 2, background: trail("left") }} />
                <span
                  aria-hidden
                  style={{
                    flex: "none", width: 18, height: 18, borderRadius: "50%",
                    // CURRENT WINS over done: a beat you are standing in reads
                    // as where-you-are first, with the tick still inside it.
                    background: current ? MAROON : done ? GREEN : PAPER,
                    boxShadow: done || current ? "none" : `inset 0 0 0 1.5px ${LINE}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {done && <Tick size={10} />}
                </span>
                <span style={{ flex: 1, height: 2, background: trail("right") }} />
              </span>
              <span
                style={{
                  fontSize: 10, fontWeight: current ? 700 : 600,
                  letterSpacing: 0.5, textTransform: "uppercase",
                  color: current ? MAROON : done ? GREEN : FAINT,
                }}
              >
                {b.label}
              </span>
            </button>
          );
        })}
      </div>

      {meter}

      {/* The compass (owner ask 2026-08-18: "the coach shaping a line wants the
          arithmetic said out loud") — the contract and the trick, which the
          meter's pips cannot say. */}
      {lineSummary && (
        <span style={{ fontSize: 10, fontWeight: 700, color: GREEN, lineHeight: 1.3 }}>
          {lineSummary}
        </span>
      )}
    </div>
  );

  /* ── the decision in front of the coach: the rail's original card ── */
  const decisionCard =
    boundKey && (boundLabel || editKey) ? (
      <div style={SECTION}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8, flexWrap: "wrap" }}>
          <span
            style={{
              flex: "none", padding: "3px 10px", borderRadius: 12,
              background: MAROON, color: CREAM, fontSize: 11, fontWeight: 700,
            }}
          >
            {boundLabel || bound.label}
          </span>
          {/* WHOSE MOMENT: the learner's own decision, or one of the other
              three seats — a word there is read when the board comes back to
              the learner. */}
          {author && !editKey && (
            <span
              style={{
                flex: "none", padding: "3px 9px", borderRadius: 12,
                background: decisionIsLearners ? "#e6f2ea" : "#efe7d3",
                color: decisionIsLearners ? GREEN : MUTED,
                fontSize: 10, fontWeight: 700,
                letterSpacing: 0.4, textTransform: "uppercase",
              }}
            >
              {decisionIsLearners
                ? `${SEAT_NAME[settings.learnerSeat]} · learner`
                : `${atSeat ? SEAT_NAME[atSeat] : "the table"} · they watch`}
            </span>
          )}
          {editKey ? (
            <button
              type="button"
              onClick={() => setEditKey(null)}
              style={{
                marginLeft: "auto", minHeight: 30, padding: "0 2px",
                background: "transparent", borderWidth: 0,
                fontSize: 10.5, fontWeight: 700, color: GREEN, fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              ← the live decision
            </button>
          ) : (
            bound.note.trim() || bound.why.trim() || bound.hints.trim() ? (
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: GREEN }}>
                <Tick size={11} color={GREEN} />
                Kept
              </span>
            ) : (
              <span style={{ marginLeft: "auto", fontSize: 10, color: FAINT }}>saved as you type</span>
            )
          )}
        </div>

        <label style={{ ...SMALLCAPS, display: "block", color: MAROON }}>
          Your note to the learner
          <textarea
            value={bound.note}
            onChange={(e) => setBound({ note: e.target.value })}
            rows={2}
            maxLength={500}
            placeholder={
              decisionIsLearners
                ? "What should they be seeing here?"
                : `What does ${atSeat ? SEAT_NAME[atSeat] : "this"}'s move tell them?`
            }
            style={{ ...FIELD, resize: "vertical", marginTop: 4, fontWeight: 400, letterSpacing: 0, textTransform: "none" }}
          />
        </label>

        {(whyOpen || !!bound.why.trim()) && (
          <label style={{ ...SMALLCAPS, display: "block", color: MAROON, marginTop: 9 }}>
            {decisionIsLearners ? "Why your move is right" : "What the move means"}
            <textarea
              value={bound.why}
              onChange={(e) => setBound({ why: e.target.value })}
              rows={2}
              maxLength={500}
              autoFocus={whyOpen && !bound.why.trim()}
              placeholder="The move you play next becomes the charted road."
              style={{ ...FIELD, resize: "vertical", marginTop: 4, fontWeight: 400, letterSpacing: 0, textTransform: "none" }}
            />
          </label>
        )}

        {/* A LADDER IS FOR A CHOICE THE LEARNER MAKES. At another seat's action
            there is nothing for them to work towards — they are being told what
            just happened. */}
        {decisionIsLearners && (hintsOpen || !!bound.hints.trim()) && (
          <>
            <label style={{ ...SMALLCAPS, display: "block", color: MAROON, marginTop: 9 }}>
              Custom hints
              <textarea
                value={bound.hints}
                onChange={(e) => setBound({ hints: e.target.value })}
                rows={3}
                autoFocus={hintsOpen && !bound.hints.trim()}
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
          </>
        )}

        {/* The adders — 44px, because they are the two things most often
            reached for on a phone. */}
        {(!(whyOpen || bound.why.trim()) ||
          (decisionIsLearners && !(hintsOpen || bound.hints.trim()))) && (
          <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
            {!(whyOpen || bound.why.trim()) && (
              <button
                type="button"
                onClick={() => setWhyOpen(true)}
                style={{
                  flex: 1, minHeight: 44, borderRadius: 9,
                  borderWidth: 1, borderStyle: "dashed", borderColor: LINE,
                  background: PAPER, cursor: "pointer",
                  fontSize: 12, fontWeight: 700, color: MUTED, fontFamily: "inherit",
                }}
              >
                + Why it&rsquo;s right
              </button>
            )}
            {decisionIsLearners && !(hintsOpen || bound.hints.trim()) && (
              <button
                type="button"
                onClick={() => setHintsOpen(true)}
                style={{
                  flex: 1, minHeight: 44, borderRadius: 9,
                  borderWidth: 1, borderStyle: "dashed", borderColor: LINE,
                  background: PAPER, cursor: "pointer",
                  fontSize: 12, fontWeight: 700, color: MUTED, fontFamily: "inherit",
                }}
              >
                + Hint ladder
              </button>
            )}
          </div>
        )}

        {/* ── the advisors, one chip row: Owlee's draft ladder and — in the
               studio — the machines' view. ── */}
        {!editKey && liveKey && (
          <div style={{ marginTop: 9, paddingTop: 8, borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "#f2e8d2" }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button
                type="button"
                aria-expanded={owleeOpen}
                onClick={askOwlee}
                style={{ ...ADVISOR_CHIP, cursor: "pointer", ...(owleeOpen ? { background: GREEN, borderColor: GREEN, color: CREAM } : {}) }}
              >
                Owlee would say…
                <Chevron open={owleeOpen} color={owleeOpen ? CREAM : GREEN} />
              </button>
              {author && (
                <button
                  type="button"
                  onClick={askMachines}
                  disabled={advice.kind === "loading"}
                  style={{ ...ADVISOR_CHIP, cursor: advice.kind === "loading" ? "default" : "pointer", ...(advice.kind !== "idle" && advice.kind !== "loading" ? { background: GREEN, borderColor: GREEN, color: CREAM } : {}) }}
                >
                  {advice.kind === "loading" ? "Asking the machines…" : "The machines"}
                </button>
              )}
            </div>
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
                    {/* Each rung is its own card with its own + — the coach
                        picks the rungs worth keeping, one at a time (owner
                        direction 2026-08-16: never all-or-nothing), and edits
                        them in the field like their own words. */}
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
                                flex: "none", width: 30, height: 30, borderRadius: "50%",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                background: taken ? GREEN : "transparent",
                                borderWidth: 1, borderStyle: "solid",
                                borderColor: taken ? GREEN : full ? LINE : GREEN,
                                color: taken ? "#fff" : full ? FAINT : GREEN,
                                fontSize: 15, fontWeight: 700, lineHeight: 1,
                                fontFamily: "inherit",
                                cursor: taken || full ? "default" : "pointer",
                              }}
                            >
                              {taken ? <Tick size={12} /> : "+"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 7 }}>
                      {/* The whole ladder at once — only into an EMPTY field,
                          never over the coach's words. */}
                      {!bound.hints.trim() && (
                        <button
                          type="button"
                          onClick={() => setBound({ hints: owlee.hints.join("\n") })}
                          style={{
                            minHeight: 30, padding: 0, background: "transparent", borderWidth: 0,
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
            {author && adviceResults}
          </div>
        )}
      </div>
    ) : (
      <div style={{ ...SECTION, display: "flex", alignItems: "flex-start", gap: 9 }}>
        <span aria-hidden style={{ flex: "none", marginTop: 1 }}>
          {boardOver ? (
            <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden focusable="false">
              <circle cx="9" cy="9" r="8" fill="none" stroke={GREEN} strokeWidth="1.4" />
              <path d="M5.2 9.3l2.6 2.6L12.9 6.5" fill="none" stroke={GREEN} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden focusable="false">
              <circle cx="9" cy="9" r="8" fill="none" stroke={FAINT} strokeWidth="1.4" />
              <path d="M9 5v4.3l2.8 1.9" fill="none" stroke={FAINT} strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          )}
        </span>
        <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5, color: MUTED }}>
          {boardOver
            ? "The line is complete — the last beat is publishing it."
            : "Waiting for your next decision — the robots are playing."}
        </p>
      </div>
    );

  /* ── the notes, behind the foot's counter ── */
  const notesView = (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {savedEntries.length === 0 ? (
        <div
          style={{
            borderWidth: 1, borderStyle: "dashed", borderColor: "#d3ccbb", borderRadius: 11,
            padding: 16, textAlign: "center", display: "flex", flexDirection: "column", gap: 5,
          }}
        >
          <span style={{ fontSize: 12.5, fontWeight: 700, color: MUTED }}>Nothing noted yet</span>
          <span style={{ fontSize: 11.5, lineHeight: 1.5, color: FAINT }}>
            A board can teach with three good notes. It cannot teach with none.
          </span>
        </div>
      ) : (
        savedEntries.map(([k, d]) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setEditKey(k === liveKey ? null : k);
              setNotesOpen(false);
              setBeatPick("line");
            }}
            style={{
              ...SECTION, width: "100%", textAlign: "left", cursor: "pointer",
              display: "flex", flexDirection: "column", gap: 6, fontFamily: "inherit",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
              <span
                style={{
                  flex: "none", padding: "3px 9px", borderRadius: 11,
                  background: MAROON, color: CREAM, fontSize: 10.5, fontWeight: 700,
                }}
              >
                {d.label || k}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 10, color: FAINT }}>{draftSummary(d)}</span>
              <span style={{ flex: "none", fontSize: 10, fontWeight: 700, color: GREEN }}>
                {boundKey === k && editKey ? "editing" : "edit"}
              </span>
            </span>
            {/* WHERE THE TABLE WAS — the position this note was written at. */}
            {positionStrip(k)}
            {d.note.trim() && (
              <span style={{ fontSize: 12, lineHeight: 1.5, color: INK }}>{d.note.trim()}</span>
            )}
          </button>
        ))
      )}
    </div>
  );

  /* ── beat one: what the board is FOR ── */
  const setupBeat = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={SECTION}>
        <div style={{ ...SMALLCAPS, color: MAROON, marginBottom: 6 }}>What this board teaches</div>
        {lessonPicker(false)}
      </div>

      <div style={SECTION}>
        <div style={{ ...SMALLCAPS, color: MAROON, marginBottom: 7 }}>How tightly they&rsquo;re held</div>
        <div style={{ display: "flex", gap: 6 }}>
          {(
            [
              ["locked", "Locked"],
              ["guided", "Guided"],
              ["free", "Free"],
            ] as [CuratedConstraint, string][]
          ).map(([value, label]) => {
            const on = settings.constraint === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={on}
                onClick={() => setSettings((s) => ({ ...s, constraint: value }))}
                style={{
                  flex: 1, minHeight: 44, borderRadius: 9,
                  borderWidth: 1, borderStyle: "solid", borderColor: on ? GREEN : LINE,
                  background: on ? "#f0f7f2" : PAPER,
                  color: on ? GREEN : MUTED,
                  fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p style={{ margin: "7px 0 0", fontSize: 11, lineHeight: 1.45, color: MUTED }}>
          {settings.constraint === "locked"
            ? "Only your line plays — a wrong move never leaves their hand."
            : settings.constraint === "free"
              ? "No interruptions. Your notes and hints wait until they ask."
              : "They can stray — the robots hold, and your nudge offers the take-back."}
        </p>
      </div>

      <div style={{ ...SECTION, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ ...SMALLCAPS, display: "block", color: MAROON }}>The learner sits</span>
          <span style={{ display: "block", marginTop: 2, fontSize: 13, fontWeight: 700, color: INK }}>
            {SEAT_NAME[settings.learnerSeat]} — where you are now
          </span>
        </span>
        <span
          aria-hidden
          style={{
            flex: "none", width: 34, height: 34, borderRadius: 9,
            background: "#f0f7f2", borderWidth: 1, borderStyle: "solid", borderColor: GREEN,
            color: GREEN, fontSize: 13, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {settings.learnerSeat}
        </span>
      </div>
    </div>
  );

  /* ── beat two: the line, and what the board has earned ── */
  const lineBeat = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {decisionCard}
      <div style={SECTION}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
          <span style={{ ...SMALLCAPS, flex: 1, color: MAROON }}>What this board carries</span>
          <span style={{ flex: "none", fontSize: 10.5, fontWeight: 700, color: MUTED }}>
            {carried} of 5
          </span>
        </div>
        {carriesRow(30)}
      </div>
    </div>
  );

  /* ── beat three: what the learner will get, then the button ── */
  const publishBeat = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* THE CHECK. The old rail's row of struck-through chips said the same
          thing in half the words and none of the meaning: this says what is
          missing, and offers the way to fix it. */}
      <div style={{ ...SECTION, padding: 0, overflow: "hidden" }}>
        <div
          style={{
            display: "flex", alignItems: "baseline", gap: 8, padding: "10px 12px",
            borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "#f2e8d2",
          }}
        >
          <span style={{ ...SMALLCAPS, flex: 1, color: MAROON }}>What your learner gets</span>
          <span style={{ flex: "none", fontSize: 10.5, fontWeight: 700, color: GREEN }}>
            {checks.filter((c) => c.on).length} of {checks.length}
          </span>
        </div>
        {checks.map((c) => (
          <div
            key={c.label}
            style={{
              display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 12px",
              borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "#f7f3e6",
            }}
          >
            <span
              aria-hidden
              style={{
                flex: "none", marginTop: 1, width: 18, height: 18, borderRadius: "50%",
                background: c.on ? GREEN : "transparent",
                borderWidth: 1, borderStyle: c.on ? "solid" : "dashed",
                borderColor: c.on ? GREEN : LINE,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {c.on && <Tick size={10} />}
            </span>
            <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: c.on ? INK : MUTED }}>{c.label}</span>
              <span style={{ fontSize: 10.5, lineHeight: 1.45, color: MUTED }}>{c.note}</span>
            </span>
            {!c.on && c.fix && (
              <button
                type="button"
                onClick={() => {
                  setNotesOpen(false);
                  setBeatPick(c.fix!);
                }}
                style={{
                  flex: "none", minHeight: 36, padding: "0 10px", borderRadius: 8,
                  borderWidth: 1, borderStyle: "solid", borderColor: LINE,
                  background: FIELD_BG, color: GREEN,
                  fontSize: 11, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
                }}
              >
                Fix
              </button>
            )}
          </div>
        ))}
      </div>

      <div style={SECTION}>
        <label style={{ ...SMALLCAPS, display: "block", color: MAROON }}>
          Call it
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            placeholder={`${boardName} · curated`}
            style={{ ...FIELD, minHeight: 44, marginTop: 4, fontWeight: 600, letterSpacing: 0, textTransform: "none" }}
          />
        </label>
      </div>

      {/* The coach's words AROUND the board, folded: three fields most boards
          leave empty, and none of them is the point of this beat. */}
      <div style={{ ...SECTION, padding: 0, overflow: "hidden" }}>
        <button
          type="button"
          onClick={() => setFramingOpen((v) => !v)}
          aria-expanded={framingOpen}
          style={{
            width: "100%", minHeight: 48, padding: "0 12px", background: "transparent",
            borderWidth: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
            display: "flex", alignItems: "center", gap: 9,
          }}
        >
          <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>Your words around the board</span>
            <span style={{ fontSize: 10.5, color: MUTED }}>
              {[
                settings.intro.trim() ? "intro" : null,
                settings.debrief.trim() ? "debrief" : null,
                settings.pin.trim() ? "pinned read" : null,
              ]
                .filter(Boolean)
                .join(" · ") || "Nothing written yet"}
            </span>
          </span>
          <Chevron open={framingOpen} />
        </button>
        {framingOpen && (
          <div
            style={{
              padding: "2px 12px 12px", display: "flex", flexDirection: "column", gap: 9,
              borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "#f2e8d2",
            }}
          >
            <label style={{ ...SMALLCAPS, display: "block", color: MAROON, marginTop: 9 }}>
              Before they play (intro)
              <textarea
                value={settings.intro}
                onChange={(e) => setSettings((s) => ({ ...s, intro: e.target.value }))}
                rows={2}
                maxLength={500}
                placeholder="Your framing, shown before their first decision."
                style={{ ...FIELD, resize: "vertical", marginTop: 4, fontWeight: 400, letterSpacing: 0, textTransform: "none" }}
              />
            </label>
            <label style={{ ...SMALLCAPS, display: "block", color: MAROON }}>
              When the board ends (debrief)
              <textarea
                value={settings.debrief}
                onChange={(e) => setSettings((s) => ({ ...s, debrief: e.target.value }))}
                rows={2}
                maxLength={500}
                placeholder="Your closing words, shown when the board completes."
                style={{ ...FIELD, resize: "vertical", marginTop: 4, fontWeight: 400, letterSpacing: 0, textTransform: "none" }}
              />
            </label>
            <label style={{ ...SMALLCAPS, display: "block", color: MAROON }}>
              Pinned read (rides the Know pane)
              <input
                type="text"
                value={settings.pin}
                onChange={(e) => setSettings((s) => ({ ...s, pin: e.target.value }))}
                maxLength={220}
                placeholder='e.g. "West is the danger hand."'
                style={{ ...FIELD, minHeight: 44, marginTop: 4, fontWeight: 400, letterSpacing: 0, textTransform: "none" }}
              />
            </label>
          </div>
        )}
      </div>

      {!boardOver && (
        <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: "#9c5a12" }}>
          Play the line to the last trick and this button opens — the recording is
          what the learner follows.
        </p>
      )}
      {error && <p style={{ margin: 0, fontSize: 11.5, color: "#b91c1c" }}>{error}</p>}
    </div>
  );

  /* ── the finish: the one moment worth a flourish ── */
  const finishPanel = (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "8px 0" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
        <Badge size={62} />
        <p style={{ margin: 0, textAlign: "center", fontFamily: DISPLAY, fontSize: 17, fontWeight: 700, lineHeight: 1.25, color: INK }}>
          {title.trim() || `${boardName} · curated`}
          <span style={{ display: "block", fontSize: 13.5, fontWeight: 400, color: GREEN }}>
            is on your shelf
          </span>
        </p>
      </div>

      <div style={SECTION}>
        <div style={{ ...SMALLCAPS, color: MAROON, marginBottom: 8 }}>It carries</div>
        {carriesRow(30)}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {published && (
          <PreviewAsLearnerButton entryId={published} tableBase="/m/table/" />
        )}
        <a
          href={published ? `/m/curated/${encodeURIComponent(published)}` : "#"}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            minHeight: 44, borderRadius: 10,
            borderWidth: 1, borderStyle: "solid", borderColor: GREEN,
            color: GREEN, fontSize: 13, fontWeight: 700, textDecoration: "none",
          }}
        >
          Edit the deal
        </a>
      </div>

      <p style={{ margin: 0, fontSize: 11, lineHeight: 1.55, color: MUTED }}>
        Assign it from <b>Assignments</b> — the learner plays this exact board, with
        your voice beside Owlee&rsquo;s at every decision you noted.
      </p>
    </div>
  );

  /* ── the foot: the count, and the one action ── */
  const foot = (
    <div
      style={{
        flex: "none", display: "flex", alignItems: "center", gap: 9,
        padding: "9px 12px", background: FIELD_BG,
        borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: CARD_EDGE,
      }}
    >
      <button
        type="button"
        onClick={() => setNotesOpen((v) => !v)}
        aria-pressed={notesOpen}
        style={{
          flex: "none", minHeight: 44, padding: "0 11px", borderRadius: 10,
          borderWidth: 1, borderStyle: "solid", borderColor: notesOpen ? GREEN : LINE,
          background: notesOpen ? "#f0f7f2" : PAPER, cursor: "pointer", fontFamily: "inherit",
          display: "flex", alignItems: "center", gap: 6,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: notesOpen ? GREEN : INK }}>{saved}</span>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: notesOpen ? GREEN : MUTED }}>
          noted
        </span>
      </button>
      {beat === "publish" ? (
        <button
          type="button"
          onClick={() => void publish()}
          disabled={publishing || !boardOver}
          style={{
            flex: 1, minHeight: 46, borderRadius: 10, borderWidth: 0,
            background: publishing || !boardOver ? "#9db3a5" : GREEN,
            color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: "inherit",
            cursor: publishing || !boardOver ? "default" : "pointer",
            boxShadow: publishing || !boardOver ? "none" : "0 2px 0 #0a3820",
          }}
        >
          {publishing ? "Publishing…" : "Publish curated deal"}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            setNotesOpen(false);
            setBeatPick(beat === "setup" ? "line" : "publish");
          }}
          style={{
            flex: 1, minHeight: 46, borderRadius: 10, borderWidth: 0,
            background: GREEN, color: "#fff", fontSize: 14, fontWeight: 700,
            fontFamily: "inherit", cursor: "pointer", boxShadow: "0 2px 0 #0a3820",
          }}
        >
          {beat === "setup" ? "Start the line →" : boardOver ? "Publish it →" : "Ready to publish →"}
        </button>
      )}
    </div>
  );

  /* ─────────────────────────── the shell ─────────────────────────── */

  // THE STUDIO: a tracker, one beat, one action. The body is the only thing
  // that scrolls, so the tracker and the action never leave the screen inside
  // the app's coach band.
  if (author) {
    return (
      <div
        style={{
          boxSizing: "border-box", background: CREAM, fontSize: 12.5, color: INK,
          display: "flex", flexDirection: "column",
          ...(fill
            ? { width: "100%", height: "100%", minHeight: 0 }
            : {
                width: 260,
                borderWidth: 1, borderStyle: "solid", borderColor: LINE, borderRadius: 11,
                overflow: "hidden",
              }),
        }}
      >
        {!published && tracker}
        <div
          style={{
            padding: "11px 12px 12px",
            display: "flex", flexDirection: "column", gap: 10,
            ...(fill ? { flex: 1, minHeight: 0, overflowY: "auto" } : {}),
          }}
        >
          {published
            ? finishPanel
            : notesOpen
              ? notesView
              : beat === "setup"
                ? setupBeat
                : beat === "line"
                  ? lineBeat
                  : publishBeat}
        </div>
        {!published && foot}
      </div>
    );
  }

  // THE LEGACY v1 DOOR (?curate=1): annotate your own sitting. No lesson, no
  // board settings, nothing to stage — the plain column it always was.
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
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <Badge />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontFamily: DISPLAY, fontSize: 15, fontWeight: 700, color: INK, lineHeight: 1.2 }}>
            Curating this board
          </span>
          <span style={{ fontSize: 10.5, color: MUTED }}>Play the line you want to teach</span>
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
        finishPanel
      ) : (
        <>
          {decisionCard}
          {savedEntries.length > 0 && (
            <div style={SECTION}>
              <div style={{ ...SMALLCAPS, color: MAROON, marginBottom: 6 }}>Your annotations</div>
              {notesView}
            </div>
          )}
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
                  style={{ ...FIELD, minHeight: 44, marginTop: 4, fontWeight: 400, letterSpacing: 0, textTransform: "none" }}
                />
              </label>
              <button
                type="button"
                onClick={() => void publish()}
                disabled={publishing}
                style={{
                  marginTop: 9, width: "100%", minHeight: 44,
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
                  No annotations yet — the learner would get the board and the line,
                  but none of your voice.
                </p>
              )}
              {error && <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "#b91c1c" }}>{error}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

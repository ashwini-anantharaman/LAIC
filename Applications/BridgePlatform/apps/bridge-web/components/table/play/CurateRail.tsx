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
  const [lessonOpen, setLessonOpen] = useState(false);
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
            {author ? "The studio" : "Curating this board"}
          </span>
          <span style={{ fontSize: 10.5, color: MUTED }}>
            {author
              ? // WHO DOES WHAT (owner direction 2026-08-19), and it splits by
                // phase: the coach bids all four hands — the contract is the
                // lesson's frame — then sits where the learner will while the
                // robots play the other three chairs.
                `You bid every hand, then play ${SEAT_NAME[settings.learnerSeat]} where the learner will — the robots play the rest`
              : "Play the line you want to teach"}
          </span>
          {author && lineSummary && (
            <span style={{ display: "block", fontSize: 10, fontWeight: 700, color: GREEN, marginTop: 1 }}>
              {lineSummary}
            </span>
          )}
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

      {/* ── the lesson, in view for the whole sitting (folded away until
             asked for: the strip already says what it IS, and the whole
             catalogue open by default would bury the annotation field this
             rail exists for) ── */}
      {author && !published && (
        <div
          style={{
            background: PAPER, borderRadius: 9, padding: "8px 10px",
            borderWidth: 1, borderStyle: "solid", borderColor: LINE,
            display: "flex", flexDirection: "column", gap: 7,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ ...SMALLCAPS, flex: "none", color: MAROON }}>Teaches</span>
            <span
              style={{
                flex: 1, minWidth: 0, fontSize: 11.5, lineHeight: 1.35,
                fontWeight: lessonSet ? 700 : 400,
                color: lessonSet ? INK : FAINT,
                overflowWrap: "break-word",
              }}
            >
              {lessonSet
                ? lessonSummary(settings.kTags, settings.kItems)
                : "Nothing set — the learner's Know panel shows its usual cards"}
            </span>
            <button
              type="button"
              onClick={() => setLessonOpen((v) => !v)}
              aria-expanded={lessonOpen}
              style={{
                flex: "none", background: "transparent", borderWidth: 0,
                color: GREEN, fontSize: 10.5, fontWeight: 700,
                fontFamily: "inherit", cursor: "pointer", padding: 0,
              }}
            >
              {lessonOpen ? "done" : lessonSet ? "change" : "set"}
            </button>
          </div>
          {lessonOpen && lessonPicker(false)}
        </div>
      )}

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
          {boundKey && (boundLabel || editKey) ? (
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
                {/* WHOSE MOMENT: the learner's own decision, or one of the
                    other three seats — a word there is read when the board
                    comes back to the learner. */}
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

              {/* A LADDER IS FOR A CHOICE THE LEARNER MAKES. At another
                  seat's action there is nothing for them to work towards —
                  they are being told what just happened. */}
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

              {/* The adders — a short card until the coach reaches for more. */}
              {(!(whyOpen || bound.why.trim()) ||
                (decisionIsLearners && !(hintsOpen || bound.hints.trim()))) && (
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  {!(whyOpen || bound.why.trim()) && (
                    <button
                      type="button"
                      onClick={() => setWhyOpen(true)}
                      style={{
                        border: `1px dashed ${LINE}`, background: "transparent",
                        borderRadius: 999, padding: "5px 11px", cursor: "pointer",
                        fontSize: 11, fontWeight: 700, color: MUTED, fontFamily: "inherit",
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
                        border: `1px dashed ${LINE}`, background: "transparent",
                        borderRadius: 999, padding: "5px 11px", cursor: "pointer",
                        fontSize: 11, fontWeight: 700, color: MUTED, fontFamily: "inherit",
                      }}
                    >
                      + Hint ladder
                    </button>
                  )}
                </div>
              )}

              {/* ── the advisors, one chip row (UI/UX pass 2026-08-18):
                     Owlee's draft ladder and — in the studio — the machines'
                     view, side by side instead of two stacked text links. ── */}
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
                      <span aria-hidden style={{ fontSize: 7, transform: owleeOpen ? "rotate(180deg)" : undefined }}>▼</span>
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
                  {author && adviceResults}
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
              {author && (
                <>
                  {/* WHAT SHIPS (UI/UX pass 2026-08-18): the learner's whole
                      experience in one glance, before the button commits it. */}
                  <div
                    style={{
                      display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 11,
                      paddingBottom: 10, borderBottomWidth: 1, borderBottomStyle: "solid",
                      borderBottomColor: "#f2e8d2",
                    }}
                  >
                    {(
                      [
                        [`${SEAT_NAME[settings.learnerSeat]} · ${settings.constraint}`, true],
                        [`${saved} annotation${saved === 1 ? "" : "s"}`, saved > 0],
                        [
                          `${annotations().filter((a) => a.hints).length} ladder${annotations().filter((a) => a.hints).length === 1 ? "" : "s"}`,
                          annotations().some((a) => a.hints),
                        ],
                        [
                          lessonSet
                            ? `teaches ${lessonSummary(settings.kTags, settings.kItems).toLowerCase()}`
                            : "no lesson",
                          lessonSet,
                        ],
                        ["intro", !!settings.intro.trim()],
                        ["debrief", !!settings.debrief.trim()],
                        ["pinned read", !!settings.pin.trim()],
                      ] as [string, boolean][]
                    ).map(([label, on]) => (
                      <span
                        key={label}
                        style={{
                          fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
                          borderRadius: 999, padding: "3px 9px",
                          background: on ? "#e6f2ea" : "#f4ecd6",
                          color: on ? GREEN : FAINT,
                          textDecorationLine: on ? "none" : "line-through",
                        }}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                  {/* The board settings, one last look before they ship. The
                      learner's seat is NOT editable here — the annotations
                      above are anchored to it. */}
                  <div style={{ ...SMALLCAPS, color: MAROON, marginBottom: 6 }}>
                    Learner sits {SEAT_NAME[settings.learnerSeat]} · board settings
                  </div>
                  {/* THE LESSON (owner direction 2026-08-18; the cards
                      themselves, filtered by topic, 2026-08-19). Editable here
                      as well as on the deal screen, because what a board
                      turned out to teach is often clearer once the line is
                      played than it was before it. */}
                  <div style={{ ...SMALLCAPS, display: "block", color: MAROON, marginBottom: 5 }}>
                    What this board teaches
                  </div>
                  <div style={{ marginBottom: 11 }}>{lessonPicker(true)}</div>
                  <label style={{ ...SMALLCAPS, display: "block", color: MAROON }}>
                    How tightly they&rsquo;re held
                    <select
                      value={settings.constraint}
                      onChange={(e) =>
                        setSettings((s) => ({ ...s, constraint: e.target.value as CuratedConstraint }))
                      }
                      style={{ ...FIELD, marginTop: 4, fontWeight: 400, letterSpacing: 0, textTransform: "none" }}
                    >
                      <option value="locked">Locked — only your line plays</option>
                      <option value="guided">Guided — nudge and take-back</option>
                      <option value="free">Free — notes and hints only</option>
                    </select>
                  </label>
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
                  <label style={{ ...SMALLCAPS, display: "block", color: MAROON, marginTop: 9 }}>
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
                  <label style={{ ...SMALLCAPS, display: "block", color: MAROON, marginTop: 9, marginBottom: 9 }}>
                    Pinned read (rides the Know pane)
                    <input
                      type="text"
                      value={settings.pin}
                      onChange={(e) => setSettings((s) => ({ ...s, pin: e.target.value }))}
                      maxLength={220}
                      placeholder='e.g. "West is the danger hand."'
                      style={{ ...FIELD, marginTop: 4, fontWeight: 400, letterSpacing: 0, textTransform: "none" }}
                    />
                  </label>
                </>
              )}
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
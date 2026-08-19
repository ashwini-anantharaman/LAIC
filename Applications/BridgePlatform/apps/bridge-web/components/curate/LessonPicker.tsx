"use client";

// WHAT THIS BOARD TEACHES — the studio's lesson picker (owner direction
// 2026-08-19: "this section shouldn't be showing tags but rather the K-items
// themselves… the tags will be used as a way to filter the K-items").
//
// So the list IS the catalogue. The coach picks the CARDS the learner's Know
// panel will lead with, and the topic above the list is the filter that makes
// 49 cards choosable. Picking a topic also names the lesson ("Trump
// management"), which is why it is stored with the board and not thrown away:
// the topic says what the board is about, the cards say what the learner meets.
//
// TWO STEPS, ONE AT A TIME (owner report 2026-08-19: "extremely complicated and
// packed"). The first cut put all 26 topics on screen as chips and all 49 cards
// under them in a scrollbox, and it read as a wall. The rule now:
//
//   · CLOSED until asked for. The host shows the lesson in a line of prose;
//     the picker opens on a tap. Nothing is set on most boards, and a screen
//     is not obliged to show the machinery for a field nobody filled in.
//   · ONE TOPIC CONTROL, not twenty-six chips. A <select> — grouped by where
//     the topic is taught, each option carrying its card count — collapses the
//     wall into the control this screen already uses for seats and constraints.
//     Chosen topics become removable chips, which is the only place they need
//     to be visible.
//   · NO CARDS UNTIL A TOPIC. The card list starts empty with one sentence
//     telling the coach where to start; browsing the whole catalogue is one tap
//     away for the coach who wants it. A default of 49 rows is not a default.
//   · CARDS THE KNOWLEDGE BASE CANNOT DRAW YET ARE FOLDED AWAY, counted
//     honestly on the line that reveals them. They are declared on purpose
//     (kItems.ts) and a coach may still choose one; they are simply not what
//     someone building a board today is shopping for.
//
// PLAIN BUTTONS, NEVER CHECKBOX LABELS (bug report 2026-08-18, kept): a
// visually-hidden checkbox inside a <label> is still focusable, and a tap on
// one inside the app's WebView scrolls the screen to a 1px box. A
// <button type="button"> cannot submit the form, cannot take focus anywhere
// surprising, and paints its own selected state from React.

import { useMemo, useState } from "react";

import {
  isBuildable, itemsName, kItemsForIds, lessonName, K_ITEMS, K_TAGS,
  type KItemDef, type KItemId, type KPhase, type KTag, type KTagDef,
} from "@/lib/coach/kItems";
import { MAX_DEAL_ITEMS, MAX_DEAL_TAGS, tagCensus } from "@/lib/coach/kSelection";

/* ───────────────────────── shelves ───────────────────────── */

/** Where a topic or a card is taught — the shelf it sits on, in both lists, so
 *  the topic menu and the card list read in the same order. */
type Shelf = "auction" | "play" | "both";

const SHELF_LABEL: Record<Shelf, string> = {
  auction: "In the bidding",
  play: "In the play",
  both: "Throughout",
};
const SHELVES: readonly Shelf[] = ["auction", "play", "both"];

const shelfOf = (phases: readonly KPhase[]): Shelf =>
  phases.length > 1 ? "both" : phases[0] === "play" ? "play" : "auction";

/** The topic menu, grouped — with each topic's count of cards a producer can
 *  actually draw today, so "Finesses (4)" and "Entries (none yet)" are told
 *  apart before the coach commits a board to one. */
const TOPIC_GROUPS: readonly (readonly [Shelf, readonly (readonly [KTagDef, number])[]])[] =
  SHELVES.map((shelf) => [
    shelf,
    K_TAGS.filter((t) => shelfOf(t.phases) === shelf).map(
      (t) => [t, tagCensus(t.tag).buildable] as const,
    ),
  ]);

/* ───────────────────────── skins ───────────────────────── */

interface Skin {
  paper: string;
  line: string;
  ink: string;
  muted: string;
  faint: string;
  accent: string;
  accentBg: string;
  /** The tiny small-caps heading colour — maroon in the coach's own surfaces. */
  head: string;
  /** The rail is 250px wide, and its host scrolls; the deal screens have room,
   *  and a scrollbox inside a scrolling page is how a screen feels packed. */
  compact: boolean;
}

const SKINS: Record<"web" | "app" | "rail", Skin> = {
  web: {
    paper: "#ffffff", line: "#d4d4d4", ink: "#171717", muted: "#525252", faint: "#a3a3a3",
    accent: "#065f46", accentBg: "#ecfdf5", head: "#541015", compact: false,
  },
  app: {
    paper: "#ffffff", line: "#e0d7c2", ink: "#1f1f1f", muted: "#5e5749", faint: "#a49d8e",
    accent: "#105431", accentBg: "#f0f7f2", head: "#541015", compact: false,
  },
  rail: {
    paper: "#ffffff", line: "#e0d7c2", ink: "#1f1f1f", muted: "#7b7466", faint: "#a49d8e",
    accent: "#105431", accentBg: "#e6f2ea", head: "#541015", compact: true,
  },
};

const SMALLCAPS = (s: Skin) =>
  ({
    fontSize: 9.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase",
    color: s.faint,
  }) as const;

/** The one link-shaped control this component uses. `QUIET` sits at the end of
 *  a row and must not shrink; `QUIET_WRAP` is for the footer lines, which are
 *  sentences and have to fold inside the rail's 250px. */
const QUIET = (s: Skin) =>
  ({
    background: "transparent", borderWidth: 0, padding: 0, flex: "none",
    color: s.accent, fontSize: 10.5, fontWeight: 700, fontFamily: "inherit",
    cursor: "pointer",
  }) as const;

const QUIET_WRAP = (s: Skin) =>
  ({
    ...QUIET(s), flex: "0 1 auto", maxWidth: "100%", textAlign: "left",
    whiteSpace: "normal", lineHeight: 1.4,
  }) as const;

/* ───────────────────────── the lesson, in words ───────────────────────── */

/**
 * How the choice reads in one line — the picker's own closed state, the rail's
 * "Teaches" strip and the publish panel's chip row all need it, and all three
 * need it to say the same thing.
 */
export function lessonSummary(tags: readonly KTag[], items: readonly KItemId[]): string {
  const n = kItemsForIds(items).length;
  const topic = lessonName(tags);
  if (n) {
    const cards = `${n} card${n === 1 ? "" : "s"}`;
    return topic ? `${topic} · ${cards}` : itemsName(items);
  }
  return topic ? `${topic} · all its cards` : "";
}

/** Whether a choice amounts to a lesson at all — either half is enough. */
export const hasLesson = (tags: readonly KTag[], items: readonly KItemId[]): boolean =>
  tags.length > 0 || items.length > 0;

/* ───────────────────────── the picker ───────────────────────── */

export function LessonPicker({
  tags,
  items,
  onToggleTag,
  onToggleItem,
  onClear,
  skin: which = "web",
  fold = true,
}: Readonly<{
  /** The topics — the filter, and what names the lesson. */
  tags: readonly KTag[];
  /** The cards the learner's Know panel will lead with. */
  items: readonly KItemId[];
  onToggleTag: (tag: KTag) => void;
  onToggleItem: (id: KItemId) => void;
  /** Drop every card pick — the way back out of a filtered hunt. */
  onClear?: () => void;
  skin?: "web" | "app" | "rail";
  /**
   * Show the choice as a line of prose until the coach asks to change it.
   * Pass false where the HOST already provides that line and its toggle (the
   * studio rail's "Teaches" strip), so the fold is not offered twice.
   */
  fold?: boolean;
}>) {
  const s = SKINS[which];
  const [open, setOpen] = useState(!fold);
  // Two escape hatches, both closed by default and both counted where they
  // open: the whole catalogue with no topic set, and the cards no producer can
  // draw yet. Neither is what a coach building a board is looking for first.
  const [browsing, setBrowsing] = useState(false);
  const [showUnready, setShowUnready] = useState(false);

  const set = hasLesson(tags, items);
  const full = items.length >= MAX_DEAL_ITEMS;

  const { rows, unready, headers } = useMemo(() => {
    const topics = new Set<string>(tags);
    const picked = new Set<string>(items);
    // The pool: the chosen topics' cards, or the whole catalogue when the coach
    // asked to browse. A card already picked is ALWAYS in it — a choice that
    // vanishes when the topic changes reads as a choice lost.
    const pool = K_ITEMS.filter(
      (k) =>
        picked.has(k.id) ||
        (topics.size ? k.tags.some((t) => topics.has(t)) : browsing),
    );
    const ready = (k: KItemDef): boolean => isBuildable(k) || picked.has(k.id);
    return {
      rows: pool.filter((k) => showUnready || ready(k)),
      unready: pool.filter((k) => !ready(k)).length,
      // Shelf headings earn their space only on a long list; a filtered list of
      // six cards is its own heading.
      headers: pool.length > 9,
    };
  }, [tags, items, browsing, showUnready]);

  const body = (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {/* ── step one: the topic ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={{ ...SMALLCAPS(s), color: s.head }}>Topic</span>
        {tags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onToggleTag(tag)}
                aria-label={`Remove ${lessonName([tag])}`}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  borderRadius: 999, padding: "3px 8px 3px 10px",
                  borderWidth: 1, borderStyle: "solid", borderColor: s.accent,
                  background: s.accentBg, color: s.accent,
                  fontSize: 11, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
                }}
              >
                {lessonName([tag])}
                <span aria-hidden style={{ fontSize: 12, lineHeight: 1, opacity: 0.7 }}>
                  ×
                </span>
              </button>
            ))}
          </div>
        )}
        {tags.length < MAX_DEAL_TAGS ? (
          <select
            value=""
            onChange={(e) => {
              const tag = e.target.value as KTag;
              if (tag) onToggleTag(tag);
            }}
            style={{
              width: "100%", boxSizing: "border-box",
              borderRadius: 8, borderWidth: 1, borderStyle: "solid", borderColor: s.line,
              background: s.paper, color: s.ink,
              padding: s.compact ? "5px 7px" : "7px 9px",
              fontSize: s.compact ? 11.5 : 13, fontFamily: "inherit",
            }}
          >
            <option value="">{tags.length ? "Add another topic…" : "Choose a topic…"}</option>
            {TOPIC_GROUPS.map(([shelf, topics]) => (
              <optgroup key={shelf} label={SHELF_LABEL[shelf]}>
                {topics.map(([t, n]) => (
                  <option key={t.tag} value={t.tag} disabled={tags.includes(t.tag)}>
                    {t.label} {n ? `(${n} cards)` : "(none yet)"}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        ) : (
          <span style={{ fontSize: 10.5, color: s.faint }}>
            That&rsquo;s the most topics one board can name — remove one to swap it.
          </span>
        )}
        <span style={{ fontSize: 10.5, lineHeight: 1.45, color: s.muted }}>
          The topic names the lesson, and narrows the cards below.
        </span>
      </div>

      {/* ── step two: the cards ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ ...SMALLCAPS(s), color: s.head, flex: "none" }}>The cards</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 10.5, color: s.faint }}>
            {items.length ? `${items.length} of ${MAX_DEAL_ITEMS} chosen` : ""}
          </span>
          {items.length > 0 && onClear && (
            <button type="button" onClick={onClear} style={QUIET(s)}>
              clear
            </button>
          )}
        </div>

        {rows.length === 0 ? (
          <div
            style={{
              borderRadius: 8, borderWidth: 1, borderStyle: "dashed", borderColor: s.line,
              padding: "12px 11px", textAlign: "center",
            }}
          >
            <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5, color: s.muted }}>
              {tags.length
                ? "No cards for this topic yet — the knowledge base fills them in later."
                : "Choose a topic above, and its cards appear here to pick from."}
            </p>
            {!tags.length && !browsing && (
              <button
                type="button"
                onClick={() => setBrowsing(true)}
                style={{ ...QUIET_WRAP(s), marginTop: 6 }}
              >
                or see all {K_ITEMS.length} cards
              </button>
            )}
          </div>
        ) : (
          <div
            style={{
              borderWidth: 1, borderStyle: "solid", borderColor: s.line, borderRadius: 8,
              background: s.paper, overflow: "hidden",
              // The rail's host is a narrow scrolling column, so the list caps
              // itself there. On the deal screens the page scrolls: a box that
              // scrolls inside it is exactly what "packed" feels like.
              ...(s.compact ? { maxHeight: 240, overflowY: "auto" as const } : {}),
            }}
          >
            {SHELVES.map((shelf) => {
              const list = rows.filter((k) => shelfOf(k.phases) === shelf);
              if (!list.length) return null;
              return (
                <div key={shelf}>
                  {headers && (
                    <div
                      style={{
                        ...SMALLCAPS(s), padding: "4px 9px", background: s.accentBg,
                        borderBottomWidth: 1, borderBottomStyle: "solid",
                        borderBottomColor: s.line,
                      }}
                    >
                      {SHELF_LABEL[shelf]}
                    </div>
                  )}
                  {list.map((k) => (
                    <CardRow
                      key={k.id}
                      item={k}
                      on={items.includes(k.id)}
                      capped={full && !items.includes(k.id)}
                      onToggle={() => onToggleItem(k.id)}
                      s={s}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* the two counted escape hatches */}
        {(unready > 0 || (browsing && !tags.length)) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {unready > 0 && (
              <button
                type="button"
                onClick={() => setShowUnready((v) => !v)}
                title="Declared cards whose knowledge needs the bidding system or the model layer — see kItems.ts tiers."
                style={QUIET_WRAP(s)}
              >
                {showUnready
                  ? "hide cards not ready yet"
                  : `show ${unready} card${unready === 1 ? "" : "s"} not ready yet`}
              </button>
            )}
            {browsing && !tags.length && (
              <button type="button" onClick={() => setBrowsing(false)} style={QUIET_WRAP(s)}>
                stop browsing all cards
              </button>
            )}
          </div>
        )}

        {/* What "no cards chosen" MEANS, said where the choice is made rather
            than discovered by a learner. */}
        {items.length === 0 && (
          <span style={{ fontSize: 10.5, lineHeight: 1.45, color: s.muted }}>
            {tags.length
              ? "Choose none and the learner meets every card this topic covers."
              : "Choose none and the learner's Know panel shows its usual cards."}
          </span>
        )}
      </div>
    </div>
  );

  if (!fold) return body;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: open ? 9 : 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span
          style={{
            flex: 1, minWidth: 0, fontSize: 11.5, lineHeight: 1.4,
            fontWeight: set ? 700 : 400, color: set ? s.ink : s.faint,
            overflowWrap: "break-word",
          }}
        >
          {set
            ? lessonSummary(tags, items)
            : s.compact
              ? "Nothing set — the usual cards"
              : "Nothing set — the learner's Know panel shows its usual cards"}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          style={QUIET(s)}
        >
          {open ? "done" : set ? "change" : "choose"}
        </button>
      </div>
      {open && body}
    </div>
  );
}

/**
 * One card in the catalogue: its headline and the teacher's line on why a
 * learner tracks it. The epistemic tier and the "when" live in the tooltip —
 * true, and useful to whoever maintains the catalogue, but not what a coach
 * choosing a board's cards is reading.
 */
function CardRow({
  item, on, capped, onToggle, s,
}: Readonly<{
  item: KItemDef;
  on: boolean;
  capped: boolean;
  onToggle: () => void;
  s: Skin;
}>) {
  const notYet = !isBuildable(item);
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={capped}
      onClick={onToggle}
      title={`${item.tier} · ${item.when}`}
      style={{
        display: "flex", alignItems: "flex-start", gap: 8, width: "100%", textAlign: "left",
        padding: "7px 9px", background: on ? s.accentBg : "transparent",
        borderWidth: 0, borderBottomWidth: 1, borderBottomStyle: "solid",
        borderBottomColor: "#f2ede0",
        font: "inherit", cursor: capped ? "default" : "pointer",
        opacity: capped ? 0.45 : 1,
      }}
    >
      <span
        aria-hidden
        style={{
          flex: "none", marginTop: 1, width: 15, height: 15, borderRadius: 4,
          borderWidth: 1, borderStyle: "solid",
          borderColor: on ? s.accent : s.line,
          background: on ? s.accent : s.paper,
          color: "#fff", fontSize: 10, lineHeight: "13px", textAlign: "center",
        }}
      >
        {on ? "✓" : ""}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: on ? s.accent : s.ink }}>
          {item.title}
          {notYet && (
            <span style={{ fontWeight: 400, fontSize: 10, color: s.faint }}> · not ready yet</span>
          )}
        </span>
        <span style={{ display: "block", fontSize: 10.5, lineHeight: 1.45, color: s.muted }}>
          {item.why}
        </span>
      </span>
    </button>
  );
}

/* ───────────────────── the choice, as a hook ───────────────────── */

/**
 * The picker's state for a plain FORM (the two deal screens): the choice in
 * React, mirrored into hidden inputs so it reaches FormData without a single
 * focusable control the coach can tap by accident.
 *
 * Removing a topic does NOT drop the cards it found. The coach chose those
 * cards; the topic is only how they found them.
 */
export function useLessonChoice(
  initialTags: readonly KTag[] = [],
  initialItems: readonly KItemId[] = [],
): {
  tags: KTag[];
  items: KItemId[];
  onToggleTag: (tag: KTag) => void;
  onToggleItem: (id: KItemId) => void;
  onClear: () => void;
} {
  const [tags, setTags] = useState<KTag[]>([...initialTags]);
  const [items, setItems] = useState<KItemId[]>([...initialItems]);
  return {
    tags,
    items,
    onToggleTag: (tag) =>
      setTags((prev) =>
        prev.includes(tag)
          ? prev.filter((x) => x !== tag)
          : prev.length >= MAX_DEAL_TAGS
            ? prev
            : [...prev, tag],
      ),
    onToggleItem: (id) =>
      setItems((prev) =>
        prev.includes(id)
          ? prev.filter((x) => x !== id)
          : prev.length >= MAX_DEAL_ITEMS
            ? prev
            : [...prev, id],
      ),
    onClear: () => setItems([]),
  };
}

/** The choice as form fields — read back by the wrapper off one FormData. */
export function LessonFields({
  tags, items,
}: Readonly<{ tags: readonly KTag[]; items: readonly KItemId[] }>) {
  return (
    <>
      {tags.map((t) => (
        <input key={t} type="hidden" name="kTag" value={t} />
      ))}
      {items.map((id) => (
        <input key={id} type="hidden" name="kItem" value={id} />
      ))}
    </>
  );
}

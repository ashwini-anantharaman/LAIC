import { canAccessAdminArea } from "@bridge/nexus-client";
import { redirect } from "next/navigation";

import { LessonField } from "@/components/curate/LessonField";
import { PreviewAsLearnerButton } from "@/components/curate/PreviewAsLearnerButton";
import { ReviseLineButton } from "@/components/curate/ReviseLineButton";
import { callLabel, cardLabel } from "@/lib/coach/position";
import {
  chartedActionAt,
  constraintOf,
  learnerSeatOf,
  lineOf,
  parseCurated,
  type CuratedAt,
} from "@/lib/curated";
import { getBridgeContext } from "@/lib/nexus";
import { libraryStore } from "@/lib/sessions";
import { saveCuratedEditsAction } from "./actions";

const SEAT_NAME = { N: "North", E: "East", S: "South", W: "West" } as const;

// BirdBridge typefaces (loaded in the /m layout).
const N = "var(--font-neco), var(--font-fraunces), serif";
const G = "var(--font-gs), var(--font-karla), sans-serif";
const CREAM = "#fff4d7";
const PAPER = "#ffffff";
const GREEN = "#105431";
const MAROON = "#541015";
const INK = "#1f1f1f";
const MUTED = "#7b7466";
const FAINT = "#a49d8e";
const LINE = "#e0d7c2";

const FIELD: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  border: `1px solid ${LINE}`,
  borderRadius: 8,
  font: `400 13px/1.5 ${G}`,
  color: INK,
  background: "#fffdf6",
};

const SMALLCAPS: React.CSSProperties = {
  font: `600 10px ${G}`,
  letterSpacing: ".14em",
  textTransform: "uppercase",
  color: MAROON,
};

const atLabel = (at: CuratedAt): string =>
  at.kind === "call"
    ? `Bid #${at.auctionIndex + 1}`
    : `Trick ${at.trickIndex + 1}, card ${at.playIndex + 1}`;

/**
 * Post-publish editing of a curated deal (owner pick #6, 2026-08-15): the
 * coach's words — notes, reasons, hint ladders — editable per annotation
 * without replaying the board, plus the board settings and the LESSON (owner
 * ask 2026-08-19). The LINE is fixed: it is the recorded sitting the
 * annotations anchor to. Copy-on-assign means edits reach future assignments
 * only; learners already playing keep the version they were given.
 */
export default async function CuratedEditPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ entryId: string }>;
  searchParams: Promise<{ saved?: string }>;
}>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  const { entryId } = await params;
  const { saved } = await searchParams;

  const entry = await libraryStore().getEntry(entryId);
  if (
    !entry?.curatedJson ||
    (entry.createdBy !== context.nexusUserId && !canAccessAdminArea(context))
  ) {
    redirect("/m/assignments");
  }

  const line = lineOf(entry);
  const payload = parseCurated(entry.curatedJson);
  const { annotations } = payload;
  const learnerSeat = learnerSeatOf(payload);
  const constraint = constraintOf(payload);

  return (
    <main
      style={{
        height: "100%",
        overflowY: "auto",
        background: CREAM,
        padding: "56px 18px calc(96px + env(safe-area-inset-bottom))",
      }}
    >
      <a
        href="/m/assignments"
        style={{ font: `600 12px ${G}`, color: GREEN, textDecoration: "none" }}
      >
        ← Assignments
      </a>
      <h1 style={{ font: `700 24px ${N}`, color: INK, margin: "10px 0 0" }}>
        Edit curated deal
      </h1>
      <p style={{ font: `400 12.5px/1.55 ${G}`, color: "#5e5749", margin: "8px 0 0" }}>
        The recorded line stays as you played it — everything around it is yours
        to change: what the board teaches, how tightly they&rsquo;re held, and your
        words at each decision. Learners already assigned keep the version they
        were given; edits reach everyone you assign from now on.
      </p>

      {saved && (
        <p
          style={{
            font: `500 13px ${G}`,
            background: GREEN,
            color: CREAM,
            borderRadius: 12,
            padding: "10px 14px",
            margin: "14px 0 0",
          }}
        >
          Saved.
        </p>
      )}

      {/* SEE IT AS YOUR LEARNER — first on the page, and OUTSIDE the form on
          purpose. It opens the PUBLISHED board, so an edit still sitting in the
          form below is not in it; keeping it above every field is what makes
          that read the right way round. */}
      <div
        style={{
          background: PAPER,
          border: `1px solid #e8ddc3`,
          borderRadius: 12,
          padding: "12px 13px",
          marginTop: 16,
        }}
      >
        <PreviewAsLearnerButton entryId={entryId} tableBase="/m/table/" />
      </div>

      <form action={saveCuratedEditsAction}>
        <input type="hidden" name="entryId" value={entryId} />

        <div
          style={{
            background: PAPER,
            border: `1px solid #e8ddc3`,
            borderRadius: 12,
            padding: "12px 13px",
            marginTop: 16,
          }}
        >
          <label style={{ ...SMALLCAPS, display: "block" }}>
            Deal name
            <input
              type="text"
              name="name"
              defaultValue={entry.name}
              maxLength={80}
              style={{ ...FIELD, marginTop: 5, letterSpacing: 0, textTransform: "none" }}
            />
          </label>

          {/* The v2 board settings (owner design 2026-08-18) — the coach's to
              change after publish; the learner seat stays (the annotations
              below are anchored to it). */}
          {/* WHAT THE BOARD TEACHES, EDITABLE HERE (owner ask 2026-08-19).
              It used to be publish-time only, carried silently through this
              form — so changing the lesson meant replaying the whole line,
              which is backwards: what a board turned out to teach is usually
              clearer once it exists than it was while building it. */}
          <div style={{ marginTop: 12 }}>
            <p style={{ ...SMALLCAPS, margin: "0 0 6px" }}>What this board teaches</p>
            <LessonField
              skin="app"
              tags={payload.kTags ?? []}
              items={payload.kItems ?? []}
            />
          </div>
          <p style={{ ...SMALLCAPS, margin: "12px 0 0" }}>
            Learner sits {SEAT_NAME[learnerSeat]}
          </p>
          <label style={{ ...SMALLCAPS, display: "block", marginTop: 8 }}>
            How tightly they&rsquo;re held
            <select
              name="constraint"
              defaultValue={constraint}
              style={{ ...FIELD, marginTop: 5, letterSpacing: 0, textTransform: "none" }}
            >
              <option value="locked">Locked — only your line plays</option>
              <option value="guided">Guided — nudge and take-back</option>
              <option value="free">Free — notes and hints only</option>
            </select>
          </label>
          <label style={{ ...SMALLCAPS, display: "block", marginTop: 9 }}>
            Before they play (intro)
            <textarea
              name="intro"
              defaultValue={payload.intro ?? ""}
              rows={2}
              maxLength={500}
              style={{ ...FIELD, resize: "vertical", marginTop: 5, letterSpacing: 0, textTransform: "none" }}
            />
          </label>
          <label style={{ ...SMALLCAPS, display: "block", marginTop: 9 }}>
            When the board ends (debrief)
            <textarea
              name="debrief"
              defaultValue={payload.debrief ?? ""}
              rows={2}
              maxLength={500}
              style={{ ...FIELD, resize: "vertical", marginTop: 5, letterSpacing: 0, textTransform: "none" }}
            />
          </label>
          <label style={{ ...SMALLCAPS, display: "block", marginTop: 9 }}>
            Pinned read (rides the Know pane)
            <input
              type="text"
              name="pin"
              defaultValue={payload.pin ?? ""}
              maxLength={220}
              style={{ ...FIELD, marginTop: 5, letterSpacing: 0, textTransform: "none" }}
            />
          </label>
        </div>

        {annotations.length === 0 && (
          <p
            style={{
              border: "1px dashed #d3ccbb",
              borderRadius: 12,
              padding: 16,
              textAlign: "center",
              font: `400 12.5px ${G}`,
              color: FAINT,
              marginTop: 14,
            }}
          >
            No annotations on this deal.
          </p>
        )}

        {annotations.map((ann, i) => {
          const charted = chartedActionAt(line, ann.at);
          const chartedLabel = charted
            ? charted.call
              ? callLabel(charted.call)
              : charted.card
                ? cardLabel(charted.card)
                : null
            : null;
          return (
            <div
              key={`${i}-${atLabel(ann.at)}`}
              style={{
                background: PAPER,
                border: `1px solid #e8ddc3`,
                borderRadius: 12,
                padding: "12px 13px",
                marginTop: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    padding: "3px 10px",
                    borderRadius: 12,
                    background: MAROON,
                    color: CREAM,
                    font: `600 11px ${G}`,
                  }}
                >
                  {atLabel(ann.at)}
                </span>
                {chartedLabel && (
                  <span style={{ font: `400 12px ${G}`, color: MUTED }}>
                    you charted <b style={{ color: INK }}>{chartedLabel}</b>
                  </span>
                )}
                <label
                  style={{
                    marginLeft: "auto",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    font: `600 11px ${G}`,
                    color: "#b91c1c",
                  }}
                >
                  <input type="checkbox" name={`remove_${i}`} />
                  remove
                </label>
              </div>

              <label style={{ ...SMALLCAPS, display: "block", marginTop: 10 }}>
                Your note to the learner
                <textarea
                  name={`note_${i}`}
                  defaultValue={ann.note ?? ""}
                  rows={3}
                  maxLength={500}
                  style={{ ...FIELD, resize: "vertical", marginTop: 5, letterSpacing: 0, textTransform: "none" }}
                />
              </label>

              <label style={{ ...SMALLCAPS, display: "block", marginTop: 9 }}>
                Why your move is right
                <textarea
                  name={`why_${i}`}
                  defaultValue={ann.why ?? ""}
                  rows={2}
                  maxLength={500}
                  style={{ ...FIELD, resize: "vertical", marginTop: 5, letterSpacing: 0, textTransform: "none" }}
                />
              </label>

              <label style={{ ...SMALLCAPS, display: "block", marginTop: 9 }}>
                Custom hints — one rung per line, 2–5
                <textarea
                  name={`hints_${i}`}
                  defaultValue={(ann.hints ?? []).join("\n")}
                  rows={3}
                  style={{ ...FIELD, resize: "vertical", marginTop: 5, letterSpacing: 0, textTransform: "none" }}
                />
              </label>
            </div>
          );
        })}

        {/* NOTHING ON THIS PAGE SAVES ITSELF, so the button is always here.
            It used to render only when the deal had annotations — defensible
            while this form edited nothing else, and a dead end the moment it
            also edited the lesson and the board settings: a board with no
            annotations (the common case straight after publishing) had no way
            to save at all. */}
        <button
          type="submit"
          style={{
            marginTop: 16,
            width: "100%",
            minHeight: 44,
            background: GREEN,
            border: 0,
            borderRadius: 12,
            color: "#ffffff",
            font: `700 14px ${G}`,
            cursor: "pointer",
            boxShadow: "0 2px 0 #0a3820",
          }}
        >
          Save changes
        </button>
        <p style={{ font: `400 11px/1.5 ${G}`, color: FAINT, margin: "8px 0 0" }}>
          Saves everything above: what the board teaches, how tightly they&rsquo;re
          held, your words.
          {annotations.length > 0
            ? " Emptying every field of an annotation removes it, same as the checkbox."
            : ""}
        </p>
      </form>

      {/* REVISE THE LINE — after the form, and outside it. Like the preview
          above, it carries the SAVED board into the studio, so it must not sit
          among fields whose edits have not been saved yet. */}
      <div
        style={{
          background: PAPER,
          border: `1px solid #e8ddc3`,
          borderRadius: 12,
          padding: "12px 13px",
          marginTop: 12,
        }}
      >
        <ReviseLineButton
          entryId={entryId}
          settings={{
            learnerSeat,
            constraint,
            intro: payload.intro ?? "",
            debrief: payload.debrief ?? "",
            pin: payload.pin ?? "",
            notes: entry.notes ?? "",
            // The lesson rides into the revision — topic AND cards — so
            // republishing keeps what the board teaches instead of quietly
            // dropping it.
            kTags: payload.kTags ?? [],
            kItems: payload.kItems ?? [],
          }}
          annotations={annotations}
          tableBase="/m/table/"
        />
      </div>
    </main>
  );
}

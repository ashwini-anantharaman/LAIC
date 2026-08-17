import { canAccessAdminArea } from "@bridge/nexus-client";
import { redirect } from "next/navigation";

import { callLabel, cardLabel } from "@/lib/coach/position";
import { chartedActionAt, lineOf, parseCurated, type CuratedAt } from "@/lib/curated";
import { getBridgeContext } from "@/lib/nexus";
import { libraryStore } from "@/lib/sessions";
import { saveCuratedEditsAction } from "./actions";

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
 * without replaying the board. The LINE is fixed: it is the recorded sitting
 * the annotations anchor to. Copy-on-assign means edits reach future
 * assignments only; learners already playing keep the version they were
 * given.
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
  const { annotations } = parseCurated(entry.curatedJson);

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
        The recorded line stays as you played it — these are your words at each
        decision. Learners already assigned keep the version they were given;
        edits reach everyone you assign from now on.
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

        {annotations.length > 0 && (
          <>
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
              Emptying every field of an annotation removes it, same as the
              checkbox.
            </p>
          </>
        )}
      </form>
    </main>
  );
}

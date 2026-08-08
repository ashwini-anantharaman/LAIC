"use client";

// The results surface: tabs, the standings card, the board-by-board
// disclosure and the boards grid (docs/design/challenges/Challenge Page.dc.html,
// validated at 390x844 — mobile first, the wide tier only adds a review aside).
//
// A renderer, not a calculator: every figure, name, tone and label arrives
// already formatted from `buildResultsView` on the server. What lives here is
// exactly the state a server component cannot hold — which tab is open, which
// board is being reviewed, whether the board-by-board disclosure is expanded —
// plus the two navigations the surface can start.
//
// The compare selection state machine is NOT here either: <Scorecard> owns it
// and fires `onCompare` once the reader presses "Open comparison".

import {
  BoardSquares,
  CHALLENGE_ACCENT,
  Leaderboard,
  Scorecard,
  toneColor,
  type ChallengeTone,
} from "@bridge/table-ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
// Types only: the view model is built on the server, and a value import from
// this module would drag the scoring engine into the browser bundle for a
// constant the view already carries (`view.benKey`).
import type { BoardDetail, ResultsView } from "./resultsView";

const UI_FONT = "ui-sans-serif,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const INK = "#16201c";
const INK_MUTED = "#8b9a93";
const INK_FAINT = "#9aa8a1";
const HAIRLINE = "#e2e7e3";
const GLYPH_CLOSE = "✕";
const GLYPH_COMPARE = "⇄";
const GLYPH_REPLAY = "↻";
const GLYPH_LOCK = "🔒";
const GLYPH_DOWN = "▾";
const GLYPH_UP = "▴";
const GLYPH_EDITOR = "◆";
const MIDDOT = "·";

/**
 * The wide tier. Mobile first: the first paint is always the phone layout on
 * both server and client, and a wide viewport upgrades after mount — so there
 * is no hydration mismatch and no layout that depends on guessing.
 */
function useWide(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return wide;
}

const CARD: CSSProperties = {
  border: `1px solid ${HAIRLINE}`,
  borderRadius: 16,
  background: "#fff",
  display: "flex",
  flexDirection: "column",
};

export function ResultsClient({
  view,
  viewerId,
  accent = CHALLENGE_ACCENT,
}: Readonly<{ view: ResultsView; viewerId: string; accent?: string }>) {
  const router = useRouter();
  const wide = useWide();
  // Results is the default tab and the primary content (A5).
  const [tab, setTab] = useState<"boards" | "results">("results");
  const [scorecardOpen, setScorecardOpen] = useState(false);
  const [selectedBoard, setSelectedBoard] = useState<number | null>(null);
  const [descOpen, setDescOpen] = useState(false);

  const detail = selectedBoard === null ? undefined : view.details[selectedBoard];

  /**
   * The comparison route. TODO(challenges P2-D): the comparison view
   * (/bridge/challenges/[id]/compare) is built by the baselines+comparison
   * agent; until it lands this navigation 404s, which is expected.
   */
  const openComparison = (boardNo: number, a: string, b: string) => {
    const q = new URLSearchParams({ board: String(boardNo), a, b });
    router.push(`/bridge/challenges/${view.challengeId}/compare?${q.toString()}`);
  };

  /**
   * "Replay for practice" — an UNSCORED copy at a normal table, offered only
   * once the whole challenge is finished (spec §2, Attempts). The entry route
   * reads `practice=1` and takes `enterChallengePractice`: a fresh session on
   * the same pack, nothing written to the play record, no pointer, no lock.
   */
  const openPractice = (boardNo: number) => {
    router.push(`/bridge/challenges/${view.challengeId}/play?board=${boardNo}&practice=1`);
  };

  const marksLegend = view.leaderboard.some((r) => (r.marks ?? []).length)
    ? `${GLYPH_EDITOR} set the boards ${MIDDOT} MOD moderator (early sight of the standings)`
    : undefined;

  return (
    <div
      style={{
        fontFamily: UI_FONT,
        color: "#17211d",
        width: "100%",
        maxWidth: 980,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {/* ── header ─────────────────────────────────────────────────────── */}
      <header style={{ flex: "none" }}>
        <h1
          style={{
            margin: 0,
            fontSize: 20,
            lineHeight: 1.2,
            fontWeight: 800,
            letterSpacing: "-.01em",
            color: INK,
          }}
        >
          {view.title}
        </h1>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            marginTop: 5,
          }}
        >
          <span style={{ fontSize: 12.5, color: INK_MUTED }}>{view.subtitle}</span>
          {view.description && (
            <button
              type="button"
              onClick={() => setDescOpen((v) => !v)}
              style={{
                border: 0,
                padding: 0,
                background: "transparent",
                color: accent,
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {descOpen ? `less ${GLYPH_UP}` : `more ${GLYPH_DOWN}`}
            </button>
          )}
        </div>
        {view.description && descOpen && (
          <p
            style={{
              margin: "9px 0 0",
              fontSize: 13,
              lineHeight: 1.55,
              color: "#5f6f68",
              maxWidth: 640,
            }}
          >
            {view.description}
          </p>
        )}
      </header>

      {/* ── tabs: Boards | Results ─────────────────────────────────────── */}
      <nav
        style={{
          flex: "none",
          display: "flex",
          gap: 22,
          alignItems: "flex-end",
          borderBottom: `1px solid ${HAIRLINE}`,
        }}
      >
        <TabButton
          label="Boards"
          active={tab === "boards"}
          accent={accent}
          onClick={() => setTab("boards")}
        />
        <TabButton
          label="Results"
          active={tab === "results"}
          accent={accent}
          onClick={() => setTab("results")}
          // The rank chip appears the moment the viewer is in the field (A5).
          chip={view.viewerRank === null ? undefined : `#${view.viewerRank}`}
          locked={!view.resultsUnlocked}
        />
      </nav>

      {/* ── boards tab ─────────────────────────────────────────────────── */}
      {tab === "boards" && (
        <div
          style={{
            display: "flex",
            flexDirection: wide && detail ? "row" : "column",
            gap: wide ? 22 : 16,
            alignItems: "flex-start",
          }}
        >
          <div
            style={{
              flex: wide && detail ? "1.4 1 0" : "none",
              width: wide && detail ? undefined : "100%",
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <BoardSquares
              caption={view.boardsCaption}
              accent={accent}
              squares={view.squares.map((s) => ({ ...s, selected: s.boardNo === selectedBoard }))}
              onSelect={(boardNo) =>
                setSelectedBoard((current) => (current === boardNo ? null : boardNo))
              }
            />
            {/* Phone: the review sits inline, right under the grid it came from. */}
            {!wide && detail && (
              <BoardReview
                detail={detail}
                accent={accent}
                showPractice={view.viewerFinished}
                onClose={() => setSelectedBoard(null)}
                onCompare={() => openComparison(detail.boardNo, viewerId, view.benKey)}
                onPractice={() => openPractice(detail.boardNo)}
              />
            )}
          </div>

          {/* Wide: the same review as a quiet aside that stays put while the
              reader moves down the grid. */}
          {wide && detail && (
            <aside
              style={{
                flex: "1 1 0",
                minWidth: 0,
                maxWidth: 360,
                position: "sticky",
                top: 20,
              }}
            >
              <BoardReview
                detail={detail}
                accent={accent}
                showPractice={view.viewerFinished}
                onClose={() => setSelectedBoard(null)}
                onCompare={() => openComparison(detail.boardNo, viewerId, view.benKey)}
                onPractice={() => openPractice(detail.boardNo)}
              />
            </aside>
          )}
        </div>
      )}

      {/* ── results tab ────────────────────────────────────────────────── */}
      {tab === "results" && !view.resultsUnlocked && (
        // The quiet locked panel. Unreachable when standingsVisibility is
        // `always` or the viewer moderates — `resultsUnlocked` already said so.
        <section style={{ ...CARD, padding: "18px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <span
              aria-hidden
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                flex: "none",
                borderRadius: 11,
                background: "#f1f4f2",
                fontSize: 17,
              }}
            >
              {GLYPH_LOCK}
            </span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#22302a" }}>
                Results are locked
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.5, color: INK_MUTED }}>
                {`Results unlock when you finish all ${view.progress.total} boards — the standings, the board-by-board grid and every comparison.`}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 11, marginTop: 15 }}>
            <div
              style={{
                flex: 1,
                height: 6,
                borderRadius: 3,
                background: "#e6ebe8",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${view.progress.pct}%`,
                  background: accent,
                  borderRadius: 3,
                }}
              />
            </div>
            <span style={{ flex: "none", fontSize: 12, fontWeight: 800, color: "#5a6a63" }}>
              {`${view.progress.done}/${view.progress.total}`}
            </span>
          </div>
          <div style={{ fontSize: 11.5, color: INK_FAINT, marginTop: 7 }}>
            {`${view.progress.done} of ${view.progress.total} boards done`}
          </div>
        </section>
      )}

      {tab === "results" && view.resultsUnlocked && (
        <section style={{ ...CARD, padding: "16px 16px 14px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#22302a" }}>
              Standings
            </h2>
            <span style={{ flex: 1 }} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: accent,
                background: "#eff7f6",
                borderRadius: 11,
                padding: "3px 9px",
              }}
            >
              {view.scoringUnit}
            </span>
          </div>
          <div style={{ fontSize: 11.5, color: INK_FAINT, marginTop: 6 }}>{view.summaryLine}</div>

          {/* Early sight: say WHY these are visible before the viewer finished. */}
          {view.earlyNote && (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 7,
                marginTop: 9,
                padding: "8px 10px",
                borderRadius: 9,
                background: "#f3f5f7",
              }}
            >
              <span aria-hidden style={{ flex: "none", fontSize: 10, lineHeight: 1.5, color: "#8a949c" }}>
                {"●"}
              </span>
              <span style={{ fontSize: 11.5, lineHeight: 1.5, color: "#55636f" }}>
                {view.earlyNote}
              </span>
            </div>
          )}

          <Leaderboard
            rows={view.leaderboard}
            benRow={view.benRow ?? undefined}
            scoringLabel={view.scoringLabel}
            accent={accent}
            legend={marksLegend}
            emptyLabel="Nobody has finished every board yet."
          />

          {/* ONE disclosure over the board-by-board grid. */}
          {view.scorecard && (
            <>
              <button
                type="button"
                onClick={() => setScorecardOpen((v) => !v)}
                aria-expanded={scorecardOpen}
                style={{
                  width: "100%",
                  height: 40,
                  marginTop: 12,
                  border: "1px solid #dbe4e0",
                  borderRadius: 10,
                  background: "#f7faf8",
                  color: "#3f5a56",
                  fontFamily: "inherit",
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {scorecardOpen
                  ? `Hide board-by-board ${GLYPH_UP}`
                  : `Board-by-board ${GLYPH_DOWN}`}
              </button>

              {scorecardOpen && (
                <div
                  style={{ marginTop: 12, borderTop: "1px solid #eef2ef", paddingTop: 12 }}
                >
                  <Scorecard
                    columns={view.scorecard.columns}
                    rows={view.scorecard.rows}
                    totals={view.scorecard.totals}
                    accent={accent}
                    viewportPhone={!wide}
                    onCompare={({ boardNo, a, b }) => openComparison(boardNo, a, b)}
                  />
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}

/** One underline tab, optionally carrying the rank chip or a lock. */
function TabButton({
  label,
  active,
  accent,
  onClick,
  chip,
  locked,
}: Readonly<{
  label: string;
  active: boolean;
  accent: string;
  onClick: () => void;
  chip?: string;
  locked?: boolean;
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      style={{
        appearance: "none",
        background: "transparent",
        border: 0,
        borderBottom: `2px solid ${active ? accent : "transparent"}`,
        marginBottom: -1,
        padding: "0 2px 11px",
        fontFamily: "inherit",
        fontSize: 14,
        fontWeight: active ? 800 : 600,
        color: active ? INK : INK_MUTED,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        whiteSpace: "nowrap",
      }}
    >
      <span>{label}</span>
      {chip && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            height: 18,
            padding: "0 7px",
            borderRadius: 9,
            background: active ? "#e9f1ee" : "#eef2f0",
            color: active ? accent : "#93a199",
            fontSize: 11,
            fontWeight: 800,
          }}
        >
          {chip}
        </span>
      )}
      {locked && (
        <span aria-label="locked" title="Locked until you finish" style={{ fontSize: 11, color: "#a2ada7" }}>
          {GLYPH_LOCK}
        </span>
      )}
    </button>
  );
}

/** One done board: contract, raw score, challenge score, and where to go next. */
function BoardReview({
  detail,
  accent,
  showPractice,
  onClose,
  onCompare,
  onPractice,
}: Readonly<{
  detail: BoardDetail;
  accent: string;
  showPractice: boolean;
  onClose: () => void;
  onCompare: () => void;
  onPractice: () => void;
}>) {
  const ink = (tone: ChallengeTone) => toneColor(tone);
  return (
    <div
      style={{
        flex: "none",
        border: "1px solid #cfe1de",
        borderRadius: 14,
        background: "#fff",
        padding: "14px 15px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: "#22302a" }}>
          {`Board ${detail.boardNo}`}
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close board review"
          style={{
            height: 26,
            width: 26,
            border: "1px solid #e4e9e5",
            borderRadius: 8,
            background: "#fff",
            color: "#93a199",
            fontFamily: "inherit",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          {GLYPH_CLOSE}
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
        <span style={{ fontSize: 17, fontWeight: 800, color: "#22302a" }}>{detail.contract}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: ink(detail.rawTone) }}>
          {detail.raw}
        </span>
      </div>
      <div style={{ fontSize: 12, color: INK_MUTED }}>{detail.sub}</div>

      <div
        style={{
          display: "inline-flex",
          alignSelf: "flex-start",
          alignItems: "baseline",
          gap: 6,
          height: 28,
          padding: "0 11px",
          borderRadius: 8,
          background: "#fbfcfb",
          border: "1px solid #e4e9e5",
        }}
      >
        <span
          style={{
            fontSize: 9,
            letterSpacing: ".05em",
            textTransform: "uppercase",
            color: "#93a199",
          }}
        >
          {detail.unit}
        </span>
        <span style={{ fontSize: 13, fontWeight: 800, color: ink(detail.scoreTone) }}>
          {detail.score}
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onCompare}
          style={{
            height: 34,
            padding: "0 14px",
            border: 0,
            borderRadius: 9,
            background: accent,
            color: "#fff",
            fontFamily: "inherit",
            fontSize: 12.5,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {`${GLYPH_COMPARE} Compare vs BEN`}
        </button>
        {/* Only once the WHOLE challenge is finished: a practice copy before
            then would sit next to a board that is still a live attempt. */}
        {showPractice && (
          <button
            type="button"
            onClick={onPractice}
            style={{
              height: 34,
              padding: "0 12px",
              border: 0,
              background: "transparent",
              color: "#6d7a73",
              fontFamily: "inherit",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {`${GLYPH_REPLAY} Replay for practice (unscored)`}
          </button>
        )}
      </div>
    </div>
  );
}

"use client";

// The comparison surface (docs/design/challenges/Play Comparison.dc.html,
// validated at 390x844 — phone first).
//
// PHONE: one board. The comparison line is drawn INTO it as a translucent ghost
// card (and ghost calls in the auction grid), and a two-segment "You / BEN"
// control — labelled, never a lone glyph — says which line is solid. The core
// loop (header, toggle, board, scrubber) fits one viewport; the source list
// lives behind a bottom sheet.
//
// WIDE: the same model, two renderers. One shared scrubber drives two synced
// mini-boards with a sync spine between them that reads the scrubbed ply on
// both lines at once.
//
// Interaction state only. Every figure arrives formatted from the server, and
// every rule (where the lines split, what a line is doing at a ply, which of
// its own actions a fork keeps) comes from the pure model in compareView.ts.

import type { Seat, Vul } from "@bridge/events";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { ensureComparisonLine } from "./actions";
import { CompareBoard, type GhostCard } from "./CompareBoard";
import { CompareScrubber } from "./CompareScrubber";
import {
  CMP_ACCENT,
  DIV_ACCENT,
  HAIRLINE,
  INK,
  INK_FAINT,
  INK_MUTED,
  LINE,
  MINE_ACCENT,
  PAGE_BG,
  TONE_INK,
  WARN_BG,
  WARN_BORDER,
  WARN_INK,
  YOUR_CONTRACT_KEY,
  auctionGrid,
  clampPly,
  divergePly,
  divergentPlies,
  forkLabel,
  frameAt,
  ownPly,
  positionLabel,
  syncAt,
  timelineOf,
  type CompareLine,
  type EnsureLineRequest,
  type LineSlot,
  type PendingLine,
  type SourceOption,
} from "./compareView";

const UI_FONT = "ui-sans-serif,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
/**
 * The surface owns the space the shell has left (`main` is the scroll
 * container, `p-3 md:p-8`), so it cancels that padding and fills the rest.
 * Written as real CSS rather than inline styles because the breakpoint has to
 * match the shell's — and rather than Tailwind classes because everything else
 * on this surface is inline and one styling model is easier to keep honest.
 */
const SURFACE_CSS = [
  "@keyframes compare-spin{to{transform:rotate(360deg)}}",
  ".compare-surface{height:100%;margin:-12px}",
  "@media (min-width:768px){.compare-surface{margin:-32px}}",
].join("");
/** Rounds of BEN work one open surface will ask for before it stops nagging. */
const MAX_ROUNDS = 30;
const TRICK_SCALE_PHONE = 0.62;
const TRICK_SCALE_WIDE = 0.58;

export interface CompareClientProps {
  challengeId: string;
  boardNo: number;
  title: string;
  dealLine: string;
  dealer: Seat;
  vul: Vul;
  humanSeat: Seat;
  mineKey: string;
  cmpKey: string;
  mine: LineSlot;
  cmp: LineSlot;
  /** The primary line is the viewer's own — from-point and your-contract exist. */
  viewerOwnsMine: boolean;
  sources: readonly SourceOption[];
  backHref: string;
}

/** The wide tier, mounted after first paint so phone is always the first render. */
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

/**
 * A line that may still be BEN's to compute. A baseline is minutes of BEN
 * calls, so the server never waits for one: it hands down whatever it has and
 * this hook asks for the rest in resumable rounds, keeping the reader informed
 * instead of showing a hole.
 */
function useEnsuredSlot(
  initial: LineSlot,
  request: EnsureLineRequest | null,
): { slot: LineSlot; busy: boolean; note: string; retry: () => void } {
  const [slot, setSlot] = useState<LineSlot>(initial);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const key = request ? JSON.stringify(request) : "";

  // New props (a different source, a different board) replace the slot wholesale.
  useEffect(() => {
    setSlot(initial);
    setNote("");
  }, [initial]);

  const ready = slot.ready;
  const failed = !slot.ready && slot.pending.status === "failed";
  useEffect(() => {
    if (!request || ready || (failed && attempt === 0)) return;
    let cancelled = false;
    setBusy(true);
    void (async () => {
      for (let round = 0; round < MAX_ROUNDS && !cancelled; round++) {
        const result = await ensureComparisonLine(request);
        if (cancelled) return;
        if (result.status === "ready" && result.line) {
          setSlot({ ready: true, line: result.line });
          setNote("");
          setBusy(false);
          return;
        }
        setNote(result.note ?? "");
        if (result.status === "failed") {
          setSlot((s) =>
            s.ready ? s : { ready: false, pending: { ...s.pending, status: "failed", note: result.note } },
          );
          setBusy(false);
          return;
        }
      }
      if (!cancelled) setBusy(false);
    })();
    return () => {
      cancelled = true;
    };
    // `key` stands in for the request object (a fresh object every render
    // would restart the loop); `attempt` re-arms a line that failed.
  }, [key, ready, failed, attempt, request]);

  return {
    slot,
    busy,
    note,
    retry: useCallback(() => {
      setSlot((s) => (s.ready ? s : { ready: false, pending: { ...s.pending, status: "pending" } }));
      setAttempt((n) => n + 1);
    }, []),
  };
}

/** What a slot needs BEN to do, or null when nobody can compute it. */
function requestFor(
  slot: LineSlot,
  challengeId: string,
  boardNo: number,
): EnsureLineRequest | null {
  if (slot.ready) return null;
  const { kind } = slot.pending;
  if (kind === "user") return null;
  if (kind === "from_point") {
    const ply = Number(slot.pending.key.split(".").pop());
    return Number.isInteger(ply) ? { challengeId, boardNo, kind, ply } : null;
  }
  return { challengeId, boardNo, kind };
}

export function CompareClient(props: Readonly<CompareClientProps>) {
  const { challengeId, boardNo, dealLine, dealer, vul, humanSeat, cmpKey, backHref } = props;
  // The header reads "Compare play" over the deal line — the challenge's own
  // name belongs to the place the back arrow goes, so it labels that.
  const backLabel = `Back to ${props.title} results`;
  const router = useRouter();
  const wide = useWide();

  const [plyState, setPlyState] = useState<number | null>(null);
  const [primary, setPrimary] = useState<"mine" | "cmp">("mine");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [playersOpen, setPlayersOpen] = useState(false);
  /** The ply of the VIEWER'S OWN line a from-point fork was taken at. */
  const [forkAt, setForkAt] = useState<number | null>(null);

  // A new pair (or a new board) starts fresh.
  useEffect(() => {
    setPlyState(null);
    setForkAt(null);
    setSheetOpen(false);
    setPlayersOpen(false);
    setPrimary("mine");
  }, [cmpKey, boardNo]);

  const mineAsk = useMemo(
    () => requestFor(props.mine, challengeId, boardNo),
    [props.mine, challengeId, boardNo],
  );
  const cmpAsk = useMemo(
    () => requestFor(props.cmp, challengeId, boardNo),
    [props.cmp, challengeId, boardNo],
  );
  const mineState = useEnsuredSlot(props.mine, mineAsk);
  const cmpState = useEnsuredSlot(props.cmp, cmpAsk);

  // The from-point line: its own slot, so exiting it restores the chosen source
  // untouched (and BEN's work stays cached for the next visit).
  const forkSlot = useMemo<LineSlot>(
    () => ({
      ready: false,
      pending: {
        key: `BEN.here.${forkAt ?? 0}`,
        kind: "from_point",
        who: "BEN from here",
        short: "BEN",
        badge: "BEN · FROM HERE",
        status: "pending",
      } satisfies PendingLine,
    }),
    [forkAt],
  );
  const forkAsk = useMemo<EnsureLineRequest | null>(
    () => (forkAt === null ? null : { challengeId, boardNo, kind: "from_point", ply: forkAt }),
    [forkAt, challengeId, boardNo],
  );
  const forkState = useEnsuredSlot(forkSlot, forkAsk);

  const mineSlot = mineState.slot;
  const cmpSlot = forkAt === null ? cmpState.slot : forkState.slot;
  const cmpBusy = forkAt === null ? cmpState.busy : forkState.busy;
  const cmpNote = forkAt === null ? cmpState.note : forkState.note;
  const cmpRetry = forkAt === null ? cmpState.retry : forkState.retry;

  const mineLine = mineSlot.ready ? mineSlot.line : null;
  const cmpLine = cmpSlot.ready ? cmpSlot.line : null;

  // ── nothing renderable at all ─────────────────────────────────────────────
  if (!mineLine && !cmpLine) {
    const pending = !mineSlot.ready ? mineSlot.pending : (cmpSlot as { pending: PendingLine }).pending;
    return (
      <Shell wide={wide} title="Compare play" dealLine={dealLine} backHref={backHref} backLabel={backLabel}>
        <div style={{ padding: 16 }}>
          <StatePanel
            pending={pending}
            busy={mineState.busy || cmpBusy}
            note={mineState.note || cmpNote}
            onRetry={() => {
              mineState.retry();
              cmpRetry();
            }}
            backHref={backHref}
          />
        </div>
      </Shell>
    );
  }

  // One line is enough to read a board; the other says what it is waiting for.
  const anchor = (mineLine ?? cmpLine) as CompareLine;
  const other = (cmpLine ?? mineLine) as CompareLine;
  const timeline = timelineOf(anchor, other);
  const bothReady = !!mineLine && !!cmpLine;
  const divergeAt = bothReady ? divergePly(mineLine, cmpLine, timeline) : null;
  const splits = bothReady ? divergentPlies(mineLine, cmpLine, timeline) : [];

  // Land on the split — the one place a reader always wants to start.
  const auto =
    divergeAt !== null ? divergeAt : clampPly(timeline.aucLen + Math.floor(timeline.playLen / 2), timeline);
  const ply = plyState === null ? auto : clampPly(plyState, timeline);

  const mineFrame = mineLine ? frameAt(mineLine, ply, timeline, humanSeat) : null;
  const cmpFrame = cmpLine ? frameAt(cmpLine, ply, timeline, humanSeat) : null;
  const position = positionLabel(ply, timeline, anchor);
  const sync = bothReady ? syncAt(mineLine, cmpLine, ply, timeline, humanSeat) : null;

  const auctionDiverge =
    divergeAt !== null && divergeAt < timeline.aucLen ? divergeAt : null;
  const gridFor = (line: CompareLine, ghostLine: CompareLine | null, reveal: number) =>
    auctionGrid({
      line,
      ghostLine,
      dealer,
      vul,
      reveal,
      ply,
      divergeAt: auctionDiverge,
    });

  // ── contract mismatch (spec §6: this is exactly why your-contract exists) ──
  // NOT on a timeline with no cards on it. There, two different contracts are
  // the whole comparison — the finding, not a caveat about comparing tricks —
  // and the banner would warn about play that never happened.
  const mismatch =
    bothReady &&
    timeline.playLen > 0 &&
    mineLine.contract !== cmpLine.contract &&
    cmpLine.kind !== "your_contract";
  // "BEN in your contract" replays YOUR contract with BEN's cards, so it needs
  // cards to replay: on a bidding-only board (or a pass-out) it would give the
  // viewer their own auction back.
  const canOfferYourContract =
    props.viewerOwnsMine && cmpKey !== YOUR_CONTRACT_KEY && !!mineLine && mineLine.play.length > 0;

  const pickSource = (key: string) => {
    setSheetOpen(false);
    setPlayersOpen(false);
    setForkAt(null);
    const q = new URLSearchParams({ board: String(boardNo), a: props.mineKey, b: key });
    router.replace(`/bridge/challenges/${challengeId}/compare?${q.toString()}`);
  };

  const sources = props.sources.map((s) => ({ ...s, active: s.key === cmpKey && forkAt === null }));

  // ── "compare from THIS point" ─────────────────────────────────────────────
  // The fork is an index into the VIEWER'S OWN call-then-card timeline: keep
  // that many of their actions, then BEN takes their seat.
  const forkPly = mineLine ? ownPly(mineLine, ply, timeline) : 0;
  const fromHere = {
    label: forkState.busy
      ? "BEN is thinking…"
      : forkAt !== null
        ? "Exit from-here"
        : "Compare from here",
    active: forkAt !== null,
    busy: forkState.busy,
    disabled: !props.viewerOwnsMine || !mineLine,
    onClick: () => {
      if (forkAt !== null || forkState.busy) {
        setForkAt(null);
        return;
      }
      setForkAt(forkPly);
    },
  };

  const cmpPending = cmpSlot.ready ? null : cmpSlot.pending;
  const minePending = mineSlot.ready ? null : mineSlot.pending;
  // Only while BEN is ACTUALLY working: a fork that failed says so through the
  // pending strip / panel instead of spinning forever.
  const forkLoading =
    forkAt !== null && !cmpLine && forkState.busy
      ? {
          title: "BEN is thinking…",
          detail: `Adopting your line through ${forkLabel(ply, timeline)}, then playing your seat forward.`,
        }
      : null;

  const scrubber = (
    <CompareScrubber
      ply={ply}
      timeline={timeline}
      divergeAt={divergeAt}
      splits={splits}
      variant={wide ? "wide" : "phone"}
      position={position}
      onPly={(n) => setPlyState(n)}
      fromHere={fromHere}
    />
  );

  const banner = mismatch ? (
    <MismatchBanner
      wide={wide}
      mine={mineLine as CompareLine}
      cmp={cmpLine as CompareLine}
      onYourContract={canOfferYourContract ? () => pickSource(YOUR_CONTRACT_KEY) : null}
    />
  ) : null;

  // ── phone ─────────────────────────────────────────────────────────────────
  if (!wide) {
    const primaryLine = primary === "mine" ? mineLine : cmpLine;
    const ghostLine = primary === "mine" ? cmpLine : mineLine;
    const primaryFrame = primary === "mine" ? mineFrame : cmpFrame;
    const ghostFrame = primary === "mine" ? cmpFrame : mineFrame;
    // A primary line that is not ready falls back to the one that is, so the
    // board never blanks out while BEN works.
    const showLine = primaryLine ?? anchor;
    const showFrame = primaryFrame ?? frameAt(showLine, ply, timeline, humanSeat);
    const ghostFor = ghostLine && ghostFrame ? { line: ghostLine, frame: ghostFrame } : null;

    const sameCard =
      !!showFrame.just &&
      !!ghostFor?.frame.just &&
      ghostFor.frame.just.seat === showFrame.just.seat &&
      ghostFor.frame.just.card.suit === showFrame.just.card.suit &&
      ghostFor.frame.just.card.rank === showFrame.just.card.rank;
    const ghost: GhostCard | null =
      ghostFor && ghostFor.frame.just && !sameCard && showFrame.phase === "play"
        ? {
            seat: ghostFor.frame.just.seat,
            card: ghostFor.frame.just.card,
            who: ghostFor.line.short,
          }
        : null;

    return (
      <Shell wide={false} title="Compare play" dealLine={dealLine} backHref={backHref} backLabel={backLabel}>
        {/* source */}
        <div style={{ flex: "none", padding: "0 13px 9px", background: "#fff" }}>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            style={{
              width: "100%",
              height: 34,
              padding: "0 12px",
              border: `1px solid ${LINE}`,
              borderRadius: 9,
              background: "#eef1ef",
              color: "#33413b",
              font: "inherit",
              fontSize: 12.5,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{
                fontSize: 10,
                letterSpacing: ".1em",
                textTransform: "uppercase",
                color: INK_FAINT,
                flex: "none",
              }}
            >
              vs
            </span>
            <span
              style={{
                flex: 1,
                minWidth: 0,
                textAlign: "left",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {cmpLine?.who ?? cmpPending?.who ?? "—"}
            </span>
            <span style={{ flex: "none", color: MINE_ACCENT, fontSize: 11, fontWeight: 800 }}>
              Change ▾
            </span>
          </button>
        </div>

        {banner}

        {/* the labelled two-segment control: which line is solid */}
        <div style={{ flex: "none", padding: "9px 13px 3px" }}>
          <div style={{ display: "flex", gap: 7 }}>
            <LineSegment
              who={mineLine?.short ?? minePending?.short ?? "You"}
              line={mineLine}
              pending={minePending}
              accent={MINE_ACCENT}
              tint="#e4f1f1"
              active={primary === "mine"}
              onClick={() => setPrimary("mine")}
            />
            <LineSegment
              who={cmpLine?.short ?? cmpPending?.short ?? "BEN"}
              line={cmpLine}
              pending={cmpPending}
              busy={cmpBusy}
              accent={CMP_ACCENT}
              tint="#eef1f4"
              active={primary === "cmp"}
              onClick={() => setPrimary("cmp")}
            />
          </div>
        </div>

        {/* board band */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            padding: "6px 13px 8px",
            // The canvas fits this band whole at 390x844. On a squeezed
            // viewport (a wrapped app nav, a small window) the band scrolls
            // rather than clipping the hand off the bottom — the chrome above
            // and the scrubber below stay pinned either way.
            overflowY: "auto",
          }}
        >
          <CompareBoard
            frame={showFrame}
            grid={gridFor(showLine, ghostFor?.line ?? null, showFrame.reveal)}
            variant="phone"
            accent={primary === "mine" ? MINE_ACCENT : CMP_ACCENT}
            scale={TRICK_SCALE_PHONE}
            gridWidth={212}
            ghost={ghost}
            ghostInSync={sameCard}
            loading={forkLoading}
          />
          {cmpPending && (
            <PendingStrip
              pending={cmpPending}
              busy={cmpBusy}
              note={cmpNote}
              onRetry={cmpRetry}
            />
          )}
        </div>

        {scrubber}

        {sheetOpen && (
          <SourceSheet
            sources={sources}
            onPick={pickSource}
            onClose={() => setSheetOpen(false)}
            note={
              bothReady && divergeAt === null
                ? timeline.playLen === 0
                  ? "Both lines bid the same auction — on this board that is the whole comparison."
                  : "Both lines played the same cards — any swing here was the bidding, not the play."
                : ""
            }
          />
        )}
      </Shell>
    );
  }

  // ── wide ──────────────────────────────────────────────────────────────────
  return (
    <Shell
      wide
      title="Compare play"
      dealLine={dealLine}
      backHref={backHref}
      backLabel={backLabel}
      toolbar={
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div
            style={{
              display: "flex",
              gap: 3,
              padding: 3,
              background: "#eef1ef",
              border: `1px solid ${LINE}`,
              borderRadius: 9,
            }}
          >
            {sources
              .filter((s) => s.kind !== "user")
              .map((s) => (
                <Chip key={s.key} label={s.name} active={s.active} onClick={() => pickSource(s.key)} />
              ))}
            <div style={{ position: "relative" }}>
              <Chip
                label={`${sources.find((s) => s.kind === "user" && s.active)?.name ?? "Players"} ▾`}
                active={sources.some((s) => s.kind === "user" && s.active)}
                onClick={() => setPlayersOpen((v) => !v)}
              />
              {playersOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: 37,
                    left: 0,
                    zIndex: 60,
                    width: 280,
                    padding: 7,
                    background: "#fff",
                    border: `1px solid ${HAIRLINE}`,
                    borderRadius: 11,
                    boxShadow: "0 14px 34px rgba(20,40,34,.2)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      letterSpacing: ".1em",
                      textTransform: "uppercase",
                      color: INK_FAINT,
                      padding: "4px 8px 6px",
                    }}
                  >
                    Finished players
                  </div>
                  {sources.filter((s) => s.kind === "user").length === 0 && (
                    <div style={{ padding: "4px 8px 8px", fontSize: 12, color: INK_MUTED }}>
                      Nobody else has finished this board yet.
                    </div>
                  )}
                  {sources
                    .filter((s) => s.kind === "user")
                    .map((s) => (
                      <SourceRow key={s.key} source={s} onPick={pickSource} />
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      }
    >
      {banner}

      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "14px 18px 8px" }}>
        <div
          style={{
            maxWidth: 780,
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: 11,
          }}
        >
          {/* the sync spine: both lines, read at the scrubbed ply */}
          <div
            style={{
              display: "flex",
              alignItems: "stretch",
              gap: 13,
              background: "#fff",
              border: `1px solid ${LINE}`,
              borderRadius: 12,
              padding: "9px 14px",
              boxShadow: "0 2px 8px rgba(20,40,34,.05)",
            }}
          >
            <div
              style={{
                flex: "none",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                minWidth: 150,
              }}
            >
              <div style={{ fontSize: 13.5, fontWeight: 800 }}>{position.label}</div>
              <div style={{ fontSize: 11, color: INK_MUTED }}>{position.sub}</div>
            </div>
            <div style={{ width: 1, background: "#e6ebe8", flex: "none" }} />
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {sync ? (
                sync.differ ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 10,
                      fontSize: 12,
                      fontWeight: 700,
                      color: WARN_INK,
                      background: WARN_BG,
                      border: `1px solid ${WARN_BORDER}`,
                      borderRadius: 13,
                      padding: "6px 13px",
                    }}
                  >
                    <span style={{ color: DIV_ACCENT }}>
                      ◆ {sync.mode === "auction" ? "Bids differ" : "Lines differ here"}
                    </span>
                    <SyncSide
                      accent={MINE_ACCENT}
                      who={mineLine?.short ?? "You"}
                      text={sync.mine.text}
                      color={sync.mine.color}
                    />
                    <span style={{ color: "#9aa5a0", fontWeight: 600 }}>vs</span>
                    <SyncSide
                      accent={CMP_ACCENT}
                      who={cmpLine?.short ?? "BEN"}
                      text={sync.cmp.text}
                      color={sync.cmp.color}
                    />
                  </span>
                ) : (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: MINE_ACCENT,
                      background: "#e4f1f1",
                      border: "1px solid #bfe0db",
                      borderRadius: 13,
                      padding: "6px 14px",
                    }}
                  >
                    ✓{" "}
                    {sync.mode === "auction"
                      ? `Both lines bid ${sync.mine.text}`
                      : `Both lines in sync — ${sync.seatName} played `}
                    {sync.mode === "play" && (
                      <span style={{ color: sync.mine.color, fontWeight: 800, fontSize: 14 }}>
                        {sync.mine.text}
                      </span>
                    )}
                  </span>
                )
              ) : (
                <span style={{ fontSize: 12, color: INK_MUTED }}>
                  Waiting for the second line…
                </span>
              )}
            </div>
          </div>

          {/* the two synced boards */}
          <div style={{ display: "flex", gap: 16, alignItems: "stretch", justifyContent: "center" }}>
            <BoardPanel
              line={mineLine}
              pending={minePending}
              busy={mineState.busy}
              note={mineState.note}
              onRetry={mineState.retry}
              accent={MINE_ACCENT}
              headerBg="#eff6f6"
            >
              {mineLine && mineFrame && (
                <CompareBoard
                  frame={mineFrame}
                  grid={gridFor(mineLine, null, mineFrame.reveal)}
                  variant="wide"
                  accent={MINE_ACCENT}
                  scale={TRICK_SCALE_WIDE}
                  gridWidth={188}
                />
              )}
            </BoardPanel>
            <BoardPanel
              line={cmpLine}
              pending={cmpPending}
              busy={cmpBusy}
              note={cmpNote}
              onRetry={cmpRetry}
              accent={CMP_ACCENT}
              headerBg="#eef1f4"
              onExitFork={forkAt !== null ? () => setForkAt(null) : undefined}
            >
              {cmpLine && cmpFrame && (
                <CompareBoard
                  frame={cmpFrame}
                  grid={gridFor(cmpLine, null, cmpFrame.reveal)}
                  variant="wide"
                  accent={CMP_ACCENT}
                  scale={TRICK_SCALE_WIDE}
                  gridWidth={188}
                  loading={forkLoading}
                  note={
                    bothReady && divergeAt === null
                      ? timeline.playLen === 0
                        ? "Same auction as your line, call for call."
                        : "Same cards as your line — the swing here was the bidding, not the play."
                      : null
                  }
                />
              )}
            </BoardPanel>
          </div>
        </div>
      </div>

      {scrubber}
    </Shell>
  );
}

// ── chrome ──────────────────────────────────────────────────────────────────

function Shell({
  wide,
  title,
  dealLine,
  backHref,
  backLabel,
  toolbar,
  children,
}: Readonly<{
  wide: boolean;
  title: string;
  dealLine: string;
  backHref: string;
  backLabel: string;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
}>) {
  return (
    // The bridge shell makes `main` the scroll container precisely so a page can
    // claim the space that is actually left (its own comment: on a phone the
    // nav's height is not a constant anyone can subtract). This surface takes
    // it — h-full, and negative margins to cancel the shell's padding — so the
    // canvas's discipline holds: header, toggle, board and scrubber in ONE
    // viewport, with the felt as the absorber and nothing below the fold.
    <div
      className="compare-surface"
      style={{
        fontFamily: UI_FONT,
        color: INK,
        display: "flex",
        flexDirection: "column",
        minHeight: 480,
        overflow: "hidden",
        background: PAGE_BG,
      }}
    >
      <style>{SURFACE_CSS}</style>
      <div
        style={{
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: wide ? 14 : 10,
          padding: wide ? "11px 18px" : "9px 13px 10px",
          background: "#fff",
          borderBottom: `1px solid ${HAIRLINE}`,
        }}
      >
        <Link
          href={backHref}
          aria-label={backLabel}
          style={{
            flex: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 30,
            height: 30,
            borderRadius: 9,
            border: `1px solid ${LINE}`,
            background: "#f4f6f5",
            color: "#4a5a53",
            fontSize: 14,
            textDecoration: "none",
          }}
        >
          ‹
        </Link>
        <div style={{ flex: wide ? "none" : 1, minWidth: 0 }}>
          <div style={{ fontSize: wide ? 16 : 14.5, fontWeight: 800, letterSpacing: ".01em" }}>
            {title}
          </div>
          <div
            style={{
              fontSize: wide ? 11.5 : 10.5,
              color: INK_MUTED,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {dealLine}
          </div>
        </div>
        {toolbar && <div style={{ width: 1, height: 30, background: "#e2e7e3" }} />}
        {toolbar}
      </div>
      {children}
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
}: Readonly<{ label: string; active: boolean; onClick: () => void }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 30,
        padding: "0 13px",
        border: 0,
        borderRadius: 6,
        background: active ? MINE_ACCENT : "transparent",
        color: active ? "#fff" : "#5c6862",
        font: "inherit",
        fontSize: 12.5,
        fontWeight: active ? 700 : 600,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

function SyncSide({
  accent,
  who,
  text,
  color,
}: Readonly<{ accent: string; who: string; text: string; color: string }>) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#33413b" }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: accent, flex: "none" }} />
      {who}
      <span style={{ color, fontWeight: 800, fontSize: 15 }}>{text}</span>
    </span>
  );
}

function MismatchBanner({
  wide,
  mine,
  cmp,
  onYourContract,
}: Readonly<{
  wide: boolean;
  mine: CompareLine;
  cmp: CompareLine;
  onYourContract: (() => void) | null;
}>) {
  return (
    <div
      style={{
        flex: "none",
        display: "flex",
        alignItems: "center",
        gap: wide ? 12 : 9,
        padding: wide ? "10px 18px" : "8px 13px",
        background: WARN_BG,
        borderBottom: `1px solid ${WARN_BORDER}`,
      }}
    >
      {wide && (
        <span
          aria-hidden
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 22,
            height: 22,
            flex: "none",
            borderRadius: 11,
            background: DIV_ACCENT,
            color: "#fff",
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          !
        </span>
      )}
      <span style={{ flex: 1, fontSize: wide ? 13 : 11, lineHeight: 1.4, color: WARN_INK }}>
        <b>Different contracts.</b>{" "}
        {wide
          ? `Your line is ${mine.contract} ${mine.byLine}; ${cmp.who}'s line is ${cmp.contract} ${cmp.byLine}. Trick-by-trick play is not directly comparable across contracts.`
          : `${mine.contract} vs ${cmp.contract}`}
      </span>
      {onYourContract && (
        <button
          type="button"
          onClick={onYourContract}
          style={{
            flex: "none",
            height: wide ? 32 : 27,
            padding: wide ? "0 14px" : "0 10px",
            border: "1px solid #d98f4e",
            borderRadius: 7,
            background: "#fff",
            color: "#a4571f",
            font: "inherit",
            fontSize: wide ? 12.5 : 11,
            fontWeight: 700,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {wide ? "Compare BEN in your contract →" : "your contract →"}
        </button>
      )}
    </div>
  );
}

function LineSegment({
  who,
  line,
  pending,
  busy,
  accent,
  tint,
  active,
  onClick,
}: Readonly<{
  who: string;
  line: CompareLine | null;
  pending: PendingLine | null;
  busy?: boolean;
  accent: string;
  tint: string;
  active: boolean;
  onClick: () => void;
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!line}
      style={{
        flex: 1,
        minWidth: 0,
        textAlign: "left",
        padding: "8px 11px",
        borderRadius: 10,
        cursor: line ? "pointer" : "default",
        font: "inherit",
        background: active ? tint : "#f4f6f5",
        border: active ? `1.5px solid ${accent}` : "1px solid #e6ebe8",
        opacity: line ? (active ? 1 : 0.82) : 0.6,
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: 3,
            background: accent,
            flex: "none",
            opacity: active ? 1 : 0.4,
          }}
        />
        <span
          style={{
            fontSize: 12.5,
            fontWeight: active ? 800 : 700,
            color: active ? INK : INK_FAINT,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {who}
        </span>
        {active && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: ".06em",
              color: accent,
            }}
          >
            MAIN
          </span>
        )}
      </span>
      <span style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 3 }}>
        {line ? (
          <>
            <span
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: line.contractRed ? "#c0201f" : "#16231e",
              }}
            >
              {line.contract}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: TONE_INK[line.resultTone] }}>
              {`${line.result} ${line.rawText}`.trim()}
            </span>
          </>
        ) : (
          <span style={{ fontSize: 11, fontWeight: 700, color: INK_MUTED }}>
            {busy || pending?.status === "pending" ? "BEN is playing this board…" : (pending?.note ?? "Not available")}
          </span>
        )}
      </span>
    </button>
  );
}

function BoardPanel({
  line,
  pending,
  busy,
  note,
  onRetry,
  accent,
  headerBg,
  onExitFork,
  children,
}: Readonly<{
  line: CompareLine | null;
  pending: PendingLine | null;
  busy: boolean;
  note: string;
  onRetry: () => void;
  accent: string;
  headerBg: string;
  onExitFork?: () => void;
  children?: React.ReactNode;
}>) {
  const head = line ?? pending;
  return (
    <div
      style={{
        flex: "none",
        width: 358,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        border: `1px solid ${LINE}`,
        borderRadius: 14,
        overflow: "hidden",
        background: "#fff",
        boxShadow: "0 3px 12px rgba(20,40,34,.06)",
      }}
    >
      <div
        style={{
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "11px 13px",
          borderBottom: "1px solid #e6eae7",
          background: headerBg,
        }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 22,
            padding: "0 9px",
            flex: "none",
            borderRadius: 6,
            background: accent,
            color: "#fff",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: ".03em",
            whiteSpace: "nowrap",
          }}
        >
          {head?.badge ?? ""}
        </span>
        <span style={{ fontSize: 14, fontWeight: 800 }}>{head?.who ?? ""}</span>
        {line?.editor && (
          <span title="Opened the pack editor" style={{ fontSize: 10, fontWeight: 700, color: MINE_ACCENT }}>
            ◆ set the boards
          </span>
        )}
        <span style={{ flex: 1 }} />
        {line && (
          <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span
              style={{
                fontSize: 20,
                fontWeight: 800,
                color: line.contractRed ? "#c0201f" : "#16231e",
              }}
            >
              {line.contract}
            </span>
            <span style={{ fontSize: 12, color: INK_MUTED }}>{line.byLine}</span>
          </span>
        )}
      </div>

      {line && (
        <div
          style={{
            flex: "none",
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "7px 13px",
            borderBottom: "1px solid #eef1ef",
          }}
        >
          <span style={{ fontSize: 12.5, fontWeight: 700, color: TONE_INK[line.resultTone] }}>
            {line.result}
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: TONE_INK[line.resultTone] }}>
            {line.rawText}
          </span>
          <span style={{ flex: 1 }} />
          {onExitFork && (
            <button
              type="button"
              onClick={onExitFork}
              style={{
                height: 22,
                padding: "0 8px",
                border: "1px solid #cdd5db",
                borderRadius: 11,
                background: "#eef1f4",
                color: "#55636f",
                font: "inherit",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              × exit
            </button>
          )}
        </div>
      )}

      {line ? (
        children
      ) : pending ? (
        <div style={{ padding: 14 }}>
          <StatePanel pending={pending} busy={busy} note={note} onRetry={onRetry} />
        </div>
      ) : null}
    </div>
  );
}

/** The honest state of a line that is not (yet) renderable. */
function StatePanel({
  pending,
  busy,
  note,
  onRetry,
  backHref,
}: Readonly<{
  pending: PendingLine;
  busy: boolean;
  note: string;
  onRetry: () => void;
  backHref?: string;
}>) {
  const waiting = pending.status === "pending";
  const title = waiting
    ? pending.kind === "from_point"
      ? "BEN is thinking…"
      : "BEN is playing this board…"
    : pending.status === "unfinished"
      ? "No line to compare yet"
      : "BEN could not finish this line";
  const detail = waiting
    ? note ||
      (pending.kind === "your_contract"
        ? "BEN is adopting your auction and playing the cards out. This takes a couple of minutes — it stays cached once it is done."
        : "A reference line is a whole board of BEN decisions. It is computed in resumable rounds, so nothing is lost if you leave.")
    : note || pending.note || "";

  return (
    <div
      style={{
        border: `1px solid ${LINE}`,
        borderRadius: 12,
        background: "#fff",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        textAlign: "center",
      }}
    >
      {busy && (
        <span
          aria-hidden
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            border: "3px solid #dfe4e8",
            borderTopColor: CMP_ACCENT,
            display: "block",
            animation: "compare-spin 900ms linear infinite",
          }}
        />
      )}
      <div style={{ fontSize: 13.5, fontWeight: 800, color: "#3c4a44" }}>{title}</div>
      <div style={{ fontSize: 11.5, lineHeight: 1.5, color: INK_MUTED, maxWidth: 260 }}>{detail}</div>
      {!busy && pending.status !== "unfinished" && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            height: 32,
            padding: "0 14px",
            border: `1px solid ${LINE}`,
            borderRadius: 8,
            background: "#fff",
            color: "#33413b",
            font: "inherit",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Ask BEN again
        </button>
      )}
      {backHref && (
        <Link href={backHref} style={{ fontSize: 12, fontWeight: 700, color: MINE_ACCENT }}>
          Back to results
        </Link>
      )}
    </div>
  );
}

/** The phone's one-line version of the same news, under the board. */
function PendingStrip({
  pending,
  busy,
  note,
  onRetry,
}: Readonly<{ pending: PendingLine; busy: boolean; note: string; onRetry: () => void }>) {
  const waiting = pending.status === "pending";
  return (
    <div
      style={{
        flex: "none",
        marginTop: 7,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 10px",
        borderRadius: 9,
        background: waiting ? "#eef1f4" : WARN_BG,
        border: `1px solid ${waiting ? LINE : WARN_BORDER}`,
      }}
    >
      {busy && (
        <span
          aria-hidden
          style={{
            width: 14,
            height: 14,
            flex: "none",
            borderRadius: "50%",
            border: "2px solid #dfe4e8",
            borderTopColor: CMP_ACCENT,
            animation: "compare-spin 900ms linear infinite",
          }}
        />
      )}
      <span style={{ flex: 1, fontSize: 11, lineHeight: 1.35, color: waiting ? "#4a5a53" : WARN_INK }}>
        {waiting
          ? `${pending.who}: ${note || (pending.kind === "from_point" ? "BEN is thinking…" : "BEN is playing this board…")}`
          : note || pending.note || `${pending.who} is not available.`}
      </span>
      {!busy && pending.status !== "unfinished" && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            flex: "none",
            height: 24,
            padding: "0 9px",
            border: `1px solid ${LINE}`,
            borderRadius: 7,
            background: "#fff",
            color: "#33413b",
            font: "inherit",
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}

function SourceRow({
  source,
  onPick,
}: Readonly<{ source: SourceOption; onPick: (key: string) => void }>) {
  return (
    <button
      type="button"
      onClick={() => onPick(source.key)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "8px 9px",
        marginBottom: 3,
        border: 0,
        borderRadius: 9,
        background: source.active ? "#eef1f4" : "transparent",
        textAlign: "left",
        cursor: "pointer",
        font: "inherit",
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          flex: "none",
          borderRadius: 14,
          background: source.kind === "user" ? "#7b8894" : CMP_ACCENT,
          color: "#fff",
          fontSize: 10,
          fontWeight: 800,
        }}
      >
        {source.initials}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            fontWeight: 700,
            color: INK,
          }}
        >
          {source.name}
          {source.editor && (
            <span title="Opened the pack editor" style={{ fontSize: 9.5, fontWeight: 700, color: MINE_ACCENT }}>
              ◆ set the boards
            </span>
          )}
        </span>
        <span
          style={{
            display: "block",
            fontSize: 11,
            color: INK_MUTED,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {source.sub}
        </span>
      </span>
      <span style={{ flex: "none", display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 800,
            color: source.res ? (source.resMade ? "#1a7a4b" : "#b3402f") : INK_FAINT,
          }}
        >
          {source.res}
        </span>
        {source.active && (
          <span style={{ fontSize: 11, fontWeight: 800, color: MINE_ACCENT }}>✓</span>
        )}
      </span>
    </button>
  );
}

function SourceSheet({
  sources,
  onPick,
  onClose,
  note,
}: Readonly<{
  sources: readonly SourceOption[];
  onPick: (key: string) => void;
  onClose: () => void;
  note: string;
}>) {
  const overlay: CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 40,
    background: "rgba(20,30,26,.42)",
  };
  return (
    <>
      <div style={overlay} onClick={onClose} role="presentation" />
      <div
        role="dialog"
        aria-label="Compare against"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 41,
          maxHeight: "82%",
          display: "flex",
          flexDirection: "column",
          background: "#fff",
          borderRadius: "20px 20px 0 0",
          boxShadow: "0 -12px 34px rgba(0,0,0,.32)",
        }}
      >
        <div style={{ flex: "none", display: "flex", alignItems: "center", padding: "12px 15px 8px" }}>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 800 }}>Compare against</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              flex: "none",
              width: 28,
              height: 28,
              border: "1px solid #e2e7e3",
              borderRadius: 14,
              background: "#f4f6f5",
              color: "#5c6862",
              fontSize: 14,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "0 11px 16px" }}>
          {sources.map((s) => (
            <SourceRow key={s.key} source={s} onPick={onPick} />
          ))}
          {note && (
            <div
              style={{
                margin: "4px 4px 0",
                padding: "9px 11px",
                borderRadius: 9,
                background: WARN_BG,
                fontSize: 11.5,
                lineHeight: 1.45,
                color: WARN_INK,
              }}
            >
              {note}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

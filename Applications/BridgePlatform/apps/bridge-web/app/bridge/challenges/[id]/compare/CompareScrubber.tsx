"use client";

// The shared timeline. ONE track for BOTH lines: the auction band, then
// thirteen tricks, with a tick at every ply the lines differ and a marker at
// the first one. Dragging it moves both boards together — that is the whole
// point of the instrument, so it is a single control, never one per board.

import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import {
  DIV_ACCENT,
  HAIRLINE,
  INK_MUTED,
  MINE_ACCENT,
  clampPly,
  type CompareTimeline,
  type PositionLabel,
} from "./compareView";

export interface FromHereControl {
  label: string;
  active: boolean;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}

export interface CompareScrubberProps {
  ply: number;
  timeline: CompareTimeline;
  /** First ply the lines differ at, or null when they never do. */
  divergeAt: number | null;
  /** Every differing ply — the amber ticks. */
  splits: readonly number[];
  variant: "phone" | "wide";
  position: PositionLabel;
  onPly: (ply: number) => void;
  fromHere: FromHereControl | null;
}

export function CompareScrubber({
  ply,
  timeline,
  divergeAt,
  splits,
  variant,
  position,
  onPly,
  fromHere,
}: Readonly<CompareScrubberProps>) {
  const phone = variant === "phone";
  const trackRef = useRef<HTMLDivElement | null>(null);
  const pct = (n: number): string => `${(100 * n) / Math.max(1, timeline.maxPly)}%`;

  const scrubToX = (clientX: number) => {
    const box = trackRef.current?.getBoundingClientRect();
    if (!box || !box.width) return;
    const f = Math.max(0, Math.min(1, (clientX - box.left) / box.width));
    onPly(clampPly(f * timeline.maxPly, timeline));
  };

  // Pointer capture keeps the drag alive off the track and covers mouse, pen
  // and touch with one path.
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    scrubToX(e.clientX);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) scrubToX(e.clientX);
  };

  const step = (d: number) => onPly(clampPly(ply + d, timeline));
  const btn = {
    height: phone ? 32 : 34,
    padding: "0 11px",
    flex: "none" as const,
    border: `1px solid ${HAIRLINE}`,
    borderRadius: 8,
    background: "#fff",
    color: "#33413b",
    font: "inherit",
    fontSize: phone ? 11.5 : 12,
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
  };

  const trackH = phone ? 34 : 44;
  const bandTop = phone ? 11 : 15;
  const bandH = phone ? 12 : 14;
  const aucEdge = pct(Math.max(0, timeline.aucLen - 0.5));

  return (
    <div
      style={{
        flex: "none",
        padding: phone ? "8px 13px 12px" : "12px 18px 16px",
        background: "#fff",
        borderTop: `1px solid ${HAIRLINE}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: phone ? 7 : 12, marginBottom: 7 }}>
        {!phone && (
          <button type="button" onClick={() => onPly(0)} title="To the first call" style={btn}>
            ⏮
          </button>
        )}
        <button type="button" onClick={() => step(-1)} style={btn}>
          ◀ Prev
        </button>
        <button type="button" onClick={() => step(1)} style={btn}>
          Next ▶
        </button>
        {!phone && (
          <button type="button" onClick={() => onPly(timeline.maxPly)} title="To the last card" style={btn}>
            ⏭
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0, textAlign: phone ? "center" : "left" }}>
          <div
            style={{
              fontSize: phone ? 12 : 13,
              fontWeight: 800,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {position.label}
          </div>
          <div
            style={{
              fontSize: phone ? 10 : 11,
              color: INK_MUTED,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {phone ? position.sub : `${position.sub} — both boards move together`}
          </div>
        </div>
        <button
          type="button"
          onClick={() => divergeAt !== null && onPly(divergeAt)}
          disabled={divergeAt === null}
          title={divergeAt === null ? "The lines never differ" : "Jump to where the lines first differ"}
          style={{
            ...btn,
            opacity: divergeAt === null ? 0.45 : 1,
            cursor: divergeAt === null ? "default" : "pointer",
          }}
        >
          <span style={{ color: DIV_ACCENT }}>◆</span> {phone ? "Split" : "Jump to split"}
        </button>
        {!phone && fromHere && <FromHereButton control={fromHere} phone={false} />}
      </div>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Timeline — auction plies then tricks"
        aria-valuemin={0}
        aria-valuemax={timeline.maxPly}
        aria-valuenow={ply}
        aria-valuetext={position.label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") step(-1);
          else if (e.key === "ArrowRight") step(1);
          else if (e.key === "Home") onPly(0);
          else if (e.key === "End") onPly(timeline.maxPly);
          else return;
          e.preventDefault();
        }}
        style={{
          position: "relative",
          height: trackH,
          cursor: "pointer",
          userSelect: "none",
          touchAction: "none",
        }}
      >
        {/* auction band | play band */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: bandTop,
            height: bandH,
            width: aucEdge,
            borderRadius: `${bandH / 2}px 0 0 ${bandH / 2}px`,
            background: "#e4e9e6",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: bandTop,
            height: bandH,
            left: aucEdge,
            right: 0,
            borderRadius: `0 ${bandH / 2}px ${bandH / 2}px 0`,
            background: "#eef1ef",
          }}
        />
        {/* everything from the first split on is tinted: the lines are no
            longer the same board after this point */}
        {divergeAt !== null && (
          <div
            style={{
              position: "absolute",
              top: bandTop,
              height: bandH,
              left: pct(divergeAt),
              right: 0,
              borderRadius: `0 ${bandH / 2}px ${bandH / 2}px 0`,
              background: "rgba(224,122,58,.16)",
            }}
          />
        )}
        {/* trick separators */}
        {Array.from({ length: Math.max(0, Math.ceil(timeline.playLen / 4) - 1) }, (_, i) => (
          <div
            key={`t${i}`}
            style={{
              position: "absolute",
              top: bandTop - 3,
              height: bandH + 6,
              width: 1,
              left: pct(timeline.aucLen + (i + 1) * 4 - 0.5),
              background: "#ccd5d0",
            }}
          />
        ))}
        {/* a tick at EVERY divergent ply */}
        {splits.map((s) => (
          <div
            key={`s${s}`}
            style={{
              position: "absolute",
              top: bandTop,
              height: bandH,
              width: 2,
              left: pct(s),
              transform: "translateX(-1px)",
              background: DIV_ACCENT,
              opacity: 0.75,
            }}
          />
        ))}
        {/* auction | play boundary */}
        <div
          style={{
            position: "absolute",
            top: bandTop - 6,
            height: bandH + 12,
            width: 2,
            left: aucEdge,
            background: "#b6c1bb",
          }}
        />
        {/* the first split, callable */}
        {divergeAt !== null && (
          <button
            type="button"
            onClick={() => onPly(divergeAt)}
            title="Lines diverge here"
            aria-label="Jump to where the lines diverge"
            style={{
              position: "absolute",
              top: 0,
              left: pct(divergeAt),
              transform: "translateX(-50%)",
              width: 14,
              height: 12,
              padding: 0,
              border: 0,
              background: "transparent",
              cursor: "pointer",
            }}
          >
            <span
              style={{
                display: "block",
                width: 0,
                height: 0,
                margin: "0 auto",
                borderLeft: "6px solid transparent",
                borderRight: "6px solid transparent",
                borderTop: `9px solid ${DIV_ACCENT}`,
              }}
            />
          </button>
        )}
        {/* the thumb */}
        <div
          style={{
            position: "absolute",
            top: bandTop - 8,
            left: pct(ply),
            transform: "translateX(-50%)",
            width: phone ? 14 : 16,
            height: bandH + 16,
            borderRadius: 5,
            background: MINE_ACCENT,
            border: "2px solid #fff",
            boxShadow: "0 2px 6px rgba(13,112,124,.45)",
          }}
        />
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 4,
          fontSize: 9.5,
          letterSpacing: ".08em",
          textTransform: "uppercase",
          color: "#9aa5a0",
        }}
      >
        <span>Auction</span>
        <span>{`Play — ${Math.ceil(timeline.playLen / 4)} tricks`}</span>
        <span>Result</span>
      </div>

      {phone && fromHere && <FromHereButton control={fromHere} phone />}
    </div>
  );
}

function FromHereButton({
  control,
  phone,
}: Readonly<{ control: FromHereControl; phone: boolean }>) {
  const on = control.active || control.busy;
  return (
    <button
      type="button"
      onClick={control.onClick}
      disabled={control.disabled || control.busy}
      title={
        control.disabled
          ? "Only your own line can be replayed from a point"
          : "BEN takes your seat from this point on"
      }
      style={{
        height: phone ? 32 : 34,
        width: phone ? "100%" : undefined,
        marginTop: phone ? 8 : 0,
        padding: "0 14px",
        flex: "none",
        border: `1px solid ${on ? "#55636f" : "#cdd5db"}`,
        borderRadius: 8,
        background: on ? "#55636f" : "#eef1f4",
        color: on ? "#fff" : "#55636f",
        font: "inherit",
        fontSize: phone ? 11.5 : 12.5,
        fontWeight: 700,
        cursor: control.disabled || control.busy ? "default" : "pointer",
        opacity: control.disabled ? 0.5 : 1,
      }}
    >
      {control.label}
    </button>
  );
}

"use client";

// Auto-advance (2026-07-21 rework): when an AI seat is to act, the table can
// play itself — one decision per beat — but it never starts on its own.
// Opening a board shows ▶ start; the felt moves only after you press it.
// Pausing (or an undo / mid-play fix, which remounts via `key`) hands the
// tempo back; the pause survives refreshes (React state lives across
// router.refresh()).

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function AutoAdvance({
  sessionId,
  active,
  seq,
  complete,
  beatMs = 750,
  initialPaused = true,
  variant = "bar",
  railScale,
}: Readonly<{
  sessionId: string;
  /** Server truth: an AI seat is to act and the board isn't complete. */
  active: boolean;
  /** Event count — changes after every step so the effect re-arms. */
  seq: number;
  /** Board complete — nothing left to advance; the controls disappear. */
  complete?: boolean;
  beatMs?: number;
  /** Boards open paused; pass false only for flows that should self-start. */
  initialPaused?: boolean;
  /**
   * "bar": the page-toolbar pills (legacy workbench). "rail": compact chips in
   * the Play Table design's rail language, for mounting INSIDE the canvas.
   */
  variant?: "bar" | "rail";
  /**
   * Rail chips only: multiply the design metrics for larger stages (the hand
   * viewer runs ~2x the table's chip scale). Real layout size — never a CSS
   * transform, which paints outside its layout box.
   */
  railScale?: number;
}>) {
  const router = useRouter();
  const [paused, setPaused] = useState(initialPaused);
  const inFlight = useRef(false);

  const advance = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await fetch(`/api/bridge/sessions/${sessionId}/step`, { method: "POST" });
    } finally {
      inFlight.current = false;
      router.refresh();
    }
  };

  useEffect(() => {
    if (!active || paused || inFlight.current) return;
    const t = setTimeout(advance, beatMs);
    return () => clearTimeout(t);
    // advance is stable in effect terms: it closes over refs + router only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, paused, seq, sessionId, beatMs, router]);

  if (complete) return null;
  if (variant === "rail") {
    const s = railScale ?? 1;
    return (
      <div style={{ display: "flex", gap: 6 * s, justifyContent: "center" }}>
        {/* The SideRail design's pause control: boards run by default and this
            STOPS them — a standing toggle, live even on a human turn. */}
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? "Resume" : "Pause"}
          title="Pause or resume play"
          style={{ width: 100 * s, height: 32 * s, background: paused ? "#8a3030" : "#3a5a7a", border: `${2 * s}px solid #f2f4f4`, borderRadius: 7 * s, color: "#fff", fontSize: 15 * s, fontWeight: 700, lineHeight: 1, cursor: "pointer" }}
        >
          {paused ? "Resume" : "Pause"}
        </button>
        <button
          type="button"
          disabled={!active}
          onClick={() => {
            setPaused(true);
            void advance();
          }}
          aria-label="step"
          title={
            active
              ? "Pause and advance one AI decision"
              : "A human is to act — bid or play from the hand"
          }
          style={{ width: 47 * s, height: 32 * s, background: "#acc5c5", border: `${2 * s}px solid #f2f4f4`, borderRadius: 7 * s, color: "#000", fontSize: 16 * s, fontWeight: 700, lineHeight: 1, cursor: active ? "pointer" : "default", opacity: active ? 1 : 0.42 }}
        >
          ▸
        </button>
      </div>
    );
  }
  return (
    <>
      {active && (
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          className={
            paused
              ? "rounded-full bg-emerald-700 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-800"
              : "rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs text-emerald-800"
          }
          title={paused ? "Start automatic play" : "Pause automatic play"}
        >
          {paused ? (seq === 0 ? "▶ start" : "▶ resume") : "❚❚ auto-playing"}
        </button>
      )}
      {/* Manual control: pauses auto-play, then one AI decision per click.
          Stays visible on a human turn — disabled, explaining why. */}
      <button
        type="button"
        disabled={!active}
        onClick={() => {
          setPaused(true);
          void advance();
        }}
        className={`rounded-full border border-neutral-300 px-3 py-1 text-xs text-neutral-600 ${
          active ? "hover:border-emerald-400" : "cursor-not-allowed opacity-40"
        }`}
        title={
          active
            ? "Pause and advance one AI decision"
            : "A human is to act — bid or play from the hand"
        }
      >
        step ▸
      </button>
    </>
  );
}

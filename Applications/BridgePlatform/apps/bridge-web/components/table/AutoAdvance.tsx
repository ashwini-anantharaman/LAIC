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
  beatMs = 750,
  initialPaused = true,
}: Readonly<{
  sessionId: string;
  /** Server truth: an AI seat is to act and the board isn't complete. */
  active: boolean;
  /** Event count — changes after every step so the effect re-arms. */
  seq: number;
  beatMs?: number;
  /** Boards open paused; pass false only for flows that should self-start. */
  initialPaused?: boolean;
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

  if (!active) return null;
  return (
    <>
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
      {/* Manual control: pauses auto-play, then one AI decision per click. */}
      <button
        type="button"
        onClick={() => {
          setPaused(true);
          void advance();
        }}
        className="rounded-full border border-neutral-300 px-3 py-1 text-xs text-neutral-600 hover:border-emerald-400"
        title="Pause and advance one decision"
      >
        step ▸
      </button>
    </>
  );
}

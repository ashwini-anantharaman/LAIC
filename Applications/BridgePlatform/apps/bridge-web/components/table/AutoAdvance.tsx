"use client";

// Auto-advance (2026-07-16 table rework): when an AI seat is to act, the
// table plays itself — one decision per beat — so a fellow just watches the
// board unfold instead of clicking "advance" 26 times. Pausable; the pause
// survives refreshes (React state lives across router.refresh()).

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function AutoAdvance({
  sessionId,
  active,
  seq,
  beatMs = 750,
  initialPaused = false,
}: Readonly<{
  sessionId: string;
  /** Server truth: an AI seat is to act and the board isn't complete. */
  active: boolean;
  /** Event count — changes after every step so the effect re-arms. */
  seq: number;
  beatMs?: number;
  /** Start paused (after an undo or mid-play fix the AI must not instantly
   *  replay the decision being inspected). Remount via `key` to re-apply. */
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
            ? "rounded-full border border-neutral-300 px-3 py-1 text-xs text-neutral-600 hover:border-emerald-400"
            : "rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs text-emerald-800"
        }
        title={paused ? "Resume automatic play" : "Pause automatic play"}
      >
        {paused ? "▶ resume" : "❚❚ auto-playing"}
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

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
}: Readonly<{
  sessionId: string;
  /** Server truth: an AI seat is to act and the board isn't complete. */
  active: boolean;
  /** Event count — changes after every step so the effect re-arms. */
  seq: number;
  beatMs?: number;
}>) {
  const router = useRouter();
  const [paused, setPaused] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!active || paused || inFlight.current) return;
    const t = setTimeout(async () => {
      inFlight.current = true;
      try {
        await fetch(`/api/bridge/sessions/${sessionId}/step`, { method: "POST" });
      } finally {
        inFlight.current = false;
        router.refresh();
      }
    }, beatMs);
    return () => clearTimeout(t);
  }, [active, paused, seq, sessionId, beatMs, router]);

  if (!active) return null;
  return (
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
  );
}

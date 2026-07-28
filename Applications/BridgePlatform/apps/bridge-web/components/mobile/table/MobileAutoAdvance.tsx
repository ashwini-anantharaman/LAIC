"use client";

// Mobile auto-advance — same tempo controller as the desktop AutoAdvance
// (one AI decision per beat via the /step endpoint, then router.refresh;
// boards never self-start; pause survives refreshes because the paused state
// lives across router.refresh()), restyled as the felt design's pills:
//   ▶ start / ▶ resume → green #256e42, ❚❚ auto-playing → amber #a16207,
//   step ▸ → frosted, disabled at a human turn.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const PILL_BASE: React.CSSProperties = {
  flex: "none",
  borderRadius: 9,
  padding: "7px 13px",
  font: "700 11px var(--font-karla), sans-serif",
  cursor: "pointer",
  whiteSpace: "nowrap",
  border: "none",
};

const FROSTED: React.CSSProperties = {
  flex: "none",
  border: "1px solid rgba(255,255,255,.18)",
  background: "rgba(255,255,255,.1)",
  color: "#e7e1d3",
  borderRadius: 9,
  padding: "7px 11px",
  font: "600 11px var(--font-karla), sans-serif",
  cursor: "pointer",
  whiteSpace: "nowrap",
  WebkitBackdropFilter: "blur(6px)",
  backdropFilter: "blur(6px)",
};

export function MobileAutoAdvance({
  sessionId,
  active,
  seq,
  complete,
  beatMs = 750,
  initialPaused = true,
}: Readonly<{
  sessionId: string;
  active: boolean;
  seq: number;
  complete?: boolean;
  beatMs?: number;
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
    // advance closes over refs + router only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, paused, seq, sessionId, beatMs, router]);

  if (complete) return null;
  return (
    <>
      {active && (
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? "Start automatic play" : "Pause automatic play"}
          title={paused ? "Start automatic play" : "Pause automatic play"}
          style={{
            ...PILL_BASE,
            background: paused ? "#256e42" : "#a16207",
            color: "#fff",
          }}
        >
          {paused ? (seq === 0 ? "▶ start" : "▶ resume") : "❚❚ pause"}
        </button>
      )}
      <button
        type="button"
        disabled={!active}
        onClick={() => {
          setPaused(true);
          void advance();
        }}
        aria-label="Step one AI decision"
        title={
          active
            ? "Pause and advance one AI decision"
            : "A human is to act — bid or play from the hand"
        }
        style={{
          ...FROSTED,
          opacity: active ? 1 : 0.4,
          cursor: active ? "pointer" : "not-allowed",
        }}
      >
        step ▸
      </button>
    </>
  );
}

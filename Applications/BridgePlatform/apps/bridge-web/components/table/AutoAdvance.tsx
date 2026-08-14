"use client";

// Auto-advance (2026-07-21 rework): when an AI seat is to act, the table can
// play itself — one decision per beat — but it never starts on its own.
// Opening a board shows ▶ start; the felt moves only after you press it.
// Pausing (or an undo / mid-play fix, which remounts via `key`) hands the
// tempo back; the pause survives refreshes (React state lives across
// router.refresh()).

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTrickHold } from "./trickHold";

/** The step endpoint's honest failure shape (see the route). */
interface StepFailure {
  error?: string;
  benUnavailable?: boolean;
}

export function AutoAdvance({
  sessionId,
  active,
  seq,
  complete,
  beatMs = 750,
  initialPaused = true,
  variant = "bar",
  railScale,
  hidden = false,
  strictBen = false,
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
  /**
   * "headless" renders NOTHING but keeps the driver running. This component is
   * two things at once — the engine that steps robot seats, and the transport
   * buttons that pause it — and mounting it inside a toolbar meant hiding the
   * toolbar silently unmounted the engine, so the robots simply stopped. A host
   * that draws no toolbar still needs the boards to play.
   */
  variant?: "bar" | "rail" | "headless";
  /**
   * Rail chips only: multiply the design metrics for larger stages (the hand
   * viewer runs ~2x the table's chip scale). Real layout size — never a CSS
   * transform, which paints outside its layout box.
   */
  railScale?: number;
  /**
   * Drive the board without drawing any controls. For viewers whose access
   * catalogue hides the transport chips (table.step_controls): the robots
   * must still play — an AI seat waiting forever is a stuck game, not a
   * permission. The stepping effect runs; nothing renders. (A strictBen
   * error can't be SHOWN headless, so the paused-with-error state simply
   * waits for a visible instance or a reload — same dead end, honestly held.)
   */
  hidden?: boolean;
  /**
   * This table's robots are CHALLENGE BEN: cached, and with no KB fallback
   * (challenges spec §2). So a robot turn is a wait on a remote service — worth
   * saying — and a failure is a real dead end that must surface as a retry
   * rather than a table that quietly stops moving. Ordinary tables leave this
   * false: their decider degrades instead of throwing, so neither state can
   * occur and nothing about them changes.
   */
  strictBen?: boolean;
}>) {
  const router = useRouter();
  const [paused, setPaused] = useState(initialPaused);
  // A finished trick is on the felt and has not been let go — stepping now
  // would sweep it away, which is the one thing the hold exists to stop. The
  // default context reads "not holding", so tables without the provider (the
  // legacy page, the demo) are untouched.
  const { holding } = useTrickHold();
  const [thinking, setThinking] = useState(false);
  const [benError, setBenError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const advance = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (strictBen) setThinking(true);
    try {
      const res = await fetch(`/api/bridge/sessions/${sessionId}/step`, { method: "POST" });
      if (strictBen) {
        // 503 + benUnavailable: BEN could not answer and there is nothing to
        // fall back to. Hold the table (a beat loop would just hammer a service
        // that is still booting) and offer the retry the spec asks for.
        let failure: StepFailure | null = null;
        if (!res.ok) failure = (await res.json().catch(() => null)) as StepFailure | null;
        if (failure?.benUnavailable) {
          setBenError(failure.error ?? "BEN could not answer this position.");
          setPaused(true);
        } else if (res.ok) {
          setBenError(null);
        }
      }
    } finally {
      inFlight.current = false;
      if (strictBen) setThinking(false);
      router.refresh();
    }
  };

  useEffect(() => {
    if (!active || paused || holding || inFlight.current) return;
    const t = setTimeout(advance, beatMs);
    return () => clearTimeout(t);
    // advance is stable in effect terms: it closes over refs + router only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, paused, holding, seq, sessionId, beatMs, router]);

  const retry = () => {
    setBenError(null);
    setPaused(false);
    void advance();
  };

  // Headless: the effect above keeps stepping; there is nothing to draw.
  if (hidden) return null;

  if (complete) return null;

  // BEN is unreachable at a challenge board. No KB stands in for it, so the
  // table says so and waits to be asked again — never a silent stall.
  if (strictBen && benError) {
    const s = variant === "rail" ? (railScale ?? 1) : 1;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 7 * s }}>
        <span
          role="alert"
          title={benError}
          style={{
            display: "flex",
            alignItems: "center",
            height: 30 * s,
            padding: `0 ${10 * s}px`,
            borderRadius: 6,
            border: "1px solid #a94848",
            background: "#8a3030",
            color: "#fff",
            fontSize: 12 * s,
            fontWeight: 700,
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          BEN is unavailable
        </span>
        <button
          type="button"
          onClick={retry}
          title={benError}
          style={{
            flex: "none",
            height: 30 * s,
            padding: `0 ${12 * s}px`,
            border: "1px solid rgba(255,255,255,.18)",
            borderRadius: 6,
            background: "rgba(255,255,255,.10)",
            color: "#eef4f1",
            fontSize: 13 * s,
            fontWeight: 700,
            lineHeight: 1,
            whiteSpace: "nowrap",
            cursor: "pointer",
          }}
        >
          ↻ Retry
        </button>
      </div>
    );
  }
  // The driver's effects have already run by here; returning no UI is exactly
  // what a host without chrome wants.
  if (variant === "headless") return null;
  if (variant === "rail") {
    // The EdgeToolbar design's transport pair: Pause/Play as a toolbar
    // button (warn tone while held), step as a ▶ icon. Boards run by
    // default; this is the standing toggle.
    const s = railScale ?? 1;
    return (
      <div style={{ display: "flex", gap: 7 * s, justifyContent: "center" }}>
        {/* A challenge robot's turn is a call to a remote neural service; say so
            rather than leaving the felt looking frozen (spec §2, BEN latency). */}
        {strictBen && thinking && (
          <span
            aria-live="polite"
            style={{
              display: "flex",
              alignItems: "center",
              height: 30 * s,
              padding: `0 ${10 * s}px`,
              borderRadius: 6,
              background: "rgba(255,255,255,.08)",
              color: "#cfe0d8",
              fontSize: 12 * s,
              fontWeight: 700,
              lineHeight: 1,
              whiteSpace: "nowrap",
            }}
          >
            BEN is thinking…
          </span>
        )}
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? "Play" : "Pause"}
          title="Pause or resume"
          style={{ flex: "none", display: "flex", alignItems: "center", justifyContent: "center", height: 30 * s, padding: `0 ${12 * s}px`, border: `1px solid ${paused ? "#a94848" : "rgba(255,255,255,.18)"}`, borderRadius: 6, background: paused ? "#8a3030" : "rgba(255,255,255,.10)", color: paused ? "#fff" : "#eef4f1", fontSize: 13 * s, fontWeight: 700, lineHeight: 1, whiteSpace: "nowrap", cursor: "pointer" }}
        >
          {paused ? "Play" : "Pause"}
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
              ? "Advance one action"
              : "A human is to act — bid or play from the hand"
          }
          style={{ flex: "none", display: "flex", alignItems: "center", justifyContent: "center", width: 30 * s, height: 30 * s, border: "1px solid rgba(255,255,255,.18)", borderRadius: 6, background: "rgba(255,255,255,.10)", color: "#eef4f1", fontSize: 13 * s, lineHeight: 1, cursor: active ? "pointer" : "default", opacity: active ? 1 : 0.42 }}
        >
          ▶
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

"use client";

// SEE IT AS YOUR LEARNER (owner ask 2026-08-19) — the door to a rehearsal of
// the coach's own curated board.
//
// The studio shows the authoring side; the learner's side is a different
// experience and was, until this button, unseeable without assigning the board
// to a real person. One POST opens the learner's own sitting — their chair,
// their intro, the lesson's cards in the Know panel, the nudge when the line is
// left, the debrief — marked as a preview so nothing about it is recorded.
//
// Shaped after ReviseLineButton, and deliberately the same pattern: post, take
// the sessionId, walk into the table. `tableBase` is the host's, because the app
// and the web reach the table by different paths.

import { useState } from "react";

export function PreviewAsLearnerButton({
  entryId,
  tableBase,
  variant = "button",
}: Readonly<{
  entryId: string;
  tableBase: string;
  /** "button" for a page that has room to explain; "link" for the studio's
   *  finish panel, where the words around it already have. */
  variant?: "button" | "link";
}>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/bridge/curated/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        sessionId?: string;
        error?: string;
      };
      if (!res.ok || !data.sessionId) {
        setError(data.error ?? "Couldn't open the preview — try again.");
        setBusy(false);
        return;
      }
      window.location.assign(`${tableBase}${data.sessionId}`);
    } catch {
      setError("Couldn't open the preview — try again.");
      setBusy(false);
    }
  };

  if (variant === "link") {
    return (
      <div>
        <button
          type="button"
          onClick={() => void open()}
          disabled={busy}
          style={{
            display: "inline-block", padding: 0, borderWidth: 0,
            background: "transparent", color: "#105431",
            fontSize: 11.5, fontWeight: 700, fontFamily: "inherit",
            textDecorationLine: "underline", textUnderlineOffset: 3,
            cursor: busy ? "default" : "pointer",
          }}
        >
          {busy ? "Opening the preview…" : "See it as your learner"}
        </button>
        {error && (
          <p role="alert" style={{ margin: "6px 0 0", fontSize: 11, color: "#8c2b24" }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void open()}
        disabled={busy}
        style={{
          border: "1px solid #105431",
          background: "#105431",
          color: "#fff",
          borderRadius: 999,
          padding: "9px 16px",
          fontWeight: 700,
          fontSize: 13,
          fontFamily: "inherit",
          cursor: busy ? "default" : "pointer",
        }}
      >
        {busy ? "Opening the preview…" : "See it as your learner"}
      </button>
      <p style={{ margin: "6px 0 0", fontSize: 11, color: "#7b7466", lineHeight: 1.5 }}>
        Plays the board from your learner&rsquo;s chair, with everything they get: your
        intro, the cards this board teaches, the nudge when they leave your line, your
        debrief at the end. Nothing about it is recorded — not their progress, not
        yours — and you can open a fresh one whenever you like.
      </p>
      {error && (
        <p role="alert" style={{ margin: "6px 0 0", fontSize: 12, color: "#8c2b24" }}>
          {error}
        </p>
      )}
    </div>
  );
}

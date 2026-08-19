"use client";

// REVISE THE LINE (curated v2, owner design 2026-08-18): reopen a published
// curated deal as a studio sitting — the same board, primed with the recorded
// line, every seat the coach's. They undo back to the decision they want to
// replay from, play the new road, and publish; the save route then updates
// THIS entry in place (updateEntryId), so future assignments get the
// revision while copy-on-assign keeps every learner mid-board on the version
// they were given.

import { useState } from "react";

import type { CuratedAnnotation } from "@/lib/curated";

import { CURATE_SETTINGS_KEY, type CuratedBoardSettings } from "./curateSettings";

export function ReviseLineButton({
  entryId,
  settings,
  annotations,
  tableBase,
}: Readonly<{
  entryId: string;
  /** The entry's current board settings — they ride into the studio so the
   *  republish keeps them (still editable at publish). */
  settings: CuratedBoardSettings;
  /** The entry's annotations, seeded into the studio rail — a revision that
   *  started blank would WIPE the coach's words on republish. Any that the
   *  new line no longer visits are dropped by the publish validation. */
  annotations: CuratedAnnotation[];
  tableBase: string;
}>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const revise = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/bridge/curated/author", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromEntryId: entryId }),
      });
      const data = (await res.json().catch(() => ({}))) as { sessionId?: string; error?: string };
      if (!res.ok || !data.sessionId) {
        setError(data.error ?? "Couldn't open the studio — try again.");
        setBusy(false);
        return;
      }
      try {
        sessionStorage.setItem(
          CURATE_SETTINGS_KEY(data.sessionId),
          JSON.stringify({ ...settings, revisesEntryId: entryId, annotations }),
        );
      } catch {
        // Storage refused — the studio falls back to defaults, and the
        // publish lands as a NEW entry instead of a revision. Imperfect but
        // never destructive.
      }
      window.location.assign(`${tableBase}${data.sessionId}?author=1`);
    } catch {
      setError("Couldn't open the studio — try again.");
      setBusy(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => void revise()}
        disabled={busy}
        style={{
          border: "1px solid #105431",
          background: "transparent",
          color: "#105431",
          borderRadius: 999,
          padding: "9px 16px",
          fontWeight: 700,
          fontSize: 13,
          fontFamily: "inherit",
          cursor: busy ? "default" : "pointer",
        }}
      >
        {busy ? "Opening the studio…" : "Revise the line — replay the board"}
      </button>
      <p style={{ margin: "6px 0 0", fontSize: 11, color: "#7b7466", lineHeight: 1.5 }}>
        Opens the board in the studio, primed with your recorded line — undo back to any
        decision and replay from there. Publishing updates this deal for future assignments;
        learners already playing keep their version. Annotations at decisions the new line no
        longer visits are dropped.
      </p>
      {error && (
        <p role="alert" style={{ margin: "6px 0 0", fontSize: 12, color: "#8c2b24" }}>{error}</p>
      )}
    </div>
  );
}

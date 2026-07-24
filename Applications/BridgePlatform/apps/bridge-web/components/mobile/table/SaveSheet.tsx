"use client";

// Save-to-library sheet (mobile). The toolbar pill opens a bottom sheet with
// the REAL save form — kind select / name / notes — posting saveToLibraryAction
// with mobile=1 so it redirects back to /m/table/{id}?saved=kind. Same fields
// the desktop dropdown posts (sessionId, kind, name, notes).

import { useState } from "react";
import { saveToLibraryAction } from "@/app/bridge/table/actions";

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

const KIND_HINTS: [string, string, string][] = [
  ["deal", "Deal", "cards only"],
  ["board", "Board", "+ dealer / vul"],
  ["play", "Play", "calls + cards"],
  ["table", "Table", "the lineup"],
];

export function SaveSheet({
  sessionId,
  boardName,
  bbo,
}: Readonly<{ sessionId: string; boardName: string; bbo?: boolean }>) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Save to library"
        title="Save to library"
        style={FROSTED}
      >
        💾 save
      </button>

      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 70 }}>
          <div
            onClick={() => setOpen(false)}
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,.4)",
              animation: "fadeIn .2s ease",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              background: "#fff",
              borderRadius: "20px 20px 0 0",
              boxShadow: "0 -10px 40px rgba(0,0,0,.35)",
              animation: "sheetUp .28s cubic-bezier(.2,.8,.2,1)",
              padding: "14px 16px 34px",
            }}
          >
            <div
              style={{
                width: 38,
                height: 4,
                borderRadius: 2,
                background: "#e7e1d3",
                margin: "0 auto 12px",
              }}
            />
            <h3
              style={{
                font: "500 18px var(--font-fraunces), serif",
                color: "#1d1a15",
                margin: "0 0 10px",
              }}
            >
              Save to library
            </h3>
            <form
              action={saveToLibraryAction}
              style={{ display: "flex", flexDirection: "column", gap: 8 }}
            >
              <input type="hidden" name="sessionId" value={sessionId} />
              <input type="hidden" name="mobile" value="1" />
              {bbo && <input type="hidden" name="skin" value="bbo" />}
              <select
                name="kind"
                defaultValue="board"
                aria-label="What to save"
                style={{
                  border: "1px solid #e7e1d3",
                  borderRadius: 10,
                  padding: "11px 12px",
                  font: "500 13px var(--font-karla), sans-serif",
                  color: "#1d1a15",
                  background: "#fffefa",
                }}
              >
                {KIND_HINTS.map(([value, label, hint]) => (
                  <option key={value} value={value}>
                    {label} — {hint}
                  </option>
                ))}
              </select>
              <input
                name="name"
                placeholder={boardName}
                aria-label="Name"
                style={{
                  border: "1px solid #e7e1d3",
                  borderRadius: 10,
                  padding: "11px 12px",
                  font: "400 13px var(--font-karla), sans-serif",
                  color: "#1d1a15",
                }}
              />
              <textarea
                name="notes"
                rows={2}
                placeholder="Notes (optional)"
                aria-label="Notes"
                style={{
                  border: "1px solid #e7e1d3",
                  borderRadius: 10,
                  padding: "11px 12px",
                  font: "400 13px var(--font-karla), sans-serif",
                  color: "#1d1a15",
                  resize: "vertical",
                }}
              />
              <button
                type="submit"
                style={{
                  border: "none",
                  background: "#205e63",
                  color: "#fff",
                  borderRadius: 10,
                  padding: 12,
                  font: "600 13px var(--font-karla), sans-serif",
                  cursor: "pointer",
                }}
              >
                Save
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

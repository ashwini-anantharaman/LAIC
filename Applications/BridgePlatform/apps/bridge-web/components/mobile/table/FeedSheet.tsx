"use client";

// Decisions feed (mobile): a frosted collapsed bar at the base of the felt
// (count pill + last decision one-liner) that opens a bottom sheet holding the
// full reversed decision list. The cards themselves are rendered server-side
// (they need the pinned-compile English) and passed in as `children`; this
// client shell owns only open/closed. Hidden entirely in learner mode by the
// page never mounting it. The bar hides while the bid box is up (design), but
// the sheet stays reachable once opened.

import { useState } from "react";

export function FeedSheet({
  count,
  lastLine,
  barHidden = false,
  children,
}: Readonly<{
  count: number;
  lastLine: string;
  /** Hide the collapsed bar (e.g. while the bid box occupies the base). */
  barHidden?: boolean;
  children: React.ReactNode;
}>) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {!open && !barHidden && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Open decisions feed (${count})`}
          style={{
            flex: "none",
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            textAlign: "left",
            border: "none",
            background: "rgba(12,36,38,.72)",
            WebkitBackdropFilter: "blur(8px)",
            backdropFilter: "blur(8px)",
            borderTop: "1px solid rgba(255,255,255,.12)",
            padding: "9px 16px calc(env(safe-area-inset-bottom, 0px) + 20px)",
            cursor: "pointer",
          }}
        >
          <span
            style={{
              font: "700 9px var(--font-karla), sans-serif",
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: "#8db5b7",
              background: "rgba(141,181,183,.16)",
              padding: "3px 7px",
              borderRadius: 6,
              flex: "none",
            }}
          >
            🔍 {count}
          </span>
          <span
            style={{
              font: "400 11px var(--font-karla), sans-serif",
              color: "rgba(231,225,211,.82)",
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {lastLine}
          </span>
          <span style={{ color: "rgba(231,225,211,.5)", fontSize: 12 }}>▴</span>
        </button>
      )}

      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60 }}>
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
              maxHeight: "66%",
              overflowY: "auto",
              background: "#f2f0e9",
              borderRadius: "20px 20px 0 0",
              boxShadow: "0 -10px 40px rgba(0,0,0,.35)",
              animation: "sheetUp .28s cubic-bezier(.2,.8,.2,1)",
              padding: "10px 14px 34px",
            }}
          >
            <div
              style={{
                width: 38,
                height: 4,
                borderRadius: 2,
                background: "#d3ccbb",
                margin: "0 auto 10px",
              }}
            />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <span
                style={{
                  font: "600 11px var(--font-karla), sans-serif",
                  letterSpacing: ".12em",
                  textTransform: "uppercase",
                  color: "#a49d8e",
                }}
              >
                Decisions · {count}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  border: "1px solid #d3ccbb",
                  background: "#fff",
                  borderRadius: 8,
                  padding: "4px 10px",
                  font: "500 11px var(--font-karla), sans-serif",
                  color: "#5e5749",
                  cursor: "pointer",
                }}
              >
                Done
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {children}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

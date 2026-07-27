"use client";

import { useState } from "react";

const K = "var(--font-karla), sans-serif";
const SEATS = ["N", "E", "S", "W"] as const;

/** The design's inline dealer segmented control. Four radio inputs (so the
 *  surrounding form still posts name="dealer") rendered as tappable segments;
 *  clicking a segment must not submit the form, hence label+radio, no button. */
export function DealerControl() {
  const [dealer, setDealer] = useState<(typeof SEATS)[number]>("N");
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        color: "#7b7466",
        fontSize: 11,
        fontFamily: K,
      }}
    >
      dealer
      <span
        style={{
          display: "inline-flex",
          border: "1px solid #d3ccbb",
          borderRadius: 7,
          overflow: "hidden",
        }}
      >
        {SEATS.map((s) => (
          <label
            key={s}
            style={{
              padding: "3px 7px",
              font: `600 11px ${K}`,
              cursor: "pointer",
              background: dealer === s ? "#205e63" : "#fff",
              color: dealer === s ? "#fff" : "#5e5749",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="radio"
              name="dealer"
              value={s}
              checked={dealer === s}
              onChange={() => setDealer(s)}
              style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
            />
            {s}
          </label>
        ))}
      </span>
    </span>
  );
}

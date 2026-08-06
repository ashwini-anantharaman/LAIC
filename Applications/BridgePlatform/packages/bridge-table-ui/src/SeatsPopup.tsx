"use client";

// SeatsPopup — the "who is in each seat" overlay behind the bottom bar's Seats
// button (SeatsPopup.dc.html). Lifted verbatim from PlayTable's seatsPopup node.
// The host owns whether it is open and what rows sit inside it.

import type { ReactNode } from "react";

export interface SeatsPopupProps {
  onClose: () => void;
  children: ReactNode;
}

export function SeatsPopup({ onClose, children }: Readonly<SeatsPopupProps>) {
  return (
    <div onClick={onClose} style={{ position: "absolute", inset: 0, zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.5)" }}>
      {/* Without stopPropagation every click inside the card reaches the
          backdrop and dismisses the popup. */}
      <div onClick={(e) => e.stopPropagation()} style={{ width: 320, maxWidth: "calc(100% - 24px)", background: "#16211d", border: "1px solid #3a4a44", borderRadius: 9, boxShadow: "0 18px 40px rgba(0,0,0,.5)", padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#eef4f1" }}>Seats</span>
          <button type="button" aria-label="Close" onClick={onClose} style={{ width: 28, height: 28, border: 0, borderRadius: 5, background: "#2a3a34", color: "#dfe7e3", fontSize: 15, lineHeight: 1, cursor: "pointer" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

"use client";

// The small inline-styled vocabulary the challenge creator and player share.
//
// INLINE STYLES, NOT CLASSES. The platform's own wizard is written in the app's
// Tailwind, with app-specific tokens (`text-invalid`, `bg-[var(--paper)]`) that
// exist nowhere else. A package that is vendored into a strange host has no
// stylesheet and no build step of its own, so every rule it needs travels in
// the markup — the same rule the rest of this package and @bridge/table-ui
// already follow.
//
// The palette is @bridge/table-ui's challenge tokens, so the wizard, the strip,
// the overlay and the leaderboard read as one family.

import type { CSSProperties, ReactNode } from "react";
import { CHALLENGE_ACCENT } from "@bridge/table-ui";

export const ACCENT = CHALLENGE_ACCENT;
export const ACCENT_SOFT = "#eff7f6";
export const INK = "#17211d";
export const INK_MUTED = "#5c6b64";
export const INK_FAINT = "#8b9a93";
export const LINE = "#e4ebe7";
export const SURFACE = "#ffffff";
export const PAPER = "#f7faf8";
export const WARN = "#8a6d1f";
export const WARN_BG = "#fdf6e3";
export const BAD = "#c0392b";
export const BAD_BG = "#fdeeec";

export const UI_FONT =
  "ui-sans-serif,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** The shell every challenge surface in this package sits in. */
export const SHELL: CSSProperties = {
  fontFamily: UI_FONT,
  color: INK,
  fontSize: 13,
  lineHeight: 1.45,
  boxSizing: "border-box",
};

export function Label({
  children,
  style,
}: Readonly<{ children: ReactNode; style?: CSSProperties }>) {
  return (
    <div
      style={{
        marginBottom: 6,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: ".06em",
        textTransform: "uppercase",
        color: INK_FAINT,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Note({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div
      style={{
        marginTop: 8,
        padding: "7px 10px",
        borderRadius: 8,
        background: ACCENT_SOFT,
        color: "#14403f",
        fontSize: 11.5,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

export function Warn({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div
      style={{
        marginTop: 8,
        padding: "7px 10px",
        borderRadius: 8,
        border: `1px solid #f0e2b8`,
        background: WARN_BG,
        color: WARN,
        fontSize: 11.5,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

export function ErrorLine({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div
      role="alert"
      style={{
        marginTop: 8,
        padding: "7px 10px",
        borderRadius: 8,
        border: "1px solid #f3c9c2",
        background: BAD_BG,
        color: BAD,
        fontSize: 11.5,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

/** A numbered wizard section. */
export function Section({
  num,
  title,
  aside,
  children,
  innerRef,
}: Readonly<{
  num: string;
  title: string;
  aside?: string;
  children: ReactNode;
  innerRef?: (el: HTMLElement | null) => void;
}>) {
  return (
    <section
      ref={innerRef}
      style={{
        scrollMarginTop: 84,
        padding: "16px 0",
        borderBottom: `8px solid ${PAPER}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".08em", color: ACCENT }}>
          {num}
        </span>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: INK }}>{title}</h3>
        {aside && (
          <>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 11.5, color: INK_FAINT }}>{aside}</span>
          </>
        )}
      </div>
      {children}
    </section>
  );
}

/** A segmented choice: one row of equal buttons, the picked one filled. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: Readonly<{
  options: readonly { key: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel?: string;
}>) {
  return (
    <div style={{ display: "flex", gap: 6 }} role="group" aria-label={ariaLabel}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.key)}
            style={{
              flex: 1,
              minWidth: 0,
              height: 40,
              padding: "0 6px",
              borderRadius: 8,
              border: `1px solid ${on ? ACCENT : LINE}`,
              background: on ? ACCENT : SURFACE,
              color: on ? "#fff" : INK_MUTED,
              fontFamily: "inherit",
              fontSize: 12.5,
              fontWeight: on ? 800 : 600,
              cursor: "pointer",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** The primary action. */
export function PrimaryButton({
  children,
  onClick,
  disabled,
  style,
}: Readonly<{
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  style?: CSSProperties;
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 44,
        width: "100%",
        border: 0,
        borderRadius: 9,
        background: disabled ? "#d7ded9" : ACCENT,
        color: disabled ? "#8b9a93" : "#fff",
        fontFamily: "inherit",
        fontSize: 14.5,
        fontWeight: 800,
        cursor: disabled ? "default" : "pointer",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/** A small pill button — the chips inside a board card. */
export function Chip({
  children,
  onClick,
  title,
  ariaLabel,
  tone = "plain",
  disabled,
}: Readonly<{
  children: ReactNode;
  onClick?: () => void;
  title?: string;
  ariaLabel?: string;
  tone?: "plain" | "accent" | "alarm";
  disabled?: boolean;
}>) {
  const style: CSSProperties = {
    flex: "none",
    padding: "5px 10px",
    borderRadius: 999,
    border: `1px solid ${tone === "accent" ? "#b9dcd9" : tone === "alarm" ? "#f3c9c2" : LINE}`,
    background: tone === "accent" ? ACCENT_SOFT : tone === "alarm" ? BAD_BG : SURFACE,
    color: tone === "accent" ? "#14403f" : tone === "alarm" ? BAD : INK_MUTED,
    fontFamily: "inherit",
    fontSize: 11,
    fontWeight: 700,
    cursor: onClick && !disabled ? "pointer" : "default",
  };
  if (!onClick) return <span style={style}>{children}</span>;
  return (
    <button type="button" onClick={onClick} title={title} aria-label={ariaLabel} disabled={disabled} style={style}>
      {children}
    </button>
  );
}

/** One key/value line in the review list. */
export function ReviewLine({
  k,
  v,
  last,
}: Readonly<{ k: string; v: string; last?: boolean }>) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "9px 12px",
        borderBottom: last ? 0 : `1px solid ${PAPER}`,
      }}
    >
      <span
        style={{
          width: 84,
          flex: "none",
          fontSize: 10.5,
          letterSpacing: ".04em",
          textTransform: "uppercase",
          color: INK_FAINT,
        }}
      >
        {k}
      </span>
      <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, lineHeight: 1.4 }}>{v}</span>
    </div>
  );
}

export const inputStyle: CSSProperties = {
  width: "100%",
  height: 40,
  padding: "0 10px",
  borderRadius: 8,
  border: `1px solid ${LINE}`,
  background: SURFACE,
  color: INK,
  fontFamily: "inherit",
  fontSize: 13.5,
  boxSizing: "border-box",
};

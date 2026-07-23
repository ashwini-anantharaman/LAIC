// Full-screen mobile sheet chrome shared by the fix-at-the-table and
// edit-the-deal overlays: the same backdrop / sheetUp animation / drag handle /
// rounded-20 top as SaveSheet and FeedSheet, but URL-driven — closing is a
// Link back to the felt (preserving paused + mode params), so no client state
// is needed and the body can be fully server-rendered. Server component.

import Link from "next/link";
import type { ReactNode } from "react";

const FONT_KARLA = "var(--font-karla), sans-serif";
const FONT_FRAUNCES = "var(--font-fraunces), serif";

export function MobileSheetShell({
  closeHref,
  closeLabel,
  eyebrow,
  title,
  subtitle,
  headerAction,
  children,
}: Readonly<{
  /** Back to /m/table/{id} with paused + mode preserved. */
  closeHref: string;
  closeLabel: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  /** Optional right-side header control (e.g. the teal Edit link). */
  headerAction?: ReactNode;
  children: ReactNode;
}>) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 80 }}>
      <Link
        href={closeHref}
        aria-label={closeLabel}
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
          top: "calc(env(safe-area-inset-top, 0px) + 18px)",
          display: "flex",
          flexDirection: "column",
          background: "#faf8f2",
          borderRadius: "20px 20px 0 0",
          boxShadow: "0 -10px 40px rgba(0,0,0,.35)",
          animation: "sheetUp .28s cubic-bezier(.2,.8,.2,1)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: 38,
            height: 4,
            borderRadius: 2,
            background: "#d3ccbb",
            margin: "10px auto 0",
            flex: "none",
          }}
        />
        <div
          style={{
            flex: "none",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "10px 16px 12px",
            borderBottom: "1px solid #e7e1d3",
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <p
              style={{
                margin: 0,
                font: `700 9px ${FONT_KARLA}`,
                letterSpacing: ".12em",
                textTransform: "uppercase",
                color: "#a49d8e",
              }}
            >
              {eyebrow}
            </p>
            <h2
              style={{
                margin: "2px 0 0",
                font: `500 18px ${FONT_FRAUNCES}`,
                color: "#1d1a15",
                lineHeight: 1.2,
              }}
            >
              {title}
            </h2>
            {subtitle && (
              <p
                style={{
                  margin: "4px 0 0",
                  font: `400 11px/1.45 ${FONT_KARLA}`,
                  color: "#7b7466",
                }}
              >
                {subtitle}
              </p>
            )}
          </div>
          <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 6 }}>
            {headerAction}
            <Link
              href={closeHref}
              aria-label={closeLabel}
              style={{
                border: "1px solid #d3ccbb",
                background: "#fff",
                borderRadius: 8,
                padding: "5px 12px",
                font: `500 11px ${FONT_KARLA}`,
                color: "#5e5749",
                textDecoration: "none",
              }}
            >
              Done
            </Link>
          </div>
        </div>
        <div
          className="m-scroll"
          style={{
            flex: 1,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            padding: "14px 16px calc(env(safe-area-inset-bottom, 0px) + 30px)",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

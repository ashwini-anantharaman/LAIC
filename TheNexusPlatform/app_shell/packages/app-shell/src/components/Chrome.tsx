/** Shared atmosphere: token-driven washes + film grain. */
import { useId } from "react";

export function Atmosphere() {
  const raw = useId();
  const id = "g" + raw.replace(/[^a-zA-Z0-9]/g, "");
  return (
    <>
      <div className="shell-atmosphere" aria-hidden />
      <svg className="shell-grain" aria-hidden xmlns="http://www.w3.org/2000/svg">
        <filter id={id}>
          <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${id})`} opacity="0.5" />
      </svg>
    </>
  );
}

export function Mark({ glyph, small }: { glyph?: string; small?: boolean }) {
  return <div className={`mark${small ? " small" : ""}`}>{glyph || "●"}</div>;
}

"use client";

// Owlee's face — the coach's avatar, shared by every surface that names
// Owlee: the panel headers (CoachPanel) and the Tell screen's answer line
// (CoachEventAsk). Its own module because CoachPanel already imports from
// CoachEventAsk, so importing the face back out of CoachPanel would be a
// cycle.

/**
 * The mascot art cropped to a round badge, zoomed to the owl's head
 * (owner direction 2026-08-14: the coach is named Owlee and wears the owl).
 * Decorative; the name beside it does the naming.
 *
 * ALIVE, quietly (owner pick #4, 2026-08-14): a static crop reads as a
 * logo, so the badge carries a mood —
 *   idle     the default: a tiny head-shake every few seconds, mostly still
 *   working  a gentle continuous rock while an answer is being written
 *   proud    one springy pop, for a clean board
 * All transform-only (no repaints of the image), and all off under
 * prefers-reduced-motion.
 */
export function OwleeFace({
  size,
  mood = "idle",
}: Readonly<{ size: number; mood?: "idle" | "working" | "proud" }>) {
  return (
    <span
      aria-hidden
      className={`owlee-${mood}`}
      style={{
        flex: "none", width: size, height: size, borderRadius: "50%",
        overflow: "hidden", position: "relative", display: "block",
        background: "#f5a95b", // the home screen's sunset orange, while the image streams in
        boxShadow: "inset 0 0 0 1px rgba(42,5,6,.25)",
      }}
    >
      <style>{`.owlee-idle{animation:owleeIdle 7s ease-in-out infinite}
.owlee-working{animation:owleeWork .9s ease-in-out infinite}
.owlee-proud{animation:owleeProud .6s cubic-bezier(.34,1.56,.64,1) both}
@keyframes owleeIdle{0%,90%,100%{transform:rotate(0)}93%{transform:rotate(-7deg)}96%{transform:rotate(6deg)}}
@keyframes owleeWork{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(5deg)}}
@keyframes owleeProud{0%{transform:scale(1) rotate(0)}45%{transform:scale(1.18) rotate(-8deg)}100%{transform:scale(1) rotate(0)}}
@media (prefers-reduced-motion:reduce){.owlee-idle,.owlee-working,.owlee-proud{animation:none!important}}`}</style>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {/* The owl's head sits in the upper middle of the square scene, so the
          badge zooms to it: 180%, nudged so both lenses and the ear tufts
          land inside the circle. Verified against the real art at 20-96px.
          maxWidth: none is LOAD-BEARING — Tailwind's preflight (globals.css)
          clamps every img to max-width:100%, which squashed the zoom into a
          narrow strip and left the badge half gold. */}
      <img
        src="/coach/owlee.png"
        alt=""
        style={{ position: "absolute", width: "180%", height: "180%", maxWidth: "none", left: "-48%", top: "-2%", objectFit: "cover" }}
      />
    </span>
  );
}

// Shared style tokens for the platform admin UI, extracted from App.tsx so new
// feature components (offerings/apps/registrations) don't duplicate them.

export const BASE = "#1a1a1e";
export const PANEL = "#141417";
export const INPUT_BG = "#222228";
export const BORDER = "rgba(255,255,255,0.09)";
export const MUTED = "rgba(255,255,255,0.40)";
export const FONT_HEAD = "'Space Grotesk', sans-serif";
export const FONT_BODY = "'DM Sans', sans-serif";

export const slide = {
  initial: { opacity: 0, y: 22 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -14 },
  transition: { duration: 0.38, ease: [0.25, 0.1, 0.25, 1] as const },
};

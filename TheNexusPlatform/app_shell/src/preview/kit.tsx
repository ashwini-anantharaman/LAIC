/**
 * Shared preview primitives — the dark "shell" look (ported from the Multi-App
 * Shells design) plus a real line-icon set so screens never fall back to the
 * abstract glyphs that read as AI-generated. Everything here is config-agnostic;
 * the accent color is always passed in from AppShellConfig.
 */
import type { ContentPlatform } from "../types";

/** Fixed neutrals for the shell chrome. Accent varies per app (passed in). */
export const PAL = {
  surface: "#0E1320",
  card: "#161C2B",
  hairline: "#262E42",
  chip: "#1C2333",
  ink: "#FFFFFF",
  slate: "#9AA6BF",
  muted: "#6B7793",
} as const;

type IconName =
  | "home" | "book" | "bars" | "user" | "users" | "cards" | "calendar"
  | "pulse" | "clipboard" | "play" | "trophy" | "target" | "history"
  | "search" | "chat" | "graduation" | "spade" | "check" | "lock"
  | "chevronRight" | "chevronLeft" | "grid" | "bell" | "flame" | "pin";

const PATHS: Record<IconName, string> = {
  home: "M3 10.6 12 3.4l9 7.2V20a1.6 1.6 0 0 1-1.6 1.6h-4.4v-6h-6v6H4.6A1.6 1.6 0 0 1 3 20z",
  book: "M12 6.5C10.5 5 8.5 4.3 5 4.3v13c3.5 0 5.5.7 7 2.2 1.5-1.5 3.5-2.2 7-2.2v-13c-3.5 0-5.5.7-7 2.2z M12 6.5v13",
  bars: "M4.5 20V12 M10.2 20V5 M15.9 20v-5.5 M21.5 20H2.5",
  user: "M12 4.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z M4.5 20.5a7.5 7.5 0 0 1 15 0",
  users: "M9 4.8a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4z M2.5 20a6.5 6.5 0 0 1 13 0 M16 5.2a3.2 3.2 0 0 1 0 5.6 M17.5 14.2A6.5 6.5 0 0 1 21.5 20",
  cards: "M3.5 6h10v14H3.5z M7.5 6V4.6A1.6 1.6 0 0 1 9.1 3h8.4A2 2 0 0 1 19.5 5v11",
  calendar: "M3.5 5.5h17v15H3.5z M8 3.5v4 M16 3.5v4 M3.5 10.5h17",
  pulse: "M3 12.5h4l2.5-6 4 12 2.5-6H21",
  clipboard: "M8.5 4.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-13a2 2 0 0 0-2-2h-1.5 M9 4.5V3h6v1.5 M9 12.4l2.2 2.2 4.3-4.7",
  play: "M8 5.5v13l11-6.5z",
  trophy: "M7 4.5h10v3a5 5 0 0 1-10 0z M9 15h6 M10 18.5h4 M4.5 5.5H7v2a3 3 0 0 1-2.5-2z M19.5 5.5H17v2a3 3 0 0 0 2.5-2z",
  target: "M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17z M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z",
  history: "M12 4a8 8 0 1 1-7.6 5.5 M4 4v3.5h3.5 M12 8v4.2l3 1.8",
  search: "M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14z M16.2 16.2 21 21",
  chat: "M4.5 5.5h15v10h-9l-4 3.5v-3.5h-2z",
  graduation: "M2.5 8.5 12 4.5l9.5 4L12 12.5z M6.5 10.6v4.1c0 1.7 2.5 3.1 5.5 3.1s5.5-1.4 5.5-3.1v-4.1",
  spade: "M12 3.5c3.5 3.3 6.5 5.6 6.5 8.8a3.4 3.4 0 0 1-5.4 2.7c.2 1.8.9 3 2.4 4H8.5c1.5-1 2.2-2.2 2.4-4a3.4 3.4 0 0 1-5.4-2.7c0-3.2 3-5.5 6.5-8.8z",
  check: "M5 12.5 9.5 17 19 7",
  lock: "M5 10.5h14v10H5z M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5",
  chevronRight: "M9 5l7 7-7 7",
  chevronLeft: "M15 5l-7 7 7 7",
  grid: "M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z",
  bell: "M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z M10 20.5a2.4 2.4 0 0 0 4 0",
  flame: "M12 3.5c1 3 4 4 4 7.5a4 4 0 0 1-8 0c0-1.4.6-2.4 1.5-3.3C10 6.5 11 5 12 3.5z",
  pin: "M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z M12 7.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z",
};

export function Icon({ name, size = 20, color = PAL.slate, fill = false, stroke = 1.5 }: {
  name: IconName; size?: number; color?: string; fill?: boolean; stroke?: number;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? color : "none"}
      stroke={fill ? "none" : color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name].split(" M").map((seg, i) => <path key={i} d={(i ? "M" : "") + seg} />)}
    </svg>
  );
}

/** Map a nav/tile/option label to a real icon (keyword match, grid fallback). */
export function labelIcon(label: string): IconName {
  const l = label.toLowerCase();
  if (/home|today/.test(l)) return "home";
  if (/habit|routine|daily/.test(l)) return "history";
  if (/exam|checkpoint/.test(l)) return "clipboard";
  if (/explore|browse|discover|search|subject|topic/.test(l)) return "search";
  if (/teach|mentor|others|connect|stay/.test(l)) return "users";
  if (/quiz|test/.test(l)) return "clipboard";
  if (/learn|lesson|course|study|prep/.test(l)) return "book";
  if (/progress|stat|growth/.test(l)) return "bars";
  if (/profile|account|me\b/.test(l)) return "user";
  if (/hand|analys|deal/.test(l)) return "cards";
  if (/club|member|team|communit/.test(l)) return "users";
  if (/program|event|schedule|arena|organi/.test(l)) return "calendar";
  if (/join/.test(l)) return "calendar";
  if (/activity|feed|track/.test(l)) return "pulse";
  if (/play|start|practi|drill|seat/.test(l)) return "play";
  if (/rank|leaderboard|score/.test(l)) return "trophy";
  if (/session|replay|history/.test(l)) return "history";
  if (/bid|chat|message/.test(l)) return "chat";
  if (/goal|target/.test(l)) return "target";
  return "grid";
}

export function platformIcon(p: ContentPlatform): IconName {
  return p === "bridge" ? "spade" : "graduation";
}

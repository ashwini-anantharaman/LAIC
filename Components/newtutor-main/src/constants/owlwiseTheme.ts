import type { ContentMode } from "../types";

/** Design tokens from Follow Markdown Prompt (Figma: Escgvb5qbzQzjfxXrdc2N7) */
export const owlwise = {
  bg: "#fdf8f5",
  burgundy: "#602424",
  heading: "#2c0312",
  surface: "#ffffff",
  muted: "#9ca3af",
  interactiveBg: "#161618",
  summaryBg: "#ffeec3",
  narrativeBg: "#fcf5e3",
  continueGreen: "#b2f99b",
  continueGreenText: "#0a2e0a",
} as const;

export type OwlwiseMode = "interactive" | "summary" | "narrative";

export const OWLWISE_TO_CONTENT: Record<OwlwiseMode, ContentMode> = {
  interactive: "conversational",
  summary: "textbook",
  narrative: "real-world",
};

export const CONTENT_TO_OWLWISE: Record<ContentMode, OwlwiseMode> = {
  conversational: "interactive",
  textbook: "summary",
  "real-world": "narrative",
};

export const MODE_CONFIG: Record<
  OwlwiseMode,
  { bg: string; statusLight: boolean; progressColor: string }
> = {
  interactive: {
    bg: owlwise.interactiveBg,
    statusLight: true,
    progressColor: "bg-gradient-to-r from-[#d2f1c7] to-[#a8fd8c]",
  },
  summary: {
    bg: owlwise.summaryBg,
    statusLight: false,
    progressColor: "bg-[#5a454d]",
  },
  narrative: {
    bg: owlwise.narrativeBg,
    statusLight: false,
    progressColor: "bg-[#535353]",
  },
};

import type { StudioBlockType, StudioToolKind } from "../../learning/types";

/** Block colors + labels matching brainbee-studio.html mockup */
export const BLOCK_META: Record<StudioBlockType, { label: string; c: string }> = {
  hook: { label: "Hook", c: "#8f7be8" },
  study: { label: "Lesson", c: "#149c93" },
  check: { label: "Check question", c: "#e6b34d" },
  quiz: { label: "Mastery quiz", c: "#d1436a" },
  case: { label: "Case file", c: "#3fd0c0" },
  animation: { label: "Brain animation", c: "#5b8def" },
  flashcards: { label: "Flashcards", c: "#149c93" },
  reflection: { label: "Reflection", c: "#8f7be8" },
  image: { label: "Image", c: "#e0567a" },
};

export const BLOCK_LABELS: Record<StudioBlockType, string> = Object.fromEntries(
  Object.entries(BLOCK_META).map(([k, v]) => [k, v.label])
) as Record<StudioBlockType, string>;

export const BLOCK_COLORS: Record<StudioBlockType, string> = Object.fromEntries(
  Object.entries(BLOCK_META).map(([k, v]) => [k, v.c])
) as Record<StudioBlockType, string>;

export const TOOL_LABELS: Record<StudioToolKind, string> = {
  cases: "Cases",
  cards: "Cards",
  vocab: "Vocab",
  custom: "Custom",
};

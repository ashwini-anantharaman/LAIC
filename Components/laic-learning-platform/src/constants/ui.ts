import type { MasteryLevel, ContentMode } from "../types";
import { figmaMastery } from "./figmaTheme";

export const MASTERY: Record<
  MasteryLevel,
  { color: string; label: string; fillCount: number }
> = {
  "not-seen": { color: figmaMastery["not-seen"].color, label: figmaMastery["not-seen"].label, fillCount: 1 },
  exposed: { color: figmaMastery.exposed.color, label: figmaMastery.exposed.label, fillCount: 2 },
  practiced: { color: figmaMastery.practiced.color, label: figmaMastery.practiced.label, fillCount: 3 },
  understood: { color: figmaMastery.understood.color, label: figmaMastery.understood.label, fillCount: 4 },
  mastered: { color: figmaMastery.mastered.color, label: figmaMastery.mastered.label, fillCount: 5 },
};

export const CONTENT_MODES: Record<
  ContentMode,
  { emoji: string; label: string; desc: string }
> = {
  "real-world": { emoji: "🌍", label: "Real World", desc: "Analogies & applications" },
  conversational: { emoji: "💡", label: "Conversational", desc: "Informal & friendly" },
  textbook: { emoji: "📖", label: "Textbook", desc: "Formal summary" },
};

export const HINT_LABELS = ["Nudge", "Concept", "Direction", "Explanation"] as const;

export const MUTED_BTN =
  "disabled:bg-[#eef2ff] disabled:text-[#a3b3ff] disabled:shadow-none";

export const USER_INITIALS: Record<string, string> = {
  "Alex Kim": "AK",
  "Dr. Ashwini": "DA",
};

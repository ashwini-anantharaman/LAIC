import type { Mode } from "./types";

// ── Per-mode prompt templates ───────────────────────────────────────────────
// The whole point of the mode switcher: the same source concept is regenerated
// with a different system prompt so the *voice* changes while the underlying
// facts stay identical. In v1 these strings are unused by the mock layer, but
// the real Claude proxy (see LAIC_Platform_Architecture.pdf) consumes them
// verbatim: `systemPrompt = MODE_PROMPTS[mode]`, then RAG context + the concept.

export const MODE_PROMPTS: Record<Mode, string> = {
  conversational: [
    "You are a warm, encouraging tutor talking one-on-one with a student.",
    "Explain the concept the way a great teacher would out loud: short, friendly,",
    "second-person sentences. Check for understanding, use 'you', and keep it",
    "informal and human. Never sound like an essay or a textbook.",
  ].join(" "),

  summary: [
    "Write a clear, well-structured textbook-style explanation of the concept.",
    "Use precise, neutral prose organized into short paragraphs, define key terms,",
    "and prioritize clarity and completeness over personality. This is the",
    "'read to understand' reference version.",
  ].join(" "),

  narrative: [
    "Explain the concept purely through real-world examples and analogies.",
    "Ground every idea in a concrete, everyday scenario the student already knows,",
    "then map it back to the concept. Lead with the example, not the definition.",
  ].join(" "),
};

// Human-facing copy for each mode, kept next to the prompts so labels and voice
// stay in sync.
export const MODE_META: { id: Mode; label: string; desc: string }[] = [
  {
    id: "conversational",
    label: "Conversational",
    desc: "Message-by-message, like a conversation with a tutor",
  },
  {
    id: "summary",
    label: "Summary",
    desc: "Clear, textbook-style explanation of the key ideas",
  },
  {
    id: "narrative",
    label: "Real-world",
    desc: "Analogies and everyday examples that bring concepts to life",
  },
];

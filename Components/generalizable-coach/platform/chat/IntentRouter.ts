/**
 * Zone 1 — Platform core: intent router for the chat surface (LAIC §6.3, M3/C5).
 *
 * Classifies a free-text learner message into one or more intents. Rule-based
 * for now (LLM classification later). A compound message like "explain spaced
 * repetition and quiz me" yields BOTH an `ask` and a `command`. Runs BEFORE
 * scope/gating, so it only proposes what a turn is about — safety is enforced
 * downstream.
 */
export type IntentKind = "ask" | "command" | "meta";
export type ToolHint = "quiz" | "flashcards" | "study_plan" | "generic";

export interface Intent {
  kind: IntentKind;
  text: string;
  toolHint?: ToolHint;
}

const COMMAND_PATTERNS: { re: RegExp; hint: ToolHint }[] = [
  { re: /\b(quiz|test)\s+me\b|\bgive me a quiz\b|\bquiz\b/i, hint: "quiz" },
  { re: /\bflash\s?cards?\b|\bmake .*cards?\b/i, hint: "flashcards" },
  { re: /\bstudy plan\b/i, hint: "study_plan" },
];

const META_PATTERNS: RegExp[] = [
  /\bwhat did we (cover|do|discuss|learn)\b/i,
  /\blast (time|week|session)\b/i,
  /\bremind me what\b/i,
];

const ASK_PATTERNS: RegExp[] = [
  /\b(explain|what|what'?s|how|why|describe|define|summar(y|ise|ize))\b/i,
  /\btell me about\b/i,
  /\bhelp me understand\b/i,
  /\bi (don'?t|do not) (get|understand)\b/i,
];

export class IntentRouter {
  route(message: string): Intent[] {
    const intents: Intent[] = [];

    if (META_PATTERNS.some((re) => re.test(message))) {
      intents.push({ kind: "meta", text: message });
    }

    for (const p of COMMAND_PATTERNS) {
      if (p.re.test(message)) {
        intents.push({ kind: "command", text: message, toolHint: p.hint });
        break;
      }
    }

    const metaMatched = intents.some((i) => i.kind === "meta");
    const asksSomething = ASK_PATTERNS.some((re) => re.test(message));
    // Lead with an ask when the message explicitly asks (but not for a pure meta
    // recall, whose "what" would false-trigger), or when nothing else matched.
    if ((asksSomething && !metaMatched) || intents.length === 0) {
      intents.unshift({ kind: "ask", text: message });
    }

    return intents;
  }
}

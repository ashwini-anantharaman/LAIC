import type { ContentBlock, TestBlockContent } from "../../types";

export function isPlaceholderMcqOption(opt: string): boolean {
  return /^option\s*[a-d]$/i.test(opt.trim());
}

export function isPlaceholderMcq(options: string[]): boolean {
  if (options.length < 4) return true;
  return options.filter((o) => isPlaceholderMcqOption(o)).length >= 3;
}

export const LESSON_STEP_TAGS = [
  "Hook",
  "Build intuition",
  "Study",
  "Quiz",
  "Flashcards",
  "Reflection",
  "Unit test",
] as const;

function parseQuestionsRaw(content: Record<string, unknown>): unknown[] {
  const raw = content.questions;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* ignore */
    }
  }
  return [];
}

export function getLessonBlocks(blocks: ContentBlock[]) {
  let test: ContentBlock | undefined;
  for (const b of blocks) {
    if (b.type === "Test" && testFromBlock(b)) {
      test = b;
      break;
    }
  }
  return {
    animation: blocks.find((b) => b.type === "Animation"),
    mcqs: blocks.filter((b) => b.type === "MCQ"),
    flashcard: blocks.find((b) => b.type === "Flashcard"),
    test,
  };
}

export function mcqFromBlock(block: ContentBlock) {
  const c = block.content ?? {};
  const question = c.question ?? block.title;
  const rawOptions = c.options;
  const options = Array.isArray(rawOptions)
    ? rawOptions.map(String)
    : rawOptions && typeof rawOptions === "object"
      ? Object.values(rawOptions as Record<string, string>).map(String)
      : [];
  if (!question || !options.length) return null;
  if (isPlaceholderMcq(options)) return null;
  const correctRaw = c.correct;
  const correct =
    typeof correctRaw === "number"
      ? correctRaw
      : typeof correctRaw === "string"
        ? parseInt(correctRaw, 10)
        : 0;
  return {
    id: String(c.id ?? block.id),
    question: String(question),
    options,
    correct: Number.isFinite(correct) && correct >= 0 && correct < options.length ? correct : 0,
    hints: c.hints,
    explanation: typeof c.explanation === "string" ? c.explanation : undefined,
  };
}

export function flashcardsFromBlock(block: ContentBlock | undefined) {
  if (!block) return [];
  const cards = block.content?.cards;
  if (!Array.isArray(cards)) return [];
  return cards
    .map((c) => ({
      front: String((c as { front?: string }).front ?? ""),
      back: String((c as { back?: string }).back ?? ""),
    }))
    .filter((c) => c.front && c.back);
}

export function testFromBlock(block: ContentBlock | undefined): TestBlockContent | null {
  if (!block?.content || block.type !== "Test") return null;
  const raw = block.content;
  const r = raw as Record<string, unknown>;
  const questionsRaw = parseQuestionsRaw(r);

  const questions = questionsRaw
    .map((item, i) => {
      const mcq = mcqFromBlock({
        id: block.id,
        type: "MCQ",
        label: block.label,
        title: block.title,
        content: item as Record<string, unknown>,
      });
      if (!mcq) return null;
      return {
        id: mcq.id || `${block.id}-q${i}`,
        question: mcq.question,
        options: mcq.options,
        correct: mcq.correct,
        hints: mcq.hints,
      };
    })
    .filter((q): q is NonNullable<typeof q> => q !== null);

  if (!questions.length) return null;

  const passPct =
    typeof r.passPct === "number"
      ? r.passPct
      : typeof r.passPct === "string"
        ? parseInt(r.passPct, 10) || 80
        : 80;

  const title =
    typeof r.title === "string" && r.title.trim()
      ? r.title.trim()
      : block.title || "Module test";

  return { title, passPct, questions };
}

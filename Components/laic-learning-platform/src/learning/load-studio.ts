import type { ContentBlock, CourseModule } from "../types";
import type { ModuleImportance, StudioBlock, StudioCourseData, StudioPage } from "./types";
import { newStudioBlock } from "./blocks/defaults";

function uid() {
  return crypto.randomUUID();
}

export function legacyBlockToStudio(block: ContentBlock): StudioBlock | null {
  const c = block.content ?? {};
  const id = block.id || uid();
  switch (block.type) {
    case "Text": {
      if (c.hook) {
        return { id, type: "hook", q: String(c.heading ?? block.title), sub: String((c.body as string[])?.[0] ?? "") };
      }
      if (c.caseFile) return c.caseFile as StudioBlock;
      const body = Array.isArray(c.body) ? (c.body as string[]).join("\n\n") : String(c.body ?? "");
      const check = c.inlineCheck as StudioBlock extends { type: "study" } ? never : null;
      return {
        id,
        type: "study",
        kind: "Study",
        title: String(c.heading ?? block.title ?? "Lesson"),
        html: `<p>${body}</p>`,
        src: {
          cite: String(c.citation ?? "Course materials"),
          quote: typeof c.sourceExcerpt === "string" ? c.sourceExcerpt : undefined,
          page: typeof c.referencePage === "number" ? c.referencePage : undefined,
        },
        check: check && typeof check === "object" ? (check as import("./types").InlineCheck) : null,
      };
    }
    case "Animation":
      return {
        id,
        type: "animation",
        title: block.title ?? "Brain animation",
        steps: Array.isArray(c.steps)
          ? (c.steps as { region: string; head: string; text: string }[])
          : [{ region: "cortex", head: block.title ?? "", text: String(c.description ?? "") }],
      };
    case "MCQ": {
      const question = String(c.question ?? "");
      const options = Array.isArray(c.options) ? c.options.map(String) : [];
      if (c.mastery) {
        return {
          id,
          type: "quiz",
          concepts: [
            {
              id: String(c.conceptId ?? `c-${id}`),
              name: block.label || "Concept",
              pool: [{ stem: question, opts: options, ans: Number(c.correct ?? 0), exp: String(c.explanation ?? "") }],
            },
          ],
        };
      }
      return {
        id,
        type: "check",
        concept: block.label || "Concept",
        stem: question,
        opts: options.length >= 2 ? options : ["A", "B", "C", "D"],
        ans: typeof c.correct === "number" ? c.correct : 0,
        exp: String(c.explanation ?? ""),
      };
    }
    case "Flashcard":
      return {
        id,
        type: "flashcards",
        cards: Array.isArray(c.cards)
          ? (c.cards as { front?: string; back?: string }[]).map(
              (card) => [String(card.front ?? ""), String(card.back ?? "")] as [string, string]
            )
          : [],
      };
    case "Reflection":
      return { id, type: "reflection", prompt: String(c.prompt ?? block.title ?? "") };
    default:
      return null;
  }
}

export function modulesToStudioPages(modules: CourseModule[]): StudioPage[] {
  return modules.map((mod, i) => {
    const blocks: StudioBlock[] = [];
    for (const b of mod.blocks) {
      const converted = legacyBlockToStudio(b);
      if (converted) blocks.push(converted);
    }
    if (!blocks.length) blocks.push(newStudioBlock("hook"), newStudioBlock("study"));
    else if (blocks[0]?.type !== "hook") blocks.unshift(newStudioBlock("hook"));
    return {
      id: mod.id,
      moduleId: mod.id,
      title: mod.name,
      importance: (i === 4 ? "optional" : i === 5 ? "featured" : "core") as ModuleImportance,
      blocks,
    };
  });
}

export function emptyStudio(policy: import("./types").ContentPolicy = "generate"): StudioCourseData {
  return { policy, pages: [], tools: [], vocab: [], cards: [] };
}

export { isSkeletonStudio, friendlyGenerationError } from "../../shared/studio/skeleton.js";

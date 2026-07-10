import { DataAPI } from "../lib/api";
import type { ContentBlock, CourseModule } from "../types";
import type { StudioCourseData, StudioPage } from "./types";

export function studioPageToLegacyBlocks(page: StudioPage): Omit<ContentBlock, "id">[] {
  const out: Omit<ContentBlock, "id">[] = [];
  for (const b of page.blocks) {
    switch (b.type) {
      case "study":
        out.push({
          type: "Text",
          label: "Text explanation",
          title: b.title,
          masterySignal: "none",
          content: {
            heading: b.title,
            body: [b.html.replace(/<[^>]+>/g, " ")],
            citation: b.src.cite,
            sourceExcerpt: b.src.quote,
            referencePage: b.src.page,
            inlineCheck: b.check,
          },
        });
        break;
      case "animation":
        out.push({
          type: "Animation",
          label: "3D Animation",
          title: b.title,
          masterySignal: "none",
          content: { description: b.steps[0]?.text ?? b.title, renderer: "interactive", steps: b.steps },
        });
        break;
      case "flashcards":
        out.push({
          type: "Flashcard",
          label: "Flashcard set",
          title: "Flashcards",
          masterySignal: "none",
          content: { cards: b.cards.map(([front, back]) => ({ front, back })) },
        });
        break;
      case "reflection":
        out.push({
          type: "Reflection",
          label: "Reflection prompt",
          title: "Reflection",
          masterySignal: "none",
          content: { prompt: b.prompt },
        });
        break;
      case "quiz":
        for (const concept of b.concepts) {
          for (const q of concept.pool) {
            out.push({
              type: "MCQ",
              label: concept.name,
              title: q.stem.slice(0, 72),
              masterySignal: "binary",
              content: {
                question: q.stem,
                options: q.opts,
                correct: q.ans,
                explanation: q.exp,
                conceptId: concept.id,
                mastery: true,
              },
            });
          }
        }
        break;
      case "check":
        out.push({
          type: "MCQ",
          label: "Check question",
          title: b.stem.slice(0, 72),
          masterySignal: "binary",
          content: { question: b.stem, options: b.opts, correct: b.ans, explanation: b.exp, inline: true },
        });
        break;
      case "hook":
        out.push({
          type: "Text",
          label: "Hook",
          title: b.q.slice(0, 72),
          masterySignal: "none",
          content: { heading: b.q, body: [b.sub], hook: true },
        });
        break;
      case "case":
        out.push({
          type: "Text",
          label: "Case file",
          title: b.name,
          masterySignal: "none",
          content: { caseFile: b },
        });
        break;
      default:
        break;
    }
  }
  return out;
}

export async function saveStudioAndSyncModules(
  courseId: string,
  studio: StudioCourseData,
  modules: CourseModule[],
  deleteBlock: (blockId: string) => Promise<void>,
  addBlock: (moduleId: string, block: Omit<ContentBlock, "id">, sortOrder: number) => Promise<ContentBlock>
): Promise<CourseModule[]> {
  await DataAPI.saveStudio(courseId, studio);
  const next: CourseModule[] = [];

  for (let i = 0; i < studio.pages.length; i++) {
    const page = studio.pages[i];
    const prev = modules.find((m) => m.id === page.moduleId) ?? modules[i];
    const moduleId = page.moduleId ?? page.id;

    for (const b of prev?.blocks ?? []) {
      if (b.id) await deleteBlock(b.id).catch(() => {});
    }

    const legacyBlocks = studioPageToLegacyBlocks(page);
    const saved: ContentBlock[] = [];
    for (let j = 0; j < legacyBlocks.length; j++) {
      const created = await addBlock(moduleId, legacyBlocks[j], j);
      saved.push(created);
    }

    next.push({
      id: moduleId,
      name: page.title,
      chapter: prev?.chapter ?? "General",
      chapterLabel: prev?.chapterLabel ?? "CH 1",
      prereqs: prev?.prereqs ?? [],
      conceptId: prev?.conceptId,
      blocks: saved,
    });
  }

  return next;
}

import type { GeneratedStudioModule, ModuleImportance, StudioBlock, StudioPage } from "./types.js";

function uid() {
  return crypto.randomUUID();
}

/** Deterministic page assembly — same order as Brain Bee mockup `buildPages()`. */
export function assembleModuleBlocks(mod: GeneratedStudioModule): StudioBlock[] {
  const blocks: StudioBlock[] = [
    { id: uid(), type: "hook", q: mod.hook.q, sub: mod.hook.sub },
  ];

  for (const lesson of mod.lessons) {
    blocks.push({
      id: uid(),
      type: "study",
      kind: lesson.kind || "Build intuition",
      title: lesson.title,
      html: lesson.html,
      src: lesson.src,
      check: lesson.check ?? null,
    });
  }

  for (const c of mod.cases ?? []) {
    blocks.push({
      id: uid(),
      type: "case",
      name: c.name,
      tag: c.tag,
      color: c.color || "#3fd0c0",
      rows: c.rows.map((r) => [r[0], r[1]] as [string, string]),
      lesson: c.lesson,
    });
  }

  if (mod.animation?.steps?.length) {
    blocks.push({
      id: uid(),
      type: "animation",
      title: mod.animation.title,
      steps: mod.animation.steps,
    });
  }

  if (mod.quiz?.concepts?.length) {
    blocks.push({
      id: uid(),
      type: "quiz",
      concepts: mod.quiz.concepts.map((c) => ({
        id: c.id || uid(),
        name: c.name,
        pool: c.pool.map((q) => ({
          stem: q.stem,
          opts: q.opts.slice(0, 4),
          ans: q.ans,
          exp: q.exp,
        })),
      })),
    });
  }

  return blocks;
}

export function moduleToPage(
  moduleId: string,
  name: string,
  mod: GeneratedStudioModule,
  importance: ModuleImportance = "core"
): StudioPage {
  return {
    id: moduleId,
    moduleId,
    title: name,
    importance: mod.importance ?? importance,
    blocks: assembleModuleBlocks(mod),
  };
}

/** Splice uploaded images after the first study block per page (mockup `placeOnbImages`). */
export function placeImagesOnPages(
  pages: StudioPage[],
  images: { name: string; src: string }[]
): StudioPage[] {
  if (!images.length) return pages;
  const next = pages.map((p) => ({ ...p, blocks: [...p.blocks] }));
  images.forEach((img, i) => {
    const page = next[i % next.length];
    if (!page) return;
    const studyIdx = page.blocks.findIndex((b) => b.type === "study");
    const at = studyIdx >= 0 ? studyIdx + 1 : 1;
    page.blocks.splice(at, 0, {
      id: uid(),
      type: "image",
      src: img.src,
      caption: `Figure from ${img.name}`,
      alt: img.name,
    });
  });
  return next;
}

export const DEFAULT_IMPORTANCE: ModuleImportance[] = [
  "core",
  "core",
  "core",
  "core",
  "optional",
  "featured",
  "core",
];

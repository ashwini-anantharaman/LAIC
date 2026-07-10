import type { StudioBlock, StudioPage } from "../types";
import { newStudioBlock } from "./blocks/defaults";

export type StudioScreenRef = { pageIndex: number; blockIndex: number };

export function flattenScreens(pages: StudioPage[]): StudioScreenRef[] {
  const screens: StudioScreenRef[] = [];
  pages.forEach((page, pageIndex) => {
    page.blocks.forEach((_, blockIndex) => {
      screens.push({ pageIndex, blockIndex });
    });
  });
  return screens;
}

export function getBlock(pages: StudioPage[], ref: StudioScreenRef): StudioBlock | null {
  return pages[ref.pageIndex]?.blocks[ref.blockIndex] ?? null;
}

export function updateBlock(pages: StudioPage[], ref: StudioScreenRef, block: StudioBlock): StudioPage[] {
  return pages.map((page, pi) =>
    pi !== ref.pageIndex ? page : { ...page, blocks: page.blocks.map((b, bi) => (bi === ref.blockIndex ? block : b)) }
  );
}

export function addBlockToPage(pages: StudioPage[], pageIndex: number, block: StudioBlock, afterIndex?: number): StudioPage[] {
  return pages.map((page, pi) => {
    if (pi !== pageIndex) return page;
    const blocks = [...page.blocks];
    blocks.splice(afterIndex === undefined ? blocks.length : afterIndex + 1, 0, block);
    return { ...page, blocks };
  });
}

export function removeBlock(pages: StudioPage[], ref: StudioScreenRef): StudioPage[] {
  const page = pages[ref.pageIndex];
  if (page && page.blocks.length <= 1) return pages;
  return pages.map((p, pi) =>
    pi !== ref.pageIndex ? p : { ...p, blocks: p.blocks.filter((_, bi) => bi !== ref.blockIndex) }
  );
}

export function moveBlock(pages: StudioPage[], ref: StudioScreenRef, direction: -1 | 1): StudioPage[] {
  const page = pages[ref.pageIndex];
  if (!page) return pages;
  const nextIndex = ref.blockIndex + direction;
  if (nextIndex < 0 || nextIndex >= page.blocks.length) return pages;
  const blocks = [...page.blocks];
  const [item] = blocks.splice(ref.blockIndex, 1);
  blocks.splice(nextIndex, 0, item);
  return pages.map((p, pi) => (pi === ref.pageIndex ? { ...p, blocks } : p));
}

export function addPage(pages: StudioPage[]): StudioPage[] {
  const id = crypto.randomUUID();
  return [
    ...pages,
    {
      id,
      moduleId: id,
      title: "New page",
      importance: "core" as const,
      blocks: [newStudioBlock("hook")],
    },
  ];
}

export function movePage(pages: StudioPage[], from: number, to: number): StudioPage[] {
  if (from === to || from < 0 || to < 0 || from >= pages.length || to >= pages.length) return pages;
  const next = [...pages];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function removePage(pages: StudioPage[], index: number): StudioPage[] {
  if (pages.length <= 1) return pages;
  return pages.filter((_, i) => i !== index);
}

export function updatePage(pages: StudioPage[], index: number, patch: Partial<StudioPage>): StudioPage[] {
  return pages.map((p, i) => (i === index ? { ...p, ...patch } : p));
}

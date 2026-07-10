import type { ContentBlock, CourseModule } from "../types";
import { blocksForConcept } from "./content-blocks";

export interface SourceRef {
  sourceId: string;
  citation: string;
  pageStart?: number | null;
  pageEnd?: number | null;
}

/** Parse page number from citation strings like "brainfacts.pdf · p. 3" or "chunk 2". */
export function pageFromCitation(citation: string): number | null {
  const pageMatch = citation.match(/(?:pp?\.|pages?\s*)(\d+)/i);
  if (pageMatch) return parseInt(pageMatch[1], 10);
  const chunkMatch = citation.match(/chunk\s*(\d+)/i);
  if (chunkMatch) return Math.max(1, parseInt(chunkMatch[1], 10));
  return null;
}

export function sourceRefsFromBlockContent(content: Record<string, unknown> | undefined): SourceRef[] {
  if (!content || !Array.isArray(content.sourceRefs)) return [];
  return content.sourceRefs as SourceRef[];
}

/** Resolve the PDF page a unit should open to. */
export function resolveReferencePage(
  conceptIndex: number,
  totalUnits: number,
  blocks: ContentBlock[],
  pdfPageCount?: number
): number {
  const text = blocks.find((b) => b.type === "Text");
  const content = text?.content as Record<string, unknown> | undefined;

  if (typeof content?.referencePage === "number" && content.referencePage > 0) {
    return content.referencePage;
  }

  const refs = sourceRefsFromBlockContent(content);
  if (refs[0]?.pageStart) return refs[0].pageStart;

  if (content?.citation && typeof content.citation === "string") {
    const fromCitation = pageFromCitation(content.citation);
    if (fromCitation) return fromCitation;
  }

  for (const ref of refs) {
    const p = ref.pageStart ?? pageFromCitation(ref.citation);
    if (p) return p;
  }

  if (pdfPageCount && totalUnits > 0) {
    const pagesPerUnit = Math.max(1, Math.floor(pdfPageCount / totalUnits));
    return Math.min(pdfPageCount, 1 + conceptIndex * pagesPerUnit);
  }

  return Math.max(1, conceptIndex + 1);
}

export function buildUnitReferencePages(
  concepts: { id: string; name: string }[],
  modules: CourseModule[],
  pdfPageCount?: number
): Record<string, number> {
  const map: Record<string, number> = {};
  concepts.forEach((concept, index) => {
    const blocks = blocksForConcept(modules, concept.id, concept.name);
    map[concept.id] = resolveReferencePage(index, concepts.length, blocks, pdfPageCount);
  });
  return map;
}

import type { BlockType, ContentBlock, CourseModule } from "../types";

export type StudentToolsTab = "quizzes" | "tests" | "flashcards" | "audio" | "notes";
export type LessonPanel = "split" | "pdf" | "notes" | "transcript";

export type InstructorBuildAction =
  | { kind: "upload" }
  | { kind: "structure" }
  | { kind: "full-lesson" }
  | { kind: "add-block"; blockType: BlockType; blockLabel: string }
  | { kind: "video" }
  | { kind: "copy-module"; sourceIndex: number };

export interface PendingBuild {
  moduleIndex: number;
  action: InstructorBuildAction;
}

export interface ToolItem {
  conceptId: string;
  conceptName: string;
  block: ContentBlock;
  locked: boolean;
}

export function collectToolItems(
  modules: CourseModule[],
  concepts: { id: string; name: string }[],
  mastery: Record<string, string>,
  tab: StudentToolsTab
): ToolItem[] {
  const typeMap: Record<StudentToolsTab, BlockType[]> = {
    quizzes: ["MCQ"],
    tests: ["Test"],
    flashcards: ["Flashcard"],
    audio: ["Video"],
    notes: ["Text"],
  };
  const types = new Set(typeMap[tab]);
  const items: ToolItem[] = [];

  for (const concept of concepts) {
    const mod = modules.find((m) => m.conceptId === concept.id || m.name === concept.name);
    const blocks = mod?.blocks ?? [];
    const level = mastery[concept.id] ?? "not-seen";
    const locked = level === "not-seen";

    for (const block of blocks) {
      if (types.has(block.type)) {
        items.push({ conceptId: concept.id, conceptName: concept.name, block, locked });
      }
    }
  }
  return items;
}

export function daysUntil(dateIso: string): number {
  const target = new Date(dateIso);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function downloadCertificate(courseTitle: string, studentName: string) {
  const text = [
    "OWLWISE — Certificate of Completion",
    "",
    `This certifies that ${studentName}`,
    `has mastered all units in "${courseTitle}".`,
    "",
    `Date: ${new Date().toLocaleDateString()}`,
  ].join("\n");
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${courseTitle.replace(/\s+/g, "-")}-certificate.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export const ADD_MATERIAL_ACTIONS: Record<string, InstructorBuildAction> = {
  "Upload Materials": { kind: "upload" },
  "Create Quiz": { kind: "full-lesson" },
  "Audio Recap": { kind: "video" },
  "Arcade Game": { kind: "full-lesson" },
  "Create Test": { kind: "add-block", blockType: "Test", blockLabel: "Module test" },
  "Create Flashcards": { kind: "full-lesson" },
  "Explainer Video": { kind: "video" },
  "Text explanation": { kind: "full-lesson" },
  "AI Animation": { kind: "full-lesson" },
  "MCQ question": { kind: "full-lesson" },
  "Flashcard set": { kind: "full-lesson" },
  "Video clip": { kind: "video" },
};

import type { StudioBlock, StudioBlockType } from "../types";

function uid() {
  return crypto.randomUUID();
}

export function newStudioBlock(type: StudioBlockType): StudioBlock {
  const id = uid();
  switch (type) {
    case "hook":
      return { id, type: "hook", q: "A curious question?", sub: "Set the scene." };
    case "study":
      return {
        id,
        type: "study",
        kind: "Build intuition",
        title: "New lesson",
        html: "<p>Write the explanation here.</p>",
        src: { cite: "Course materials", page: 1 },
        check: null,
      };
    case "check":
      return {
        id,
        type: "check",
        concept: "New concept",
        stem: "New question?",
        opts: ["A", "B", "C", "D"],
        ans: 0,
        exp: "Explanation.",
      };
    case "quiz":
      return {
        id,
        type: "quiz",
        concepts: [
          {
            id: `c-${id}`,
            name: "New concept",
            pool: [{ stem: "New question?", opts: ["A", "B", "C", "D"], ans: 0, exp: "Why." }],
          },
        ],
      };
    case "case":
      return {
        id,
        type: "case",
        name: "New case",
        tag: "Topic",
        color: "#3fd0c0",
        rows: [["Field", "Value"]],
        lesson: "What this proves.",
      };
    case "animation":
      return {
        id,
        type: "animation",
        title: "New animation",
        steps: [{ region: "cortex", head: "Step 1", text: "Describe this region." }],
      };
    case "flashcards":
      return { id, type: "flashcards", cards: [["Front", "Back"]] };
    case "reflection":
      return { id, type: "reflection", prompt: "Reflect: …" };
    case "image":
      return { id, type: "image", src: null, caption: "Add a caption", alt: "Image" };
  }
}

export const PICKER_BLOCK_TYPES: StudioBlockType[] = [
  "study",
  "check",
  "quiz",
  "image",
  "animation",
  "flashcards",
  "reflection",
  "case",
  "hook",
];

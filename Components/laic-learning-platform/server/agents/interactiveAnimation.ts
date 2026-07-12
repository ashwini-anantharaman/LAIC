import { claudeJSON } from "../lib/anthropic.js";
import type { InteractiveAnimationConfig, InteractiveDiagramElement } from "../../src/types/interactiveAnimation.js";

const SYSTEM = `You are the Owlwise Interactive Lesson Animator. Create a step-by-step interactive explanation (like a Claude artifact walkthrough).

Return JSON only:
{
  "title": string (short lesson title),
  "steps": [
    {
      "title": string (3-6 words),
      "body": string (2-4 clear sentences, plain text, NO markdown headers, NO bullet dashes, NO emoji),
      "diagram": {
        "viewBox": "0 0 400 200",
        "elements": [
          { "id": "a", "tag": "rect"|"circle"|"line"|"text", "attrs": { ... }, "label": optional }
        ],
        "emphasisId": "id of element to highlight this step"
      }
    }
  ]
}

Rules:
- 4 to 5 steps that build understanding in order
- Each step body is conversational and specific to the concept
- Diagrams are simple labeled diagrams (max 5 elements per step), indigo palette (#2563eb, #93c5fd, #1e3a8a)
- Use text elements with label field for captions
- emphasisId must match an element id on that step's diagram
- Educational clarity over decoration — no abstract 3D blocks`;

function fallbackInteractive(conceptName: string, description: string): InteractiveAnimationConfig {
  const topic = conceptName || "this topic";
  return {
    title: `Understanding ${topic}`,
    steps: [
      {
        title: "What we're learning",
        body: description.slice(0, 280) || `Let's break down ${topic} step by step.`,
        diagram: {
          viewBox: "0 0 400 200",
          emphasisId: "core",
          elements: [
            { id: "core", tag: "rect", attrs: { x: 140, y: 60, width: 120, height: 80, rx: 12, fill: "#dbeafe", stroke: "#2563eb", strokeWidth: 2 } },
            { id: "lbl", tag: "text", attrs: { x: 200, y: 108, textAnchor: "middle", fill: "#1e3a8a", fontSize: 14 }, label: topic.slice(0, 24) },
          ],
        },
      },
      {
        title: "Key idea",
        body: `Focus on the main relationship or process at the center of ${topic}.`,
        diagram: {
          viewBox: "0 0 400 200",
          emphasisId: "arrow",
          elements: [
            { id: "left", tag: "circle", attrs: { cx: 100, cy: 100, r: 36, fill: "#eff6ff", stroke: "#2563eb", strokeWidth: 2 } },
            { id: "arrow", tag: "line", attrs: { x1: 140, y1: 100, x2: 260, y2: 100, stroke: "#2563eb", strokeWidth: 3 } },
            { id: "right", tag: "circle", attrs: { cx: 300, cy: 100, r: 36, fill: "#dbeafe", stroke: "#2563eb", strokeWidth: 2 } },
          ],
        },
      },
      {
        title: "Try it yourself",
        body: "Apply this idea to a practice example in your course materials or ask the Owlwise assistant if anything is unclear.",
        diagram: {
          viewBox: "0 0 400 200",
          emphasisId: "check",
          elements: [
            { id: "check", tag: "circle", attrs: { cx: 200, cy: 100, r: 40, fill: "#2563eb" } },
            { id: "ok", tag: "text", attrs: { x: 200, y: 108, textAnchor: "middle", fill: "#ffffff", fontSize: 22 }, label: "✓" },
          ],
        },
      },
    ],
  };
}

function normalizeStep(raw: unknown, i: number): InteractiveAnimationConfig["steps"][0] | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const title = typeof s.title === "string" ? s.title.trim() : "";
  const body = typeof s.body === "string" ? s.body.trim() : "";
  if (!title || !body) return null;

  let diagram: InteractiveAnimationConfig["steps"][0]["diagram"];
  const d = s.diagram;
  if (d && typeof d === "object") {
    const dr = d as Record<string, unknown>;
    const elements = Array.isArray(dr.elements)
      ? dr.elements
          .map((el, j) => {
            if (!el || typeof el !== "object") return null;
            const e = el as Record<string, unknown>;
            const tag = e.tag;
            if (tag !== "circle" && tag !== "rect" && tag !== "line" && tag !== "path" && tag !== "text") return null;
            return {
              id: typeof e.id === "string" ? e.id : `el-${j}`,
              tag,
              attrs: (e.attrs && typeof e.attrs === "object" ? e.attrs : {}) as Record<string, string | number>,
              ...(typeof e.label === "string" ? { label: e.label } : {}),
            };
          })
          .filter((el): el is InteractiveDiagramElement => el !== null)
      : [];
    if (elements.length) {
      diagram = {
        viewBox: typeof dr.viewBox === "string" ? dr.viewBox : "0 0 400 200",
        elements,
        ...(typeof dr.emphasisId === "string" ? { emphasisId: dr.emphasisId } : {}),
      };
    }
  }

  return { title, body, ...(diagram ? { diagram } : {}) };
}

export function normalizeInteractiveAnimation(raw: unknown, conceptName: string, description: string): InteractiveAnimationConfig {
  if (!raw || typeof raw !== "object") return fallbackInteractive(conceptName, description);
  const r = raw as Record<string, unknown>;
  const steps = Array.isArray(r.steps)
    ? r.steps.map(normalizeStep).filter(Boolean) as InteractiveAnimationConfig["steps"]
    : [];
  if (steps.length < 2) return fallbackInteractive(conceptName, description);
  return {
    title: typeof r.title === "string" && r.title.trim() ? r.title.trim() : `Understanding ${conceptName}`,
    steps: steps.slice(0, 6),
  };
}

export async function generateInteractiveAnimation(
  description: string,
  conceptName?: string,
  context?: string
): Promise<InteractiveAnimationConfig> {
  const name = conceptName ?? "concept";
  const user = `Concept: ${name}
Instructor brief: ${description.slice(0, 800)}
${context ? `\nSource material:\n${context.slice(0, 2500)}` : ""}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await claudeJSON<unknown>(SYSTEM, user, 4096);
      const config = normalizeInteractiveAnimation(raw, name, description);
      if (config.steps.length >= 2) return config;
    } catch (err) {
      console.warn(`[interactiveAnimation] Attempt ${attempt + 1} failed for "${name}":`, err);
    }
  }
  return fallbackInteractive(name, description);
}

export type InteractiveAnimationContent = {
  renderer: "interactive";
  interactive: InteractiveAnimationConfig;
  description: string;
};

export function toInteractiveContent(
  config: InteractiveAnimationConfig,
  description: string
): InteractiveAnimationContent {
  return { renderer: "interactive", interactive: config, description };
}

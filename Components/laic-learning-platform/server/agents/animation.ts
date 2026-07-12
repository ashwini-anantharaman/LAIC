import { claudeJSON } from "../lib/anthropic.js";
import {
  fallbackAnimation,
  isFallbackAnimation,
  normalizeAnimationConfig,
} from "../lib/lessonNormalize.js";

export interface AnimationConfig {
  viewBox: string;
  elements: {
    id: string;
    tag: "circle" | "rect" | "line" | "path" | "text";
    attrs: Record<string, string | number>;
    label?: string;
  }[];
  timeline: {
    target: string;
    duration: number;
    delay?: number;
    props: Record<string, string | number>;
    ease?: string;
  }[];
  description: string;
}

const ANIMATION_SYSTEM = `You are the LAIC Animation Generator. Return compact JSON for in-browser GSAP+SVG animation (NO video, NO Manim).

STRICT LIMITS (must follow):
- Maximum 6 elements
- Maximum 8 timeline steps
- Short labels only (no paragraphs in text attrs)
- Use simple shapes: circle, rect, line, text
- REQUIRED top-level keys: viewBox, elements, timeline, description

Schema:
{
  "viewBox": "0 0 520 220",
  "elements": [{ "id": string, "tag": "circle"|"rect"|"line"|"path"|"text", "attrs": object, "label": optional string }],
  "timeline": [{ "target": "#id", "duration": number, "delay": number, "props": object, "ease": "power2.inOut" }],
  "description": string (max 80 chars)
}

Style: clean educational diagram, indigo/violet palette (#4f39f6, #c6d2ff).`;

export async function generateAnimation(description: string, conceptName?: string) {
  const name = conceptName ?? "concept";
  const user = `Concept: ${name}\nInstructor description: ${description.slice(0, 600)}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await claudeJSON<unknown>(ANIMATION_SYSTEM, user, 2048);
      const config = normalizeAnimationConfig(raw, name);
      if (!isFallbackAnimation(config)) return config;
      console.warn(`[animation] Attempt ${attempt + 1} produced fallback for "${name}"`);
    } catch (err) {
      console.warn(`[animation] Attempt ${attempt + 1} failed for "${name}":`, err);
    }
  }

  console.warn(`[animation] Using placeholder animation for "${name}"`);
  return fallbackAnimation(name);
}

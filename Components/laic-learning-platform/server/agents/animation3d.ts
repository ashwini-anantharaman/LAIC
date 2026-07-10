import { claudeJSON } from "../lib/anthropic.js";
import {
  fallbackScene3D,
  isFallbackScene3D,
  normalizeScene3D,
} from "../lib/scene3dNormalize.js";
import type { Scene3DConfig, Scene3DPlan } from "../lib/scene3dTypes.js";

const SCENE_PLAN_SYSTEM = `You are the LAIC 3D Scene Planner for educational lessons (any subject).
Design a simple 3D scene plan (NO coordinates yet). Return JSON:
{
  "concept": string,
  "narrative": string (1-2 sentences),
  "objects": [{ "id": string, "role": string, "label": string, "type": "sphere"|"box"|"cylinder"|"torus"|"line" }],
  "cameraHint": string,
  "animationBeats": string[] (2-4 beats describing motion)
}
Max 8 objects. Use simple primitives only.`;

const SCENE3D_SYSTEM = `You are the LAIC 3D Lesson Animator. Return Scene3DConfig JSON version 1 for React Three Fiber.
NO code. NO external URLs or GLB files. NO shaders.

STRICT LIMITS:
- Max 8 objects, max 6 animations
- Allowed object types: sphere, box, cylinder, torus, line
- Colors: hex strings (#4f39f6, #818cf8, #c4b5fd)
- Positions/rotations/scales: [x,y,z] arrays, keep within -6..6

Schema:
{
  "version": 1,
  "description": string (max 100 chars),
  "camera": { "position": [x,y,z], "fov": number, "target": [x,y,z] },
  "lights": [{ "type": "ambient"|"directional"|"point", "intensity": number, "position": optional [x,y,z] }],
  "objects": [{
    "id": string, "type": string, "position": [x,y,z],
    "rotation": optional [x,y,z], "scale": optional [x,y,z],
    "color": "#hex", "label": optional string, "opacity": optional 0-1,
    "points": optional [[x,y,z],[x,y,z]] for lines only
  }],
  "animations": [{
    "target": object id, "property": "position"|"rotation"|"scale"|"opacity",
    "from": number or [x,y,z], "to": number or [x,y,z],
    "duration": seconds, "delay": seconds, "loop": true
  }],
  "interactions": [{ "target": id, "onClick": "highlight"|"label"|"pulse" }]
}

Style: clean educational diagram, indigo/violet palette.`;

function hasScenePlan(raw: unknown): boolean {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return Array.isArray(r.objects) && r.objects.length > 0;
}

function hasSceneContent(raw: unknown): boolean {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return Array.isArray(r.objects) && r.objects.length > 0;
}

async function planScene3D(description: string, conceptName: string, context?: string): Promise<Scene3DPlan> {
  const user = `Concept: ${conceptName}
Instructor brief: ${description.slice(0, 800)}
${context ? `\nSource excerpts:\n${context.slice(0, 2000)}` : ""}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await claudeJSON<unknown>(SCENE_PLAN_SYSTEM, user, 1500);
    if (hasScenePlan(raw)) return raw as Scene3DPlan;
    console.warn(`[scene3d] Plan attempt ${attempt + 1} thin for "${conceptName}"`);
  }
  const raw = await claudeJSON<unknown>(SCENE_PLAN_SYSTEM, user, 1500);
  return raw as Scene3DPlan;
}

async function buildScene3DFromPlan(
  plan: Scene3DPlan,
  conceptName: string,
  description: string
): Promise<Scene3DConfig> {
  const user = `Concept: ${conceptName}
Brief: ${description.slice(0, 600)}

Scene plan:
${JSON.stringify(plan)}

Build the full Scene3DConfig JSON. Follow the plan's objects and animation beats exactly.`;

  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await claudeJSON<unknown>(SCENE3D_SYSTEM, user, 3500);
    const config = normalizeScene3D(raw, conceptName);
    if (hasSceneContent(raw) && !isFallbackScene3D(config)) return config;
    console.warn(`[scene3d] Build attempt ${attempt + 1} invalid for "${conceptName}"`);
  }

  const raw = await claudeJSON<unknown>(SCENE3D_SYSTEM, user, 3500);
  return normalizeScene3D(raw, conceptName);
}

/** Two-stage: plan scene → build Scene3DConfig JSON for R3F player. */
export async function generateScene3D(
  description: string,
  conceptName?: string,
  context?: string
): Promise<Scene3DConfig> {
  const name = conceptName ?? "concept";

  try {
    const plan = await planScene3D(description, name, context);
    const config = await buildScene3DFromPlan(plan, name, description);
    if (!isFallbackScene3D(config)) return config;
    console.warn(`[scene3d] Built fallback scene for "${name}", retrying direct generation`);
  } catch (err) {
    console.warn(`[scene3d] Two-stage pipeline failed for "${name}":`, err);
  }

  try {
    const raw = await claudeJSON<unknown>(
      SCENE3D_SYSTEM,
      `Concept: ${name}\nBrief: ${description.slice(0, 800)}${context ? `\nSources:\n${context.slice(0, 1500)}` : ""}`,
      3500
    );
    const config = normalizeScene3D(raw, name);
    if (!isFallbackScene3D(config)) return config;
  } catch (err) {
    console.warn(`[scene3d] Direct generation failed for "${name}":`, err);
  }

  console.warn(`[scene3d] Using placeholder 3D scene for "${name}"`);
  return fallbackScene3D(name);
}

export { isFallbackScene3D };

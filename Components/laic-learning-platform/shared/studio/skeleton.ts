import type { StudioCourseData } from "./types.js";

/** True when pages only contain default empty blocks (not AI-generated). */
export function isSkeletonStudio(studio: StudioCourseData): boolean {
  if (!studio.pages.length) return false;
  return studio.pages.every((page) => {
    if (page.blocks.length > 2) return false;
    const hook = page.blocks.find((b) => b.type === "hook");
    if (!hook || hook.type !== "hook") return page.blocks.length === 0;
    if (hook.q !== "A curious question?" || hook.sub !== "Set the scene.") return false;
    const study = page.blocks.find((b) => b.type === "study");
    if (!study || study.type !== "study") return true;
    return study.title === "New lesson" && study.html.includes("Write the explanation here");
  });
}

/** Shorten noisy provider errors for UI toasts and overlays. */
export function friendlyGenerationError(message: string): string {
  if (/credit balance is too low/i.test(message)) {
    return "Anthropic API credits are exhausted. Add credits at console.anthropic.com, then retry generation.";
  }
  const jsonMatch = message.match(/"message"\s*:\s*"([^"]+)"/);
  if (jsonMatch?.[1]) return jsonMatch[1];
  return message.replace(/^400\s+/, "").slice(0, 400);
}

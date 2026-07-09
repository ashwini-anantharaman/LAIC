import { checkGenerativeManimHealth, generateManimVideo } from "../lib/generativeManim.js";

export interface ManimAnimationContent {
  renderer: "manim";
  videoUrl: string;
  description: string;
  code?: string;
  sceneClass?: string;
}

export function isFallbackManim(content: ManimAnimationContent | null): boolean {
  return !content?.videoUrl;
}

export async function generateManimAnimation(
  description: string,
  conceptName: string,
  context?: string
): Promise<ManimAnimationContent> {
  const health = await checkGenerativeManimHealth();
  if (!health.ok) {
    throw new Error(
      health.detail ??
        "Generative Manim API is unreachable. Start it with: docker run -p 8080:8080 -e ANTHROPIC_API_KEY=... generative-manim-api"
    );
  }

  const prompt = [
    `Create a polished Manim Community Edition animation for an educational lesson.`,
    `Topic / module: ${conceptName}`,
    `Visual brief: ${description.slice(0, 1200)}`,
    context
      ? `\nGround the animation in these instructor source excerpts (use labels or diagrams where helpful):\n${context.slice(0, 4000)}`
      : "",
    `\nRequirements:`,
    `- Use class name GenScene(Scene)`,
    `- 30–90 second animation, clear labels, smooth transitions`,
    `- Educational style: indigo/violet accent colors on dark or white background`,
    `- No external assets or file paths — vector Manim only`,
    `- Show the core concept step-by-step for a student audience`,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await generateManimVideo(prompt, {
    projectName: conceptName.replace(/\s+/g, "-").slice(0, 40),
  });

  return {
    renderer: "manim",
    videoUrl: result.videoUrl,
    description: description.slice(0, 200) || `Animation: ${conceptName}`,
    code: result.code,
    sceneClass: result.sceneClass,
  };
}

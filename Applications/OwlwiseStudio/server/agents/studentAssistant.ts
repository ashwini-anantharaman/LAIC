import { claudeText } from "../lib/anthropic.js";
import { retrieveChunks, formatRetrievedContext, retrieveContextForLesson } from "../lib/rag.js";
import { detectIntent } from "./orchestrator.js";

export async function assistantRespond(params: {
  courseId: string;
  message: string;
  conceptId: string;
  conceptName: string;
  mode: string;
  onQuiz: boolean;
  pastReflections?: string[];
}) {
  const { courseId, message, conceptName, mode, onQuiz, pastReflections, conceptId } = params;

  const intent = await detectIntent(message);
  if (intent.intent === "quiz" || onQuiz) {
    return {
      role: "assistant" as const,
      content: await claudeText(
        `You are the Owlwise Student Assistant with STRICT quiz guardrails. NEVER reveal MCQ answers or option letters. Redirect to hints and conceptual direction only.`,
        `Student on quiz for ${conceptName}. Message: ${message}`,
        400
      ),
    };
  }

  const courseWide = !conceptId || conceptName === "Course materials";
  const chunks = courseWide
    ? await retrieveChunks(courseId, message, 10)
    : await retrieveContextForLesson(courseId, conceptName, { subtitle: message, count: 8 });
  const context = formatRetrievedContext(chunks);
  const reflectionCtx = pastReflections?.length
    ? `Past reflections:\n${pastReflections.join("\n---\n")}`
    : "";

  const content = await claudeText(
    `You are the Owlwise Student Assistant — a friendly tutor grounded in the instructor's uploaded source material. Mode: ${mode}.

Write in clear, logical plain text for a student chat:
- Use short paragraphs separated by blank lines.
- Use simple sentences; avoid markdown headers (#), markdown bullets (-), and emoji.
- You may use **bold** sparingly for key terms only.
- For lists, use at most 3–5 short lines starting with "• " if needed.
- Cite sources naturally in prose (e.g. "According to your PDF on page 3…").
- Never give direct quiz or test answers.`,
    `${courseWide ? "Scope: entire course source materials" : `Unit: ${conceptName} (${params.conceptId})`}\nMode: ${mode}\n${reflectionCtx}\n\nRetrieved source material:\n${context}\n\nStudent question: ${message}`,
    1200
  );

  return { role: "assistant" as const, content };
}

export function greeting(conceptName: string, mode: string) {
  if (conceptName === "Course materials") {
    return `Hi! I'm Owlwise Assistant. Ask me anything about your course — I search your instructor's uploaded sources to help you learn. I won't give away quiz answers, but I'll guide you to understand the material.`;
  }
  const modeLabel =
    mode === "real-world" ? "Real World" : mode === "textbook" ? "Textbook" : "Conversational";
  return `Hi! I'm Owlwise Assistant. You're studying ${conceptName} (${modeLabel} mode). Ask me anything about this unit — I'll use your course sources to help, without spoiling quiz answers.`;
}

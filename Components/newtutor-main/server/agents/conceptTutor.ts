import { claudeJSON, claudeText } from "../lib/anthropic.js";
import {
  normalizeBlueprint,
  normalizeFlashcardBlock,
  normalizeMcqBlock,
  normalizeMcqBlocks,
  normalizeTextBlock,
  normalizeDraftCourse,
  extractBodyFromRaw,
  isValidMcqBlock,
  type LessonBlueprint,
} from "../lib/lessonNormalize.js";
import { formatRetrievedContext, getCourseRagStats, retrieveContextForDraft, retrieveContextForLesson, type RagChunk } from "../lib/rag.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { difficultyForMastery } from "../lib/mastery.js";
import { isGenerativeManimConfigured } from "../lib/config.js";
import { generateManimAnimation, isFallbackManim, type ManimAnimationContent } from "./animationManim.js";
import { generateInteractiveAnimation, toInteractiveContent, type InteractiveAnimationContent } from "./interactiveAnimation.js";

async function generateAnimationForLesson(
  animationBrief: string,
  moduleName: string,
  context: string
): Promise<ManimAnimationContent | InteractiveAnimationContent> {
  if (isGenerativeManimConfigured()) {
    try {
      console.info(`[lesson] Generating Manim video for "${moduleName}"…`);
      return await generateManimAnimation(animationBrief, moduleName, context);
    } catch (e) {
      console.warn(`[lesson] Manim generation failed for "${moduleName}", falling back to interactive:`, e);
    }
  }
  const config = await generateInteractiveAnimation(animationBrief, moduleName, context);
  return toInteractiveContent(config, animationBrief);
}

export type ModuleLessonBlueprint = LessonBlueprint;

/** Number of MCQ blocks bundled into each generated lesson. */
const LESSON_MCQ_COUNT = 3;

export interface GeneratedLessonBlock {
  type: "Text" | "Animation" | "MCQ" | "Flashcard" | "Video" | "Test";
  label: string;
  title: string;
  content: Record<string, unknown>;
}

function pageFromCitation(citation: string): number | null {
  const pageMatch = citation.match(/(?:pp?\.|pages?\s*)(\d+)/i);
  if (pageMatch) return parseInt(pageMatch[1], 10);
  const chunkMatch = citation.match(/chunk\s*(\d+)/i);
  if (chunkMatch) return Math.max(1, parseInt(chunkMatch[1], 10));
  return null;
}

/** Pages of the original uploads that grounded this lesson (PDF reference panel). */
function sourceRefsFromChunks(chunks: RagChunk[]) {
  const seen = new Set<string>();
  return chunks
    .filter((c) => c.source_id)
    .map((c) => ({
      sourceId: c.source_id,
      citation: c.citation,
      pageStart: c.page_start ?? pageFromCitation(c.citation ?? ""),
      pageEnd: c.page_end ?? c.page_start ?? pageFromCitation(c.citation ?? ""),
    }))
    .filter((ref) => {
      const key = `${ref.sourceId}:${ref.pageStart ?? "x"}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return ref.pageStart != null;
    })
    .slice(0, 4);
}

function primaryReferencePage(chunks: RagChunk[]): number {
  const refs = sourceRefsFromChunks(chunks);
  if (refs[0]?.pageStart) return refs[0].pageStart;
  const first = chunks.find((c) => c.source_id);
  if (first) {
    const fromCitation = pageFromCitation(first.citation ?? "");
    if (fromCitation) return fromCitation;
  }
  return 1;
}

/**
 * If a timestamped transcript chunk from a linked video matched this module,
 * emit a Video block clipped to that part of the video.
 */
async function autoVideoBlock(
  courseId: string,
  chunks: RagChunk[]
): Promise<GeneratedLessonBlock | null> {
  const timed = chunks.filter((c) => c.source_id && c.time_start != null && (c.time_end ?? 0) > 0);
  if (!timed.length) return null;

  const { data: videoSources } = await supabaseAdmin
    .from("sources")
    .select("id, url, name")
    .eq("course_id", courseId)
    .eq("type", "Video")
    .not("url", "is", null);
  if (!videoSources?.length) return null;

  const byId = new Map(videoSources.map((s) => [s.id, s]));
  const best = timed.find((c) => byId.has(c.source_id!));
  if (!best) return null;

  const source = byId.get(best.source_id!)!;
  return {
    type: "Video",
    label: "Video clip",
    title: `Watch: ${source.name}`,
    content: {
      url: source.url,
      startSeconds: best.time_start ?? 0,
      endSeconds: best.time_end ?? undefined,
      citation: best.citation,
      autoMatched: true,
    },
  };
}

export async function queryRAG(courseId: string, query: string) {
  const chunks = await retrieveContextForLesson(courseId, query, { count: 8 });
  const context = formatRetrievedContext(chunks);
  const answer = await claudeText(
    `You are the LAIC Concept Tutor answering an instructor's RAG query. Use ONLY the retrieved context. If context is empty or irrelevant, say so clearly. Cite sources inline.`,
    `Query: ${query}\n\nRetrieved (${chunks.length} chunks):\n${context}`,
    1500
  );
  const citations = chunks.map((c) => c.citation).join(" · ");
  return { answer, citations, ragChunks: chunks.length };
}

export async function draftCourseStructure(
  courseId: string,
  prompt: string
) {
  const stats = await getCourseRagStats(courseId);
  if (!stats.chunkCount) {
    throw new Error(
      stats.errorCount > 0
        ? "No indexed sources — remove or re-upload failed sources, then wait until status shows Ready."
        : "No indexed sources yet — upload course material and wait until sources show Ready before generating structure."
    );
  }

  const chunks = await retrieveContextForDraft(courseId, prompt, 8);
  let context = formatRetrievedContext(chunks);
  if (context.length > 14_000) {
    context = `${context.slice(0, 14_000)}\n\n[... additional source text omitted — derive structure from the excerpts above]`;
  }
  const raw = await claudeJSON<unknown>(
    `You are the LAIC AI Course Drafter. Build a course structure entirely from the instructor's uploaded sources — any subject (essays, articles, textbooks, business, humanities, STEM, etc.).
Module names and chapters must reflect what the sources actually contain. Do not invent an unrelated domain.
Keep the structure compact: 2-4 chapters, 3-10 modules total, short module names (≤ 6 words), minimal prereqs.
Return JSON:
{
  "title": string,
  "chapters": [{ "label": "CH 1: ...", "title": string, "modules": [{ "name": string, "prereqs": string[] }] }],
  "prerequisiteEdges": [{ "from": string, "to": string }],
  "message": string
}`,
    `Instructor goals: ${prompt || "(derive structure from sources alone)"}\n\nSources:\n${context}`,
    8192
  );
  return normalizeDraftCourse(raw);
}

export async function generateModeContent(
  courseId: string,
  conceptName: string,
  mode: string,
  subtitle?: string
) {
  const chunks = await retrieveContextForLesson(courseId, conceptName, { subtitle: `${mode} ${subtitle ?? ""}`, count: 10 });
  const context = formatRetrievedContext(chunks);
  const modeVoice =
    mode === "real-world"
      ? "Use vivid real-world analogies."
      : mode === "conversational"
        ? "Use friendly conversational tone."
        : "Use clear textbook tone.";
  const raw = await claudeJSON<unknown>(
    `You are the Owlwise Concept Tutor. Rewrite study content for mode "${mode}". ${modeVoice}
${STUDY_SECTIONS_RULES}`,
    `Concept module: ${conceptName}\nSubtitle: ${subtitle ?? ""}\n\nRetrieved sources:\n${context}`,
    6000
  );
  const blueprint = normalizeBlueprint({ text: { heading: conceptName, keyPoints: [conceptName] } }, conceptName);
  const normalized = normalizeTextBlock(raw, blueprint, conceptName);
  return {
    heading: normalized.heading,
    body: normalized.body,
    sections: normalized.sections,
    sourceExcerpt: normalized.sourceExcerpt,
    citation: normalized.citation,
  };
}

export async function generateMCQ(courseId: string, conceptName: string) {
  const chunks = await retrieveContextForLesson(courseId, conceptName, { count: 8 });
  const context = formatRetrievedContext(chunks);
  const raw = await claudeJSON<{
    question: string;
    options: string[];
    correct: number;
    hints: { level: string; text: string }[] | Record<string, string>;
  }>(
    `Generate an MCQ from sources. Return JSON with question, options (4), correct (0-based index), hints as an array: [{ "level": "Nudge"|"Concept"|"Direction"|"Explanation", "text": string }].`,
    `Concept: ${conceptName}\n\n${context}`,
    2000
  );
  const hints = Array.isArray(raw.hints)
    ? raw.hints
    : Object.entries(raw.hints ?? {}).map(([level, text]) => ({ level, text: String(text) }));
  return { ...raw, hints };
}

export async function generateAdaptiveMCQ(
  courseId: string,
  conceptName: string,
  opts: {
    masteryLevel: string;
    previousQuestions?: string[];
    misconceptions?: string[];
    targetMisconception?: string;
  }
) {
  const chunks = await retrieveContextForLesson(courseId, `${conceptName} assessment quiz`, { count: 8 });
  const context = formatRetrievedContext(chunks);
  const difficulty = difficultyForMastery(opts.masteryLevel);
  const prev = (opts.previousQuestions ?? []).slice(-12);

  const raw = await claudeJSON<{
    question: string;
    options: string[];
    correct: number;
    hints: { level: string; text: string }[] | Record<string, string>;
    probesMisconception?: string;
  }>(
    `You are the LAIC Adaptive Quiz Coach. Generate ONE multiple-choice question grounded in instructor sources.
Difficulty: ${difficulty} (${opts.masteryLevel} mastery).
- easy: foundational recall, clear distractors
- medium: application and connection ideas
- hard: edge cases, compare/contrast, probe misconceptions

Return JSON: question, options (4 strings), correct (0-based index), hints as array of 4:
[{ "level": "Nudge"|"Concept"|"Direction"|"Explanation", "text": string }]

Do NOT repeat or closely paraphrase any previous question.`,
    `Module: ${conceptName}
Mastery level: ${opts.masteryLevel}
${opts.targetMisconception ? `Probe this misconception: ${opts.targetMisconception}` : ""}
${opts.misconceptions?.length ? `Recent student misconceptions:\n${opts.misconceptions.join("\n")}` : ""}

Previous questions (avoid repeating):
${prev.length ? prev.map((q, i) => `${i + 1}. ${q}`).join("\n") : "(none)"}

Sources:
${context}`,
    2200
  );

  const hints = Array.isArray(raw.hints)
    ? raw.hints
    : Object.entries(raw.hints ?? {}).map(([level, text]) => ({ level, text: String(text) }));

  const normalized = normalizeMcqBlock({ ...raw, hints }, conceptName);
  return { ...normalized, id: crypto.randomUUID() };
}

export async function generateFlashcards(courseId: string, conceptName: string) {
  const chunks = await retrieveContextForLesson(courseId, conceptName, { count: 8 });
  const context = formatRetrievedContext(chunks);
  return claudeJSON<{
    title: string;
    cards: { front: string; back: string }[];
  }>(
    `Generate a flashcard set from instructor sources. Return JSON:
{ "title": string, "cards": [{ "front": string, "back": string }] }
Create 5–8 cards. Front = term or question, back = concise answer grounded in sources.`,
    `Module topic: ${conceptName}\n\nRetrieved:\n${context}`,
    3000
  );
}

export async function generateReflectionPrompt(courseId: string, conceptName: string) {
  const chunks = await retrieveContextForLesson(courseId, conceptName, { count: 8 });
  const context = formatRetrievedContext(chunks);
  return claudeJSON<{
    prompt: string;
    followUpQuestions: string[];
  }>(
    `Generate a metacognitive reflection prompt for students. Return JSON:
{ "prompt": string, "followUpQuestions": string[] }
The main prompt should invite deep thinking about the module topic. Include 2 follow-up questions.`,
    `Module topic: ${conceptName}\n\nRetrieved:\n${context}`,
    1500
  );
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function hasBlueprintContent(raw: unknown): boolean {
  const r = asRecord(raw);
  const text = asRecord(r.text);
  return Boolean(
    typeof r.moduleSummary === "string" &&
      r.moduleSummary.trim() &&
      typeof text.heading === "string" &&
      text.heading.trim()
  );
}

function hasTextContent(raw: unknown): boolean {
  const r = asRecord(raw);
  if (Array.isArray(r.sections) && r.sections.length > 0) return true;
  return extractBodyFromRaw(raw).length > 0;
}

const MCQ_SOURCE_RULES = `
CRITICAL — every option must be a full answer phrase grounded in the instructor sources below.
NEVER use "Option A/B/C/D", letter labels, or empty placeholders.
Write plausible distractors from common misconceptions in the material.`;

const STUDY_SECTIONS_RULES = `
Return JSON: {
  "heading": string,
  "sections": [{ "concept": string, "text": string }],
  "sourceExcerpt": string,
  "citation": string
}
Section rules — write like a newspaper feature article with clear subheadings:
- Create 5–8 sections that together cover the FULL module. Extract as much relevant detail from the sources as a student needs to truly understand the topic. Do not summarize lightly — be thorough and information-dense.
- Each "concept" is a specific, punchy subheading (3–8 words) — like a newspaper section header, not a full sentence.
- Each "text" is 2–4 paragraphs separated by blank lines (use \\n\\n between paragraphs in the string). Aim for 150–250 words per section. Use conversational language and real-world examples where possible.
- Bold key terms with **double asterisks**.
- ONE concept per section — do not split a concept across sections or combine unrelated concepts.
- Each "text" must be a single plain string — never a JSON array string.
- Do NOT include inline citations, source references, parenthetical attributions, or quotation marks around sourced material. Weave information naturally as if you already know it.
- Do NOT include recall questions or quick checks.`;

function isGenericPlaceholderBody(body: string[], moduleName: string): boolean {
  return body.length === 3 && body[0]?.startsWith(`${moduleName} is a core idea`);
}

async function planModuleLesson(
  moduleName: string,
  context: string,
  chapter?: string,
  subtitle?: string,
  prereqs?: string[]
) {
  const system = `You are the LAIC Lesson Architect. Design ONE cohesive module lesson grounded in the instructor's uploaded sources (any subject domain).
The module name defines the teaching unit — extract relevant themes, arguments, or concepts from the sources to fit this module. Do not ignore the source material.
Return JSON:
{
  "moduleSummary": string,
  "learningObjectives": string[],
  "text": {
    "heading": string (engaging conversational title),
    "keyPoints": string[] (3-5 teaching beats in order),
    "sourceHighlight": string (short phrase to highlight in source excerpt),
    "modeEmoji": "💡"
  },
  "animation": {
    "description": string (detailed brief for SVG animation generator),
    "visualFocus": string
  },
  "assessment": {
    "mcqFocus": string,
    "misconceptionToProbe": string,
    "mcqTopics": string[] (${LESSON_MCQ_COUNT} distinct question angles — definition, application, misconception),
    "flashcardThemes": string[] (5-8 terms/concepts)
  }
}
All blocks must teach the SAME module narrative — text introduces, animation visualizes, MCQs check understanding at different depths, flashcards reinforce vocabulary.`;
  const user = `Module: ${moduleName}
Chapter: ${chapter ?? "General"}
Subtitle: ${subtitle ?? ""}
Prerequisites: ${(prereqs ?? []).join(", ") || "none"}

Sources:
${context}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await claudeJSON<unknown>(system, user, 2500);
    if (hasBlueprintContent(raw)) return normalizeBlueprint(raw, moduleName);
    console.warn(`[lesson] Blueprint attempt ${attempt + 1} returned thin payload for "${moduleName}"`);
  }
  const raw = await claudeJSON<unknown>(system, user, 2500);
  return normalizeBlueprint(raw, moduleName);
}

async function generateTextBlock(
  moduleName: string,
  context: string,
  blueprint: ModuleLessonBlueprint
) {
  const system = `Write the TEXT block for this module lesson grounded in the instructor sources.
${STUDY_SECTIONS_RULES}`;
  const trimmedContext = context.length > 12_000 ? `${context.slice(0, 12_000)}\n\n[truncated]` : context;
  const user = `Module: ${moduleName}
Lesson plan: ${JSON.stringify(blueprint)}

Sources:
${trimmedContext}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await claudeJSON<unknown>(system, user, 5500);
    if (hasTextContent(raw)) return normalizeTextBlock(raw, blueprint, moduleName);
    console.warn(`[lesson] Text attempt ${attempt + 1} returned empty body for "${moduleName}"`);
  }
  const raw = await claudeJSON<unknown>(
    `${system}\n\nCRITICAL: body MUST be a non-empty string array with at least 3 paragraphs grounded in the sources.`,
    user,
    5500
  );
  const normalized = normalizeTextBlock(raw, blueprint, moduleName);
  if (!hasTextContent(raw)) {
    console.warn(`[lesson] Text generation used blueprint fallback for "${moduleName}"`);
  }
  return normalized;
}

async function generateSingleMCQBlock(
  moduleName: string,
  context: string,
  blueprint: ModuleLessonBlueprint,
  focus: string
) {
  const raw = await claudeJSON<unknown>(
    `Generate ONE MCQ from the sources. Focus: ${focus}${MCQ_SOURCE_RULES}
Return JSON: question, options (4), correct (0-based), hints as array [{ "level": "Nudge"|"Concept"|"Direction"|"Explanation", "text": string }] (4 hints), optional explanation.`,
    `Module: ${moduleName}
Lesson plan: ${JSON.stringify(blueprint)}

Sources:
${context}`,
    2200
  );
  const normalized = normalizeMcqBlock(raw, moduleName);
  if (!isValidMcqBlock(normalized)) {
    throw new Error("MCQ generation returned placeholder options");
  }
  return normalized;
}

async function generateMCQBlocks(
  moduleName: string,
  context: string,
  blueprint: ModuleLessonBlueprint
) {
  const topics = [
    ...blueprint.assessment.mcqTopics,
    blueprint.assessment.mcqFocus,
    blueprint.assessment.misconceptionToProbe,
    ...blueprint.text.keyPoints,
    ...blueprint.learningObjectives,
  ]
    .map((t) => t.trim())
    .filter(Boolean);

  const uniqueTopics = [...new Set(topics)].slice(0, LESSON_MCQ_COUNT);
  while (uniqueTopics.length < LESSON_MCQ_COUNT) {
    uniqueTopics.push(`Application of ${moduleName} (${uniqueTopics.length + 1})`);
  }

  const raw = await claudeJSON<unknown>(
    `Generate exactly ${LESSON_MCQ_COUNT} distinct MCQs for this module lesson — each grounded in the sources.${MCQ_SOURCE_RULES}
Each question must test a different angle from mcqTopics — no duplicate wording or same correct concept.
Return JSON: { "questions": [{ "question", "options" (4 strings), "correct" (0-based index), "hints": [{ "level", "text" }] (4 hints each), "explanation" }] }`,
    `Module: ${moduleName}
Question angles (one MCQ each): ${JSON.stringify(uniqueTopics)}
Lesson plan: ${JSON.stringify(blueprint)}

Sources:
${context}`,
    5500
  );

  let mcqs = normalizeMcqBlocks(raw, moduleName).filter(isValidMcqBlock);
  const seen = new Set<string>();
  mcqs = mcqs.filter((m) => {
    const key = m.question.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  for (let i = mcqs.length; i < LESSON_MCQ_COUNT; i++) {
    const focus = uniqueTopics[i] ?? `Further understanding of ${moduleName}`;
    let added = false;
    for (let attempt = 0; attempt < 3 && !added; attempt++) {
      try {
        const extra = await generateSingleMCQBlock(moduleName, context, blueprint, focus);
        if (!isValidMcqBlock(extra)) continue;
        const key = extra.question.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        mcqs.push(extra);
        added = true;
      } catch (e) {
        console.warn(`[lesson] Extra MCQ ${i + 1} attempt ${attempt + 1} failed for "${moduleName}":`, e);
      }
    }
  }

  if (mcqs.length === 0) {
    mcqs.push(await generateSingleMCQBlock(moduleName, context, blueprint, blueprint.assessment.mcqFocus));
  }

  return mcqs.slice(0, LESSON_MCQ_COUNT);
}

/** Number of questions in a module test. */
const TEST_QUESTION_COUNT = 5;

/** Fixed-length module test: mixed-difficulty MCQs, scored as a whole. */
export async function generateTestBlock(
  courseId: string,
  moduleName: string,
  opts?: { context?: string; blueprint?: ModuleLessonBlueprint }
) {
  let context = opts?.context;
  if (context === undefined) {
    const chunks = await retrieveContextForLesson(courseId, `${moduleName} exam test`, { count: 8 });
    context = formatRetrievedContext(chunks);
  }
  const raw = await claudeJSON<unknown>(
    `Generate a ${TEST_QUESTION_COUNT}-question module TEST grounded ONLY in the instructor sources.${MCQ_SOURCE_RULES}
Difficulty ramps: Q1-2 recall, Q3-4 application, Q5 synthesis or misconception.
Return JSON: { "title": string, "questions": [{ "question", "options" (4 strings), "correct" (0-based index), "hints": [{ "level", "text" }] (4 hints each), "explanation" }] }`,
    `Module: ${moduleName}
${opts?.blueprint ? `Lesson plan: ${JSON.stringify(opts.blueprint)}` : ""}

Sources:
${context}`,
    7000
  );
  const questions = normalizeMcqBlocks(
    { questions: (asRecord(raw).questions as unknown) ?? raw },
    moduleName
  )
    .filter(isValidMcqBlock)
    .slice(0, TEST_QUESTION_COUNT);
  if (!questions.length) throw new Error("Test generation returned no valid source-based questions");
  const title =
    typeof asRecord(raw).title === "string" && (asRecord(raw).title as string).trim()
      ? (asRecord(raw).title as string).trim()
      : `${moduleName} — Module test`;
  return { title, passPct: 80, questions: questions.map((q) => ({ ...q, id: crypto.randomUUID() })) };
}

async function generateFlashcardBlock(
  moduleName: string,
  context: string,
  blueprint: ModuleLessonBlueprint
) {
  const raw = await claudeJSON<unknown>(
    `Generate a flashcard set reinforcing this module's vocabulary and concepts.
Return JSON: { "title": string, "cards": [{ "front", "back" }] } with 5-8 cards covering the flashcardThemes.`,
    `Module: ${moduleName}
Lesson plan: ${JSON.stringify(blueprint)}

Sources:
${context}`,
    3000
  );
  return normalizeFlashcardBlock(raw, blueprint, moduleName);
}

export interface GeneratedLessonMeta {
  ragChunks: number;
  ragCitations: string[];
  warnings: string[];
}

/** Plan once, then generate Text + Animation + MCQ + Flashcards in parallel. */
export async function generateModuleLesson(
  courseId: string,
  moduleName: string,
  opts?: { chapter?: string; subtitle?: string; prereqs?: string[] }
) {
  const chunks = await retrieveContextForLesson(courseId, moduleName, {
    chapter: opts?.chapter,
    subtitle: opts?.subtitle,
    count: 10,
  });
  const context = formatRetrievedContext(chunks);
  const warnings: string[] = [];

  if (!chunks.length) {
    warnings.push(
      "No indexed sources found for this course. Upload PDFs or URLs in Sources, wait until they show Ready, then regenerate."
    );
  } else if (chunks.length < 3) {
    warnings.push(
      `Only ${chunks.length} source chunk(s) available — add more uploads for richer lessons.`
    );
  }

  const blueprint = await planModuleLesson(
    moduleName,
    context,
    opts?.chapter,
    opts?.subtitle,
    opts?.prereqs
  );

  const animationBrief = [
    blueprint.animation.description,
    `Visual focus: ${blueprint.animation.visualFocus}`,
    `Module context: ${blueprint.moduleSummary}`,
  ].join("\n");

  const text = await generateTextBlock(moduleName, context, blueprint);

  const [mcqResult, flashcardsResult, testResult, videoResult] = await Promise.allSettled([
    generateMCQBlocks(moduleName, context, blueprint),
    generateFlashcardBlock(moduleName, context, blueprint),
    generateTestBlock(courseId, moduleName, { context, blueprint }),
    autoVideoBlock(courseId, chunks),
  ]);

  const sceneResult = await Promise.allSettled([
    generateAnimationForLesson(animationBrief, moduleName, context),
  ]).then(([r]) => r);

  const failed = (
    [
      ["mcq", mcqResult],
      ["flashcards", flashcardsResult],
      ["animation", sceneResult],
    ] as [string, PromiseSettledResult<unknown>][]
  ).filter((entry): entry is [string, PromiseRejectedResult] => entry[1].status === "rejected");

  if (failed.length) {
    const detail = failed.map(([name, r]) => `${name}: ${r.reason}`).join("; ");
    throw new Error(`Lesson generation failed — ${detail}`);
  }

  const mcqs = (mcqResult as PromiseFulfilledResult<Awaited<ReturnType<typeof generateMCQBlocks>>>).value;
  const flashcards = (flashcardsResult as PromiseFulfilledResult<Awaited<ReturnType<typeof generateFlashcardBlock>>>).value;
  const animation = (sceneResult as PromiseFulfilledResult<ManimAnimationContent | InteractiveAnimationContent>).value;

  // Test and auto-video are additive — don't fail the lesson if they misfire.
  const test = testResult.status === "fulfilled" ? testResult.value : null;
  if (testResult.status === "rejected") {
    warnings.push("Module test generation failed — add a Test block manually from the palette.");
  }
  const videoBlock = videoResult.status === "fulfilled" ? videoResult.value : null;

  if ("renderer" in animation && animation.renderer === "manim") {
    if (isFallbackManim(animation)) {
      warnings.push("Manim animation failed — no video was produced. Try generating again.");
    }
  }

  const animationContent =
    "renderer" in animation && animation.renderer === "manim"
      ? {
          renderer: "manim" as const,
          videoUrl: animation.videoUrl,
          description: animation.description || blueprint.animation.visualFocus,
          code: animation.code,
          sceneClass: animation.sceneClass,
        }
      : {
          renderer: "interactive" as const,
          interactive: animation.interactive,
          description: blueprint.animation.visualFocus,
        };

  const animationTitle =
    ("renderer" in animation && animation.renderer === "interactive"
      ? animation.interactive.title
      : "description" in animation
        ? animation.description
        : blueprint.animation.visualFocus)?.slice(0, 60) ||
    ("renderer" in animation && animation.renderer === "manim" ? "Manim Animation" : "Interactive walkthrough");

  const textContent = text;
  if (isGenericPlaceholderBody(textContent.body, moduleName)) {
    warnings.push(
      "Text block used fallback copy — the AI returned an empty response. Try generating again."
    );
  }

  const blocks: GeneratedLessonBlock[] = [
    {
      type: "Text",
      label: "Text explanation",
      title: text.heading,
      content: {
        heading: text.heading,
        body: text.body,
        sections: text.sections,
        sourceExcerpt: text.sourceExcerpt,
        citation: text.citation,
        sourceHighlight: text.sourceHighlight ?? blueprint.text.sourceHighlight,
        modeEmoji: text.modeEmoji ?? blueprint.text.modeEmoji,
        sourceRefs: sourceRefsFromChunks(chunks),
        referencePage: primaryReferencePage(chunks),
      },
    },
    {
      type: "Animation",
      label: animationContent.renderer === "manim" ? "Manim animation" : "3D Animation",
      title: animationTitle,
      content: animationContent,
    },
    ...(videoBlock ? [videoBlock] : []),
    ...mcqs.filter(isValidMcqBlock).map((mcq, i) => ({
      type: "MCQ" as const,
      label: mcqs.length > 1 ? `MCQ ${i + 1}` : "MCQ question",
      title: mcq.question.length > 72 ? `${mcq.question.slice(0, 72)}…` : mcq.question,
      content: { ...mcq, id: crypto.randomUUID() },
    })),
    {
      type: "Flashcard",
      label: "Flashcard set",
      title: flashcards.title,
      content: flashcards,
    },
    ...(test
      ? [{
          type: "Test" as const,
          label: "Module test",
          title: test.title,
          content: test as unknown as Record<string, unknown>,
        }]
      : []),
  ];

  const meta: GeneratedLessonMeta = {
    ragChunks: chunks.length,
    ragCitations: chunks.map((c) => c.citation),
    warnings,
  };
  return { blueprint, blocks, meta };
}

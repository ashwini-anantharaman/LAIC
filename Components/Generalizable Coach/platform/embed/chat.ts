/**
 * Zone 1 — Platform core: free-form chat support for the embeddable coach.
 *
 * Grounds an arbitrary learner question in (a) the current activity context
 * supplied by the host and (b) knowledge chunks retrieved by lightweight
 * keyword scoring. No embeddings yet — the corpus is small and curated; when
 * it grows, swap scoreChunks for a hybrid tag+embedding retriever behind the
 * same call site.
 */
import type { CommonCoachPackage, KnowledgeChunk } from "../types/index.js";
import type { BuiltPrompt } from "../llm/index.js";

const STOPWORDS = new Set(
  "the a an and or of to in is are was be do does did i you we my your it this that what why how should when with for on at".split(" "),
);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

export interface ScoredChunk {
  chunk: KnowledgeChunk;
  /** raw keyword-overlap count (not normalized) */
  score: number;
}

/** Keyword-overlap score for every chunk (unsorted, unfiltered). */
export function scoreChunksScored(
  question: string,
  chunks: KnowledgeChunk[],
): ScoredChunk[] {
  const q = new Set(words(question));
  return chunks.map((chunk) => {
    if (q.size === 0) return { chunk, score: 0 };
    const body = words(chunk.content).concat(
      chunk.conceptIds.flatMap((c) => words(c.replace(/_/g, " "))),
    );
    let score = 0;
    for (const w of body) if (q.has(w)) score++;
    return { chunk, score };
  });
}

/** Score chunks by keyword overlap with the question; return the top N. */
export function scoreChunks(
  question: string,
  chunks: KnowledgeChunk[],
  topN = 5,
): KnowledgeChunk[] {
  return scoreChunksScored(question, chunks)
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((s) => s.chunk);
}

export interface ChatPromptInput {
  question: string;
  commonCoachPackage: CommonCoachPackage;
  retrievedChunks: KnowledgeChunk[];
  /** host-supplied snapshot of the current activity (hands, auction, …) */
  activityContext?: unknown;
  /** domain persona for the system line, e.g. "an adaptive bridge coach" */
  persona?: string;
}

export function buildChatPrompt(input: ChatPromptInput): BuiltPrompt {
  const { learner, learningState } = input.commonCoachPackage;
  const persona = input.persona ?? "an adaptive coach";
  const system = [
    `You are ${persona} chatting with a learner inside a practice app.`,
    `The learner is at ${learner.skillLevel} level; goal: ${learningState.currentLearningGoal || "general practice"}.`,
    `Style: ${learner.preferences.feedbackStyle}; depth: ${learner.preferences.explanationDepth}.`,
    "Answer the learner's question directly and concisely (mobile display).",
    "Ground your answer in the provided game state and teaching material.",
    "If the question can't be answered from the context, say so briefly rather than inventing facts.",
  ].join("\n");

  const chunkText = input.retrievedChunks.length
    ? input.retrievedChunks.map((c) => `- (${c.chunkType}) ${c.content}`).join("\n")
    : "(none retrieved)";

  const user = [
    "Current game context:",
    JSON.stringify(input.activityContext ?? {}, null, 1),
    "",
    "Relevant teaching material:",
    chunkText,
    "",
    `Learner's question: ${input.question}`,
  ].join("\n");

  return { system, user };
}

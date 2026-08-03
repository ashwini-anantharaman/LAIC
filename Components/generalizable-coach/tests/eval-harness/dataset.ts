/**
 * Labeled grading set for the M4 eval harness (D1/C2).
 *
 * Small, human-labeled open-ended answers on the course_learning sample lesson
 * (memory consolidation / spaced repetition). Grow this set as real usage
 * surfaces edge cases; it is the objective bar the graded helper must clear
 * before it becomes a course default (D3).
 */
import type { GradingCase } from "../../platform/eval/gradedAccuracy";

export const MEMORY_LESSON_CASES: GradingCase[] = [
  {
    id: "wm-capacity-correct",
    question: "Roughly how many items can working memory hold at once?",
    answer: "About four chunks of information at a time.",
    referenceAnswer: "Working memory holds roughly four chunks of information at once.",
    conceptIds: ["concept.working_memory"],
    expected: "correct",
  },
  {
    id: "spacing-correct-paraphrase",
    question: "Why is spaced repetition more effective than cramming?",
    answer: "Spreading reviews over time forces retrieval after forgetting, which strengthens long-term memory more than massed practice.",
    referenceAnswer: "Spacing reviews over time leverages the spacing effect: retrieving after partial forgetting strengthens durable long-term retention better than cramming.",
    conceptIds: ["concept.spaced_repetition"],
    expected: "correct",
  },
  {
    id: "consolidation-partial",
    question: "What happens during memory consolidation?",
    answer: "Memories move to long-term storage.",
    referenceAnswer: "Consolidation stabilizes new memories into long-term storage over time, especially during sleep, transferring them from hippocampus to cortex.",
    conceptIds: ["concept.memory_consolidation"],
    expected: "partially_correct",
  },
  {
    id: "spacing-partial-missing-why",
    question: "Describe spaced repetition and why it works.",
    answer: "You review things on a schedule with gaps between reviews.",
    referenceAnswer: "Spaced repetition reviews material at increasing intervals; it works via the spacing effect, where retrieval after partial forgetting boosts long-term retention.",
    conceptIds: ["concept.spaced_repetition"],
    expected: "partially_correct",
  },
  {
    id: "wm-capacity-incorrect",
    question: "Roughly how many items can working memory hold at once?",
    answer: "Working memory is basically unlimited, like a hard drive.",
    referenceAnswer: "Working memory holds roughly four chunks of information at once — it is very limited.",
    conceptIds: ["concept.working_memory"],
    expected: "incorrect",
  },
  {
    id: "consolidation-incorrect",
    question: "What happens during memory consolidation?",
    answer: "It is when you forget everything you studied.",
    referenceAnswer: "Consolidation stabilizes new memories into durable long-term storage over time, especially during sleep.",
    conceptIds: ["concept.memory_consolidation"],
    expected: "incorrect",
  },
  {
    id: "spacing-correct-short",
    question: "Give one benefit of spacing out study sessions.",
    answer: "It improves long-term retention through the spacing effect.",
    referenceAnswer: "Spacing study sessions improves long-term retention via the spacing effect.",
    conceptIds: ["concept.spaced_repetition"],
    expected: "correct",
  },
  {
    id: "wm-partial",
    question: "What limits how much you can think about at once?",
    answer: "Your memory has limits.",
    referenceAnswer: "Working memory has a small capacity — about four chunks — which limits how much you can actively hold and manipulate at once.",
    conceptIds: ["concept.working_memory"],
    expected: "partially_correct",
  },
];

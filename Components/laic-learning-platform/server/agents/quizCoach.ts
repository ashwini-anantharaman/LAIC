import { claudeJSON } from "../lib/anthropic.js";
import {
  isModuleMastered,
  levelFromBkt,
  updateBkt,
  type MasteryLevelName,
} from "../lib/mastery.js";

export async function evaluateAnswer(params: {
  conceptId: string;
  question: string;
  options: string[];
  selectedIndex: number;
  correctIndex: number;
  currentMastery: string;
  bktScore?: number;
  hintsUsed?: number;
  sessionCorrectCount?: number;
}) {
  const {
    question,
    options,
    selectedIndex,
    correctIndex,
    currentMastery,
    bktScore = 0,
    hintsUsed = 0,
  } = params;
  const selected = options[selectedIndex];
  const correct = options[correctIndex];

  const result = await claudeJSON<{
    correct: boolean;
    message: string;
    misconception: string | null;
  }>(
    `You are the LAIC Quiz Coach. Evaluate the student's MCQ answer. Be encouraging. If wrong, identify the specific misconception without revealing the correct letter.
Return JSON: { "correct": boolean, "message": string, "misconception": string|null }`,
    `Question: ${question}\nOptions: ${options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join("\n")}
Correct answer: ${correct}
Student selected: ${selected}
Known correct index: ${selectedIndex === correctIndex}`,
    512
  );

  const isCorrect = result.correct ?? selectedIndex === correctIndex;
  const newBkt = isCorrect ? updateBkt(bktScore, true, hintsUsed) : updateBkt(bktScore, false, hintsUsed);
  const newMastery = levelFromBkt(newBkt) as MasteryLevelName;
  const moduleComplete = isModuleMastered(newMastery, newBkt);

  let message = result.message ?? (isCorrect ? "Correct!" : "Not quite — check the hints above.");
  if (moduleComplete && isCorrect) {
    message = "Excellent — you've mastered this module! No more quiz questions needed.";
  } else if (isCorrect) {
    message = `${message} Next question loading…`;
  }

  return {
    correct: isCorrect,
    newMastery,
    newBktScore: newBkt,
    moduleComplete: moduleComplete && isCorrect,
    shouldGenerateNext: isCorrect && !moduleComplete,
    message,
    misconception: result.misconception,
  };
}

export { isModuleMastered, levelFromBkt };

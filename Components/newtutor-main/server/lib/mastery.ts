export const MASTERY_LEVELS = [
  "not-seen",
  "exposed",
  "practiced",
  "understood",
  "mastered",
] as const;

export type MasteryLevelName = (typeof MASTERY_LEVELS)[number];

export function levelFromBkt(bkt: number): MasteryLevelName {
  if (bkt >= 0.88) return "mastered";
  if (bkt >= 0.68) return "understood";
  if (bkt >= 0.42) return "practiced";
  if (bkt >= 0.12) return "exposed";
  return "not-seen";
}

/** Bayesian-knowledge-tracing style update. */
export function updateBkt(current: number, correct: boolean, hintsUsed: number): number {
  const hintPenalty = Math.min(0.08, hintsUsed * 0.02);
  const delta = correct ? 0.22 - hintPenalty : -0.12;
  return Math.max(0, Math.min(1, current + delta));
}

export function isModuleMastered(level: string, bkt: number): boolean {
  return level === "mastered" || bkt >= 0.88;
}

export function difficultyForMastery(level: string): "easy" | "medium" | "hard" {
  if (level === "not-seen" || level === "exposed") return "easy";
  if (level === "practiced") return "medium";
  return "hard";
}

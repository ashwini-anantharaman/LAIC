/**
 * Zone 1 — Platform core: the Common Coach layer.
 *
 * "Knows the learner": turns the persisted learner model into cross-session
 * intelligence — which skills are weak, what to practice next, and a short
 * natural-language summary. Domain-agnostic; operates only on the learner-model
 * types (skill/concept ids are opaque strings supplied by domains). This is the
 * architecture doc's §8 (Weak Skill Detector, Recommendation/Practice-Plan
 * Builder, Learner Summary Generator).
 */
import type { DomainLearnerState, LearnerProfile, Mastery } from "../learner-model/types";

export interface WeakSkill {
  skillId: string;
  /** 0–1 correct ratio */
  accuracy: number;
  exposureCount: number;
  mistakeCount: number;
  mastery: Mastery;
  /** higher = weaker; used for ranking */
  score: number;
}

/**
 * Rank a domain's weak skills, worst first. "Weak" keeps the original
 * getCommonCoachPackage criteria (practiced, under 60% accuracy, not mastered)
 * so membership is stable; the score adds ordering by how much help is needed.
 */
export function detectWeakSkills(domain: DomainLearnerState): WeakSkill[] {
  return domain.skillStates
    .filter(
      (s) =>
        s.exposureCount > 0 &&
        s.correctCount / s.exposureCount < 0.6 &&
        s.mastery !== "mastered",
    )
    .map((s) => {
      const accuracy = s.correctCount / s.exposureCount;
      // Weakness score: distance below perfect accuracy, weighted by how much
      // the learner has struggled (mistakes) — so a well-practiced weak skill
      // outranks one seen once.
      const score = (1 - accuracy) * 100 + s.mistakeCount * 2;
      return {
        skillId: s.skillId,
        accuracy,
        exposureCount: s.exposureCount,
        mistakeCount: s.mistakeCount,
        mastery: s.mastery,
        score,
      };
    })
    .sort((a, b) => b.score - a.score);
}

export type RecommendationKind = "reinforce_weak" | "build_up" | "explore";

export interface Recommendation {
  /** the skill to target next; null "explore" means no specific skill */
  skillId: string | null;
  kind: RecommendationKind;
  reason: string;
}

const PROFICIENT_OR_BETTER: Mastery[] = ["proficient", "mastered"];

/**
 * What should the learner practice next? Prefer reinforcing the weakest skill;
 * otherwise build up a skill that's started but not yet proficient; otherwise
 * suggest exploring new material.
 */
export function recommendNextSkill(domain: DomainLearnerState): Recommendation {
  const [w] = detectWeakSkills(domain);
  if (w) {
    return {
      skillId: w.skillId,
      kind: "reinforce_weak",
      reason: `You're at ${Math.round(w.accuracy * 100)}% on ${w.skillId} — let's drill it.`,
    };
  }

  // Least-practiced skill that isn't proficient yet — build it up.
  const [s] = domain.skillStates
    .filter((st) => !PROFICIENT_OR_BETTER.includes(st.mastery))
    .sort((a, b) => a.exposureCount - b.exposureCount);
  if (s) {
    return {
      skillId: s.skillId,
      kind: "build_up",
      reason: `${s.skillId} is coming along — a bit more practice will make it stick.`,
    };
  }

  return {
    skillId: null,
    kind: "explore",
    reason: "You're solid on what you've practiced — time to try something new.",
  };
}

/** A short cross-session summary of the learner in a domain. */
export function summarizeLearner(profile: LearnerProfile, domainId: string): string {
  const domain = profile.domains[domainId];
  if (!domain || domain.skillStates.length === 0) {
    return "No practice yet in this domain.";
  }
  const practiced = domain.skillStates.filter((s) => s.exposureCount > 0);
  const [w] = detectWeakSkills(domain);
  const parts: string[] = [`Practiced ${practiced.length} skill(s).`];

  if (w) {
    parts.push(`Weakest: ${w.skillId} (${Math.round(w.accuracy * 100)}% correct).`);
  }
  // Most common recent-mistake concept.
  const counts = new Map<string, number>();
  for (const m of domain.recentMistakes) {
    if (m.conceptId) counts.set(m.conceptId, (counts.get(m.conceptId) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top) parts.push(`Recurring issue: ${top[0]}.`);

  return parts.join(" ");
}

export * from "./postmortem";

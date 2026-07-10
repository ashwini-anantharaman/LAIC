/**
 * Zone 1 — Platform core: in-memory learner model store.
 *
 * Tracks who the learner is, what skills they've practiced, and what
 * mistakes they've made. Backed by a Map for now; the interface is stable
 * enough to swap in a real datastore later.
 */
import type {
  CommonCoachPackage,
  EvaluationResult,
  FeedbackStyle,
  ExplanationDepth,
  SkillLevel,
} from "../types/index.js";
import type {
  LearnerProfile,
  DomainLearnerState,
  SkillState,
  Mastery,
  MistakeRecord,
} from "./types.js";
import type { LearnerRepo } from "../storage/ports.js";
import { InMemoryLearnerRepo } from "../storage/memory.js";
import {
  detectWeakSkills,
  recommendNextSkill,
  summarizeLearner,
  type WeakSkill,
  type Recommendation,
} from "../common-coach/index.js";
import type { LearnerDomainProfile } from "../../contracts/index.js";
import { CONTRACTS_SCHEMA_VERSION } from "../../contracts/index.js";

/** Map the internal mastery ladder onto the contract's 0–1 mastery scale. */
const MASTERY_SCORE: Record<Mastery, number> = {
  not_started: 0,
  introduced: 0.25,
  practicing: 0.5,
  proficient: 0.8,
  mastered: 1,
};

const MAX_RECENT_MISTAKES = 20;

export interface CreateProfilePreferences {
  feedbackStyle: FeedbackStyle;
  explanationDepth: ExplanationDepth;
}

function nowIso(): string {
  return new Date().toISOString();
}

function emptyDomainState(): DomainLearnerState {
  // Domain-neutral defaults: the platform core invents no domain content.
  // A domain (or the resolved policy) sets the concrete level/goal; until
  // then the level is the lowest generic tier and the goal is unset (the
  // prompt builders fall back to "general practice" on an empty goal).
  return {
    currentLevel: "beginner",
    currentLearningGoal: "",
    skillStates: [],
    recentMistakes: [],
    sessionsCompleted: 0,
    lastSessionAt: "",
  };
}

/**
 * Mastery ladder. Progression is monotonic — mastery never regresses here.
 *  - not_started → introduced   : on first exposure
 *  - introduced  → practicing    : 3+ exposures
 *  - practicing  → proficient     : >70% correct over 10+ exposures
 *  - proficient  → mastered       : >90% correct over 20+ exposures
 */
export function computeMastery(state: SkillState): Mastery {
  const { exposureCount, correctCount } = state;
  const accuracy = exposureCount > 0 ? correctCount / exposureCount : 0;

  if (exposureCount >= 20 && accuracy > 0.9) return "mastered";
  if (exposureCount >= 10 && accuracy > 0.7) return "proficient";
  if (exposureCount >= 3) return "practicing";
  if (exposureCount >= 1) return "introduced";
  return "not_started";
}

function skillLevelFromDomainLevel(level: string): SkillLevel {
  if (level.startsWith("advanced")) return "advanced";
  if (level.startsWith("intermediate")) return "intermediate";
  return "beginner";
}

export class LearnerStore {
  /**
   * Domains whose mastery is owned by the host platform, not the Coach (M4:
   * OwlwiseStudio owns `course_learning` BKT mastery). For these, the Coach
   * reads mastery from the host and must NOT advance a second, divergent skill
   * record locally — the mitigation for the §14.6 deviation. `updateSkillState`
   * is a no-op for a domain listed here.
   */
  private readonly externalMasteryDomains = new Set<string>();

  constructor(private readonly repo: LearnerRepo = new InMemoryLearnerRepo()) {}

  /** Mark a domain's mastery as host-owned (read-only for the Coach). */
  setExternalMasteryDomains(domainIds: string[]): void {
    this.externalMasteryDomains.clear();
    for (const id of domainIds) this.externalMasteryDomains.add(id);
  }

  /** Whether the Coach advances its own mastery for this domain. */
  ownsMastery(domainId: string): boolean {
    return !this.externalMasteryDomains.has(domainId);
  }

  getProfile(learnerId: string): LearnerProfile | null {
    return this.repo.get(learnerId);
  }

  createProfile(
    learnerId: string,
    name: string,
    preferences: CreateProfilePreferences,
  ): LearnerProfile {
    const profile: LearnerProfile = {
      learnerId,
      name,
      createdAt: nowIso(),
      preferences: {
        feedbackStyle: preferences.feedbackStyle,
        explanationDepth: preferences.explanationDepth,
      },
      domains: {},
    };
    this.repo.put(profile);
    return profile;
  }

  private getOrCreateDomainState(
    profile: LearnerProfile,
    domainId: string,
  ): DomainLearnerState {
    let domain = profile.domains[domainId];
    if (!domain) {
      domain = emptyDomainState();
      profile.domains[domainId] = domain;
    }
    return domain;
  }

  private getOrCreateSkillState(
    domain: DomainLearnerState,
    skillId: string,
  ): SkillState {
    let skill = domain.skillStates.find((s) => s.skillId === skillId);
    if (!skill) {
      skill = {
        skillId,
        mastery: "not_started",
        exposureCount: 0,
        correctCount: 0,
        mistakeCount: 0,
        lastPracticedAt: "",
      };
      domain.skillStates.push(skill);
    }
    return skill;
  }

  /**
   * Fold an evaluation result into the learner's skill state for a domain.
   * Increments exposure; bumps correct/mistake counters; recomputes mastery;
   * logs a MistakeRecord for incorrect results.
   */
  updateSkillState(
    learnerId: string,
    domainId: string,
    skillId: string,
    result: EvaluationResult,
  ): void {
    const profile = this.repo.get(learnerId);
    if (!profile) {
      throw new Error(`Unknown learner: ${learnerId}`);
    }
    if (!skillId) return; // nothing to attribute this evaluation to
    // Host owns mastery for this domain (M4): do not advance a divergent record.
    if (this.externalMasteryDomains.has(domainId)) return;

    const domain = this.getOrCreateDomainState(profile, domainId);
    const skill = this.getOrCreateSkillState(domain, skillId);

    const ts = nowIso();
    skill.exposureCount += 1;
    skill.lastPracticedAt = ts;

    const isCorrect =
      result.correctness === "correct" || result.correctness === "acceptable";

    if (isCorrect) {
      skill.correctCount += 1;
    } else {
      skill.mistakeCount += 1;
      const mistake: MistakeRecord = {
        timestamp: ts,
        conceptId: result.conceptIds[0] ?? "",
        skillId,
        eventId: "",
        severity: result.severity,
      };
      // most recent first, capped
      domain.recentMistakes.unshift(mistake);
      if (domain.recentMistakes.length > MAX_RECENT_MISTAKES) {
        domain.recentMistakes.length = MAX_RECENT_MISTAKES;
      }
    }

    skill.mastery = computeMastery(skill);
    this.repo.put(profile); // persist the folded-in result
  }

  /**
   * Attach the triggering eventId to the most recent mistake, if any.
   * The runtime calls this after logging so mistakes are traceable to events.
   */
  tagLastMistakeEvent(
    learnerId: string,
    domainId: string,
    eventId: string,
  ): void {
    const profile = this.repo.get(learnerId);
    const last = profile?.domains[domainId]?.recentMistakes[0];
    if (profile && last && !last.eventId) {
      last.eventId = eventId;
      this.repo.put(profile);
    }
  }

  /** Assemble a CommonCoachPackage for the given learner + domain. */
  getCommonCoachPackage(
    learnerId: string,
    domainId: string,
  ): CommonCoachPackage {
    const profile = this.repo.get(learnerId);
    if (!profile) {
      throw new Error(`Unknown learner: ${learnerId}`);
    }
    // Read-only: don't mutate/persist just to assemble a package.
    const domain = profile.domains[domainId] ?? emptyDomainState();

    const masteredSkills = domain.skillStates
      .filter((s) => s.mastery === "mastered")
      .map((s) => s.skillId);

    // Weak skills, ranked worst-first by the Common Coach detector.
    const weakSkills = detectWeakSkills(domain).map((w) => w.skillId);

    const recentMistakes = domain.recentMistakes
      .slice(0, 5)
      .map((m) => m.conceptId)
      .filter(Boolean);

    return {
      learner: {
        learnerId: profile.learnerId,
        skillLevel: skillLevelFromDomainLevel(domain.currentLevel),
        preferences: {
          feedbackStyle: profile.preferences.feedbackStyle,
          explanationDepth: profile.preferences.explanationDepth,
          // interruptionTolerance is not stored on the profile yet; default
          // to a sensible mobile value. Kept in the package for the coach.
          interruptionTolerance: "medium",
        },
      },
      learningState: {
        currentDomainId: domainId,
        currentExperienceId: "",
        currentActivityId: "",
        currentLearningGoal: domain.currentLearningGoal,
        masteredSkills,
        weakSkills,
        recentMistakes,
        recentFeedbackSummary: summarizeLearner(profile, domainId),
      },
      coachingPolicy: {
        maxHintLevel: 4,
        allowDirectAnswer: false,
        allowRealTimeInterruption:
          profile.preferences.feedbackStyle !== "minimal",
        saveForPostmortemWhenPossible: false,
      },
    };
  }

  /**
   * The domain IDs this learner has any state in (LAIC M1/A3). Used by the
   * cross-scope-awareness path; the store is cross-domain but every *view* is
   * domain-filtered.
   */
  listLearnerDomains(learnerId: string): string[] {
    return Object.keys(this.repo.get(learnerId)?.domains ?? {});
  }

  /**
   * Project the cross-domain store into the per-domain `LearnerDomainProfile`
   * contract (LAIC M1/A3, §5.2, CPIP §11.1). Domain-isolated BY CONSTRUCTION:
   * only the requested domain's skills/mistakes are read, so a bridge skill can
   * never appear in a Brain Bee projection (the §16.4 isolation rule).
   */
  getLearnerDomainProfile(learnerId: string, domainId: string): LearnerDomainProfile {
    const profile = this.repo.get(learnerId);
    const domain = profile?.domains[domainId] ?? emptyDomainState();

    return {
      schemaVersion: CONTRACTS_SCHEMA_VERSION,
      learnerId,
      domainId,
      currentLevel: domain.currentLevel,
      currentLearningGoal: domain.currentLearningGoal,
      masteredSkills: domain.skillStates
        .filter((s) => s.mastery === "mastered")
        .map((s) => s.skillId),
      weakSkills: detectWeakSkills(domain).map((w) => w.skillId),
      skillStates: domain.skillStates.map((s) => ({
        skillId: s.skillId,
        mastery: MASTERY_SCORE[s.mastery],
        exposureCount: s.exposureCount,
        correctCount: s.correctCount,
        mistakeCount: s.mistakeCount,
        lastPracticedAt: s.lastPracticedAt,
      })),
      recentMistakes: domain.recentMistakes.map((m) => ({
        timestamp: m.timestamp,
        conceptId: m.conceptId,
        skillId: m.skillId,
        eventId: m.eventId,
        severity: m.severity,
      })),
    };
  }

  /** Weak skills for a learner+domain, ranked worst-first (Common Coach). */
  getWeakSkills(learnerId: string, domainId: string): WeakSkill[] {
    const domain = this.repo.get(learnerId)?.domains[domainId];
    return domain ? detectWeakSkills(domain) : [];
  }

  /** What the learner should practice next (Common Coach recommender). */
  recommendNextSkill(learnerId: string, domainId: string): Recommendation {
    const domain = this.repo.get(learnerId)?.domains[domainId];
    if (!domain) {
      return {
        skillId: null,
        kind: "explore",
        reason: "No practice yet — start anywhere.",
      };
    }
    return recommendNextSkill(domain);
  }
}

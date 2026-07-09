/**
 * Seed presets for the Configuration Studio (LAIC M2/B5).
 *
 * Presets are ordinary CoachProfile records (ownerType "platform") plus the
 * behavioral/scope objects they reference. An admin clones one, tweaks config,
 * and deploys an instance — no code change. The "Bridge Beginner Coach" is the
 * reference preset the M2 definition-of-done exercises.
 */
import type {
  CoachProfile,
  CoachingPolicyProfile,
  KnowledgeScope,
  CoachCapabilityScope,
} from "../../contracts/index.js";
import { CONTRACTS_SCHEMA_VERSION } from "../../contracts/index.js";

export interface PresetBundle {
  profile: CoachProfile;
  policyProfile: CoachingPolicyProfile;
  knowledgeScope: KnowledgeScope;
  capabilityScope: CoachCapabilityScope;
}

export function bridgeBeginnerPreset(): PresetBundle {
  const V = CONTRACTS_SCHEMA_VERSION;
  return {
    profile: {
      schemaVersion: V,
      id: "preset.bridge_beginner",
      name: "Bridge Beginner Coach",
      description: "Gentle, mixed-style coaching for Beginner-1 bridge bidding.",
      domainId: "bridge_gameplay",
      profileType: "live_activity_coach",
      supportedModes: ["on_demand", "live_coach", "postmortem"],
      defaultMode: "live_coach",
      coachingPolicyProfileId: "cpp.bridge_beginner",
      knowledgeScopeId: "ks.bridge_beginner",
      capabilityScopeId: "cs.bridge_beginner",
      version: "1.0.0",
      status: "published",
      ownerType: "platform",
      ownerId: "system",
    },
    policyProfile: {
      schemaVersion: V,
      profileId: "cpp.bridge_beginner",
      displayName: "Bridge Beginner",
      questioningStyle: "mixed",
      hintLadder: { maxLevel: 4, questionFirst: true },
      interventionPolicy: {
        maxHintLevel: 4,
        allowDirectAnswer: false,
        feedbackStyle: "gentle",
        interruptionTolerance: "medium",
        postmortemVsRealtime: "prefer_realtime",
      },
      enabledTools: [],
    },
    knowledgeScope: {
      schemaVersion: V,
      id: "ks.bridge_beginner",
      domainId: "bridge_gameplay",
      allowedKnowledgePackageIds: ["bridge_sample_v1"],
      allowedConceptIds: ["concept.opening_bid", "concept.hand_balanced"],
      allowedSkillIds: ["skill.opening_1nt", "skill.opening_major"],
      forbiddenConceptIds: [],
      instructionalLevel: "beginner",
      sourcePolicy: { sourceBoundOnly: true, allowGeneralBackground: false, requireCitations: true },
    },
    capabilityScope: {
      schemaVersion: V,
      id: "cs.bridge_beginner",
      name: "Bridge beginner capabilities",
      canAnswerQuestions: true,
      canExplainConcepts: true,
      canAskSocraticQuestions: true,
      canGenerateHints: true,
      canEvaluateResponses: true,
      canRecommendLearningObjects: true,
      canRecommendPractice: true,
      canCreateFlashcardReview: false,
      canGeneratePostmortems: true,
      canGuideReplay: false,
      canSummarizeForHumanCoach: true,
      canUpdateLearnerModel: true,
      canTriggerNotifications: false,
    },
  };
}

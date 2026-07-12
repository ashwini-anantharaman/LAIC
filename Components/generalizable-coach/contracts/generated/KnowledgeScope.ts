/* eslint-disable */
/**
 * AUTO-GENERATED from contracts/schemas/KnowledgeScope.schema.json — DO NOT EDIT BY HAND.
 * Regenerate with: npm run contracts:gen
 */

/**
 * The primary knowledge guardrail: the approved packages/concepts/skills/objects/sources a coach instance may use in a context. See LAIC architecture §11.5.
 */
export interface KnowledgeScope {
  schemaVersion: string;
  id: string;
  domainId: string;
  allowedKnowledgePackageIds?: string[];
  allowedConceptIds?: string[];
  allowedSkillIds?: string[];
  /**
   * LPIP LearningObjectBase.id
   */
  allowedLearningObjectIds?: string[];
  /**
   * LPIP SourceDocument.id
   */
  allowedSourceIds?: string[];
  forbiddenConceptIds?: string[];
  forbiddenSkillIds?: string[];
  instructionalLevel: "intro" | "beginner" | "club_beginner" | "intermediate" | "advanced";
  sourcePolicy: {
    sourceBoundOnly: boolean;
    allowGeneralBackground: boolean;
    requireCitations: boolean;
  };
}

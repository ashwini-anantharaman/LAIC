/* eslint-disable */
/**
 * AUTO-GENERATED from contracts/schemas/ActivityEvent.schema.json — DO NOT EDIT BY HAND.
 * Regenerate with: npm run contracts:gen
 */

/**
 * The generic, host-translated activity envelope the Coach ingests. UI- and domain-agnostic: a host maps its native events (a bridge bid, a quiz answer) onto this shape. See LAIC architecture §6.2, §14.4.
 */
export interface ActivityEvent {
  schemaVersion: string;
  eventId: string;
  /**
   * e.g. "bridge_gameplay", "course_learning"
   */
  domainId: string;
  /**
   * e.g. "bid_made", "quiz_attempted", "hint_requested"
   */
  eventType: string;
  timestamp: string;
  sessionId: string;
  /**
   * the learnerId
   */
  actorId: string;
  /**
   * Domain-specific payload; opaque to the platform.
   */
  action?: {} | null;
  /**
   * Which platform emitted this event (LAIC §14.4).
   */
  sourcePlatform?: "bridge" | "learning" | "nexus" | "coach" | "other";
  /**
   * e.g. "lesson", "quiz", "flashcard", "bid", "play"
   */
  activityType?: string;
  contextRefs?: {
    learningObjectId?: string;
    courseId?: string;
    bridgeBoardId?: string;
    [k: string]: unknown;
  };
}

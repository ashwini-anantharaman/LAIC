/**
 * M4 · Workstream D (LR2) — forward learning activity to the Generalizable Coach.
 *
 * The Learning Platform stays the system of record for content, progress, and
 * mastery; the Coach is the system of record for understanding and help. We map
 * native learning signals onto the Coach's generic `ActivityEvent` and POST them
 * to `/api/coaching/events`. Delivery is best-effort and NON-BLOCKING — a slow or
 * down Coach must never block the lesson runtime (Integration Requirements §4).
 */
import { randomUUID } from "node:crypto";
import { config } from "./config.js";

/** Contract version of the Coach's ActivityEvent schema. */
const ACTIVITY_EVENT_SCHEMA_VERSION = "1.0.0";

export interface ActivityEventInput {
  domainId: string; // "course_learning"
  eventType: string; // "quiz_attempted" | "lesson_viewed" | ...
  sessionId: string;
  actorId: string; // the learner (Supabase user id in M4)
  action?: Record<string, unknown> | null;
  activityType?: string; // "quiz" | "lesson" | "flashcard" | "reflection"
  contextRefs?: Record<string, unknown>; // { courseId, learningObjectId }
}

/** Is Coach event forwarding configured? */
export function coachForwardingEnabled(): boolean {
  return Boolean(config.coachBaseUrl);
}

/**
 * Map + forward an ActivityEvent to the Coach. Fire-and-forget: callers should
 * NOT await this on the request path (or should ignore its result). Swallows all
 * errors after logging — this is telemetry to the Coach, not a critical write.
 */
export async function forwardActivityEvent(input: ActivityEventInput): Promise<void> {
  if (!config.coachBaseUrl) return; // integration disabled
  const event = {
    schemaVersion: ACTIVITY_EVENT_SCHEMA_VERSION,
    eventId: randomUUID(),
    timestamp: new Date().toISOString(),
    sourcePlatform: "learning" as const,
    domainId: input.domainId,
    eventType: input.eventType,
    sessionId: input.sessionId,
    actorId: input.actorId,
    action: input.action ?? null,
    ...(input.activityType ? { activityType: input.activityType } : {}),
    ...(input.contextRefs ? { contextRefs: input.contextRefs } : {}),
  };

  try {
    const res = await fetch(`${config.coachBaseUrl.replace(/\/+$/, "")}/api/coaching/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.coachServiceToken ? { Authorization: `Bearer ${config.coachServiceToken}` } : {}),
      },
      body: JSON.stringify(event),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.warn(`[coach] event forward failed: ${res.status} ${detail.slice(0, 200)}`);
    }
  } catch (e) {
    console.warn(`[coach] event forward error:`, e instanceof Error ? e.message : e);
  }
}

// ---------------------------------------------------------------------------
// M4 · Workstream F (D3 rollout) — is the Coach-backed helper enabled here?
// ---------------------------------------------------------------------------

/** Is the graded, Coach-routed in-lesson helper enabled for this course? */
export function isCoachGradedCourse(courseId: string): boolean {
  if (!config.coachBaseUrl) return false; // no Coach configured
  const list = config.coachGradedCourses;
  return list.includes("*") || list.includes(courseId);
}

// ---------------------------------------------------------------------------
// M4 · Workstream E (LR3) — route the in-lesson helper through a Coach session.
// ---------------------------------------------------------------------------

function coachHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(config.coachServiceToken ? { Authorization: `Bearer ${config.coachServiceToken}` } : {}),
  };
}

/** Pull a learner-facing message string out of the Coach's chat result, defensively. */
function extractMessage(result: unknown): string {
  const r = (result ?? {}) as Record<string, unknown>;
  for (const k of ["message", "reply", "content", "text"]) {
    const v = r[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  // A tool_call / silent / declined turn has no plain message — surface a hint.
  if (typeof r.type === "string") return `(${r.type})`;
  return "";
}

export interface CoachAskResult {
  content: string;
  sessionId: string;
  sources?: unknown;
  raw: unknown;
}

/**
 * Route a learner message through a `course_learning` Coach session. Opens a
 * session when none is supplied (reuse it by passing `sessionId` back on the
 * next turn). Throws on transport failure so the caller can fall back to the
 * local assistant.
 */
export async function askCoach(params: {
  learnerId: string;
  courseId: string;
  message: string;
  sessionId?: string;
}): Promise<CoachAskResult> {
  if (!config.coachBaseUrl) throw new Error("Coach base URL not configured");
  const base = config.coachBaseUrl.replace(/\/+$/, "");

  let sessionId = params.sessionId;
  if (!sessionId) {
    const openRes = await fetch(`${base}/api/coaching/sessions`, {
      method: "POST",
      headers: coachHeaders(),
      body: JSON.stringify({
        learnerId: params.learnerId,
        domainId: "course_learning",
        contextRefs: { courseId: params.courseId },
      }),
    });
    if (!openRes.ok) throw new Error(`Coach session open failed: ${openRes.status}`);
    const opened = (await openRes.json()) as { sessionId?: string };
    if (!opened.sessionId) throw new Error("Coach session open returned no sessionId");
    sessionId = opened.sessionId;
  }

  const askRes = await fetch(`${base}/api/coaching/ask`, {
    method: "POST",
    headers: coachHeaders(),
    body: JSON.stringify({ sessionId, message: params.message }),
  });
  if (!askRes.ok) throw new Error(`Coach ask failed: ${askRes.status}`);
  const raw = await askRes.json();
  const r = (raw ?? {}) as Record<string, unknown>;
  return { content: extractMessage(raw), sessionId, sources: r.sources, raw };
}

// ---------------------------------------------------------------------------
// M4 · Workstream E (LR4) — tool manifest the Coach may gate + propose; Owlwise
// executes host-side. Advertised via GET /api/agents/coach-tools.
// ---------------------------------------------------------------------------

export interface CoachToolManifestEntry {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  endpoint: { method: string; path: string };
  policyHints?: { revealsAnswer?: boolean; category?: string; minHintLevel?: number };
}

export const COURSE_LEARNING_COACH_TOOLS: CoachToolManifestEntry[] = [
  {
    name: "evaluate_quiz_answer",
    description: "Grade a learner's quiz answer and update mastery. May reveal correctness.",
    inputSchema: { type: "object", properties: { courseId: {}, conceptId: {}, questionId: {}, selectedIndex: {} }, required: ["courseId", "conceptId", "questionId"] },
    endpoint: { method: "POST", path: "/api/agents/quiz/evaluate" },
    policyHints: { revealsAnswer: true, category: "assessment" },
  },
  {
    name: "generate_reflection_prompt",
    description: "Produce a reflection prompt for a concept the learner just studied.",
    inputSchema: { type: "object", properties: { courseId: {}, conceptName: {} }, required: ["courseId", "conceptName"] },
    endpoint: { method: "POST", path: "/api/agents/reflection/prompt" },
    policyHints: { category: "planning" },
  },
  {
    name: "generate_module_lesson",
    description: "Generate lesson content for a module from the course's source material.",
    inputSchema: { type: "object", properties: { courseId: {}, moduleName: {} }, required: ["courseId", "moduleName"] },
    endpoint: { method: "POST", path: "/api/agents/module/generate-lesson" },
    policyHints: { category: "reference" },
  },
];

import { claudeJSON } from "../lib/anthropic.js";

export async function planNextSession(params: {
  masteryJson: string;
  prerequisiteEdges: { from: string; to: string }[];
  concepts: { id: string; name: string }[];
  defaultMode: string;
  completedConceptId?: string;
}) {
  return claudeJSON<{
    conceptId: string;
    conceptName: string;
    mode: string;
    estimatedMinutes: number;
    reason: string;
  }>(
    `You are the LAIC Planner Agent. Recommend the next study session using mastery state and prerequisite graph.
Return JSON: { "conceptId", "conceptName", "mode": "real-world"|"conversational"|"textbook", "estimatedMinutes": number, "reason": string }`,
    JSON.stringify(params, null, 2),
    1024
  );
}

export async function dashboardSuggestions(params: {
  misconceptions: unknown[];
  modeSwitches: unknown[];
  engagement: unknown[];
}) {
  return claudeJSON<{ suggestions: { text: string; action: string }[] }>(
    `You are the LAIC Planner Agent for instructors. Suggest structural course improvements from analytics.
Return JSON: { "suggestions": [{ "text": string, "action": "Apply"|"Generate"|"Edit" }] }`,
    JSON.stringify(params, null, 2),
    1500
  );
}

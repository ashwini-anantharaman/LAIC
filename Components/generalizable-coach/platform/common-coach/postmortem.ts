/**
 * Zone 1 — Platform core: postmortem generator.
 *
 * Turns a completed session's logs (events + coach interactions) into an
 * end-of-session review. Deterministic and domain-agnostic — it reads only the
 * generic Session shape and the coach responses' concept metadata. A host can
 * show this directly, or pass `summary` to an LLM for nicer phrasing.
 */
import type { Session } from "../session/SessionEngine.js";
import type { CoachResponseType } from "../types/index.js";
import type { WeakSkill } from "./index.js";

export interface Postmortem {
  sessionId: string;
  /** learner-facing one-paragraph review */
  summary: string;
  /** how many learner actions the session logged */
  actionsCount: number;
  /** how many times the coach spoke (non-silent interactions) */
  interventionsCount: number;
  /** distinct concepts the coach flagged, most frequent first */
  coachedConcepts: string[];
  /** interaction counts by response type */
  byType: Partial<Record<CoachResponseType, number>>;
  /** what to work on next */
  suggestions: string[];
}

export function generatePostmortem(
  session: Session,
  weakSkills: WeakSkill[] = [],
): Postmortem {
  const actionsCount = session.events.length;
  const interventionsCount = session.coachInteractions.length;

  const byType: Partial<Record<CoachResponseType, number>> = {};
  const conceptCounts = new Map<string, number>();
  for (const interaction of session.coachInteractions) {
    const t = interaction.response.type;
    byType[t] = (byType[t] ?? 0) + 1;
    for (const c of interaction.response.metadata?.relatedConceptIds ?? []) {
      conceptCounts.set(c, (conceptCounts.get(c) ?? 0) + 1);
    }
  }
  const coachedConcepts = [...conceptCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => c);

  const suggestions: string[] = [];
  if (weakSkills.length > 0) {
    const w = weakSkills[0];
    suggestions.push(
      `Focus next on ${w.skillId} (currently ${Math.round(w.accuracy * 100)}% correct).`,
    );
  }
  if (coachedConcepts.length > 0 && suggestions.length === 0) {
    suggestions.push(`Review: ${coachedConcepts.slice(0, 2).join(", ")}.`);
  }

  const summary =
    interventionsCount === 0
      ? `Clean session — ${actionsCount} action(s) and no coaching needed. Nicely done.`
      : `You made ${actionsCount} action(s); the coach stepped in ${interventionsCount} time(s)` +
        (coachedConcepts.length
          ? `, mostly around ${coachedConcepts.slice(0, 2).join(" and ")}.`
          : ".") +
        (suggestions.length ? ` ${suggestions[0]}` : "");

  return {
    sessionId: session.sessionId,
    summary,
    actionsCount,
    interventionsCount,
    coachedConcepts,
    byType,
    suggestions,
  };
}

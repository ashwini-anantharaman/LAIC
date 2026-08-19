// The CURATED DEAL review loop (owner pick #5, 2026-08-15): what each learner
// actually did with the coach's annotated board — did they hold the charted
// line, where did they leave it, and how much of the hint ladders did they
// open. Server-only aggregation: everything here is DERIVED per request from
// the learner's session and their copy of the entry; nothing new is stored
// beyond the ladder-open stamps the play surface already writes
// (`curatedProgressJson`, lib/curated.ts).

import "server-only";

import type { Seat } from "@bridge/events";
import type { Assignment } from "@bridge/sessions";

import { callLabel, cardLabel } from "@/lib/coach/position";
import {
  atKey,
  firstDivergence,
  lineOf,
  parseCurated,
  parseCuratedProgress,
  pathStatus,
} from "@/lib/curated";
import { libraryStore, sessionService } from "@/lib/sessions";

/**
 * One line of plain prose per learner who has STARTED, keyed by assignmentId
 * — "Left your line at trick 2 — played ♠Q, you charted ♦3 · opened 1 of 3
 * of your ladders." Learners still at "assigned" get no line (their status
 * chip already says everything there is to say). Any row that can't be read
 * costs its own line, never the report.
 */
export async function curatedReportLines(issues: Assignment[]): Promise<Map<string, string>> {
  const lines = new Map<string, string>();
  await Promise.all(
    issues.map(async (a) => {
      if (!a.sessionId) return;
      try {
        const [entry, view] = await Promise.all([
          libraryStore().getEntry(a.entryId),
          sessionService().view(a.sessionId),
        ]);
        if (!entry?.curatedJson) return;
        const { record, state } = view;
        const seat = (Object.entries(record.seats) as [Seat, (typeof record.seats)["N"]][]).find(
          ([, c]) => c.kind === "human" && c.nexusUserId === a.learnerId,
        )?.[0];
        if (!seat) return;

        const line = lineOf(entry);
        const complete = state.phase === "complete";
        const status = pathStatus(state, line, seat);

        let journey: string;
        if (status.onPath) {
          journey = complete ? "Stayed on your line the whole way" : "On your line so far";
        } else {
          const d = firstDivergence(state, line);
          if (!d) {
            journey = "Left your line";
          } else {
            const addr =
              d.at.kind === "call"
                ? `bid #${d.at.auctionIndex + 1}`
                : `trick ${d.at.trickIndex + 1}, card ${d.at.playIndex + 1}`;
            const played = d.played.call
              ? callLabel(d.played.call)
              : d.played.card
                ? cardLabel(d.played.card)
                : "?";
            const charted = d.charted?.call
              ? callLabel(d.charted.call)
              : d.charted?.card
                ? cardLabel(d.charted.card)
                : null;
            journey = `Left your line at ${addr} — played ${played}${charted ? `, you charted ${charted}` : ""}`;
          }
          if (complete) journey = `${journey} · finished off-line`;
        }

        // The ladders: how much help they reached for, against how much the
        // coach wrote. Every open is stamped, coach-authored or Owlee's.
        const ladderKeys = new Set(
          parseCurated(entry.curatedJson)
            .annotations.filter((ann) => ann.hints)
            .map((ann) => atKey(ann.at)),
        );
        const opened = parseCuratedProgress(entry.curatedProgressJson).opened;
        const openedCoach = opened.filter((k) => ladderKeys.has(k)).length;
        const help =
          ladderKeys.size > 0
            ? `opened ${openedCoach} of ${ladderKeys.size} of your ladders`
            : opened.length > 0
              ? `opened hints at ${opened.length} decision${opened.length === 1 ? "" : "s"}`
              : "";

        lines.set(a.assignmentId, help ? `${journey} · ${help}` : journey);
      } catch {
        // One unreadable sitting costs its line, not the report.
      }
    }),
  );
  return lines;
}

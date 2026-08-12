// GET /api/bridge/assigned — the learner's inbox, as one JSON read model:
// the lift of /m/assigned. Reconciled assignments, every feedback thread on
// every board this learner owns (grouped by session), and per-brief reviewer
// counts + the coach's instruction (the brief is the note's only home; a
// row's own note survives for pre-brief data only — same rule as the page).

import type { PlaySubmission } from "@bridge/sessions";
import { NextResponse } from "next/server";

import { apiError, requireContext } from "@/lib/api";
import { reconcileAssignments } from "@/lib/assignments";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { nexusProgramIdOf, orgScopeOf } from "@/lib/nexus";
import { assignmentStore, submissionStore } from "@/lib/sessions";

const CORS = corsHeaders("GET");

export const OPTIONS = corsOptions("GET");

export async function GET() {
  try {
    const context = await requireContext();

    const programId = (await nexusProgramIdOf()) ?? undefined;
    const scope = {
      programOrganizationId: orgScopeOf(context),
      ...(programId ? { nexusProgramId: programId } : {}),
    };
    const raw = await assignmentStore().listAssignments({
      ...scope,
      learnerId: context.nexusUserId,
    });
    const assignments = await reconcileAssignments(raw);

    // One query, not one per assignment: every thread on every board this
    // learner owns, grouped by session — a finished board carries one thread
    // per REVIEWER (0028), so all are listed, named.
    const mySubs = await submissionStore()
      .listSubmissions({ ...scope, learnerId: context.nexusUserId })
      .catch(() => [] as PlaySubmission[]);
    const threads: Record<string, PlaySubmission[]> = {};
    for (const sub of mySubs) {
      (threads[sub.sessionId] ??= []).push(sub);
    }

    // Per BRIEF: how many coaches will review it, and the instruction.
    const briefIds = [
      ...new Set(assignments.map((a) => a.briefId).filter(Boolean)),
    ] as string[];
    const reviewerCounts = new Map<string, number>();
    const briefNotes = new Map<string, string | undefined>();
    for (const briefId of briefIds) {
      try {
        const [reviewers, brief] = await Promise.all([
          assignmentStore().listReviewers({ briefId }),
          assignmentStore().getBrief(briefId),
        ]);
        reviewerCounts.set(briefId, reviewers.length);
        if (brief) briefNotes.set(briefId, brief.note);
      } catch {
        // A missing lookup only costs a line of copy — never the row.
      }
    }

    return NextResponse.json(
      {
        assignments: assignments.map((a) => ({
          ...a,
          // The instruction to show: the brief's, or a legacy row's own.
          note: a.briefId && briefNotes.has(a.briefId) ? briefNotes.get(a.briefId) : a.note,
          reviewerCount: a.briefId ? (reviewerCounts.get(a.briefId) ?? null) : null,
        })),
        threads,
      },
      { headers: CORS },
    );
  } catch (e) {
    return withCors(apiError(e), "GET");
  }
}

// /api/bridge/assignments — the coach's assignment surface, as JSON.
//
// GET: the read model behind /m/assignments — everything they've assigned
//   (as the package's AssignmentView, THE one shared view) plus assignments
//   someone else owns where this coach is a named reviewer, plus the pickers'
//   data (roster, reviewer candidates) so the native screen is one request.
//
// POST: create — the lift of assignEntryAction (app/m/assign/actions.ts):
//   body { entryId, learnerIds: string[], note?, reviewerIds?: string[] } →
//   { briefId, created }. Same write order (brief → creator's reviewer row →
//   picked reviewers → per-learner rows), same roster/reviewer policy checks,
//   same copy-on-assign primitive.

import {
  buildAssignmentView,
  groupIntoAssignments,
  isLegacyKey,
  type AssignmentView,
} from "@bridge/assignments";
import { canAccessAdminArea } from "@bridge/nexus-client";
import type { AssignmentBrief, AssignmentReviewer, PlaySubmission } from "@bridge/sessions";
import { NextResponse, type NextRequest } from "next/server";

import { AccessError, apiError, requireContext } from "@/lib/api";
import { reconcileAssignments } from "@/lib/assignments";
import { audit } from "@/lib/audit";
import { corsHeaders, corsOptions, withCors } from "@/lib/cors";
import { bridgeLibrary, itemToEntry, libraryPrincipalOf } from "@/lib/libraryComponent";
import { getMyLearners, isBridgeCoach, nexusProgramIdOf, orgScopeOf } from "@/lib/nexus";
import { findReviewerCandidate, reviewerCandidates, selfReviewer } from "@/lib/reviewers";
import { assignmentStore, libraryStore, submissionStore } from "@/lib/sessions";

const CORS = corsHeaders("GET", "POST");

export const OPTIONS = corsOptions("GET", "POST");

export async function GET() {
  try {
    const context = await requireContext();

    const programId = (await nexusProgramIdOf()) ?? undefined;
    const scope = {
      programOrganizationId: orgScopeOf(context),
      ...(programId ? { nexusProgramId: programId } : {}),
    };
    const store = assignmentStore();
    const mine = await reconcileAssignments(
      await store.listAssignments({ ...scope, coachId: context.nexusUserId }),
    );

    // Everything the views need, in as few reads as possible — the same
    // assembly as /m/assignments, so the two can never disagree.
    const groups = groupIntoAssignments(mine);
    const sessionIds = [...new Set(mine.map((a) => a.sessionId).filter(Boolean) as string[])];
    const threads: PlaySubmission[] =
      sessionIds.length === 0
        ? []
        : await submissionStore().listSubmissions({ sessionIds }).catch(() => []);

    const briefs = new Map<string, AssignmentBrief>();
    const reviewers = new Map<string, AssignmentReviewer[]>();
    for (const key of groups.keys()) {
      if (isLegacyKey(key)) continue;
      try {
        const [brief, rows] = await Promise.all([
          store.getBrief(key),
          store.listReviewers({ briefId: key }),
        ]);
        if (brief) briefs.set(key, brief);
        reviewers.set(key, rows);
      } catch {
        // One unreadable assignment must not cost the payload.
      }
    }

    const viewerIsAdmin = canAccessAdminArea(context);
    const views = [...groups.entries()].map(([key, issues]) =>
      buildAssignmentView({
        key,
        brief: briefs.get(key) ?? null,
        issues,
        reviewers: reviewers.get(key) ?? [],
        threads,
        viewerId: context.nexusUserId,
        viewerIsAdmin,
      }),
    );

    // Assignments someone ELSE owns, where this coach is a named reviewer —
    // before any learner finishes, this is the only evidence they were named.
    const reviewingKeys = (
      await store.listReviewers({ reviewerId: context.nexusUserId }).catch(() => [])
    )
      .map((r) => r.briefId)
      .filter((key) => !groups.has(key));
    const reviewing: AssignmentView[] = [];
    for (const key of [...new Set(reviewingKeys)]) {
      try {
        const brief = await store.getBrief(key);
        if (!brief) continue;
        const issues = await reconcileAssignments(
          await store.listAssignments({ ...scope, briefId: key }),
        );
        const theirSessions = [
          ...new Set(issues.map((a) => a.sessionId).filter(Boolean) as string[]),
        ];
        const theirThreads =
          theirSessions.length === 0
            ? []
            : await submissionStore()
                .listSubmissions({ sessionIds: theirSessions })
                .catch(() => []);
        reviewing.push(
          buildAssignmentView({
            key,
            brief,
            issues,
            reviewers: await store.listReviewers({ briefId: key }),
            threads: theirThreads,
            viewerId: context.nexusUserId,
            viewerIsAdmin,
          }),
        );
      } catch {
        // Same posture as the page: one unreadable brief never costs the rest.
      }
    }

    const [roster, candidates] = await Promise.all([
      getMyLearners().catch(() => []),
      reviewerCandidates(context).catch(() => []),
    ]);

    return NextResponse.json(
      {
        views,
        reviewing,
        roster: roster.filter((l) => l.user_id),
        candidates,
      },
      { headers: CORS },
    );
  } catch (e) {
    return withCors(apiError(e), "GET");
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireContext();
    if (!isBridgeCoach(context)) throw new AccessError("Coach access required");

    const body = (await request.json().catch(() => ({}))) as {
      entryId?: string;
      learnerIds?: string[];
      note?: string;
      reviewerIds?: string[];
    };
    const entryId = String(body.entryId ?? "");
    const note = String(body.note ?? "").trim();
    const learnerIds = (body.learnerIds ?? []).map(String).filter(Boolean);
    if (learnerIds.length === 0) {
      return NextResponse.json(
        { error: "Pick at least one learner." },
        { status: 400, headers: CORS },
      );
    }

    const entry = await libraryStore().getEntry(entryId);
    if (!entry) {
      return NextResponse.json(
        { error: "That library entry no longer exists." },
        { status: 400, headers: CORS },
      );
    }

    // Assign only to people actually on this coach's roster (server-checked).
    const roster = await getMyLearners();
    const byId = new Map(
      roster.filter((l) => l.user_id).map((l) => [l.user_id as string, l]),
    );

    const { newId } = await import("@bridge/kb");
    const store = assignmentStore();
    const service = bridgeLibrary();
    const principal = await libraryPrincipalOf(context);
    const orgId = orgScopeOf(context);
    const programId = (await nexusProgramIdOf()) ?? undefined;
    const now = new Date().toISOString();

    // Every posted reviewer id is checked against the policy — never trusted
    // from the client. A free-typed id would let a coach mint themselves a
    // thread on a learner's play.
    const picked = (body.reviewerIds ?? []).map(String).filter(Boolean);
    const reviewers = [selfReviewer(context)];
    for (const id of picked) {
      if (id === context.nexusUserId) continue; // already the creator's row
      const candidate = await findReviewerCandidate(context, id);
      if (candidate) reviewers.push(candidate);
    }

    // The brief and its reviewers FIRST: if either fails, nothing is assigned,
    // rather than assigned to nobody's review.
    const briefId = newId("ab");
    await store.putBrief({
      briefId,
      programOrganizationId: orgId,
      nexusProgramId: programId,
      createdBy: context.nexusUserId,
      createdByName: context.displayName ?? undefined,
      title: entry.name,
      ...(note ? { note } : {}),
      contents: [
        { kind: "entry", entryId, entryKind: entry.kind, entryName: entry.name },
      ],
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    for (const r of reviewers) {
      await store.putReviewer({
        briefId,
        reviewerId: r.reviewerId,
        reviewerName: r.name,
        isCreator: r.reviewerId === context.nexusUserId,
        addedBy: context.nexusUserId,
        addedAt: now,
      });
    }

    let created = 0;
    for (const learnerId of learnerIds) {
      const learner = byId.get(learnerId);
      if (!learner) continue; // not on the roster — skip silently
      // Idempotent per BRIEF+learner (see assignEntryAction for why not
      // (coach, learner, source)).
      const existing = await store.listAssignments({ briefId, learnerId });
      if (existing.length > 0) continue;

      // Copy-on-assign (0022): the learner receives their OWN copy in their
      // instance, stamped with provenance; copyTo is idempotent per
      // (source, learner) and policy-checks the coach's access.
      const copy = itemToEntry(
        await service.copyTo(principal, entryId, {
          ownerId: learnerId,
          scopeLevel: "user",
          provenance: "assigned",
        }),
      );

      await store.putAssignment({
        assignmentId: newId("as"),
        programOrganizationId: orgId,
        nexusProgramId: programId,
        briefId,
        coachId: context.nexusUserId,
        coachName: context.displayName ?? undefined,
        learnerId,
        learnerName: learner.name ?? learner.email ?? undefined,
        entryId: copy.entryId,
        sourceEntryId: entryId,
        entryKind: entry.kind,
        entryName: entry.name,
        ...(note ? { note } : {}),
        status: "assigned",
        createdAt: now,
      });
      created++;
    }
    await audit(context, "assignment.brief.created", "assignment", briefId, {
      assigned: created,
      learners: learnerIds.length,
      reviewers: reviewers.length,
      sourceEntryId: entryId,
    });
    return NextResponse.json({ briefId, created }, { headers: CORS });
  } catch (e) {
    return withCors(apiError(e), "POST");
  }
}

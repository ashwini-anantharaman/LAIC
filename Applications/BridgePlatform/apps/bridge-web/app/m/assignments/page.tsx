import { redirect } from "next/navigation";
import { canAccessAdminArea } from "@bridge/nexus-client";
import {
  AssignmentCard,
  AssignmentSheet,
  SHEET_CSS,
  buildAssignmentView,
  groupIntoAssignments,
  isLegacyKey,
  type AssignmentActions,
  type AssignmentLinks,
  type AssignmentView,
  type PickablePerson,
} from "@bridge/assignments";
import type { AssignmentBrief, AssignmentReviewer, PlaySubmission } from "@bridge/sessions";
import { ReviewRow } from "@/components/mobile/ReviewRow";
import { reconcileAssignments } from "@/lib/assignments";
import { getBridgeContext, getMyLearners, nexusProgramIdOf, orgScopeOf } from "@/lib/nexus";
import { reviewerCandidates } from "@/lib/reviewers";
import { assignmentStore, submissionStore } from "@/lib/sessions";
import {
  addLearnerAction,
  addReviewerAction,
  adoptAssignmentAction,
  removeLearnerAction,
  removeReviewerAction,
  updateAssignmentNoteAction,
} from "./actions";

// BirdBridge typefaces (loaded in the /m layout).
const N = "var(--font-neco), var(--font-fraunces), serif";
const G = "var(--font-gs), var(--font-karla), sans-serif";
const CREAM = "#fff4d7";
const GREEN = "#105431";
const INK = "#1f1f1f";

/**
 * Mobile coach view: everything they've assigned, plus anything they were named
 * a reviewer on.
 *
 * This page FETCHES; @bridge/assignments decides what an assignment is and how it
 * looks. The split is deliberate — the stores, the request context and the server
 * actions can only live here, and everything else is reusable without them.
 */
export default async function MobileAssignmentsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{
    assigned?: string;
    /** Which assignment's editor sheet a mutation came back to — it carries the
     *  banner AND forces that sheet open, since a client-side redirect does not
     *  re-evaluate `:target`. Opening one otherwise is a pure fragment change. */
    edit?: string;
    added?: string;
    removed?: string;
    saved?: string;
    sent?: string;
    error?: string;
  }>;
}>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  const params = await searchParams;

  const programId = (await nexusProgramIdOf()) ?? undefined;
  const scope = {
    programOrganizationId: orgScopeOf(context),
    ...(programId ? { nexusProgramId: programId } : {}),
  };
  const store = assignmentStore();
  const mine = await reconcileAssignments(
    await store.listAssignments({ ...scope, coachId: context.nexusUserId }),
  );

  // Everything the views need, in as few reads as possible: one grouping, one
  // submissions query for every board on the page, and the brief + reviewers per
  // assignment (legacy groups have neither).
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
      // One unreadable assignment must not cost the page.
    }
  }

  const viewerIsAdmin = canAccessAdminArea(context);
  const viewFor = (key: string, issues: typeof mine): AssignmentView =>
    buildAssignmentView({
      key,
      brief: briefs.get(key) ?? null,
      issues,
      reviewers: reviewers.get(key) ?? [],
      threads,
      viewerId: context.nexusUserId,
      viewerIsAdmin,
    });
  const views = [...groups.entries()].map(([key, issues]) => viewFor(key, issues));

  // Assignments someone ELSE owns, where this coach is a named reviewer. Before
  // any learner finishes there is no submission, so /m/reviews shows nothing —
  // this section is the only evidence they were named.
  const reviewingKeys = (
    await store.listReviewers({ reviewerId: context.nexusUserId }).catch(() => [])
  )
    .map((r) => r.briefId)
    .filter((key) => !groups.has(key));
  const reviewingViews: AssignmentView[] = [];
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
      reviewingViews.push(
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
      // Same rule: one unreadable brief costs its card, not the section.
    }
  }

  // The pickers' people, fetched ONCE for the page and shared by every sheet.
  // Both come from Nexus, whose per-request verification makes each call ~1s, so
  // they are cached on a short TTL (lib/nexus.ts) — the list pays one round trip
  // a minute and opening a sheet pays nothing.
  const canEditAny = views.some((v) => v.canEdit);
  const [roster, candidates] = canEditAny
    ? await Promise.all([getMyLearners().catch(() => []), reviewerCandidates(context).catch(() => [])])
    : [[], []];
  const rosterPeople: PickablePerson[] = roster
    .filter((l) => l.user_id)
    .map((l) => ({ id: l.user_id as string, name: l.name ?? l.email ?? "Learner" }));
  const reviewerPeople: PickablePerson[] = candidates.map((c) => ({
    id: c.reviewerId,
    name: c.name,
    ...(c.detail ? { detail: c.detail } : {}),
  }));

  // The host fills the package's ports: its server actions and its routes.
  const actions: AssignmentActions = {
    adopt: adoptAssignmentAction,
    saveNote: updateAssignmentNoteAction,
    addLearner: addLearnerAction,
    removeLearner: removeLearnerAction,
    addReviewer: addReviewerAction,
    removeReviewer: removeReviewerAction,
  };
  const links: AssignmentLinks = {
    list: "/m/assignments",
    thread: (id) => `/m/review/${id}`,
    board: (entryId) => `/m/play-entry/${encodeURIComponent(entryId)}`,
  };
  const flashKey = typeof params.edit === "string" ? params.edit : null;

  return (
    <main
      style={{
        height: "100%",
        overflowY: "auto",
        background: CREAM,
        padding: "56px 18px calc(96px + env(safe-area-inset-bottom))",
      }}
    >
      {/* The editor sheets are shown and hidden purely by :target — no client
          JavaScript, and therefore no request when one opens. */}
      <style dangerouslySetInnerHTML={{ __html: SHEET_CSS }} />

      <p
        style={{
          font: `600 10px ${G}`,
          letterSpacing: ".28em",
          textTransform: "uppercase",
          color: "#a49d8e",
          margin: 0,
        }}
      >
        Bridge Platform
      </p>
      <h1 style={{ font: `700 26px ${N}`, color: INK, margin: "6px 0 0" }}>Assignments</h1>
      <p style={{ font: `400 13px/1.55 ${G}`, color: "#5e5749", margin: "10px 0 0" }}>
        {views.length === 0 && reviewingViews.length > 0
          ? "Boards other coaches asked you to help review."
          : "Boards you've delegated, and how far each learner has got."}
      </p>

      {params.assigned && (
        <p
          style={{
            font: `500 13px ${G}`,
            background: GREEN,
            color: CREAM,
            borderRadius: 12,
            padding: "10px 14px",
            margin: "14px 0 0",
          }}
        >
          Assigned to {params.assigned} learner{params.assigned === "1" ? "" : "s"}.
        </p>
      )}

      {views.length === 0 && reviewingViews.length === 0 && (
        <p
          style={{
            border: "1px dashed #d3ccbb",
            borderRadius: 12,
            padding: 16,
            textAlign: "center",
            font: `400 12.5px ${G}`,
            color: "#a49d8e",
            marginTop: 18,
          }}
        >
          Nothing assigned yet — use “Create Assignment” on the Coach tab.
        </p>
      )}

      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 13 }}>
        {views.map((view, i) => (
          <AssignmentCard
            key={view.key}
            view={view}
            index={i}
            threadHref={links.thread}
          />
        ))}
      </div>

      {reviewingViews.length > 0 && (
        <>
          <p
            style={{
              font: `600 10px ${G}`,
              letterSpacing: ".22em",
              textTransform: "uppercase",
              color: "#a49d8e",
              margin: "30px 0 0",
            }}
          >
            Reviewing for others
          </p>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 13 }}>
            {reviewingViews.map((view, i) => (
              <AssignmentCard
                key={view.key}
                view={view}
                index={i}
                variant="reviewing"
                threadHref={links.thread}
              />
            ))}
          </div>
        </>
      )}

      {/* One editor per assignment, rendered WITH the list and hidden by CSS, so
          the pencil opens it with no request. Last in the document so it stacks
          above everything without a z-index race. */}
      {views.map((view) => (
        <AssignmentSheet
          key={`sheet-${view.key}`}
          view={view}
          actions={actions}
          links={links}
          addableLearners={rosterPeople.filter(
            (p) => !view.learners.some((l) => l.learnerId === p.id),
          )}
          addableReviewers={reviewerPeople.filter(
            (p) => !view.reviewers.some((r) => r.reviewerId === p.id),
          )}
          {...(flashKey === view.key ? { flash: params } : {})}
          renderThread={(sub) => <ReviewRow sub={sub} />}
        />
      ))}
    </main>
  );
}

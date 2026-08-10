import Link from "next/link";
import { redirect } from "next/navigation";
import type { PlaySubmission } from "@bridge/sessions";
import { ReviewRows } from "@/components/mobile/ReviewRow";
import { reconcileAssignments } from "@/lib/assignments";
import { getBridgeContext, nexusProgramIdOf, orgScopeOf } from "@/lib/nexus";
import { assignmentStore, submissionStore } from "@/lib/sessions";
import { startAssignmentAction } from "./actions";

// BirdBridge typefaces (loaded in the /m layout): Neco for display, General
// Sans for body — with the older mobile faces as fallbacks.
const N = "var(--font-neco), var(--font-fraunces), serif";
const G = "var(--font-gs), var(--font-karla), sans-serif";

// The app's palette (bridge-coach-app/constants/theme.ts).
const CREAM = "#fff4d7";
const MAROON = "#541015";
const GREEN = "#105431";
const INK = "#1f1f1f";
const MAROON_EDGE = "#2a0506";
const GREEN_EDGE = "#052a20";

const SECTIONS = [
  { status: "assigned", label: "To play", button: "Start" },
  { status: "started", label: "In progress", button: "Continue" },
  { status: "completed", label: "Done", button: null },
] as const;

/** Mobile "Assigned to me" — boards the learner's coach delegated (Phase 3). */
export default async function MobileAssignedPage() {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");

  const programId = (await nexusProgramIdOf()) ?? undefined;
  const raw = await assignmentStore().listAssignments({
    programOrganizationId: orgScopeOf(context),
    ...(programId ? { nexusProgramId: programId } : {}),
    learnerId: context.nexusUserId,
  });
  const assignments = await reconcileAssignments(raw);

  // Done boards open their feedback. A finished board now carries one thread per
  // REVIEWER (0028), so this lists them ALL, named — it used to pick whichever
  // submission came back first, which with two reviewers opened an arbitrary
  // coach's thread and, because the comment action authorizes on the posted
  // submission id, let the learner's reply land on the wrong person.
  //
  // One query, not one per assignment: every thread on every board this learner
  // owns, grouped by session.
  const mySubs = await submissionStore()
    .listSubmissions({
      programOrganizationId: orgScopeOf(context),
      ...(programId ? { nexusProgramId: programId } : {}),
      learnerId: context.nexusUserId,
    })
    .catch(() => [] as PlaySubmission[]);
  const threadsBySession = new Map<string, PlaySubmission[]>();
  for (const sub of mySubs) {
    const list = threadsBySession.get(sub.sessionId) ?? [];
    list.push(sub);
    threadsBySession.set(sub.sessionId, list);
  }
  const threadsFor = (sessionId?: string): PlaySubmission[] =>
    sessionId ? (threadsBySession.get(sessionId) ?? []) : [];

  // Per BRIEF (not per assignment, and not at all for pre-0028 rows): how many
  // coaches will review it, and the coach's instruction.
  //
  // THE INSTRUCTION COMES FROM THE BRIEF, which is its only home. It used to be
  // copied onto every learner's row on each save so this page could render
  // `a.note` — two writable copies of one sentence, with nothing keeping them
  // equal. The row's `note` is now legacy-only: still read for assignments made
  // before briefs existed, never written again.
  const briefIds = [...new Set(assignments.map((a) => a.briefId).filter(Boolean))] as string[];
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
      // A missing lookup only costs a line of copy — never the card.
    }
  }
  /** The instruction to show: the brief's, or a legacy row's own. */
  const noteFor = (a: (typeof assignments)[number]): string | undefined =>
    a.briefId && briefNotes.has(a.briefId) ? briefNotes.get(a.briefId) : a.note;

  return (
    <main
      style={{
        height: "100%",
        overflowY: "auto",
        background: CREAM,
        padding: "56px 18px calc(96px + env(safe-area-inset-bottom))",
      }}
    >
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
      <h1 style={{ font: `700 26px ${N}`, color: INK, margin: "6px 0 0" }}>
        Assignments
      </h1>
      <p style={{ font: `400 13px/1.55 ${G}`, color: "#5e5749", margin: "10px 0 0" }}>
        Boards your coach asked you to play.
      </p>

      {assignments.length === 0 && (
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
          Nothing assigned yet — when your coach delegates a board, it lands
          here.
        </p>
      )}

      {SECTIONS.map((section) => {
        const items = assignments.filter((a) => a.status === section.status);
        if (items.length === 0) return null;
        return (
          <section key={section.status} style={{ marginTop: 22 }}>
            <p
              style={{
                font: `600 10.5px ${G}`,
                letterSpacing: ".18em",
                textTransform: "uppercase",
                color: "#a49d8e",
                margin: "0 0 9px",
              }}
            >
              {section.label}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              {items.map((a, i) => {
                // The app deals its list rows in alternating suits — maroon,
                // green — each sitting on its darker stacked edge.
                const suit = i % 2 === 0 ? MAROON : GREEN;
                const edge = i % 2 === 0 ? MAROON_EDGE : GREEN_EDGE;
                const threads = threadsFor(a.sessionId);
                const reviewerCount = a.briefId ? (reviewerCounts.get(a.briefId) ?? 0) : 1;
                return (
                  <div
                    key={a.assignmentId}
                    style={{
                      background: suit,
                      borderRadius: 16,
                      boxShadow: `0 3px 0 ${edge}`,
                      padding: "15px 16px",
                    }}
                  >
                    {/* Top row keeps its shape — Start/Continue on the right —
                        so To play and In progress look untouched. The review
                        rows below only appear once a board is finished. */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ font: `500 16px ${N}`, color: "#ffffff", margin: 0 }}>
                          {a.entryName}
                        </p>
                        <p
                          style={{
                            font: `400 12px ${G}`,
                            color: "rgba(255,244,215,0.72)",
                            margin: "3px 0 0",
                          }}
                        >
                          from {a.coachName ?? "your coach"} · {a.createdAt.slice(0, 10)}
                          {a.status === "completed" && " · completed ✓"}
                          {/* Only when there's more than one, and never once
                              finished — the named rows below then say who
                              concretely, and a future-tense promise above a
                              list of delivered threads reads as a bug. */}
                          {a.status !== "completed" &&
                            reviewerCount > 1 &&
                            ` · ${reviewerCount} coaches will review`}
                        </p>
                        {noteFor(a) && (
                          <p
                            style={{
                              font: `400 12.5px/1.5 ${G}`,
                              color: "rgba(255,244,215,0.85)",
                              margin: "6px 0 0",
                            }}
                          >
                            “{noteFor(a)}”
                          </p>
                        )}
                      </div>
                      {/* No thread yet (a completion from before auto-submit):
                          the finished table itself, so a done board is never a
                          dead end. */}
                      {a.status === "completed" && threads.length === 0 && a.sessionId && (
                        <Link
                          href={`/m/table/${a.sessionId}?from=assigned`}
                          style={{
                            flex: "none",
                            border: "2px solid rgba(255,244,215,0.8)",
                            background: "transparent",
                            color: CREAM,
                            borderRadius: 999,
                            padding: "7px 15px",
                            font: `600 12.5px ${G}`,
                            textDecoration: "none",
                          }}
                        >
                          View
                        </Link>
                      )}
                      {section.button && (
                        <form action={startAssignmentAction}>
                          <input type="hidden" name="assignmentId" value={a.assignmentId} />
                          <button
                            type="submit"
                            style={{
                              flex: "none",
                              border: "none",
                              background: CREAM,
                              color: INK,
                              borderRadius: 999,
                              padding: "9px 16px",
                              font: `600 12.5px ${G}`,
                              cursor: "pointer",
                            }}
                          >
                            {section.button}
                          </button>
                        </form>
                      )}
                    </div>
                    {/* One row per reviewer, each naming whose feedback it is. */}
                    <ReviewRows subs={threads} />
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </main>
  );
}

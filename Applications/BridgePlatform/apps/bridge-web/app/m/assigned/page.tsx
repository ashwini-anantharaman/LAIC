import Link from "next/link";
import { redirect } from "next/navigation";
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

  // Done boards open their play for review: completion auto-submits, so each
  // completed assignment's session normally has a submission (deal + tricks
  // + the coach's comment thread). Map sessionId → submissionId for links.
  const reviewLink = new Map<string, string>();
  for (const a of assignments) {
    if (a.status !== "completed" || !a.sessionId) continue;
    try {
      const subs = await submissionStore().listSubmissions({ sessionId: a.sessionId });
      const mine = subs.find((s) => s.learnerId === context.nexusUserId);
      // Pre-auto-submit completions have no submission: open the finished
      // table itself instead, so the board is never a dead end.
      reviewLink.set(
        a.assignmentId,
        mine ? `/m/review/${mine.submissionId}` : `/m/table/${a.sessionId}?from=assigned`,
      );
    } catch {
      reviewLink.set(a.assignmentId, `/m/table/${a.sessionId}?from=assigned`);
    }
  }

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
                return (
                  <div
                    key={a.assignmentId}
                    style={{
                      background: suit,
                      borderRadius: 16,
                      boxShadow: `0 3px 0 ${edge}`,
                      padding: "15px 16px",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
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
                      </p>
                      {a.note && (
                        <p
                          style={{
                            font: `400 12.5px/1.5 ${G}`,
                            color: "rgba(255,244,215,0.85)",
                            margin: "6px 0 0",
                          }}
                        >
                          “{a.note}”
                        </p>
                      )}
                    </div>
                    {a.status === "completed" && reviewLink.has(a.assignmentId) && (
                      <Link
                        href={reviewLink.get(a.assignmentId)!}
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
                );
              })}
            </div>
          </section>
        );
      })}
    </main>
  );
}

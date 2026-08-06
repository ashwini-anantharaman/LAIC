import Link from "next/link";
import { redirect } from "next/navigation";
import { reconcileAssignments } from "@/lib/assignments";
import { getBridgeContext, nexusProgramIdOf, orgScopeOf } from "@/lib/nexus";
import { assignmentStore, submissionStore } from "@/lib/sessions";
import { startAssignmentAction } from "./actions";

const F = "var(--font-fraunces), serif";
const K = "var(--font-karla), sans-serif";

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
        background: "#fff4d7",
        padding: "56px 18px calc(96px + env(safe-area-inset-bottom))",
      }}
    >
      <p
        style={{
          font: `600 10px ${K}`,
          letterSpacing: ".28em",
          textTransform: "uppercase",
          color: "#a49d8e",
          margin: 0,
        }}
      >
        Bridge Platform
      </p>
      <h1 style={{ font: `500 27px ${F}`, color: "#1d1a15", margin: "6px 0 0" }}>
        Assignments
      </h1>
      <p style={{ font: `400 13px/1.55 ${K}`, color: "#5e5749", margin: "10px 0 0" }}>
        Boards your coach asked you to play.
      </p>

      {assignments.length === 0 && (
        <p style={{ font: `400 13px/1.55 ${K}`, color: "#a49d8e", marginTop: 18 }}>
          Nothing assigned yet — when your coach delegates a board, it lands
          here.
        </p>
      )}

      {SECTIONS.map((section) => {
        const items = assignments.filter((a) => a.status === section.status);
        if (items.length === 0) return null;
        return (
          <section key={section.status} style={{ marginTop: 20 }}>
            <p
              style={{
                font: `600 10.5px ${K}`,
                letterSpacing: ".18em",
                textTransform: "uppercase",
                color: "#a49d8e",
                margin: "0 0 8px",
              }}
            >
              {section.label}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {items.map((a) => (
                <div
                  key={a.assignmentId}
                  style={{
                    background: "#fff",
                    border: "1px solid #ece7db",
                    borderRadius: 14,
                    padding: "13px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ font: `600 14.5px ${K}`, color: "#1d1a15", margin: 0 }}>
                      {a.entryName}
                    </p>
                    <p style={{ font: `400 12px ${K}`, color: "#a49d8e", margin: "3px 0 0" }}>
                      from {a.coachName ?? "your coach"} · {a.createdAt.slice(0, 10)}
                      {a.status === "completed" && " · completed ✓"}
                    </p>
                    {a.note && (
                      <p style={{ font: `400 12.5px/1.5 ${K}`, color: "#5e5749", margin: "6px 0 0" }}>
                        “{a.note}”
                      </p>
                    )}
                  </div>
                  {a.status === "completed" && reviewLink.has(a.assignmentId) && (
                    <Link
                      href={reviewLink.get(a.assignmentId)!}
                      style={{
                        flex: "none",
                        border: "1px solid #105431",
                        background: "#fff",
                        color: "#105431",
                        borderRadius: 999,
                        padding: "8px 16px",
                        font: `600 12.5px ${K}`,
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
                          background: "#105431",
                          color: "#fff",
                          borderRadius: 999,
                          padding: "8px 16px",
                          font: `600 12.5px ${K}`,
                          cursor: "pointer",
                        }}
                      >
                        {section.button}
                      </button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}

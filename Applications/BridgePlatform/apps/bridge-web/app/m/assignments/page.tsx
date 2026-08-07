import Link from "next/link";
import { redirect } from "next/navigation";
import type { Assignment } from "@bridge/sessions";
import { reconcileAssignments } from "@/lib/assignments";
import { getBridgeContext, nexusProgramIdOf, orgScopeOf } from "@/lib/nexus";
import { assignmentStore, submissionStore } from "@/lib/sessions";

// BirdBridge typefaces (loaded in the /m layout): Neco for display, General
// Sans for body — with the older mobile faces as fallbacks. Restyled to the
// app's deck 2026-08-07; /m/plays is the reference for this look.
const N = "var(--font-neco), var(--font-fraunces), serif";
const G = "var(--font-gs), var(--font-karla), sans-serif";

// The app's palette (bridge-coach-app/constants/theme.ts).
const CREAM = "#fff4d7";
const MAROON = "#541015";
const GREEN = "#105431";
const INK = "#1f1f1f";
const MAROON_EDGE = "#2a0506";
const GREEN_EDGE = "#052a20";

/** Status chips sit INSIDE a dark suit card, so they wear the app's cream:
 *  filled cream for a done state, outlined cream while things are pending —
 *  the same pair /m/plays uses for "Feedback ready" / "Awaiting review". */
const STATUS_CHIP: Record<Assignment["status"], { label: string; filled: boolean; fg: string }> = {
  assigned: { label: "not started", filled: false, fg: "rgba(255,244,215,0.85)" },
  started: { label: "in progress", filled: false, fg: CREAM },
  completed: { label: "completed ✓", filled: true, fg: GREEN },
};

/** Mobile coach view: everything they've assigned, grouped by board (Phase 3). */
export default async function MobileAssignmentsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ assigned?: string }> }>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  const params = await searchParams;

  const programId = (await nexusProgramIdOf()) ?? undefined;
  const raw = await assignmentStore().listAssignments({
    programOrganizationId: orgScopeOf(context),
    ...(programId ? { nexusProgramId: programId } : {}),
    coachId: context.nexusUserId,
  });
  const assignments = await reconcileAssignments(raw);

  // Each learner has their OWN feedback pipeline: their copy, their session,
  // their submission, their comment thread. Map each completed assignment to
  // that learner's submission so the coach can open the right thread.
  const threadLink = new Map<string, string>();
  for (const a of assignments) {
    if (!a.sessionId || a.status === "assigned") continue;
    try {
      const subs = await submissionStore().listSubmissions({ sessionId: a.sessionId });
      const theirs = subs.find(
        (s) => s.learnerId === a.learnerId && s.coachId === context.nexusUserId,
      );
      if (theirs) threadLink.set(a.assignmentId, `/m/review/${theirs.submissionId}`);
    } catch {
      // No submission yet — the row just shows status.
    }
  }

  // Each learner plays their own COPY (0022) — group by the coach's source.
  const byEntry = new Map<string, Assignment[]>();
  for (const a of assignments) {
    const key = a.sourceEntryId ?? a.entryId;
    const list = byEntry.get(key) ?? [];
    list.push(a);
    byEntry.set(key, list);
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
        Boards you've delegated, and how far each learner has got.
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
          Nothing assigned yet — use “Create Assignment” on the Coach tab.
        </p>
      )}

      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 13 }}>
        {[...byEntry.values()].map((group, i) => {
          // The app deals its list rows in alternating suits — maroon, green —
          // each on its darker stacked edge.
          const suit = i % 2 === 0 ? MAROON : GREEN;
          const edge = i % 2 === 0 ? MAROON_EDGE : GREEN_EDGE;
          return (
            <section
              key={group[0]!.sourceEntryId ?? group[0]!.entryId}
              style={{
                background: suit,
                borderRadius: 16,
                boxShadow: `0 3px 0 ${edge}`,
                padding: "15px 16px",
              }}
            >
              <p style={{ font: `500 17px ${N}`, color: "#ffffff", margin: 0 }}>
                {group[0]!.entryName}
              </p>
              {group[0]!.note && (
                <p
                  style={{
                    font: `400 12.5px/1.5 ${G}`,
                    color: "rgba(255,244,215,0.72)",
                    margin: "4px 0 0",
                  }}
                >
                  “{group[0]!.note}”
                </p>
              )}
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                {group.map((a) => {
                  const chip = STATUS_CHIP[a.status];
                  const href = threadLink.get(a.assignmentId);
                  const row = (
                    <>
                      <span style={{ font: `600 13px ${G}`, color: "#ffffff", flex: 1, minWidth: 0 }}>
                        {a.learnerName ?? "Learner"}
                      </span>
                      <span
                        style={{
                          font: `600 11px ${G}`,
                          padding: "3px 10px",
                          borderRadius: 999,
                          background: chip.filled ? CREAM : "transparent",
                          border: chip.filled
                            ? "1px solid transparent"
                            : "1px solid rgba(255,244,215,0.55)",
                          color: chip.fg,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {chip.label}
                      </span>
                      {href && (
                        <span aria-hidden style={{ color: "rgba(255,244,215,0.75)", fontSize: 13 }}>
                          ›
                        </span>
                      )}
                    </>
                  );
                  // A learner's row opens THEIR thread — each learner's play
                  // and feedback stay separate even for the same board. Rows
                  // sit on the darker inset the app gives rows on dark cards.
                  return href ? (
                    <Link
                      key={a.assignmentId}
                      href={href}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        textDecoration: "none",
                        borderRadius: 12,
                        padding: "9px 12px",
                        background: "rgba(0,0,0,0.22)",
                      }}
                    >
                      {row}
                    </Link>
                  ) : (
                    <div
                      key={a.assignmentId}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        borderRadius: 12,
                        padding: "9px 12px",
                        background: "rgba(0,0,0,0.22)",
                      }}
                    >
                      {row}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}

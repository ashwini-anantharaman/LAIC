import Link from "next/link";
import { redirect } from "next/navigation";
import type { Assignment } from "@bridge/sessions";
import { reconcileAssignments } from "@/lib/assignments";
import { getBridgeContext, nexusProgramIdOf, orgScopeOf } from "@/lib/nexus";
import { assignmentStore, submissionStore } from "@/lib/sessions";

const F = "var(--font-fraunces), serif";
const K = "var(--font-karla), sans-serif";

const STATUS_CHIP: Record<Assignment["status"], { label: string; bg: string; fg: string }> = {
  assigned: { label: "not started", bg: "#f1ede3", fg: "#5e5749" },
  started: { label: "in progress", bg: "#fdf3df", fg: "#8a6116" },
  completed: { label: "completed ✓", bg: "#e8f4ec", fg: "#1c5c34" },
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
        background: "#faf8f2",
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
        Boards you've delegated, and how far each learner has got. Assign more
        from the Library.
      </p>

      {params.assigned && (
        <p
          style={{
            font: `500 13px ${K}`,
            background: "#e8f4ec",
            color: "#1c5c34",
            borderRadius: 10,
            padding: "10px 12px",
            margin: "14px 0 0",
          }}
        >
          Assigned to {params.assigned} learner{params.assigned === "1" ? "" : "s"}.
        </p>
      )}

      {assignments.length === 0 && (
        <p style={{ font: `400 13px/1.55 ${K}`, color: "#a49d8e", marginTop: 18 }}>
          Nothing assigned yet — open the Library and use “Assign” on a board.
        </p>
      )}

      {[...byEntry.values()].map((group) => (
        <section
          key={group[0]!.sourceEntryId ?? group[0]!.entryId}
          style={{
            background: "#fff",
            border: "1px solid #ece7db",
            borderRadius: 14,
            padding: "13px 16px",
            marginTop: 14,
          }}
        >
          <p style={{ font: `600 14.5px ${K}`, color: "#1d1a15", margin: 0 }}>
            {group[0]!.entryName}
          </p>
          {group[0]!.note && (
            <p style={{ font: `400 12.5px/1.5 ${K}`, color: "#5e5749", margin: "4px 0 0" }}>
              “{group[0]!.note}”
            </p>
          )}
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {group.map((a) => {
              const chip = STATUS_CHIP[a.status];
              const href = threadLink.get(a.assignmentId);
              const row = (
                <>
                  <span style={{ font: `500 13px ${K}`, color: "#1d1a15", flex: 1 }}>
                    {a.learnerName ?? "Learner"}
                  </span>
                  <span
                    style={{
                      font: `600 11px ${K}`,
                      background: chip.bg,
                      color: chip.fg,
                      borderRadius: 999,
                      padding: "4px 10px",
                    }}
                  >
                    {chip.label}
                  </span>
                  {href && (
                    <span style={{ font: `600 12px ${K}`, color: "#205e63" }}>Review ›</span>
                  )}
                </>
              );
              // A learner's row opens THEIR thread — each learner's play and
              // feedback stay separate even for the same assigned board.
              return href ? (
                <Link
                  key={a.assignmentId}
                  href={href}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    textDecoration: "none",
                    margin: "0 -8px",
                    padding: "6px 8px",
                    borderRadius: 8,
                    background: "#f8f5ec",
                  }}
                >
                  {row}
                </Link>
              ) : (
                <div
                  key={a.assignmentId}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}
                >
                  {row}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </main>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import type { Assignment } from "@bridge/sessions";
import { reconcileAssignments } from "@/lib/assignments";
import { getBridgeContext, getMyLearners, isBridgeCoach, nexusProgramIdOf, orgScopeOf } from "@/lib/nexus";
import { assignmentStore, submissionStore } from "@/lib/sessions";

const F = "var(--font-fraunces), serif";
const K = "var(--font-karla), sans-serif";

/** Coach view of ONE learner: who they are to you, how they're progressing,
 *  and every feedback thread between you — the "coaching hub" made personal.
 *  Coaches see only their own roster (server-checked); admins see anyone. */
export default async function LearnerProfilePage({
  params,
}: Readonly<{ params: Promise<{ learnerId: string }> }>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  if (!isBridgeCoach(context)) redirect("/m/home");
  const { learnerId } = await params;

  // Roster membership is the access rule: this learner must be YOURS
  // (admins get the whole program back from the same endpoint).
  const roster = await getMyLearners();
  const learner = roster.find((l) => l.user_id === learnerId);
  if (!learner) redirect("/m/assignments");

  const orgId = orgScopeOf(context);
  const programId = (await nexusProgramIdOf()) ?? undefined;
  const scope = {
    programOrganizationId: orgId,
    ...(programId ? { nexusProgramId: programId } : {}),
  };

  const [rawAssignments, allSubs] = await Promise.all([
    assignmentStore().listAssignments({ ...scope, learnerId }),
    submissionStore().listSubmissions({ ...scope, learnerId }),
  ]);
  // Coaches see their own coaching relationship; admins see everything.
  const mine = <T extends { coachId: string }>(rows: T[]) =>
    context.is_admin ? rows : rows.filter((r) => r.coachId === context.nexusUserId);
  const assignments = mine(await reconcileAssignments(rawAssignments)).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const submissions = mine(allSubs).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const completed = assignments.filter((a) => a.status === "completed").length;
  const reviewed = submissions.filter((s) => s.status === "reviewed").length;
  const awaiting = submissions.filter((s) => s.status === "submitted").length;

  const name = learner.name ?? learner.email ?? "Learner";

  const CHIP: Record<Assignment["status"], { label: string; bg: string; fg: string }> = {
    assigned: { label: "not started", bg: "#f1ede3", fg: "#5e5749" },
    started: { label: "in progress", bg: "#fdf3df", fg: "#8a6116" },
    completed: { label: "completed ✓", bg: "#e8f4ec", fg: "#1c5c34" },
  };

  const stat = (value: string | number, label: string) => (
    <div style={{ flex: 1, minWidth: 90 }}>
      <p style={{ font: `500 22px ${F}`, color: "#1d1a15", margin: 0 }}>{value}</p>
      <p style={{ font: `600 10px ${K}`, letterSpacing: ".14em", textTransform: "uppercase", color: "#a49d8e", margin: "2px 0 0" }}>
        {label}
      </p>
    </div>
  );

  return (
    <main
      style={{
        height: "100%",
        overflowY: "auto",
        background: "#faf8f2",
        padding: "48px 18px calc(96px + env(safe-area-inset-bottom))",
      }}
    >
      <Link
        href="/m/assignments"
        style={{
          display: "inline-block",
          font: `600 13px ${K}`,
          color: "#205e63",
          textDecoration: "none",
          marginBottom: 10,
        }}
      >
        ‹ Assignments
      </Link>
      <p style={{ font: `600 10px ${K}`, letterSpacing: ".28em", textTransform: "uppercase", color: "#a49d8e", margin: 0 }}>
        Learner
      </p>
      <h1 style={{ font: `500 27px ${F}`, color: "#1d1a15", margin: "6px 0 0" }}>{name}</h1>
      {learner.email && (
        <p style={{ font: `400 12px ${K}`, color: "#a49d8e", margin: "3px 0 0" }}>{learner.email}</p>
      )}

      {/* The instrument panel */}
      <div
        style={{
          display: "flex",
          gap: 14,
          flexWrap: "wrap",
          background: "#fff",
          border: "1px solid #ece7db",
          borderRadius: 14,
          padding: "14px 16px",
          marginTop: 16,
        }}
      >
        {stat(`${completed}/${assignments.length}`, "assignments done")}
        {stat(reviewed, "plays reviewed")}
        {stat(awaiting, "awaiting review")}
      </div>

      {/* Feedback threads — every submission is its own pipeline */}
      <p style={{ font: `600 10.5px ${K}`, letterSpacing: ".18em", textTransform: "uppercase", color: "#a49d8e", margin: "22px 0 8px" }}>
        Feedback threads
      </p>
      {submissions.length === 0 ? (
        <p style={{ font: `400 13px/1.55 ${K}`, color: "#a49d8e" }}>
          Nothing submitted yet — completed assignments arrive here automatically.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {submissions.map((s) => (
            <Link
              key={s.submissionId}
              href={`/m/review/${s.submissionId}`}
              style={{
                background: "#fff",
                border: "1px solid #ece7db",
                borderRadius: 12,
                padding: "12px 14px",
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ font: `600 13.5px ${K}`, color: "#1d1a15", margin: 0 }}>
                  {s.board.name}
                </p>
                <p style={{ font: `400 11.5px ${K}`, color: "#a49d8e", margin: "3px 0 0" }}>
                  {s.createdAt.slice(0, 10)}
                  {s.board.contractLabel && ` · ${s.board.contractLabel}`}
                </p>
              </div>
              <span
                style={{
                  font: `600 11px ${K}`,
                  background: s.status === "reviewed" ? "#e8f4ec" : "#fdf3df",
                  color: s.status === "reviewed" ? "#1c5c34" : "#8a6116",
                  borderRadius: 999,
                  padding: "4px 10px",
                }}
              >
                {s.status === "reviewed" ? "reviewed" : "awaiting review"}
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* Assignment history */}
      <p style={{ font: `600 10.5px ${K}`, letterSpacing: ".18em", textTransform: "uppercase", color: "#a49d8e", margin: "22px 0 8px" }}>
        Assignment history
      </p>
      {assignments.length === 0 ? (
        <p style={{ font: `400 13px/1.55 ${K}`, color: "#a49d8e" }}>
          Nothing assigned yet — use “Assign” on a board in your Library.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {assignments.map((a) => {
            const chip = CHIP[a.status];
            return (
              <div
                key={a.assignmentId}
                style={{
                  background: "#fff",
                  border: "1px solid #ece7db",
                  borderRadius: 12,
                  padding: "12px 14px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ font: `600 13.5px ${K}`, color: "#1d1a15", margin: 0 }}>
                    {a.entryName}
                  </p>
                  <p style={{ font: `400 11.5px ${K}`, color: "#a49d8e", margin: "3px 0 0" }}>
                    assigned {a.createdAt.slice(0, 10)}
                    {a.completedAt && ` · finished ${a.completedAt.slice(0, 10)}`}
                  </p>
                </div>
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
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

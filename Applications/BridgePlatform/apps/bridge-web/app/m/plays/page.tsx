import Link from "next/link";
import { redirect } from "next/navigation";
import { getBridgeContext, getMyCoach, nexusProgramIdOf, orgScopeOf } from "@/lib/nexus";
import { sessionService, submissionStore } from "@/lib/sessions";
import { sendPlayToCoachAction } from "./actions";

const F = "var(--font-fraunces), serif";
const K = "var(--font-karla), sans-serif";

/** Mobile "My games" — the learner's played boards (session history; the
 *  library's "Plays" shelf is saved snapshots, a different thing). Each can
 *  be reviewed
 *  (view the final table) and sent to the hired coach for feedback (Phase 2). */
export default async function MobilePlaysPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ sent?: string; error?: string }> }>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  const params = await searchParams;

  const programId = (await nexusProgramIdOf()) ?? undefined;
  const scope = {
    programOrganizationId: orgScopeOf(context),
    ...(programId ? { nexusProgramId: programId } : {}),
  };
  const [mine, submissions, coach] = await Promise.all([
    sessionService().listRecent({ ...scope, createdBy: context.nexusUserId }),
    submissionStore().listSubmissions({ ...scope, learnerId: context.nexusUserId }),
    getMyCoach(),
  ]);
  const completed = mine.filter((s) => s.status === "completed");
  const bySession = new Map(submissions.map((s) => [s.sessionId, s]));

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
        My games
      </h1>
      <p style={{ font: `400 13px/1.55 ${K}`, color: "#5e5749", margin: "10px 0 0" }}>
        Boards you've finished.{" "}
        {coach
          ? `Send one to ${coach.name} for feedback.`
          : "Hire a coach in the app to send plays for feedback."}
      </p>

      {params.sent && (
        <p style={banner("#e8f4ec", "#1c5c34")}>Sent — your coach will take a look.</p>
      )}
      {params.error && <p style={banner("#fbeaea", "#8c2f2f")}>{params.error}</p>}

      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        {completed.length === 0 && (
          <p style={{ font: `400 13px/1.55 ${K}`, color: "#a49d8e" }}>
            Nothing here yet — finish a board at the table and it appears here.
          </p>
        )}
        {completed.map((s) => {
          const sub = bySession.get(s.sessionId);
          return (
            <div
              key={s.sessionId}
              style={{
                background: "#fff",
                border: "1px solid #ece7db",
                borderRadius: 14,
                padding: "14px 16px",
              }}
            >
              <p style={{ font: `600 15px ${K}`, color: "#1d1a15", margin: 0 }}>
                {s.board.name}
              </p>
              <p style={{ font: `400 12px ${K}`, color: "#a49d8e", margin: "3px 0 10px" }}>
                completed {s.updatedAt.slice(0, 10)}
                {sub && ` · ${sub.status === "reviewed" ? "reviewed by" : "sent to"} ${sub.coachName ?? "coach"}`}
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Link href={`/m/table/${s.sessionId}?from=games`} style={btn(false)}>
                  View board
                </Link>
                {sub ? (
                  <Link href={`/m/review/${sub.submissionId}`} style={btn(true)}>
                    {sub.status === "reviewed" ? "See feedback" : "Awaiting review"}
                  </Link>
                ) : coach ? (
                  <form action={sendPlayToCoachAction} style={{ display: "inline" }}>
                    <input type="hidden" name="sessionId" value={s.sessionId} />
                    <button type="submit" style={{ ...btn(true), border: "none", cursor: "pointer" }}>
                      Send to {coach.name.split(" ")[0]}
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}

function banner(bg: string, fg: string): React.CSSProperties {
  return {
    font: `500 13px ${K}`,
    background: bg,
    color: fg,
    borderRadius: 10,
    padding: "10px 12px",
    margin: "14px 0 0",
  };
}

function btn(primary: boolean): React.CSSProperties {
  return {
    font: `600 12.5px ${K}`,
    padding: "8px 14px",
    borderRadius: 999,
    textDecoration: "none",
    display: "inline-block",
    background: primary ? "#1f5e56" : "#f1ede3",
    color: primary ? "#fff" : "#1d1a15",
  };
}

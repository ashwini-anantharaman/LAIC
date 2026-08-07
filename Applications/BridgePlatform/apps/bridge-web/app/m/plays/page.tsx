import Link from "next/link";
import { redirect } from "next/navigation";
import type { PlaySubmission } from "@bridge/sessions";
import { getBridgeContext, getMyCoach, nexusProgramIdOf, orgScopeOf } from "@/lib/nexus";
import { sessionService, submissionStore } from "@/lib/sessions";
import { replayBoardAction, sendPlayToCoachAction } from "./actions";

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
  // ALL submissions per board, not just one: the same play can be sent to
  // different coaches (the action's dedup is deliberately per-coach), and
  // each submission is its own review thread — coach A's feedback and coach
  // B's must both stay reachable from here.
  const bySession = new Map<string, typeof submissions>();
  for (const sub of submissions) {
    const list = bySession.get(sub.sessionId) ?? [];
    list.push(sub);
    bySession.set(sub.sessionId, list);
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
        My games
      </h1>
      <p style={{ font: `400 13px/1.55 ${G}`, color: "#5e5749", margin: "10px 0 0" }}>
        Boards you've finished.{" "}
        {coach
          ? `Send one to ${coach.name} for feedback.`
          : "Hire a coach in the app to send plays for feedback."}
      </p>

      {params.sent && (
        <p style={banner(GREEN, CREAM)}>Sent — your coach will take a look.</p>
      )}
      {params.error && <p style={banner("#b91c1c", "#ffffff")}>{params.error}</p>}

      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 13 }}>
        {completed.length === 0 && (
          <p
            style={{
              border: "1px dashed #d3ccbb",
              borderRadius: 12,
              padding: 16,
              textAlign: "center",
              font: `400 12.5px ${G}`,
              color: "#a49d8e",
            }}
          >
            Nothing here yet — finish a board at the table and it appears here.
          </p>
        )}
        {completed.map((s, i) => {
          const subs = bySession.get(s.sessionId) ?? [];
          // The Send button reappears when the CURRENT coach hasn't seen this
          // board — a board already with coach A can still go to coach B.
          const withCurrentCoach = coach ? subs.some((x) => x.coachId === coach.coach_id) : false;
          const reviewed = subs.filter((x) => x.status === "reviewed").length;
          // The app deals its list rows in alternating suits — maroon, green —
          // each sitting on its darker stacked edge.
          const suit = i % 2 === 0 ? MAROON : GREEN;
          const edge = i % 2 === 0 ? MAROON_EDGE : GREEN_EDGE;
          return (
            <div
              key={s.sessionId}
              style={{
                background: suit,
                borderRadius: 16,
                boxShadow: `0 3px 0 ${edge}`,
                padding: "15px 16px",
              }}
            >
              <p style={{ font: `500 17px ${N}`, color: "#ffffff", margin: 0 }}>
                {s.board.name}
              </p>
              <p
                style={{
                  font: `400 12px ${G}`,
                  color: "rgba(255,244,215,0.72)",
                  margin: "3px 0 12px",
                }}
              >
                completed {s.updatedAt.slice(0, 10)}
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Link
                  // The full record, not the live table: a finished board opens
                  // on the hand-record view — all four hands, the auction, the
                  // play — with "⟵ table" one tap away.
                  href={`/m/table/${s.sessionId}?from=games&view=hands`}
                  style={{
                    font: `600 12.5px ${G}`,
                    padding: "7px 14px",
                    borderRadius: 999,
                    textDecoration: "none",
                    display: "inline-block",
                    border: "2px solid rgba(255,244,215,0.8)",
                    background: "transparent",
                    color: CREAM,
                  }}
                >
                  View board
                </Link>
                {/* Same deal, fresh table — a fork, so this finished record
                    (and any review of it) is never touched. */}
                <form action={replayBoardAction} style={{ display: "inline" }}>
                  <input type="hidden" name="sessionId" value={s.sessionId} />
                  <button
                    type="submit"
                    style={{
                      font: `600 12.5px ${G}`,
                      padding: "7px 14px",
                      borderRadius: 999,
                      cursor: "pointer",
                      border: "2px solid rgba(255,244,215,0.8)",
                      background: "transparent",
                      color: CREAM,
                    }}
                  >
                    Replay
                  </button>
                </form>
                {coach && !withCurrentCoach ? (
                  <form action={sendPlayToCoachAction} style={{ display: "inline" }}>
                    <input type="hidden" name="sessionId" value={s.sessionId} />
                    <button
                      type="submit"
                      style={{
                        font: `600 12.5px ${G}`,
                        padding: "9px 16px",
                        borderRadius: 999,
                        border: "none",
                        cursor: "pointer",
                        background: CREAM,
                        color: INK,
                      }}
                    >
                      Send to {coach.name.split(" ")[0]}
                    </button>
                  </form>
                ) : null}
              </div>

              {/* One review thread per coach, each with its own path back.
                  A single coach reads as one plain row; several fold into a
                  dropdown so the card never packs names onto one line. */}
              {subs.length === 1 && (
                <div style={{ marginTop: 12 }}>
                  <ReviewRow sub={subs[0]!} />
                </div>
              )}
              {subs.length > 1 && (
                <details style={{ marginTop: 12 }}>
                  <summary
                    style={{
                      font: `600 12.5px ${G}`,
                      color: CREAM,
                      listStyle: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "9px 12px",
                      background: "rgba(0,0,0,0.22)",
                      borderRadius: 12,
                    }}
                  >
                    Coach reviews · {subs.length}
                    {reviewed > 0 && (
                      <span style={{ font: `600 11.5px ${G}`, color: "rgba(255,244,215,0.75)" }}>
                        {reviewed} ready
                      </span>
                    )}
                    <span style={{ flex: 1 }} />
                    <span aria-hidden style={{ color: "rgba(255,244,215,0.75)", fontSize: 11 }}>
                      ▾
                    </span>
                  </summary>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 8 }}>
                    {subs.map((sub) => (
                      <ReviewRow key={sub.submissionId} sub={sub} />
                    ))}
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}

/** One coach's review thread: their full name, where it stands, one tap in.
 *  Sits inside a maroon or green card, so it wears the darker inset the app
 *  gives a selected row on a dark surface. */
function ReviewRow({ sub }: Readonly<{ sub: PlaySubmission }>) {
  const ready = sub.status === "reviewed";
  return (
    <Link
      href={`/m/review/${sub.submissionId}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        borderRadius: 12,
        padding: "9px 12px",
        textDecoration: "none",
        background: "rgba(0,0,0,0.22)",
      }}
    >
      <span style={{ font: `600 13px ${G}`, color: "#ffffff", flex: 1, minWidth: 0 }}>
        {sub.coachName ?? "Your coach"}
      </span>
      <span
        style={{
          font: `600 11px ${G}`,
          padding: "3px 10px",
          borderRadius: 999,
          background: ready ? CREAM : "transparent",
          border: ready ? "1px solid transparent" : "1px solid rgba(255,244,215,0.55)",
          color: ready ? GREEN : "rgba(255,244,215,0.85)",
          whiteSpace: "nowrap",
        }}
      >
        {ready ? "Feedback ready" : "Awaiting review"}
      </span>
      <span aria-hidden style={{ color: "rgba(255,244,215,0.75)", fontSize: 13 }}>
        ›
      </span>
    </Link>
  );
}

function banner(bg: string, fg: string): React.CSSProperties {
  return {
    font: `500 13px ${G}`,
    background: bg,
    color: fg,
    borderRadius: 12,
    padding: "10px 14px",
    margin: "14px 0 0",
  };
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { ReviewRow, ReviewRows } from "@/components/mobile/ReviewRow";
import { getBridgeContext, getMyCoaches, nexusProgramIdOf, orgScopeOf } from "@/lib/nexus";
import { sessionService, submissionStore } from "@/lib/sessions";
import { removeBoardAction, replayBoardAction, sendPlayToCoachAction } from "./actions";

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
 *  (view the final table) and sent to the hired coach for feedback (Phase 2).
 *
 *  With ?coach=<id> the page becomes ONE COACH'S FEEDBACK: the games that
 *  coach holds, plus what's left to send them. That's where a coach card on
 *  the app's Coach tab lands (owner direction 2026-08-09). */
export default async function MobilePlaysPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{
    sent?: string;
    error?: string;
    coach?: string;
    /** Which board is asking "remove this?" — the confirm step lives in the
     *  URL so it needs no client JS, like the send picker's <details>. */
    remove?: string;
    removed?: string;
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
  const [mine, submissions, coaches] = await Promise.all([
    sessionService().listRecent({ ...scope, createdBy: context.nexusUserId }),
    submissionStore().listSubmissions({ ...scope, learnerId: context.nexusUserId }),
    getMyCoaches(),
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

  // ── one coach's view ───────────────────────────────────────────────────────
  // An id that isn't (or is no longer) one of this learner's hires falls back
  // to the whole list with a note. The app renders coach cards from a cached
  // summary, so a just-dropped coach can still be tapped — and a blank page
  // would be the worst possible answer to that.
  const wanted = typeof params.coach === "string" && params.coach ? params.coach : null;
  const focus = wanted ? (coaches.find((co) => co.coach_id === wanted) ?? null) : null;
  const staleCoach = wanted !== null && focus === null;

  if (focus) {
    const sessionById = new Map(mine.map((s) => [s.sessionId, s]));
    // Submission-driven, NOT a filter over `completed`: listRecent caps at 100
    // sessions, so an old game's board would silently vanish from a list whose
    // own heading counts it. The submission carries its own frozen snapshot.
    const focusSubs = submissions.filter((x) => x.coachId === focus.coach_id);
    const sendable = completed.filter(
      (s) => !(bySession.get(s.sessionId) ?? []).some((x) => x.coachId === focus.coach_id),
    );
    const reviewed = focusSubs.filter((x) => x.status === "reviewed").length;
    const name = focus.name ?? focusSubs[0]?.coachName ?? "Your coach";

    return (
      <main style={pageStyle}>
        <p style={eyebrowStyle}>Bridge Platform</p>
        {/* The coach's name VERBATIM — never split, never initialled. */}
        <h1 style={{ font: `700 26px ${N}`, color: INK, margin: "6px 0 0" }}>{name}</h1>
        <p style={{ font: `400 13px/1.55 ${G}`, color: "#5e5749", margin: "10px 0 0" }}>
          {focusSubs.length === 0
            ? `You haven't sent ${name} a game yet.`
            : `${focusSubs.length} game${focusSubs.length === 1 ? "" : "s"} sent · ${reviewed} reviewed. Tap one to read the feedback.`}
        </p>

        {params.sent && <p style={banner(GREEN, CREAM)}>Sent — {name} will take a look.</p>}
        {params.error && <p style={banner("#b91c1c", "#ffffff")}>{params.error}</p>}

        {focusSubs.length > 0 && (
          <>
            <p style={sectionLabel}>With {name}</p>
            <div style={stackStyle}>
              {focusSubs.map((sub, i) => {
                const ready = sub.status === "reviewed";
                const live = sessionById.has(sub.sessionId);
                const suit = i % 2 === 0 ? MAROON : GREEN;
                const edge = i % 2 === 0 ? MAROON_EDGE : GREEN_EDGE;
                return (
                  <div key={sub.submissionId} style={cardStyle(suit, edge)}>
                    <p style={{ font: `500 17px ${N}`, color: "#ffffff", margin: 0 }}>
                      {sub.board.name}
                    </p>
                    <p style={metaStyle}>sent {sub.createdAt.slice(0, 10)}</p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Link href={`/m/review/${sub.submissionId}`} style={chipFilled}>
                        {ready ? "Read feedback" : "Awaiting review"}
                      </Link>
                      {/* Only while the board itself still exists — a replay or
                          a view of a vanished session would 404. */}
                      {live && (
                        <>
                          <Link
                            href={`/m/table/${sub.sessionId}?from=games&view=hands`}
                            style={chipOutline}
                          >
                            View board
                          </Link>
                          <form action={replayBoardAction} style={{ display: "inline" }}>
                            <input type="hidden" name="sessionId" value={sub.sessionId} />
                            <input type="hidden" name="coach" value={focus.coach_id} />
                            <button type="submit" style={{ ...chipOutline, cursor: "pointer" }}>
                              Replay
                            </button>
                          </form>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <p style={sectionLabel}>Send another game</p>
        {sendable.length === 0 ? (
          <p style={emptyStyle}>
            {completed.length === 0
              ? "Nothing to send yet — finish a board at the table and it appears here."
              : `${name} already has every game you've finished.`}
          </p>
        ) : (
          <div style={{ ...stackStyle, gap: 8 }}>
            {/* One form per board with the recipient already decided — no
                picker here: the learner is standing inside this coach's view,
                and offering the others would move the game out of it. */}
            {sendable.map((s) => (
              <form
                key={s.sessionId}
                action={sendPlayToCoachAction}
                style={{ display: "flex" }}
              >
                <input type="hidden" name="sessionId" value={s.sessionId} />
                <input type="hidden" name="coach_id" value={focus.coach_id} />
                <input type="hidden" name="coach" value={focus.coach_id} />
                <button type="submit" style={sendRowStyle}>
                  <span style={{ flex: 1, minWidth: 0 }}>{s.board.name}</span>
                  <span style={sendChip}>Send</span>
                </button>
              </form>
            ))}
          </div>
        )}
      </main>
    );
  }

  // ── every game, every coach ────────────────────────────────────────────────
  // The remove confirmation is URL state, so both links have to carry whatever
  // filter is already in play (there is none in this branch today, but the
  // filtered branch shares the helper the moment it grows a Remove).
  const confirming = typeof params.remove === "string" ? params.remove : null;
  const basePath = wanted ? `/m/plays?coach=${encodeURIComponent(wanted)}&` : "/m/plays?";
  const cancelPath = wanted ? `/m/plays?coach=${encodeURIComponent(wanted)}` : "/m/plays";

  return (
    <main style={pageStyle}>
      <p style={eyebrowStyle}>Bridge Platform</p>
      <h1 style={{ font: `700 26px ${N}`, color: INK, margin: "6px 0 0" }}>My games</h1>
      <p style={{ font: `400 13px/1.55 ${G}`, color: "#5e5749", margin: "10px 0 0" }}>
        Boards you've finished.{" "}
        {coaches.length === 1
          ? `Send one to ${coaches[0]!.name} for feedback.`
          : coaches.length > 1
            ? "Send one to any of your coaches for feedback."
            : "Hire a coach in the app to send plays for feedback."}
      </p>

      {staleCoach && (
        <p style={banner(MAROON, CREAM)}>
          That coach isn't on your list any more — here is everything instead.
        </p>
      )}
      {params.sent && (
        <p style={banner(GREEN, CREAM)}>Sent — your coach will take a look.</p>
      )}
      {params.removed && <p style={banner(GREEN, CREAM)}>Removed.</p>}
      {params.error && <p style={banner("#b91c1c", "#ffffff")}>{params.error}</p>}

      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 13 }}>
        {completed.length === 0 && (
          <p style={emptyStyle}>
            Nothing here yet — finish a board at the table and it appears here.
          </p>
        )}
        {completed.map((s, i) => {
          const subs = bySession.get(s.sessionId) ?? [];
          // MULTI-COACH: each board can go to any hired coach it hasn't
          // visited yet — the learner PICKS the recipient (owner direction
          // 2026-08-09). Coaches who already hold this play drop out of the
          // choices (the action's dedup stays as the backstop).
          const sentTo = new Set(subs.map((x) => x.coachId));
          const sendable = coaches.filter((co) => !sentTo.has(co.coach_id));
          const reviewed = subs.filter((x) => x.status === "reviewed").length;
          // The app deals its list rows in alternating suits — maroon, green —
          // each sitting on its darker stacked edge.
          const suit = i % 2 === 0 ? MAROON : GREEN;
          const edge = i % 2 === 0 ? MAROON_EDGE : GREEN_EDGE;
          return (
            <div key={s.sessionId} style={cardStyle(suit, edge)}>
              <p style={{ font: `500 17px ${N}`, color: "#ffffff", margin: 0 }}>
                {s.board.name}
              </p>
              <p style={metaStyle}>completed {s.updatedAt.slice(0, 10)}</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Link
                  // The full record, not the live table: a finished board opens
                  // on the hand-record view — all four hands, the auction, the
                  // play — with "⟵ table" one tap away.
                  href={`/m/table/${s.sessionId}?from=games&view=hands`}
                  style={chipOutline}
                >
                  View board
                </Link>
                {/* Same deal, fresh table — a fork, so this finished record
                    (and any review of it) is never touched. */}
                <form action={replayBoardAction} style={{ display: "inline" }}>
                  <input type="hidden" name="sessionId" value={s.sessionId} />
                  <button type="submit" style={{ ...chipOutline, cursor: "pointer" }}>
                    Replay
                  </button>
                </form>
                {/* Tidying up — available on every game, including ones with a
                    coach (owner direction: removing a game removes it there
                    too). The confirm step spells out that consequence. */}
                {confirming !== s.sessionId && (
                  <Link href={`${basePath}remove=${s.sessionId}`} style={chipQuiet}>
                    Remove
                  </Link>
                )}
                {sendable.length === 1 && (
                  <form action={sendPlayToCoachAction} style={{ display: "inline" }}>
                    <input type="hidden" name="sessionId" value={s.sessionId} />
                    <input type="hidden" name="coach_id" value={sendable[0]!.coach_id} />
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
                      Send to {sendable[0]!.name ?? "your coach"}
                    </button>
                  </form>
                )}
              </div>

              {/* Several coaches to choose from: the send folds into a picker
                  — one row per coach, each its own form, so the choice IS the
                  tap. No client JS; <details> carries the open state. */}
              {sendable.length > 1 && (
                <details style={{ marginTop: 12 }}>
                  <summary
                    style={{
                      font: `600 12.5px ${G}`,
                      color: INK,
                      listStyle: "none",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "9px 16px",
                      background: CREAM,
                      borderRadius: 999,
                    }}
                  >
                    Send to a coach
                    <span aria-hidden style={{ fontSize: 11 }}>▾</span>
                  </summary>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 8 }}>
                    {sendable.map((co) => (
                      <form key={co.coach_id} action={sendPlayToCoachAction} style={{ display: "flex" }}>
                        <input type="hidden" name="sessionId" value={s.sessionId} />
                        <input type="hidden" name="coach_id" value={co.coach_id} />
                        <button type="submit" style={sendRowInset}>
                          <span style={{ flex: 1 }}>{co.name ?? "Coach"}</span>
                          <span style={sendChip}>Send</span>
                        </button>
                      </form>
                    ))}
                  </div>
                </details>
              )}

              {/* The confirm step: this deletes for BOTH sides and can't be
                  undone, so the question is asked in place, on the card being
                  removed, and names what else goes with it. */}
              {confirming === s.sessionId && (
                <div style={confirmBox}>
                  <p style={{ font: `500 13px/1.5 ${G}`, color: "#ffffff", margin: 0 }}>
                    {subs.length === 0
                      ? "Remove this game? It won't be recoverable."
                      : subs.length === 1
                        ? `Remove this game? ${subs[0]!.coachName ?? "Your coach"}'s review and feedback on it are deleted too, for both of you. It won't be recoverable.`
                        : `Remove this game? All ${subs.length} coach reviews of it — and any feedback written on them — are deleted too, for both sides. It won't be recoverable.`}
                  </p>
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    <form action={removeBoardAction} style={{ display: "inline" }}>
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
                          color: "#b91c1c",
                        }}
                      >
                        Yes, remove
                      </button>
                    </form>
                    <Link href={cancelPath} style={chipOutline}>
                      Keep it
                    </Link>
                  </div>
                </div>
              )}

              {/* One review thread per coach, each with its own path back.
                  A single coach reads as one plain row; several fold into a
                  dropdown so the card never packs names onto one line. */}
              <ReviewRows subs={subs} />
            </div>
          );
        })}
      </div>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  height: "100%",
  overflowY: "auto",
  background: CREAM,
  padding: "56px 18px calc(96px + env(safe-area-inset-bottom))",
};

const eyebrowStyle: React.CSSProperties = {
  font: `600 10px ${G}`,
  letterSpacing: ".28em",
  textTransform: "uppercase",
  color: "#a49d8e",
  margin: 0,
};

const sectionLabel: React.CSSProperties = {
  font: `600 10px ${G}`,
  letterSpacing: ".22em",
  textTransform: "uppercase",
  color: "#a49d8e",
  margin: "22px 0 0",
};

const stackStyle: React.CSSProperties = {
  marginTop: 10,
  display: "flex",
  flexDirection: "column",
  gap: 13,
};

const metaStyle: React.CSSProperties = {
  font: `400 12px ${G}`,
  color: "rgba(255,244,215,0.72)",
  margin: "3px 0 12px",
};

const chipOutline: React.CSSProperties = {
  font: `600 12.5px ${G}`,
  padding: "7px 14px",
  borderRadius: 999,
  textDecoration: "none",
  display: "inline-block",
  border: "2px solid rgba(255,244,215,0.8)",
  background: "transparent",
  color: CREAM,
};

/** A secondary, non-destructive-looking action on a suit card: present, but it
 *  never competes with View board / Replay for the eye. */
const chipQuiet: React.CSSProperties = {
  font: `500 12.5px ${G}`,
  padding: "7px 12px",
  borderRadius: 999,
  textDecoration: "none",
  display: "inline-block",
  border: "1px solid rgba(255,244,215,0.34)",
  background: "transparent",
  color: "rgba(255,244,215,0.78)",
};

/** The in-place "are you sure" panel: the card's own darker inset. */
const confirmBox: React.CSSProperties = {
  marginTop: 12,
  borderRadius: 12,
  padding: "12px 14px",
  background: "rgba(0,0,0,0.28)",
};

const chipFilled: React.CSSProperties = {
  font: `600 12.5px ${G}`,
  padding: "7px 14px",
  borderRadius: 999,
  textDecoration: "none",
  display: "inline-block",
  border: "none",
  background: CREAM,
  color: INK,
};

/** A send row standing on the cream page (one coach's view): its own suit card. */
const sendRowStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  gap: 10,
  borderRadius: 12,
  padding: "13px 14px",
  border: "none",
  cursor: "pointer",
  background: GREEN,
  boxShadow: `0 3px 0 ${GREEN_EDGE}`,
  color: "#ffffff",
  font: `600 13px ${G}`,
  textAlign: "left",
};

/** The same row INSIDE a maroon/green card: the darker inset, since a suit
 *  colour on its own suit would vanish. */
const sendRowInset: React.CSSProperties = {
  ...sendRowStyle,
  background: "rgba(0,0,0,0.22)",
  boxShadow: "none",
  padding: "9px 12px",
};

const sendChip: React.CSSProperties = {
  font: `600 11px ${G}`,
  padding: "3px 10px",
  borderRadius: 999,
  background: CREAM,
  color: GREEN,
};

const emptyStyle: React.CSSProperties = {
  border: "1px dashed #d3ccbb",
  borderRadius: 12,
  padding: 16,
  marginTop: 10,
  textAlign: "center",
  font: `400 12.5px ${G}`,
  color: "#a49d8e",
};

function cardStyle(suit: string, edge: string): React.CSSProperties {
  return {
    background: suit,
    borderRadius: 16,
    boxShadow: `0 3px 0 ${edge}`,
    padding: "15px 16px",
  };
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

import { callLabel, rankLabel, type Card, type Seat } from "@bridge/events";
import { canAccessAdminArea } from "@bridge/nexus-client";
import { notFound, redirect } from "next/navigation";
import { HandDiagram } from "@/components/library/HandDiagram";
import { getBridgeContext } from "@/lib/nexus";
import { submissionStore } from "@/lib/sessions";
import { addReviewCommentAction } from "./actions";

const F = "var(--font-fraunces), serif";
const K = "var(--font-karla), sans-serif";

const SUIT_GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
function cardLabel(card: Card): string {
  return `${SUIT_GLYPH[card.suit] ?? card.suit}${rankLabel(card.rank)}`;
}

/** One submitted play under review: the frozen board, the learner's note,
 *  and the comment thread between learner and coach (Phase 2). */
export default async function MobileReviewDetailPage({
  params,
}: Readonly<{ params: Promise<{ submissionId: string }> }>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  const { submissionId } = await params;

  const store = submissionStore();
  const submission = await store.getSubmission(submissionId);
  if (!submission) notFound();
  const isParty =
    submission.learnerId === context.nexusUserId ||
    submission.coachId === context.nexusUserId;
  if (!isParty && !canAccessAdminArea(context)) redirect("/m/home");

  const comments = await store.listComments(submissionId);
  const iAmCoach = submission.coachId === context.nexusUserId;

  // Group the frozen play back into tricks of four for display.
  const tricks: { seat: Seat; card: Card }[][] = [];
  for (let i = 0; i < submission.board.play.length; i += 4) {
    tricks.push(submission.board.play.slice(i, i + 4));
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
        Play review · {submission.status === "reviewed" ? "reviewed" : "waiting for coach"}
      </p>
      <h1 style={{ font: `500 24px ${F}`, color: "#1d1a15", margin: "6px 0 0" }}>
        {submission.board.name}
      </h1>
      <p style={{ font: `400 13px/1.5 ${K}`, color: "#5e5749", margin: "6px 0 0" }}>
        {submission.learnerName ?? "Learner"} → {submission.coachName ?? "Coach"}
        {submission.board.contractLabel && ` · ${submission.board.contractLabel}`}
        {submission.board.resultLabel && ` · ${submission.board.resultLabel}`}
      </p>
      {submission.note && (
        <p
          style={{
            font: `400 13px/1.55 ${K}`,
            color: "#1d1a15",
            background: "#f1ede3",
            borderRadius: 10,
            padding: "10px 12px",
            margin: "12px 0 0",
          }}
        >
          “{submission.note}”
        </p>
      )}

      <section style={card()}>
        <p style={sectionTitle()}>The deal</p>
        <HandDiagram
          hands={submission.board.hands}
          center={
            <span style={{ font: `600 11px ${K}`, color: "#a49d8e" }}>
              {submission.board.dealer} deals
              <br />
              vul {submission.board.vul}
            </span>
          }
        />
      </section>

      <section style={card()}>
        <p style={sectionTitle()}>Auction</p>
        <p style={{ font: `400 13px/1.7 ${K}`, color: "#1d1a15", margin: 0 }}>
          {submission.board.auction.length
            ? submission.board.auction
                .map((a) => `${a.seat} ${callLabel(a.call)}`)
                .join(" · ")
            : "—"}
        </p>
      </section>

      <section style={card()}>
        <p style={sectionTitle()}>Play, trick by trick</p>
        {tricks.length === 0 && (
          <p style={{ font: `400 13px ${K}`, color: "#a49d8e", margin: 0 }}>—</p>
        )}
        {tricks.map((trick, i) => (
          <p key={i} style={{ font: `400 13px/1.7 ${K}`, color: "#1d1a15", margin: 0 }}>
            <span style={{ color: "#a49d8e" }}>{i + 1}.</span>{" "}
            {trick.map((p) => `${p.seat} ${cardLabel(p.card)}`).join("  ")}
          </p>
        ))}
      </section>

      <section style={card()}>
        <p style={sectionTitle()}>
          Feedback {comments.length > 0 && `(${comments.length})`}
        </p>
        {comments.length === 0 && (
          <p style={{ font: `400 13px ${K}`, color: "#a49d8e", margin: 0 }}>
            {iAmCoach
              ? "No comments yet — yours will be the first."
              : "No feedback yet — your coach hasn't commented."}
          </p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {comments.map((c) => (
            <div key={c.commentId}>
              <p style={{ font: `600 12px ${K}`, color: "#5e5749", margin: 0 }}>
                {c.authorName ?? "Someone"}{" "}
                <span style={{ color: "#a49d8e", fontWeight: 400 }}>
                  · {c.createdAt.slice(0, 10)}
                </span>
              </p>
              <p style={{ font: `400 13.5px/1.55 ${K}`, color: "#1d1a15", margin: "2px 0 0" }}>
                {c.body}
              </p>
            </div>
          ))}
        </div>

        <form action={addReviewCommentAction} style={{ marginTop: 14 }}>
          <input type="hidden" name="submissionId" value={submission.submissionId} />
          <textarea
            name="body"
            required
            rows={3}
            placeholder={iAmCoach ? "Write your feedback…" : "Reply to your coach…"}
            style={{
              width: "100%",
              font: `400 13.5px/1.5 ${K}`,
              border: "1px solid #ece7db",
              borderRadius: 10,
              padding: "10px 12px",
              background: "#fff",
              resize: "vertical",
            }}
          />
          <button
            type="submit"
            style={{
              marginTop: 8,
              font: `600 13px ${K}`,
              background: "#105431",
              color: "#fff",
              border: "none",
              borderRadius: 999,
              padding: "9px 18px",
              cursor: "pointer",
            }}
          >
            {iAmCoach ? "Send feedback" : "Send reply"}
          </button>
        </form>
      </section>
    </main>
  );
}

function card(): React.CSSProperties {
  return {
    background: "#fff",
    border: "1px solid #ece7db",
    borderRadius: 14,
    padding: "14px 16px",
    marginTop: 14,
  };
}

function sectionTitle(): React.CSSProperties {
  return {
    font: `600 10.5px ${K}`,
    letterSpacing: ".18em",
    textTransform: "uppercase",
    color: "#a49d8e",
    margin: "0 0 8px",
  };
}

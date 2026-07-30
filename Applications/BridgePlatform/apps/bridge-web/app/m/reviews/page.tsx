import Link from "next/link";
import { redirect } from "next/navigation";
import { getBridgeContext, nexusProgramIdOf, orgScopeOf } from "@/lib/nexus";
import { submissionStore } from "@/lib/sessions";

const F = "var(--font-fraunces), serif";
const K = "var(--font-karla), sans-serif";

/** Mobile coach review queue — plays the coach's learners sent in (Phase 2). */
export default async function MobileReviewsPage() {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");

  const programId = (await nexusProgramIdOf()) ?? undefined;
  const submissions = await submissionStore().listSubmissions({
    programOrganizationId: orgScopeOf(context),
    ...(programId ? { nexusProgramId: programId } : {}),
    coachId: context.nexusUserId,
  });
  const open = submissions.filter((s) => s.status === "submitted");
  const done = submissions.filter((s) => s.status !== "submitted");

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
        Reviews
      </h1>
      <p style={{ font: `400 13px/1.55 ${K}`, color: "#5e5749", margin: "10px 0 0" }}>
        Plays your learners sent you for feedback.
      </p>

      {submissions.length === 0 && (
        <p style={{ font: `400 13px/1.55 ${K}`, color: "#a49d8e", marginTop: 18 }}>
          Nothing to review yet — when a learner sends you a play, it lands here.
        </p>
      )}

      {[
        { label: "Waiting for you", items: open },
        { label: "Reviewed", items: done },
      ].map(
        (section) =>
          section.items.length > 0 && (
            <section key={section.label} style={{ marginTop: 20 }}>
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
                {section.items.map((s) => (
                  <Link
                    key={s.submissionId}
                    href={`/m/review/${s.submissionId}`}
                    style={{
                      background: "#fff",
                      border: "1px solid #ece7db",
                      borderRadius: 14,
                      padding: "13px 16px",
                      textDecoration: "none",
                    }}
                  >
                    <p style={{ font: `600 14.5px ${K}`, color: "#1d1a15", margin: 0 }}>
                      {s.board.name}
                      {s.board.resultLabel && (
                        <span style={{ color: "#5e5749", fontWeight: 400 }}>
                          {" "}
                          · {s.board.resultLabel}
                        </span>
                      )}
                    </p>
                    <p style={{ font: `400 12px ${K}`, color: "#a49d8e", margin: "3px 0 0" }}>
                      from {s.learnerName ?? "a learner"} · {s.createdAt.slice(0, 10)}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          ),
      )}
    </main>
  );
}

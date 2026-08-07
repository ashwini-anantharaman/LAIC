import Link from "next/link";
import { redirect } from "next/navigation";
import { getBridgeContext, nexusProgramIdOf, orgScopeOf } from "@/lib/nexus";
import { submissionStore } from "@/lib/sessions";

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
        Reviews
      </h1>
      <p style={{ font: `400 13px/1.55 ${G}`, color: "#5e5749", margin: "10px 0 0" }}>
        Plays your learners sent you for feedback.
      </p>

      {submissions.length === 0 && (
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
          Nothing to review yet — when a learner sends you a play, it lands here.
        </p>
      )}

      {[
        { label: "Waiting for you", items: open },
        { label: "Reviewed", items: done },
      ].map(
        (section) =>
          section.items.length > 0 && (
            <section key={section.label} style={{ marginTop: 22 }}>
              <p
                style={{
                  font: `600 10.5px ${G}`,
                  letterSpacing: ".18em",
                  textTransform: "uppercase",
                  color: "#a49d8e",
                  margin: "0 0 10px",
                }}
              >
                {section.label}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                {section.items.map((s, i) => {
                  // The app deals its list rows in alternating suits —
                  // maroon, green — each on its darker stacked edge.
                  const suit = i % 2 === 0 ? MAROON : GREEN;
                  const edge = i % 2 === 0 ? MAROON_EDGE : GREEN_EDGE;
                  return (
                    <Link
                      key={s.submissionId}
                      href={`/m/review/${s.submissionId}`}
                      style={{
                        background: suit,
                        borderRadius: 16,
                        boxShadow: `0 3px 0 ${edge}`,
                        padding: "15px 16px",
                        textDecoration: "none",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", font: `500 17px ${N}`, color: "#ffffff" }}>
                          {s.board.name}
                          {s.board.resultLabel && (
                            <span style={{ font: `400 13px ${G}`, color: "rgba(255,244,215,0.85)" }}>
                              {" "}
                              · {s.board.resultLabel}
                            </span>
                          )}
                        </span>
                        <span
                          style={{
                            display: "block",
                            font: `400 12px ${G}`,
                            color: "rgba(255,244,215,0.72)",
                            marginTop: 3,
                          }}
                        >
                          from {s.learnerName ?? "a learner"} · {s.createdAt.slice(0, 10)}
                        </span>
                      </span>
                      <span aria-hidden style={{ color: "rgba(255,244,215,0.75)", fontSize: 16 }}>
                        ›
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ),
      )}
    </main>
  );
}

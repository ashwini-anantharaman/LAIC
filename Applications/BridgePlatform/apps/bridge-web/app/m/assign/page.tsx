import { redirect } from "next/navigation";
import { getBridgeContext, getMyLearners, isBridgeCoach } from "@/lib/nexus";
import { reviewerCandidates, selfReviewer } from "@/lib/reviewers";
import { libraryStore } from "@/lib/sessions";
import { assignEntryAction } from "./actions";

// BirdBridge typefaces (loaded in the /m layout): Neco for display, General
// Sans for body — with the older mobile faces as fallbacks.
const N = "var(--font-neco), var(--font-fraunces), serif";
const G = "var(--font-gs), var(--font-karla), sans-serif";

// The app's palette (bridge-coach-app/constants/theme.ts): learner rows wear
// the forest-green "field" cards the app's sheets use, on the cream page.
const CREAM = "#fff4d7";
const GREEN = "#105431";
const GREEN_EDGE = "#052a20";
const MAROON = "#541015";
const MAROON_EDGE = "#2a0506";
const INK = "#1f1f1f";

/**
 * Coach: pick who PLAYS one library entry and who REVIEWS it.
 *
 * Both pickers on one screen, deliberately: this is step two of a three-page
 * flow inside a WebView whose back link is removed, and reviewers are optional —
 * a mandatory fourth page would tax the common path (pick learners, Assign).
 * Reviewers fold into <details> so that path is untouched.
 */
export default async function MobileAssignPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ entry?: string; error?: string }> }>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  if (!isBridgeCoach(context)) redirect("/m/home");
  const params = await searchParams;
  const entryId = params.entry ?? "";

  const [entry, roster, candidates] = await Promise.all([
    entryId ? libraryStore().getEntry(entryId) : null,
    getMyLearners(),
    // The one reviewer-pool policy (lib/reviewers.ts). Never getProgramCoaches()
    // inline — the pool narrows later and this is the seam that moves.
    reviewerCandidates(context),
  ]);
  if (!entry) redirect("/m/library");
  const assignable = roster.filter((l) => l.user_id);
  const me = selfReviewer(context);

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
        Assign · {entry.kind}
      </p>
      <h1 style={{ font: `700 24px ${N}`, color: INK, margin: "6px 0 0" }}>
        {entry.name}
      </h1>
      <p style={{ font: `400 13px/1.55 ${G}`, color: "#5e5749", margin: "8px 0 0" }}>
        Pick who plays this board, and who gives feedback on it. Each learner
        gets their own copy; each reviewer gets their own feedback thread with
        them.
      </p>

      {params.error && (
        <p
          style={{
            font: `500 13px ${G}`,
            background: "#b91c1c",
            color: "#ffffff",
            borderRadius: 12,
            padding: "10px 14px",
            margin: "14px 0 0",
          }}
        >
          {params.error}
        </p>
      )}

      <form action={assignEntryAction} style={{ marginTop: 16 }}>
        <input type="hidden" name="entryId" value={entry.entryId} />

        <p style={sectionLabel}>Who plays it</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {assignable.length === 0 && (
            <p style={emptyStyle}>
              Nobody has hired you yet — learners appear here once they pick
              you as their coach.
            </p>
          )}
          {assignable.map((l) => (
            <label
              key={l.user_id}
              style={{
                // The app's selectable "field" card: forest green with the
                // darker stacked edge, white name, cream check.
                display: "flex",
                alignItems: "center",
                gap: 12,
                background: GREEN,
                borderRadius: 14,
                boxShadow: `0 3px 0 ${GREEN_EDGE}`,
                padding: "14px 16px",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                name="learner"
                value={l.user_id as string}
                style={{ width: 18, height: 18, accentColor: CREAM }}
              />
              <span style={{ font: `600 15px ${G}`, color: "#ffffff" }}>
                {l.name ?? l.email ?? "Learner"}
              </span>
            </label>
          ))}
        </div>

        <p style={sectionLabel}>Who reviews it</p>
        {/* The creator is a FIXED row, not a pre-checked box. A box promises it
            can be unchecked, and an unchecked creator with no named reviewer
            would produce an assignment nobody reviews — a brand-new failure on
            the one screen whose job is to be a single tap. (If "the creator need
            not review" is ever wanted, this becomes a checked checkbox named
            "reviewer" and the action needs no change: it already treats the
            creator's id as just another reviewer id.) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: MAROON,
            borderRadius: 14,
            boxShadow: `0 3px 0 ${MAROON_EDGE}`,
            padding: "14px 16px",
          }}
        >
          <span style={{ font: `600 15px ${G}`, color: "#ffffff", flex: 1, minWidth: 0 }}>
            {me.name}
          </span>
          <span
            style={{
              font: `600 11px ${G}`,
              padding: "3px 10px",
              borderRadius: 999,
              background: CREAM,
              color: MAROON,
              whiteSpace: "nowrap",
            }}
          >
            you · creator
          </span>
        </div>
        <p style={{ font: `400 12px/1.5 ${G}`, color: "#7b7466", margin: "6px 0 0" }}>
          You'll always get a feedback thread with each learner.
        </p>

        {candidates.length === 0 ? (
          <p style={{ ...emptyStyle, marginTop: 10 }}>
            No other coaches in this program yet — you're the only reviewer.
          </p>
        ) : (
          <details style={{ marginTop: 10 }}>
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
                background: "#fff",
                border: "1px solid #d3ccbb",
                borderRadius: 999,
              }}
            >
              + Add another reviewer
              <span aria-hidden style={{ fontSize: 11 }}>▾</span>
            </summary>
            <p style={{ font: `400 12px/1.5 ${G}`, color: "#7b7466", margin: "8px 0 0" }}>
              Each reviewer you add gets their own feedback thread with every
              learner on this assignment.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 8 }}>
              {candidates.map((c) => (
                <label
                  key={c.reviewerId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    background: GREEN,
                    borderRadius: 14,
                    boxShadow: `0 3px 0 ${GREEN_EDGE}`,
                    padding: "14px 16px",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    name="reviewer"
                    value={c.reviewerId}
                    style={{ width: 18, height: 18, accentColor: CREAM }}
                  />
                  <span
                    style={{ font: `600 15px ${G}`, color: "#ffffff", flex: 1, minWidth: 0 }}
                  >
                    {c.name}
                  </span>
                  {c.detail && (
                    <span
                      style={{
                        font: `400 11.5px ${G}`,
                        color: "rgba(255,244,215,0.72)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.detail}
                    </span>
                  )}
                </label>
              ))}
            </div>
          </details>
        )}

        <textarea
          name="note"
          rows={2}
          placeholder="Optional instruction — e.g. focus on your opening lead"
          style={{
            width: "100%",
            marginTop: 14,
            font: `400 13.5px/1.5 ${G}`,
            border: "1px solid #d3ccbb",
            borderRadius: 12,
            padding: "11px 13px",
            background: "#fff",
            resize: "vertical",
          }}
        />

        <button
          type="submit"
          style={{
            marginTop: 14,
            font: `600 13.5px ${G}`,
            background: GREEN,
            color: "#fff",
            border: "none",
            borderRadius: 999,
            boxShadow: `0 2px 0 ${GREEN_EDGE}`,
            padding: "12px 24px",
            cursor: "pointer",
          }}
        >
          {/* One label, true on both paths: "Assign & notify reviewers" would be
              a lie when no reviewer is picked, and it can't vary per selection
              without client JS. The intro paragraph carries the explanation. */}
          Assign board
        </button>
      </form>
    </main>
  );
}

const sectionLabel: React.CSSProperties = {
  font: `600 10px ${G}`,
  letterSpacing: ".22em",
  textTransform: "uppercase",
  color: "#a49d8e",
  margin: "22px 0 10px",
};

const emptyStyle: React.CSSProperties = {
  border: "1px dashed #d3ccbb",
  borderRadius: 12,
  padding: 16,
  textAlign: "center",
  font: `400 12.5px ${G}`,
  color: "#a49d8e",
};

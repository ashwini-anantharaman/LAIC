import { redirect } from "next/navigation";
import { getBridgeContext, getMyLearners, isBridgeCoach } from "@/lib/nexus";
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
const INK = "#1f1f1f";

/** Coach: pick learners from the roster and assign one library entry. */
export default async function MobileAssignPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ entry?: string; error?: string }> }>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  if (!isBridgeCoach(context)) redirect("/m/home");
  const params = await searchParams;
  const entryId = params.entry ?? "";

  const [entry, roster] = await Promise.all([
    entryId ? libraryStore().getEntry(entryId) : null,
    getMyLearners(),
  ]);
  if (!entry) redirect("/m/library");
  const assignable = roster.filter((l) => l.user_id);

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
        Pick who should play this board. Each learner gets their own copy and
        you'll see their progress under Assignments.
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

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {assignable.length === 0 && (
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
          Assign board
        </button>
      </form>
    </main>
  );
}

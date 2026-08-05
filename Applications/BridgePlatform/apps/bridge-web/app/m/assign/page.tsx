import { redirect } from "next/navigation";
import { getBridgeContext, getMyLearners, isBridgeCoach } from "@/lib/nexus";
import { libraryStore } from "@/lib/sessions";
import { assignEntryAction } from "./actions";

const F = "var(--font-fraunces), serif";
const K = "var(--font-karla), sans-serif";

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
        Assign · {entry.kind}
      </p>
      <h1 style={{ font: `500 24px ${F}`, color: "#1d1a15", margin: "6px 0 0" }}>
        {entry.name}
      </h1>
      <p style={{ font: `400 13px/1.55 ${K}`, color: "#5e5749", margin: "8px 0 0" }}>
        Pick who should play this board. Each learner gets their own copy and
        you'll see their progress under Assignments.
      </p>

      {params.error && (
        <p
          style={{
            font: `500 13px ${K}`,
            background: "#fbeaea",
            color: "#8c2f2f",
            borderRadius: 10,
            padding: "10px 12px",
            margin: "14px 0 0",
          }}
        >
          {params.error}
        </p>
      )}

      <form action={assignEntryAction} style={{ marginTop: 16 }}>
        <input type="hidden" name="entryId" value={entry.entryId} />

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {assignable.length === 0 && (
            <p style={{ font: `400 13px/1.55 ${K}`, color: "#a49d8e" }}>
              Nobody has hired you yet — learners appear here once they pick
              you as their coach.
            </p>
          )}
          {assignable.map((l) => (
            <label
              key={l.user_id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                background: "#fff",
                border: "1px solid #ece7db",
                borderRadius: 14,
                padding: "13px 16px",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                name="learner"
                value={l.user_id as string}
                style={{ width: 18, height: 18, accentColor: "#1f5e56" }}
              />
              <span style={{ font: `600 14.5px ${K}`, color: "#1d1a15" }}>
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
            marginTop: 12,
            font: `600 13.5px ${K}`,
            background: "#1f5e56",
            color: "#fff",
            border: "none",
            borderRadius: 999,
            padding: "11px 22px",
            cursor: "pointer",
          }}
        >
          Assign board
        </button>
      </form>
    </main>
  );
}

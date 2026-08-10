import Link from "next/link";
import type { PlaySubmission } from "@bridge/sessions";

// BirdBridge typefaces (loaded in the /m layout).
const G = "var(--font-gs), var(--font-karla), sans-serif";
const CREAM = "#fff4d7";
const GREEN = "#105431";

/**
 * One coach's review thread on one play: their full name, where it stands, one
 * tap in. Sits INSIDE a maroon or green suit card, so it wears the darker inset
 * the app gives a row on a dark surface.
 *
 * Shared by My Games and Assignments (0028): a finished board now carries one
 * thread per REVIEWER, so both surfaces list them the same way — and the
 * learner can always tell whose feedback they are opening.
 */
export function ReviewRow({ sub }: Readonly<{ sub: PlaySubmission }>) {
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

/**
 * The fold several threads live in — "Coach reviews · 3", with how many are
 * ready. A single thread should render as a bare ReviewRow instead; the fold
 * exists so a card never packs names onto one line.
 */
export function ReviewRows({ subs }: Readonly<{ subs: PlaySubmission[] }>) {
  const reviewed = subs.filter((s) => s.status === "reviewed").length;
  if (subs.length === 0) return null;
  if (subs.length === 1) {
    return (
      <div style={{ marginTop: 12 }}>
        <ReviewRow sub={subs[0]!} />
      </div>
    );
  }
  return (
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
  );
}

import { canAccessAdminArea } from "@bridge/nexus-client";
import { redirect } from "next/navigation";

import { CurateBoardForm, CuratedExtras } from "@/components/curate/CurateBoardForm";
import { DealEditor } from "@/components/library/DealEditor";
import { getBridgeContext, getMyLearners, orgScopeOf } from "@/lib/nexus";
import { sessionService } from "@/lib/sessions";

// BirdBridge typefaces (loaded in the /m layout).
const N = "var(--font-neco), var(--font-fraunces), serif";
const G = "var(--font-gs), var(--font-karla), sans-serif";
const CREAM = "#fff4d7";
const INK = "#1f1f1f";

/**
 * The studio's front door on the app (curated v2, owner design 2026-08-18):
 * build the board card by card, seat the learner, choose how tightly they're
 * held — then open the all-four-seats sitting whose line the learner walks.
 */
export default async function CurateNewPage() {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  // The roster is the permission (the publish route's own rule); program
  // admins curate by role.
  const coaches =
    canAccessAdminArea(context) ||
    (await getMyLearners()
      .then((l) => l.length > 0)
      .catch(() => false));
  if (!coaches) redirect("/m/assignments");

  /**
   * BOARDS YOU STARTED (owner ask 2026-08-19: resume at any time).
   *
   * Summaries, never records — the projection carries `authoring` precisely so
   * this list costs a few hundred bytes a row instead of a whole sitting each
   * (see SessionSummary). Unfinished studio sittings with work saved in them,
   * newest first; publishing clears the draft, so a board that shipped drops
   * off this list by itself.
   */
  const started = (
    await sessionService()
      .listRecentSummaries({
        programOrganizationId: orgScopeOf(context),
        createdBy: context.nexusUserId,
        status: "active",
      })
      .catch(() => [])
  )
    .filter((x) => x.authoring?.hasDraft)
    .slice(0, 6);

  return (
    <main
      style={{
        height: "100%",
        overflowY: "auto",
        background: CREAM,
        padding: "56px 18px calc(96px + env(safe-area-inset-bottom))",
        fontFamily: G,
      }}
    >
      {/* No back link of its own: inside the app this page lives in a
          BridgeEmbed whose native header already carries the way out, and a
          second "← Assignments" row was double chrome (owner report
          2026-08-18) — doubly wrong after the door moved to the Play tab. */}
      <h1 style={{ font: `700 24px ${N}`, color: INK, margin: "0" }}>
        Build a curated deal
      </h1>
      <p style={{ font: `400 12.5px/1.55 ${G}`, color: "#5e5749", margin: "8px 0 14px" }}>
        Build the board — by hand, or prefilled from LIN/PBN — seat your learner, and open
        the studio: you'll bid every hand, then play theirs against the robots, and that
        sitting becomes the line they follow.
      </p>
      {started.length > 0 && (
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e0d7c2",
            borderRadius: 12,
            padding: "12px 13px",
            margin: "0 0 16px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <p style={{ font: `600 10px ${G}`, letterSpacing: ".14em", textTransform: "uppercase", color: "#541015", margin: 0 }}>
            Pick up where you left off
          </p>
          {started.map((x) => (
            <a
              key={x.sessionId}
              href={`/m/table/${encodeURIComponent(x.sessionId)}?author=1`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                minHeight: 44,
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #e8ddc3",
                background: "#fffdf6",
                textDecoration: "none",
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", font: `600 13px ${G}`, color: INK }}>
                  {x.boardName}
                </span>
                <span style={{ display: "block", font: `400 11px ${G}`, color: "#7b7466" }}>
                  {x.authoring?.learnerSeat ? `learner ${x.authoring.learnerSeat} · ` : ""}
                  saved {new Date(x.authoring?.draftAt ?? x.updatedAt).toLocaleDateString()}
                </span>
              </span>
              <span style={{ flex: "none", font: `700 12px ${G}`, color: "#105431" }}>Resume →</span>
            </a>
          ))}
        </div>
      )}

      {/* THE LIBRARY'S OWN BOARD EDITOR (boss direction 2026-08-18: one board
          creation screen everywhere), with the curated extras in its footer
          and the studio as its submit. */}
      <CurateBoardForm tableBase="/m/table/">
        <DealEditor
          skin="app"
          submitLabel="Open the studio — you bid every hand, then play theirs"
          footer={<CuratedExtras app />}
        />
      </CurateBoardForm>
    </main>
  );
}

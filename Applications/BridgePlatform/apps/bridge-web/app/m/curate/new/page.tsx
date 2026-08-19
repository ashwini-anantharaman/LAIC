import { canAccessAdminArea } from "@bridge/nexus-client";
import { redirect } from "next/navigation";

import { CurateBoardForm, CuratedExtras } from "@/components/curate/CurateBoardForm";
import { DealEditor } from "@/components/library/DealEditor";
import { getBridgeContext, getMyLearners } from "@/lib/nexus";

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

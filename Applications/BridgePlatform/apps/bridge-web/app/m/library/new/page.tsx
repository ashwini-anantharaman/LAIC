import Link from "next/link";
import { redirect } from "next/navigation";
import { DealEditor } from "@/components/library/DealEditor";
import { canCreateInLibrary } from "@/lib/libraryComponent";
import { getBridgeContext } from "@/lib/nexus";
import { createDealAction } from "@/app/bridge/library/actions";

// BirdBridge typefaces (loaded in the /m layout): Neco for display, General
// Sans for body — with the older mobile faces as fallbacks.
const F = "var(--font-neco), var(--font-fraunces), serif";
const K = "var(--font-gs), var(--font-karla), sans-serif";

/** Mobile authoring: the same DealEditor as desktop inside the phone shell.
 *  ?kind=deal saves the bare distribution; default is a board. The action's
 *  `mobile` flag routes errors and the post-save landing back to /m. */
export default async function MobileNewDealPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ kind?: string; error?: string; flow?: string }> }>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  // Direct URL must respect the capability too, not just the hidden button.
  if (!(await canCreateInLibrary(context)))
    redirect("/m/library");
  const { kind: rawKind, error, flow } = await searchParams;
  const kind = rawKind === "deal" ? "deal" : "board";
  const noun = kind === "deal" ? "deal" : "board";
  // The coach app's Create Assignment flow: same editor, but the save
  // continues to the assign picker (createDealAction reads the flag).
  const flowAssign = flow === "assign";

  return (
    <main
      style={{
        height: "100%",
        overflowY: "auto",
        background: "#fff4d7",
        padding: "40px 16px calc(40px + env(safe-area-inset-bottom))",
      }}
    >
      {/* No way back to the library from the ASSIGNMENT flow (owner decision
          2026-08-07): the coach app frames this page, its own header carries
          the exit, and the library is not part of that journey. */}
      {!flowAssign && (
        <Link
          href="/m/library"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            border: "1px solid #d3ccbb",
            background: "#fff",
            color: "#1d1a15",
            borderRadius: 20,
            padding: "6px 14px",
            font: `600 13px ${K}`,
            textDecoration: "none",
            marginBottom: 14,
          }}
        >
          ‹ Library
        </Link>
      )}
      <p style={{ font: `600 10px ${K}`, letterSpacing: ".28em", textTransform: "uppercase", color: "#a49d8e", margin: 0 }}>
        {flowAssign ? "New assignment" : "Library"}
      </p>
      <h1 style={{ font: `700 26px ${F}`, color: "#1f1f1f", margin: "4px 0 2px" }}>
        New {noun}
      </h1>
      <p style={{ font: `400 12px/1.5 ${K}`, color: "#7b7466", margin: "0 0 12px" }}>
        {flowAssign
          ? `Type or tap each hand suit by suit — after saving you'll pick which learners play it.`
          : `Type or tap each hand suit by suit — the saved ${noun} lands in your library, ready to play.`}
      </p>

      {error && (
        <p style={{ border: "1px solid #f3c2c2", background: "#fdf1f1", color: "#8a2b2b", borderRadius: 10, padding: "8px 12px", font: `400 12px ${K}`, marginBottom: 12 }}>
          {error}
        </p>
      )}

      <form action={createDealAction}>
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="mobile" value="1" />
        {flowAssign && <input type="hidden" name="flow" value="assign" />}
        <DealEditor
          hideBoardFacts={kind === "deal"}
          submitLabel={flowAssign ? "Save & pick learners" : kind === "deal" ? "Save deal" : "Save board"}
          skin="app"
        />
      </form>
    </main>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { DealEditor } from "@/components/library/DealEditor";
import { canCreateInLibrary } from "@/lib/libraryComponent";
import { getBridgeContext } from "@/lib/nexus";
import { createDealAction } from "@/app/bridge/library/actions";

const F = "var(--font-fraunces), serif";
const K = "var(--font-karla), sans-serif";

/** Mobile authoring: the same DealEditor as desktop inside the phone shell.
 *  ?kind=deal saves the bare distribution; default is a board. The action's
 *  `mobile` flag routes errors and the post-save landing back to /m. */
export default async function MobileNewDealPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ kind?: string; error?: string }> }>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  // Direct URL must respect the capability too, not just the hidden button.
  if (!(await canCreateInLibrary(context)))
    redirect("/m/library");
  const { kind: rawKind, error } = await searchParams;
  const kind = rawKind === "deal" ? "deal" : "board";
  const noun = kind === "deal" ? "deal" : "board";

  return (
    <main
      style={{
        height: "100%",
        overflowY: "auto",
        background: "#fff4d7",
        padding: "40px 16px calc(40px + env(safe-area-inset-bottom))",
      }}
    >
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
      <p style={{ font: `600 10px ${K}`, letterSpacing: ".28em", textTransform: "uppercase", color: "#a49d8e", margin: 0 }}>
        Library
      </p>
      <h1 style={{ font: `500 26px ${F}`, color: "#1d1a15", margin: "4px 0 2px" }}>
        New {noun}
      </h1>
      <p style={{ font: `400 12px/1.5 ${K}`, color: "#7b7466", margin: "0 0 12px" }}>
        Type or tap each hand suit by suit — the saved {noun} lands in your
        library, ready to play.
      </p>

      {error && (
        <p style={{ border: "1px solid #f3c2c2", background: "#fdf1f1", color: "#8a2b2b", borderRadius: 10, padding: "8px 12px", font: `400 12px ${K}`, marginBottom: 12 }}>
          {error}
        </p>
      )}

      <form action={createDealAction}>
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="mobile" value="1" />
        <DealEditor
          hideBoardFacts={kind === "deal"}
          submitLabel={kind === "deal" ? "Save deal" : "Save board"}
        />
      </form>
    </main>
  );
}

import { stubDisplayName } from "@bridge/nexus-client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireFeature } from "@/lib/access";
import { getBridgeContext } from "@/lib/nexus";

const F = "var(--font-fraunces), serif";
const K = "var(--font-karla), sans-serif";
const bold = { color: "#1d1a15", fontWeight: 700 };

export default async function MobileHomePage() {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  await requireFeature(context, "page.home");
  const firstName = (
    stubDisplayName(context.nexusUserId) ?? context.nexusUserId
  ).split(" ")[0];

  return (
    <main
      style={{
        height: "100%",
        overflowY: "auto",
        background: "#faf8f2",
        padding: "56px 20px calc(96px + env(safe-area-inset-bottom))",
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
      <h1
        style={{
          font: `500 27px ${F}`,
          color: "#1d1a15",
          margin: "6px 0 0",
        }}
      >
        Welcome back, {firstName}.
      </h1>
      <div
        style={{
          marginTop: 16,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          font: `400 14px/1.6 ${K}`,
          color: "#5e5749",
        }}
      >
        <p style={{ margin: 0 }}>
          Every rule here belongs to a <b style={bold}>knowledge base</b> (SAYC,
          2/1, …). Players are assembled from knowledge sets; every AI decision
          at the table traces to the rule, the item, and the source passage that
          produced it — and editing a knowledge item changes how the AI plays,
          immediately.
        </p>
        <p style={{ margin: 0 }}>
          Jump into <b style={bold}>Play</b> — pick a knowledge set and the
          house players are provisioned for you. <b style={bold}>Players</b>
          {/* explicit space: the compiler eats the plain-space seam here */}
          {" collects everyone's configured players"}; the{" "}
          <b style={bold}>Library</b> keeps the deals, boards, lineups and plays
          worth returning to.
        </p>
      </div>
      <Link
        href="/m/play"
        style={{
          marginTop: 22,
          width: "100%",
          border: "none",
          background: "#205e63",
          color: "#fff",
          borderRadius: 12,
          padding: 15,
          font: `600 15px ${K}`,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          textDecoration: "none",
          boxSizing: "border-box",
        }}
      >
        Take a seat <span aria-hidden>♠</span>
      </Link>
    </main>
  );
}

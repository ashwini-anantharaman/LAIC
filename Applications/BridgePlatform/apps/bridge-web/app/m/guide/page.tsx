import { redirect } from "next/navigation";
import { requireFeature } from "@/lib/access";
import { getBridgeContext } from "@/lib/nexus";

const F = "var(--font-fraunces), serif";
const K = "var(--font-karla), sans-serif";

/** The four guide sections, verbatim from the mobile design's guideVals(). */
const SECTIONS: { title: string; body: string }[] = [
  {
    title: "How it fits together",
    body: "Five stops between a sentence in the SAYC booklet and a card on the felt: a knowledge base holds one system; its Master holds every item; sets group items; a player carries sets plus settings; at the table every decision traces to the rule, the item, and the source passage.",
  },
  {
    title: "Playing a board",
    body: "Boards never self-start — ▶ start steps the AI one decision per beat, ❚❚ pauses, step ▸ advances exactly one, play to end finishes at once. undo rewinds paused so the AI can’t instantly replay what you’re inspecting.",
  },
  {
    title: "How the AI decides",
    body: "Every turn: collect the player’s knowledge, read the auction, check the forcing guard, walk every rule in band-then-priority order, pick a candidate. Nothing matched? The fallback fires, honestly labelled. No fallback? The engine floor acts, loudly marked.",
  },
  {
    title: "The Decisions rail",
    body: "The heart of verification: every entry opens into the full trace — which rules were considered, why each was rejected, what the settings said — with Flag and fix-at-the-table on each one. On mobile it’s the toggleable sheet at the base of the felt.",
  },
];

export default async function MobileGuidePage() {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  await requireFeature(context, "page.guide");

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
        Bridge
      </p>
      <h1 style={{ font: `500 30px ${F}`, color: "#1d1a15", margin: "4px 0 0" }}>
        Guide
      </h1>
      <p style={{ font: `400 13px/1.55 ${K}`, color: "#5e5749", margin: "8px 0 16px" }}>
        How knowledge works on this platform — every bid and card an AI makes
        traces to one rule inside one knowledge item, and everything you change
        is versioned.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {SECTIONS.map((g) => (
          <section
            key={g.title}
            style={{
              border: "1px solid #e7e1d3",
              borderRadius: 12,
              background: "#fffefa",
              padding: 14,
            }}
          >
            <h3 style={{ font: `500 16px ${F}`, color: "#1d1a15", margin: 0 }}>
              {g.title}
            </h3>
            <p style={{ font: `400 12.5px/1.55 ${K}`, color: "#5e5749", margin: "6px 0 0" }}>
              {g.body}
            </p>
          </section>
        ))}
      </div>
    </main>
  );
}

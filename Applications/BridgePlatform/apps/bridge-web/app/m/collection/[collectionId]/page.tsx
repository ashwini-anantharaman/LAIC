import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { LibraryItem } from "@laic/library-core";
import type { BridgeLibraryContent } from "@/lib/libraryComponent";
import { bridgeLibrary, libraryPrincipalOf } from "@/lib/libraryComponent";
import { getBridgeContext } from "@/lib/nexus";

const F = "var(--font-fraunces), serif";
const K = "var(--font-karla), sans-serif";

const KIND_LABEL: Record<string, string> = {
  board: "Boards",
  deal: "Deals",
  table: "Tables",
  play: "Recorded plays",
  drill: "Drills",
  puzzle: "Puzzles",
};

/** One designated collection: its items grouped by kind, playable in place.
 *  Being granted the collection IS the permission — no copies involved. */
export default async function CollectionPage({
  params,
}: Readonly<{ params: Promise<{ collectionId: string }> }>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  const { collectionId } = await params;

  const principal = await libraryPrincipalOf(context);
  let result: { collection: { name: string; description?: string }; items: LibraryItem<BridgeLibraryContent>[] } | null;
  try {
    result = await bridgeLibrary().getCollectionWithItems(principal, collectionId);
  } catch {
    redirect("/m/library"); // not granted
  }
  if (!result) notFound();
  const { collection, items } = result;

  const kinds = [...new Set(items.map((i) => i.kind))];

  return (
    <main
      style={{
        height: "100%",
        overflowY: "auto",
        background: "#fff4d7",
        padding: "48px 18px calc(96px + env(safe-area-inset-bottom))",
      }}
    >
      <Link href="/m/library" style={{ display: "inline-block", font: `600 13px ${K}`, color: "#105431", textDecoration: "none", marginBottom: 10 }}>
        ‹ Library
      </Link>
      <p style={{ font: `600 10px ${K}`, letterSpacing: ".28em", textTransform: "uppercase", color: "#a49d8e", margin: 0 }}>
        Collection
      </p>
      <h1 style={{ font: `500 26px ${F}`, color: "#1d1a15", margin: "5px 0 0" }}>{collection.name}</h1>
      {collection.description && (
        <p style={{ font: `400 13px/1.55 ${K}`, color: "#5e5749", margin: "8px 0 0" }}>{collection.description}</p>
      )}

      {kinds.map((kind) => (
        <section key={kind} style={{ marginTop: 20 }}>
          <p style={{ font: `600 10.5px ${K}`, letterSpacing: ".18em", textTransform: "uppercase", color: "#a49d8e", margin: "0 0 8px" }}>
            {KIND_LABEL[kind] ?? kind}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {items
              .filter((i) => i.kind === kind)
              .map((i) => {
                const c = i.content;
                const meta = [
                  c.dealer && `dealer ${c.dealer}`,
                  c.vul && `vul ${c.vul}`,
                  c.contractLabel,
                ]
                  .filter(Boolean)
                  .join(" · ");
                const playable = (kind === "board" || kind === "deal" || kind === "play") && !!c.hands;
                return (
                  <div
                    key={i.id}
                    style={{
                      background: "#fffefa",
                      border: "1px solid #e7e1d3",
                      borderRadius: 12,
                      padding: "13px 15px",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ font: `600 13.5px ${K}`, color: "#1d1a15", margin: 0 }}>{i.name}</p>
                      <p style={{ font: `400 11.5px ${K}`, color: "#a49d8e", margin: "3px 0 0" }}>{meta || i.kind}</p>
                    </div>
                    {playable && (
                      <Link
                        href={`/m/play-entry/${encodeURIComponent(i.id)}`}
                        style={{
                          flex: "none",
                          background: "#105431",
                          color: "#fff",
                          borderRadius: 999,
                          padding: "7px 15px",
                          font: `600 12.5px ${K}`,
                          textDecoration: "none",
                        }}
                      >
                        Play
                      </Link>
                    )}
                  </div>
                );
              })}
          </div>
        </section>
      ))}

      {items.length === 0 && (
        <p style={{ font: `400 13px ${K}`, color: "#a49d8e", marginTop: 18 }}>
          This collection is empty.
        </p>
      )}
    </main>
  );
}

import type { LibraryEntry, LibraryKind } from "@bridge/sessions";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  bridgeLibrary,
  canSeeProgramLibrary,
  libraryPrincipalOf,
  listLibraryFor,
} from "@/lib/libraryComponent";
import { getBridgeContext, isBridgeCoach } from "@/lib/nexus";
import {
  playEntryAction,
  resumePlayEntryAction,
  startTableEntryAction,
} from "@/app/bridge/library/actions";

const F = "var(--font-fraunces), serif";
const K = "var(--font-karla), sans-serif";

/** Shelf order from the mobile design (Boards default, like desktop). */
const SHELVES: { kind: LibraryKind; label: string; reserved?: boolean }[] = [
  { kind: "board", label: "Boards" },
  { kind: "deal", label: "Deals" },
  { kind: "table", label: "Tables" },
  { kind: "play", label: "Plays" },
  { kind: "drill", label: "Drills", reserved: true },
  { kind: "puzzle", label: "Puzzles", reserved: true },
];

function metaLine(e: LibraryEntry): string {
  if (e.kind === "table")
    return `lineup · ${Object.values(e.seats ?? {})
      .map((s) => s.label)
      .join(", ")}`;
  return (
    [
      e.dealer && `dealer ${e.dealer}`,
      e.vul && `vul ${e.vul}`,
      e.auction?.length ? `${e.auction.length} calls` : null,
      e.play?.length ? `${e.play.length} cards` : null,
      e.contractLabel,
      e.resultLabel,
    ]
      .filter(Boolean)
      .join(" · ") || "deal only"
  );
}

/** Mobile Library — same shelves and entries as the desktop library,
 *  re-skinned per the design; one action button per row. */
export default async function MobileLibraryPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ kind?: string; scope?: string }> }>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  const params = await searchParams;
  const active = (SHELVES.find((s) => s.kind === params.kind) ?? SHELVES[0]!).kind;

  // Library component (@laic/library-core): ONE library per person, decided
  // by the access policy — admins curate the program instance, everyone else
  // works in their own. No toggle; content arrives by Share/Assign copies.
  const coach = isBridgeCoach(context);
  const scope = (await canSeeProgramLibrary(context)) ? "program" : "mine";

  let all: LibraryEntry[] = [];
  try {
    all = await listLibraryFor(context, scope === "program" ? "program" : "mine");
  } catch {
    // Library backend not provisioned (migration 0015) — shelves show empty.
  }

  // Designated collections: curated program groupings this caller may view
  // (instance-wide viewers see all; others exactly their granted ones).
  const collections = await bridgeLibrary()
    .listCollections(await libraryPrincipalOf(context))
    .catch(() => []);
  const byKind = new Map<LibraryKind, LibraryEntry[]>();
  for (const s of SHELVES) byKind.set(s.kind, []);
  for (const e of all) byKind.get(e.kind)?.push(e);
  const entries = byKind.get(active) ?? [];
  const shelf = SHELVES.find((s) => s.kind === active)!;

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
      <h1 style={{ font: `500 30px ${F}`, color: "#1d1a15", margin: "4px 0 2px" }}>
        Library
      </h1>
      <p style={{ font: `400 13px/1.6 ${K}`, color: "#7b7466", margin: "0 0 22px", maxWidth: 340 }}>
        Snapshots you save from the table, author in the deal editor, or import
        as LIN / PBN.
      </p>

      {/* Creation row — same authoring entry points as desktop */}
      <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginBottom: 20 }}>
        {[
          { href: "/m/library/new", label: "+ New board" },
          { href: "/m/library/new?kind=deal", label: "+ New deal" },
          { href: "/bridge/library/tables/new", label: "+ New table" },
        ].map((b) => (
          <Link
            key={b.href}
            href={b.href}
            style={{
              border: "1px solid #205e63",
              background: "#fff",
              color: "#205e63",
              borderRadius: 22,
              padding: "9px 16px",
              font: `600 13px ${K}`,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            {b.label}
          </Link>
        ))}
      </div>

      {/* Designated collections — curated program groupings, read in place */}
      {collections.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <p style={{ font: `600 10.5px ${K}`, letterSpacing: ".18em", textTransform: "uppercase", color: "#a49d8e", margin: "0 0 8px" }}>
            Collections
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {collections.map((c) => (
              <Link
                key={c.id}
                href={`/m/collection/${c.id}`}
                style={{
                  border: "1px solid #d8e4e2",
                  background: "#eef4f3",
                  borderRadius: 14,
                  padding: "13px 16px",
                  textDecoration: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 18 }}>🗂️</span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: "block", font: `600 14px ${K}`, color: "#1d1a15" }}>{c.name}</span>
                  <span style={{ display: "block", font: `400 11.5px ${K}`, color: "#7b7466", marginTop: 2 }}>
                    {c.itemIds.length} item{c.itemIds.length === 1 ? "" : "s"}
                    {c.description ? ` · ${c.description}` : ""}
                  </span>
                </span>
                <span style={{ font: `600 14px ${K}`, color: "#205e63" }}>›</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Shelf chips */}
      <div
        style={{
          display: "flex",
          gap: 8,
          overflowX: "auto",
          // Keep the scrollbar clear of the chips and unobtrusive; touch
          // scrolling stays smooth in the WebView.
          paddingBottom: 14,
          marginBottom: 2,
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "thin",
          scrollbarColor: "#d3ccbb transparent",
        }}
      >
        {SHELVES.map((s) => {
          const on = s.kind === active;
          return (
            <Link
              key={s.kind}
              href={`/m/library?kind=${s.kind}`}
              style={{
                flex: "none",
                border: `1px solid ${on ? "#205e63" : "#d3ccbb"}`,
                background: on ? "#205e63" : "#fff",
                color: on ? "#fff" : "#5e5749",
                borderRadius: 22,
                padding: "8px 15px",
                font: `${on ? 600 : 400} 13px ${K}`,
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              {s.label}{" "}
              <span style={{ color: on ? "rgba(255,255,255,.7)" : "#a49d8e" }}>
                {byKind.get(s.kind)?.length ?? 0}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Entries */}
      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 11 }}>
        {shelf.reserved ? (
          <p
            style={{
              border: "1px dashed #d3ccbb",
              borderRadius: 10,
              padding: 16,
              textAlign: "center",
              font: `400 12px ${K}`,
              color: "#a49d8e",
            }}
          >
            This shelf is reserved — {shelf.label.toLowerCase()} arrive later.
          </p>
        ) : (
          <>
            {entries.map((e) => {
              const action =
                e.kind === "table"
                  ? { form: startTableEntryAction, label: "Start" }
                  : e.kind === "play"
                    ? { form: resumePlayEntryAction, label: "Resume" }
                    : { form: playEntryAction, label: "Play" };
              const playable = e.kind === "table" || !!e.hands;
              return (
                <div
                  key={e.entryId}
                  style={{
                    border: "1px solid #e7e1d3",
                    borderRadius: 14,
                    background: "#fffefa",
                    padding: "15px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        font: `600 14px ${K}`,
                        color: "#1d1a15",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {e.name}
                    </div>
                    <div
                      style={{
                        font: `400 11px ${K}`,
                        color: "#7b7466",
                        marginTop: 2,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {metaLine(e)}
                    </div>
                  </div>
                  {coach && !!e.hands && e.kind !== "table" && (
                    <Link
                      href={`/m/assign?entry=${encodeURIComponent(e.entryId)}`}
                      style={{
                        flex: "none",
                        border: "1px solid #205e63",
                        background: "#fff",
                        color: "#205e63",
                        borderRadius: 8,
                        padding: "5px 12px",
                        font: `600 12px ${K}`,
                        textDecoration: "none",
                      }}
                    >
                      Assign
                    </Link>
                  )}
                  {playable && (
                    <form action={action.form}>
                      <input type="hidden" name="entryId" value={e.entryId} />
                      <input type="hidden" name="mobile" value="1" />
                      <button
                        type="submit"
                        style={{
                          flex: "none",
                          border: "none",
                          background: "#205e63",
                          color: "#fff",
                          borderRadius: 8,
                          padding: "6px 13px",
                          font: `600 12px ${K}`,
                          cursor: "pointer",
                        }}
                      >
                        {action.label}
                      </button>
                    </form>
                  )}
                </div>
              );
            })}
            {entries.length === 0 && (
              <p
                style={{
                  border: "1px dashed #d3ccbb",
                  borderRadius: 10,
                  padding: 16,
                  textAlign: "center",
                  font: `400 12px ${K}`,
                  color: "#a49d8e",
                }}
              >
                Nothing on this shelf yet — save from a live board or import
                LIN/PBN on desktop.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}

import type { LibraryEntry, LibraryKind } from "@bridge/sessions";
import Link from "next/link";
import { redirect } from "next/navigation";
import { canUse, requireFeature } from "@/lib/access";
import { getBridgeContext } from "@/lib/nexus";
import { libraryStore } from "@/lib/sessions";
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
}: Readonly<{ searchParams: Promise<{ kind?: string }> }>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  await requireFeature(context, "page.library");
  const canResume = await canUse(context, "library.resume");
  const params = await searchParams;
  const active = (SHELVES.find((s) => s.kind === params.kind) ?? SHELVES[0]!).kind;

  let all: LibraryEntry[] = [];
  try {
    all = await libraryStore().listEntries();
  } catch {
    // Library backend not provisioned (migration 0015) — shelves show empty.
  }
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
      <p style={{ font: `400 12px/1.5 ${K}`, color: "#7b7466", margin: "0 0 14px" }}>
        Snapshots you save from the table, author in the deal editor, or import
        as LIN / PBN.
      </p>

      {/* Shelf chips */}
      <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 2 }}>
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
                borderRadius: 20,
                padding: "5px 12px",
                font: `${on ? 500 : 400} 12px ${K}`,
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
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 9 }}>
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
              const playable = canResume && (e.kind === "table" || !!e.hands);
              return (
                <div
                  key={e.entryId}
                  style={{
                    border: "1px solid #e7e1d3",
                    borderRadius: 12,
                    background: "#fffefa",
                    padding: "12px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        font: `600 13px ${K}`,
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

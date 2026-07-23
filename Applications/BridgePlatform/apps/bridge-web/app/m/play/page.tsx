import Link from "next/link";
import { redirect } from "next/navigation";
import { DealerControl } from "@/components/mobile/DealerControl";
import { ensureSeeds, kbStore } from "@/lib/kb";
import { getBridgeContext } from "@/lib/nexus";
import { libraryStore, sessionService } from "@/lib/sessions";
import { resumePlayEntryAction } from "@/app/bridge/library/actions";
import { quickPlayAction } from "@/app/bridge/table/actions";

const F = "var(--font-fraunces), serif";
const K = "var(--font-karla), sans-serif";

const card: React.CSSProperties = {
  border: "1px solid #e7e1d3",
  borderRadius: 16,
  background: "#fffefa",
  padding: 16,
};
const outlineRow: React.CSSProperties = {
  width: "100%",
  border: "1px solid #d3ccbb",
  background: "#fff",
  color: "#1d1a15",
  borderRadius: 10,
  padding: 11,
  font: `500 13px ${K}`,
  cursor: "pointer",
  boxSizing: "border-box",
};

/** Mobile lobby — same data round-trip as the desktop Play landing
 *  (app/bridge/table/page.tsx), re-skinned per the mobile design. */
export default async function MobilePlayPage() {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  await ensureSeeds();

  const [kbs, recent, plays] = await Promise.all([
    kbStore().listKbs(),
    sessionService().listRecent(),
    libraryStore()
      .listEntries("play")
      .then((e) => e.slice(0, 8))
      .catch(() => [] as Awaited<ReturnType<ReturnType<typeof libraryStore>["listEntries"]>>),
  ]);

  const archived = new Set(kbs.filter((k) => k.archived).map((k) => k.kbId));

  // Collapse active sittings to the most recent per board name (same logic as
  // the desktop lobby — list sorted newest-first, keep the first of each name).
  const seenBoardNames = new Set<string>();
  const actives = recent
    .filter(
      (s) =>
        s.createdBy === context.nexusUserId &&
        s.status === "active" &&
        !archived.has(s.kbId),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .filter((s) => {
      if (seenBoardNames.has(s.board.name)) return false;
      seenBoardNames.add(s.board.name);
      return true;
    })
    .slice(0, 8);

  const dealable = kbs.some((k) => !k.archived && k.liveCompileId);
  const single = actives.length === 1 ? actives[0] : undefined;

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
        Play
      </p>
      <h1
        style={{
          font: `500 30px ${F}`,
          color: "#1d1a15",
          margin: "4px 0 0",
          letterSpacing: "-.01em",
        }}
      >
        Take a seat
      </h1>
      <p style={{ font: `400 13px/1.55 ${K}`, color: "#5e5749", margin: "8px 0 0" }}>
        Quickplay puts you on a board against the house lineup. Customize lets
        you choose the players, table and deal.
      </p>

      {/* Quickplay */}
      <section style={{ marginTop: 22, ...card }}>
        <h2 style={{ font: `500 18px ${F}`, color: "#1d1a15", margin: 0 }}>
          Quickplay
        </h2>
        <p style={{ font: `400 12px/1.5 ${K}`, color: "#7b7466", margin: "6px 0 0" }}>
          Pick up a board where you left off, resume a saved play, or deal a
          fresh one against the strongest house set.
        </p>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {single && (
            <Link
              href={`/m/table/${single.sessionId}`}
              style={{
                width: "100%",
                border: "none",
                background: "#205e63",
                color: "#fff",
                borderRadius: 10,
                padding: 12,
                font: `600 14px ${K}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                textDecoration: "none",
                boxSizing: "border-box",
              }}
            >
              <span>Resume {single.board.name}</span>
              <span style={{ opacity: 0.7, fontWeight: 400, fontSize: 11 }}>
                {single.updatedAt.slice(5, 16).replace("T", " ")}
              </span>
            </Link>
          )}
          {actives.length > 1 && (
            <div
              style={{
                border: "1px solid #d3ccbb",
                borderRadius: 10,
                background: "#fff",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "9px 12px 5px",
                  font: `600 11px ${K}`,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                  color: "#a49d8e",
                }}
              >
                Resume a board · {actives.length} in progress
              </div>
              {actives.map((s) => (
                <Link
                  key={s.sessionId}
                  href={`/m/table/${s.sessionId}`}
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 10,
                    padding: "9px 12px",
                    borderTop: "1px solid #f0ebe0",
                    textDecoration: "none",
                  }}
                >
                  <span style={{ font: `600 13px ${K}`, color: "#1d1a15" }}>
                    {s.board.name}
                  </span>
                  <span
                    style={{
                      marginLeft: "auto",
                      font: `400 11px ${K}`,
                      color: "#a49d8e",
                    }}
                  >
                    {s.updatedAt.slice(5, 16).replace("T", " ")}
                  </span>
                </Link>
              ))}
            </div>
          )}
          {dealable && (
            <form
              action={quickPlayAction}
              style={{
                ...outlineRow,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                padding: "6px 11px",
              }}
            >
              <input type="hidden" name="mobile" value="1" />
              <button
                type="submit"
                style={{
                  border: "none",
                  background: "none",
                  color: "#1d1a15",
                  font: `500 13px ${K}`,
                  cursor: "pointer",
                  padding: "5px 0",
                }}
              >
                Deal a fresh board
              </button>
              <DealerControl />
            </form>
          )}
          {plays.length > 0 && (
            <details>
              <summary
                style={{
                  ...outlineRow,
                  padding: 10,
                  textAlign: "left",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  listStyle: "none",
                }}
              >
                <span>Resume a saved play ▾</span>
                <span style={{ color: "#a49d8e", fontSize: 11 }}>
                  {plays.length} saved
                </span>
              </summary>
              <div
                style={{
                  marginTop: 6,
                  border: "1px solid #e7e1d3",
                  borderRadius: 10,
                  background: "#fffefa",
                  overflow: "hidden",
                }}
              >
                {plays.map((p) => (
                  <form key={p.entryId} action={resumePlayEntryAction}>
                    <input type="hidden" name="entryId" value={p.entryId} />
                    <input type="hidden" name="mobile" value="1" />
                    <button
                      type="submit"
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "baseline",
                        gap: 10,
                        border: "none",
                        borderTop: "1px solid #f0ebe0",
                        background: "none",
                        padding: "9px 12px",
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      <span style={{ font: `600 13px ${K}`, color: "#1d1a15" }}>
                        {p.name}
                      </span>
                      {p.resultLabel && (
                        <span style={{ font: `400 11px ${K}`, color: "#a49d8e" }}>
                          {p.resultLabel}
                        </span>
                      )}
                      <span
                        style={{
                          marginLeft: "auto",
                          font: `400 11px ${K}`,
                          color: "#a49d8e",
                        }}
                      >
                        {p.createdAt.slice(5, 16).replace("T", " ")}
                      </span>
                    </button>
                  </form>
                ))}
              </div>
            </details>
          )}
        </div>
      </section>

      {/* Customize */}
      <section style={{ marginTop: 14, ...card }}>
        <h2 style={{ font: `500 18px ${F}`, color: "#1d1a15", margin: 0 }}>
          Customize
        </h2>
        <p style={{ font: `400 12px/1.5 ${K}`, color: "#7b7466", margin: "6px 0 0" }}>
          Build a table seat by seat — any player from any knowledge base, your
          seat, the deal seed — and save lineups you like.
        </p>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <Link
            href="/bridge/library/tables/new"
            style={{
              ...outlineRow,
              font: `600 13px ${K}`,
              textAlign: "center",
              textDecoration: "none",
              display: "block",
            }}
          >
            Set up a table
          </Link>
          <Link
            href="/m/library?kind=table"
            style={{
              width: "100%",
              border: "none",
              background: "none",
              color: "#205e63",
              padding: 8,
              font: `500 13px ${K}`,
              textDecoration: "underline",
              textUnderlineOffset: 3,
              textAlign: "center",
              display: "block",
              boxSizing: "border-box",
            }}
          >
            Saved tables →
          </Link>
        </div>
      </section>
    </main>
  );
}

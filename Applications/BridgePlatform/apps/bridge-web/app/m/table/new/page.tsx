import Link from "next/link";
import { redirect } from "next/navigation";
import { arenaSets } from "@/lib/arena";
import { requireFeature } from "@/lib/access";
import { ensureSeeds, kbService, kbStore } from "@/lib/kb";
import { getBridgeContext } from "@/lib/nexus";
import { createTableEntryAction } from "@/app/bridge/library/tables/new/actions";
import { arenaPlayAction, createSessionAction } from "@/app/bridge/table/actions";

const F = "var(--font-fraunces), serif";
const K = "var(--font-karla), sans-serif";
const SEATS = ["N", "E", "S", "W"] as const;

const card: React.CSSProperties = {
  border: "1px solid #e7e1d3",
  borderRadius: 16,
  background: "#fffefa",
  padding: 16,
};
const field: React.CSSProperties = {
  width: "100%",
  border: "1px solid #e7e1d3",
  borderRadius: 10,
  padding: "10px 12px",
  font: `500 13px ${K}`,
  color: "#1d1a15",
  background: "#fffefa",
  boxSizing: "border-box",
};
const fieldLabel: React.CSSProperties = {
  display: "block",
  font: `600 10px ${K}`,
  letterSpacing: ".08em",
  textTransform: "uppercase",
  color: "#a49d8e",
  margin: "0 0 4px",
};

/** Mobile "Set up a table" — the same data + actions as the desktop table
 *  builder (app/bridge/library/tables/new), re-skinned per the mobile design.
 *  Knowledge-set quick starts (Play / Watch) plus a custom seat-by-seat form;
 *  everything posts mobile=1 so sessions open in the /m/table chrome and a
 *  saved lineup lands on the mobile library's Tables shelf. The constrained
 *  drill stays desktop-only. */
export default async function MobileNewTablePage() {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  await requireFeature(context, "page.library");
  await ensureSeeds();

  const store = kbStore();
  const kbs = (await store.listKbs()).filter((k) => !k.archived);
  const arenas = (
    await Promise.all(
      kbs
        .filter((kb) => kb.liveCompileId)
        .map(async (kb) => {
          const [compiled, players] = await Promise.all([
            kbService().liveCompile(kb.kbId),
            store.listPlayersForKb(kb.kbId),
          ]);
          if (!compiled) return null;
          return { kb, sets: arenaSets(compiled), players };
        }),
    )
  ).filter((a) => a !== null);

  return (
    <main
      style={{
        height: "100%",
        overflowY: "auto",
        background: "#fff4d7",
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
      <h1 style={{ font: `500 30px ${F}`, color: "#1d1a15", margin: "4px 0 0" }}>
        Set up a table
      </h1>
      <p style={{ font: `400 13px/1.55 ${K}`, color: "#5e5749", margin: "8px 0 0" }}>
        Pick a knowledge set to play against right away, or build the lineup
        seat by seat and save it to the library.
      </p>

      {arenas.length === 0 && (
        <p
          style={{
            marginTop: 22,
            border: "1px dashed #d3ccbb",
            borderRadius: 10,
            padding: 16,
            textAlign: "center",
            font: `400 12px ${K}`,
            color: "#a49d8e",
          }}
        >
          No knowledge base compiles yet — build one in the desktop workspace
          and its knowledge sets appear here.
        </p>
      )}

      {arenas.map(({ kb, sets, players }) => (
        <section key={kb.kbId} style={{ marginTop: 18, ...card }}>
          <h2 style={{ font: `500 18px ${F}`, color: "#1d1a15", margin: 0 }}>{kb.name}</h2>

          {/* Knowledge-set quick starts */}
          {sets.length === 0 ? (
            <p style={{ font: `400 12px/1.5 ${K}`, color: "#a49d8e", margin: "8px 0 0" }}>
              No knowledge sets yet — create one on desktop to unlock this table.
            </p>
          ) : (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {sets.map((pack) => (
                <div
                  key={pack.packId}
                  style={{
                    border: "1px solid #e7e1d3",
                    borderRadius: 12,
                    background: "#fffefa",
                    padding: "11px 12px",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
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
                      {pack.name}
                    </div>
                    <div style={{ font: `400 11px ${K}`, color: "#7b7466", marginTop: 2 }}>
                      {pack.itemIds.length} knowledge items
                    </div>
                  </div>
                  <form action={arenaPlayAction} style={{ flex: "none" }}>
                    <input type="hidden" name="kbId" value={kb.kbId} />
                    <input type="hidden" name="packId" value={pack.packId} />
                    <input type="hidden" name="mobile" value="1" />
                    <button
                      type="submit"
                      style={{
                        border: "none",
                        background: "#105431",
                        color: "#fff",
                        borderRadius: 8,
                        padding: "6px 14px",
                        font: `600 12px ${K}`,
                        cursor: "pointer",
                      }}
                    >
                      Play
                    </button>
                  </form>
                  <form action={arenaPlayAction} style={{ flex: "none" }}>
                    <input type="hidden" name="kbId" value={kb.kbId} />
                    <input type="hidden" name="packId" value={pack.packId} />
                    <input type="hidden" name="watch" value="1" />
                    <input type="hidden" name="mobile" value="1" />
                    <button
                      type="submit"
                      title="Four house players, you observe"
                      style={{
                        border: "1px solid #d3ccbb",
                        background: "#fff",
                        color: "#5e5749",
                        borderRadius: 8,
                        padding: "6px 12px",
                        font: `500 12px ${K}`,
                        cursor: "pointer",
                      }}
                    >
                      Watch
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}

          {/* Custom lineup, tucked away like the desktop's details block */}
          {players.length > 0 && (
            <details style={{ marginTop: 10 }}>
              <summary
                style={{
                  listStyle: "none",
                  cursor: "pointer",
                  border: "1px solid #d3ccbb",
                  background: "#fff",
                  color: "#1d1a15",
                  borderRadius: 10,
                  padding: 10,
                  font: `500 13px ${K}`,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>Custom lineup ▾</span>
                <span style={{ color: "#a49d8e", fontSize: 11 }}>
                  {players.length} players
                </span>
              </summary>
              <form
                action={createSessionAction}
                style={{
                  marginTop: 8,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <input type="hidden" name="kbId" value={kb.kbId} />
                <input type="hidden" name="mobile" value="1" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <label style={{ minWidth: 0 }}>
                    <span style={fieldLabel}>Your seat</span>
                    <select name="humanSeat" defaultValue="S" style={field}>
                      <option value="">none — watch</option>
                      {SEATS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ minWidth: 0 }}>
                    <span style={fieldLabel}>Deal seed</span>
                    <input name="seed" type="number" defaultValue={7} style={field} />
                  </label>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {SEATS.map((seat) => (
                    <label key={seat} style={{ minWidth: 0 }}>
                      <span style={fieldLabel}>Seat {seat}</span>
                      <select
                        name={`player:${seat}`}
                        defaultValue={players[0]?.playerId ?? ""}
                        style={field}
                      >
                        {players.map((p) => (
                          <option key={p.playerId} value={p.playerId}>
                            {p.name}
                            {p.validationStatus === "invalid" ? " (incomplete)" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <input
                  name="name"
                  placeholder={`${kb.name} lineup`}
                  aria-label="Table name (for saving)"
                  style={{ ...field, fontWeight: 400 }}
                />
                <textarea
                  name="notes"
                  rows={2}
                  placeholder="Notes (optional)"
                  aria-label="Notes"
                  style={{ ...field, fontWeight: 400, resize: "vertical" }}
                />
                <button
                  type="submit"
                  style={{
                    border: "none",
                    background: "#105431",
                    color: "#fff",
                    borderRadius: 10,
                    padding: 12,
                    font: `600 13px ${K}`,
                    cursor: "pointer",
                  }}
                >
                  Deal a board
                </button>
                <button
                  type="submit"
                  formAction={createTableEntryAction}
                  style={{
                    border: "1px solid #d3ccbb",
                    background: "#fff",
                    color: "#1d1a15",
                    borderRadius: 10,
                    padding: 11,
                    font: `500 13px ${K}`,
                    cursor: "pointer",
                  }}
                >
                  Save lineup to library
                </button>
              </form>
            </details>
          )}
        </section>
      ))}

      <Link
        href="/m/play"
        style={{
          marginTop: 14,
          width: "100%",
          border: "none",
          background: "none",
          color: "#105431",
          padding: 8,
          font: `500 13px ${K}`,
          textDecoration: "underline",
          textUnderlineOffset: 3,
          textAlign: "center",
          display: "block",
          boxSizing: "border-box",
        }}
      >
        ← Back to Play
      </Link>
    </main>
  );
}

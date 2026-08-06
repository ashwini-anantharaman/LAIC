import type { KbPlayer, KnowledgeBase, PlayerValidationStatus } from "@bridge/kb";
import Link from "next/link";
import { redirect } from "next/navigation";
import { canUse, requireFeature } from "@/lib/access";
import { benAvailable, BEN_SEAT_LABEL } from "@/lib/benSeat";
import { ensureSeeds, kbService, kbStore } from "@/lib/kb";
import { getBridgeContext } from "@/lib/nexus";
import { tryBenAction, tryPlayerAction } from "@/app/bridge/players/actions";

const F = "var(--font-fraunces), serif";
const K = "var(--font-karla), sans-serif";

/** Design badge palette: valid green, draft amber, incomplete red. */
const BADGE: Record<PlayerValidationStatus, { label: string; fg: string; bg: string }> = {
  valid: { label: "valid", fg: "#256e42", bg: "#e3efe7" },
  published: { label: "valid", fg: "#256e42", bg: "#e3efe7" },
  draft: { label: "draft", fg: "#a16207", bg: "#fdf3df" },
  invalid: { label: "incomplete", fg: "#8a2d23", bg: "#f6e2df" },
};

const actionBtn: React.CSSProperties = {
  border: "1px solid #d3ccbb",
  background: "#fff",
  color: "#5e5749",
  borderRadius: 8,
  padding: "6px 12px",
  font: `500 12px ${K}`,
  cursor: "pointer",
};

/** Mobile Players — same data as the desktop roster (KBs, players per KB,
 *  live-compile pack names), re-skinned per the design. */
export default async function MobilePlayersPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ kb?: string; tab?: string }> }>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  await requireFeature(context, "page.players");
  const [canTry, canAiTab] = await Promise.all([
    canUse(context, "players.try"),
    canUse(context, "players.ai_tab"),
  ]);
  await ensureSeeds();
  const { kb: kbParam, tab } = await searchParams;
  const aiTab = tab === "ai";

  const store = kbStore();
  const kbs = (await store.listKbs()).filter((k) => !k.archived);
  const withPlayers: { kb: KnowledgeBase; players: KbPlayer[] }[] = await Promise.all(
    kbs.map(async (kb) => ({ kb, players: await store.listPlayersForKb(kb.kbId) })),
  );
  const activeKb = withPlayers.find(({ kb }) => kb.kbId === kbParam) ?? withPlayers[0];

  const compiled = activeKb ? await kbService().liveCompile(activeKb.kb.kbId) : null;
  const packById = new Map((compiled?.packs ?? []).map((p) => [p.packId, p]));

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
        Bridge
      </p>
      <h1 style={{ font: `500 30px ${F}`, color: "#1d1a15", margin: "4px 0 14px" }}>
        Players
      </h1>

      {/* Tabs: Configured (KB-assembled) | AI (engine-backed — BEN) */}
      <div
        style={{
          display: "flex",
          gap: 18,
          borderBottom: "1px solid #e7e1d3",
          marginBottom: 14,
        }}
      >
        <Link
          href="/m/players"
          style={{
            borderBottom: `2px solid ${aiTab ? "transparent" : "#105431"}`,
            paddingBottom: 8,
            font: `${aiTab ? 400 : 600} 13px ${K}`,
            color: aiTab ? "#a49d8e" : "#173c40",
            textDecoration: "none",
          }}
        >
          Configured players
        </Link>
        <Link
          href="/m/players?tab=ai"
          style={{
            borderBottom: `2px solid ${aiTab ? "#105431" : "transparent"}`,
            paddingBottom: 8,
            font: `${aiTab ? 600 : 400} 13px ${K}`,
            color: aiTab ? "#173c40" : "#a49d8e",
            textDecoration: "none",
          }}
        >
          AI players
        </Link>
      </div>

      {aiTab ? (
        canAiTab && benAvailable() ? (
          <div
            style={{
              border: "1px solid #e7e1d3",
              borderRadius: 12,
              background: "#fffefa",
              padding: "13px 14px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <span style={{ font: `600 14px ${K}`, color: "#1d1a15" }}>
                {BEN_SEAT_LABEL} engine
              </span>
              <span
                style={{
                  flex: "none",
                  font: `700 8px ${K}`,
                  letterSpacing: ".05em",
                  textTransform: "uppercase",
                  color: "#105431",
                  background: "#e2ecec",
                  padding: "3px 7px",
                  borderRadius: 6,
                }}
              >
                neural
              </span>
            </div>
            <p style={{ margin: "5px 0 0", font: `400 11px ${K}`, color: "#7b7466" }}>
              Engine-backed — bids and plays from BEN&apos;s trained models, not from
              knowledge packs. Also seatable anywhere from a live board&apos;s seat menus.
            </p>
            {canTry && (
              <div style={{ marginTop: 11, display: "flex", gap: 7 }}>
                <form action={tryBenAction}>
                  {activeKb && <input type="hidden" name="kbId" value={activeKb.kb.kbId} />}
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
                <form action={tryBenAction}>
                  {activeKb && <input type="hidden" name="kbId" value={activeKb.kb.kbId} />}
                  <input type="hidden" name="watch" value="1" />
                  <input type="hidden" name="mobile" value="1" />
                  <button type="submit" style={actionBtn}>
                    Watch 4
                  </button>
                </form>
              </div>
            )}
          </div>
        ) : (
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
            Engine-backed players (BEN) live here — BEN_ENDPOINT isn&apos;t configured on
            this server, so no engine is available to seat.
          </p>
        )
      ) : (
        <>
      {/* KB chips */}
      <div
        style={{
          display: "flex",
          gap: 7,
          overflowX: "auto",
          paddingBottom: 2,
        }}
      >
        {withPlayers.map(({ kb, players }) => {
          const active = kb.kbId === activeKb?.kb.kbId;
          return (
            <Link
              key={kb.kbId}
              href={`/m/players?kb=${kb.kbId}`}
              style={{
                flex: "none",
                border: `1px solid ${active ? "#105431" : "#d3ccbb"}`,
                background: active ? "#105431" : "#fff",
                color: active ? "#fff" : "#5e5749",
                borderRadius: 20,
                padding: "5px 12px",
                font: `${active ? 500 : 400} 12px ${K}`,
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              {kb.systemLabel}{" "}
              <span style={{ color: active ? "rgba(255,255,255,.7)" : "#a49d8e" }}>
                {players.length}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Player cards */}
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {(activeKb?.players ?? []).map((p) => {
          const badge = BADGE[p.validationStatus] ?? BADGE.draft;
          const sets =
            (p.enabledPackIds.map((id) => packById.get(id)?.name ?? id).join(" + ") ||
              "no packs") +
            " · " +
            p.decisionPolicyId.replace("_", " ");
          return (
            <div
              key={p.playerId}
              style={{
                border: "1px solid #e7e1d3",
                borderRadius: 12,
                background: "#fffefa",
                padding: "13px 14px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <span style={{ font: `600 14px ${K}`, color: "#1d1a15" }}>{p.name}</span>
                <span
                  style={{
                    flex: "none",
                    font: `700 8px ${K}`,
                    letterSpacing: ".05em",
                    textTransform: "uppercase",
                    color: badge.fg,
                    background: badge.bg,
                    padding: "3px 7px",
                    borderRadius: 6,
                  }}
                >
                  {badge.label}
                </span>
              </div>
              <p style={{ margin: "5px 0 0", font: `400 11px ${K}`, color: "#7b7466" }}>
                {sets}
              </p>
              {canTry && (
                <div style={{ marginTop: 11, display: "flex", gap: 7 }}>
                  <form action={tryPlayerAction}>
                    <input type="hidden" name="playerId" value={p.playerId} />
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
                  <form action={tryPlayerAction}>
                    <input type="hidden" name="playerId" value={p.playerId} />
                    <input type="hidden" name="watch" value="1" />
                    <input type="hidden" name="mobile" value="1" />
                    <button type="submit" style={actionBtn}>
                      Watch 4
                    </button>
                  </form>
                  {/* No Edit here: the player editor (packs, policies, validation,
                      simulation) is a desktop workbench — deliberately kept out of
                      the mobile flow rather than dumping users into desktop chrome. */}
                </div>
              )}
            </div>
          );
        })}
        {(activeKb?.players ?? []).length === 0 && (
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
            No players here yet — create one from a knowledge set on desktop.
          </p>
        )}
      </div>
        </>
      )}
    </main>
  );
}

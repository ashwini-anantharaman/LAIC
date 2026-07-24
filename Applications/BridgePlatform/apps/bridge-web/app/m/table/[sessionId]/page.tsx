// Mobile TABLE screen (felt design) — full functional parity with the desktop
// table page (app/bridge/table/[sessionId]/page.tsx). Server component with
// client islands (MobileAutoAdvance, MobileBidBox, SaveSheet, FeedSheet) and
// server-action forms (card play, bids, undo/rewind/new-deal/play-to-end,
// save, flag). Reuses the SAME session fold, ruleIndex, learner gating and
// dummy-visibility logic as the desktop; the decisions feed reuses the desktop
// English helpers (buildRuleIndex + decisionText) via MobileDecisionCard.

import {
  callLabel,
  isLogicEvent,
  rankLabel,
  type Card,
  type Seat,
  type Suit,
} from "@bridge/events";
import { legalCalls, legalPlays, resultLabel, scoreBoard } from "@bridge/engine";
import { canAccessAdminArea } from "@bridge/nexus-client";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { buildRuleIndex } from "@/components/table/decisionText";
import { FeedSheet } from "@/components/mobile/table/FeedSheet";
import { MobileAutoAdvance } from "@/components/mobile/table/MobileAutoAdvance";
import { MobileBidBox } from "@/components/mobile/table/MobileBidBox";
import { MobileDealEditor } from "@/components/mobile/table/MobileDealEditor";
import { MobileDecisionCard } from "@/components/mobile/table/MobileDecisionCard";
import { MobileFixView } from "@/components/mobile/table/MobileFixView";
import { MobileItemEditor } from "@/components/mobile/table/MobileItemEditor";
import { MobileSheetShell } from "@/components/mobile/table/MobileSheetShell";
import { SaveSheet } from "@/components/mobile/table/SaveSheet";
import { kbStore } from "@/lib/kb";
import { getBridgeContext } from "@/lib/nexus";
import { sessionService } from "@/lib/sessions";
import { saveItemAction } from "@/app/bridge/kb/actions";
import {
  newDealAction,
  playCardAction,
  playToEndAction,
  rewindAction,
  undoAction,
} from "@/app/bridge/table/actions";

const GLYPH: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const isRed = (s: Suit) => s === "H" || s === "D";
const DISPLAY_SUITS: Suit[] = ["S", "H", "C", "D"];
const PARTNER: Record<Seat, Seat> = { N: "S", S: "N", E: "W", W: "E" };

const FONT_KARLA = "var(--font-karla), sans-serif";
const FONT_FRAUNCES = "var(--font-fraunces), serif";

const FROSTED_PILL: React.CSSProperties = {
  flex: "none",
  border: "1px solid rgba(255,255,255,.18)",
  background: "rgba(255,255,255,.1)",
  color: "#e7e1d3",
  borderRadius: 9,
  padding: "7px 11px",
  font: `600 11px ${FONT_KARLA}`,
  cursor: "pointer",
  whiteSpace: "nowrap",
  WebkitBackdropFilter: "blur(6px)",
  backdropFilter: "blur(6px)",
  textDecoration: "none",
  display: "inline-block",
};

export default async function MobileTablePage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{
    mode?: string;
    hands?: string;
    saved?: string;
    error?: string;
    paused?: string;
    fix?: string;
    fixMode?: string;
    fixed?: string;
    fixError?: string;
    editDeal?: string;
  }>;
}>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  const { sessionId } = await params;
  const {
    mode,
    hands: handsParam,
    saved,
    error,
    paused,
    fix,
    fixMode,
    fixed,
    fixError,
    editDeal,
  } = await searchParams;

  let view;
  try {
    view = await sessionService().view(sessionId);
  } catch {
    notFound();
  }
  const { record, state, actingSeat, actingIsHuman } = view;

  const isFellow = canAccessAdminArea(context);
  const learnerMode = mode === "learner" || !isFellow;
  const mySeat = (Object.entries(record.seats) as [Seat, (typeof record.seats)[Seat]][]).find(
    ([, c]) => c.kind === "human" && c.nexusUserId === context.nexusUserId,
  )?.[0];

  const dummy =
    state.phase !== "auction" && state.contract ? PARTNER[state.contract.declarer] : null;
  const showAll = handsParam === "all" || (handsParam !== "mine" && !mySeat && !learnerMode);
  // Dummy spreads only after the opening lead (real-bridge timing).
  const leadMade = state.tricks.length > 0 && (state.tricks[0]?.plays.length ?? 0) > 0;
  const canSee = (seat: Seat) =>
    showAll ||
    seat === mySeat ||
    (seat === dummy && leadMade) ||
    state.phase === "complete";

  const myTurn =
    actingIsHuman &&
    record.seats[actingSeat].kind === "human" &&
    (record.seats[actingSeat] as { nexusUserId: string }).nexusUserId === context.nexusUserId;
  const legalNow = state.phase === "play" && myTurn ? legalPlays(state, state.turn) : null;
  const callsNow =
    state.phase === "auction" && myTurn ? legalCalls(state.auction, state.turn) : null;
  const score = scoreBoard(state);
  const aiToAct = !actingIsHuman && state.phase !== "complete";

  const compiled = await sessionService()
    .compiledFor(record)
    .catch(() => undefined);
  const ruleIndex = compiled ? buildRuleIndex(compiled) : undefined;
  const logicEvents = record.events.filter(isLogicEvent);

  // Fix-at-the-table overlay (fellows only, like desktop): ?fix=<itemId>
  // opens view-first; &fixMode=edit swaps in the phone editor whose save
  // re-pins THIS session to the fresh compile and comes back paused.
  const fixItem = fix && !learnerMode ? await kbStore().getItem(fix).catch(() => null) : null;

  const seatLabel = (seat: Seat) => {
    const config = record.seats[seat];
    return config.kind === "human"
      ? config.nexusUserId === context.nexusUserId
        ? "you"
        : "human"
      : config.label;
  };

  const mobileHref = (extra: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    if (learnerMode && isFellow) q.set("mode", "learner");
    for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/m/table/${sessionId}?${s}` : `/m/table/${sessionId}`;
  };

  // ---- card / hand rendering helpers (felt design) ------------------------
  const cardFace = (card: Card, big: boolean) => (
    <span
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        color: isRed(card.suit) ? "#8a2d23" : "#161310",
      }}
    >
      <span style={{ font: `600 ${big ? 15 : 12}px ${FONT_KARLA}`, lineHeight: 0.9 }}>
        {rankLabel(card.rank)}
      </span>
      <span style={{ fontSize: big ? 12 : 10, lineHeight: 1, marginTop: 1 }}>
        {GLYPH[card.suit]}
      </span>
    </span>
  );

  // A face-up hand as an overlapping fan (North / South). Legal cards for the
  // seat-to-play are raised, outlined and tappable (real playCardAction).
  const faceFan = (seat: Seat, big: boolean) => {
    const hand = state.hands[seat];
    const sorted = DISPLAY_SUITS.flatMap((s) =>
      hand.filter((c) => c.suit === s).sort((a, b) => b.rank - a.rank),
    );
    const interactive = legalNow !== null && state.turn === seat;
    const legalSet = new Set((interactive ? legalNow! : []).map((c) => `${c.suit}${c.rank}`));
    const w = big ? 38 : 20;
    const overlap = big ? 16 : 11;
    return (
      <div style={{ display: "flex", alignItems: "flex-end", minHeight: big ? 56 : 32 }}>
        {sorted.map((card, i) => {
          const legal = interactive && legalSet.has(`${card.suit}${card.rank}`);
          const baseStyle: React.CSSProperties = {
            flex: "none",
            width: w,
            aspectRatio: "5 / 7",
            background: "#fff",
            border: legal ? "none" : "1px solid #d3ccbb",
            borderRadius: 6,
            boxShadow: "0 1px 2px rgba(0,0,0,.2)",
            padding: "2px 0 0 3px",
            marginLeft: i > 0 ? -overlap : 0,
          };
          if (interactive) {
            if (legal) {
              return (
                <form
                  key={`${card.suit}${card.rank}`}
                  action={playCardAction}
                  style={{ display: "contents" }}
                >
                  <input type="hidden" name="sessionId" value={sessionId} />
                  <input type="hidden" name="suit" value={card.suit} />
                  <input type="hidden" name="rank" value={card.rank} />
                  <input type="hidden" name="mobile" value="1" />
                  <button
                    type="submit"
                    aria-label={`Play ${rankLabel(card.rank)}${GLYPH[card.suit]}`}
                    style={{
                      ...baseStyle,
                      cursor: "pointer",
                      outline: "2px solid #7cc0c4",
                      transform: "translateY(-11px)",
                    }}
                  >
                    {cardFace(card, big)}
                  </button>
                </form>
              );
            }
            return (
              <span key={`${card.suit}${card.rank}`} style={{ ...baseStyle, opacity: 0.42 }}>
                {cardFace(card, big)}
              </span>
            );
          }
          return (
            <span key={`${card.suit}${card.rank}`} style={baseStyle}>
              {cardFace(card, big)}
            </span>
          );
        })}
        {sorted.length === 0 && <span style={{ color: "rgba(255,255,255,.5)" }}>—</span>}
      </div>
    );
  };

  // A hidden hand: a compact fan of petrol backs.
  const backsFan = (seat: Seat) => {
    const side = seat === "E" || seat === "W";
    const w = side ? 20 : 18;
    const count = Math.min(state.hands[seat].length, side ? 5 : 9);
    return (
      <div style={{ display: "flex", flexDirection: side ? "column" : "row", alignItems: "center" }}>
        {Array.from({ length: count }, (_, i) => (
          <span
            key={i}
            style={{
              flex: "none",
              width: w,
              aspectRatio: "5 / 7",
              borderRadius: 4,
              background: "#3e6f7d",
              backgroundImage:
                "repeating-linear-gradient(135deg,transparent,transparent 3px,rgba(255,255,255,.08) 3px,rgba(255,255,255,.08) 6px)",
              border: "1px solid #1f3a42",
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,.16)",
              marginTop: side && i > 0 ? -((w * 7) / 5 - 7) : 0,
              marginLeft: !side && i > 0 ? -(w - 7) : 0,
            }}
          />
        ))}
      </div>
    );
  };

  // A visible side hand (East / West, incl. shown dummy): compact suit rows.
  // Legal cards for the seat-to-play are tappable.
  const suitRows = (seat: Seat) => {
    const hand = state.hands[seat];
    const interactive = legalNow !== null && state.turn === seat;
    const legalSet = new Set((interactive ? legalNow! : []).map((c) => `${c.suit}${c.rank}`));
    return (
      <div
        style={{
          width: "100%",
          background: "rgba(255,255,255,.95)",
          borderRadius: 7,
          padding: "4px 6px",
          boxShadow: "0 1px 4px rgba(0,0,0,.2)",
          display: "flex",
          flexDirection: "column",
          gap: 1,
        }}
      >
        {DISPLAY_SUITS.map((suit) => {
          const cards = hand.filter((c) => c.suit === suit).sort((a, b) => b.rank - a.rank);
          return (
            <div key={suit} style={{ display: "flex", gap: 4, alignItems: "baseline", flexWrap: "wrap" }}>
              <span
                style={{
                  font: `600 10px ${FONT_KARLA}`,
                  color: isRed(suit) ? "#8a2d23" : "#161310",
                  flex: "none",
                }}
              >
                {GLYPH[suit]}
              </span>
              {cards.length === 0 && (
                <span style={{ color: "#c3bba8", font: `500 10px ${FONT_KARLA}` }}>—</span>
              )}
              {cards.map((card) => {
                const legal = interactive && legalSet.has(`${card.suit}${card.rank}`);
                const rankStyle: React.CSSProperties = {
                  font: `500 10px ${FONT_KARLA}`,
                  color: isRed(suit) ? "#8a2d23" : "#1d1a15",
                  letterSpacing: ".06em",
                };
                if (legal) {
                  return (
                    <form
                      key={`${card.suit}${card.rank}`}
                      action={playCardAction}
                      style={{ display: "contents" }}
                    >
                      <input type="hidden" name="sessionId" value={sessionId} />
                      <input type="hidden" name="suit" value={card.suit} />
                      <input type="hidden" name="rank" value={card.rank} />
                      <input type="hidden" name="mobile" value="1" />
                      <button
                        type="submit"
                        aria-label={`Play ${rankLabel(card.rank)}${GLYPH[card.suit]}`}
                        style={{
                          ...rankStyle,
                          border: "1px solid #7cc0c4",
                          background: "#e6f3f4",
                          borderRadius: 4,
                          padding: "0 3px",
                          cursor: "pointer",
                        }}
                      >
                        {rankLabel(card.rank)}
                      </button>
                    </form>
                  );
                }
                return (
                  <span
                    key={`${card.suit}${card.rank}`}
                    style={{ ...rankStyle, opacity: interactive ? 0.42 : 1 }}
                  >
                    {rankLabel(card.rank)}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  const seatTag = (seat: Seat) => {
    const acting = seat === actingSeat && state.phase !== "complete";
    const isMine = seat === mySeat;
    const isDummy = seat === dummy && state.phase !== "auction";
    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 8px",
          borderRadius: 8,
          background: acting
            ? "#a16207"
            : isMine
              ? "rgba(250,248,242,.96)"
              : "rgba(0,0,0,.3)",
          boxShadow: acting ? "0 0 0 2px rgba(252,211,77,.55)" : undefined,
          animation: acting ? "pulseGlow 1.6s ease-in-out infinite" : undefined,
        }}
      >
        <span
          style={{
            display: "flex",
            width: 15,
            height: 15,
            flex: "none",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 3,
            background: isMine ? "#205e63" : "#1f5058",
            color: "#fff",
            font: `700 9px ${FONT_KARLA}`,
          }}
        >
          {seat}
        </span>
        <span
          style={{
            font: `600 10px ${FONT_KARLA}`,
            color: acting ? "#fff" : isMine ? "#1d1a15" : "#e7e1d3",
            maxWidth: 64,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {seatLabel(seat)}
        </span>
        {isDummy && (
          <span
            style={{
              font: `600 8px ${FONT_KARLA}`,
              letterSpacing: ".05em",
              textTransform: "uppercase",
              color: acting ? "rgba(255,255,255,.8)" : "rgba(231,225,211,.6)",
            }}
          >
            · dummy
          </span>
        )}
      </div>
    );
  };

  // ---- center: auction / trick / result ----------------------------------
  const auctionRows: (Seat | null)[][] = [];
  {
    const order: Seat[] = ["W", "N", "E", "S"];
    const offset = order.indexOf(record.board.dealer);
    const padded = [...Array.from({ length: offset }, () => null), ...state.auction] as (
      | (typeof state.auction)[number]
      | null
    )[];
    for (let i = 0; i < padded.length; i += 4)
      auctionRows.push(padded.slice(i, i + 4) as never);
  }
  const trick = state.tricks[state.tricks.length - 1];
  const trickCards: Partial<Record<Seat, Card>> = {};
  if (state.phase !== "auction" && trick && trick.plays.length < 5) {
    for (const p of trick.plays) trickCards[p.seat] = p.card;
  }

  const contractChip = state.contract
    ? callLabel(`${state.contract.level}${state.contract.strain}`)
    : "";
  const scoreLine =
    state.phase === "auction" ? "auction" : `NS ${state.trickCount.NS} · EW ${state.trickCount.EW}`;

  const lastLogic = logicEvents[logicEvents.length - 1];
  const feedLastLine = lastLogic
    ? `${lastLogic.seat} ${
        lastLogic.category === "bid-logic-event"
          ? callLabel(lastLogic.chosen)
          : `${rankLabel(lastLogic.chosen.rank)}${GLYPH[lastLogic.chosen.suit]}`
      } — ${lastLogic.reason}`
    : "No decisions yet — press ▶ to let the AI act.";

  const prompt =
    state.phase === "complete"
      ? "Board complete — deal another, or tap ⏮ to replay."
      : myTurn && state.phase === "play"
        ? `Your play — tap a raised card${state.turn !== mySeat ? ` (dummy, seat ${state.turn})` : ""}.`
        : actingIsHuman && !myTurn
          ? `Waiting for the human in seat ${actingSeat}.`
          : `Waiting on ${seatLabel(actingSeat)}…`;

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        background:
          "radial-gradient(130% 118% at 50% 30%,#2f6b6f 0%,#1c4b50 55%,#0c2426 100%)",
        fontFamily: FONT_KARLA,
      }}
    >
      {/* pulse / sheet keyframes (self-contained; the mobile layout may also
          define these, duplicates are harmless) */}
      <style>{`
        @keyframes pulseGlow{0%,100%{box-shadow:0 0 0 2px rgba(252,211,77,.55),0 0 12px rgba(252,211,77,.35)}50%{box-shadow:0 0 0 2px rgba(252,211,77,.9),0 0 20px rgba(252,211,77,.6)}}
        @keyframes dealIn{from{opacity:0;transform:translateY(14px) scale(.9)}to{opacity:1}}
        @keyframes sheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        .m-scroll::-webkit-scrollbar{width:0;height:0}
      `}</style>

      {/* status header — clears the notch/status bar on real phones */}
      <div
        style={{
          padding: "calc(env(safe-area-inset-top, 0px) + 14px) 14px 0",
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: "#e7e1d3",
          flex: "none",
        }}
      >
        <Link
          href="/m/play"
          aria-label="Back to play"
          style={{
            color: "rgba(231,225,211,.7)",
            fontSize: 18,
            padding: "0 2px",
            textDecoration: "none",
          }}
        >
          ‹
        </Link>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              font: `600 15px ${FONT_FRAUNCES}`,
              lineHeight: 1.1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {record.board.name}
          </div>
          <div
            style={{
              font: `400 10px ${FONT_KARLA}`,
              color: "rgba(231,225,211,.55)",
              letterSpacing: ".02em",
            }}
          >
            dealer {record.board.dealer} · vul {record.board.vul}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          {state.contract && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: "rgba(255,255,255,.15)",
                border: "1px solid rgba(255,255,255,.2)",
                padding: "3px 8px",
                borderRadius: 8,
                font: `600 13px ${FONT_KARLA}`,
                color: "#fff",
              }}
            >
              {contractChip}
              <span style={{ opacity: 0.6, fontWeight: 400, fontSize: 10 }}>
                · {state.contract.declarer}
              </span>
            </span>
          )}
          <span
            style={{
              font: `500 11px ${FONT_KARLA}`,
              color: "rgba(231,225,211,.75)",
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
            }}
          >
            {scoreLine}
          </span>
        </div>
      </div>

      {saved && (
        <p
          style={{
            margin: "8px 14px 0",
            borderRadius: 8,
            background: "rgba(37,110,66,.9)",
            color: "#fff",
            padding: "8px 12px",
            font: `500 12px ${FONT_KARLA}`,
          }}
        >
          Saved to the library.{" "}
          <Link href={`/m/library?kind=${saved}`} style={{ color: "#fff", textDecoration: "underline" }}>
            Open the {saved} shelf →
          </Link>
        </p>
      )}
      {error && !editDeal && (
        <p
          style={{
            margin: "8px 14px 0",
            borderRadius: 8,
            background: "rgba(138,45,35,.9)",
            color: "#fff",
            padding: "8px 12px",
            font: `500 12px ${FONT_KARLA}`,
          }}
        >
          {error}
        </p>
      )}
      {fixed && (
        <p
          style={{
            margin: "8px 14px 0",
            borderRadius: 8,
            background: "rgba(37,110,66,.9)",
            color: "#fff",
            padding: "8px 12px",
            font: `500 12px ${FONT_KARLA}`,
          }}
        >
          Fixed — the knowledge base recompiled and this table now plays from the new rules. It
          is paused; use ▶ to watch the fix take effect.
        </p>
      )}
      {fixError && (
        <p
          style={{
            margin: "8px 14px 0",
            borderRadius: 8,
            background: "rgba(161,98,7,.92)",
            color: "#fff",
            padding: "8px 12px",
            font: `500 12px ${FONT_KARLA}`,
          }}
        >
          Saved, but the knowledge base no longer compiles ({fixError}) — this table keeps
          playing from the last good rules until the item is fixed.
        </p>
      )}

      {/* toolbar */}
      <div
        className="m-scroll"
        style={{
          flex: "none",
          display: "flex",
          gap: 6,
          overflowX: "auto",
          padding: "10px 14px 8px",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <MobileAutoAdvance
          key={paused ?? "run"}
          sessionId={sessionId}
          active={aiToAct}
          seq={record.events.length}
          complete={state.phase === "complete"}
        />
        {!learnerMode && aiToAct && (
          <form action={playToEndAction} style={{ flex: "none" }}>
            <input type="hidden" name="sessionId" value={sessionId} />
            <input type="hidden" name="mobile" value="1" />
            <button type="submit" aria-label="Play to end" title="Play to end" style={FROSTED_PILL}>
              ⏭
            </button>
          </form>
        )}
        <form action={undoAction} style={{ flex: "none" }}>
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="mobile" value="1" />
          <button type="submit" aria-label="Undo the last decision" title="Undo" style={FROSTED_PILL}>
            ↩
          </button>
        </form>
        <form action={rewindAction} style={{ flex: "none" }}>
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="mobile" value="1" />
          <button
            type="submit"
            disabled={record.events.length === 0}
            aria-label="Go to the beginning"
            title="Go to the beginning"
            style={{
              ...FROSTED_PILL,
              opacity: record.events.length === 0 ? 0.4 : 1,
              cursor: record.events.length === 0 ? "not-allowed" : "pointer",
            }}
          >
            ⏮
          </button>
        </form>
        {!learnerMode && (
          <form action={newDealAction} style={{ flex: "none" }}>
            <input type="hidden" name="sessionId" value={sessionId} />
            <input type="hidden" name="mobile" value="1" />
            <button type="submit" aria-label="New deal" title="New deal — same lineup" style={FROSTED_PILL}>
              🎲
            </button>
          </form>
        )}
        {!learnerMode && (
          <Link
            href={mobileHref({ editDeal: "1", paused })}
            aria-label="Edit the deal"
            title="Edit the deal — change any cards, then deal the edited board to this table"
            style={FROSTED_PILL}
          >
            ✏️
          </Link>
        )}
        {!learnerMode && (
          <Link
            href={mobileHref({ hands: showAll ? "mine" : "all" })}
            aria-label={showAll ? "Hide other hands" : "Show all hands"}
            title={showAll ? "Hide other hands" : "Show all hands"}
            style={{
              ...FROSTED_PILL,
              ...(showAll
                ? { background: "rgba(141,181,183,.3)", borderColor: "#8db5b7" }
                : {}),
            }}
          >
            👁 {showAll ? "hide" : "all"}
          </Link>
        )}
        {!learnerMode && <SaveSheet sessionId={sessionId} boardName={record.board.name} />}
        {isFellow && (
          <Link
            href={learnerMode ? `/m/table/${sessionId}` : `/m/table/${sessionId}?mode=learner`}
            aria-label={learnerMode ? "Switch to verification view" : "Switch to learner view"}
            title={learnerMode ? "Verification view" : "Learner view"}
            style={FROSTED_PILL}
          >
            {learnerMode ? "🔍 verify" : "🎓 learner"}
          </Link>
        )}
      </div>

      {/* felt */}
      <div
        style={{
          flex: 1,
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "4px 10px 8px",
          minHeight: 0,
        }}
      >
        {/* North */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "flex-end", minHeight: 32 }}>
            {canSee("N") ? faceFan("N", false) : backsFan("N")}
          </div>
          {seatTag("N")}
        </div>

        {/* West · center · East */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 6,
            flex: 1,
            minHeight: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              width: 66,
            }}
          >
            {canSee("W") ? suitRows("W") : backsFan("W")}
            {seatTag("W")}
          </div>

          {/* Center */}
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              alignSelf: "stretch",
              minWidth: 0,
            }}
          >
            {state.phase === "auction" ? (
              <div
                style={{
                  width: "100%",
                  maxWidth: 230,
                  background: "rgba(255,255,255,.95)",
                  borderRadius: 10,
                  padding: "6px 4px",
                  boxShadow: "0 2px 8px rgba(0,0,0,.25)",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr 1fr",
                    textAlign: "center",
                    font: `600 9px ${FONT_KARLA}`,
                    letterSpacing: ".1em",
                    color: "#a49d8e",
                    textTransform: "uppercase",
                    paddingBottom: 4,
                    borderBottom: "1px solid #ece7db",
                  }}
                >
                  <span>W</span>
                  <span>N</span>
                  <span>E</span>
                  <span>S</span>
                </div>
                {auctionRows.map((row, i) => (
                  <div
                    key={i}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr 1fr",
                      textAlign: "center",
                      font: `500 12px ${FONT_KARLA}`,
                      padding: "2px 0",
                      color: "#1d1a15",
                    }}
                  >
                    {[0, 1, 2, 3].map((j) => {
                      const entry = row[j] as (typeof state.auction)[number] | null;
                      const dbl = entry && (entry.call === "X" || entry.call === "XX");
                      return (
                        <span key={j} style={{ color: dbl ? "#8a2d23" : undefined }}>
                          {entry ? callLabel(entry.call) : ""}
                        </span>
                      );
                    })}
                  </div>
                ))}
                <div
                  style={{
                    textAlign: "center",
                    font: `400 10px ${FONT_KARLA}`,
                    color: "#a49d8e",
                    paddingTop: 3,
                  }}
                >
                  {state.auction.length === 0
                    ? seatLabel(record.board.dealer) === "you"
                      ? "you deal"
                      : `${seatLabel(record.board.dealer)} deals`
                    : ""}
                </div>
              </div>
            ) : state.phase === "complete" && score ? (
              <div
                style={{
                  background: "rgba(255,255,255,.96)",
                  borderRadius: 12,
                  padding: "16px 22px",
                  textAlign: "center",
                  boxShadow: "0 4px 16px rgba(0,0,0,.3)",
                  animation: "dealIn .4s ease",
                }}
              >
                <div style={{ font: `500 22px ${FONT_FRAUNCES}`, color: "#1d1a15" }}>
                  {resultLabel(score)}
                </div>
                {score.contract && (
                  <div style={{ font: `500 13px ${FONT_KARLA}`, color: "#5e5749", marginTop: 3 }}>
                    {score.declarerScore >= 0 ? "+" : ""}
                    {score.declarerScore} for{" "}
                    {["N", "S"].includes(score.contract.declarer) ? "NS" : "EW"}
                  </div>
                )}
                <div style={{ font: `400 11px ${FONT_KARLA}`, color: "#a49d8e", marginTop: 6 }}>
                  NS {state.trickCount.NS} · EW {state.trickCount.EW}
                </div>
              </div>
            ) : (
              <div style={{ position: "relative", width: 150, height: 150 }}>
                {(["N", "E", "S", "W"] as Seat[]).map((seat) => {
                  const pos: React.CSSProperties =
                    seat === "N"
                      ? { left: "50%", top: 0, transform: "translateX(-50%)" }
                      : seat === "S"
                        ? { bottom: 0, left: "50%", transform: "translateX(-50%)" }
                        : seat === "W"
                          ? { left: 0, top: "50%", transform: "translateY(-50%)" }
                          : { right: 0, top: "50%", transform: "translateY(-50%)" };
                  const card = trickCards[seat];
                  return card ? (
                    <span
                      key={seat}
                      style={{
                        position: "absolute",
                        ...pos,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        width: 36,
                        aspectRatio: "5 / 7",
                        background: "#fff",
                        border: "1px solid #d3ccbb",
                        borderRadius: 6,
                        boxShadow: "0 2px 5px rgba(0,0,0,.3)",
                        padding: "2px 0 0 3px",
                        color: isRed(card.suit) ? "#8a2d23" : "#161310",
                        animation: "dealIn .3s ease",
                      }}
                    >
                      <span style={{ font: `600 13px ${FONT_KARLA}`, lineHeight: 0.9 }}>
                        {rankLabel(card.rank)}
                      </span>
                      <span style={{ fontSize: 11 }}>{GLYPH[card.suit]}</span>
                    </span>
                  ) : (
                    <span
                      key={seat}
                      style={{
                        position: "absolute",
                        ...pos,
                        width: 34,
                        aspectRatio: "5 / 7",
                        borderRadius: 6,
                        border: `1.5px dashed ${
                          seat === state.turn ? "rgba(252,211,77,.85)" : "rgba(255,255,255,.25)"
                        }`,
                      }}
                    />
                  );
                })}
                <span
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    transform: "translate(-50%,-50%)",
                    font: `600 8px ${FONT_KARLA}`,
                    letterSpacing: ".12em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,.4)",
                  }}
                >
                  trick {state.tricks.length}
                </span>
              </div>
            )}
          </div>

          {/* East */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              width: 66,
            }}
          >
            {canSee("E") ? suitRows("E") : backsFan("E")}
            {seatTag("E")}
          </div>
        </div>

        {/* South (you) */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
          {seatTag("S")}
          <div style={{ display: "flex", alignItems: "flex-end", minHeight: 56, paddingTop: 8 }}>
            {canSee("S") ? faceFan("S", true) : backsFan("S")}
          </div>
        </div>
      </div>

      {/* action bar: bid box / prompt */}
      <div style={{ flex: "none", padding: "0 14px" }}>
        {state.phase === "auction" && myTurn && callsNow ? (
          <MobileBidBox sessionId={sessionId} legal={[...callsNow]} />
        ) : (
          <div
            style={{
              textAlign: "center",
              padding: "6px 0 4px",
              font: `500 12px ${FONT_KARLA}`,
              color: myTurn ? "#fcd34d" : "rgba(231,225,211,.7)",
            }}
          >
            {prompt}
            {state.phase === "complete" && (
              <>
                {" "}
                <Link href="/m/play" style={{ color: "#8db5b7", textDecoration: "underline" }}>
                  Play another →
                </Link>
              </>
            )}
          </div>
        )}
      </div>

      {/* decisions feed (hidden entirely in learner mode, like desktop) */}
      {!learnerMode && (
        <FeedSheet
          count={logicEvents.length}
          lastLine={feedLastLine}
          barHidden={state.phase === "auction" && !!myTurn && !!callsNow}
        >
          {logicEvents.length === 0 ? (
            <p
              style={{
                border: "1px dashed #d3ccbb",
                borderRadius: 10,
                padding: 16,
                textAlign: "center",
                font: `400 12px ${FONT_KARLA}`,
                color: "#a49d8e",
              }}
            >
              No decisions yet — the first trace appears as soon as an AI acts.
            </p>
          ) : (
            [...logicEvents]
              .reverse()
              .map((event) => (
                <MobileDecisionCard
                  key={event.seq}
                  event={event}
                  sessionId={sessionId}
                  kbId={record.kbId}
                  mySeat={mySeat}
                  rules={ruleIndex}
                  defaults={compiled?.defaults}
                  mode={learnerMode && isFellow ? "learner" : undefined}
                />
              ))
          )}
        </FeedSheet>
      )}

      {/* Fix-at-the-table (mobile): view-first — the item as players read it —
          with a teal Edit that swaps in the phone editor. Save posts the SAME
          saveItemAction contract as desktop with returnTo=/m/table/{id}?paused
          + repinSessionId, so save → recompile → re-pin → back here, paused. */}
      {fixItem && (
        <MobileSheetShell
          closeHref={mobileHref({ paused: paused ?? String(Date.now()) })}
          closeLabel="Close the fix editor"
          eyebrow="Fixing at the table"
          title={fixItem.title}
          subtitle={
            fixMode === "edit"
              ? "Saving updates this table immediately — decisions already made keep their original trace; the next step plays from the corrected rules."
              : "The item as players read it — Edit to change it; saving updates this table immediately."
          }
          headerAction={
            fixMode !== "edit" ? (
              <Link
                href={mobileHref({ paused, fix, fixMode: "edit" })}
                aria-label="Edit this knowledge item"
                style={{
                  border: "none",
                  background: "#205e63",
                  borderRadius: 8,
                  padding: "6px 14px",
                  font: `600 11px ${FONT_KARLA}`,
                  color: "#fff",
                  textDecoration: "none",
                }}
              >
                Edit
              </Link>
            ) : undefined
          }
        >
          {fixMode === "edit" ? (
            <MobileItemEditor
              kbId={record.kbId}
              item={fixItem}
              action={saveItemAction}
              hiddenFields={{
                returnTo: mobileHref({ paused: paused ?? String(Date.now()) }),
                repinSessionId: sessionId,
              }}
            />
          ) : (
            <MobileFixView item={fixItem} />
          )}
        </MobileSheetShell>
      )}

      {/* Edit-the-deal (mobile): the phone deal editor over the felt. Posts
          the SAME redealEditedAction contract as the desktop overlay (+mobile=1
          so the fork lands back on /m/table). */}
      {editDeal && !learnerMode && (
        <MobileSheetShell
          closeHref={mobileHref({ paused: paused ?? String(Date.now()) })}
          closeLabel="Close the deal editor"
          eyebrow="Edit the deal"
          title={record.board.name}
          subtitle="Move any unplayed cards, then apply — the game continues right where it is, on the edited deal, with the same seats. Past calls and plays keep their original reasoning."
        >
          {error && (
            <p
              style={{
                margin: "0 0 12px",
                borderRadius: 10,
                background: "#f6e2df",
                border: "1px solid #e4b8b1",
                color: "#8a2d23",
                padding: "9px 12px",
                font: `500 12px ${FONT_KARLA}`,
              }}
            >
              {error}
            </p>
          )}
          <MobileDealEditor
            sessionId={sessionId}
            initialName={
              record.board.name.endsWith("(edited)")
                ? record.board.name
                : `${record.board.name} (edited)`
            }
            initialDealer={record.board.dealer}
            initialVul={record.board.vul}
            initialHands={state.hands}
            locked={state.tricks.flatMap((t) =>
              t.plays.map((p) => ({ seat: p.seat, card: p.card })),
            )}
          />
        </MobileSheetShell>
      )}
    </div>
  );
}

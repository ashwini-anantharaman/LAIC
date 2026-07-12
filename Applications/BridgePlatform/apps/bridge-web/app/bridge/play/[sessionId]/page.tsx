import { legalCalls, legalPlays } from "@bridge/engine";
import {
  callLabel,
  cardId,
  contractLabel,
  isRedStrain,
  partnerOf,
  rankLabel,
  type Card,
  type Seat,
} from "@bridge/events";
import { resolveRuleProvenance } from "@bridge/knowledge";
import { SessionAccessError } from "@bridge/sessions";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  autoplaySession,
  changeTableSetting,
  humanBid,
  humanPlay,
  saveBoardToLibraryAction,
  savePositionSnapshot,
  stepSession,
  undoSession,
} from "@/app/bridge/play/actions";
import { knowledgeStore } from "@/lib/knowledge";
import { getBridgeContext } from "@/lib/nexus";
import { profileService } from "@/lib/profiles";
import { sessionService } from "@/lib/sessions";

const GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const red = (suit: string) => suit === "H" || suit === "D";

function CardFace({ card }: Readonly<{ card: Card }>) {
  return (
    <span className={red(card.suit) ? "text-red-600" : "text-neutral-900"}>
      {GLYPH[card.suit]}
      {rankLabel(card.rank)}
    </span>
  );
}

/** A card as a chip: rank over suit, like the corner index of a real card. */
function CardChip({ card, dim }: Readonly<{ card: Card; dim?: boolean }>) {
  return (
    <span
      className={`flex h-10 w-7 flex-col items-center justify-center rounded-[5px] border border-neutral-200 bg-white leading-none shadow-sm ${
        red(card.suit) ? "text-red-600" : "text-neutral-900"
      } ${dim ? "opacity-55" : ""}`}
    >
      <span className="text-[13px] font-semibold">{rankLabel(card.rank)}</span>
      <span className="text-[11px]">{GLYPH[card.suit]}</span>
    </span>
  );
}

/** Fanned card backs for a hidden hand. */
function HiddenHand({ count }: Readonly<{ count: number }>) {
  if (!count) return <span className="text-sm text-neutral-400">no cards left</span>;
  return (
    <span className="flex -space-x-2.5 pt-0.5">
      {Array.from({ length: Math.min(count, 13) }, (_, i) => (
        <span
          key={i}
          className="inline-block h-9 w-6 rounded-[4px] border border-white/40 bg-emerald-800 shadow-sm [background-image:repeating-linear-gradient(45deg,rgba(255,255,255,.07)_0_2px,transparent_2px_5px)]"
        />
      ))}
    </span>
  );
}

function Hand({
  cards,
  hidden,
  playable,
  sessionId,
  actingAs,
}: Readonly<{
  cards: Card[];
  hidden: boolean;
  playable?: Set<string>;
  sessionId?: string;
  actingAs?: Seat;
}>) {
  if (hidden) return <HiddenHand count={cards.length} />;
  const sorted = [...cards].sort(
    (a, b) => "SHDC".indexOf(a.suit) - "SHDC".indexOf(b.suit) || b.rank - a.rank,
  );
  return (
    <span className="flex flex-wrap gap-1">
      {sorted.map((c) => {
        const id = cardId(c);
        if (playable && sessionId && actingAs) {
          const legal = playable.has(id);
          return (
            <form key={id} action={humanPlay} className="inline">
              <input type="hidden" name="sessionId" value={sessionId} />
              <input type="hidden" name="seat" value={actingAs} />
              <input type="hidden" name="cardId" value={id} />
              <button
                type="submit"
                disabled={!legal}
                className={`flex h-10 w-7 flex-col items-center justify-center rounded-[5px] border bg-white leading-none ${
                  red(c.suit) ? "text-red-600" : "text-neutral-900"
                } ${
                  legal
                    ? "border-emerald-400 shadow-md hover:-translate-y-1 hover:shadow-lg"
                    : "border-neutral-200 opacity-35"
                }`}
              >
                <span className="text-[13px] font-semibold">{rankLabel(c.rank)}</span>
                <span className="text-[11px]">{GLYPH[c.suit]}</span>
              </button>
            </form>
          );
        }
        return <CardChip key={id} card={c} />;
      })}
    </span>
  );
}

export default async function SessionPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ why?: string }>;
}>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  const { sessionId } = await params;
  const { why } = await searchParams;

  let view, events;
  try {
    view = await sessionService().getSession(sessionId, context);
    events = await sessionService().getEvents(sessionId, context);
  } catch (e) {
    if (e instanceof SessionAccessError) notFound();
    throw e;
  }
  const { record, state } = view;

  const me = await (await profileService()).getUserProfile(context);
  const feedbackMode = me?.preferredFeedbackMode ?? "full_trace";

  // The EXACT package version this session pins — its settings drive the
  // live-config panel below (§11.4: never "latest").
  const pinnedPkg = (
    await knowledgeStore().getPackage(record.packageRef.packageId, record.packageRef.version)
  )?.pkg;

  const mySeats = (Object.values(record.seats) as { seat: Seat; playerKind: string; occupantId?: string }[])
    .filter((s) => s.playerKind === "human" && s.occupantId === context.nexusUserId)
    .map((s) => s.seat);
  const isParticipant = mySeats.length > 0;
  const declarer = state.contract?.declarer;
  const dummy = declarer ? partnerOf(declarer) : null;
  const playStarted = events.some((e) => e.category === "play-event");
  const showHand = (seat: Seat) =>
    !isParticipant ||
    state.phase === "complete" ||
    mySeats.includes(seat) ||
    (dummy === seat && playStarted);
  const controllerOf = (seat: Seat): Seat =>
    state.phase === "play" && dummy === seat && declarer ? declarer : seat;
  const humansTurn =
    state.phase !== "complete" && mySeats.includes(controllerOf(state.turn));
  const legalPlaySet = humansTurn && state.phase === "play"
    ? new Set(legalPlays(state, state.turn).map(cardId))
    : undefined;
  const legalCallSet =
    humansTurn && state.phase === "auction" ? legalCalls(state.auction, state.turn) : null;

  const logicEvents = events.filter(
    (e) => e.category === "bid-logic-event" || e.category === "play-logic-event",
  ) as Extract<(typeof events)[number], { category: "bid-logic-event" | "play-logic-event" }>[];

  // "Why?" panel: resolve the selected decision's rule to items + sources.
  const whyEvent = why ? logicEvents.find((e) => e.seq === Number(why)) : undefined;
  const whyProvenance =
    whyEvent?.matchedRuleId != null
      ? await resolveRuleProvenance(
          knowledgeStore(),
          record.packageRef.packageId,
          record.packageRef.version,
          whyEvent.matchedRuleId,
        )
      : null;

  const seatBox = (seat: Seat) => {
    const onTurn = state.turn === seat && state.phase !== "complete";
    // Once the board is over, show the ORIGINAL deal so the hand can be
    // reviewed — the remaining-cards view would just be thirteen empty boxes.
    const boardOver = state.phase === "complete";
    return (
      <div
        className={`rounded-xl bg-[#fffdf6]/95 p-3 shadow-md ${
          onTurn ? "ring-2 ring-[var(--gold)] shadow-[0_0_0_5px_rgba(200,165,88,0.25)]" : ""
        }`}
      >
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-neutral-500">
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
              onTurn ? "bg-[var(--gold)] text-emerald-950" : "bg-emerald-800 text-emerald-50"
            }`}
          >
            {seat}
          </span>
          {mySeats.includes(seat)
            ? `${me?.displayNameAtTable || "you"}`
            : record.seats[seat].playerKind === "human"
              ? "human"
              : "AI"}
          {dummy === seat && playStarted ? " · dummy" : ""}
          {boardOver ? " · the deal" : ""}
        </p>
        {boardOver ? (
          <span className="flex flex-wrap gap-1">
            {[...record.board.hands[seat]]
              .sort((a, b) => "SHDC".indexOf(a.suit) - "SHDC".indexOf(b.suit) || b.rank - a.rank)
              .map((c) => (
                <CardChip key={cardId(c)} card={c} dim />
              ))}
          </span>
        ) : (
          <Hand
            cards={state.hands[seat]}
            hidden={!showHand(seat)}
            playable={humansTurn && state.turn === seat ? legalPlaySet : undefined}
            sessionId={record.bridgeSessionId}
            actingAs={controllerOf(seat)}
          />
        )}
      </div>
    );
  };

  const currentTrick = state.tricks[state.tricks.length - 1];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{record.board.name}</h1>
        <p className="text-xs text-neutral-500">
          <span className="font-mono">{record.bridgeSessionId}</span> · {record.status} ·{" "}
          {record.packageRef.packageId}@{record.packageRef.version} ·{" "}
          {state.contract ? contractLabel(state.contract) : `phase: ${state.phase}`} · tricks NS{" "}
          {state.trickCount.NS} / EW {state.trickCount.EW}
        </p>
      </header>

      {record.forkedFromSessionId && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-900">
          Settings changed mid-board — this table continues{" "}
          <Link
            href={`/bridge/play/${record.forkedFromSessionId}`}
            className="font-mono underline underline-offset-2"
          >
            {record.forkedFromSessionId}
          </Link>{" "}
          under a new configuration. The original and its decisions are untouched.
        </p>
      )}

      {/* The table: seats around a felt board */}
      <div
        className="rounded-[1.75rem] border-8 border-[#463323] p-4 shadow-xl sm:p-6"
        style={{
          background:
            "radial-gradient(ellipse at 50% 30%, #386850 0%, #2a523c 55%, #1f4231 100%)",
        }}
      >
        <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-3">
          <div className="hidden sm:block" />
          {seatBox("N")}
          <div className="hidden sm:block" />
          {seatBox("W")}
          <div className="self-stretch p-2 text-center">
            <p className="mb-2 text-[11px] uppercase tracking-[0.25em] text-emerald-100/60">
              current trick
            </p>
            {currentTrick?.plays.length ? (
              <div className="flex flex-wrap items-end justify-center gap-2">
                {currentTrick.plays.map((p) => (
                  <span key={p.seat} className="flex flex-col items-center gap-1">
                    <span className="text-[10px] font-bold text-emerald-100/70">{p.seat}</span>
                    <CardChip card={p.card} />
                  </span>
                ))}
                {currentTrick.winner && (
                  <span className="pb-3 text-sm text-[var(--gold)]">→ {currentTrick.winner}</span>
                )}
              </div>
            ) : (
              <p className="text-sm text-emerald-100/40">
                {state.phase === "auction" ? "the auction is on" : "—"}
              </p>
            )}
            {state.contract && (
              <p className="mt-2 text-xs text-emerald-100/60">
                {contractLabel(state.contract)} · NS {state.trickCount.NS} · EW {state.trickCount.EW}
              </p>
            )}
          </div>
          {seatBox("E")}
          <div className="hidden sm:block" />
          {seatBox("S")}
          <div className="hidden sm:block" />
        </div>
      </div>

      {/* Bidding box */}
      {legalCallSet && (
        <section className="rounded-lg border border-emerald-300 bg-emerald-50/40 p-4">
          <h2 className="mb-2 text-sm font-medium text-emerald-900">
            Your call ({state.turn})
          </h2>
          <div className="flex flex-wrap gap-1">
            {[...legalCallSet]
              .sort((a, b) => {
                const order = (c: string) =>
                  c === "P" ? 100 : c === "X" ? 101 : c === "XX" ? 102 : Number(c[0]) * 5 + "CDHSN".indexOf(c[1]!);
                return order(a) - order(b);
              })
              .map((call) => (
                <form key={call} action={humanBid} className="inline">
                  <input type="hidden" name="sessionId" value={record.bridgeSessionId} />
                  <input type="hidden" name="seat" value={state.turn} />
                  <input type="hidden" name="call" value={call} />
                  <button
                    type="submit"
                    className={`rounded border border-neutral-300 bg-white px-2 py-1 text-sm hover:bg-emerald-100 ${isRedStrain(call) ? "text-red-600" : ""}`}
                  >
                    {callLabel(call)}
                  </button>
                </form>
              ))}
          </div>
        </section>
      )}
      {humansTurn && state.phase === "play" && (
        <p className="text-sm text-emerald-800">
          Your play — click a highlighted card{state.turn !== controllerOf(state.turn) ? "" : ""}
          {dummy === state.turn ? " (you control dummy)" : ""}.
        </p>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-2">
        {!isParticipant && (
          <>
            <form action={stepSession}>
              <input type="hidden" name="sessionId" value={record.bridgeSessionId} />
              <button className="rounded bg-neutral-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-900">
                Step AI
              </button>
            </form>
            <form action={autoplaySession}>
              <input type="hidden" name="sessionId" value={record.bridgeSessionId} />
              <button className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800">
                Play to end
              </button>
            </form>
          </>
        )}
        {isParticipant && !humansTurn && state.phase !== "complete" && (
          <>
            <form action={stepSession}>
              <input type="hidden" name="sessionId" value={record.bridgeSessionId} />
              <button className="rounded bg-neutral-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-900">
                Step AI
              </button>
            </form>
            <form action={autoplaySession}>
              <input type="hidden" name="sessionId" value={record.bridgeSessionId} />
              <button className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800">
                Advance AI
              </button>
            </form>
          </>
        )}
        <form action={undoSession}>
          <input type="hidden" name="sessionId" value={record.bridgeSessionId} />
          <button className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
            Undo
          </button>
        </form>
        {state.phase !== "complete" && (
          <form action={savePositionSnapshot} className="flex items-center gap-1">
            <input type="hidden" name="sessionId" value={record.bridgeSessionId} />
            <input
              name="name"
              placeholder="snapshot name"
              className="w-36 rounded border border-neutral-300 px-2 py-1 text-sm"
            />
            <button className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
              Save position
            </button>
          </form>
        )}
        <form action={saveBoardToLibraryAction} className="flex items-center gap-1">
          <input type="hidden" name="sessionId" value={record.bridgeSessionId} />
          <input
            name="name"
            placeholder={record.board.name}
            className="w-36 rounded border border-neutral-300 px-2 py-1 text-sm"
          />
          <button className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
            Save board
          </button>
        </form>
        <a
          href={`/api/bridge/export?sessionId=${record.bridgeSessionId}&format=pbn`}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
        >
          Export PBN
        </a>
        <a
          href={`/api/bridge/export?sessionId=${record.bridgeSessionId}&format=lin`}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
        >
          Export LIN
        </a>
      </div>

      {/* Score (§8.2) */}
      {view.score && (
        <section className="rounded-lg border border-emerald-300 border-l-4 border-l-[var(--gold)] bg-emerald-50/40 p-4">
          <h2 className="mb-1 text-xl font-medium text-emerald-900">{view.resultLabel}</h2>
          <p className="text-sm text-neutral-700">
            Score: <span className="font-medium">NS {view.score.nsScore >= 0 ? "+" : ""}{view.score.nsScore}</span>
            {view.score.contract && (
              <span className="text-neutral-500">
                {" "}
                — trick points {view.score.trickScore}
                {view.score.overtrickScore ? ` · overtricks ${view.score.overtrickScore}` : ""}
                {view.score.gameBonus ? ` · game bonus ${view.score.gameBonus}` : ""}
                {view.score.partscoreBonus ? ` · partscore ${view.score.partscoreBonus}` : ""}
                {view.score.slamBonus ? ` · slam ${view.score.slamBonus}` : ""}
                {view.score.insultBonus ? ` · insult ${view.score.insultBonus}` : ""}
                {view.score.penalty ? ` · penalty ${view.score.penalty}` : ""}
                {view.score.vulnerable ? " · vulnerable" : " · not vulnerable"}
              </span>
            )}
          </p>
        </section>
      )}

      {/* The prototype's live-config loop: flip a setting -> the deal forks
          and continues under the new configuration. Undo + Step AI around it
          to watch the same decision come out differently. */}
      {pinnedPkg && pinnedPkg.settings.length > 0 && (
        <section className="rounded-lg border border-neutral-200 p-4">
          <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-neutral-500">
            Table settings — {record.packageRef.packageId}@{record.packageRef.version} · config{" "}
            <span className="font-mono normal-case">{record.resolvedValueHash}</span>
          </h2>
          <p className="mb-3 text-xs text-neutral-500">
            A session’s configuration is pinned so its decisions replay forever. Flipping a
            setting continues this deal at a forked table under the new configuration — try
            Undo, change a setting, then Step AI to see the same position decided differently.
          </p>
          <ul className="space-y-2">
            {pinnedPkg.settings.map((s) => {
              const on = Boolean(record.resolvedValues[s.key]);
              return (
                <li key={s.key} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium">{s.label}</span>{" "}
                    <span
                      className={`ml-1 rounded-full px-2 py-0.5 text-xs ${
                        on ? "bg-emerald-50 text-emerald-800" : "bg-neutral-100 text-neutral-500"
                      }`}
                    >
                      {on ? "on" : "off"}
                    </span>
                    <span className="mt-0.5 block text-xs text-neutral-500">{s.description}</span>
                  </span>
                  <form action={changeTableSetting}>
                    <input type="hidden" name="sessionId" value={record.bridgeSessionId} />
                    <input type="hidden" name="key" value={s.key} />
                    <button className="whitespace-nowrap rounded border border-neutral-300 px-2.5 py-1 text-xs hover:border-emerald-400 hover:bg-emerald-50">
                      {on ? "Turn off & continue here" : "Turn on & continue here"}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Auction + decisions with Why links. "minimal" feedback defers this
          panel until the board is over; the events still exist regardless. */}
      {(feedbackMode !== "minimal" || !isParticipant || state.phase === "complete") && (
      <section className="rounded-lg border border-neutral-200 p-4">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Decisions — click “why?” to resolve any AI action to its cited source
        </h2>
        <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
          {logicEvents.map((e) => (
            <li key={e.seq} className={why === String(e.seq) ? "rounded bg-emerald-50 px-1" : "px-1"}>
              <span className="font-mono">
                {e.seat}:{" "}
                {e.category === "bid-logic-event" ? callLabel(e.chosen) : <CardFace card={e.chosen} />}
              </span>{" "}
              <span className="text-neutral-500">← {e.reason}</span>
              {e.fallback && (
                <span className="ml-1 rounded bg-red-50 px-1 text-xs text-red-700">fallback</span>
              )}
              {e.matchedRuleId && (
                <Link
                  href={`/bridge/play/${record.bridgeSessionId}?why=${e.seq}`}
                  className="ml-2 text-xs text-emerald-700 hover:underline"
                >
                  why?
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>
      )}

      {/* Why panel */}
      {whyEvent && (
        <section className="rounded-lg border border-emerald-300 p-4">
          <h2 className="mb-2 text-sm font-medium text-emerald-900">
            Why {whyEvent.seat} chose{" "}
            {whyEvent.category === "bid-logic-event" ? callLabel(whyEvent.chosen) : cardId(whyEvent.chosen)}{" "}
            (event #{whyEvent.seq})
          </h2>
          <p className="text-sm text-neutral-700">{whyEvent.reason}</p>
          {whyEvent.facts.hcp !== undefined && (
            <p className="mt-1 text-xs text-neutral-500">
              Facts: {whyEvent.facts.hcp} HCP, shape {String(whyEvent.facts.shape)}
            </p>
          )}
          {whyProvenance && (
            <div className="mt-3 space-y-2 border-t border-neutral-200 pt-3 text-sm">
              {whyProvenance.items.map((item) => (
                <div key={item.itemId}>
                  <p className="font-medium">
                    {item.title}{" "}
                    <span className="text-xs font-normal text-neutral-500">
                      ({item.itemId}, {item.itemType}, v{item.version}, {item.status})
                    </span>
                  </p>
                  <p className="text-neutral-600">{item.humanReadableRule}</p>
                </div>
              ))}
              <ul className="text-xs text-neutral-500">
                {whyProvenance.citations.map((c, i) => (
                  <li key={i}>
                    ↳ {c.sourceId}: {c.passage}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {feedbackMode === "full_trace" && (
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer text-neutral-500">
              Full rule trace ({whyEvent.trace.length} rules considered)
            </summary>
            <ul className="mt-1 space-y-0.5 font-mono">
              {whyEvent.trace.map((r, i) => (
                <li key={i} className={r.matched ? "text-emerald-700" : "text-neutral-400"}>
                  {r.matched ? "✓" : "·"} {r.ruleId} — {r.reason}
                </li>
              ))}
            </ul>
          </details>
          )}
        </section>
      )}

      <div className="flex gap-4">
        <Link href="/bridge/play" className="text-sm text-emerald-700 hover:underline">
          ← All sessions
        </Link>
        <Link
          href={`/bridge/play/${record.bridgeSessionId}/replay`}
          className="text-sm text-emerald-700 hover:underline"
        >
          Replay step-by-step →
        </Link>
      </div>
    </div>
  );
}

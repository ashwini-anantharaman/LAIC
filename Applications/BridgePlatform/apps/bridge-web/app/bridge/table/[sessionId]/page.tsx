import {
  callLabel,
  isLogicEvent,
  type Card,
  type Seat,
} from "@bridge/events";
import { legalCalls, legalPlays, resultLabel, scoreBoard } from "@bridge/engine";
import { canAccessAdminArea } from "@bridge/nexus-client";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { saveItemAction } from "@/app/bridge/kb/actions";
import { Dropdown } from "@/components/Dropdown";
import { ItemEditor } from "@/components/kb/ItemEditor";
import { ItemView } from "@/components/kb/ItemView";
import { DealEditor } from "@/components/library/DealEditor";
import { AutoAdvance } from "@/components/table/AutoAdvance";
import { BboTable } from "@/components/table/bbo/BboTable";
import { DecisionEntry } from "@/components/table/DecisionEntry";
import { kbStore } from "@/lib/kb";
import { getBridgeContext } from "@/lib/nexus";
import { sessionService } from "@/lib/sessions";
import { buildRuleIndex } from "@/components/table/decisionText";
import {
  newDealAction,
  playToEndAction,
  redealEditedAction,
  rewindAction,
  saveToLibraryAction,
  swapSeatAction,
  undoAction,
} from "../actions";

/** Table v3 (2026-07-16 rework): the board looks like a card table — hands
 *  as cards, trick in the middle, AI turns advance themselves. Verification
 *  stays one tap away, never in the way. */
export default async function SessionPage({
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
    bboAuction?: string;
    legacy?: string;
  }>;
}>) {
  const context = await getBridgeContext();
  if (!context) redirect("/welcome");
  const { sessionId } = await params;

  // HIDDEN 2026-07-25: the table moved to /bridge/table2, built on the reusable
  // <PlayTable/> component. This page is kept intact behind ?legacy=1 so the
  // decisions rail, fix-at-the-table overlay and deal editor stay reachable
  // while the new page grows them. Delete this block to restore it as default.
  const sp = await searchParams;
  // ?fix and ?editDeal are legacy-only overlays (the fix-at-the-table editor
  // and the deal editor); a request carrying them must stay here even without
  // legacy=1, or the overlay silently never opens.
  if (sp.legacy !== "1" && !sp.fix && !sp.editDeal) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== "legacy") q.set(k, String(v));
    const qs = q.toString();
    redirect(`/bridge/table2/${sessionId}${qs ? `?${qs}` : ""}`);
  }
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
    bboAuction,
  } = sp;
  // The BBO replica is the ONLY table view (2026-07-25). It used to sit behind
  // ?skin=bbo alongside a "classic" felt; that fork and its round-tripping are
  // gone, so there is no skin param and no toggle.
  //
  // Still a choice: where the auction shows — the central box (default) or a
  // call bubble beside each player (?bboAuction=seats).
  const bboSeats = bboAuction === "seats";

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
    state.phase !== "auction" && state.contract
      ? (({ N: "S", S: "N", E: "W", W: "E" }) as Record<Seat, Seat>)[state.contract.declarer]
      : null;
  // Watching four AIs defaults to open cards; sitting in defaults to table
  // realism. The toggle overrides either way.
  const showAll = handsParam === "all" || (handsParam !== "mine" && !mySeat && !learnerMode);
  // Dummy spreads only after the opening lead (real-bridge timing) — without
  // this, a hand flips face-up the instant the auction ends, which reads as a
  // random reveal (often on the left, when West is dummy).
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
  const callsNow = state.phase === "auction" && myTurn ? legalCalls(state.auction, state.turn) : null;

  const score = scoreBoard(state);

  // Fix-at-the-table overlay: ?fix=<itemId> opens the real item editor over
  // the board; saving re-pins this session to the fresh compile and returns
  // here paused, so the corrected rule can be stepped through immediately.
  const overlayReturn = `/bridge/table/${sessionId}?paused=${Date.now()}&legacy=1`;
  const logicEvents = record.events.filter(isLogicEvent);
  const aiToAct = !actingIsHuman && state.phase !== "complete";

  // One parallel round: the fix-overlay item, the PINNED compile for the
  // English decisions rail (cache-hot — view() above already fetched it;
  // missing-compile sessions still open, DecisionEntry falls back to
  // id-free phrasing), and the seat menus' swap roster.
  const [fixItem, compiled, rosterRaw] = await Promise.all([
    fix && !learnerMode ? kbStore().getItem(fix) : null,
    sessionService()
      .compiledFor(record)
      .catch(() => undefined),
    learnerMode ? [] : kbStore().listPlayersForKb(record.kbId),
  ]);
  const ruleIndex = compiled ? buildRuleIndex(compiled) : undefined;

  // Valid players first, then drafts.
  const roster = [...rosterRaw].sort((a, b) =>
    a.validationStatus === b.validationStatus
      ? a.name.localeCompare(b.name)
      : a.validationStatus === "valid"
        ? -1
        : 1,
  );

  const seatLabel = (seat: Seat) => {
    const config = record.seats[seat];
    return config.kind === "human"
      ? config.nexusUserId === context.nexusUserId
        ? "you"
        : "human"
      : config.label;
  };
  // BBO-style name bar: full width of its hand, gold while the seat is on
  // turn, with the seat letter in a petrol badge. Fellows get the swap/edit
  // dropdown behind it; learners get the plain bar.
  const seatTag = (seat: Seat, align: "center" | "left" | "right" = "center") => {
    const acting = seat === actingSeat && state.phase !== "complete";
    const config = record.seats[seat];
    const tag = (
      <>
        <span className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[3px] bg-[#1f5058] text-[10px] font-bold text-white">
          {seat}
        </span>
        <span className="truncate text-[13px] font-medium text-neutral-800">
          {seatLabel(seat)}
        </span>
        {seat === dummy && state.phase === "play" && (
          <span
            className="flex-none text-[10px] uppercase tracking-wide text-neutral-500"
            title="Dummy's cards are played by the declarer"
          >
            · dummy
          </span>
        )}
      </>
    );
    const barClass = `flex w-full items-center gap-1.5 rounded-[3px] px-1 py-0.5 shadow ${
      acting ? "bg-amber-300" : "bg-neutral-100"
    }`;
    if (learnerMode) {
      return <p className={barClass}>{tag}</p>;
    }
    const iAmHere = config.kind === "human" && config.nexusUserId === context.nexusUserId;
    const panelAlign =
      align === "center" ? "left-1/2 -translate-x-1/2" : align === "right" ? "right-0" : "left-0";
    return (
      <details className="relative w-full">
        <summary
          className={`${barClass} cursor-pointer list-none hover:brightness-95`}
          title="Seat options — swap or edit this player"
        >
          {tag}
          <span aria-hidden className="ml-auto text-[9px] text-neutral-500">
            ▾
          </span>
        </summary>
        <div
          className={`absolute top-full z-20 mt-1 w-56 rounded-lg border border-neutral-200 bg-white p-2 text-left shadow-md ${panelAlign}`}
        >
          <p className="px-1 pb-1 text-[10px] uppercase tracking-wide text-neutral-400">
            {state.phase === "complete"
              ? "swap & replay this board"
              : "swap (forks this board)"}
          </p>
          <div className="max-h-52 space-y-0.5 overflow-y-auto">
            {roster.map((p) => {
              const current = config.kind === "kb_player" && config.playerId === p.playerId;
              return (
                <form key={p.playerId} action={swapSeatAction}>
                  <input type="hidden" name="sessionId" value={sessionId} />
                  <input type="hidden" name="seat" value={seat} />
                  <input type="hidden" name="playerId" value={p.playerId} />
                  <button
                    type="submit"
                    disabled={current}
                    className="w-full rounded px-1.5 py-1 text-left text-xs enabled:hover:bg-emerald-50 disabled:cursor-default"
                  >
                    <span className={current ? "font-semibold" : ""}>{p.name}</span>
                    {current && <span className="ml-1 text-[9px] uppercase text-neutral-400">seated</span>}
                    {p.validationStatus === "invalid" && (
                      <span className="ml-1 text-[9px] uppercase text-[color:var(--color-invalid)]">
                        incomplete
                      </span>
                    )}
                  </button>
                </form>
              );
            })}
            {roster.length === 0 && (
              <p className="px-1.5 py-1 text-xs text-neutral-400">No players in this KB yet.</p>
            )}
          </div>
          <div className="mt-1 space-y-0.5 border-t border-[var(--line)] pt-1">
            {!iAmHere && (
              <form action={swapSeatAction}>
                <input type="hidden" name="sessionId" value={sessionId} />
                <input type="hidden" name="seat" value={seat} />
                <input type="hidden" name="playerId" value="me" />
                <button
                  type="submit"
                  className="w-full rounded px-1.5 py-1 text-left text-xs hover:bg-emerald-50"
                >
                  Sit here yourself
                </button>
              </form>
            )}
            {config.kind === "kb_player" && (
              <Link
                href={`/bridge/kb/${record.kbId}/players/${config.playerId}`}
                className="block rounded px-1.5 py-1 text-xs text-emerald-800 hover:bg-emerald-50"
              >
                Edit {config.label} →
              </Link>
            )}
          </div>
        </div>
      </details>
    );
  };

  // The nameplate: BBO's grey name bar with the small teal seat-letter badge
  // at its left end — gold while the seat is to act. For fellows it doubles as
  // the swap/edit dropdown, posting the same swapSeatAction as everywhere else.
  const bboPlate = (seat: Seat) => {
    const acting = seat === actingSeat && state.phase !== "complete";
    const config = record.seats[seat];
    const plateStyle = acting
      ? { background: "#FFC933", color: "#000000" }
      : { background: "#D6D6D6", color: "#000000" };
    const inner = (
      <>
        <span
          className="flex h-[18px] w-[18px] flex-none items-center justify-center text-[12px] font-bold text-white"
          style={{ background: "#1F5E63" }}
        >
          {seat}
        </span>
        <span className="max-w-32 truncate text-[14px]">{seatLabel(seat)}</span>
        {seat === dummy && state.phase === "play" && (
          <span className="text-[9px] font-normal uppercase tracking-wide opacity-70">· dummy</span>
        )}
      </>
    );
    // Fills its reserved-width column (BboTable wraps the plate in a fixed-
    // width box), so the plate — and the column — never resizes with the name.
    const barClass = "flex w-full items-center gap-1.5 px-1 py-0.5 text-[13px]";
    if (learnerMode) {
      return (
        <p className={barClass} style={plateStyle}>
          {inner}
        </p>
      );
    }
    const iAmHere = config.kind === "human" && config.nexusUserId === context.nexusUserId;
    return (
      <details className="relative">
        <summary
          className={`${barClass} cursor-pointer list-none hover:brightness-110`}
          style={plateStyle}
          title="Seat options — swap or edit this player"
        >
          {inner}
          <span aria-hidden className="text-[9px] opacity-70">
            ▾
          </span>
        </summary>
        <div className="absolute left-1/2 top-full z-20 mt-1 w-56 -translate-x-1/2 rounded-lg border border-neutral-200 bg-white p-2 text-left text-black shadow-md">
          <p className="px-1 pb-1 text-[10px] uppercase tracking-wide text-neutral-400">
            {state.phase === "complete" ? "swap & replay this board" : "swap (forks this board)"}
          </p>
          <div className="max-h-52 space-y-0.5 overflow-y-auto">
            {roster.map((p) => {
              const current = config.kind === "kb_player" && config.playerId === p.playerId;
              return (
                <form key={p.playerId} action={swapSeatAction}>
                  <input type="hidden" name="sessionId" value={sessionId} />
                  <input type="hidden" name="seat" value={seat} />
                  <input type="hidden" name="playerId" value={p.playerId} />
                  <button
                    type="submit"
                    disabled={current}
                    className="w-full rounded px-1.5 py-1 text-left text-xs enabled:hover:bg-emerald-50 disabled:cursor-default"
                  >
                    <span className={current ? "font-semibold" : ""}>{p.name}</span>
                    {current && (
                      <span className="ml-1 text-[9px] uppercase text-neutral-400">seated</span>
                    )}
                    {p.validationStatus === "invalid" && (
                      <span className="ml-1 text-[9px] uppercase text-[color:var(--color-invalid)]">
                        incomplete
                      </span>
                    )}
                  </button>
                </form>
              );
            })}
            {roster.length === 0 && (
              <p className="px-1.5 py-1 text-xs text-neutral-400">No players in this KB yet.</p>
            )}
          </div>
          <div className="mt-1 space-y-0.5 border-t border-[var(--line)] pt-1">
            {!iAmHere && (
              <form action={swapSeatAction}>
                <input type="hidden" name="sessionId" value={sessionId} />
                <input type="hidden" name="seat" value={seat} />
                <input type="hidden" name="playerId" value="me" />
                <button
                  type="submit"
                  className="w-full rounded px-1.5 py-1 text-left text-xs hover:bg-emerald-50"
                >
                  Sit here yourself
                </button>
              </form>
            )}
            {config.kind === "kb_player" && (
              <Link
                href={`/bridge/kb/${record.kbId}/players/${config.playerId}`}
                className="block rounded px-1.5 py-1 text-xs text-emerald-800 hover:bg-emerald-50"
              >
                Edit {config.label} →
              </Link>
            )}
          </div>
        </div>
      </details>
    );
  };

  // Current (unfinished) trick, by seat.
  const trick = state.tricks[state.tricks.length - 1];
  const trickCards: Partial<Record<Seat, Card>> = {};
  if (state.phase !== "auction" && trick && trick.plays.length < 5) {
    for (const p of trick.plays) trickCards[p.seat] = p.card;
  }

  const auctionRows: (typeof state.auction | null[])[] = [];
  {
    const order: Seat[] = ["W", "N", "E", "S"];
    const offset = order.indexOf(record.board.dealer);
    const padded = [...Array.from({ length: offset }, () => null), ...state.auction];
    for (let i = 0; i < padded.length; i += 4) auctionRows.push(padded.slice(i, i + 4) as never);
  }

  const toggleHref = (params: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    if (learnerMode && isFellow) q.set("mode", "learner");
    if (bboSeats) q.set("bboAuction", "seats");
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/bridge/table/${sessionId}?${s}` : `/bridge/table/${sessionId}`;
  };
  // Flips only the auction-display mode, preserving everything else — the
  // corner toggle inside the BBO felt.
  const auctionToggleHref = (() => {
    const q = new URLSearchParams();
    if (learnerMode && isFellow) q.set("mode", "learner");
    if (handsParam) q.set("hands", handsParam);
    if (paused) q.set("paused", paused);
    if (!bboSeats) q.set("bboAuction", "seats");
    return `/bridge/table/${sessionId}?${q.toString()}`;
  })();
  return (
    <div className="mx-auto max-w-7xl">
      {/* Status bar */}
      <header className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link
          href="/bridge/table"
          className="text-xs uppercase tracking-[0.3em] text-neutral-400 hover:text-neutral-700"
        >
          ← Play
        </Link>
        <h1 className="text-lg font-medium sm:text-xl">{record.board.name}</h1>
        <span className="text-xs text-neutral-400">
          dealer {record.board.dealer} · vul {record.board.vul}
          {record.forkedFromSessionId && " · fork"}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {state.contract && (
            <span className="rounded border border-neutral-300 bg-white px-2 py-0.5 text-sm font-semibold">
              {callLabel(`${state.contract.level}${state.contract.strain}`)}
              <span className="ml-1 font-normal text-neutral-500">by {state.contract.declarer}</span>
            </span>
          )}
          {state.phase !== "auction" && (
            <span className="rounded bg-neutral-100 px-2 py-0.5 text-sm tabular-nums">
              NS {state.trickCount.NS} · EW {state.trickCount.EW}
            </span>
          )}
          {score && (
            <span className="rounded bg-emerald-50 px-2 py-0.5 text-sm font-medium text-emerald-900">
              {resultLabel(score)}
              {score.contract
                ? ` · ${score.declarerScore >= 0 ? "+" : ""}${score.declarerScore}`
                : ""}
            </span>
          )}
        </span>
      </header>

      {error && (
        <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {saved && (
        <p className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Saved to the library.{" "}
          <Link
            href={`/bridge/library?kind=${saved}`}
            className="font-medium underline-offset-2 hover:underline"
          >
            Open the {saved} shelf →
          </Link>
        </p>
      )}
      {fixed && (
        <p className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Knowledge item saved — this table now plays from the updated rules. Auto-play is
          paused; use step ▸ to watch the fix take effect.
        </p>
      )}
      {fixError && (
        <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Saved, but the knowledge base no longer compiles ({fixError}) — this table keeps
          playing from the last good rules until the item is fixed.
        </p>
      )}

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        {/* Boards never self-start: fresh opens (and post-undo remounts via
            `key`) sit paused until ▶ start. */}
        <AutoAdvance
          key={paused ?? "run"}
          sessionId={sessionId}
          active={aiToAct}
          seq={record.events.length}
          complete={state.phase === "complete"}
        />
        {!learnerMode && (
          <Link
            href={toggleHref({ hands: showAll ? "mine" : "all" })}
            aria-label={showAll ? "Hide other hands" : "Show all hands"}
            title={showAll ? "All hands shown — click to hide" : "Show all hands"}
            className={
              showAll
                ? "rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-emerald-800"
                : "rounded-full border border-neutral-300 px-2.5 py-1 text-neutral-600 hover:border-emerald-400"
            }
          >
            {showAll ? "👁" : "👁‍🗨"}
            <span className="ml-1 hidden lg:inline text-[10px]">hands</span>
          </Link>
        )}
        {!learnerMode && (
          <Dropdown className="relative">
            <summary
              className="cursor-pointer list-none rounded-full border border-neutral-300 px-2.5 py-1 text-neutral-600 hover:border-emerald-400"
              aria-label="Save to library"
              title="Save to library"
            >
              💾<span className="ml-1 hidden lg:inline text-[10px]">save</span> ▾
            </summary>
            <form
              action={saveToLibraryAction}
              className="absolute z-10 mt-1 flex w-64 flex-col gap-1.5 rounded-lg border border-neutral-200 bg-white p-2 shadow-md"
            >
              <input type="hidden" name="sessionId" value={sessionId} />
              <select
                name="kind"
                defaultValue="board"
                className="rounded border border-neutral-300 px-1.5 py-1"
              >
                <option value="deal">Deal (cards only)</option>
                <option value="board">Board (+dealer/vul)</option>
                <option value="play">Play (calls + cards)</option>
                <option value="table">Table lineup</option>
              </select>
              <input
                name="name"
                placeholder={record.board.name}
                className="rounded border border-neutral-300 px-1.5 py-1"
              />
              <textarea
                name="notes"
                rows={2}
                placeholder="Notes (optional)"
                className="rounded border border-neutral-300 px-1.5 py-1"
              />
              <button
                type="submit"
                className="rounded bg-emerald-700 px-2 py-1 font-medium text-white hover:bg-emerald-800"
              >
                Save
              </button>
            </form>
          </Dropdown>
        )}
        {!learnerMode && aiToAct && (
          <form action={playToEndAction}>
            <input type="hidden" name="sessionId" value={sessionId} />
            <button
              type="submit"
              aria-label="Play to end"
              title="Play to end"
              className="rounded-full border border-neutral-300 px-2.5 py-1 text-neutral-600 hover:border-emerald-400"
            >
              ⏭<span className="ml-1 hidden lg:inline text-[10px]">to end</span>
            </button>
          </form>
        )}
        <form action={undoAction}>
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="legacy" value="1" />
          <button
            type="submit"
            aria-label="Undo the last decision"
            title="Undo the last decision"
            className="rounded-full border border-neutral-300 px-2.5 py-1 text-neutral-600 hover:border-emerald-400"
          >
            ↩<span className="ml-1 hidden lg:inline text-[10px]">undo</span>
          </button>
        </form>
        <form action={rewindAction}>
          <input type="hidden" name="sessionId" value={sessionId} />
          <button
            type="submit"
            disabled={record.events.length === 0}
            aria-label="Go to the beginning"
            title="Go to the beginning — rewind this board to the deal"
            className="rounded-full border border-neutral-300 px-2.5 py-1 text-neutral-600 enabled:hover:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ⏮<span className="ml-1 hidden lg:inline text-[10px]">start</span>
          </button>
        </form>
        {!learnerMode && (
          <form action={newDealAction}>
            <input type="hidden" name="sessionId" value={sessionId} />
            <button
              type="submit"
              aria-label="New deal"
              title="New deal — fresh cards, same table"
              className="rounded-full border border-neutral-300 px-2.5 py-1 text-neutral-600 hover:border-emerald-400"
            >
              🎲<span className="ml-1 hidden lg:inline text-[10px]">deal</span>
            </button>
          </form>
        )}
        {!learnerMode && (
          <Link
            href={toggleHref({ editDeal: "1", paused })}
            aria-label="Edit the deal"
            title="Edit the deal — change any cards, then deal the edited board to this table"
            className="rounded-full border border-neutral-300 px-2.5 py-1 text-neutral-600 hover:border-emerald-400"
          >
            ✏️<span className="ml-1 hidden lg:inline text-[10px]">edit</span>
          </Link>
        )}
        {isFellow && (
          <Link
            href={
              learnerMode
                ? `/bridge/table/${sessionId}`
                : `/bridge/table/${sessionId}?mode=learner`
            }
            aria-label={learnerMode ? "Switch to verification view" : "Switch to learner view"}
            title={learnerMode ? "Verification view — show the decisions rail" : "Learner view — hide the decisions rail"}
            className="ml-auto rounded-full border border-neutral-300 px-2.5 py-1 text-neutral-600 hover:border-emerald-400"
          >
            {learnerMode ? "🔍" : "🎓"}
            <span className="ml-1 hidden lg:inline text-[10px]">
              {learnerMode ? "verify" : "learner"}
            </span>
          </Link>
        )}
      </div>

      <div className={`grid gap-6 ${learnerMode ? "" : "xl:grid-cols-[minmax(0,1fr)_360px]"}`}>
        <div>
          <BboTable
            sessionId={sessionId}
            state={state}
            score={score}
            visible={{ N: canSee("N"), E: canSee("E"), S: canSee("S"), W: canSee("W") }}
            legalNow={legalNow ? [...legalNow] : null}
            callsNow={callsNow ? [...callsNow] : null}
            myTurn={myTurn}
            mySeat={mySeat}
            dummy={dummy}
            actingSeat={actingSeat}
            actingIsHuman={actingIsHuman}
            dealer={record.board.dealer}
            auctionRows={auctionRows as never}
            plate={bboPlate}
            auctionDisplay={bboSeats ? "seats" : "box"}
            auctionToggleHref={auctionToggleHref}
          />
        </div>

        {/* The verification rail */}
        {!learnerMode && (
          <aside>
            <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-neutral-500">
              Decisions ({logicEvents.length})
            </h2>
            <div className="max-h-[75vh] space-y-1.5 overflow-y-auto pr-1">
              {[...logicEvents].reverse().map((event) => (
                <DecisionEntry
                  key={event.seq}
                  event={event}
                  sessionId={sessionId}
                  kbId={record.kbId}
                  fixBase={`/bridge/table/${sessionId}`}
                  rules={ruleIndex}
                  defaults={compiled?.defaults}
                />
              ))}
              {logicEvents.length === 0 && (
                <p className="rounded border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
                  No decisions yet — the first trace appears as soon as an AI acts.
                </p>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Fix-at-the-table: opens VIEW-first (the item as players read it) with
          an Edit button; only fixMode=edit renders the real editor. Save
          re-pins this session to the fresh compile and returns paused. */}
      {fixItem && (
        <div className="fixed inset-0 z-50">
          <Link
            href={overlayReturn}
            aria-label="Close the editor"
            className="absolute inset-0 bg-black/50"
          />
          <div className="absolute inset-y-0 right-0 w-full max-w-3xl overflow-y-auto bg-[var(--background,#fff)] p-6 shadow-2xl">
            <div className="mb-4 flex items-baseline justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-neutral-400">
                  Fixing at the table
                </p>
                <h2 className="font-serif text-xl font-medium">{fixItem.title}</h2>
                <p className="mt-1 text-xs text-neutral-500">
                  {fixMode === "edit"
                    ? "Saving updates this table immediately — decisions already made keep their original trace; the next step plays from the corrected rules."
                    : "The item as players read it — Edit to change it; saving updates this table immediately."}
                </p>
              </div>
              <div className="flex flex-none items-center gap-2">
                {fixMode !== "edit" && (
                  <Link
                    href={toggleHref({ paused, fix, fixMode: "edit" })}
                    className="rounded-full bg-emerald-700 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-800"
                  >
                    Edit
                  </Link>
                )}
                <Link
                  href={overlayReturn}
                  className="rounded-full border border-neutral-300 px-3 py-1 text-xs text-neutral-600 hover:border-emerald-400"
                >
                  ✕ back to the board
                </Link>
              </div>
            </div>
            {fixMode === "edit" ? (
              <ItemEditor
                kbId={record.kbId}
                item={fixItem}
                action={saveItemAction}
                hiddenFields={{ returnTo: overlayReturn, repinSessionId: sessionId }}
              />
            ) : (
              <ItemView item={fixItem} />
            )}
          </div>
        </div>
      )}

      {/* Edit-the-deal: centered, dimmed overlay over the board (replaces the
          old /edit page). Redistribute unplayed cards, then continue on the
          edited deal — played cards are locked to the seat that played them. */}
      {editDeal && !learnerMode && (
        <div className="fixed inset-0 z-50">
          <Link
            href={`/bridge/table/${sessionId}?paused=${Date.now()}`}
            aria-label="Close the deal editor"
            className="absolute inset-0 bg-black/50"
          />
          <div className="absolute left-1/2 top-1/2 max-h-[92vh] w-full max-w-5xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-[var(--background,#fff)] p-6 shadow-2xl">
            <div className="mb-4 flex items-baseline justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-neutral-400">
                  Edit the deal
                </p>
                <h2 className="font-serif text-xl font-medium">{record.board.name}</h2>
                <p className="mt-1 max-w-xl text-xs text-neutral-500">
                  Move any unplayed cards, then apply — the game continues right where it is, on
                  the edited deal, with the same seats. Greyed cards were already played and
                  can&apos;t move. Past calls and plays keep their original reasoning.
                </p>
              </div>
              <Link
                href={`/bridge/table/${sessionId}?paused=${Date.now()}`}
                className="flex-none rounded-full border border-neutral-300 px-3 py-1 text-xs text-neutral-600 hover:border-emerald-400"
              >
                ✕ back to the board
              </Link>
            </div>
            {error && (
              <p className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            )}
            <form action={redealEditedAction}>
              <input type="hidden" name="sessionId" value={sessionId} />
              <DealEditor
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
                submitLabel="Apply and continue"
                footer={
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 text-sm text-neutral-600">
                      <input type="checkbox" name="restart" />
                      restart the board instead (fresh auction on the edited deal)
                    </label>
                    <label className="flex items-center gap-2 text-sm text-neutral-600">
                      <input type="checkbox" name="saveToLibrary" />
                      also save the edited board to the library
                    </label>
                  </div>
                }
              />
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

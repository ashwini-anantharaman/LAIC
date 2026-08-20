/**
 * @bridge/sessions v2 (Knowledge Rework Stage F).
 *
 * A session pins a CompiledKb (compileRef) and SNAPSHOTS each AI seat's
 * player configuration at creation — future knowledge edits or player edits
 * never change a running or past session (replay stability). The full event
 * stream (action + logic events) persists; state reconstructs by folding
 * action events on the game-law engine; logic events drive the
 * verification-first table's trace drawer.
 */

import type { SettingValue } from "@bridge/config";
import {
  createBus,
  createEventLog,
  isActionEvent,
  type BidEvent,
  type BidLogicEvent,
  type Call,
  type Card,
  type GameEvent,
  type PlayEvent,
  type PlayLogicEvent,
  type Seat,
  type Vul,
} from "@bridge/events";
import {
  applyEvent,
  createGame,
  createKbDecider,
  hcp,
  initialState,
  legalCalls,
  legalPlays,
  seededDeal,
  type Decision,
  type Game,
  type GameState,
} from "@bridge/engine";
import type { CompiledKb, DecisionPolicyId, KbPlayer, KbStore } from "@bridge/kb";
import { newId } from "@bridge/kb";
import { matchesScope, type ScopeFilter } from "./library";

export * from "./library";
export * from "./submissions";
export * from "./assignments";

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

/** A seat's occupant: a human, or an AI player with its config snapshot. */
export type SeatConfig =
  | { kind: "human"; nexusUserId: string; label?: string }
  | {
      /**
       * BEN, the neural bridge engine (github.com/lorserker/ben), sitting in as
       * a character. The session package stays HTTP-free: the actual decider is
       * INJECTED via SessionServiceOptions.benDecider by the host app, which
       * owns the BEN endpoint. Decisions are recorded as ordinary events, so
       * replays never re-ask BEN.
       */
      kind: "ben";
      label: string;
    }
  | {
      kind: "kb_player";
      playerId: string;
      label: string;
      /** SNAPSHOT at session creation — player edits never reach in-flight sessions. */
      enabledPackIds: string[];
      settingOverrides: Record<string, SettingValue>;
      decisionPolicyId: DecisionPolicyId;
      levelOrdinal?: number;
    };

export interface SessionRecord {
  sessionId: string;
  kbId: string;
  /** The exact artifact this session plays on (last-good at creation). */
  compileRef: { compileId: string; version: number };
  /** Explicit `hands` (library/imported boards) win over the seed deal. */
  board: {
    name: string;
    dealer: Seat;
    vul: Vul;
    seed: number;
    hands?: Record<Seat, Card[]>;
  };
  seats: Record<Seat, SeatConfig>;
  /** Full stream: action events (state) + logic events (traces). */
  events: GameEvent[];
  status: SessionStatus;
  /** Learner mode hides the instrumentation (spec §7). */
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  forkedFromSessionId?: string;
  /** Org the session was created in (0019 scoping). Additive jsonb field. */
  programOrganizationId?: string;
  /** The REAL Nexus program uuid partition (0022). Sessions are always
   *  personal (createdBy is the owner); this keeps programs disjoint. */
  nexusProgramId?: string;
  /**
   * The challenge board this sitting belongs to, stamped at creation. Additive
   * jsonb, absent on every ordinary table.
   *
   * It exists so the HOST can pick a different BEN decider per session without
   * a store round-trip: a challenge board must meet the CACHED opposition
   * (challenges spec §3 — identical lines, identical opponents) and must never
   * fall back to the shelved KB player, while an ordinary table keeps the
   * degrade-don't-break decider. The package itself stays HTTP-free and simply
   * carries the stamp through to `SessionServiceOptions.benDecider`.
   */
  challenge?: {
    challengeId: string;
    boardNo: number;
    /**
     * An UNSCORED replay taken after finishing (spec §2, Attempts). It still
     * faces the cached BEN opposition, but nothing about it is recorded
     * against the challenge — no play record, no pointer, no lock.
     */
    practice?: boolean;
  };
  /**
   * THE COACH'S STUDIO stamp (curated v2; owner direction 2026-08-19) — this
   * session is an AUTHORING sitting, and `learnerSeat` is the chair the board
   * is being built for, which is the chair the coach is sitting in.
   *
   * Same additive-jsonb pattern as `challenge` and `curated`, and the same
   * reason: the host needs one fact about the session without asking the
   * client for it. Here the fact is that this sitting is being AUTHORED at all
   * — the studio seats and plays exactly like any other table (coach in one
   * chair, robots in the other three), so nothing in the seat layout gives it
   * away any more. The package itself neither plays nor decides; it carries
   * the stamp.
   *
   * Absent on every ordinary table, and on the one-day-old studio sittings
   * that held all four chairs; the host recognizes those by their seats
   * instead (its studioSession helper), so they keep working.
   */
  authoring?: {
    learnerSeat: Seat;
  };
  /**
   * CURATED DEAL stamp (owner design 2026-08-15) — this session replays a
   * coach's annotated board. Same pattern as `challenge` above: the stamp is
   * how the host picks per-session behavior with no store round-trip — the
   * robots follow the coach's recorded line until the learner diverges
   * (SessionServiceOptions.curatedDecider), and the coach-overlay API finds
   * the annotations from the sessionId. `entryId` is the LEARNER'S copy of
   * the curated library entry (copy-on-assign).
   */
  curated?: {
    entryId: string;
    /**
     * THE COACH SEEING THEIR OWN BOARD AS THE LEARNER WILL (owner ask
     * 2026-08-19). Same idea as `challenge.practice` above: the sitting is
     * real — the robots follow the recorded line, the constraint holds, the
     * overlay speaks — but NOTHING about it is recorded. In particular the
     * learner's progress stamp (`curatedProgressJson` on the entry) must not
     * be written, or a coach opening a hint in their own preview would mark
     * their master entry as if a learner had.
     *
     * The flag is carried, never interpreted, by this package: what "not
     * recorded" means belongs to the host's own writers.
     */
    preview?: boolean;
  };
}

export interface SessionStoreData {
  sessions: SessionRecord[];
}

/** A sitting in progress, or a board played to the end. */
export type SessionStatus = "active" | "completed";

/**
 * How to list sessions: the scope, plus THE STATUS THE CALLER ACTUALLY WANTS.
 *
 * Status belongs in the query, never in a `.filter()` over the result. Every
 * backend caps its listing (the Postgres store at the 100 most recent), and a
 * player accumulates far more abandoned sittings than finished boards — so
 * filtering afterwards lets unfinished sessions crowd the finished ones out of
 * the window before the caller ever sees them. Measured on live data: a learner
 * with 129 sessions and 4 finished games could only ever see 2 of them in My
 * games, and the page pulled 539 kB of jsonb to render those 2 rows.
 */
export interface SessionFilter extends ScopeFilter {
  status?: SessionStatus;
}

/**
 * One row of a session LIST: the board's name and when it was last touched —
 * never the game itself.
 *
 * A SessionRecord carries the whole sitting: all four hands, the complete event
 * stream, every seat's config. A list screen shows a name and a date, so building
 * one out of records moves megabytes to print a few hundred bytes. Measured on
 * live data: My games pulled 2.8 MB of JSON to render 25 names — the same list
 * as a summary is 3.2 kB.
 *
 * Reach for this whenever a screen lists sessions without opening one.
 */
export interface SessionSummary {
  sessionId: string;
  boardName: string;
  status: SessionStatus;
  updatedAt: string;
}

export interface SessionStore {
  putSession(record: SessionRecord): Promise<void>;
  getSession(sessionId: string): Promise<SessionRecord | null>;
  listSessions(filter?: SessionFilter): Promise<SessionRecord[]>;
  /** The same listing as `listSessions`, without the games inside. */
  listSessionSummaries(filter?: SessionFilter): Promise<SessionSummary[]>;
  /** Remove one session — a player discarding an unfinished board. */
  deleteSession(sessionId: string): Promise<void>;
  /** Remove every session of a KB (part of KB deletion — their pinned compiles go with the KB). */
  deleteSessionsForKb(kbId: string): Promise<void>;
}

/** The one place a record collapses into its list row. */
export function summarizeSession(s: SessionRecord): SessionSummary {
  return {
    sessionId: s.sessionId,
    boardName: s.board.name,
    status: s.status,
    updatedAt: s.updatedAt,
  };
}

export class InMemorySessionStore implements SessionStore {
  constructor(protected data: SessionStoreData = { sessions: [] }) {}
  protected persist(): void {}
  async putSession(record: SessionRecord) {
    const i = this.data.sessions.findIndex((s) => s.sessionId === record.sessionId);
    if (i >= 0) this.data.sessions[i] = record;
    else this.data.sessions.push(record);
    this.persist();
  }
  async getSession(sessionId: string) {
    return this.data.sessions.find((s) => s.sessionId === sessionId) ?? null;
  }
  async listSessions(filter?: SessionFilter) {
    return this.data.sessions
      .filter(
        (s) =>
          matchesScope(s, filter) &&
          (filter?.status === undefined || s.status === filter.status),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  /** In memory there is nothing to save by projecting — the shape is the point. */
  async listSessionSummaries(filter?: SessionFilter) {
    return (await this.listSessions(filter)).map(summarizeSession);
  }
  async deleteSession(sessionId: string) {
    this.data.sessions = this.data.sessions.filter((s) => s.sessionId !== sessionId);
    this.persist();
  }
  async deleteSessionsForKb(kbId: string) {
    this.data.sessions = this.data.sessions.filter((s) => s.kbId !== kbId);
    this.persist();
  }
}

// ---------------------------------------------------------------------------
// Recorded boards
// ---------------------------------------------------------------------------

/** A board recorded as plain actions (library/imported), no event stream. */
export interface RecordedActions {
  boardRef: string;
  dealer: Seat;
  vul: Vul;
  hands: Record<Seat, Card[]>;
  auction: { seat: Seat; call: Call }[];
  play: { seat: Seat; card: Card }[];
}

/**
 * Synthesize a legal event prefix from a recorded auction+play. Emits
 * logic+action PAIRS (logic seq 2i, action seq 2i+1) so undo() and the
 * engine's `logicSeq = seq - 1` invariant hold. Throws on out-of-turn or
 * illegal recorded actions.
 */
export function eventsFromRecording(rec: RecordedActions): {
  events: GameEvent[];
  complete: boolean;
} {
  const events: GameEvent[] = [];
  let state = initialState(rec.boardRef, rec.dealer, rec.vul, rec.hands);
  let pair = 0;
  const reason = "recorded — resumed from the library";
  const logicBase = (seat: Seat) => ({
    seq: pair * 2,
    ts: Date.now(),
    boardRef: rec.boardRef,
    seat,
    fallback: false,
    trace: [],
    citedSettings: [],
    facts: {},
    reason,
    rejected: [],
  });

  for (const { seat, call } of rec.auction) {
    if (state.phase !== "auction")
      throw new Error(`Recorded call ${call} by ${seat} falls outside the auction`);
    if (state.turn !== seat)
      throw new Error(`Recorded call ${call} by ${seat} is out of turn (${state.turn} to act)`);
    if (!legalCalls(state.auction, seat).has(call))
      throw new Error(`Recorded call ${call} by ${seat} is not legal at this point`);
    const logic: BidLogicEvent = {
      ...logicBase(seat),
      category: "bid-logic-event",
      candidates: [call],
      chosen: call,
    };
    const action: BidEvent = {
      seq: pair * 2 + 1,
      ts: Date.now(),
      boardRef: rec.boardRef,
      category: "bid-event",
      seat,
      call,
      fallback: false,
    };
    events.push(logic, action);
    state = applyEvent(state, action);
    pair++;
  }

  for (const { seat, card } of rec.play) {
    const label = `${card.suit}${card.rank}`;
    if (state.phase !== "play")
      throw new Error(`Recorded play ${label} by ${seat} falls outside the play`);
    if (state.turn !== seat)
      throw new Error(`Recorded play ${label} by ${seat} is out of turn (${state.turn} to act)`);
    if (!legalPlays(state, seat).some((c) => c.suit === card.suit && c.rank === card.rank))
      throw new Error(`Recorded play ${label} by ${seat} is not legal at this point`);
    const logic: PlayLogicEvent = {
      ...logicBase(seat),
      category: "play-logic-event",
      candidates: [card],
      chosen: card,
    };
    const action: PlayEvent = {
      seq: pair * 2 + 1,
      ts: Date.now(),
      boardRef: rec.boardRef,
      category: "play-event",
      seat,
      card,
      fallback: false,
    };
    events.push(logic, action);
    state = applyEvent(state, action);
    pair++;
  }

  return { events, complete: state.phase === "complete" };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class AwaitingHumanError extends Error {
  constructor(public readonly seat: Seat) {
    super(`Awaiting human action for seat ${seat}`);
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface SessionView {
  record: SessionRecord;
  state: GameState;
  /** Seat whose controller acts next (dummy → declarer in play). */
  actingSeat: Seat;
  actingIsHuman: boolean;
}

/** The decideBid/decidePlay pair a seat needs (createKbDecider's shape). */
export interface SeatDecider {
  decideBid(state: GameState, seat: Seat): Promise<Decision<Call>>;
  decidePlay(state: GameState, seat: Seat): Promise<Decision<Card>>;
}

export interface SessionServiceOptions {
  now?: () => string;
  /**
   * Builds the decider for a `kind: "ben"` seat. Injected by the host app
   * (it owns BEN_ENDPOINT); without it, a BEN seat fails loudly when asked
   * to act rather than silently passing.
   */
  benDecider?: (args: {
    record: SessionRecord;
    compiled: CompiledKb;
    seat: Seat;
  }) => SeatDecider;
  /**
   * A KB seat's CARD, from the host's double-dummy solver (owner direction
   * 2026-08-15: robots bid the KB but play DDS). Injected because the WASM
   * solver lives in the app, not this package. Return null to decline a
   * position; throwing is treated the same. Never consulted for the opening
   * lead — see withKbPlayOverride's rails.
   */
  kbPlayOverride?: (state: GameState, seat: Seat) => Promise<Card | null>;
  /**
   * CURATED-DEAL robots (owner design 2026-08-15): when a session carries
   * `record.curated`, every robot seat's decider is built by the HOST
   * through this factory instead — the host follows the coach's recorded
   * line while the learner stays on it, and hands control to `fallback`
   * (the seat's ordinary decider) the moment the line is left. Injected
   * because the line lives in the library store, which this package
   * cannot read.
   */
  curatedDecider?: (args: {
    record: SessionRecord;
    seat: Seat;
    fallback: SeatDecider;
  }) => SeatDecider;
}

/**
 * Who is ENTITLED to act, once the dummy takeover is taken into account.
 *
 * Bridge law hands dummy's cards to the declarer, so `actingSeat()` already
 * resolves both hands to the declarer's chair. That is right at a table of four
 * people and wrong at a practice table: a learner whose robot partner wins the
 * contract becomes dummy and then watches the robot play thirteen tricks from
 * both hands. Here the learner takes the declarer's chair instead and plays it.
 *
 * THE GATE IS THAT THE PARTNER IS A ROBOT. A declarer seat occupied by another
 * PERSON is left alone — nobody is ever handed someone else's cards — so this
 * can only fire where the learner would otherwise have nothing to do. It is
 * also play-only: `actingSeat()` maps dummy to declarer only once the contract
 * is settled, so during the auction every seat still bids its own cards.
 *
 * Returns the seat whose occupant may submit the action; normally `actingSeat`.
 */
export function controllingSeat(
  seats: Record<Seat, SeatConfig>,
  state: GameState,
  actingSeat: Seat,
): Seat {
  if (state.phase !== "play" || !state.contract) return actingSeat;
  if (actingSeat !== state.contract.declarer) return actingSeat;
  if (seats[actingSeat].kind === "human") return actingSeat;
  const partner = TAKEOVER_PARTNER[actingSeat];
  return seats[partner].kind === "human" ? partner : actingSeat;
}

const TAKEOVER_PARTNER: Record<Seat, Seat> = { N: "S", S: "N", E: "W", W: "E" };

/**
 * THE COACH BIDS ALL FOUR HANDS (owner direction 2026-08-19).
 *
 * An authoring sitting (`record.authoring` — the coach's studio) seats the coach
 * in the learner's chair with robots in the other three, and the CARD PLAY runs
 * exactly like any other table: the robots play their own cards. The AUCTION
 * does not. A board built to teach a 3NT hold-up has to arrive at 3NT, so every
 * call in the studio is the coach's, whichever chair it comes from — the
 * contract is the frame of the lesson, not something to be negotiated with a
 * robot that cannot be told what the board is for.
 *
 * So this is a PHASE-DEPENDENT control rule, and it lives here beside
 * `controllingSeat` because the same four places that ask who controls a chair
 * have to ask this too: the deciders (a robot chair must refuse to bid), `step`
 * (nothing to advance during a studio auction), `act` (the coach's call is
 * legal on a robot's chair), and `actingIsHuman` (so the client waits for a
 * person instead of auto-playing).
 *
 * Deliberately NOT identity-aware: which human may act is the caller's gate,
 * exactly as it is for `controllingSeat` and the seat-kind check beside it.
 */
export const coachBidsThisSeat = (
  record: Pick<SessionRecord, "authoring">,
  state: GameState,
): boolean => !!record.authoring && state.phase === "auction";

export class SessionService {
  private readonly now: () => string;

  constructor(
    private readonly store: SessionStore,
    private readonly kb: KbStore,
    private readonly options: SessionServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  /** Snapshot a KbPlayer into a seat config (the pin). */
  static seatFromPlayer(player: KbPlayer, compiled: CompiledKb): SeatConfig {
    const levelOrdinal = compiled.packs.find((p) => p.levelId === player.levelId)?.ordinal;
    return {
      kind: "kb_player",
      playerId: player.playerId,
      label: player.name,
      enabledPackIds: player.enabledPackIds,
      settingOverrides: player.settingOverrides,
      decisionPolicyId: player.decisionPolicyId,
      levelOrdinal,
    };
  }

  async createSession(input: {
    kbId: string;
    compiled: CompiledKb;
    seats: Record<Seat, SeatConfig>;
    seed: number;
    dealer?: Seat;
    vul?: Vul;
    /** Explicit deal (library/imported board) — overrides the seed deal. */
    hands?: Record<Seat, Card[]>;
    boardName?: string;
    createdBy: string;
    /** Org scope stamp (0019) — pass the caller's context org. */
    programOrganizationId?: string;
    /** Program partition stamp (0022). */
    nexusProgramId?: string;
    forkedFromSessionId?: string;
    /** Adopted event prefix (forks resume mid-board). */
    primedEvents?: GameEvent[];
    /** Initial status ("completed" for fully recorded boards). */
    status?: SessionStatus;
    /** Challenge stamp — see SessionRecord.challenge. */
    challenge?: SessionRecord["challenge"];
    /** Studio stamp — see SessionRecord.authoring. */
    authoring?: SessionRecord["authoring"];
    /** Curated-deal stamp — see SessionRecord.curated. */
    curated?: SessionRecord["curated"];
  }): Promise<SessionRecord> {
    const record: SessionRecord = {
      sessionId: newId("bs"),
      kbId: input.kbId,
      compileRef: { compileId: input.compiled.compileId, version: input.compiled.version },
      board: {
        name: input.boardName ?? `seeded-${input.seed}`,
        dealer: input.dealer ?? "N",
        vul: input.vul ?? "none",
        seed: input.seed,
        hands: input.hands,
      },
      seats: input.seats,
      events: input.primedEvents ?? [],
      status: input.status ?? "active",
      createdBy: input.createdBy,
      createdAt: this.now(),
      updatedAt: this.now(),
      forkedFromSessionId: input.forkedFromSessionId,
      programOrganizationId: input.programOrganizationId,
      nexusProgramId: input.nexusProgramId,
      ...(input.challenge ? { challenge: input.challenge } : {}),
      ...(input.authoring ? { authoring: input.authoring } : {}),
      ...(input.curated ? { curated: input.curated } : {}),
    };
    await this.store.putSession(record);
    return record;
  }

  async listRecent(filter?: SessionFilter): Promise<SessionRecord[]> {
    return this.store.listSessions(filter);
  }

  /** For screens that LIST boards rather than open one — see SessionSummary. */
  async listRecentSummaries(filter?: SessionFilter): Promise<SessionSummary[]> {
    return this.store.listSessionSummaries(filter);
  }

  /** Part of KB deletion — the pinned compiles vanish with the KB. */
  async deleteForKb(kbId: string): Promise<void> {
    await this.store.deleteSessionsForKb(kbId);
  }

  /** A player discarding one unfinished board. Ownership and phase checks
   *  belong to the caller — this is the mechanism, not the policy. */
  async deleteSession(sessionId: string): Promise<void> {
    await this.store.deleteSession(sessionId);
  }

  async requireSession(sessionId: string): Promise<SessionRecord> {
    const record = await this.store.getSession(sessionId);
    if (!record) throw new Error(`No session ${sessionId}`);
    return record;
  }

  /**
   * The same read, for a caller that can HANDLE the board being gone.
   *
   * A session vanishes for ordinary reasons — the player discarded it, another
   * tab finished with it — and a caller that only wanted to look should not
   * have to catch an exception to find that out. `requireSession`'s throw stays
   * for the paths where a missing board really is a fault; this exists so a
   * table's own controls can answer "that board is no longer here" instead of
   * turning a routine event into an error page. It never swallows a STORE
   * failure: only a genuinely absent record answers null.
   */
  async getSession(sessionId: string): Promise<SessionRecord | null> {
    return this.store.getSession(sessionId);
  }

  /**
   * Re-pin a session to a newer compile — the one deliberate, user-driven
   * exception to "sessions never float": a fellow spots a bad decision at
   * the table, fixes the knowledge item, and continues the SAME board under
   * the corrected rules. Past events keep their recorded traces; only future
   * decisions consult the new compile.
   */
  async repinCompile(sessionId: string, compiled: CompiledKb): Promise<void> {
    const record = await this.requireSession(sessionId);
    if (record.compileRef.compileId === compiled.compileId) return;
    record.compileRef = { compileId: compiled.compileId, version: compiled.version };
    record.updatedAt = this.now();
    await this.store.putSession(record);
  }

  /** The pinned compile — sessions never float to newer versions. */
  async compiledFor(record: SessionRecord): Promise<CompiledKb> {
    const compiled = await this.kb.getCompile(record.compileRef.compileId);
    if (!compiled)
      throw new Error(`Pinned compile ${record.compileRef.compileId} is missing`);
    return compiled;
  }

  /**
   * GUARD-RAILED DOUBLE-DUMMY PLAY (owner direction 2026-08-15): a KB seat's
   * CALLS stay with the KB — the system the coach teaches — but its CARDS
   * come from the host-injected solver. Two rails keep the solver honest:
   *   · the OPENING LEAD stays with the KB's lead rules — a solver's lead is
   *     chosen by peeking at the whole deal, which no human lead is;
   *   · any solver miss (null, or a throw) falls back to the KB whole, so a
   *     table never stalls on its robots.
   */
  private withKbPlayOverride(kb: SeatDecider): SeatDecider {
    const override = this.options.kbPlayOverride;
    if (!override) return kb;
    return {
      decideBid: (state, seat) => kb.decideBid(state, seat),
      decidePlay: async (state, seat) => {
        const openingLead = !state.tricks.some((t) => t.plays.length > 0);
        if (!openingLead) {
          try {
            const card = await override(state, seat);
            if (card) {
              return {
                action: card,
                candidates: [card],
                trace: [],
                citedSettings: [],
                facts: { hcp: hcp(state.hands[seat] ?? []) },
                reason: "Double-dummy: keeps the maximum tricks from here.",
                rejected: [],
                fallback: false,
              };
            }
          } catch {
            // Solver unavailable — the KB plays on rather than the table stalling.
          }
        }
        return kb.decidePlay(state, seat);
      },
    };
  }

  /**
   * A curated session's robots follow the COACH'S RECORDED LINE first
   * (owner design 2026-08-15) — the host's curatedDecider wraps the seat's
   * ordinary decider and defers to it once the learner leaves the line.
   * Ordinary sessions (no stamp, or no injected factory) pass through.
   */
  private withCuratedLine(record: SessionRecord, seat: Seat, fallback: SeatDecider): SeatDecider {
    if (!record.curated || !this.options.curatedDecider) return fallback;
    return this.options.curatedDecider({ record, seat, fallback });
  }

  /** The injected BEN decider, or a loud failure if the host never wired one. */
  private benSeatDecider(record: SessionRecord, compiled: CompiledKb, seat: Seat): SeatDecider {
    if (this.options.benDecider) return this.options.benDecider({ record, compiled, seat });
    const fail = () => {
      throw new Error(
        `Seat ${seat} is BEN, but no BEN decider is configured (is BEN_ENDPOINT set?)`,
      );
    };
    return { decideBid: async () => fail(), decidePlay: async () => fail() };
  }

  /** Rebuild the Game from the record (fold action events; wire deciders). */
  private buildGame(
    record: SessionRecord,
    compiled: CompiledKb,
  ): { game: Game; newEvents: () => readonly GameEvent[] } {
    const bus = createBus();
    const log = createEventLog(bus);
    const humanDecider = {
      decideBid: async (_state: GameState, seat: Seat): Promise<Decision<Call>> => {
        throw new AwaitingHumanError(seat);
      },
      decidePlay: async (_state: GameState, seat: Seat): Promise<Decision<Card>> => {
        throw new AwaitingHumanError(seat);
      },
    };
    const deciders = Object.fromEntries(
      (Object.entries(record.seats) as [Seat, SeatConfig][]).map(([seat, config]) => [
        seat,
        config.kind === "human"
          ? humanDecider
          : config.kind === "ben"
            ? this.withCuratedLine(record, seat, this.benSeatDecider(record, compiled, seat))
          : this.withCuratedLine(
              record,
              seat,
              this.withKbPlayOverride(
                createKbDecider({
                  compiled,
                  player: {
                    enabledPackIds: config.enabledPackIds,
                    settingOverrides: config.settingOverrides,
                    decisionPolicyId: config.decisionPolicyId,
                    levelOrdinal: config.levelOrdinal,
                  },
                  seed: `${record.sessionId}_${seat}`,
                }),
              ),
            ),
      ]),
    ) as Record<Seat, ReturnType<typeof createKbDecider>>;

    // THE TAKEOVER HAS TO REACH THE DECIDERS, not just the view. The engine
    // asks the DECLARER's decider for both the declarer's cards and dummy's,
    // and deciders are wired per seat from the record — so a robot declarer
    // partnered with the learner would keep playing both hands while the view
    // said it was the learner's turn. Every robot seat is wrapped: at decision
    // time it re-checks who controls it and raises the same AwaitingHumanError
    // a human seat raises, so `step()` stops. That is exactly what it means —
    // this board IS waiting on a person.
    for (const chair of Object.keys(deciders) as Seat[]) {
      if (record.seats[chair].kind === "human") continue;
      const inner = deciders[chair];
      // THE CHAIR, NOT THE ARGUMENT. `game.step()` calls the controller's
      // decider with the seat whose CARD is being played — for dummy's card
      // that is dummy, while the decider it reaches is the declarer's. Asking
      // "who controls the seat passed in" would therefore answer about dummy
      // and wave the robot through; the question is whether a human now holds
      // THIS chair.
      deciders[chair] = {
        decideBid: async (state: GameState, s: Seat) => {
          // THE STUDIO'S AUCTION IS THE COACH'S, every chair of it. The robot
          // sitting here plays its own cards later; it does not get to choose
          // the contract the lesson is built on.
          if (coachBidsThisSeat(record, state)) throw new AwaitingHumanError(chair);
          const owner = controllingSeat(record.seats, state, chair);
          if (owner !== chair) throw new AwaitingHumanError(owner);
          return inner.decideBid(state, s);
        },
        decidePlay: async (state: GameState, s: Seat) => {
          const owner = controllingSeat(record.seats, state, chair);
          if (owner !== chair) throw new AwaitingHumanError(owner);
          return inner.decidePlay(state, s);
        },
      } as ReturnType<typeof createKbDecider>;
    }

    const hands = record.board.hands ?? seededDeal(record.board.seed);
    const primed = record.events.filter(isActionEvent);
    const game = createGame(
      bus,
      deciders,
      initialState(record.board.name, record.board.dealer, record.board.vul, hands),
      {},
      primed,
    );
    // Read at persist time: the log records only THIS request's events
    // (primed events are never re-emitted).
    return { game, newEvents: () => log.getAll() };
  }

  async view(sessionId: string): Promise<SessionView> {
    const record = await this.requireSession(sessionId);
    const compiled = await this.compiledFor(record);
    const { game } = this.buildGame(record, compiled);
    const state = game.getState();
    const actingSeat = game.actingSeat();
    return {
      record,
      state,
      actingSeat,
      actingIsHuman:
        coachBidsThisSeat(record, state) ||
        record.seats[controllingSeat(record.seats, state, actingSeat)].kind === "human",
    };
  }

  /** Advance ONE AI decision. Throws AwaitingHumanError on a human seat. */
  async step(sessionId: string): Promise<SessionView> {
    const record = await this.requireSession(sessionId);
    const compiled = await this.compiledFor(record);
    const { game, newEvents } = this.buildGame(record, compiled);
    if (game.getState().phase === "complete") return this.view(sessionId);

    const actingSeat = game.actingSeat();
    // A studio auction has nothing to step: every call is the coach's, so the
    // answer to "advance one AI decision" is that there isn't one. Said here
    // rather than left to the decider so the tempo controls read it as a human
    // turn instead of a robot that keeps failing.
    if (coachBidsThisSeat(record, game.getState())) throw new AwaitingHumanError(actingSeat);
    // The controller, not the chair: under a takeover the acting chair is a
    // robot's but a person is holding it (see `controllingSeat`).
    const controller = controllingSeat(record.seats, game.getState(), actingSeat);
    if (record.seats[controller].kind === "human") throw new AwaitingHumanError(controller);

    await game.step();
    return this.persistNewEvents(record, newEvents(), game);
  }

  /** Commit a HUMAN action for the acting seat. The Game controller trusts
   *  deciders, so legality is checked HERE before anything commits. */
  async act(sessionId: string, action: { call?: Call; card?: Card }): Promise<SessionView> {
    const record = await this.requireSession(sessionId);

    // One-shot deciders on every seat: whatever seat the controller resolves
    // (incl. human declarer playing dummy), the submitted action serves once.
    const decision = <A>(a: A): Decision<A> => ({
      action: a,
      candidates: [a],
      trace: [],
      citedSettings: [],
      facts: {},
      reason: "human action",
      rejected: [],
      fallback: false,
    });
    const oneShot = {
      decideBid: async (state: GameState, seat: Seat) => {
        if (action.call === undefined) throw new Error("A call is required now");
        if (!legalCalls(state.auction, seat).has(action.call))
          throw new Error(`${action.call} is not a legal call`);
        return decision(action.call);
      },
      decidePlay: async (state: GameState, seat: Seat) => {
        if (action.card === undefined) throw new Error("A card is required now");
        const legal = legalPlays(state, seat);
        if (!legal.some((c) => c.suit === action.card!.suit && c.rank === action.card!.rank))
          throw new Error("That card is not legal now");
        return decision(action.card);
      },
    };
    const hands = record.board.hands ?? seededDeal(record.board.seed);
    const bus = createBus();
    const log = createEventLog(bus);
    const deciders = Object.fromEntries(
      (Object.keys(record.seats) as Seat[]).map((seat) => [seat, oneShot]),
    ) as Record<Seat, typeof oneShot>;
    const replay = createGame(
      bus,
      deciders,
      initialState(record.board.name, record.board.dealer, record.board.vul, hands),
      {},
      record.events.filter(isActionEvent),
    );
    const state = replay.getState();
    if (state.phase === "complete") throw new Error("Board is complete");
    const actingSeat = replay.actingSeat();
    // Not `actingSeat` directly: a learner who would be dummy declares their
    // robot partner's contract themselves (see `controllingSeat`).
    const controller = controllingSeat(record.seats, state, actingSeat);
    // A studio auction accepts the coach's call at ANY chair (see
    // `coachBidsThisSeat`); every other position needs a person in the seat.
    if (!coachBidsThisSeat(record, state) && record.seats[controller].kind !== "human")
      throw new Error(`Seat ${actingSeat} is not a human seat`);
    await replay.step();
    return this.persistNewEvents(record, log.getAll(), replay);
  }

  /**
   * Take back the last `count` ACTIONS in ONE read and ONE write.
   *
   * `undo()` called in a loop is two store reads, a write and a full event
   * replay per action — fine for a button pressed once, a real wait when a
   * caller has to unwind a learner's card plus three robot replies (the curated
   * take-back, which is why this exists). The truncation is the same rule
   * either way: the single writer emits logic then action as consecutive seqs,
   * so cutting below the target action's logic event drops the pairs together.
   *
   * `count` is clamped to what is there; taking back more than the board holds
   * empties it rather than failing.
   */
  async undoActions(sessionId: string, count: number): Promise<SessionView> {
    if (count <= 0) return this.view(sessionId);
    const record = await this.requireSession(sessionId);
    const actions = record.events.filter(isActionEvent);
    if (!actions.length) return this.view(sessionId);
    const target = actions[Math.max(0, actions.length - count)]!;
    record.events = record.events.filter((e) => e.seq < target.seq - 1);
    record.status = "active";
    record.updatedAt = this.now();
    await this.store.putSession(record);
    return this.view(sessionId);
  }

  /** Undo the last committed action (and its logic event). */
  async undo(sessionId: string): Promise<SessionView> {
    const record = await this.requireSession(sessionId);
    const actions = record.events.filter(isActionEvent);
    if (!actions.length) return this.view(sessionId);
    const lastAction = actions[actions.length - 1]!;
    // The single-writer emits logic then action as consecutive seqs — drop
    // the pair together.
    record.events = record.events.filter((e) => e.seq < lastAction.seq - 1);
    record.status = "active";
    record.updatedAt = this.now();
    await this.store.putSession(record);
    return this.view(sessionId);
  }

  /** Rewind the whole board to the deal: drop every event, back to active. */
  async rewindToStart(sessionId: string): Promise<SessionView> {
    const record = await this.requireSession(sessionId);
    record.events = [];
    record.status = "active";
    record.updatedAt = this.now();
    await this.store.putSession(record);
    return this.view(sessionId);
  }

  /**
   * Fork (spec §7): same board and pinned compile, NEW seat configs, primed
   * with this session's event prefix. The source session stays untouched.
   * `fresh: true` drops the prefix — the same board replays from the deal
   * (how a completed board is re-run with a different lineup).
   */
  async fork(
    sessionId: string,
    seats: Record<Seat, SeatConfig>,
    createdBy: string,
    options: {
      fresh?: boolean;
      /**
       * Deal override (the mid-play deal editor). With a kept prefix, every
       * already-played card must sit at the seat that played it — the caller
       * guarantees this; the fold replays the same events onto the edited
       * deal and past decisions keep their original reasoning.
       */
      hands?: Record<Seat, Card[]>;
      dealer?: Seat;
      vul?: Vul;
      boardName?: string;
    } = {},
  ): Promise<SessionRecord> {
    const source = await this.requireSession(sessionId);
    const compiled = await this.compiledFor(source);
    return this.createSession({
      kbId: source.kbId,
      compiled,
      seats,
      seed: source.board.seed,
      dealer: options.dealer ?? source.board.dealer,
      vul: options.vul ?? source.board.vul,
      hands: options.hands ?? source.board.hands,
      boardName: options.boardName ?? source.board.name,
      createdBy,
      programOrganizationId: source.programOrganizationId,
      nexusProgramId: source.nexusProgramId,
      forkedFromSessionId: source.sessionId,
      primedEvents: options.fresh ? [] : [...source.events],
    });
  }

  private async persistNewEvents(
    record: SessionRecord,
    collected: readonly GameEvent[],
    game: Game,
  ): Promise<SessionView> {
    // The log contains ONLY events emitted in this request (primed events
    // are not re-emitted). Append them all: logic events carry the traces.
    record.events = [...record.events, ...collected];
    record.status = game.getState().phase === "complete" ? "completed" : "active";
    record.updatedAt = this.now();
    await this.store.putSession(record);
    const actingSeat = game.actingSeat();
    const nextState = game.getState();
    return {
      record,
      state: nextState,
      actingSeat,
      actingIsHuman:
        coachBidsThisSeat(record, nextState) ||
        record.seats[controllingSeat(record.seats, nextState, actingSeat)].kind === "human",
    };
  }
}

// ---------------------------------------------------------------------------
// Constrained environments (spec §5): the closed loop. A deal is safe for a
// seat lineup exactly when simulating it with the ACTUAL configs completes
// with zero engine-floor events — strictly stronger than any static filter.
// ---------------------------------------------------------------------------

export interface SafeSeedSearch {
  compiled: CompiledKb;
  seats: Record<Seat, SeatConfig>;
  /** First candidate seed (search walks upward from here). */
  startSeed: number;
  maxAttempts?: number;
}

/**
 * Find a deal seed whose full self-play (with each seat's real config; human
 * seats simulated by the table-default surface) hits zero engine floors.
 * Returns null when none found within the attempt budget.
 */
export async function findSafeSeed(search: SafeSeedSearch): Promise<number | null> {
  const { simulateDeal } = await import("@bridge/engine");
  const attempts = search.maxAttempts ?? 60;
  // The most restrictive seat governs: simulate self-play under EACH distinct
  // AI config; a human seat plays "anything legal" so it never floors.
  const configs = (Object.values(search.seats) as SeatConfig[])
    .filter((c): c is Extract<SeatConfig, { kind: "kb_player" }> => c.kind === "kb_player")
    .map((c) => ({
      enabledPackIds: c.enabledPackIds,
      settingOverrides: c.settingOverrides,
      decisionPolicyId: c.decisionPolicyId,
      levelOrdinal: c.levelOrdinal,
    }));
  if (!configs.length) return search.startSeed;

  for (let seed = search.startSeed; seed < search.startSeed + attempts; seed++) {
    let safe = true;
    for (const player of configs) {
      const result = await simulateDeal({ compiled: search.compiled, player }, seed);
      if (!result.completed || result.floorEvents > 0) {
        safe = false;
        break;
      }
    }
    if (safe) return seed;
  }
  return null;
}

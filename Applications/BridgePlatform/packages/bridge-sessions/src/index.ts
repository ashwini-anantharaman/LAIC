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
  type ActionEvent,
  type Call,
  type Card,
  type GameEvent,
  type Seat,
  type Vul,
} from "@bridge/events";
import {
  createGame,
  createKbDecider,
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

export * from "./library";

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

/** A seat's occupant: a human, or an AI player with its config snapshot. */
export type SeatConfig =
  | { kind: "human"; nexusUserId: string; label?: string }
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
  status: "active" | "completed";
  /** Learner mode hides the instrumentation (spec §7). */
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  forkedFromSessionId?: string;
}

export interface SessionStoreData {
  sessions: SessionRecord[];
}

export interface SessionStore {
  putSession(record: SessionRecord): Promise<void>;
  getSession(sessionId: string): Promise<SessionRecord | null>;
  listSessions(): Promise<SessionRecord[]>;
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
  async listSessions() {
    return [...this.data.sessions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
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

export interface SessionServiceOptions {
  now?: () => string;
}

export class SessionService {
  private readonly now: () => string;

  constructor(
    private readonly store: SessionStore,
    private readonly kb: KbStore,
    options: SessionServiceOptions = {},
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
    forkedFromSessionId?: string;
    /** Adopted event prefix (forks resume mid-board). */
    primedEvents?: GameEvent[];
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
      status: "active",
      createdBy: input.createdBy,
      createdAt: this.now(),
      updatedAt: this.now(),
      forkedFromSessionId: input.forkedFromSessionId,
    };
    await this.store.putSession(record);
    return record;
  }

  async listRecent(): Promise<SessionRecord[]> {
    return this.store.listSessions();
  }

  async requireSession(sessionId: string): Promise<SessionRecord> {
    const record = await this.store.getSession(sessionId);
    if (!record) throw new Error(`No session ${sessionId}`);
    return record;
  }

  /** The pinned compile — sessions never float to newer versions. */
  async compiledFor(record: SessionRecord): Promise<CompiledKb> {
    const compiled = await this.kb.getCompile(record.compileRef.compileId);
    if (!compiled)
      throw new Error(`Pinned compile ${record.compileRef.compileId} is missing`);
    return compiled;
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
          : createKbDecider({
              compiled,
              player: {
                enabledPackIds: config.enabledPackIds,
                settingOverrides: config.settingOverrides,
                decisionPolicyId: config.decisionPolicyId,
                levelOrdinal: config.levelOrdinal,
              },
              seed: `${record.sessionId}_${seat}`,
            }),
      ]),
    ) as Record<Seat, ReturnType<typeof createKbDecider>>;

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
      actingIsHuman: record.seats[actingSeat].kind === "human",
    };
  }

  /** Advance ONE AI decision. Throws AwaitingHumanError on a human seat. */
  async step(sessionId: string): Promise<SessionView> {
    const record = await this.requireSession(sessionId);
    const compiled = await this.compiledFor(record);
    const { game, newEvents } = this.buildGame(record, compiled);
    if (game.getState().phase === "complete") return this.view(sessionId);

    const actingSeat = game.actingSeat();
    if (record.seats[actingSeat].kind === "human") throw new AwaitingHumanError(actingSeat);

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
    if (record.seats[actingSeat].kind !== "human")
      throw new Error(`Seat ${actingSeat} is not a human seat`);
    await replay.step();
    return this.persistNewEvents(record, log.getAll(), replay);
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

  /**
   * Fork (spec §7): same board and pinned compile, NEW seat configs, primed
   * with this session's event prefix. The source session stays untouched.
   */
  async fork(
    sessionId: string,
    seats: Record<Seat, SeatConfig>,
    createdBy: string,
  ): Promise<SessionRecord> {
    const source = await this.requireSession(sessionId);
    const compiled = await this.compiledFor(source);
    return this.createSession({
      kbId: source.kbId,
      compiled,
      seats,
      seed: source.board.seed,
      dealer: source.board.dealer,
      vul: source.board.vul,
      hands: source.board.hands,
      boardName: source.board.name,
      createdBy,
      forkedFromSessionId: source.sessionId,
      primedEvents: [...source.events],
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
    return {
      record,
      state: game.getState(),
      actingSeat,
      actingIsHuman: record.seats[actingSeat].kind === "human",
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

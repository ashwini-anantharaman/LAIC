// SessionService: stateless per request. Every call loads the session record
// + persisted action events, reconstructs the game via the engine's
// primed-history support (createGame's primedActions), acts, and persists the
// newly emitted events. Tenant isolation (Bridge plan §21) is checked at
// every entry point from the caller's NexusBridgeContext.

import type { SettingValue } from "@bridge/config";
import {
  createGame,
  createPackageDecider,
  initialState,
  legalCalls,
  legalPlays,
  type AsyncDecider,
  type BoardInput,
  type BridgeRulePackage,
  type Decision,
  type Game,
  type GameState,
} from "@bridge/engine";
import {
  cardId,
  createBus,
  createEventLog,
  isActionEvent,
  type Call,
  type Card,
  type EventLog,
  type GameEvent,
  type Seat,
} from "@bridge/events";
import type { NexusBridgeContext } from "@laic/learner-contracts";
import {
  hashValues,
  type BridgeSessionRecord,
  type SeatAssignment,
  type SessionType,
} from "./model";
import type { SessionStore } from "./store";

export class SessionAccessError extends Error {
  constructor(message = "Not authorized for this session") {
    super(message);
    this.name = "SessionAccessError";
  }
}

export class AwaitingHumanError extends Error {
  constructor(readonly seat: Seat) {
    super(`Awaiting human action for seat ${seat}`);
    this.name = "AwaitingHumanError";
  }
}

export interface SessionServiceDeps {
  store: SessionStore;
  /** Injected package lookup (bridge-web passes the knowledge store). */
  loadPackage: (ref: { packageId: string; version: string }) => Promise<BridgeRulePackage | null>;
  newId?: () => string;
  now?: () => string;
}

export interface CreateSessionInput {
  context: NexusBridgeContext;
  sessionType: SessionType;
  board: BoardInput;
  pkg: BridgeRulePackage;
  resolvedValues: Record<string, SettingValue>;
  /** Defaults to four deterministic AI seats. */
  seats?: Partial<Record<Seat, SeatAssignment>>;
}

export interface SessionView {
  record: BridgeSessionRecord;
  state: GameState;
  eventCount: number;
}

/**
 * Tenant rule (Bridge plan §21): the creator, members of the same Bridge
 * Program Organization, and program-level admins (admin access with no org
 * scope) may access a session. Everyone else is denied.
 */
export function canAccessSession(
  record: BridgeSessionRecord,
  context: NexusBridgeContext,
): boolean {
  if (record.createdBy === context.nexusUserId) return true;
  if (
    record.context.programOrganizationId &&
    record.context.programOrganizationId === context.programOrganizationId
  )
    return true;
  if (context.accessLevel === "admin" && !context.programOrganizationId) return true;
  return false;
}

export class SessionService {
  private readonly newId: () => string;
  private readonly now: () => string;

  constructor(private readonly deps: SessionServiceDeps) {
    this.newId = deps.newId ?? (() => `bs_${crypto.randomUUID().slice(0, 12)}`);
    this.now = deps.now ?? (() => new Date().toISOString());
  }

  async createSession(input: CreateSessionInput): Promise<BridgeSessionRecord> {
    if (input.pkg.status !== "published")
      throw new Error(
        `Sessions run against published packages only (got ${input.pkg.packageId}@${input.pkg.version}: ${input.pkg.status})`,
      );
    const seats: Record<Seat, SeatAssignment> = {
      N: { seat: "N", playerKind: "deterministic_ai" },
      E: { seat: "E", playerKind: "deterministic_ai" },
      S: { seat: "S", playerKind: "deterministic_ai" },
      W: { seat: "W", playerKind: "deterministic_ai" },
      ...input.seats,
    };
    const record: BridgeSessionRecord = {
      bridgeSessionId: this.newId(),
      context: input.context,
      sessionType: input.sessionType,
      status: "active",
      packageRef: { packageId: input.pkg.packageId, version: input.pkg.version },
      resolvedValues: input.resolvedValues,
      resolvedValueHash: hashValues(input.resolvedValues),
      board: input.board,
      seats,
      createdBy: input.context.nexusUserId,
      createdAt: this.now(),
    };
    await this.deps.store.createSession(record);
    return record;
  }

  async listSessions(context: NexusBridgeContext): Promise<BridgeSessionRecord[]> {
    const all = await this.deps.store.listSessions();
    return all.filter((r) => canAccessSession(r, context));
  }

  async getSession(id: string, context: NexusBridgeContext): Promise<SessionView> {
    const { record, game, events } = await this.reconstruct(id, context);
    return { record, state: game.getState(), eventCount: events.length };
  }

  async getEvents(id: string, context: NexusBridgeContext): Promise<GameEvent[]> {
    await this.requireRecord(id, context);
    return this.deps.store.getEvents(id);
  }

  /**
   * Advance one AI decision. Throws AwaitingHumanError when it's a human
   * seat's turn (the UI then collects the action and calls applyExternalAction).
   */
  async step(id: string, context: NexusBridgeContext): Promise<SessionView> {
    const { record, game, log } = await this.reconstruct(id, context);
    if (game.getState().phase === "complete")
      return { record, state: game.getState(), eventCount: (await this.deps.store.getEvents(id)).length };
    const acting = game.actingSeat();
    if (record.seats[acting].playerKind === "human") throw new AwaitingHumanError(acting);
    await game.step();
    return this.persistNew(record, game, log);
  }

  /** Run AI turns until completion or a human seat's turn. */
  async autoplay(id: string, context: NexusBridgeContext, maxSteps = 400): Promise<SessionView> {
    const { record, game, log } = await this.reconstruct(id, context);
    let steps = 0;
    while (game.getState().phase !== "complete" && steps++ < maxSteps) {
      const acting = game.actingSeat();
      if (record.seats[acting].playerKind === "human") break;
      const progressed = await game.step();
      if (!progressed) break;
    }
    return this.persistNew(record, game, log);
  }

  /**
   * Commit an externally supplied (human) action for the acting seat, with
   * an honest human trace — never dressed up as a rule decision.
   */
  async applyExternalAction(
    id: string,
    context: NexusBridgeContext,
    seat: Seat,
    action: { kind: "bid"; call: Call } | { kind: "play"; cardId: string },
  ): Promise<SessionView> {
    const { record, game, log } = await this.reconstruct(id, context, (state) => {
      const humanDecider = (expectedSeat: Seat): AsyncDecider => ({
        decideBid: async (s, actingSeat): Promise<Decision<Call>> => {
          if (action.kind !== "bid" || actingSeat !== expectedSeat)
            throw new Error("No pending bid action for this seat");
          const legal = legalCalls(s.auction, actingSeat);
          if (!legal.has(action.call)) throw new Error(`Illegal call ${action.call}`);
          return {
            action: action.call,
            candidates: [...legal],
            trace: [],
            citedSettings: [],
            facts: {},
            reason: "Human chose this call",
            rejected: [],
            fallback: false,
          };
        },
        decidePlay: async (s, actingSeat): Promise<Decision<Card>> => {
          if (action.kind !== "play" || actingSeat !== expectedSeat)
            throw new Error("No pending play action for this seat");
          const legal = legalPlays(s, actingSeat);
          const card = legal.find((c) => cardId(c) === action.cardId);
          if (!card) throw new Error(`Illegal or unknown card ${action.cardId}`);
          return {
            action: card,
            candidates: legal,
            trace: [],
            citedSettings: [],
            facts: {},
            reason: "Human chose this card",
            rejected: [],
            fallback: false,
          };
        },
      });
      void state;
      return { overrideSeat: seat, decider: humanDecider(seat) };
    });

    if (game.actingSeat() !== seat)
      throw new Error(`It is ${game.actingSeat()}'s turn, not ${seat}'s`);
    if (record.seats[seat].playerKind !== "human")
      throw new Error(`Seat ${seat} is not a human seat`);
    await game.step();
    return this.persistNew(record, game, log);
  }

  /** Undo the last committed action across the persistence boundary. */
  async undo(id: string, context: NexusBridgeContext): Promise<SessionView> {
    const { record, game } = await this.reconstruct(id, context);
    const logicSeq = game.undo();
    if (logicSeq === null)
      return { record, state: game.getState(), eventCount: (await this.deps.store.getEvents(id)).length };
    await this.deps.store.rollbackEvents(id, logicSeq);
    if (record.status === "completed")
      await this.deps.store.setSessionStatus(id, "active");
    const events = await this.deps.store.getEvents(id);
    return { record: { ...record, status: "active" }, state: game.getState(), eventCount: events.length };
  }

  // -------------------------------------------------------------------------

  private async requireRecord(
    id: string,
    context: NexusBridgeContext,
  ): Promise<BridgeSessionRecord> {
    const record = await this.deps.store.getSession(id);
    if (!record || !canAccessSession(record, context)) throw new SessionAccessError();
    return record;
  }

  private async reconstruct(
    id: string,
    context: NexusBridgeContext,
    seatOverride?: (state: GameState) => { overrideSeat: Seat; decider: AsyncDecider },
  ): Promise<{ record: BridgeSessionRecord; game: Game; log: EventLog; events: GameEvent[] }> {
    const record = await this.requireRecord(id, context);
    const pkg = await this.deps.loadPackage(record.packageRef);
    if (!pkg)
      throw new Error(
        `Package ${record.packageRef.packageId}@${record.packageRef.version} not found — sessions pin exact versions`,
      );

    const events = await this.deps.store.getEvents(id);
    const actions = events.filter(isActionEvent);
    const bus = createBus();
    const log = createEventLog(bus); // captures only NEW events this request
    const ai = createPackageDecider({ pkg, values: record.resolvedValues });
    const initial = initialState(
      record.board.name,
      record.board.dealer,
      record.board.vul,
      record.board.hands,
    );
    const deciders: Record<Seat, AsyncDecider> = { N: ai, E: ai, S: ai, W: ai };
    if (seatOverride) {
      const o = seatOverride(initial);
      deciders[o.overrideSeat] = o.decider;
    }
    const game = createGame(bus, deciders, initial, {}, actions);
    return { record, game, log, events };
  }

  private async persistNew(
    record: BridgeSessionRecord,
    game: Game,
    log: EventLog,
  ): Promise<SessionView> {
    const fresh = log.getAll();
    if (fresh.length) await this.deps.store.appendEvents(record.bridgeSessionId, [...fresh]);
    const state = game.getState();
    if (state.phase === "complete" && record.status !== "completed") {
      await this.deps.store.setSessionStatus(record.bridgeSessionId, "completed", this.now());
      record = { ...record, status: "completed", completedAt: this.now() };
    }
    const events = await this.deps.store.getEvents(record.bridgeSessionId);
    return { record, state, eventCount: events.length };
  }
}

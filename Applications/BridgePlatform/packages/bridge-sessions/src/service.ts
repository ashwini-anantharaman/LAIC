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
  interpretBid,
  interpretPlay,
  legalCalls,
  legalPlays,
  resultLabel,
  scoreBoard,
  type AsyncDecider,
  type BoardInput,
  type BridgeRulePackage,
  type Decision,
  type Game,
  type GameState,
  type ScoreBreakdown,
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
  type LifecycleEventType,
  type PositionSnapshotRecord,
  type SavedBoardRecord,
  type SeatAssignment,
  type SessionLifecycleEvent,
  type SessionType,
  type ShareLinkRecord,
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
  /** Per-seat configurations; absent seats use resolvedValues (table default). */
  seatValues?: Partial<Record<Seat, Record<string, SettingValue>>>;
  launchRef?: string;
  forkedFromSessionId?: string;
}

export interface SessionView {
  record: BridgeSessionRecord;
  state: GameState;
  eventCount: number;
  /** Present once the board is complete (§8.2). */
  score?: ScoreBreakdown;
  /** Readable result ("4♠ by N, made +1") when complete. */
  resultLabel?: string;
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
    if (input.pkg.status === "deprecated")
      throw new Error(
        `Package ${input.pkg.packageId}@${input.pkg.version} is deprecated — generate a current version`,
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
      seatValues: input.seatValues,
      // The hash pins the WHOLE table arrangement: default + per-seat values.
      resolvedValueHash: input.seatValues && Object.keys(input.seatValues).length
        ? hashValues({ __table: hashValues(input.resolvedValues), ...Object.fromEntries(
            Object.entries(input.seatValues).map(([s, v]) => [`__seat_${s}`, hashValues(v!)]),
          ) })
        : hashValues(input.resolvedValues),
      board: input.board,
      seats,
      launchRef: input.launchRef,
      forkedFromSessionId: input.forkedFromSessionId,
      createdBy: input.context.nexusUserId,
      createdAt: this.now(),
    };
    await this.deps.store.createSession(record);
    // Lifecycle events (§9.1 categories 5–8) — audit stream, never folded.
    await this.emitLifecycle(record.bridgeSessionId, 0, [
      ["session_created", { sessionType: record.sessionType, createdBy: record.createdBy }],
      ["board_loaded", { name: input.board.name, dealer: input.board.dealer, vul: input.board.vul }],
      ...(["N", "E", "S", "W"] as Seat[]).map(
        (seat): [LifecycleEventType, Record<string, unknown>] => [
          "seat_assigned",
          { seat, playerKind: seats[seat].playerKind, occupantId: seats[seat].occupantId },
        ],
      ),
      ["configuration_selected", { resolvedValueHash: record.resolvedValueHash }],
      ["knowledge_package_used", { ...record.packageRef }],
    ]);
    return record;
  }

  private async emitLifecycle(
    sessionId: string,
    fromSeq: number | null,
    entries: Array<[LifecycleEventType, Record<string, unknown>]>,
  ): Promise<void> {
    const start =
      fromSeq ?? (await this.deps.store.getLifecycle(sessionId)).reduce((m, e) => Math.max(m, e.lifecycleSeq + 1), 0);
    const events: SessionLifecycleEvent[] = entries.map(([type, payload], i) => ({
      lifecycleSeq: start + i,
      ts: this.now(),
      type,
      payload,
    }));
    await this.deps.store.appendLifecycle(sessionId, events);
  }

  async getLifecycle(id: string, context: NexusBridgeContext) {
    await this.requireRecord(id, context);
    return this.deps.store.getLifecycle(id);
  }

  async listSessions(context: NexusBridgeContext): Promise<BridgeSessionRecord[]> {
    const all = await this.deps.store.listSessions();
    return all.filter((r) => canAccessSession(r, context));
  }

  /** Assemble a view, attaching the §8.2 score once the board is complete. */
  private view(record: BridgeSessionRecord, state: GameState, eventCount: number): SessionView {
    const score = scoreBoard(state) ?? undefined;
    return {
      record,
      state,
      eventCount,
      score,
      resultLabel: score ? resultLabel(score) : undefined,
    };
  }

  async getSession(id: string, context: NexusBridgeContext): Promise<SessionView> {
    const { record, game, events } = await this.reconstruct(id, context);
    return this.view(record, game.getState(), events.length);
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
      return this.view(record, game.getState(), (await this.deps.store.getEvents(id)).length);
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
  /**
   * §16.2: seating stays MUTABLE between creation and the first action —
   * once anything has been played the seat occupants are part of the
   * record's truth (attribution) and can no longer be rewritten.
   */
  async assignSeats(
    id: string,
    context: NexusBridgeContext,
    changes: Partial<Record<Seat, SeatAssignment>>,
  ): Promise<BridgeSessionRecord> {
    const record = await this.requireRecord(id, context);
    const events = await this.deps.store.getEvents(id);
    if (events.length)
      throw new Error("Seats are frozen once the first action is committed (§16.2)");
    const seats = { ...record.seats };
    for (const seat of Object.keys(changes) as Seat[]) {
      const assignment = changes[seat];
      if (!assignment) continue;
      if (assignment.seat !== seat) throw new Error(`Assignment for ${seat} names seat ${assignment.seat}`);
      seats[seat] = assignment;
    }
    await this.deps.store.updateSeats(id, seats);
    await this.emitLifecycle(id, null, (Object.keys(changes) as Seat[]).map(
      (seat): [LifecycleEventType, Record<string, unknown>] => [
        "seat_assigned",
        { seat, playerKind: seats[seat].playerKind, occupantId: seats[seat].occupantId, reassigned: true },
      ],
    ));
    return { ...record, seats };
  }

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
          // actingSeat may be the DUMMY seat while expectedSeat is the human
          // declarer controlling it — the Game controller routes dummy turns
          // to the declarer's decider, so only the action kind is checked
          // here; legality is computed against the seat actually on play.
          if (action.kind !== "play")
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
      return this.view(record, game.getState(), (await this.deps.store.getEvents(id)).length);
    await this.deps.store.rollbackEvents(id, logicSeq);
    if (record.status === "completed")
      await this.deps.store.setSessionStatus(id, "active");
    await this.emitLifecycle(id, null, [
      ["undo_performed", { rolledBackToSeq: logicSeq, by: context.nexusUserId }],
    ]);
    const events = await this.deps.store.getEvents(id);
    return this.view({ ...record, status: "active" }, game.getState(), events.length);
  }

  // ---- position snapshots (§8.4) -------------------------------------------

  /** Freeze the current position: board + full event prefix + exact config. */
  async saveSnapshot(id: string, context: NexusBridgeContext, name: string): Promise<PositionSnapshotRecord> {
    const record = await this.requireRecord(id, context);
    const events = await this.deps.store.getEvents(id);
    const snapshot: PositionSnapshotRecord = {
      snapshotId: crypto.randomUUID(),
      sourceSessionId: id,
      name: name || `${record.board.name} position`,
      context: record.context,
      board: record.board,
      packageRef: record.packageRef,
      resolvedValues: record.resolvedValues,
      events,
      asOfSeq: events.length ? events[events.length - 1]!.seq : -1,
      createdBy: context.nexusUserId,
      createdAt: this.now(),
    };
    await this.deps.store.saveSnapshot(snapshot);
    await this.emitLifecycle(id, null, [
      ["snapshot_saved", { snapshotId: snapshot.snapshotId, asOfSeq: snapshot.asOfSeq }],
    ]);
    return snapshot;
  }

  async listSnapshots(context: NexusBridgeContext): Promise<PositionSnapshotRecord[]> {
    return (await this.deps.store.listSnapshots()).filter((s) =>
      canAccessSession({ ...s, createdBy: s.createdBy } as unknown as BridgeSessionRecord, context),
    );
  }

  /**
   * Resume a snapshot as a NEW session primed with the snapshot's events —
   * the engine adopts them (createGame primedActions) and play continues.
   */
  async resumeSnapshot(
    snapshotId: string,
    context: NexusBridgeContext,
    pkg: BridgeRulePackage,
    seats?: Partial<Record<Seat, SeatAssignment>>,
  ): Promise<BridgeSessionRecord> {
    const snapshot = await this.deps.store.getSnapshot(snapshotId);
    if (!snapshot || !canAccessSession(snapshot as unknown as BridgeSessionRecord, context))
      throw new SessionAccessError("Snapshot not found");
    if (pkg.packageId !== snapshot.packageRef.packageId || pkg.version !== snapshot.packageRef.version)
      throw new Error("Resume must use the snapshot's exact package version (replay stability §11.4)");
    const record = await this.createSession({
      context,
      sessionType: "single_board",
      board: snapshot.board,
      pkg,
      resolvedValues: snapshot.resolvedValues,
      seats,
    });
    if (snapshot.events.length)
      await this.deps.store.appendEvents(record.bridgeSessionId, snapshot.events);
    await this.emitLifecycle(record.bridgeSessionId, null, [
      ["board_loaded", { fromSnapshot: snapshotId, asOfSeq: snapshot.asOfSeq }],
    ]);
    return record;
  }

  /**
   * The prototype's "Ask": preview the NEXT decision without committing
   * anything — the decision, its reasoning, and the full matched-rule pool
   * (coach mode chooses among these). Read-only; no events are written.
   */
  async peek(
    id: string,
    context: NexusBridgeContext,
  ): Promise<
    | { kind: "complete" }
    | { kind: "awaiting_human"; seat: Seat }
    | { kind: "bid"; seat: Seat; decision: Decision<Call> }
    | { kind: "play"; seat: Seat; decision: Decision<Card> }
  > {
    const { record, game } = await this.reconstruct(id, context);
    const state = game.getState();
    if (state.phase === "complete") return { kind: "complete" };
    const seat = game.actingSeat();
    if (record.seats[seat].playerKind === "human") return { kind: "awaiting_human", seat };
    const pkg = (await this.deps.loadPackage(record.packageRef))!;
    if (state.phase === "auction") {
      const values = record.seatValues?.[seat] ?? record.resolvedValues;
      return { kind: "bid", seat, decision: interpretBid(state, seat, { pkg, values }) };
    }
    // In play the hand on turn may be dummy; its controller's config decides.
    const values = record.seatValues?.[seat] ?? record.resolvedValues;
    return { kind: "play", seat: state.turn, decision: interpretPlay(state, state.turn, { pkg, values }) };
  }

  /**
   * Coach mode (prototype's multi-match choice): commit an ALTERNATIVE rule
   * from the matched pool instead of the policy pick — with honest
   * attribution ("coach chose …"). Only rules that actually matched this
   * position are eligible; requires coach-level access.
   */
  async applyCoachChoice(
    id: string,
    context: NexusBridgeContext,
    seat: Seat,
    chosenRuleId: string,
  ): Promise<SessionView> {
    if (!["coach", "admin", "reviewer"].includes(context.accessLevel))
      throw new Error("Coach tools require coach, reviewer, or admin access");
    const source = await this.requireRecord(id, context);
    const pkg = (await this.deps.loadPackage(source.packageRef))!;
    const valuesFor = (s: Seat) => source.seatValues?.[s] ?? source.resolvedValues;

    const coachDecider: AsyncDecider = {
      decideBid: async (s, actingSeat): Promise<Decision<Call>> => {
        const d = interpretBid(s, actingSeat, { pkg, values: valuesFor(actingSeat) });
        const m = (d.matches ?? []).find((x) => x.ruleId === chosenRuleId);
        if (!m) throw new Error(`Rule ${chosenRuleId} is not in the matched pool here`);
        return {
          ...d,
          action: m.action,
          matchedRuleId: m.ruleId,
          reason: `Coach chose "${m.title}" from the matched pool (policy pick was ${String(d.action)})`,
        };
      },
      decidePlay: async (s, actingSeat): Promise<Decision<Card>> => {
        const d = interpretPlay(s, actingSeat, { pkg, values: valuesFor(actingSeat) });
        const m = (d.matches ?? []).find((x) => x.ruleId === chosenRuleId);
        if (!m) throw new Error(`Rule ${chosenRuleId} is not in the matched pool here`);
        return {
          ...d,
          action: m.action,
          matchedRuleId: m.ruleId,
          reason: `Coach chose "${m.title}" from the matched pool`,
        };
      },
    };

    const { record, game, log } = await this.reconstruct(id, context, () => ({
      overrideSeat: seat,
      decider: coachDecider,
    }));
    if (game.actingSeat() !== seat)
      throw new Error(`It is ${game.actingSeat()}'s turn, not ${seat}'s`);
    if (record.seats[seat].playerKind === "human")
      throw new Error("Coach choice applies to AI seats — humans just act");
    await game.step();
    return this.persistNew(record, game, log);
  }

  /**
   * The prototype's "flip a setting mid-board" loop, honestly: a session's
   * configuration is pinned for replay stability (§11.4), so changing values
   * at the table FORKS — a new session on the same board, seats, and exact
   * package version, primed with the full event log so far, carrying the new
   * resolved values. Undo/step then explore how decisions differ from here;
   * the source session and its history stay untouched.
   */
  async forkSession(
    id: string,
    context: NexusBridgeContext,
    pkg: BridgeRulePackage,
    resolvedValues: Record<string, SettingValue>,
    seatValues?: Partial<Record<Seat, Record<string, SettingValue>>>,
  ): Promise<BridgeSessionRecord> {
    const source = await this.requireRecord(id, context);
    if (
      pkg.packageId !== source.packageRef.packageId ||
      pkg.version !== source.packageRef.version
    )
      throw new Error("Fork must use the session's exact package version (replay stability §11.4)");
    const events = await this.deps.store.getEvents(id);
    const record = await this.createSession({
      context,
      sessionType: source.sessionType,
      board: source.board,
      pkg,
      resolvedValues,
      seatValues: seatValues ?? source.seatValues,
      seats: source.seats,
      forkedFromSessionId: id,
    });
    if (events.length) await this.deps.store.appendEvents(record.bridgeSessionId, events);
    await this.emitLifecycle(record.bridgeSessionId, null, [
      [
        "configuration_selected",
        {
          forkedFrom: id,
          asOfSeq: events.length ? events[events.length - 1]!.seq : null,
          resolvedValueHash: record.resolvedValueHash,
        },
      ],
    ]);
    return record;
  }

  // ---- board library + share links (§15.1) ---------------------------------

  async saveBoardToLibrary(
    context: NexusBridgeContext,
    name: string,
    board: BoardInput,
    tags: string[] = [],
  ): Promise<SavedBoardRecord> {
    const saved: SavedBoardRecord = {
      boardId: crypto.randomUUID(),
      name,
      board,
      context,
      tags,
      createdBy: context.nexusUserId,
      createdAt: this.now(),
    };
    await this.deps.store.saveBoard(saved);
    return saved;
  }

  async listBoards(context: NexusBridgeContext): Promise<SavedBoardRecord[]> {
    return (await this.deps.store.listBoards()).filter((b) =>
      canAccessSession(b as unknown as BridgeSessionRecord, context),
    );
  }

  async getBoard(boardId: string, context: NexusBridgeContext): Promise<SavedBoardRecord> {
    const b = await this.deps.store.getBoard(boardId);
    if (!b || !canAccessSession(b as unknown as BridgeSessionRecord, context))
      throw new SessionAccessError("Board not found");
    return b;
  }

  /** Short immutable capability token for a saved board. */
  async createShareLink(boardId: string, context: NexusBridgeContext): Promise<ShareLinkRecord> {
    await this.getBoard(boardId, context); // access check
    const link: ShareLinkRecord = {
      token: crypto.randomUUID().replace(/-/g, "").slice(0, 10),
      boardId,
      createdBy: context.nexusUserId,
      createdAt: this.now(),
    };
    await this.deps.store.saveShareLink(link);
    return link;
  }

  /** Token IS the capability — any signed-in user with the link may view. */
  async getSharedBoard(token: string): Promise<SavedBoardRecord | null> {
    const link = await this.deps.store.getShareLink(token);
    if (!link) return null;
    return this.deps.store.getBoard(link.boardId);
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
    // Per-seat deciders: a seat with its own values plays its own system.
    const aiFor = (seat: Seat) =>
      createPackageDecider({ pkg, values: record.seatValues?.[seat] ?? record.resolvedValues });
    const initial = initialState(
      record.board.name,
      record.board.dealer,
      record.board.vul,
      record.board.hands,
    );
    const deciders: Record<Seat, AsyncDecider> = {
      N: aiFor("N"),
      E: aiFor("E"),
      S: aiFor("S"),
      W: aiFor("W"),
    };
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
      const score = scoreBoard(state);
      await this.emitLifecycle(record.bridgeSessionId, null, [
        [
          "session_completed",
          score
            ? { result: resultLabel(score), declarerScore: score.declarerScore, nsScore: score.nsScore }
            : {},
        ],
      ]);
    }
    const events = await this.deps.store.getEvents(record.bridgeSessionId);
    return this.view(record, state, events.length);
  }
}

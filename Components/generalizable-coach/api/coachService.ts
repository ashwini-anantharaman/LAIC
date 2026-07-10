/**
 * The domain-neutral Coach service (LAIC M0).
 *
 * Per the "coach = separate service" delivery decision, this is the coach's own
 * HTTP surface — NOT the bridge demo API. In M0 it exposes just enough to prove
 * the contracts foundation: a validated event-ingestion endpoint backed by the
 * raw event log. Later milestones add /sessions, /hints, /recommendations, etc.
 * (architecture §16.1).
 *
 * Design bet #1 holds even here: an event is validated against the ActivityEvent
 * schema (the same schema the types are generated from) before it is accepted.
 */
import { randomUUID } from "node:crypto";
import express, { type Express, type Request, type Response } from "express";
import { validate, CONTRACTS_SCHEMA_VERSION } from "../contracts/index.js";
import type { ActivityEvent } from "../contracts/index.js";
import { InMemoryEventLogRepo, type EventLogRepo } from "../platform/events/index.js";
import { ProfileRegistry } from "../platform/studio/index.js";
import {
  buildObservation,
  InMemoryObservationStore,
  type ObservationStore,
} from "../platform/observation/index.js";
import type { EvaluationResult } from "../platform/types/index.js";
import type { ChatOrchestrator } from "../platform/chat/index.js";
import { defaultChatSessionFactory, type ChatSessionFactory } from "./demoChatSession.js";

export interface CoachServiceOptions {
  /** Inject a durable event log (e.g. Postgres) in production; defaults to in-memory. */
  eventLog?: EventLogRepo;
  /** Inject a coach profile registry; defaults to a fresh one seeded with presets. */
  registry?: ProfileRegistry;
  /** Inject an observation store; defaults to in-memory. */
  observationStore?: ObservationStore;
  /** Build a chat session for a host; defaults to the built-in course_learning demo. */
  chatSessionFactory?: ChatSessionFactory;
}

export interface CoachService {
  app: Express;
  eventLog: EventLogRepo;
  registry: ProfileRegistry;
  observationStore: ObservationStore;
}

export function createCoachService(opts: CoachServiceOptions = {}): CoachService {
  const eventLog = opts.eventLog ?? new InMemoryEventLogRepo();
  const registry = opts.registry ?? new ProfileRegistry();
  const observationStore = opts.observationStore ?? new InMemoryObservationStore();
  const chatSessionFactory = opts.chatSessionFactory ?? defaultChatSessionFactory;
  const chatSessions = new Map<string, { orchestrator: ChatOrchestrator; learnerId: string; domainId: string }>();
  const app = express();
  app.use(express.json());

  // M0 placeholder: in production the Coach consumes auth from Nexus
  // (verify session + entitlement) here before any route. Left as a no-op hook
  // so wiring it in a later milestone does not reshape the routes.
  // app.use(nexusAuth());

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true, contractsVersion: CONTRACTS_SCHEMA_VERSION });
  });

  // Main M0 endpoint: accept a validated ActivityEvent, persist it to the raw log.
  app.post("/api/coaching/events", (req: Request, res: Response) => {
    const result = validate("ActivityEvent", req.body);
    if (!result.valid) {
      return res.status(400).json({ error: "invalid ActivityEvent", details: result.errors });
    }
    const event = req.body as ActivityEvent;
    // Raw event → the immutable log (system of record for what happened)...
    eventLog.append(event);
    // ...and, separately, an educational observation (never mutates the raw log).
    observationStore.append(buildObservation(event));
    return res.status(201).json({ eventId: event.eventId, stored: true, total: eventLog.count() });
  });

  // Observations are the interpreted view, kept separate from the raw log.
  app.get("/api/coaching/observations", (req: Request, res: Response) => {
    const learnerId = typeof req.query.learnerId === "string" ? req.query.learnerId : undefined;
    res.json({ observations: observationStore.list({ learnerId }) });
  });

  // Read back the raw log (used by the CLI harness and tests; scope by query).
  app.get("/api/coaching/events", (req: Request, res: Response) => {
    const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : undefined;
    const learnerId = typeof req.query.learnerId === "string" ? req.query.learnerId : undefined;
    const domainId = typeof req.query.domainId === "string" ? req.query.domainId : undefined;
    res.json({ events: eventLog.list({ sessionId, learnerId, domainId }) });
  });

  // --- Configuration Studio (M2/B5, API-only) -------------------------------
  app.get("/api/coaching/profiles", (req: Request, res: Response) => {
    const presetsOnly = req.query.presets === "true";
    res.json({ profiles: presetsOnly ? registry.listPresets() : registry.listProfiles() });
  });

  app.get("/api/coaching/profiles/:id", (req: Request, res: Response) => {
    try {
      res.json(registry.getBundle(req.params.id));
    } catch (e) {
      res.status(404).json({ error: (e as Error).message });
    }
  });

  // Clone a preset into a new draft (with policy/scope overrides).
  app.post("/api/coaching/profiles", (req: Request, res: Response) => {
    try {
      const profile = registry.clone(req.body);
      res.status(201).json({ profile });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  // Publish the draft as a new version.
  app.post("/api/coaching/profiles/:id/versions", (req: Request, res: Response) => {
    try {
      res.status(201).json(registry.publishVersion(req.params.id));
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  // Preview resolved behavior against a sample evaluation.
  app.post("/api/coaching/profiles/:id/preview", (req: Request, res: Response) => {
    const evaluation = req.body?.evaluation as EvaluationResult | undefined;
    if (!evaluation) return res.status(400).json({ error: "body.evaluation is required" });
    try {
      return res.json(
        registry.preview(req.params.id, evaluation, {
          hintRequested: req.body?.hintRequested,
          currentHintLevel: req.body?.currentHintLevel,
        }),
      );
    } catch (e) {
      return res.status(400).json({ error: (e as Error).message });
    }
  });

  // Deploy a published profile as an instance.
  app.post("/api/coaching/instances", (req: Request, res: Response) => {
    try {
      res.status(201).json({ instance: registry.deploy(req.body) });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.get("/api/coaching/instances/:id", (req: Request, res: Response) => {
    const instance = registry.getInstance(req.params.id);
    if (!instance) return res.status(404).json({ error: "unknown instance" });
    return res.json({ instance });
  });

  // --- Conversational surface (A / M3 finish) -------------------------------
  // Open a chat session. A host injects its own factory; the default is the
  // built-in course_learning demo so this works out of the box.
  app.post("/api/coaching/sessions", (req: Request, res: Response) => {
    const learnerId = typeof req.body?.learnerId === "string" ? req.body.learnerId : undefined;
    if (!learnerId) return res.status(400).json({ error: "learnerId is required" });
    const domainId = typeof req.body?.domainId === "string" ? req.body.domainId : "course_learning";
    // Knowledge scope to bind (platform mode): courseId from contextRefs, or an
    // explicit knowledgeScopeId/scopeId. Undefined → bundled/demo knowledge.
    const ctx = (req.body?.contextRefs ?? {}) as { courseId?: string };
    const scopeId =
      (typeof ctx.courseId === "string" && ctx.courseId) ||
      (typeof req.body?.knowledgeScopeId === "string" && req.body.knowledgeScopeId) ||
      (typeof req.body?.scopeId === "string" && req.body.scopeId) ||
      undefined;
    const sessionId = randomUUID();
    chatSessions.set(sessionId, {
      orchestrator: chatSessionFactory({ learnerId, domainId, sessionId, scopeId }),
      learnerId,
      domainId,
    });
    return res.status(201).json({ sessionId, learnerId, domainId });
  });

  // A conversational turn — the "chat with me" surface.
  app.post("/api/coaching/ask", async (req: Request, res: Response) => {
    const { sessionId, message } = req.body ?? {};
    const session = typeof sessionId === "string" ? chatSessions.get(sessionId) : undefined;
    if (!session) return res.status(404).json({ error: "unknown session" });
    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "message is required" });
    }
    try {
      const result = await session.orchestrator.chat(message);
      return res.json(result);
    } catch (e) {
      return res.status(500).json({ error: (e as Error).message });
    }
  });

  // Read a session's conversation thread.
  app.get("/api/coaching/sessions/:id", (req: Request, res: Response) => {
    const session = chatSessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: "unknown session" });
    return res.json({
      sessionId: req.params.id,
      learnerId: session.learnerId,
      domainId: session.domainId,
      history: session.orchestrator.history(),
    });
  });

  return { app, eventLog, registry, observationStore };
}

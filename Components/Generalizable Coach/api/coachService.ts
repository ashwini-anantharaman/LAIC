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
import express, { type Express, type Request, type Response } from "express";
import { validate, CONTRACTS_SCHEMA_VERSION } from "../contracts/index.js";
import type { ActivityEvent } from "../contracts/index.js";
import { InMemoryEventLogRepo, type EventLogRepo } from "../platform/events/index.js";
import { ProfileRegistry } from "../platform/studio/index.js";
import type { EvaluationResult } from "../platform/types/index.js";

export interface CoachServiceOptions {
  /** Inject a durable event log (e.g. Postgres) in production; defaults to in-memory. */
  eventLog?: EventLogRepo;
  /** Inject a coach profile registry; defaults to a fresh one seeded with presets. */
  registry?: ProfileRegistry;
}

export interface CoachService {
  app: Express;
  eventLog: EventLogRepo;
  registry: ProfileRegistry;
}

export function createCoachService(opts: CoachServiceOptions = {}): CoachService {
  const eventLog = opts.eventLog ?? new InMemoryEventLogRepo();
  const registry = opts.registry ?? new ProfileRegistry();
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
    eventLog.append(event);
    return res.status(201).json({ eventId: event.eventId, stored: true, total: eventLog.count() });
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

  return { app, eventLog, registry };
}

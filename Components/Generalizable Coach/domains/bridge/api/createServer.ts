/**
 * Zone 1 + Zone 3 — REST API exposing the coaching runtime to a mobile client.
 *
 * Compact JSON payloads, graceful error handling. The server owns one
 * BridgeCoach instance (learner store, session engine, runtime) for its
 * lifetime. For tests, inject a coach built with a mock LLM.
 */
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { LLMClient, type LLMLike } from "../../../platform/llm/index.js";
import { createSecurity } from "./security.js";
import {
  buildBridgeCoach,
  type BridgeCoach,
} from "../coaching/index.js";
import "../coaching/register.js"; // register bridge with the platform registry
import { listDomains } from "../../../platform/embed/registry.js";
import { generatePostmortem } from "../../../platform/common-coach/index.js";
import { LearnerStore } from "../../../platform/learner-model/index.js";
import { SessionEngine } from "../../../platform/session/index.js";
import { openCoachDatabase } from "../../../platform/storage/sqlite.js";
import { DealGenerator } from "../DealGenerator.js";
import { BridgeEvaluator } from "../evaluator/BridgeEvaluator.js";
import { BRIDGE_DOMAIN_ID } from "../plugin/constants.js";
import {
  CARD_PLAY_SCENARIOS,
  getScenario,
  toPublicScenario,
  CardPlayEvaluator,
} from "../cardplay/index.js";
import type { ActivityEvent } from "../../../platform/types/index.js";
import type { BridgeBidAction, BridgeGameState } from "../plugin/events.js";

export interface CreateServerOptions {
  coach?: BridgeCoach;
  dealGenerator?: DealGenerator;
  /**
   * SQLite database path for persistence. Defaults to env COACH_DB or
   * "./coach.db". Ignored when `coach` is supplied (e.g. in tests).
   */
  dbPath?: string;
  /** Bearer keys for auth. Empty/undefined → open (env: COACH_API_KEYS). */
  apiKeys?: string[];
  /** Per-identity request cap per window. 0/undefined → off (env: RATE_LIMIT_MAX). */
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
  /** LLM used by the proxy endpoints. Default: new LLMClient() from env. */
  llm?: LLMLike;
}

function nowIso() {
  return new Date().toISOString();
}

/** Build a minimal bridge game state from a bid action. */
function gameStateFromAction(action: BridgeBidAction): BridgeGameState {
  return {
    dealId: "live",
    dealer: action.position,
    vulnerability: "None",
    hands: { [action.position]: action.hand },
    auctionSoFar: action.auctionSoFar ?? [],
    currentPhase: "bidding",
  };
}

export function createServer(opts: CreateServerOptions = {}): Express {
  // Persistence: unless a coach is injected (tests), back it with SQLite so the
  // learner model and session logs survive restarts.
  const coach =
    opts.coach ??
    (() => {
      const dbPath = opts.dbPath ?? process.env.COACH_DB ?? "./coach.db";
      const { learnerRepo, sessionStore } = openCoachDatabase(dbPath);
      return buildBridgeCoach({
        learnerStore: new LearnerStore(learnerRepo),
        sessionEngine: new SessionEngine(sessionStore),
      });
    })();
  const dealGenerator = opts.dealGenerator ?? new DealGenerator(new BridgeEvaluator());
  const { learnerStore, sessionEngine, runtime } = coach;

  // Proxy LLM (key stays server-side); injectable for deterministic tests.
  const proxyLlm: LLMLike = opts.llm ?? new LLMClient();

  // Security: auth + rate limit, both opt-in via options or env.
  const envKeys = (process.env.COACH_API_KEYS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const security = createSecurity({
    apiKeys: opts.apiKeys ?? envKeys,
    rateLimitMax: opts.rateLimitMax ?? Number(process.env.RATE_LIMIT_MAX ?? 0),
    rateLimitWindowMs: opts.rateLimitWindowMs ?? Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
  });
  // Per-user ownership (in-memory): who may read/modify a learner / session.
  const learnerOwner = new Map<string, string>();
  const sessionOwner = new Map<string, string>();

  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // Health check (unauthenticated) — for load balancers / keep-warm pings.
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", domains: listDomains(), uptime: process.uptime() });
  });

  // --- CORS ----------------------------------------------------------------
  // A browser host (e.g. BridgeBot on Vercel) calls the LLM proxy below from a
  // different origin. Allow the configured origin (ALLOWED_ORIGIN, comma-list,
  // default "*") and answer preflight requests.
  const allowedOrigins = (process.env.ALLOWED_ORIGIN ?? "*")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (allowedOrigins.includes("*")) {
      res.header("Access-Control-Allow-Origin", "*");
    } else if (origin && allowedOrigins.includes(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Vary", "Origin");
    }
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.header("Access-Control-Allow-Headers", "content-type,authorization");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Serve the demo web UI (project-root /public).
  const publicDir = fileURLToPath(new URL("../../../public", import.meta.url));
  app.use(express.static(publicDir));

  const asyncH =
    (fn: (req: Request, res: Response) => Promise<void>) =>
    (req: Request, res: Response) => {
      fn(req, res).catch((err) => {
        res.status(500).json({ error: String(err?.message ?? err) });
      });
    };

  // All /api routes are rate-limited then authenticated (both no-op unless
  // configured). /health is above this and stays public.
  app.use("/api", (req, res, next) => security.rateLimitMiddleware(req, res, next));
  app.use("/api", (req, res, next) => security.authMiddleware(req, res, next));

  // --- Learners -----------------------------------------------------------
  app.post("/api/learners", (req: Request, res: Response) => {
    const { name, preferences } = req.body ?? {};
    if (!name || !preferences?.feedbackStyle || !preferences?.explanationDepth) {
      res.status(400).json({ error: "name and preferences are required" });
      return;
    }
    const learnerId = randomUUID();
    const profile = learnerStore.createProfile(learnerId, name, {
      feedbackStyle: preferences.feedbackStyle,
      explanationDepth: preferences.explanationDepth,
    });
    security.claim(learnerOwner, learnerId, req);
    res.status(201).json({ learnerId, profile });
  });

  app.get("/api/learners/:learnerId", (req: Request, res: Response) => {
    const profile = learnerStore.getProfile(req.params.learnerId);
    if (!profile) {
      res.status(404).json({ error: "learner not found" });
      return;
    }
    if (!security.owns(learnerOwner, req.params.learnerId, req)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    res.json(profile);
  });

  // Common Coach: what should this learner practice next?
  app.get("/api/learners/:learnerId/recommendation", (req: Request, res: Response) => {
    const profile = learnerStore.getProfile(req.params.learnerId);
    if (!profile) {
      res.status(404).json({ error: "learner not found" });
      return;
    }
    if (!security.owns(learnerOwner, req.params.learnerId, req)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const domainId = (req.query.domainId as string) || BRIDGE_DOMAIN_ID;
    res.json({
      recommendation: learnerStore.recommendNextSkill(req.params.learnerId, domainId),
      weakSkills: learnerStore.getWeakSkills(req.params.learnerId, domainId),
    });
  });

  // --- Sessions -----------------------------------------------------------
  app.post("/api/sessions", (req: Request, res: Response) => {
    const { learnerId, domainId } = req.body ?? {};
    if (!learnerId) {
      res.status(400).json({ error: "learnerId is required" });
      return;
    }
    if (!learnerStore.getProfile(learnerId)) {
      res.status(404).json({ error: "learner not found" });
      return;
    }
    if (!security.owns(learnerOwner, learnerId, req)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const session = sessionEngine.startSession(
      learnerId,
      domainId ?? BRIDGE_DOMAIN_ID,
    );
    security.claim(sessionOwner, session.sessionId, req);
    res.status(201).json({ sessionId: session.sessionId });
  });

  // Fetch a session, enforcing ownership. Returns the session or null (after
  // sending the appropriate 404/403); callers bail when it returns null.
  const loadOwnedSession = (req: Request, res: Response) => {
    const session = sessionEngine.getSession(req.params.sessionId);
    if (!session) {
      res.status(404).json({ error: "session not found" });
      return null;
    }
    if (!security.owns(sessionOwner, req.params.sessionId, req)) {
      res.status(403).json({ error: "forbidden" });
      return null;
    }
    return session;
  };

  app.get("/api/sessions/:sessionId", (req: Request, res: Response) => {
    const session = loadOwnedSession(req, res);
    if (!session) return;
    res.json(session);
  });

  // The main endpoint the mobile app calls on every learner action.
  app.post(
    "/api/sessions/:sessionId/events",
    asyncH(async (req, res) => {
      const session = loadOwnedSession(req, res);
      if (!session) return;
      const { eventType, action } = req.body ?? {};
      if (!eventType) {
        res.status(400).json({ error: "eventType is required" });
        return;
      }
      const event: ActivityEvent<any> = {
        eventId: randomUUID(),
        domainId: session.domainId,
        eventType,
        timestamp: nowIso(),
        sessionId: session.sessionId,
        actorId: session.learnerId,
        action: action ?? {},
      };
      let gameState: any;
      if (eventType === "bid_made") {
        gameState = gameStateFromAction(action);
      } else if (eventType === "card_played") {
        // Look up the full scenario server-side (it holds the correct play).
        gameState = getScenario(action?.scenarioId);
        if (!gameState) {
          res.status(400).json({ error: "unknown scenarioId" });
          return;
        }
      } else {
        gameState = action ?? {};
      }
      const response = await runtime.processEvent(event, gameState);
      res.json({ response });
    }),
  );

  // Convenience endpoint: request a hint for the current decision point.
  app.post(
    "/api/sessions/:sessionId/hint",
    asyncH(async (req, res) => {
      const session = loadOwnedSession(req, res);
      if (!session) return;
      const event: ActivityEvent<any> = {
        eventId: randomUUID(),
        domainId: session.domainId,
        eventType: "hint_requested",
        timestamp: nowIso(),
        sessionId: session.sessionId,
        actorId: session.learnerId,
        action: {},
      };
      const response = await runtime.processEvent(event, {});
      res.json({ response });
    }),
  );

  app.post("/api/sessions/:sessionId/end", (req: Request, res: Response) => {
    const session = loadOwnedSession(req, res);
    if (!session) return;
    const ended = sessionEngine.endSession(session.sessionId);
    res.json({ session: ended });
  });

  // Postmortem: an end-of-session review built from the session's logs.
  app.get("/api/sessions/:sessionId/postmortem", (req: Request, res: Response) => {
    const session = loadOwnedSession(req, res);
    if (!session) return;
    const weak = learnerStore.getWeakSkills(session.learnerId, session.domainId);
    res.json({ postmortem: generatePostmortem(session, weak) });
  });

  // --- Card play ----------------------------------------------------------
  // List available tactical scenarios (id + title only).
  app.get("/api/cardplay/scenarios", (_req: Request, res: Response) => {
    res.json(
      CARD_PLAY_SCENARIOS.map((s) => ({
        scenarioId: s.scenarioId,
        title: s.title,
        targetSkill: s.targetSkill,
      })),
    );
  });

  // Fetch a single scenario's public view (answer stripped).
  app.get("/api/cardplay/scenario/:id", (req: Request, res: Response) => {
    const s = getScenario(req.params.id);
    if (!s) {
      res.status(404).json({ error: "scenario not found" });
      return;
    }
    res.json(toPublicScenario(s));
  });

  // Preview a card WITHOUT committing it: pure evaluation, no LLM call and no
  // change to the learner model or session. Used for real-time hover feedback.
  const previewEvaluator = new CardPlayEvaluator();
  app.post(
    "/api/cardplay/preview",
    asyncH(async (req, res) => {
      const { scenarioId, card } = req.body ?? {};
      const scenario = getScenario(scenarioId);
      if (!scenario) {
        res.status(400).json({ error: "unknown scenarioId" });
        return;
      }
      const result = await previewEvaluator.evaluate(scenario, {
        card,
        position: scenario.playFromSeat,
        scenarioId,
      });
      res.json({
        card,
        correctness: result.correctness,
        severity: result.severity,
        explanation: result.explanation,
        bestAction: result.bestAction,
        conceptIds: result.conceptIds,
        skillIds: result.skillIds,
      });
    }),
  );

  // --- Deals --------------------------------------------------------------
  app.post(
    "/api/deals/generate",
    asyncH(async (req, res) => {
      const { targetSkill, mode, partnerOpening } = req.body ?? {};
      if (mode === "response") {
        if (!partnerOpening) {
          res.status(400).json({ error: "partnerOpening is required for response mode" });
          return;
        }
        const deal = await dealGenerator.generateResponseDeal(
          partnerOpening,
          targetSkill,
        );
        res.json(deal);
        return;
      }
      // default: opening
      const deal = await dealGenerator.generateOpeningBidDeal(targetSkill);
      res.json(deal);
    }),
  );

  // --- Domains ------------------------------------------------------------
  // The registry's front desk: which domains this server can coach.
  app.get("/api/domains", (_req: Request, res: Response) => {
    res.json({ domains: listDomains() });
  });

  // --- LLM proxy ----------------------------------------------------------
  // Server-side model call so a browser host never holds the API key. The host
  // sends the already-built prompt ({ system, user }); the key + provider live
  // only in this server's environment (OPENAI_API_KEY / ANTHROPIC_API_KEY).
  // Shape matches LLMLike.generateCoachResponse's return value.
  app.post(
    "/api/llm/chat",
    asyncH(async (req, res) => {
      const { system, user } = req.body ?? {};
      if (typeof system !== "string" || typeof user !== "string") {
        res.status(400).json({ error: "system and user (strings) are required" });
        return;
      }
      const result = await proxyLlm.generateCoachResponse({ system, user });
      res.json(result);
    }),
  );

  // Streaming variant (Server-Sent Events) so a mobile client can render the
  // coaching text progressively. Contract-first: emits `data: {delta}` chunks
  // then a final `data: {done, fromModel}`. (Chunks the proxy LLM's reply;
  // real token-streaming can slot behind the same SSE contract later.)
  app.post(
    "/api/llm/chat/stream",
    asyncH(async (req, res) => {
      const { system, user } = req.body ?? {};
      if (typeof system !== "string" || typeof user !== "string") {
        res.status(400).json({ error: "system and user (strings) are required" });
        return;
      }
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      const send = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

      const result = await proxyLlm.generateCoachResponse({ system, user });
      const text = result.text ?? "";
      // Chunk by words, keeping the trailing space so re-joining is lossless.
      for (const chunk of text.match(/\S+\s*/g) ?? []) {
        send({ delta: chunk });
      }
      send({ done: true, fromModel: result.fromModel });
      res.end();
    }),
  );

  return app;
}

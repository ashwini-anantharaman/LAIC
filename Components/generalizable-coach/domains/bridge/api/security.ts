/**
 * Zone 3 — Bridge API: auth, per-user ownership, and rate limiting.
 *
 * All opt-in: with no API keys configured the server is open (local dev, the
 * original behavior). Configure `COACH_API_KEYS` (or pass `apiKeys`) to require
 * a bearer token, and `RATE_LIMIT_MAX`/`RATE_LIMIT_WINDOW_MS` to throttle.
 */
import type { Request, Response, NextFunction } from "express";

export interface SecurityOptions {
  /** Valid bearer keys. Empty → auth disabled (open). */
  apiKeys?: string[];
  /** Requests per window per identity. undefined/0 → limiter disabled. */
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
}

const ANON = "anon";

/** Bearer token from the Authorization header, or "" if absent. */
function bearer(req: Request): string {
  const h = req.header("authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

export interface Security {
  authEnabled: boolean;
  /** The caller's identity ("anon" when auth is disabled). */
  identityOf(req: Request): string;
  /** Express middleware: require a valid bearer key on protected routes. */
  authMiddleware(req: Request, res: Response, next: NextFunction): void;
  /** Express middleware: token-bucket rate limit per identity. */
  rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void;
  /** Record that `req`'s identity owns `id`. */
  claim(map: Map<string, string>, id: string, req: Request): void;
  /** True if `req`'s identity owns `id` (always true when auth disabled). */
  owns(map: Map<string, string>, id: string, req: Request): boolean;
}

export function createSecurity(opts: SecurityOptions = {}): Security {
  const apiKeys = new Set((opts.apiKeys ?? []).filter(Boolean));
  const authEnabled = apiKeys.size > 0;

  const max = opts.rateLimitMax ?? 0;
  const windowMs = opts.rateLimitWindowMs ?? 60_000;
  const buckets = new Map<string, { count: number; reset: number }>();

  const identityOf = (req: Request): string =>
    authEnabled ? bearer(req) : ANON;

  return {
    authEnabled,
    identityOf,

    authMiddleware(req, res, next) {
      if (!authEnabled) return next();
      const key = bearer(req);
      if (!key || !apiKeys.has(key)) {
        res.status(401).json({ error: "unauthorized" });
        return;
      }
      next();
    },

    rateLimitMiddleware(req, res, next) {
      if (max <= 0) return next();
      const key = identityOf(req) || req.ip || ANON;
      const now = Date.now();
      const b = buckets.get(key);
      if (!b || now >= b.reset) {
        buckets.set(key, { count: 1, reset: now + windowMs });
        return next();
      }
      if (b.count >= max) {
        res.status(429).json({ error: "rate_limited", retryAfterMs: b.reset - now });
        return;
      }
      b.count += 1;
      next();
    },

    claim(map, id, req) {
      if (authEnabled) map.set(id, identityOf(req));
    },

    owns(map, id, req) {
      if (!authEnabled) return true;
      return map.get(id) === identityOf(req);
    },
  };
}

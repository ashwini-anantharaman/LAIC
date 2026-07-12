/**
 * Minimal in-memory fixed-window rate limiter — Nexus v0.4 §31 (hook abuse).
 *
 * Keyed per registered app on the signup-hook endpoints. In-process only (fine
 * for a single-node deploy / the modular monolith); swap for a shared store
 * (Redis) when the API runs multi-node. Not a security boundary on its own —
 * the API key + offering-scope checks are — just abuse throttling.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** Returns true if the call is allowed; false if the window's limit is exceeded. */
export function allowRequest(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count += 1;
  return true;
}

/** Test/util hook to clear all windows. */
export function _resetRateLimits(): void {
  buckets.clear();
}

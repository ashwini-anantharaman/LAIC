// Local Supabase JWT verification — the network hop that used to be every
// request's floor.
//
// verifyToken used to call `client.auth.getUser(token)`: one HTTPS round trip
// to Supabase Auth per authenticated request, ~150-300ms, paid before ANY of
// our own code ran. Measured 2026-08-10 across the API: /auth/me — an endpoint
// that does nothing but authenticate — was 481ms for a learner and 1057ms for
// a coach; every other endpoint sat on top of that.
//
// The project signs its access tokens asymmetrically (ES256, `kid` in the
// header) and publishes the public keys at
// `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`, so the signature can be
// checked in-process with node:crypto. No shared secret, no new dependency.
//
// THE TRADE, made deliberately: a locally-verified token cannot be revoked
// before it expires. Supabase would reject a signed-out session; we accept it
// until `exp`. Access tokens here live one hour, so that is the worst-case
// window — the same window the rest of the platform already accepts for
// role changes (memberships ride the token's context, not per-request
// re-reads). If per-request revocation ever becomes a requirement, reinstate
// the network path behind a flag rather than tightening this one.
//
// Failure honesty: a token that IS one of ours and fails its checks is a hard
// 401 (`ok: false`) — never "fall back and let the network decide", which
// would turn a forged signature into a retry. The network fallback exists
// only for tokens this module cannot JUDGE: not a JWT at all, a different
// alg, or a kid the (refreshed) JWKS doesn't carry.

import { createPublicKey, verify as cryptoVerify, type KeyObject } from "node:crypto";

import { getSettings } from "./config";

type Jwk = { kid?: string; kty: string; crv?: string; alg?: string; [k: string]: unknown };

/** Verified claims, or the reason this module couldn't decide. */
export type LocalVerdict =
  | { kind: "verified"; id: string; email: string }
  | { kind: "invalid" } // definitely ours, definitely bad — hard 401
  | { kind: "unverifiable" }; // not ours to judge — caller may use the network

// ── JWKS cache ────────────────────────────────────────────────────────────────
// One fetch per instance per TTL, shared by every concurrent request (the
// in-flight promise is cached, not just the result, so a cold burst doesn't
// stampede the endpoint). Serverless note: the cache is per warm instance,
// which is exactly the scope that matters — a cold instance pays one JWKS
// fetch and then verifies locally for its whole life.

const JWKS_TTL_MS = 10 * 60_000;

let jwksKeys: Map<string, KeyObject> | null = null;
let jwksFetchedAt = 0;
let jwksInFlight: Promise<Map<string, KeyObject> | null> | null = null;

function parseJwks(body: { keys?: Jwk[] }): Map<string, KeyObject> | null {
  const map = new Map<string, KeyObject>();
  for (const jwk of body.keys ?? []) {
    if (!jwk.kid || jwk.kty !== "EC" || jwk.crv !== "P-256") continue;
    try {
      map.set(jwk.kid, createPublicKey({ key: jwk as never, format: "jwk" }));
    } catch {
      // One malformed key must not take down the others.
    }
  }
  return map.size > 0 ? map : null;
}

// SUPABASE_JWKS: the JWKS document itself, pinned in an env var. Serverless
// traffic scatters across many instances (observed: 11 instances over 15
// sequential requests), so "fetch once and cache" degrades to "fetch once per
// instance" — a round trip costing about what the auth.getUser hop it
// replaced cost. The keys are PUBLIC and rotate rarely; pinning them lets a
// cold instance verify locally from its very first request. Rotation still
// works without an env change: an unknown kid forces one live JWKS fetch
// (getKey's forceRefresh), which overrides the pin.
function seedFromEnv(): void {
  if (jwksKeys !== null || !process.env.SUPABASE_JWKS) return;
  try {
    const parsed = parseJwks(JSON.parse(process.env.SUPABASE_JWKS));
    if (parsed) {
      jwksKeys = parsed;
      jwksFetchedAt = Date.now();
    }
  } catch {
    // A malformed pin must not take auth down — the fetch path still works.
  }
}

async function fetchJwks(): Promise<Map<string, KeyObject> | null> {
  const base = getSettings().supabaseUrl;
  if (!base) return null;
  try {
    const res = await fetch(`${base}/auth/v1/.well-known/jwks.json`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return parseJwks((await res.json()) as { keys?: Jwk[] });
  } catch {
    return null;
  }
}

async function getKey(kid: string, opts?: { forceRefresh?: boolean }): Promise<KeyObject | null> {
  seedFromEnv();
  // A pinned key set never goes stale on its own — only an unknown kid
  // (rotation) forces the live fetch below.
  const pinned = process.env.SUPABASE_JWKS ? jwksKeys?.has(kid) : false;
  if (pinned) return jwksKeys?.get(kid) ?? null;
  const fresh = jwksKeys !== null && Date.now() - jwksFetchedAt < JWKS_TTL_MS;
  if (!fresh || (opts?.forceRefresh && !jwksInFlight)) {
    jwksInFlight ??= fetchJwks().then((keys) => {
      if (keys) {
        jwksKeys = keys;
        jwksFetchedAt = Date.now();
      }
      jwksInFlight = null;
      return keys;
    });
    await jwksInFlight;
  }
  return jwksKeys?.get(kid) ?? null;
}

/** Test hook: drop the cached keys so the next call re-fetches. */
export function resetJwksCache(): void {
  jwksKeys = null;
  jwksFetchedAt = 0;
  jwksInFlight = null;
}

// ── The verification itself ──────────────────────────────────────────────────

function b64urlJson(part: string): Record<string, unknown> | null {
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * Verify a Supabase access token entirely in-process.
 *
 * Checks, in order: structure → alg/kid → signature (ES256 over
 * `header.payload`, raw r||s per JWS, hence ieee-p1363) → exp → iss → aud.
 */
export async function verifyJwtLocally(token: string): Promise<LocalVerdict> {
  const parts = token.split(".");
  if (parts.length !== 3) return { kind: "unverifiable" };
  const [h, p, s] = parts as [string, string, string];

  const header = b64urlJson(h);
  if (!header || header.alg !== "ES256" || typeof header.kid !== "string") {
    return { kind: "unverifiable" };
  }

  // Unknown kid gets ONE forced refresh — that is what key rotation looks
  // like from here — and only then becomes the network's problem.
  let key = await getKey(header.kid);
  if (!key) key = await getKey(header.kid, { forceRefresh: true });
  if (!key) return { kind: "unverifiable" };

  let sig: Buffer;
  try {
    sig = Buffer.from(s, "base64url");
  } catch {
    return { kind: "invalid" };
  }
  const signed = cryptoVerify(
    "sha256",
    Buffer.from(`${h}.${p}`),
    { key, dsaEncoding: "ieee-p1363" },
    sig,
  );
  if (!signed) return { kind: "invalid" };

  const claims = b64urlJson(p);
  if (!claims) return { kind: "invalid" };

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp <= now) return { kind: "invalid" };

  const iss = getSettings().supabaseUrl ? `${getSettings().supabaseUrl}/auth/v1` : null;
  if (iss && claims.iss !== iss) return { kind: "invalid" };

  const aud = claims.aud;
  const audOk = Array.isArray(aud) ? aud.includes("authenticated") : aud === "authenticated";
  if (!audOk) return { kind: "invalid" };

  if (typeof claims.sub !== "string" || !claims.sub) return { kind: "invalid" };
  return {
    kind: "verified",
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : "",
  };
}

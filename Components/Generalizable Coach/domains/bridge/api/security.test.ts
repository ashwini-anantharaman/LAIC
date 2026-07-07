import { describe, it, expect } from "vitest";
import type { Request, Response } from "express";
import { createSecurity } from "./security.js";

function req(headers: Record<string, string> = {}): Request {
  return {
    header: (name: string) => headers[name.toLowerCase()],
    ip: "1.2.3.4",
  } as unknown as Request;
}

function res() {
  const out: { code?: number; body?: unknown } = {};
  const r = {
    status(code: number) {
      out.code = code;
      return r;
    },
    json(body: unknown) {
      out.body = body;
      return r;
    },
  } as unknown as Response;
  return { r, out };
}

describe("auth", () => {
  it("is open when no keys are configured", () => {
    const s = createSecurity({});
    expect(s.authEnabled).toBe(false);
    let called = false;
    s.authMiddleware(req(), res().r, () => (called = true));
    expect(called).toBe(true);
  });

  it("401s a missing/invalid bearer when keys are configured", () => {
    const s = createSecurity({ apiKeys: ["secret"] });
    const { r, out } = res();
    let called = false;
    s.authMiddleware(req(), r, () => (called = true));
    expect(called).toBe(false);
    expect(out.code).toBe(401);
  });

  it("passes a valid bearer", () => {
    const s = createSecurity({ apiKeys: ["secret"] });
    let called = false;
    s.authMiddleware(req({ authorization: "Bearer secret" }), res().r, () => (called = true));
    expect(called).toBe(true);
  });
});

describe("ownership", () => {
  it("is unrestricted when auth is disabled", () => {
    const s = createSecurity({});
    const map = new Map<string, string>();
    s.claim(map, "L1", req()); // no-op when open
    expect(s.owns(map, "L1", req({ authorization: "Bearer anything" }))).toBe(true);
  });

  it("scopes resources to the claiming identity when auth is on", () => {
    const s = createSecurity({ apiKeys: ["a", "b"] });
    const map = new Map<string, string>();
    s.claim(map, "L1", req({ authorization: "Bearer a" }));
    expect(s.owns(map, "L1", req({ authorization: "Bearer a" }))).toBe(true);
    expect(s.owns(map, "L1", req({ authorization: "Bearer b" }))).toBe(false);
  });
});

describe("rate limit", () => {
  it("allows up to max then 429s within the window", () => {
    const s = createSecurity({ rateLimitMax: 2, rateLimitWindowMs: 60_000 });
    const pass = () => {
      let called = false;
      const { out } = (() => {
        const rr = res();
        s.rateLimitMiddleware(req(), rr.r, () => (called = true));
        return rr;
      })();
      return { called, code: out.code };
    };
    expect(pass().called).toBe(true); // 1
    expect(pass().called).toBe(true); // 2
    const third = pass();
    expect(third.called).toBe(false);
    expect(third.code).toBe(429);
  });
});

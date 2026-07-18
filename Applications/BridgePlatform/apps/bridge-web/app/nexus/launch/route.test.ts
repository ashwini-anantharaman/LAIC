/**
 * Nexus launch handoff: the /nexus/launch entry swaps a single-use launch
 * token for a Nexus session token (httpOnly cookie) and lands in the app;
 * missing/failed exchanges bounce to /welcome without setting a cookie.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NEXUS_RETURN_COOKIE, NEXUS_TOKEN_COOKIE } from "../../../lib/nexusToken";
import { GET } from "./route";

const NEXUS = "http://nexus.test";

beforeEach(() => {
  process.env.NEXUS_API_BASE_URL = NEXUS;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NEXUS_API_BASE_URL;
});

function req(query: string): Request {
  return new Request(`http://bridge.test/nexus/launch${query}`);
}

describe("GET /nexus/launch", () => {
  it("exchanges the launch token, sets the session cookie, and lands in the app", async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe(`${NEXUS}/api/platform/auth/launch-exchange`);
      expect(JSON.parse(String(init?.body))).toEqual({ launch_token: "tok_1" });
      return new Response(JSON.stringify({ access_token: "session-abc" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET(req("?launch_token=tok_1"));
    expect(res.status).toBeGreaterThanOrEqual(302);
    expect(res.headers.get("location")).toBe("http://bridge.test/bridge/home");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${NEXUS_TOKEN_COOKIE}=session-abc`);
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("bounces to /welcome when the token is missing (no exchange attempted)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET(req(""));
    expect(res.headers.get("location")).toBe("http://bridge.test/welcome?launch=missing");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stores the console's return_url for 'Back to Nexus' (http(s) only)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ access_token: "session-abc" }), { status: 200 })),
    );

    const back = encodeURIComponent("http://localhost:5180/o/org1/p/prog1");
    const res = await GET(req(`?launch_token=tok_1&return_url=${back}`));
    const cookies = res.headers.getSetCookie().join("; ");
    expect(cookies).toContain(`${NEXUS_RETURN_COOKIE}=${encodeURIComponent("http://localhost:5180/o/org1/p/prog1")}`);

    // A non-http scheme is never stored (no javascript: links in the UI).
    const evil = await GET(req(`?launch_token=tok_1&return_url=${encodeURIComponent("javascript:alert(1)")}`));
    expect(evil.headers.getSetCookie().join("; ")).not.toContain(NEXUS_RETURN_COOKIE);
  });

  it("bounces to /welcome when the exchange fails (replayed/expired token)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ detail: "Invalid or expired launch token" }), { status: 401 })),
    );

    const res = await GET(req("?launch_token=used_already"));
    expect(res.headers.get("location")).toBe("http://bridge.test/welcome?launch=failed");
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

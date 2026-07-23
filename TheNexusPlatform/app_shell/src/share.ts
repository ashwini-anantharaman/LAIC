/**
 * Publishing + sharing (tier A: no backend).
 *
 * Two link flavours:
 *   • Portable link  — the whole config is base64url-encoded into the URL hash,
 *     so it runs on ANY device with zero infrastructure.
 *   • Short link     — `?app=<id>`, backed by a localStorage registry; clean,
 *     but only resolves in the browser it was published from.
 *
 * The registry is deliberately behind two tiny functions (publishToRegistry /
 * loadFromRegistry) so a real Nexus `POST /configs` + `GET /configs/:id` can
 * replace them later without touching the Studio or the Player.
 */
import type { AppShellConfig } from "./types";

const REGISTRY_PREFIX = "shell.published.";

/* ---- base64url <-> JSON (UTF-8 safe) ---- */
function toB64url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(b64: string): string {
  const padded = b64.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeConfig(config: AppShellConfig): string {
  return toB64url(JSON.stringify(config));
}

export function decodeConfig(encoded: string): AppShellConfig | null {
  try {
    const obj = JSON.parse(fromB64url(encoded)) as AppShellConfig;
    // minimal shape check — enough to refuse a mangled link
    if (obj && typeof obj.id === "string" && typeof obj.name === "string" && Array.isArray(obj.roles) && obj.homeConfig) {
      return obj;
    }
    return null;
  } catch {
    return null;
  }
}

/* ---- registry (swap for a Nexus API later) ---- */
export function publishToRegistry(config: AppShellConfig): string {
  localStorage.setItem(REGISTRY_PREFIX + config.id, JSON.stringify(config));
  return config.id;
}
export function loadFromRegistry(id: string): AppShellConfig | null {
  const raw = localStorage.getItem(REGISTRY_PREFIX + id);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AppShellConfig;
  } catch {
    return null;
  }
}

/* ---- link builders ---- */
function baseUrl(): string {
  return location.origin + location.pathname.replace(/index\.html$/, "");
}
export function shortLink(id: string): string {
  return `${baseUrl()}?app=${encodeURIComponent(id)}`;
}
export function portableLink(config: AppShellConfig): string {
  return `${baseUrl()}#config=${encodeConfig(config)}`;
}

/* ---- what the Player should show, resolved from the current URL ---- */
export type PlayerTarget =
  | { mode: "none" }
  | { mode: "config"; config: AppShellConfig }
  | { mode: "missing"; id: string }
  // A LIVE published app: boot its config from Nexus by slug, authenticate a
  // real student, run the real app. `api` is the Nexus API base (optional; the
  // Player falls back to its default when absent).
  | { mode: "live"; slug: string; api: string | null };

export function resolvePlayerTarget(): PlayerTarget {
  // A native build bakes the app in as a global (see docs/native-build.md);
  // that wins so the packaged app boots straight into itself, offline.
  const injected = (globalThis as { __PUBLISHED_CONFIG__?: AppShellConfig }).__PUBLISHED_CONFIG__;
  if (injected && typeof injected.id === "string" && Array.isArray(injected.roles)) {
    return { mode: "config", config: injected };
  }
  if (location.hash.startsWith("#config=")) {
    const config = decodeConfig(location.hash.slice("#config=".length));
    if (config) return { mode: "config", config };
  }
  const params = new URLSearchParams(location.search);
  // Live app: `?live=<slug>&api=<baseUrl>` — the real, backend-backed runtime.
  const liveSlug = params.get("live");
  if (liveSlug) return { mode: "live", slug: liveSlug, api: params.get("api") };
  const id = params.get("app");
  if (id) {
    const config = loadFromRegistry(id);
    return config ? { mode: "config", config } : { mode: "missing", id };
  }
  return { mode: "none" };
}

/** The link that opens a published app LIVE (real boot + auth). */
export function liveLink(slug: string, apiBaseUrl: string): string {
  const u = new URL(baseUrl());
  u.searchParams.set("live", slug);
  u.searchParams.set("api", apiBaseUrl.replace(/\/+$/, ""));
  return u.toString();
}

/* ---- clipboard with a legacy fallback ---- */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

import { useFocusEffect } from "expo-router";
import { createElement, useCallback, useEffect, useRef } from "react";

/**
 * Web fallback for the native WebView — with a KEEP-ALIVE POOL.
 *
 * Each iframe is a sealed browsing context: creating one boots the entire
 * bridge web app from scratch (parse + execute + hydrate, seconds on a phone),
 * and React unmounting the element throws that booted app away. So the
 * iframes don't live inside the screen's tree at all: they live in a
 * document-level host and merely get SHOWN over the screen's placeholder
 * while it is focused, and HIDDEN (still running) when it isn't. Reopening a
 * screen finds its app already booted — instant.
 *
 * Consequences the pool must own:
 *  - POSITION: the placeholder <div> reports its rectangle; the pooled iframe
 *    is absolutely positioned over it (resize-observed).
 *  - STACKING: the host sits above the app's page content by DOM order, but
 *    sheets/dialogs (BrandSheet z-50, RN modals portaled after the host)
 *    still paint above the embed — measured against the root stacking
 *    context, 50 beats the host's 0.
 *  - MESSAGES: several iframes are now alive at once, so each screen's
 *    listener accepts ONLY messages whose source is its own iframe — a
 *    background table's state reports must never reach the wrong screen.
 *  - STALENESS: table pages keep RUNNING while hidden (their JS advances
 *    them), so reuse is always safe. List pages are server-rendered stills —
 *    shown stale after a long absence they'd lie, so past a short TTL they
 *    reload instead (still cheaper than a fresh boot: warm HTTP + bytecode
 *    cache).
 *  - MEMORY: each live iframe is a JS heap. The pool caps at MAX_ALIVE and
 *    evicts the least-recently-used hidden one.
 *
 * The native file (content-webview.tsx) is untouched — real WebViews have OS
 * lifecycle management of their own.
 */

// ── The pool (module-level, one per page load) ──────────────────────────────

/**
 * GATED OFF (2026-08-07): the pool's body-level host paints over the
 * full-screen table's floating back chip — the push animation's transform
 * traps the chip inside the screen's stacking layer, so its zIndex can't
 * reach above a body-level sibling. Turning the pool on again needs the
 * floating chrome rendered into the pool's own layer (a portal the embed
 * hands us), coordinated with the embed's owner. Until then: the classic
 * inline iframe, one boot per screen.
 */
const POOL_ENABLED = false;

const MAX_ALIVE = 3;
/** Pages whose hidden JS keeps them current — always safe to reuse. */
const LIVE_PREFIXES = ["/bridge/table2", "/m/table"];
/** Hidden longer than this, a server-rendered page reloads on return. */
const STALE_MS = 30_000;

type Entry = {
  iframe: HTMLIFrameElement;
  lastUsed: number;
  hiddenAt: number | null;
};

let host: HTMLDivElement | null = null;
const entries = new Map<string, Entry>();

function ensureHost(): HTMLDivElement {
  if (!host) {
    host = document.createElement("div");
    host.style.position = "fixed";
    host.style.inset = "0";
    host.style.pointerEvents = "none";
    host.style.zIndex = "0";
    document.body.appendChild(host);
  }
  return host;
}

/** One iframe per DESTINATION: the launch URL and the direct URL of the same
 *  page must share a key, or the first visit and every later one would boot
 *  two apps. */
function keyForUrl(url: string): string {
  try {
    const u = new URL(url, window.location.href);
    if (u.pathname === "/nexus/launch") {
      const next = new URLSearchParams(u.search).get("next");
      if (next) return next.split("?")[0] ?? next;
    }
    return u.pathname;
  } catch {
    return url;
  }
}

const absolute = (url: string): string => new URL(url, window.location.href).href;
/** _r=… is a deliberate cache-buster, not a different destination. */
const normalized = (url: string): string => absolute(url).replace(/([?&])_r=\d+/, "$1").replace(/[?&]$/, "");

const isLivePage = (key: string): boolean => LIVE_PREFIXES.some((p) => key.startsWith(p));

function evictIfOver(except: string): void {
  if (entries.size <= MAX_ALIVE) return;
  let victim: string | null = null;
  let oldest = Infinity;
  for (const [k, e] of entries) {
    if (k === except || e.hiddenAt === null) continue; // never the visible one
    if (e.lastUsed < oldest) {
      oldest = e.lastUsed;
      victim = k;
    }
  }
  if (victim) {
    entries.get(victim)!.iframe.remove();
    entries.delete(victim);
  }
}

/** Get-or-create the destination's iframe; navigate it if the caller asks for
 *  a genuinely different URL (a reset's _r, a discard route, a re-launch). */
function acquire(key: string, url: string): Entry {
  ensureHost();
  let e = entries.get(key);
  if (!e) {
    const iframe = document.createElement("iframe");
    iframe.style.position = "absolute";
    iframe.style.border = "0";
    iframe.style.display = "none";
    iframe.style.pointerEvents = "auto";
    iframe.src = url;
    host!.appendChild(iframe);
    e = { iframe, lastUsed: Date.now(), hiddenAt: null };
    entries.set(key, e);
    evictIfOver(key);
  } else if (normalized(e.iframe.src) !== normalized(url)) {
    e.iframe.src = url;
  } else if (
    !isLivePage(key) &&
    e.hiddenAt !== null &&
    Date.now() - e.hiddenAt > STALE_MS
  ) {
    // A long-hidden server-rendered page would show yesterday's list.
    const sep = url.includes("?") ? "&" : "?";
    e.iframe.src = `${url}${sep}_r=${Date.now()}`;
  }
  e.lastUsed = Date.now();
  return e;
}

function show(key: string, rect: DOMRect): void {
  const e = entries.get(key);
  if (!e) return;
  e.iframe.style.left = `${rect.left}px`;
  e.iframe.style.top = `${rect.top}px`;
  e.iframe.style.width = `${rect.width}px`;
  e.iframe.style.height = `${rect.height}px`;
  e.iframe.style.display = "block";
  e.hiddenAt = null;
  e.lastUsed = Date.now();
}

function hide(key: string): void {
  const e = entries.get(key);
  if (!e) return;
  e.iframe.style.display = "none";
  e.hiddenAt = Date.now();
}

const contentWindowOf = (key: string): Window | null =>
  entries.get(key)?.iframe.contentWindow ?? null;

// ── The component: a placeholder the pooled iframe shadows ─────────────────

export function ContentWebView(props: {
  url: string;
  onUrlChange?: (url: string) => void;
  /** Structured messages posted BY the embedded page (postMessage). */
  onHostMessage?: (data: unknown) => void;
  /** Mirrors the native props. Honoured by the inline iframe; the POOL cannot
   *  report them per-screen (one iframe outlives many mounts), so a pooled
   *  host must not depend on them. The pool is off — see POOL_ENABLED. */
  onLoadEnd?: () => void;
  onError?: () => void;
  /** Accepted for parity with native and IGNORED: a browser tab's iframe
   *  has no separate renderer process for the OS to reclaim. */
  onDied?: () => void;
  /**
   * Accepted for parity with native and deliberately IGNORED here: styling a
   * cross-origin iframe's document from the host is exactly what the same-origin
   * policy forbids, and there is no WebView-style injection hook on the web. A
   * web build therefore shows the embed in its own skin. Dressing it there would
   * mean the embedded app applying the styling itself, which is a change to that
   * deployment rather than to this one.
   */
  injectedCSS?: string;
}) {
  return POOL_ENABLED ? PooledView(props) : InlineView(props);
}

/** The pre-pool behavior: a plain iframe inside the screen's own tree — it
 *  paints under the screen's floating chrome by DOM order, and dies with the
 *  screen (one boot per open). */
function InlineView({
  url,
  onUrlChange,
  onHostMessage,
  onLoadEnd,
  onError,
}: {
  url: string;
  onUrlChange?: (url: string) => void;
  onHostMessage?: (data: unknown) => void;
  onLoadEnd?: () => void;
  onError?: () => void;
}) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const listener = (e: MessageEvent) => {
      // ONLY messages from OUR iframe. Several iframes are alive at once —
      // the persistent table host plus every visited tab embed (web keeps
      // blurred screens mounted) — and window "message" delivers every
      // iframe's posts to every listener. Unfiltered, one page's
      // boardGone=1 location report fanned out to EVERY mounted embed, and
      // each ran its own retry-then-leave — serial router.back() yanks that
      // read as the app randomly bouncing (2026-08-13). The pooled variant
      // below always filtered by source; the inline one must too.
      if (!frameRef.current || e.source !== frameRef.current.contentWindow) return;
      const data = e.data as { type?: string; href?: string } | null;
      if (data?.type === "bridge:location" && typeof data.href === "string") {
        onUrlChange?.(data.href);
      } else if (data?.type) {
        onHostMessage?.(data);
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [onUrlChange, onHostMessage]);

  return createElement("iframe", {
    ref: frameRef,
    src: url,
    style: { flex: 1, width: "100%", height: "100%", border: 0 },
    onLoad: () => onLoadEnd?.(),
    onError: () => onError?.(),
  });
}

function PooledView({
  url,
  onUrlChange,
  onHostMessage,
}: {
  url: string;
  onUrlChange?: (url: string) => void;
  onHostMessage?: (data: unknown) => void;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const key = keyForUrl(url);

  // Create/navigate the pooled iframe whenever the requested URL changes.
  useEffect(() => {
    acquire(key, url);
  }, [key, url]);

  // Visible only while the SCREEN is focused: a pushed screen's own embed (or
  // native content) must never be painted over by this one, and returning
  // re-shows the still-running app.
  useFocusEffect(
    useCallback(() => {
      const sync = () => {
        const rect = boxRef.current?.getBoundingClientRect();
        if (rect && rect.width > 0) show(key, rect);
      };
      // Focus fires while the screen is still SLIDING IN: a rect measured
      // mid-animation parks the iframe at the shifted position (covering the
      // header's back arrow, reported 2026-08-07) — and ResizeObserver never
      // corrects it, because position-only drift isn't a resize. Re-measure
      // on a short settle schedule until the transition is over.
      const raf = requestAnimationFrame(sync);
      const settles = [100, 250, 450, 700, 1000].map((ms) => setTimeout(sync, ms));
      const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
      if (ro && boxRef.current) ro.observe(boxRef.current);
      window.addEventListener("resize", sync);
      return () => {
        cancelAnimationFrame(raf);
        for (const t of settles) clearTimeout(t);
        ro?.disconnect();
        window.removeEventListener("resize", sync);
        hide(key);
      };
    }, [key]),
  );

  // Messages: only from OUR iframe — several are alive at once now.
  useEffect(() => {
    const listener = (e: MessageEvent) => {
      if (e.source !== contentWindowOf(key)) return;
      const data = e.data as { type?: string; href?: string } | null;
      if (data?.type === "bridge:location" && typeof data.href === "string") {
        onUrlChange?.(data.href);
      } else if (data?.type) {
        onHostMessage?.(data);
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [key, onUrlChange, onHostMessage]);

  return createElement("div", {
    ref: boxRef,
    style: { flex: 1, width: "100%", height: "100%" },
  });
}

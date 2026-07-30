"use client";

// The drop-in library browser. A host mounts it with a LibraryConfig and
// either passes items in (in-process: the server already policy-filtered
// them) or lets it fetch from a facade endpoint (http mode). Behavior comes
// from library-core's headless state machine; rendering is fully driven by
// the config: labels, shelf order, theme tokens, density, per-kind
// renderers. Buttons/features the config disables simply do not exist —
// access itself is enforced wherever the data lives, never here.

import {
  browserReducer,
  filterItems,
  initialBrowserState,
  type LibraryItem,
} from "@laic/library-core";
import { useEffect, useMemo, useReducer, useState, type CSSProperties, type ReactNode } from "react";
import { normalizeConfig, type LibraryConfig } from "./config";

/** A host-registered card renderer for one content kind. */
export type KindRenderer = (item: LibraryItem, ctx: { pick?: () => void }) => ReactNode;

export function LibraryBrowser({
  config: rawConfig,
  items: itemsProp,
  renderers = {},
  onPick,
}: {
  config: LibraryConfig;
  /** in-process mode: the (already policy-filtered) items to show. */
  items?: LibraryItem[];
  /** Renderer registry: config.display.kinds[kind].renderer → component. */
  renderers?: Record<string, KindRenderer>;
  /** Picker mode callback (features.pick). */
  onPick?: (item: LibraryItem) => void;
}) {
  const config = useMemo(() => normalizeConfig(rawConfig), [rawConfig]);
  const [state, dispatch] = useReducer(browserReducer, undefined, () =>
    initialBrowserState(config.features.kinds?.[0] ?? null),
  );
  const [fetched, setFetched] = useState<LibraryItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // http mode: pull from the facade. in-process mode: trust the host's items.
  const endpoint = config.data?.mode === "http" ? config.data.endpoint : undefined;
  useEffect(() => {
    if (!endpoint) return;
    let live = true;
    fetch(`${endpoint}?view=mine`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`library facade: ${r.status}`);
        return (await r.json()) as { items: LibraryItem[] };
      })
      .then((body) => live && setFetched(body.items))
      .catch((e) => live && setLoadError(String(e?.message ?? e)));
    return () => {
      live = false;
    };
  }, [endpoint]);

  const items = itemsProp ?? fetched ?? [];
  const t = config.display.theme ?? {};
  const compact = config.display.density === "compact";
  const vars: CSSProperties = {
    background: t.background ?? "transparent",
    color: t.text ?? "#1d1a15",
    fontFamily: t.font ?? "inherit",
  };
  const accent = t.accent ?? "#205e63";
  const radius = t.radius ?? 14;
  const card = t.card ?? "#ffffff";
  const muted = t.textMuted ?? "#8a8374";

  // Shelves: config order wins; otherwise whatever kinds the data contains.
  const kinds = config.features.kinds ?? [...new Set(items.map((i) => i.kind))];
  const activeKind = state.kind && kinds.includes(state.kind) ? state.kind : (kinds[0] ?? null);
  const kindCfg = (k: string) => config.display.kinds?.[k] ?? {};
  const shown = filterItems(items, { kind: activeKind, query: state.query });

  const genericCard: KindRenderer = (item, ctx) => (
    <div
      style={{
        background: card,
        borderRadius: radius,
        border: "1px solid rgba(0,0,0,.08)",
        padding: compact ? "8px 12px" : "13px 16px",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontWeight: 600, fontSize: compact ? 13 : 14, margin: 0 }}>{item.name}</p>
        <p style={{ fontSize: 11.5, color: muted, margin: "2px 0 0" }}>
          {item.kind} · {item.createdAt.slice(0, 10)}
          {item.provenance ? ` · via ${item.provenance.kind}` : ""}
        </p>
      </div>
      {ctx.pick && (
        <button
          type="button"
          onClick={ctx.pick}
          style={{
            border: "none",
            background: accent,
            color: "#fff",
            borderRadius: 999,
            padding: "6px 14px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Select
        </button>
      )}
    </div>
  );

  return (
    <div style={vars}>
      {config.display.title && (
        <h2 style={{ fontSize: compact ? 20 : 24, fontWeight: 600, margin: 0 }}>
          {config.display.title}
        </h2>
      )}
      {config.display.subtitle && (
        <p style={{ fontSize: 13, color: muted, margin: "4px 0 0", maxWidth: 420 }}>
          {config.display.subtitle}
        </p>
      )}

      {/* Shelf chips */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "14px 0 10px" }}>
        {kinds.map((k) => {
          const on = k === activeKind;
          const count = items.filter((i) => i.kind === k).length;
          return (
            <button
              key={k}
              type="button"
              onClick={() => dispatch({ type: "setKind", kind: k })}
              style={{
                flex: "none",
                border: `1px solid ${on ? accent : "rgba(0,0,0,.15)"}`,
                background: on ? accent : card,
                color: on ? "#fff" : "inherit",
                borderRadius: 999,
                padding: compact ? "5px 12px" : "8px 15px",
                fontSize: 13,
                fontWeight: on ? 600 : 400,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {kindCfg(k).label ?? k} <span style={{ opacity: 0.65 }}>{count}</span>
            </button>
          );
        })}
      </div>

      {config.features.search && (
        <input
          value={state.query}
          onChange={(e) => dispatch({ type: "setQuery", query: e.target.value })}
          placeholder="Search…"
          style={{
            width: "100%",
            boxSizing: "border-box",
            border: "1px solid rgba(0,0,0,.15)",
            borderRadius: radius,
            padding: compact ? "6px 10px" : "9px 12px",
            fontSize: 13,
            marginBottom: 12,
            background: card,
            color: "inherit",
            fontFamily: "inherit",
          }}
        />
      )}

      {loadError && (
        <p style={{ fontSize: 13, color: "#8a2b2b" }}>Couldn&apos;t load the library: {loadError}</p>
      )}

      {activeKind && kindCfg(activeKind).reserved ? (
        <p style={{ border: "1px dashed rgba(0,0,0,.2)", borderRadius: radius, padding: 16, textAlign: "center", fontSize: 12.5, color: muted }}>
          This shelf is reserved.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: compact ? 6 : 10 }}>
          {shown.map((item) => {
            const rendererId = kindCfg(item.kind).renderer;
            const render = (rendererId && renderers[rendererId]) || genericCard;
            const pick =
              config.features.pick && onPick ? () => onPick(item) : undefined;
            return <div key={item.id}>{render(item, { pick })}</div>;
          })}
          {shown.length === 0 && !loadError && (
            <p style={{ border: "1px dashed rgba(0,0,0,.2)", borderRadius: radius, padding: 16, textAlign: "center", fontSize: 12.5, color: muted }}>
              {config.display.emptyState ?? "Nothing on this shelf yet."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

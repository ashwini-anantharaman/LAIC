"use client";

// First tenant of the drop-in library kit. Everything library-shaped comes
// from <LibraryBrowser> + the config document; the ONLY thing this host
// contributes is its domain renderer (how a bridge board looks as a card).

import type { LibraryItem } from "@laic/library-core";
import { LibraryBrowser, type KindRenderer, type LibraryConfig } from "@laic/library-ui";

type BridgeContent = {
  dealer?: string;
  vul?: string;
  contractLabel?: string;
  resultLabel?: string;
  auction?: unknown[];
  play?: unknown[];
};

/** Bridge's board card: the domain-specific face of a generic library item. */
const bridgeBoard: KindRenderer = (item: LibraryItem) => {
  const c = (item.content ?? {}) as BridgeContent;
  const meta = [
    c.dealer && `dealer ${c.dealer}`,
    c.vul && `vul ${c.vul}`,
    c.auction?.length ? `${c.auction.length} calls` : null,
    c.play?.length ? `${c.play.length} cards` : null,
    c.contractLabel,
    c.resultLabel,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(0,0,0,.08)",
        borderRadius: 10,
        padding: "12px 15px",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <span style={{ fontSize: 20 }}>♠</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontWeight: 600, fontSize: 14, margin: 0 }}>{item.name}</p>
        <p style={{ fontSize: 11.5, color: "#8a8374", margin: "2px 0 0" }}>
          {meta || "deal only"}
          {item.provenance ? ` · via ${item.provenance.kind}` : ""}
        </p>
      </div>
      <a
        href={`/bridge/library/${item.id}`}
        style={{ fontSize: 12.5, fontWeight: 600, color: "#7c3aed", textDecoration: "none" }}
      >
        Open ›
      </a>
    </div>
  );
};

export function KitTenant({
  config,
  items,
}: {
  config: LibraryConfig;
  items: LibraryItem[];
}) {
  return (
    <LibraryBrowser
      config={config}
      items={items}
      renderers={{ "bridge-board": bridgeBoard }}
    />
  );
}

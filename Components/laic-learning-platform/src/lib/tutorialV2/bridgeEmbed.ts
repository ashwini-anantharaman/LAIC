/**
 * Bridge Platform components, embeddable as tutorial blocks.
 *
 * The Bridge Platform is a SEPARATE application (Next.js, its own pnpm
 * workspace, its own server routes). Its table is not a component this Vite
 * build could import: PlayTable pulls in @bridge/engine and @bridge/events, and
 * even with those bundled it would have no session to render, because the board
 * state comes from Bridge's own server. So a Bridge component arrives here the
 * way a live thing from another origin always does — in an iframe.
 *
 * That is also what makes the thumbnail rule cheap to keep. A block holds a URL
 * and nothing else; nothing is fetched, no frame is created and no Bridge code
 * runs until a reader activates it. A tutorial with six table blocks costs six
 * divs, not six live tables.
 *
 * Adding another Bridge component later is one entry in BRIDGE_EMBEDS.
 */

import type { TutorialV2Part } from './types';

/** Where the Bridge Platform lives. Override with VITE_BRIDGE_ORIGIN. */
export const BRIDGE_ORIGIN: string =
  (import.meta.env?.VITE_BRIDGE_ORIGIN as string | undefined)?.replace(/\/$/, '') ||
  'https://nexus-bridge-79lkq4.vercel.app';

export type BridgeEmbedKind = 'table';

export interface BridgeEmbedDef {
  kind: BridgeEmbedKind;
  /** Chip + block label. */
  label: string;
  /** One line under the thumbnail, before it is activated. */
  blurb: string;
  /** Path on the Bridge origin. */
  path: string;
  /** The frame's aspect while live — the table is happiest tall on a phone. */
  ratio: number;
}

export const BRIDGE_EMBEDS: readonly BridgeEmbedDef[] = [
  {
    kind: 'table',
    label: 'Bridge table',
    blurb: 'A live playable table. Loads when the reader opens it.',
    path: '/bridge/table2/demo',
    ratio: 4 / 3,
  },
];

export function bridgeEmbedDef(kind: string | undefined): BridgeEmbedDef {
  return BRIDGE_EMBEDS.find((e) => e.kind === kind) || BRIDGE_EMBEDS[0];
}

/** The absolute URL a block frames. Stored on the part so it survives a move. */
export function bridgeEmbedUrl(kind: BridgeEmbedKind, origin = BRIDGE_ORIGIN): string {
  return `${origin}${bridgeEmbedDef(kind).path}`;
}

/** True when this part is a Bridge component embed. */
export function isBridgeEmbedPart(part: Pick<TutorialV2Part, 'type'>): boolean {
  return part.type === 'bridge-embed';
}

/** A fresh block for the Blocks row. */
export function makeBridgeEmbedPart(kind: BridgeEmbedKind, id: string): TutorialV2Part {
  const def = bridgeEmbedDef(kind);
  return {
    id,
    type: 'bridge-embed',
    label: def.label,
    embedKind: def.kind,
    url: bridgeEmbedUrl(def.kind),
    caption: '',
  } as TutorialV2Part;
}

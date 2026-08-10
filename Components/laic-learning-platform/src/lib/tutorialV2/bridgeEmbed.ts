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
    caption: '',
    ...configToPartFields({ ...BRIDGE_EMBED_DEFAULTS, kind: def.kind }),
  } as TutorialV2Part;
}

/* ------------------------------------------------------------------ *
 * The author's configuration.
 *
 * A setting has to survive four hops — part → block on save, block →
 * part on re-open, block → props in the reader — and each hop used to
 * be a hand-written field list, so every new knob was three chances to
 * drop one. The mapping lives HERE instead, once, and every hop calls
 * these functions. Add a field to BridgeEmbedConfig plus the two field
 * lists below and the whole chain carries it.
 * ------------------------------------------------------------------ */

export type BridgeSeat = 'N' | 'E' | 'S' | 'W';
export type BridgeVul = 'none' | 'ns' | 'ew' | 'both';
export type BridgeHandLayout = 'row' | 'fan';
export type BridgeBidPad = 'grid' | 'columns';

/** Everything an author can choose about a table block. */
export interface BridgeEmbedConfig {
  kind: string;
  /** The deal, derived deterministically so every reader sees one board. */
  seed: number;
  /** The seat the learner sits and plays. */
  humanSeat: BridgeSeat;
  dealer: BridgeSeat;
  vul: BridgeVul;
  skin: string;
  handLayout: BridgeHandLayout;
  bidPad: BridgeBidPad;
  /** All four hands face up — a teaching board rather than a problem. */
  showAllHands: boolean;
  showCoach: boolean;
  /** Pause before a robot acts, so a board can be followed. */
  robotDelayMs: number;
}

export const BRIDGE_SKINS: readonly { id: string; label: string }[] = [
  { id: 'bbo', label: 'Green baize' },
  { id: 'midnight', label: 'Midnight' },
  { id: 'parchment', label: 'Parchment' },
  { id: 'noir', label: 'Noir' },
  { id: 'claret', label: 'Claret' },
];

export const BRIDGE_SEATS: readonly { id: BridgeSeat; label: string }[] = [
  { id: 'N', label: 'North' },
  { id: 'E', label: 'East' },
  { id: 'S', label: 'South' },
  { id: 'W', label: 'West' },
];

export const BRIDGE_VULS: readonly { id: BridgeVul; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'ns', label: 'N-S' },
  { id: 'ew', label: 'E-W' },
  { id: 'both', label: 'Both' },
];

/** Robot pace as three human words rather than a millisecond box. */
export const BRIDGE_PACES: readonly { id: number; label: string }[] = [
  { id: 120, label: 'Snappy' },
  { id: 350, label: 'Steady' },
  { id: 900, label: 'Slow' },
];

/** What a table block looks like before the author touches anything. */
export const BRIDGE_EMBED_DEFAULTS: BridgeEmbedConfig = {
  kind: 'table',
  seed: 7,
  humanSeat: 'S',
  // The learner deals, so the block is playable the moment it opens.
  dealer: 'S',
  vul: 'none',
  skin: 'bbo',
  handLayout: 'row',
  bidPad: 'grid',
  showAllHands: false,
  showCoach: false,
  robotDelayMs: 350,
};

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

const SEAT_IDS = ['N', 'E', 'S', 'W'] as const;
const VUL_IDS = ['none', 'ns', 'ew', 'both'] as const;

/**
 * Read a config out of anything that carries the fields — a part
 * (`embedSeed`…) or a published block's content (`seed`…). Unknown or
 * missing values fall back to the default rather than reaching the
 * table as nonsense.
 */
export function readBridgeConfig(src: unknown): BridgeEmbedConfig {
  const s = (src && typeof src === 'object' ? src : {}) as Record<string, unknown>;
  const pick = (a: string, b: string) => (s[a] !== undefined ? s[a] : s[b]);
  const seed = pick('embedSeed', 'seed');
  const delay = pick('embedRobotDelayMs', 'robotDelayMs');
  return {
    kind: (pick('embedKind', 'kind') as string) || BRIDGE_EMBED_DEFAULTS.kind,
    seed: typeof seed === 'number' && Number.isFinite(seed) ? seed : BRIDGE_EMBED_DEFAULTS.seed,
    humanSeat: oneOf(pick('embedHumanSeat', 'humanSeat'), SEAT_IDS, BRIDGE_EMBED_DEFAULTS.humanSeat),
    dealer: oneOf(pick('embedDealer', 'dealer'), SEAT_IDS, BRIDGE_EMBED_DEFAULTS.dealer),
    vul: oneOf(pick('embedVul', 'vul'), VUL_IDS, BRIDGE_EMBED_DEFAULTS.vul),
    skin: BRIDGE_SKINS.some((k) => k.id === pick('embedSkin', 'skin'))
      ? (pick('embedSkin', 'skin') as string)
      : BRIDGE_EMBED_DEFAULTS.skin,
    handLayout: oneOf(pick('embedHandLayout', 'handLayout'), ['row', 'fan'] as const, BRIDGE_EMBED_DEFAULTS.handLayout),
    bidPad: oneOf(pick('embedBidPad', 'bidPad'), ['grid', 'columns'] as const, BRIDGE_EMBED_DEFAULTS.bidPad),
    showAllHands: !!pick('embedShowAllHands', 'showAllHands'),
    showCoach: !!pick('embedShowCoach', 'showCoach'),
    robotDelayMs:
      typeof delay === 'number' && Number.isFinite(delay) ? delay : BRIDGE_EMBED_DEFAULTS.robotDelayMs,
  };
}

/** config → the `embed*` fields of an editor part. */
export function configToPartFields(c: BridgeEmbedConfig): Partial<TutorialV2Part> {
  return {
    embedKind: c.kind,
    embedSeed: c.seed,
    embedHumanSeat: c.humanSeat,
    embedDealer: c.dealer,
    embedVul: c.vul,
    embedSkin: c.skin,
    embedHandLayout: c.handLayout,
    embedBidPad: c.bidPad,
    embedShowAllHands: c.showAllHands,
    embedShowCoach: c.showCoach,
    embedRobotDelayMs: c.robotDelayMs,
  };
}

/** config → a published block's content (plus the caption it travels with). */
export function configToBlockContent(c: BridgeEmbedConfig, caption: string) {
  return {
    kind: c.kind,
    seed: c.seed,
    humanSeat: c.humanSeat,
    dealer: c.dealer,
    vul: c.vul,
    skin: c.skin,
    handLayout: c.handLayout,
    bidPad: c.bidPad,
    showAllHands: c.showAllHands,
    showCoach: c.showCoach,
    robotDelayMs: c.robotDelayMs,
    caption,
  };
}

/** A fresh board. Any positive integer is a legal deal. */
export function rollBridgeSeed(): number {
  return Math.floor(Math.random() * 999_983) + 1;
}

/* ------------------------------------------------------------------ *
 * The deal a seed means.
 *
 * @bridge/table-embed derives the deal from the seed internally and does
 * not export the derivation, so this MIRRORS it (same PRNG, same deck
 * order, same S-W-N-E rotation) purely so an author can see the board a
 * re-roll produced. It is author-facing decoration: the table itself
 * always derives its own deal from the seed, so a drift here shows up as
 * a wrong summary, never as a wrong board. Worth exporting from the
 * package next time it is built.
 * ------------------------------------------------------------------ */

export type BridgeSuit = 'S' | 'H' | 'D' | 'C';
export interface BridgeCard { suit: BridgeSuit; rank: number }

function seededRandom(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t |= 0;
    t = (t + 1831565813) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function dealFromSeed(seed: number): Record<BridgeSeat, BridgeCard[]> {
  const rnd = seededRandom(seed);
  const deck: BridgeCard[] = (['S', 'H', 'D', 'C'] as BridgeSuit[]).flatMap((suit) =>
    Array.from({ length: 13 }, (_, i) => ({ suit, rank: i + 2 })),
  );
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const order: BridgeSeat[] = ['S', 'W', 'N', 'E'];
  const hands: Record<BridgeSeat, BridgeCard[]> = { N: [], E: [], S: [], W: [] };
  deck.forEach((c, i) => hands[order[i % 4]].push(c));
  return hands;
}

const RANK_LABEL: Record<number, string> = { 14: 'A', 13: 'K', 12: 'Q', 11: 'J', 10: '10' };
const SUIT_SYMBOL: Record<BridgeSuit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };

/** High-card points, the one number that tells an author what a hand is. */
export function handPoints(cards: BridgeCard[]): number {
  return cards.reduce((n, c) => n + Math.max(0, c.rank - 10), 0);
}

/** One seat's hand as four suit strings, high to low — "♠ A K 9 4". */
export function handSuits(cards: BridgeCard[]): { suit: BridgeSuit; symbol: string; ranks: string }[] {
  return (['S', 'H', 'D', 'C'] as BridgeSuit[]).map((suit) => ({
    suit,
    symbol: SUIT_SYMBOL[suit],
    ranks:
      cards
        .filter((c) => c.suit === suit)
        .sort((a, b) => b.rank - a.rank)
        .map((c) => RANK_LABEL[c.rank] || String(c.rank))
        .join(' ') || '—',
  }));
}

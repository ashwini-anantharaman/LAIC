/**
 * Bridge Platform components, embeddable as tutorial blocks.
 *
 * The Bridge Platform is a SEPARATE application (Next.js, its own pnpm
 * workspace, its own server routes) — but its table is no longer trapped
 * inside it. @bridge/table-embed carries the real PlayTable plus the real game
 * law as ONE ES module whose only runtime dependency is React, so a Bridge
 * component arrives here as a component, vendored into src/vendor/bridge-table
 * and mounted directly. No iframe, no origin, no session.
 *
 * The thumbnail rule is what keeps that cheap. A dormant block is a drawn
 * preview and nothing else: the module is behind a dynamic import, so nothing
 * is fetched and no engine runs until a reader activates it. A tutorial with
 * six bridge blocks costs six divs, not six live tables.
 *
 * THIS MODULE IS THE MAPPING, and it is deliberately import-free: it is loaded
 * eagerly by draftModel and the reader, so pulling the vendored bundle in here
 * for a type or a helper would put 200kB of table in the main chunk.
 *
 * Adding another Bridge component later is one entry in BRIDGE_EMBEDS.
 */

import type { TutorialV2Part } from './types';

/** Where the Bridge Platform lives. Override with VITE_BRIDGE_ORIGIN. */
export const BRIDGE_ORIGIN: string =
  (import.meta.env?.VITE_BRIDGE_ORIGIN as string | undefined)?.replace(/\/$/, '') ||
  'https://nexus-bridge-79lkq4.vercel.app';

/**
 * The MODE of a Bridge block — one block, two shapes, chosen on the first row
 * of Configure. There is deliberately not a block type per shape: an author who
 * has laid out a lesson and then wants the challenge instead of the table
 * should change a chip, not delete a block and add another one in the right
 * place.
 *
 * WHAT HAPPENED TO `drill` AND `diagram` (owner, 2026-08-10). Both are
 * superseded by the challenge, which does what they did and keeps score: a
 * bidding-only challenge IS the drill (bid the board, your contract beside
 * BEN's) with a mark at the end, and a challenge board with all four hands up
 * is the diagram, playable. Two modes that could not report progress have been
 * replaced by one that can.
 *
 * Each mode is a component in @bridge/table-embed, and each answers only its own
 * settings — a challenge has no single-board seed, a table has no board list.
 */
export type BridgeEmbedKind = 'table' | 'challenge';

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
  {
    kind: 'challenge',
    label: 'Bridge challenge',
    blurb: 'Boards to play in sequence, your line beside BEN\u2019s. Scored.',
    path: '/bridge/challenges',
    // The challenge carries the table plus a strip above it, so it wants the
    // same shape with a little more height than the bare board.
    ratio: 5 / 4,
  },
];

export const BRIDGE_MODES: readonly { id: BridgeEmbedKind; label: string; hint: string }[] = [
  { id: 'table', label: 'Playable table', hint: 'One board \u2014 bid it and play it out. Nothing is scored.' },
  {
    id: 'challenge',
    label: 'Challenge',
    hint: 'Boards in sequence against BEN, scored \u2014 the learner\u2019s progress reports back',
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

/**
 * THE CHALLENGE DRAFT, as it travels through this module: opaque.
 *
 * The real shape is @bridge/table-embed's `SoloChallengeDraft` — a title, a
 * format, a scoring mode, the boards with their seeds/dealer/seat/packs, and
 * the table-control overrides. It is NOT restated here, and that is deliberate:
 * this module is imported eagerly by draftModel and the reader, so importing
 * the vendored bundle for its types would drag 200kB of table into the main
 * chunk (the same reason `dealFromSeed` below is a mirror). A second hand-typed
 * copy of the draft would be worse still — it would be a copy that can drift
 * from the component that actually reads it.
 *
 * So the mapping carries it structurally and the PACKAGE validates it:
 * `normalizeDraft`, inside the lazy chunk, is the authority on what a stored
 * draft means, and it fills every gap with the wizard's own default.
 */
export interface BridgeChallengeDraft {
  /** The boards. A draft with none is not a challenge — see readChallengeDraft. */
  boards: unknown[];
  /** Read for the thumbnail and the outline row. See `challengeSummary`. */
  title?: unknown;
  format?: unknown;
}

/**
 * Everything an author can choose about a Bridge block.
 *
 * ONE config for both modes, not one per mode. The look and the pace are true
 * of a felt table whichever mode drew it, so they are shared fields and
 * switching mode keeps them. What is NOT shared is the board: a table has one
 * (`seed`, `humanSeat`, `dealer`, `vul`), a challenge has a list of them inside
 * its own draft — so switching to the challenge does not throw the table's
 * board away, and switching back finds it where it was.
 */
export interface BridgeEmbedConfig {
  /** The MODE: 'table' | 'challenge'. */
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
  /**
   * challenge: the whole authored challenge. Null until the author has been
   * through the wizard once — a challenge block with no draft is an unfinished
   * block, and it says so rather than inventing boards.
   */
  challenge: BridgeChallengeDraft | null;
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

/** What a Bridge block looks like before the author touches anything. */
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
  challenge: null,
};

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

const SEAT_IDS = ['N', 'E', 'S', 'W'] as const;
const VUL_IDS = ['none', 'ns', 'ew', 'both'] as const;
const KIND_IDS = ['table', 'challenge'] as const;

/**
 * The challenge draft, out of whatever a part or a block carries.
 *
 * The ONLY thing checked here is that it could be one: an object with a
 * non-empty `boards` array. Every field inside it is the package's business —
 * see BridgeChallengeDraft — and re-validating them here would be a second
 * spec of the same object, free to disagree with the first. Anything else
 * becomes null, which the block renders as "not configured yet".
 */
function readChallengeDraft(raw: unknown): BridgeChallengeDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (!Array.isArray(d.boards) || d.boards.length === 0) return null;
  return d as unknown as BridgeChallengeDraft;
}

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
  const seedNum = typeof seed === 'number' && Number.isFinite(seed) ? seed : BRIDGE_EMBED_DEFAULTS.seed;
  const challenge = readChallengeDraft(pick('embedChallenge', 'challenge'));
  return {
    kind: oneOf(pick('embedKind', 'kind'), KIND_IDS, 'table'),
    seed: seedNum,
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
    // No fallback: a challenge with no boards is an unconfigured block, and a
    // block that quietly invented four is a block the author never authored.
    challenge,
  };
}

/**
 * config → the `embed*` fields of an editor part.
 *
 * `label` rides along because the mode names the block: change the mode and the
 * part's label in the editor's list has to follow, or a challenge sits in the
 * outline calling itself "Bridge table". Every hop that writes part fields calls this, so
 * the label cannot fall out of step in one of them.
 */
export function configToPartFields(c: BridgeEmbedConfig): Partial<TutorialV2Part> {
  return {
    label: bridgeEmbedDef(c.kind).label,
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
    embedChallenge: c.challenge,
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
    challenge: c.challenge,
    caption,
  };
}

/**
 * What a stored challenge draft SAYS, for a thumbnail and an outline row: its
 * title, how many boards, and what a board asks for. Read structurally for the
 * same reason the draft is carried structurally — the package owns the shape,
 * and this is the one place that peeks at it.
 */
export function challengeSummary(draft: BridgeChallengeDraft | null): {
  title: string;
  boards: number;
  biddingOnly: boolean;
} | null {
  if (!draft) return null;
  const title = typeof draft.title === 'string' ? draft.title.trim() : '';
  return {
    title: title || 'Challenge',
    boards: Array.isArray(draft.boards) ? draft.boards.length : 0,
    biddingOnly: draft.format === 'bidding-only',
  };
}

/** A fresh board. Any positive integer is a legal deal. */
export function rollBridgeSeed(): number {
  return Math.floor(Math.random() * 999_983) + 1;
}

/* ------------------------------------------------------------------ *
 * The deal a seed means.
 *
 * This MIRRORS @bridge/table-embed's derivation (same mulberry32, same
 * deck order, same S-W-N-E rotation) purely so an author can see the
 * board a re-roll produced. It is author-facing decoration: the table
 * itself always derives its own deal from the seed, so a drift here shows
 * up as a wrong summary, never as a wrong board.
 *
 * The package NOW EXPORTS `seededDeal`, and the mirror still stays. This
 * module is imported by draftModel and the reader — eagerly, on every page
 * — so importing the vendored bundle here would drag 102kB of table into
 * the main chunk and undo the whole point of the lazy block. The mirror is
 * the price of that; it is checked against the engine's own seededDeal
 * (packages/bridge-engine/src/decide/simulate.ts) and matches it today.
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

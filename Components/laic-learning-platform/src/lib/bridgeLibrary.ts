/**
 * Bridge Platform library ↔ Learning Platform intersection (Phase B).
 *
 * Authors browse the bridge program's library (via Nexus — the LP never
 * touches bridge tables) and insert entries as prefilled bridge blocks.
 * Embeds are SNAPSHOTS with provenance (content.sourceRef): the lesson stays
 * stable if the library entry later changes or disappears.
 */
import { getProgramId, getToken, nexusFetch } from './nexus';
import type { BiddingSequenceContent, BridgePlayContent } from './types';

type Seat = 'N' | 'E' | 'S' | 'W';
interface Card {
  suit: 'S' | 'H' | 'D' | 'C';
  rank: number;
}

export interface BridgeLibraryEntry {
  entry_id: string;
  kind: 'deal' | 'board' | 'play';
  name: string | null;
  dealer: Seat | null;
  vul: string | null;
  hands: Record<Seat, Card[]> | null;
  auction: { seat: Seat; call: string }[] | null;
  play: { seat: Seat; card: Card }[] | null;
  contract_label: string | null;
  result_label: string | null;
}

/** The bridge program's library (staff-gated server-side). [] when signed out
 *  or in standalone demo mode — the picker shows its empty state. */
export async function fetchBridgeLibrary(): Promise<BridgeLibraryEntry[]> {
  if (!getToken()) return [];
  const pid = getProgramId();
  const qs = pid ? `?program_id=${encodeURIComponent(pid)}` : '';
  try {
    const res = await nexusFetch(`/api/platform/learning/bridge-library${qs}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as BridgeLibraryEntry[]) : [];
  } catch {
    return [];
  }
}

const GLYPH: Record<Card['suit'], string> = { S: '♠', H: '♥', D: '♦', C: '♣' };

function rankLabel(rank: number): string {
  return rank === 14 ? 'A' : rank === 13 ? 'K' : rank === 12 ? 'Q' : rank === 11 ? 'J' : String(rank);
}

function cardStr(card: Card): string {
  return `${GLYPH[card.suit]}${rankLabel(card.rank)}`;
}

/** '1H' → '1♥', 'P' → 'Pass', 'X' → 'Double', '3N' → '3NT'. */
function callLabel(call: string): string {
  const c = call.toUpperCase();
  if (c === 'P' || c === 'PASS') return 'Pass';
  if (c === 'XX') return 'Redouble';
  if (c === 'X') return 'Double';
  const level = c[0];
  const strain = c.slice(1);
  if (strain === 'N' || strain === 'NT') return `${level}NT`;
  return `${level}${GLYPH[strain as Card['suit']] ?? strain}`;
}

function sourceRefOf(entry: BridgeLibraryEntry) {
  return {
    kind: 'embedded' as const,
    entryId: entry.entry_id,
    programId: getProgramId() ?? undefined,
  };
}

/**
 * Entry → bidding walkthrough. The reader's grid is positional with fixed
 * N/E/S/W columns, so the sequence is padded up to the dealer's seat.
 * Explanations start empty — the author narrates each call.
 */
export function entryToBiddingSequence(entry: BridgeLibraryEntry): BiddingSequenceContent {
  const order: Seat[] = ['N', 'E', 'S', 'W'];
  const bids: BiddingSequenceContent['bids'] = [];
  const first = entry.auction?.[0]?.seat ?? entry.dealer ?? 'N';
  for (let i = 0; i < order.indexOf(first); i++) {
    bids.push({ seat: order[i], bid: '—', explanation: '' });
  }
  for (const a of entry.auction ?? []) {
    bids.push({ seat: a.seat, bid: callLabel(a.call), explanation: '' });
  }
  return {
    title: entry.name ?? 'Auction',
    seats: order,
    bids,
    finalContract: entry.contract_label ?? '',
    sourceRef: sourceRefOf(entry),
  };
}

/**
 * Entry → card-play puzzle. With recorded play: trick 1 becomes the puzzle
 * (South's actual card is the answer). Without: the South hand is prefilled
 * and the author completes the puzzle — the point is never retyping hands.
 */
export function entryToBridgePlay(entry: BridgeLibraryEntry): BridgePlayContent {
  const south = (entry.hands?.S ?? []).map(cardStr);
  let north = '—';
  let east = '—';
  let west = '—';
  let correctAnswer = '';
  const trick1 = (entry.play ?? []).slice(0, 4);
  for (const p of trick1) {
    if (p.seat === 'N') north = cardStr(p.card);
    if (p.seat === 'E') east = cardStr(p.card);
    if (p.seat === 'W') west = cardStr(p.card);
    if (p.seat === 'S') correctAnswer = cardStr(p.card);
  }
  const trump = entry.contract_label?.match(/[♠♥♦♣]|NT/)?.[0] ?? '—';
  const hasPlay = trick1.length > 0;
  return {
    title: entry.name ?? 'Card play',
    description: hasPlay
      ? `From “${entry.name}”${entry.contract_label ? ` — ${entry.contract_label}` : ''}. Trick 1: which card should South play?`
      : `From board “${entry.name}” (dealer ${entry.dealer ?? '?'}, vul ${entry.vul ?? '?'}). Set the cards played by N/E/W and the correct answer.`,
    trump,
    north,
    east,
    south,
    west,
    correctAnswer,
    explanation: '',
    sourceRef: sourceRefOf(entry),
  };
}

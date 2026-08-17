/**
 * Tutorial V3 bidding sequence.
 *
 * The V1 block could only step forward or reset, showed seats as single
 * letters, had nowhere to put the hands the auction is about, and no room for
 * the point the auction makes but never states.
 *
 * Seat naming: `BidItem.seat` stays 'N' | 'E' | 'S' | 'W' — the stored shape
 * does not change. Full names and per-seat colour are display only, so an
 * auction authored before this renders identically to one authored after.
 */

import React, { useEffect, useState } from 'react';
import type { BiddingSequenceContent, BridgeHandRow } from '../../../../../lib/types';
import { useLearnerProgress } from './LearnerProgressContext';

type Seat = 'N' | 'E' | 'S' | 'W';

const SEAT_ORDER: Seat[] = ['W', 'N', 'E', 'S'];

const SEAT_NAME: Record<Seat, string> = { N: 'North', E: 'East', S: 'South', W: 'West' };

/** One colour per seat, so a learner can follow one player down the auction. */
const SEAT_COLOR: Record<Seat, string> = {
  W: '#2563EB',
  N: '#DC2626',
  E: '#059669',
  S: '#7C3AED',
};

const RED_SUITS = new Set(['♥', '♦']);

function HandPanel({ seat, rows }: { seat: Seat; rows: BridgeHandRow[] }) {
  return (
    <div className="rounded-xl" style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', padding: 14 }}>
      <p style={{ fontSize: 10, letterSpacing: '0.13em', color: SEAT_COLOR[seat], fontWeight: 700, marginBottom: 10 }}>
        {SEAT_NAME[seat].toUpperCase()}
      </p>
      <div className="space-y-1.5">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2" style={{ fontSize: 13.5 }}>
            <span style={{ color: RED_SUITS.has(row.suit) ? '#DC2626' : '#1c1917', fontWeight: 700 }}>{row.suit}</span>
            <span style={{ color: '#292524', letterSpacing: '0.04em' }}>{row.cards || '—'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TutorialV3BiddingSequence({
  content,
  blockId,
}: {
  content: BiddingSequenceContent;
  blockId: string;
}) {
  const bids = content.bids || [];
  /** -1 is show-all; 0..n-1 is step-through, pointing at the newest bid. */
  const [step, setStep] = useState<number>(-1);
  const stepping = step !== -1;
  const visible = stepping ? bids.slice(0, step + 1) : bids;

  const { markBlockDone } = useLearnerProgress();

  // Seeing the whole auction is what finishing this block means — either by
  // stepping to the end, or by choosing to show it all at once.
  useEffect(() => {
    if (!bids.length) return;
    if (!stepping || step >= bids.length - 1) markBlockDone(blockId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, stepping, bids.length, blockId]);

  const hands = content.hands || {};
  const handSeats = SEAT_ORDER.filter((s) => (hands[s]?.length || 0) > 0);
  const rows = Math.max(1, Math.ceil(visible.length / 4));

  return (
    <div className="rounded-[22px] p-5" style={{ background: '#F5F7FA', border: '1.5px solid rgba(0,0,0,0.07)' }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
        Bidding Sequence
      </p>
      <p style={{ fontSize: 15, fontWeight: 700, color: '#0B1220', marginBottom: 14 }}>{content.title}</p>

      {/* Hands the auction is about, when the author supplied them. */}
      {handSeats.length > 0 && (
        <div
          className="grid gap-2.5 mb-4"
          style={{ gridTemplateColumns: `repeat(${Math.min(handSeats.length, 2)}, minmax(0, 1fr))` }}
        >
          {handSeats.map((s) => <HandPanel key={s} seat={s} rows={hands[s] || []} />)}
        </div>
      )}

      {/* Mode switch — an author who wants the finished auction on the page can
          now have it without clicking through every call. */}
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => setStep(-1)}
          className="px-3 py-1.5 rounded-full"
          style={{
            fontSize: 12,
            fontWeight: 650,
            color: !stepping ? '#B45309' : '#6B7280',
            background: !stepping ? 'rgba(217,119,6,0.08)' : 'transparent',
            border: `1px solid ${!stepping ? 'rgba(217,119,6,0.35)' : 'rgba(0,0,0,0.12)'}`,
          }}
        >
          Show all
        </button>
        <button
          type="button"
          onClick={() => setStep(0)}
          className="px-3 py-1.5 rounded-full"
          style={{
            fontSize: 12,
            fontWeight: 650,
            color: stepping ? '#B45309' : '#6B7280',
            background: stepping ? 'rgba(217,119,6,0.08)' : 'transparent',
            border: `1px solid ${stepping ? 'rgba(217,119,6,0.35)' : 'rgba(0,0,0,0.12)'}`,
          }}
        >
          Step through
        </button>
      </div>

      <div className="rounded-xl overflow-x-auto" style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)' }}>
        <div style={{ minWidth: 260 }}>
          <div className="grid grid-cols-4" style={{ background: 'rgba(0,0,0,0.02)', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
            {SEAT_ORDER.map((s) => (
              <div key={s} className="text-center" style={{ padding: '8px 6px', fontSize: 11.5, fontWeight: 700, color: SEAT_COLOR[s] }}>
                {SEAT_NAME[s]}
              </div>
            ))}
          </div>
          {Array.from({ length: rows }).map((_, rowIdx) => (
            <div key={rowIdx} className="grid grid-cols-4" style={{ borderBottom: rowIdx === rows - 1 ? undefined : '1px solid rgba(0,0,0,0.05)' }}>
              {SEAT_ORDER.map((_s, colIdx) => {
                const idx = rowIdx * 4 + colIdx;
                const bid = visible[idx];
                const isCurrent = stepping && idx === step;
                return (
                  <div key={colIdx} className="text-center" style={{ padding: '10px 6px' }}>
                    {bid ? (
                      <span
                        className="inline-block px-2.5 py-1 rounded-lg"
                        style={{
                          fontSize: 13,
                          fontWeight: 650,
                          background: isCurrent
                            ? 'rgba(217,119,6,0.14)'
                            : bid.bid === 'Pass' ? 'rgba(0,0,0,0.04)' : '#0B0F1A',
                          color: isCurrent
                            ? '#B45309'
                            : bid.bid === 'Pass' ? '#9AA3AF' : '#fff',
                          border: isCurrent ? '1px solid rgba(217,119,6,0.4)' : '1px solid transparent',
                        }}
                      >
                        {bid.bid}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* In step mode the explanation belongs to the call just made; showing all
          at once has no single "current" call to explain. */}
      {stepping && bids[step] && (
        <div
          className="flex items-start gap-3 rounded-xl mt-3"
          style={{ background: 'rgba(217,119,6,0.07)', border: '1px solid rgba(217,119,6,0.22)', padding: '11px 14px' }}
        >
          <span style={{ fontSize: 11.5, fontWeight: 700, color: SEAT_COLOR[bids[step].seat as Seat] || '#6B7280', marginTop: 1 }}>
            {SEAT_NAME[bids[step].seat as Seat] || bids[step].seat}
          </span>
          <p style={{ fontSize: 13, color: '#92400E', lineHeight: 1.5, flex: 1 }}>
            {bids[step].explanation || 'Auction closes — all pass.'}
          </p>
        </div>
      )}

      {stepping && (
        <div className="flex items-center gap-2 mt-3">
          <button
            type="button"
            disabled={step <= 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="px-4 py-1.5 rounded-full"
            style={{ fontSize: 12.5, fontWeight: 650, color: '#374151', border: '1px solid rgba(0,0,0,0.12)', background: '#fff', opacity: step <= 0 ? 0.35 : 1 }}
          >
            ← Prev
          </button>
          <button
            type="button"
            disabled={step >= bids.length - 1}
            onClick={() => setStep((s) => Math.min(bids.length - 1, s + 1))}
            className="px-4 py-1.5 rounded-full text-white"
            style={{ fontSize: 12.5, fontWeight: 650, background: '#0B0F1A', opacity: step >= bids.length - 1 ? 0.35 : 1 }}
          >
            Next →
          </button>
          <span className="ml-auto" style={{ fontSize: 11.5, color: '#9AA3AF', fontWeight: 650 }}>
            {step + 1} / {bids.length}
          </span>
        </div>
      )}

      <div className="mt-3">
        <span style={{ fontSize: 10, letterSpacing: '0.13em', color: '#9AA3AF', fontWeight: 700, marginRight: 8 }}>
          FINAL CONTRACT
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: '#059669' }}>{content.finalContract || '—'}</span>
      </div>

      {content.footnote && (
        <p style={{ fontSize: 12.5, color: '#6B7280', lineHeight: 1.55, marginTop: 8, fontStyle: 'italic' }}>
          {content.footnote}
        </p>
      )}
    </div>
  );
}

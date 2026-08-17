/**
 * Tutorial V3 bidding sequence — the reference export's `BiddingSequenceBlock`
 * from `App.tsx`.
 *
 * A mono-ish BIDDING SEQUENCE chip beside the title, a Show-all / Step-through
 * pair in amber, the auction as a four-column grid with one colour per seat, the
 * explanation for the call just made, and the contract it arrived at.
 *
 * Seat naming: `BidItem.seat` stays 'N' | 'E' | 'S' | 'W' — the stored shape does
 * not change. Full names and per-seat colour are display only, so an auction
 * authored before this renders identically to one authored after.
 */

import React, { useEffect, useState } from 'react';
import type { BiddingSequenceContent, BridgeHandRow } from '../../../../../lib/types';
import { useLearnerProgress } from './LearnerProgressContext';
import { SEAT_NAME, SEAT_TEXT, suitColor } from './warm/theme';

type Seat = 'N' | 'E' | 'S' | 'W';

/** Reading order round the table. */
const SEAT_ORDER: Seat[] = ['W', 'N', 'E', 'S'];

function HandPanel({ seat, rows }: { seat: Seat; rows: BridgeHandRow[] }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <p className={`text-xs font-bold tracking-wide mb-3 ${SEAT_TEXT[SEAT_NAME[seat]] || 'text-stone-400'}`}>
        {SEAT_NAME[seat].toUpperCase()}
      </p>
      <div className="space-y-1.5">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2 font-mono text-sm">
            <span style={{ color: suitColor(row.suit) }}>{row.suit}</span>
            <span className="text-stone-800">{row.cards || '—'}</span>
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
  /** -1 is show-all; 0..n-1 is step-through, pointing at the newest call. */
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
  const rowCount = Math.max(1, Math.ceil(visible.length / 4));

  if (!bids.length && !handSeats.length) return null;

  return (
    <div>
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <span className="text-xs font-bold text-stone-500 bg-stone-100 px-2 py-0.5 rounded shrink-0">
          BIDDING SEQUENCE
        </span>
        <h2 className="text-xl text-stone-900">{content.title || 'The auction'}</h2>
      </div>

      {handSeats.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          {handSeats.map((s) => <HandPanel key={s} seat={s} rows={(hands[s] || []) as BridgeHandRow[]} />)}
        </div>
      )}

      <div className="flex gap-3 mb-4">
        <button
          type="button"
          onClick={() => setStep(-1)}
          className={`text-xs font-bold px-4 py-2 rounded-full border-2 transition-colors ${
            !stepping ? 'border-amber-400 text-amber-700 bg-amber-50' : 'border-stone-200 text-stone-500 hover:border-stone-400'
          }`}
        >
          Show all
        </button>
        <button
          type="button"
          onClick={() => setStep(0)}
          className={`text-xs font-bold px-4 py-2 rounded-full border-2 transition-colors ${
            stepping ? 'border-amber-400 text-amber-700 bg-amber-50' : 'border-stone-200 text-stone-500 hover:border-stone-400'
          }`}
        >
          Step-through
        </button>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white overflow-x-auto">
        <div className="min-w-[260px]">
          <div className="grid grid-cols-4 border-b border-stone-100 bg-stone-50">
            {SEAT_ORDER.map((s) => (
              <div key={s} className={`px-3 sm:px-4 py-2 text-xs font-bold text-center ${SEAT_TEXT[SEAT_NAME[s]]}`}>
                {SEAT_NAME[s]}
              </div>
            ))}
          </div>
          {Array.from({ length: rowCount }).map((_, ri) => (
            <div key={ri} className="grid grid-cols-4 border-b border-stone-100 last:border-0">
              {SEAT_ORDER.map((_s, ci) => {
                const bid = visible[ri * 4 + ci];
                return (
                  <div key={ci} className="px-4 py-3 text-center border-r border-stone-100 last:border-0">
                    {bid && (
                      <span className={`font-mono font-medium text-sm ${bid.bid === 'Pass' ? 'text-stone-400' : 'text-stone-900'}`}>
                        {bid.bid}
                      </span>
                    )}
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
        <div className="mt-3 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-3">
          <span className={`text-xs font-bold mt-0.5 shrink-0 ${SEAT_TEXT[SEAT_NAME[bids[step].seat as Seat]] || 'text-stone-500'}`}>
            {SEAT_NAME[bids[step].seat as Seat] || bids[step].seat}
          </span>
          <p className="text-amber-900 text-sm flex-1">
            {bids[step].explanation || 'Auction closes — all pass.'}
          </p>
        </div>
      )}

      {stepping && (
        <div className="flex gap-2 mt-3">
          <button
            type="button"
            disabled={step <= 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="px-5 py-2 text-sm font-bold border-2 border-stone-200 rounded-full hover:bg-stone-50 disabled:opacity-30 text-stone-600"
          >
            ←
          </button>
          <button
            type="button"
            disabled={step >= bids.length - 1}
            onClick={() => setStep((s) => Math.min(bids.length - 1, s + 1))}
            className="px-5 py-2 text-sm font-bold border-2 border-stone-200 rounded-full hover:bg-stone-50 disabled:opacity-30 text-stone-600"
          >
            →
          </button>
          <div className="ml-auto text-xs text-stone-400 font-semibold self-center">{step + 1} / {bids.length}</div>
        </div>
      )}

      <p className="mt-3 text-sm text-stone-600 px-1">
        <span className="text-xs font-bold text-stone-400 mr-2">FINAL CONTRACT</span>
        <span className="font-medium">{content.finalContract || '—'}</span>
      </p>

      {content.footnote && (
        <div className="mt-3 rounded-lg bg-stone-50 border border-stone-200 px-5 py-4">
          <p className="text-stone-600 text-sm leading-relaxed">{content.footnote}</p>
        </div>
      )}
    </div>
  );
}

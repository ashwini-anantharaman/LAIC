/**
 * The small parts every warm block is built from.
 *
 * Each one is a transcription of a shape that appears more than once in the
 * reference export, kept here so the block renderers cannot drift apart from one
 * another: one definition of a card, one of an outlined pill, one of a progress
 * strip, one of a bridge hand.
 */

import React from 'react';
import { SAGE, suitColor } from './theme';

/** The reference's four card grounds. White is the default: soft shadow, no border. */
export function WarmCard({
  children,
  className = '',
  tone = 'white',
}: {
  children: React.ReactNode;
  className?: string;
  tone?: 'white' | 'stone' | 'amber' | 'green';
}) {
  const bg = {
    white: 'bg-white shadow-sm',
    stone: 'bg-stone-50',
    amber: 'bg-amber-50',
    green: 'bg-green-50',
  }[tone];
  return <div className={`rounded-2xl ${bg} ${className}`}>{children}</div>;
}

/** An outlined pill that fills sage when it is the current choice. */
export function GhostPill({
  children,
  active = false,
  onClick,
  disabled,
  className = '',
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-xs font-bold px-4 py-2 rounded-full border-2 transition-colors disabled:opacity-30 ${
        active ? 'text-white border-transparent' : 'border-stone-200 text-stone-500 hover:border-stone-400'
      } ${className}`}
      style={active ? { background: SAGE } : undefined}
    >
      {children}
    </button>
  );
}

/**
 * The per-item progress strip. One bar per item, coloured by outcome; the
 * reference uses it above questions, cards and staged sections alike.
 */
export function WarmStrip({
  items,
}: {
  /** 'done' green · 'missed' red · 'partial' amber · 'current' sage · 'todo' grey */
  items: ('done' | 'missed' | 'partial' | 'current' | 'todo')[];
}) {
  return (
    <div className="flex gap-1.5" aria-hidden>
      {items.map((state, i) => (
        <div
          key={i}
          className={`h-2 flex-1 rounded-full transition-colors ${
            state === 'done'
              ? 'bg-green-400'
              : state === 'missed'
                ? 'bg-red-400'
                : state === 'partial'
                  ? 'bg-amber-400'
                  : state === 'current'
                    ? ''
                    : 'bg-stone-200'
          }`}
          style={state === 'current' ? { background: SAGE } : undefined}
        />
      ))}
    </div>
  );
}

/** A bridge hand, one row per suit, in the reference's monospaced layout. */
export function HandRows({ rows }: { rows: { suit: string; cards: string }[] }) {
  return (
    <div className="space-y-1.5">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2 font-mono text-sm">
          <span style={{ color: suitColor(row.suit) }}>{row.suit}</span>
          <span className="text-stone-800">{row.cards || '—'}</span>
        </div>
      ))}
    </div>
  );
}

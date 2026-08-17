/**
 * The one shape every warm block is built on.
 *
 * The reference draws a card as a hairline border over a tinted ground — never
 * a shadow — and uses exactly four grounds. Keeping the definition here is what
 * stops twelve renderers drifting apart from one another.
 */

import React from 'react';

export function WarmCard({
  children,
  className = '',
  tone = 'white',
}: {
  children: React.ReactNode;
  className?: string;
  tone?: 'white' | 'stone' | 'amber' | 'green';
}) {
  const skin = {
    white: 'border-stone-200 bg-white',
    stone: 'border-stone-200 bg-stone-50',
    amber: 'border-amber-200 bg-amber-50',
    green: 'border-green-200 bg-green-50',
  }[tone];
  return <div className={`rounded-xl border ${skin} ${className}`}>{children}</div>;
}

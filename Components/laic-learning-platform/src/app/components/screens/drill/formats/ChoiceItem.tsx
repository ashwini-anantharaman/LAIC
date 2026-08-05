import React from 'react';
import { answersMatch, evaluateInteractive } from '../../../../../lib/drillRuntime';
import type { DrillInteractivePayload } from '../../../../../lib/types';
import type { DrillFormatProps } from './shared';

type ChoicePayload = Extract<DrillInteractivePayload, { kind: 'choice' }>;

export function ChoiceItem({ item, interactive, disabled, onResult, lockedResult }: DrillFormatProps) {
  const payload = interactive as ChoicePayload;
  const locked = disabled || !!lockedResult;
  const committed = lockedResult ? String(lockedResult.committed ?? '') : null;

  return (
    <div className="space-y-2">
      <p style={{ fontSize: 14, fontWeight: 600, color: '#0B1220', marginBottom: 4 }}>{payload.prompt}</p>
      {payload.choices.map((c) => {
        const isPicked = committed != null && (committed === c.id || answersMatch(c.text, committed));
        let border = 'rgba(0,0,0,0.1)';
        let bg = '#fff';
        if (lockedResult) {
          if (c.correct) { border = '#059669'; bg = 'rgba(5,150,105,0.08)'; }
          else if (isPicked) { border = '#DC2626'; bg = 'rgba(220,38,38,0.06)'; }
        } else if (isPicked) {
          border = '#0B0F1A';
        }
        return (
          <button
            key={c.id}
            type="button"
            disabled={locked}
            onClick={() => onResult(evaluateInteractive(item, payload, c.id))}
            className="w-full text-left px-3 py-2.5 rounded-xl border transition-colors"
            style={{ fontSize: 13.5, borderColor: border, background: bg }}
          >
            {c.text}
          </button>
        );
      })}
    </div>
  );
}

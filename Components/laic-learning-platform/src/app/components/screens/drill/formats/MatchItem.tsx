import React, { useEffect, useMemo, useState } from 'react';
import { evaluateInteractive } from '../../../../../lib/drillRuntime';
import type { DrillInteractivePayload } from '../../../../../lib/types';
import type { DrillFormatProps } from './shared';

type MatchPayload = Extract<DrillInteractivePayload, { kind: 'match' }>;

/** Match without DnD — click left then click right to pair; wrong clears, correct locks. */
export function MatchItem({ item, interactive, disabled, onResult, lockedResult }: DrillFormatProps) {
  const payload = interactive as MatchPayload;
  const locked = disabled || !!lockedResult;

  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const [flashWrong, setFlashWrong] = useState<string | null>(null);

  useEffect(() => {
    setPairs({});
    setSelectedLeft(null);
    setFlashWrong(null);
  }, [item.id]);

  const usedRight = useMemo(() => new Set(Object.values(pairs)), [pairs]);

  const tryPair = (rightId: string) => {
    if (locked || !selectedLeft) return;
    const leftId = selectedLeft;
    setSelectedLeft(null);
    if (payload.pairs[leftId] === rightId) {
      setPairs((p) => {
        const next = { ...p, [leftId]: rightId };
        const keys = Object.keys(payload.pairs);
        if (keys.every((k) => next[k] === payload.pairs[k])) {
          queueMicrotask(() => onResult(evaluateInteractive(item, payload, next)));
        }
        return next;
      });
    } else {
      setFlashWrong(leftId);
      window.setTimeout(() => setFlashWrong(null), 450);
    }
  };

  const wrong = new Set(lockedResult?.wrongParts || []);

  return (
    <div className="space-y-3">
      <p style={{ fontSize: 13, color: '#6B7280' }}>
        Click a term on the left, then its match on the right. Wrong pairs clear; correct pairs lock.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          {payload.left.map((l) => {
            const paired = !!pairs[l.id];
            const active = selectedLeft === l.id;
            const bad = flashWrong === l.id || wrong.has(l.id);
            return (
              <button
                key={l.id}
                type="button"
                disabled={locked || paired}
                onClick={() => setSelectedLeft(l.id)}
                className="w-full text-left px-3 py-2.5 rounded-xl border"
                style={{
                  fontSize: 13.5,
                  fontWeight: 600,
                  borderColor: bad ? '#DC2626' : paired ? '#059669' : active ? '#0B0F1A' : 'rgba(0,0,0,0.12)',
                  background: paired ? 'rgba(5,150,105,0.08)' : bad ? 'rgba(220,38,38,0.06)' : '#fff',
                  color: '#0B1220',
                }}
              >
                {l.text}
              </button>
            );
          })}
        </div>
        <div className="space-y-2">
          {payload.right.map((r) => {
            const used = usedRight.has(r.id);
            return (
              <button
                key={r.id}
                type="button"
                disabled={locked || used || !selectedLeft}
                onClick={() => tryPair(r.id)}
                className="w-full text-left px-3 py-2.5 rounded-xl border disabled:opacity-50"
                style={{
                  fontSize: 13.5,
                  borderColor: used ? '#059669' : 'rgba(0,0,0,0.12)',
                  background: used ? 'rgba(5,150,105,0.08)' : '#fff',
                  color: '#0B1220',
                }}
              >
                {r.text}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

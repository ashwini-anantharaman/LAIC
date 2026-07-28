import React, { useState } from 'react';
import { evaluateInteractive } from '../../../../../lib/drillRuntime';
import type { DrillFormatProps } from './shared';

export function ComputeItem(props: DrillFormatProps) {
  const { item, interactive, disabled, onResult, lockedResult } = props;
  const [typed, setTyped] = useState('');
  if (interactive.kind !== 'compute') return null;
  const locked = disabled || !!lockedResult;

  const submit = () => {
    if (locked || !typed.trim()) return;
    onResult(evaluateInteractive(item, interactive, typed));
  };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      className="flex gap-2"
    >
      <input
        value={String(
          locked && lockedResult
            ? (lockedResult.committed ?? typed ?? '')
            : (typed ?? ''),
        )}
        disabled={locked}
        onChange={(e) => setTyped(e.target.value)}
        placeholder="Type your answer — then commit"
        className="flex-1 rounded-xl px-3 py-2.5 outline-none"
        style={{
          fontSize: 14,
          border: `1px solid ${lockedResult ? (lockedResult.correct ? '#059669' : '#DC2626') : 'rgba(0,0,0,0.12)'}`,
          background: locked ? 'rgba(0,0,0,0.03)' : '#fff',
        }}
        autoComplete="off"
      />
      <button
        type="submit"
        disabled={locked || !typed.trim()}
        className="px-4 py-2 rounded-full text-white shrink-0 disabled:opacity-40"
        style={{ background: '#0B0F1A', fontSize: 13, fontWeight: 600 }}
      >
        Commit
      </button>
    </form>
  );
}

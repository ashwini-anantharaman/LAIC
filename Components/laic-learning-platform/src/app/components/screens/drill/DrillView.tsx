import React, { useEffect, useMemo, useState } from 'react';
import { Flame, Timer } from 'lucide-react';
import type { DrillContent, DrillItem, DrillItemResult } from '../../../../lib/types';
import {
  contentToBlueprint,
  initialQueueForTier,
  resolveInteractiveForPlay,
} from '../../../../lib/drillRuntime';
import {
  isSessionQueueComplete,
  resolveSessionQueueItem,
} from '../../../../lib/sessionMasteryQueue';
import { mockDrillContent } from '../../../../lib/mockDrillBlueprint';
import { DrillItemHost } from './DrillItemHost';

export function DrillView({ content }: { content: DrillContent }) {
  const effective = useMemo(() => {
    const hasItems = (content.items && content.items.length > 0)
      || (content.blueprint?.items && content.blueprint.items.length > 0);
    return hasItems ? content : mockDrillContent({
      skill: content.skill || undefined,
      format: content.format || undefined,
      difficultyCurve: content.difficultyCurve || undefined,
      feedback: content.feedback || undefined,
      timed: content.timed,
      repeatUntilMastery: content.repeatUntilMastery ?? true,
    });
  }, [content]);

  const blueprint = useMemo(() => contentToBlueprint(effective), [effective]);
  const byId = useMemo(() => {
    const m = new Map<string, DrillItem>();
    blueprint.items.forEach((it) => m.set(it.id, it));
    return m;
  }, [blueprint]);

  /** Stable session identity — avoid resetting mid-answer when parent re-renders. */
  const sessionKey = useMemo(
    () => [
      blueprint.skill,
      blueprint.difficultyMode,
      blueprint.runtime.feedbackTiming,
      blueprint.runtime.repeatUntilMastery ? 'm' : '1',
      blueprint.runtime.timed ? `t${blueprint.runtime.secondsPerItem || 20}` : 'u',
      blueprint.tiers.map((t) => `${t.id}:${t.itemIds.join(',')}`).join('|'),
      blueprint.items.map((it) => it.id).join(','),
    ].join('::'),
    [blueprint],
  );

  const mastery = blueprint.runtime.repeatUntilMastery;
  const immediate = blueprint.runtime.feedbackTiming !== 'End only';
  const timed = blueprint.runtime.timed;
  const secondsPerItem = Math.max(5, blueprint.runtime.secondsPerItem || 20);
  const requeueOffset = Math.max(1, blueprint.runtime.requeueOffset || 3);

  const [tierIndex, setTierIndex] = useState(0);
  const [queue, setQueue] = useState<string[]>(() => initialQueueForTier(blueprint, 0));
  const [mastered, setMastered] = useState<Set<string>>(() => new Set());
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [retries, setRetries] = useState(0);
  const [phase, setPhase] = useState<'item' | 'tier_gate' | 'complete'>('item');
  const [result, setResult] = useState<DrillItemResult | null>(null);
  const [pendingResult, setPendingResult] = useState<DrillItemResult | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(secondsPerItem);
  const [startedAt] = useState(() => Date.now());
  const [usingMock] = useState(() => !(
    (content.items && content.items.length > 0)
    || (content.blueprint?.items && content.blueprint.items.length > 0)
  ));

  // Reset when session identity changes (not on every new blueprint object reference).
  useEffect(() => {
    setTierIndex(0);
    setQueue(initialQueueForTier(blueprint, 0));
    setMastered(new Set());
    setStreak(0);
    setBestStreak(0);
    setRetries(0);
    setPhase('item');
    setResult(null);
    setPendingResult(null);
    setSecondsLeft(secondsPerItem);
    // blueprint is read for initial queue; sessionKey captures its identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey, secondsPerItem]);

  const tier = blueprint.tiers[tierIndex];
  const headId = queue[0];
  const item = headId ? byId.get(headId) : undefined;
  const play = item ? resolveInteractiveForPlay(item) : null;
  const totalUnique = blueprint.items.length;
  const masteredCount = mastered.size;

  useEffect(() => {
    if (!timed || phase !== 'item' || !item || result) return;
    setSecondsLeft(secondsPerItem);
    const t = window.setInterval(() => {
      setSecondsLeft((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(t);
  }, [timed, phase, item?.id, result, secondsPerItem]);

  useEffect(() => {
    if (timed && secondsLeft === 0 && item && play && !result && !pendingResult) {
      handleResult({
        correct: false,
        committed: '',
        why: item.whyCorrect,
        correction: 'Time ran out.',
        wrongParts: ['timeout'],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft]);

  const showResult = (r: DrillItemResult) => {
    setResult(r);
    setPendingResult(null);
    if (r.correct) {
      setStreak((s) => {
        const n = s + 1;
        setBestStreak((b) => Math.max(b, n));
        return n;
      });
    } else {
      setStreak(0);
      setRetries((n) => n + 1);
    }
  };

  const handleResult = (r: DrillItemResult) => {
    if (result || phase !== 'item') return;
    if (!immediate) {
      setPendingResult(r);
      return;
    }
    showResult(r);
  };

  const revealEndOnly = () => {
    if (!pendingResult) return;
    showResult(pendingResult);
  };

  const advance = () => {
    if (!item || !result) return;
    const id = item.id;

    if (result.correct) {
      setMastered((prev) => new Set(prev).add(id));
      const nextQueue = resolveSessionQueueItem(queue, id, 'leave');
      if (isSessionQueueComplete(nextQueue)) {
        // Tier cleared
        if (tierIndex < blueprint.tiers.length - 1) {
          setPhase('tier_gate');
          setQueue([]);
        } else {
          setPhase('complete');
          setQueue([]);
        }
      } else {
        setQueue(nextQueue);
      }
    } else if (mastery) {
      setQueue((q) => resolveSessionQueueItem(q, id, 'requeue', {
        requeueMode: 'offset',
        offset: requeueOffset,
      }));
    } else {
      // One pass: leave the item; if queue empty, advance tier linearly (no mastery gate)
      const nextQueue = resolveSessionQueueItem(queue, id, 'leave');
      if (isSessionQueueComplete(nextQueue)) {
        if (tierIndex < blueprint.tiers.length - 1) {
          setPhase('tier_gate');
          setQueue([]);
        } else {
          setPhase('complete');
          setQueue([]);
        }
      } else {
        setQueue(nextQueue);
      }
    }

    setResult(null);
    setPendingResult(null);
    setSecondsLeft(secondsPerItem);
  };

  const continueToNextTier = () => {
    const next = tierIndex + 1;
    setTierIndex(next);
    setQueue(initialQueueForTier(blueprint, next));
    setPhase('item');
    setResult(null);
    setPendingResult(null);
  };

  const restart = () => {
    setTierIndex(0);
    setQueue(initialQueueForTier(blueprint, 0));
    setMastered(new Set());
    setStreak(0);
    setRetries(0);
    setPhase('item');
    setResult(null);
    setPendingResult(null);
    setSecondsLeft(secondsPerItem);
  };

  if (!blueprint.items.length) {
    return <p style={{ color: '#9AA3AF' }}>No drill items yet.</p>;
  }

  if (phase === 'complete') {
    const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
    return (
      <div className="space-y-4">
        <div className="rounded-2xl p-6 border text-center" style={{ background: 'rgba(255,255,255,0.95)', borderColor: 'rgba(0,0,0,0.08)' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Drill complete</p>
          <h2 style={{ fontSize: 20, fontWeight: 750, color: '#0B1220', marginTop: 8 }}>{blueprint.skill}</h2>
          <p style={{ fontSize: 13.5, color: '#6B7280', marginTop: 8 }}>
            {mastery ? `Mastered all ${totalUnique} items.` : `Finished ${totalUnique} items.`}
            {retries > 0 ? ` ${retries} retr${retries === 1 ? 'y' : 'ies'}.` : ''}
            {bestStreak > 0 ? ` Best streak: ${bestStreak}.` : ''}
            {timed ? ` Time: ${elapsedSec}s.` : ''}
          </p>
          <button type="button" onClick={restart} className="mt-5 px-4 py-2 rounded-full text-white" style={{ background: '#0B0F1A', fontSize: 13, fontWeight: 600 }}>
            Drill again
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'tier_gate') {
    const nextLabel = blueprint.tiers[tierIndex + 1]?.label || 'next level';
    return (
      <div className="rounded-2xl p-6 border text-center" style={{ background: 'rgba(255,255,255,0.95)', borderColor: 'rgba(0,0,0,0.08)' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#059669', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {tier?.label || 'Level'} complete
        </p>
        <h2 style={{ fontSize: 18, fontWeight: 750, color: '#0B1220', marginTop: 8 }}>
          {mastery
            ? `You've mastered every item in ${tier?.label || 'this level'}.`
            : `You've finished ${tier?.label || 'this level'}.`}
        </h2>
        <p style={{ fontSize: 13.5, color: '#6B7280', marginTop: 8 }}>
          Continue to {nextLabel} when you're ready.
        </p>
        <button
          type="button"
          onClick={continueToNextTier}
          className="mt-5 px-4 py-2 rounded-full text-white"
          style={{ background: '#0B0F1A', fontSize: 13, fontWeight: 600 }}
        >
          Continue to {nextLabel}
        </button>
      </div>
    );
  }

  if (!item || !play) {
    return <p style={{ color: '#9AA3AF' }}>No drill items yet.</p>;
  }

  const explanationVisible = immediate ? !!result : !!result;
  const lockedForFormat = !!result || (!immediate && !!pendingResult);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#DC2626', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Drill</p>
          <h2 style={{ fontSize: 18, fontWeight: 750, color: '#0B1220', marginTop: 4 }}>{blueprint.skill}</h2>
          <p style={{ fontSize: 12, color: '#9AA3AF', marginTop: 4 }}>
            {[
              blueprint.cognitiveFormat,
              tier?.label,
              immediate ? 'Immediate feedback' : 'End-only feedback',
              mastery ? 'Until mastery' : 'One pass',
              play.interactive.kind.replace('_', ' '),
            ].filter(Boolean).join(' · ')}
          </p>
          {usingMock && (
            <p style={{ fontSize: 11, color: '#D97706', marginTop: 4 }}>
              Demo blueprint (no authored items) — exercises all interactive formats.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {streak > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full" style={{ background: 'rgba(220,38,38,0.1)', color: '#B91C1C', fontSize: 12, fontWeight: 700 }}>
              <Flame size={12} /> {streak} streak
            </span>
          )}
          {timed && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full" style={{
              background: secondsLeft <= 5 ? 'rgba(220,38,38,0.12)' : 'rgba(0,0,0,0.05)',
              color: secondsLeft <= 5 ? '#B91C1C' : '#374151',
              fontSize: 12, fontWeight: 700,
            }}>
              <Timer size={12} /> {secondsLeft}s
            </span>
          )}
          <span className="px-2.5 py-1 rounded-full" style={{ background: 'rgba(0,0,0,0.05)', color: '#6B7280', fontSize: 12, fontWeight: 600 }}>
            {mastery
              ? `${masteredCount}/${totalUnique} mastered · ${queue.length} in queue`
              : `${tier?.label || 'Level'} · ${queue.length} left`}
          </span>
        </div>
      </div>

      <div className="rounded-2xl p-5 border" style={{ background: 'rgba(255,255,255,0.95)', borderColor: 'rgba(0,0,0,0.08)' }}>
        {(play.interactive.kind === 'compute' || play.interactive.kind === 'choice' || play.interactive.kind === 'multi_step') && (
          <p style={{ fontSize: 15, fontWeight: 650, color: '#0B1220', marginBottom: 14, lineHeight: 1.45 }}>
            {item.prompt}
          </p>
        )}

        <DrillItemHost
          key={item.id}
          item={item}
          interactive={play.interactive}
          feedbackTiming={blueprint.runtime.feedbackTiming}
          disabled={lockedForFormat}
          onResult={handleResult}
          lockedResult={result}
          fallbackNote={play.fallbackNote}
        />

        {item.hint && !result && (
          <p style={{ fontSize: 12, color: '#9AA3AF', marginTop: 12 }}>Hint: {item.hint}</p>
        )}

        {explanationVisible && result && (
          <div
            className="mt-4 rounded-xl px-3.5 py-3"
            style={{
              background: result.correct ? 'rgba(5,150,105,0.08)' : 'rgba(220,38,38,0.06)',
              border: `1px solid ${result.correct ? 'rgba(5,150,105,0.35)' : 'rgba(220,38,38,0.3)'}`,
            }}
          >
            <p style={{ fontSize: 13.5, fontWeight: 700, color: result.correct ? '#047857' : '#B91C1C' }}>
              {result.correct ? 'Correct' : 'Not quite'}
            </p>
            {!result.correct && result.correction && (
              <p style={{ fontSize: 13, color: '#7F1D1D', marginTop: 6, lineHeight: 1.5 }}>{result.correction}</p>
            )}
            {(result.why || item.whyCorrect) && (
              <p style={{ fontSize: 13, color: '#374151', marginTop: 6, lineHeight: 1.5 }}>
                <span style={{ fontWeight: 600 }}>Why: </span>{result.why || item.whyCorrect}
              </p>
            )}
            {!result.correct && mastery && (
              <p style={{ fontSize: 12, color: '#9AA3AF', marginTop: 8 }}>This item returns to the queue.</p>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        {!immediate && pendingResult && !result && (
          <button type="button" onClick={revealEndOnly} className="px-4 py-2 rounded-full text-white" style={{ background: '#0B0F1A', fontSize: 13, fontWeight: 600 }}>
            Check answer
          </button>
        )}
        {result && (
          <button type="button" onClick={advance} className="px-4 py-2 rounded-full text-white ml-auto" style={{ background: '#0B0F1A', fontSize: 13, fontWeight: 600 }}>
            {queue.length <= 1 && (result.correct || !mastery) && tierIndex >= blueprint.tiers.length - 1
              ? 'Finish'
              : 'Next'}
          </button>
        )}
      </div>
    </div>
  );
}

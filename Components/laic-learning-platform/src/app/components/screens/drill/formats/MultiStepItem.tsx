import React, { useEffect, useState } from 'react';
import { evaluateInteractive } from '../../../../../lib/drillRuntime';
import type { DrillInteractivePayload, DrillItem, DrillItemResult } from '../../../../../lib/types';
import type { DrillFormatProps } from './shared';
import { ChoiceItem } from './ChoiceItem';
import { ComputeItem } from './ComputeItem';

type MultiPayload = Extract<DrillInteractivePayload, { kind: 'multi_step' }>;

export function MultiStepItem({ item, interactive, feedbackTiming, disabled, onResult, lockedResult }: DrillFormatProps) {
  const payload = interactive as MultiPayload;
  const locked = disabled || !!lockedResult;
  const [stepIndex, setStepIndex] = useState(0);
  const [stepLock, setStepLock] = useState<DrillItemResult | null>(null);

  useEffect(() => {
    setStepIndex(0);
    setStepLock(null);
  }, [item.id]);

  const step = payload.steps[stepIndex];
  if (!step) return null;

  const nestedItem: DrillItem = {
    id: `${item.id}:${step.id}`,
    prompt: step.prompt,
    answer: step.interaction.kind === 'compute'
      ? step.interaction.expected
      : (step.interaction.choices.find((c) => c.correct)?.text || ''),
    whyCorrect: step.whyCorrect || item.whyCorrect,
    corrections: step.corrections || item.corrections,
    interactive: step.interaction,
  };

  const onStepResult = (result: DrillItemResult) => {
    if (locked) return;
    if (!result.correct) {
      setStepLock(result);
      window.setTimeout(() => setStepLock(null), 900);
      return;
    }
    setStepLock(result);
    if (stepIndex >= payload.steps.length - 1) {
      onResult(evaluateInteractive(item, payload, true));
      return;
    }
    window.setTimeout(() => {
      setStepIndex((i) => i + 1);
      setStepLock(null);
    }, 500);
  };

  return (
    <div className="space-y-3">
      <p style={{ fontSize: 12, fontWeight: 700, color: '#6B7280' }}>
        Step {stepIndex + 1} of {payload.steps.length}
      </p>
      <p style={{ fontSize: 14, fontWeight: 650, color: '#0B1220' }}>{step.prompt}</p>
      {step.interaction.kind === 'compute' ? (
        <ComputeItem
          item={nestedItem}
          interactive={step.interaction}
          feedbackTiming={feedbackTiming}
          disabled={locked || (!!stepLock && stepLock.correct)}
          onResult={onStepResult}
          lockedResult={stepLock}
        />
      ) : (
        <ChoiceItem
          item={nestedItem}
          interactive={step.interaction}
          feedbackTiming={feedbackTiming}
          disabled={locked || (!!stepLock && stepLock.correct)}
          onResult={onStepResult}
          lockedResult={stepLock}
        />
      )}
      {stepLock && !stepLock.correct && (
        <p style={{ fontSize: 13, color: '#B91C1C' }}>{stepLock.correction || 'Not quite — try again.'}</p>
      )}
    </div>
  );
}

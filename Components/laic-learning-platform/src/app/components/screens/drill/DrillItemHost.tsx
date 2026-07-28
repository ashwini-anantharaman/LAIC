import React from 'react';
import type { DrillFeedbackTiming, DrillItem, DrillItemResult, DrillInteractivePayload } from '../../../../lib/types';
import { CategorizeItem } from './formats/CategorizeItem';
import { ChoiceItem } from './formats/ChoiceItem';
import { ComputeItem } from './formats/ComputeItem';
import { LabelPlaceItem } from './formats/LabelPlaceItem';
import { MatchItem } from './formats/MatchItem';
import { MultiStepItem } from './formats/MultiStepItem';
import { OrderItem } from './formats/OrderItem';

export function DrillItemHost({
  item,
  interactive,
  feedbackTiming,
  disabled,
  onResult,
  lockedResult,
  fallbackNote,
}: {
  item: DrillItem;
  interactive: DrillInteractivePayload;
  feedbackTiming: DrillFeedbackTiming;
  disabled?: boolean;
  onResult: (result: DrillItemResult) => void;
  lockedResult?: DrillItemResult | null;
  fallbackNote?: string;
}) {
  const props = { item, interactive, feedbackTiming, disabled, onResult, lockedResult };

  return (
    <div className="space-y-3">
      {fallbackNote && (
        <p
          className="rounded-xl px-3 py-2"
          style={{ fontSize: 12, color: '#92400E', background: '#FEF3C7', border: '1px solid #FCD34D' }}
        >
          {fallbackNote}
        </p>
      )}
      {interactive.kind === 'compute' && <ComputeItem {...props} />}
      {interactive.kind === 'choice' && <ChoiceItem {...props} />}
      {interactive.kind === 'order' && <OrderItem {...props} />}
      {interactive.kind === 'categorize' && <CategorizeItem {...props} />}
      {interactive.kind === 'match' && <MatchItem {...props} />}
      {interactive.kind === 'label_place' && <LabelPlaceItem {...props} />}
      {interactive.kind === 'multi_step' && <MultiStepItem {...props} />}
    </div>
  );
}

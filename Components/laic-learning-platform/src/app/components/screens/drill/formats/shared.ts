import React from 'react';
import type { DrillFeedbackTiming, DrillItem, DrillItemResult, DrillInteractivePayload } from '../../../../lib/types';

export interface DrillFormatProps {
  item: DrillItem;
  interactive: DrillInteractivePayload;
  feedbackTiming: DrillFeedbackTiming;
  disabled?: boolean;
  onResult: (result: DrillItemResult) => void;
  /** When parent already graded (Immediate), formats can lock visuals. */
  lockedResult?: DrillItemResult | null;
}

export const chip: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, border: '1px solid rgba(0,0,0,0.12)',
  background: '#fff', borderRadius: 12, padding: '8px 12px', cursor: 'grab',
};

export const dropZone: React.CSSProperties = {
  minHeight: 48, borderRadius: 12, border: '1.5px dashed rgba(0,0,0,0.18)',
  background: 'rgba(0,0,0,0.02)', padding: 8,
};

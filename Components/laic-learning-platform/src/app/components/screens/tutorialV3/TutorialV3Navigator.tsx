/**
 * Tutorial V3 section navigator — outline + status + enter section / generate slot.
 */
import React from 'react';
import { Check, PenLine, Sparkles, ChevronRight, Eye, Database, Trash2 } from 'lucide-react';
import type { TutorialV3Draft, V3Section, V3TopLevelSlot } from '../../../../lib/tutorialV3/types';
import {
  allRequiredDone,
  deriveSectionStatus,
  doneCount,
  requiredSectionsRemaining,
} from '../../../../lib/tutorialV3/draftModel';
import { embedTypeLabel } from '../../../../lib/tutorialV3/recipeStructure';

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  not_started: { bg: '#F3F4F6', text: '#6B7280', label: 'Not started' },
  in_progress: { bg: '#FEF3C7', text: '#92400E', label: 'In progress' },
  done: { bg: '#D1FAE5', text: '#065F46', label: 'Done' },
};

const MODE_HINT: Record<string, string> = {
  empty: '',
  written: 'written',
  generated: 'generated',
  mixed: 'mixed',
};

export function TutorialV3Navigator({
  draft,
  showSources = false,
  writeYourself = false,
  onOpenSection,
  onOpenSlot,
  onDeleteSection,
  onReview,
  onBackToSources,
  onBackToStructure,
  onBackToPlan,
}: {
  draft: TutorialV3Draft;
  /** Template path only — Sources is a real pipeline step when the recipe needs it. */
  showSources?: boolean;
  writeYourself?: boolean;
  onOpenSection: (sectionId: string) => void;
  onOpenSlot: (slotId: string) => void;
  /** Author can remove any section from the outline. */
  onDeleteSection?: (sectionId: string) => void;
  onReview: () => void;
  onBackToSources: () => void;
  onBackToStructure: () => void;
  onBackToPlan?: () => void;
}) {
  const { done, total } = doneCount(draft.sections);
  const remaining = requiredSectionsRemaining(draft.sections);
  const slots = draft.topLevelSlots || [];
  const canReview = allRequiredDone(draft.sections, slots)
    && (total > 0 || slots.some((s) => s.done || (s.parts || []).length > 0 || !!s.part));
  const hasLibrarySlots = slots.some((s) => s.kind === 'library');
  const hasGenerateSlots = slots.some((s) => s.kind === 'generate');
  const pendingGenerate = slots.filter((s) => s.kind === 'generate' && !s.done).length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#9AA3AF', letterSpacing: '.04em', textTransform: 'uppercase' }}>
            {total > 0 ? 'Sections' : 'Tutorial'}
          </p>
          <h2 style={{ fontSize: 20, fontWeight: 750, color: '#0B1220', letterSpacing: '-0.3px', marginTop: 2 }}>
            {draft.title || 'Untitled tutorial'}
          </h2>
          <p style={{ fontSize: 13.5, color: '#6B7280', marginTop: 4 }}>
            {writeYourself
              ? (total > 0
                ? `${done} of ${total} sections done${remaining > 0 ? ` · ${remaining} remaining` : ' · ready to review'} — write text, images, and videos in each section`
                : 'Open each section and write it by hand')
              : total > 0
                ? `${done} of ${total} sections done${remaining > 0 ? ` · ${remaining} required remaining` : ' · ready to review'}`
                : pendingGenerate > 0
                  ? `${pendingGenerate} content item${pendingGenerate === 1 ? '' : 's'} still open — write or generate each below`
                  : canReview
                    ? 'All recipe content ready — Review & submit for Edit + Student preview'
                    : hasLibrarySlots
                      ? 'Library content selected — review when ready'
                      : 'Open each item to write it yourself, or use AI generate if you want'}
          </p>
        </div>
        <button
          type="button"
          disabled={!canReview}
          onClick={onReview}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-white disabled:opacity-40"
          style={{ fontSize: 13, fontWeight: 600, background: '#0B0F1A' }}
        >
          <Eye size={14} />
          Review & submit
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {onBackToPlan && (
          <button
            type="button"
            onClick={onBackToPlan}
            className="px-3 py-1.5 rounded-full border"
            style={{ fontSize: 12, fontWeight: 600, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: '#fff' }}
          >
            ← Plan
          </button>
        )}
        <button
          type="button"
          onClick={onBackToStructure}
          className="px-3 py-1.5 rounded-full border"
          style={{ fontSize: 12, fontWeight: 600, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: '#fff' }}
        >
          ← Structure
        </button>
        {showSources && (
          <button
            type="button"
            onClick={onBackToSources}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border"
            style={{ fontSize: 12, fontWeight: 600, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: '#fff' }}
          >
            <Database size={12} /> ← Sources
          </button>
        )}
      </div>

      {(hasLibrarySlots || hasGenerateSlots) && (
        <div className="space-y-2 mb-4">
          <p style={{ fontSize: 12, fontWeight: 650, color: '#9AA3AF', letterSpacing: '.04em', textTransform: 'uppercase' }}>
            Recipe content
          </p>
          {slots.map((slot) => (
            <SlotRow
              key={slot.id}
              slot={slot}
              onOpen={slot.kind === 'generate' ? () => onOpenSlot(slot.id) : undefined}
            />
          ))}
        </div>
      )}

      <div className="space-y-2">
        {draft.sections.map((sec, i) => (
          <SectionRow
            key={sec.id}
            index={i}
            sec={sec}
            onOpen={() => onOpenSection(sec.id)}
            onDelete={onDeleteSection ? () => onDeleteSection(sec.id) : undefined}
          />
        ))}
        {!draft.sections.length && !slots.length && (
          <p style={{ fontSize: 13.5, color: '#9AA3AF' }}>
            No sections yet — go back to Structure and save a skeleton.
          </p>
        )}
        {!draft.sections.length && slots.length > 0 && (
          <p style={{ fontSize: 13.5, color: '#6B7280' }}>
            No sections in this template — open each content item above to write it yourself, or generate with AI.
          </p>
        )}
      </div>
    </div>
  );
}

function SlotRow({
  slot,
  onOpen,
}: {
  slot: V3TopLevelSlot;
  onOpen?: () => void;
}) {
  const label = slot.kind === 'library'
    ? (slot.libraryTitle || embedTypeLabel(String(slot.objectType)))
    : embedTypeLabel(String(slot.objectType));
  const status = slot.done
    ? 'Ready'
    : slot.kind === 'generate'
      ? 'Not authored'
      : 'Not picked';
  const clickable = !!onOpen;

  const inner = (
    <>
      <span
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
        style={{
          background: slot.done ? '#D1FAE5' : slot.kind === 'generate' ? '#E0E7FF' : '#F3F4F6',
          color: slot.done ? '#065F46' : slot.kind === 'generate' ? '#3730A3' : '#6B7280',
        }}
      >
        {slot.done ? <Check size={14} /> : slot.kind === 'generate' ? <PenLine size={14} /> : <Sparkles size={14} />}
      </span>
      <div className="min-w-0 flex-1">
        <span style={{ fontSize: 14.5, fontWeight: 650, color: '#0B1220' }}>{label}</span>
        {slot.kind === 'generate' && !slot.done && (
          <p style={{ fontSize: 12.5, color: '#6B7280', marginTop: 2 }}>
            Write yourself or generate with AI
          </p>
        )}
      </div>
      <span
        className="px-2 py-0.5 rounded-full shrink-0"
        style={{
          fontSize: 11,
          fontWeight: 600,
          background: slot.done ? '#D1FAE5' : '#FEF3C7',
          color: slot.done ? '#065F46' : '#92400E',
        }}
      >
        {status}
      </span>
      {clickable && <ChevronRight size={16} style={{ color: '#9AA3AF' }} className="shrink-0" />}
    </>
  );

  if (clickable) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-left transition-colors hover:bg-white"
        style={{
          background: slot.done ? 'rgba(5,150,105,0.06)' : 'rgba(255,255,255,0.72)',
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 4px 16px -8px rgba(30,50,80,0.12)',
        }}
      >
        {inner}
      </button>
    );
  }

  return (
    <div
      className="flex items-center gap-3 px-4 py-3.5 rounded-2xl"
      style={{
        background: slot.done ? 'rgba(5,150,105,0.06)' : 'rgba(249,250,251,0.95)',
        border: '1px solid rgba(0,0,0,0.06)',
      }}
    >
      {inner}
    </div>
  );
}

function SectionRow({
  index,
  sec,
  onOpen,
  onDelete,
}: {
  index: number;
  sec: V3Section;
  onOpen: () => void;
  onDelete?: () => void;
}) {
  const status = deriveSectionStatus(sec);
  const style = STATUS_STYLE[status];
  const mode = MODE_HINT[sec.authorMode] || '';

  return (
    <div
      className="flex items-stretch gap-1 rounded-2xl"
      style={{
        background: 'rgba(255,255,255,0.72)',
        border: '1px solid rgba(0,0,0,0.06)',
        boxShadow: '0 4px 16px -8px rgba(30,50,80,0.12)',
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 flex items-center gap-3 px-4 py-3.5 rounded-2xl text-left transition-colors hover:bg-white"
      >
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
          style={{ background: status === 'done' ? '#D1FAE5' : '#EEF2FF', color: status === 'done' ? '#065F46' : '#4338CA', fontSize: 13, fontWeight: 700 }}
        >
          {status === 'done' ? <Check size={14} /> : index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ fontSize: 14.5, fontWeight: 650, color: '#0B1220' }}>{sec.title || `Section ${index + 1}`}</span>
            {!sec.required && (
              <span style={{ fontSize: 11, color: '#9AA3AF' }}>optional</span>
            )}
          </div>
          {sec.intent ? (
            <p style={{ fontSize: 12.5, color: '#6B7280', marginTop: 2 }} className="truncate">{sec.intent}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {mode ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ fontSize: 11, color: '#6B7280', background: '#F3F4F6' }}>
              {mode === 'generated' ? <Sparkles size={10} /> : <PenLine size={10} />}
              {mode}
            </span>
          ) : null}
          <span className="px-2 py-0.5 rounded-full" style={{ fontSize: 11, fontWeight: 600, background: style.bg, color: style.text }}>
            {style.label}
          </span>
          <ChevronRight size={16} style={{ color: '#9AA3AF' }} />
        </div>
      </button>
      {onDelete ? (
        <button
          type="button"
          onClick={onDelete}
          className="shrink-0 px-3 rounded-r-2xl hover:bg-red-50 transition-colors"
          style={{ color: '#EF4444' }}
          title={`Delete ${sec.title || `Section ${index + 1}`}`}
          aria-label={`Delete ${sec.title || `Section ${index + 1}`}`}
        >
          <Trash2 size={15} />
        </button>
      ) : null}
    </div>
  );
}

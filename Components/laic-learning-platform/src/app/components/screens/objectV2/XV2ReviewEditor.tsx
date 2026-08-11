/**
 * Review — course-dev edit + student preview for structured objects,
 * with the Refine-with-AI sidebar (Hoot · Sources · Add) alongside.
 */
import React, { useMemo, useState } from 'react';
import { ArrowLeft, Eye, PenLine, Send } from 'lucide-react';
import { LearningBlocksPreview } from '../LearnerReader';
import { VideoScriptPlayer } from '../VideoScriptPlayer';
import {
  X_SLOT_NOUN,
  findSlot,
  unitsToBlocks,
  updateSlot as updateDraftSlot,
  updateUnit,
  type StructuredV2Draft,
} from '../../../../lib/objectV2/structuredDraft';
import { SlotEditor } from './XV2UnitWorkspace';
import { XV2RefineSidebar } from './XV2RefineSidebar';
import type { LearningObject, Version, VideoScriptContent } from '../../../../lib/types';
import { SubmitVersionMenu, type SubmitTarget } from '../SubmitVersionMenu';

export function XV2ReviewEditor({
  draft,
  onChangeDraft,
  onBack,
  onSave,
  onSubmit,
  canSubmit,
  submitVersions = [],
  rail,
}: {
  draft: StructuredV2Draft;
  onChangeDraft: (next: StructuredV2Draft) => void;
  onBack: () => void;
  onSave: () => void;
  onSubmit: (target: SubmitTarget) => void;
  canSubmit: boolean;
  /** Existing versions of this object, so the author can overwrite one. */
  submitVersions?: Version[];
  rail?: React.ReactNode;
}) {
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [refineOpen, setRefineOpen] = useState(false);

  const blocks = useMemo(() => unitsToBlocks(draft), [draft]);
  const slotNoun = X_SLOT_NOUN[draft.type];

  const previewObject = useMemo(() => ({
    id: draft.id,
    type: draft.type,
    title: draft.title || 'Preview',
    blocks,
  } as unknown as LearningObject), [draft, blocks]);

  return (
    <div className="min-h-full flex" style={{ background: 'linear-gradient(180deg, #F4F6FB 0%, #EEF1F8 100%)' }}>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="px-5 pt-5 pb-3 shrink-0">
          <div className="flex items-center justify-between gap-3 mb-3">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-white/70"
              style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}
            >
              <ArrowLeft size={14} /> Back to outline
            </button>
            <div className="flex items-center gap-2">
              <div className="flex rounded-full border overflow-hidden" style={{ borderColor: 'rgba(0,0,0,0.1)' }}>
                {(['edit', 'preview'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5"
                    style={{
                      fontSize: 12.5,
                      fontWeight: 650,
                      background: mode === m ? '#0B0F1A' : '#fff',
                      color: mode === m ? '#fff' : '#374151',
                    }}
                  >
                    {m === 'edit' ? <PenLine size={12} /> : <Eye size={12} />}
                    {m === 'edit' ? 'Edit' : 'Student preview'}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={onSave}
                className="px-3.5 py-1.5 rounded-full border"
                style={{ fontSize: 12.5, fontWeight: 650, color: '#065F46', background: 'rgba(5,150,105,0.1)', borderColor: 'rgba(5,150,105,0.35)' }}
              >
                Save draft
              </button>
              <SubmitVersionMenu
                versions={submitVersions}
                canSubmit={blocks.length > 0}
                onSubmit={onSubmit}
                disabledTitle={canSubmit ? 'Submit for review' : 'Some required parts are still empty'}
              />
            </div>
          </div>
          {rail}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-24">
          {mode === 'preview' ? (
            <div className="max-w-3xl mx-auto rounded-2xl border p-4" style={{ background: '#fff', borderColor: 'rgba(0,0,0,0.08)' }}>
              {draft.type === 'video-script' ? (
                <VideoScriptPlayer
                  content={(blocks[0]?.content || {}) as VideoScriptContent}
                  object={previewObject}
                />
              ) : (
                <LearningBlocksPreview blocks={blocks as any} objectId={draft.id} paginate />
              )}
            </div>
          ) : (
            <div className="max-w-3xl mx-auto">
              <input
                value={draft.title}
                onChange={(e) => onChangeDraft({ ...draft, title: e.target.value })}
                placeholder={`Untitled ${draft.type.replace(/-/g, ' ')}`}
                className="w-full rounded-2xl px-4 py-3 mb-2"
                style={{ fontSize: 17, fontWeight: 700, color: '#0B1220', border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.9)', outline: 'none' }}
              />
              {draft.metadata.objective ? (
                <p className="mb-4" style={{ fontSize: 12.5, color: '#6B7280' }}>{draft.metadata.objective}</p>
              ) : <div className="mb-4" />}

              {draft.units.map((unit) => (
                <div key={unit.id} className="mb-5">
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      value={unit.title}
                      onChange={(e) => onChangeDraft(updateUnit(draft, unit.id, { title: e.target.value }))}
                      className="rounded-lg px-2.5 py-1"
                      style={{ fontSize: 13, fontWeight: 700, color: '#0B1220', border: '1px solid transparent', background: 'transparent', outline: 'none' }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.12)'; e.currentTarget.style.background = '#fff'; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent'; }}
                    />
                    <span style={{ fontSize: 11.5, color: '#9AA3AF' }}>
                      {unit.slots.length} {slotNoun}{unit.slots.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {unit.slots.map((slot, si) => (
                      <div
                        key={slot.id}
                        onClick={() => setSelectedSlotId(slot.id)}
                        style={{
                          borderRadius: 18,
                          outline: selectedSlotId === slot.id ? '2px solid #7C3AED' : 'none',
                          outlineOffset: 2,
                        }}
                      >
                        <SlotEditor
                          slot={slot}
                          index={si}
                          type={draft.type}
                          onChange={(patch) => {
                            const found = findSlot(draft, slot.id);
                            if (found) onChangeDraft(updateDraftSlot(draft, found.unit.id, slot.id, patch));
                          }}
                          onRemove={unit.slots.length > 1 ? () => {
                            onChangeDraft(updateUnit(draft, unit.id, {
                              slots: unit.slots.filter((s) => s.id !== slot.id),
                            }));
                            if (selectedSlotId === slot.id) setSelectedSlotId(null);
                          } : undefined}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {mode === 'edit' && (
        <XV2RefineSidebar
          open={refineOpen}
          onOpenChange={setRefineOpen}
          draft={draft}
          onChangeDraft={onChangeDraft}
          selectedSlotId={selectedSlotId}
          onSelectSlot={(id) => { setSelectedSlotId(id); if (id) setRefineOpen(true); }}
        />
      )}
    </div>
  );
}

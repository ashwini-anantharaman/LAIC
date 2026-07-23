import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Eye, Pencil, Check, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../../App';
import { VideoScriptPlayer, emptyCheckpoint, patchCheckpointQuestion } from './VideoScriptPlayer';
import type { CreatorPipelineDraft, LearningObject, VideoScriptContent, VideoScriptCheckpoint } from '../../../lib/types';

type Mode = 'edit' | 'preview';

function fmtClock(s: number): string {
  const n = Math.max(0, Math.floor(s));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}

export function VideoScriptEditor({
  typeId, title, scope, fv, content: initial,
  initialId, initialStatus, pipelineDraft, onBack, onDone,
}: {
  typeId: string;
  title: string;
  scope?: string;
  fv: Record<string, any>;
  content: VideoScriptContent | null;
  initialId?: string;
  initialStatus?: string;
  pipelineDraft?: CreatorPipelineDraft;
  onBack: () => void;
  onDone: () => void;
}) {
  const { addObject } = useApp();
  const [docTitle, setDocTitle] = useState(title || initial?.title || 'Video script');
  const [mode, setMode] = useState<Mode>('edit');
  const [savedNote, setSavedNote] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [objectStatus, setObjectStatus] = useState(initialStatus || 'draft');
  const [content, setContent] = useState<VideoScriptContent>(() => initial || {
    provider: 'youtube',
    videoUrl: '',
    videoId: '',
    transcript: [],
    checkpoints: [],
    showTranscript: fv?.showTranscript !== false,
    enableChat: fv?.enableChat !== false,
    requireAnswer: true,
  });
  const savedId = useRef<string | null>(initialId || null);

  useEffect(() => {
    if (initial) setContent(initial);
  }, [initial]);
  useEffect(() => { if (initialId) savedId.current = initialId; }, [initialId]);
  useEffect(() => { if (initialStatus) setObjectStatus(initialStatus); }, [initialStatus]);

  const updateCp = (id: string, patch: Parameters<typeof patchCheckpointQuestion>[1]) => {
    setContent((prev) => ({
      ...prev,
      checkpoints: prev.checkpoints.map((c) => (c.id === id ? patchCheckpointQuestion(c, patch) : c)),
    }));
  };

  const removeCp = (id: string) => {
    setContent((prev) => ({ ...prev, checkpoints: prev.checkpoints.filter((c) => c.id !== id) }));
  };

  const addCp = () => {
    const last = content.checkpoints[content.checkpoints.length - 1];
    const t = last ? last.time + 20 : 30;
    setContent((prev) => ({ ...prev, checkpoints: [...prev.checkpoints, emptyCheckpoint(t)] }));
  };

  const previewObject: LearningObject = {
    id: savedId.current || 'preview-video-script',
    type: 'video-script',
    title: docTitle,
    ownerId: '',
    ownerName: '',
    status: 'draft',
    scope: (scope as any) || 'bridge',
    reuseCount: 0,
    description: '',
    estimatedTime: `${Math.max(5, content.checkpoints.length * 2)} min`,
    blocks: [{ id: 'b1', type: 'video-script', content }],
    createdAt: '',
    updatedAt: '',
    tags: [],
    sourceIds: [],
  };

  const save = (status: 'draft' | 'in-review') => {
    const block = { id: `blk-${Date.now()}`, type: 'video-script' as const, content };
    const keepStatus = objectStatus === 'in-review' && status === 'draft' ? 'in-review' : status;
    const id = addObject({
      id: savedId.current || undefined,
      type: typeId as any,
      title: (docTitle || 'Video script').trim(),
      status: keepStatus,
      description: (fv?.obj as string)?.trim()
        || `Interactive video with ${content.checkpoints.length} checkpoint${content.checkpoints.length !== 1 ? 's' : ''}.`,
      estimatedTime: `${Math.max(5, Math.round((content.checkpoints.length || 1) * 2))} min`,
      blocks: [block] as any,
      tags: [
        fv?.aud, fv?.lvl,
        `${content.checkpoints.length} checkpoints`,
        content.showTranscript !== false ? 'transcript' : '',
        content.enableChat !== false ? 'chat' : '',
      ].filter(Boolean) as string[],
      sourceIds: [],
      pipelineDraft: pipelineDraft || undefined,
      scope: scope as any,
    });
    savedId.current = id;
    setObjectStatus(keepStatus);
    return id;
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center p-10 text-center min-h-[50vh]">
        <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ background: '#FEF3C7' }}>
          <Check size={24} style={{ color: '#D97706' }} />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0B1220', marginBottom: 6 }}>Submitted for review</h2>
        <p style={{ fontSize: 13.5, color: '#6B7280', maxWidth: 380, marginBottom: 14 }}>
          "{docTitle}" has been submitted. A reviewer will provide feedback before it can be published.
        </p>
        <button onClick={onDone} className="px-6 py-2.5 rounded-full text-white" style={{ background: '#0B0F1A', fontSize: 13, fontWeight: 600 }}>
          ✓ Done — go to library
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="sticky top-0 z-20 flex items-center gap-3 px-5 py-3 border-b border-white/40" style={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(12px)' }}>
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium" style={{ color: '#6B7280' }}>
          <ChevronLeft size={15} />Back to pipeline
        </button>
        <input value={docTitle} onChange={(e) => setDocTitle(e.target.value)}
          className="flex-1 bg-transparent outline-none" style={{ fontSize: 15, fontWeight: 700, color: '#0B1220' }} />
        <div className="flex rounded-full border p-0.5" style={{ borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)' }}>
          <button onClick={() => setMode('edit')} className="flex items-center gap-1 px-3 py-1.5 rounded-full"
            style={{ fontSize: 12, fontWeight: 600, background: mode === 'edit' ? '#0B0F1A' : 'transparent', color: mode === 'edit' ? '#fff' : '#6B7280' }}>
            <Pencil size={12} />Edit
          </button>
          <button onClick={() => setMode('preview')} className="flex items-center gap-1 px-3 py-1.5 rounded-full"
            style={{ fontSize: 12, fontWeight: 600, background: mode === 'preview' ? '#0B0F1A' : 'transparent', color: mode === 'preview' ? '#fff' : '#6B7280' }}>
            <Eye size={12} />Student preview
          </button>
        </div>
        <span style={{ fontSize: 11.5, color: savedNote ? '#059669' : '#9AA3AF' }}>
          {savedNote ? '✓ Saved' : `${content.checkpoints.length} checkpoints`}
        </span>
        <button onClick={() => { save('draft'); setSavedNote(true); setTimeout(() => onDone(), 650); }}
          className="px-4 py-2 rounded-full border" style={{ fontSize: 12.5, color: '#374151', borderColor: 'rgba(0,0,0,0.1)' }}>
          Save draft
        </button>
        <button onClick={() => { save('in-review'); setSubmitted(true); }}
          className="px-4 py-2 rounded-full text-white" style={{ background: '#0B0F1A', fontSize: 12.5, fontWeight: 600 }}>
          Submit for review
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-6 w-full" style={{ maxWidth: mode === 'preview' ? 1100 : 720, margin: '0 auto' }}>
        {mode === 'preview' ? (
          <>
            <p style={{ fontSize: 12.5, color: '#6B7280', marginBottom: 14 }}>
              Student preview · video pauses at each checkpoint until answered
              {content.showTranscript !== false ? ' · transcript on' : ''}
              {content.enableChat !== false ? ' · chat on' : ''}
            </p>
            <VideoScriptPlayer content={content} object={previewObject} />
          </>
        ) : (
          <>
            <p style={{ fontSize: 12.5, color: '#6B7280', marginBottom: 14, lineHeight: 1.5 }}>
              Edit checkpoint times and questions. Toggle learner features, then open <strong>Student preview</strong> to try the Edpuzzle-style player.
            </p>

            <div className="rounded-2xl border p-4 mb-4 space-y-3" style={{ background: 'rgba(255,255,255,0.88)', borderColor: 'rgba(0,0,0,0.08)' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', letterSpacing: '.04em' }}>VIDEO</p>
              <input
                value={content.videoUrl}
                onChange={(e) => setContent((p) => ({ ...p, videoUrl: e.target.value }))}
                placeholder="YouTube URL"
                className="w-full rounded-xl px-3 py-2"
                style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', outline: 'none' }}
              />
              <div className="flex flex-wrap gap-4">
                {[
                  { key: 'showTranscript', label: 'Transcript available to learners' },
                  { key: 'enableChat', label: 'AI chatbot available to learners' },
                  { key: 'requireAnswer', label: 'Must answer before continuing' },
                ].map((f) => (
                  <label key={f.key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(content as any)[f.key] !== false}
                      onChange={(e) => setContent((p) => ({ ...p, [f.key]: e.target.checked }))}
                    />
                    <span style={{ fontSize: 13, color: '#374151' }}>{f.label}</span>
                  </label>
                ))}
              </div>
              <p style={{ fontSize: 12, color: '#9AA3AF' }}>
                {(content.transcript || []).length} transcript segments loaded
              </p>
            </div>

            <div className="flex items-center justify-between mb-2">
              <p style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', letterSpacing: '.04em' }}>
                CHECKPOINTS ({content.checkpoints.length})
              </p>
              <button type="button" onClick={addCp} className="flex items-center gap-1 px-3 py-1.5 rounded-full border"
                style={{ fontSize: 12, color: '#374151', borderColor: 'rgba(0,0,0,0.1)' }}>
                <Plus size={12} />Add checkpoint
              </button>
            </div>

            <div className="space-y-3">
              {content.checkpoints.map((cp: VideoScriptCheckpoint, i: number) => (
                <div key={cp.id} className="rounded-2xl border p-4" style={{ background: 'rgba(255,255,255,0.9)', borderColor: 'rgba(0,0,0,0.08)' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="px-2 py-0.5 rounded text-xs font-bold" style={{ background: '#FEF3C7', color: '#92400E' }}>Q{i + 1}</span>
                    <label className="flex items-center gap-1.5" style={{ fontSize: 12.5, color: '#6B7280' }}>
                      Pause at
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={Math.round(cp.time)}
                        onChange={(e) => updateCp(cp.id, { time: Number(e.target.value) || 0 })}
                        className="w-16 rounded-lg px-2 py-1"
                        style={{ border: '1px solid rgba(0,0,0,0.1)', fontSize: 12.5 }}
                      />
                      s <span style={{ color: '#9AA3AF' }}>({fmtClock(cp.time)})</span>
                    </label>
                    <button type="button" onClick={() => removeCp(cp.id)} className="ml-auto p-1.5 rounded-lg"
                      style={{ color: '#B91C1C' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <textarea
                    value={cp.question.question}
                    onChange={(e) => updateCp(cp.id, { question: e.target.value })}
                    rows={2}
                    placeholder="Question stem"
                    className="w-full rounded-xl px-3 py-2 mb-2 resize-y"
                    style={{ fontSize: 13.5, border: '1px solid rgba(0,0,0,0.1)', outline: 'none' }}
                  />
                  <div className="space-y-1.5">
                    {(cp.question.options || []).map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <button
                          type="button"
                          title="Mark correct"
                          onClick={() => updateCp(cp.id, { correct: oi })}
                          className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                          style={{
                            background: cp.question.correct === oi ? '#059669' : 'rgba(0,0,0,0.06)',
                            color: cp.question.correct === oi ? '#fff' : '#6B7280',
                            fontSize: 11, fontWeight: 700,
                          }}
                        >
                          {cp.question.correct === oi ? <Check size={12} /> : String.fromCharCode(65 + oi)}
                        </button>
                        <input
                          value={opt}
                          onChange={(e) => {
                            const options = [...(cp.question.options || [])];
                            options[oi] = e.target.value;
                            updateCp(cp.id, { options });
                          }}
                          className="flex-1 rounded-xl px-3 py-1.5"
                          style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', outline: 'none' }}
                          placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                        />
                      </div>
                    ))}
                  </div>
                  <input
                    value={cp.question.explanation || ''}
                    onChange={(e) => updateCp(cp.id, { explanation: e.target.value })}
                    placeholder="Explanation (optional)"
                    className="w-full rounded-xl px-3 py-1.5 mt-2"
                    style={{ fontSize: 12.5, border: '1px solid rgba(0,0,0,0.08)', outline: 'none', color: '#6B7280' }}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

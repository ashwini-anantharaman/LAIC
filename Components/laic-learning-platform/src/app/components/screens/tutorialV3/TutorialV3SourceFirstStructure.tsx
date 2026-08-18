/**
 * The Structure step on the source-first path.
 *
 * Nowhere else in V3 does the author not design the structure, so this screen
 * has one job: show what the model proposed and let it be judged before it
 * becomes the tutorial. Sections can be dropped and exercises removed; nothing
 * is applied until Use this structure.
 *
 * Rejecting the whole thing is a first-class option — Propose again re-asks,
 * because a proposal you cannot refuse is not a proposal.
 */

import React, { useRef, useState } from 'react';
import { AlertTriangle, Loader2, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import { errorMessage, proposeTutorialStructure, type ProposedStructure } from '../../../../lib/api';
import { sentencesFromPool } from '../../../../lib/tutorialV3/sourceFirst';
import { embedTypeLabel } from '../../../../lib/tutorialV3/recipeStructure';
import type { TutorialV3Draft } from '../../../../lib/tutorialV3/types';
import { V3_SAGE, V3_SAGE_BORDER, V3_SAGE_TINT } from '../../../../lib/tutorialV3/authorTheme';

export function TutorialV3SourceFirstStructure({
  draft,
  pickedSourceIds,
  onApply,
  onBackToSources,
}: {
  draft: TutorialV3Draft;
  pickedSourceIds: string[];
  onApply: (proposal: ProposedStructure) => void;
  onBackToSources: () => void;
}) {
  const pool = draft.sourcePool || [];
  const [proposal, setProposal] = useState<ProposedStructure | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sentences = sentencesFromPool(pool, pickedSourceIds);

  const propose = async () => {
    setError(null);
    if (!sentences.length) {
      setError('The picked sources have no readable text yet.');
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    setProposal(null);
    setProgress('Starting…');
    try {
      let got: ProposedStructure | null = null;
      for await (const ev of proposeTutorialStructure({
        title: draft.title,
        objective: String(draft.metadata.objective || ''),
        config: { secs: draft.structure?.sectionsCount || 6 },
        sentences,
      }, ctrl.signal)) {
        if (ev.type === 'progress') setProgress(ev.message);
        else if (ev.type === 'result') got = ev.content;
        else if (ev.type === 'error') throw new Error(ev.message);
        else if (ev.type === 'done') break;
      }
      if (!got) throw new Error('No structure came back.');
      setProposal(got);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError(errorMessage(e, 'Could not propose a structure.'));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const dropSection = (i: number) => setProposal((p) => (p
    ? { ...p, sections: p.sections.filter((_s, j) => j !== i) }
    : p));

  const dropObject = (sectionIdx: number, objectType: string) => setProposal((p) => (p
    ? {
      ...p,
      sections: p.sections.map((s, j) => (j === sectionIdx
        ? { ...s, objects: s.objects.filter((o) => o !== objectType) }
        : s)),
    }
    : p));

  return (
    <div className="max-w-4xl mx-auto">
      <div
        className="rounded-2xl px-4 py-3 mb-5"
        style={{ background: V3_SAGE_TINT, border: `1px solid ${V3_SAGE_BORDER}` }}
      >
        <p style={{ fontSize: 13.5, fontWeight: 700, color: '#2f4e39' }}>
          The model decides the shape here
        </p>
        <p style={{ fontSize: 12.5, color: '#44403c', marginTop: 3, lineHeight: 1.5 }}>
          It reads {sentences.length} sentence{sentences.length === 1 ? '' : 's'} from your sources and
          proposes the sections, the prose each needs and the exercises the material can actually
          support. Nothing is applied until you accept it.
        </p>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 px-3 py-2.5 rounded-xl" style={{ background: '#FEF2F2', color: '#991B1B', fontSize: 13 }}>
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!proposal && !busy && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => void propose()}
            disabled={!sentences.length}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full text-white disabled:opacity-40"
            style={{ fontSize: 14.5, fontWeight: 700, background: V3_SAGE }}
          >
            <Sparkles size={16} />
            Propose a structure from my sources
          </button>
          {!sentences.length && (
            <p style={{ fontSize: 13, color: '#B45309' }}>
              No source text yet —{' '}
              <button type="button" onClick={onBackToSources} style={{ textDecoration: 'underline', fontWeight: 650 }}>
                go back to Sources
              </button>.
            </p>
          )}
        </div>
      )}

      {busy && (
        <div className="flex items-center gap-2" style={{ fontSize: 13.5, color: '#57534e' }}>
          <Loader2 size={15} className="animate-spin" style={{ color: V3_SAGE }} />
          {progress || 'Working…'}
        </div>
      )}

      {proposal && (
        <div className="space-y-3">
          {proposal.rationale && (
            <div className="rounded-2xl px-4 py-3" style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#9AA3AF', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4 }}>
                Why this shape
              </p>
              <p style={{ fontSize: 13.5, color: '#44403c', lineHeight: 1.55 }}>{proposal.rationale}</p>
            </div>
          )}

          {(proposal.openers.length > 0 || proposal.closers.length > 0) && (
            <div className="rounded-2xl px-4 py-3" style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#9AA3AF', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                Around the lesson
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[...proposal.openers, ...proposal.closers].map((o, i) => (
                  <span
                    key={`${o}-${i}`}
                    className="px-2.5 py-1 rounded-full"
                    style={{ fontSize: 12, fontWeight: 600, background: V3_SAGE_TINT, color: '#2f4e39' }}
                  >
                    {embedTypeLabel(o)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {proposal.sections.map((sec, i) => (
            <div
              key={`${sec.title}-${i}`}
              className="rounded-2xl px-4 py-3.5"
              style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)' }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: V3_SAGE_TINT, color: '#2f4e39', fontSize: 12.5, fontWeight: 700 }}
                    >
                      {i + 1}
                    </span>
                    <p style={{ fontSize: 15, fontWeight: 700, color: '#0B1220' }}>{sec.title}</p>
                  </div>
                  {sec.intent && (
                    <p style={{ fontSize: 13, color: '#57534e', marginTop: 5, lineHeight: 1.5 }}>{sec.intent}</p>
                  )}
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {sec.blocks.map((b, bi) => (
                      <span
                        key={`${b}-${bi}`}
                        className="px-2 py-0.5 rounded-full"
                        style={{ fontSize: 11.5, fontWeight: 600, background: '#F5F5F4', color: '#57534e' }}
                      >
                        {b.replace(/-/g, ' ')}
                      </span>
                    ))}
                    {sec.objects.map((o, oi) => (
                      <button
                        key={`${o}-${oi}`}
                        type="button"
                        onClick={() => dropObject(i, o)}
                        title={`Remove ${embedTypeLabel(o)} from this section`}
                        className="px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                        style={{ fontSize: 11.5, fontWeight: 650, background: V3_SAGE_TINT, color: '#2f4e39' }}
                      >
                        {embedTypeLabel(o)} ×
                      </button>
                    ))}
                    {!sec.blocks.length && !sec.objects.length && (
                      <span style={{ fontSize: 11.5, color: '#9AA3AF' }}>prose only</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => dropSection(i)}
                  title="Drop this section"
                  className="shrink-0 p-2 rounded-lg"
                >
                  <Trash2 size={14} style={{ color: '#EF4444' }} />
                </button>
              </div>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              disabled={!proposal.sections.length}
              onClick={() => onApply(proposal)}
              className="px-5 py-3 rounded-full text-white disabled:opacity-40"
              style={{ fontSize: 14.5, fontWeight: 700, background: V3_SAGE }}
            >
              Use this structure
            </button>
            <button
              type="button"
              onClick={() => void propose()}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full border"
              style={{ fontSize: 13, fontWeight: 650, color: '#44403c', borderColor: 'rgba(0,0,0,0.12)', background: '#fff' }}
            >
              <RotateCcw size={13} /> Propose again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

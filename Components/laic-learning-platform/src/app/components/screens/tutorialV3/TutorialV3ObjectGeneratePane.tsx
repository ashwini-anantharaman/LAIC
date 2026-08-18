/**
 * Full per-type generate pipeline inside a Tutorial V3 generate slot.
 * Same arc as a standalone flashcard/quiz/concept object:
 * Pick sources (from tutorial pool) → Mark up → Extract → Define → Generate.
 */
import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Sparkles } from 'lucide-react';
import { MarkupWorkspace, type MarkupSource } from '../MarkupWorkspace';
import { TutorialExtractPanel } from '../TutorialExtractPanel';
import {
  errorMessage,
  generateConceptCard,
  generateFlashcards,
  generateQuiz,
  generateStructuredObject,
  suggestTutorialMarkupFlags,
  type GeneratedCard,
  type GeneratedConceptCard,
  type GeneratedQuizQuestion,
  type StructuredObjectKind,
  type TutorialExtract,
} from '../../../../lib/api';
import { makeGeneratedEmbedPart } from '../../../../lib/libraryEmbed';
import { resolveConceptCategories } from '../../../../lib/conceptCard';
import { sourcePoolToMarkupSources } from '../../../../lib/tutorialV3/draftModel';
import {
  defaultDefineConfig,
  objectTypeNoun,
} from '../../../../lib/tutorialV3/objectPipelineDefaults';
import type { TutorialV3Part, V3SourceRef, V3TopLevelSlot } from '../../../../lib/tutorialV3/types';
import type { Block, ClusteredKnowledgeBase, ContentUnit, ObjectType } from '../../../../lib/types';
import { DefineStepForm } from '../DefineStepForm';

/**
 * The block types Tutorial V3 added. They share one generate branch because
 * they share one contract: a Define group shaped to the prompt, a single JSON
 * object back, and a block whose `type` is the slot's own objectType.
 */
const V3_BLOCK_TYPES = new Set([
  'lesson-overview',
  'lesson-complete',
  'reference-table',
  'quick-decisions',
  'matching',
  'opening-question',
]);

type Substep = 'pick' | 'markup' | 'extract' | 'define' | 'run';

const STEPS: { id: Substep; label: string }[] = [
  { id: 'pick', label: '1. Pick sources' },
  { id: 'markup', label: '2. Mark up' },
  { id: 'extract', label: '3. Extract' },
  { id: 'define', label: '4. Define' },
  { id: 'run', label: '5. Generate' },
];

export function TutorialV3ObjectGeneratePane({
  slot,
  pool,
  tutorialTitle,
  tutorialObjective,
  onChangeSlot,
  onGenerated,
}: {
  slot: V3TopLevelSlot;
  pool: V3SourceRef[];
  tutorialTitle: string;
  tutorialObjective?: string;
  onChangeSlot: (patch: Partial<V3TopLevelSlot>) => void;
  onGenerated: (part: TutorialV3Part) => void;
}) {
  const objectType = String(slot.objectType || 'flashcard-set');
  const noun = objectTypeNoun(objectType);

  const [substep, setSubstep] = useState<Substep>('pick');
  const [activeTag, setActiveTag] = useState('Use');
  const [aiSuggestions, setAiSuggestions] = useState<number[]>([]);
  const [query, setQuery] = useState('');
  const [markupFlags, setMarkupFlags] = useState<any[]>(slot.markupFlags || []);
  const [scanningFlags, setScanningFlags] = useState(false);
  const [flagError, setFlagError] = useState<string | null>(null);
  const [knowledgeBase, setKnowledgeBase] = useState<ClusteredKnowledgeBase | null>(null);
  const [shapeIntent, setShapeIntent] = useState('');
  const [extracts, setExtracts] = useState<TutorialExtract[]>([]);
  const [define, setDefine] = useState(() => defaultDefineConfig(
    objectType,
    slot.generateMeta,
    tutorialObjective || slot.authoringNote || tutorialTitle,
  ));
  const [objectTitle, setObjectTitle] = useState(
    () => String(slot.generateMeta?.title || slot.libraryTitle || `${tutorialTitle} · ${noun}`),
  );
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scanAbort = useRef<AbortController | null>(null);

  const picked = slot.pickedSourceIds || [];
  const highlights = slot.highlights || [];

  const markupBundle = useMemo(
    () => sourcePoolToMarkupSources(pool, picked.length ? picked : undefined),
    [pool, picked],
  );

  const toggleSource = (id: string) => {
    const next = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
    onChangeSlot({ pickedSourceIds: next });
  };

  const setHighlights = (h: any[] | ((prev: any[]) => any[])) => {
    const next = typeof h === 'function' ? h(highlights) : h;
    onChangeSlot({ highlights: next });
  };

  const setDefineField = (id: string, value: any) => {
    setDefine((d) => {
      const next = { ...d, [id]: value };
      onChangeSlot({
        generateMeta: {
          ...(slot.generateMeta || {}),
          title: objectTitle,
          objective: next.mem || next.concept || next.verify || next.obj || next.goal || slot.generateMeta?.objective,
          ...metaFromDefine(objectType, next),
        },
      });
      return next;
    });
  };

  const handleScanFlags = async (instruction?: string) => {
    const sentences = markupBundle.docParas.map((text, i) => ({
      text,
      page: markupBundle.pages[i] || 1,
    }));
    if (!sentences.length) {
      setFlagError('Selected sources have no text yet.');
      return;
    }
    const focus = String(instruction || '').trim();
    if (!focus) {
      setFlagError(`Enter a scan focus for this ${noun} (e.g. key terms to memorise).`);
      return;
    }
    scanAbort.current?.abort();
    const ctrl = new AbortController();
    scanAbort.current = ctrl;
    setFlagError(null);
    setScanningFlags(true);
    try {
      const result = await suggestTutorialMarkupFlags(
        sentences,
        {
          instruction: focus,
          objective: tutorialObjective || define.mem || define.concept || focus,
          title: objectTitle || tutorialTitle,
        },
        ctrl.signal,
      );
      const flags = result.flags || [];
      setMarkupFlags(flags);
      onChangeSlot({ markupFlags: flags });
      if (!flags.length) {
        setFlagError('No review items found — try a clearer scan focus, or mark up manually.');
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setFlagError(errorMessage(e, 'Document scan failed — is the API running?'));
    } finally {
      setScanningFlags(false);
      scanAbort.current = null;
    }
  };

  const unitsFromKb = (): ContentUnit[] => {
    if (knowledgeBase?.units?.length) return knowledgeBase.units;
    return (highlights || [])
      .filter((h: any) => h.tag === 'Use' || h.tag === 'Support' || !h.tag)
      .map((h: any, i: number) => ({
        id: `u-slot-${slot.id}-${i}`,
        kind: 'Key point' as const,
        text: String(h.text || '').trim(),
        from: h.sourceLabel || 'Source',
        authorNote: h.note || h.authorNote,
      }))
      .filter((u) => u.text);
  };

  const extractsForGen = (): TutorialExtract[] => {
    if (extracts.length) return extracts;
    return unitsFromKb().slice(0, 12).map((u) => ({
      kind: u.kind,
      text: u.text,
      from: u.from,
      authorNote: u.authorNote,
    }));
  };

  const runGenerate = async () => {
    setError(null);
    const pack = extractsForGen();
    if (!pack.length) {
      setError('Pull content units in Extract (from your markup) before generating.');
      setSubstep('extract');
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    setSubstep('run');
    setProgress('Starting…');
    try {
      const title = objectTitle.trim() || `${tutorialTitle} · ${noun}`;
      let blocks: Block[] = [];
      let resultTitle = title;

      if (objectType === 'flashcard-set') {
        const collected: GeneratedCard[] = [];
        for await (const ev of generateFlashcards({
          title,
          config: {
            mem: define.mem || title,
            aud: define.aud,
            lvl: define.lvl,
            cc: define.cc,
            pull: define.pull,
            dir: define.dir,
            hooks: !!define.hooks,
            nc: Number(define.nc) || 12,
          },
          extracts: pack,
          knowledgeBase: knowledgeBase || undefined,
          shapeIntent: shapeIntent || undefined,
          prompt: define.instructions || undefined,
        }, ctrl.signal)) {
          if (ev.type === 'progress') setProgress(ev.message);
          else if (ev.type === 'card') collected.push(ev.card);
          else if (ev.type === 'error') throw new Error(ev.message);
          else if (ev.type === 'done') break;
        }
        if (!collected.length) throw new Error('No cards were generated.');
        blocks = [{
          id: `blk-fc-${slot.id}`,
          type: 'flashcard-set',
          content: {
            cards: collected.map((c) => ({
              front: c.front,
              back: c.back,
              ...(c.hook ? { hook: c.hook } : {}),
              ...(c.hint ? { hint: c.hint } : {}),
            })),
            direction: 'front-to-back',
          },
        }];
      } else if (objectType === 'concept-card') {
        let card: GeneratedConceptCard | null = null;
        const markupUnits = unitsFromKb().map((u) => ({
          text: u.text, from: u.from, kind: u.kind, authorNote: u.authorNote,
        }));
        for await (const ev of generateConceptCard({
          title,
          config: {
            concept: define.concept || title,
            aud: define.aud,
            lvl: define.lvl,
            voi: define.voi,
            len: define.len,
            categories: resolveConceptCategories(undefined),
          },
          extracts: pack,
          markupUnits,
          knowledgeBase: knowledgeBase || undefined,
          shapeIntent: shapeIntent || undefined,
          prompt: define.instructions || undefined,
        }, ctrl.signal)) {
          if (ev.type === 'progress') setProgress(ev.message);
          else if (ev.type === 'card') card = ev.card;
          else if (ev.type === 'error') throw new Error(ev.message);
          else if (ev.type === 'done') break;
        }
        if (!card?.term) throw new Error('No concept card was generated.');
        resultTitle = card.term;
        blocks = [{ id: `blk-cc-${slot.id}`, type: 'concept-card', content: card }];
      } else if (objectType === 'quiz') {
        const collected: GeneratedQuizQuestion[] = [];
        for await (const ev of generateQuiz({
          title,
          config: {
            verify: define.verify || title,
            purpose: define.purpose,
            concepts: define.concepts,
            aud: define.aud,
            lvl: define.lvl,
            qtypes: define.qtypes,
            nq: Number(define.nq) || 8,
            passOn: define.passOn !== false,
            pass: define.pass,
            show: define.show,
            adaptive: define.adaptive,
          } as any,
          extracts: pack,
          knowledgeBase: knowledgeBase || undefined,
          shapeIntent: shapeIntent || undefined,
          prompt: define.instructions || undefined,
        }, ctrl.signal)) {
          if (ev.type === 'progress') setProgress(ev.message);
          else if (ev.type === 'question') collected.push(ev.question);
          else if (ev.type === 'error') throw new Error(ev.message);
          else if (ev.type === 'done') break;
        }
        if (!collected.length) throw new Error('No questions were generated.');
        const passMark = parseInt(String(define.pass || '70').replace('%', ''), 10) || 70;
        blocks = [{
          id: `blk-quiz-${slot.id}`,
          type: 'quiz',
          content: {
            questions: collected,
            passRequired: define.passOn !== false,
            passMark,
            showExplanations: define.show || 'After attempt',
          },
        }];
      } else if (objectType === 'assignment' || objectType === 'reflection') {
        let content: Record<string, unknown> | null = null;
        for await (const ev of generateStructuredObject(objectType, {
          title,
          config: objectType === 'assignment'
            ? {
              obj: define.obj || title,
              aud: define.aud,
              lvl: define.lvl,
              tt: define.tt,
              del: define.del,
              el: define.el,
              cite: define.cite !== false,
              req: define.req,
              rubric: define.rubric,
            }
            : {
              goal: define.goal,
              aud: define.aud,
              voi: define.voi,
              style: define.style,
              who: define.who,
              np: define.np,
              starters: define.starters,
            },
          extracts: pack,
          knowledgeBase: knowledgeBase || undefined,
          shapeIntent: shapeIntent || undefined,
          prompt: define.instructions || undefined,
        }, ctrl.signal)) {
          if (ev.type === 'progress') setProgress(ev.message);
          else if (ev.type === 'result') content = ev.content as Record<string, unknown>;
          else if (ev.type === 'error') throw new Error(ev.message);
          else if (ev.type === 'done') break;
        }
        if (!content) throw new Error(`No ${noun} was generated.`);
        resultTitle = String((content as any).objective || (content as any).goal || title);
        blocks = [{ id: `blk-${objectType}-${slot.id}`, type: objectType as any, content }];
      } else if (V3_BLOCK_TYPES.has(objectType)) {
        /*
          The six Tutorial V3 block types. Their Define groups are already
          shaped to the prompt — one intent field and a count — so `define`
          goes through as the config rather than being re-mapped field by
          field the way the older object types are.
        */
        let content: Record<string, unknown> | null = null;
        for await (const ev of generateStructuredObject(objectType as StructuredObjectKind, {
          title,
          config: { ...define },
          extracts: pack,
          knowledgeBase: knowledgeBase || undefined,
          shapeIntent: shapeIntent || undefined,
          prompt: define.instructions || undefined,
        }, ctrl.signal)) {
          if (ev.type === 'progress') setProgress(ev.message);
          else if (ev.type === 'result') content = ev.content as Record<string, unknown>;
          else if (ev.type === 'error') throw new Error(ev.message);
          else if (ev.type === 'done') break;
        }
        if (!content) throw new Error(`No ${noun} was generated.`);
        resultTitle = String((content as any).title || define.what || title);
        blocks = [{ id: `blk-${objectType}-${slot.id}`, type: objectType as Block['type'], content: content as unknown as Block['content'] }];
      } else {
        throw new Error(`Generate pipeline for “${objectType}” is not wired yet.`);
      }

      const part = makeGeneratedEmbedPart({
        id: `embed-gen-${slot.id}`,
        objectType: objectType as ObjectType,
        title: resultTitle,
        snapshotBlocks: blocks,
        authoringNote: slot.authoringNote,
        required: slot.required,
      }) as TutorialV3Part;

      onChangeSlot({
        generateMeta: {
          ...(slot.generateMeta || {}),
          title: resultTitle,
          ...metaFromDefine(objectType, define),
        },
        libraryTitle: resultTitle,
        markupFlags,
        units: unitsFromKb(),
      });
      onGenerated(part);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError(errorMessage(e, 'Generation failed.'));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {STEPS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSubstep(s.id)}
            className="px-3 py-1.5 rounded-full border"
            style={{
              fontSize: 12,
              fontWeight: 600,
              background: substep === s.id ? '#e9f0ea' : 'white',
              borderColor: substep === s.id ? '#14B8A6' : 'rgba(0,0,0,0.1)',
              color: '#374151',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 12 }}>
        Full <strong>{noun}</strong> pipeline — same steps as creating a standalone {noun}, using sources from this tutorial.
      </p>

      {(error || flagError) && (
        <div className="mb-3 flex items-start gap-2 px-3 py-2.5 rounded-xl" style={{ background: '#FEF2F2', color: '#991B1B', fontSize: 13 }}>
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error || flagError}</span>
        </div>
      )}

      {substep === 'pick' && (
        <div className="space-y-2">
          {!pool.length && (
            <p style={{ fontSize: 13.5, color: '#B45309' }}>
              No sources in the tutorial pool — go back to Sources pool first.
            </p>
          )}
          {pool.map((s) => (
            <label
              key={s.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer"
              style={{
                borderColor: picked.includes(s.id) ? '#A78BFA' : 'rgba(0,0,0,0.08)',
                background: picked.includes(s.id) ? '#F5F3FF' : 'white',
              }}
            >
              <input type="checkbox" checked={picked.includes(s.id)} onChange={() => toggleSource(s.id)} />
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{s.label}</div>
                <div style={{ fontSize: 12, color: '#9AA3AF' }}>{s.kind} · {s.sentences?.length || 0} sentences</div>
              </div>
            </label>
          ))}
          <button
            type="button"
            disabled={!picked.length && !!pool.length}
            onClick={() => setSubstep('markup')}
            className="mt-3 px-4 py-2 rounded-full text-white disabled:opacity-40"
            style={{ fontSize: 13, fontWeight: 600, background: '#1e2b3d' }}
          >
            Continue to mark up →
          </button>
        </div>
      )}

      {substep === 'markup' && (
        <div>
          {!markupBundle.docParas.length ? (
            <p style={{ fontSize: 13.5, color: '#B45309' }}>Pick sources with text first.</p>
          ) : (
            <MarkupWorkspace
              sources={markupBundle.sources as MarkupSource[]}
              docParas={markupBundle.docParas}
              pages={markupBundle.pages}
              highlights={highlights}
              setHighlights={setHighlights}
              activeTag={activeTag}
              setActiveTag={setActiveTag}
              aiSuggestions={aiSuggestions}
              setAiSuggestions={setAiSuggestions}
              query={query}
              setQuery={setQuery}
              markupFlags={markupFlags}
              setMarkupFlags={(f) => {
                const next = typeof f === 'function' ? f(markupFlags) : f;
                setMarkupFlags(next);
                onChangeSlot({ markupFlags: next });
              }}
              onScanFlags={handleScanFlags}
              scanningFlags={scanningFlags}
              flagError={flagError}
              definedSections={[]}
            />
          )}
          <button
            type="button"
            onClick={() => setSubstep('extract')}
            className="mt-4 px-4 py-2 rounded-full text-white"
            style={{ fontSize: 13, fontWeight: 600, background: '#1e2b3d' }}
          >
            Continue to extract →
          </button>
        </div>
      )}

      {substep === 'extract' && (
        <div>
          <TutorialExtractPanel
            markHighlights={highlights}
            docTitle={tutorialTitle || 'Source'}
            knowledgeBase={knowledgeBase}
            setKnowledgeBase={setKnowledgeBase}
            shapeIntent={shapeIntent}
            setShapeIntent={setShapeIntent}
            objective={define.mem || define.concept || define.verify || define.obj || tutorialObjective}
            topic={objectTitle}
            syncExtracts={(units) => {
              setExtracts(units.map((u) => ({
                kind: u.kind,
                text: u.text,
                from: u.from,
                authorNote: u.authorNote,
              })));
              onChangeSlot({ units });
            }}
            typeNoun={noun}
            clusterOutcome={`Each cluster groups material for this ${noun}.`}
            markupSources={markupBundle.sources}
          />
          <button
            type="button"
            onClick={() => setSubstep('define')}
            className="mt-4 px-4 py-2 rounded-full text-white"
            style={{ fontSize: 13, fontWeight: 600, background: '#1e2b3d' }}
          >
            Continue to define →
          </button>
        </div>
      )}

      {substep === 'define' && (
        <DefineStepForm
          typeId={objectType}
          title={objectTitle}
          setTitle={setObjectTitle}
          fv={define}
          setF={setDefineField}
          srcCount={picked.length || pool.length}
          extCount={extracts.length || (knowledgeBase?.clusters?.reduce((n, c) => n + (c.units?.length || 0), 0) ?? 0)}
          clusterCount={knowledgeBase?.clusters?.length || 0}
          footer={(
            <button
              type="button"
              disabled={busy}
              onClick={() => void runGenerate()}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-white disabled:opacity-40"
              style={{ fontSize: 13, fontWeight: 650, background: '#4d7c5a' }}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Generate {noun}
            </button>
          )}
        />
      )}

      {substep === 'run' && (
        <div className="py-8 text-center">
          {busy ? (
            <>
              <Loader2 size={28} className="animate-spin mx-auto mb-3" style={{ color: '#1e2b3d' }} />
              <p style={{ fontSize: 14, fontWeight: 650 }}>Generating {noun}…</p>
              <p style={{ fontSize: 13, color: '#6B7280', marginTop: 6 }}>{progress}</p>
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="mt-4 px-3 py-1.5 rounded-full border"
                style={{ fontSize: 12 }}
              >
                Cancel
              </button>
            </>
          ) : error ? (
            <>
              <p style={{ fontSize: 14, color: '#B91C1C', marginBottom: 12 }}>{error}</p>
              <button
                type="button"
                onClick={() => setSubstep('define')}
                className="px-4 py-2 rounded-full text-white"
                style={{ fontSize: 13, fontWeight: 600, background: '#1e2b3d' }}
              >
                Back to define
              </button>
            </>
          ) : (
            <p style={{ fontSize: 13.5, color: '#2f4e39' }}>
              Generated — opening the {noun} editor so you can refine it.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function metaFromDefine(objectType: string, d: Record<string, any>): Record<string, any> {
  if (objectType === 'flashcard-set') {
    return {
      cardCount: d.nc, cc: d.cc, pull: d.pull, dir: d.dir, hooks: d.hooks, instructions: d.instructions,
      objective: d.mem,
    };
  }
  if (objectType === 'concept-card') {
    return { conceptFocus: d.concept, voi: d.voi, len: d.len, instructions: d.instructions, objective: d.concept };
  }
  if (objectType === 'quiz') {
    return {
      questionCount: d.nq, passOn: d.passOn, passMark: d.pass, qtypes: d.qtypes,
      show: d.show, adaptive: d.adaptive, instructions: d.instructions, objective: d.verify,
    };
  }
  if (objectType === 'assignment') {
    return { tt: d.tt, del: d.del, el: d.el, cite: d.cite, instructions: d.instructions, objective: d.obj };
  }
  if (objectType === 'reflection') {
    return { voi: d.voi, instructions: d.instructions, objective: d.goal };
  }
  return { instructions: d.instructions, objective: d.objective };
}

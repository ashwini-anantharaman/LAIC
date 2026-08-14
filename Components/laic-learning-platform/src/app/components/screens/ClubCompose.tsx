/**
 * Compose for a CLUB — the whole flow on one screen.
 *
 * The app's Activities "+" opens this with `embed=1`, so there is no sidebar, no
 * tabs and no way to wander. Pick one of four types, fill it in, press Publish, and
 * the content is live in that club with the host app brought back to the front.
 *
 * WHY THIS EXISTS. The full Studio offers thirteen object types, ends a save with a
 * dialog about folders and a trip to the Content Library, and keeps Publish in a
 * modal behind a history icon. Every one of those is right for an author who lives in
 * the Studio and wrong for a club member who tapped "+" on a phone to add one
 * tutorial.
 *
 * WHAT IT DOES NOT DO. It does not reimplement the editors. Flashcards, Quiz and
 * Summary render the Studio's own components untouched — they already take
 * `initialId`, `saveDraftLabel`, `onDone` and `onBack`, which is the entire seam this
 * screen needs. Only Tutorial is authored here, because neither tutorial creator can
 * be reused (one is a self-driving phase machine with no props, the other is not
 * exported) and a tutorial's stored blocks are just flat rich-text anyway.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Copy, FileText, HelpCircle, Layers, Loader2, Plus, Trash2 } from 'lucide-react';

import { useApp } from '../../App';
import { FlashcardEditor } from './FlashcardStudy';
import { QuizEditor } from './QuizEditor';
import { SummaryEditor } from './StructuredObjectEditors';
import type { GeneratedQuizQuestion } from '../../../lib/api';

type ComposeType = 'flashcard-set' | 'quiz' | 'summary' | 'tutorial';

const TYPES: { id: ComposeType; label: string; blurb: string; icon: React.ReactNode }[] = [
  { id: 'flashcard-set', label: 'Flashcards', blurb: 'Term and definition pairs to practise with', icon: <Copy size={20} /> },
  { id: 'quiz', label: 'Quiz', blurb: 'Questions with answers and an explanation', icon: <HelpCircle size={20} /> },
  { id: 'summary', label: 'Summary', blurb: 'The key points of something, briefly', icon: <FileText size={20} /> },
  { id: 'tutorial', label: 'Tutorial', blurb: 'Step by step, in your own words', icon: <Layers size={20} /> },
];

/** One step of a tutorial: a heading and its text. Stored as a rich-text block. */
type Step = { heading: string; text: string };

export function ClubCompose() {
  const {
    nexusClubName,
    nexusMode,
    addObject,
    createdObjects,
    listObjectVersions,
    objectVersionsTick,
    publishObjectVersion,
  } = useApp();

  const [type, setType] = useState<ComposeType | null>(null);
  /** The object we are waiting to publish — set once, when the editor hands back. */
  const [pending, setPending] = useState<string | null>(null);
  const [phase, setPhase] = useState<'edit' | 'publishing' | 'done' | 'error'>('edit');
  const [error, setError] = useState<string | null>(null);

  /**
   * The id is OURS, generated here and handed to the editor as `initialId`.
   *
   * `addObject` honours a caller-supplied id, so this is how we know which object to
   * publish without the editors having to tell us — none of them return one.
   */
  const idRef = useRef<string>(`obj-club-${Date.now()}`);
  const where = nexusClubName ? `${nexusClubName}’s Activities` : 'the shared library';

  /**
   * Publish AFTER the commit that created the object.
   *
   * Not defensiveness — a requirement. Every side effect of `addObject` (the local
   * write, the version, the remote save) happens inside its state updater, so calling
   * publish on the next line finds neither the object nor its version and fails with
   * "Content not found." React sometimes evaluates a lone updater eagerly, which is
   * what would make the naive version pass in testing and fail on a real device.
   */
  useEffect(() => {
    if (!pending || phase !== 'publishing') return;
    if (!createdObjects?.some((o) => o.id === pending)) return; // not committed yet
    const tip = listObjectVersions(pending)[0]; // newest first
    if (!tip) return; // the version write lands in the same commit; wait for the tick
    let cancelled = false;
    void publishObjectVersion(pending, tip.id).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error || 'Could not publish that.');
        setPhase('error');
        return;
      }
      setPhase('done');
      // Tell the host app, so it can close this and refresh the row it came from.
      // Same bridge the reader uses to ask for a board (`lp:play-entry`).
      const rn = (window as unknown as { ReactNativeWebView?: { postMessage: (s: string) => void } })
        .ReactNativeWebView;
      const message = { type: 'lp:published', objectId: pending };
      if (rn) rn.postMessage(JSON.stringify(message));
      else if (window.parent !== window) window.parent.postMessage(message, '*');
    });
    return () => {
      cancelled = true;
    };
  }, [pending, phase, createdObjects, objectVersionsTick, listObjectVersions, publishObjectVersion]);

  /** The editors call this when their save has run. */
  const handOff = () => {
    setPending(idRef.current);
    setPhase('publishing');
  };

  const startOver = () => {
    idRef.current = `obj-club-${Date.now()}`;
    setPending(null);
    setError(null);
    setPhase('edit');
    setType(null);
  };

  // ── Terminal states ─────────────────────────────────────────────────────
  if (phase === 'publishing' && pending) {
    return (
      <Frame where={where}>
        <div className="flex flex-col items-center gap-3 py-16">
          <Loader2 size={22} className="animate-spin" style={{ color: '#105431' }} />
          <p style={{ fontSize: 14, color: '#1f1f1f' }}>Publishing to {where}…</p>
        </div>
      </Frame>
    );
  }

  if (phase === 'done') {
    return (
      <Frame where={where}>
        <div className="flex flex-col items-center gap-3 py-14 text-center">
          <p style={{ fontSize: 17, fontWeight: 700, color: '#1f1f1f' }}>Published</p>
          <p style={{ fontSize: 14, color: 'rgba(31,31,31,0.62)', maxWidth: 320 }}>
            It is in {where} now. You can close this, or add another.
          </p>
          <button type="button" onClick={startOver} className="mt-2 px-5 py-2.5 rounded-full"
            style={{ background: '#105431', color: '#fff4d7', fontSize: 13, fontWeight: 600 }}>
            Add another
          </button>
        </div>
      </Frame>
    );
  }

  if (phase === 'error') {
    return (
      <Frame where={where}>
        <div className="flex flex-col items-center gap-3 py-14 text-center">
          <p style={{ fontSize: 17, fontWeight: 700, color: '#8a1c1c' }}>Not published</p>
          <p style={{ fontSize: 14, color: 'rgba(31,31,31,0.7)', maxWidth: 340 }}>{error}</p>
          <p style={{ fontSize: 12.5, color: 'rgba(31,31,31,0.5)', maxWidth: 340 }}>
            Your work is saved — it just is not live yet.
          </p>
          <button type="button" onClick={() => setPhase('publishing')}
            className="mt-2 px-5 py-2.5 rounded-full"
            style={{ background: '#105431', color: '#fff4d7', fontSize: 13, fontWeight: 600 }}>
            Try again
          </button>
        </div>
      </Frame>
    );
  }

  // ── Pick a type ─────────────────────────────────────────────────────────
  if (!type) {
    return (
      <Frame where={where}>
        <div className="flex flex-col gap-2.5">
          {TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setType(t.id)}
              className="flex items-center gap-3 text-left rounded-2xl px-4 py-3.5 transition-colors"
              style={{ background: 'rgba(16,84,49,0.06)', border: '1px solid rgba(16,84,49,0.14)' }}
            >
              <span className="shrink-0 grid place-items-center rounded-xl"
                style={{ width: 38, height: 38, background: '#105431', color: '#fff4d7' }}>
                {t.icon}
              </span>
              <span className="min-w-0">
                <span className="block" style={{ fontSize: 15, fontWeight: 700, color: '#1f1f1f' }}>{t.label}</span>
                <span className="block" style={{ fontSize: 12.5, color: 'rgba(31,31,31,0.6)' }}>{t.blurb}</span>
              </span>
            </button>
          ))}
        </div>
        {!nexusMode ? (
          <p className="mt-4" style={{ fontSize: 12.5, color: '#8a1c1c' }}>
            Not signed in — reopen this from the app, or publishing will be refused.
          </p>
        ) : null}
      </Frame>
    );
  }

  // ── The editors ─────────────────────────────────────────────────────────
  // `saveDraftLabel` is the primary button, and it saves and then calls `onDone` —
  // which is exactly "publish" from here. Both it and the Submit path converge on
  // handOff, so whichever the author presses, the content goes live.
  const shared = {
    initialId: idRef.current,
    fv: {} as Record<string, unknown>,
    scope: 'bridge',
    onBack: () => setType(null),
    onDone: handOff,
    backLabel: 'Choose a different kind',
    doneLabel: `Publish to ${nexusClubName ?? 'the library'}`,
    saveDraftLabel: `Publish to ${nexusClubName ?? 'the library'}`,
  };

  if (type === 'flashcard-set') {
    return <FlashcardEditor {...shared} typeId="flashcard-set" title="" cards={[{ front: '', back: '' }]} />;
  }
  if (type === 'quiz') {
    return <QuizEditor {...shared} typeId="quiz" title="" questions={BLANK_QUESTION} />;
  }
  if (type === 'summary') {
    return <SummaryEditor {...shared} typeId="summary" title="" content={null} />;
  }
  return (
    <TutorialCompose
      where={where}
      publishLabel={`Publish to ${nexusClubName ?? 'the library'}`}
      onBack={() => setType(null)}
      onSave={(title, steps) => {
        addObject(
          {
            id: idRef.current,
            type: 'tutorial',
            title,
            status: 'draft',
            description: steps[0]?.text?.slice(0, 140) ?? '',
            estimatedTime: `${Math.max(3, steps.length * 2)} min`,
            // Flat rich-text blocks — what the reader actually renders. Sections are a
            // Studio-side draft concept the reader never sees, so there is nothing to
            // model here beyond a heading and its words.
            blocks: steps.map((s, i) => ({
              id: `blk-${Date.now()}-${i}`,
              type: 'rich-text',
              content: { heading: s.heading, text: s.text },
            })) as never,
          },
          // Exactly one v1, always: never an amend, never a surprise v2.
          { version: 'skip' },
        );
        handOff();
      }}
    />
  );
}

/** One blank multiple-choice question, so the quiz editor opens on something. */
const BLANK_QUESTION: GeneratedQuizQuestion[] = [
  { id: 'q1', question: '', type: 'multiple-choice', options: ['', ''], correct: 0 },
];

/** The cream page every state sits on, with the destination stated once at the top. */
function Frame({ where, children }: { where: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[560px] px-5 py-6">
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1f1f1f', margin: 0 }}>Add to your club</h1>
      {/* Said here because `embed=1` removes the app-wide banner along with the rest
          of the chrome — and where it lands is the one thing an author must know. */}
      <p style={{ fontSize: 13, color: 'rgba(31,31,31,0.62)', margin: '4px 0 18px' }}>
        Whatever you publish appears in {where}.
      </p>
      {children}
    </div>
  );
}

/**
 * Tutorial authoring, kept deliberately plain: a title and a list of steps.
 *
 * The Studio's own tutorial creators cannot be reused — `ObjectCreatorTutorialV2` is a
 * whole phase machine with no props, and the V1 editor is module-private — but a
 * tutorial is stored as flat rich-text blocks, so this is the honest shape of it.
 */
function TutorialCompose({
  where,
  publishLabel,
  onBack,
  onSave,
}: {
  where: string;
  publishLabel: string;
  onBack: () => void;
  onSave: (title: string, steps: Step[]) => void;
}) {
  const [title, setTitle] = useState('');
  const [steps, setSteps] = useState<Step[]>([{ heading: '', text: '' }]);

  const ready = useMemo(
    () => title.trim().length > 0 && steps.some((s) => s.text.trim().length > 0),
    [title, steps],
  );
  const set = (i: number, patch: Partial<Step>) =>
    setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const field: React.CSSProperties = {
    fontSize: 13,
    border: '1px solid rgba(0,0,0,0.1)',
    background: 'rgba(255,255,255,0.9)',
    outline: 'none',
  };
  const label: React.CSSProperties = {
    fontSize: 10.5,
    fontWeight: 600,
    color: '#9AA3AF',
    marginBottom: 3,
    display: 'block',
  };

  return (
    <Frame where={where}>
      <button type="button" onClick={onBack} className="mb-3" style={{ fontSize: 12.5, color: '#105431', fontWeight: 600 }}>
        ← Choose a different kind
      </button>

      <label style={label}>What is it called?</label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Finessing, step by step"
        className="w-full rounded-xl px-3 py-2 mb-4"
        style={field}
      />

      <div className="flex flex-col gap-3">
        {steps.map((s, i) => (
          <div key={i} className="rounded-2xl p-3.5" style={{ background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(0,0,0,0.08)' }}>
            <div className="flex items-center justify-between mb-2">
              <span style={{ fontSize: 11, fontWeight: 700, color: '#105431' }}>STEP {i + 1}</span>
              {steps.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setSteps((p) => p.filter((_, j) => j !== i))}
                  aria-label={`Remove step ${i + 1}`}
                  style={{ color: '#9AA3AF' }}
                >
                  <Trash2 size={13} />
                </button>
              ) : null}
            </div>
            <label style={label}>Heading (optional)</label>
            <input value={s.heading} onChange={(e) => set(i, { heading: e.target.value })}
              className="w-full rounded-xl px-3 py-2 mb-2" style={field} />
            <label style={label}>What happens in this step</label>
            <textarea value={s.text} onChange={(e) => set(i, { text: e.target.value })} rows={4}
              className="w-full rounded-xl px-3 py-2 resize-y" style={field} />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setSteps((p) => [...p, { heading: '', text: '' }])}
        className="mt-3 flex items-center gap-1.5"
        style={{ fontSize: 12.5, fontWeight: 600, color: '#105431' }}
      >
        <Plus size={13} /> Add another step
      </button>

      <button
        type="button"
        disabled={!ready}
        onClick={() => onSave(title.trim(), steps.filter((s) => s.text.trim()))}
        className="mt-6 w-full py-3 rounded-full flex items-center justify-center gap-2"
        style={{
          background: ready ? '#105431' : '#E5E7EB',
          color: ready ? '#fff4d7' : '#9AA3AF',
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        <BookOpen size={15} />
        {publishLabel}
      </button>
      {!ready ? (
        <p className="mt-2 text-center" style={{ fontSize: 12, color: 'rgba(31,31,31,0.5)' }}>
          A name and at least one step, and this is ready.
        </p>
      ) : null}
    </Frame>
  );
}

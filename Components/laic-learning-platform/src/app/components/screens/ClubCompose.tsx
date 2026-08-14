/**
 * Compose for a CLUB — the Studio's real creators, with the club's ending.
 *
 * The app's Activities "+" opens this with `embed=1`, so there is no sidebar and no
 * tabs. Pick one of four types, author it with the FULL creator — sources, PDF upload,
 * highlighting, AI generation, the item editors, all of it — and the save publishes to
 * the club and returns you to the app.
 *
 * THIS SCREEN USED TO RENDER THE BARE ITEM EDITORS, and that was a mistake worth
 * recording: `QuizEditor` and friends are the LAST step of the creator's pipeline
 * (start → structure → sources → navigator → unit → review), so mounting them alone
 * produced a screen where you could type questions by hand and nothing else. Every way
 * of getting content IN — a PDF, a transcript, a web page, anything generated — lives in
 * the sources phase that was being skipped. Simplifying the navigation is not the same
 * as removing the tools, and the first version did both.
 *
 * So this now renders exactly what the Studio's `cd-creator` renders, chosen by
 * `creatorObjectType`, and changes only the ENDING: the creators ask
 * `composePublisher()` whether a club session is active, and if so hand over the object
 * id instead of running their "Saved in folder X — open Content Library" dialog. That
 * dialog is right in the Studio and a dead end on a phone.
 */

import { useEffect, useRef, useState } from 'react';
import { Copy, FileText, HelpCircle, Layers, Loader2 } from 'lucide-react';

import { useApp } from '../../App';
import { setComposePublisher } from '../../../lib/clubComposeBridge';
import { ObjectCreator } from './ObjectCreator';
import { ObjectCreatorStructuredV2 } from './objectV2/ObjectCreatorStructuredV2';
import { ObjectCreatorTutorialV2 } from './tutorialV2/ObjectCreatorTutorialV2';

/** What a club may make. The ids are the Studio's own object types. */
const TYPES: { id: string; label: string; blurb: string; icon: React.ReactNode }[] = [
  { id: 'flashcard-set', label: 'Flashcards', blurb: 'Term and definition pairs to practise with', icon: <Copy size={20} /> },
  { id: 'quiz', label: 'Quiz', blurb: 'Questions with answers and an explanation', icon: <HelpCircle size={20} /> },
  { id: 'summary', label: 'Summary', blurb: 'The key points of something, briefly', icon: <FileText size={20} /> },
  { id: 'tutorial-v2', label: 'Tutorial', blurb: 'Step by step, with sources and media', icon: <Layers size={20} /> },
];

export function ClubCompose() {
  const {
    nexusClubName,
    nexusMode,
    creatorObjectType,
    setCreatorObjectType,
    createdObjects,
    listObjectVersions,
    objectVersionsTick,
    publishObjectVersion,
  } = useApp();

  const [picked, setPicked] = useState<string | null>(null);
  /** The object a creator handed over — what we are about to publish. */
  const [pending, setPending] = useState<string | null>(null);
  const [phase, setPhase] = useState<'pick' | 'author' | 'publishing' | 'done' | 'error'>('pick');
  const [error, setError] = useState<string | null>(null);
  const where = nexusClubName ? `${nexusClubName}’s Activities` : 'the shared library';

  /**
   * Register this session's ending for as long as we are mounted.
   *
   * Cleared on unmount so the ordinary Studio is never affected — the creators only
   * behave differently while a club is actually composing.
   */
  const pendingRef = useRef<string | null>(null);
  useEffect(() => {
    setComposePublisher((objectId) => {
      pendingRef.current = objectId;
      setPending(objectId);
      setPhase('publishing');
    });
    return () => setComposePublisher(null);
  }, []);

  /**
   * Publish once the commit that saved it has landed.
   *
   * Required, not defensive: everything `addObject` does — the local write, the version,
   * the remote save — happens inside its state updater, so publishing in the same tick
   * finds neither the object nor its version. React sometimes evaluates a lone updater
   * eagerly, which is exactly what would make the naive version pass in testing and fail
   * on a device.
   */
  useEffect(() => {
    if (phase !== 'publishing' || !pending) return;
    if (!createdObjects?.some((o) => o.id === pending)) return;
    const tip = listObjectVersions(pending)[0];
    if (!tip) return;
    let cancelled = false;
    void publishObjectVersion(pending, tip.id).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error || 'Could not publish that.');
        setPhase('error');
        return;
      }
      setPhase('done');
      const rn = (window as unknown as { ReactNativeWebView?: { postMessage: (s: string) => void } })
        .ReactNativeWebView;
      const message = { type: 'lp:published', objectId: pending };
      if (rn) rn.postMessage(JSON.stringify(message));
      else if (window.parent !== window) window.parent.postMessage(message, '*');
    });
    return () => {
      cancelled = true;
    };
  }, [phase, pending, createdObjects, objectVersionsTick, listObjectVersions, publishObjectVersion]);

  // ── Publishing / done / failed ──────────────────────────────────────────
  if (phase === 'publishing') {
    return (
      <Banner where={where}>
        <div className="flex flex-col items-center gap-3 py-16">
          <Loader2 size={22} className="animate-spin" style={{ color: '#105431' }} />
          <p style={{ fontSize: 14 }}>Publishing to {where}…</p>
        </div>
      </Banner>
    );
  }

  if (phase === 'done') {
    return (
      <Banner where={where}>
        <div className="flex flex-col items-center gap-3 py-14 text-center">
          <p style={{ fontSize: 17, fontWeight: 700 }}>Published</p>
          <p style={{ fontSize: 14, color: '#4b5563', maxWidth: 320 }}>
            It is in {where} now. Closing this takes you back.
          </p>
          <button type="button" onClick={() => { setPending(null); setPicked(null); setPhase('pick'); }}
            className="mt-2 px-5 py-2.5 rounded-full"
            style={{ background: '#105431', color: '#fff4d7', fontSize: 13, fontWeight: 600 }}>
            Add another
          </button>
        </div>
      </Banner>
    );
  }

  if (phase === 'error') {
    return (
      <Banner where={where}>
        <div className="flex flex-col items-center gap-3 py-14 text-center">
          <p style={{ fontSize: 17, fontWeight: 700, color: '#8a1c1c' }}>Not published</p>
          <p style={{ fontSize: 14, color: '#4b5563', maxWidth: 340 }}>{error}</p>
          <p style={{ fontSize: 12.5, color: '#6b7280', maxWidth: 340 }}>
            Your work is saved — it just is not live yet.
          </p>
          <button type="button" onClick={() => setPhase('publishing')} className="mt-2 px-5 py-2.5 rounded-full"
            style={{ background: '#105431', color: '#fff4d7', fontSize: 13, fontWeight: 600 }}>
            Try again
          </button>
        </div>
      </Banner>
    );
  }

  // ── Pick a type ─────────────────────────────────────────────────────────
  if (phase === 'pick' || !picked) {
    return (
      <Banner where={where}>
        <div className="flex flex-col gap-2.5">
          {TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                // The creators read the type off the app context, exactly as the
                // Studio's own Create screen sets it.
                setCreatorObjectType(t.id);
                setPicked(t.id);
                setPhase('author');
              }}
              className="flex items-center gap-3 text-left rounded-2xl px-4 py-3.5"
              style={{ background: 'rgba(16,84,49,0.06)', border: '1px solid rgba(16,84,49,0.14)' }}
            >
              <span className="shrink-0 grid place-items-center rounded-xl"
                style={{ width: 38, height: 38, background: '#105431', color: '#fff4d7' }}>
                {t.icon}
              </span>
              <span className="min-w-0">
                <span className="block" style={{ fontSize: 15, fontWeight: 700 }}>{t.label}</span>
                <span className="block" style={{ fontSize: 12.5, color: '#4b5563' }}>{t.blurb}</span>
              </span>
            </button>
          ))}
        </div>
        {!nexusMode ? (
          <p className="mt-4" style={{ fontSize: 12.5, color: '#8a1c1c' }}>
            Not signed in — reopen this from the app, or publishing will be refused.
          </p>
        ) : null}
      </Banner>
    );
  }

  // ── The real creator, with a line saying where its output goes ──────────
  const type = creatorObjectType || picked;
  return (
    <div>
      <div
        className="flex items-center justify-between gap-3 px-4 py-2"
        style={{ background: '#105431', color: '#fff4d7' }}
      >
        {/* Stated here because `embed=1` removes the app-wide banner with the rest of
            the chrome, and where it lands is the one thing an author must know. */}
        <span style={{ fontSize: 12.5 }}>Publishing to <strong>{where}</strong></span>
        <button type="button" onClick={() => { setPicked(null); setPhase('pick'); }}
          style={{ fontSize: 12, fontWeight: 600, textDecoration: 'underline' }}>
          Change kind
        </button>
      </div>
      {type === 'tutorial-v2' ? (
        <ObjectCreatorTutorialV2 />
      ) : ['quiz', 'flashcard-set', 'concept-card', 'video-script'].includes(type) ? (
        <ObjectCreatorStructuredV2 />
      ) : (
        <ObjectCreator />
      )}
    </div>
  );
}

/** The page the non-authoring states sit on. */
function Banner({ where, children }: { where: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[560px] px-5 py-6">
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Add to your club</h1>
      <p style={{ fontSize: 13, color: '#4b5563', margin: '4px 0 18px' }}>
        Whatever you publish appears in {where}.
      </p>
      {children}
    </div>
  );
}

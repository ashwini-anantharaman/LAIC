/**
 * Shell-free object player for /o/:objectId embeds (iframe / external hosts).
 *
 * resolveLearningObject looks only in THIS browser — the seed catalog plus the
 * localStorage libraries. That made an /o/<id> link permanent in name only: it
 * resolved for the author and reported "Content not found" everywhere else, which
 * is what an external host (a phone's webview, someone else's machine, an
 * incognito window) always is.
 *
 * So when the local lookup misses, ask the server for a PUBLIC copy. That
 * succeeds only if the object was published (see the share flag in migration
 * 0002_public_share.sql), which is why "not found" here now means one of two
 * things — no such object, or one that was never shared — and the empty state
 * says so rather than blaming the browser.
 */
import React, { useEffect, useState } from 'react';
import { Layers } from 'lucide-react';
import { LearnerReader } from './LearnerReader';
import { resolveLearningObject } from '../../../lib/objectUrls';
import { fetchPublicObject } from '../../../lib/supabase';
import type { LearningObject } from '../../../lib/types';

type State =
  | { phase: 'resolved'; object: LearningObject }
  | { phase: 'looking' }
  | { phase: 'missing' };

export function ObjectEmbedPage({ objectId }: { objectId: string }) {
  // The local hit is synchronous, so an object this browser already has still
  // renders on the first paint — no spinner, no flicker, exactly as before.
  const local = resolveLearningObject(objectId);
  const [state, setState] = useState<State>(
    local ? { phase: 'resolved', object: local } : { phase: 'looking' },
  );

  useEffect(() => {
    if (local) {
      setState({ phase: 'resolved', object: local });
      return;
    }
    let live = true;
    setState({ phase: 'looking' });
    fetchPublicObject(objectId)
      .then((object) => {
        if (!live) return;
        setState(object ? { phase: 'resolved', object } : { phase: 'missing' });
      })
      .catch(() => live && setState({ phase: 'missing' }));
    return () => {
      live = false;
    };
    // `local` is derived from objectId; keying on the id alone avoids re-running
    // for an unchanged object that merely re-rendered.
  }, [objectId]);

  const background = 'linear-gradient(170deg, #A9BBCB 0%, #D4DDE6 40%, #F2F5F8 100%)';

  if (state.phase === 'looking') {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
        style={{ background }}
      >
        <Layers size={36} className="text-[#9AA3AF] mb-3" />
        <p style={{ fontSize: 13, color: '#6B7280' }}>Loading…</p>
      </div>
    );
  }

  if (state.phase === 'missing') {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
        style={{ background }}
      >
        <Layers size={36} className="text-[#9AA3AF] mb-3" />
        <p style={{ fontSize: 16, fontWeight: 700, color: '#0B1220' }}>Content not found</p>
        <p style={{ fontSize: 13, color: '#6B7280', marginTop: 6, maxWidth: 360 }}>
          No content with id <code style={{ fontSize: 12 }}>{objectId}</code> is available. If you
          authored it, open it in the Studio and share it to make this link work anywhere.
        </p>
      </div>
    );
  }

  /*
    A v3 tutorial is a full-height reader: a fixed sage rail beside a reading
    column that scrolls inside it. That needs a definite height to resolve
    against — with `min-h-screen` alone the reader sized itself to its content,
    the rail stopped partway down, and the page's own background showed through
    underneath it. Every other object type still scrolls the page as before.
  */
  const fullHeight = state.object.type === 'tutorial-v3';

  return (
    // cs-embed-root: the viewport clamp for host WebViews (see index.html).
    // This route renders before the Content Studio shell, so it inherits none
    // of the shell's mobile guards.
    <div
      className={fullHeight ? 'cs-embed-root h-[100dvh] overflow-hidden' : 'cs-embed-root min-h-screen'}
      style={fullHeight ? undefined : { background }}
    >
      <LearnerReader objectId={objectId} object={state.object} embedded />
    </div>
  );
}

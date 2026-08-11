/**
 * Media under a question stem — image and/or embedded YouTube player.
 * Rendered by every quiz-question surface (quiz block, MCQ cluster,
 * video-script checkpoint) and by author previews.
 */
import React from 'react';
import type { QuestionContent } from '../../../lib/types';

function ytIdFrom(url: string): string {
  const raw = (url || '').trim();
  if (!raw) return '';
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  const m = raw.match(/(?:youtu\.be\/|youtube\.com\/(?:embed|shorts|live|v)\/|watch\?.*?v=)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : '';
}

export function QuestionMedia({ q }: { q: Pick<QuestionContent, 'imageUrl' | 'videoUrl'> }) {
  const ytId = ytIdFrom(q.videoUrl || '');
  if (!q.imageUrl && !ytId) return null;
  return (
    <div className="mb-3 space-y-2">
      {q.imageUrl ? (
        <img
          src={q.imageUrl}
          alt=""
          className="rounded-xl"
          style={{ maxWidth: '100%', maxHeight: 280, objectFit: 'contain', border: '1px solid rgba(0,0,0,0.06)' }}
        />
      ) : null}
      {ytId ? (
        <div className="rounded-xl overflow-hidden" style={{ aspectRatio: '16 / 9', maxWidth: 480, border: '1px solid rgba(0,0,0,0.06)' }}>
          <iframe
            title="Question video"
            src={`https://www.youtube-nocookie.com/embed/${ytId}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{ width: '100%', height: '100%', border: 0 }}
          />
        </div>
      ) : null}
    </div>
  );
}

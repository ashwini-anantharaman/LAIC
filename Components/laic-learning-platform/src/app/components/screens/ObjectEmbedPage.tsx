/**
 * Shell-free object player for /o/:objectId embeds (iframe / external hosts).
 */
import React from 'react';
import { Layers } from 'lucide-react';
import { LearnerReader } from './LearnerReader';
import { resolveLearningObject } from '../../../lib/objectUrls';

export function ObjectEmbedPage({ objectId }: { objectId: string }) {
  const obj = resolveLearningObject(objectId);

  if (!obj) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
        style={{ background: 'linear-gradient(170deg, #A9BBCB 0%, #D4DDE6 40%, #F2F5F8 100%)' }}
      >
        <Layers size={36} className="text-[#9AA3AF] mb-3" />
        <p style={{ fontSize: 16, fontWeight: 700, color: '#0B1220' }}>Content not found</p>
        <p style={{ fontSize: 13, color: '#6B7280', marginTop: 6, maxWidth: 360 }}>
          No content with id <code style={{ fontSize: 12 }}>{objectId}</code> is available in this browser.
        </p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: 'linear-gradient(170deg, #A9BBCB 0%, #D4DDE6 40%, #F2F5F8 100%)' }}
    >
      <LearnerReader objectId={objectId} object={obj} embedded />
    </div>
  );
}

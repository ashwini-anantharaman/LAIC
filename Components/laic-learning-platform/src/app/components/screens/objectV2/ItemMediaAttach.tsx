/**
 * Compact image/YouTube attach control used inside item editors
 * (quiz questions, flashcards, concept categories, checkpoints).
 */
import React, { useRef } from 'react';
import { Image as ImageIcon, Youtube, X } from 'lucide-react';
import { supabaseEnabled, uploadImage } from '../../../../lib/supabase';
import { parseYtIdLoose } from '../../../../lib/objectV2/structuredDraft';

export function ItemMediaAttach({
  imageUrl,
  videoUrl,
  onChange,
  compact = false,
}: {
  imageUrl?: string;
  videoUrl?: string;
  onChange: (patch: { imageUrl?: string; videoUrl?: string }) => void;
  compact?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (supabaseEnabled()) {
      const reader = new FileReader();
      reader.onload = () => onChange({ imageUrl: String(reader.result || '') });
      reader.readAsDataURL(file);
      uploadImage(file)
        .then((url) => onChange({ imageUrl: url }))
        .catch(() => { /* keep the data URL */ });
    } else {
      const reader = new FileReader();
      reader.onload = () => onChange({ imageUrl: String(reader.result || '') });
      reader.readAsDataURL(file);
    }
  };

  const ytId = parseYtIdLoose(videoUrl || '');

  return (
    <div className={compact ? 'mt-1.5' : 'mt-2'}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border"
          style={{ fontSize: 11.5, color: '#374151', borderColor: 'rgba(0,0,0,0.12)', background: 'rgba(255,255,255,0.85)' }}
        >
          <ImageIcon size={11} /> {imageUrl ? 'Replace image' : 'Add image'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = '';
          }}
        />
        <input
          type="text"
          value={imageUrl && !imageUrl.startsWith('data:') ? imageUrl : ''}
          onChange={(e) => onChange({ imageUrl: e.target.value })}
          placeholder="…or paste an image URL"
          className="flex-1 min-w-[140px] rounded-lg px-2 py-1"
          style={{ fontSize: 11.5, border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.85)', outline: 'none' }}
        />
        <span className="inline-flex items-center gap-1" style={{ fontSize: 11.5, color: '#9AA3AF' }}>
          <Youtube size={11} style={{ color: '#DC2626' }} />
        </span>
        <input
          type="text"
          value={videoUrl || ''}
          onChange={(e) => onChange({ videoUrl: e.target.value })}
          placeholder="YouTube URL"
          className="flex-1 min-w-[140px] rounded-lg px-2 py-1"
          style={{ fontSize: 11.5, border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.85)', outline: 'none' }}
        />
      </div>
      {(imageUrl || ytId) && (
        <div className="flex items-start gap-2 mt-2">
          {imageUrl ? (
            <div className="relative">
              <img src={imageUrl} alt="" className="rounded-lg" style={{ maxHeight: 90, maxWidth: 160, objectFit: 'cover' }} />
              <button
                type="button"
                onClick={() => onChange({ imageUrl: '' })}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: '#0B0F1A', color: '#fff' }}
                title="Remove image"
              >
                <X size={10} />
              </button>
            </div>
          ) : null}
          {ytId ? (
            <div className="relative">
              <img src={`https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`} alt="" className="rounded-lg" style={{ maxHeight: 90 }} />
              <button
                type="button"
                onClick={() => onChange({ videoUrl: '' })}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: '#0B0F1A', color: '#fff' }}
                title="Remove video"
              >
                <X size={10} />
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * A Bridge Platform component inside a tutorial — dormant until asked for.
 *
 * Two states, and the distinction is the whole point:
 *
 *  · THUMBNAIL. A drawn preview, a label and a Play affordance. No iframe is in
 *    the tree, so nothing is fetched and no Bridge code runs. Six of these on a
 *    page cost six divs.
 *  · LIVE. On activate, the iframe mounts and the real table runs in it. Close
 *    unmounts it again, which stops the frame rather than merely hiding it.
 *
 * The preview is drawn here rather than screenshotted so it can never go stale
 * against the real table, and costs no network.
 */

import { useState } from 'react';
import { ExternalLink, Play, X } from 'lucide-react';
import { bridgeEmbedDef, type BridgeEmbedKind } from '../../../../lib/tutorialV2/bridgeEmbed';

const FELT = '#1c6b4f';

/** A miniature of the table: felt, four hands, a trick in the middle. */
function TablePreview() {
  const card = (left: number, top: number, w = 9, h = 13) => (
    <span
      key={`${left}-${top}`}
      style={{
        position: 'absolute',
        left: `${left}%`,
        top: `${top}%`,
        width: w,
        height: h,
        borderRadius: 1.5,
        background: '#fff',
        boxShadow: '0 1px 2px rgba(0,0,0,.35)',
      }}
    />
  );
  const fan = (leftStart: number, top: number, n: number, step: number) =>
    Array.from({ length: n }, (_, i) => card(leftStart + i * step, top));

  return (
    <div
      aria-hidden
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: `radial-gradient(120% 110% at 35% 20%, #26805e 0%, ${FELT} 45%, #14563f 100%)`,
      }}
    >
      {fan(34, 6, 5, 6)}
      {fan(6, 38, 3, 5)}
      {fan(78, 38, 3, 5)}
      {fan(30, 76, 7, 6)}
      {card(44, 34, 11, 15)}
      {card(52, 42, 11, 15)}
    </div>
  );
}

export function BridgeEmbedBlock({
  kind,
  url,
  caption,
  onChangeCaption,
  readOnly,
}: Readonly<{
  kind: BridgeEmbedKind | string | undefined;
  url: string;
  caption?: string;
  onChangeCaption?: (next: string) => void;
  readOnly?: boolean;
}>) {
  const [live, setLive] = useState(false);
  const def = bridgeEmbedDef(kind);

  return (
    <div>
      <div
        style={{
          position: 'relative',
          borderRadius: 14,
          overflow: 'hidden',
          border: '1px solid rgba(0,0,0,0.08)',
          background: '#0B0F1A',
          aspectRatio: String(def.ratio),
        }}
      >
        {live ? (
          <>
            <iframe
              src={url}
              title={def.label}
              loading="lazy"
              allow="fullscreen"
              style={{ width: '100%', height: '100%', border: 0, display: 'block', background: '#fff' }}
            />
            <button
              type="button"
              onClick={() => setLive(false)}
              title="Close — this stops the table"
              className="absolute flex items-center justify-center rounded-full"
              style={{
                top: 8,
                right: 8,
                width: 28,
                height: 28,
                background: 'rgba(11,15,26,0.78)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.18)',
              }}
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setLive(true)}
            className="absolute inset-0 w-full h-full"
            style={{ padding: 0, border: 0, background: 'transparent', cursor: 'pointer', display: 'block' }}
            title={`Open ${def.label}`}
          >
            <TablePreview />
            {/* The scrim keeps the label legible over any felt. */}
            <span
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(180deg, rgba(11,15,26,0) 45%, rgba(11,15,26,0.72) 100%)',
              }}
            />
            <span
              className="flex items-center justify-center rounded-full"
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: 52,
                height: 52,
                background: 'rgba(255,255,255,0.94)',
                boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
              }}
            >
              <Play size={20} style={{ color: '#0B0F1A', marginLeft: 3 }} fill="#0B0F1A" />
            </span>
            <span
              style={{
                position: 'absolute',
                left: 12,
                right: 12,
                bottom: 10,
                textAlign: 'left',
                color: '#fff',
              }}
            >
              <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{def.label}</span>
              <span style={{ display: 'block', fontSize: 11.5, opacity: 0.82 }}>{def.blurb}</span>
            </span>
          </button>
        )}
      </div>

      {!readOnly && (
        <input
          value={caption || ''}
          onChange={(e) => onChangeCaption?.(e.target.value)}
          placeholder="Caption (optional)"
          className="w-full mt-2"
          style={{
            fontSize: 12.5,
            border: '1px solid rgba(0,0,0,0.08)',
            borderRadius: 10,
            padding: '7px 10px',
          }}
        />
      )}
      {readOnly && caption ? (
        <p style={{ fontSize: 12.5, color: '#6B7280', marginTop: 6 }}>{caption}</p>
      ) : null}

      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 mt-2"
        style={{ fontSize: 11.5, color: '#6B7280' }}
      >
        <ExternalLink size={11} /> Open in Bridge
      </a>
    </div>
  );
}

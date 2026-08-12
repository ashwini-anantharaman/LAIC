/**
 * Empty host-style container: paste a content URL and load it in an iframe.
 */
import React, { useState } from 'react';
import { ExternalLink, MonitorPlay } from 'lucide-react';
import { motion } from 'motion/react';

export function TestContainer() {
  const [url, setUrl] = useState('');
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    const raw = url.trim();
    if (!raw) {
      setError('Paste a content URL first.');
      setLoadedUrl(null);
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(raw, window.location.origin);
    } catch {
      setError('That does not look like a valid URL.');
      setLoadedUrl(null);
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      setError('Only http(s) URLs are allowed.');
      setLoadedUrl(null);
      return;
    }
    setLoadedUrl(parsed.toString());
  };

  return (
    <div className="px-4 sm:px-6 py-5 sm:py-6 w-full h-full flex flex-col gap-4 min-h-[calc(100vh-3.5rem)]">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-5 rounded-[24px]"
        style={{ background: 'white', boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)' }}
      >
        <div className="flex items-start gap-3 mb-4">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(11,15,26,0.06)' }}
          >
            <MonitorPlay size={18} className="text-[#0B1220]" />
          </div>
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 750, color: '#0B1220' }}>Test container</h1>
            <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4, maxWidth: 560 }}>
              Empty sample host. Paste a content URL (from Content Library → Copy link) to open that content in a frame — tutorials show all pages in one scroll.
            </p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <input
            type="url"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') load(); }}
            placeholder={`${window.location.origin}/o/obj-1`}
            className="flex-1 min-w-[220px] px-4 py-2.5 rounded-2xl outline-none"
            style={{
              background: 'rgba(0,0,0,0.03)',
              border: '1px solid rgba(0,0,0,0.08)',
              fontSize: 13.5,
              color: '#0B1220',
            }}
          />
          <button
            type="button"
            onClick={load}
            className="px-4 py-2.5 rounded-full text-white shrink-0"
            style={{ background: '#0B0F1A', fontSize: 13, fontWeight: 600 }}
          >
            Open in container
          </button>
          {loadedUrl && (
            <a
              href={loadedUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-full shrink-0"
              style={{ background: 'rgba(0,0,0,0.04)', fontSize: 12.5, fontWeight: 600, color: '#374151' }}
            >
              <ExternalLink size={13} /> Open tab
            </a>
          )}
        </div>
        {error && (
          <p style={{ fontSize: 12.5, color: '#B91C1C', marginTop: 8 }}>{error}</p>
        )}
      </motion.div>

      <div
        className="flex-1 rounded-[24px] overflow-hidden min-h-[420px] flex flex-col"
        style={{
          background: loadedUrl ? '#fff' : 'rgba(255,255,255,0.45)',
          border: '1px dashed rgba(0,0,0,0.12)',
          boxShadow: loadedUrl ? '0 4px 20px -8px rgba(30,50,80,0.12)' : 'none',
        }}
      >
        {loadedUrl ? (
          <iframe
            title="Content container"
            src={loadedUrl}
            className="w-full flex-1 min-h-[420px] border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center py-16">
            <p style={{ fontSize: 14, fontWeight: 600, color: '#9AA3AF' }}>Container is empty</p>
            <p style={{ fontSize: 12.5, color: '#C4CBD4', marginTop: 6, maxWidth: 320 }}>
              Load content URL to preview the embed here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

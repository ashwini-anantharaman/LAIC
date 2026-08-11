/**
 * Tutorial V2 Sources panel — UI clone of V1 ObjectCreator TutorialSource.
 * Forked into tutorialV2/ so the original Tutorial path stays untouched.
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Upload, ClipboardPaste, Link2, Youtube, MessageSquare, PenLine, FileText,
  X, AlertTriangle, ChevronRight, Image as ImageIcon, Loader2,
} from 'lucide-react';
import type { ParsedDoc } from '../../../../lib/pdf';
import type { YtTranscriptSegment } from '../../../../lib/api';
import { PullFromLibraryButton } from '../CDSources';

/** Pull the 11-char video id out of any common YouTube URL form (or a bare id). */
export function parseYtId(url: string): string {
  const raw = (url || '').trim();
  if (!raw) return '';
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  try {
    const u = new URL(raw.includes('://') ? raw : `https://${raw}`);
    const v = u.searchParams.get('v');
    if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
  } catch { /* fall through to regex */ }
  const m = raw.match(/(?:youtu\.be\/|youtube\.com\/(?:embed|shorts|live|v)\/|watch\?.*?v=)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : '';
}

/** "1:30" | "1:02:03" | "90" → seconds. Empty/invalid → undefined. */
export function parseTimestamp(str: string): number | undefined {
  const s = (str || '').trim();
  if (!s) return undefined;
  if (/^\d+$/.test(s)) return Number(s);
  const parts = s.split(':').map(p => Number(p));
  if (parts.some(n => Number.isNaN(n))) return undefined;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

export function fmtTimestamp(sec?: number): string {
  if (sec == null || !Number.isFinite(sec)) return '';
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}


export type PdfSrc = { id: string; file: File | null; doc: ParsedDoc | null };
export type TextSrc = { id: string; doc: ParsedDoc };
export type WebSrc = {
  id: string;
  url: string;
  doc: ParsedDoc;
  /** Content images harvested from the page (authoring image picker). */
  images?: { src: string; alt?: string; caption?: string }[];
};
export type YtSrc = {
  id: string;
  url: string;
  doc: ParsedDoc;
  segments: YtTranscriptSegment[];
  videoId: string;
  videoTitle: string;
};

export function newSrcId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const MATERIAL_SOURCE_MODES = [
  { id: 'pdf', label: 'Upload PDF', icon: <Upload size={15} /> },
  { id: 'text', label: 'Paste text', icon: <ClipboardPaste size={15} /> },
  { id: 'web', label: 'Website link', icon: <Link2 size={15} /> },
  { id: 'youtube', label: 'YouTube link', icon: <Youtube size={15} /> },
] as const;

const PATH_SOURCE_MODES = [
  { id: 'prompt', label: 'No source — AI prompt', icon: <MessageSquare size={15} /> },
  { id: 'manual', label: 'Write myself', icon: <PenLine size={15} /> },
] as const;

type MaterialSourceKind = (typeof MATERIAL_SOURCE_MODES)[number]['id'];

/* Shared "source is ready" summary card (pdf file pending parse / parsed doc). */
function SourceReadyCard({
  doc,
  file,
  onReplace,
}: {
  doc?: ParsedDoc | null;
  file?: File | null;
  onReplace: () => void;
}) {
  const name = doc?.fileName || file?.name || 'Source';
  const sub = doc
    ? `${doc.sentences.length} sentence${doc.sentences.length !== 1 ? 's' : ''} ready to mark up`
    : file
      ? `${(file.size / 1024).toFixed(0)} KB · text extracted in Mark up`
      : '';
  return (
    <div className="rounded-2xl border p-4" style={{ background: 'rgba(255,255,255,0.85)', borderColor: 'rgba(0,0,0,0.08)' }}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0" style={{ background: '#7C3AED' }}>
          <FileText size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p style={{ fontSize: 13.5, fontWeight: 650, color: '#0B1220' }} className="truncate">{name}</p>
          <p style={{ fontSize: 12, color: '#6B7280', fontFamily: 'monospace' }}>{sub}</p>
        </div>
        <button type="button" onClick={onReplace}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border shrink-0"
          style={{ fontSize: 12, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)' }}>
          <X size={12} />Remove
        </button>
      </div>
      {doc && doc.sentences.length === 0 && (
        <div className="flex items-start gap-2 mt-3 rounded-xl p-2.5" style={{ background: '#FEF3C7', border: '1px solid #FCD34D' }}>
          <AlertTriangle size={14} style={{ color: '#92400E', marginTop: 1 }} />
          <p style={{ fontSize: 12, color: '#92400E' }}>No usable text was found. Try another source so you can highlight sentences.</p>
        </div>
      )}
    </div>
  );
}

function ErrorNote({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 mt-3 rounded-2xl p-3" style={{ background: '#FEE2E2', border: '1px solid #FCA5A5' }}>
      <AlertTriangle size={15} style={{ color: '#B91C1C', marginTop: 1 }} />
      <p style={{ fontSize: 12.5, color: '#991B1B' }}>{text}</p>
    </div>
  );
}

/* Tutorial Step 1 — teaching sources (tabs) + optional media (right column). */
type SourceTab = MaterialSourceKind | 'prompt' | 'manual' | 'library';

function SourcesModal({
  title,
  onClose,
  onSave,
  saveLabel = 'Save',
  saveDisabled,
  children,
}: {
  title: string;
  onClose: () => void;
  onSave: () => void;
  saveLabel?: string;
  saveDisabled?: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // Portal to body — parent Sources step uses overflow-hidden + motion transform,
  // which traps position:fixed and lets the Cancel/Next bar cover Save.
  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: 'rgba(11,15,26,0.45)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-2xl border bg-white shadow-xl"
        style={{ borderColor: 'rgba(0,0,0,0.08)', maxHeight: 'min(86vh, 640px)', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#0B1220' }}>{title}</p>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ color: '#6B7280', background: 'rgba(0,0,0,0.04)' }}>
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto min-h-0 flex-1">{children}</div>
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t shrink-0" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-full border" style={{ fontSize: 13, color: '#374151', borderColor: 'rgba(0,0,0,0.1)' }}>
            Cancel
          </button>
          <button
            type="button"
            disabled={saveDisabled}
            onClick={onSave}
            className="px-5 py-2 rounded-full text-white"
            style={{ fontSize: 13, fontWeight: 600, background: saveDisabled ? '#E5E7EB' : '#7C3AED', color: saveDisabled ? '#9AA3AF' : '#fff' }}
          >
            {saveLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function TutorialV2SourcePanel(props: any) {
  const {
    pathMode, setPathMode,
    enabledTypes, toggleMaterialType,
    pdfSources, onRemovePdf, onFile,
    textSources, pasteText, setPasteText, onLoadText, onRemoveText,
    ytSources, ytUrl, setYtUrl, ytLoading, ytError, onFetchYoutube, onRemoveYoutube,
    ytPasteOpen, setYtPasteOpen, ytPasteText, setYtPasteText, onUseYoutubePaste,
    webSources, webUrl, setWebUrl, webLoading, webError, onFetchWeb, onRemoveWeb,
    promptText, setPromptText, expandPromptError, setExpandPromptError, showMedia, imagesOnly,
    media, addImagesFromFiles, addVideo, updateMedia, removeMedia,
    showManualWrite,
    objectNoun = 'content',
    librarySource,
    onPickLibrarySource,
  } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const bulkImageRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [imgDragOver, setImgDragOver] = useState(false);
  const [imagesOpen, setImagesOpen] = useState(false);
  const [clipsOpen, setClipsOpen] = useState(false);
  const [captionModal, setCaptionModal] = useState<{ id: string; caption: string } | null>(null);
  const [videoModal, setVideoModal] = useState<null | {
    id: string | null;
    url: string;
    startText: string;
    endText: string;
    caption: string;
    fullVideo: boolean;
  }>(null);

  const initialTab = ((): SourceTab => {
    if (pathMode === 'prompt' || pathMode === 'manual') return pathMode;
    if (librarySource) return 'library';
    if (enabledTypes?.has?.('pdf')) return 'pdf';
    if (enabledTypes?.has?.('text')) return 'text';
    if (enabledTypes?.has?.('web')) return 'web';
    if (enabledTypes?.has?.('youtube')) return 'youtube';
    return 'pdf';
  })();
  const [activeTab, setActiveTab] = useState<SourceTab>(initialTab);

  const pick = (files: FileList | null) => {
    if (!files?.length || !onFile) return;
    Array.from(files).forEach((f) => onFile(f));
  };
  const takeImageFiles = (list: FileList | File[] | null) => {
    if (!list || !addImagesFromFiles) return;
    const files = Array.from(list).filter(
      (f) => f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp|heic|heif)$/i.test(f.name),
    );
    if (files.length) {
      addImagesFromFiles(files);
      setImagesOpen(true);
    }
  };

  const imageMedia = (media || []).filter((m: any) => m.kind === 'image');
  const videoMedia = (media || []).filter((m: any) => m.kind === 'video');

  const selectTab = (tab: SourceTab) => {
    setActiveTab(tab);
    if (tab === 'prompt' || tab === 'manual') {
      setPathMode(tab);
      return;
    }
    setPathMode('material');
    if (tab !== 'library' && !enabledTypes.has(tab)) toggleMaterialType(tab);
  };

  const addedSources: { key: string; icon: React.ReactNode; name: string; onRemove: () => void }[] = [];
  for (const p of pdfSources || []) {
    addedSources.push({
      key: p.id,
      icon: <Upload size={13} />,
      name: p.doc?.fileName || p.file?.name || 'PDF',
      onRemove: () => onRemovePdf(p.id),
    });
  }
  for (const t of textSources || []) {
    addedSources.push({
      key: t.id,
      icon: <ClipboardPaste size={13} />,
      name: t.doc.fileName || 'Pasted notes',
      onRemove: () => onRemoveText(t.id),
    });
  }
  for (const w of webSources || []) {
    addedSources.push({
      key: w.id,
      icon: <Link2 size={13} />,
      name: w.doc.fileName || w.url || 'Website',
      onRemove: () => onRemoveWeb(w.id),
    });
  }
  for (const y of ytSources || []) {
    addedSources.push({
      key: y.id,
      icon: <Youtube size={13} />,
      name: y.doc.fileName || y.videoTitle || 'YouTube transcript',
      onRemove: () => onRemoveYoutube(y.id),
    });
  }
  if (librarySource) {
    addedSources.push({
      key: 'library',
      icon: <FileText size={13} />,
      name: librarySource.title,
      onRemove: () => onPickLibrarySource?.(null),
    });
  }

  const field: React.CSSProperties = {
    fontSize: 13,
    border: '1px solid rgba(0,0,0,0.1)',
    background: 'rgba(255,255,255,0.9)',
    outline: 'none',
  };

  const openVideoCreate = () => {
    setVideoModal({ id: null, url: '', startText: '', endText: '', caption: '', fullVideo: true });
    setClipsOpen(true);
  };
  const openVideoEdit = (m: any) => {
    const hasClip = !!(m.startText || m.endText);
    setVideoModal({
      id: m.id,
      url: m.url || '',
      startText: m.startText || '',
      endText: m.endText || '',
      caption: m.caption || '',
      fullVideo: m.fullVideo === true || !hasClip,
    });
    setClipsOpen(true);
  };
  const saveVideoModal = () => {
    if (!videoModal) return;
    const url = videoModal.url.trim();
    const videoId = parseYtId(url);
    if (!videoId) return;
    if (!videoModal.fullVideo) {
      const start = parseTimestamp(videoModal.startText);
      const end = parseTimestamp(videoModal.endText);
      if (start != null && end != null && end <= start) return;
    }
    const patch = {
      url,
      videoId,
      startText: videoModal.fullVideo ? '' : videoModal.startText.trim(),
      endText: videoModal.fullVideo ? '' : videoModal.endText.trim(),
      caption: videoModal.caption.trim(),
      fullVideo: !!videoModal.fullVideo,
    };
    if (videoModal.id) updateMedia(videoModal.id, patch);
    else addVideo(patch);
    setVideoModal(null);
  };
  const videoModalValid = (() => {
    if (!videoModal) return false;
    const id = parseYtId(videoModal.url.trim());
    if (!id) return false;
    if (videoModal.fullVideo) return true;
    const start = parseTimestamp(videoModal.startText);
    const end = parseTimestamp(videoModal.endText);
    if (start != null && end != null && end <= start) return false;
    return true;
  })();

  const tabs: { id: SourceTab; label: string; icon: React.ReactNode; hide?: boolean }[] = [
    ...MATERIAL_SOURCE_MODES.map((m) => ({ id: m.id as SourceTab, label: m.label, icon: m.icon })),
    ...PATH_SOURCE_MODES.map((m) => ({ id: m.id as SourceTab, label: m.label, icon: m.icon, hide: m.id === 'manual' && !showManualWrite })),
    { id: 'library', label: 'From Source Library', icon: <FileText size={15} />, hide: !onPickLibrarySource },
  ];

  const mediaCard = showMedia && pathMode === 'material' && (
    <div
      className="rounded-2xl border flex flex-col min-h-0 h-full overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.92)', borderColor: 'rgba(0,0,0,0.08)', boxShadow: '0 8px 28px -18px rgba(15,23,42,0.28)' }}
    >
      <div className="px-4 pt-4 pb-3 shrink-0" style={{ borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: '#0B1220' }}>Media to include · optional</p>
        <p style={{ fontSize: 12, color: '#6B7280', marginTop: 3, lineHeight: 1.45 }}>
          Optional images and clips placed into the generated tutorial — not learning sources
        </p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Images row */}
        <div style={{ borderBottom: !imagesOnly || imagesOpen ? '1px solid rgba(0,0,0,0.07)' : undefined }}>
          <button
            type="button"
            onClick={() => setImagesOpen((v) => !v)}
            className="w-full flex items-center gap-2.5 px-4 py-3.5"
          >
            <ChevronRight
              size={15}
              style={{
                color: '#9AA3AF', flexShrink: 0,
                transform: imagesOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.15s',
              }}
            />
            <span style={{ fontSize: 13.5, fontWeight: 600, color: '#0B1220', flex: 1, textAlign: 'left' }}>Images</span>
            <span style={{ fontSize: 13.5, fontWeight: 500, color: '#9AA3AF' }}>{imageMedia.length}</span>
          </button>
          {imagesOpen && (
            <div className="px-4 pb-4">
              <input
                ref={bulkImageRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => { takeImageFiles(e.target.files); e.target.value = ''; }}
              />
              {imageMedia.length === 0 ? (
                <button
                  type="button"
                  onClick={() => bulkImageRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setImgDragOver(true); }}
                  onDragLeave={() => setImgDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setImgDragOver(false); takeImageFiles(e.dataTransfer.files); }}
                  className="w-full rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 py-5"
                  style={{
                    borderColor: imgDragOver ? '#7C3AED' : 'rgba(0,0,0,0.12)',
                    background: imgDragOver ? 'rgba(124,58,237,0.05)' : 'rgba(247,249,251,0.9)',
                  }}
                >
                  <ImageIcon size={16} style={{ color: '#9AA3AF' }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Upload images</span>
                  <span style={{ fontSize: 11, color: '#9AA3AF' }}>Click a thumbnail to add a caption</span>
                </button>
              ) : (
                <div
                  className="flex flex-wrap gap-2"
                  onDragOver={(e) => { e.preventDefault(); setImgDragOver(true); }}
                  onDragLeave={() => setImgDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setImgDragOver(false); takeImageFiles(e.dataTransfer.files); }}
                >
                  {imageMedia.map((m: any) => (
                    <div key={m.id} className="relative" style={{ width: 72, height: 72 }}>
                      <button
                        type="button"
                        onClick={() => setCaptionModal({ id: m.id, caption: m.caption || '' })}
                        className="relative rounded-xl overflow-hidden w-full h-full"
                        style={{
                          background: '#F3F4F6',
                          border: m.caption ? '2px solid #7C3AED' : '1.5px solid rgba(0,0,0,0.1)',
                        }}
                        title={m.caption ? `Caption: ${m.caption}` : 'Add caption'}
                      >
                        {m.uploading ? (
                          <div className="w-full h-full flex items-center justify-center" style={{ color: '#7C3AED' }}>
                            <Loader2 size={16} className="animate-spin" />
                          </div>
                        ) : m.url ? (
                          <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center" style={{ fontSize: 10, fontWeight: 600, color: '#9AA3AF' }}>No image</div>
                        )}
                        {m.caption ? (
                          <span className="absolute bottom-0 inset-x-0 px-1 py-0.5 truncate" style={{ fontSize: 9, fontWeight: 600, color: '#fff', background: 'rgba(0,0,0,0.55)' }}>
                            {m.caption}
                          </span>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeMedia(m.id); }}
                        title="Remove image"
                        aria-label="Remove image"
                        className="absolute flex items-center justify-center rounded-full"
                        style={{
                          top: -6, right: -6, width: 20, height: 20, zIndex: 2,
                          background: '#0B1220', color: '#fff',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                        }}
                      >
                        <X size={11} strokeWidth={2.5} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => bulkImageRef.current?.click()}
                    className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-0.5"
                    style={{ width: 72, height: 72, borderColor: 'rgba(0,0,0,0.14)', color: '#6B7280' }}
                  >
                    <Upload size={14} />
                    <span style={{ fontSize: 10, fontWeight: 600 }}>Add more</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* YouTube clips row */}
        {!imagesOnly && (
          <div>
            <button
              type="button"
              onClick={() => setClipsOpen((v) => !v)}
              className="w-full flex items-center gap-2.5 px-4 py-3.5"
              style={{ borderBottom: clipsOpen ? '1px solid rgba(0,0,0,0.07)' : undefined }}
            >
              <ChevronRight
                size={15}
                style={{
                  color: '#9AA3AF', flexShrink: 0,
                  transform: clipsOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.15s',
                }}
              />
              <span style={{ fontSize: 13.5, fontWeight: 600, color: '#0B1220', flex: 1, textAlign: 'left' }}>YouTube clips</span>
              <span style={{ fontSize: 13.5, fontWeight: 500, color: '#9AA3AF' }}>{videoMedia.length}</span>
            </button>
            {clipsOpen && (
              <div className="px-4 pb-4 space-y-2">
                <button
                  type="button"
                  onClick={openVideoCreate}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border"
                  style={{ fontSize: 12, fontWeight: 600, color: '#0B1220', borderColor: 'rgba(0,0,0,0.12)', background: 'rgba(255,255,255,0.9)' }}
                >
                  <Youtube size={13} style={{ color: '#EF4444' }} />Add YouTube video
                </button>
                {videoMedia.map((m: any) => (
                  <div
                    key={m.id}
                    className="relative rounded-xl border px-3 py-2.5 pr-9"
                    style={{ borderColor: 'rgba(0,0,0,0.08)', background: 'rgba(247,249,251,0.9)' }}
                  >
                    <button type="button" onClick={() => openVideoEdit(m)} className="w-full min-w-0 text-left">
                      <p style={{ fontSize: 12.5, fontWeight: 650, color: '#0B1220' }} className="truncate">
                        {m.caption || m.videoId || 'YouTube clip'}
                      </p>
                      <p style={{ fontSize: 11, color: '#6B7280' }} className="truncate">
                        {m.fullVideo || (!m.startText && !m.endText)
                          ? 'Full video'
                          : [m.startText && `Start ${m.startText}`, m.endText && `End ${m.endText}`].filter(Boolean).join(' · ') || m.url || 'No link yet'}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeMedia(m.id)}
                      title="Remove clip"
                      aria-label="Remove clip"
                      className="absolute flex items-center justify-center rounded-full"
                      style={{
                        top: 6, right: 6, width: 22, height: 22,
                        background: '#0B1220', color: '#fff',
                      }}
                    >
                      <X size={12} strokeWidth={2.5} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col px-5 pt-4 pb-3">
      <div
        className={`flex-1 min-h-0 grid gap-4 items-stretch ${
          showMedia && pathMode === 'material'
            ? 'grid-cols-1 md:grid-cols-[minmax(0,1.55fr)_minmax(260px,340px)]'
            : 'grid-cols-1'
        }`}
      >
        {/* LEFT — Teaching sources */}
        <div className="min-h-0 flex flex-col overflow-hidden">
          <div className="shrink-0 mb-3">
            <p style={{ fontSize: 16, fontWeight: 750, color: '#0B1220' }}>Teaching sources</p>
            <p style={{ fontSize: 12.5, color: '#6B7280', marginTop: 2 }}>
              The material Mark up extracts from — add at least one
            </p>
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-2 shrink-0 mb-3">
            {tabs.filter((t) => !t.hide).map((t) => {
              const on = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectTab(t.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all shrink-0"
                  style={{
                    fontSize: 12.5,
                    fontWeight: on ? 650 : 500,
                    background: on ? '#7C3AED' : 'rgba(255,255,255,0.85)',
                    color: on ? '#fff' : '#374151',
                    borderColor: on ? '#7C3AED' : 'rgba(0,0,0,0.1)',
                  }}
                >
                  {t.icon}{t.label}
                </button>
              );
            })}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl border p-4" style={{ background: 'rgba(255,255,255,0.88)', borderColor: 'rgba(0,0,0,0.07)' }}>
            {activeTab === 'pdf' && (
              <div className="space-y-3">
                <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
                {(pdfSources || []).map((p: PdfSrc) => (
                  <SourceReadyCard key={p.id} doc={p.doc} file={p.file} onReplace={() => onRemovePdf(p.id)} />
                ))}
                <button type="button" onClick={() => inputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setDragOver(false); pick(e.dataTransfer.files); }}
                  className="w-full flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed"
                  style={{ padding: (pdfSources || []).length ? '22px 20px' : '36px 20px', borderColor: dragOver ? '#7C3AED' : 'rgba(0,0,0,0.14)', background: dragOver ? 'rgba(124,58,237,0.05)' : 'rgba(247,249,251,0.9)' }}>
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white" style={{ background: '#7C3AED' }}><Upload size={20} /></div>
                  <p style={{ fontSize: 14, fontWeight: 650, color: '#0B1220' }}>{(pdfSources || []).length ? 'Add another PDF' : 'Drop a PDF here or click to attach'}</p>
                  <p style={{ fontSize: 12, color: '#9AA3AF' }}>PDF only · parsed in Mark up · you can add several</p>
                </button>
              </div>
            )}

            {activeTab === 'text' && (
              <div className="space-y-3">
                {(textSources || []).map((t: TextSrc) => (
                  <SourceReadyCard key={t.id} doc={t.doc} onReplace={() => onRemoveText(t.id)} />
                ))}
                <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={8}
                  placeholder={(textSources || []).length ? 'Paste another source…' : 'Paste your source text here…'}
                  className="w-full rounded-2xl px-3 py-2.5 resize-y" style={{ ...field, lineHeight: 1.6 }} />
                <div className="flex items-center justify-between">
                  <span style={{ fontSize: 11.5, color: '#9AA3AF' }}>{pasteText.trim() ? `${pasteText.trim().split(/\s+/).length} words` : 'Notes, an article, a transcript…'}</span>
                  <button type="button" onClick={onLoadText} disabled={!pasteText.trim()}
                    className="px-4 py-2 rounded-full"
                    style={{ fontSize: 12.5, fontWeight: 600, background: pasteText.trim() ? '#0B0F1A' : '#E5E7EB', color: pasteText.trim() ? '#fff' : '#9AA3AF' }}>
                    {(textSources || []).length ? 'Add this text →' : 'Use this text →'}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'web' && (
              <div className="space-y-3">
                <p style={{ fontSize: 12.5, fontWeight: 650, color: '#374151' }}>Paste a public website link</p>
                {(webSources || []).map((w: WebSrc) => (
                  <SourceReadyCard key={w.id} doc={w.doc} onReplace={() => onRemoveWeb(w.id)} />
                ))}
                <div className="flex gap-2">
                  <input value={webUrl || ''} onChange={(e) => setWebUrl(e.target.value)} placeholder="https://example.com/article…"
                    className="flex-1 rounded-xl px-3 py-2.5" style={field}
                    onKeyDown={(e) => { if (e.key === 'Enter' && webUrl?.trim() && !webLoading) onFetchWeb(); }} />
                  <button type="button" onClick={onFetchWeb} disabled={!webUrl?.trim() || webLoading}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white shrink-0"
                    style={{ background: '#0B0F1A', fontSize: 12.5, fontWeight: 600, opacity: (!webUrl?.trim() || webLoading) ? 0.7 : 1 }}>
                    {webLoading ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={14} />}{webLoading ? 'Fetching…' : ((webSources || []).length ? 'Add site' : 'Fetch')}
                  </button>
                </div>
                <p style={{ fontSize: 11.5, color: '#9AA3AF' }}>Public pages only · you can add more than one site</p>
                {webError && <ErrorNote text={webError} />}
              </div>
            )}

            {activeTab === 'youtube' && (
              <div className="space-y-3">
                {(ytSources || []).map((y: YtSrc) => (
                  <SourceReadyCard key={y.id} doc={y.doc} onReplace={() => onRemoveYoutube(y.id)} />
                ))}
                <div className="flex gap-2">
                  <input value={ytUrl} onChange={(e) => setYtUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…"
                    className="flex-1 rounded-xl px-3 py-2.5" style={field}
                    onKeyDown={(e) => { if (e.key === 'Enter' && ytUrl.trim() && !ytLoading) onFetchYoutube(); }} />
                  <button type="button" onClick={onFetchYoutube} disabled={!ytUrl.trim() || ytLoading}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white shrink-0"
                    style={{ background: '#0B0F1A', fontSize: 12.5, fontWeight: 600, opacity: (!ytUrl.trim() || ytLoading) ? 0.7 : 1 }}>
                    {ytLoading ? <Loader2 size={13} className="animate-spin" /> : <Youtube size={14} />}{ytLoading ? 'Fetching…' : ((ytSources || []).length ? 'Add transcript' : 'Fetch transcript')}
                  </button>
                </div>
                <p style={{ fontSize: 11.5, color: '#9AA3AF' }}>Pulls the transcript for Mark up · add multiple videos if needed</p>
                {ytError && <ErrorNote text={ytError} />}
                {/* YouTube refuses captions to our server for some videos even
                    though the author can see them. Pasting is the way through,
                    and timestamps survive so video-script checkpoints work. */}
                {(ytError || ytPasteOpen) && (
                  <div className="rounded-2xl p-3" style={{ background: 'rgba(247,249,251,0.9)', border: '1px solid rgba(0,0,0,0.08)' }}>
                    {!ytPasteOpen ? (
                      <button
                        type="button"
                        onClick={() => setYtPasteOpen(true)}
                        className="px-3 py-1.5 rounded-full border"
                        style={{ fontSize: 12, fontWeight: 650, borderColor: 'rgba(0,0,0,0.14)', background: '#fff' }}
                      >
                        Paste the transcript instead →
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <p style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>
                          On the video, open <strong>…more → Show transcript</strong>, select it all and copy.
                          Timestamps are fine — they’re kept so checkpoints still line up.
                        </p>
                        <textarea
                          value={ytPasteText}
                          onChange={(e) => setYtPasteText(e.target.value)}
                          rows={7}
                          placeholder={'0:00  Welcome to the lesson…\n0:14  Each player gets thirteen cards…'}
                          className="w-full rounded-2xl px-3 py-2.5 resize-y"
                          style={{ ...field, lineHeight: 1.6 }}
                        />
                        <div className="flex items-center justify-between gap-2">
                          <span style={{ fontSize: 11.5, color: '#9AA3AF' }}>
                            {ytPasteText.trim() ? `${ytPasteText.trim().split(/\s+/).length} words` : 'Paste the copied transcript'}
                          </span>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => { setYtPasteOpen(false); setYtPasteText(''); }}
                              className="px-3 py-2 rounded-full border"
                              style={{ fontSize: 12.5, fontWeight: 600, borderColor: 'rgba(0,0,0,0.12)', background: '#fff' }}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={onUseYoutubePaste}
                              disabled={!ytPasteText.trim() || ytLoading}
                              className="px-4 py-2 rounded-full text-white disabled:opacity-50"
                              style={{ fontSize: 12.5, fontWeight: 600, background: '#0B0F1A' }}
                            >
                              Use this transcript →
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'prompt' && (
              <div>
                <p style={{ fontSize: 13, color: '#4C1D95', lineHeight: 1.55, marginBottom: 10 }}>
                  Describe what the content should teach. We generate markable source text from your prompt.
                </p>
                <textarea
                  value={promptText}
                  onChange={(e) => {
                    setPromptText(e.target.value);
                    if (expandPromptError) setExpandPromptError?.(null);
                  }}
                  rows={8}
                  placeholder={`e.g. 'A beginner ${objectNoun} on how contract bridge bidding works…'`}
                  className="w-full rounded-2xl px-3 py-2.5 resize-y"
                  style={{ ...field, lineHeight: 1.6 }}
                />
                {expandPromptError && (
                  <div className="flex items-start gap-2 mt-3 rounded-2xl p-3" style={{ background: '#FEE2E2', border: '1px solid #FCA5A5' }}>
                    <AlertTriangle size={14} style={{ color: '#B91C1C', marginTop: 1 }} />
                    <p style={{ fontSize: 12.5, color: '#991B1B' }}>{expandPromptError}</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'manual' && (
              <div className="rounded-2xl p-4 border" style={{ background: 'rgba(124,58,237,0.05)', borderColor: 'rgba(124,58,237,0.2)' }}>
                <p style={{ fontSize: 13.5, fontWeight: 650, color: '#0B1220', marginBottom: 6 }}>Hand-write from a template</p>
                <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.55 }}>
                  Next we open a blank {objectNoun} shaped like the Template Library default — nothing is generated. Change the default in Template Library anytime.
                </p>
              </div>
            )}

            {activeTab === 'library' && onPickLibrarySource && (
              <div>
                {librarySource ? (
                  <div className="rounded-2xl border p-4" style={{ background: 'rgba(255,255,255,0.9)', borderColor: 'rgba(124,58,237,0.25)' }}>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0" style={{ background: '#7C3AED' }}>
                        <FileText size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p style={{ fontSize: 13.5, fontWeight: 650, color: '#0B1220' }} className="truncate">{librarySource.title}</p>
                        <p style={{ fontSize: 12, color: '#6B7280' }}>From Source Library · {librarySource.kind}</p>
                      </div>
                      <button type="button" onClick={() => onPickLibrarySource(null)} className="px-3 py-1.5 rounded-full border text-xs" style={{ color: '#374151', borderColor: 'rgba(0,0,0,0.1)' }}>
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-start gap-3">
                    <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.5 }}>
                      Pull an existing source from your library into this {objectNoun}.
                    </p>
                    <PullFromLibraryButton onPick={(src) => onPickLibrarySource(src)} />
                  </div>
                )}
              </div>
            )}

            {/* Added sources */}
            {addedSources.length > 0 && (
              <div className="mt-5 pt-4" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: 12.5, fontWeight: 650, color: '#374151', marginBottom: 8 }}>Added sources</p>
                <div className="space-y-1.5">
                  {addedSources.map((s) => (
                    <div
                      key={s.key}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl border"
                      style={{ background: 'rgba(247,249,251,0.95)', borderColor: 'rgba(0,0,0,0.07)' }}
                    >
                      <span style={{ color: '#6B7280' }}>{s.icon}</span>
                      <span className="flex-1 min-w-0 truncate" style={{ fontSize: 12.5, fontWeight: 600, color: '#0B1220' }}>{s.name}</span>
                      <span className="px-2 py-0.5 rounded-full shrink-0" style={{ fontSize: 10.5, fontWeight: 650, color: '#059669', background: 'rgba(5,150,105,0.1)' }}>✓ ready</span>
                      <button type="button" onClick={s.onRemove} className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center" style={{ color: '#9AA3AF' }} title="Remove">
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — Media (side panel beside Teaching sources) */}
        {mediaCard && (
          <div className="min-h-0 md:h-full flex flex-col">
            {mediaCard}
          </div>
        )}
      </div>

      {/* Caption modal */}
      {captionModal && (() => {
        const img = imageMedia.find((m: any) => m.id === captionModal.id);
        if (!img) return null;
        return (
          <SourcesModal
            title="Image caption"
            onClose={() => setCaptionModal(null)}
            onSave={() => {
              updateMedia(captionModal.id, { caption: captionModal.caption.trim() });
              setCaptionModal(null);
            }}
          >
            {img.url ? (
              <div className="rounded-xl overflow-hidden mb-3 border" style={{ borderColor: 'rgba(0,0,0,0.08)', background: '#F3F4F6' }}>
                <img src={img.url} alt="" style={{ width: '100%', maxHeight: 220, objectFit: 'contain', display: 'block' }} />
              </div>
            ) : null}
            <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 6 }} className="truncate">
              {img.fileName || 'Selected image'}
            </p>
            <label style={{ fontSize: 11.5, fontWeight: 650, color: '#6B7280', display: 'block', marginBottom: 4 }}>Caption</label>
            <input
              autoFocus
              value={captionModal.caption}
              onChange={(e) => setCaptionModal({ ...captionModal, caption: e.target.value })}
              placeholder={imagesOnly
                ? 'Optional caption hint for vision'
                : 'Caption shown under this image in the tutorial'}
              className="w-full rounded-xl px-3 py-2.5"
              style={field}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  updateMedia(captionModal.id, { caption: captionModal.caption.trim() });
                  setCaptionModal(null);
                }
              }}
            />
            <button
              type="button"
              onClick={() => { removeMedia(captionModal.id); setCaptionModal(null); }}
              className="mt-3 text-xs font-semibold"
              style={{ color: '#B91C1C' }}
            >
              Remove image
            </button>
          </SourcesModal>
        );
      })()}

      {/* YouTube clip modal */}
      {videoModal && (
        <SourcesModal
          title={videoModal.id ? 'Edit YouTube video' : 'Add YouTube video'}
          onClose={() => setVideoModal(null)}
          onSave={saveVideoModal}
          saveDisabled={!videoModalValid}
        >
          <label style={{ fontSize: 11.5, fontWeight: 650, color: '#6B7280', display: 'block', marginBottom: 4 }}>YouTube link</label>
          <input
            autoFocus
            value={videoModal.url}
            onChange={(e) => setVideoModal({ ...videoModal, url: e.target.value })}
            placeholder="Paste a YouTube link"
            className="w-full rounded-xl px-3 py-2.5 mb-1"
            style={field}
          />
          {videoModal.url.trim() && !parseYtId(videoModal.url.trim()) && (
            <p style={{ fontSize: 12, color: '#DC2626', marginBottom: 8 }}>Paste a full YouTube link (or 11-character video id) to enable Save.</p>
          )}
          {!videoModal.url.trim() && (
            <p style={{ fontSize: 12, color: '#9AA3AF', marginBottom: 8 }}>Save unlocks once a valid YouTube link is pasted.</p>
          )}
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => setVideoModal({ ...videoModal, fullVideo: true, startText: '', endText: '' })}
              className="flex-1 px-3 py-2 rounded-xl border"
              style={{
                fontSize: 12.5, fontWeight: 650,
                background: videoModal.fullVideo ? '#7C3AED' : 'rgba(255,255,255,0.9)',
                color: videoModal.fullVideo ? '#fff' : '#374151',
                borderColor: videoModal.fullVideo ? '#7C3AED' : 'rgba(0,0,0,0.1)',
              }}
            >
              Full video
            </button>
            <button
              type="button"
              onClick={() => setVideoModal({ ...videoModal, fullVideo: false })}
              className="flex-1 px-3 py-2 rounded-xl border"
              style={{
                fontSize: 12.5, fontWeight: 650,
                background: !videoModal.fullVideo ? '#7C3AED' : 'rgba(255,255,255,0.9)',
                color: !videoModal.fullVideo ? '#fff' : '#374151',
                borderColor: !videoModal.fullVideo ? '#7C3AED' : 'rgba(0,0,0,0.1)',
              }}
            >
              Clip
            </button>
          </div>
          {!videoModal.fullVideo && (
            <>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 650, color: '#6B7280', display: 'block', marginBottom: 4 }}>Start (m:ss)</label>
                  <input
                    value={videoModal.startText}
                    onChange={(e) => setVideoModal({ ...videoModal, startText: e.target.value, fullVideo: false })}
                    placeholder="0:00"
                    className="w-full rounded-xl px-3 py-2.5"
                    style={field}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 650, color: '#6B7280', display: 'block', marginBottom: 4 }}>End (m:ss)</label>
                  <input
                    value={videoModal.endText}
                    onChange={(e) => setVideoModal({ ...videoModal, endText: e.target.value, fullVideo: false })}
                    placeholder="e.g. 2:30"
                    className="w-full rounded-xl px-3 py-2.5"
                    style={field}
                  />
                </div>
              </div>
              {(() => {
                const start = parseTimestamp(videoModal.startText);
                const end = parseTimestamp(videoModal.endText);
                if (start != null && end != null && end <= start) {
                  return <p style={{ fontSize: 12, color: '#DC2626', marginBottom: 8 }}>End time must be after the start time.</p>;
                }
                return null;
              })()}
            </>
          )}
          {videoModal.fullVideo && (
            <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>The whole video will be embedded — no start/end trim.</p>
          )}
          <label style={{ fontSize: 11.5, fontWeight: 650, color: '#6B7280', display: 'block', marginBottom: 4 }}>Caption</label>
          <input
            value={videoModal.caption}
            onChange={(e) => setVideoModal({ ...videoModal, caption: e.target.value })}
            placeholder="Caption for this video in the tutorial"
            className="w-full rounded-xl px-3 py-2.5"
            style={field}
          />
        </SourcesModal>
      )}

    </div>
  );
}


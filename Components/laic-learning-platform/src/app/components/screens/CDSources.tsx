import React, { useEffect, useMemo, useState } from 'react';
import {
  Boxes, FolderOpen, FileText, Video, Link, Mic, Youtube, FileSpreadsheet,
  PenLine, NotebookPen, StickyNote, Search, Plus, Share2, Eye, X, Check,
  BookOpen, Library, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  getSourceCollections,
  setSourceCollections,
  subscribeSourceCollections,
  type CollectionSource,
  type SourceCollectionLocal,
  type PickedLibrarySource,
} from '../../../lib/sourceLibraryStore';
import { useIsMobile } from '../ui/use-mobile';
import { isNexusMobileShell } from '../../../lib/nexus';

export type { CollectionSource, SourceCollectionLocal, PickedLibrarySource };

const SCOPE_COLORS: Record<string, { bg: string; text: string }> = {
  Private: { bg: '#F3F4F6', text: '#374151' },
  Team: { bg: '#EFF6FF', text: '#1D4ED8' },
  Program: { bg: '#F0FDF4', text: '#15803D' },
  Organization: { bg: '#F3E8FF', text: '#7C3AED' },
};

const PURPOSE_COLORS = {
  Generation: { bg: '#F3E8FF', text: '#7C3AED' },
  Embeddings: { bg: '#E0F2FE', text: '#0C4A6E' },
};

const ROLE_COLORS = {
  Primary: { bg: '#DCFCE7', text: '#15803D' },
  Supporting: { bg: '#FEF3C7', text: '#92400E' },
  Reference: { bg: '#F3F4F6', text: '#374151' },
};

const ROLE_DESCS = {
  Primary: 'Drives the object',
  Supporting: 'Backs it up',
  Reference: 'Might use',
};

const SOURCE_KINDS = [
  { id: 'PDF document', icon: <FileText size={18} />, purpose: 'Generation' as const },
  { id: 'PowerPoint', icon: <FileSpreadsheet size={18} />, purpose: 'Generation' as const },
  { id: 'Audio file', icon: <Mic size={18} />, purpose: 'Embeddings' as const },
  { id: 'Video file', icon: <Video size={18} />, purpose: 'Embeddings' as const },
  { id: 'YouTube video', icon: <Youtube size={18} />, purpose: 'Embeddings' as const },
  { id: 'Google Doc', icon: <BookOpen size={18} />, purpose: 'Generation' as const },
  { id: 'Web link', icon: <Link size={18} />, purpose: 'Embeddings' as const },
  { id: 'Import Quizlet', icon: <NotebookPen size={18} />, purpose: 'Generation' as const },
  { id: 'Paste notes', icon: <PenLine size={18} />, purpose: 'Generation' as const },
  { id: 'Handwritten notes', icon: <PenLine size={18} />, purpose: 'Generation' as const },
  { id: 'Blank notes', icon: <StickyNote size={18} />, purpose: 'Generation' as const },
];

/* ─── modals ──────────────────────────────────────────────────── */

function ViewModal({ source, onClose }: { source: CollectionSource; onClose: () => void }) {
  const [instruction, setInstruction] = useState('');
  const [saved, setSaved] = useState(false);
  const isMedia = source.kind === 'Video transcript' || source.kind === 'Audio file' || source.kind === 'YouTube video';

  const save = () => {
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 900);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(11,18,32,0.45)', backdropFilter: 'blur(4px)' }}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-[28px] overflow-hidden"
        style={{ background: 'white', boxShadow: '0 24px 64px -16px rgba(30,50,80,0.3)' }}
      >
        <div className="p-5 border-b" style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
          <div className="flex items-start justify-between gap-3 mb-1">
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0B1220' }}>{source.title}</h3>
            <button type="button" onClick={onClose}><X size={16} style={{ color: '#9AA3AF' }} /></button>
          </div>
          <p style={{ fontSize: 12.5, color: '#9AA3AF' }}>
            {source.kind}
            {source.pages ? ` · ${source.pages} pages` : ''}
            {source.duration ? ` · ${source.duration}` : ''}
          </p>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: ROLE_COLORS[source.role].bg, color: ROLE_COLORS[source.role].text }}>{source.role}</span>
            <span style={{ fontSize: 12.5, color: '#6B7280' }}>{ROLE_DESCS[source.role]}</span>
          </div>
          <div className="rounded-2xl p-4" style={{ background: '#F9FAFB', border: '1px solid rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.6 }}>
              {isMedia
                ? 'Media source — the transcript is indexed for search and citation. Scrub to a timestamp to pull a quote into an object.'
                : 'Text is parsed into pages and headings. Select any passage to cite it verbatim in a learning object, with a page reference kept automatically.'}
            </p>
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#0B1220', marginBottom: 6 }}>✦ Tell the AI how to use this source</p>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={3}
              placeholder="e.g. Use the definition from p.4, but swap in a fresher everyday example."
              className="w-full rounded-2xl px-3 py-2.5 resize-none"
              style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', outline: 'none', background: 'rgba(0,0,0,0.02)' }}
            />
          </div>
        </div>
        <div className="flex gap-2 p-4 border-t" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-full" style={{ background: 'rgba(0,0,0,0.05)', fontSize: 13, fontWeight: 600, color: '#374151' }}>Close</button>
          <button
            type="button"
            onClick={save}
            className="flex-1 py-2.5 rounded-full text-white flex items-center justify-center gap-1.5"
            style={{ background: saved ? '#059669' : '#0B0F1A', fontSize: 13, fontWeight: 600 }}
          >
            {saved ? <><Check size={13} />Saved!</> : '✓ Save instruction'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function AddModal({ onClose, onAdd }: { onClose: () => void; onAdd: (src: CollectionSource) => void }) {
  const [stage, setStage] = useState<'kind' | 'config'>('kind');
  const [selKinds, setSelKinds] = useState<(typeof SOURCE_KINDS)[0][]>([]);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState<'Generation' | 'Embeddings'>('Generation');

  const toggleKind = (k: (typeof SOURCE_KINDS)[0]) => {
    setSelKinds((prev) => {
      const on = prev.some((x) => x.id === k.id);
      return on ? prev.filter((x) => x.id !== k.id) : [...prev, k];
    });
  };

  const goConfig = () => {
    if (!selKinds.length) return;
    setPurpose(selKinds[0].purpose);
    setStage('config');
  };

  const doAdd = () => {
    if (!selKinds.length || !name.trim()) return;
    const base = name.trim();
    const stamp = Date.now();
    selKinds.forEach((k, i) => {
      onAdd({
        id: `s-${stamp}-${i}`,
        title: selKinds.length === 1 ? base : `${base} (${k.id})`,
        kind: k.id,
        purpose,
        role: 'Supporting',
      });
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(11,18,32,0.45)', backdropFilter: 'blur(4px)' }}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg rounded-[28px] overflow-hidden"
        style={{ background: 'white', boxShadow: '0 24px 64px -16px rgba(30,50,80,0.3)' }}
      >
        <div className="p-5 border-b flex items-start justify-between" style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0B1220' }}>Add a source</h3>
            <p style={{ fontSize: 13, color: '#9AA3AF', marginTop: 2 }}>
              Pick one or more types — every source is used for generation or embeddings.
            </p>
          </div>
          <button type="button" onClick={onClose}><X size={16} style={{ color: '#9AA3AF' }} /></button>
        </div>
        <div className="p-5">
          {stage === 'kind' ? (
            <>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#0B1220', marginBottom: 12 }}>
                What are you bringing in?{' '}
                <span style={{ fontWeight: 500, color: '#9AA3AF' }}>Select all that apply</span>
              </p>
              <div className="grid grid-cols-3 gap-2">
                {SOURCE_KINDS.map((k) => {
                  const on = selKinds.some((x) => x.id === k.id);
                  return (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => toggleKind(k)}
                      className="flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all"
                      style={{
                        background: on ? 'rgba(124,58,237,0.08)' : 'rgba(0,0,0,0.02)',
                        borderColor: on ? '#7C3AED' : 'rgba(0,0,0,0.08)',
                      }}
                    >
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: on ? 'rgba(124,58,237,0.15)' : '#F3F4F6', color: '#374151' }}>{k.icon}</div>
                      <span style={{ fontSize: 11.5, color: '#374151', textAlign: 'center', lineHeight: 1.3 }}>{k.id}</span>
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-end mt-4">
                <button
                  type="button"
                  onClick={goConfig}
                  disabled={!selKinds.length}
                  className="px-4 py-2 rounded-full"
                  style={{ fontSize: 13, fontWeight: 600, background: selKinds.length ? '#0B0F1A' : '#E5E7EB', color: selKinds.length ? '#fff' : '#9AA3AF' }}
                >
                  Continue{selKinds.length > 1 ? ` (${selKinds.length} types)` : ''} →
                </button>
              </div>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setStage('kind')} className="flex items-center gap-1.5 mb-4 text-sm" style={{ color: '#6B7280' }}>
                ← {selKinds.map((k) => k.id).join(', ')}
              </button>
              <div className="mb-4">
                <p style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  {selKinds.length > 1 ? 'Shared name (each type gets a label)' : 'Name or URL'}
                </p>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={selKinds.length === 1 ? `${selKinds[0]?.id} name or link` : 'e.g. Week 3 lecture materials'}
                  className="w-full rounded-2xl px-4 py-2.5"
                  style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', outline: 'none' }}
                />
              </div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                How will {selKinds.length > 1 ? 'these sources' : 'this source'} be used?
              </p>
              <div className="grid grid-cols-2 gap-3">
                {(['Generation', 'Embeddings'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPurpose(p)}
                    className="p-3 rounded-2xl border-2 text-left transition-all"
                    style={{
                      background: purpose === p ? (p === 'Generation' ? 'rgba(124,58,237,0.06)' : 'rgba(14,165,233,0.06)') : 'transparent',
                      borderColor: purpose === p ? (p === 'Generation' ? '#7C3AED' : '#0EA5E9') : 'rgba(0,0,0,0.08)',
                    }}
                  >
                    <p style={{ fontSize: 13, fontWeight: 650, color: '#0B1220', marginBottom: 2 }}>{p}</p>
                    <p style={{ fontSize: 12, color: '#9AA3AF' }}>
                      {p === 'Generation' ? 'Authored directly into content by the AI + you' : 'Indexed for retrieval / semantic search (RAG)'}
                    </p>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        {stage === 'config' && (
          <div className="flex gap-2 p-4 border-t" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-full" style={{ background: 'rgba(0,0,0,0.05)', fontSize: 13, fontWeight: 600, color: '#374151' }}>Cancel</button>
            <button
              type="button"
              onClick={doAdd}
              disabled={!name.trim()}
              className="flex-1 py-2.5 rounded-full text-white flex items-center justify-center gap-1.5"
              style={{ background: name.trim() ? '#0B0F1A' : '#E5E7EB', color: name.trim() ? '#fff' : '#9AA3AF', fontSize: 13, fontWeight: 600 }}
            >
              <Plus size={13} />Add {selKinds.length > 1 ? `${selKinds.length} sources` : 'source'}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function NewCollectionModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(11,18,32,0.45)', backdropFilter: 'blur(4px)' }}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm rounded-[28px] overflow-hidden"
        style={{ background: 'white', boxShadow: '0 24px 64px -16px rgba(30,50,80,0.3)' }}
      >
        <div className="p-5 border-b" style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0B1220' }}>New collection</h3>
          <p style={{ fontSize: 13, color: '#9AA3AF', marginTop: 2 }}>Group sources you’ll reuse across objects and courses.</p>
        </div>
        <div className="p-5">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) onCreate(name.trim());
            }}
            placeholder="e.g. Bidding references"
            className="w-full rounded-2xl px-4 py-2.5"
            style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', outline: 'none' }}
          />
        </div>
        <div className="flex gap-2 p-4 border-t" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-full" style={{ background: 'rgba(0,0,0,0.05)', fontSize: 13, fontWeight: 600, color: '#374151' }}>Cancel</button>
          <button
            type="button"
            disabled={!name.trim()}
            onClick={() => onCreate(name.trim())}
            className="flex-1 py-2.5 rounded-full text-white"
            style={{ background: name.trim() ? '#0B0F1A' : '#E5E7EB', color: name.trim() ? '#fff' : '#9AA3AF', fontSize: 13, fontWeight: 600 }}
          >
            Create
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── shared library panel ────────────────────────────────────── */

export interface SourceLibraryProps {
  /** When set, rows are selectable (course / object pickers). */
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
  /** Compact intro for wizard embeds. */
  heading?: string;
  subheading?: string;
}

export function SourceLibrary({
  selectedIds,
  onToggleSelect,
  heading,
  subheading,
}: SourceLibraryProps = {}) {
  const selectable = !!onToggleSelect;
  const narrow = useIsMobile();
  const mobile = narrow || isNexusMobileShell();
  const [collections, setCollectionsState] = useState<SourceCollectionLocal[]>(() => getSourceCollections());
  const [activeId, setActiveId] = useState<string | null>(null);
  /** On mobile: list = collections only; detail = selected collection. */
  const [mobilePane, setMobilePane] = useState<'list' | 'detail'>('list');
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState('All kinds');
  const [useFilter, setUseFilter] = useState('Any use');
  const [viewSource, setViewSource] = useState<CollectionSource | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showNewCol, setShowNewCol] = useState(false);
  const [shareFlash, setShareFlash] = useState(false);

  useEffect(() => subscribeSourceCollections(() => setCollectionsState(getSourceCollections())), []);

  useEffect(() => {
    if (!mobile) setMobilePane('list');
  }, [mobile]);

  const setCollections = (next: SourceCollectionLocal[] | ((prev: SourceCollectionLocal[]) => SourceCollectionLocal[])) => {
    const resolved = typeof next === 'function' ? next(getSourceCollections()) : next;
    setSourceCollections(resolved);
  };

  const active = collections.find((c) => c.id === activeId) ?? null;

  const filteredSources = useMemo(() => {
    if (!active) return [];
    return active.sources.filter((s) => {
      const matchSearch = search === '' || s.title.toLowerCase().includes(search.toLowerCase());
      const matchKind = kindFilter === 'All kinds' || s.kind === kindFilter;
      const matchUse = useFilter === 'Any use' || s.purpose === useFilter;
      return matchSearch && matchKind && matchUse;
    });
  }, [active, search, kindFilter, useFilter]);

  const kinds = ['All kinds', ...Array.from(new Set((active?.sources ?? []).map((s) => s.kind)))];

  const selectCollection = (id: string) => {
    setActiveId(id);
    setSearch('');
    setKindFilter('All kinds');
    setUseFilter('Any use');
    if (mobile) setMobilePane('detail');
  };

  const addSource = (src: CollectionSource) => {
    if (!activeId) return;
    setCollections((prev) =>
      prev.map((c) => (c.id === activeId ? { ...c, sources: [...c.sources, src] } : c)),
    );
    if (onToggleSelect && selectedIds && !selectedIds.includes(src.id)) {
      onToggleSelect(src.id);
    }
  };

  const createCollection = (name: string) => {
    const id = `col-${Date.now()}`;
    const col: SourceCollectionLocal = {
      id,
      name,
      kind: 'folder',
      scope: 'Private',
      sources: [],
    };
    setCollections((prev) => [...prev, col]);
    setActiveId(id);
    setSearch('');
    setKindFilter('All kinds');
    setUseFilter('Any use');
    setShowNewCol(false);
    if (mobile) setMobilePane('detail');
  };

  const shareToTeam = () => {
    if (!activeId) return;
    setCollections((prev) =>
      prev.map((c) => (c.id === activeId ? { ...c, scope: 'Team' } : c)),
    );
    setShareFlash(true);
    setTimeout(() => setShareFlash(false), 1200);
  };

  const showList = !mobile || mobilePane === 'list';
  const showDetail = !mobile || mobilePane === 'detail';

  const collectionsRail = (
    <div
      className={`${mobile ? 'w-full' : 'w-56 shrink-0'} p-3 ${mobile ? '' : 'border-r'} flex flex-col gap-2 overflow-y-auto min-h-0`}
      style={{ borderColor: 'rgba(0,0,0,0.06)', background: 'rgba(255,255,255,0.35)' }}
    >
      <p style={{ fontSize: 11, fontWeight: 700, color: '#9AA3AF', letterSpacing: '.06em', padding: '4px 8px' }}>COLLECTIONS</p>
      {collections.length === 0 && (
        <p style={{ fontSize: 12, color: '#9AA3AF', padding: '4px 8px', lineHeight: 1.45 }}>
          No collections yet. Create one to start adding sources.
        </p>
      )}
      {collections.map((col) => (
        <button
          key={col.id}
          type="button"
          onClick={() => selectCollection(col.id)}
          className="text-left p-3 rounded-2xl border-2 transition-all"
          style={{
            background: activeId === col.id ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)',
            borderColor: activeId === col.id ? (col.kind === 'pool' ? '#D97706' : '#0B0F1A') : 'transparent',
            boxShadow: activeId === col.id ? '0 4px 14px -6px rgba(30,50,80,0.15)' : 'none',
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            {col.kind === 'pool'
              ? <Boxes size={14} style={{ color: '#D97706' }} />
              : <FolderOpen size={14} style={{ color: '#374151' }} />}
            <span style={{ fontSize: 12.5, fontWeight: 650, color: '#0B1220' }} className="truncate flex-1">{col.name}</span>
            {mobile ? <ChevronRight size={14} style={{ color: '#C4CBD4' }} /> : null}
          </div>
          <p style={{ fontSize: 11.5, color: '#9AA3AF' }}>{col.sources.length} sources</p>
          <span
            className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs"
            style={{ background: SCOPE_COLORS[col.scope]?.bg || '#F3F4F6', color: SCOPE_COLORS[col.scope]?.text || '#374151' }}
          >
            {col.scope}
          </span>
        </button>
      ))}
      <button
        type="button"
        onClick={() => setShowNewCol(true)}
        className="flex items-center gap-2 p-3 rounded-2xl border-2 border-dashed justify-center mt-1"
        style={{ fontSize: 12.5, color: '#9AA3AF', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.3)' }}
      >
        <Plus size={13} />New collection
      </button>
    </div>
  );

  return (
    <div className={`flex h-full min-h-0 ${mobile ? 'flex-col' : ''}`} style={{ minHeight: heading ? 420 : undefined }}>
      {showList ? collectionsRail : null}

      {showDetail ? (
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {(heading || subheading) && (
          <div className="px-4 sm:px-5 pt-4 pb-1">
            {heading && <p style={{ fontSize: 18, fontWeight: 700, color: '#0B1220' }}>{heading}</p>}
            {subheading && <p style={{ fontSize: 13, color: '#6B7280', marginTop: 3, maxWidth: 620 }}>{subheading}</p>}
          </div>
        )}

        {!active ? (
          <div className="flex-1 flex items-center justify-center p-6 sm:p-8">
            <div className="text-center max-w-sm">
              <FolderOpen size={28} style={{ color: '#C4CBD4', margin: '0 auto 10px' }} />
              <p style={{ fontSize: 14, fontWeight: 650, color: '#0B1220', marginBottom: 4 }}>Start with a collection</p>
              <p style={{ fontSize: 13, color: '#9AA3AF', marginBottom: 14 }}>
                Create a collection, then add sources. Use Share to team and filters once you have material.
              </p>
              <button
                type="button"
                onClick={() => setShowNewCol(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-white text-sm font-semibold"
                style={{ background: '#0B0F1A' }}
              >
                <Plus size={14} />New collection
              </button>
            </div>
          </div>
        ) : (
          <>
            <div
              className={`flex ${mobile ? 'flex-col items-stretch' : 'items-center'} gap-2 sm:gap-3 px-4 sm:px-5 py-3 border-b`}
              style={{ borderColor: 'rgba(0,0,0,0.07)', background: 'rgba(255,255,255,0.55)' }}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {mobile ? (
                  <button
                    type="button"
                    onClick={() => setMobilePane('list')}
                    className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(255,255,255,0.9)', border: '1px solid rgba(0,0,0,0.08)' }}
                    aria-label="Back to collections"
                  >
                    <ChevronLeft size={16} style={{ color: '#0B1220' }} />
                  </button>
                ) : null}
                <FolderOpen size={18} style={{ color: '#374151' }} className="shrink-0" />
                <div className="min-w-0">
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#0B1220' }} className="truncate">{active.name}</p>
                </div>
              </div>
              <div className={`flex items-center gap-2 ${mobile ? 'w-full' : 'shrink-0'}`}>
                <button
                  type="button"
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-full border text-xs font-medium"
                  style={{
                    color: shareFlash ? '#15803D' : '#374151',
                    borderColor: shareFlash ? '#86EFAC' : 'rgba(0,0,0,0.1)',
                    background: shareFlash ? '#F0FDF4' : 'rgba(255,255,255,0.8)',
                  }}
                  onClick={shareToTeam}
                >
                  <Share2 size={12} />{shareFlash ? 'Shared' : 'Share to team'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAdd(true)}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-full text-white text-xs font-semibold"
                  style={{ background: '#0B0F1A' }}
                >
                  <Plus size={12} />Add source
                </button>
              </div>
            </div>

            <div
              className={`flex ${mobile ? 'flex-col items-stretch' : 'items-center'} gap-2 sm:gap-3 px-4 sm:px-5 py-2.5 border-b`}
              style={{ borderColor: 'rgba(0,0,0,0.06)', background: 'rgba(255,255,255,0.4)' }}
            >
              <div className="flex items-center gap-2 flex-1 w-full px-3 py-1.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(0,0,0,0.08)' }}>
                <Search size={12} style={{ color: '#9AA3AF' }} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={mobile ? 'Search sources…' : 'Search sources in this collection…'}
                  className="flex-1 min-w-0 bg-transparent outline-none"
                  style={{ fontSize: 12.5, color: '#0B1220' }}
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={kindFilter}
                  onChange={(e) => setKindFilter(e.target.value)}
                  className="rounded-xl px-2.5 py-1.5 text-xs border flex-1 sm:flex-none min-w-0"
                  style={{ background: 'rgba(255,255,255,0.8)', borderColor: 'rgba(0,0,0,0.1)', outline: 'none', color: '#374151' }}
                >
                  {kinds.map((k) => <option key={k}>{k}</option>)}
                </select>
                <select
                  value={useFilter}
                  onChange={(e) => setUseFilter(e.target.value)}
                  className="rounded-xl px-2.5 py-1.5 text-xs border flex-1 sm:flex-none min-w-0"
                  style={{ background: 'rgba(255,255,255,0.8)', borderColor: 'rgba(0,0,0,0.1)', outline: 'none', color: '#374151' }}
                >
                  {['Any use', 'Generation', 'Embeddings'].map((u) => <option key={u}>{u}</option>)}
                </select>
                <span style={{ fontSize: 12, color: '#9AA3AF' }} className="w-full sm:w-auto">
                  <strong style={{ color: '#0B1220' }}>{filteredSources.length}</strong> of {active.sources.length}
                  {selectable && selectedIds ? (
                    <> · <strong style={{ color: '#0B1220' }}>{selectedIds.length}</strong> selected</>
                  ) : null}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-3">
              {filteredSources.length === 0 ? (
                <p style={{ fontSize: 13, color: '#9AA3AF', padding: '24px 0' }}>
                  {search || kindFilter !== 'All kinds' || useFilter !== 'Any use'
                    ? 'No sources match your filters.'
                    : 'No sources in this collection yet. Tap Add source to bring material in.'}
                </p>
              ) : (
                <div className="space-y-2">
                  {filteredSources.map((src, i) => {
                    const on = selectable && selectedIds?.includes(src.id);
                    return (
                      <motion.div
                        key={src.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        onClick={selectable ? () => onToggleSelect?.(src.id) : undefined}
                        className={`flex ${mobile ? 'flex-col items-stretch' : 'items-center'} gap-3 px-4 py-3 rounded-2xl border`}
                        style={{
                          background: on ? 'rgba(124,58,237,0.06)' : 'rgba(255,255,255,0.8)',
                          borderColor: on ? '#7C3AED' : 'rgba(0,0,0,0.07)',
                          cursor: selectable ? 'pointer' : 'default',
                        }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {selectable && (
                            <div
                              className="w-5 h-5 rounded border-2 flex items-center justify-center shrink-0"
                              style={{ borderColor: on ? '#7C3AED' : '#D1D5DB', background: on ? '#7C3AED' : 'transparent' }}
                            >
                              {on && <Check size={11} color="white" />}
                            </div>
                          )}
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#F3F4F6' }}>
                            <FileText size={14} style={{ color: '#6B7280' }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p style={{ fontSize: 13.5, fontWeight: 600, color: '#0B1220' }} className="truncate">{src.title}</p>
                            <p style={{ fontSize: 12, color: '#9AA3AF' }} className="truncate">
                              {src.kind}
                              {src.pages ? ` · ${src.pages}p` : ''}
                              {src.duration ? ` · ${src.duration}` : ''}
                              {src.note ? ` · "${src.note}"` : ''}
                            </p>
                          </div>
                        </div>
                        <div className={`flex items-center gap-2 ${mobile ? 'flex-wrap pl-11' : 'shrink-0'}`}>
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: PURPOSE_COLORS[src.purpose].bg, color: PURPOSE_COLORS[src.purpose].text }}>
                            {src.purpose}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: ROLE_COLORS[src.role].bg, color: ROLE_COLORS[src.role].text }}>
                            {src.role}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewSource(src);
                            }}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium ml-auto sm:ml-0"
                            style={{ color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.9)' }}
                          >
                            <Eye size={11} />View
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      ) : null}

      {viewSource && <ViewModal source={viewSource} onClose={() => setViewSource(null)} />}
      {showAdd && active && <AddModal onClose={() => setShowAdd(false)} onAdd={addSource} />}
      {showNewCol && <NewCollectionModal onClose={() => setShowNewCol(false)} onCreate={createCollection} />}
    </div>
  );
}

export function CDSources() {
  return <SourceLibrary />;
}

/** Modal: pick one source from the shared Source Library. */
export function PullFromLibraryModal({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (source: PickedLibrarySource) => void;
}) {
  const [collections, setCollections] = useState(() => getSourceCollections());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    setCollections(getSourceCollections());
    setActiveId(getSourceCollections()[0]?.id ?? null);
    setSearch('');
  }, [open]);

  useEffect(() => subscribeSourceCollections(() => setCollections(getSourceCollections())), []);

  if (!open) return null;

  const active = collections.find((c) => c.id === activeId) ?? null;
  const rows = (active?.sources ?? []).filter(
    (s) => !search || s.title.toLowerCase().includes(search.toLowerCase()),
  );
  const allSources = collections.flatMap((c) => c.sources);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(11,18,32,0.45)', backdropFilter: 'blur(4px)' }}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl rounded-[28px] overflow-hidden flex flex-col"
        style={{ background: 'white', boxShadow: '0 24px 64px -16px rgba(30,50,80,0.3)', maxHeight: '80vh' }}
      >
        <div className="p-5 border-b flex items-start justify-between shrink-0" style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0B1220' }}>Pull from Source Library</h3>
            <p style={{ fontSize: 13, color: '#9AA3AF', marginTop: 2 }}>
              Choose a source you’ve already added on the Sources tab.
            </p>
          </div>
          <button type="button" onClick={onClose}><X size={16} style={{ color: '#9AA3AF' }} /></button>
        </div>

        {allSources.length === 0 ? (
          <div className="p-8 text-center">
            <Library size={28} style={{ color: '#C4CBD4', margin: '0 auto 10px' }} />
            <p style={{ fontSize: 14, fontWeight: 650, color: '#0B1220', marginBottom: 4 }}>No library sources yet</p>
            <p style={{ fontSize: 13, color: '#9AA3AF' }}>
              Open the Sources tab, create a collection, and add material — then pull it in here.
            </p>
          </div>
        ) : (
          <div className="flex flex-1 min-h-0 overflow-hidden">
            <div className="w-44 shrink-0 border-r p-3 overflow-y-auto space-y-1.5" style={{ borderColor: 'rgba(0,0,0,0.06)', background: '#F9FAFB' }}>
              {collections.map((col) => (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => setActiveId(col.id)}
                  className="w-full text-left px-2.5 py-2 rounded-xl transition-all"
                  style={{
                    background: activeId === col.id ? '#fff' : 'transparent',
                    boxShadow: activeId === col.id ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
                    fontSize: 12.5,
                    fontWeight: activeId === col.id ? 650 : 500,
                    color: '#0B1220',
                  }}
                >
                  <span className="block truncate">{col.name}</span>
                  <span style={{ fontSize: 11, color: '#9AA3AF' }}>{col.sources.length}</span>
                </button>
              ))}
            </div>
            <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
              <div className="px-4 py-2.5 border-b shrink-0" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl" style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.08)' }}>
                  <Search size={12} style={{ color: '#9AA3AF' }} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search in this collection…"
                    className="flex-1 bg-transparent outline-none"
                    style={{ fontSize: 12.5 }}
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {rows.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#9AA3AF', padding: '16px 4px' }}>No sources in this collection.</p>
                ) : (
                  rows.map((src) => (
                    <button
                      key={src.id}
                      type="button"
                      onClick={() => {
                        onPick(src);
                        onClose();
                      }}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl border text-left transition-all hover:border-violet-400"
                      style={{ background: 'rgba(255,255,255,0.9)', borderColor: 'rgba(0,0,0,0.08)' }}
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#F3F4F6' }}>
                        <FileText size={14} style={{ color: '#6B7280' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p style={{ fontSize: 13.5, fontWeight: 600, color: '#0B1220' }} className="truncate">{src.title}</p>
                        <p style={{ fontSize: 12, color: '#9AA3AF' }}>
                          {src.kind}
                          {src.pages ? ` · ${src.pages}p` : ''}
                          {src.duration ? ` · ${src.duration}` : ''}
                        </p>
                      </div>
                      <span className="text-xs font-semibold shrink-0" style={{ color: '#7C3AED' }}>Use →</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        <div className="p-4 border-t shrink-0" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-full"
            style={{ background: 'rgba(0,0,0,0.05)', fontSize: 13, fontWeight: 600, color: '#374151' }}
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/** Always-visible control that opens the library picker. */
export function PullFromLibraryButton({
  onPick,
  label = 'From Source Library',
}: {
  onPick: (source: PickedLibrarySource) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all"
        style={{
          fontSize: 12.5,
          fontWeight: 600,
          color: '#4C1D95',
          borderColor: 'rgba(124,58,237,0.35)',
          background: 'rgba(124,58,237,0.08)',
        }}
      >
        <Library size={14} />{label}
      </button>
      <PullFromLibraryModal open={open} onClose={() => setOpen(false)} onPick={onPick} />
    </>
  );
}


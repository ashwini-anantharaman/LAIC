import React, { useState } from 'react';
import {
  Boxes, FolderOpen, FileText, Video, Link, Mic, Youtube, FileSpreadsheet,
  PenLine, NotebookPen, StickyNote, Search, Plus, Share2, Eye, X, Check,
  BookOpen, Upload
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SOURCES } from '../../../lib/data';
import { useApp } from '../../App';

/* ─── mock collection data ────────────────────────────────────── */

interface CollectionSource {
  id: string; title: string; kind: string; pages?: number; duration?: string;
  note?: string; purpose: 'Generation' | 'Embeddings'; role: 'Primary' | 'Supporting' | 'Reference';
}

interface Collection {
  id: string; name: string; kind: 'folder' | 'pool'; scope: string; objectName?: string;
  sources: CollectionSource[];
}

const MOCK_COLLECTIONS: Collection[] = [
  {
    id: 'col-1', name: 'Bidding references', kind: 'folder', scope: 'Program',
    sources: [
      { id: 's1', title: 'How to Play Bridge — Complete Guide', kind: 'PDF', pages: 22, note: 'Pull the formal definition + classic examples.', purpose: 'Generation', role: 'Primary' },
      { id: 's2', title: 'Bridge Rules & Conventions Video', kind: 'Video transcript', duration: '38 min', purpose: 'Embeddings', role: 'Supporting' },
      { id: 's3', title: 'ACBL Laws of Contract Bridge', kind: 'PDF', pages: 64, note: 'Reference for official ruling edge cases.', purpose: 'Generation', role: 'Reference' },
      { id: 's4', title: 'Bridge World Standard Conventions', kind: 'PDF', pages: 18, purpose: 'Generation', role: 'Supporting' },
    ],
  },
  {
    id: 'col-2', name: 'Learn to Play Bridge — source pool', kind: 'pool', scope: 'Private', objectName: 'Learn to Play Bridge',
    sources: [
      { id: 's5', title: 'How to Play Bridge — Complete Guide', kind: 'PDF', pages: 22, note: 'Use the HCP table verbatim.', purpose: 'Generation', role: 'Primary' },
      { id: 's6', title: 'Bridge Beginner Flashcard Deck', kind: 'Google Doc', purpose: 'Generation', role: 'Supporting' },
    ],
  },
  {
    id: 'col-3', name: 'HCP & Hand Evaluation', kind: 'folder', scope: 'Team',
    sources: [
      { id: 's7', title: 'Milton Work Point Count System', kind: 'Paste notes', purpose: 'Generation', role: 'Primary' },
      { id: 's8', title: 'Modern Hand Evaluation YouTube series', kind: 'YouTube video', duration: '22 min', purpose: 'Embeddings', role: 'Supporting' },
    ],
  },
];

const SCOPE_COLORS: Record<string, { bg: string; text: string }> = {
  Private:      { bg: '#F3F4F6', text: '#374151' },
  Team:         { bg: '#EFF6FF', text: '#1D4ED8' },
  Program:      { bg: '#F0FDF4', text: '#15803D' },
  Organization: { bg: '#F3E8FF', text: '#7C3AED' },
};

const PURPOSE_COLORS = {
  Generation: { bg: '#F3E8FF', text: '#7C3AED' },
  Embeddings: { bg: '#E0F2FE', text: '#0C4A6E' },
};

const ROLE_COLORS = {
  Primary:    { bg: '#DCFCE7', text: '#15803D' },
  Supporting: { bg: '#FEF3C7', text: '#92400E' },
  Reference:  { bg: '#F3F4F6', text: '#374151' },
};

const ROLE_DESCS = {
  Primary:    'Drives the object',
  Supporting: 'Backs it up',
  Reference:  'Might use',
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

/* ─── source view modal ───────────────────────────────────────── */

function ViewModal({ source, onClose }: { source: CollectionSource; onClose: () => void }) {
  const [instruction, setInstruction] = useState('');
  const [saved, setSaved] = useState(false);
  const isMedia = source.kind === 'Video transcript' || source.kind === 'Audio file' || source.kind === 'YouTube video';

  const save = () => { setSaved(true); setTimeout(() => { setSaved(false); onClose(); }, 900); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(11,18,32,0.45)', backdropFilter: 'blur(4px)' }}>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-[28px] overflow-hidden"
        style={{ background: 'white', boxShadow: '0 24px 64px -16px rgba(30,50,80,0.3)' }}>
        <div className="p-5 border-b" style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
          <div className="flex items-start justify-between gap-3 mb-1">
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0B1220' }}>{source.title}</h3>
            <button onClick={onClose}><X size={16} style={{ color: '#9AA3AF' }} /></button>
          </div>
          <p style={{ fontSize: 12.5, color: '#9AA3AF' }}>{source.kind}{source.pages ? ` · ${source.pages} pages` : ''}{source.duration ? ` · ${source.duration}` : ''}</p>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: ROLE_COLORS[source.role].bg, color: ROLE_COLORS[source.role].text }}>{source.role}</span>
            <span style={{ fontSize: 12.5, color: '#6B7280' }}>{ROLE_DESCS[source.role]}</span>
          </div>
          <div className="rounded-2xl p-4" style={{ background: '#F9FAFB', border: '1px solid rgba(0,0,0,0.06)' }}>
            {isMedia ? (
              <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.6 }}>
                Media source — the transcript is indexed for search and citation. Scrub to a timestamp to pull a quote into an object.
              </p>
            ) : (
              <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.6 }}>
                Text is parsed into pages and headings. Select any passage to cite it verbatim in a learning object, with a page reference kept automatically.
              </p>
            )}
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#0B1220', marginBottom: 6 }}>
              ✦ Tell the AI how to use this source
            </p>
            <textarea value={instruction} onChange={e => setInstruction(e.target.value)} rows={3}
              placeholder="e.g. Use the definition from p.4, but swap in a fresher everyday example."
              className="w-full rounded-2xl px-3 py-2.5 resize-none"
              style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', outline: 'none', background: 'rgba(0,0,0,0.02)' }} />
            <p style={{ fontSize: 11.5, color: '#9AA3AF', marginTop: 4 }}>Per-source instructions travel with the source into every generation that uses this pool.</p>
          </div>
        </div>
        <div className="flex gap-2 p-4 border-t" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-full" style={{ background: 'rgba(0,0,0,0.05)', fontSize: 13, fontWeight: 600, color: '#374151' }}>Close</button>
          <button onClick={save} className="flex-1 py-2.5 rounded-full text-white flex items-center justify-center gap-1.5"
            style={{ background: saved ? '#059669' : '#0B0F1A', fontSize: 13, fontWeight: 600 }}>
            {saved ? <><Check size={13} />Saved!</> : '✓ Save instruction'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── add source modal ────────────────────────────────────────── */

function AddModal({ onClose, onAdd }: { onClose: () => void; onAdd: (src: CollectionSource) => void }) {
  const [stage, setStage] = useState<'kind' | 'config'>('kind');
  const [selKind, setSelKind] = useState<typeof SOURCE_KINDS[0] | null>(null);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState<'Generation' | 'Embeddings'>('Generation');

  const pickKind = (k: typeof SOURCE_KINDS[0]) => {
    setSelKind(k);
    setPurpose(k.purpose);
    setStage('config');
  };

  const doAdd = () => {
    if (!selKind || !name) return;
    onAdd({ id: `s-${Date.now()}`, title: name, kind: selKind.id, purpose, role: 'Supporting' });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(11,18,32,0.45)', backdropFilter: 'blur(4px)' }}>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg rounded-[28px] overflow-hidden"
        style={{ background: 'white', boxShadow: '0 24px 64px -16px rgba(30,50,80,0.3)' }}>
        <div className="p-5 border-b flex items-start justify-between" style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0B1220' }}>Add a source</h3>
            <p style={{ fontSize: 13, color: '#9AA3AF', marginTop: 2 }}>Bring in material from anywhere — not just files. Every source is used either for generation or embeddings.</p>
          </div>
          <button onClick={onClose}><X size={16} style={{ color: '#9AA3AF' }} /></button>
        </div>
        <div className="p-5">
          {stage === 'kind' ? (
            <>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#0B1220', marginBottom: 12 }}>What are you bringing in?</p>
              <div className="grid grid-cols-3 gap-2">
                {SOURCE_KINDS.map(k => (
                  <button key={k.id} onClick={() => pickKind(k)}
                    className="flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all"
                    style={{ background: 'rgba(0,0,0,0.02)', borderColor: 'rgba(0,0,0,0.08)' }}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#F3F4F6', color: '#374151' }}>{k.icon}</div>
                    <span style={{ fontSize: 11.5, color: '#374151', textAlign: 'center', lineHeight: 1.3 }}>{k.id}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <button onClick={() => setStage('kind')} className="flex items-center gap-1.5 mb-4 text-sm" style={{ color: '#6B7280' }}>
                ← {selKind?.id}
              </button>
              <div className="mb-4">
                <p style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Name or URL</p>
                <input value={name} onChange={e => setName(e.target.value)} placeholder={`${selKind?.id} name or link`}
                  className="w-full rounded-2xl px-4 py-2.5" style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', outline: 'none' }} />
              </div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>How will this source be used?</p>
              <div className="grid grid-cols-2 gap-3">
                {(['Generation', 'Embeddings'] as const).map(p => (
                  <button key={p} onClick={() => setPurpose(p)}
                    className="p-3 rounded-2xl border-2 text-left transition-all"
                    style={{ background: purpose === p ? (p === 'Generation' ? 'rgba(124,58,237,0.06)' : 'rgba(14,165,233,0.06)') : 'transparent', borderColor: purpose === p ? (p === 'Generation' ? '#7C3AED' : '#0EA5E9') : 'rgba(0,0,0,0.08)' }}>
                    <p style={{ fontSize: 13, fontWeight: 650, color: '#0B1220', marginBottom: 2 }}>{p}</p>
                    <p style={{ fontSize: 12, color: '#9AA3AF' }}>{p === 'Generation' ? 'Authored directly into content by the AI + you' : 'Indexed for retrieval / semantic search (RAG)'}</p>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        {stage === 'config' && (
          <div className="flex gap-2 p-4 border-t" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
            <button onClick={onClose} className="flex-1 py-2.5 rounded-full" style={{ background: 'rgba(0,0,0,0.05)', fontSize: 13, fontWeight: 600, color: '#374151' }}>Cancel</button>
            <button onClick={doAdd} disabled={!name}
              className="flex-1 py-2.5 rounded-full text-white flex items-center justify-center gap-1.5"
              style={{ background: name ? '#0B0F1A' : '#E5E7EB', color: name ? '#fff' : '#9AA3AF', fontSize: 13, fontWeight: 600 }}>
              <Plus size={13} />Add source
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

/* ─── main component ──────────────────────────────────────────── */

export function CDSources() {
  const { program } = useApp();
  const [collections, setCollections] = useState(MOCK_COLLECTIONS);
  const [activeId, setActiveId] = useState(MOCK_COLLECTIONS[0].id);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState('All kinds');
  const [useFilter, setUseFilter] = useState('Any use');
  const [viewSource, setViewSource] = useState<CollectionSource | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const active = collections.find(c => c.id === activeId) || collections[0];

  const filteredSources = active.sources.filter(s => {
    const matchSearch = search === '' || s.title.toLowerCase().includes(search.toLowerCase());
    const matchKind = kindFilter === 'All kinds' || s.kind === kindFilter;
    const matchUse = useFilter === 'Any use' || s.purpose === useFilter;
    return matchSearch && matchKind && matchUse;
  });

  const kinds = ['All kinds', ...Array.from(new Set(active.sources.map(s => s.kind)))];

  const addSource = (src: CollectionSource) => {
    setCollections(prev => prev.map(c => c.id === activeId ? { ...c, sources: [...c.sources, src] } : c));
  };

  return (
    <div className="flex h-full min-h-0">
      {/* Left — collections */}
      <div className="w-56 shrink-0 p-3 border-r flex flex-col gap-2 overflow-y-auto" style={{ borderColor: 'rgba(0,0,0,0.06)', background: 'rgba(255,255,255,0.35)' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#9AA3AF', letterSpacing: '.06em', padding: '4px 8px' }}>COLLECTIONS</p>
        {collections.map(col => (
          <button key={col.id} onClick={() => { setActiveId(col.id); setSearch(''); setKindFilter('All kinds'); setUseFilter('Any use'); }}
            className="text-left p-3 rounded-2xl border-2 transition-all"
            style={{
              background: activeId === col.id ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)',
              borderColor: activeId === col.id ? (col.kind === 'pool' ? '#D97706' : '#0B0F1A') : 'transparent',
              boxShadow: activeId === col.id ? '0 4px 14px -6px rgba(30,50,80,0.15)' : 'none',
              outline: col.kind === 'pool' ? '2px solid rgba(217,119,6,0.25)' : 'none',
              outlineOffset: 2,
            }}>
            <div className="flex items-center gap-2 mb-1">
              {col.kind === 'pool'
                ? <Boxes size={14} style={{ color: '#D97706' }} />
                : <FolderOpen size={14} style={{ color: '#374151' }} />}
              <span style={{ fontSize: 12.5, fontWeight: 650, color: '#0B1220' }} className="truncate">{col.name}</span>
            </div>
            <p style={{ fontSize: 11.5, color: '#9AA3AF' }}>{col.sources.length} sources</p>
            <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs"
              style={{ background: SCOPE_COLORS[col.scope]?.bg || '#F3F4F6', color: SCOPE_COLORS[col.scope]?.text || '#374151' }}>
              {col.scope}
            </span>
          </button>
        ))}
        <button
          onClick={() => alert('New collection — stub')}
          className="flex items-center gap-2 p-3 rounded-2xl border-2 border-dashed justify-center mt-1"
          style={{ fontSize: 12.5, color: '#9AA3AF', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.3)' }}>
          <Plus size={13} />New collection
        </button>
      </div>

      {/* Right — active collection */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Panel header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ borderColor: 'rgba(0,0,0,0.07)', background: 'rgba(255,255,255,0.55)' }}>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {active.kind === 'pool'
              ? <Boxes size={18} style={{ color: '#D97706' }} />
              : <FolderOpen size={18} style={{ color: '#374151' }} />}
            <div className="min-w-0">
              <p style={{ fontSize: 14, fontWeight: 700, color: '#0B1220' }}>{active.name}</p>
              {active.kind === 'pool' && active.objectName && (
                <p style={{ fontSize: 12, color: '#9AA3AF' }}>Source pool for the "{active.objectName}" object</p>
              )}
            </div>
          </div>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium"
            style={{ color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)' }}
            onClick={() => alert('Promoted to program-shared library')}>
            <Share2 size={12} />⤴ Share to team
          </button>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white text-xs font-semibold"
            style={{ background: '#0B0F1A' }}>
            <Plus size={12} />Add source
          </button>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-3 px-5 py-2.5 border-b" style={{ borderColor: 'rgba(0,0,0,0.06)', background: 'rgba(255,255,255,0.4)' }}>
          <div className="flex items-center gap-2 flex-1 max-w-xs px-3 py-1.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(0,0,0,0.08)' }}>
            <Search size={12} style={{ color: '#9AA3AF' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search sources in this collection…"
              className="flex-1 bg-transparent outline-none" style={{ fontSize: 12.5, color: '#0B1220' }} />
          </div>
          <select value={kindFilter} onChange={e => setKindFilter(e.target.value)}
            className="rounded-xl px-2.5 py-1.5 text-xs border" style={{ background: 'rgba(255,255,255,0.8)', borderColor: 'rgba(0,0,0,0.1)', outline: 'none', color: '#374151' }}>
            {kinds.map(k => <option key={k}>{k}</option>)}
          </select>
          <select value={useFilter} onChange={e => setUseFilter(e.target.value)}
            className="rounded-xl px-2.5 py-1.5 text-xs border" style={{ background: 'rgba(255,255,255,0.8)', borderColor: 'rgba(0,0,0,0.1)', outline: 'none', color: '#374151' }}>
            {['Any use', 'Generation', 'Embeddings'].map(u => <option key={u}>{u}</option>)}
          </select>
          <span style={{ fontSize: 12, color: '#9AA3AF' }}>
            <strong style={{ color: '#0B1220' }}>{filteredSources.length}</strong> of {active.sources.length} sources
          </span>
        </div>

        {/* Source rows */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {filteredSources.length === 0 ? (
            <p style={{ fontSize: 13, color: '#9AA3AF', padding: '24px 0' }}>
              {search || kindFilter !== 'All kinds' || useFilter !== 'Any use'
                ? 'No sources match your search.'
                : 'No sources in this collection yet.'}
            </p>
          ) : (
            <div className="space-y-2">
              {filteredSources.map((src, i) => (
                <motion.div key={src.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl border"
                  style={{ background: 'rgba(255,255,255,0.8)', borderColor: 'rgba(0,0,0,0.07)' }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#F3F4F6' }}>
                    <FileText size={14} style={{ color: '#6B7280' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p style={{ fontSize: 13.5, fontWeight: 600, color: '#0B1220' }}>{src.title}</p>
                    <p style={{ fontSize: 12, color: '#9AA3AF' }}>
                      {src.kind}{src.pages ? ` · ${src.pages}p` : ''}{src.duration ? ` · ${src.duration}` : ''}
                      {src.note ? ` · "${src.note}"` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ background: PURPOSE_COLORS[src.purpose].bg, color: PURPOSE_COLORS[src.purpose].text }}>
                      {src.purpose}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ background: ROLE_COLORS[src.role].bg, color: ROLE_COLORS[src.role].text }}>
                      {src.role}
                    </span>
                    <button onClick={() => setViewSource(src)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium transition-all"
                      style={{ color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.9)' }}>
                      <Eye size={11} />View
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* Footer note */}
          <div className="mt-4 px-4 py-3 rounded-2xl" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
            <p style={{ fontSize: 12, color: '#92400E', lineHeight: 1.6 }}>
              Sources are grouped into collections and per-object pools, searchable and filterable within each — so a library of 100+ never becomes one endless stack. Each is tagged <strong>Generation</strong> (authored into content) or <strong>Embeddings</strong> (indexed for retrieval / semantic search, i.e. RAG).
            </p>
          </div>
        </div>
      </div>

      {/* Modals */}
      {viewSource && <ViewModal source={viewSource} onClose={() => setViewSource(null)} />}
      {showAdd && <AddModal onClose={() => setShowAdd(false)} onAdd={addSource} />}
    </div>
  );
}

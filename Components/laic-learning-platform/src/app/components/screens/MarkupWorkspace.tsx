/**
 * Mark up step — fixed two-pane workspace (source tabs + paginated reader + right rail).
 * Highlight / scan data shapes are unchanged for Extract downstream.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Check, ChevronLeft, ChevronRight, ClipboardPaste, FileText,
  Link2, Loader2, Search, Sparkles, Upload, X, Youtube, StickyNote,
} from 'lucide-react';
import type { MarkupFlag, MarkupFlagKind } from '../../../lib/types';
import { highlightsFromFlag, flagKindCounts } from './MarkupFlagReview';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

export type MarkupSourceKind = 'pdf' | 'text' | 'web' | 'youtube' | 'library';

export interface MarkupSource {
  id: string;
  label: string;
  kind: MarkupSourceKind;
  /** Sentences belonging to this source only (local page numbers). */
  sentences: { text: string; page: number }[];
  /** Global index of the first sentence in the concatenated stream. */
  offset: number;
}

const TAG: Record<string, { bg: string; text: string; border: string }> = {
  Use: { bg: '#FEF3C7', text: '#92400E', border: '#F59E0B' },
  Support: { bg: '#E0F2FE', text: '#0C4A6E', border: '#0EA5E9' },
  Ignore: { bg: '#FEE2E2', text: '#991B1B', border: '#EF4444' },
  Note: { bg: '#F3E8FF', text: '#6B21A8', border: '#A855F7' },
};

const KIND_CHIP: Record<MarkupFlagKind, { label: string; color: string; bg: string }> = {
  core: { label: 'core concept', color: '#1D4ED8', bg: 'rgba(37,99,235,0.10)' },
  confusion: { label: 'common confusion', color: '#C2410C', bg: 'rgba(234,88,12,0.12)' },
  diagram: { label: 'diagram / visual', color: '#6D28D9', bg: 'rgba(124,58,237,0.10)' },
  out_of_scope: { label: 'out of scope', color: '#4B5563', bg: 'rgba(107,114,128,0.12)' },
};

function sourceIcon(kind: MarkupSourceKind) {
  const props = { size: 13 as const };
  if (kind === 'pdf') return <Upload {...props} />;
  if (kind === 'text') return <ClipboardPaste {...props} />;
  if (kind === 'web') return <Link2 {...props} />;
  if (kind === 'youtube') return <Youtube {...props} />;
  return <FileText {...props} />;
}

function sourceLabelForGlobalIdx(sources: MarkupSource[], globalIdx: number): string {
  for (const s of sources) {
    if (globalIdx >= s.offset && globalIdx < s.offset + s.sentences.length) return s.label;
  }
  return 'Source';
}

export interface MarkupWorkspaceProps {
  sources: MarkupSource[];
  /** Concatenated sentences (same order as sources) — kept for scan/suggest APIs. */
  docParas: string[];
  pages?: number[];
  highlights: any[];
  setHighlights: React.Dispatch<React.SetStateAction<any[]>>;
  activeTag: string;
  setActiveTag: (t: string) => void;
  aiSuggestions: number[];
  setAiSuggestions: React.Dispatch<React.SetStateAction<number[]>>;
  query: string;
  setQuery: (q: string) => void;
  onSuggest?: (instruction: string) => void;
  suggesting?: boolean;
  suggestError?: string | null;
  parsing?: boolean;
  parseProgress?: string | null;
  parseError?: string | null;
  markupFlags: MarkupFlag[];
  setMarkupFlags: React.Dispatch<React.SetStateAction<MarkupFlag[]>>;
  flagSummary?: string;
  onScanFlags?: (instruction?: string) => void;
  scanningFlags?: boolean;
  flagError?: string | null;
  pageCount?: number;
}

export function MarkupWorkspace({
  sources,
  docParas,
  pages,
  highlights,
  setHighlights,
  activeTag,
  setActiveTag,
  aiSuggestions,
  setAiSuggestions,
  query,
  setQuery,
  onSuggest,
  suggesting,
  suggestError,
  parsing,
  parseProgress,
  parseError,
  markupFlags,
  setMarkupFlags,
  flagSummary,
  onScanFlags,
  scanningFlags,
  flagError,
  pageCount,
}: MarkupWorkspaceProps) {
  const paras = docParas;
  const effectiveSources = useMemo((): MarkupSource[] => {
    if (sources.length) return sources;
    if (!paras.length) return [];
    return [{
      id: 'doc',
      label: 'Document',
      kind: 'text',
      sentences: paras.map((text, i) => ({ text, page: pages?.[i] ?? 1 })),
      offset: 0,
    }];
  }, [sources, paras, pages]);

  const [activeSourceId, setActiveSourceId] = useState<string>('');
  const [page, setPage] = useState(1);
  const [scanFocus, setScanFocus] = useState('');
  const [showHint, setShowHint] = useState(true);
  const [railTab, setRailTab] = useState<'scan' | 'highlights'>('scan');
  const [hlFilterTag, setHlFilterTag] = useState<string>('all');
  const [hlFilterSource, setHlFilterSource] = useState<string>('all');
  const [noteOpenIdx, setNoteOpenIdx] = useState<number | null>(null);
  const [focusGlobalIdx, setFocusGlobalIdx] = useState<number | null>(null);
  const [railOpen, setRailOpen] = useState(true);
  const sentenceRefs = useRef<Map<number, HTMLParagraphElement | null>>(new Map());

  const activeSource = useMemo(
    () => effectiveSources.find((s) => s.id === activeSourceId) || effectiveSources[0] || null,
    [effectiveSources, activeSourceId],
  );

  useEffect(() => {
    if (!effectiveSources.length) return;
    if (!effectiveSources.some((s) => s.id === activeSourceId)) {
      setActiveSourceId(effectiveSources[0].id);
    }
  }, [effectiveSources, activeSourceId]);

  const pageList = useMemo(() => {
    if (!activeSource) return [1];
    const set = new Set(activeSource.sentences.map((s) => Number(s.page) || 1));
    return [...set].sort((a, b) => a - b);
  }, [activeSource]);

  useEffect(() => {
    if (!pageList.includes(page)) setPage(pageList[0] || 1);
  }, [pageList, page]);

  const pageSentences = useMemo(() => {
    if (!activeSource) return [] as { text: string; page: number; globalIdx: number; localIdx: number }[];
    const mapped = activeSource.sentences.map((s, localIdx) => ({
      text: s.text,
      page: Number(s.page) || 1,
      globalIdx: activeSource.offset + localIdx,
      localIdx,
    }));
    const onPage = mapped.filter((s) => s.page === page);
    if (onPage.length) return onPage;
    if (!mapped.length) return [];
    // Page state out of sync — show the first page that actually has sentences.
    const fallbackPage = mapped[0].page;
    return mapped.filter((s) => s.page === fallbackPage);
  }, [activeSource, page]);

  const flaggedIdx = useMemo(() => {
    const set = new Set<number>();
    for (const f of markupFlags || []) {
      if (f.status === 'rejected') continue;
      for (let i = f.startIdx; i <= f.endIdx; i += 1) set.add(i);
    }
    return set;
  }, [markupFlags]);

  useEffect(() => {
    if (focusGlobalIdx == null || !activeSource) return;
    if (focusGlobalIdx < activeSource.offset || focusGlobalIdx >= activeSource.offset + activeSource.sentences.length) {
      const owner = effectiveSources.find(
        (s) => focusGlobalIdx >= s.offset && focusGlobalIdx < s.offset + s.sentences.length,
      );
      if (owner) {
        setActiveSourceId(owner.id);
        const local = owner.sentences[focusGlobalIdx - owner.offset];
        if (local) setPage(local.page || 1);
      }
      return;
    }
    const local = activeSource.sentences[focusGlobalIdx - activeSource.offset];
    if (local && (local.page || 1) !== page) setPage(local.page || 1);
  }, [focusGlobalIdx, activeSource, effectiveSources, page]);

  useEffect(() => {
    if (focusGlobalIdx == null) return;
    const el = sentenceRefs.current.get(focusGlobalIdx);
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focusGlobalIdx, page, activeSourceId, pageSentences]);

  const findMatchStats = useMemo(() => {
    const q = (query || '').trim().toLowerCase();
    if (!q || !activeSource) return null;
    const hitPages = new Set<number>();
    let count = 0;
    for (const s of activeSource.sentences) {
      if (s.text.toLowerCase().includes(q)) {
        count += 1;
        hitPages.add(Number(s.page) || 1);
      }
    }
    return count ? { count, pages: hitPages.size } : null;
  }, [query, activeSource]);

  if (parsing) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8">
        <Loader2 size={28} className="animate-spin mb-3" style={{ color: '#7C3AED' }} />
        <p style={{ fontSize: 15, fontWeight: 650, color: '#0B1220' }}>Extracting text for Mark up…</p>
        <p style={{ fontSize: 12.5, color: '#9AA3AF', marginTop: 6 }}>{parseProgress || 'Reading your PDF in the browser'}</p>
      </div>
    );
  }
  if (parseError) {
    return (
      <div className="p-5 max-w-2xl">
        <div className="flex items-start gap-2 rounded-2xl p-3" style={{ background: '#FEE2E2', border: '1px solid #FCA5A5' }}>
          <AlertTriangle size={15} style={{ color: '#B91C1C', marginTop: 1 }} />
          <p style={{ fontSize: 12.5, color: '#991B1B' }}>{parseError}</p>
        </div>
        <p style={{ fontSize: 13, color: '#6B7280', marginTop: 12 }}>Go back to Sources and attach a different PDF, or use Paste text.</p>
      </div>
    );
  }

  const toggle = (globalIdx: number) => {
    const exists = highlights.find((h: any) => h.idx === globalIdx);
    if (exists) setHighlights((p) => p.filter((h: any) => h.idx !== globalIdx));
    else {
      const src = effectiveSources.find((s) => globalIdx >= s.offset && globalIdx < s.offset + s.sentences.length);
      setHighlights((p) => [
        ...p,
        {
          idx: globalIdx,
          tag: activeTag,
          text: paras[globalIdx],
          page: pages?.[globalIdx] ?? 1,
          comment: '',
          sourceId: src?.id,
          sourceLabel: src?.label,
        },
      ]);
    }
  };

  const selectAllActive = () => {
    if (!activeSource) return;
    const additions = activeSource.sentences
      .map((s, localIdx) => ({
        idx: activeSource.offset + localIdx,
        text: s.text,
        page: s.page || 1,
      }))
      .filter((p) => !highlights.find((h: any) => h.idx === p.idx))
      .map((p) => ({
        idx: p.idx,
        tag: activeTag,
        text: p.text,
        page: p.page,
        comment: '',
        sourceId: activeSource.id,
        sourceLabel: activeSource.label,
      }));
    if (additions.length) setHighlights((p) => [...p, ...additions]);
  };

  const clearAll = () => setHighlights([]);

  const highlightAllMatches = () => {
    const q = (query || '').trim().toLowerCase();
    if (!q || !activeSource) return;
    const matches = activeSource.sentences
      .map((s, localIdx) => ({
        idx: activeSource.offset + localIdx,
        text: s.text,
        page: s.page || 1,
      }))
      .filter((p) => p.text.toLowerCase().includes(q) && !highlights.find((h: any) => h.idx === p.idx))
      .map((p) => ({
        idx: p.idx,
        tag: activeTag,
        text: p.text,
        page: p.page,
        comment: '',
        sourceId: activeSource.id,
        sourceLabel: activeSource.label,
      }));
    if (matches.length) setHighlights((p) => [...p, ...matches]);
  };

  const jumpToFindMatch = () => {
    const q = (query || '').trim().toLowerCase();
    if (!q || !activeSource) return;
    const hit = activeSource.sentences.findIndex((s) => s.text.toLowerCase().includes(q));
    if (hit < 0) return;
    setFocusGlobalIdx(activeSource.offset + hit);
  };

  const acceptSentenceSuggestions = () => {
    const newHl = aiSuggestions
      .filter((i) => !highlights.find((h: any) => h.idx === i))
      .map((i) => {
        const src = effectiveSources.find((s) => i >= s.offset && i < s.offset + s.sentences.length);
        return {
          idx: i,
          tag: 'Use',
          text: paras[i],
          page: pages?.[i] ?? 1,
          comment: '',
          sourceId: src?.id,
          sourceLabel: src?.label,
        };
      });
    setHighlights((p) => [...p, ...newHl]);
    setAiSuggestions([]);
  };

  const hlCountBySource = (srcId: string) =>
    highlights.filter((h: any) => {
      if (h.sourceId) return h.sourceId === srcId;
      const src = effectiveSources.find((s) => s.id === srcId);
      if (!src) return false;
      return h.idx >= src.offset && h.idx < src.offset + src.sentences.length;
    }).length;

  const filteredHighlights = highlights.filter((h: any) => {
    if (hlFilterTag !== 'all' && h.tag !== hlFilterTag) return false;
    if (hlFilterSource !== 'all') {
      const sid = h.sourceId || effectiveSources.find((s) => h.idx >= s.offset && h.idx < s.offset + s.sentences.length)?.id;
      if (sid !== hlFilterSource) return false;
    }
    return true;
  });

  const q = (query || '').trim().toLowerCase();
  const flagBusy = !!scanningFlags;
  const pagePos = Math.max(0, pageList.indexOf(page));
  const shortLabel = (label: string) => {
    const base = label.replace(/\.[a-z0-9]+$/i, '').trim();
    return base.length > 18 ? `${base.slice(0, 16)}…` : base;
  };

  const cardShadow = '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px -12px rgba(15,23,42,0.18)';

  return (
    <div className="flex flex-col gap-2.5 px-4 py-3 w-full pb-8" style={{ background: '#EEF0F3' }}>
      {/* Hint banner */}
      {showHint && (
        <div
          className="flex items-start gap-2 px-4 py-2.5 rounded-xl"
          style={{ background: '#FEF3C7', border: '1px solid #FDE68A' }}
        >
          <p style={{ fontSize: 12.5, color: '#92400E', lineHeight: 1.45, flex: 1 }}>
            Mark sentences per source (tabs below). Run a document scan when you want AI review items — it never runs by itself.
          </p>
          <button type="button" onClick={() => setShowHint(false)} aria-label="Dismiss hint" className="mt-0.5 shrink-0">
            <X size={14} style={{ color: '#92400E' }} />
          </button>
        </div>
      )}

      {/* Toolbar — sticks while the page scrolls */}
      <div
        className="sticky top-0 z-20 flex flex-wrap items-center gap-x-2 gap-y-2 px-3.5 py-2.5 rounded-xl border"
        style={{ background: '#FFFFFF', borderColor: 'rgba(0,0,0,0.06)', boxShadow: cardShadow }}
      >
        <span style={{ fontSize: 12, color: '#6B7280', fontWeight: 500 }}>Highlight as:</span>
        {Object.keys(TAG).map((tag) => {
          const c = TAG[tag];
          const on = activeTag === tag;
          return (
            <button
              key={tag}
              type="button"
              onClick={() => setActiveTag(tag)}
              className="px-2.5 py-1 rounded-full transition-all"
              style={{
                fontSize: 12,
                fontWeight: on ? 650 : 550,
                background: c.bg,
                color: c.text,
                border: `1.5px solid ${on ? c.border : `${c.border}55`}`,
                textDecoration: tag === 'Ignore' ? 'line-through' : 'none',
              }}
            >
              {tag}
            </button>
          );
        })}

        <button
          type="button"
          onClick={selectAllActive}
          disabled={!activeSource?.sentences.length}
          className="flex items-center gap-1 px-2 py-1 rounded-md disabled:opacity-40"
          style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}
        >
          <Check size={12} /> Select all
        </button>

        <div className="relative flex items-center" style={{ flex: '1 1 160px', maxWidth: 260, minWidth: 140 }}>
          <Search size={13} className="absolute left-2.5 pointer-events-none" style={{ color: '#9AA3AF' }} />
          <input
            value={query || ''}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find in document…"
            className="w-full rounded-lg pl-8 pr-3 py-1.5"
            style={{
              fontSize: 12.5,
              border: '1px solid rgba(0,0,0,0.1)',
              background: '#fff',
              outline: 'none',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                highlightAllMatches();
                jumpToFindMatch();
              }
            }}
          />
        </div>

        {findMatchStats && (
          <span style={{ fontSize: 11, color: '#0EA5E9' }}>
            {findMatchStats.count} across {findMatchStats.pages}p
          </span>
        )}

        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <button
            type="button"
            onClick={() => {
              highlightAllMatches();
              jumpToFindMatch();
            }}
            className="px-3 py-1.5 rounded-full"
            style={{ fontSize: 12.5, fontWeight: 600, color: '#0B0F1A', background: '#F3F4F6' }}
          >
            Highlight all
          </button>

          {onScanFlags && paras.length > 0 && (
            <>
              <div className="relative flex items-center">
                <Search size={13} className="absolute left-2.5 pointer-events-none" style={{ color: '#9AA3AF' }} />
                <input
                  value={scanFocus}
                  onChange={(e) => setScanFocus(e.target.value)}
                  placeholder="Optional scan focus…"
                  className="rounded-lg pl-8 pr-3 py-1.5"
                  style={{
                    fontSize: 12.5,
                    width: 170,
                    border: '1px solid rgba(0,0,0,0.1)',
                    background: '#fff',
                    outline: 'none',
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !flagBusy) {
                      setRailTab('scan');
                      onScanFlags(scanFocus);
                    }
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setRailTab('scan');
                  onScanFlags(scanFocus);
                }}
                disabled={flagBusy}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-white"
                style={{ background: '#0B0F1A', fontSize: 12.5, fontWeight: 650, opacity: flagBusy ? 0.7 : 1 }}
              >
                {flagBusy ? <Loader2 size={13} className="animate-spin" /> : <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>}
                {flagBusy ? 'Scanning…' : 'Scan document'}
              </button>
            </>
          )}
          <button
            type="button"
            className="md:hidden px-2.5 py-1 rounded-lg border text-xs font-semibold"
            style={{ borderColor: 'rgba(0,0,0,0.12)', color: '#374151' }}
            onClick={() => setRailOpen((v) => !v)}
          >
            {railOpen ? 'Hide panel' : 'Panel'}
          </button>
        </div>
      </div>

      {flagError && (
        <div className="shrink-0 flex items-start gap-1.5 px-3.5 py-2 rounded-xl" style={{ fontSize: 11.5, color: '#B91C1C', background: '#FEF2F2', border: '1px solid #FECACA' }}>
          <AlertTriangle size={12} style={{ marginTop: 1 }} />{flagError}
        </div>
      )}

      {aiSuggestions.length > 0 && (
        <div className="shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-xl" style={{ background: '#FEF3C7', border: '1px solid #FDE68A' }}>
          <span style={{ fontSize: 12, color: '#92400E', flex: 1 }}>AI suggested {aiSuggestions.length} sentences</span>
          <button type="button" onClick={acceptSentenceSuggestions} className="px-2.5 py-1 rounded-full text-white text-xs font-semibold" style={{ background: '#D97706' }}>Accept all</button>
          <button type="button" onClick={() => setAiSuggestions([])} style={{ fontSize: 12, color: '#92400E' }}>Dismiss</button>
        </div>
      )}

      {/* Two cards — height follows content; whole Mark up page scrolls */}
      <div
        className="markup-two-pane grid gap-2.5 items-start"
        style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}
      >
        <style>{`
          @media (min-width: 768px) {
            .markup-two-pane {
              grid-template-columns: minmax(0, 1fr) 320px !important;
            }
          }
        `}</style>
        {/* LEFT — source reader card */}
        <div
          className="flex flex-col rounded-2xl border bg-white"
          style={{ borderColor: 'rgba(0,0,0,0.06)', boxShadow: cardShadow }}
        >
          <div
            className="shrink-0 flex items-end gap-0 px-3 pt-1 overflow-x-auto"
            style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}
          >
            {effectiveSources.length === 0 ? (
              <p style={{ fontSize: 12.5, color: '#9AA3AF', padding: '8px 4px' }}>No sources to mark up yet.</p>
            ) : (
              effectiveSources.map((s) => {
                const on = s.id === activeSource?.id;
                const count = hlCountBySource(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setActiveSourceId(s.id);
                      setFocusGlobalIdx(null);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2.5 shrink-0 transition-all"
                    style={{
                      fontSize: 13,
                      fontWeight: on ? 650 : 500,
                      color: on ? '#0B1220' : '#6B7280',
                      borderBottom: on ? '2px solid #0B0F1A' : '2px solid transparent',
                      marginBottom: -1,
                    }}
                  >
                    <span style={{ color: on ? '#0B1220' : '#9AA3AF' }}>{sourceIcon(s.kind)}</span>
                    <span className="truncate max-w-[160px]">{s.label}</span>
                    {count > 0 && (
                      <span
                        className="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold inline-flex items-center justify-center"
                        style={{
                          background: on ? '#FDE68A' : '#E5E7EB',
                          color: on ? '#92400E' : '#6B7280',
                        }}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {activeSource && (
            <div
              className="shrink-0 flex items-center justify-between px-3 py-1.5"
              style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', background: '#FAFBFC' }}
            >
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  disabled={pagePos <= 0}
                  onClick={() => setPage(pageList[pagePos - 1])}
                  className="flex items-center gap-0.5 px-2 py-1 text-xs font-medium disabled:opacity-35"
                  style={{ color: '#4B5563' }}
                >
                  <ChevronLeft size={14} /> Prev
                </button>
                <select
                  value={page}
                  onChange={(e) => setPage(Number(e.target.value))}
                  className="rounded-md px-2 py-1 text-xs font-medium mx-1"
                  style={{ border: '1px solid rgba(0,0,0,0.1)', background: 'white', outline: 'none', color: '#0B1220' }}
                >
                  {pageList.map((p) => (
                    <option key={p} value={p}>Page {p}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={pagePos >= pageList.length - 1}
                  onClick={() => setPage(pageList[pagePos + 1])}
                  className="flex items-center gap-0.5 px-2 py-1 text-xs font-medium disabled:opacity-35"
                  style={{ color: '#4B5563' }}
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                p. {page} of {pageList.length}
              </span>
            </div>
          )}

          <div className="px-5 py-4">
            {!activeSource && (
              <p style={{ fontSize: 13, color: '#9AA3AF' }}>No document text to mark up.</p>
            )}
            {activeSource && pageSentences.length === 0 && (
              <p style={{ fontSize: 13, color: '#9AA3AF' }}>No sentences on this page.</p>
            )}
            {pageSentences.map((s) => {
              const hl = highlights.find((h: any) => h.idx === s.globalIdx);
              const isAi = aiSuggestions.includes(s.globalIdx);
              const isFlagged = flaggedIdx.has(s.globalIdx);
              const isMatch = q.length > 0 && s.text.toLowerCase().includes(q);
              const isFocus = focusGlobalIdx === s.globalIdx;
              const c = hl ? TAG[hl.tag] : null;
              return (
                <div
                  key={s.globalIdx}
                  ref={(el) => { sentenceRefs.current.set(s.globalIdx, el as any); }}
                  onClick={() => toggle(s.globalIdx)}
                  className="mb-2.5 rounded-lg px-3 py-2.5 cursor-pointer transition-all flex items-start gap-2.5"
                  style={{
                    background: hl ? c!.bg : isFocus ? 'rgba(14,165,233,0.08)' : isAi ? 'rgba(254,243,199,0.45)' : isFlagged ? 'rgba(37,99,235,0.06)' : isMatch ? 'rgba(14,165,233,0.10)' : 'transparent',
                    outline: isFocus ? '1.5px solid rgba(14,165,233,0.55)' : hl ? `1px solid ${c!.border}66` : '1px solid transparent',
                    textDecoration: hl?.tag === 'Ignore' ? 'line-through' : 'none',
                  }}
                >
                  <p
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 14.5,
                      lineHeight: 1.7,
                      fontFamily: 'Georgia, "Times New Roman", serif',
                      color: '#1F2937',
                      margin: 0,
                    }}
                  >
                    {s.text}
                  </p>
                  {hl && (
                    <span
                      className="shrink-0 px-2 py-0.5 rounded-md text-[11px] font-bold self-center"
                      style={{
                        background: c!.bg,
                        color: c!.text,
                        border: `1px solid ${c!.border}`,
                      }}
                    >
                      {hl.tag}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT — scan / highlights rail card */}
        <div
          className={`flex-col rounded-2xl border bg-white md:sticky md:top-14 self-start ${railOpen ? 'flex' : 'hidden md:flex'}`}
          style={{ borderColor: 'rgba(0,0,0,0.06)', boxShadow: cardShadow, maxHeight: 'none' }}
        >
          <div className="flex flex-col w-full">
            <div
              className="flex items-end px-3 pt-1"
              style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}
            >
              <button
                type="button"
                onClick={() => setRailTab('scan')}
                className="px-3 py-2.5 text-[13px] transition-all"
                style={{
                  fontWeight: railTab === 'scan' ? 650 : 500,
                  color: railTab === 'scan' ? '#0B1220' : '#6B7280',
                  borderBottom: railTab === 'scan' ? '2px solid #0B0F1A' : '2px solid transparent',
                  marginBottom: -1,
                }}
              >
                Scan
              </button>
              <button
                type="button"
                onClick={() => setRailTab('highlights')}
                className="px-3 py-2.5 text-[13px] transition-all"
                style={{
                  fontWeight: railTab === 'highlights' ? 650 : 500,
                  color: railTab === 'highlights' ? '#0B1220' : '#6B7280',
                  borderBottom: railTab === 'highlights' ? '2px solid #0B0F1A' : '2px solid transparent',
                  marginBottom: -1,
                }}
              >
                Highlights ({highlights.length})
              </button>
            </div>

            {railTab === 'scan' ? (
              <div className="flex flex-col">
                {!markupFlags.length ? (
                  <div className="p-6 text-center">
                    <Sparkles size={18} style={{ color: '#D1D5DB', margin: '0 auto 10px' }} />
                    <p style={{ fontSize: 13, fontWeight: 650, color: '#0B1220' }}>Run a scan or highlight manually</p>
                    <p style={{ fontSize: 12, color: '#9AA3AF', marginTop: 6, lineHeight: 1.45 }}>
                      Use <strong style={{ color: '#6B7280' }}>+ Scan document</strong> in the toolbar when you’re ready. Nothing auto-runs.
                    </p>
                  </div>
                ) : (
                  <CompactScanList
                    flags={markupFlags}
                    summary={flagSummary}
                    paras={paras}
                    pages={pages}
                    sources={effectiveSources}
                    shortLabel={shortLabel}
                    onChange={setMarkupFlags}
                    onJump={(idx) => {
                      setFocusGlobalIdx(idx);
                      setRailTab('scan');
                    }}
                    onAccept={(flag) => {
                      const additions = highlightsFromFlag(flag, paras, pages)
                        .filter((h) => !highlights.find((x: any) => x.idx === h.idx))
                        .map((h) => {
                          const src = effectiveSources.find((s) => h.idx >= s.offset && h.idx < s.offset + s.sentences.length);
                          return { ...h, sourceId: src?.id, sourceLabel: src?.label };
                        });
                      if (additions.length) setHighlights((p) => [...p, ...additions]);
                      setMarkupFlags((prev) => prev.map((f) => (f.id === flag.id ? { ...f, status: 'accepted' as const } : f)));
                    }}
                    onReject={(id) => {
                      setMarkupFlags((prev) => prev.map((f) => (f.id === id ? { ...f, status: 'rejected' as const } : f)));
                    }}
                    onAcceptAllPending={() => {
                      const pending = markupFlags.filter((f) => f.status === 'pending' || f.status === 'adjusted');
                      const additions: any[] = [];
                      const used = new Set(highlights.map((h: any) => h.idx));
                      for (const flag of pending) {
                        for (const h of highlightsFromFlag(flag, paras, pages)) {
                          if (used.has(h.idx)) continue;
                          used.add(h.idx);
                          const src = effectiveSources.find((s) => h.idx >= s.offset && h.idx < s.offset + s.sentences.length);
                          additions.push({ ...h, sourceId: src?.id, sourceLabel: src?.label });
                        }
                      }
                      if (additions.length) setHighlights((p) => [...p, ...additions]);
                      setMarkupFlags((prev) =>
                        prev.map((f) =>
                          f.status === 'pending' || f.status === 'adjusted' ? { ...f, status: 'accepted' as const } : f,
                        ),
                      );
                    }}
                    onRejectAllPending={() => {
                      setMarkupFlags((prev) =>
                        prev.map((f) =>
                          f.status === 'pending' || f.status === 'adjusted' ? { ...f, status: 'rejected' as const } : f,
                        ),
                      );
                    }}
                    onClear={() => setMarkupFlags([])}
                  />
                )}
              </div>
            ) : (
              <div className="flex flex-col">
                <div className="flex flex-wrap gap-1.5 px-3 py-2" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                  <select
                    value={hlFilterTag}
                    onChange={(e) => setHlFilterTag(e.target.value)}
                    className="rounded-md px-2 py-1 text-[11px]"
                    style={{ border: '1px solid rgba(0,0,0,0.1)', background: 'white' }}
                  >
                    <option value="all">All tags</option>
                    {Object.keys(TAG).map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <select
                    value={hlFilterSource}
                    onChange={(e) => setHlFilterSource(e.target.value)}
                    className="rounded-md px-2 py-1 text-[11px] max-w-[150px]"
                    style={{ border: '1px solid rgba(0,0,0,0.1)', background: 'white' }}
                  >
                    <option value="all">All sources</option>
                    {effectiveSources.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                  {highlights.length > 0 && (
                    <button type="button" onClick={clearAll} style={{ fontSize: 11, color: '#9AA3AF', marginLeft: 'auto' }}>
                      Clear all
                    </button>
                  )}
                </div>
                <div className="px-2 py-2 space-y-1">
                  {filteredHighlights.length === 0 && (
                    <p style={{ fontSize: 12, color: '#9AA3AF', padding: 12, textAlign: 'center' }}>
                      No highlights yet. Click a sentence in the reader, or run a scan.
                    </p>
                  )}
                  {filteredHighlights.map((h: any) => {
                    const c = TAG[h.tag] || TAG.Use;
                    const srcLabel = shortLabel(h.sourceLabel || sourceLabelForGlobalIdx(effectiveSources, h.idx));
                    const listIdx = highlights.findIndex((x: any) => x.idx === h.idx && x.tag === h.tag);
                    return (
                      <div
                        key={`${h.idx}-${h.tag}-${listIdx}`}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer hover:bg-black/[0.02]"
                        style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}
                        onClick={() => setFocusGlobalIdx(h.idx)}
                      >
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0"
                          style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}55` }}
                        >
                          {h.tag}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p style={{ fontSize: 10.5, color: '#9AA3AF' }} className="truncate">
                            {srcLabel} · p.{h.page ?? '—'}
                          </p>
                          <p style={{ fontSize: 12, color: '#374151', lineHeight: 1.35 }} className="truncate">
                            {h.text}
                          </p>
                        </div>
                        <Popover open={noteOpenIdx === h.idx} onOpenChange={(open) => setNoteOpenIdx(open ? h.idx : null)}>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="p-1 rounded hover:bg-black/5 shrink-0"
                              onClick={(e) => e.stopPropagation()}
                              title="Add note"
                            >
                              <StickyNote size={12} style={{ color: h.comment ? c.border : '#C4CBD4' }} />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-64 p-3" align="end" onClick={(e) => e.stopPropagation()}>
                            <p style={{ fontSize: 11.5, fontWeight: 650, marginBottom: 6 }}>Note</p>
                            <textarea
                              value={h.comment || ''}
                              rows={3}
                              placeholder="Optional note for this highlight…"
                              className="w-full rounded-lg px-2 py-1.5 resize-y"
                              style={{ fontSize: 12, border: '1px solid rgba(0,0,0,0.1)', outline: 'none' }}
                              onChange={(e) => {
                                const val = e.target.value;
                                setHighlights((p) =>
                                  p.map((x: any) => (x.idx === h.idx ? { ...x, comment: val } : x)),
                                );
                              }}
                            />
                          </PopoverContent>
                        </Popover>
                        <button
                          type="button"
                          className="p-1 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setHighlights((p) => p.filter((x: any) => !(x.idx === h.idx && x.tag === h.tag)));
                          }}
                        >
                          <X size={12} style={{ color: '#9AA3AF' }} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CompactScanList({
  flags,
  sources,
  shortLabel,
  onChange,
  onJump,
  onAccept,
  onReject,
  onAcceptAllPending,
  onRejectAllPending,
  onClear,
}: {
  flags: MarkupFlag[];
  summary?: string;
  paras: string[];
  pages?: number[];
  sources: MarkupSource[];
  shortLabel: (label: string) => string;
  onChange: (flags: MarkupFlag[]) => void;
  onJump: (globalIdx: number) => void;
  onAccept: (flag: MarkupFlag) => void;
  onReject: (id: string) => void;
  onAcceptAllPending: () => void;
  onRejectAllPending: () => void;
  onClear: () => void;
}) {
  const [adjustId, setAdjustId] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<MarkupFlagKind | 'all'>('all');
  const pending = flags.filter((f) => f.status === 'pending' || f.status === 'adjusted');
  const counts = flagKindCounts(flags);
  const visible = kindFilter === 'all' ? flags : flags.filter((f) => f.kind === kindFilter);

  return (
    <div className="flex flex-col">
      <div className="px-3 py-2.5 space-y-2" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(KIND_CHIP) as MarkupFlagKind[]).map((k) => {
            const on = kindFilter === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKindFilter(on ? 'all' : k)}
                className="px-2 py-0.5 rounded-full text-[11px] font-semibold transition-all"
                style={{
                  background: KIND_CHIP[k].bg,
                  color: KIND_CHIP[k].color,
                  outline: on ? `1.5px solid ${KIND_CHIP[k].color}` : 'none',
                }}
              >
                {counts[k]} {KIND_CHIP[k].label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {pending.length > 0 && (
            <>
              <button type="button" onClick={onAcceptAllPending} style={{ fontSize: 11.5, fontWeight: 600, color: '#059669' }}>
                Accept all pending
              </button>
              <button type="button" onClick={onRejectAllPending} style={{ fontSize: 11.5, fontWeight: 600, color: '#6B7280' }}>
                Reject all pending
              </button>
            </>
          )}
          <button type="button" onClick={onClear} style={{ fontSize: 11.5, color: '#9AA3AF' }}>Clear list</button>
        </div>
      </div>
      <div>
        {visible.map((f) => {
          const chip = KIND_CHIP[f.kind];
          const done = f.status === 'accepted' || f.status === 'rejected';
          const srcLabel = shortLabel(sourceLabelForGlobalIdx(sources, f.startIdx));
          const preview = (f.adjustedText || f.excerpt || f.title || '').replace(/\s+/g, ' ');
          const adjusting = adjustId === f.id;
          return (
            <div
              key={f.id}
              className="px-3 py-2.5"
              style={{
                borderBottom: '1px solid rgba(0,0,0,0.05)',
                opacity: f.status === 'rejected' ? 0.65 : 1,
              }}
            >
              <button type="button" className="w-full text-left" onClick={() => onJump(f.startIdx)}>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                        style={{ background: chip.bg, color: chip.color }}
                      >
                        {chip.label}
                      </span>
                      <span style={{ fontSize: 11, color: '#9AA3AF' }}>
                        {srcLabel} · p.{f.page ?? '—'}
                      </span>
                    </div>
                    <p
                      style={{
                        fontSize: 12.5,
                        color: '#374151',
                        lineHeight: 1.4,
                        textDecoration: f.status === 'rejected' ? 'line-through' : 'none',
                      }}
                      className="line-clamp-2"
                    >
                      {preview}
                    </p>
                  </div>
                  {f.status === 'accepted' && (
                    <span className="shrink-0 text-[11px] font-semibold" style={{ color: '#059669' }}>accepted</span>
                  )}
                  {f.status === 'rejected' && (
                    <span className="shrink-0 text-[11px] font-semibold" style={{ color: '#9CA3AF' }}>rejected</span>
                  )}
                </div>
              </button>
              {adjusting && (
                <div className="mt-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                  <input
                    value={f.title}
                    onChange={(e) => onChange(flags.map((x) => (x.id === f.id ? { ...x, title: e.target.value, status: 'adjusted' } : x)))}
                    className="w-full rounded-md px-2 py-1 text-xs"
                    style={{ border: '1px solid rgba(0,0,0,0.1)', outline: 'none' }}
                  />
                  <textarea
                    value={f.adjustedText ?? f.excerpt}
                    rows={2}
                    onChange={(e) => onChange(flags.map((x) => (x.id === f.id ? { ...x, adjustedText: e.target.value, status: 'adjusted' } : x)))}
                    className="w-full rounded-md px-2 py-1 text-xs resize-y"
                    style={{ border: '1px solid rgba(0,0,0,0.1)', outline: 'none' }}
                  />
                  <button type="button" onClick={() => setAdjustId(null)} style={{ fontSize: 11, color: '#2563EB', fontWeight: 600 }}>Done</button>
                </div>
              )}
              {!done && (
                <div className="flex gap-2 mt-1.5" onClick={(e) => e.stopPropagation()}>
                  <button type="button" onClick={() => onAccept(f)} style={{ fontSize: 11.5, fontWeight: 650, color: '#059669' }}>Accept</button>
                  <button type="button" onClick={() => onReject(f.id)} style={{ fontSize: 11.5, fontWeight: 600, color: '#6B7280' }}>Reject</button>
                  <button type="button" onClick={() => setAdjustId(f.id)} style={{ fontSize: 11.5, fontWeight: 600, color: '#2563EB' }}>Adjust</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

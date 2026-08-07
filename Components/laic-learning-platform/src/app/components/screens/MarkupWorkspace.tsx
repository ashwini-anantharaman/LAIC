/**
 * Mark up step — fixed two-pane workspace (source tabs + paginated reader + right rail).
 * Highlight / scan data shapes are unchanged for Extract downstream.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Check, ChevronLeft, ChevronRight, ClipboardPaste, FileText,
  Link2, Loader2, Search, Sparkles, Upload, X, Youtube, StickyNote,
} from 'lucide-react';
import type { DefinedSection, MarkupFlag } from '../../../lib/types';
import { annotateWebArticleHtml } from '../../../lib/webArticleHtml';
import { highlightsFromFlag, distinctFlagGroups, flagGroupMeta } from './MarkupFlagReview';
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
  /** Sanitized website HTML — when set, Markup renders site formatting. */
  html?: string;
  sourceUrl?: string;
}

const TAG: Record<string, { bg: string; text: string; border: string }> = {
  Use: { bg: '#FEF3C7', text: '#92400E', border: '#F59E0B' },
  Support: { bg: '#E0F2FE', text: '#0C4A6E', border: '#0EA5E9' },
  Ignore: { bg: '#FEE2E2', text: '#991B1B', border: '#EF4444' },
  Note: { bg: '#F3E8FF', text: '#6B21A8', border: '#A855F7' },
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
  /** Define-first: human Plan sections drive scan + highlight assignment. */
  definedSections?: DefinedSection[];
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
  definedSections = [],
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
  /** Mutually exclusive bulk tools: select-all vs document scan. */
  const [bulkMode, setBulkMode] = useState<'none' | 'selectAll' | 'scan'>('none');
  const [pendingIdxs, setPendingIdxs] = useState<number[]>([]);
  const [pendingQuote, setPendingQuote] = useState('');
  const [actionOpen, setActionOpen] = useState(false);
  const [pickTag, setPickTag] = useState<string>('Use');
  const [pickNote, setPickNote] = useState('');
  const [pickSectionId, setPickSectionId] = useState<string>('');
  /** Floating popup anchor (viewport coords), Google Docs–style. */
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null);
  const [showHint, setShowHint] = useState(true);
  const [railTab, setRailTab] = useState<'scan' | 'highlights'>('scan');
  const [hlFilterTag, setHlFilterTag] = useState<string>('all');
  const [hlFilterSource, setHlFilterSource] = useState<string>('all');
  const [noteOpenIdx, setNoteOpenIdx] = useState<number | null>(null);
  const [focusGlobalIdx, setFocusGlobalIdx] = useState<number | null>(null);
  const [railOpen, setRailOpen] = useState(true);
  const sentenceRefs = useRef<Map<number, HTMLElement | null>>(new Map());
  const readerRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  /** Skip one mouseup-dismiss after opening the popup from a mark click. */
  const skipDismissRef = useRef(false);
  const pendingSet = useMemo(() => new Set(pendingIdxs), [pendingIdxs]);

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

  /** Website sources: render sanitized HTML with site-like formatting + sentence spans. */
  const webArticleHtml = useMemo(() => {
    if (!activeSource?.html) return null;
    const tagByIdx = new Map<number, string>();
    for (const h of highlights || []) {
      if (typeof h?.idx === 'number' && h.tag) tagByIdx.set(h.idx, h.tag);
    }
    const sentences = activeSource.sentences.map((s, localIdx) => ({
      text: s.text,
      globalIdx: activeSource.offset + localIdx,
    }));
    return annotateWebArticleHtml(activeSource.html, sentences, tagByIdx);
  }, [activeSource, highlights]);

  useEffect(() => {
    if (!webArticleHtml || !readerRef.current) return;
    sentenceRefs.current.clear();
    readerRef.current.querySelectorAll('[data-global-idx]').forEach((node) => {
      const el = node as HTMLElement;
      const idx = Number(el.dataset.globalIdx);
      if (Number.isInteger(idx)) sentenceRefs.current.set(idx, el);
    });
  }, [webArticleHtml, activeSourceId, page]);

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

  // NOTE: openActionFor / selection capture / useEffects must stay above any early
  // return — otherwise Mark up crashes with "Rendered more/fewer hooks" when PDF
  // parsing finishes (parsing → ready flips the hook count).

  const openActionFor = (
    idxs: number[],
    opts?: { preferTag?: string; quote?: string; anchor?: { top: number; left: number } | null },
  ) => {
    const unique = [...new Set(idxs)].sort((a, b) => a - b);
    if (!unique.length) return;
    setPendingIdxs(unique);
    setPendingQuote((opts?.quote || '').trim());
    const existing = highlights.find((h: any) => unique.includes(h.idx));
    setPickTag(opts?.preferTag || existing?.tag || activeTag || 'Use');
    setPickNote(existing?.comment || '');
    const existingSec = existing?.sectionId || '';
    const defaultSec = existingSec
      || (definedSections.some((s) => s.id === pickSectionId) ? pickSectionId : '')
      || definedSections[0]?.id
      || '';
    setPickSectionId(defaultSec);
    if (opts?.anchor) setPopupPos(opts.anchor);
    else {
      const el = sentenceRefs.current.get(unique[0]);
      if (el) {
        const r = el.getBoundingClientRect();
        setPopupPos({
          top: Math.min(window.innerHeight - 16, r.bottom + 8),
          left: Math.min(window.innerWidth - 320, Math.max(12, r.left)),
        });
      } else {
        setPopupPos({ top: 120, left: Math.max(12, window.innerWidth / 2 - 160) });
      }
    }
    skipDismissRef.current = true;
    setActionOpen(true);
  };

  const cancelAction = () => {
    setActionOpen(false);
    setPendingIdxs([]);
    setPendingQuote('');
    setPickNote('');
    setPopupPos(null);
    if (bulkMode === 'selectAll') setBulkMode('none');
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();
  };

  const applyAction = () => {
    if (!pendingIdxs.length) return;
    const tag = pickTag || 'Use';
    const comment = pickNote.trim();
    const quote = pendingQuote.trim();
    setHighlights((prev) => {
      const keep = prev.filter((h: any) => !pendingIdxs.includes(h.idx));
      const additions = pendingIdxs.map((globalIdx, i) => {
        const src = effectiveSources.find((s) => globalIdx >= s.offset && globalIdx < s.offset + s.sentences.length);
        const sentence = paras[globalIdx] || '';
        // Prefer the exact selected quote on the first sentence; keep sentence text for the rest.
        let text = sentence;
        if (quote) {
          if (pendingIdxs.length === 1) text = quote;
          else if (i === 0) text = quote;
          else if (quote.includes(sentence)) text = sentence;
        }
        return {
          idx: globalIdx,
          tag,
          text,
          page: pages?.[globalIdx] ?? 1,
          comment,
          sourceId: src?.id,
          sourceLabel: src?.label,
          sectionId: pickSectionId || undefined,
        };
      });
      return [...keep, ...additions];
    });
    setActiveTag(tag);
    setActionOpen(false);
    setPendingIdxs([]);
    setPendingQuote('');
    setPickNote('');
    setPopupPos(null);
    if (bulkMode === 'selectAll') setBulkMode('none');
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();
  };

  /** Resolve a native text selection inside the reader → sentence idxs + quote + popup anchor. */
  const captureReaderSelection = () => {
    const root = readerRef.current;
    if (!root) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return;
    const quote = sel.toString().replace(/\s+/g, ' ').trim();
    if (!quote) return;

    const idxs: number[] = [];
    root.querySelectorAll('[data-global-idx]').forEach((node) => {
      const el = node as HTMLElement;
      const idx = Number(el.dataset.globalIdx);
      if (!Number.isInteger(idx)) return;
      try {
        if (range.intersectsNode(el)) idxs.push(idx);
      } catch {
        /* ignore */
      }
    });

    // Fallback: titles/headings may not have spans yet — match selected text to units.
    if (!idxs.length) {
      const q = quote.toLowerCase();
      const matched: number[] = [];
      for (const src of effectiveSources) {
        src.sentences.forEach((s, localIdx) => {
          const t = String(s.text || '').replace(/\s+/g, ' ').trim().toLowerCase();
          if (!t) return;
          if (t === q || t.includes(q) || q.includes(t)) {
            matched.push(src.offset + localIdx);
          }
        });
      }
      // Prefer exact / shortest containing unit (title over a long paragraph that embeds it).
      matched.sort((a, b) => {
        const ta = String(paras[a] || '').length;
        const tb = String(paras[b] || '').length;
        return ta - tb;
      });
      if (matched.length) idxs.push(matched[0]);
    }
    if (!idxs.length) return;

    if (bulkMode === 'scan') setBulkMode('none');
    const rect = range.getBoundingClientRect();
    const popupW = 320;
    const left = Math.min(window.innerWidth - popupW - 12, Math.max(12, rect.left + rect.width / 2 - popupW / 2));
    const top = rect.bottom + 10 > window.innerHeight - 220
      ? Math.max(12, rect.top - 10) // place above if near bottom; refined after measure
      : rect.bottom + 10;
    openActionFor(idxs, {
      quote,
      preferTag: activeTag || 'Use',
      anchor: { top, left },
    });
  };

  useEffect(() => {
    const onMouseUp = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (popupRef.current && t && popupRef.current.contains(t)) return;
      // Defer so the browser finishes updating the selection.
      window.setTimeout(() => {
        if (skipDismissRef.current) {
          skipDismissRef.current = false;
          return;
        }
        const sel = window.getSelection();
        const hasRange = !!(sel && !sel.isCollapsed && sel.toString().trim());
        if (!hasRange) {
          // Click away (no drag-select) dismisses the floating popup.
          if (actionOpen && !(popupRef.current && t && popupRef.current.contains(t))) {
            // Keep select-all mode popup until Cancel; only dismiss free selections.
            if (bulkMode !== 'selectAll') {
              setActionOpen(false);
              setPendingIdxs([]);
              setPendingQuote('');
              setPopupPos(null);
            }
          }
          return;
        }
        captureReaderSelection();
      }, 0);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') window.setTimeout(() => captureReaderSelection(), 0);
    };
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keyup', onKeyUp);
    return () => {
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('keyup', onKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSources, paras, pages, highlights, activeTag, bulkMode, actionOpen]);

  // Keep floating popup on-screen after open.
  useEffect(() => {
    if (!actionOpen || !popupRef.current || !popupPos) return;
    const el = popupRef.current;
    const r = el.getBoundingClientRect();
    let top = popupPos.top;
    let left = popupPos.left;
    if (r.bottom > window.innerHeight - 8) top = Math.max(12, popupPos.top - r.height - 20);
    if (r.right > window.innerWidth - 8) left = Math.max(12, window.innerWidth - r.width - 12);
    if (top !== popupPos.top || left !== popupPos.left) setPopupPos({ top, left });
  }, [actionOpen, popupPos, pendingIdxs.length]);

  const selectAllActive = () => {
    if (!activeSource) return;
    if (bulkMode === 'selectAll') {
      cancelAction();
      setBulkMode('none');
      return;
    }
    // Mutually exclusive with scan
    setBulkMode('selectAll');
    const idxs = activeSource.sentences.map((_, localIdx) => activeSource.offset + localIdx);
    openActionFor(idxs, { preferTag: activeTag || 'Use' });
  };

  const runScan = () => {
    if (!onScanFlags || scanningFlags) return;
    const focus = scanFocus.trim();
    // Free-text focus is required when there are no Plan sections; otherwise optional.
    if (!definedSections.length && !focus) return;
    setBulkMode('scan');
    setActionOpen(false);
    setPendingIdxs([]);
    setPendingQuote('');
    setPopupPos(null);
    setRailTab('scan');
    onScanFlags(focus);
  };

  const clearAll = () => setHighlights([]);

  const highlightAllMatches = () => {
    const q = (query || '').trim().toLowerCase();
    if (!q || !activeSource) return;
    if (bulkMode === 'scan') setBulkMode('none');
    const idxs = activeSource.sentences
      .map((s, localIdx) => ({
        idx: activeSource.offset + localIdx,
        text: s.text,
      }))
      .filter((p) => p.text.toLowerCase().includes(q))
      .map((p) => p.idx);
    if (idxs.length) openActionFor(idxs, { preferTag: activeTag || 'Use' });
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

  return (
    <div className="flex flex-col gap-2.5 px-4 py-3 w-full pb-8" style={{ background: '#EEF0F3' }}>
      <style>{`
        .web-article-body h1 { font-size: 1.75rem; font-weight: 700; line-height: 1.25; margin: 0 0 0.75rem; color: #0B1220; }
        .web-article-body h2 { font-size: 1.4rem; font-weight: 700; line-height: 1.3; margin: 1.4rem 0 0.55rem; color: #0B1220; }
        .web-article-body h3 { font-size: 1.2rem; font-weight: 650; line-height: 1.35; margin: 1.2rem 0 0.45rem; color: #111827; }
        .web-article-body h4, .web-article-body h5, .web-article-body h6 { font-size: 1.05rem; font-weight: 650; margin: 1rem 0 0.4rem; color: #111827; }
        .web-article-body p { margin: 0 0 0.85rem; }
        .web-article-body ul, .web-article-body ol { margin: 0 0 0.9rem; padding-left: 1.4rem; }
        .web-article-body li { margin: 0.25rem 0; }
        .web-article-body blockquote { margin: 0.9rem 0; padding: 0.4rem 0 0.4rem 1rem; border-left: 3px solid #D1D5DB; color: #374151; font-style: italic; }
        .web-article-body pre { margin: 0.9rem 0; padding: 0.75rem 1rem; background: #F3F4F6; border-radius: 8px; overflow-x: auto; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85em; }
        .web-article-body code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; background: rgba(0,0,0,0.04); padding: 0.1em 0.3em; border-radius: 4px; }
        .web-article-body pre code { background: transparent; padding: 0; }
        .web-article-body a { color: #2563EB; text-decoration: underline; text-underline-offset: 2px; }
        .web-article-body img { max-width: 100%; height: auto; border-radius: 8px; margin: 0.75rem 0; }
        .web-article-body table { width: 100%; border-collapse: collapse; margin: 0.9rem 0; font-size: 0.92em; }
        .web-article-body th, .web-article-body td { border: 1px solid #E5E7EB; padding: 0.4rem 0.55rem; text-align: left; vertical-align: top; }
        .web-article-body th { background: #F9FAFB; font-weight: 650; }
        .web-article-body figure { margin: 1rem 0; }
        .web-article-body figcaption { font-size: 0.85em; color: #6B7280; margin-top: 0.35rem; }
        .web-article-body .mk-sent { border-radius: 2px; }
        .web-article-body .mk-tag-use { background: #FEF3C7; box-shadow: inset 0 -2px 0 #F59E0B; }
        .web-article-body .mk-tag-support { background: #E0F2FE; box-shadow: inset 0 -2px 0 #0EA5E9; }
        .web-article-body .mk-tag-ignore { background: #FEE2E2; box-shadow: inset 0 -2px 0 #EF4444; text-decoration: line-through; }
        .web-article-body .mk-tag-note { background: #F3E8FF; box-shadow: inset 0 -2px 0 #A855F7; }
      `}</style>
      {/* Hint banner */}
      {showHint && (
        <div
          className="flex items-start gap-2 px-4 py-2.5 rounded-xl"
          style={{ background: '#FEF3C7', border: '1px solid #FDE68A' }}
        >
          <p style={{ fontSize: 12.5, color: '#92400E', lineHeight: 1.45, flex: 1 }}>
            Select text like in a document — press, drag, then release. A small popup appears so you can choose Use / Support / Ignore / Note or add your own note. Select all and Scan document are mutually exclusive. Scan needs a focus.
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
        <button
          type="button"
          onClick={selectAllActive}
          disabled={!activeSource?.sentences.length || bulkMode === 'scan' || !!scanningFlags}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full disabled:opacity-40"
          style={{
            fontSize: 12,
            fontWeight: 650,
            color: bulkMode === 'selectAll' ? '#fff' : '#374151',
            background: bulkMode === 'selectAll' ? '#0B0F1A' : '#F3F4F6',
            border: bulkMode === 'selectAll' ? '1.5px solid #0B0F1A' : '1.5px solid transparent',
          }}
          title={bulkMode === 'scan' ? 'Turn off Scan document to use Select all' : 'Select every sentence on this source'}
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
                  onChange={(e) => {
                    setScanFocus(e.target.value);
                    if (bulkMode === 'selectAll') setBulkMode('none');
                  }}
                  disabled={bulkMode === 'selectAll'}
                  placeholder={definedSections.length ? 'Scan focus (optional)…' : 'Scan focus (required)…'}
                  className="rounded-lg pl-8 pr-3 py-1.5 disabled:opacity-45"
                  style={{
                    fontSize: 12.5,
                    width: 200,
                    border: '1px solid rgba(0,0,0,0.1)',
                    background: '#fff',
                    outline: 'none',
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') runScan();
                  }}
                />
              </div>
              {definedSections.length > 0 && (
                <span style={{ fontSize: 11.5, color: '#6B7280' }}>
                  + {definedSections.length} section{definedSections.length === 1 ? '' : 's'}
                </span>
              )}
              <button
                type="button"
                onClick={runScan}
                disabled={flagBusy || bulkMode === 'selectAll' || (!definedSections.length && !scanFocus.trim())}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-white disabled:opacity-45"
                style={{
                  background: bulkMode === 'scan' ? '#2563EB' : '#0B0F1A',
                  fontSize: 12.5,
                  fontWeight: 650,
                }}
                title={
                  bulkMode === 'selectAll'
                    ? 'Turn off Select all to scan'
                    : !definedSections.length && !scanFocus.trim()
                      ? 'Enter a scan focus first'
                      : 'Scan and group passages by your focus'
                }
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

          <div
            ref={readerRef}
            className="px-5 py-4"
            data-web-article={webArticleHtml ? '1' : undefined}
            style={{
              fontSize: 15,
              lineHeight: 1.85,
              fontFamily: webArticleHtml ? 'Georgia, "Times New Roman", Times, serif' : 'Georgia, "Times New Roman", serif',
              color: '#1F2937',
              userSelect: 'text',
              cursor: 'text',
              WebkitUserSelect: 'text',
            }}
          >
            {!activeSource && (
              <p style={{ fontSize: 13, color: '#9AA3AF', fontFamily: 'inherit' }}>No document text to mark up.</p>
            )}
            {activeSource && !webArticleHtml && pageSentences.length === 0 && (
              <p style={{ fontSize: 13, color: '#9AA3AF', fontFamily: 'inherit' }}>No sentences on this page.</p>
            )}
            {webArticleHtml && (
              <div className="web-article">
                {activeSource?.sourceUrl && (
                  <p style={{ fontSize: 11.5, color: '#6B7280', marginBottom: 14, fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
                    Formatted from{' '}
                    <a href={activeSource.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#2563EB' }}>
                      {activeSource.sourceUrl.replace(/^https?:\/\//, '').slice(0, 64)}
                      {activeSource.sourceUrl.length > 64 ? '…' : ''}
                    </a>
                  </p>
                )}
                <div
                  className="web-article-body"
                  dangerouslySetInnerHTML={{ __html: webArticleHtml }}
                />
              </div>
            )}
            {!webArticleHtml && pageSentences.map((s, i) => {
              const hl = highlights.find((h: any) => h.idx === s.globalIdx);
              const isAi = aiSuggestions.includes(s.globalIdx);
              const isFlagged = flaggedIdx.has(s.globalIdx);
              const isMatch = q.length > 0 && s.text.toLowerCase().includes(q);
              const isFocus = focusGlobalIdx === s.globalIdx;
              const isPending = pendingSet.has(s.globalIdx);
              const c = hl ? TAG[hl.tag] || TAG.Use : null;
              const markQuote = hl && (hl.text || '').trim() && s.text.includes(String(hl.text).trim()) && String(hl.text).trim().length < s.text.length
                ? String(hl.text).trim()
                : null;
              const markStyle = c ? {
                background: c.bg,
                color: c.text,
                borderBottom: `2px solid ${c.border}`,
                borderRadius: 3,
                padding: '0 2px',
                boxDecorationBreak: 'clone' as const,
                WebkitBoxDecorationBreak: 'clone' as const,
                textDecoration: hl?.tag === 'Ignore' ? 'line-through' : 'none',
              } : undefined;
              const softBg = !hl
                ? (isPending
                  ? 'rgba(11,15,26,0.08)'
                  : isFocus
                    ? 'rgba(14,165,233,0.10)'
                    : isAi
                      ? 'rgba(254,243,199,0.45)'
                      : isFlagged
                        ? 'rgba(37,99,235,0.06)'
                        : isMatch
                          ? 'rgba(14,165,233,0.10)'
                          : 'transparent')
                : 'transparent';
              const body = (() => {
                if (hl && markQuote && markStyle) {
                  const at = s.text.indexOf(markQuote);
                  return (
                    <>
                      {s.text.slice(0, at)}
                      <mark
                        data-hl-tag={hl.tag}
                        style={markStyle}
                        onClick={(e) => {
                          e.stopPropagation();
                          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          openActionFor([s.globalIdx], {
                            preferTag: hl.tag,
                            quote: markQuote,
                            anchor: { top: r.bottom + 8, left: Math.max(12, r.left) },
                          });
                        }}
                      >
                        {markQuote}
                      </mark>
                      {s.text.slice(at + markQuote.length)}
                    </>
                  );
                }
                if (hl && markStyle) {
                  return (
                    <mark
                      data-hl-tag={hl.tag}
                      style={markStyle}
                      onClick={(e) => {
                        e.stopPropagation();
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        openActionFor([s.globalIdx], {
                          preferTag: hl.tag,
                          quote: s.text,
                          anchor: { top: r.bottom + 8, left: Math.max(12, r.left) },
                        });
                      }}
                    >
                      {s.text}
                    </mark>
                  );
                }
                return s.text;
              })();
              return (
                <span key={s.globalIdx}>
                  <span
                    data-global-idx={s.globalIdx}
                    ref={(el) => { sentenceRefs.current.set(s.globalIdx, el); }}
                    style={{
                      background: softBg,
                      outline: isFocus ? '1.5px solid rgba(14,165,233,0.45)' : undefined,
                      borderRadius: 3,
                    }}
                  >
                    {body}
                  </span>
                  {i < pageSentences.length - 1 ? ' ' : ''}
                </span>
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
                  <div className="p-5">
                    <div className="text-center mb-4">
                      <Sparkles size={18} style={{ color: '#D1D5DB', margin: '0 auto 10px' }} />
                      <p style={{ fontSize: 13, fontWeight: 650, color: '#0B1220' }}>Set a scan focus, then scan</p>
                      <p style={{ fontSize: 12, color: '#9AA3AF', marginTop: 6, lineHeight: 1.45 }}>
                        Type what you want grouped (e.g. “opening bids”). Groups come from your focus — nothing auto-runs.
                      </p>
                    </div>
                    <label style={{ fontSize: 11.5, fontWeight: 650, color: '#6B7280', display: 'block', marginBottom: 6 }}>
                      Scan focus{definedSections.length ? ' (optional)' : ' (required)'}
                    </label>
                    <textarea
                      value={scanFocus}
                      onChange={(e) => {
                        setScanFocus(e.target.value);
                        if (bulkMode === 'selectAll') setBulkMode('none');
                      }}
                      disabled={bulkMode === 'selectAll' || !onScanFlags}
                      rows={3}
                      placeholder='e.g. opening bids, trump suit, scoring…'
                      className="w-full rounded-xl px-3 py-2.5 resize-y disabled:opacity-45"
                      style={{
                        fontSize: 13,
                        border: '1px solid rgba(0,0,0,0.12)',
                        background: '#fff',
                        outline: 'none',
                        lineHeight: 1.45,
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          runScan();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={runScan}
                      disabled={!onScanFlags || flagBusy || bulkMode === 'selectAll' || (!definedSections.length && !scanFocus.trim())}
                      className="mt-3 w-full flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-full text-white disabled:opacity-45"
                      style={{ background: '#0B0F1A', fontSize: 13, fontWeight: 650 }}
                    >
                      {flagBusy ? <Loader2 size={13} className="animate-spin" /> : <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>}
                      {flagBusy ? 'Scanning…' : 'Scan document'}
                    </button>
                    <p style={{ fontSize: 11.5, color: '#9AA3AF', marginTop: 8, textAlign: 'center' }}>
                      Press Enter to scan · Shift+Enter for a new line
                    </p>
                    {!onScanFlags && (
                      <p style={{ fontSize: 12, color: '#B45309', marginTop: 8, textAlign: 'center' }}>
                        Scan isn’t available for this source yet.
                      </p>
                    )}
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
                  {definedSections.length > 0 && (
                <div className="mb-2 space-y-1">
                  {definedSections.map((s) => {
                    const n = highlights.filter((h: any) => h.sectionId === s.id && h.tag !== 'Ignore').length;
                    return (
                      <div key={s.id} className="flex items-center justify-between rounded-lg px-2 py-1" style={{ background: n ? 'rgba(5,150,105,0.06)' : 'rgba(245,158,11,0.08)' }}>
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: '#0B1220' }} className="truncate">{s.title}</span>
                        <span style={{ fontSize: 11, fontWeight: 650, color: n ? '#059669' : '#B45309' }}>
                          {n} mark{n === 1 ? '' : 's'}{n === 0 ? ' — none yet' : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
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

      {/* Google Docs–style floating action popup after text selection */}
      {actionOpen && pendingIdxs.length > 0 && popupPos && (
        <div
          ref={popupRef}
          className="fixed z-50 w-[320px] rounded-xl border px-3 py-2.5 shadow-lg"
          style={{
            top: popupPos.top,
            left: popupPos.left,
            background: '#FFFFFF',
            borderColor: 'rgba(0,0,0,0.10)',
            boxShadow: '0 10px 30px -8px rgba(15,23,42,0.28), 0 2px 8px rgba(15,23,42,0.08)',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <p style={{ fontSize: 12, fontWeight: 650, color: '#0B1220', lineHeight: 1.35 }}>
              {pendingQuote
                ? `Selected “${pendingQuote.length > 72 ? `${pendingQuote.slice(0, 70)}…` : pendingQuote}”`
                : `Selected ${pendingIdxs.length} sentence${pendingIdxs.length === 1 ? '' : 's'}`}
            </p>
            <button type="button" onClick={cancelAction} aria-label="Close" className="shrink-0 p-0.5">
              <X size={13} style={{ color: '#9AA3AF' }} />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1 mb-2">
            {Object.keys(TAG).map((tag) => {
              const c = TAG[tag];
              const on = pickTag === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setPickTag(tag)}
                  className="px-2 py-0.5 rounded-full transition-all"
                  style={{
                    fontSize: 11.5,
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
          </div>
          {definedSections.length > 0 && (
            <div className="mb-2">
              <p style={{ fontSize: 11, fontWeight: 650, color: '#6B7280', marginBottom: 4 }}>Assign to section</p>
              <select
                value={pickSectionId}
                onChange={(e) => setPickSectionId(e.target.value)}
                className="w-full rounded-lg px-2 py-1.5"
                style={{ fontSize: 12.5, border: '1px solid rgba(0,0,0,0.1)', outline: 'none', background: '#fff' }}
              >
                {definedSections.map((s) => (
                  <option key={s.id} value={s.id}>{s.title || 'Untitled section'}</option>
                ))}
              </select>
            </div>
          )}
          <textarea
            value={pickNote}
            onChange={(e) => setPickNote(e.target.value)}
            rows={2}
            autoFocus
            placeholder="Add a note or instruction…"
            className="w-full rounded-lg px-2 py-1.5 resize-y mb-2"
            style={{ fontSize: 12.5, border: '1px solid rgba(0,0,0,0.1)', outline: 'none', lineHeight: 1.4 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) applyAction();
              if (e.key === 'Escape') cancelAction();
            }}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={applyAction}
              className="px-2.5 py-1 rounded-full text-white text-[11.5px] font-semibold"
              style={{ background: '#0B0F1A' }}
            >
              Apply
            </button>
            <button type="button" onClick={cancelAction} style={{ fontSize: 11.5, color: '#6B7280' }}>
              Cancel
            </button>
          </div>
        </div>
      )}
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
  const [kindFilter, setKindFilter] = useState<string>('all');
  const pending = flags.filter((f) => f.status === 'pending' || f.status === 'adjusted');
  const groups = distinctFlagGroups(flags);
  const visible = kindFilter === 'all' ? flags : flags.filter((f) => f.kind === kindFilter);

  return (
    <div className="flex flex-col">
      <div className="px-3 py-2.5 space-y-2" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
        <div className="flex flex-wrap gap-1.5">
          {groups.map((g) => {
            const chip = flagGroupMeta(g.kind, g.label);
            const on = kindFilter === g.kind;
            return (
              <button
                key={g.kind}
                type="button"
                onClick={() => setKindFilter(on ? 'all' : g.kind)}
                className="px-2 py-0.5 rounded-full text-[11px] font-semibold transition-all"
                style={{
                  background: chip.bg,
                  color: chip.color,
                  outline: on ? `1.5px solid ${chip.color}` : 'none',
                }}
              >
                {g.count} {chip.label}
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
          const chip = flagGroupMeta(f.kind, f.groupLabel);
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

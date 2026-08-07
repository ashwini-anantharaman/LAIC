import React, { useMemo, useState } from 'react';
import { Check, X, Pencil, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import type { MarkupFlag } from '../../../lib/types';

const LEGACY_KIND_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  core: { label: 'Core concept', color: '#065F46', bg: 'rgba(5,150,105,0.08)', border: 'rgba(5,150,105,0.28)' },
  confusion: { label: 'Common confusion', color: '#92400E', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.35)' },
  diagram: { label: 'Diagram / visual', color: '#1E40AF', bg: 'rgba(37,99,235,0.08)', border: 'rgba(37,99,235,0.28)' },
  out_of_scope: { label: 'Out of scope', color: '#6B7280', bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.25)' },
};

const GROUP_PALETTE = [
  { color: '#1D4ED8', bg: 'rgba(37,99,235,0.10)', border: 'rgba(37,99,235,0.28)' },
  { color: '#C2410C', bg: 'rgba(234,88,12,0.12)', border: 'rgba(234,88,12,0.30)' },
  { color: '#6D28D9', bg: 'rgba(124,58,237,0.10)', border: 'rgba(124,58,237,0.28)' },
  { color: '#047857', bg: 'rgba(5,150,105,0.10)', border: 'rgba(5,150,105,0.28)' },
  { color: '#BE185D', bg: 'rgba(219,39,119,0.10)', border: 'rgba(219,39,119,0.28)' },
  { color: '#0E7490', bg: 'rgba(14,116,144,0.10)', border: 'rgba(14,116,144,0.28)' },
  { color: '#B45309', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.32)' },
  { color: '#4B5563', bg: 'rgba(107,114,128,0.12)', border: 'rgba(107,114,128,0.28)' },
];

function hashKind(kind: string): number {
  let h = 0;
  for (let i = 0; i < kind.length; i += 1) h = (h * 31 + kind.charCodeAt(i)) >>> 0;
  return h;
}

export function flagGroupMeta(kind: string, groupLabel?: string): { label: string; color: string; bg: string; border: string } {
  if (LEGACY_KIND_META[kind] && !groupLabel) return LEGACY_KIND_META[kind];
  if (LEGACY_KIND_META[kind] && groupLabel === LEGACY_KIND_META[kind].label) return LEGACY_KIND_META[kind];
  const pal = GROUP_PALETTE[hashKind(kind) % GROUP_PALETTE.length];
  const label = (groupLabel || '').trim()
    || LEGACY_KIND_META[kind]?.label
    || kind.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return { label, ...pal };
}

export function flagKindCounts(flags: MarkupFlag[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const f of flags) {
    const key = f.kind || 'other';
    c[key] = (c[key] || 0) + 1;
  }
  return c;
}

export function distinctFlagGroups(flags: MarkupFlag[]): { kind: string; label: string; count: number }[] {
  const order: string[] = [];
  const map = new Map<string, { label: string; count: number }>();
  for (const f of flags) {
    const kind = f.kind || 'other';
    if (!map.has(kind)) {
      order.push(kind);
      map.set(kind, { label: flagGroupMeta(kind, f.groupLabel).label, count: 0 });
    }
    map.get(kind)!.count += 1;
  }
  return order.map((kind) => ({ kind, label: map.get(kind)!.label, count: map.get(kind)!.count }));
}

const TAGS = ['Use', 'Support', 'Ignore', 'Note'] as const;

/** Convert an accepted flag into one or more sentence highlights. */
export function highlightsFromFlag(
  flag: MarkupFlag,
  paras: string[],
  pages?: number[],
): { idx: number; tag: string; text: string; page: number; comment: string; sectionId?: string }[] {
  const tag = flag.suggestedTag || 'Use';
  const group = flagGroupMeta(flag.kind, flag.groupLabel).label;
  const comment = flag.rationale
    ? `${group}: ${flag.rationale}`
    : group;
  const textOverride = (flag.adjustedText || '').trim();
  const out: { idx: number; tag: string; text: string; page: number; comment: string; sectionId?: string }[] = [];
  for (let i = flag.startIdx; i <= flag.endIdx; i += 1) {
    if (i < 0 || i >= paras.length) continue;
    out.push({
      idx: i,
      tag,
      text: i === flag.startIdx && textOverride ? textOverride : paras[i],
      page: pages?.[i] ?? flag.page ?? 1,
      comment: i === flag.startIdx ? comment : '',
      sectionId: flag.sectionId,
    });
  }
  return out;
}

export function MarkupFlagReview({
  flags,
  summary,
  onChange,
  onAccept,
  onReject,
  onAcceptAllPending,
  onRejectAllPending,
  onClear,
}: {
  flags: MarkupFlag[];
  summary?: string;
  onChange: (flags: MarkupFlag[]) => void;
  onAccept: (flag: MarkupFlag) => void;
  onReject: (id: string) => void;
  onAcceptAllPending: () => void;
  onRejectAllPending: () => void;
  onClear: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const pending = flags.filter((f) => f.status === 'pending' || f.status === 'adjusted');
  const decided = flags.filter((f) => f.status === 'accepted' || f.status === 'rejected');
  const groups = useMemo(() => distinctFlagGroups(flags), [flags]);

  if (!flags.length) return null;

  const patch = (id: string, upd: Partial<MarkupFlag>) => {
    onChange(flags.map((f) => (f.id === id ? { ...f, ...upd } : f)));
  };

  return (
    <div className="mb-4 rounded-2xl border overflow-hidden" style={{ background: 'rgba(255,255,255,0.9)', borderColor: 'rgba(0,0,0,0.1)' }}>
      <div className="px-4 py-3 flex items-start gap-3" style={{ background: 'rgba(11,15,26,0.03)', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        <Sparkles size={16} style={{ color: '#0B0F1A', marginTop: 2 }} />
        <div className="flex-1 min-w-0">
          <p style={{ fontSize: 13.5, fontWeight: 700, color: '#0B1220' }}>
            Document review · {flags.length} item{flags.length === 1 ? '' : 's'}
            {pending.length ? ` · ${pending.length} to decide` : ''}
          </p>
          <p style={{ fontSize: 12.5, color: '#6B7280', lineHeight: 1.5, marginTop: 3 }}>
            {summary || groups.map((g) => `${g.count} ${g.label}`).join(' · ') || 'Review scan groups'}
          </p>
        </div>
        <button type="button" onClick={() => setCollapsed((v) => !v)} className="p-1.5 rounded-lg hover:bg-black/5">
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="px-4 py-2 flex flex-wrap gap-2 items-center" style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            {groups.map((g) => {
              const meta = flagGroupMeta(g.kind, g.label);
              return (
                <span key={g.kind} className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: meta.bg, color: meta.color }}>
                  {g.count} {meta.label}
                </span>
              );
            })}
            <div className="flex-1" />
            {pending.length > 0 && (
              <>
                <button type="button" onClick={onAcceptAllPending}
                  className="px-2.5 py-1 rounded-full text-xs font-semibold text-white" style={{ background: '#059669' }}>
                  Accept all pending
                </button>
                <button type="button" onClick={onRejectAllPending}
                  className="px-2.5 py-1 rounded-full text-xs font-semibold border" style={{ borderColor: 'rgba(0,0,0,0.12)', color: '#6B7280' }}>
                  Reject all pending
                </button>
              </>
            )}
            <button type="button" onClick={onClear} style={{ fontSize: 11.5, color: '#9AA3AF' }}>Clear list</button>
          </div>

          <div className="max-h-[420px] overflow-y-auto p-3 space-y-2.5">
            {flags.map((f) => {
              const meta = flagGroupMeta(f.kind, f.groupLabel);
              const editing = editingId === f.id;
              const done = f.status === 'accepted' || f.status === 'rejected';
              return (
                <div
                  key={f.id}
                  className="rounded-xl p-3 border"
                  style={{
                    background: done ? 'rgba(0,0,0,0.02)' : meta.bg,
                    borderColor: done ? 'rgba(0,0,0,0.06)' : meta.border,
                    opacity: f.status === 'rejected' ? 0.55 : 1,
                  }}
                >
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: 'white', color: meta.color }}>
                      {meta.label}
                    </span>
                    <span style={{ fontSize: 11, color: '#9AA3AF' }}>
                      p.{f.page ?? '—'} · sentences {f.startIdx}–{f.endIdx}
                    </span>
                    {f.status === 'accepted' && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(5,150,105,0.15)', color: '#059669' }}>Accepted</span>
                    )}
                    {f.status === 'rejected' && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(0,0,0,0.06)', color: '#6B7280' }}>Rejected</span>
                    )}
                  </div>

                  {editing ? (
                    <div className="space-y-2 mb-2">
                      <input
                        value={f.title}
                        onChange={(e) => patch(f.id, { title: e.target.value, status: 'adjusted' })}
                        className="w-full rounded-lg px-2.5 py-1.5"
                        style={{ fontSize: 13, fontWeight: 600, border: '1px solid rgba(0,0,0,0.1)', outline: 'none' }}
                      />
                      <textarea
                        value={f.adjustedText ?? f.excerpt}
                        onChange={(e) => patch(f.id, { adjustedText: e.target.value, status: 'adjusted' })}
                        rows={3}
                        className="w-full rounded-lg px-2.5 py-1.5 resize-y"
                        style={{ fontSize: 12.5, border: '1px solid rgba(0,0,0,0.1)', outline: 'none', lineHeight: 1.45 }}
                      />
                      <div className="flex items-center gap-2 flex-wrap">
                        <span style={{ fontSize: 11, color: '#6B7280' }}>Tag when accepted:</span>
                        {TAGS.map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => patch(f.id, { suggestedTag: t, status: 'adjusted' })}
                            className="px-2 py-0.5 rounded-full text-xs font-semibold border"
                            style={{
                              borderColor: f.suggestedTag === t ? '#0B0F1A' : 'rgba(0,0,0,0.1)',
                              background: f.suggestedTag === t ? '#0B0F1A' : 'white',
                              color: f.suggestedTag === t ? 'white' : '#374151',
                            }}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                      <button type="button" onClick={() => setEditingId(null)}
                        className="text-xs font-semibold" style={{ color: '#2563EB' }}>Done adjusting</button>
                    </div>
                  ) : (
                    <>
                      <p style={{ fontSize: 13.5, fontWeight: 650, color: '#0B1220', marginBottom: 4 }}>{f.title}</p>
                      <p style={{ fontSize: 12.5, color: '#374151', lineHeight: 1.5, marginBottom: 4 }}>
                        {f.adjustedText || f.excerpt}
                      </p>
                      {f.rationale && (
                        <p style={{ fontSize: 11.5, color: '#6B7280', lineHeight: 1.45, marginBottom: 6 }}>
                          Why: {f.rationale}
                        </p>
                      )}
                    </>
                  )}

                  {!done && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      <button type="button" onClick={() => onAccept(f)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold text-white"
                        style={{ background: '#059669' }}>
                        <Check size={11} /> Accept
                      </button>
                      <button type="button" onClick={() => onReject(f.id)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border"
                        style={{ borderColor: 'rgba(0,0,0,0.12)', color: '#6B7280' }}>
                        <X size={11} /> Reject
                      </button>
                      <button type="button" onClick={() => setEditingId(f.id)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border"
                        style={{ borderColor: 'rgba(0,0,0,0.12)', color: '#0B1220' }}>
                        <Pencil size={11} /> Adjust
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {decided.length > 0 && pending.length === 0 && (
            <p className="px-4 py-2.5 text-center" style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>
              All review items decided — accepted ones are in your highlights.
            </p>
          )}
        </>
      )}
    </div>
  );
}

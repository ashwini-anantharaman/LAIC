/**
 * Access Catalogue (read-only) — the learning platform does NOT own an access
 * model of its own; it reads the CENTRALIZED catalogue from the Nexus backend
 * (`GET /api/platform/catalogues/learning`) and displays it. This is the
 * "learning platform only shows the JSON" contract: one source of truth in
 * Nexus, mirrored here for visibility. Editing happens in the Nexus console.
 */
import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, KeyRound, LayoutList, Lock, RefreshCw, Code } from 'lucide-react';
import { nexusFetch, getToken } from '../../../lib/nexus';

interface Capability { id: string; label: string; group: string; reserved?: string }
interface UiSurface { id: string; label: string; kind: string; group?: string }
interface CatGroup { id: string; label: string; order: number }
interface CatalogueDoc {
  name: string;
  provider?: { kind: string; id: string };
  catalogueVersion?: string;
  capabilities: Capability[];
  uiSurfaces: UiSurface[];
  groups: CatGroup[];
}

export function AccessCatalogueScreen() {
  const [doc, setDoc] = useState<CatalogueDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [showJson, setShowJson] = useState(false);

  async function load() {
    setLoading(true); setError(null);
    if (!getToken()) { setError('Sign in through Nexus to view the access catalogue.'); setLoading(false); return; }
    try {
      const res = await nexusFetch('/api/platform/catalogues/learning');
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setDoc(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load the access catalogue.');
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const toggle = (id: string) =>
    setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const groupsSorted = doc ? [...doc.groups].sort((a, b) => a.order - b.order) : [];
  const capsIn = (gid: string) => (doc?.capabilities ?? []).filter((c) => c.group === gid);
  const surfsIn = (gid: string) => (doc?.uiSurfaces ?? []).filter((s) => s.group === gid);

  return (
    <div className="px-6 py-6 w-full space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: '#0B0F1A' }}>Access Catalogue</h1>
          <p className="text-sm mt-0.5" style={{ color: '#6B7280' }}>
            The capabilities and screens this platform can grant. Managed centrally in Nexus — read-only here.
          </p>
        </div>
        <button
          type="button" onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          style={{ background: '#F3F4F6', color: '#374151' }}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="rounded-xl px-4 py-8 text-center text-sm" style={{ background: '#F9FAFB', color: '#6B7280' }}>Loading…</div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-xl px-4 py-4 text-sm" style={{ background: '#FEF3C7', color: '#92400E' }}>
          <Lock size={15} /> {error}
        </div>
      ) : doc ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: '#6B7280' }}>
            <span className="px-2.5 py-1 rounded-full font-medium" style={{ background: '#EEF2FF', color: '#3730A3' }}>
              {doc.provider?.kind ?? 'platform'}/{doc.provider?.id ?? 'learning'}
            </span>
            {doc.catalogueVersion ? <span className="px-2.5 py-1 rounded-full" style={{ background: '#F3F4F6' }}>v{doc.catalogueVersion}</span> : null}
            <span>{doc.groups.length} groups · {doc.capabilities.length} capabilities · {doc.uiSurfaces.length} surfaces</span>
          </div>

          {/* Groups — expandable */}
          <div className="space-y-2">
            {groupsSorted.map((g) => {
              const caps = capsIn(g.id); const surfs = surfsIn(g.id); const isOpen = open.has(g.id);
              return (
                <div key={g.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid #E5E7EB', background: 'white' }}>
                  <button
                    type="button" onClick={() => toggle(g.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50"
                  >
                    {isOpen ? <ChevronDown size={16} style={{ color: '#6B7280' }} /> : <ChevronRight size={16} style={{ color: '#6B7280' }} />}
                    <span className="text-sm font-medium" style={{ color: '#0B0F1A' }}>{g.label}</span>
                    <span className="font-mono text-xs" style={{ color: '#9CA3AF' }}>{g.id}</span>
                    <span className="ml-auto text-xs" style={{ color: '#9CA3AF' }}>{caps.length} caps · {surfs.length} surfaces</span>
                  </button>
                  {isOpen ? (
                    <div className="space-y-3 px-4 py-3 pl-11" style={{ borderTop: '1px solid #F3F4F6', background: '#FAFAFB' }}>
                      <div>
                        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: '#6B7280' }}>
                          <KeyRound size={12} /> Capabilities
                        </div>
                        {caps.length ? caps.map((c) => (
                          <div key={c.id} className="flex items-center gap-2 py-0.5 text-sm">
                            <span style={{ color: '#111827' }}>{c.label}</span>
                            <span className="font-mono text-xs" style={{ color: '#9CA3AF' }}>{c.id}</span>
                            {c.reserved ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: '#EDE9FE', color: '#5B21B6' }}>reserved · {c.reserved}</span> : null}
                          </div>
                        )) : <p className="text-xs" style={{ color: '#9CA3AF' }}>None in this group.</p>}
                      </div>
                      <div>
                        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: '#6B7280' }}>
                          <LayoutList size={12} /> Surfaces
                        </div>
                        {surfs.length ? surfs.map((s) => (
                          <div key={s.id} className="flex items-center gap-2 py-0.5 text-sm">
                            <span style={{ color: '#111827' }}>{s.label}</span>
                            <span className="font-mono text-xs" style={{ color: '#9CA3AF' }}>{s.id}</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: '#F3F4F6', color: '#6B7280' }}>{s.kind}</span>
                          </div>
                        )) : <p className="text-xs" style={{ color: '#9CA3AF' }}>None in this group.</p>}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* Raw JSON */}
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #E5E7EB' }}>
            <button
              type="button" onClick={() => setShowJson((v) => !v)}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-gray-50"
              style={{ color: '#374151' }}
            >
              <Code size={14} /> Raw JSON {showJson ? <ChevronDown size={14} className="ml-auto" /> : <ChevronRight size={14} className="ml-auto" />}
            </button>
            {showJson ? (
              <pre className="max-h-[50vh] overflow-auto px-4 py-3 text-xs leading-relaxed" style={{ borderTop: '1px solid #F3F4F6', background: '#0B0F1A', color: '#E5E7EB' }}>
                <code>{JSON.stringify(doc, null, 2)}</code>
              </pre>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

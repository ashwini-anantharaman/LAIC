import React, { useState } from 'react';
import { Plus, Trash2, Loader2, AlertTriangle, GitMerge, Split } from 'lucide-react';
import { buildTutorialKnowledgeBase, errorMessage } from '../../../lib/api';
import type { ClusteredKnowledgeBase, ConceptCluster, ContentUnit, ContentUnitKind } from '../../../lib/types';

const KINDS: ContentUnitKind[] = ['Definition', 'Key point', 'Example', 'Quote', 'Fact', 'Procedure'];

interface Props {
  markHighlights: any[];
  docTitle: string;
  knowledgeBase: ClusteredKnowledgeBase | null;
  setKnowledgeBase: (kb: ClusteredKnowledgeBase | null) => void;
  shapeIntent: string;
  setShapeIntent: (v: string) => void;
  objective?: string;
  topic?: string;
  /** Keep flat extracts in sync for counts / legacy paths. */
  syncExtracts: (units: ContentUnit[]) => void;
}

function unitsOf(kb: ClusteredKnowledgeBase, cluster: ConceptCluster): ContentUnit[] {
  const byId = new Map(kb.units.map((u) => [u.id, u]));
  return cluster.unitIds.map((id) => byId.get(id)).filter(Boolean) as ContentUnit[];
}

export function TutorialExtractPanel({
  markHighlights,
  docTitle,
  knowledgeBase,
  setKnowledgeBase,
  shapeIntent,
  setShapeIntent,
  objective,
  topic,
  syncExtracts,
}: Props) {
  const pullable = (markHighlights || []).filter((h: any) => h.tag === 'Use' || h.tag === 'Support');
  const hlCount = pullable.length;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const applyKb = (kb: ClusteredKnowledgeBase) => {
    setKnowledgeBase(kb);
    syncExtracts(kb.units);
  };

  const runBuild = async (opts?: { refineWithLlm?: boolean; intent?: string }) => {
    setErr(null);
    setBusy(true);
    try {
      const intent = opts?.intent ?? shapeIntent;
      const { knowledgeBase: kb } = await buildTutorialKnowledgeBase({
        highlights: pullable.map((h: any) => ({
          text: h.text,
          comment: h.comment,
          tag: h.tag,
          page: h.page,
          idx: h.idx,
        })),
        shapeIntent: intent || undefined,
        objective,
        topic,
        refineWithLlm: opts?.refineWithLlm !== false,
      });
      applyKb(kb);
    } catch (e) {
      setErr(errorMessage(e, 'Could not build the knowledge base.'));
    } finally {
      setBusy(false);
    }
  };

  const updateUnit = (id: string, patch: Partial<ContentUnit>) => {
    if (!knowledgeBase) return;
    const units = knowledgeBase.units.map((u) => (u.id === id ? { ...u, ...patch } : u));
    applyKb({ ...knowledgeBase, units });
  };

  const removeUnit = (id: string) => {
    if (!knowledgeBase) return;
    const units = knowledgeBase.units.filter((u) => u.id !== id);
    const clusters = knowledgeBase.clusters
      .map((c) => ({ ...c, unitIds: c.unitIds.filter((uid) => uid !== id) }))
      .filter((c) => c.unitIds.length > 0);
    applyKb({ ...knowledgeBase, units, clusters, mergedUnitCount: units.length });
  };

  const renameCluster = (id: string, name: string) => {
    if (!knowledgeBase) return;
    applyKb({
      ...knowledgeBase,
      clusters: knowledgeBase.clusters.map((c) => (c.id === id ? { ...c, name } : c)),
    });
  };

  const moveUnit = (unitId: string, toClusterId: string) => {
    if (!knowledgeBase) return;
    const clusters = knowledgeBase.clusters.map((c) => ({
      ...c,
      unitIds: c.unitIds.filter((id) => id !== unitId),
    })).map((c) => (
      c.id === toClusterId && !c.unitIds.includes(unitId)
        ? { ...c, unitIds: [...c.unitIds, unitId] }
        : c
    )).filter((c) => c.unitIds.length > 0);
    const units = knowledgeBase.units.map((u) => (
      u.id === unitId ? { ...u, clusterId: toClusterId } : u
    ));
    applyKb({ ...knowledgeBase, clusters, units });
  };

  const mergeClusterInto = (fromId: string, intoId: string) => {
    if (!knowledgeBase || fromId === intoId) return;
    const from = knowledgeBase.clusters.find((c) => c.id === fromId);
    const into = knowledgeBase.clusters.find((c) => c.id === intoId);
    if (!from || !into) return;
    const unitIds = [...new Set([...into.unitIds, ...from.unitIds])];
    const clusters = knowledgeBase.clusters
      .filter((c) => c.id !== fromId)
      .map((c) => (c.id === intoId ? { ...c, unitIds } : c));
    const units = knowledgeBase.units.map((u) => (
      from.unitIds.includes(u.id) ? { ...u, clusterId: intoId } : u
    ));
    applyKb({ ...knowledgeBase, clusters, units });
  };

  const splitCluster = (clusterId: string) => {
    if (!knowledgeBase) return;
    const cluster = knowledgeBase.clusters.find((c) => c.id === clusterId);
    if (!cluster || cluster.unitIds.length < 2) return;
    const mid = Math.ceil(cluster.unitIds.length / 2);
    const a = cluster.unitIds.slice(0, mid);
    const b = cluster.unitIds.slice(mid);
    const newId = `cl-${Date.now()}`;
    const clusters = knowledgeBase.clusters.flatMap((c) => {
      if (c.id !== clusterId) return [c];
      return [
        { ...c, unitIds: a, name: `${c.name} (A)` },
        { id: newId, name: `${c.name} (B)`, unitIds: b, covers: c.covers },
      ];
    });
    const units = knowledgeBase.units.map((u) => (
      b.includes(u.id) ? { ...u, clusterId: newId } : u
    ));
    applyKb({ ...knowledgeBase, clusters, units });
  };

  const addManual = () => {
    const id = `u-${Date.now()}`;
    const clusterId = knowledgeBase?.clusters[0]?.id || `cl-${Date.now()}`;
    const unit: ContentUnit = {
      id, kind: 'Key point', text: '', from: '', fromHl: false, clusterId,
    };
    if (!knowledgeBase) {
      applyKb({
        units: [unit],
        clusters: [{ id: clusterId, name: 'Topic 1', unitIds: [id] }],
        rawHighlightCount: 0,
        mergedUnitCount: 1,
      });
      return;
    }
    const clusters = knowledgeBase.clusters.length
      ? knowledgeBase.clusters.map((c, i) => (
        i === 0 ? { ...c, unitIds: [...c.unitIds, id] } : c
      ))
      : [{ id: clusterId, name: 'Topic 1', unitIds: [id] }];
    applyKb({
      ...knowledgeBase,
      units: [...knowledgeBase.units, unit],
      clusters,
      mergedUnitCount: knowledgeBase.units.length + 1,
    });
  };

  const mergeNote = knowledgeBase
    ? `Merged ${knowledgeBase.rawHighlightCount} highlight${knowledgeBase.rawHighlightCount !== 1 ? 's' : ''} → ${knowledgeBase.mergedUnitCount} unit${knowledgeBase.mergedUnitCount !== 1 ? 's' : ''} · ${knowledgeBase.clusters.length} cluster${knowledgeBase.clusters.length !== 1 ? 's' : ''}`
    : null;

  return (
    <div className="p-5 max-w-3xl">
      <div className="rounded-2xl p-4 mb-4" style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(0,0,0,0.08)' }}>
        <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
          <strong>Extract classifies, dedupes, and clusters your markup into teaching material.</strong>{' '}
          Each cluster becomes one tutorial section. Shape with AI steers how units are grouped — nothing is invented from general knowledge.
        </p>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex items-center justify-between p-4 rounded-2xl border gap-3" style={{ background: 'rgba(255,255,255,0.7)', borderColor: 'rgba(0,0,0,0.08)' }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#0B1220' }}>
              {hlCount} highlight{hlCount !== 1 ? 's' : ''} carried from Mark up
            </p>
            <p style={{ fontSize: 12, color: '#6B7280' }}>
              {hlCount > 0
                ? 'Classify, merge near-duplicates, and cluster into section topics'
                : 'Go back to Mark up and tag sentences as Use or Support'}
            </p>
            {mergeNote && (
              <p style={{ fontSize: 11.5, color: '#059669', marginTop: 4, fontWeight: 600 }}>{mergeNote}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => runBuild({ refineWithLlm: true })}
            disabled={hlCount === 0 || busy}
            className="px-4 py-2 rounded-full transition-all shrink-0"
            style={{
              background: hlCount === 0 || busy ? '#E5E7EB' : '#0B0F1A',
              color: hlCount === 0 || busy ? '#9AA3AF' : '#fff',
              fontSize: 12.5, fontWeight: 600,
            }}
          >
            {busy ? <span className="flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" />Building…</span> : '→ Pull & cluster'}
          </button>
        </div>

        <div className="p-4 rounded-2xl border" style={{ background: 'rgba(255,255,255,0.7)', borderColor: 'rgba(0,0,0,0.08)' }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#0B1220', marginBottom: 8 }}>Shape with AI</p>
          <div className="flex gap-2">
            <input
              value={shapeIntent}
              onChange={(e) => setShapeIntent(e.target.value)}
              placeholder="e.g. one definition + one example per topic, short"
              className="flex-1 rounded-xl px-3 py-2"
              style={{ fontSize: 12.5, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.8)', outline: 'none' }}
            />
            <button
              type="button"
              disabled={hlCount === 0 || busy}
              onClick={() => runBuild({ refineWithLlm: true, intent: shapeIntent })}
              className="px-4 py-2 rounded-xl text-white disabled:opacity-50"
              style={{ background: '#0B0F1A', fontSize: 13 }}
            >
              Extract
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={addManual}
          className="flex items-center gap-2 w-full px-4 py-3 rounded-2xl border border-dashed"
          style={{ fontSize: 13, color: '#6B7280', borderColor: 'rgba(0,0,0,0.12)', background: 'rgba(255,255,255,0.5)' }}
        >
          <Plus size={14} />Write one yourself → + Add manually
        </button>
      </div>

      {err && (
        <div className="flex items-start gap-2 mb-3 rounded-2xl p-3" style={{ background: '#FEE2E2', border: '1px solid #FCA5A5' }}>
          <AlertTriangle size={14} style={{ color: '#B91C1C', marginTop: 2 }} />
          <p style={{ fontSize: 12.5, color: '#991B1B' }}>{err}</p>
        </div>
      )}

      {knowledgeBase?.gaps && knowledgeBase.gaps.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {knowledgeBase.gaps.map((g) => (
            <div
              key={g.id}
              className="flex items-start gap-2 rounded-2xl px-3 py-2"
              style={{
                background: g.severity === 'error' ? '#FEE2E2' : '#FEF3C7',
                border: `1px solid ${g.severity === 'error' ? '#FCA5A5' : '#FCD34D'}`,
              }}
            >
              <AlertTriangle size={13} style={{ color: g.severity === 'error' ? '#B91C1C' : '#92400E', marginTop: 2 }} />
              <p style={{ fontSize: 12.5, color: g.severity === 'error' ? '#991B1B' : '#92400E' }}>{g.message}</p>
            </div>
          ))}
        </div>
      )}

      {!knowledgeBase || knowledgeBase.units.length === 0 ? (
        <p style={{ fontSize: 13, color: '#9AA3AF' }}>
          No content units yet. <strong>Pull & cluster</strong> from your highlights, shape with AI, or add one by hand.
        </p>
      ) : (
        <div className="space-y-4">
          <p style={{ fontSize: 11.5, fontWeight: 700, color: '#6B7280', letterSpacing: '.06em' }}>
            CONCEPT CLUSTERS → SECTIONS
          </p>
          {knowledgeBase.clusters.map((cluster) => {
            const units = unitsOf(knowledgeBase, cluster);
            const others = knowledgeBase.clusters.filter((c) => c.id !== cluster.id);
            return (
              <div key={cluster.id} className="p-4 rounded-2xl border" style={{ background: 'rgba(255,255,255,0.85)', borderColor: 'rgba(0,0,0,0.08)' }}>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <input
                    value={cluster.name}
                    onChange={(e) => renameCluster(cluster.id, e.target.value)}
                    className="rounded-xl px-3 py-1.5 font-semibold flex-1 min-w-[140px]"
                    style={{ fontSize: 13.5, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.9)', outline: 'none', color: '#0B1220' }}
                  />
                  <span style={{ fontSize: 11.5, color: '#9AA3AF' }}>{units.length} unit{units.length !== 1 ? 's' : ''}</span>
                  {others.length > 0 && (
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) mergeClusterInto(cluster.id, e.target.value);
                        e.target.value = '';
                      }}
                      className="rounded-lg px-2 py-1"
                      style={{ fontSize: 11.5, border: '1px solid rgba(0,0,0,0.08)', background: '#fff', color: '#374151' }}
                    >
                      <option value="">Merge into…</option>
                      {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  )}
                  <button
                    type="button"
                    title="Split cluster"
                    disabled={units.length < 2}
                    onClick={() => splitCluster(cluster.id)}
                    className="p-1.5 rounded-lg disabled:opacity-40"
                    style={{ border: '1px solid rgba(0,0,0,0.08)' }}
                  >
                    <Split size={13} style={{ color: '#6B7280' }} />
                  </button>
                </div>

                <div className="space-y-2">
                  {units.map((u, i) => (
                    <div key={u.id} className="p-3 rounded-xl border" style={{ background: 'rgba(249,250,251,0.9)', borderColor: 'rgba(0,0,0,0.06)' }}>
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span style={{ fontSize: 11, color: '#9AA3AF', fontFamily: 'monospace' }}>#{i + 1}</span>
                        <select
                          value={u.kind}
                          onChange={(e) => updateUnit(u.id, { kind: e.target.value as ContentUnitKind })}
                          className="rounded-lg px-2 py-1"
                          style={{ fontSize: 12, border: '1px solid rgba(0,0,0,0.08)', background: '#fff', outline: 'none' }}
                        >
                          {KINDS.map((k) => <option key={k}>{k}</option>)}
                        </select>
                        {u.fromHl && (
                          <span className="px-2 py-0.5 rounded text-xs" style={{ background: '#FEF3C7', color: '#92400E' }}>✎ from highlight</span>
                        )}
                        {others.length > 0 && (
                          <select
                            defaultValue=""
                            onChange={(e) => {
                              if (e.target.value) moveUnit(u.id, e.target.value);
                              e.target.value = '';
                            }}
                            className="rounded-lg px-2 py-1"
                            style={{ fontSize: 11.5, border: '1px solid rgba(0,0,0,0.08)', background: '#fff' }}
                          >
                            <option value="">Move to…</option>
                            {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                          </select>
                        )}
                        <button type="button" onClick={() => removeUnit(u.id)} className="ml-auto">
                          <Trash2 size={13} style={{ color: '#EF4444' }} />
                        </button>
                      </div>
                      <input
                        value={u.from || ''}
                        onChange={(e) => updateUnit(u.id, { from: e.target.value })}
                        placeholder="from which source…"
                        className="w-full rounded-lg px-2 py-1 mb-2"
                        style={{ fontSize: 12, border: '1px solid rgba(0,0,0,0.08)', background: '#fff', outline: 'none' }}
                      />
                      <textarea
                        value={u.text}
                        onChange={(e) => updateUnit(u.id, { text: e.target.value })}
                        rows={2}
                        placeholder="Passage or note…"
                        className="w-full rounded-lg px-2 py-1 resize-none"
                        style={{ fontSize: 12.5, border: '1px solid rgba(0,0,0,0.08)', background: '#fff', outline: 'none' }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <p style={{ fontSize: 12, color: '#6B7280' }} className="flex items-center gap-1.5">
            <GitMerge size={13} />
            These clusters are the material each template section is generated from.
          </p>
        </div>
      )}
    </div>
  );
}

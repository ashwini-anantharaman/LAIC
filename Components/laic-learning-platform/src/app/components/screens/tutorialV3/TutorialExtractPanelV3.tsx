import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Loader2, AlertTriangle, GitMerge, Split } from 'lucide-react';
import { buildTutorialKnowledgeBase, errorMessage } from '../../../../lib/api';
import type {
  ClusteredKnowledgeBase,
  ConceptCluster,
  ContentUnit,
  ContentUnitKind,
  TutorialDefinition,
} from '../../../../lib/types';
import { UNASSIGNED_SECTION_ID } from '../../../../lib/types';

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
  /** e.g. "tutorial", "quiz" — steers Extract copy. */
  typeNoun?: string;
  /** How clusters map into this content (one short sentence). */
  clusterOutcome?: string;
  /** Per-source docs so Pull can seed unmarked sources. */
  markupSources?: { id: string; label: string; offset: number; sentences: { text: string; page: number }[] }[];
  /**
   * Define-first tutorials: fixed clusters = these sections + Unassigned.
   * When set, Pull sorts by sectionId (no emergent names / Shape with AI).
   */
  tutorialDefinition?: TutorialDefinition | null;
}

function unitsOf(kb: ClusteredKnowledgeBase, cluster: ConceptCluster): ContentUnit[] {
  const byId = new Map(kb.units.map((u) => [u.id, u]));
  return cluster.unitIds.map((id) => byId.get(id)).filter(Boolean) as ContentUnit[];
}

function isUnassigned(c: ConceptCluster): boolean {
  return c.id === UNASSIGNED_SECTION_ID || c.sectionId === UNASSIGNED_SECTION_ID;
}

export function TutorialExtractPanelV3({
  markHighlights,
  docTitle,
  knowledgeBase,
  setKnowledgeBase,
  shapeIntent,
  setShapeIntent,
  objective,
  topic,
  syncExtracts,
  typeNoun = 'content',
  clusterOutcome,
  markupSources = [],
  tutorialDefinition = null,
}: Props) {
  const defineFirst = !!(
    tutorialDefinition
    && Array.isArray(tutorialDefinition.sections)
    && tutorialDefinition.sections.some((s) => String(s.title || '').trim())
  );
  const pullable = (markHighlights || []).filter((h: any) =>
    h.tag === 'Use' || h.tag === 'Support' || (h.tag === 'Note' && String(h.comment || '').trim()),
  );
  const hlCount = pullable.length;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [seedNote, setSeedNote] = useState<string | null>(null);
  const [activeClusterId, setActiveClusterId] = useState<string>('');
  const outcome = clusterOutcome
    || (defineFirst
      ? 'Clusters are your Plan sections. Move Unassigned units into a section before generating.'
      : typeNoun === 'tutorial'
        ? 'Each cluster becomes one tutorial section.'
        : `Each cluster groups related material for this ${typeNoun}.`);

  const unassignedCount = knowledgeBase?.clusters.find(isUnassigned)?.unitIds.length || 0;
  const emptySectionCount = defineFirst && knowledgeBase
    ? (tutorialDefinition!.sections || [])
      .filter((s) => String(s.title || '').trim())
      .filter((s) => {
        const cl = knowledgeBase.clusters.find((c) => c.id === s.id || c.sectionId === s.id);
        return !cl || cl.unitIds.length === 0;
      }).length
    : 0;

  useEffect(() => {
    const ids = knowledgeBase?.clusters.map((c) => c.id) || [];
    if (!ids.length) {
      setActiveClusterId('');
      return;
    }
    if (!ids.includes(activeClusterId)) {
      // Prefer Unassigned when it has stranded units so the nudge is actionable.
      const un = knowledgeBase?.clusters.find(isUnassigned);
      if (un && un.unitIds.length > 0) setActiveClusterId(un.id);
      else setActiveClusterId(ids[0]);
    }
  }, [knowledgeBase, activeClusterId]);

  const applyKb = (kb: ClusteredKnowledgeBase) => {
    setKnowledgeBase(kb);
    syncExtracts(kb.units);
  };

  const resolveSourceId = (h: any): string | null => {
    if (h.sourceId) return h.sourceId;
    if (typeof h.idx !== 'number') return null;
    const src = markupSources.find((s) => h.idx >= s.offset && h.idx < s.offset + s.sentences.length);
    return src?.id || null;
  };

  /** Sources with no Use/Support marks still contribute seeded units so generation can cover them. */
  const seedUnmarkedSources = (marked: any[]) => {
    if (!markupSources.length) return { seeds: [] as any[], labels: [] as string[] };
    const covered = new Set<string>();
    for (const h of marked) {
      const id = resolveSourceId(h);
      if (id) covered.add(id);
    }
    const seeds: any[] = [];
    const labels: string[] = [];
    for (const s of markupSources) {
      if (covered.has(s.id) || !s.sentences?.length) continue;
      labels.push(s.label);
      const ranked = [...s.sentences]
        .map((sent, localIdx) => ({ sent, localIdx, score: sent.text.length }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
      for (const { sent, localIdx } of ranked) {
        seeds.push({
          text: sent.text,
          tag: 'Use',
          page: sent.page,
          idx: s.offset + localIdx,
          sourceId: s.id,
          sourceLabel: s.label,
          comment: '',
          // Seeds have no Plan assignment → Unassigned (human Moves them).
          sectionId: undefined,
        });
      }
    }
    return { seeds, labels };
  };

  const runBuild = async (opts?: { refineWithLlm?: boolean; intent?: string }) => {
    setErr(null);
    setSeedNote(null);
    setBusy(true);
    try {
      const intent = opts?.intent ?? shapeIntent;
      const { seeds, labels } = seedUnmarkedSources(pullable);
      if (labels.length) {
        setSeedNote(
          `Also pulled sample passages from unmarked source${labels.length === 1 ? '' : 's'}: ${labels.join(', ')}. Mark Use/Support on those tabs for tighter control.`,
        );
      }
      const combined = [...pullable, ...seeds];
      const { knowledgeBase: kb } = await buildTutorialKnowledgeBase({
        highlights: combined.map((h: any) => ({
          text: h.text,
          comment: h.comment,
          tag: h.tag,
          page: h.page,
          idx: h.idx,
          sourceLabel: h.sourceLabel
            || markupSources.find((s) => s.id === resolveSourceId(h))?.label
            || undefined,
          sectionId: h.sectionId || undefined,
        })),
        shapeIntent: defineFirst ? undefined : (intent || undefined),
        objective: defineFirst ? (tutorialDefinition?.objective || objective) : objective,
        topic: defineFirst ? undefined : topic,
        refineWithLlm: defineFirst ? false : opts?.refineWithLlm !== false,
        tutorialDefinition: defineFirst
          ? {
              objective: tutorialDefinition!.objective,
              sections: tutorialDefinition!.sections.map((s) => ({
                id: s.id,
                title: s.title,
                intent: s.intent,
              })),
            }
          : undefined,
      });
      applyKb(kb);
      const un = kb.clusters.find(isUnassigned);
      if (un && un.unitIds.length > 0) setActiveClusterId(un.id);
      else if (kb.clusters[0]) setActiveClusterId(kb.clusters[0].id);
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
    let clusters = knowledgeBase.clusters.map((c) => ({
      ...c,
      unitIds: c.unitIds.filter((uid) => uid !== id),
    }));
    if (!defineFirst) {
      clusters = clusters.filter((c) => c.unitIds.length > 0);
    }
    applyKb({ ...knowledgeBase, units, clusters, mergedUnitCount: units.length });
  };

  const renameCluster = (id: string, name: string) => {
    if (!knowledgeBase || defineFirst) return;
    applyKb({
      ...knowledgeBase,
      clusters: knowledgeBase.clusters.map((c) => (c.id === id ? { ...c, name } : c)),
    });
  };

  const moveUnit = (unitId: string, toClusterId: string) => {
    if (!knowledgeBase) return;
    let clusters = knowledgeBase.clusters.map((c) => ({
      ...c,
      unitIds: c.unitIds.filter((id) => id !== unitId),
    })).map((c) => (
      c.id === toClusterId && !c.unitIds.includes(unitId)
        ? { ...c, unitIds: [...c.unitIds, unitId] }
        : c
    ));
    if (!defineFirst) {
      clusters = clusters.filter((c) => c.unitIds.length > 0);
    }
    const units = knowledgeBase.units.map((u) => (
      u.id === unitId
        ? {
            ...u,
            clusterId: toClusterId,
            sectionId: toClusterId === UNASSIGNED_SECTION_ID ? UNASSIGNED_SECTION_ID : toClusterId,
          }
        : u
    ));
    applyKb({ ...knowledgeBase, clusters, units });
  };

  const mergeClusterInto = (fromId: string, intoId: string) => {
    if (!knowledgeBase || fromId === intoId || defineFirst) return;
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
    setActiveClusterId(intoId);
  };

  const splitCluster = (clusterId: string) => {
    if (!knowledgeBase || defineFirst) return;
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
    const clusterId = activeClusterId || knowledgeBase?.clusters[0]?.id || `cl-${Date.now()}`;
    const unit: ContentUnit = {
      id,
      kind: 'Key point',
      text: '',
      from: '',
      fromHl: false,
      clusterId,
      sectionId: defineFirst
        ? (clusterId === UNASSIGNED_SECTION_ID ? UNASSIGNED_SECTION_ID : clusterId)
        : undefined,
    };
    if (!knowledgeBase) {
      applyKb({
        units: [unit],
        clusters: [{ id: clusterId, name: defineFirst ? 'Unassigned' : 'Topic 1', unitIds: [id], sectionId: defineFirst ? UNASSIGNED_SECTION_ID : undefined }],
        rawHighlightCount: 0,
        mergedUnitCount: 1,
      });
      setActiveClusterId(clusterId);
      return;
    }
    const hasCluster = knowledgeBase.clusters.some((c) => c.id === clusterId);
    const clusters = hasCluster
      ? knowledgeBase.clusters.map((c) => (
        c.id === clusterId ? { ...c, unitIds: [...c.unitIds, id] } : c
      ))
      : [...knowledgeBase.clusters, { id: clusterId, name: 'Topic 1', unitIds: [id] }];
    applyKb({
      ...knowledgeBase,
      units: [...knowledgeBase.units, unit],
      clusters,
      mergedUnitCount: knowledgeBase.units.length + 1,
    });
    setActiveClusterId(clusterId);
  };

  const mergeNote = knowledgeBase
    ? `${knowledgeBase.rawHighlightCount} hl → ${knowledgeBase.mergedUnitCount} units · ${knowledgeBase.clusters.length} cluster${knowledgeBase.clusters.length === 1 ? '' : 's'}`
    : null;

  const activeCluster = knowledgeBase?.clusters.find((c) => c.id === activeClusterId) || knowledgeBase?.clusters[0] || null;
  const activeUnits = knowledgeBase && activeCluster ? unitsOf(knowledgeBase, activeCluster) : [];
  const otherClusters = knowledgeBase?.clusters.filter((c) => c.id !== activeCluster?.id) || [];
  const moveTargets = defineFirst
    ? otherClusters.filter((c) => !isUnassigned(c) || activeCluster && isUnassigned(activeCluster))
    : otherClusters;

  return (
    <div className="px-4 py-3 w-full pb-8" style={{ background: '#EEF0F3' }}>
      {/* Compact top bar */}
      <div
        className="rounded-2xl border px-3.5 py-3 mb-3"
        style={{ background: '#fff', borderColor: 'rgba(0,0,0,0.06)', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <p style={{ fontSize: 13, fontWeight: 650, color: '#0B1220' }}>
              {hlCount} highlight{hlCount !== 1 ? 's' : ''} from Mark up
              {mergeNote ? <span style={{ color: '#059669', fontWeight: 600 }}> · {mergeNote}</span> : null}
            </p>
            <p style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }} className="truncate">
              {outcome} Nothing is invented from general knowledge.
            </p>
          </div>
          <button
            type="button"
            onClick={addManual}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full border"
            style={{ fontSize: 12, fontWeight: 600, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: '#fff' }}
          >
            <Plus size={13} /> Add
          </button>
          <button
            type="button"
            onClick={() => runBuild({ refineWithLlm: !defineFirst })}
            disabled={hlCount === 0 || busy}
            className="px-3.5 py-1.5 rounded-full transition-all shrink-0"
            style={{
              background: hlCount === 0 || busy ? '#E5E7EB' : '#0B0F1A',
              color: hlCount === 0 || busy ? '#9AA3AF' : '#fff',
              fontSize: 12.5, fontWeight: 650,
            }}
          >
            {busy
              ? <span className="flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" />Building…</span>
              : (defineFirst ? '→ Sort into sections' : '→ Pull & cluster')}
          </button>
        </div>
        {!defineFirst && (
          <div className="flex gap-2 mt-2.5">
            <input
              value={shapeIntent}
              onChange={(e) => setShapeIntent(e.target.value)}
              placeholder="Shape with AI — e.g. one definition + one example per topic"
              className="flex-1 rounded-xl px-3 py-1.5"
              style={{ fontSize: 12.5, border: '1px solid rgba(0,0,0,0.1)', background: '#FAFBFC', outline: 'none' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && hlCount > 0 && !busy) runBuild({ refineWithLlm: true, intent: shapeIntent });
              }}
            />
            <button
              type="button"
              disabled={hlCount === 0 || busy}
              onClick={() => runBuild({ refineWithLlm: true, intent: shapeIntent })}
              className="px-3.5 py-1.5 rounded-xl text-white disabled:opacity-50"
              style={{ background: '#0B0F1A', fontSize: 12.5, fontWeight: 600 }}
            >
              Extract
            </button>
          </div>
        )}
        {defineFirst && (
          <p style={{ fontSize: 12, color: '#6B7280', marginTop: 10 }}>
            Pull sorts highlights into your Plan sections by assignment. Units without a section land in Unassigned — Move them before generating.
          </p>
        )}
      </div>

      {defineFirst && unassignedCount > 0 && (
        <div
          className="flex items-start gap-2 mb-3 rounded-2xl p-3"
          style={{ background: '#FEF3C7', border: '1px solid #FCD34D' }}
        >
          <AlertTriangle size={14} style={{ color: '#B45309', marginTop: 2 }} />
          <div className="min-w-0 flex-1">
            <p style={{ fontSize: 12.5, fontWeight: 650, color: '#92400E' }}>
              {unassignedCount} unit{unassignedCount === 1 ? '' : 's'} need a section
            </p>
            <p style={{ fontSize: 12, color: '#A16207', marginTop: 2 }}>
              Open <strong>Unassigned</strong> and Move each unit into a Plan section — they will not be AI-homed.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveClusterId(UNASSIGNED_SECTION_ID)}
            className="shrink-0 px-2.5 py-1 rounded-full"
            style={{ fontSize: 11.5, fontWeight: 650, background: '#F59E0B', color: '#fff' }}
          >
            Unassigned · {unassignedCount}
          </button>
        </div>
      )}

      {defineFirst && emptySectionCount > 0 && knowledgeBase && (
        <div
          className="flex items-start gap-2 mb-3 rounded-2xl p-3"
          style={{ background: '#EEF2FF', border: '1px solid #C7D2FE' }}
        >
          <AlertTriangle size={14} style={{ color: '#4338CA', marginTop: 2 }} />
          <p style={{ fontSize: 12.5, color: '#3730A3' }}>
            {emptySectionCount} section{emptySectionCount === 1 ? '' : 's'} have no source units yet — generation will note missing markup instead of inventing content.
          </p>
        </div>
      )}

      {err && (
        <div className="flex items-start gap-2 mb-3 rounded-2xl p-3" style={{ background: '#FEE2E2', border: '1px solid #FCA5A5' }}>
          <AlertTriangle size={14} style={{ color: '#B91C1C', marginTop: 2 }} />
          <p style={{ fontSize: 12.5, color: '#991B1B' }}>{err}</p>
        </div>
      )}

      {seedNote && (
        <div className="flex items-start gap-2 mb-3 rounded-2xl p-3" style={{ background: '#EEF2FF', border: '1px solid #C7D2FE' }}>
          <AlertTriangle size={14} style={{ color: '#4338CA', marginTop: 2 }} />
          <p style={{ fontSize: 12.5, color: '#3730A3' }}>{seedNote}</p>
        </div>
      )}

      {knowledgeBase?.gaps && knowledgeBase.gaps.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {knowledgeBase.gaps.map((g) => (
            <div
              key={g.id}
              className="flex items-start gap-1.5 rounded-xl px-2.5 py-1.5"
              style={{
                background: g.severity === 'error' ? '#FEE2E2' : '#FEF3C7',
                border: `1px solid ${g.severity === 'error' ? '#FCA5A5' : '#FCD34D'}`,
                maxWidth: '100%',
              }}
            >
              <AlertTriangle size={12} style={{ color: g.severity === 'error' ? '#B91C1C' : '#92400E', marginTop: 2 }} />
              <p style={{ fontSize: 12, color: g.severity === 'error' ? '#991B1B' : '#92400E' }}>{g.message}</p>
            </div>
          ))}
        </div>
      )}

      {!knowledgeBase || knowledgeBase.units.length === 0 ? (
        <div
          className="rounded-2xl border px-5 py-10 text-center"
          style={{ background: '#fff', borderColor: 'rgba(0,0,0,0.06)' }}
        >
          <p style={{ fontSize: 13, color: '#9AA3AF' }}>
            No content units yet.{' '}
            <strong style={{ color: '#6B7280' }}>
              {defineFirst ? 'Sort into sections' : 'Pull & cluster'}
            </strong>
            {' '}from your highlights{defineFirst ? '' : ', shape with AI,'} or add one by hand.
          </p>
        </div>
      ) : (
        <div
          className="extract-two-pane grid gap-2.5 items-start"
          style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}
        >
          <style>{`
            @media (min-width: 768px) {
              .extract-two-pane {
                grid-template-columns: 240px minmax(0, 1fr) !important;
              }
            }
          `}</style>

          {/* LEFT — cluster list */}
          <div
            className="rounded-2xl border bg-white overflow-hidden md:sticky md:top-2"
            style={{ borderColor: 'rgba(0,0,0,0.06)', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}
          >
            <div className="px-3 py-2.5" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', letterSpacing: '.06em' }}>
                {defineFirst ? 'SECTIONS' : 'CLUSTERS'} ({knowledgeBase.clusters.length})
              </p>
            </div>
            <div className="max-h-[420px] overflow-y-auto py-1">
              {knowledgeBase.clusters.map((cluster) => {
                const on = cluster.id === activeCluster?.id;
                const count = cluster.unitIds.length;
                const un = isUnassigned(cluster);
                return (
                  <button
                    key={cluster.id}
                    type="button"
                    onClick={() => setActiveClusterId(cluster.id)}
                    className="w-full text-left px-3 py-2.5 transition-colors"
                    style={{
                      background: on
                        ? (un ? 'rgba(245,158,11,0.12)' : 'rgba(11,15,26,0.05)')
                        : 'transparent',
                      borderLeft: on
                        ? `2px solid ${un ? '#F59E0B' : '#0B0F1A'}`
                        : '2px solid transparent',
                    }}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p
                        className="truncate flex-1"
                        style={{
                          fontSize: 13,
                          fontWeight: on ? 650 : 500,
                          color: un ? '#B45309' : (on ? '#0B1220' : '#374151'),
                        }}
                      >
                        {cluster.name || 'Untitled'}
                      </p>
                      {un && count > 0 && (
                        <span
                          className="shrink-0 px-1.5 py-0.5 rounded-full"
                          style={{ fontSize: 10, fontWeight: 700, background: '#F59E0B', color: '#fff' }}
                        >
                          {count}
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: 11, color: un && count > 0 ? '#B45309' : '#9AA3AF', marginTop: 2 }}>
                      {un && count > 0
                        ? `${count} need a section`
                        : `${count} unit${count !== 1 ? 's' : ''}${defineFirst && count === 0 && !un ? ' — empty' : ''}`}
                    </p>
                  </button>
                );
              })}
            </div>
            <p className="px-3 py-2 flex items-center gap-1.5" style={{ fontSize: 11, color: '#9AA3AF', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
              <GitMerge size={11} />
              {defineFirst ? 'Fixed to your Plan outline' : 'Template sections draw from these'}
            </p>
          </div>

          {/* RIGHT — active cluster units */}
          <div
            className="rounded-2xl border bg-white overflow-hidden"
            style={{ borderColor: 'rgba(0,0,0,0.06)', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}
          >
            {activeCluster && (
              <>
                <div
                  className="flex items-center gap-2 px-3 py-2.5 flex-wrap"
                  style={{
                    borderBottom: '1px solid rgba(0,0,0,0.06)',
                    background: isUnassigned(activeCluster) ? 'rgba(254,243,199,0.55)' : '#FAFBFC',
                  }}
                >
                  {defineFirst ? (
                    <p className="flex-1 min-w-[120px]" style={{ fontSize: 13.5, fontWeight: 650, color: isUnassigned(activeCluster) ? '#92400E' : '#0B1220' }}>
                      {activeCluster.name}
                      {isUnassigned(activeCluster) ? ' (holding)' : ''}
                    </p>
                  ) : (
                    <input
                      value={activeCluster.name}
                      onChange={(e) => renameCluster(activeCluster.id, e.target.value)}
                      className="rounded-lg px-2.5 py-1 font-semibold flex-1 min-w-[120px]"
                      style={{ fontSize: 13.5, border: '1px solid rgba(0,0,0,0.1)', background: '#fff', outline: 'none', color: '#0B1220' }}
                    />
                  )}
                  <span style={{ fontSize: 11.5, color: '#9AA3AF' }}>
                    {activeUnits.length} unit{activeUnits.length !== 1 ? 's' : ''}
                  </span>
                  {!defineFirst && otherClusters.length > 0 && (
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) mergeClusterInto(activeCluster.id, e.target.value);
                        e.target.value = '';
                      }}
                      className="rounded-lg px-2 py-1"
                      style={{ fontSize: 11.5, border: '1px solid rgba(0,0,0,0.1)', background: '#fff', color: '#374151' }}
                    >
                      <option value="">Merge into…</option>
                      {otherClusters.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  )}
                  {!defineFirst && (
                    <button
                      type="button"
                      title="Split cluster"
                      disabled={activeUnits.length < 2}
                      onClick={() => splitCluster(activeCluster.id)}
                      className="p-1.5 rounded-lg disabled:opacity-40"
                      style={{ border: '1px solid rgba(0,0,0,0.1)' }}
                    >
                      <Split size={13} style={{ color: '#6B7280' }} />
                    </button>
                  )}
                </div>

                <div className="divide-y" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
                  {activeUnits.length === 0 && (
                    <p className="px-4 py-8 text-center" style={{ fontSize: 13, color: '#9AA3AF' }}>
                      {isUnassigned(activeCluster)
                        ? 'No unassigned units — every highlight has a section.'
                        : defineFirst
                          ? 'No units in this section yet. Mark passages for it in Mark up, or Move units here.'
                          : 'No units in this cluster.'}
                    </p>
                  )}
                  {activeUnits.map((u, i) => (
                    <div key={u.id} className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                        <span style={{ fontSize: 11, color: '#9AA3AF', fontFamily: 'ui-monospace, Menlo, monospace' }}>#{i + 1}</span>
                        <select
                          value={u.kind}
                          onChange={(e) => updateUnit(u.id, { kind: e.target.value as ContentUnitKind })}
                          className="rounded-md px-1.5 py-0.5"
                          style={{ fontSize: 11.5, border: '1px solid rgba(0,0,0,0.1)', background: '#fff', outline: 'none' }}
                        >
                          {KINDS.map((k) => <option key={k}>{k}</option>)}
                        </select>
                        {u.fromHl && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: '#FEF3C7', color: '#92400E' }}>
                            from highlight
                          </span>
                        )}
                        <input
                          value={u.from || ''}
                          onChange={(e) => updateUnit(u.id, { from: e.target.value })}
                          placeholder="source…"
                          className="rounded-md px-1.5 py-0.5 flex-1 min-w-[100px]"
                          style={{ fontSize: 11.5, border: '1px solid rgba(0,0,0,0.08)', background: '#FAFBFC', outline: 'none' }}
                        />
                        {moveTargets.length > 0 && (
                          <select
                            defaultValue=""
                            onChange={(e) => {
                              if (e.target.value) moveUnit(u.id, e.target.value);
                              e.target.value = '';
                            }}
                            className="rounded-md px-1.5 py-0.5"
                            style={{ fontSize: 11, border: '1px solid rgba(0,0,0,0.1)', background: '#fff' }}
                          >
                            <option value="">Move…</option>
                            {moveTargets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                          </select>
                        )}
                        <button type="button" onClick={() => removeUnit(u.id)} className="p-1 ml-auto">
                          <Trash2 size={12} style={{ color: '#EF4444' }} />
                        </button>
                      </div>
                      <textarea
                        value={u.text}
                        onChange={(e) => updateUnit(u.id, { text: e.target.value })}
                        rows={2}
                        placeholder="Passage…"
                        className="w-full rounded-lg px-2 py-1.5 resize-y"
                        style={{ fontSize: 12.5, border: '1px solid rgba(0,0,0,0.08)', background: '#fff', outline: 'none', lineHeight: 1.45 }}
                      />
                      <textarea
                        value={u.authorNote || ''}
                        onChange={(e) => updateUnit(u.id, { authorNote: e.target.value })}
                        rows={2}
                        placeholder="Author directive for generation (followed word-for-word)…"
                        className="w-full rounded-lg px-2 py-1.5 resize-y mt-1.5"
                        style={{
                          fontSize: 12,
                          border: u.authorNote ? '1px solid rgba(124,58,237,0.35)' : '1px solid rgba(0,0,0,0.08)',
                          background: u.authorNote ? 'rgba(243,232,255,0.45)' : '#FAFBFC',
                          outline: 'none',
                          lineHeight: 1.4,
                          color: '#4C1D95',
                        }}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

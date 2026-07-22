import React, { useState } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, X } from 'lucide-react';
import type {
  AssessmentPlacement,
  SectionBlockRecipeItem,
  SectionConnectionRule,
  SectionRecipeBlockType,
  TutorialTemplate,
} from '../../../lib/types';
import {
  ASSESSMENT_OPTIONS,
  CONNECTION_OPTIONS,
  RECIPE_BLOCK_OPTIONS,
  blankCustomTemplateDraft,
  saveCustomTutorialTemplate,
} from '../../../lib/tutorialTemplates';

interface Props {
  initial?: TutorialTemplate | null;
  onSave: (template: TutorialTemplate) => void;
  onCancel: () => void;
}

const field: React.CSSProperties = {
  fontSize: 13,
  border: '1px solid rgba(0,0,0,0.1)',
  background: 'rgba(255,255,255,0.9)',
  outline: 'none',
};

export function TutorialTemplateEditor({ initial, onSave, onCancel }: Props) {
  const seed = initial
    ? {
        name: initial.name,
        description: initial.description,
        sectionConnection: initial.sectionConnection,
        assessmentPlacement: initial.assessmentPlacement,
        sectionBlockRecipe: [...initial.sectionBlockRecipe],
        mediaSlots: [...(initial.mediaSlots || [])],
        knobDefaults: { ...initial.knobDefaults },
      }
    : blankCustomTemplateDraft();

  const [name, setName] = useState(seed.name);
  const [description, setDescription] = useState(seed.description);
  const [sectionConnection, setSectionConnection] = useState<SectionConnectionRule>(seed.sectionConnection);
  const [assessmentPlacement, setAssessmentPlacement] = useState<AssessmentPlacement>(seed.assessmentPlacement);
  const [recipe, setRecipe] = useState<SectionBlockRecipeItem[]>(seed.sectionBlockRecipe);
  const [secs, setSecs] = useState(seed.knobDefaults.secs ?? 3);
  const [end, setEnd] = useState(seed.knobDefaults.end || 'Recap only');
  const [chks, setChks] = useState(seed.knobDefaults.chks ?? 1);
  const [error, setError] = useState<string | null>(null);

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= recipe.length) return;
    setRecipe((prev) => {
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const removeAt = (i: number) => {
    setRecipe((prev) => prev.filter((_, idx) => idx !== i));
  };

  const addBlock = (type: SectionRecipeBlockType) => {
    setRecipe((prev) => [...prev, { type, required: type !== 'media' && type !== 'source-excerpt' }]);
  };

  const handleSave = () => {
    if (!name.trim()) {
      setError('Give the template a name.');
      return;
    }
    if (!recipe.length) {
      setError('Add at least one block to the section recipe.');
      return;
    }
    if (!recipe.some((r) => r.type !== 'media')) {
      setError('Include at least one content block (not only media).');
      return;
    }
    const mediaSlots = recipe
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.type === 'media')
      .map(({ i }, n) => ({
        id: `media-${n + 1}`,
        kind: 'either' as const,
        afterRecipeIndex: i,
        hint: 'Optional media for this section',
      }));

    const saved = saveCustomTutorialTemplate({
      id: initial?.id,
      name: name.trim(),
      description: description.trim(),
      sectionConnection,
      assessmentPlacement,
      sectionBlockRecipe: recipe,
      mediaSlots,
      knobDefaults: {
        secs,
        prog: sectionConnection === 'prerequisite_chain' ? 'Prerequisite chain'
          : sectionConnection === 'standalone' ? 'Themed clusters' : 'Linear build-up',
        dpth: 'Standard',
        end,
        chks,
        excpts: 0,
        wex: recipe.some((r) => r.type === 'worked-example'),
      },
    });
    onSave(saved);
  };

  const pill = (on: boolean): React.CSSProperties => ({
    fontSize: 12,
    fontWeight: on ? 650 : 500,
    background: on ? '#0B0F1A' : 'rgba(255,255,255,0.9)',
    color: on ? '#fff' : '#374151',
    borderColor: on ? '#0B0F1A' : 'rgba(0,0,0,0.1)',
  });

  return (
    <div className="rounded-2xl border p-4 mb-3" style={{ background: 'rgba(255,255,255,0.95)', borderColor: 'rgba(0,0,0,0.1)' }}>
      <div className="flex items-center justify-between mb-3">
        <p style={{ fontSize: 13.5, fontWeight: 700, color: '#0B1220' }}>
          {initial ? 'Edit template' : 'Create template'}
        </p>
        <button type="button" onClick={onCancel} className="p-1 rounded-lg" aria-label="Close">
          <X size={15} style={{ color: '#6B7280' }} />
        </button>
      </div>

      <label style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>Name</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Drill then explain"
        className="w-full rounded-xl px-3 py-2 mb-3"
        style={field}
      />

      <label style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>Description</label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        placeholder="One line on how each section should teach"
        className="w-full rounded-xl px-3 py-2 mb-3 resize-none"
        style={field}
      />

      <p style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', marginBottom: 6 }}>Section connection</p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {CONNECTION_OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setSectionConnection(o.id)}
            className="px-3 py-1.5 rounded-full border"
            style={pill(sectionConnection === o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>

      <p style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', marginBottom: 6 }}>Assessment</p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {ASSESSMENT_OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setAssessmentPlacement(o.id)}
            className="px-3 py-1.5 rounded-full border"
            style={pill(assessmentPlacement === o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 mb-3">
        <div>
          <label style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>
            Default sections
          </label>
          <input
            type="number"
            min={2}
            max={8}
            value={secs}
            onChange={(e) => setSecs(Math.max(2, Math.min(8, Number(e.target.value) || 3)))}
            className="w-20 rounded-xl px-3 py-2"
            style={field}
          />
        </div>
        <div>
          <label style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>
            Checks / section
          </label>
          <input
            type="number"
            min={0}
            max={3}
            value={chks}
            onChange={(e) => setChks(Math.max(0, Math.min(3, Number(e.target.value) || 0)))}
            className="w-20 rounded-xl px-3 py-2"
            style={field}
          />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', display: 'block', marginBottom: 4 }}>
            End with
          </label>
          <select
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="w-full rounded-xl px-3 py-2"
            style={field}
          >
            {['Recap only', 'End quiz', 'End assignment', 'None'].map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
      </div>

      <p style={{ fontSize: 11.5, fontWeight: 600, color: '#9AA3AF', marginBottom: 6 }}>
        Per-section recipe (order = teaching order)
      </p>
      <div className="space-y-1.5 mb-3">
        {recipe.map((item, i) => {
          const label = RECIPE_BLOCK_OPTIONS.find((o) => o.type === item.type)?.label || item.type;
          return (
            <div
              key={`${item.type}-${i}`}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border"
              style={{ background: 'rgba(249,250,251,0.95)', borderColor: 'rgba(0,0,0,0.08)' }}
            >
              <span style={{ fontSize: 11, color: '#9AA3AF', fontFamily: 'monospace', width: 18 }}>{i + 1}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#0B1220', flex: 1 }}>{label}</span>
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="p-1 disabled:opacity-30">
                <ChevronUp size={14} style={{ color: '#6B7280' }} />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === recipe.length - 1} className="p-1 disabled:opacity-30">
                <ChevronDown size={14} style={{ color: '#6B7280' }} />
              </button>
              <button type="button" onClick={() => removeAt(i)} className="p-1">
                <Trash2 size={13} style={{ color: '#EF4444' }} />
              </button>
            </div>
          );
        })}
        {recipe.length === 0 && (
          <p style={{ fontSize: 12.5, color: '#9AA3AF' }}>No blocks yet — add from the list below.</p>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {RECIPE_BLOCK_OPTIONS.map((o) => (
          <button
            key={o.type}
            type="button"
            onClick={() => addBlock(o.type)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full border"
            style={{ fontSize: 11.5, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.9)' }}
          >
            <Plus size={11} />{o.label}
          </button>
        ))}
      </div>

      {error && (
        <p style={{ fontSize: 12.5, color: '#B91C1C', marginBottom: 10 }}>{error}</p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          className="px-4 py-2 rounded-full text-white"
          style={{ background: '#059669', fontSize: 13, fontWeight: 600 }}
        >
          Save template
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-full border"
          style={{ fontSize: 13, color: '#6B7280', borderColor: 'rgba(0,0,0,0.1)' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

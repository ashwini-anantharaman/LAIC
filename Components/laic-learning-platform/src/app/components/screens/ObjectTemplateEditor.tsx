import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { ObjectTemplate, TemplateObjectType } from '../../../lib/objectTemplates';
import {
  TEMPLATE_EDITOR_FIELDS,
  TEMPLATE_TYPE_LABELS,
  blankObjectTemplateDraft,
  saveCustomObjectTemplate,
} from '../../../lib/objectTemplates';

interface Props {
  objectType: Exclude<TemplateObjectType, 'tutorial'>;
  initial?: ObjectTemplate | null;
  onSave: (template: ObjectTemplate) => void;
  onCancel: () => void;
}

const fieldStyle: React.CSSProperties = {
  fontSize: 13,
  border: '1px solid rgba(0,0,0,0.1)',
  background: 'rgba(255,255,255,0.9)',
  outline: 'none',
};

export function ObjectTemplateEditor({ objectType, initial, onSave, onCancel }: Props) {
  const seed = initial
    ? {
        name: initial.name,
        description: initial.description,
        knobDefaults: { ...initial.knobDefaults },
      }
    : blankObjectTemplateDraft(objectType);

  const [name, setName] = useState(seed.name);
  const [description, setDescription] = useState(seed.description);
  const [knobs, setKnobs] = useState<Record<string, any>>(seed.knobDefaults);
  const [error, setError] = useState<string | null>(null);

  const fields = TEMPLATE_EDITOR_FIELDS[objectType] || [];

  const setKnob = (id: string, v: any) => setKnobs((p) => ({ ...p, [id]: v }));

  const handleSave = () => {
    if (!name.trim()) {
      setError('Give the template a name.');
      return;
    }
    const saved = saveCustomObjectTemplate({
      id: initial?.id,
      objectType,
      name,
      description,
      knobDefaults: knobs,
    });
    onSave(saved);
  };

  return (
    <div className="rounded-2xl border p-4 mb-4" style={{ background: 'rgba(255,255,255,0.95)', borderColor: 'rgba(0,0,0,0.1)' }}>
      <div className="flex items-center justify-between mb-3">
        <p style={{ fontSize: 13.5, fontWeight: 700, color: '#0B1220' }}>
          {initial ? 'Edit template' : `New ${TEMPLATE_TYPE_LABELS[objectType]} template`}
        </p>
        <button type="button" onClick={onCancel} className="p-1 rounded-lg" style={{ color: '#9AA3AF' }}>
          <X size={16} />
        </button>
      </div>

      <label className="block mb-3">
        <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Mid-unit formative quiz"
          className="w-full mt-1 rounded-xl px-3 py-2"
          style={fieldStyle}
        />
      </label>

      <label className="block mb-3">
        <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="When should course developers use this template?"
          className="w-full mt-1 rounded-xl px-3 py-2 resize-y"
          style={fieldStyle}
        />
      </label>

      {fields.length > 0 && (
        <div className="mb-3">
          <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Define defaults</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {fields.map((f) => (
              <label key={f.id} className="block">
                <span style={{ fontSize: 11.5, color: '#6B7280' }}>{f.label}</span>
                {f.type === 'bool' ? (
                  <div className="mt-1">
                    <input
                      type="checkbox"
                      checked={!!knobs[f.id]}
                      onChange={(e) => setKnob(f.id, e.target.checked)}
                    />
                  </div>
                ) : f.type === 'num' ? (
                  <input
                    type="number"
                    value={Number(knobs[f.id] ?? 0)}
                    onChange={(e) => setKnob(f.id, Number(e.target.value))}
                    className="w-full mt-1 rounded-xl px-3 py-2"
                    style={fieldStyle}
                  />
                ) : f.type === 'sel' ? (
                  <select
                    value={String(knobs[f.id] ?? f.options?.[0] ?? '')}
                    onChange={(e) => setKnob(f.id, e.target.value)}
                    className="w-full mt-1 rounded-xl px-3 py-2"
                    style={fieldStyle}
                  >
                    {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    value={String(knobs[f.id] ?? '')}
                    onChange={(e) => setKnob(f.id, e.target.value)}
                    className="w-full mt-1 rounded-xl px-3 py-2"
                    style={fieldStyle}
                  />
                )}
              </label>
            ))}
          </div>
        </div>
      )}

      {error && <p style={{ fontSize: 12.5, color: '#B91C1C', marginBottom: 8 }}>{error}</p>}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-full border"
          style={{ fontSize: 12.5, color: '#374151', borderColor: 'rgba(0,0,0,0.1)' }}>
          Cancel
        </button>
        <button type="button" onClick={handleSave} className="px-4 py-2 rounded-full text-white"
          style={{ fontSize: 12.5, fontWeight: 600, background: '#0B0F1A' }}>
          Save template
        </button>
      </div>
    </div>
  );
}

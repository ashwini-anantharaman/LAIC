import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import type { ObjectTemplate, TemplateObjectType } from '../../../lib/objectTemplates';
import {
  TEMPLATE_TYPE_LABELS,
  listObjectTemplates,
} from '../../../lib/objectTemplates';
import { ObjectTemplateEditor } from './ObjectTemplateEditor';

interface Props {
  objectType: Exclude<TemplateObjectType, 'tutorial'>;
  value?: string;
  onChange: (template: ObjectTemplate) => void;
}

export function ObjectTemplatePicker({ objectType, value, onChange }: Props) {
  const [templates, setTemplates] = useState(() => listObjectTemplates(objectType));
  const [editing, setEditing] = useState<ObjectTemplate | null | 'new'>(null);
  const selected = value || templates.find((t) => t.recommended)?.id || templates[0]?.id;

  const refresh = () => setTemplates(listObjectTemplates(objectType));

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p style={{ fontSize: 12.5, fontWeight: 500, color: '#374151' }}>
          {TEMPLATE_TYPE_LABELS[objectType]} template
        </p>
        {editing === null && (
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full border"
            style={{
              fontSize: 12, fontWeight: 600, color: '#0B1220',
              borderColor: 'rgba(0,0,0,0.12)', background: 'rgba(255,255,255,0.9)',
            }}
          >
            <Plus size={12} />Create template
          </button>
        )}
      </div>
      <p style={{ fontSize: 12, color: '#9AA3AF', marginBottom: 10 }}>
        Recommended Define defaults for this object. Manage all templates in Template Library.
      </p>

      {editing !== null && (
        <ObjectTemplateEditor
          key={editing === 'new' ? 'new' : editing.id}
          objectType={objectType}
          initial={editing === 'new' ? null : editing}
          onSave={(t) => { refresh(); onChange(t); setEditing(null); }}
          onCancel={() => setEditing(null)}
        />
      )}

      <div className="space-y-2">
        {templates.map((t) => {
          const on = t.id === selected;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t)}
              className="w-full text-left px-4 py-3 rounded-2xl border transition-all"
              style={{
                background: on ? '#0B0F1A' : 'rgba(255,255,255,0.9)',
                color: on ? '#fff' : '#374151',
                borderColor: on ? '#0B0F1A' : 'rgba(0,0,0,0.1)',
              }}
            >
              <div className="flex items-center gap-2">
                <p style={{ fontSize: 13, fontWeight: on ? 650 : 600, flex: 1 }}>{t.name}</p>
                {t.recommended && (
                  <span className="px-2 py-0.5 rounded text-xs font-semibold"
                    style={{
                      background: on ? 'rgba(255,255,255,0.15)' : 'rgba(5,150,105,0.12)',
                      color: on ? '#fff' : '#059669',
                    }}>
                    Recommended
                  </span>
                )}
              </div>
              {t.description && (
                <p style={{ fontSize: 12, marginTop: 3, opacity: on ? 0.85 : 1, color: on ? undefined : '#6B7280' }}>
                  {t.description}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

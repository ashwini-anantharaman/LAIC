import React, { useState } from 'react';
import { Plus, Pencil, Trash2, RotateCcw } from 'lucide-react';
import type { TutorialTemplate } from '../../../lib/types';
import {
  deleteCustomTutorialTemplate,
  isBuiltinOverride,
  isBuiltinTemplateId,
  listTutorialTemplates,
} from '../../../lib/tutorialTemplates';
import { TutorialTemplateEditor } from './TutorialTemplateEditor';

interface Props {
  value?: string;
  onChange: (template: TutorialTemplate) => void;
}

export function TutorialTemplatePicker({ value, onChange }: Props) {
  const [templates, setTemplates] = useState(() => listTutorialTemplates());
  const [editing, setEditing] = useState<TutorialTemplate | null | 'new'>(null);
  const selected = value || templates[0]?.id;

  const refresh = () => setTemplates(listTutorialTemplates());

  const handleSaved = (t: TutorialTemplate) => {
    refresh();
    onChange(t);
    setEditing(null);
  };

  const handleDeleteOrReset = (id: string) => {
    deleteCustomTutorialTemplate(id);
    refresh();
    const next = listTutorialTemplates().find((t) => t.id === id)
      || listTutorialTemplates()[0];
    if (next) onChange(next);
  };

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p style={{ fontSize: 12.5, fontWeight: 500, color: '#374151' }}>
          Pedagogical template
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
        Shape of each section. Edit any built-in or create your own. Edits stay in this browser.
      </p>

      {editing !== null && (
        <TutorialTemplateEditor
          key={editing === 'new' ? 'new' : editing.id}
          initial={editing === 'new' ? null : editing}
          onSave={handleSaved}
          onCancel={() => setEditing(null)}
        />
      )}

      <div className="space-y-2">
        {templates.map((t) => {
          const on = t.id === selected;
          const overridden = isBuiltinOverride(t.id);
          const pureCustom = !t.builtin && !isBuiltinTemplateId(t.id);
          return (
            <div
              key={t.id}
              className="rounded-2xl border transition-all"
              style={{
                background: on ? '#0B0F1A' : 'rgba(255,255,255,0.9)',
                color: on ? '#fff' : '#374151',
                borderColor: on ? '#0B0F1A' : 'rgba(0,0,0,0.1)',
              }}
            >
              <button
                type="button"
                onClick={() => onChange(t)}
                className="w-full text-left px-4 py-3"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <p style={{ fontSize: 13, fontWeight: on ? 650 : 600, flex: 1 }}>{t.name}</p>
                  {pureCustom && (
                    <span
                      className="px-2 py-0.5 rounded text-xs font-semibold"
                      style={{
                        background: on ? 'rgba(255,255,255,0.15)' : 'rgba(5,150,105,0.12)',
                        color: on ? '#fff' : '#059669',
                      }}
                    >
                      Custom
                    </span>
                  )}
                  {overridden && (
                    <span
                      className="px-2 py-0.5 rounded text-xs font-semibold"
                      style={{
                        background: on ? 'rgba(255,255,255,0.15)' : 'rgba(217,119,6,0.12)',
                        color: on ? '#fff' : '#B45309',
                      }}
                    >
                      Edited
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 12, marginTop: 3, opacity: on ? 0.85 : 1, color: on ? undefined : '#6B7280' }}>
                  {t.description || (pureCustom ? 'Your custom section recipe' : '')}
                </p>
              </button>
              <div
                className="flex items-center gap-1 px-3 pb-2.5"
                style={{ borderTop: on ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.06)' }}
              >
                <button
                  type="button"
                  onClick={() => setEditing(t)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg"
                  style={{ fontSize: 11.5, color: on ? 'rgba(255,255,255,0.85)' : '#6B7280' }}
                >
                  <Pencil size={11} />Edit
                </button>
                {overridden && (
                  <button
                    type="button"
                    onClick={() => handleDeleteOrReset(t.id)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg"
                    style={{ fontSize: 11.5, color: on ? 'rgba(255,255,255,0.85)' : '#6B7280' }}
                  >
                    <RotateCcw size={11} />Reset
                  </button>
                )}
                {pureCustom && (
                  <button
                    type="button"
                    onClick={() => handleDeleteOrReset(t.id)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg"
                    style={{ fontSize: 11.5, color: on ? '#FCA5A5' : '#EF4444' }}
                  >
                    <Trash2 size={11} />Delete
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

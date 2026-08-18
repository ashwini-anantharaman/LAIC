import React, { useState } from 'react';
import { Plus, Pencil, Trash2, RotateCcw } from 'lucide-react';
import type { TutorialTemplate } from '../../../../lib/types';
import {
  deleteCustomTutorialTemplate,
  FREEFORM_TUTORIAL_TEMPLATE_ID,
  isBuiltinOverride,
  isBuiltinTemplateId,
  isTutorialStructureLocked,
  listTutorialTemplates,
} from '../../../../lib/tutorialV3/tutorialTemplates';
import { TutorialTemplateEditorV3 } from './TutorialTemplateEditorV3';
import { useConfirm } from '../../ConfirmDialog';

interface Props {
  value?: string;
  onChange: (template: TutorialTemplate) => void;
}

export function TutorialTemplatePickerV3({ value, onChange }: Props) {
  const [templates, setTemplates] = useState(() => listTutorialTemplates());
  const [editing, setEditing] = useState<TutorialTemplate | null | 'new'>(null);
  const confirm = useConfirm();
  const selected = value || templates[0]?.id;

  const refresh = () => setTemplates(listTutorialTemplates());

  const handleSaved = (t: TutorialTemplate) => {
    refresh();
    onChange(t);
    setEditing(null);
  };

  const handleDeleteOrReset = async (id: string) => {
    const t = templates.find((x) => x.id === id);
    const overridden = isBuiltinOverride(id);
    const ok = await confirm({
      title: overridden ? 'Are you sure you want to reset?' : 'Are you sure you want to delete?',
      description: overridden
        ? `Reset “${t?.name || 'this template'}” to the recommended default?`
        : `Delete template “${t?.name || 'this template'}”? This can’t be undone.`,
      confirmLabel: overridden ? 'Reset' : 'Delete',
      destructive: !overridden,
    });
    if (!ok) return;
    deleteCustomTutorialTemplate(id);
    refresh();
    const next = listTutorialTemplates().find((x) => x.id === id)
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
        Shape of each section plus locked structure (sections, depth, checks). Length follows curated units + depth — no word target. Use Freeform when authors should choose structure themselves.
      </p>

      {editing !== null && (
        <TutorialTemplateEditorV3
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
          const locked = isTutorialStructureLocked(t);
          const secs = t.knobDefaults.secs ?? 0;
          const dpth = t.knobDefaults.dpth || 'Standard';
          const structureBit = locked
            ? `${secs} sections · ${dpth} depth · some knobs locked`
            : 'Author chooses structure (locks opt-in)';
          return (
            <div
              key={t.id}
              className="rounded-2xl border transition-all"
              style={{
                background: on ? '#1e2b3d' : 'rgba(255,255,255,0.9)',
                color: on ? '#fff' : '#374151',
                borderColor: on ? '#1e2b3d' : 'rgba(0,0,0,0.1)',
              }}
            >
              <button
                type="button"
                onClick={() => onChange(t)}
                className="w-full text-left px-4 py-3"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <p style={{ fontSize: 13, fontWeight: on ? 650 : 600, flex: 1 }}>{t.name}</p>
                  {t.id === FREEFORM_TUTORIAL_TEMPLATE_ID && (
                    <span
                      className="px-2 py-0.5 rounded text-xs font-semibold"
                      style={{
                        background: on ? 'rgba(255,255,255,0.15)' : 'rgba(37,99,235,0.12)',
                        color: on ? '#fff' : '#2563EB',
                      }}
                    >
                      Freeform
                    </span>
                  )}
                  {locked && t.id !== FREEFORM_TUTORIAL_TEMPLATE_ID && (
                    <span
                      className="px-2 py-0.5 rounded text-xs font-semibold"
                      style={{
                        background: on ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.06)',
                        color: on ? '#fff' : '#6B7280',
                      }}
                    >
                      Locked
                    </span>
                  )}
                  {pureCustom && (
                    <span
                      className="px-2 py-0.5 rounded text-xs font-semibold"
                      style={{
                        background: on ? 'rgba(255,255,255,0.15)' : 'rgba(77,124,90,0.12)',
                        color: on ? '#fff' : '#4d7c5a',
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
                <p style={{ fontSize: 11.5, marginTop: 4, opacity: on ? 0.75 : 1, color: on ? undefined : '#9AA3AF' }}>
                  {structureBit}
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

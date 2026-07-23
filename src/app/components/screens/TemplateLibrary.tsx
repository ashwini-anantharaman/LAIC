import React, { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, RotateCcw, Sparkles, LayoutTemplate } from 'lucide-react';
import { motion } from 'motion/react';
import { useApp } from '../../App';
import type { TutorialTemplate } from '../../../lib/types';
import type { ObjectTemplate, TemplateObjectType } from '../../../lib/objectTemplates';
import {
  TEMPLATE_OBJECT_TYPES,
  TEMPLATE_TYPE_LABELS,
  deleteCustomObjectTemplate,
  isBuiltinObjectTemplateId,
  isObjectTemplateOverride,
  listObjectTemplates,
} from '../../../lib/objectTemplates';
import {
  deleteCustomTutorialTemplate,
  isBuiltinOverride,
  isBuiltinTemplateId,
  listTutorialTemplates,
} from '../../../lib/tutorialTemplates';
import { TutorialTemplateEditor } from './TutorialTemplateEditor';
import { ObjectTemplateEditor } from './ObjectTemplateEditor';

type ListItem =
  | { kind: 'tutorial'; t: TutorialTemplate }
  | { kind: 'object'; t: ObjectTemplate };

export function TemplateLibrary() {
  const { navigate, setCreatorObjectType, setPendingTemplateId } = useApp();
  const [typeFilter, setTypeFilter] = useState<TemplateObjectType>('tutorial');
  const [tick, setTick] = useState(0);
  const [editingTutorial, setEditingTutorial] = useState<TutorialTemplate | null | 'new'>(null);
  const [editingObject, setEditingObject] = useState<ObjectTemplate | null | 'new'>(null);

  const refresh = () => setTick((n) => n + 1);

  const items: ListItem[] = useMemo(() => {
    void tick;
    if (typeFilter === 'tutorial') {
      return listTutorialTemplates().map((t) => ({ kind: 'tutorial' as const, t }));
    }
    return listObjectTemplates(typeFilter).map((t) => ({ kind: 'object' as const, t }));
  }, [typeFilter, tick]);

  const recommended = items.filter((it) => {
    if (it.kind === 'tutorial') return it.t.builtin || isBuiltinTemplateId(it.t.id);
    return it.t.recommended || it.t.builtin || isBuiltinObjectTemplateId(it.t.id);
  });
  const customOnly = items.filter((it) => {
    if (it.kind === 'tutorial') return !it.t.builtin && !isBuiltinTemplateId(it.t.id);
    return !it.t.builtin && !isBuiltinObjectTemplateId(it.t.id);
  });

  const useTemplate = (objectType: TemplateObjectType, templateId: string) => {
    setPendingTemplateId(templateId);
    setCreatorObjectType(objectType);
    navigate('cd-creator');
  };

  const handleDelete = (item: ListItem) => {
    if (item.kind === 'tutorial') {
      deleteCustomTutorialTemplate(item.t.id);
    } else {
      deleteCustomObjectTemplate(item.t.id);
    }
    refresh();
  };

  const startCreate = () => {
    if (typeFilter === 'tutorial') setEditingTutorial('new');
    else setEditingObject('new');
  };

  const renderCard = (item: ListItem, i: number) => {
    const id = item.t.id;
    const name = item.t.name;
    const description = item.t.description;
    const isTutorial = item.kind === 'tutorial';
    const overridden = isTutorial ? isBuiltinOverride(id) : isObjectTemplateOverride(id);
    const pureCustom = isTutorial
      ? !item.t.builtin && !isBuiltinTemplateId(id)
      : !item.t.builtin && !isBuiltinObjectTemplateId(id);
    const recommendedBadge = isTutorial
      ? item.t.builtin || isBuiltinTemplateId(id)
      : !!(item.t.recommended || item.t.builtin);

    return (
      <motion.div
        key={`${item.kind}-${id}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: i * 0.03 }}
        className="rounded-[22px] p-4 flex flex-col"
        style={{
          background: 'white',
          boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)',
          border: '1px solid rgba(255,255,255,0.8)',
        }}
      >
        <div className="flex items-start gap-2 mb-2">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(0,0,0,0.04)' }}>
            <LayoutTemplate size={16} style={{ color: '#0B1220' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p style={{ fontSize: 14, fontWeight: 650, color: '#0B1220' }}>{name}</p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {recommendedBadge && (
                <span className="px-2 py-0.5 rounded text-[10.5px] font-semibold"
                  style={{ background: 'rgba(5,150,105,0.12)', color: '#059669' }}>
                  Recommended
                </span>
              )}
              {pureCustom && (
                <span className="px-2 py-0.5 rounded text-[10.5px] font-semibold"
                  style={{ background: 'rgba(29,78,216,0.1)', color: '#1D4ED8' }}>
                  Custom
                </span>
              )}
              {overridden && (
                <span className="px-2 py-0.5 rounded text-[10.5px] font-semibold"
                  style={{ background: 'rgba(217,119,6,0.12)', color: '#B45309' }}>
                  Edited
                </span>
              )}
            </div>
          </div>
        </div>
        <p style={{ fontSize: 12.5, color: '#6B7280', lineHeight: 1.5, flex: 1, marginBottom: 14 }}>
          {description || (pureCustom ? 'Your custom template' : 'Pedagogical template for this object type.')}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => useTemplate(typeFilter, id)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-white"
            style={{ fontSize: 12, fontWeight: 600, background: '#0B0F1A' }}
          >
            <Sparkles size={12} />Use template
          </button>
          <button
            type="button"
            onClick={() => {
              if (isTutorial) setEditingTutorial(item.t);
              else setEditingObject(item.t);
            }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full border"
            style={{ fontSize: 12, color: '#374151', borderColor: 'rgba(0,0,0,0.1)' }}
          >
            <Pencil size={12} />Edit
          </button>
          {(pureCustom || overridden) && (
            <button
              type="button"
              onClick={() => handleDelete(item)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full border"
              style={{ fontSize: 12, color: overridden ? '#B45309' : '#B91C1C', borderColor: 'rgba(0,0,0,0.1)' }}
              title={overridden ? 'Reset to recommended default' : 'Delete custom template'}
            >
              {overridden ? <RotateCcw size={12} /> : <Trash2 size={12} />}
              {overridden ? 'Reset' : 'Delete'}
            </button>
          )}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="px-6 py-6 w-full">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0B1220', letterSpacing: '-0.3px', marginBottom: 4 }}>
            Template Library
          </h2>
          <p style={{ fontSize: 13.5, color: '#6B7280', maxWidth: 520, lineHeight: 1.5 }}>
            Recommended pedagogical templates for every learning object — and your custom ones.
            Use a template to start creating, or edit and save new shapes for your team.
          </p>
        </div>
        <button
          type="button"
          onClick={startCreate}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-white"
          style={{ fontSize: 13, fontWeight: 600, background: '#0B0F1A' }}
        >
          <Plus size={14} />New template
        </button>
      </div>

      {/* Type tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-5">
        {TEMPLATE_OBJECT_TYPES.map((type) => {
          const on = typeFilter === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => {
                setTypeFilter(type);
                setEditingTutorial(null);
                setEditingObject(null);
              }}
              className="px-3.5 py-1.5 rounded-full shrink-0 transition-all"
              style={{
                fontSize: 12.5,
                fontWeight: on ? 650 : 500,
                background: on ? '#0B0F1A' : 'rgba(255,255,255,0.75)',
                color: on ? '#fff' : '#374151',
                border: on ? '1.5px solid #0B0F1A' : '1.5px solid rgba(0,0,0,0.08)',
              }}
            >
              {TEMPLATE_TYPE_LABELS[type]}
            </button>
          );
        })}
      </div>

      {/* Editors */}
      {typeFilter === 'tutorial' && editingTutorial !== null && (
        <TutorialTemplateEditor
          key={editingTutorial === 'new' ? 'new' : editingTutorial.id}
          initial={editingTutorial === 'new' ? null : editingTutorial}
          onSave={() => { refresh(); setEditingTutorial(null); }}
          onCancel={() => setEditingTutorial(null)}
        />
      )}
      {typeFilter !== 'tutorial' && editingObject !== null && (
        <ObjectTemplateEditor
          key={editingObject === 'new' ? 'new' : editingObject.id}
          objectType={typeFilter}
          initial={editingObject === 'new' ? null : editingObject}
          onSave={() => { refresh(); setEditingObject(null); }}
          onCancel={() => setEditingObject(null)}
        />
      )}

      {/* Recommended */}
      <p style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', letterSpacing: '.05em', marginBottom: 10 }}>
        RECOMMENDED · {TEMPLATE_TYPE_LABELS[typeFilter].toUpperCase()}
      </p>
      {recommended.length === 0 ? (
        <p style={{ fontSize: 13, color: '#9AA3AF', marginBottom: 24 }}>No recommended templates yet for this type.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-8">
          {recommended.map((it, i) => renderCard(it, i))}
        </div>
      )}

      {/* Custom */}
      <p style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', letterSpacing: '.05em', marginBottom: 10 }}>
        YOUR CUSTOM TEMPLATES
      </p>
      {customOnly.length === 0 ? (
        <div className="rounded-[22px] px-5 py-8 text-center"
          style={{ background: 'rgba(255,255,255,0.65)', border: '1px dashed rgba(0,0,0,0.12)' }}>
          <p style={{ fontSize: 13.5, color: '#6B7280', marginBottom: 10 }}>
            No custom {TEMPLATE_TYPE_LABELS[typeFilter].toLowerCase()} templates yet.
          </p>
          <button type="button" onClick={startCreate}
            className="px-4 py-2 rounded-full border"
            style={{ fontSize: 12.5, fontWeight: 600, color: '#0B1220', borderColor: 'rgba(0,0,0,0.12)' }}>
            <Plus size={12} className="inline mr-1" />Create one
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {customOnly.map((it, i) => renderCard(it, i))}
        </div>
      )}
    </div>
  );
}

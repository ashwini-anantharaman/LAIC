import React, { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, RotateCcw, Sparkles, LayoutTemplate, ArrowLeft, ChevronDown } from 'lucide-react';
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
  const isFocusing = editingTutorial !== null || editingObject !== null;

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

  const openItem = (item: ListItem) => {
    if (item.kind === 'tutorial') setEditingTutorial(item.t);
    else setEditingObject(item.t);
  };

  const startCreate = () => {
    if (typeFilter === 'tutorial') setEditingTutorial('new');
    else setEditingObject('new');
  };

  const closeFocus = () => {
    setEditingTutorial(null);
    setEditingObject(null);
  };

  const focusTitle = (() => {
    if (editingTutorial === 'new' || editingObject === 'new') {
      return `New ${TEMPLATE_TYPE_LABELS[typeFilter]} template`;
    }
    if (editingTutorial && editingTutorial !== 'new') return editingTutorial.name;
    if (editingObject && editingObject !== 'new') return editingObject.name;
    return 'Template';
  })();

  /* ── Focused editor: hide library chrome ─────────────────────── */
  if (isFocusing) {
    return (
      <div className="px-6 py-6 w-full max-w-3xl mx-auto">
        <button
          type="button"
          onClick={closeFocus}
          className="inline-flex items-center gap-1.5 mb-5 px-3 py-1.5 rounded-full transition-colors hover:bg-white/70"
          style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}
        >
          <ArrowLeft size={15} />
          Back to library
        </button>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4"
        >
          <p style={{ fontSize: 12, fontWeight: 600, color: '#9AA3AF', letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 4 }}>
            {TEMPLATE_TYPE_LABELS[typeFilter]}
          </p>
          <h2 style={{ fontSize: 20, fontWeight: 750, color: '#0B1220', letterSpacing: '-0.3px' }}>
            {focusTitle}
          </h2>
        </motion.div>

        {typeFilter === 'tutorial' && editingTutorial !== null && (
          <TutorialTemplateEditor
            key={editingTutorial === 'new' ? 'new' : editingTutorial.id}
            initial={editingTutorial === 'new' ? null : editingTutorial}
            onSave={() => { refresh(); closeFocus(); }}
            onCancel={closeFocus}
          />
        )}
        {typeFilter !== 'tutorial' && editingObject !== null && (
          <ObjectTemplateEditor
            key={editingObject === 'new' ? 'new' : editingObject.id}
            objectType={typeFilter}
            initial={editingObject === 'new' ? null : editingObject}
            onSave={() => { refresh(); closeFocus(); }}
            onCancel={closeFocus}
          />
        )}
      </div>
    );
  }

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
        transition={{ delay: Math.min(i, 8) * 0.03 }}
        role="button"
        tabIndex={0}
        onClick={() => openItem(item)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openItem(item);
          }
        }}
        className="rounded-[22px] p-4 flex flex-col text-left cursor-pointer transition-shadow hover:shadow-[0_8px_24px_-8px_rgba(30,50,80,0.18)]"
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
        <div className="flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
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
            onClick={() => openItem(item)}
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
          <p style={{ fontSize: 13.5, color: '#6B7280', maxWidth: 480, lineHeight: 1.5 }}>
            Pick an object type, then use or edit a template. Opening a template focuses the editor.
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

      {/* Object type dropdown */}
      <div className="mb-6 max-w-sm">
        <label style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 6 }}>
          Learning object
        </label>
        <div className="relative">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TemplateObjectType)}
            className="w-full appearance-none rounded-2xl pl-4 pr-10 py-3"
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: '#0B1220',
              background: 'white',
              border: '1px solid rgba(0,0,0,0.08)',
              boxShadow: '0 4px 16px -6px rgba(30,50,80,0.1)',
              outline: 'none',
            }}
          >
            {TEMPLATE_OBJECT_TYPES.map((type) => (
              <option key={type} value={type}>{TEMPLATE_TYPE_LABELS[type]}</option>
            ))}
          </select>
          <ChevronDown
            size={16}
            className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2"
            style={{ color: '#9AA3AF' }}
          />
        </div>
      </div>

      <p style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', letterSpacing: '.05em', marginBottom: 10 }}>
        RECOMMENDED
      </p>
      {recommended.length === 0 ? (
        <p style={{ fontSize: 13, color: '#9AA3AF', marginBottom: 24 }}>No recommended templates yet for this type.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-8">
          {recommended.map((it, i) => renderCard(it, i))}
        </div>
      )}

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

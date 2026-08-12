import React, { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, RotateCcw, Sparkles, LayoutTemplate, ArrowLeft, ChevronDown, Star, Copy } from 'lucide-react';
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
  duplicateTutorialTemplate,
  isBuiltinOverride,
  isBuiltinTemplateId,
  listTutorialTemplates,
} from '../../../lib/tutorialTemplates';
import {
  deleteCustomTutorialTemplate as deleteCustomTutorialV2Template,
  duplicateTutorialTemplate as duplicateTutorialV2Template,
  isBuiltinOverride as isBuiltinV2Override,
  isBuiltinTemplateId as isBuiltinV2TemplateId,
  listTutorialTemplates as listTutorialV2Templates,
} from '../../../lib/tutorialV2/tutorialTemplates';
import {
  getDefaultTemplateId,
  isDefaultTemplate,
  setDefaultTemplateId,
} from '../../../lib/templateDefaults';
import { setTutorialV2LaunchTemplate } from '../../../lib/tutorialV2/launchTemplate';
import { pastelChipFromHex, pastelFromHex } from '../../../lib/pastel';
import { TutorialTemplateEditor } from './TutorialTemplateEditor';
import { TutorialTemplateEditorV2 } from './tutorialV2/TutorialTemplateEditorV2';
import { ObjectTemplateEditor } from './ObjectTemplateEditor';
import { useConfirm } from '../ConfirmDialog';

/** Same color bases as Create tiles — pastel fill for template cards. */
const TYPE_COLOR: Record<TemplateObjectType, string> = {
  tutorial: '#7C3AED',
  'tutorial-v2': '#6D28D9',
  lesson: '#1D4ED8',
  quiz: '#059669',
  'flashcard-set': '#D97706',
  'concept-card': '#0284C7',
  summary: '#6B7280',
  reflection: '#9333EA',
  scenario: '#0EA5E9',
  assignment: '#EA580C',
  drill: '#DC2626',
  'video-script': '#EC4899',
};

type ListItem =
  | { kind: 'tutorial'; t: TutorialTemplate }
  | { kind: 'tutorial-v2'; t: TutorialTemplate }
  | { kind: 'object'; t: ObjectTemplate };

function isTutorialKind(kind: ListItem['kind']): kind is 'tutorial' | 'tutorial-v2' {
  return kind === 'tutorial' || kind === 'tutorial-v2';
}

export function TemplateLibrary() {
  const { navigate, setCreatorObjectType, setPendingTemplateId, clearEditingObject } = useApp();
  const confirm = useConfirm();
  const [typeFilter, setTypeFilter] = useState<TemplateObjectType>('tutorial-v2');
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
    if (typeFilter === 'tutorial-v2') {
      return listTutorialV2Templates().map((t) => ({ kind: 'tutorial-v2' as const, t }));
    }
    return listObjectTemplates(typeFilter).map((t) => ({ kind: 'object' as const, t }));
  }, [typeFilter, tick]);

  // Recommended shelf left empty for now — every template (including former
  // builtins / recommended defaults) lives under Custom until we curate again.
  const recommended: ListItem[] = [];
  const customOnly = items;

  const useTemplate = (item: ListItem) => {
    const objectType: TemplateObjectType = item.kind === 'object'
      ? typeFilter
      : item.kind;
    const templateId = item.t.id;
    if (objectType === 'tutorial-v2') {
      setTutorialV2LaunchTemplate(templateId);
    }
    clearEditingObject?.();
    setPendingTemplateId(templateId);
    setCreatorObjectType(objectType);
    navigate('cd-creator');
  };

  const makeDefault = (objectType: TemplateObjectType, templateId: string) => {
    setDefaultTemplateId(objectType, templateId);
    refresh();
  };

  const handleDelete = async (item: ListItem) => {
    const name = item.t.name;
    const overridden = item.kind === 'tutorial'
      ? isBuiltinOverride(item.t.id)
      : item.kind === 'tutorial-v2'
        ? isBuiltinV2Override(item.t.id)
        : isObjectTemplateOverride(item.t.id);
    const ok = await confirm({
      title: overridden ? 'Are you sure you want to reset?' : 'Are you sure you want to delete?',
      description: overridden
        ? `Reset “${name}” to the recommended default?`
        : `Delete template “${name}”? This can’t be undone.`,
      confirmLabel: overridden ? 'Reset' : 'Delete',
      destructive: !overridden,
    });
    if (!ok) return;
    if (item.kind === 'tutorial') {
      deleteCustomTutorialTemplate(item.t.id);
    } else if (item.kind === 'tutorial-v2') {
      deleteCustomTutorialV2Template(item.t.id);
    } else {
      deleteCustomObjectTemplate(item.t.id);
    }
    refresh();
  };

  const openItem = (item: ListItem) => {
    if (isTutorialKind(item.kind)) setEditingTutorial(item.t);
    else setEditingObject(item.t);
  };

  const handleDuplicateTutorial = (id: string) => {
    const copy = typeFilter === 'tutorial-v2'
      ? duplicateTutorialV2Template(id)
      : duplicateTutorialTemplate(id);
    if (!copy) return;
    refresh();
    setEditingTutorial(copy);
  };

  const startCreate = () => {
    if (typeFilter === 'tutorial' || typeFilter === 'tutorial-v2') setEditingTutorial('new');
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
      <div className="px-4 sm:px-6 py-5 sm:py-6 w-full max-w-3xl mx-auto">
        <button
          type="button"
          onClick={closeFocus}
          className="inline-flex items-center gap-1.5 mb-5 px-3 py-1.5 rounded-full transition-colors hover:bg-white/70"
          style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}
        >
          <ArrowLeft size={15} />
          Back to Content Library
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
        {typeFilter === 'tutorial-v2' && editingTutorial !== null && (
          <TutorialTemplateEditorV2
            key={editingTutorial === 'new' ? 'new-v2' : editingTutorial.id}
            initial={editingTutorial === 'new' ? null : editingTutorial}
            onSave={() => { refresh(); closeFocus(); }}
            onCancel={closeFocus}
          />
        )}
        {typeFilter !== 'tutorial' && typeFilter !== 'tutorial-v2' && editingObject !== null && (
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
    const isTutorial = isTutorialKind(item.kind);
    const overridden = item.kind === 'tutorial'
      ? isBuiltinOverride(id)
      : item.kind === 'tutorial-v2'
        ? isBuiltinV2Override(id)
        : isObjectTemplateOverride(id);
    // Listed under Custom for now; keep delete rules so seed builtins can't be removed.
    const pureCustom = item.kind === 'tutorial'
      ? !item.t.builtin && !isBuiltinTemplateId(id)
      : item.kind === 'tutorial-v2'
        ? !item.t.builtin && !isBuiltinV2TemplateId(id)
        : !item.t.builtin && !isBuiltinObjectTemplateId(id);
    const recommendedBadge = false;
    const isDefault = isDefaultTemplate(typeFilter, id);
    const base = TYPE_COLOR[typeFilter] || '#7C3AED';

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
          border: isDefault
            ? `1.5px solid ${pastelFromHex(base, 0.55)}`
            : '1px solid rgba(0,0,0,0.06)',
        }}
      >
        <div className="flex items-start gap-2 mb-2">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: pastelChipFromHex(base), color: base }}
          >
            <LayoutTemplate size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <p style={{ fontSize: 14, fontWeight: 650, color: '#0B1220' }}>{name}</p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {isDefault && (
                <span className="px-2 py-0.5 rounded text-[10.5px] font-semibold inline-flex items-center gap-1"
                  style={{ background: pastelFromHex('#7C3AED'), color: '#6D28D9' }}>
                  <Star size={10} fill="currentColor" />Default
                </span>
              )}
              {recommendedBadge && (
                <span className="px-2 py-0.5 rounded text-[10.5px] font-semibold"
                  style={{ background: pastelFromHex('#059669'), color: '#059669' }}>
                  Recommended
                </span>
              )}
              <span className="px-2 py-0.5 rounded text-[10.5px] font-semibold"
                style={{ background: pastelFromHex('#1D4ED8'), color: '#1D4ED8' }}>
                Custom
              </span>
              {overridden && (
                <span className="px-2 py-0.5 rounded text-[10.5px] font-semibold"
                  style={{ background: pastelFromHex('#D97706'), color: '#B45309' }}>
                  Edited
                </span>
              )}
            </div>
          </div>
        </div>
        <p style={{ fontSize: 12.5, color: '#6B7280', lineHeight: 1.5, flex: 1, marginBottom: 14 }}>
          {description || (pureCustom ? 'Your custom template' : 'Pedagogical template for this content type.')}
        </p>
        <div className="flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => useTemplate(item)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-white"
            style={{ fontSize: 12, fontWeight: 600, background: '#0B0F1A' }}
          >
            <Sparkles size={12} />Use template
          </button>
          {!isDefault && (
            <button
              type="button"
              onClick={() => makeDefault(typeFilter, id)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full border"
              style={{ fontSize: 12, fontWeight: 600, color: '#6D28D9', borderColor: 'rgba(124,58,237,0.35)', background: 'rgba(124,58,237,0.06)' }}
            >
              <Star size={12} />Set as default
            </button>
          )}
          <button
            type="button"
            onClick={() => openItem(item)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full border"
            style={{ fontSize: 12, color: '#374151', borderColor: 'rgba(0,0,0,0.1)' }}
          >
            <Pencil size={12} />Edit
          </button>
          {isTutorial && (
            <button
              type="button"
              onClick={() => handleDuplicateTutorial(id)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full border"
              style={{ fontSize: 12, color: '#374151', borderColor: 'rgba(0,0,0,0.1)' }}
            >
              <Copy size={12} />Start from this
            </button>
          )}
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
    <div className="px-4 sm:px-6 py-5 sm:py-6 w-full">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0B1220', letterSpacing: '-0.3px', marginBottom: 4 }}>
            Template Library
          </h2>
          <p style={{ fontSize: 13.5, color: '#6B7280', maxWidth: 560, lineHeight: 1.5 }}>
            Create a template from scratch, or start from an existing one (Start from this → edit blocks → save).
            Embedded library slots only store metadata — the course developer picks the real content later.
            {(() => {
              const defId = getDefaultTemplateId(typeFilter);
              const defName = typeFilter === 'tutorial'
                ? listTutorialTemplates().find((t) => t.id === defId)?.name
                : typeFilter === 'tutorial-v2'
                  ? listTutorialV2Templates().find((t) => t.id === defId)?.name
                  : listObjectTemplates(typeFilter).find((t) => t.id === defId)?.name;
              return defName
                ? ` Current default: ${defName}.`
                : '';
            })()}
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

      {/* Content type dropdown */}
      <div className="mb-6 max-w-sm">
        <label style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 6 }}>
          Content
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

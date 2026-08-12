import React, { useMemo, useState } from 'react';
import {
  BookOpen, Layers, HelpCircle, Copy, Lightbulb, FileText, Zap, PenLine, Video, BookMarked, Play, ArrowRight,
  Plus, Check, X, Search, ChevronRight, FolderOpen, Eye,
} from 'lucide-react';
import { motion } from 'motion/react';
import { pastelChipFromHex, pastelFromHex } from '../../../lib/pastel';
import {
  getCollectionPath,
  getRootCollections,
  getChildCollections,
  type ObjectCollection,
} from '../../../lib/objectCollectionsStore';
import { getDefaultTemplateId } from '../../../lib/templateDefaults';
import { analyzeTemplateRecipe } from '../../../lib/tutorialV2/recipeStructure';
import {
  ATOMIC_BLOCK_OPTIONS,
  BLANK_CANVAS_TUTORIAL_TEMPLATE_ID,
  DEFAULT_TUTORIAL_TEMPLATE_ID,
  EMBEDDED_OBJECT_OPTIONS,
  SOURCE_MODE_OPTIONS,
  getTutorialTemplate,
} from '../../../lib/tutorialV2/tutorialTemplates';
import { setTutorialV2LaunchTemplate } from '../../../lib/tutorialV2/launchTemplate';
import type { RecipeItem, TutorialTemplate } from '../../../lib/types';
import { getObjectTemplate, type TemplateObjectType } from '../../../lib/objectTemplates';
import {
  X_SLOT_NOUN,
  isStructuredV2Type,
  seedUnitsFromTemplate,
} from '../../../lib/objectV2/structuredDraft';
import { useApp } from '../../App';
import { GlassFolderTile, tintForKey } from '../GlassFolder';

/** Types that get the "How do you want to build this?" authoring-path modal. */
const PATH_PICKER_TYPES = ['tutorial-v2', 'quiz', 'flashcard-set', 'concept-card', 'video-script'];

interface ObjectTile {
  id: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  color: string;
}

const TILES: ObjectTile[] = [
  { id: 'course', label: 'Course', desc: 'Multi-module learning journey with objectives & certificate', icon: <BookMarked size={22} />, color: '#0B0F1A' },
  { id: 'lesson', label: 'Lesson', desc: 'Focused unit around a single concept or skill', icon: <BookOpen size={22} />, color: '#1D4ED8' },
  { id: 'tutorial', label: 'Tutorial', desc: 'Step-by-step guided walkthrough', icon: <Layers size={22} />, color: '#7C3AED' },
  { id: 'tutorial-v2', label: 'Tutorial V2', desc: 'Same as Tutorial today — section-by-section flow later', icon: <Layers size={22} />, color: '#6D28D9' },
  { id: 'quiz', label: 'Quiz', desc: 'Multiple-choice questions with instant feedback', icon: <HelpCircle size={22} />, color: '#059669' },
  { id: 'flashcard-set', label: 'Flashcard set', desc: 'Term–definition pairs for active recall', icon: <Copy size={22} />, color: '#D97706' },
  { id: 'concept-card', label: 'Concept card', desc: 'One idea, many views — definition, analogy, example, misconception', icon: <Lightbulb size={22} />, color: '#0284C7' },
  { id: 'summary', label: 'Summary', desc: 'Condensed takeaway from a lesson or module', icon: <FileText size={22} />, color: '#6B7280' },
  { id: 'reflection', label: 'Reflection', desc: 'Guided metacognitive prompt for learners', icon: <FileText size={22} />, color: '#9333EA' },
  { id: 'scenario', label: 'Scenario', desc: 'Apply knowledge to a realistic situation', icon: <Zap size={22} />, color: '#0EA5E9' },
  { id: 'assignment', label: 'Assignment', desc: 'Open-ended task with submission', icon: <PenLine size={22} />, color: '#EA580C' },
  { id: 'drill', label: 'Drill', desc: 'Rapid-fire practice for automaticity', icon: <Zap size={22} />, color: '#DC2626' },
  { id: 'video-script', label: 'Video script', desc: 'Narration script for a video or screencast', icon: <Video size={22} />, color: '#EC4899' },
];

const SPECIALIZED: { id: string; label: string; desc: string; icon: React.ReactNode }[] = [
  { id: 'bridge-play', label: 'Bridge play', desc: 'Interactive card-play widget — "win the trick"', icon: <Play size={18} /> },
  { id: 'bidding-sequence', label: 'Bidding sequence', desc: 'Step-through auction with explanations', icon: <Layers size={18} /> },
];

function collectionPathLabel(list: ObjectCollection[], id: string): string {
  const path = getCollectionPath(list, id);
  const self = list.find((c) => c.id === id);
  if (!self) return id;
  if (!path.length) return self.name;
  return [...path.map((p) => p.name), self.name].join(' / ');
}

function NewCollectionModal({
  parentName,
  onClose,
  onCreate,
}: {
  parentName?: string | null;
  onClose: () => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState('');
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(11,18,32,0.45)', backdropFilter: 'blur(4px)' }}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm rounded-[28px] overflow-hidden"
        style={{ background: 'white', boxShadow: '0 24px 64px -16px rgba(30,50,80,0.3)' }}
      >
        <div className="p-5 border-b" style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0B1220' }}>New folder</h3>
          <p style={{ fontSize: 13, color: '#9AA3AF', marginTop: 2 }}>
            {parentName
              ? `Created inside “${parentName}”.`
              : 'Created at the top level of Content Library.'}
          </p>
        </div>
        <div className="p-5">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) onCreate(name.trim());
            }}
            placeholder="e.g. Bidding fundamentals"
            className="w-full rounded-2xl px-4 py-2.5"
            style={{ fontSize: 13, border: '1px solid rgba(0,0,0,0.1)', outline: 'none' }}
          />
        </div>
        <div className="flex gap-2 p-4 border-t" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-full" style={{ background: 'rgba(0,0,0,0.05)', fontSize: 13, fontWeight: 600, color: '#374151' }}>Cancel</button>
          <button
            type="button"
            disabled={!name.trim()}
            onClick={() => onCreate(name.trim())}
            className="flex-1 py-2.5 rounded-full"
            style={{ background: name.trim() ? '#0B0F1A' : '#E5E7EB', color: name.trim() ? '#fff' : '#9AA3AF', fontSize: 13, fontWeight: 600 }}
          >
            Create
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Finder-style save target picker — browse folders (double-click),
 * multi-select folders to save into (click / checkbox).
 */
function CollectionPickerModal({
  objectLabel,
  collections,
  selectedIds,
  onToggle,
  onContinue,
  onClose,
  onNewCollection,
}: {
  objectLabel: string;
  collections: ObjectCollection[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onContinue: () => void;
  onClose: () => void;
  onNewCollection: (parentId: string | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [openedFolderId, setOpenedFolderId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const selectedSet = new Set(selectedIds);
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  const opened = collections.find((c) => c.id === openedFolderId) ?? null;
  const breadcrumb = opened
    ? [...getCollectionPath(collections, opened.id), opened]
    : [];

  const foldersHere = useMemo(() => {
    if (searching) {
      return collections
        .filter((c) => c.name.toLowerCase().includes(q))
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    return opened
      ? getChildCollections(collections, opened.id)
      : getRootCollections(collections);
  }, [collections, opened, searching, q]);

  const selectedLabels = selectedIds
    .map((id) => collectionPathLabel(collections, id))
    .filter(Boolean);

  const openFolder = (id: string) => {
    setOpenedFolderId(id);
    setFocusedId(id);
    setQuery('');
  };

  const goRoot = () => {
    setOpenedFolderId(null);
    setFocusedId(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
      role="presentation"
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full flex flex-col overflow-hidden"
        style={{
          maxWidth: 920,
          height: 'min(780px, 90vh)',
          background: '#F7F8FA',
          borderRadius: 20,
          border: '1px solid rgba(0,0,0,0.1)',
          boxShadow: '0 28px 80px -24px rgba(15,23,42,0.45)',
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Save to collections"
      >
        {/* Title bar */}
        <div
          className="flex items-center gap-3 px-4 py-3 shrink-0"
          style={{
            background: 'linear-gradient(180deg, #FFFFFF 0%, #F3F4F6 100%)',
            borderBottom: '1px solid rgba(0,0,0,0.08)',
          }}
        >
          <FolderOpen size={18} style={{ color: '#0B1220' }} />
          <div className="flex-1 min-w-0">
            <p style={{ fontSize: 14, fontWeight: 750, color: '#0B1220' }}>Save to collections</p>
            <p style={{ fontSize: 11.5, color: '#9AA3AF' }}>
              Optional folders for this <strong style={{ color: '#374151' }}>{objectLabel}</strong>
              {' '}· click to select · double-click to open · or continue without
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-black/5"
            aria-label="Close"
          >
            <X size={16} style={{ color: '#6B7280' }} />
          </button>
        </div>

        {/* Search + breadcrumb */}
        <div
          className="px-4 py-3 shrink-0 space-y-2.5"
          style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', background: '#fff' }}
        >
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: '#9AA3AF' }}
            />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search folders…"
              className="w-full rounded-xl pl-9 pr-3 py-2.5"
              style={{
                fontSize: 13.5,
                border: '1px solid rgba(0,0,0,0.1)',
                background: '#F9FAFB',
                outline: 'none',
              }}
            />
          </div>
          <div className="flex items-center gap-1 flex-wrap" style={{ fontSize: 12.5 }}>
            <button
              type="button"
              onClick={goRoot}
              className="px-2 py-0.5 rounded-md hover:bg-black/5"
              style={{
                fontWeight: !opened && !searching ? 700 : 500,
                color: !opened && !searching ? '#0B1220' : '#6B7280',
              }}
            >
              Library
            </button>
            {breadcrumb.map((c) => (
              <React.Fragment key={c.id}>
                <ChevronRight size={12} style={{ color: '#C4CBD4' }} />
                <button
                  type="button"
                  onClick={() => openFolder(c.id)}
                  className="px-2 py-0.5 rounded-md hover:bg-black/5"
                  style={{
                    fontWeight: opened?.id === c.id && !searching ? 700 : 500,
                    color: opened?.id === c.id && !searching ? '#0B1220' : '#6B7280',
                  }}
                >
                  {c.name}
                </button>
              </React.Fragment>
            ))}
            {searching && (
              <>
                <ChevronRight size={12} style={{ color: '#C4CBD4' }} />
                <span style={{ fontWeight: 650, color: '#0B1220', padding: '0 6px' }}>
                  Search results
                </span>
              </>
            )}
          </div>
        </div>

        {/* Directory body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#9AA3AF',
                letterSpacing: '.06em',
                textTransform: 'uppercase',
              }}
            >
              {searching
                ? `Folders · ${foldersHere.length} match${foldersHere.length === 1 ? '' : 'es'}`
                : opened
                  ? `Folders in “${opened.name}”`
                  : 'Folders'}
            </p>
            <button
              type="button"
              onClick={() => onNewCollection(openedFolderId)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border"
              style={{ fontSize: 12, fontWeight: 600, color: '#374151', borderColor: 'rgba(0,0,0,0.1)', background: '#fff' }}
            >
              <Plus size={12} /> New folder
            </button>
          </div>

          {foldersHere.length === 0 ? (
            <div
              className="rounded-2xl px-4 py-10 text-center"
              style={{ background: '#fff', border: '1px dashed rgba(0,0,0,0.1)' }}
            >
              <FolderOpen size={22} className="mx-auto mb-2" style={{ color: '#C4CBD4' }} />
              <p style={{ fontSize: 13.5, fontWeight: 600, color: '#0B1220' }}>
                {searching ? 'No matching folders' : 'No folders here'}
              </p>
              <p style={{ fontSize: 12.5, color: '#9AA3AF', marginTop: 4 }}>
                {searching
                  ? 'Try another search, or clear it to browse.'
                  : 'Create a folder with New folder, or go up via the breadcrumb.'}
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {foldersHere.map((col) => {
                const selected = selectedSet.has(col.id);
                const childCount = getChildCollections(collections, col.id).length;
                return (
                  <div key={col.id} className="relative">
                    <GlassFolderTile
                      id={col.id}
                      name={col.name}
                      count={childCount}
                      selected={selected || focusedId === col.id}
                      tint={tintForKey(col.id)}
                      onClick={() => {
                        setFocusedId(col.id);
                        onToggle(col.id);
                      }}
                      onDoubleClick={() => openFolder(col.id)}
                    />
                    {selected && (
                      <span
                        className="absolute top-1 right-2 w-5 h-5 rounded-full flex items-center justify-center pointer-events-none"
                        style={{ background: '#059669', color: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}
                      >
                        <Check size={11} strokeWidth={3} />
                      </span>
                    )}
                    {searching && (
                      <p
                        className="w-[108px] text-center truncate px-1"
                        style={{ fontSize: 10, color: '#9AA3AF', marginTop: 2 }}
                      >
                        {collectionPathLabel(collections, col.id)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {opened && !searching && (
            <div
              className="mt-5 rounded-2xl px-3.5 py-3 flex items-start gap-3"
              style={{ background: 'rgba(5,150,105,0.06)', border: '1px solid rgba(5,150,105,0.2)' }}
            >
              <button
                type="button"
                onClick={() => onToggle(opened.id)}
                className="w-5 h-5 rounded border flex items-center justify-center shrink-0 mt-0.5"
                style={{
                  borderColor: selectedSet.has(opened.id) ? '#059669' : '#D1D5DB',
                  background: selectedSet.has(opened.id) ? '#059669' : '#fff',
                }}
                aria-label={selectedSet.has(opened.id) ? 'Deselect this folder' : 'Select this folder'}
              >
                {selectedSet.has(opened.id) && <Check size={11} color="#fff" strokeWidth={3} />}
              </button>
              <div>
                <p style={{ fontSize: 13, fontWeight: 650, color: '#065F46' }}>
                  Also save into “{opened.name}”
                </p>
                <p style={{ fontSize: 12, color: '#047857', marginTop: 2 }}>
                  Check to include this open folder itself (not only its subfolders).
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="shrink-0 px-4 py-3 flex flex-wrap items-center gap-3"
          style={{ background: '#fff', borderTop: '1px solid rgba(0,0,0,0.08)' }}
        >
          <div className="flex-1 min-w-[180px]">
            {selectedIds.length === 0 ? (
              <p style={{ fontSize: 12.5, color: '#9AA3AF' }}>No folders selected — saves to Content Library only</p>
            ) : (
              <p style={{ fontSize: 12.5, color: '#6B7280' }} className="line-clamp-2">
                <strong style={{ color: '#0B1220' }}>{selectedIds.length} selected</strong>
                {' · '}
                {selectedLabels.join(', ')}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-full"
            style={{ background: 'rgba(0,0,0,0.05)', fontSize: 13, fontWeight: 600, color: '#374151' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="px-4 py-2.5 rounded-full inline-flex items-center justify-center gap-1.5"
            style={{
              background: '#0B0F1A',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Continue <ArrowRight size={14} />
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Same chrome as CollectionPickerModal — path choice for Tutorial V2
 * (template vs write-yourself) right after folder Continue.
 */
function recipeItemLabel(item: RecipeItem): string {
  if (item.kind === 'atomic') {
    const label = ATOMIC_BLOCK_OPTIONS.find((o) => o.type === item.blockType)?.label || item.blockType;
    if (item.blockType === 'section-heading') return label;
    const req = item.required === false ? ' (optional)' : '';
    return `${label}${req}`;
  }
  const typeLabel = EMBEDDED_OBJECT_OPTIONS.find((o) => o.type === item.objectType)?.label || item.objectType;
  const mode = SOURCE_MODE_OPTIONS.find((o) => o.id === (item.sourceMode || 'generate'))?.label;
  const req = item.required === false ? ' · optional' : '';
  return mode ? `${typeLabel} — ${mode}${req}` : `${typeLabel}${req}`;
}

type OutlineNode = { label: string; children?: OutlineNode[] };

function buildTemplateOutline(template: TutorialTemplate): OutlineNode[] {
  const analysis = analyzeTemplateRecipe(template);
  const roots: OutlineNode[] = [];

  if (template.description?.trim()) {
    roots.push({ label: template.description.trim() });
  }

  if (analysis.hasSections) {
    const perSection = (analysis.sectionRecipe.length
      ? analysis.sectionRecipe
      : analysis.sectionAtomics
    )
      .filter((r) => !(r.kind === 'atomic' && r.blockType === 'section-heading'))
      .map((r) => ({ label: recipeItemLabel(r) }));

    roots.push({
      label: `${analysis.sectionCount} section${analysis.sectionCount === 1 ? '' : 's'}`,
      children: perSection.length
        ? [{ label: 'Each section contains', children: perSection }]
        : undefined,
    });
  } else {
    const recipe = (template.recipe || []).map((r) => ({ label: recipeItemLabel(r) }));
    if (recipe.length) {
      roots.push({ label: 'Contents', children: recipe });
    }
  }

  if (analysis.hasSections && analysis.topLevelGenerateEmbeds.length) {
    roots.push({
      label: 'To generate (tutorial-level)',
      children: analysis.topLevelGenerateEmbeds.map((r) => ({ label: recipeItemLabel(r) })),
    });
  }

  if (analysis.libraryEmbeds.length) {
    roots.push({
      label: 'Library slots (tutorial-level)',
      children: analysis.libraryEmbeds.map((r) => ({ label: recipeItemLabel(r) })),
    });
  }

  return roots.length ? roots : [{ label: 'No recipe items yet' }];
}

function OutlineList({ nodes, depth = 0 }: { nodes: OutlineNode[]; depth?: number }) {
  return (
    <ul
      className="m-0"
      style={{
        listStyleType: depth === 0 ? 'disc' : depth === 1 ? 'circle' : 'square',
        paddingLeft: depth === 0 ? 18 : 16,
        marginTop: depth === 0 ? 0 : 4,
      }}
    >
      {nodes.map((n, i) => (
        <li
          key={`${depth}-${i}-${n.label}`}
          style={{
            fontSize: depth === 0 ? 13.5 : 13,
            fontWeight: depth === 0 ? 600 : 500,
            color: depth === 0 ? '#0B1220' : '#374151',
            lineHeight: 1.45,
            marginTop: i === 0 && depth > 0 ? 0 : 4,
          }}
        >
          {n.label}
          {n.children && n.children.length > 0 ? (
            <OutlineList nodes={n.children} depth={depth + 1} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Outline for structured object templates (quiz / cards / concept / video). */
function buildStructuredOutline(objectType: string, templateId: string): { name: string; outline: OutlineNode[] } {
  const t = getObjectTemplate(templateId, objectType as TemplateObjectType);
  const fv = t?.knobDefaults || {};
  if (!isStructuredV2Type(objectType)) return { name: t?.name || 'Template', outline: [] };
  const units = seedUnitsFromTemplate(objectType, fv);
  const slotNoun = X_SLOT_NOUN[objectType];
  const outline: OutlineNode[] = [];
  if (t?.description?.trim()) outline.push({ label: t.description.trim() });
  outline.push({
    label: `${units.length} part${units.length === 1 ? '' : 's'} to author`,
    children: units.map((u) => ({
      label: `${u.title} — ${u.slots.length} ${slotNoun}${u.slots.length === 1 ? '' : 's'}`,
    })),
  });
  outline.push({ label: 'Each part: write it yourself (with images/videos) or generate it from marked-up sources.' });
  return { name: t?.name || 'Template', outline };
}

function TemplatePreviewPopup({
  name,
  outline,
  onClose,
}: {
  name: string;
  outline: OutlineNode[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: 'rgba(11,18,32,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
      role="presentation"
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="w-full max-w-md flex flex-col overflow-hidden"
        style={{
          maxHeight: 'min(560px, 85vh)',
          background: '#fff',
          borderRadius: 20,
          border: '1px solid rgba(0,0,0,0.1)',
          boxShadow: '0 24px 64px -16px rgba(30,50,80,0.35)',
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Preview ${name}`}
      >
        <div
          className="flex items-start gap-3 px-4 py-3.5 shrink-0"
          style={{
            background: 'linear-gradient(180deg, #FFFFFF 0%, #F5F3FF 100%)',
            borderBottom: '1px solid rgba(109,40,217,0.15)',
          }}
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(109,40,217,0.1)', color: '#6D28D9' }}
          >
            <Eye size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <p style={{ fontSize: 11, fontWeight: 700, color: '#6D28D9', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Template preview
            </p>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#4C1D95', marginTop: 2 }}>{name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-black/5"
            aria-label="Close preview"
          >
            <X size={16} style={{ color: '#6B7280' }} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          <OutlineList nodes={outline} />
        </div>
        <div
          className="shrink-0 px-4 py-3 flex justify-end"
          style={{ borderTop: '1px solid rgba(0,0,0,0.06)', background: '#FAFAFA' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-full"
            style={{ background: '#0B0F1A', color: '#fff', fontSize: 13, fontWeight: 600 }}
          >
            Done
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function AuthoringPathModal({
  objectLabel,
  objectType,
  defaultTemplateName,
  defaultTemplateId,
  value,
  onChange,
  onContinue,
  onBack,
  onClose,
}: {
  objectLabel: string;
  /** 'tutorial-v2' or a structured type (quiz / flashcard-set / concept-card / video-script). */
  objectType: string;
  /** Org-assigned / Template Library default template. */
  defaultTemplateName: string;
  defaultTemplateId: string;
  value: 'template' | 'write-yourself' | 'blank' | null;
  onChange: (v: 'template' | 'write-yourself' | 'blank') => void;
  onContinue: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const preview = useMemo(() => {
    if (objectType === 'tutorial-v2') {
      const tpl = getTutorialTemplate(defaultTemplateId);
      return { name: tpl.name, outline: buildTemplateOutline(tpl) };
    }
    return buildStructuredOutline(objectType, defaultTemplateId);
  }, [objectType, defaultTemplateId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
      role="presentation"
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full flex flex-col overflow-hidden"
        style={{
          maxWidth: 920,
          height: 'min(780px, 90vh)',
          background: '#F7F8FA',
          borderRadius: 20,
          border: '1px solid rgba(0,0,0,0.1)',
          boxShadow: '0 28px 80px -24px rgba(15,23,42,0.45)',
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="How do you want to build this?"
      >
        {/* Title bar — same as Save to collections */}
        <div
          className="flex items-center gap-3 px-4 py-3 shrink-0"
          style={{
            background: 'linear-gradient(180deg, #FFFFFF 0%, #F3F4F6 100%)',
            borderBottom: '1px solid rgba(0,0,0,0.08)',
          }}
        >
          <Layers size={18} style={{ color: '#6D28D9' }} />
          <div className="flex-1 min-w-0">
            <p style={{ fontSize: 14, fontWeight: 750, color: '#0B1220' }}>How do you want to build this?</p>
            <p style={{ fontSize: 11.5, color: '#9AA3AF' }}>
              Choose a path for this <strong style={{ color: '#374151' }}>{objectLabel}</strong>
              {' '}· template recipe or write it yourself
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-black/5"
            aria-label="Close"
          >
            <X size={16} style={{ color: '#6B7280' }} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
          <p
            className="mb-3"
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#9AA3AF',
              letterSpacing: '.06em',
              textTransform: 'uppercase',
            }}
          >
            Build path
          </p>
          <div className="space-y-3 max-w-xl">
            <button
              type="button"
              onClick={() => onChange('template')}
              className="w-full text-left rounded-2xl px-4 py-4 border transition-colors"
              style={{
                background: value === 'template' ? 'rgba(109,40,217,0.08)' : '#fff',
                borderColor: value === 'template' ? 'rgba(109,40,217,0.35)' : 'rgba(0,0,0,0.08)',
                boxShadow: value === 'template' ? '0 0 0 1px rgba(109,40,217,0.15)' : undefined,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#4C1D95' }}>From a template</p>
                  <p style={{ fontSize: 12.5, color: '#6B7280', marginTop: 4, lineHeight: 1.45 }}>
                    Uses your organization’s assigned template.
                    {' '}Plan → Structure → Sources → Author → Review.
                  </p>
                  <div
                    className="mt-3 rounded-xl px-3 py-2.5 flex items-center gap-2"
                    style={{
                      background: value === 'template' ? 'rgba(109,40,217,0.1)' : 'rgba(109,40,217,0.06)',
                      border: '1px solid rgba(109,40,217,0.18)',
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <p style={{ fontSize: 10.5, fontWeight: 700, color: '#6D28D9', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        Organization template
                      </p>
                      <p style={{ fontSize: 13.5, fontWeight: 650, color: '#4C1D95', marginTop: 2 }}>
                        {defaultTemplateName}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowPreview(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full shrink-0"
                      style={{
                        fontSize: 12,
                        fontWeight: 650,
                        color: '#5B21B6',
                        background: '#fff',
                        border: '1px solid rgba(109,40,217,0.28)',
                      }}
                      aria-label={`Preview ${defaultTemplateName}`}
                    >
                      <Eye size={13} /> Preview
                    </button>
                  </div>
                </div>
                {value === 'template' && (
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: '#059669', color: '#fff' }}
                  >
                    <Check size={11} strokeWidth={3} />
                  </span>
                )}
              </div>
            </button>
            <button
              type="button"
              onClick={() => onChange('write-yourself')}
              className="w-full text-left rounded-2xl px-4 py-4 border transition-colors"
              style={{
                background: value === 'write-yourself' ? 'rgba(5,150,105,0.08)' : '#fff',
                borderColor: value === 'write-yourself' ? 'rgba(5,150,105,0.35)' : 'rgba(0,0,0,0.08)',
                boxShadow: value === 'write-yourself' ? '0 0 0 1px rgba(5,150,105,0.15)' : undefined,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#065F46' }}>Write it yourself</p>
                  <p style={{ fontSize: 12.5, color: '#6B7280', marginTop: 4, lineHeight: 1.45 }}>
                    No template. Plan → Structure → Author → Review. Add text, images, and videos in each section by hand.
                  </p>
                </div>
                {value === 'write-yourself' && (
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: '#059669', color: '#fff' }}
                  >
                    <Check size={11} strokeWidth={3} />
                  </span>
                )}
              </div>
            </button>
            {objectType === 'tutorial-v2' && (
              <button
                type="button"
                onClick={() => onChange('blank')}
                className="w-full text-left rounded-2xl px-4 py-4 border transition-colors"
                style={{
                  background: value === 'blank' ? 'rgba(29,78,216,0.07)' : '#fff',
                  borderColor: value === 'blank' ? 'rgba(29,78,216,0.35)' : 'rgba(0,0,0,0.08)',
                  boxShadow: value === 'blank' ? '0 0 0 1px rgba(29,78,216,0.15)' : undefined,
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#1E40AF' }}>Blank canvas</p>
                    <p style={{ fontSize: 12.5, color: '#6B7280', marginTop: 4, lineHeight: 1.45 }}>
                      No set structure. Add any number of sections plus quizzes, flashcards, concept cards,
                      library embeds, and media — Sources and AI generation stay available.
                    </p>
                  </div>
                  {value === 'blank' && (
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: '#059669', color: '#fff' }}
                    >
                      <Check size={11} strokeWidth={3} />
                    </span>
                  )}
                </div>
              </button>
            )}
          </div>
        </div>

        {/* Footer — same as Save to collections */}
        <div
          className="shrink-0 px-4 py-3 flex flex-wrap items-center gap-3"
          style={{ background: '#fff', borderTop: '1px solid rgba(0,0,0,0.08)' }}
        >
          <div className="flex-1 min-w-[180px]">
            {!value ? (
              <p style={{ fontSize: 12.5, color: '#9AA3AF' }}>Select a build path to continue</p>
            ) : value === 'template' ? (
              <p style={{ fontSize: 12.5, color: '#6B7280' }} className="line-clamp-2">
                <strong style={{ color: '#0B1220' }}>Selected</strong>
                {' · '}
                From a template
                {' · '}
                <span style={{ color: '#4C1D95', fontWeight: 650 }}>{defaultTemplateName}</span>
              </p>
            ) : (
              <p style={{ fontSize: 12.5, color: '#6B7280' }}>
                <strong style={{ color: '#0B1220' }}>Selected</strong>
                {' · '}
                {value === 'blank' ? 'Blank canvas' : 'Write it yourself'}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-2.5 rounded-full"
            style={{ background: 'rgba(0,0,0,0.05)', fontSize: 13, fontWeight: 600, color: '#374151' }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!value}
            onClick={onContinue}
            className="px-4 py-2.5 rounded-full inline-flex items-center justify-center gap-1.5 disabled:opacity-40"
            style={{
              background: '#0B0F1A',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Continue <ArrowRight size={14} />
          </button>
        </div>
      </motion.div>

      {showPreview && (
        <TemplatePreviewPopup
          name={preview.name}
          outline={preview.outline}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  );
}

export function CDCreate() {
  const {
    navigate,
    setCreatorObjectType,
    objectCollections,
    createCollectionIds,
    setCreateCollectionIds,
    createObjectCollection,
    setPendingAuthoringPath,
  } = useApp();

  const [pendingType, setPendingType] = useState<string | null>(null);
  const [pickerIds, setPickerIds] = useState<string[]>([]);
  const [showNewCol, setShowNewCol] = useState(false);
  const [newColParentId, setNewColParentId] = useState<string | null>(null);
  const [showPathPicker, setShowPathPicker] = useState(false);
  const [pathChoice, setPathChoice] = useState<'template' | 'write-yourself' | 'blank' | null>(null);

  const pendingTile = TILES.find((t) => t.id === pendingType) ?? null;
  const newColParentName = newColParentId
    ? objectCollections.find((c) => c.id === newColParentId)?.name
    : null;
  const orgDefaultTutorialV2Id = getDefaultTemplateId('tutorial-v2') || DEFAULT_TUTORIAL_TEMPLATE_ID;
  const orgDefaultTutorialV2Name = getTutorialTemplate(orgDefaultTutorialV2Id).name;

  const openCollectionPicker = (typeId: string) => {
    setPendingType(typeId);
    setShowPathPicker(false);
    setPathChoice(null);
    // Keep prior picks if any; otherwise start empty so Continue works without a folder.
    setPickerIds(
      createCollectionIds.filter((id) => objectCollections.some((c) => c.id === id)),
    );
  };

  const togglePickerId = (id: string) => {
    setPickerIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const closeCreateFlow = () => {
    setPendingType(null);
    setShowPathPicker(false);
    setPathChoice(null);
  };

  const proceedWithCollections = () => {
    if (!pendingType) return;
    setCreateCollectionIds(pickerIds);
    if (PATH_PICKER_TYPES.includes(pendingType)) {
      setPathChoice(null);
      setShowPathPicker(true);
      return;
    }
    const typeId = pendingType;
    setPendingType(null);
    if (typeId === 'course') {
      navigate('cd-wizard');
    } else {
      setCreatorObjectType(typeId);
      navigate('cd-creator');
    }
  };

  const proceedWithAuthoringPath = () => {
    if (!pathChoice || !pendingType || !PATH_PICKER_TYPES.includes(pendingType)) return;
    if (pathChoice === 'blank') {
      // Blank canvas rides the template path with the blank-canvas template.
      setTutorialV2LaunchTemplate(BLANK_CANVAS_TUTORIAL_TEMPLATE_ID);
      setPendingAuthoringPath('template');
    } else {
      setPendingAuthoringPath(pathChoice);
    }
    setCreatorObjectType(pendingType);
    closeCreateFlow();
    navigate('cd-creator');
  };

  return (
    <div className="px-4 sm:px-6 py-5 sm:py-6 w-full">
      <div className="mb-6">
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0B1220', letterSpacing: '-0.3px', marginBottom: 4 }}>
          What would you like to create?
        </h2>
        <p style={{ fontSize: 13.5, color: '#6B7280' }}>
          Choose a content type to begin. You’ll pick which collection(s) to save it in next.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
        {TILES.map((tile, i) => (
          <motion.button
            key={tile.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            whileHover={{ y: -2, scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => openCollectionPicker(tile.id)}
            className="text-left p-4 rounded-[22px] transition-all"
            style={{
              background: pastelFromHex(tile.color),
              boxShadow: '0 4px 16px -6px rgba(30,50,80,0.08)',
              border: `1px solid ${pastelFromHex(tile.color, 0.72)}`,
            }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
              style={{ background: pastelChipFromHex(tile.color), color: tile.color }}
            >
              {tile.icon}
            </div>
            <p style={{ fontSize: 13.5, fontWeight: 650, color: '#0B1220', marginBottom: 3 }}>{tile.label}</p>
            <p style={{ fontSize: 12, color: '#9AA3AF', lineHeight: 1.45 }}>{tile.desc}</p>
            <div className="flex items-center gap-1 mt-3" style={{ fontSize: 11.5, color: '#C4CBD4' }}>
              Define & configure <ArrowRight size={11} />
            </div>
          </motion.button>
        ))}
      </div>

      <div className="mb-2">
        <p style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 10 }}>
          Specialized blocks — Bridge program
        </p>
        <div className="flex gap-3 flex-wrap">
          {SPECIALIZED.map((s) => (
            <motion.button
              key={s.id}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-3 px-4 py-3 rounded-[18px] text-left"
              style={{
                background: pastelFromHex('#059669'),
                border: `1px solid ${pastelFromHex('#059669', 0.72)}`,
              }}
            >
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: pastelChipFromHex('#059669'), color: '#059669' }}
              >
                {s.icon}
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#0B1220' }}>{s.label}</p>
                <p style={{ fontSize: 11.5, color: '#9AA3AF' }}>{s.desc}</p>
              </div>
            </motion.button>
          ))}
        </div>
      </div>

      {pendingTile && !showPathPicker && (
        <CollectionPickerModal
          objectLabel={pendingTile.label}
          collections={objectCollections}
          selectedIds={pickerIds}
          onToggle={togglePickerId}
          onContinue={proceedWithCollections}
          onClose={closeCreateFlow}
          onNewCollection={(parentId) => {
            setNewColParentId(parentId);
            setShowNewCol(true);
          }}
        />
      )}

      {pendingTile && showPathPicker && pendingType && PATH_PICKER_TYPES.includes(pendingType) && (
        <AuthoringPathModal
          objectLabel={pendingTile.label}
          objectType={pendingType}
          defaultTemplateName={pendingType === 'tutorial-v2'
            ? orgDefaultTutorialV2Name
            : (getObjectTemplate(getDefaultTemplateId(pendingType as TemplateObjectType), pendingType as TemplateObjectType)?.name || 'Default template')}
          defaultTemplateId={pendingType === 'tutorial-v2'
            ? orgDefaultTutorialV2Id
            : (getDefaultTemplateId(pendingType as TemplateObjectType) || '')}
          value={pathChoice}
          onChange={setPathChoice}
          onContinue={proceedWithAuthoringPath}
          onBack={() => {
            setShowPathPicker(false);
            setPathChoice(null);
          }}
          onClose={closeCreateFlow}
        />
      )}

      {showNewCol && (
        <NewCollectionModal
          parentName={newColParentName}
          onClose={() => setShowNewCol(false)}
          onCreate={(name) => {
            const created = createObjectCollection(name, newColParentId);
            setPickerIds((prev) => (prev.includes(created.id) ? prev : [...prev, created.id]));
            setShowNewCol(false);
          }}
        />
      )}
    </div>
  );
}
